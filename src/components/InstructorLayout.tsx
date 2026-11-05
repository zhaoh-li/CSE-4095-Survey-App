import { Link, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth-context'
import { buttonSecondary } from '../lib/styles'

/** Header with the signed-in instructor and Logout, used by the instructor pages. */
export default function InstructorLayout() {
  const { session } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-slate-50">
      <a
        href="#main"
        onClick={(event) => {
          // Move keyboard focus without changing the URL.
          event.preventDefault()
          document.getElementById('main')?.focus()
        }}
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-10 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:ring-4 focus:ring-slate-400"
      >
        Skip to main content
      </a>
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
            {/* A page, so the editor can warn about unsaved changes first (D27). */}
            <button type="button" onClick={() => navigate('/logout')} className={buttonSecondary}>
              Logout
            </button>
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto max-w-5xl px-4 py-6 focus:outline-none">
        <Outlet />
      </main>
    </div>
  )
}
