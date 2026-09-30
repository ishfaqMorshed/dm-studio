import { ImageOff } from 'lucide-react'
import { REFS_BUCKET } from '../../lib/supabase'
import type { ClientReference } from '../../lib/types'
import { useSignedUrl } from '../../lib/useSignedUrl'
import { checkerboard, imageChip } from '../card/styles'

/**
 * A square library thumbnail with its profiler number in the corner. Used by the evidence
 * strip, the "what is being read" strip and the mini-thumb stacks.
 */
export function RefThumb({
  ref_,
  number,
  className = 'h-[72px] w-[72px]',
  rounded = 'rounded-lg',
  showNumber = true,
  dim = false,
}: {
  ref_: ClientReference
  number: number | null
  className?: string
  rounded?: string
  showNumber?: boolean
  dim?: boolean
}) {
  const { url, broken } = useSignedUrl(REFS_BUCKET, ref_.path)
  const alt = `Image ${number ?? ''}${ref_.note?.trim() ? `: ${ref_.note.trim()}` : ''}`.trim()
  return (
    <span className={`relative block shrink-0 overflow-hidden border border-neutral-200 dark:border-neutral-800 ${rounded} ${checkerboard} ${className}`}>
      {broken ? (
        <span className="flex h-full w-full items-center justify-center text-neutral-400">
          <ImageOff className="h-4 w-4" aria-hidden="true" />
        </span>
      ) : url ? (
        <img
          src={url}
          alt={alt}
          loading="lazy"
          decoding="async"
          className={`h-full w-full object-cover ${dim ? 'opacity-50 grayscale' : ''}`}
        />
      ) : (
        <span className="block h-full w-full animate-pulse bg-neutral-200/60 dark:bg-neutral-800/60" />
      )}
      {showNumber && number !== null && (
        <span className={`absolute left-1 top-1 ${imageChip} !px-1.5 !py-0 tabular-nums`} aria-hidden="true">
          {number}
        </span>
      )}
    </span>
  )
}
