import { useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, PauseCircle, Play, RotateCcw } from 'lucide-react'
import { GENS_BUCKET, supabase } from '../lib/supabase'
import { useToast } from '../lib/useToast'
import { useProfile } from '../lib/useProfile'
import { useSettings } from '../lib/useSettings'
import { useSignedUrl } from '../lib/useSignedUrl'
import { STAGE_LABEL, isStageLocked } from '../lib/stage'
import {
  acceptGeneration,
  approveCard,
  duplicateCard,
  parkCard,
  requestEdit,
  resumeCard,
  retryCard,
  setCurrentGeneration,
} from '../lib/api'
import { ACTIVE_JOB_STATUSES, errorMessage, parsePrintText, type Generation, type Json } from '../lib/types'
import { safeFileName } from '../lib/download'
import { useCardFinJobs, useCardGenerations, useCardRow, useStyleCard } from '../components/card/useCardData'
import { useNow } from '../components/card/useNow'
import { formatUsd, n8nExecutionUrl } from '../components/card/format'
import { jsonFromSections, sectionSignature, sectionsFromJson, type PromptSection } from '../components/card/magicPrompt'
import { buildMaskPng, uploadMask } from '../components/card/mask'
import { btnPrimary, btnSecondary, panelCls } from '../components/card/styles'
import { Panel, Spinner } from '../components/card/ui'
import { CardHeader, type ExecutionLink } from '../components/card/CardHeader'
import { BriefEditor } from '../components/card/BriefEditor'
import { ReferencesPanel } from '../components/card/ReferencesPanel'
import { StyleCardPanel } from '../components/card/StyleCardPanel'
import { GenerationStrip } from '../components/card/GenerationStrip'
import { Preview } from '../components/card/Preview'
import { QcReportPanel } from '../components/card/QcReportPanel'
import { MagicPromptEditor } from '../components/card/MagicPromptEditor'
import { ActionBar } from '../components/card/ActionBar'
import { ApproveDialog } from '../components/card/ApproveDialog'
import { AcceptDialog } from '../components/card/AcceptDialog'
import { EditTextDialog, type EditTextSubmit } from '../components/card/EditTextDialog'
import { EditRegionDialog, type EditRegionSubmit } from '../components/card/EditRegionDialog'
import { RegenerateDialog, type RegenerateSubmit } from '../components/card/RegenerateDialog'
import { ParkDialog } from '../components/card/ParkDialog'

type DialogKind = 'approve' | 'accept' | 'edit_text' | 'edit_region' | 'regenerate' | 'park'

interface PromptDraft {
  /** Generation the draft belongs to. */
  key: string | null
  /** Signature of the stored prompt the draft started from. */
  baseSig: string
  sections: PromptSection[]
}

/** The parent when it has an image, else the newest older generation with one (`all` is newest-first). */
function findPrevious(all: Generation[], viewed: Generation | null): Generation | null {
  if (!viewed) return null
  if (viewed.parent_generation_id) {
    const parent = all.find((g) => g.id === viewed.parent_generation_id)
    if (parent?.image_path) return parent
  }
  return all.find((g) => g.id !== viewed.id && g.image_path && g.created_at < viewed.created_at) ?? null
}

export default function CardPage() {
  const { id } = useParams<{ id: string }>()
  if (!id) return <Navigate to="/board" replace />
  // Keyed so every hook remounts when the designer jumps to another card (e.g. after Duplicate).
  return <CardView key={id} cardId={id} />
}

function CardView({ cardId }: { cardId: string }) {
  const toast = useToast()
  const navigate = useNavigate()
  const { isLead } = useProfile()
  const { settings, paused } = useSettings()
  const now = useNow()

  const { card, loading, error, refresh: refreshCard, upsertLocal: upsertCard } = useCardRow(cardId)
  const generations = useCardGenerations(cardId)
  const finJobs = useCardFinJobs(cardId)
  const styleCardState = useStyleCard(card?.client_id ?? null)

  const [viewedId, setViewedId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogKind | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const current = useMemo(
    () => generations.rows.find((g) => g.id === card?.current_generation_id) ?? null,
    [generations.rows, card?.current_generation_id],
  )
  const viewed = useMemo(
    () => (viewedId ? generations.rows.find((g) => g.id === viewedId) : null) ?? current,
    [generations.rows, viewedId, current],
  )
  const previous = useMemo(() => findPrevious(generations.rows, viewed), [generations.rows, viewed])
  const runningGeneration = useMemo(
    () => generations.rows.find((g) => ACTIVE_JOB_STATUSES.includes(g.status)) ?? null,
    [generations.rows],
  )
  const latestFinJob = finJobs.rows[0] ?? null
  const currentImage = useSignedUrl(GENS_BUCKET, current?.image_path)

  // Magic prompt draft: follows the current generation, adopts server changes while untouched.
  const baseSections = useMemo(() => sectionsFromJson(current?.magic_prompt_json), [current?.magic_prompt_json])
  const baseSig = sectionSignature(baseSections)
  const currentKey = current?.id ?? null
  const [draft, setDraft] = useState<PromptDraft>({ key: currentKey, baseSig, sections: baseSections })
  const promptDirty = sectionSignature(draft.sections) !== draft.baseSig
  if (draft.key !== currentKey || (draft.baseSig !== baseSig && !promptDirty)) {
    setDraft({ key: currentKey, baseSig, sections: baseSections })
  }
  const setSections = (sections: PromptSection[]) => setDraft((d) => ({ ...d, sections }))
  const resetSections = () => setDraft({ key: currentKey, baseSig, sections: baseSections })

  const price = formatUsd(settings?.per_card_price_usd)
  const locked = card ? isStageLocked(card.stage) : true
  const fileBase = safeFileName(card?.clients?.name ?? 'design', 'design')

  const executionLinks = useMemo<ExecutionLink[]>(() => {
    if (!isLead || !card) return []
    const base = settings?.n8n_base_url
    const out: ExecutionLink[] = []
    const cardUrl = n8nExecutionUrl(base, card.n8n_execution_id)
    if (cardUrl) out.push({ label: 'card', url: cardUrl })
    const genUrl = n8nExecutionUrl(base, viewed?.n8n_execution_id)
    if (genUrl && !out.some((l) => l.url === genUrl)) out.push({ label: 'generation', url: genUrl })
    const finUrl = n8nExecutionUrl(base, latestFinJob?.n8n_execution_id)
    if (finUrl && !out.some((l) => l.url === finUrl)) out.push({ label: 'finisher', url: finUrl })
    return out
  }, [isLead, card, settings?.n8n_base_url, viewed?.n8n_execution_id, latestFinJob?.n8n_execution_id])

  /** Runs one mutation with the busy flag; errors surface as toasts with the Postgres message. */
  async function run<T>(key: string, fn: () => Promise<T>, onOk: (result: T) => void): Promise<void> {
    if (busy) return
    setBusy(key)
    try {
      const result = await fn()
      onOk(result)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  const closeDialog = () => setDialog(null)

  function onApprove() {
    if (!card) return
    void run(
      'approve',
      () => approveCard(card.id),
      (c) => {
        upsertCard(c)
        void generations.refresh()
        closeDialog()
        toast.success(`Approved — queued for generation${price ? ` at ${price}` : ''}`)
      },
    )
  }

  function onAccept() {
    if (!current) return
    void run(
      'accept',
      () => acceptGeneration(current.id),
      (job) => {
        finJobs.upsertLocal(job)
        void refreshCard()
        closeDialog()
        toast.success('Sent to the finisher — the card is now finishing')
      },
    )
  }

  function onEditText({ oldText, newText, instruction, updateBrief }: EditTextSubmit) {
    if (!card || !current) return
    void run(
      'edit_text',
      async () => {
        if (updateBrief) {
          const lines = parsePrintText(card.print_text)
          const idx = lines.findIndex((l) => l.text === oldText)
          if (idx >= 0) {
            const next = lines.map((l, i) => ({ role: l.role, text: i === idx ? newText : l.text }))
            const { data, error: err } = await supabase.from('cards').update({ print_text: next }).eq('id', card.id).select('*').single()
            if (err) throw new Error(`The brief line was not updated (${err.message}), so nothing was queued.`)
            upsertCard(data)
          }
        }
        return requestEdit(current.id, 'edit_text', { old_text: oldText, new_text: newText, instruction: instruction || null })
      },
      (child) => {
        generations.upsertLocal(child)
        void refreshCard()
        closeDialog()
        toast.success('Text edit queued — the card is now editing')
      },
    )
  }

  function onEditRegion({ rect, natural, instruction }: EditRegionSubmit) {
    if (!card || !current) return
    void run(
      'edit_region',
      async () => {
        const blob = await buildMaskPng(natural.w, natural.h, rect)
        const maskPath = await uploadMask(card.id, current.id, blob)
        return requestEdit(current.id, 'edit_region', { mask_path: maskPath, instruction })
      },
      (child) => {
        generations.upsertLocal(child)
        void refreshCard()
        closeDialog()
        toast.success('Region edit queued — the card is now editing')
      },
    )
  }

  function onRegenerate({ reason, note }: RegenerateSubmit) {
    if (!current) return
    let prompt: Json | null = null
    if (promptDirty) {
      try {
        prompt = jsonFromSections(draft.sections, current.magic_prompt_json)
      } catch (e) {
        toast.error(errorMessage(e))
        return
      }
    }
    void run(
      'regenerate',
      () =>
        requestEdit(current.id, 'regenerate', {
          rejection_reason: reason,
          rejection_note: note || null,
          magic_prompt_json: prompt,
        }),
      (child) => {
        generations.upsertLocal(child)
        void refreshCard()
        closeDialog()
        toast.success(promptDirty ? 'Regeneration queued with your edited prompt' : 'Regeneration queued')
      },
    )
  }

  function onPark(note: string) {
    if (!card) return
    void run(
      'park',
      () => parkCard(card.id, note),
      (c) => {
        upsertCard(c)
        closeDialog()
        toast.success('Parked — resume when the answer is in')
      },
    )
  }

  function onResume() {
    if (!card) return
    void run(
      'resume',
      () => resumeCard(card.id),
      (c) => {
        upsertCard(c)
        toast.success(`Resumed — back in ${STAGE_LABEL[c.stage]}`)
      },
    )
  }

  function onRetry() {
    if (!card) return
    void run(
      'retry',
      () => retryCard(card.id),
      (c) => {
        upsertCard(c)
        void generations.refresh()
        void finJobs.refresh()
        toast.success(`Retrying — back in ${STAGE_LABEL[c.stage]}`)
      },
    )
  }

  function onDuplicate() {
    if (!card) return
    void run(
      'duplicate',
      () => duplicateCard(card.id),
      (c) => {
        toast.success('Duplicated — this is the new card')
        navigate(`/card/${c.id}`)
      },
    )
  }

  function onMakeCurrent(generationId: string) {
    void run(
      'make_current',
      () => setCurrentGeneration(generationId),
      (c) => {
        upsertCard(c)
        setViewedId(null)
        toast.success('Now the current generation')
      },
    )
  }

  if (loading && !card) {
    return (
      <div className="flex justify-center py-24 text-neutral-400" role="status" aria-label="Loading card">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  if (!card) {
    return (
      <div className={`${panelCls} mx-auto mt-12 max-w-md p-8 text-center`}>
        <h1 className="text-lg font-semibold">{error ? 'Could not load this card' : 'Card not found'}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {error ?? 'It may have been deleted, or the link is wrong.'}
        </p>
        <div className="mt-4 flex justify-center gap-2">
          {error && (
            <button type="button" onClick={() => void refreshCard()} className={btnPrimary}>
              Try again
            </button>
          )}
          <Link to="/board" className={btnSecondary}>
            Back to the board
          </Link>
        </div>
      </div>
    )
  }

  const failureMessage =
    card.stage === 'failed'
      ? (card.last_error ?? current?.last_error ?? latestFinJob?.last_error ?? 'No error message was recorded.')
      : null

  return (
    <div className="space-y-4">
      <CardHeader card={card} now={now} executionLinks={executionLinks} onDuplicate={onDuplicate} busy={busy} />

      {failureMessage !== null && (
        <div
          role="alert"
          className="flex flex-wrap items-start gap-3 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Pipeline error{card.previous_stage ? ` while ${STAGE_LABEL[card.previous_stage].toLowerCase()}` : ''}</p>
            <p className="mt-0.5 whitespace-pre-wrap break-words font-mono text-xs">{failureMessage}</p>
            <p className="mt-1 text-xs opacity-80">
              Retry re-queues the failed step. If it fails again, the cause is upstream — {isLead ? 'open the n8n execution above.' : 'ask the lead to look at the execution.'}
            </p>
          </div>
          <button type="button" onClick={onRetry} disabled={busy !== null} className={btnPrimary}>
            {busy === 'retry' ? <Spinner /> : <RotateCcw className="h-4 w-4" />}
            Retry
          </button>
        </div>
      )}

      {card.stage === 'waiting' && (
        <div
          role="status"
          className="flex flex-wrap items-start gap-3 rounded-2xl border border-orange-300 bg-orange-50 px-4 py-3 text-sm text-orange-900 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200"
        >
          <PauseCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Parked{card.previous_stage ? ` from ${STAGE_LABEL[card.previous_stage]}` : ''}</p>
            <p className="mt-0.5 whitespace-pre-wrap">{card.stage_note ?? 'No note was left.'}</p>
          </div>
          <button type="button" onClick={onResume} disabled={busy !== null} className={btnPrimary}>
            {busy === 'resume' ? <Spinner /> : <Play className="h-4 w-4" />}
            Resume
          </button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="min-w-0 space-y-4">
          <BriefEditor card={card} locked={locked} onSaved={upsertCard} />
          <ReferencesPanel card={card} />
          <StyleCardPanel
            card={card}
            styleCard={styleCardState.styleCard}
            loading={styleCardState.loading}
            error={styleCardState.error}
          />
        </div>

        <div className="min-w-0 space-y-4">
          <ActionBar
            card={card}
            current={current}
            runningGeneration={runningGeneration}
            latestFinJob={latestFinJob}
            hasStyleCard={Boolean(styleCardState.styleCard)}
            styleCardLoading={styleCardState.loading}
            paused={paused}
            price={price}
            busy={busy}
            now={now}
            onApprove={() => setDialog('approve')}
            onAccept={() => setDialog('accept')}
            onEditText={() => setDialog('edit_text')}
            onEditRegion={() => setDialog('edit_region')}
            onRegenerate={() => setDialog('regenerate')}
            onPark={() => setDialog('park')}
            onResume={onResume}
            onRetry={onRetry}
          />
          <GenerationStrip
            generations={generations.rows}
            currentId={card.current_generation_id}
            viewedId={viewed?.id ?? null}
            canMakeCurrent={!locked}
            busy={busy !== null}
            now={now}
            onView={setViewedId}
            onMakeCurrent={onMakeCurrent}
          />
          {generations.error && (
            <p className="text-xs text-red-600 dark:text-red-400">Generations could not be refreshed: {generations.error}</p>
          )}
          <Preview viewed={viewed} previous={previous} isCurrent={viewed !== null && viewed.id === current?.id} fileBase={fileBase} now={now} />
          <QcReportPanel generation={viewed} />
          <Panel
            title="Magic prompt"
            subtitle={
              current
                ? viewed && viewed.id !== current.id
                  ? 'Prompt of the current generation — Regenerate builds on it, not on the one you are viewing'
                  : 'Edit any section before Regenerate; the engine re-renders the paragraph'
                : 'Appears once the first generation is queued'
            }
          >
            <MagicPromptEditor
              sections={draft.sections}
              onChange={setSections}
              onReset={resetSections}
              dirty={promptDirty}
              disabled={busy !== null}
              emptyText={
                current
                  ? 'No prompt stored on the current generation yet — the engine writes it when the job starts.'
                  : 'Approve the card to build the first prompt.'
              }
            />
          </Panel>
        </div>
      </div>

      {dialog === 'approve' && (
        <ApproveDialog
          card={card}
          styleCard={styleCardState.styleCard}
          price={price}
          busy={busy === 'approve'}
          onClose={closeDialog}
          onConfirm={onApprove}
        />
      )}
      {dialog === 'accept' && current && (
        <AcceptDialog generation={current} busy={busy === 'accept'} onClose={closeDialog} onConfirm={onAccept} />
      )}
      {dialog === 'edit_text' && current && (
        <EditTextDialog lines={parsePrintText(card.print_text)} busy={busy === 'edit_text'} onClose={closeDialog} onSubmit={onEditText} />
      )}
      {dialog === 'edit_region' && current && (
        <EditRegionDialog
          imageUrl={currentImage.url}
          imageBroken={currentImage.broken}
          busy={busy === 'edit_region'}
          onClose={closeDialog}
          onSubmit={onEditRegion}
        />
      )}
      {dialog === 'regenerate' && current && (
        <RegenerateDialog
          sections={draft.sections}
          onSectionsChange={setSections}
          onResetSections={resetSections}
          promptDirty={promptDirty}
          busy={busy === 'regenerate'}
          onClose={closeDialog}
          onSubmit={onRegenerate}
        />
      )}
      {dialog === 'park' && <ParkDialog stage={card.stage} busy={busy === 'park'} onClose={closeDialog} onSubmit={onPark} />}
    </div>
  )
}
