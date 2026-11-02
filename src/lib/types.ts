export type SurveyStatus = 'draft' | 'active' | 'closed' | 'archived'

export const STATUS_LABELS: Record<SurveyStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  closed: 'Closed',
  archived: 'Archived',
}

export interface Survey {
  id: string
  title: string
  description: string | null
  status: SurveyStatus
  public_slug: string | null
  created_at: string
  updated_at: string
}

export interface SurveyWithCount extends Survey {
  response_count: number
}

export type QuestionType = 'multiple_choice' | 'true_false'

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: 'Multiple Choice',
  true_false: 'True / False',
}

export interface Choice {
  id: string
  question_id: string
  choice_text: string
  position: number
}

export interface Question {
  id: string
  survey_id: string
  question_text: string
  question_type: QuestionType
  position: number
}

export interface SurveyWithQuestions extends Survey {
  questions: (Question & { choices: Choice[] })[]
}

/** What `save_survey_draft` takes (D22). */
export interface SurveyDraftPayload {
  title: string
  description: string
  questions: {
    question_text: string
    question_type: QuestionType
    choices: { choice_text: string }[]
  }[]
}

/** What `get_public_survey` returns for an active survey (D2). */
export interface PublicSurvey {
  status: 'active'
  survey: { id: string; title: string; description: string | null }
  questions: {
    id: string
    question_text: string
    question_type: QuestionType
    position: number
    choices: { id: string; choice_text: string; position: number }[]
  }[]
}

export type PublicSurveyResult = PublicSurvey | { status: 'closed' } | null

/** What `get_survey_results` returns (API.md §11, D24). */
export interface SurveyResults {
  survey_id: string
  title: string
  status: SurveyStatus
  public_slug: string | null
  response_count: number
  questions: {
    question_id: string
    question_text: string
    question_type: QuestionType
    position: number
    response_count: number
    choices: { choice_id: string; choice_text: string; count: number; percentage: number }[]
  }[]
}
