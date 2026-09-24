/**
 * The DM Studio mark: an "M" drawn as two rapier strokes on an accent tile, with a
 * small gold point. The same drawing is public/favicon.svg. Sizes via `className`
 * (h-8 w-8 by default).
 */
export function BrandMark({ className = 'h-8 w-8', title = 'DM Studio' }: { className?: string; title?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-accent-500 to-accent-700 text-white shadow-card ${className}`}
      role="img"
      aria-label={title}
    >
      <svg viewBox="0 0 32 32" className="h-[70%] w-[70%]" aria-hidden="true">
        <path
          d="M8 22.5 12 9.5l4 8 4-8 4 13"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="16" cy="24" r="1.6" fill="#f2c57c" />
      </svg>
    </span>
  )
}
