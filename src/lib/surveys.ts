// Database calls for instructor survey management. Every function throws an
// AppError with a message that is safe to show.

import { toAppError } from './errors'
import { supabase } from './supabase'
import type {
  Survey,
  SurveyDraftPayload,
  SurveyResults,
  SurveyWithCount,
  SurveyWithQuestions,
} from './types'

type SurveyRow = Survey & { responses: { count: number }[] }

export async function listSurveys(): Promise<SurveyWithCount[]> {
  const { data, error } = await supabase
    .from('surveys')
    .select('*, responses(count)')
    .order('created_at', { ascending: false })
  if (error) throw toAppError(error)

  return (data as SurveyRow[]).map(({ responses, ...survey }) => ({
    ...survey,
    response_count: responses[0]?.count ?? 0,
  }))
}

/** Activates the survey, closing any other active survey (D8). Returns its public slug. */
export async function activateSurvey(id: string): Promise<string> {
  const { data, error } = await supabase.rpc('activate_survey', { p_survey_id: id })
  if (error) throw toAppError(error)
  return (data as { public_slug: string }).public_slug
}

export async function closeSurvey(id: string): Promise<void> {
  const { error } = await supabase.rpc('close_survey', { p_survey_id: id })
  if (error) throw toAppError(error)
}

async function setStatus(id: string, status: 'archived' | 'closed'): Promise<void> {
  const { error } = await supabase.from('surveys').update({ status }).eq('id', id)
  if (error) throw toAppError(error)
}

export const archiveSurvey = (id: string) => setStatus(id, 'archived')
export const unarchiveSurvey = (id: string) => setStatus(id, 'closed')

export async function deleteSurvey(id: string): Promise<void> {
  const { error } = await supabase.from('surveys').delete().eq('id', id)
  if (error) throw toAppError(error)
}

/** Copies the survey into a new draft (D19). Returns the new survey's ID. */
export async function duplicateSurvey(id: string): Promise<string> {
  const { data, error } = await supabase.rpc('duplicate_survey', { p_survey_id: id })
  if (error) throw toAppError(error)
  return data as string
}

/** One survey, or null if it doesn't exist. */
export async function getSurvey(id: string): Promise<Survey | null> {
  const { data, error } = await supabase.from('surveys').select('*').eq('id', id).maybeSingle()
  if (error) throw toAppError(error)
  return data as Survey | null
}

/** One survey with its questions and choices in display order, or null. */
export async function getSurveyWithQuestions(id: string): Promise<SurveyWithQuestions | null> {
  const { data, error } = await supabase
    .from('surveys')
    .select('*, questions(*, choices(*))')
    .eq('id', id)
    .maybeSingle()
  if (error) throw toAppError(error)
  if (!data) return null

  const survey = data as SurveyWithQuestions
  survey.questions.sort((a, b) => a.position - b.position)
  for (const question of survey.questions) question.choices.sort((a, b) => a.position - b.position)
  return survey
}

/** The currently active survey, if any. */
export async function getActiveSurvey(): Promise<Pick<Survey, 'id' | 'title'> | null> {
  const { data, error } = await supabase
    .from('surveys')
    .select('id, title')
    .eq('status', 'active')
    .maybeSingle()
  if (error) throw toAppError(error)
  return data
}

/** Creates (id = null) or replaces a whole draft (D22). Returns the survey ID. */
export async function saveSurveyDraft(
  id: string | null,
  payload: SurveyDraftPayload,
): Promise<string> {
  const { data, error } = await supabase.rpc('save_survey_draft', {
    p_survey_id: id,
    p_title: payload.title,
    p_description: payload.description,
    p_questions: payload.questions,
  })
  if (error) throw toAppError(error)
  return data as string
}

export async function getResponseCount(surveyId: string): Promise<number> {
  const { count, error } = await supabase
    .from('responses')
    .select('*', { count: 'exact', head: true })
    .eq('survey_id', surveyId)
  if (error) throw toAppError(error)
  return count ?? 0
}

/** Per-question and per-choice counts (D24). Returns null if the survey doesn't exist. */
export async function getSurveyResults(id: string): Promise<SurveyResults | null> {
  const { data, error } = await supabase.rpc('get_survey_results', { p_survey_id: id })
  if (error) {
    if (error.message === 'SURVEY_NOT_FOUND') return null
    throw toAppError(error)
  }
  return data as SurveyResults
}
