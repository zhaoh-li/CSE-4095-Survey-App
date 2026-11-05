import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import LoadingMessage from '../components/LoadingMessage'
import { useAuth } from '../lib/auth-context'

/**
 * Logout is a page, so leaving the editor with unsaved changes asks first
 * (D22, D27). Arriving here signs out and goes to the login page.
 */
export default function LogoutPage() {
  const { signOut } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    signOut().then(() => navigate('/login', { replace: true }))
  }, [signOut, navigate])

  return <LoadingMessage text="Logging out..." />
}
