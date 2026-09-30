/** Read-only one-liners over a Style Card document for the wizard's visual readout. */
import type { Json } from '../../lib/types'
import { stringList } from '../card/json'
import type { StyleCardDoc } from '../style/styleCardSchema'

/** Joins the non-empty parts with a separator. */
export function joinParts(parts: ReadonlyArray<string | null | undefined | false>, sep = ' · '): string {
  return parts.filter((p): p is string => typeof p === 'string' && p.trim().length > 0).map((p) => p.trim()).join(sep)
}

/** "hand-inked linework with flat fills · medium-bold clean lines · two-tone halftone · light grit" */
export function artworkLine(doc: StyleCardDoc): string {
  const line = joinParts([doc.linework.weight, doc.linework.style], ' ')
  return joinParts([doc.medium, line && `${line} lines`, doc.shading, doc.texture])
}

/** "condensed bold sans · arched above the hero · case UPPER" */
export function typographyLine(doc: StyleCardDoc): string {
  return joinParts([doc.typography.vibe, doc.typography.placement, doc.typography.case && `case ${doc.typography.case}`])
}

/** The profiler's `evidence[]`, tolerant of a single string or odd shapes. */
export function readEvidence(extra: Record<string, Json | undefined>): string[] {
  return stringList(extra.evidence)
}

/** Ordered `reference_ids` when a future WF-1b stores them (see plan §13); empty today. */
export function readReferenceIds(extra: Record<string, Json | undefined>): string[] {
  const v = extra.reference_ids
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : []
}

/** Case-insensitive substring match either way: "circular badge" matches "circular badge frame". */
export function looselyIncludes(list: readonly string[], needle: string): boolean {
  const n = needle.trim().toLowerCase()
  if (!n) return false
  return list.some((item) => {
    const i = item.trim().toLowerCase()
    return i.length > 0 && (i.includes(n) || n.includes(i))
  })
}
