import { Link } from 'react-router-dom'
import { Check, HelpCircle, X } from 'lucide-react'
import type { Json } from '../../lib/types'
import { parseStyleMatch, styleCardValueAt, styleCheckLabel, styleFieldLink } from '../card/qc'

interface Props {
  /** `generations.qc_report` of the render (the test card's current generation). */
  report: Json | null | undefined
  clientId: string
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
 */
export function StyleMatchStrip({ report, clientId, styleCardId, expectedSubject, styleCard, className = '' }: Props) {
  const match = parseStyleMatch(report)

  if (!match) {
    return (
      <p className={`text-xs text-neutral-500 ${className}`}>
        <span className="font-medium text-neutral-600 dark:text-neutral-400">Style match:</span> not reported — this render was
        judged before the Style Card checks existed.
      </p>
    )
  }

  const subjectCheck = match.checks.find((c) => c.id === 'subject')
  const subjectTone =
    subjectCheck?.pass === false ? 'text-red-700 dark:text-red-300' : subjectCheck?.pass === true ? 'text-emerald-700 dark:text-emerald-300' : ''

  return (
    <div className={`space-y-1.5 ${className}`}>
      <ul className="flex flex-wrap items-center gap-1.5" aria-label="Style match">
        <li className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
          Style match{match.score !== null ? ` ${match.score}%` : ''}
        </li>
        {match.checks.map((c) => {
          const label = styleCheckLabel(c.id)
          const value = styleCardValueAt(styleCard, c.field)
          const tooltip = [c.note, value ? `Style Card ${c.field}: ${value}` : null].filter(Boolean).join('\n') || undefined
          if (c.pass === false) {
            return (
              <li key={c.id}>
                <Link
                  to={styleFieldLink(clientId, styleCardId, c.field)}
                  title={tooltip ? `${tooltip}\nOpen the editor at this field` : 'Open the editor at this field'}
                  className={`${CHIP} ${TONE.fail}`}
                >
                  <X className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">{label}</span>
                  <span className="sr-only">failed, fix in the editor</span>
                </Link>
              </li>
            )
          }
          const pass = c.pass === true
          return (
            <li key={c.id} title={tooltip ?? (pass ? undefined : 'Not reported by the judge')} className={`${CHIP} ${pass ? TONE.pass : TONE.none}`}>
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
    </div>
  )
}
