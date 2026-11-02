import { BrowserRouter, Route, Routes } from 'react-router-dom'
import AuthProvider from './components/AuthProvider'
import InstructorLayout from './components/InstructorLayout'
import ProtectedRoute from './components/ProtectedRoute'
import DashboardPage from './pages/DashboardPage'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import NotFoundPage from './pages/NotFoundPage'
import PlaceholderPage from './pages/PlaceholderPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />

          {/* Instructor pages: signed-in only */}
          <Route element={<ProtectedRoute />}>
            <Route element={<InstructorLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route
                path="/surveys/new"
                element={<PlaceholderPage title="New Survey" phase={5} />}
              />
              <Route
                path="/surveys/:id/edit"
                element={<PlaceholderPage title="Edit Survey" phase={5} />}
              />
              <Route
                path="/surveys/:id/results"
                element={<PlaceholderPage title="Survey Results" phase={9} />}
              />
            </Route>
            {/* Present is shown on a projector, so it has no header (UI.md §6). */}
            <Route
              path="/surveys/:id/present"
              element={<PlaceholderPage title="Present Survey" phase={6} />}
            />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
