import { useMemo, useState } from 'react'
import { AlertTriangle, ImageOff, Paintbrush, Tags } from 'lucide-react'
import { updateCardReferenceRoles } from '../../lib/api'
import { REFS_BUCKET } from '../../lib/supabase'
import { useSettings } from '../../lib/useSettings'
import { useSignedUrl } from '../../lib/useSignedUrl'
import { useToast } from '../../lib/useToast'
import { errorMessage, isRecord, isReferenceRole, REFERENCE_ROLES, type Json, type ReferenceRole } from '../../lib/types'
import {
  ART_STYLE_OVERRIDE_CAPTION,
  ROLE_COPY,
  cardSlotRoles,
  hasStampedRoles,
  overridesStyleCard,
  roleHint,
  slotTitle,
} from '../brief/referenceRoles'
import { btnSecondary } from '../style/classes'
import { JsonTree } from './JsonTree'
import { parseEmbeddedJson, recordEntries } from './json'
import { checkerboard, inlineSelectCls } from './styles'
import { Panel, Spinner } from './ui'
import type { CardRow } from './useCardData'

const PER_REF_KEYS = ['references', 'refs', 'images', 'reference_analysis', 'per_reference', 'analyses', 'items']

/** Bookkeeping keys of a per-slot read (WF-1 v3 `references[i]`) that the caption already shows. */
const SLOT_META_KEYS = new Set(['slot', 'role', 'image'])

/**
 * What the render does with an unstamped (legacy) card: prompt-engine reads every reference as a general
 * style/subject reference and, with no Art style slot, the Style Card keeps the look.
 */
const LEGACY_HINT = 'Not stamped: the render reads every reference of this card as a general style and subject reference until roles are saved.'

interface SplitAnalysis {
  /** One entry per reference slot when the read is per image. */
  perRef: Array<Json | undefined>
  /** Everything else (style, palette, subject structure, typography…). */
  global: Array<[string, Json]>
}

/**
 * `reference_analysis` is written by the vision pass; its shape is not fixed yet.
 * Accepts an array (one item per reference), an object with a per-reference list
 * under a known key (`references` is what WF-1 v3 writes, one object per slot with role-specific
 * keys), numbered keys ("1", "ref_2", "image3"), or a flat object of findings (the legacy single
 * read). Nothing is dropped: unmatched keys render as key/value.
 */
function splitAnalysis(input: Json | null | undefined, count: number): SplitAnalysis {
  const json = parseEmbeddedJson(input)
  if (json === null || json === undefined) return { perRef: [], global: [] }
  if (Array.isArray(json)) return { perRef: json, global: [] }
  if (!isRecord(json)) return { perRef: [], global: [['analysis', json]] }

  const global: Array<[string, Json]> = []
  let perRef: Array<Json | undefined> = []
  for (const [k, v] of recordEntries(json)) {
    if (!perRef.length && PER_REF_KEYS.includes(k) && Array.isArray(v)) {
      perRef = v
      continue
    }
    global.push([k, v])
  }
  if (!perRef.length && count > 0) {
    const numbered: Array<[number, Json]> = []
    const rest: Array<[string, Json]> = []
    for (const [k, v] of global) {
      const m = /^(?:ref|reference|image|img|slot)?[_\s-]?(\d+)$/i.exec(k)
      if (m) numbered.push([Number(m[1]), v])
      else rest.push([k, v])
    }
    if (numbered.length) {
      perRef = []
      for (const [n, v] of numbered) perRef[n >= 1 ? n - 1 : 0] = v
      return { perRef, global: rest }
    }
  }
  return { perRef, global }
}

/** A per-slot read without its slot/role bookkeeping; the role it was read as, when it says so. */
function slotRead(analysis: Json | undefined): { body: Json | undefined; readAs: ReferenceRole | null } {
  if (!isRecord(analysis)) return { body: analysis, readAs: null }
  const readAs = isReferenceRole(analysis.role) ? analysis.role : null
  const body = Object.fromEntries(recordEntries(analysis).filter(([k]) => !SLOT_META_KEYS.has(k)))
  return { body: Object.keys(body).length ? body : undefined, readAs }
}

function ReferenceSlot({
  path,
  index,
  role,
  legacy,
  card,
  analysis,
  editable,
  saving,
  onRole,
}: {
  path: string
  index: number
  role: ReferenceRole
  /** The card has no stamped roles: captioned as a style reference, no per-slot select (Apply roles first). */
  legacy: boolean
  /** For the 2026-10-01 rule: an Art style slot overrides the Style Card look, except on a test render. */
  card: Pick<CardRow, 'source' | 'reference_paths' | 'reference_roles'>
  analysis: Json | undefined
  /** Staff may change the role before approval. */
  editable: boolean
  saving: boolean
  onRole: (role: ReferenceRole) => void
}) {
  const { url, broken } = useSignedUrl(REFS_BUCKET, path)
  const n = index + 1
  const title = legacy ? `${n} · Style reference` : slotTitle(n, role)
  const { body, readAs } = slotRead(analysis)
  const hasAnalysis = body !== undefined && body !== null
  const hint = roleHint(role, card.source)
  const override = overridesStyleCard(card, role, readAs)
  return (
    <li className="min-w-0 space-y-2">
      <a
        href={url ?? undefined}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open reference ${n} (${legacy ? 'style reference' : ROLE_COPY[role].label}) full size`}
        title="Open full size"
        className={`block aspect-square overflow-hidden rounded-xl border border-neutral-200 outline-none focus-visible:ring-4 focus-visible:ring-neutral-900/10 dark:border-neutral-800 ${checkerboard}`}
      >
        {broken ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-neutral-400">
            <ImageOff className="h-5 w-5" />
            <span className="text-[10px]">Missing</span>
          </div>
        ) : url ? (
          <img src={url} alt={title} loading="lazy" decoding="async" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full animate-pulse bg-neutral-200/60 dark:bg-neutral-800/60" />
        )}
      </a>
      {legacy ? (
        <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400" title={LEGACY_HINT}>
          {title}
        </p>
      ) : editable ? (
        <label className="flex items-center gap-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400">
          <span className="tabular-nums">{n} ·</span>
          <select
            aria-label={`Role of reference ${n}`}
            value={role}
            disabled={saving}
            onChange={(e) => {
              const next = e.target.value
              if (isReferenceRole(next) && next !== role) onRole(next)
            }}
            className={`${inlineSelectCls} min-w-0 flex-1 !px-2 !py-1 !text-xs`}
            title={hint}
          >
            {REFERENCE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_COPY[r].label}
              </option>
            ))}
          </select>
          {saving && <Spinner className="h-3.5 w-3.5" />}
        </label>
      ) : (
        <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400" title={hint}>
          {title}
        </p>
      )}
      {override && (
        <p className="flex items-start gap-1 text-[11px] text-neutral-600 dark:text-neutral-400">
          <Paintbrush className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          {ART_STYLE_OVERRIDE_CAPTION}
        </p>
      )}
      {!legacy && readAs && readAs !== role && (
        <p className="flex items-start gap-1 text-[11px] text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          Read as {ROLE_COPY[readAs].label} by the vision pass; the next render uses {ROLE_COPY[role].label}.
        </p>
      )}
      {hasAnalysis && (
        <div className="text-xs">
          <JsonTree value={body} depth={1} />
        </div>
      )}
    </li>
  )
}

/**
 * The card's reference images, each captioned with its job (What to make / Art style / Lettering)
 * and, when the vision pass read them per slot (`reference_analysis.references[i]`), what it found
 * in that image. The roles come from `cards.reference_roles`. A filled Art style slot carries the
 * one-line "drawn in this image's style" caption (2026-10-01 rule; never on a style_test card). A
 * legacy card (null column) is captioned "Style reference", because that is how the render reads it,
 * with one "Apply roles" button that stamps the studio order from Settings. Staff can change a slot's
 * role until the card is approved.
 */
export function ReferencesPanel({
  card,
  collapsible,
  defaultOpen,
}: {
  card: CardRow
  collapsible?: boolean
  defaultOpen?: boolean
}) {
  const toast = useToast()
  const { settings } = useSettings()
  const paths = card.reference_paths ?? []
  const roles = useMemo(() => cardSlotRoles(card, settings), [card, settings])
  const stamped = hasStampedRoles(card)
  const editable = card.approved_at === null
  const [savingSlot, setSavingSlot] = useState<number | null>(null)

  const analysis = useMemo(() => splitAnalysis(card.reference_analysis, paths.length), [card.reference_analysis, paths.length])
  const hasPerRef = analysis.perRef.some((a) => a !== undefined && a !== null)
  const noAnalysis = card.reference_analysis === null || card.reference_analysis === undefined
  const pending = noAnalysis && card.stage === 'intake'
  const duplicates = useMemo(() => {
    const seen = new Set<ReferenceRole>()
    const dup = new Set<ReferenceRole>()
    for (const r of roles) (seen.has(r) ? dup : seen).add(r)
    return [...dup]
  }, [roles])

  async function saveRole(index: number, role: ReferenceRole) {
    if (savingSlot !== null) return
    const next = roles.map((r, i) => (i === index ? role : r))
    setSavingSlot(index)
    try {
      await updateCardReferenceRoles(card.id, next)
      toast.success(`Reference ${index + 1} is now ${ROLE_COPY[role].label}. The next render reads it that way.`)
    } catch (e) {
      toast.error(errorMessage(e, 'Could not save the reference roles'))
    } finally {
      setSavingSlot(null)
    }
  }

  /** Legacy card: stamp the studio order on every slot at once (savingSlot -1 while it runs). */
  async function applyRoles() {
    if (savingSlot !== null) return
    setSavingSlot(-1)
    try {
      await updateCardReferenceRoles(card.id, roles)
      toast.success(`Roles saved: ${roles.map((r, i) => slotTitle(i + 1, r)).join(', ')}. The next render reads each image for its job.`)
    } catch (e) {
      toast.error(errorMessage(e, 'Could not save the reference roles'))
    } finally {
      setSavingSlot(null)
    }
  }

  return (
    <Panel
      title="References"
      subtitle={
        pending
          ? 'Vision read in progress — findings appear when the card reaches review'
          : noAnalysis
            ? 'No reference read stored for this card'
            : hasPerRef
              ? 'What the vision pass read from each image, for its job only'
              : 'What the vision pass read from the images'
      }
      collapsible={collapsible}
      defaultOpen={defaultOpen}
    >
      {paths.length === 0 ? (
        <p className="text-sm text-neutral-500">No reference images on this card.</p>
      ) : (
        <>
          <ul className={`grid gap-3 ${hasPerRef ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-3'}`}>
            {paths.map((p, i) => (
              <ReferenceSlot
                key={p}
                path={p}
                index={i}
                role={roles[i]}
                legacy={!stamped}
                card={card}
                analysis={analysis.perRef[i]}
                editable={editable}
                saving={savingSlot === i}
                onRole={(role) => void saveRole(i, role)}
              />
            ))}
          </ul>
          {!stamped && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
              <p className="min-w-0 flex-1">
                Roles were not stamped on this card (created before slot roles): the render reads all {paths.length} reference
                {paths.length === 1 ? '' : 's'} as general style and subject references until roles are saved.
              </p>
              {editable && (
                <button
                  type="button"
                  onClick={() => void applyRoles()}
                  disabled={savingSlot !== null}
                  title={`Save ${roles.map((r, i) => slotTitle(i + 1, r)).join(', ')} on this card (the studio order from Settings); each slot can be changed afterwards`}
                  className={`${btnSecondary} px-2.5 py-1.5 text-xs`}
                >
                  {savingSlot === -1 ? <Spinner className="h-3.5 w-3.5" /> : <Tags className="h-3.5 w-3.5" />}
                  Apply roles ({roles.map((r) => ROLE_COPY[r].label).join(' · ')})
                </button>
              )}
            </div>
          )}
          {stamped && duplicates.length > 0 && (
            <p className="mt-2 text-[11px] text-neutral-500">
              {`${duplicates.map((d) => ROLE_COPY[d].label).join(' and ')} ${duplicates.length === 1 ? 'is' : 'are'} used by more than one slot; the model reads both images for it.`}
            </p>
          )}
        </>
      )}
      {analysis.global.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500">
            {hasPerRef ? 'Across the references' : 'Reference read'}
          </h3>
          <JsonTree value={Object.fromEntries(analysis.global)} />
        </div>
      )}
    </Panel>
  )
}
