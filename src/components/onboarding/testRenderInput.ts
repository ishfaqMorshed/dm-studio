/**
 * What a test render is made of (subject + text lines + the Style Card version), the dialog's
 * defaults and checks, and how to read them back off a `style_test` card. Pure helpers, no React.
 */
import { isRecord, parsePrintText, type Card, type Client, type Json, type PrintTextLine, type StyleCard } from '../../lib/types'

/** Mirrors `create_style_test_card`: 'subject is too long (200 characters max)'. */
export const TEST_SUBJECT_MAX = 200

/** The second default line, the same one the backend uses when no lines are given. */
export const TEST_SUB_LINE_DEFAULT = 'EST. 2026'

export interface TestRenderInput {
  /** What the design shows. The lettering never changes it. */
  subject: string
  /** 1–3 lines; the backend applies the client's text-case rule at intake. */
  lines: PrintTextLine[]
  /** The version the render uses (approve_card p_style_card_id) and the card records. */
  styleCardId: string
}

/** The dialog's prefill: the client's name in upper case and "EST. 2026". */
export function defaultTestLines(client: Client): { headline: string; sub: string } {
  return { headline: client.name.toUpperCase(), sub: TEST_SUB_LINE_DEFAULT }
}

/** Headline + optional sub line → print lines; an empty sub line is dropped. */
export function buildTestLines(headline: string, sub: string): PrintTextLine[] {
  const lines: PrintTextLine[] = []
  if (headline.trim()) lines.push({ role: 'headline', text: headline.trim() })
  if (sub.trim()) lines.push({ role: 'sub', text: sub.trim() })
  return lines
}

/** Why the subject cannot be sent yet (the backend's checks, before the paid call), or null. */
export function testSubjectIssue(subject: string): string | null {
  const s = subject.trim()
  if (!s) return 'Give the test render a subject'
  if (s.length > TEST_SUBJECT_MAX) return `The subject is too long (${TEST_SUBJECT_MAX} characters max)`
  return null
}

/** The headline is the one line that must exist ('every text line needs text'); the sub line is optional. */
export function testHeadlineIssue(headline: string): string | null {
  return headline.trim() ? null : 'The headline needs text'
}

export interface TestSubmission {
  subject: string | null
  lines: PrintTextLine[]
  styleCardId: string | null
}

/**
 * What a test card was created with: `client_submission.subject / print_text / style_card_id`.
 * Cards from before studio_20 carry no subject or version; their lines come from `print_text`.
 */
export function readTestSubmission(card: Card): TestSubmission {
  const sub: Record<string, Json | undefined> = isRecord(card.client_submission) ? card.client_submission : {}
  const subject = typeof sub.subject === 'string' && sub.subject.trim() ? sub.subject.trim() : null
  const styleCardId = typeof sub.style_card_id === 'string' && sub.style_card_id ? sub.style_card_id : null
  const lines = parsePrintText(sub.print_text ?? card.print_text)
  return { subject, lines, styleCardId }
}

/**
 * The version number a test card renders with, for the status lines and the Generate dialog: the
 * version it records (the id approve_card is sent), else the one it was generated with, else the
 * version on show, which is what useTestRender falls back to for cards that record none.
 */
export function testCardVersion(card: Card, versions: readonly StyleCard[], shown: StyleCard): number {
  const recorded = readTestSubmission(card).styleCardId
  const match = recorded ? versions.find((v) => v.id === recorded) : undefined
  return match?.version ?? card.style_card_version ?? shown.version
}
