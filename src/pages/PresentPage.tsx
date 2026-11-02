import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ConfirmDialog from '../components/ConfirmDialog'
import LoadingMessage from '../components/LoadingMessage'
import { toAppError } from '../lib/errors'
import { fileSafe } from '../lib/format'
import { buttonDanger, buttonPrimary, buttonSecondary } from '../lib/styles'
import { closeSurvey, getResponseCount, getSurvey } from '../lib/surveys'
import type { Survey } from '../lib/types'

/** D12: how often the response count refreshes while the page is open. */
const COUNT_REFRESH_MS = 5000

type LoadState =
  | { forId: string; kind: 'ready'; survey: Survey }
  | { forId: string; kind: 'not_found' }
  | { forId: string; kind: 'error'; message: string }

export default function PresentPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()

  const [load, setLoad] = useState<LoadState | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [count, setCount] = useState<number | null>(null)
  const [confirmClose, setConfirmClose] = useState(false)
  const [closing, setClosing] = useState(false)
  const [closeError, setCloseError] = useState<string | null>(null)

  const survey = load?.forId === id && load.kind === 'ready' ? load.survey : null
  const isActive = survey?.status === 'active' && survey.public_slug !== null
  const slug = survey?.public_slug ?? ''
  // The student link uses this site's own address, so it follows the deployment.
  const publicUrl = `${window.location.origin}/s/${slug}`
  const displayUrl = `${window.location.host}/s/${slug}`

  useEffect(() => {
    let current = true
    getSurvey(id)
      .then((found) => {
        if (!current) return
        setLoad(
          found ? { forId: id, kind: 'ready', survey: found } : { forId: id, kind: 'not_found' },
        )
      })
      .catch((error) => {
        if (current) setLoad({ forId: id, kind: 'error', message: toAppError(error).message })
      })
    return () => {
      current = false
    }
  }, [id])

  // Large QR code so it stays sharp on a projector.
  useEffect(() => {
    if (!isActive) return
    let current = true
    QRCode.toDataURL(publicUrl, { width: 1024, margin: 2, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (current) setQrDataUrl(url)
      })
      .catch((error) => console.error(error))
    return () => {
      current = false
    }
  }, [isActive, publicUrl])

  // D12: refresh the response count every 5 seconds; stop when the page closes.
  useEffect(() => {
    if (!isActive) return
    let current = true
    const refresh = () =>
      getResponseCount(id)
        .then((n) => {
          if (current) setCount(n)
        })
        .catch((error) => console.error(error)) // keep showing the last count
    refresh()
    const timer = window.setInterval(refresh, COUNT_REFRESH_MS)
    return () => {
      current = false
      window.clearInterval(timer)
    }
  }, [id, isActive])

  async function handleClose() {
    setClosing(true)
    setCloseError(null)
    try {
      await closeSurvey(id)
      navigate(`/surveys/${id}/results`)
    } catch (error) {
      setCloseError(toAppError(error).message)
      setConfirmClose(false)
      setClosing(false)
    }
  }

  if (!load || load.forId !== id) return <LoadingMessage text="Loading survey..." />

  if (load.kind !== 'ready' || !survey || !isActive) {
    const message =
      load.kind === 'error'
        ? load.message
        : load.kind === 'not_found'
          ? 'Survey not found.'
          : 'This survey is not active, so students cannot open it.'
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-4">
        <div className="space-y-4 text-center">
          {survey && <h1 className="text-2xl font-bold text-slate-900">{survey.title}</h1>}
          <p role="alert" className="text-lg text-slate-700">
            {message}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {survey && (
              <Link to={`/surveys/${id}/results`} className={buttonSecondary}>
                View Results
              </Link>
            )}
            <Link to="/dashboard" className={buttonSecondary}>
              Back to Dashboard
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white px-4 py-6 text-center">
      <h1 className="text-3xl font-bold text-slate-900 sm:text-5xl">{survey.title}</h1>

      {qrDataUrl ? (
        <img
          src={qrDataUrl}
          alt={`QR code for ${displayUrl}`}
          className="aspect-square w-[min(60vh,90vw)] [image-rendering:pixelated]"
        />
      ) : (
        <div className="flex aspect-square w-[min(60vh,90vw)] items-center justify-center bg-slate-100 text-slate-500">
          Generating QR code...
        </div>
      )}

      <p className="font-mono text-2xl font-semibold break-all text-slate-900 sm:text-4xl">
        {displayUrl}
      </p>

      <p role="status" className="text-2xl text-slate-700 sm:text-3xl">
        Responses: <span className="font-bold text-slate-900">{count ?? '…'}</span>
      </p>

      {closeError && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">
          {closeError}
        </p>
      )}

      <div className="flex flex-wrap justify-center gap-3">
        <Link to={`/surveys/${id}/results`} className={buttonPrimary}>
          View Results
        </Link>
        {qrDataUrl && (
          <a
            href={qrDataUrl}
            download={`${fileSafe(survey.title)}-qr.png`}
            className={buttonSecondary}
          >
            Download QR Code
          </a>
        )}
        <button type="button" onClick={() => setConfirmClose(true)} className={buttonDanger}>
          Close Survey
        </button>
      </div>

      <Link to="/dashboard" className="text-sm text-slate-500 underline">
        Back to Dashboard
      </Link>

      <ConfirmDialog
        open={confirmClose}
        busy={closing}
        title={`Close "${survey.title}"?`}
        confirmLabel="Close Survey"
        danger
        onConfirm={handleClose}
        onCancel={() => setConfirmClose(false)}
      >
        <p>Students will no longer be able to submit responses.</p>
      </ConfirmDialog>
    </main>
  )
}
