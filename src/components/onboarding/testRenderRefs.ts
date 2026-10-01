/**
 * Which library images the test render attaches, mirrored from create_style_test_card (migration
 * 20261001_studio_23_test_card_roles.sql) so the confirm dialog previews what the backend will pick:
 *   1. the Style Card's representative_images resolved through its reference_ids (1-based IMAGE
 *      numbers; a removed or unticked image is skipped; never the same image twice; at most 3);
 *   2. else a roled trio in the settings slot order from the "best example of" tags (layout ->
 *      What to make, linework or palette -> Art style, lettering -> Lettering), newest tagged image
 *      first, never twice, an outlier never picked by tag, a slot without a tagged image taking the
 *      newest unused ticked image (non-outliers first). Fewer than 3 ticked images give a shorter list.
 * Roles are the settings order cut to the number of images, as the backend stamps them. Pure.
 */
import { parseReferenceMeta, type ClientReference, type ReferenceRole } from '../../lib/types'
import type { StyleCardDoc } from '../style/styleCardSchema'
import { newestFirst } from './profilerOrder'
import { readReferenceIds } from './styleCardRead'
import { readRepresentativeImages } from './validation'

export type TestRefPick = 'representative' | 'tag' | 'newest'

export interface TestRenderRef {
  ref: ClientReference
  role: ReferenceRole
  /** How the backend arrives at this image. */
  picked: TestRefPick
}

const TAGS_FOR_ROLE: Record<ReferenceRole, readonly string[]> = {
  subject: ['layout'],
  art_style: ['linework', 'palette'],
  typography: ['lettering'],
}

/**
 * The references the test render attaches, in slot order. `library` is the client's library (excluded
 * images are skipped here, as the backend skips them); `roles` is the settings slot order.
 */
export function testRenderReferences(
  doc: StyleCardDoc | null,
  library: readonly ClientReference[],
  roles: readonly ReferenceRole[],
): TestRenderRef[] {
  const ticked = library.filter((r) => !r.excluded).sort(newestFirst)
  if (!ticked.length) return []

  // 1. representative images through reference_ids
  if (doc) {
    const ids = readReferenceIds(doc.extra)
    const numbers = readRepresentativeImages(doc)
    if (ids.length && numbers.length) {
      const byId = new Map(ticked.map((r) => [r.id, r]))
      const picks: ClientReference[] = []
      for (const n of numbers) {
        if (picks.length >= 3) break
        const ref = byId.get(ids[n - 1] ?? '')
        if (ref && !picks.some((p) => p.path === ref.path)) picks.push(ref)
      }
      if (picks.length) return picks.map((ref, i) => ({ ref, role: roles[i] ?? 'subject', picked: 'representative' }))
    }
  }

  // 2. a roled trio from the tags, newest first, then the newest unused image
  const out: TestRenderRef[] = []
  const used = new Set<string>()
  const metaOf = (r: ClientReference) => parseReferenceMeta(r.meta)
  for (const role of roles.slice(0, Math.min(3, ticked.length))) {
    const tags = TAGS_FOR_ROLE[role]
    let hit = ticked.find((r) => {
      if (used.has(r.path)) return false
      const m = metaOf(r)
      return !m.outlier && m.best_for.some((b) => tags.includes(b))
    })
    let picked: TestRefPick = 'tag'
    if (!hit) {
      hit = ticked.find((r) => !used.has(r.path) && !metaOf(r).outlier) ?? ticked.find((r) => !used.has(r.path))
      picked = 'newest'
    }
    if (!hit) break
    used.add(hit.path)
    out.push({ ref: hit, role, picked })
  }
  return out
}

/** One sentence for the dialog: how the shown images were chosen. */
export function testRefsRule(picks: readonly TestRenderRef[]): string {
  if (!picks.length) return 'No ticked images: the backend will refuse the render.'
  if (picks[0].picked === 'representative') return "The Style Card's representative images, as the profiler chose them."
  const tagged = picks.filter((p) => p.picked === 'tag').length
  if (tagged === picks.length) return 'The newest image tagged "best example of" for each job.'
  if (tagged === 0) return 'No image is tagged for these jobs, so the newest ticked images stand in (tag them in step 1 to choose).'
  return `${tagged} from the "best example of" tags, the rest the newest ticked images (tag them in step 1 to choose).`
}
