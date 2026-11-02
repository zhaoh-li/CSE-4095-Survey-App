import type { Dispatch } from 'react'
import { fieldIds, type DraftQuestion, type EditorAction, type FieldErrors } from '../lib/editor'
import { buttonSecondary, inputClass, labelClass } from '../lib/styles'
import { QUESTION_TYPE_LABELS, type QuestionType } from '../lib/types'

interface QuestionEditorProps {
  question: DraftQuestion
  index: number
  total: number
  errors: FieldErrors
  dispatch: Dispatch<EditorAction>
  /** The page decides whether a type change needs confirmation (D13). */
  onTypeChange: (type: QuestionType) => void
  onDelete: () => void
}

const smallButton = `${buttonSecondary} min-h-11 min-w-11 px-3`

function FieldError({ id, errors }: { id: string; errors: FieldErrors }) {
  if (!errors[id]) return null
  return (
    <p id={`${id}-error`} className="text-sm font-medium text-red-700">
      {errors[id]}
    </p>
  )
}

/** Props that link an input to its error message for screen readers. */
function errorProps(id: string, errors: FieldErrors) {
  return errors[id] ? { 'aria-invalid': true, 'aria-describedby': `${id}-error` } : {}
}

export default function QuestionEditor({
  question,
  index,
  total,
  errors,
  dispatch,
  onTypeChange,
  onDelete,
}: QuestionEditorProps) {
  const number = index + 1
  const textId = fieldIds.questionText(question.key)
  const choicesId = fieldIds.choices(question.key)
  const isTrueFalse = question.type === 'true_false'

  return (
    <section
      aria-labelledby={`${textId}-label`}
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${textId}-label`} className="text-lg font-semibold text-slate-900">
          Question {number}
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            className={smallButton}
            disabled={index === 0}
            onClick={() =>
              dispatch({ type: 'moveQuestion', questionKey: question.key, offset: -1 })
            }
            aria-label={`Move question ${number} up`}
          >
            ↑
          </button>
          <button
            type="button"
            className={smallButton}
            disabled={index === total - 1}
            onClick={() => dispatch({ type: 'moveQuestion', questionKey: question.key, offset: 1 })}
            aria-label={`Move question ${number} down`}
          >
            ↓
          </button>
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor={textId} className={labelClass}>
          Question text
        </label>
        <input
          id={textId}
          value={question.text}
          onChange={(e) =>
            dispatch({ type: 'setQuestionText', questionKey: question.key, value: e.target.value })
          }
          className={inputClass}
          {...errorProps(textId, errors)}
        />
        <FieldError id={textId} errors={errors} />
      </div>

      <div className="space-y-1 sm:max-w-xs">
        <label htmlFor={`question-${question.key}-type`} className={labelClass}>
          Type
        </label>
        <select
          id={`question-${question.key}-type`}
          value={question.type}
          onChange={(e) => onTypeChange(e.target.value as QuestionType)}
          className={inputClass}
        >
          {(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map((type) => (
            <option key={type} value={type}>
              {QUESTION_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="space-y-2">
        <legend className={labelClass}>Choices</legend>
        <div id={choicesId} tabIndex={-1} className="space-y-2 focus:outline-none">
          <FieldError id={choicesId} errors={errors} />

          {isTrueFalse && (
            <p className="text-sm text-slate-600">
              True / False questions always use these two choices.
            </p>
          )}

          {question.choices.map((choice, choiceIndex) => {
            const choiceId = fieldIds.choice(choice.key)
            const label = `Choice ${choiceIndex + 1}`
            return (
              <div key={choice.key} className="space-y-1">
                <div className="flex gap-2">
                  <input
                    id={choiceId}
                    aria-label={`Question ${number}, ${label}`}
                    value={choice.text}
                    readOnly={isTrueFalse}
                    onChange={(e) =>
                      dispatch({
                        type: 'setChoiceText',
                        questionKey: question.key,
                        choiceKey: choice.key,
                        value: e.target.value,
                      })
                    }
                    placeholder={label}
                    className={`${inputClass} ${isTrueFalse ? 'bg-slate-100 text-slate-600' : ''}`}
                    {...errorProps(choiceId, errors)}
                  />
                  {!isTrueFalse && (
                    <>
                      <button
                        type="button"
                        className={smallButton}
                        disabled={choiceIndex === 0}
                        onClick={() =>
                          dispatch({
                            type: 'moveChoice',
                            questionKey: question.key,
                            choiceKey: choice.key,
                            offset: -1,
                          })
                        }
                        aria-label={`Move ${label.toLowerCase()} up`}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className={smallButton}
                        disabled={choiceIndex === question.choices.length - 1}
                        onClick={() =>
                          dispatch({
                            type: 'moveChoice',
                            questionKey: question.key,
                            choiceKey: choice.key,
                            offset: 1,
                          })
                        }
                        aria-label={`Move ${label.toLowerCase()} down`}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className={smallButton}
                        onClick={() =>
                          dispatch({
                            type: 'removeChoice',
                            questionKey: question.key,
                            choiceKey: choice.key,
                          })
                        }
                        aria-label={`Delete ${label.toLowerCase()}`}
                      >
                        ✕
                      </button>
                    </>
                  )}
                </div>
                <FieldError id={choiceId} errors={errors} />
              </div>
            )
          })}
        </div>

        {!isTrueFalse && (
          <button
            type="button"
            className={buttonSecondary}
            onClick={() => dispatch({ type: 'addChoice', questionKey: question.key })}
          >
            + Add Choice
          </button>
        )}
      </fieldset>

      <div className="border-t border-slate-100 pt-4">
        <button type="button" onClick={onDelete} className={`${buttonSecondary} text-red-700`}>
          Delete Question
        </button>
      </div>
    </section>
  )
}
