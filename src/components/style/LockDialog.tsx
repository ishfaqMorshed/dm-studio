import { useState } from 'react'
import { AlertTriangle, Loader2, Lock } from 'lucide-react'
import { btnPrimary, btnSecondary, hintCls, inputCls, labelCls } from './classes'
import { Modal } from './Modal'
import type { StyleCardIssues } from './styleCardSchema'

interface Props {
  open: boolean
  version: number
  clientName: string
  issues: StyleCardIssues
  /** Unsaved form edits are written before locking; say so. */
  willSaveFirst: boolean
  busy: boolean
  onCancel: () => void
  onConfirm: (note: string) => void
}

/** Confirms a lock: note, what it means, and anything the schema check found. */
export function LockDialog({ open, version, clientName, issues, willSaveFirst, busy, onCancel, onConfirm }: Props) {
  const [note, setNote] = useState('')
  const blocked = issues.blocking.length > 0

  return (
    <Modal
      open={open}
      onClose={onCancel}
      closeDisabled={busy}
      title={`Lock v${version} for ${clientName}`}
      description="Locked versions cannot be edited. To change anything later, start a new version."
      footer={
        <>
          <button type="button" onClick={onCancel} disabled={busy} className={btnSecondary}>
            Keep editing
          </button>
          <button
            type="button"
            onClick={() => onConfirm(note)}
            disabled={busy || blocked}
            title={blocked ? 'Fix the blocking issue first' : undefined}
            className={btnPrimary}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            {willSaveFirst ? `Save and lock v${version}` : `Lock v${version}`}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {issues.blocking.length > 0 && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
          >
            <p className="mb-1 flex items-center gap-1.5 font-medium">
              <AlertTriangle className="h-4 w-4" />
              Cannot lock yet
            </p>
            <ul className="list-disc space-y-0.5 pl-5">
              {issues.blocking.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}
        {issues.warnings.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            <p className="mb-1 font-medium">Worth a second look</p>
            <ul className="list-disc space-y-0.5 pl-5">
              {issues.warnings.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <label htmlFor="lock-note" className={labelCls}>
            Note (optional)
          </label>
          <textarea
            id="lock-note"
            data-autofocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={busy}
            rows={3}
            placeholder="What changed in this version, e.g. added rust accent, banned gradients"
            className={`${inputCls} resize-y`}
          />
          <p className={hintCls}>Shown in the versions list so the team knows why v{version} exists.</p>
        </div>
        <p className="text-xs text-neutral-500">
          After locking, every new card for {clientName} snapshots v{version}. Cards already generated keep the version
          they were made with.
        </p>
      </div>
    </Modal>
  )
}
