import { useId, type ReactNode, type Ref } from 'react'
import { panelCls } from '../style/classes'

type Tone = 'neutral' | 'good' | 'bad' | 'warn'

const TONE_CLASS: Record<Tone, string> = {
  neutral: '',
  good: 'border-emerald-300 dark:border-emerald-800',
  bad: 'border-red-300 dark:border-red-800',
  warn: 'border-amber-300 dark:border-amber-800',
}

/**
 * One panel of the client page: heading, optional subtitle and header actions, body.
 * `headingRef` makes the heading focusable (tabIndex -1) so a wizard can move focus to it.
 */
export function Section({
  title,
  subtitle,
  actions,
  children,
  tone = 'neutral',
  className = '',
  headingRef,
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
  tone?: Tone
  className?: string
  headingRef?: Ref<HTMLHeadingElement>
}) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className={`${panelCls} ${TONE_CLASS[tone]} ${className}`}>
      <header className="flex flex-wrap items-start justify-between gap-2 px-4 pb-2 pt-3 sm:px-5">
        <div className="min-w-0">
          <h2
            id={headingId}
            ref={headingRef}
            tabIndex={headingRef ? -1 : undefined}
            className="rounded text-sm font-semibold outline-none focus-visible:ring-4 focus-visible:ring-accent-500/30"
          >
            {title}
          </h2>
          {subtitle && <p className="mt-0.5 text-xs text-neutral-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className="px-4 pb-4 sm:px-5">{children}</div>
    </section>
  )
}
