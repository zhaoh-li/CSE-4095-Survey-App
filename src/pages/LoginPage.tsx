import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import LoadingMessage from '../components/LoadingMessage'
import { useAuth } from '../lib/auth-context'
import { buttonPrimary, inputClass, labelClass } from '../lib/styles'

export default function LoginPage() {
  const { session, loading, signIn } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard'

  if (loading) return <LoadingMessage text="Loading..." />

  // Already signed in (or just signed in): go to the page they wanted.
  if (session) return <Navigate to={from} replace />

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await signIn(email.trim(), password)
      // The session update re-renders this page, which redirects above.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log in. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-5 rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <h1 className="text-2xl font-bold text-slate-900">Instructor Login</h1>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        )}

        <div className="space-y-1">
          <label htmlFor="email" className={labelClass}>
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className={labelClass}>
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </div>

        <button type="submit" disabled={submitting} className={`${buttonPrimary} w-full`}>
          {submitting ? 'Logging in...' : 'Log In'}
        </button>
      </form>
    </main>
  )
}
