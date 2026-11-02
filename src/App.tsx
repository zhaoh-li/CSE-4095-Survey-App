import { lazy, Suspense } from 'react'
import {
  createBrowserRouter,
  Outlet,
  RouterProvider,
  useLocation,
  useParams,
} from 'react-router-dom'
import AuthProvider from './components/AuthProvider'
import InstructorLayout from './components/InstructorLayout'
import LoadingMessage from './components/LoadingMessage'
import ProtectedRoute from './components/ProtectedRoute'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import NotFoundPage from './pages/NotFoundPage'
import StudentSurveyPage from './pages/StudentSurveyPage'

// Instructor pages load on demand, so students on phones never download the
// editor, Recharts or the QR code library.
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const EditorPage = lazy(() => import('./pages/EditorPage'))
const PresentPage = lazy(() => import('./pages/PresentPage'))
const ResultsPage = lazy(() => import('./pages/ResultsPage'))

function RootLayout() {
  return (
    <Suspense fallback={<LoadingMessage text="Loading..." />}>
      <Outlet />
    </Suspense>
  )
}

/**
 * Gives each survey its own editor instance, so opening another survey starts
 * fresh. After a new survey's first save, the editor passes NEW_EDITOR_KEY in
 * the navigation state to keep the same instance.
 */
function EditorRoute() {
  const { id } = useParams()
  const location = useLocation()
  const editorKey = (location.state as { editorKey?: string } | null)?.editorKey
  return <EditorPage key={editorKey ?? id ?? 'new'} />
}

// A data router, so the editor can warn about unsaved changes on in-app links.
const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: '/', element: <LandingPage /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/s/:slug', element: <StudentSurveyPage /> },
      {
        // Instructor pages: signed-in only
        element: <ProtectedRoute />,
        children: [
          {
            element: <InstructorLayout />,
            children: [
              { path: '/dashboard', element: <DashboardPage /> },
              { path: '/surveys/new', element: <EditorRoute /> },
              { path: '/surveys/:id/edit', element: <EditorRoute /> },
              { path: '/surveys/:id/results', element: <ResultsPage /> },
            ],
          },
          // Present is shown on a projector, so it has no header (UI.md §6).
          { path: '/surveys/:id/present', element: <PresentPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  )
}
