import { Link, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth-context'
import { buttonSecondary } from '../lib/styles'

/** Header with the signed-in instructor and Logout, used by the instructor pages. */
export default function InstructorLayout() {
  const { session, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link
            to="/dashboard"
            className="text-xl font-bold text-slate-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-300"
          >
            Classroom Survey
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600">{session?.user.email}</span>
            <button type="button" onClick={handleLogout} className={buttonSecondary}>
              Logout
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
