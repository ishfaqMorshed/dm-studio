import { PipelineSettings } from '../components/settings/PipelineSettings'
import { PromptTemplates } from '../components/settings/PromptTemplates'

/** Lead-only (App wraps this route in LeadOnly): pipeline switches and prompt template versions. */
export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-neutral-500">
          Lead only. Everything here applies to the whole studio the moment it is saved.
        </p>
      </header>
      <PipelineSettings />
      <PromptTemplates />
    </div>
  )
}
