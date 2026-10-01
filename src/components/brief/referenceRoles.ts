/**
 * Copy and helpers for the three reference slots (spec 4.5). One ordered value drives every
 * surface: `settings.reference_roles` (default subject → art_style → typography) labels the public
 * brief form (carried by the start_brief grant, since the anonymous form cannot read settings), the
 * designer's New card dialog, the card page and the Settings read-out; the card-creating RPCs stamp it
 * onto `cards.reference_roles`. Swapping the order is one UPDATE on the settings row, no deploy. Pure
 * helpers, no React.
 */
import { parseReferenceRoles, REFERENCE_ROLES, type Card, type ReferenceRole, type Settings } from '../../lib/types'

export interface RoleCopy {
  /** Slot title ("What to make"). */
  label: string
  /** One line under the slot: what the profiler takes from this image, and what it ignores. */
  hint: string
}

/** Labels confirmed by the user (Ref 1 What to make, Ref 2 Art style, Ref 3 Lettering). */
export const ROLE_COPY: Record<ReferenceRole, RoleCopy> = {
  subject: {
    label: 'What to make',
    hint: 'A design with the subject and layout you want. We take the hero, the supporting elements and the framing - not its colours, technique or lettering.',
  },
  art_style: {
    label: 'Art style',
    hint: 'This image decides how your design is drawn: technique, lines, shading, texture and colours. It overrides your brand’s usual look for this design; its subject and words are ignored.',
  },
  typography: {
    label: 'Lettering',
    hint: 'A design whose lettering you like: font feel, placement, case, effects such as outline, arch or banner. Its subject, colours and words are ignored.',
  },
}

/**
 * 2026-10-01 decision - the Art style reference wins for its card (docs/stylecard-v2-spec.md): a card with
 * a filled Art style slot is drawn in that image's medium, realism, linework, shading, texture, edges and
 * palette (prompt-engine v8 `magic_prompt_json.effective_style.source = 'art_reference'`, which QC judges
 * against); the Style Card fills only what the image does not show and its never-do list still applies.
 * Onboarding test renders (`cards.source = 'style_test'`) are the exception: they exist to test the Style
 * Card, so it always governs there.
 */
export const ART_STYLE_OVERRIDE_CAPTION = 'Drawn in this image’s style (overrides the Style Card look for this card)'

/** Appended to the Art style hint in the Settings read-out tooltip: what the Style Card still decides, and the one exception. */
export const ART_STYLE_OVERRIDE_RULE =
  'The Style Card fills in what the image does not show (composition, mood, lettering when no Lettering image is attached) and its never-do list still applies. Onboarding test renders always use the Style Card.'

/** Art style hint on an onboarding test render, where the Style Card always decides the look. */
export const STYLE_TEST_ART_STYLE_HINT =
  'Shows how the Style Card look is drawn. A test render always follows the Style Card, so this image does not override it.'

/** What an empty slot means on the designer dialog and the card page: the Style Card decides that part. */
export const STYLE_CARD_ONLY = 'Style Card only'
export const STYLE_CARD_ONLY_HINT = 'Leave it empty and the client’s Style Card decides this part of the design.'

/**
 * The slot order every form shows: `settings.reference_roles`, else the recorded default. Null
 * settings (row not loaded yet, or the anonymous brief form without a readable row) read as the
 * default, so the labels never flicker to something wrong.
 */
export function slotRoles(settings: Pick<Settings, 'reference_roles'> | null | undefined): ReferenceRole[] {
  return parseReferenceRoles(settings?.reference_roles)
}

/** The role of 0-based slot `i` in `roles`; a short settings list falls back to the default order for the rest. */
export function slotRole(roles: readonly ReferenceRole[], i: number): ReferenceRole {
  return roles[i] ?? REFERENCE_ROLES[i] ?? 'subject'
}

/**
 * The roles of a card's slots, one per `reference_paths` entry: `cards.reference_roles` when it was
 * stamped (public form / New card after studio_21), else the settings order cut to the number of
 * paths - the roles "Apply roles" on the card page would stamp. Until that happens the render treats
 * every reference of an unstamped (legacy) card as a style reference (prompt-engine's legacy path,
 * null column = no roles), so a caption for a legacy card must not present these as applied.
 */
export function cardSlotRoles(
  card: Pick<Card, 'reference_paths' | 'reference_roles'>,
  settings: Pick<Settings, 'reference_roles'> | null | undefined,
): ReferenceRole[] {
  const count = card.reference_paths?.length ?? 0
  const stamped = hasStampedRoles(card) ? parseReferenceRoles(card.reference_roles) : null
  const base = stamped ?? slotRoles(settings)
  return Array.from({ length: count }, (_, i) => slotRole(base, i))
}

/** True when the card carries its own roles (one per reference path); false for a legacy card. */
export function hasStampedRoles(card: Pick<Card, 'reference_paths' | 'reference_roles'>): boolean {
  const roles = card.reference_roles
  return Array.isArray(roles) && roles.length > 0 && roles.length === (card.reference_paths?.length ?? 0)
}

/**
 * True when a card's slot is drawn in its own image's style instead of the Style Card look (the
 * 2026-10-01 rule): the slot's role is Art style - the stamped role, or for an unstamped card the role
 * the per-slot vision read gave it (`reference_analysis.references[i].role`) - and the card is not an
 * onboarding test render.
 */
export function overridesStyleCard(
  card: Pick<Card, 'source' | 'reference_paths' | 'reference_roles'>,
  role: ReferenceRole,
  readAs: ReferenceRole | null,
): boolean {
  if (card.source === 'style_test') return false
  return hasStampedRoles(card) ? role === 'art_style' : readAs === 'art_style'
}

/** A slot's one-line hint; on a test render the Art style slot does not override the Style Card. */
export function roleHint(role: ReferenceRole, source?: string | null): string {
  return role === 'art_style' && source === 'style_test' ? STYLE_TEST_ART_STYLE_HINT : ROLE_COPY[role].hint
}

/** "1 · What to make" */
export function slotTitle(n: number, role: ReferenceRole): string {
  return `${n} · ${ROLE_COPY[role].label}`
}

/** "what to make, art style and lettering" in the configured order, for sentences. */
export function rolesSentence(roles: readonly ReferenceRole[]): string {
  const labels = roles.map((r) => ROLE_COPY[r].label.toLowerCase())
  if (labels.length <= 1) return labels.join('')
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
}
