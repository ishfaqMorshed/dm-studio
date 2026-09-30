import { useMemo, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Lock, PencilLine } from 'lucide-react'
import { TEXT_CASE_LABEL, hasRules, readRules, rulePills, rulesEqual, rulesFromBrief, rulesSummary, type StyleBrief } from '../../lib/styleBrief'
import type { Client, StyleCard } from '../../lib/types'
import { formatDateTime } from '../style/format'
import { isValidHex, normalizeStyleCard, prettyJson, type PaletteEntry } from '../style/styleCardSchema'
import { ChipRow, type Chip } from './ChipRow'
import { isExceptionNote } from './evidence'
import { artworkLine, joinParts, looselyIncludes, readEvidence, typographyLine } from './styleCardRead'

interface Props {
  version: StyleCard
  client: Client
  /** The saved brief, for the rules ring and the must-have / never-do cross-check. */
  brief: StyleBrief
  isCurrent: boolean
  /** Images reconstructed for this version (EvidencePanel's count). */
  analysedCount: number
  /** Header actions (Adjust in the editor, Analyse again). */
  actions?: ReactNode
}

/** The draft as a designer reads it: swatches, one-line look, typography, chips, evidence counter. Read-only. */
export function StyleCardReadout({ version, client, brief, isCurrent, analysedCount, actions }: Props) {
  const doc = useMemo(() => normalizeStyleCard(version.json), [version.json])
  const evidence = readEvidence(doc.extra)
  const exceptions = evidence.filter(isExceptionNote).length
  const rules = readRules(doc.extra)
  const briefRules = rulesFromBrief(brief)
  const stale = !rulesEqual(rules, briefRules)
  const locked = version.status === 'locked'

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

      <section aria-label="The look">
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">The look</p>
        <p className="text-sm">{artworkLine(doc) || <span className="text-neutral-400">No medium, linework, shading or texture recorded.</span>}</p>
        <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
          {(
            [
              ['Linework', joinParts([doc.linework.weight, doc.linework.style], ', ')],
              ['Shading', doc.shading],
              ['Texture', doc.texture],
              ['Composition', doc.composition],
              ['Background', doc.background],
            ] as Array<[string, string]>
          ).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-neutral-500">{k}</dt>
              <dd className="min-w-0 break-words">{v.trim() || <span className="text-neutral-400">—</span>}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-label="Typography">
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">Typography</p>
        <p className="text-sm">{typographyLine(doc) || <span className="text-neutral-400">No typography recorded.</span>}</p>
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
        <ChipRow label="Subjects" chips={doc.subjects.map((text) => ({ text }))} />
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
      </div>

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
            return (
              <li
                key={`${hex}-${p.name}-${i}`}
                className={`min-w-0 grow-0 rounded-lg border border-neutral-200 bg-white p-1.5 dark:border-neutral-800 dark:bg-neutral-900 ${
                  dominant ? 'basis-[10.5rem]' : 'basis-[7.5rem]'
                }`}
              >
                <span className="sr-only">
                  {p.name || 'unnamed'}, {hex || 'no hex'}, {p.weight || 'no weight'}
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
                <span aria-hidden="true" className={`block font-mono text-[11px] uppercase ${valid ? 'text-neutral-500' : 'text-red-700 dark:text-red-300'}`}>
                  {valid ? hex : `${hex || '(empty)'} · hex is not #RRGGBB`}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
