import { useEffect, useId, useRef, type ReactNode } from 'react'
import { buttonDanger, buttonPrimary, buttonSecondary } from '../lib/styles'

interface ConfirmDialogProps {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  /** Red confirm button for destructive actions. */
  danger?: boolean
  /** Disables both buttons while the action runs. */
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * A modal confirmation built on the browser's <dialog>, which keeps keyboard
 * focus inside it and closes on Escape. Cancel comes first so it gets focus.
 */
export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Escape key: let React state decide whether the dialog closes.
        event.preventDefault()
        if (!busy) onCancel()
      }}
      className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-xl p-6 shadow-xl backdrop:bg-slate-900/50"
    >
      <h2 id={titleId} className="text-lg font-bold text-slate-900">
        {title}
      </h2>
      <div className="mt-3 space-y-2 text-slate-700">{children}</div>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button type="button" onClick={onCancel} disabled={busy} className={buttonSecondary}>
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={danger ? buttonDanger : buttonPrimary}
        >
          {busy ? 'Working...' : confirmLabel}
        </button>
      </div>
    </dialog>
  )
}
