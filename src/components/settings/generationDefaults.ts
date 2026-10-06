/**
 * Column defaults of the generation fields on the `settings` row, mirrored from the
 * database so the Settings form can show "Default …" and offer a one-click reset.
 * Postgres is the source of truth; keep these in step with the migration.
 */
export const GENERATION_DEFAULTS = {
  generation_model: 'gpt-image-2-5-sunburst-image-to-image',
  generation_resolution: '2K',
  vision_model: 'gemini-3.1-pro',
  max_style_refs: 16,
} as const

/**
 * Default of `settings.openrouter_models`: the OpenRouter id of each model the studio
 * also runs on Kie (Kie runs Edit text on google/nano-banana-edit and Fix an area on
 * gpt-image-2-5-sunburst-image-to-image). `region` = Fix an area, locked outside (studio_29).
 */
export const OPENROUTER_MODEL_DEFAULTS = {
  vision: 'google/gemini-3.1-pro-preview',
  image: 'openai/gpt-image-2.5-sunburst',
  edit: 'google/gemini-2.5-flash-image',
  region: 'openai/gpt-image-2.5-sunburst',
  text: 'anthropic/claude-sonnet-4.6',
} as const
