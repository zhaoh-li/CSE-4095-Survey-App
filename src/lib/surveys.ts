// Database calls for instructor survey management. Every function throws an
// AppError with a message that is safe to show.

import { toAppError } from './errors'
import { supabase } from './supabase'
import type { Survey, SurveyWithCount } from './types'

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
