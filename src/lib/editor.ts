// Survey editor state: the draft being edited, the changes the editor can
// make to it, and the checks run before saving or activating.

import type { QuestionType, SurveyDraftPayload, SurveyWithQuestions } from './types'

export interface DraftChoice {
  /** Stable key for React lists; not a database ID. */
  key: string
  text: string
}

export interface DraftQuestion {
  key: string
  text: string
  type: QuestionType
  choices: DraftChoice[]
}

export interface DraftSurvey {
  title: string
  description: string
  questions: DraftQuestion[]
}

export const TRUE_FALSE_CHOICES = ['True', 'False']

/**
 * React key for the editor on /surveys/new. After the first save the URL
 * changes to /surveys/:id/edit with this same key, so the editor keeps its
 * state instead of remounting and reloading.
 */
export const NEW_EDITOR_KEY = 'new'

let lastKey = 0
const newKey = () => `k${++lastKey}`

/** True/False gets its two fixed choices (D13); Multiple Choice starts with 2 empty ones. */
function choicesFor(type: QuestionType): DraftChoice[] {
  const texts = type === 'true_false' ? TRUE_FALSE_CHOICES : ['', '']
  return texts.map((text) => ({ key: newKey(), text }))
}

export function newQuestion(type: QuestionType = 'multiple_choice'): DraftQuestion {
  return { key: newKey(), text: '', type, choices: choicesFor(type) }
}

export function emptySurvey(): DraftSurvey {
  return { title: '', description: '', questions: [newQuestion()] }
}

export function fromDatabase(survey: SurveyWithQuestions): DraftSurvey {
  return {
    title: survey.title,
    description: survey.description ?? '',
    questions: survey.questions.map((question) => ({
      key: newKey(),
      text: question.question_text,
      type: question.question_type,
      choices: question.choices.map((choice) => ({ key: newKey(), text: choice.choice_text })),
    })),
  }
}

/** What gets saved. Also used to detect unsaved changes. */
export function toPayload(draft: DraftSurvey): SurveyDraftPayload {
  return {
    title: draft.title.trim(),
    description: draft.description.trim(),
    questions: draft.questions.map((question) => ({
      question_text: question.text.trim(),
      question_type: question.type,
      choices: question.choices.map((choice) => ({ choice_text: choice.text.trim() })),
    })),
  }
}

export const snapshot = (draft: DraftSurvey) => JSON.stringify(toPayload(draft))

/** True if any choice has text, so changing the type would lose something (D13). */
export function hasChoiceText(question: DraftQuestion): boolean {
  return question.choices.some((choice) => choice.text.trim() !== '')
}

// ---------------------------------------------------------------------------
// Changes
// ---------------------------------------------------------------------------

export type EditorAction =
  | { type: 'load'; draft: DraftSurvey }
  | { type: 'setTitle'; value: string }
  | { type: 'setDescription'; value: string }
  | { type: 'addQuestion' }
  | { type: 'removeQuestion'; questionKey: string }
  | { type: 'moveQuestion'; questionKey: string; offset: -1 | 1 }
  | { type: 'setQuestionText'; questionKey: string; value: string }
  | { type: 'setQuestionType'; questionKey: string; value: QuestionType }
  | { type: 'addChoice'; questionKey: string }
  | { type: 'removeChoice'; questionKey: string; choiceKey: string }
  | { type: 'moveChoice'; questionKey: string; choiceKey: string; offset: -1 | 1 }
  | { type: 'setChoiceText'; questionKey: string; choiceKey: string; value: string }

/** Swaps an item with its neighbour; unchanged if it is already at that end. */
function move<T extends { key: string }>(items: T[], key: string, offset: -1 | 1): T[] {
  const from = items.findIndex((item) => item.key === key)
  const to = from + offset
  if (from < 0 || to < 0 || to >= items.length) return items
  const copy = [...items]
  ;[copy[from], copy[to]] = [copy[to], copy[from]]
  return copy
}

function updateQuestion(
  draft: DraftSurvey,
  questionKey: string,
  change: (question: DraftQuestion) => DraftQuestion,
): DraftSurvey {
  return {
    ...draft,
    questions: draft.questions.map((q) => (q.key === questionKey ? change(q) : q)),
  }
}

export function editorReducer(draft: DraftSurvey, action: EditorAction): DraftSurvey {
  switch (action.type) {
    case 'load':
      return action.draft
    case 'setTitle':
      return { ...draft, title: action.value }
    case 'setDescription':
      return { ...draft, description: action.value }
    case 'addQuestion':
      return { ...draft, questions: [...draft.questions, newQuestion()] }
    case 'removeQuestion':
      return { ...draft, questions: draft.questions.filter((q) => q.key !== action.questionKey) }
    case 'moveQuestion':
      return { ...draft, questions: move(draft.questions, action.questionKey, action.offset) }
    case 'setQuestionText':
      return updateQuestion(draft, action.questionKey, (q) => ({ ...q, text: action.value }))
    case 'setQuestionType':
      return updateQuestion(draft, action.questionKey, (q) =>
        q.type === action.value
          ? q
          : { ...q, type: action.value, choices: choicesFor(action.value) },
      )
    case 'addChoice':
      return updateQuestion(draft, action.questionKey, (q) => ({
        ...q,
        choices: [...q.choices, { key: newKey(), text: '' }],
      }))
    case 'removeChoice':
      return updateQuestion(draft, action.questionKey, (q) => ({
        ...q,
        choices: q.choices.filter((c) => c.key !== action.choiceKey),
      }))
    case 'moveChoice':
      return updateQuestion(draft, action.questionKey, (q) => ({
        ...q,
        choices: move(q.choices, action.choiceKey, action.offset),
      }))
    case 'setChoiceText':
      return updateQuestion(draft, action.questionKey, (q) => ({
        ...q,
        choices: q.choices.map((c) =>
          c.key === action.choiceKey ? { ...c, text: action.value } : c,
        ),
      }))
  }
}

// ---------------------------------------------------------------------------
// Checks (D10, D23)
// ---------------------------------------------------------------------------

/** Element IDs, so each error can be shown next to its field and focused. */
export const fieldIds = {
  title: 'survey-title',
  questions: 'survey-questions',
  questionText: (questionKey: string) => `question-${questionKey}-text`,
  choices: (questionKey: string) => `question-${questionKey}-choices`,
  choice: (choiceKey: string) => `choice-${choiceKey}`,
}

/** Field ID → message, in page order. */
export type FieldErrors = Record<string, string>

/**
 * Save Draft only needs a title (D23). Activation also needs the D10 checks:
 * at least one question, no blank text, and 2+ choices per multiple-choice question.
 */
export function validate(draft: DraftSurvey, forActivation: boolean): FieldErrors {
  const errors: FieldErrors = {}
  if (!draft.title.trim()) errors[fieldIds.title] = 'Enter a survey title.'
  if (!forActivation) return errors

  if (draft.questions.length === 0) {
    errors[fieldIds.questions] = 'Add at least one question before activating.'
  }
  for (const question of draft.questions) {
    if (!question.text.trim()) {
      errors[fieldIds.questionText(question.key)] = 'Enter the question text.'
    }
    if (question.type === 'multiple_choice') {
      if (question.choices.length < 2) {
        errors[fieldIds.choices(question.key)] = 'Add at least 2 choices.'
      }
      for (const choice of question.choices) {
        if (!choice.text.trim()) errors[fieldIds.choice(choice.key)] = 'Enter the choice text.'
      }
    }
  }
  return errors
}
