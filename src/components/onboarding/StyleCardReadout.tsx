import { useMemo, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Lock, PencilLine } from 'lucide-react'
import { TEXT_CASE_LABEL, hasRules, readRules, rulePills, rulesEqual, rulesFromBrief, rulesSummary, type StyleBrief } from '../../lib/styleBrief'
import type { Client, ClientReference, StyleCard } from '../../lib/types'
import { formatDateTime } from '../style/format'
import { isValidHex, normalizeStyleCard, prettyJson, type PaletteEntry } from '../style/styleCardSchema'
import { ChipRow, type Chip } from './ChipRow'
import { isExceptionNote } from './evidence'
import { asOfProfilerOrder } from './profilerOrder'
import { RefThumb } from './RefThumb'
import { artworkLine, joinParts, looselyIncludes, readEvidence, readReferenceIds, typographyLine } from './styleCardRead'
import {
  lowAgreementNote,
  readBrandText,
  readPaletteVariants,
  readRepresentativeImages,
  readValidation,
  subjectSource,
  type PaletteVariant,
} from './validation'
import { ValidationChips } from './ValidationChips'

interface Props {
  version: StyleCard
  client: Client
  /** The saved brief, for the rules ring and the must-have / never-do cross-check. */
  brief: StyleBrief
  /** The library, to show the representative images (optional: the thumbnails are skipped without it). */
  refs?: readonly ClientReference[]
  readCap?: number
  isCurrent: boolean
  /** Images reconstructed for this version (EvidencePanel's count). */
  analysedCount: number
  /** Header actions (Adjust in the editor, Analyse again). */
  actions?: ReactNode
}

/** Outline for a value the analysed designs disagree about (field_evidence agreement below 60%); shared with step 4. */
export const AMBER_RING = 'rounded ring-1 ring-amber-400 px-1 -mx-1 dark:ring-amber-600'

/**
 * The draft as a designer reads it: validation chips, swatches, one-line look, typography, chips
 * cross-checked against the brief, brand text, representative images, evidence counter. Read-only.
 * A value the analysed designs disagree about (`field_evidence[path].agreement` below 60%) and a
 * subject that comes from the brief only carry an amber outline with the reason as tooltip.
 */
export function StyleCardReadout({ version, client, brief, refs, readCap, isCurrent, analysedCount, actions }: Props) {
  const doc = useMemo(() => normalizeStyleCard(version.json), [version.json])
  const evidence = readEvidence(doc.extra)
  const exceptions = evidence.filter(isExceptionNote).length
  const rules = readRules(doc.extra)
  const briefRules = rulesFromBrief(brief)
  const stale = !rulesEqual(rules, briefRules)
  const locked = version.status === 'locked'
  const validation = useMemo(() => readValidation(doc, brief, client.garment_colors), [doc, brief, client.garment_colors])
  const brandText = readBrandText(doc)
  const variants = readPaletteVariants(doc)
  const representative = readRepresentativeImages(doc)

  // The images this version was analysed from, in IMAGE 1..N order: exact when the run recorded
  // reference_ids, else the library as it stood at the draft's timestamp (same rule as EvidencePanel).
  const read = useMemo<Array<ClientReference | null>>(() => {
    if (!refs) return []
    const ids = readReferenceIds(doc.extra)
    if (ids.length) {
      const byId = new Map(refs.map((r) => [r.id, r]))
      return ids.map((id) => byId.get(id) ?? null)
    }
    return asOfProfilerOrder(refs, readCap ?? 16, version.created_at).read
  }, [refs, readCap, doc.extra, version.created_at])

  const caseWanted = brief.text_case === 'upper' || brief.text_case === 'title' ? brief.text_case : null
  const draftCase = doc.typography.case.trim().toLowerCase()
  const caseMismatch = caseWanted !== null && draftCase !== '' && draftCase !== caseWanted

  const chip = (items: string[], expected: string[], title: string): Chip[] =>
    items.map((text) => ({ text, matchedTitle: looselyIncludes(expected, text) ? title : undefined }))
  const missing = (expected: string[], items: string[]) => expected.filter((e) => !looselyIncludes(items, e))

  const garmentChips: Chip[] = doc.garment_colors.map((c) => ({
    text: c,
    hint: looselyIncludes(client.garment_colors, c) ? undefined : 'not on the client record',
  }))
  const subjectChips: Chip[] = doc.subjects.map((text) => {
    const src = subjectSource(doc, text)
    return {
      text,
      hint: src === 'both' ? 'brief + images' : src === 'images' ? 'images' : undefined,
      warnTitle: src === 'brief' ? 'from the brief only: not seen in the analysed designs' : undefined,
    }
  })
  const brandChips: Chip[] = brandText.items.map((it) => ({
    text: it.text,
    hint: joinParts([it.role, it.placement], ' · ') || undefined,
  }))

  /** Amber outline + tooltip for a value whose field_evidence agreement is low. */
  const low = (paths: readonly string[]) => lowAgreementNote(doc, paths, analysedCount)
  const flagged = (paths: readonly string[], node: ReactNode) => {
    const note = low(paths)
    return note ? (
      <span className={AMBER_RING} title={note}>
        {node}
        <span className="sr-only"> ({note})</span>
      </span>
    ) : (
      node
    )
  }

  const lookRows: Array<[string, string, readonly string[]]> = [
    ['Realism', doc.realism, ['realism']],
    ['Linework', joinParts([doc.linework.weight, doc.linework.style, doc.linework.outline && `${doc.linework.outline} outline`], ', '), ['linework']],
    ['Shading', joinParts([doc.shading_method, doc.shading], ' · '), ['shading', 'shading_method']],
    ['Texture', doc.texture, ['texture']],
    ['Edge finish', doc.edge_finish, ['edge_finish']],
    ['Composition', doc.composition, ['composition', 'hero']],
    ['Background', doc.background, ['background']],
  ]

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold">
            {locked ? `v${version.version}` : `Draft v${version.version}`}
            {locked ? (
              isCurrent ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                  Current
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-neutral-200 px-2 py-0.5 text-[11px] font-medium text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
                  <Lock className="h-3 w-3" aria-hidden="true" />
                  Superseded
                </span>
              )
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                <PencilLine className="h-3 w-3" aria-hidden="true" />
                Draft
              </span>
            )}
            {exceptions > 0 && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900/50 dark:text-amber-300"
                title="Evidence notes that disagree with the majority; see What the profiler saw"
              >
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                {exceptions} exception{exceptions === 1 ? '' : 's'}
              </span>
            )}
          </h3>
          <p className="mt-0.5 text-xs text-neutral-500">
            Analysed {formatDateTime(version.created_at)}
            {analysedCount > 0 ? ` from ${analysedCount} image${analysedCount === 1 ? '' : 's'}` : ''}
            {locked && version.locked_at ? ` · locked ${formatDateTime(version.locked_at)}` : ''}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {rulePills(rules).map((p) => (
              <span
                key={p}
                className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
                  stale
                    ? 'bg-amber-50 text-amber-900 ring-1 ring-amber-400 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-600'
                    : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200'
                }`}
              >
                {p}
              </span>
            ))}
            <span className="text-[11px] text-neutral-500">
              {hasRules(doc.extra) ? 'rules as given to the profiler' : 'no rules recorded (analysed before the brief); defaults assumed'}
            </span>
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>

      <ValidationChips validation={validation} clientId={client.id} versionId={version.id} />

      {stale && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            This version was analysed with: {rulesSummary(rules)}. Your saved brief says: {rulesSummary(briefRules)}. Re-run
            Analyse to apply the current brief{locked ? '' : ', or adjust the draft in the editor'}.
          </span>
        </p>
      )}

      <PaletteStrip palette={doc.palette} />
      {variants.map((v, i) => (
        <VariantStrip key={`${v.garment}-${i}`} variant={v} />
      ))}

      <section aria-label="The look">
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">The look</p>
        <p className="text-sm">
          {artworkLine(doc) ? flagged(['medium'], artworkLine(doc)) : <span className="text-neutral-400">No medium, linework, shading or texture recorded.</span>}
        </p>
        <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
          {lookRows
            .filter(([k, v]) => v.trim() || ['Linework', 'Shading', 'Texture', 'Composition', 'Background'].includes(k))
            .map(([k, v, paths]) => (
              <div key={k} className="contents">
                <dt className="text-neutral-500">{k}</dt>
                <dd className="min-w-0 break-words">{v.trim() ? flagged(paths, v.trim()) : <span className="text-neutral-400">—</span>}</dd>
              </div>
            ))}
        </dl>
      </section>

      <section aria-label="Typography">
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">Typography</p>
        <p className="text-sm">
          {typographyLine(doc) ? flagged(['typography.vibe', 'typography.placement', 'typography.case'], typographyLine(doc)) : <span className="text-neutral-400">No typography recorded.</span>}
        </p>
        {(doc.typography.headline.family || doc.typography.secondary.family) && (
          <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs">
            {(['headline', 'secondary'] as const).map((slot) => {
              const t = doc.typography[slot]
              const line = joinParts([t.family, t.weight, t.effects.length ? t.effects.join(', ') : ''], ' · ')
              return line ? (
                <div key={slot} className="contents">
                  <dt className="capitalize text-neutral-500">{slot}</dt>
                  <dd className="min-w-0 break-words">{flagged([`typography.${slot}`], line)}</dd>
                </div>
              ) : null
            })}
          </dl>
        )}
        {caseMismatch && caseWanted && (
          <p className="mt-1 flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              Your brief says {TEXT_CASE_LABEL[caseWanted]}; the draft says {doc.typography.case.trim()}. Intake applies the
              brief; use the editor to align the card.
            </span>
          </p>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <ChipRow label="Mood" chips={doc.mood.map((text) => ({ text }))} />
        <ChipRow
          label="Subjects"
          chips={subjectChips}
          missing={missing(brief.subjects, doc.subjects)}
          hint={subjectChips.some((c) => c.warnTitle) ? 'Amber outline: from the brief only, not seen in the analysed designs.' : undefined}
        />
        <ChipRow
          label="Signature moves"
          tone="accent"
          chips={chip(doc.signature_moves, brief.must_have, 'From your brief')}
          missing={missing(brief.must_have, doc.signature_moves)}
        />
        <ChipRow
          label="Never do"
          tone="danger"
          chips={chip(doc.forbid, brief.avoid, 'From your brief')}
          missing={missing(brief.avoid, doc.forbid)}
        />
        <ChipRow label="Garment colours" chips={garmentChips} />
        {(brandText.present || brief.brand_text.length > 0) && (
          <ChipRow
            label="Brand text"
            chips={brandChips}
            missing={missing(brief.brand_text, brandText.items.map((it) => it.text))}
            hint={`${brandText.alwaysPresent ? 'On every design. ' : ''}Never drawn unless it is in a brief's text lines.`}
          />
        )}
      </div>

      {representative.length > 0 && refs && (
        <section aria-label="Representative images">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">Representative images</p>
          <ul className="flex flex-wrap gap-2">
            {representative.map((n) => {
              const ref = read[n - 1] ?? null
              return (
                <li key={n}>
                  {ref ? (
                    <RefThumb ref_={ref} number={n} />
                  ) : (
                    <span
                      title={`Image ${n} is not in the library today`}
                      className="flex h-[72px] w-[72px] items-center justify-center rounded-lg border border-dashed border-neutral-400 bg-neutral-100 text-xs text-neutral-500 dark:border-neutral-600 dark:bg-neutral-800"
                    >
                      {n}?
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
          <p className="mt-1 text-[11px] text-neutral-500">The three designs that best show the whole look; the test render attaches them as its references.</p>
        </section>
      )}

      <details className="rounded-lg border border-neutral-200 dark:border-neutral-800">
        <summary className="cursor-pointer select-none rounded-lg px-3 py-2 text-xs font-medium outline-none focus-visible:ring-4 focus-visible:ring-accent-500/30">
          Full JSON
        </summary>
        <pre className="max-h-80 overflow-auto border-t border-neutral-200 px-3 py-2 font-mono text-[11px] leading-relaxed dark:border-neutral-800">
          {prettyJson(doc)}
        </pre>
      </details>
    </div>
  )
}

/** Wrapping swatch cards, dominant first and wider. Invalid hex is what LockDialog blocks, so it is loud here. */
function PaletteStrip({ palette }: { palette: PaletteEntry[] }) {
  const sorted = useMemo(() => {
    const dominant = palette.filter((p) => p.weight.trim().toLowerCase() === 'dominant')
    const others = palette.filter((p) => p.weight.trim().toLowerCase() !== 'dominant')
    return [...dominant, ...others]
  }, [palette])

  return (
    <section aria-label="Palette">
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">Palette</p>
      {sorted.length === 0 ? (
        <p className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          No palette in this draft; colours would be left to the model.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {sorted.map((p, i) => {
            const hex = p.hex.trim()
            const valid = isValidHex(hex)
            const dominant = p.weight.trim().toLowerCase() === 'dominant'
            const images = Array.isArray(p.images) ? p.images.filter((n): n is number => typeof n === 'number') : []
            return (
              <li
                key={`${hex}-${p.name}-${i}`}
                title={images.length ? `Seen in image${images.length === 1 ? '' : 's'} ${images.join(', ')}` : undefined}
                className={`min-w-0 grow-0 rounded-lg border border-neutral-200 bg-white p-1.5 dark:border-neutral-800 dark:bg-neutral-900 ${
                  dominant ? 'basis-[10.5rem]' : 'basis-[7.5rem]'
                }`}
              >
                <span className="sr-only">
                  {p.name || 'unnamed'}, {hex || 'no hex'}, {p.weight || 'no weight'}
                  {p.role ? `, ${p.role}` : ''}
                </span>
                <span
                  aria-hidden="true"
                  className={`block h-11 w-full rounded-md border border-neutral-900/10 dark:border-white/10 ${
                    valid
                      ? ''
                      : 'bg-[repeating-linear-gradient(45deg,#fecaca_0_6px,#fff_6px_12px)] dark:bg-[repeating-linear-gradient(45deg,#7f1d1d_0_6px,#262626_6px_12px)]'
                  }`}
                  style={valid ? { backgroundColor: hex } : undefined}
                />
                <span aria-hidden="true" className="mt-1 flex items-baseline justify-between gap-1">
                  <span className="truncate text-sm font-medium">{p.name || <span className="text-neutral-400">unnamed</span>}</span>
                  {p.weight && (
                    <span className="shrink-0 rounded bg-neutral-100 px-1 text-[10px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                      {p.weight}
                    </span>
                  )}
                </span>
                <span aria-hidden="true" className={`flex items-baseline justify-between gap-1 font-mono text-[11px] uppercase ${valid ? 'text-neutral-500' : 'text-red-700 dark:text-red-300'}`}>
                  <span>{valid ? hex : `${hex || '(empty)'} · hex is not #RRGGBB`}</span>
                  {p.role && <span className="font-sans normal-case text-neutral-400">{p.role}</span>}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/** One `palette_variants` entry: the colourway of one garment side as plain swatches. */
function VariantStrip({ variant }: { variant: PaletteVariant }) {
  const label = variant.garment === 'dark' ? 'Dark garments' : variant.garment === 'light' ? 'Light garments' : 'Any garment'
  return (
    <section aria-label={`Palette on ${label.toLowerCase()}`}>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
        Palette · {label}
        {variant.images.length > 0 && <span className="font-normal normal-case"> · images {variant.images.join(', ')}</span>}
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {variant.hexes.map((hex, i) => {
          const valid = isValidHex(hex)
          return (
            <li key={`${hex}-${i}`} className="flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white p-1 pr-2 dark:border-neutral-800 dark:bg-neutral-900">
              <span
                aria-hidden="true"
                className="block h-6 w-6 rounded border border-neutral-900/10 dark:border-white/10"
                style={valid ? { backgroundColor: hex } : undefined}
              />
              <span className={`font-mono text-[11px] uppercase ${valid ? 'text-neutral-600 dark:text-neutral-300' : 'text-red-700 dark:text-red-300'}`}>{hex}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
