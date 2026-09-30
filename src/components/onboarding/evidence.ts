/**
 * The profiler's `evidence[]` strings ("IMAGE 1, 3, 5: two-tone halftone shading",
 * "IMAGE 1-6: …", "IMAGE 5: exception - mockup photo"), parsed into cited image numbers +
 * text so the wizard can line each note up with the thumbnails it talks about. Pure, never throws.
 */

export interface EvidenceItem {
  /** Cited image numbers, 1-based, sorted, de-duplicated. Empty when the string had no "IMAGE n:" prefix. */
  numbers: number[]
  /** The note without its "IMAGE n:" prefix (or the whole string when unparsed). */
  text: string
  /** The note records a disagreement with the majority. */
  exception: boolean
  raw: string
  parsed: boolean
}

const PREFIX_RE = /^\s*images?\s+([^:]+?)\s*:\s*(.+)$/i
const RANGE_RE = /^(\d+)\s*[-–]\s*(\d+)$/
const EXCEPTION_RE = /\bexception\b/i

/** Every citation an "IMAGE …" prefix can carry: "1, 3 & 5", "1-6", "2 and 4". */
function parseNumbers(group: string): number[] {
  const out = new Set<number>()
  for (const token of group.split(/[,&]|\band\b/i)) {
    const t = token.trim()
    if (!t) continue
    const range = RANGE_RE.exec(t)
    if (range) {
      const a = Number(range[1])
      const b = Number(range[2])
      const lo = Math.min(a, b)
      const hi = Math.max(a, b)
      if (hi - lo > 64) continue
      for (let i = lo; i <= hi; i++) out.add(i)
    } else if (/^\d+$/.test(t)) {
      out.add(Number(t))
    }
  }
  return [...out].filter((n) => n > 0).sort((a, b) => a - b)
}

export function isExceptionNote(text: string): boolean {
  return EXCEPTION_RE.test(text)
}

export function parseEvidence(strings: readonly string[]): EvidenceItem[] {
  return strings.map((raw) => {
    const m = PREFIX_RE.exec(raw)
    const numbers = m ? parseNumbers(m[1]) : []
    const text = m && numbers.length ? m[2].trim() : raw.trim()
    return { numbers, text, exception: isExceptionNote(text), raw, parsed: numbers.length > 0 }
  })
}

/** How many notes cite each image; index 1..n (index 0 unused). */
export function citationCounts(items: readonly EvidenceItem[], n: number): number[] {
  const counts = new Array<number>(Math.max(0, n) + 1).fill(0)
  for (const item of items) {
    for (const num of item.numbers) {
      if (num >= 1 && num <= n) counts[num] += 1
    }
  }
  return counts
}

/** The highest image number any note cites (0 when none). */
export function maxCited(items: readonly EvidenceItem[]): number {
  let max = 0
  for (const item of items) for (const n of item.numbers) if (n > max) max = n
  return max
}

/** True when `numbers` is exactly 1..n. */
export function citesAll(numbers: readonly number[], n: number): boolean {
  if (n <= 0 || numbers.length !== n) return false
  for (let i = 0; i < n; i++) if (numbers[i] !== i + 1) return false
  return true
}

/** Caveats to show next to the evidence, in order. Each is one sentence. */
export function evidenceCaveats({
  items,
  reconstructedCount,
  refsNewerThanDraft,
  tiedCreatedAt,
  missingCount = 0,
}: {
  items: readonly EvidenceItem[]
  /** Images the profiler saw (exact when the draft records reference_ids, else reconstructed from the library). */
  reconstructedCount: number
  refsNewerThanDraft: boolean
  tiedCreatedAt: boolean
  /** Exact drafts only: ids the profiler saw that are no longer in the library. */
  missingCount?: number
}): Array<{ tone: 'neutral' | 'warn'; text: string }> {
  const out: Array<{ tone: 'neutral' | 'warn'; text: string }> = []
  if (items.length === 0) {
    out.push({ tone: 'neutral', text: 'This version has no evidence notes. Analyse again to get them.' })
    return out
  }
  if (refsNewerThanDraft) out.push({ tone: 'neutral', text: 'Images added after this analysis are not numbered here.' })
  if (missingCount > 0) {
    out.push({
      tone: 'neutral',
      text: `${missingCount} image${missingCount === 1 ? ' was' : 's were'} removed from the library since this analysis; ${missingCount === 1 ? 'its number stays' : 'their numbers stay'} as a dashed box.`,
    })
  }
  const m = maxCited(items)
  if (m > reconstructedCount) {
    out.push({
      tone: 'warn',
      text: `The evidence cites image ${m} but only ${reconstructedCount} image${reconstructedCount === 1 ? '' : 's'} match the library today: images were removed or unticked since, so numbers may have shifted. Re-run Analyse for an exact match.`,
    })
  }
  if (tiedCreatedAt) out.push({ tone: 'neutral', text: 'Some of these were uploaded together, so their numbers may be swapped.' })
  return out
}
