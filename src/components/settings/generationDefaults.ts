/**
 * Column defaults of the generation fields on the `settings` row, mirrored from the
 * database so the Settings form can show "Default …" and offer a one-click reset.
 * Postgres is the source of truth; keep these in step with the migration.
 */
export const GENERATION_DEFAULTS = {
  generation_model: 'gpt-image-2-5-sunburst-image-to-image',
  generation_resolution: '2K',
  vision_model: 'gemini-3.1-pro',
  max_style_refs: 12,
} as const
