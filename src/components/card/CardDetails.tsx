import type { Card, Generation, StyleCard } from '../../lib/types'
import { BriefEditor } from './BriefEditor'
import { ReferencesPanel } from './ReferencesPanel'
import { StyleCardPanel } from './StyleCardPanel'
import { QcReportPanel } from './QcReportPanel'
import { GenerationMeta } from './Preview'
import { MagicPromptEditor } from './MagicPromptEditor'
import { RenderedPromptPanel } from './RenderedPromptPanel'
import type { PromptSection } from './magicPrompt'
import { qcVerdict } from './qc'
import { VERDICT_CLASS } from './styles'
import { Badge, Panel } from './ui'
import type { CardRow } from './useCardData'

/**
 * Everything below the fold: brief, references, Style Card, QC report, generation
 * details, magic prompt and rendered prompt, as collapsible panels. Only the brief
 * (before generation) and a failed/warned QC report start open.
 */
export function CardDetails({
  card,
  locked,
  upsertCard,
  styleCardState,
  viewed,
  current,
  sections,
  setSections,
  resetSections,
  promptDirty,
  busy,
}: {
  card: CardRow
  locked: boolean
  upsertCard: (card: Card) => void
  styleCardState: { styleCard: StyleCard | null; loading: boolean; error: string | null }
  viewed: Generation | null
  current: Generation | null
  sections: PromptSection[]
  setSections: (sections: PromptSection[]) => void
  resetSections: () => void
  promptDirty: boolean
  busy: string | null
}) {
  const verdict = qcVerdict(viewed?.qc_report)
  const viewingOther = viewed !== null && current !== null && viewed.id !== current.id

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <div className="min-w-0 space-y-4">
        <BriefEditor
          card={card}
          locked={locked}
          onSaved={upsertCard}
          collapsible
          defaultOpen={card.stage === 'review' || card.stage === 'intake'}
        />
        <ReferencesPanel card={card} collapsible />
        <StyleCardPanel
          card={card}
          styleCard={styleCardState.styleCard}
          loading={styleCardState.loading}
          error={styleCardState.error}
          collapsible
        />
      </div>

      <div className="min-w-0 space-y-4">
        <QcReportPanel generation={viewed} collapsible defaultOpen={verdict === 'fail' || verdict === 'warn'} />
        {viewed && (
          <Panel collapsible title="Generation details">
            <GenerationMeta generation={viewed} />
          </Panel>
        )}
        <Panel
          collapsible
          title={
            <span className="inline-flex items-center gap-2">
              Magic prompt
              {promptDirty && <Badge className={VERDICT_CLASS.warn}>Edited</Badge>}
            </span>
          }
          subtitle={
            current
              ? viewingOther
                ? 'Prompt of the current generation — Try again builds on it, not on the one you are viewing'
                : 'Edit any section before Try again; the engine re-renders the paragraph'
              : 'Appears once the first generation is queued'
          }
        >
          <MagicPromptEditor
            sections={sections}
            onChange={setSections}
            onReset={resetSections}
            dirty={promptDirty}
            disabled={busy !== null}
            emptyText={
              current
                ? 'No prompt stored on the current generation yet — the engine writes it when the job starts.'
                : 'Generate the design to build the first prompt.'
            }
          />
        </Panel>
        <RenderedPromptPanel generation={current} viewingOther={viewingOther} collapsible />
      </div>
    </div>
  )
}
