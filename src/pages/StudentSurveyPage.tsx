import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { getAnonymousToken, hasSubmitted, markSubmitted } from '../lib/anonymous-token'
import { AppError, toAppError } from '../lib/errors'
import { getPublicSurvey, submitResponse } from '../lib/student'
import { buttonPrimary } from '../lib/styles'
import type { PublicSurvey } from '../lib/types'
import { usePageTitle } from '../lib/use-page-title'

/** Which screen the student sees (UI.md §8, D2). */
type View =
  | { kind: 'loading' }
  | { kind: 'not_found' }
  | { kind: 'closed' }
  | { kind: 'load_error'; message: string }
  | { kind: 'form'; survey: PublicSurvey }
  | { kind: 'submitted' }
  | { kind: 'already_submitted' }

type Loaded = { forSlug: string; view: View }

export default function StudentSurveyPage() {
  const { slug = '' } = useParams()
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(() => {
    let current = true
    getPublicSurvey(slug)
      .then((result): View => {
        if (result === null) return { kind: 'not_found' }
        if (result.status === 'closed') return { kind: 'closed' }
        // D25: skip the form if this browser already answered (the database still decides).
        if (hasSubmitted(result.survey.id)) return { kind: 'already_submitted' }
        return { kind: 'form', survey: result }
      })
      .catch((error): View => ({ kind: 'load_error', message: toAppError(error).message }))
      .then((view) => {
        if (current) setLoaded({ forSlug: slug, view })
      })
    return () => {
      current = false
    }
  }, [slug])

  const view: View = loaded?.forSlug === slug ? loaded.view : { kind: 'loading' }
  usePageTitle(view.kind === 'form' ? view.survey.survey.title : 'Survey')
  const show = (next: View) => setLoaded({ forSlug: slug, view: next })

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-xl px-4 py-6 sm:py-10">
        {view.kind === 'form' ? (
          <SurveyForm survey={view.survey} onFinished={show} />
        ) : (
          <Message view={view} />
        )}
      </div>
    </main>
  )
}

function Message({ view }: { view: Exclude<View, { kind: 'form' }> }) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  // Move focus to the message (e.g. "Thank you!") so screen readers announce it.
  useEffect(() => {
    if (view.kind !== 'loading') headingRef.current?.focus()
  }, [view.kind])

  const content: Record<typeof view.kind, { title: string; body?: string }> = {
    loading: { title: 'Loading survey...' },
    not_found: { title: 'Survey not found.' },
    closed: { title: 'This survey is no longer accepting responses.' },
    load_error: {
      title: 'Could not load the survey.',
      body: view.kind === 'load_error' ? view.message : undefined,
    },
    submitted: { title: 'Thank you!', body: 'Your response has been recorded.' },
    already_submitted: { title: 'You have already submitted a response to this survey.' },
  }
  const { title, body } = content[view.kind]

  return (
    <div
      role={view.kind === 'loading' ? 'status' : undefined}
      className="rounded-xl bg-white p-8 text-center shadow-sm"
    >
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="text-2xl font-bold text-slate-900 focus:outline-none"
      >
        {title}
      </h1>
      {body && <p className="mt-3 text-lg text-slate-700">{body}</p>}
      {view.kind === 'load_error' && (
        <button
          type="button"
          onClick={() => window.location.reload()}
          className={`${buttonPrimary} mt-6`}
        >
          Try again
        </button>
      )}
    </div>
  )
}

function SurveyForm({
  survey,
  onFinished,
}: {
  survey: PublicSurvey
  onFinished: (view: View) => void
}) {
  // question ID → chosen choice ID
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [showMissing, setShowMissing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const surveyId = survey.survey.id
  const missing = survey.questions.filter((q) => !answers[q.id])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    // D3: every question is required. Jump to the first unanswered one.
    if (missing.length > 0) {
      setShowMissing(true)
      document.querySelector<HTMLInputElement>(`input[name="q-${missing[0].id}"]`)?.focus()
      return
    }

    setSubmitting(true)
    try {
      await submitResponse(
        surveyId,
        getAnonymousToken(),
        survey.questions.map((q) => ({ question_id: q.id, choice_id: answers[q.id] })),
      )
      markSubmitted(surveyId)
      onFinished({ kind: 'submitted' })
    } catch (err) {
      const appError = err instanceof AppError ? err : toAppError(err)
      if (appError.code === 'DUPLICATE_RESPONSE') {
        markSubmitted(surveyId)
        onFinished({ kind: 'already_submitted' })
      } else if (appError.code === 'SURVEY_NOT_ACTIVE') {
        onFinished({ kind: 'closed' }) // closed while the student was answering
      } else {
        setError(appError.message)
        setSubmitting(false)
      }
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{survey.survey.title}</h1>
        {survey.survey.description && (
          <p className="text-lg text-slate-700">{survey.survey.description}</p>
        )}
      </header>

      {survey.questions.map((question, index) => {
        const isMissing = showMissing && !answers[question.id]
        const errorId = `q-${question.id}-error`
        return (
          <fieldset
            key={question.id}
            aria-describedby={isMissing ? errorId : undefined}
            className={`space-y-3 rounded-xl border-2 bg-white p-4 shadow-sm ${
              isMissing ? 'border-red-600' : 'border-transparent'
            }`}
          >
            <legend className="float-left w-full text-lg font-semibold text-slate-900">
              {index + 1}. {question.question_text}
            </legend>
            {isMissing && (
              <p id={errorId} className="clear-left font-medium text-red-700">
                Please answer this question.
              </p>
            )}
            <div className="clear-left space-y-3">
              {question.choices.map((choice) => (
                <label
                  key={choice.id}
                  className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border-2 border-slate-200 px-4 py-3 text-lg text-slate-900 focus-within:ring-4 focus-within:ring-slate-300 has-checked:border-slate-900 has-checked:bg-slate-100"
                >
                  <input
                    type="radio"
                    name={`q-${question.id}`}
                    value={choice.id}
                    checked={answers[question.id] === choice.id}
                    onChange={() => setAnswers((prev) => ({ ...prev, [question.id]: choice.id }))}
                    className="size-5 shrink-0 accent-slate-900"
                  />
                  {choice.choice_text}
                </label>
              ))}
            </div>
          </fieldset>
        )
      })}

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className={`${buttonPrimary} min-h-14 w-full text-lg`}
      >
        {submitting ? 'Submitting...' : 'Submit'}
      </button>
    </form>
  )
}
