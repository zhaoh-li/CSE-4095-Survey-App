import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import LoadingMessage from '../components/LoadingMessage'
import ResultsChart from '../components/ResultsChart'
import StatusBadge from '../components/StatusBadge'
import { buildSurveyCsv, csvFileName } from '../lib/csv'
import { toLocalDateTimeString } from '../lib/dates'
import { downloadTextFile } from '../lib/download'
import { toAppError } from '../lib/errors'
import { fetchSurveyExport } from '../lib/export'
import { formatPercent, plural } from '../lib/format'
import { buttonPrimary, buttonSecondary } from '../lib/styles'
import { getSurveyResults } from '../lib/surveys'
import type { SurveyResults } from '../lib/types'

type LoadResult = { ok: true; results: SurveyResults | null } | { ok: false; error: string }

async function fetchResults(id: string): Promise<LoadResult> {
  try {
    return { ok: true, results: await getSurveyResults(id) }
  } catch (error) {
    return { ok: false, error: toAppError(error).message }
  }
}

export default function ResultsPage() {
  const { id = '' } = useParams()

  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [results, setResults] = useState<SurveyResults | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const apply = useCallback(
    (result: LoadResult) => {
      setLoadedFor(id)
      if (result.ok) {
        setResults(result.results)
        setError(null)
      } else {
        setError(result.error) // keep showing the last results
      }
    },
    [id],
  )

  useEffect(() => {
    let current = true
    fetchResults(id).then((result) => {
      if (current) apply(result)
    })
    return () => {
      current = false
    }
  }, [id, apply])

  async function refresh() {
    setRefreshing(true)
    apply(await fetchResults(id))
    setRefreshing(false)
  }

  /** D14, D26: one survey's responses as a CSV download. */
  async function exportCsv() {
    setExporting(true)
    setExportError(null)
    try {
      const { survey, responses } = await fetchSurveyExport(id)
      const csv = buildSurveyCsv(survey.title, survey.questions, responses, toLocalDateTimeString)
      downloadTextFile(csvFileName(survey.title, new Date()), csv)
    } catch (error) {
      setExportError(toAppError(error).message)
    } finally {
      setExporting(false)
    }
  }

  if (loadedFor !== id) return <LoadingMessage text="Loading results..." />

  if (!results) {
    return (
      <div className="space-y-4 text-center">
        <p role="alert" className="text-lg text-slate-800">
          {error ?? 'Survey not found.'}
        </p>
        <Link to="/dashboard" className={buttonSecondary}>
          Back to Dashboard
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">{results.title}</h1>
          <StatusBadge status={results.status} />
        </div>
        <p className="text-lg text-slate-700">{plural(results.response_count, 'response')}</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={refresh} disabled={refreshing} className={buttonPrimary}>
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
        <button type="button" onClick={exportCsv} disabled={exporting} className={buttonSecondary}>
          {exporting ? 'Exporting...' : 'Export CSV'}
        </button>
        {results.status === 'active' && (
          <Link to={`/surveys/${id}/present`} className={buttonSecondary}>
            Present QR
          </Link>
        )}
        <Link to="/dashboard" className={buttonSecondary}>
          Back to Dashboard
        </Link>
      </div>

      {[error, exportError].map(
        (message) =>
          message && (
            <p key={message} role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">
              {message}
            </p>
          ),
      )}

      {results.response_count === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-lg text-slate-700">No responses yet.</p>
          <p className="mt-1 text-slate-600">Display the QR code so students can join.</p>
        </div>
      )}

      {results.questions.map((question, index) => (
        <section
          key={question.question_id}
          aria-labelledby={`result-${question.question_id}`}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="space-y-1">
            <h2
              id={`result-${question.question_id}`}
              className="text-lg font-semibold text-slate-900"
            >
              {index + 1}. {question.question_text}
            </h2>
            <p className="text-sm text-slate-600">
              {question.response_count === 0
                ? 'No responses yet'
                : plural(question.response_count, 'answer')}
            </p>
          </div>

          {question.response_count > 0 && <ResultsChart choices={question.choices} />}

          <table className="w-full text-left">
            <caption className="sr-only">Results for question {index + 1}</caption>
            <thead>
              <tr className="border-b border-slate-200 text-sm text-slate-600">
                <th scope="col" className="py-2 font-medium">
                  Choice
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Count
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Percent
                </th>
              </tr>
            </thead>
            <tbody>
              {question.choices.map((choice) => (
                <tr key={choice.choice_id} className="border-b border-slate-100">
                  <td className="py-2 text-slate-900">{choice.choice_text}</td>
                  <td className="py-2 text-right text-slate-900 tabular-nums">{choice.count}</td>
                  <td className="py-2 text-right text-slate-900 tabular-nums">
                    {formatPercent(choice.percentage)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  )
}
