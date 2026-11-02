-- Classroom Survey: duplicate_survey (D19)
--
-- Copies a survey's title, description, questions and choices into a new
-- draft named "Copy of <title>". Responses are not copied (API.md, Duplicate
-- Survey). Runs in one transaction, so a failure leaves no partial copy.
--
-- Runs with the caller's rights (security invoker), so the authenticated RLS
-- policies apply. Run once in the Supabase SQL Editor after the initial schema.

create or replace function public.duplicate_survey(p_survey_id uuid)
returns uuid
language plpgsql
volatile
set search_path = ''
as $$
declare
    v_source public.surveys%rowtype;
    v_new_survey_id uuid;
    v_question public.questions%rowtype;
    v_new_question_id uuid;
begin
    select * into v_source from public.surveys where id = p_survey_id;
    if not found then
        raise exception 'SURVEY_NOT_FOUND';
    end if;

    insert into public.surveys (title, description)
    values ('Copy of ' || v_source.title, v_source.description)
    returning id into v_new_survey_id;

    for v_question in
        select * from public.questions where survey_id = p_survey_id order by position
    loop
        insert into public.questions (survey_id, question_text, question_type, position)
        values (v_new_survey_id, v_question.question_text, v_question.question_type, v_question.position)
        returning id into v_new_question_id;

        insert into public.choices (question_id, choice_text, position)
        select v_new_question_id, choice_text, position
        from public.choices
        where question_id = v_question.id;
    end loop;

    return v_new_survey_id;
end;
$$;

revoke execute on function public.duplicate_survey(uuid) from public, anon, authenticated;
grant execute on function public.duplicate_survey(uuid) to authenticated;
