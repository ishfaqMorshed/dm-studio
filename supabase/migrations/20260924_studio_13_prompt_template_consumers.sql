-- studio_13_prompt_template_consumers (R87)
-- Every prompt_templates row names its consumer so the list is explainable (visible, named, versioned, and
-- "who reads this"). The two verbatim T-Shirt Engine LLM prompt-writer prompts have no consumer in DM Studio
-- (prompt-engine renders the magic prompt deterministically) and are switched off; style_card_render is kept
-- active as the reference for prompt-engine/render.ts renderStyleCard() but is documentation only.
-- RLS is untouched: staff read (templates_staff_select), lead write (templates_lead_write), worker read (templates_worker_select).

alter table public.prompt_templates add column if not exists consumer text;

comment on table public.prompt_templates is
  'Versioned prompt texts. One active row per slug; workers and edge functions read the highest active version. consumer = who reads the slug (none = reference only).';
comment on column public.prompt_templates.consumer is
  'Who reads this slug at runtime (n8n workflow / edge function). "reference only" rows are documentation and are not sent to any model.';

update public.prompt_templates set consumer = c.consumer
from (values
  ('analysis_prompt',      'WF-1 Studio Intake > Analyze References (Kie gemini-3.1-pro, JSON mode). v2 is the JSON contract; v1 (STYLE:/TYPOGRAPHY_TEXT: text reply) kept inactive for rollback.'),
  ('background_rule',      'Edge Function prompt-engine (required). Rendered into the print_rules block of magic_prompt_json together with defects.'),
  ('corrective_suffix',    'WF-2 Studio Generate + WF-3 Studio Edit > Build Corrective Task (attempt 2 after a failed QC). Placeholders ISSUES, EXPECTED_TEXT, EXPECTED_TEXT_SPACED.'),
  ('defects',              'Edge Function prompt-engine (required). Rendered into the print_rules block of magic_prompt_json after background_rule.'),
  ('distill_system',       'WF-7 Studio Lessons > Build Distill Request (Kie claude-sonnet-4-6 messages, system prompt).'),
  ('distill_user',         'WF-7 Studio Lessons > Build Distill Request (user message; the EXISTING RULEBOOK and NEW REJECTION FEEDBACK lines are expanded per client).'),
  ('placement_aspect',     'Edge Function prompt-engine (optional). JSON placement -> aspect_ratio; the function falls back to the built-in table when the row is absent.'),
  ('prompt_engine_system', 'NO CONSUMER - inactive. Verbatim T-Shirt Engine LLM prompt-writer system prompt (EXTRACT.md 3.3) kept for reference; DM Studio renders the magic prompt deterministically in prompt-engine. Re-activate only if WF-2 gains an optional LLM polish step.'),
  ('prompt_engine_user',   'NO CONSUMER - inactive. Verbatim T-Shirt Engine LLM prompt-writer user message (EXTRACT.md 3.2) kept for reference; see prompt_engine_system.'),
  ('qc_prompt',            'WF-2 Studio Generate + WF-3 Studio Edit > Vision QC (Kie gemini-3.1-pro, JSON mode); result normalised by Edge Function qc-judge.'),
  ('style_card_render',    'reference only - documents how Edge Function prompt-engine (render.ts renderStyleCard) turns the locked Style Card JSON into the CLIENT STYLE block. Not sent to any model; the code is the source of truth.'),
  ('style_profiler',       'WF-1b Studio Style Draft > Profile Style (library images) and WF-1 Studio Intake fallback draft (card references) - Kie gemini-3.1-pro, JSON mode, returns the Style Card JSON.'),
  ('text_rules',           'Edge Function prompt-engine (required). Exact-text block of magic_prompt_json.'),
  ('tier_rules',           'Edge Function prompt-engine (required). JSON keyed 1..5 + edit; the card similarity_tier picks the text.')
) as c(slug, consumer)
where public.prompt_templates.slug = c.slug;

-- Nothing in DM Studio reads these two slugs; an active row with no reader misleads the Settings page.
update public.prompt_templates set active = false
where slug in ('prompt_engine_system', 'prompt_engine_user') and active;
