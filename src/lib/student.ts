// Database calls for the public student page. Students only reach the
// database through these two functions (D5).

import { toAppError } from './errors'
import { supabase } from './supabase'
import type { PublicSurveyResult } from './types'

export async function getPublicSurvey(slug: string): Promise<PublicSurveyResult> {
  const { data, error } = await supabase.rpc('get_public_survey', { p_slug: slug })
  if (error) throw toAppError(error)
  return data as PublicSurveyResult
}

export interface SubmittedAnswer {
  question_id: string
  choice_id: string
}

/** Throws an AppError whose `code` is e.g. DUPLICATE_RESPONSE or SURVEY_NOT_ACTIVE. */
export async function submitResponse(
  surveyId: string,
  token: string,
  answers: SubmittedAnswer[],
): Promise<void> {
  const { error } = await supabase.rpc('submit_survey_response', {
    p_survey_id: surveyId,
    p_anonymous_token: token,
    p_answers: answers,
  })
  if (error) throw toAppError(error)
}
