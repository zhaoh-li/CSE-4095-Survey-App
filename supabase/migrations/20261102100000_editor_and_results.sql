-- Classroom Survey: save_survey_draft (D22) and get_survey_results (D24)
--
-- Both run with the caller's rights (security invoker), so the authenticated
-- RLS policies and the D18 guards apply. Only signed-in instructors can call
-- them. Run once in the Supabase SQL Editor after the earlier migrations.

-- ---------------------------------------------------------------------------
-- save_survey_draft (D22)
--
-- Saves a whole draft in one transaction. With a null p_survey_id it creates
-- a new draft; otherwise it updates the title and description and replaces
-- all questions and choices. Replacing is safe because only drafts can be
-- saved, and drafts never have responses (only active surveys accept them).
--
-- p_questions, in display order:
--   [{ "question_text": "...", "question_type": "multiple_choice",
--      "choices": [{ "choice_text": "..." }] }]
-- True/False questions always get the fixed choices True and False (D13).
-- Returns the survey ID.
-- ---------------------------------------------------------------------------

create or replace function public.save_survey_draft(
    p_survey_id uuid,
    p_title text,
    p_description text,
    p_questions jsonb
)
returns uuid
language plpgsql
volatile
set search_path = ''
as $$
declare
    v_survey_id uuid := p_survey_id;
    v_status text;
    v_item record;
    v_type text;
    v_question_id uuid;
begin
    -- D23: a draft only needs a title.
    if p_title is null or btrim(p_title) = '' then
        raise exception 'TITLE_REQUIRED';
    end if;

    if p_questions is null or jsonb_typeof(p_questions) <> 'array' then
        raise exception 'INVALID_QUESTION' using detail = 'p_questions must be a JSON array.';
    end if;

    if v_survey_id is null then
        insert into public.surveys (title, description)
        values (btrim(p_title), nullif(btrim(p_description), ''))
        returning id into v_survey_id;
    else
        select status into v_status from public.surveys where id = v_survey_id for update;
        if not found then
            raise exception 'SURVEY_NOT_FOUND';
        end if;
        if v_status <> 'draft' then
            raise exception 'SURVEY_NOT_EDITABLE'
                using detail = 'Only draft surveys can be edited. Duplicate it to make an editable copy.';
        end if;

        update public.surveys
        set title = btrim(p_title), description = nullif(btrim(p_description), '')
        where id = v_survey_id;

        -- Cascades to the old choices.
        delete from public.questions where survey_id = v_survey_id;
    end if;

    for v_item in
        select q.value, q.position::integer as position
        from jsonb_array_elements(p_questions) with ordinality as q(value, position)
        order by q.position
    loop
        v_type := coalesce(v_item.value->>'question_type', 'multiple_choice');

        insert into public.questions (survey_id, question_text, question_type, position)
        values (v_survey_id, btrim(coalesce(v_item.value->>'question_text', '')), v_type, v_item.position)
        returning id into v_question_id;

        if v_type = 'true_false' then
            insert into public.choices (question_id, choice_text, position)
            values (v_question_id, 'True', 1), (v_question_id, 'False', 2);
        else
            insert into public.choices (question_id, choice_text, position)
            select v_question_id, btrim(coalesce(c.value->>'choice_text', '')), c.position
            from jsonb_array_elements(coalesce(v_item.value->'choices', '[]'::jsonb))
                with ordinality as c(value, position);
        end if;
    end loop;

    return v_survey_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_survey_results (D24)
--
-- Returns the API.md §11 shape, plus the survey's title, status and slug so
-- the results page needs only one request:
--   { survey_id, title, status, public_slug, response_count,
--     questions: [{ question_id, question_text, question_type, position,
--                   response_count,
--                   choices: [{ choice_id, choice_text, count, percentage }] }] }
-- Percentages use the question's own answer count, rounded to 1 decimal.
-- ---------------------------------------------------------------------------

create or replace function public.get_survey_results(p_survey_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
    v_survey public.surveys%rowtype;
begin
    select * into v_survey from public.surveys where id = p_survey_id;
    if not found then
        raise exception 'SURVEY_NOT_FOUND';
    end if;

    return jsonb_build_object(
        'survey_id', v_survey.id,
        'title', v_survey.title,
        'status', v_survey.status,
        'public_slug', v_survey.public_slug,
        'response_count', (
            select count(*)::integer from public.responses where survey_id = v_survey.id
        ),
        'questions', coalesce((
            select jsonb_agg(
                jsonb_build_object(
                    'question_id', q.id,
                    'question_text', q.question_text,
                    'question_type', q.question_type,
                    'position', q.position,
                    'response_count', qc.total,
                    'choices', coalesce((
                        select jsonb_agg(
                            jsonb_build_object(
                                'choice_id', c.id,
                                'choice_text', c.choice_text,
                                'count', cc.total,
                                'percentage', case
                                    when qc.total = 0 then 0
                                    else round(cc.total * 100.0 / qc.total, 1)
                                end
                            ) order by c.position
                        )
                        from public.choices c
                        cross join lateral (
                            select count(*)::integer as total
                            from public.answers a
                            where a.choice_id = c.id
                        ) cc
                        where c.question_id = q.id
                    ), '[]'::jsonb)
                ) order by q.position
            )
            from public.questions q
            cross join lateral (
                select count(*)::integer as total
                from public.answers a
                where a.question_id = q.id
            ) qc
            where q.survey_id = v_survey.id
        ), '[]'::jsonb)
    );
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissions: signed-in instructors only.
-- ---------------------------------------------------------------------------

revoke execute on function
    public.save_survey_draft(uuid, text, text, jsonb),
    public.get_survey_results(uuid)
from public, anon, authenticated;

grant execute on function
    public.save_survey_draft(uuid, text, text, jsonb),
    public.get_survey_results(uuid)
to authenticated;
