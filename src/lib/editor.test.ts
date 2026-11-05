import { describe, expect, it } from 'vitest'
import {
  editorReducer,
  emptySurvey,
  fieldIds,
  fromDatabase,
  hasChoiceText,
  newQuestion,
  snapshot,
  toPayload,
  validate,
  type DraftSurvey,
} from './editor'
import type { SurveyWithQuestions } from './types'

/** A draft with one multiple-choice question whose choices are A, B, C. */
function draftWithChoices(): DraftSurvey {
  const question = newQuestion()
  question.text = 'Pick one'
  question.choices = ['A', 'B', 'C'].map((text, i) => ({ key: `c${i}`, text }))
  return { title: 'Quiz', description: '', questions: [question] }
}

const choiceTexts = (draft: DraftSurvey, index = 0) =>
  draft.questions[index].choices.map((c) => c.text)

describe('new drafts', () => {
  it('start with one multiple-choice question with 2 empty choices', () => {
    const draft = emptySurvey()
    expect(draft.questions).toHaveLength(1)
    expect(draft.questions[0].type).toBe('multiple_choice')
    expect(choiceTexts(draft)).toEqual(['', ''])
  })

  it('give every question and choice a unique key', () => {
    const draft = editorReducer(emptySurvey(), { type: 'addQuestion' })
    const keys = draft.questions.flatMap((q) => [q.key, ...q.choices.map((c) => c.key)])
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('editorReducer', () => {
  it('sets the title and description', () => {
    let draft = editorReducer(emptySurvey(), { type: 'setTitle', value: 'T' })
    draft = editorReducer(draft, { type: 'setDescription', value: 'D' })
    expect([draft.title, draft.description]).toEqual(['T', 'D'])
  })

  it('adds, moves and removes questions', () => {
    let draft = emptySurvey()
    draft = editorReducer(draft, { type: 'addQuestion' })
    const [first, second] = draft.questions

    draft = editorReducer(draft, { type: 'moveQuestion', questionKey: second.key, offset: -1 })
    expect(draft.questions.map((q) => q.key)).toEqual([second.key, first.key])

    draft = editorReducer(draft, { type: 'removeQuestion', questionKey: second.key })
    expect(draft.questions.map((q) => q.key)).toEqual([first.key])
  })

  it('does nothing when moving past either end', () => {
    const draft = draftWithChoices()
    const key = draft.questions[0].key
    expect(editorReducer(draft, { type: 'moveQuestion', questionKey: key, offset: -1 })).toEqual(
      draft,
    )
    expect(
      editorReducer(draft, {
        type: 'moveChoice',
        questionKey: key,
        choiceKey: 'c2',
        offset: 1,
      }),
    ).toEqual(draft)
  })

  it('adds, edits, moves and removes choices', () => {
    let draft = draftWithChoices()
    const q = draft.questions[0].key
    draft = editorReducer(draft, {
      type: 'moveChoice',
      questionKey: q,
      choiceKey: 'c2',
      offset: -1,
    })
    expect(choiceTexts(draft)).toEqual(['A', 'C', 'B'])

    draft = editorReducer(draft, {
      type: 'setChoiceText',
      questionKey: q,
      choiceKey: 'c0',
      value: 'Z',
    })
    draft = editorReducer(draft, { type: 'removeChoice', questionKey: q, choiceKey: 'c1' })
    draft = editorReducer(draft, { type: 'addChoice', questionKey: q })
    expect(choiceTexts(draft)).toEqual(['Z', 'C', ''])
  })

  it('gives True/False questions the fixed True and False choices (D13)', () => {
    let draft = draftWithChoices()
    const q = draft.questions[0].key
    draft = editorReducer(draft, { type: 'setQuestionType', questionKey: q, value: 'true_false' })
    expect(choiceTexts(draft)).toEqual(['True', 'False'])
    expect(draft.questions[0].text).toBe('Pick one') // question text is kept

    draft = editorReducer(draft, {
      type: 'setQuestionType',
      questionKey: q,
      value: 'multiple_choice',
    })
    expect(choiceTexts(draft)).toEqual(['', ''])
  })

  it('keeps the choices when the type is unchanged', () => {
    const draft = draftWithChoices()
    const q = draft.questions[0].key
    const same = editorReducer(draft, {
      type: 'setQuestionType',
      questionKey: q,
      value: 'multiple_choice',
    })
    expect(choiceTexts(same)).toEqual(['A', 'B', 'C'])
  })

  it('does not change the original draft', () => {
    const draft = draftWithChoices()
    const before = JSON.stringify(draft)
    editorReducer(draft, { type: 'removeQuestion', questionKey: draft.questions[0].key })
    expect(JSON.stringify(draft)).toBe(before)
  })
})

describe('hasChoiceText', () => {
  it('is false only when every choice is blank', () => {
    expect(hasChoiceText(newQuestion())).toBe(false)
    expect(hasChoiceText(draftWithChoices().questions[0])).toBe(true)
  })
})

describe('toPayload and snapshot', () => {
  it('trims text and keeps the order (D22)', () => {
    const draft = draftWithChoices()
    draft.title = '  Quiz  '
    draft.questions[0].choices[0].text = ' A '
    expect(toPayload(draft)).toEqual({
      title: 'Quiz',
      description: '',
      questions: [
        {
          question_text: 'Pick one',
          question_type: 'multiple_choice',
          choices: [{ choice_text: 'A' }, { choice_text: 'B' }, { choice_text: 'C' }],
        },
      ],
    })
  })

  it('ignores React keys, so only real changes count as unsaved', () => {
    const a = draftWithChoices()
    const b = draftWithChoices() // same content, different question key
    expect(snapshot(a)).toBe(snapshot(b))
    b.questions[0].choices[0].text = 'Changed'
    expect(snapshot(a)).not.toBe(snapshot(b))
  })
})

describe('fromDatabase', () => {
  it('turns a saved survey into a draft', () => {
    const survey = {
      title: 'Saved',
      description: null,
      questions: [
        {
          question_text: 'Q',
          question_type: 'true_false',
          choices: [{ choice_text: 'True' }, { choice_text: 'False' }],
        },
      ],
    } as unknown as SurveyWithQuestions
    const draft = fromDatabase(survey)
    expect(draft.description).toBe('')
    expect(draft.questions[0].type).toBe('true_false')
    expect(choiceTexts(draft)).toEqual(['True', 'False'])
  })
})

describe('validate', () => {
  it('only needs a title to save (D23)', () => {
    const draft = emptySurvey() // blank question and choices
    expect(validate(draft, false)).toEqual({ [fieldIds.title]: 'Enter a survey title.' })
    draft.title = 'Draft'
    expect(validate(draft, false)).toEqual({})
  })

  it('runs the D10 checks before activating, in page order', () => {
    const draft = emptySurvey()
    const q = draft.questions[0]
    const errors = validate(draft, true)
    expect(Object.keys(errors)).toEqual([
      fieldIds.title,
      fieldIds.questionText(q.key),
      fieldIds.choice(q.choices[0].key),
      fieldIds.choice(q.choices[1].key),
    ])
  })

  it('needs at least one question and 2 choices per multiple-choice question', () => {
    const empty: DraftSurvey = { title: 'T', description: '', questions: [] }
    expect(validate(empty, true)).toEqual({
      [fieldIds.questions]: 'Add at least one question before activating.',
    })

    const draft = draftWithChoices()
    draft.questions[0].choices = [{ key: 'only', text: 'A' }]
    expect(validate(draft, true)).toEqual({
      [fieldIds.choices(draft.questions[0].key)]: 'Add at least 2 choices.',
    })
  })

  it('accepts a complete survey, including True/False questions', () => {
    let draft = draftWithChoices()
    draft = editorReducer(draft, { type: 'addQuestion' })
    const tf = draft.questions[1].key
    draft = editorReducer(draft, { type: 'setQuestionText', questionKey: tf, value: 'Is it?' })
    draft = editorReducer(draft, { type: 'setQuestionType', questionKey: tf, value: 'true_false' })
    expect(validate(draft, true)).toEqual({})
  })
})
