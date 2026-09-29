import { Cpu } from 'lucide-react'
import { generationPlatformLabel, type Generation } from '../../lib/types'
import { Badge } from './ui'

const chipCls = 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200'

function platformTitle(g: Pick<Generation, 'vendor' | 'platform'>, label: string): string {
  const ranOn = label.replace(/^Auto · /, '')
  if (g.platform !== 'auto') return `Made on ${ranOn}`
  return g.vendor?.trim().toLowerCase() === 'openrouter'
    ? 'Auto: Kie reported it was down, so OpenRouter made this one'
    : `Auto: made on ${ranOn}`
}

/**
 * The platform that produced a generation (`vendor`), prefixed with "Auto ·" when the
 * designer picked Auto. Renders nothing until a platform has run it.
 */
export function PlatformBadge({ generation, className = '' }: { generation: Pick<Generation, 'vendor' | 'platform'>; className?: string }) {
  const label = generationPlatformLabel(generation)
  if (!label) return null
  return (
    <Badge className={`${chipCls} ${className}`} title={platformTitle(generation, label)}>
      <Cpu className="h-3 w-3" aria-hidden="true" />
      {label}
    </Badge>
  )
}
