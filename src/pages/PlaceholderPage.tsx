import { Link } from 'react-router-dom'
import { buttonSecondary } from '../lib/styles'

/** Stands in for pages built in later phases, so dashboard links already work. */
export default function PlaceholderPage({ title, phase }: { title: string; phase: number }) {
  return (
    <div className="mx-auto max-w-xl space-y-4 p-8 text-center">
      <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
      <p className="text-slate-600">This page is coming in Phase {phase}.</p>
      <Link to="/dashboard" className={buttonSecondary}>
        Back to Dashboard
      </Link>
    </div>
  )
}
