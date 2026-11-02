import { Link } from 'react-router-dom'
import { buttonSecondary } from '../lib/styles'

export default function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="space-y-4 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Page not found.</h1>
        <Link to="/" className={buttonSecondary}>
          Go to home page
        </Link>
      </div>
    </main>
  )
}
