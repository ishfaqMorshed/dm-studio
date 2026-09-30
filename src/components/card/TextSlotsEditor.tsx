import { useEffect, useRef, type ComponentProps } from 'react'
import { prefersReducedMotion } from '../../lib/motion'
import { EditTextForm } from './EditTextForm'

/** The text slots in an accent frame beside the picture; scrolls itself into view when it appears. */
export function TextSlotsEditor(props: ComponentProps<typeof EditTextForm>) {
  const frameRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    frameRef.current?.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [])
  return (
    <div ref={frameRef} className="rounded-xl p-3 ring-1 ring-accent-300 dark:ring-accent-700">
      <EditTextForm {...props} />
    </div>
  )
}
