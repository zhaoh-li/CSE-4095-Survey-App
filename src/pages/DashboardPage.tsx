import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ConfirmDialog from '../components/ConfirmDialog'
import LoadingMessage from '../components/LoadingMessage'
import SurveyCard from '../components/SurveyCard'
import { toLocalDateString } from '../lib/dates'
import { toAppError } from '../lib/errors'
import type { SurveyAction } from '../lib/survey-actions'
import { buttonPrimary, buttonSecondary, inputClass, labelClass } from '../lib/styles'
import {
  activateSurvey,
  archiveSurvey,
  closeSurvey,
  deleteSurvey,
  duplicateSurvey,
  listSurveys,
  unarchiveSurvey,
} from '../lib/surveys'
import { STATUS_LABELS, type SurveyStatus, type SurveyWithCount } from '../lib/types'
import { usePageTitle } from '../lib/use-page-title'

type StatusFilter = 'all' | SurveyStatus

/** An action waiting for the instructor to confirm it. */
type Pending =
  | { kind: 'activate'; survey: SurveyWithCount; current: SurveyWithCount }
  | { kind: 'close' | 'archive' | 'delete'; survey: SurveyWithCount }

type LoadResult = { ok: true; surveys: SurveyWithCount[] } | { ok: false; error: string }

async function fetchSurveys(): Promise<LoadResult> {
  try {
    return { ok: true, surveys: await listSurveys() }
  } catch (error) {
    return { ok: false, error: toAppError(error).message }
  }
}

export default function DashboardPage() {
  const navigate = useNavigate()
  usePageTitle('Dashboard')

  const [surveys, setSurveys] = useState<SurveyWithCount[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const applyLoadResult = useCallback((result: LoadResult) => {
    if (result.ok) {
      setSurveys(result.surveys)
      setLoadError(null)
    } else {
      setLoadError(result.error)
    }
  }, [])

  /** Reloads the list, e.g. after an action. */
  const load = useCallback(async () => {
    applyLoadResult(await fetchSurveys())
  }, [applyLoadResult])

  useEffect(() => {
    // Ignore the result if the page was left before it arrived.
    let current = true
    fetchSurveys().then((result) => {
      if (current) applyLoadResult(result)
    })
    return () => {
      current = false
    }
  }, [applyLoadResult])

  // Filters run in the browser: one instructor's surveys are a short list (D16, D21).
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (surveys ?? []).filter((survey) => {
      if (statusFilter === 'all' ? survey.status === 'archived' : survey.status !== statusFilter) {
        return false
      }
      if (term && !survey.title.toLowerCase().includes(term)) return false
      const created = toLocalDateString(survey.created_at)
      if (fromDate && created < fromDate) return false
      if (toDate && created > toDate) return false
      return true
    })
  }, [surveys, search, statusFilter, fromDate, toDate])

  /** Runs an action on one survey, showing any error in the banner. Returns true on success. */
  async function run(survey: SurveyWithCount, action: () => Promise<void>): Promise<boolean> {
    setBusyId(survey.id)
    setActionError(null)
    try {
      await action()
      return true
    } catch (error) {
      setActionError(toAppError(error).message)
      await load() // the list may be out of date, e.g. another tab changed it
      return false
    } finally {
      setBusyId(null)
    }
  }

  async function activate(survey: SurveyWithCount) {
    // D20: activating from the dashboard opens the Present page.
    const ok = await run(survey, () => activateSurvey(survey.id).then(() => undefined))
    if (ok) navigate(`/surveys/${survey.id}/present`)
  }

  async function handleAction(action: SurveyAction, survey: SurveyWithCount) {
    switch (action) {
      case 'activate':
      case 'reopen': {
        // D11: confirm before closing a survey students may still be answering.
        const current = surveys?.find((s) => s.status === 'active' && s.id !== survey.id)
        if (current) setPending({ kind: 'activate', survey, current })
        else await activate(survey)
        break
      }
      case 'close':
      case 'archive':
      case 'delete':
        setPending({ kind: action, survey })
        break
      case 'unarchive':
        if (await run(survey, () => unarchiveSurvey(survey.id))) await load()
        break
      case 'duplicate': {
        let newId = ''
        const ok = await run(survey, async () => {
          newId = await duplicateSurvey(survey.id)
        })
        if (ok) navigate(`/surveys/${newId}/edit`)
        break
      }
    }
  }

  async function confirmPending() {
    if (!pending) return
    const { kind, survey } = pending
    if (kind === 'activate') {
      await activate(survey)
      setPending(null)
      return
    }
    const action = { close: closeSurvey, archive: archiveSurvey, delete: deleteSurvey }[kind]
    if (await run(survey, () => action(survey.id))) await load()
    setPending(null)
  }

  const hasFilters = search !== '' || statusFilter !== 'all' || fromDate !== '' || toDate !== ''

  function clearFilters() {
    setSearch('')
    setStatusFilter('all')
    setFromDate('')
    setToDate('')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <Link to="/surveys/new" className={buttonPrimary}>
          New Survey
        </Link>
      </div>

      <section aria-label="Filter surveys" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <label htmlFor="search" className={labelClass}>
            Search
          </label>
          <input
            id="search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Survey title"
            className={inputClass}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="status" className={labelClass}>
            Status
          </label>
          <select
            id="status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className={inputClass}
          >
            <option value="all">All (except archived)</option>
            {(Object.keys(STATUS_LABELS) as SurveyStatus[]).map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="from" className={labelClass}>
            Created from
          </label>
          <input
            id="from"
            type="date"
            value={fromDate}
            max={toDate || undefined}
            onChange={(e) => setFromDate(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="to" className={labelClass}>
            Created to
          </label>
          <input
            id="to"
            type="date"
            value={toDate}
            min={fromDate || undefined}
            onChange={(e) => setToDate(e.target.value)}
            className={inputClass}
          />
        </div>
      </section>

      {actionError && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">
          {actionError}
        </p>
      )}

      {loadError ? (
        <div role="alert" className="space-y-3 rounded-lg bg-red-50 p-4 text-red-800">
          <p>{loadError}</p>
          <button type="button" onClick={load} className={buttonSecondary}>
            Try again
          </button>
        </div>
      ) : surveys === null ? (
        <LoadingMessage text="Loading surveys..." />
      ) : surveys.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-lg text-slate-700">You have not created any surveys yet.</p>
          <Link to="/surveys/new" className={`${buttonPrimary} mt-4`}>
            Create Your First Survey
          </Link>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-lg text-slate-700">No surveys match your search.</p>
          {hasFilters && (
            <button type="button" onClick={clearFilters} className={`${buttonSecondary} mt-4`}>
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <ul className="space-y-4">
          {visible.map((survey) => (
            <li key={survey.id}>
              <SurveyCard survey={survey} busy={busyId === survey.id} onAction={handleAction} />
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pending !== null}
        busy={busyId !== null}
        {...dialogContent(pending)}
        onConfirm={confirmPending}
        onCancel={() => setPending(null)}
      />
    </div>
  )
}

/** Title, message and button for each confirmation (UI.md §11, D9, D11). */
function dialogContent(pending: Pending | null) {
  if (!pending) return { title: '', confirmLabel: '', children: null }
  const { survey } = pending
  const name = `"${survey.title}"`

  switch (pending.kind) {
    case 'activate':
      return {
        title: 'Activate survey?',
        confirmLabel: 'Activate',
        children: (
          <p>
            Activating {name} will close "{pending.current.title}". Continue?
          </p>
        ),
      }
    case 'close':
      return {
        title: `Close ${name}?`,
        confirmLabel: 'Close Survey',
        danger: true,
        children: <p>Students will no longer be able to submit responses.</p>,
      }
    case 'archive':
      return {
        title: `Archive ${name}?`,
        confirmLabel: 'Archive',
        children: (
          <p>
            Archived surveys are hidden from the main list. You can still view their results and
            unarchive them later.
          </p>
        ),
      }
    case 'delete': {
      const count = survey.response_count
      return {
        title: `Delete ${name}?`,
        confirmLabel: 'Delete',
        danger: true,
        children:
          count === 0 ? (
            <p>This will permanently delete the survey and all of its responses.</p>
          ) : (
            <>
              <p className="font-semibold text-red-800">
                This survey has {count} {count === 1 ? 'response' : 'responses'}. Deleting it
                permanently removes the survey and all of its responses. This cannot be undone.
              </p>
              {survey.status === 'closed' && <p>To keep the results, archive it instead.</p>}
            </>
          ),
      }
    }
  }
}
