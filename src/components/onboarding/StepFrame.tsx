import { forwardRef, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Section } from '../clientPanel/Section'
import { btnPrimary, btnSecondary } from '../style/classes'

interface Props {
  title: ReactNode
  subtitle?: ReactNode
  /** Small status pill next to the title. */
  pill?: ReactNode
  actions?: ReactNode
  children: ReactNode
  tone?: 'neutral' | 'good' | 'bad' | 'warn'
  /** Hidden on the first step. */
  onBack?: () => void
  /** Continue never spends money: it only moves to the next step. */
  onContinue?: () => void
  continueLabel?: string
  /** When set, Continue is disabled and this reason is shown next to it. */
  continueDisabledReason?: string | null
  continueBusy?: boolean
  /** One line under the footer buttons. */
  footerHint?: ReactNode
}

/**
 * One wizard step: a Section with a focusable h2 (the shell moves focus here on a step
 * change), an optional pill and header actions, and the Back / Continue footer.
 */
export const StepFrame = forwardRef<HTMLHeadingElement, Props>(function StepFrame(
  {
    title,
    subtitle,
    pill,
    actions,
    children,
    tone = 'neutral',
    onBack,
    onContinue,
    continueLabel = 'Continue',
    continueDisabledReason = null,
    continueBusy = false,
    footerHint,
  },
  ref,
) {
  return (
    <Section
      headingRef={ref}
      tone={tone}
      title={
        <span className="inline-flex flex-wrap items-center gap-2 text-base">
          {title}
          {pill}
        </span>
      }
      subtitle={subtitle}
      actions={actions}
    >
      {children}
      {(onBack || onContinue) && (
        <div className="mt-5 border-t border-neutral-200 pt-3 dark:border-neutral-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {onBack ? (
              <button type="button" onClick={onBack} className={btnSecondary}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back
              </button>
            ) : (
              <span />
            )}
            {onContinue && (
              <span className="flex flex-wrap items-center justify-end gap-2">
                {continueDisabledReason && (
                  <span className="text-[11px] text-neutral-500">{continueDisabledReason}</span>
                )}
                <button
                  type="button"
                  onClick={onContinue}
                  disabled={continueDisabledReason !== null || continueBusy}
                  className={btnPrimary}
                >
                  {continueLabel}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </span>
            )}
          </div>
          {footerHint && <p className="mt-2 text-[11px] text-neutral-500">{footerHint}</p>}
        </div>
      )}
    </Section>
  )
})
