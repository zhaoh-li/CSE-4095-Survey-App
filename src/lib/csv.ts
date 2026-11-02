// Builds the CSV export described in D14 and D26. Plain functions with no
// browser APIs, so they can be unit tested (npm test).

import { toLocalDateString } from './dates'
import { fileSafe } from './format'

export interface ExportQuestion {
  id: string
  question_text: string
  position: number
}

export interface ExportResponse {
  id: string
  submitted_at: string
  answers: { question_id: string; choice_text: string | null }[]
}

/**
 * RFC 4180 escaping: wrap in quotes if the value has a comma, quote, line
 * break or a space at either end, and double any quotes inside.
 */
export function escapeCsvValue(value: string): string {
  if (/[",\r\n]|^\s|\s$/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

/** Rows to CSV text, with Windows line endings as RFC 4180 specifies. */
export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(escapeCsvValue).join(',')).join('\r\n') + '\r\n'
}

/**
 * D14: one row per response. Columns are survey_title, response_id,
 * submitted_at, then "Q1: <question text>" … in question order. Each answer
 * cell holds the chosen choice's text, or is empty if there is none.
 */
export function buildSurveyCsv(
  title: string,
  questions: ExportQuestion[],
  responses: ExportResponse[],
  formatTimestamp: (iso: string) => string,
): string {
  const ordered = [...questions].sort((a, b) => a.position - b.position)

  const header = [
    'survey_title',
    'response_id',
    'submitted_at',
    ...ordered.map((question, index) => `Q${index + 1}: ${question.question_text}`),
  ]

  const rows = responses.map((response) => {
    const choiceByQuestion = new Map(
      response.answers.map((answer) => [answer.question_id, answer.choice_text ?? '']),
    )
    return [
      title,
      response.id,
      formatTimestamp(response.submitted_at),
      ...ordered.map((question) => choiceByQuestion.get(question.id) ?? ''),
    ]
  })

  return toCsv([header, ...rows])
}

/** D14: "<survey-title>_<YYYY-MM-DD>.csv", using the export date. */
export function csvFileName(title: string, exportedAt: Date): string {
  return `${fileSafe(title)}_${toLocalDateString(exportedAt.toISOString())}.csv`
}
