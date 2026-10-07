import { useId, useState } from 'react'
import { AlertTriangle, Loader2, Lock, Sparkles } from 'lucide-react'
import type { TestCard } from '../../lib/api'
import { parseStyleBrief, TEXT_CASE_LABEL } from '../../lib/styleBrief'
import type { Client, ClientReference, Settings } from '../../lib/types'
import { ROLE_COPY, roleHint, slotRoles } from '../brief/referenceRoles'
import { btnPrimary, btnSecondary, hintCls, inputCls, labelCls } from '../style/classes'
import { Modal } from '../style/Modal'
import type { StyleCardDoc } from '../style/styleCardSchema'
import { COST_SUFFIX, TEST_RENDER_COST_LABEL } from './costs'
import { RefThumb } from './RefThumb'
import { testRefsRule, testRenderReferences } from './testRenderRefs'
import {
  buildTestLines,
  defaultTestLines,
  readTestSubmission,
  TEST_SUBJECT_MAX,
  testHeadlineIssue,
  testSubjectIssue,
  type TestRenderInput,
} from './testRenderInput'

/**
 * 'lock_render': lock the draft, then render with it · 'render': render with the current locked
 * version · 'generate': approve a card already at review (its subject and lines are set).
 */
export type TestRenderDialogMode = 'lock_render' | 'render' | 'generate'

/** The dialog's result: the subject and lines to render; the step adds the version. */
export type TestRenderDraft = Pick<TestRenderInput, 'subject' | 'lines'>

const CHIP =
  'inline-flex max-w-full items-center rounded-md px-2 py-0.5 text-xs font-medium outline-none ring-accent-500/30 transition focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-50 dark:ring-accent-400/40'
const CHIP_IDLE = 'bg-neutral-100 text-neutral-800 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700'
const CHIP_ON = 'bg-accent-50 text-accent-900 ring-2 ring-accent-500/40 dark:bg-accent-950/50 dark:text-accent-200'
/** Label of one input inside a fieldset (the fieldset's legend carries the labelCls). */
const subLabelCls = 'mb-1 block text-[11px] leading-4 text-neutral-500'
/** hintCls in red, for the one check that blocks the primary button. */
const issueCls = 'mt-1 text-[11px] leading-4 text-red-700 dark:text-red-300'

/**
 * Confirms the paid test render: the SUBJECT the design shows (the lettering never changes it),
 * the text lines, the lock note when the draft is locked first, which references go in, and what
 * it costs. Enter in a field confirms; the primary button is disabled until the input is valid
 * and while `blockedReason` says the lock or the render cannot happen (the step checks it again).
 */
export function TestRenderDialog({
  open,
  client,
  version,
  subjects,
  read,
  library,
  settings = null,
  doc = null,
  warnings = [],
  mode,
  card = null,
  blockedReason = null,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean
  client: Client
  /** The version number the render uses: the draft about to be locked, the current locked one, or the one a review-stage card records. */
  version: number
  /** The version's subjects: the first prefills the subject, all of them are chips. */
  subjects: string[]
  /** The ticked images in profiler order; the reference preview falls back to it without `library`. */
  read: ClientReference[]
  /** The whole library, to preview the references the backend attaches (see testRenderRefs.ts). */
  library?: readonly ClientReference[]
  /** For the slot order the backend stamps on the test card. */
  settings?: Settings | null
  /** The version the render uses, for its representative images. */
  doc?: StyleCardDoc | null
  /** 'lock_render' only: the lock gate's warnings, shown before the designer locks. */
  warnings?: readonly string[]
  mode: TestRenderDialogMode
  /** 'generate' only: the review-stage card, whose recorded subject and lines are shown. */
  card?: TestCard | null
  /** Why the lock / render is refused right now (a blocking schema issue, paused pipeline, …): shown, and the primary button is disabled. */
  blockedReason?: string | null
  busy: boolean
  onCancel: () => void
  /** `note` is the lock note ('lock_render' only; empty otherwise). */
  onConfirm: (draft: TestRenderDraft, note: string) => void
}) {
  const ids = { form: useId(), subject: useId(), headline: useId(), sub: useId(), note: useId() }
  const defaults = defaultTestLines(client)
  const [subject, setSubject] = useState(subjects[0] ?? '')
  const [headline, setHeadline] = useState(defaults.headline)
  const [sub, setSub] = useState(defaults.sub)
  const [note, setNote] = useState('')

  const refs = testRenderReferences(doc, library ?? read, slotRoles(settings))
  const garment = client.garment_colors[0] ?? 'black'
  const textCase = parseStyleBrief(client.style_brief).text_case
  const caseNote =
    textCase === 'as_typed'
      ? `Printed as typed (${client.name}'s text-case rule).`
      : `${client.name}'s text-case rule (${TEXT_CASE_LABEL[textCase]}) is applied at intake.`
  const v = version

  const subjectIssue = testSubjectIssue(subject)
  const headlineIssue = testHeadlineIssue(headline)
  const issue = mode === 'generate' ? null : subjectIssue ?? headlineIssue
  const submission = card ? readTestSubmission(card) : null

  const title = mode === 'lock_render' ? `Lock v${v} & test render` : mode === 'render' ? `Test render with v${v}` : `Generate with v${v}`
  const description =
    mode === 'lock_render'
      ? `v${v} is locked first, so this render is exactly what every new brief for ${client.name} gets. Not right? Adjust in the editor and lock the next version.`
      : mode === 'render'
        ? `One new design in this look, rendered with locked v${v}: what every new brief for ${client.name} gets.`
        : `The references of this card were already read (paid). Generate renders it with v${v}.`

  function submit() {
    if (busy || blockedReason || issue) return
    if (mode === 'generate') {
      onConfirm({ subject: submission?.subject ?? '', lines: submission?.lines ?? [] }, '')
      return
    }
    onConfirm({ subject: subject.trim(), lines: buildTestLines(headline, sub) }, mode === 'lock_render' ? note : '')
  }

  const costLine = (
    <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      {TEST_RENDER_COST_LABEL} {COST_SUFFIX}. Hidden from the board and Completed; nothing is delivered to the client. It
      occupies one generation slot while it runs.
    </p>
  )

  return (
    <Modal
      open={open}
      onClose={onCancel}
      closeDisabled={busy}
      title={title}
      description={description}
      footer={
        <>
          <button type="button" onClick={onCancel} disabled={busy} className={btnSecondary}>
            Cancel
          </button>
          <button
            type="submit"
            form={ids.form}
            disabled={busy || blockedReason !== null || issue !== null}
            title={blockedReason ?? issue ?? undefined}
            className={btnPrimary}
            data-autofocus={mode === 'generate' ? true : undefined}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : mode === 'lock_render' ? (
              <Lock className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            )}
            {mode === 'lock_render'
              ? `Lock v${v} & render`
              : mode === 'render'
                ? `Render for ${TEST_RENDER_COST_LABEL}`
                : `Generate for ${TEST_RENDER_COST_LABEL}`}
          </button>
        </>
      }
    >
      <form
        id={ids.form}
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        className="space-y-4 text-sm"
      >
        {blockedReason && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
          >
            <p className="mb-0.5 flex items-center gap-1.5 font-medium">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              {mode === 'lock_render' ? 'Cannot lock yet' : 'Cannot render yet'}
            </p>
            <p className="text-xs">{blockedReason}</p>
          </div>
        )}

        {mode === 'lock_render' && warnings.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            <p className="mb-0.5 font-medium">Worth a second look before locking</p>
            <ul className="list-disc space-y-0.5 pl-4">
              {warnings.map((w) => (
                <li key={w} className="break-words">
                  {w}
                </li>
              ))}
            </ul>
          </div>
        )}

        {mode === 'generate' ? (
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
            <dt className="text-neutral-500">Subject</dt>
            <dd>{submission?.subject ?? `v${v}'s first subject`}</dd>
            <dt className="text-neutral-500">Text</dt>
            <dd>{submission?.lines.length ? submission.lines.map((l) => l.text).join(' / ') : '—'}</dd>
            <dt className="text-neutral-500">Style Card</dt>
            <dd>v{v}</dd>
          </dl>
        ) : (
          <>
            <div>
              <label htmlFor={ids.subject} className={labelCls}>
                Subject
              </label>
              <input
                id={ids.subject}
                data-autofocus
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={busy}
                required
                maxLength={TEST_SUBJECT_MAX}
                autoComplete="off"
                placeholder="What the design shows, e.g. Highland cow"
                aria-invalid={subjectIssue !== null}
                className={inputCls}
              />
              {subjects.length > 0 && (
                <ul aria-label={`Subjects of v${v}`} className="mt-1.5 flex flex-wrap gap-1.5">
                  {subjects.map((s) => {
                    const on = s.trim().toLowerCase() === subject.trim().toLowerCase()
                    return (
                      <li key={s} className="max-w-full">
                        <button
                          type="button"
                          onClick={() => setSubject(s)}
                          disabled={busy}
                          aria-pressed={on}
                          className={`${CHIP} ${on ? CHIP_ON : CHIP_IDLE}`}
                        >
                          <span className="truncate">{s}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
              <p className={subjectIssue ? issueCls : hintCls} role={subjectIssue ? 'alert' : undefined}>
                {subjectIssue ??
                  (subjects.length ? `From v${v}'s subjects. The lettering below never changes it.` : `v${v} lists no subjects: type one. The lettering below never changes it.`)}
              </p>
            </div>

            <fieldset>
              <legend className={labelCls}>Text lines</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label htmlFor={ids.headline} className={subLabelCls}>
                    Headline
                  </label>
                  <input
                    id={ids.headline}
                    type="text"
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                    disabled={busy}
                    required
                    autoComplete="off"
                    aria-invalid={headlineIssue !== null}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label htmlFor={ids.sub} className={subLabelCls}>
                    Sub line (optional)
                  </label>
                  <input
                    id={ids.sub}
                    type="text"
                    value={sub}
                    onChange={(e) => setSub(e.target.value)}
                    disabled={busy}
                    autoComplete="off"
                    className={inputCls}
                  />
                </div>
              </div>
              <p className={headlineIssue ? issueCls : hintCls} role={headlineIssue ? 'alert' : undefined}>
                {headlineIssue ?? caseNote}
              </p>
            </fieldset>

            {mode === 'lock_render' && (
              <div>
                <label htmlFor={ids.note} className={labelCls}>
                  Lock note (optional)
                </label>
                <textarea
                  id={ids.note}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={busy}
                  rows={2}
                  placeholder="What changed in this version, e.g. added rust accent, banned gradients"
                  className={`${inputCls} resize-y`}
                />
                <p className={hintCls}>Shown in the versions list so the team knows why v{v} exists.</p>
              </div>
            )}

            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">Used as references</p>
              {refs.length ? (
                <ul className="flex gap-3" aria-label="Reference images for the test render">
                  {refs.map((p, i) => (
                    <li key={p.ref.id} className="w-16">
                      <RefThumb ref_={p.ref} number={i + 1} className="h-16 w-16" />
                      <span className="mt-0.5 block truncate text-[10px] text-neutral-500" title={roleHint(p.role, 'style_test')}>
                        {ROLE_COPY[p.role].label}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-red-700 dark:text-red-300">No ticked images: the backend will refuse the render.</p>
              )}
              <p className={hintCls}>
                {refs.length ? `${testRefsRule(refs)} ` : ''}Garment {garment} · front chest · similarity tier 1 (style only, new composition).
              </p>
            </div>
          </>
        )}

        {costLine}
      </form>
    </Modal>
  )
}
