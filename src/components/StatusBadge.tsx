import { STATUS_LABELS, type SurveyStatus } from '../lib/types'

// The label is always shown as text, so status never relies on colour alone (UI.md §13).
const STYLES: Record<SurveyStatus, string> = {
  draft: 'bg-slate-100 text-slate-800 ring-slate-300',
  active: 'bg-green-100 text-green-900 ring-green-600',
  closed: 'bg-amber-100 text-amber-900 ring-amber-500',
  archived: 'bg-slate-200 text-slate-700 ring-slate-400',
}

export default function StatusBadge({ status }: { status: SurveyStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-3 py-0.5 text-sm font-medium ring-1 ring-inset ${STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}
