import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth-context'
import { buttonPrimary } from '../lib/styles'
import { usePageTitle } from '../lib/use-page-title'

export default function LandingPage() {
  const { session } = useAuth()
  usePageTitle(null)

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-slate-900">Classroom Survey</h1>
        <p className="mt-4 text-lg text-slate-600">Quick in-class understanding checks</p>
        <Link
          to={session ? '/dashboard' : '/login'}
          className={`${buttonPrimary} mt-8 px-6 py-3 text-lg`}
        >
          {session ? 'Go to Dashboard' : 'Instructor Login'}
        </Link>
      </div>
    </main>
  )
}
