import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth-context'
import LoadingMessage from './LoadingMessage'

/** Renders the nested instructor routes only when signed in. */
export default function ProtectedRoute() {
  const { session, loading } = useAuth()
  const location = useLocation()

  // Wait for the saved session, so a refresh doesn't flash the login page.
  if (loading) return <LoadingMessage text="Loading..." />

  if (!session) {
    // Remember where the instructor was going, so login can send them back.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
