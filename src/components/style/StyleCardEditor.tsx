import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, GitBranchPlus, Loader2, Lock, PencilLine, Save } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { lockStyleCard, newStyleCardVersion } from '../../lib/api'
import { errorMessage, isRecord, type Client, type StyleCard } from '../../lib/types'
import { useToast } from '../../lib/useToast'
import { DeleteButton } from '../DeleteButton'
import { btnPrimary, btnSecondary } from './classes'
import { formatDateTime } from './format'
import { LockDialog } from './LockDialog'
import { RawJsonPanel } from './RawJsonPanel'
import { StyleCardForm } from './StyleCardForm'
import {
  isEmptyStyleCardJson,
  normalizeStyleCard,
  prettyJson,
  styleCardIssues,
  styleCardToJson,
  type StyleCardDoc,
} from './styleCardSchema'

interface Props {
  version: StyleCard
  client: Client
  /** True when this is the highest locked version. */
  isCurrent: boolean
  /** True when another draft already exists (blocks "new draft from this version"). */
  draftExists: boolean
  names: ReadonlyMap<string, string>
  /** Re-fetch versions after a mutation. */
  onChanged: () => Promise<void>
  /** Lets the page guard navigation away from unsaved edits. */
  onDirtyChange: (dirty: boolean) => void
  /** Called with the new version id after a draft is created or this one is discarded. */
  onSelectVersion: (id: string | null) => void
}

/**
 * Edits one Style Card version. Drafts are editable (form + raw JSON kept in sync);
 * locked versions render read-only with "start a draft from this version".
 * Mount with `key={version.id}` so switching versions resets the local state.
 */
export function StyleCardEditor({
  version,
  client,
  isCurrent,
  draftExists,
  names,
  onChanged,
  onDirtyChange,
  onSelectVersion,
}: Props) {
  const toast = useToast()
  const editable = version.status === 'draft'

  const serverDoc = useMemo(() => normalizeStyleCard(version.json), [version.json])
  const baseline = useMemo(() => prettyJson(serverDoc), [serverDoc])

  const [doc, setDoc] = useState<StyleCardDoc>(serverDoc)
  const [raw, setRaw] = useState<string>(baseline)
  const [rawError, setRawError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [locking, setLocking] = useState(false)
  const [lockOpen, setLockOpen] = useState(false)
  const [branching, setBranching] = useState(false)
  const [changedElsewhere, setChangedElsewhere] = useState(false)

  const current = useMemo(() => prettyJson(doc), [doc])
  const dirty = editable && current !== baseline

  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  // The list polls every 20 s, so the server JSON can move while this is open. Adopt it when
  // the designer has no local edits (relative to the baseline they started from); otherwise
  // keep theirs and say so. Done during render, the React-documented way to react to a prop
  // change without an extra effect pass.
  const [prevBaseline, setPrevBaseline] = useState(baseline)
  if (baseline !== prevBaseline) {
    const hadLocalEdits = current !== prevBaseline
    setPrevBaseline(baseline)
    if (!hadLocalEdits) {
      setDoc(serverDoc)
      setRaw(baseline)
      setRawError(null)
    } else if (current !== baseline) {
      setChangedElsewhere(true)
    }
  }

  const applyForm = useCallback((next: StyleCardDoc) => {
    setDoc(next)
    setRaw(prettyJson(next))
    setRawError(null)
  }, [])

  const applyRaw = useCallback((text: string) => {
    setRaw(text)
    try {
      const parsed: unknown = JSON.parse(text)
      if (!isRecord(parsed)) throw new Error('the Style Card must be a JSON object ({ … })')
      setDoc(normalizeStyleCard(parsed))
      setRawError(null)
    } catch (e) {
      setRawError(e instanceof Error ? e.message : 'unreadable')
    }
  }, [])

  const formatRaw = useCallback(() => {
    if (rawError === null) setRaw(prettyJson(doc))
  }, [doc, rawError])

  const issues = useMemo(() => styleCardIssues(doc), [doc])

  /** Writes the draft; resolves true on success. Toasts on both outcomes unless `quiet`. */
  const save = useCallback(
    async (quiet = false): Promise<boolean> => {
      if (rawError !== null) {
        toast.error(`The raw JSON is not valid (${rawError}). Fix it or use Format before saving.`)
        return false
      }
      setSaving(true)
      try {
        const { data, error } = await supabase
          .from('style_cards')
          .update({ json: styleCardToJson(doc) })
          .eq('id', version.id)
          .eq('status', 'draft')
          .select('id')
          .maybeSingle()
        if (error) throw new Error(error.message)
        if (!data) {
          throw new Error('this version is no longer a draft, so it cannot be changed. Reload to see who locked it.')
        }
        setChangedElsewhere(false)
        if (!quiet) toast.success(`Draft v${version.version} saved`)
        await onChanged()
        return true
      } catch (e) {
        toast.error(`Save failed: ${errorMessage(e)}`)
        return false
      } finally {
        setSaving(false)
      }
    },
    [doc, onChanged, rawError, toast, version.id, version.version],
  )

  const willSaveFirst = dirty || isEmptyStyleCardJson(version.json)

  const lock = useCallback(
    async (note: string) => {
      setLocking(true)
      try {
        if (willSaveFirst) {
          const ok = await save(true)
          if (!ok) return
        }
        const locked = await lockStyleCard(version.id, note.trim() || null)
        setLockOpen(false)
        toast.success(`v${locked.version} locked. New cards for ${client.name} will use it.`)
        await onChanged()
      } catch (e) {
        toast.error(`Lock failed: ${errorMessage(e)}`)
      } finally {
        setLocking(false)
      }
    },
    [client.name, onChanged, save, toast, version.id, willSaveFirst],
  )

  const discard = useCallback(async () => {
    const { error } = await supabase.from('style_cards').delete().eq('id', version.id).eq('status', 'draft')
    if (error) {
      toast.error(`Discard failed: ${error.message}`)
      return
    }
    toast.success(`Draft v${version.version} discarded`)
    onSelectVersion(null)
    await onChanged()
  }, [onChanged, onSelectVersion, toast, version.id, version.version])

  const branch = useCallback(async () => {
    setBranching(true)
    try {
      const created = await newStyleCardVersion(client.id, version.json)
      toast.success(`Draft v${created.version} started from v${version.version}`)
      await onChanged()
      onSelectVersion(created.id)
    } catch (e) {
      toast.error(`Could not start a draft: ${errorMessage(e)}`)
    } finally {
      setBranching(false)
    }
  }, [client.id, onChanged, onSelectVersion, toast, version.json, version.version])

  const who = (id: string | null) => (id ? (names.get(id) ?? 'a teammate') : null)
  const busy = saving || locking

  return (
    <div className="flex flex-col">
      {/* Header: what this version is and what you can do with it */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800 sm:px-5">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold">
            v{version.version}
            {editable ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                <PencilLine className="h-3 w-3" />
                Draft
              </span>
            ) : isCurrent ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
                <CheckCircle2 className="h-3 w-3" />
                Current locked version
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-neutral-200 px-2 py-0.5 text-[11px] font-medium text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
                <Lock className="h-3 w-3" />
                Locked · superseded
              </span>
            )}
            {dirty && (
              <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300">Unsaved changes</span>
            )}
          </h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            {editable
              ? `Started ${formatDateTime(version.created_at)}${who(version.created_by) ? ` by ${who(version.created_by)}` : ''}. Save as often as you like; Lock when it is the contract.`
              : `Locked ${formatDateTime(version.locked_at)}${who(version.locked_by) ? ` by ${who(version.locked_by)}` : ''}. Read-only; start a new version to change anything.`}
          </p>
          {version.note && !editable && (
            <p className="mt-1 text-sm text-neutral-700 dark:text-neutral-300">{version.note}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {editable ? (
            <>
              <DeleteButton
                variant="button"
                label="Discard draft"
                ariaLabel={`Discard draft v${version.version}`}
                onConfirm={discard}
                disabled={busy}
                disabledReason="Wait for the current save to finish"
              />
              <button
                type="button"
                onClick={() => void save()}
                disabled={busy || !dirty || rawError !== null}
                title={rawError !== null ? 'Fix the raw JSON first' : !dirty ? 'Nothing changed since the last save' : undefined}
                className={btnSecondary}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save draft
              </button>
              <button
                type="button"
                onClick={() => setLockOpen(true)}
                disabled={busy || rawError !== null}
                title={rawError !== null ? 'Fix the raw JSON first' : 'Make this the client’s Style Card'}
                className={btnPrimary}
              >
                <Lock className="h-4 w-4" />
                Lock…
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => void branch()}
              disabled={branching || draftExists}
              title={
                draftExists
                  ? 'There is already an open draft. Lock or discard it first.'
                  : `Copy v${version.version} into a new editable draft`
              }
              className={btnSecondary}
            >
              {branching ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitBranchPlus className="h-4 w-4" />}
              New draft from v{version.version}
            </button>
          )}
        </div>
      </div>

      {changedElsewhere && (
        <div
          role="status"
          className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200 sm:px-5"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Someone else saved this draft while you were editing. Saving now overwrites their version; reload the page
            to see theirs instead.
          </span>
        </div>
      )}

      <div className="space-y-5 px-4 py-4 sm:px-5">
        <StyleCardForm
          doc={doc}
          onChange={applyForm}
          disabled={!editable || busy}
          garmentColorSuggestions={client.garment_colors}
        />
        <RawJsonPanel
          text={raw}
          onTextChange={applyRaw}
          error={rawError}
          onFormat={formatRaw}
          readOnly={!editable || busy}
        />
      </div>

      {lockOpen && (
        <LockDialog
          open
          version={version.version}
          clientName={client.name}
          issues={issues}
          willSaveFirst={willSaveFirst}
          busy={locking}
          onCancel={() => setLockOpen(false)}
          onConfirm={(note) => void lock(note)}
        />
      )}
    </div>
  )
}
