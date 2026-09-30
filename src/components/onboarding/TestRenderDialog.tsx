import { Loader2, Sparkles } from 'lucide-react'
import type { Client, ClientReference, StyleCard } from '../../lib/types'
import { btnPrimary, btnSecondary } from '../style/classes'
import { Modal } from '../style/Modal'
import { COST_SUFFIX, TEST_RENDER_COST_LABEL } from './costs'
import { RefThumb } from './RefThumb'

/**
 * Confirms the paid test render: what will be printed, which references go in, what it costs,
 * and that nothing reaches the client. `mode` 'generate' is the same dialog for a card already
 * at review (approve only).
 */
export function TestRenderDialog({
  open,
  client,
  draft,
  read,
  mode,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean
  client: Client
  draft: StyleCard
  /** The ticked images in profiler order; the newest 3 are the render's references. */
  read: ClientReference[]
  mode: 'render' | 'generate'
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const refs = read.slice(0, 3)
  const garment = client.garment_colors[0] ?? 'black'
  return (
    <Modal
      open={open}
      onClose={onCancel}
      closeDisabled={busy}
      title={mode === 'render' ? `Test render with draft v${draft.version}` : `Generate with draft v${draft.version}`}
      description={`One new design in this look, generated with draft v${draft.version}. Nothing is locked.`}
      footer={
        <>
          <button type="button" onClick={onCancel} disabled={busy} className={btnSecondary}>
            Not now
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} className={btnPrimary} data-autofocus>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
            {mode === 'render' ? `Render for ${TEST_RENDER_COST_LABEL}` : `Generate for ${TEST_RENDER_COST_LABEL}`}
          </button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">Printed text</p>
          <p className="font-display text-lg font-semibold uppercase tracking-tight">{client.name}</p>
          <p className="text-xs text-neutral-500">
            The headline is always upper-cased by the backend for a test render; every real brief follows your text-case
            rule.
          </p>
          <p className="mt-1 font-medium">EST. 2026</p>
        </div>

        {mode === 'render' && (
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">Used as references</p>
            {refs.length ? (
              <ul className="flex gap-2" aria-label="Reference images for the test render">
                {refs.map((r, i) => (
                  <li key={r.id}>
                    <RefThumb ref_={r} number={i + 1} className="h-16 w-16" />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-red-700 dark:text-red-300">No ticked images: the backend will refuse the render.</p>
            )}
            <p className="mt-1 text-xs text-neutral-500">The newest 3 ticked library images.</p>
          </div>
        )}

        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
          <dt className="text-neutral-500">Garment</dt>
          <dd>{garment}</dd>
          <dt className="text-neutral-500">Placement</dt>
          <dd>front chest</dd>
          <dt className="text-neutral-500">Similarity tier</dt>
          <dd>1 · style only, new subject</dd>
          <dt className="text-neutral-500">Style Card</dt>
          <dd>draft v{draft.version}</dd>
        </dl>

        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {TEST_RENDER_COST_LABEL} {COST_SUFFIX}. Hidden from the board and Completed; nothing is delivered to the client. It
          occupies one generation slot while it runs.
        </p>
      </div>
    </Modal>
  )
}
