import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { btnDanger, btnPrimary, btnSecondary } from './classes'
import { Modal } from './Modal'

interface Props {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  cancelLabel?: string
  /** `danger` for destructive confirms (discard, rotate a link). */
  tone?: 'primary' | 'danger'
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** Two-button confirm. The body should say what happens and what cannot be undone. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'primary',
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      closeDisabled={busy}
      title={title}
      size="sm"
      footer={
        <>
          <button type="button" onClick={onCancel} disabled={busy} className={btnSecondary} data-autofocus>
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={tone === 'danger' ? btnDanger : btnPrimary}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-sm text-neutral-700 dark:text-neutral-300">{children}</div>
    </Modal>
  )
}
