import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowRight, PauseCircle, Play, RotateCcw, WandSparkles } from 'lucide-react'
import { GENS_BUCKET, supabase } from '../lib/supabase'
import { useToast } from '../lib/useToast'
import { useProfile } from '../lib/useProfile'
import { useSettings } from '../lib/useSettings'
import { useSignedUrl } from '../lib/useSignedUrl'
import { STAGE_LABEL, isStageLocked } from '../lib/stage'
import { prefersReducedMotion } from '../lib/motion'
import {
  acceptGeneration,
  approveCard,
  duplicateCard,
  parkCard,
  recompositeRegion,
  requestEdit,
  resumeCard,
  retryCard,
  setCurrentGeneration,
} from '../lib/api'
import {
  ACTIVE_JOB_STATUSES,
  defaultAiPlatform,
  errorMessage,
  isRecord,
  parsePrintText,
  parseRegionMetrics,
  type AiPlatform,
  type Generation,
  type Json,
  type PrintTextLine,
  type RegionRectPx,
} from '../lib/types'
import { safeFileName } from '../lib/download'
import { useCardFinJobs, useCardGenerations, useCardRow, useStyleCard } from '../components/card/useCardData'
import { useNow } from '../components/card/useNow'
import { formatUsd, n8nExecutionUrl } from '../components/card/format'
import { jsonFromSections, promptTextLines, sectionSignature, sectionsFromJson, type PromptSection } from '../components/card/magicPrompt'
import { qcTextFound, qcTextOk, qcVerdict } from '../components/card/qc'
import { buildMaskPng, rectToPixels, uploadMask } from '../components/card/mask'
import { btnPrimary, btnSecondary, panelCls } from '../components/card/styles'
import { Spinner } from '../components/card/ui'
import { CardHeader, type ExecutionLink } from '../components/card/CardHeader'
import { GenerationStrip } from '../components/card/GenerationStrip'
import { Preview, type EditPhase } from '../components/card/Preview'
import { RegionEditPanel } from '../components/card/RegionEditPanel'
import { StagePlaceholder } from '../components/card/StagePlaceholder'
import { StageActions, StatusLine, type StageActionsProps } from '../components/card/StageActions'
import { TextSlotsEditor } from '../components/card/TextSlotsEditor'
import { CardDetails } from '../components/card/CardDetails'
import { ApproveDialog } from '../components/card/ApproveDialog'
import { AcceptDialog } from '../components/card/AcceptDialog'
import type { EditStatusTone, EditTextSubmit, TextChange } from '../components/card/EditTextForm'
import { EditRegionDialog, type EditRegionSubmit } from '../components/card/EditRegionDialog'
import { RegenerateDialog, type RegenerateSubmit } from '../components/card/RegenerateDialog'
import { ParkDialog } from '../components/card/ParkDialog'

type DialogKind = 'approve' | 'accept' | 'edit_region' | 'regenerate' | 'park'

/** Text editing is a mode of the page, not a dialog: the picture opens it, the rail hosts the slots. */
interface TextEditState {
  phase: EditPhase
  /** Generation the slots were opened for; a different current generation closes the editor. */
  genId: string | null
}

const TEXT_EDIT_OFF: TextEditState = { phase: 'off', genId: null }
/** How long the scan-line runs before the slots appear. */
const SCAN_MS = 1000

interface PromptDraft {
  /** Generation the draft belongs to. */
  key: string | null
  /** Signature of the stored prompt the draft started from. */
  baseSig: string
  sections: PromptSection[]
}

/** For matching a slot's old text against a brief line: whitespace runs and case do not count (as the engine matches). */
const normText = (t: string) => t.trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * The brief after a multi-line edit. Each change lands on the brief line with the same text;
 * a change whose text is not in the brief falls back to the line at its slot index (the same
 * rule as the single-line path). Every other brief line stays as it is — a line the designer
 * added after this generation, or a role the engine renamed, must survive the edit. Only a
 * brief without lines takes the slots as they are.
 */
function patchBriefLines(brief: PrintTextLine[], changes: TextChange[], slots: PrintTextLine[]): PrintTextLine[] {
  if (!brief.length) return slots.map((l) => ({ role: l.role, text: l.text }))
  const patched = new Map<number, string>()
  const unmatched: TextChange[] = []
  for (const c of changes) {
    const idx = brief.findIndex((l, i) => !patched.has(i) && normText(l.text) === normText(c.oldText))
    if (idx >= 0) patched.set(idx, c.newText)
    else unmatched.push(c)
  }
  for (const c of unmatched) {
    if (c.index < brief.length && !patched.has(c.index)) patched.set(c.index, c.newText)
  }
  return brief.map((l, i) => ({ role: l.role, text: patched.get(i) ?? l.text }))
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
  const [textEdit, setTextEdit] = useState<TextEditState>(TEXT_EDIT_OFF)
  const [editStatus, setEditStatus] = useState<{ text: string; tone: EditStatusTone }>({ text: '', tone: 'neutral' })
  /** Fix an area: the generation whose stored full regeneration the picture shows instead of the composite. */
  const [fullRegenFor, setFullRegenFor] = useState<string | null>(null)
  const pictureRef = useRef<HTMLButtonElement>(null)

  const current = useMemo(
    () => generations.rows.find((g) => g.id === card?.current_generation_id) ?? null,
    [generations.rows, card?.current_generation_id],
  )
  const viewed = useMemo(
    () => (viewedId ? generations.rows.find((g) => g.id === viewedId) : null) ?? current,
    [generations.rows, viewedId, current],
  )
  const previous = useMemo(() => findPrevious(generations.rows, viewed), [generations.rows, viewed])
  // Render-phase reset: another generation viewed (or the viewed one lost its raw regeneration) shows its own image again.
  if (fullRegenFor !== null && (fullRegenFor !== viewed?.id || !viewed.raw_image_path)) setFullRegenFor(null)
  const regionMetrics = useMemo(() => parseRegionMetrics(viewed?.region_metrics), [viewed?.region_metrics])
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

  // Text edit mode: only on the current generation's image, in needs_review.
  const viewedIsCurrent = viewed !== null && viewed.id === current?.id
  const editContextValid = card?.stage === 'needs_review' && Boolean(current?.image_path) && viewedIsCurrent
  // A paused pipeline does not hide the way in: the slots still open, only Apply is off (with the reason).
  const canEnterEdit = editContextValid && busy === null
  // Render-phase reset (same pattern as the prompt draft). Deliberately independent of
  // `busy` and `paused`: pressing Apply must not close the editor under the designer.
  if (textEdit.phase !== 'off' && (!editContextValid || textEdit.genId !== (current?.id ?? null))) {
    setTextEdit(TEXT_EDIT_OFF)
  }
  useEffect(() => {
    if (textEdit.phase !== 'scanning') return
    const t = window.setTimeout(() => setTextEdit((s) => (s.phase === 'scanning' ? { ...s, phase: 'on' } : s)), SCAN_MS)
    return () => window.clearTimeout(t)
  }, [textEdit.phase])

  function enterEdit() {
    if (!canEnterEdit || !current) return
    // The text editor works on the current image: never leave the full regeneration on screen behind it.
    setFullRegenFor(null)
    setTextEdit({ phase: prefersReducedMotion() ? 'on' : 'scanning', genId: current.id })
  }
  /** Cancel / Escape. Not while Apply is in flight: the drafts must survive a failed request. */
  function exitEdit() {
    if (busy !== null) return
    setTextEdit(TEXT_EDIT_OFF)
    pictureRef.current?.focus()
  }

  const price = formatUsd(settings?.per_card_price_usd)
  // Preselected on Generate / text slots / Fix an area / Try again; each sends the pick with its action.
  const defaultPlatform = defaultAiPlatform(settings)
  const openRouterModels = settings?.openrouter_models
  const openRouterImageModel =
    isRecord(openRouterModels) && typeof openRouterModels.image === 'string' ? openRouterModels.image : null
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

  // Every success path calls this, so a queued edit also leaves text edit mode. The slots unmount
  // with it, so focus goes back to the picture (still a button at that moment) instead of <body>.
  const closeDialog = () => {
    setDialog(null)
    if (textEdit.phase !== 'off') {
      setTextEdit(TEXT_EDIT_OFF)
      pictureRef.current?.focus()
    }
  }

  function onApprove(platform: AiPlatform) {
    if (!card) return
    void run(
      'approve',
      () => approveCard(card.id, platform),
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

  function onEditText(args: EditTextSubmit) {
    if (!card || !current) return
    if (args.mode === 'multi') {
      onEditTextMulti(args.lines, args.changes, args.instruction, args.platform)
      return
    }
    const { oldText, newText, instruction, updateBrief, platform } = args
    void run(
      'edit_text',
      async () => {
        if (updateBrief) {
          const lines = parsePrintText(card.print_text)
          // The slots come from the prompt's text slot; when the brief line drifted from it, fall back to the slot's index.
          let idx = lines.findIndex((l) => l.text.trim() === oldText)
          if (idx < 0 && args.lineIndex !== undefined && args.lineIndex < lines.length) idx = args.lineIndex
          if (idx >= 0) {
            const next = lines.map((l, i) => ({ role: l.role, text: i === idx ? newText : l.text }))
            // Keep the brief snapshot in step too, as the multi-line path does: later regenerates and QC read it.
            const patch: { print_text: Json; brief_snapshot?: Json } = { print_text: next }
            if (isRecord(card.brief_snapshot)) patch.brief_snapshot = { ...card.brief_snapshot, print_text: next }
            const { data, error: err } = await supabase.from('cards').update(patch).eq('id', card.id).select('*').single()
            if (err) throw new Error(`The brief line was not updated (${err.message}), so nothing was queued.`)
            upsertCard(data)
          }
        }
        return requestEdit(current.id, 'edit_text', {
          old_text: oldText,
          new_text: newText,
          instruction: instruction || null,
          platform,
        })
      },
      (child) => {
        generations.upsertLocal(child)
        void refreshCard()
        closeDialog()
        toast.success('Text edit queued — the card is now editing')
      },
    )
  }

  /**
   * Several lines changed at once: patch the changed lines in the card's print text (and
   * its brief snapshot — request_edit copies it onto the child, and QC falls back to it),
   * rewrite the text slot of the magic prompt with the slots, then queue ONE in-place text
   * edit on the previous image so every new line lands in the same generation and nothing
   * else about the picture changes. (A regenerate would redraw the whole design from the
   * references.) The engine reads the empty old/new text as "the text slot is the truth".
   */
  function onEditTextMulti(lines: PrintTextLine[], changes: TextChange[], instruction: string, platform: AiPlatform) {
    if (!card || !current) return
    let basePrompt: Json | null = current.magic_prompt_json
    if (promptDirty) {
      try {
        basePrompt = jsonFromSections(draft.sections, current.magic_prompt_json)
      } catch (e) {
        toast.error(errorMessage(e))
        return
      }
    }
    // The slots (`lines`) are the prompt's text slot with the drafts applied: that is what the engine prints.
    const slotText = lines.map((l) => ({ role: l.role, text: l.text }))
    const prompt: Json | null =
      isRecord(basePrompt) && isRecord(basePrompt.text) ? { ...basePrompt, text: { ...basePrompt.text, lines: slotText } } : basePrompt
    // The brief is patched line by line, never replaced by the slots.
    const briefBefore = parsePrintText(card.print_text)
    // Plain objects (not PrintTextLine, which has no index signature) so the array is a Json value.
    const printText = patchBriefLines(briefBefore, changes, lines).map((l) => ({ role: l.role, text: l.text }))
    const briefChanged = JSON.stringify(printText) !== JSON.stringify(briefBefore.map((l) => ({ role: l.role, text: l.text })))
    // prompt-engine renders this as the TARGETED EDIT instruction; the new lines themselves come from the text slot.
    const editInstruction = [
      ...changes.map((c) => `Change the text “${c.oldText}” to exactly “${c.newText}”, keeping the same lettering style, size and placement.`),
      instruction.trim(),
    ]
      .filter(Boolean)
      .join(' ')
      .slice(0, 1000)

    void run(
      'edit_text',
      async () => {
        // Before request_edit on purpose: the RPC snapshots the card's brief onto the child generation.
        if (briefChanged) {
          const patch: { print_text: Json; brief_snapshot?: Json } = { print_text: printText }
          if (isRecord(card.brief_snapshot)) patch.brief_snapshot = { ...card.brief_snapshot, print_text: printText }
          const { data, error: err } = await supabase.from('cards').update(patch).eq('id', card.id).select('*').single()
          if (err) throw new Error(`The brief was not updated (${err.message}), so nothing was queued.`)
          upsertCard(data)
        }
        // Empty old/new text + a prompt whose text slot already holds the new lines = multi-line edit for the engine.
        return requestEdit(current.id, 'edit_text', {
          old_text: null,
          new_text: null,
          instruction: editInstruction,
          magic_prompt_json: prompt,
          platform,
        })
      },
      (child) => {
        generations.upsertLocal(child)
        void refreshCard()
        closeDialog()
        toast.success(`Text edit queued — ${changes.length} lines change, the rest of the picture stays`)
      },
    )
  }

  function onEditRegion({ rect, natural, instruction, platform }: EditRegionSubmit) {
    if (!card || !current) return
    void run(
      'edit_region',
      async () => {
        const blob = await buildMaskPng(natural.w, natural.h, rect)
        const maskPath = await uploadMask(card.id, current.id, blob)
        // region-composite keeps only this rectangle (plus the blend ring) of the full regeneration, so prompt-engine
        // needs it in pixels with the image size it was drawn on ({x,y,w,h,width,height}; 422 without it).
        const px = rectToPixels(rect, natural.w, natural.h)
        const mask_rect = { x: px.x, y: px.y, w: px.w, h: px.h, width: natural.w, height: natural.h }
        return requestEdit(current.id, 'edit_region', { mask_path: maskPath, mask_rect, instruction, platform })
      },
      (child) => {
        generations.upsertLocal(child)
        void refreshCard()
        closeDialog()
        toast.success('Fix an area queued — the card is now editing')
      },
    )
  }

  /**
   * Fix an area follow-ups on the viewed generation, $0 and no AI: region-composite recombines its
   * stored full regeneration (extend over `rect`, or full as it is) into a new child generation that
   * becomes current. Works while the pipeline is paused: nothing is queued.
   */
  function onRegionRecomposite(mode: 'extend' | 'full', rect?: RegionRectPx) {
    if (!viewed) return
    void run(
      'region_' + mode,
      () => recompositeRegion(viewed.id, mode, rect),
      (res) => {
        generations.upsertLocal(res.generation)
        void refreshCard()
        setViewedId(null)
        setFullRegenFor(null)
        toast.success(
          mode === 'extend'
            ? 'Area extended — recombined from the same regeneration ($0)'
            : 'The full regeneration is now the current version',
        )
      },
    )
  }

  function onRegenerate({ reason, note, platform }: RegenerateSubmit) {
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
          // The note also steers the next attempt (prompt-engine renders it as the REGENERATION instruction).
          instruction: note || null,
          magic_prompt_json: prompt,
          platform,
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

  // The slots are the lines the engine printed (prompt text slot); the brief is the fallback.
  const slotLinesFromPrompt = promptTextLines(current?.magic_prompt_json)
  const briefLines = parsePrintText(card.print_text)
  const slotSource = slotLinesFromPrompt.length ? 'prompt' : 'brief'
  const slotLines = slotLinesFromPrompt.length ? slotLinesFromPrompt : briefLines
  const qcFound = qcTextFound(current?.qc_report)
  const qcOk = qcTextOk(current?.qc_report)

  // The one paid step in Review: the rail's primary and the picture tile both open the Generate dialog.
  const canGenerate = card.stage === 'review' && !paused && !styleCardState.loading && Boolean(styleCardState.styleCard)

  const stageActionsProps: StageActionsProps = {
    card,
    current,
    viewed,
    runningGeneration,
    generationsLoading: generations.loading,
    latestFinJob,
    hasStyleCard: Boolean(styleCardState.styleCard),
    styleCardLoading: styleCardState.loading,
    paused,
    price,
    busy,
    now,
    canMakeCurrent: !locked,
    onApprove: () => setDialog('approve'),
    onAccept: () => setDialog('accept'),
    onEditRegion: () => setDialog('edit_region'),
    onRegenerate: () => setDialog('regenerate'),
    onPark: () => setDialog('park'),
    onMakeCurrent,
  }

  return (
    <div className="space-y-4">
      <CardHeader card={card} now={now} executionLinks={executionLinks} onDuplicate={onDuplicate} busy={busy} />

      {card.source === 'style_test' && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-2xl border border-neutral-200 bg-neutral-100 px-4 py-3 text-sm text-neutral-800 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200"
        >
          <WandSparkles className="h-5 w-5 shrink-0 text-neutral-500" aria-hidden="true" />
          <p className="min-w-0 flex-1">
            Onboarding test render for {card.clients?.name ?? 'this client'}: hidden from the board and Completed.
          </p>
          <Link
            to={`/clients/${card.client_id}/onboard?step=test`}
            className="inline-flex items-center gap-1 rounded font-medium underline underline-offset-2 outline-none focus-visible:ring-4 focus-visible:ring-neutral-900/10 dark:ring-white/20"
          >
            Back to the wizard
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      )}

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

      <section
        className={`${panelCls} grid gap-4 p-3 sm:p-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:grid-rows-[auto_auto] lg:items-start`}
        onKeyDown={(e) => {
          // Not while Apply is in flight: Cancel is disabled then for the same reason (the drafts must survive a failure).
          if (e.key === 'Escape' && dialog === null && textEdit.phase !== 'off' && busy === null) {
            e.preventDefault()
            exitEdit()
          }
        }}
      >
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <Preview
            viewed={viewed}
            previous={previous}
            isCurrent={viewedIsCurrent}
            fileBase={fileBase}
            editable={canEnterEdit}
            editPhase={textEdit.phase}
            onEdit={enterEdit}
            pictureRef={pictureRef}
            qcVerdict={qcVerdict(viewed?.qc_report)}
            runningGeneration={card.stage === 'editing' ? runningGeneration : null}
            emptyAction={
              !viewed ? (
                <StagePlaceholder
                  card={card}
                  price={price}
                  styleCard={styleCardState.styleCard}
                  loading={generations.loading}
                  onGenerate={canGenerate ? () => setDialog('approve') : undefined}
                />
              ) : undefined
            }
            altImage={
              viewed && viewed.raw_image_path && fullRegenFor === viewed.id
                ? { path: viewed.raw_image_path, label: 'Full regeneration' }
                : null
            }
          />
          {/* Hidden while the text editor is open: it works on the current image, never on the full regeneration. */}
          {viewed && textEdit.phase === 'off' && (
            <RegionEditPanel
              generation={viewed}
              metrics={regionMetrics}
              showFull={fullRegenFor === viewed.id}
              onToggleFull={() => setFullRegenFor((v) => (v === viewed.id ? null : viewed.id))}
              canAct={card.stage === 'needs_review' && busy === null}
              busy={busy === 'region_extend' ? 'extend' : busy === 'region_full' ? 'full' : null}
              onExtend={(rect) => onRegionRecomposite('extend', rect)}
              onUseFull={() => onRegionRecomposite('full')}
            />
          )}
        </div>

        <div className="min-w-0 space-y-3 lg:col-start-2 lg:row-start-1 lg:row-span-2">
          <p
            role="status"
            aria-live="polite"
            className={`text-xs ${editStatus.tone === 'warn' && textEdit.phase === 'on' ? 'text-amber-700 dark:text-amber-300' : 'text-neutral-500'}`}
          >
            {textEdit.phase === 'scanning' ? (
              'Reading the text on the design…'
            ) : textEdit.phase === 'on' ? (
              editStatus.text
            ) : (
              <StatusLine {...stageActionsProps} viewedIsCurrent={viewedIsCurrent} />
            )}
          </p>
          {textEdit.phase === 'on' && current ? (
            <TextSlotsEditor
              lines={slotLines}
              source={slotSource}
              briefLines={briefLines}
              qcFound={qcFound}
              qcTextOk={qcOk}
              promptDirty={promptDirty}
              defaultPlatform={defaultPlatform}
              paused={paused}
              busy={busy === 'edit_text'}
              onSubmit={onEditText}
              onCancel={exitEdit}
              onStatus={(text, tone) => setEditStatus((s) => (s.text === text && s.tone === tone ? s : { text, tone }))}
            />
          ) : (
            <StageActions {...stageActionsProps} />
          )}
        </div>

        {generations.rows.length >= 2 && (
          <div className="min-w-0 lg:col-start-1 lg:row-start-2">
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
          </div>
        )}
      </section>
      {generations.error && (
        <p className="text-xs text-red-600 dark:text-red-400">Generations could not be refreshed: {generations.error}</p>
      )}

      <CardDetails
        card={card}
        locked={locked}
        upsertCard={upsertCard}
        styleCardState={styleCardState}
        viewed={viewed}
        current={current}
        sections={draft.sections}
        setSections={setSections}
        resetSections={resetSections}
        promptDirty={promptDirty}
        busy={busy}
      />

      {dialog === 'approve' && (
        <ApproveDialog
          card={card}
          styleCard={styleCardState.styleCard}
          price={price}
          model={settings?.generation_model ?? null}
          openRouterModel={openRouterImageModel}
          resolution={settings?.generation_resolution ?? null}
          defaultPlatform={defaultPlatform}
          busy={busy === 'approve'}
          onClose={closeDialog}
          onConfirm={onApprove}
        />
      )}
      {dialog === 'accept' && current && (
        <AcceptDialog generation={current} busy={busy === 'accept'} onClose={closeDialog} onConfirm={onAccept} />
      )}
      {dialog === 'edit_region' && current && (
        <EditRegionDialog
          imageUrl={currentImage.url}
          imageBroken={currentImage.broken}
          ringPct={Number(settings?.region_ring_pct ?? 3)}
          // Fix an area is tuned on OpenRouter (GPT Image 2.5 Sunburst); the picker still allows another platform.
          defaultPlatform="openrouter"
          studioDefault={defaultPlatform}
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
          defaultPlatform={defaultPlatform}
          busy={busy === 'regenerate'}
          onClose={closeDialog}
          onSubmit={onRegenerate}
        />
      )}
      {dialog === 'park' && <ParkDialog stage={card.stage} busy={busy === 'park'} onClose={closeDialog} onSubmit={onPark} />}
    </div>
  )
}
