import { Link } from 'react-router-dom'
import { Check, HelpCircle, X } from 'lucide-react'
import type { Json } from '../../lib/types'
import {
  cardReferencesLink,
  isArtStyleCheck,
  judgedAgainstArtReference,
  parseStyleMatch,
  styleCardValueAt,
  styleCheckLabel,
  styleFieldLink,
} from '../card/qc'

interface Props {
  /** `generations.qc_report` of the render (the test card's current generation). */
  report: Json | null | undefined
  clientId: string
  /** The rendered card: a red art-style chip opens its References panel (`/card/:id#references`). */
  cardId: string
  /**
   * `generations.magic_prompt_json` of the render: `effective_style.source = 'art_reference'` titles the
   * strip "Art style match" (the look came from the card's Art style reference, not the Style Card).
   */
  magicPrompt?: Json | null
  /**
   * The version the render used (`generations.style_card_id`, else the test card's recorded
   * `client_submission.style_card_id`): the red chips open it in the editor at the judged field.
   */
  styleCardId: string | null | undefined
  /** The SUBJECT the render was asked for (`client_submission.subject`, else `magic_prompt_json.subject.text`). */
  expectedSubject?: string | null
  /** The Style Card JSON of that version: each chip's tooltip shows the value the judge compared against. */
  styleCard?: Json | null
  className?: string
}

const CHIP = 'inline-flex max-w-full items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium'
const TONE = {
  pass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300',
  fail: 'bg-red-100 text-red-800 underline decoration-red-400 underline-offset-2 outline-none ring-red-500/30 hover:bg-red-200 focus-visible:ring-4 dark:bg-red-900/50 dark:text-red-200 dark:hover:bg-red-900/70',
  none: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400',
} as const

/**
 * QC's Style Card verdict for one render as a chip row (drop-in for TestRenderResult, spec 4.6):
 * one chip per `style_match` check — green passed, red failed (a link that opens the Style Card
 * editor at that field), grey not reported — then "Subject drawn: … · expected …". Renders
 * "not reported" for every report written before qc-judge v2.
 *
 * A render whose look came from the card's Art style reference is titled "Art style match"; the judge's
 * comparison with that image (check `art_style`) reads "Drawn like the Art style reference", its red chip
 * opens the card's References panel instead of the Style Card editor, and its notes follow on their own
 * line. Onboarding test renders always use the Style Card, so there this stays "Style match".
 */
export function StyleMatchStrip({ report, clientId, cardId, magicPrompt, styleCardId, expectedSubject, styleCard, className = '' }: Props) {
  const match = parseStyleMatch(report)
  const artLook = judgedAgainstArtReference(magicPrompt, match)

  if (!match) {
    return (
      <p className={`text-xs text-neutral-500 ${className}`}>
        <span className="font-medium text-neutral-600 dark:text-neutral-400">Style match:</span> not reported — this render was
        judged before the Style Card checks existed.
      </p>
    )
  }

  const subjectCheck = match.checks.find((c) => c.id === 'subject')
  const artChecks = match.checks.filter(isArtStyleCheck)
  // A not-reported art check already says so on its chip; the line carries what the judge saw.
  const artNotes = artChecks.filter((c) => c.pass !== null).map((c) => c.note).filter((n): n is string => Boolean(n))
  const artFailed = artChecks.some((c) => c.pass === false)
  const subjectTone =
    subjectCheck?.pass === false ? 'text-red-700 dark:text-red-300' : subjectCheck?.pass === true ? 'text-emerald-700 dark:text-emerald-300' : ''

  return (
    <div className={`space-y-1.5 ${className}`}>
      <ul className="flex flex-wrap items-center gap-1.5" aria-label={artLook ? 'Art style match' : 'Style match'}>
        <li className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
          {artLook ? 'Art style match' : 'Style match'}
          {match.score !== null ? ` ${match.score}%` : ''}
        </li>
        {match.checks.map((c, i) => {
          const label = styleCheckLabel(c.id)
          const art = isArtStyleCheck(c)
          const value = art ? null : styleCardValueAt(styleCard, c.field)
          const tooltip = [c.note, value ? `Style Card ${c.field}: ${value}` : null].filter(Boolean).join('\n') || undefined
          // More than one art_style check may arrive (one per differing aspect): the index keeps keys unique.
          const key = `${c.id}-${i}`
          if (c.pass === false) {
            const action = art ? 'Open the card’s References panel to compare with the Art style reference' : 'Open the editor at this field'
            return (
              <li key={key}>
                <Link
                  to={art ? cardReferencesLink(cardId) : styleFieldLink(clientId, styleCardId, c.field)}
                  title={tooltip ? `${tooltip}\n${action}` : action}
                  className={`${CHIP} ${TONE.fail}`}
                >
                  <X className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">{label}</span>
                  <span className="sr-only">{art ? 'failed, compare with the reference' : 'failed, fix in the editor'}</span>
                </Link>
              </li>
            )
          }
          const pass = c.pass === true
          return (
            <li key={key} title={tooltip ?? (pass ? undefined : 'Not reported by the judge')} className={`${CHIP} ${pass ? TONE.pass : TONE.none}`}>
              {pass ? <Check className="h-3 w-3 shrink-0" aria-hidden="true" /> : <HelpCircle className="h-3 w-3 shrink-0" aria-hidden="true" />}
              <span className="truncate">{label}</span>
              {!pass && <span className="font-normal">· not reported</span>}
              <span className="sr-only">{pass ? 'passed' : 'not reported'}</span>
            </li>
          )
        })}
      </ul>
      <p className={`text-xs ${subjectTone || 'text-neutral-600 dark:text-neutral-400'}`}>
        Subject drawn: <span className="font-medium">{match.subjectSeen ?? 'not reported'}</span>
        {expectedSubject && (
          <>
            {' '}
            · expected <span className="font-medium">{expectedSubject}</span>
          </>
        )}
        {match.caseSeen && <span className="text-neutral-500"> · case seen {match.caseSeen}</span>}
      </p>
      {artNotes.length > 0 && (
        <p className={`text-xs ${artFailed ? 'text-red-700 dark:text-red-300' : 'text-neutral-600 dark:text-neutral-400'}`}>
          Drawn like the Art style reference: <span className="font-medium">{artNotes.join('; ')}</span>
        </p>
      )}
    </div>
  )
}
