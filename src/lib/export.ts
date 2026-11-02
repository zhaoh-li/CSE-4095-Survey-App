// Loads everything needed for one survey's CSV export (API.md §12, D26).

import type { ExportResponse } from './csv'
import { toAppError } from './errors'
import { supabase } from './supabase'
import { getSurveyWithQuestions } from './surveys'
import type { SurveyWithQuestions } from './types'

/** Supabase returns at most 1,000 rows per request by default. */
const PAGE_SIZE = 1000

type ResponseRow = {
  id: string
  submitted_at: string
  answers: { question_id: string; choices: { choice_text: string } | null }[]
}

/** Every response to the survey, oldest first, loaded in pages so none are cut off. */
async function fetchAllResponses(surveyId: string): Promise<ExportResponse[]> {
  const responses: ExportResponse[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('responses')
      .select('id, submitted_at, answers(question_id, choices(choice_text))')
      .eq('survey_id', surveyId)
      .order('submitted_at')
      .order('id') // stable order across pages
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw toAppError(error)

    for (const row of data as unknown as ResponseRow[]) {
      responses.push({
        id: row.id,
        submitted_at: row.submitted_at,
        answers: row.answers.map((answer) => ({
          question_id: answer.question_id,
          choice_text: answer.choices?.choice_text ?? null,
        })),
      })
    }
    if (data.length < PAGE_SIZE) return responses
  }
}

export async function fetchSurveyExport(
  surveyId: string,
): Promise<{ survey: SurveyWithQuestions; responses: ExportResponse[] }> {
  const survey = await getSurveyWithQuestions(surveyId)
  if (!survey) throw toAppError({ message: 'SURVEY_NOT_FOUND' })
  return { survey, responses: await fetchAllResponses(surveyId) }
}
