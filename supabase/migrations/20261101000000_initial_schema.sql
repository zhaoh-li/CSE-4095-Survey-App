-- Classroom Survey: initial schema
--
-- Implements DATABASE.md as modified by DECISIONS.md:
--   * the five tables, indexes and updated_at trigger from DATABASE.md
--   * Row Level Security with instructor-only policies (DATABASE.md §10)
--   * no anonymous table access; students use only get_public_survey and
--     submit_survey_response (D2, D5)
--   * activate_survey and close_survey (D1, D8, D10)
--   * database guards for the status rules (D4, D8, D9)
--
-- Run once in the Supabase SQL Editor, or with `supabase db push`.

-- ---------------------------------------------------------------------------
-- 1. Tables (DATABASE.md §3)
-- ---------------------------------------------------------------------------

create table public.surveys (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    description text,
    status text not null default 'draft'
        check (status in ('draft', 'active', 'closed', 'archived')),
    public_slug text unique,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    -- D8: every active survey has a slug, so its QR code always works.
    constraint surveys_active_has_slug check (status <> 'active' or public_slug is not null)
);

create table public.questions (
    id uuid primary key default gen_random_uuid(),
    survey_id uuid not null references public.surveys(id) on delete cascade,
    question_text text not null,
    question_type text not null
        check (question_type in ('multiple_choice', 'true_false')),
    position integer not null,
    created_at timestamptz not null default now()
);

create table public.choices (
    id uuid primary key default gen_random_uuid(),
    question_id uuid not null references public.questions(id) on delete cascade,
    choice_text text not null,
    position integer not null,
    created_at timestamptz not null default now()
);

create table public.responses (
    id uuid primary key default gen_random_uuid(),
    survey_id uuid not null references public.surveys(id) on delete cascade,
    anonymous_token text,
    submitted_at timestamptz not null default now()
);

create table public.answers (
    id uuid primary key default gen_random_uuid(),
    response_id uuid not null references public.responses(id) on delete cascade,
    question_id uuid not null references public.questions(id) on delete cascade,
    choice_id uuid references public.choices(id) on delete set null,
    text_answer text,
    created_at timestamptz not null default now(),
    unique (response_id, question_id)
);

-- ---------------------------------------------------------------------------
-- 2. Indexes (DATABASE.md §3, §5)
-- ---------------------------------------------------------------------------

create index surveys_status_idx on public.surveys(status);
create index questions_survey_id_idx on public.questions(survey_id);
create index choices_question_id_idx on public.choices(question_id);
create index responses_survey_id_idx on public.responses(survey_id);
create index responses_submitted_at_idx on public.responses(submitted_at);
create index answers_response_id_idx on public.answers(response_id);
create index answers_question_id_idx on public.answers(question_id);
create index answers_choice_id_idx on public.answers(choice_id);

-- One response per browser token per survey (D7).
create unique index responses_unique_student_per_survey
on public.responses(survey_id, anonymous_token)
where anonymous_token is not null;

-- Only one active survey at a time.
create unique index only_one_active_survey
on public.surveys ((status))
where status = 'active';

-- ---------------------------------------------------------------------------
-- 3. updated_at trigger (DATABASE.md §4)
-- ---------------------------------------------------------------------------

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger surveys_updated_at
before update on public.surveys
for each row
execute function public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 4. Status guards (D4, D8, D9)
--
-- activate_survey sets the transaction-local flag `app.activating` so the
-- guard can tell a real activation from a direct table update.
-- ---------------------------------------------------------------------------

create or replace function public.guard_survey_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
    v_activating boolean := coalesce(current_setting('app.activating', true), '') = 'on';
begin
    -- New surveys (including duplicates) always start as drafts without a slug.
    if tg_op = 'INSERT' then
        if new.status <> 'draft' or new.public_slug is not null then
            raise exception 'INVALID_STATUS_CHANGE'
                using detail = 'New surveys must start as drafts without a public slug.';
        end if;
        return new;
    end if;

    -- D4 / D8: title and description can only change while the survey is a draft.
    if old.status <> 'draft'
       and (new.title is distinct from old.title
            or new.description is distinct from old.description) then
        raise exception 'SURVEY_NOT_EDITABLE'
            using detail = 'Only draft surveys can be edited. Duplicate it to make an editable copy.';
    end if;

    -- D8: public_slug is set only by activate_survey, once, and then kept.
    if new.public_slug is distinct from old.public_slug
       and not (v_activating and old.public_slug is null) then
        raise exception 'INVALID_STATUS_CHANGE'
            using detail = 'public_slug is set only by activate_survey.';
    end if;

    if new.status is distinct from old.status then
        -- D8: a survey becomes active only through activate_survey.
        if new.status = 'active' then
            if not v_activating or old.status not in ('draft', 'closed') then
                raise exception 'INVALID_STATUS_CHANGE'
                    using detail = format('Cannot change status from %s to active.', old.status);
            end if;
        -- D9: the other allowed changes.
        elsif not (
            (old.status = 'active'   and new.status = 'closed')    -- Close
         or (old.status = 'closed'   and new.status = 'archived')  -- Archive
         or (old.status = 'archived' and new.status = 'closed')    -- Unarchive
        ) then
            raise exception 'INVALID_STATUS_CHANGE'
                using detail = format('Cannot change status from %s to %s.', old.status, new.status);
        end if;
    end if;

    return new;
end;
$$;

create trigger surveys_guard_write
before insert or update on public.surveys
for each row
execute function public.guard_survey_write();

-- D9: an active survey must be closed before it can be deleted.
create or replace function public.guard_survey_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if old.status = 'active' then
        raise exception 'INVALID_STATUS_CHANGE'
            using detail = 'Close the survey before deleting it.';
    end if;
    return old;
end;
$$;

create trigger surveys_guard_delete
before delete on public.surveys
for each row
execute function public.guard_survey_delete();

-- D4: questions and choices can only change while their survey is a draft.
-- When a whole survey is deleted, the cascade runs after the survey row is
-- gone, so the parent lookup finds nothing and the delete is allowed.
create or replace function public.guard_question_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
    v_status text;
begin
    if tg_op in ('UPDATE', 'DELETE') then
        select status into v_status from public.surveys where id = old.survey_id;
        if v_status is not null and v_status <> 'draft' then
            raise exception 'SURVEY_NOT_EDITABLE'
                using detail = 'Only draft surveys can be edited.';
        end if;
    end if;

    if tg_op in ('INSERT', 'UPDATE') then
        select status into v_status from public.surveys where id = new.survey_id;
        if v_status is not null and v_status <> 'draft' then
            raise exception 'SURVEY_NOT_EDITABLE'
                using detail = 'Only draft surveys can be edited.';
        end if;
        return new;
    end if;

    return old;
end;
$$;

create trigger questions_guard_change
before insert or update or delete on public.questions
for each row
execute function public.guard_question_change();

create or replace function public.guard_choice_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
    v_status text;
begin
    if tg_op in ('UPDATE', 'DELETE') then
        select s.status into v_status
        from public.questions q
        join public.surveys s on s.id = q.survey_id
        where q.id = old.question_id;
        if v_status is not null and v_status <> 'draft' then
            raise exception 'SURVEY_NOT_EDITABLE'
                using detail = 'Only draft surveys can be edited.';
        end if;
    end if;

    if tg_op in ('INSERT', 'UPDATE') then
        select s.status into v_status
        from public.questions q
        join public.surveys s on s.id = q.survey_id
        where q.id = new.question_id;
        if v_status is not null and v_status <> 'draft' then
            raise exception 'SURVEY_NOT_EDITABLE'
                using detail = 'Only draft surveys can be edited.';
        end if;
        return new;
    end if;

    return old;
end;
$$;

create trigger choices_guard_change
before insert or update or delete on public.choices
for each row
execute function public.guard_choice_change();

-- ---------------------------------------------------------------------------
-- 5. Row Level Security (DATABASE.md §7, §10; D5)
-- ---------------------------------------------------------------------------

alter table public.surveys enable row level security;
alter table public.questions enable row level security;
alter table public.choices enable row level security;
alter table public.responses enable row level security;
alter table public.answers enable row level security;

-- Instructors (any signed-in user; public sign-ups are disabled, D6).
create policy "authenticated users manage surveys"
on public.surveys for all to authenticated using (true) with check (true);

create policy "authenticated users manage questions"
on public.questions for all to authenticated using (true) with check (true);

create policy "authenticated users manage choices"
on public.choices for all to authenticated using (true) with check (true);

create policy "authenticated users manage responses"
on public.responses for all to authenticated using (true) with check (true);

create policy "authenticated users manage answers"
on public.answers for all to authenticated using (true) with check (true);

-- D5: no anonymous policies. Supabase grants table privileges to `anon` by
-- default; revoke them too, so access is blocked even if RLS were disabled.
revoke all on table
    public.surveys, public.questions, public.choices, public.responses, public.answers
from anon;

-- ---------------------------------------------------------------------------
-- 6. Instructor functions: activate_survey, close_survey (D1, D8, D9, D10)
--
-- These run with the caller's rights (security invoker), so the
-- authenticated RLS policies apply.
-- ---------------------------------------------------------------------------

-- Short, random, non-sequential slug (D1). The alphabet leaves out
-- characters that are easy to misread on a projector (0/o, 1/l/i).
create or replace function public.generate_public_slug()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
    v_alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
    v_bytes bytea;
    v_slug text;
begin
    loop
        v_bytes := uuid_send(gen_random_uuid());
        v_slug := '';
        for i in 0..5 loop
            v_slug := v_slug || substr(v_alphabet, get_byte(v_bytes, i) % length(v_alphabet) + 1, 1);
        end loop;
        exit when not exists (select 1 from public.surveys where public_slug = v_slug);
    end loop;
    return v_slug;
end;
$$;

create or replace function public.activate_survey(p_survey_id uuid)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
    v_survey public.surveys%rowtype;
    v_problem text;
begin
    select * into v_survey from public.surveys where id = p_survey_id for update;
    if not found then
        raise exception 'SURVEY_NOT_FOUND';
    end if;

    if v_survey.status = 'active' then
        return jsonb_build_object('id', v_survey.id, 'status', v_survey.status,
                                  'public_slug', v_survey.public_slug);
    end if;

    if v_survey.status not in ('draft', 'closed') then
        raise exception 'INVALID_STATUS_CHANGE'
            using detail = format('Cannot activate a survey with status %s.', v_survey.status);
    end if;

    -- D10: the survey must be complete.
    if not exists (select 1 from public.questions where survey_id = p_survey_id) then
        v_problem := 'The survey has no questions.';
    elsif exists (select 1 from public.questions
                  where survey_id = p_survey_id and btrim(question_text) = '') then
        v_problem := 'A question has no text.';
    elsif exists (select 1 from public.choices c
                  join public.questions q on q.id = c.question_id
                  where q.survey_id = p_survey_id and btrim(c.choice_text) = '') then
        v_problem := 'A choice has no text.';
    elsif exists (select 1 from public.questions q
                  where q.survey_id = p_survey_id
                    and q.question_type = 'multiple_choice'
                    and (select count(*) from public.choices c where c.question_id = q.id) < 2) then
        v_problem := 'A multiple-choice question has fewer than 2 choices.';
    elsif exists (select 1 from public.questions q
                  where q.survey_id = p_survey_id
                    and q.question_type = 'true_false'
                    and (select array_agg(c.choice_text order by c.position)
                         from public.choices c where c.question_id = q.id)
                        is distinct from array['True', 'False']) then
        v_problem := 'A True/False question does not have exactly the choices True and False.';
    end if;

    if v_problem is not null then
        raise exception 'SURVEY_INCOMPLETE' using detail = v_problem;
    end if;

    perform set_config('app.activating', 'on', true);

    -- Close whichever survey is currently active.
    update public.surveys set status = 'closed'
    where status = 'active' and id <> p_survey_id;

    update public.surveys
    set status = 'active',
        public_slug = coalesce(public_slug, public.generate_public_slug())
    where id = p_survey_id
    returning * into v_survey;

    perform set_config('app.activating', 'off', true);

    return jsonb_build_object('id', v_survey.id, 'status', v_survey.status,
                              'public_slug', v_survey.public_slug);
end;
$$;

create or replace function public.close_survey(p_survey_id uuid)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
    v_survey public.surveys%rowtype;
begin
    select * into v_survey from public.surveys where id = p_survey_id for update;
    if not found then
        raise exception 'SURVEY_NOT_FOUND';
    end if;

    if v_survey.status <> 'active' then
        raise exception 'INVALID_STATUS_CHANGE'
            using detail = format('Cannot close a survey with status %s.', v_survey.status);
    end if;

    update public.surveys set status = 'closed'
    where id = p_survey_id
    returning * into v_survey;

    return jsonb_build_object('id', v_survey.id, 'status', v_survey.status,
                              'public_slug', v_survey.public_slug);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Student functions: get_public_survey, submit_survey_response (D2, D3, D5, D7, D15)
--
-- These run with the owner's rights (security definer) because students have
-- no table access. They return only what a student needs.
-- ---------------------------------------------------------------------------

create or replace function public.get_public_survey(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_survey public.surveys%rowtype;
begin
    select * into v_survey from public.surveys where public_slug = p_slug;

    if not found or v_survey.status = 'draft' then
        return null;
    end if;

    if v_survey.status in ('closed', 'archived') then
        return jsonb_build_object('status', 'closed');
    end if;

    return jsonb_build_object(
        'status', 'active',
        'survey', jsonb_build_object(
            'id', v_survey.id,
            'title', v_survey.title,
            'description', v_survey.description
        ),
        'questions', coalesce((
            select jsonb_agg(
                jsonb_build_object(
                    'id', q.id,
                    'question_text', q.question_text,
                    'question_type', q.question_type,
                    'position', q.position,
                    'choices', coalesce((
                        select jsonb_agg(
                            jsonb_build_object(
                                'id', c.id,
                                'choice_text', c.choice_text,
                                'position', c.position
                            ) order by c.position
                        )
                        from public.choices c
                        where c.question_id = q.id
                    ), '[]'::jsonb)
                ) order by q.position
            )
            from public.questions q
            where q.survey_id = v_survey.id
        ), '[]'::jsonb)
    );
end;
$$;

create or replace function public.submit_survey_response(
    p_survey_id uuid,
    p_anonymous_token text,
    p_answers jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v_status text;
    v_question_count integer;
    v_item jsonb;
    v_question_id uuid;
    v_seen uuid[] := '{}';
    v_response_id uuid;
begin
    -- D7 / D15: every submission needs a browser token.
    if p_anonymous_token is null or btrim(p_anonymous_token) = '' then
        raise exception 'MISSING_TOKEN';
    end if;

    -- `for share` makes a concurrent close_survey wait for this submission,
    -- and makes this submission see the survey as closed once close commits.
    select status into v_status from public.surveys where id = p_survey_id for share;
    if not found or v_status <> 'active' then
        raise exception 'SURVEY_NOT_ACTIVE';
    end if;

    if exists (select 1 from public.responses
               where survey_id = p_survey_id and anonymous_token = p_anonymous_token) then
        raise exception 'DUPLICATE_RESPONSE';
    end if;

    if p_answers is null or jsonb_typeof(p_answers) <> 'array' then
        raise exception 'MISSING_REQUIRED_ANSWER';
    end if;

    -- IDs are compared as text so malformed input is reported as invalid
    -- instead of failing with a uuid cast error.
    for v_item in select value from jsonb_array_elements(p_answers) loop
        if jsonb_typeof(v_item) <> 'object' then
            raise exception 'INVALID_QUESTION';
        end if;

        select id into v_question_id
        from public.questions
        where survey_id = p_survey_id and id::text = v_item->>'question_id';
        if not found then
            raise exception 'INVALID_QUESTION';
        end if;

        -- D3: exactly one answer per question.
        if v_question_id = any(v_seen) then
            raise exception 'INVALID_QUESTION'
                using detail = 'A question was answered more than once.';
        end if;
        v_seen := v_seen || v_question_id;

        if v_item->>'choice_id' is null then
            raise exception 'MISSING_REQUIRED_ANSWER';
        end if;

        if not exists (select 1 from public.choices
                       where question_id = v_question_id and id::text = v_item->>'choice_id') then
            raise exception 'INVALID_CHOICE';
        end if;
    end loop;

    -- D3: every question must be answered.
    select count(*) into v_question_count from public.questions where survey_id = p_survey_id;
    if cardinality(v_seen) <> v_question_count then
        raise exception 'MISSING_REQUIRED_ANSWER';
    end if;

    begin
        insert into public.responses (survey_id, anonymous_token)
        values (p_survey_id, p_anonymous_token)
        returning id into v_response_id;
    exception when unique_violation then
        -- Two submissions from the same browser at the same moment.
        raise exception 'DUPLICATE_RESPONSE';
    end;

    insert into public.answers (response_id, question_id, choice_id)
    select v_response_id, (value->>'question_id')::uuid, (value->>'choice_id')::uuid
    from jsonb_array_elements(p_answers);

    return jsonb_build_object('success', true, 'response_id', v_response_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Function permissions (D5)
--
-- Postgres lets everyone execute new functions, and Supabase also grants
-- `anon` by default, so revoke both and grant back only what each role needs.
-- ---------------------------------------------------------------------------

revoke execute on function
    public.update_updated_at_column(),
    public.guard_survey_write(),
    public.guard_survey_delete(),
    public.guard_question_change(),
    public.guard_choice_change(),
    public.generate_public_slug(),
    public.activate_survey(uuid),
    public.close_survey(uuid),
    public.get_public_survey(text),
    public.submit_survey_response(uuid, text, jsonb)
from public, anon, authenticated;

grant execute on function
    public.generate_public_slug(),
    public.activate_survey(uuid),
    public.close_survey(uuid)
to authenticated;

grant execute on function
    public.get_public_survey(text),
    public.submit_survey_response(uuid, text, jsonb)
to anon, authenticated;
