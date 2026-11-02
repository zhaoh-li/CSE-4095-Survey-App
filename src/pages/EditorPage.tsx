import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom'
import ConfirmDialog from '../components/ConfirmDialog'
import LoadingMessage from '../components/LoadingMessage'
import QuestionEditor from '../components/QuestionEditor'
import StatusBadge from '../components/StatusBadge'
import {
  NEW_EDITOR_KEY,
  editorReducer,
  emptySurvey,
  fieldIds,
  fromDatabase,
  hasChoiceText,
  snapshot,
  toPayload,
  validate,
  type DraftQuestion,
  type FieldErrors,
} from '../lib/editor'
import { toAppError } from '../lib/errors'
import { buttonPrimary, buttonSecondary, inputClass, labelClass } from '../lib/styles'
import {
  activateSurvey,
  duplicateSurvey,
  getActiveSurvey,
  getSurveyWithQuestions,
  saveSurveyDraft,
} from '../lib/surveys'
import type { QuestionType, Survey } from '../lib/types'

/** What loading `/surveys/:id/edit` found. */
type LoadState =
  | { forId: string; kind: 'ready' }
  | { forId: string; kind: 'not_found' }
  | { forId: string; kind: 'not_draft'; survey: Survey }
  | { forId: string; kind: 'error'; message: string }

type Busy = 'saving' | 'activating' | 'duplicating' | null

/** Focuses the first field with an error. Returns true if there was one. */
function focusFirstError(errors: FieldErrors): boolean {
  const first = Object.keys(errors)[0]
  if (!first) return false
  document.getElementById(first)?.focus()
  return true
}

export default function EditorPage() {
  const { id: routeId } = useParams()
  const navigate = useNavigate()

  const [draft, dispatch] = useReducer(editorReducer, undefined, emptySurvey)
  const [savedSnapshot, setSavedSnapshot] = useState(() => snapshot(draft))
  const [load, setLoad] = useState<LoadState | null>(null)
  const [showErrorsFor, setShowErrorsFor] = useState<'save' | 'activate' | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)

  const [pendingActivate, setPendingActivate] = useState<{ id: string; current: string } | null>(
    null,
  )
  const [pendingTypeChange, setPendingTypeChange] = useState<{
    questionKey: string
    type: QuestionType
  } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  /** The survey ID this editor already has, so it isn't reloaded after the first save. */
  const loadedIdRef = useRef<string | null>(null)
  /** Lets our own navigation (after saving or activating) skip the unsaved-changes check. */
  const allowLeaveRef = useRef(false)

  const dirty = useMemo(() => snapshot(draft) !== savedSnapshot, [draft, savedSnapshot])
  const errors = showErrorsFor ? validate(draft, showErrorsFor === 'activate') : {}
  const loading = routeId !== undefined && load?.forId !== routeId

  // Load an existing survey.
  useEffect(() => {
    if (!routeId || loadedIdRef.current === routeId) return
    let current = true
    getSurveyWithQuestions(routeId)
      .then((survey) => {
        if (!current) return
        loadedIdRef.current = routeId
        if (!survey) {
          setLoad({ forId: routeId, kind: 'not_found' })
        } else if (survey.status !== 'draft') {
          setLoad({ forId: routeId, kind: 'not_draft', survey }) // D4
        } else {
          const loaded = fromDatabase(survey)
          dispatch({ type: 'load', draft: loaded })
          setSavedSnapshot(snapshot(loaded))
          setLoad({ forId: routeId, kind: 'ready' })
        }
      })
      .catch((error) => {
        if (current) setLoad({ forId: routeId, kind: 'error', message: toAppError(error).message })
      })
    return () => {
      current = false
    }
  }, [routeId])

  useEffect(() => {
    allowLeaveRef.current = false
  }, [routeId])

  // Warn before closing or refreshing the tab with unsaved changes.
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  // Warn before following a link inside the app with unsaved changes.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !allowLeaveRef.current && currentLocation.pathname !== nextLocation.pathname,
  )

  /** Saves the draft (D22). A new survey gets its own URL. Returns the survey ID. */
  async function persist(): Promise<string> {
    const id = await saveSurveyDraft(routeId ?? null, toPayload(draft))
    setSavedSnapshot(snapshot(draft))
    if (!routeId) {
      loadedIdRef.current = id
      setLoad({ forId: id, kind: 'ready' })
      allowLeaveRef.current = true
      // Same editor key, so the page keeps its state instead of reloading.
      navigate(`/surveys/${id}/edit`, { replace: true, state: { editorKey: NEW_EDITOR_KEY } })
    }
    return id
  }

  async function handleSave() {
    setShowErrorsFor('save')
    setActionError(null)
    if (focusFirstError(validate(draft, false))) return // D23: only a title is required

    setBusy('saving')
    try {
      await persist()
      setJustSaved(true)
    } catch (error) {
      setActionError(toAppError(error).message)
    } finally {
      setBusy(null)
    }
  }

  async function activateAndPresent(id: string) {
    await activateSurvey(id)
    allowLeaveRef.current = true
    navigate(`/surveys/${id}/present`)
  }

  /** D17: check, save, confirm if another survey is active (D11), activate, present. */
  async function handleActivate() {
    setShowErrorsFor('activate')
    setActionError(null)
    if (focusFirstError(validate(draft, true))) return // D10

    setBusy('activating')
    try {
      const id = dirty || !routeId ? await persist() : routeId
      const current = await getActiveSurvey()
      if (current && current.id !== id) {
        setPendingActivate({ id, current: current.title })
        return
      }
      await activateAndPresent(id)
    } catch (error) {
      setActionError(toAppError(error).message)
    } finally {
      setBusy(null)
    }
  }

  async function confirmActivate() {
    if (!pendingActivate) return
    setBusy('activating')
    try {
      await activateAndPresent(pendingActivate.id)
    } catch (error) {
      setActionError(toAppError(error).message)
      setPendingActivate(null)
    } finally {
      setBusy(null)
    }
  }

  function requestTypeChange(question: DraftQuestion, type: QuestionType) {
    if (type === question.type) return
    if (hasChoiceText(question))
      setPendingTypeChange({ questionKey: question.key, type }) // D13
    else dispatch({ type: 'setQuestionType', questionKey: question.key, value: type })
  }

  function requestDelete(question: DraftQuestion) {
    if (question.text.trim() || hasChoiceText(question)) setPendingDelete(question.key)
    else dispatch({ type: 'removeQuestion', questionKey: question.key })
  }

  async function handleDuplicate(survey: Survey) {
    setBusy('duplicating')
    setActionError(null)
    try {
      const newId = await duplicateSurvey(survey.id)
      navigate(`/surveys/${newId}/edit`)
    } catch (error) {
      setActionError(toAppError(error).message)
      setBusy(null)
    }
  }

  // --- Non-editable states -------------------------------------------------

  if (loading) return <LoadingMessage text="Loading survey..." />

  if (load?.kind === 'not_found' || load?.kind === 'error') {
    return (
      <div className="space-y-4 text-center">
        <p role="alert" className="text-lg text-slate-800">
          {load.kind === 'not_found' ? 'Survey not found.' : load.message}
        </p>
        <Link to="/dashboard" className={buttonSecondary}>
          Back to Dashboard
        </Link>
      </div>
    )
  }

  if (load?.kind === 'not_draft') {
    return (
      <div className="mx-auto max-w-xl space-y-4 rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold text-slate-900">{load.survey.title}</h1>
          <StatusBadge status={load.survey.status} />
        </div>
        <p className="text-slate-700">
          Only draft surveys can be edited. Duplicate it to make an editable copy.
        </p>
        {actionError && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">
            {actionError}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => handleDuplicate(load.survey)}
            disabled={busy !== null}
            className={buttonPrimary}
          >
            {busy === 'duplicating' ? 'Duplicating...' : 'Duplicate'}
          </button>
          <Link to="/dashboard" className={buttonSecondary}>
            Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  // --- Editor --------------------------------------------------------------

  const status =
    busy === 'saving'
      ? 'Saving...'
      : busy === 'activating'
        ? 'Activating...'
        : dirty
          ? 'Unsaved changes'
          : justSaved
            ? 'Saved'
            : ''

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        handleSave()
      }}
      className="space-y-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">
          {routeId ? 'Edit Survey' : 'New Survey'}
        </h1>
        <p role="status" className="text-sm text-slate-600">
          {status}
        </p>
      </div>

      {actionError && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">
          {actionError}
        </p>
      )}

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="space-y-1">
          <label htmlFor={fieldIds.title} className={labelClass}>
            Survey Title
          </label>
          <input
            id={fieldIds.title}
            value={draft.title}
            onChange={(e) => dispatch({ type: 'setTitle', value: e.target.value })}
            className={inputClass}
            {...(errors[fieldIds.title]
              ? { 'aria-invalid': true, 'aria-describedby': `${fieldIds.title}-error` }
              : {})}
          />
          {errors[fieldIds.title] && (
            <p id={`${fieldIds.title}-error`} className="text-sm font-medium text-red-700">
              {errors[fieldIds.title]}
            </p>
          )}
        </div>
        <div className="space-y-1">
          <label htmlFor="survey-description" className={labelClass}>
            Description (optional)
          </label>
          <textarea
            id="survey-description"
            rows={2}
            value={draft.description}
            onChange={(e) => dispatch({ type: 'setDescription', value: e.target.value })}
            className={inputClass}
          />
        </div>
      </section>

      {draft.questions.map((question, index) => (
        <QuestionEditor
          key={question.key}
          question={question}
          index={index}
          total={draft.questions.length}
          errors={errors}
          dispatch={dispatch}
          onTypeChange={(type) => requestTypeChange(question, type)}
          onDelete={() => requestDelete(question)}
        />
      ))}

      <div className="space-y-1">
        <button
          id={fieldIds.questions}
          type="button"
          onClick={() => dispatch({ type: 'addQuestion' })}
          className={buttonSecondary}
        >
          + Add Question
        </button>
        {errors[fieldIds.questions] && (
          <p className="text-sm font-medium text-red-700">{errors[fieldIds.questions]}</p>
        )}
      </div>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-slate-200 bg-white/95 px-4 py-3">
        <button type="submit" disabled={busy !== null} className={buttonSecondary}>
          {busy === 'saving' ? 'Saving...' : 'Save Draft'}
        </button>
        <button
          type="button"
          onClick={handleActivate}
          disabled={busy !== null}
          className={buttonPrimary}
        >
          {busy === 'activating' ? 'Activating...' : 'Activate'}
        </button>
        <Link to="/dashboard" className="ml-auto text-slate-700 underline">
          Back to Dashboard
        </Link>
      </div>

      <ConfirmDialog
        open={pendingTypeChange !== null}
        title="Change question type?"
        confirmLabel="Change Type"
        onConfirm={() => {
          if (pendingTypeChange) {
            dispatch({
              type: 'setQuestionType',
              questionKey: pendingTypeChange.questionKey,
              value: pendingTypeChange.type,
            })
          }
          setPendingTypeChange(null)
        }}
        onCancel={() => setPendingTypeChange(null)}
      >
        <p>This question's current choices will be replaced.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this question?"
        confirmLabel="Delete Question"
        danger
        onConfirm={() => {
          if (pendingDelete) dispatch({ type: 'removeQuestion', questionKey: pendingDelete })
          setPendingDelete(null)
        }}
        onCancel={() => setPendingDelete(null)}
      >
        <p>The question and its choices will be removed from this draft.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={pendingActivate !== null}
        busy={busy === 'activating'}
        title="Activate survey?"
        confirmLabel="Activate"
        onConfirm={confirmActivate}
        onCancel={() => setPendingActivate(null)}
      >
        <p>
          Activating "{draft.title.trim()}" will close "{pendingActivate?.current}". Continue?
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title="Leave without saving?"
        confirmLabel="Leave"
        danger
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
      >
        <p>You have unsaved changes. If you leave now, they will be lost.</p>
      </ConfirmDialog>
    </form>
  )
}
