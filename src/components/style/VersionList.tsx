import { CheckCircle2, Loader2, Lock, PencilLine, Plus } from 'lucide-react'
import type { StyleCard } from '../../lib/types'
import { btnPrimary } from './classes'
import { formatDateTime } from './format'

interface Props {
  versions: StyleCard[]
  selectedId: string | null
  /** Highest locked version; the one new cards snapshot. */
  currentId: string | null
  /** user_id → display name for locked_by / created_by. */
  names: ReadonlyMap<string, string>
  onSelect: (id: string) => void
  onNewVersion: () => void
  creating: boolean
  /** Version number of the open draft, if any; disables New version with a reason. */
  openDraft: number | null
}

export function VersionList({
  versions,
  selectedId,
  currentId,
  names,
  onSelect,
  onNewVersion,
  creating,
  openDraft,
}: Props) {
  const who = (id: string | null) => (id ? (names.get(id) ?? 'a teammate') : null)
  const newDisabledReason =
    openDraft !== null ? `v${openDraft} is still a draft. Lock or discard it before starting another.` : undefined

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <h2 className="text-sm font-semibold">
          Versions
          <span className="ml-2 rounded-full bg-neutral-200 px-2 py-0.5 text-xs tabular-nums dark:bg-neutral-800">
            {versions.length}
          </span>
        </h2>
        <button
          type="button"
          onClick={onNewVersion}
          disabled={creating || openDraft !== null}
          title={newDisabledReason ?? (currentId ? 'Start a draft copied from the current locked version' : 'Start the first draft')}
          className={`${btnPrimary} px-2.5 py-1.5 text-xs`}
        >
          {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          New version
        </button>
      </div>
      {newDisabledReason && (
        <p className="px-4 pb-2 text-[11px] text-neutral-500">{newDisabledReason}</p>
      )}

      <ul className="divide-y divide-neutral-200 border-t border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
        {versions.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-neutral-500">
            No versions yet. One is drafted from the client's first card, or start one now.
          </li>
        )}
        {versions.map((v) => {
          const isCurrent = v.id === currentId
          const isSelected = v.id === selectedId
          const locked = v.status === 'locked'
          return (
            <li key={v.id}>
              <button
                type="button"
                onClick={() => onSelect(v.id)}
                aria-current={isSelected ? 'true' : undefined}
                className={`block w-full px-4 py-3 text-left outline-none ring-inset ring-neutral-900/10 focus-visible:ring-4 dark:ring-white/20 ${
                  isSelected
                    ? 'bg-neutral-100 dark:bg-neutral-800/70'
                    : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/40'
                } ${isCurrent ? 'border-l-4 border-emerald-500 pl-3' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold tabular-nums">v{v.version}</span>
                  {locked ? (
                    isCurrent ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
                        <CheckCircle2 className="h-3 w-3" />
                        Current
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-neutral-200 px-2 py-0.5 text-[11px] font-medium text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
                        <Lock className="h-3 w-3" />
                        Superseded
                      </span>
                    )
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                      <PencilLine className="h-3 w-3" />
                      Draft
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-neutral-500">
                  {locked
                    ? `Locked ${formatDateTime(v.locked_at)}${who(v.locked_by) ? ` by ${who(v.locked_by)}` : ''}`
                    : `Started ${formatDateTime(v.created_at)}${who(v.created_by) ? ` by ${who(v.created_by)}` : ''}`}
                </p>
                {v.note && (
                  <p className="mt-1 line-clamp-2 text-xs text-neutral-700 dark:text-neutral-300" title={v.note}>
                    {v.note}
                  </p>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
