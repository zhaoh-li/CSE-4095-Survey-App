import { Link } from 'react-router-dom'
import { formatDate } from '../lib/dates'
import { plural } from '../lib/format'
import {
  ACTION_LABELS,
  ACTION_PATHS,
  ACTIONS_BY_STATUS,
  type SurveyAction,
} from '../lib/survey-actions'
import { buttonSecondary } from '../lib/styles'
import type { SurveyWithCount } from '../lib/types'
import StatusBadge from './StatusBadge'

interface SurveyCardProps {
  survey: SurveyWithCount
  /** Disables the action buttons while an action on this survey runs. */
  busy: boolean
  onAction: (action: SurveyAction, survey: SurveyWithCount) => void
}

export default function SurveyCard({ survey, busy, onAction }: SurveyCardProps) {
  const responses = plural(survey.response_count, 'response')

  return (
    <article
      className={`rounded-xl border bg-white p-5 shadow-sm ${
        survey.status === 'active' ? 'border-green-600 border-l-8' : 'border-slate-200'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">{survey.title}</h2>
        <StatusBadge status={survey.status} />
      </div>
      <p className="mt-1 text-sm text-slate-600">
        Created: {formatDate(survey.created_at)} · {responses}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {ACTIONS_BY_STATUS[survey.status].map((action) => {
          const path = ACTION_PATHS[action]
          const label = ACTION_LABELS[action]
          return path ? (
            <Link key={action} to={path(survey.id)} className={buttonSecondary}>
              {label}
            </Link>
          ) : (
            <button
              key={action}
              type="button"
              disabled={busy}
              onClick={() => onAction(action, survey)}
              className={buttonSecondary}
            >
              {label}
            </button>
          )
        })}
      </div>
    </article>
  )
}
