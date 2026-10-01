import { workflow, node, trigger, sticky, placeholder, newCredential, ifElse, switchCase, merge, splitInBatches, nextBatch, languageModel, memory, tool, outputParser, embedding, embeddings, vectorStore, retriever, documentLoader, textSplitter, reranker, fromAi, expr } from '@n8n/workflow-sdk';

const supabaseUrl = 'https://voatrqhfsdfjomyajovi.supabase.co';
const n8nBaseUrl = 'https://n8n.srv1202488.hstgr.cloud';
const kieBaseUrl = 'https://api.kie.ai';

const configWorkflowId = 'vbyjWhK4ZRN9uZUM';
const kieVisionCredential = newCredential('Gemini 3.1 Pro [DM-Kie]', '0l2nHQUQNnsCAfTR');

const looseOptions = { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 1 };

const sampleClientId = '7c6d5e4f-3a2b-4c1d-9e8f-0a1b2c3d4e5f';
const sampleRequestId = '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a';
const sampleStyleCardId = '3f2e1d0c-9b8a-4765-8321-0fedcba98765';
const sampleReferenceId = '8a7b6c5d-4e3f-4a2b-9c1d-0e9f8a7b6c5d';
const sampleLibraryPath = sampleClientId + '/library/0d1e2f3a-4b5c-4d6e-8f90-a1b2c3d4e5f6.png';
const sampleSignedPath = '/object/sign/refs/' + sampleLibraryPath + '?token=redacted';
const sampleSignedUrl = supabaseUrl + '/storage/v1' + sampleSignedPath;

const sampleBrief = { niche: 'farm humour', audience: 'homesteaders', subjects: ['Highland cows', 'chickens'], brand_text: ['@TheHappyHourFarm'], typography_note: 'chunky slab serif', must_have: ['thick outer keyline'], avoid: ['gradients'], palette_mode: 'strict', text_case: 'upper', lock_typography: true, lock_composition: true };
const sampleClient = { id: sampleClientId, name: 'Test Client', garment_colors: ['black', 'navy'], notes: 'Loves vintage badges', style_brief: sampleBrief };
const sampleRequest = { id: sampleRequestId, client_id: sampleClientId, status: 'working', style_card_id: null, last_error: null, n8n_execution_id: '48212' };
const sampleRules = { palette_mode: 'strict', text_case: 'upper', lock_typography: true, lock_composition: true };
const sampleSheet = { image: 1, quality: 'clean', garment_seen: 'black', colorway: 'dark_garment', medium: 'screen-print style vector', realism: 'stylised', line_weight: 'bold', line_style: 'clean closed outlines', outline: 'thick', shading: 'halftone', texture: 'light grain', edge_finish: 'clean', layout: 'badge', hero: { subject: 'highland cow head', framing: 'head_only', scale: 'large' }, supporting_elements: ['wheat sprigs'], swatches: [{ hex: '#F2E8D5', role: 'fill', area: 'dominant' }, { hex: '#2F5D3A', role: 'line', area: 'secondary' }], text: [{ text: 'HAPPY HOUR FARM', role: 'headline', family: 'slab_serif', weight: 'bold', case: 'UPPER', effects: ['arched'], placement: 'above_hero' }], mood: ['rugged'], off_style: false };
const sampleStyleCard = {
  schema: 2,
  medium: 'screen-print style vector illustration',
  realism: 'stylised',
  linework: { weight: 'bold', style: 'clean, closed outlines', outline: 'thick' },
  shading: 'flat fills with sparse halftone',
  shading_method: 'halftone',
  texture: 'light grain',
  edge_finish: 'clean',
  palette: [{ name: 'cream', hex: '#F2E8D5', weight: 'dominant', role: 'fill', images: [1, 2, 3] }, { name: 'forest green', hex: '#2F5D3A', weight: 'secondary', role: 'line', images: [1, 3] }, { name: 'rust', hex: '#BA4B36', weight: 'accent', role: 'accent', images: [2] }],
  palette_variants: [],
  composition: 'centered badge or stacked lockup around the hero',
  hero: { framing: 'head_only', scale: 'large' },
  typography: { vibe: 'vintage condensed slab', placement: 'arched top', case: 'UPPER', headline: { family: 'slab_serif', weight: 'bold', effects: ['arched'] }, secondary: { family: 'condensed_sans', weight: 'regular', effects: [] } },
  background: 'flat mid-grey #808080, isolated artwork',
  mood: ['rugged', 'warm'],
  subjects: ['Highland cows', 'chickens'],
  subject_sources: { 'Highland cows': 'both', chickens: 'brief' },
  brand_text: { items: [{ text: '@TheHappyHourFarm', role: 'handle', placement: 'bottom_margin' }], always_present: true },
  forbid: ['gradients', 'photorealism'],
  signature_moves: ['thick outer keyline', 'two-tone hero'],
  garment_colors: ['black', 'navy'],
  representative_images: [1, 2, 3],
  field_evidence: { medium: { images: [1, 2, 3], contradicts: [] } },
  brief_check: { must_have_seen: ['thick outer keyline'], must_have_not_seen: [], avoid_seen_in: [] },
  evidence: ['IMAGE 1, 2, 3: cream and green pairing', 'IMAGE 2: exception - rust accent'],
  rules: sampleRules,
  reference_ids: [sampleReferenceId],
  source: 'library'
};
const sampleCheck = { card: { ...sampleStyleCard, validation: { errors: [], warnings: [], fixes: ['stripped trailing period from medium'], checked_at: '2026-09-30T12:00:00.000Z' } }, errors: [], warnings: [], fixes: ['stripped trailing period from medium'], agreement: { 'linework.weight': 1 } };
const sampleTemplateVersions = { sheet: 1, profiler: 3 };
const sampleStyleContent = '{"schema":2,"medium":"screen-print style vector illustration","realism":"stylised","linework":{"weight":"bold","style":"clean","outline":"thick"},"shading":"flat fills","shading_method":"flat","texture":"light grain","edge_finish":"clean","palette":[{"name":"cream","hex":"#F2E8D5","weight":"dominant","role":"fill","images":[1]}],"composition":"centered badge","typography":{"vibe":"vintage slab","placement":"arched top","case":"UPPER","headline":{"family":"slab_serif","weight":"bold","effects":[]},"secondary":{"family":"condensed_sans","weight":"regular","effects":[]}},"background":"flat mid-grey #808080, isolated artwork","mood":["rugged"],"subjects":["Highland cows"],"forbid":["gradients"],"signature_moves":["thick keyline"],"garment_colors":["black"],"evidence":["IMAGE 1: cream and green pairing"]}';
const sampleStyleResponse = { id: 'chatcmpl-style', object: 'chat.completion', model: 'gemini-3.1-pro', choices: [{ index: 0, message: { role: 'assistant', content: sampleStyleContent }, finish_reason: 'stop' }], usage: { prompt_tokens: 4200, completion_tokens: 480 } };
const sampleSheetContent = '{"sheets":[{"image":1,"quality":"clean","garment_seen":"black","colorway":"dark_garment","medium":"screen-print style vector","realism":"stylised","line_weight":"bold","line_style":"clean closed outlines","outline":"thick","shading":"halftone","texture":"light grain","edge_finish":"clean","layout":"badge","hero":{"subject":"highland cow head","framing":"head_only","scale":"large"},"supporting_elements":["wheat sprigs"],"swatches":[{"hex":"#F2E8D5","role":"fill","area":"dominant"}],"text":[],"mood":["rugged"],"off_style":false}]}';
const sampleSheetResponse = { id: 'chatcmpl-sheet', object: 'chat.completion', model: 'gemini-3.1-pro', choices: [{ index: 0, message: { role: 'assistant', content: sampleSheetContent }, finish_reason: 'stop' }], usage: { prompt_tokens: 3900, completion_tokens: 700 } };
const sampleConfig = { sbUrl: supabaseUrl, anonKey: 'sb_publishable_redacted', n8nBaseUrl: n8nBaseUrl, studioSecret: 'redacted', ideogramKey: 'redacted', imgbbKey: 'redacted', mlKey: 'redacted', upscaleModel: 'ultra_resolution', upscaleScale: 4, openrouterKey: 'redacted' };
const sampleVisionBody = { messages: [{ role: 'user', content: [{ type: 'text', text: 'You are a precise visual analyst ...' }, { type: 'image_url', image_url: { url: sampleSignedUrl } }] }], response_format: { type: 'json_object' } };
const sampleSettings = { max_style_refs: 16, vision_model: 'gemini-3.1-pro', ai_platform: 'kie', openrouter_models: { vision: 'google/gemini-3.1-pro-preview', image: 'openai/gpt-image-2.5-sunburst', edit: 'google/gemini-2.5-flash-image', text: 'anthropic/claude-sonnet-4.6' } };

const styleDraftNote = sticky(
  '## DM Studio · WF-1b Style Draft (style_draft_requests insert → /webhook/studio-style-draft)\n' +
  'Payload {request_id, client_id}. Respond 200 → style_draft_update(working, execution id) → Get Client (id, name, garment_colors, notes, style_brief) + Get Settings (max_style_refs, ai_platform, models) → Get Templates (prompt_templates slugs **style_sheet** + **style_profiler**, active rows, never inlined) → List Library (client_references newest first, ties by id, with note + meta, limit max_style_refs) → sign each path (POST /storage/v1/object/sign/refs/<path>, 1 h).\n\n' +
  '**Pass A - per-image sheets:** Build Sheet Request (style_sheet body, tokens {{IMAGE_COUNT}}, {{REFERENCE_NOTES}}; one image_url per library image) → Sheet Platform? → Describe Designs (Kie) | OpenRouter Describe Designs (Auto = Kie first, then OpenRouter via Kie Sheet Down?) → Parse Sheets. Pass A NEVER fails the run: any problem (no template, a library image that could not be signed - then no vendor call is paid and Build Style Request fails the run with the count -, vendor error, no JSON, sheet count != image count) yields sheets = null and the profiler works from the images alone.\n\n' +
  '**Pass B - the Style Card:** Build Style Request (style_profiler body; tokens {{CLIENT_NAME}}, {{NICHE}}, {{SUBJECTS}}, {{BRAND_TEXT}}, {{GARMENT_COLORS}} as a comma list, {{CLIENT_NOTES}}, {{MUST_HAVE}}, {{AVOID}}, {{TYPOGRAPHY_NOTE}}, {{PALETTE_MODE}}, {{TEXT_CASE}}, {{LOCK_TYPOGRAPHY}}, {{LOCK_COMPOSITION}}, {{REFERENCE_NOTES}}, {{IMAGE_COUNT}}, {{SHEETS_JSON}} = the sheets or the literal "not available - describe from the images") → Style Platform? → Profile Style (Kie) | OpenRouter Profile Style → Parse Style Card (JSON extraction only; stamps rules, reference_ids, source = library, template_versions) → **Check Style Card** (Edge Function style-card-check: deterministic fixes + errors/warnings/agreement) → Card OK? (errors.length === 0) → New Style Card Version(client, checked card) → Extract Style Card Id → Draft → done (PATCH style_draft_requests: status done, style_card_id, raw = {sheets, card, validation, template_versions}).\n\n' +
  '**Repair (once):** Card OK? false → Build Repair Request (OpenRouter text model settings.openrouter_models.text, the validator errors + the card JSON, no images) → Repair Style Card → Parse Repair (re-stamps rules / reference_ids / source) → Check Repaired Card → Repaired Card OK? → store as above, or Fail Message (errors joined with " - ") → Draft → failed (PATCH status failed, last_error, raw = {sheets, card, validation}). Every earlier failure also PATCHes raw with whatever exists, so a failed request keeps its sheets.\n\n' +
  'Empty library → Draft → failed ("reference library is empty"). Ship rule R1: publish this workflow, then activate style_sheet v1 + style_profiler v3 in the same step (unknown tokens stay literal). Vision calls: timeout 240 s.\n\n' +
  '**Config convention (no credentials except Kie):** the webhook has NO n8n auth. First node **Load Config** runs the sub-workflow WF-0 Studio Config (paste its id into `const configWorkflowId` before creating this workflow); every later node reads `$(\'Load Config\').first().json.<field>`. **Secret OK?** compares the incoming `x-studio-secret` header with config.studioSecret - the pg_net trigger always sends it; mismatch ends in the no-op **Rejected** node. Every Supabase REST/RPC/Storage/Edge Function call sends headers apikey = anonKey and x-studio-secret = studioSecret from config, no credential attached. Kie vision calls keep the credential **Gemini 3.1 Pro [DM-Kie]** (0l2nHQUQNnsCAfTR); OpenRouter calls read config.openrouterKey. Nothing to paste in this workflow: all keys live in WF-0.',
  { color: 4, width: 420, height: 1040, position: [-460, 40] }
);

const styleDraftWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Style Draft Webhook',
    parameters: {
      httpMethod: 'POST',
      path: 'studio-style-draft',
      responseMode: 'onReceived',
      options: {}
    },
    position: [0, 304]
  },
  output: [{ headers: { 'content-type': 'application/json', 'x-studio-secret': 'redacted' }, params: {}, query: {}, body: { request_id: sampleRequestId, client_id: sampleClientId }, webhookUrl: n8nBaseUrl + '/webhook/studio-style-draft', executionMode: 'production' }]
});

const loadConfig = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.2,
  config: {
    name: 'Load Config',
    parameters: {
      workflowId: { __rl: true, mode: 'id', value: configWorkflowId, cachedResultName: 'DM Studio · WF-0 Studio Config' },
      workflowInputs: { mappingMode: 'defineBelow', value: {}, matchingColumns: [], schema: [], attemptToConvertTypes: false, convertFieldsToString: true },
      mode: 'once',
      options: { waitForSubWorkflow: true }
    },
    executeOnce: true,
    position: [240, 304]
  },
  output: [sampleConfig]
});

const secretOk = ifElse({
  version: 2.2,
  config: {
    name: 'Secret OK?',
    parameters: {
      conditions: {
        options: looseOptions,
        conditions: [
          { id: 'k', leftValue: expr("{{ $('Style Draft Webhook').first().json.headers?.['x-studio-secret'] ?? '' }}"), operator: { type: 'string', operation: 'equals' }, rightValue: expr("{{ $('Load Config').first().json.studioSecret }}") }
        ],
        combinator: 'and'
      },
      options: {}
    },
    position: [480, 304]
  },
  output: [sampleConfig]
});

const rejected = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Rejected',
    parameters: {
      mode: 'manual',
      assignments: {
        assignments: [
          { id: 'r1', name: 'rejected', type: 'boolean', value: true },
          { id: 'r2', name: 'reason', type: 'string', value: 'x-studio-secret header missing or wrong' }
        ]
      },
      includeOtherFields: false,
      options: {}
    },
    position: [720, 592]
  },
  output: [{ rejected: true, reason: 'x-studio-secret header missing or wrong' }]
});

const config = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Config',
    parameters: {
      mode: 'manual',
      assignments: {
        assignments: [
          { id: 'c3', name: 'requestId', type: 'string', value: expr("{{ $('Style Draft Webhook').first().json.body?.request_id ?? '' }}") },
          { id: 'c4', name: 'clientId', type: 'string', value: expr("{{ $('Style Draft Webhook').first().json.body?.client_id ?? '' }}") },
          { id: 'c5', name: 'executionId', type: 'string', value: expr('{{ String($execution.id) }}') }
        ]
      },
      includeOtherFields: false,
      options: {}
    },
    position: [720, 304]
  },
  output: [{ requestId: sampleRequestId, clientId: sampleClientId, executionId: '48212' }]
});

const draftWorking = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Draft → working',
    parameters: {
      method: 'POST',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/rpc/style_draft_update"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") },
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") },
          { name: 'Content-Type', value: 'application/json' }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_request_id: $('Config').first().json.requestId, p_status: 'working', p_execution_id: $('Config').first().json.executionId }) }}"),
      options: { timeout: 15000 }
    },
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [960, 304]
  },
  output: [sampleRequest]
});

const getClient = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Get Client',
    parameters: {
      method: 'GET',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/clients?id=eq.{{ $('Config').first().json.clientId }}&select=id,name,garment_colors,notes,style_brief&limit=1"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") },
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") }
        ]
      },
      options: { timeout: 15000 }
    },
    executeOnce: true,
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [1200, 304]
  },
  output: [sampleClient]
});

const getSettings = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Get Settings',
    parameters: {
      method: 'GET',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/settings?select=max_style_refs,vision_model,ai_platform,openrouter_models&limit=1"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") },
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") }
        ]
      },
      options: { timeout: 15000 }
    },
    executeOnce: true,
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [1440, 304]
  },
  output: [sampleSettings]
});

// Both templates in one call: style_sheet (Pass A, per-image sheets) and style_profiler (Pass B, the Style Card). Two rows -> two items.
const getTemplates = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Get Templates',
    parameters: {
      method: 'GET',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/prompt_templates?slug=in.(style_sheet,style_profiler)&active=is.true&select=slug,version,body&order=slug.asc,version.desc"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") },
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") }
        ]
      },
      options: { timeout: 15000 }
    },
    executeOnce: true,
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 2000,
    onError: 'continueErrorOutput',
    alwaysOutputData: true,
    position: [1680, 304]
  },
  output: [
    { slug: 'style_profiler', version: 3, body: 'You are a precise visual analyst building the STYLE CARD for one print-on-demand client. Attached are {{IMAGE_COUNT}} of this client\'s PAST DESIGNS ... {{SHEETS_JSON}} ... Return ONLY this JSON object' },
    { slug: 'style_sheet', version: 1, body: 'Attached are {{IMAGE_COUNT}} past designs of one print-on-demand client ... {{REFERENCE_NOTES}} ... Return ONLY {"sheets":[...]}' }
  ]
});

const listLibrary = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'List Library',
    parameters: {
      method: 'GET',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/client_references?client_id=eq.{{ $('Config').first().json.clientId }}&excluded=is.false&select=id,path,note,meta&order=created_at.desc,id.desc&limit={{ Math.min(16, Number($('Get Settings').first().json.max_style_refs) || 12) }}"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") },
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") }
        ]
      },
      options: { timeout: 15000 }
    },
    executeOnce: true,
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 2000,
    onError: 'continueErrorOutput',
    alwaysOutputData: true,
    position: [1920, 304]
  },
  output: [{ id: sampleReferenceId, path: sampleLibraryPath, note: 'bestseller 2025', meta: { kind: 'design', garment: 'black', best_for: ['lettering', 'layout'], outlier: false } }]
});

const hasLibrary = ifElse({
  version: 2.2,
  config: {
    name: 'Has Library?',
    parameters: {
      conditions: {
        options: looseOptions,
        conditions: [
          { id: 'h', leftValue: expr('{{ $json.path ?? "" }}'), operator: { type: 'string', operation: 'notEmpty', singleValue: true } }
        ],
        combinator: 'and'
      },
      options: {}
    },
    position: [2160, 304]
  },
  output: [{ id: sampleReferenceId, path: sampleLibraryPath, note: 'bestseller 2025', meta: {} }]
});

const signLibraryRef = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Sign Library Ref',
    parameters: {
      method: 'POST',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/storage/v1/object/sign/refs/{{ String($json.path ?? '').replace(/^refs\\//, '') }}"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") },
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") },
          { name: 'Content-Type', value: 'application/json' }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '{"expiresIn":3600}',
      options: { timeout: 15000 }
    },
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 2000,
    onError: 'continueErrorOutput',
    position: [2400, 208]
  },
  output: [{ signedURL: sampleSignedPath }]
});

// ---- Pass A: one vision call describes EACH image with a fixed vocabulary (style_sheet v1). Never fails the run. ----
const buildSheetRequest = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build Sheet Request',
    parameters: {
      jsCode: "const cfg = $('Load Config').first().json;\nconst tpl = $('Get Templates').all().map((i) => i.json).find((t) => t && t.slug === 'style_sheet');\nif (!tpl || !tpl.body) throw new Error('no active style_sheet template in prompt_templates - profiling without per-image sheets');\nconst refs = $('List Library').all().map((i) => i.json);\nconst urls = $input.all().map((i) => cfg.sbUrl + '/storage/v1' + String(i.json.signedURL || '')).filter((u) => /token=/.test(u));\nif (!urls.length) throw new Error('no signed library URLs');\nif (urls.length !== refs.length) throw new Error('Could not sign ' + (refs.length - urls.length) + ' of ' + refs.length + ' library images - skipping per-image sheets');\n// one studio note per image, in IMAGE 1..N order: kind / garment / best-example tags / outlier from client_references.meta, then the free-text note\nconst noteLine = (r, i) => { const m = (r.meta && typeof r.meta === 'object') ? r.meta : {}; return 'Image ' + (i + 1) + ': ' + (m.kind || 'design') + (m.garment ? ' on a ' + m.garment + ' garment' : '') + (Array.isArray(m.best_for) && m.best_for.length ? '; best example of ' + m.best_for.join(', ') : '') + (m.outlier ? '; OUTLIER - not the style' : '') + (r.note ? '; ' + r.note : ''); };\nconst vars = { IMAGE_COUNT: String(urls.length), REFERENCE_NOTES: refs.map(noteLine).join('\\n') };\nconst text = String(tpl.body).replace(/\\{\\{\\s*([A-Z_]+)\\s*\\}\\}/g, (m, k) => (k in vars ? vars[k] : m));\nconst content = [{ type: 'text', text }].concat(urls.map((url) => ({ type: 'image_url', image_url: { url } })));\nreturn { json: { body: { messages: [{ role: 'user', content }], response_format: { type: 'json_object' } }, template_version: tpl.version, reference_count: urls.length, reference_notes: vars.REFERENCE_NOTES } };"
    },
    onError: 'continueErrorOutput',
    position: [2640, 208]
  },
  output: [{ body: sampleVisionBody, template_version: 1, reference_count: 6, reference_notes: 'Image 1: design on a black garment; best example of lettering, layout; bestseller 2025' }]
});

const sheetPlatform = switchCase({
  version: 3.2,
  config: {
    name: 'Sheet Platform?',
    parameters: {
      rules: {
        values: [
          { outputKey: 'Kie', renameOutput: true, conditions: { options: looseOptions, conditions: [{ leftValue: expr("{{ $('Get Settings').first().json.ai_platform || 'kie' }}"), operator: { type: 'string', operation: 'notEquals' }, rightValue: 'openrouter' }], combinator: 'and' } },
          { outputKey: 'OpenRouter', renameOutput: true, conditions: { options: looseOptions, conditions: [{ leftValue: expr("{{ $('Get Settings').first().json.ai_platform || 'kie' }}"), operator: { type: 'string', operation: 'equals' }, rightValue: 'openrouter' }], combinator: 'and' } }
        ]
      },
      options: {}
    },
    position: [2880, 208]
  },
  output: [{}]
});

const describeDesigns = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Describe Designs',
    parameters: {
      method: 'POST',
      url: expr("https://api.kie.ai/{{ $('Get Settings').first().json.vision_model || 'gemini-3.1-pro' }}/v1/chat/completions"),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'Content-Type', value: 'application/json' }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify($('Build Sheet Request').first().json.body) }}"),
      options: { timeout: 240000 }
    },
    credentials: { httpHeaderAuth: kieVisionCredential },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 5000,
    onError: 'continueErrorOutput',
    position: [3120, 208]
  },
  output: [sampleSheetResponse]
});

const kieSheetDown = ifElse({
  version: 2.2,
  config: {
    name: 'Kie Sheet Down?',
    parameters: {
      conditions: {
        options: looseOptions,
        conditions: [
          { id: 'a1', leftValue: expr("{{ $('Get Settings').first().json.ai_platform || 'kie' }}"), operator: { type: 'string', operation: 'equals' }, rightValue: 'auto' },
          { id: 'a2', leftValue: expr("{{ $json.choices ? 'up' : 'down' }}"), operator: { type: 'string', operation: 'equals' }, rightValue: 'down' }
        ],
        combinator: 'and'
      },
      options: {}
    },
    position: [3360, 208]
  },
  output: [{}]
});

const orDescribeDesigns = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'OpenRouter Describe Designs',
    parameters: {
      method: 'POST',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'Authorization', value: expr("Bearer {{ $('Load Config').first().json.openrouterKey }}") },
          { name: 'Content-Type', value: 'application/json' },
          { name: 'X-Title', value: 'DM Studio' }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify(Object.assign({}, $('Build Sheet Request').first().json.body, { model: ($('Get Settings').first().json.openrouter_models || {}).vision || 'google/gemini-3.1-pro-preview' })) }}"),
      options: { timeout: 240000 }
    },
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 5000,
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [3360, 16]
  },
  output: [{ id: 'gen-or-sample', model: 'google/gemini-3.1-pro-preview', choices: [{ index: 0, message: { role: 'assistant', content: sampleSheetContent }, finish_reason: 'stop' }] }]
});

const parseSheets = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Parse Sheets',
    parameters: {
      jsCode: "// Pass A never fails the run - any problem yields sheets = null and the profiler works from the images alone\nconst j = $input.first().json || {};\nconst expected = $('List Library').all().map((i) => i.json).filter((r) => r && r.path).length;\nlet sheets = null, note = '', sheetVersion = null;\ntry { sheetVersion = $('Build Sheet Request').first().json.template_version || null; } catch (e) { sheetVersion = null; }\ntry {\n  const content = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';\n  const why = (typeof j.error === 'object' && j.error) ? (j.error.message || j.error.description) : (j.error || j.msg);\n  if (!content) throw new Error(why ? String(why).replace(/:/g, ' -').slice(0, 160) : 'no reply from the vision model');\n  const cleaned = String(content).replace(/```json|```/g, '').trim();\n  const m = cleaned.match(/[\\[{][\\s\\S]*[\\]}]/);\n  const parsed = JSON.parse(m ? m[0] : cleaned);\n  const arr = Array.isArray(parsed) ? parsed : (parsed && parsed.sheets);\n  if (!Array.isArray(arr)) throw new Error('reply has no sheets array');\n  if (arr.length !== expected) throw new Error('sheet count mismatch - expected ' + expected + ' got ' + arr.length);\n  sheets = arr.map((s, i) => Object.assign({}, (s && typeof s === 'object') ? s : {}, { image: i + 1 }));\n} catch (e) { sheets = null; note = String(e.message || e).slice(0, 200); }\nreturn { json: { sheets, sheet_note: note, sheet_template_version: sheetVersion } };"
    },
    onError: 'continueRegularOutput',
    position: [3600, 208]
  },
  output: [{ sheets: [sampleSheet], sheet_note: '', sheet_template_version: 1 }]
});

// ---- Pass B: the Style Card from all images + the brief + the sheets (style_profiler v3) ----
const buildStyleRequest = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build Style Request',
    parameters: {
      jsCode: "const cfg = $('Load Config').first().json;\nconst tpl = $('Get Templates').all().map((i) => i.json).find((t) => t && t.slug === 'style_profiler');\nif (!tpl || !tpl.body) throw new Error('no active style_profiler template in prompt_templates');\nconst client = $('Get Client').first().json || {};\nconst refs = $('List Library').all().map((i) => i.json);\nconst urls = $('Sign Library Ref').all().map((i) => cfg.sbUrl + '/storage/v1' + String(i.json.signedURL || '')).filter((u) => /token=/.test(u));\nif (!urls.length) throw new Error('no signed library URLs');\nif (urls.length !== refs.length) throw new Error('Could not sign ' + (refs.length - urls.length) + ' of ' + refs.length + ' library images - nothing was changed, try again');\n// image numbers in the evidence refer to this order (newest first, ties by id) - recorded so the wizard can show the right thumbnails\nconst noteLine = (r, i) => { const m = (r.meta && typeof r.meta === 'object') ? r.meta : {}; return 'Image ' + (i + 1) + ': ' + (m.kind || 'design') + (m.garment ? ' on a ' + m.garment + ' garment' : '') + (Array.isArray(m.best_for) && m.best_for.length ? '; best example of ' + m.best_for.join(', ') : '') + (m.outlier ? '; OUTLIER - not the style' : '') + (r.note ? '; ' + r.note : ''); };\nconst sheets = ($input.first().json || {}).sheets;\nconst sb = (client.style_brief && typeof client.style_brief === 'object') ? client.style_brief : {};\nconst list = (v) => (Array.isArray(v) ? v.map((x) => String(x || '').trim()).filter(Boolean) : String(v || '').split(/\\n|;/).map((x) => x.trim()).filter(Boolean));\nconst rules = { palette_mode: sb.palette_mode === 'flexible' ? 'flexible' : 'strict', text_case: ['upper', 'title'].includes(sb.text_case) ? sb.text_case : 'as_typed', lock_typography: sb.lock_typography !== false, lock_composition: sb.lock_composition !== false };\nconst briefVars = { NICHE: [sb.niche, sb.audience].filter(Boolean).join(' / ') || 'not given', SUBJECTS: list(sb.subjects).join('; ') || 'not given', BRAND_TEXT: list(sb.brand_text).join('; ') || 'none given', TYPOGRAPHY_NOTE: String(sb.typography_note || '').trim() || 'none', MUST_HAVE: list(sb.must_have).join('; ') || 'none given', AVOID: list(sb.avoid).join('; ') || 'none given', PALETTE_MODE: rules.palette_mode, TEXT_CASE: rules.text_case, LOCK_TYPOGRAPHY: rules.lock_typography ? 'locked' : 'a guide', LOCK_COMPOSITION: rules.lock_composition ? 'locked' : 'a guide' };\nconst vars = Object.assign({ CLIENT_NAME: client.name || '', CLIENT_NOTES: client.notes || 'none', GARMENT_COLORS: list(client.garment_colors).join(', ') || 'not given', IMAGE_COUNT: String(urls.length), REFERENCE_NOTES: refs.map(noteLine).join('\\n'), SHEETS_JSON: Array.isArray(sheets) ? JSON.stringify(sheets) : 'not available - describe from the images' }, briefVars);\nconst text = String(tpl.body).replace(/\\{\\{\\s*([A-Z_]+)\\s*\\}\\}/g, (m, k) => (k in vars ? vars[k] : m));\nconst content = [{ type: 'text', text }].concat(urls.map((url) => ({ type: 'image_url', image_url: { url } })));\nreturn { json: { body: { messages: [{ role: 'user', content }], response_format: { type: 'json_object' } }, template_version: tpl.version, reference_count: urls.length, reference_ids: refs.map((r) => String(r.id)), rules, brief: sb } };"
    },
    onError: 'continueErrorOutput',
    position: [3840, 208]
  },
  output: [{ body: sampleVisionBody, template_version: 3, reference_count: 6, reference_ids: [sampleReferenceId], rules: sampleRules, brief: sampleBrief }]
});

// ---- AI platform: Switch (Kie / OpenRouter) + Auto fallback when Kie reports it is down ----
const stylePlatform = switchCase({
  version: 3.2,
  config: {
    name: 'Style Platform?',
    parameters: {
      rules: {
        values: [
          { outputKey: 'Kie', renameOutput: true, conditions: { options: looseOptions, conditions: [{ leftValue: expr("{{ $('Get Settings').first().json.ai_platform || 'kie' }}"), operator: { type: 'string', operation: 'notEquals' }, rightValue: 'openrouter' }], combinator: 'and' } },
          { outputKey: 'OpenRouter', renameOutput: true, conditions: { options: looseOptions, conditions: [{ leftValue: expr("{{ $('Get Settings').first().json.ai_platform || 'kie' }}"), operator: { type: 'string', operation: 'equals' }, rightValue: 'openrouter' }], combinator: 'and' } }
        ]
      },
      options: {}
    },
    position: [4080, 208]
  },
  output: [{}]
});

const profileStyle = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Profile Style',
    parameters: {
      method: 'POST',
      url: expr("https://api.kie.ai/{{ $('Get Settings').first().json.vision_model || 'gemini-3.1-pro' }}/v1/chat/completions"),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'Content-Type', value: 'application/json' }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify($json.body) }}'),
      options: { timeout: 240000 }
    },
    credentials: { httpHeaderAuth: kieVisionCredential },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 5000,
    onError: 'continueErrorOutput',
    position: [4320, 208]
  },
  output: [sampleStyleResponse]
});

const kieStyleDown = ifElse({
  version: 2.2,
  config: {
    name: 'Kie Style Down?',
    parameters: {
      conditions: {
        options: looseOptions,
        conditions: [
          { id: 'a1', leftValue: expr("{{ $('Get Settings').first().json.ai_platform || 'kie' }}"), operator: { type: 'string', operation: 'equals' }, rightValue: 'auto' },
          { id: 'a2', leftValue: expr("{{ $json.choices ? 'up' : 'down' }}"), operator: { type: 'string', operation: 'equals' }, rightValue: 'down' }
        ],
        combinator: 'and'
      },
      options: {}
    },
    position: [4560, 208]
  },
  output: [{}]
});

const orProfileStyle = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'OpenRouter Profile Style',
    parameters: {
      method: 'POST',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'Authorization', value: expr("Bearer {{ $('Load Config').first().json.openrouterKey }}") },
          { name: 'Content-Type', value: 'application/json' },
          { name: 'X-Title', value: 'DM Studio' }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify(Object.assign({}, $('Build Style Request').first().json.body, { model: ($('Get Settings').first().json.openrouter_models || {}).vision || 'google/gemini-3.1-pro-preview' })) }}"),
      options: { timeout: 240000 }
    },
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 5000,
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [4560, 16]
  },
  output: [{ id: 'gen-or-sample', model: 'google/gemini-3.1-pro-preview', choices: [{ index: 0, message: { role: 'assistant', content: sampleStyleContent }, finish_reason: 'stop' }] }]
});

const parseStyleCard = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Parse Style Card',
    parameters: {
      mode: 'runOnceForEachItem',
      jsCode: "if (!$json.choices) { const e = (typeof $json.error === 'object' && $json.error) || {}; const via = $('OpenRouter Profile Style').isExecuted ? ($('Profile Style').isExecuted ? 'Kie and OpenRouter' : 'OpenRouter') : 'Kie'; let why = String($json.msg || e.message || (typeof $json.error === 'string' ? $json.error : '') || 'no reply'); const inner = why.match(/message\\\\?\":\\\\?\"([^\"\\\\]+)/); if (inner) why = inner[1]; const code = $json.code || e.status || e.httpCode || e.code || '?'; if (via !== 'Kie' && (String(code) === '401' || String(code) === '403')) why = 'OpenRouter API key missing or invalid - add it in n8n WF-0 Studio Config (OpenRouter Config node)'; throw new Error('Vision service unavailable (' + via + ' error ' + code + ' - ' + why.replace(/:/g, ' -').slice(0, 160) + '). Nothing was changed; try again in a few minutes.'); }\nconst content = ($json.choices && $json.choices[0] && $json.choices[0].message && $json.choices[0].message.content) || '';\nconst cleaned = String(content).replace(/```json|```/g, '').trim();\nconst m = cleaned.match(/\\{[\\s\\S]*\\}/);\nlet card;\ntry { card = JSON.parse(m ? m[0] : cleaned); } catch (e) { throw new Error('style profiler returned no JSON - reply was ' + cleaned.slice(0, 200).replace(/:/g, '=')); }\nif (!card || typeof card !== 'object' || Array.isArray(card)) throw new Error('style profiler returned no object');\n// JSON extraction only - the shape is judged by the style-card-check Edge Function next; the studio-set keys travel with the card\nconst req = $('Build Style Request').first().json;\ncard.rules = Object.assign({}, card.rules || {}, req.rules || {});\ncard.reference_ids = req.reference_ids || [];\ncard.source = 'library';\nconst tpls = $('Get Templates').all().map((i) => i.json);\nconst ver = (slug) => { const t = tpls.find((x) => x && x.slug === slug); return t ? t.version : null; };\nconst sheetsUsed = Array.isArray(($('Parse Sheets').first().json || {}).sheets);\nreturn { json: { style_card: card, template_version: req.template_version, template_versions: { sheet: sheetsUsed ? ver('style_sheet') : null, profiler: ver('style_profiler') }, reference_count: req.reference_count } };"
    },
    onError: 'continueErrorOutput',
    position: [4800, 208]
  },
  output: [{ style_card: sampleStyleCard, template_version: 3, template_versions: sampleTemplateVersions, reference_count: 6 }]
});

// ---- Validator: deterministic fixes + blocking errors from the shared rule module (Edge Function style-card-check) ----
const checkStyleCard = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Check Style Card',
    parameters: {
      method: 'POST',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/functions/v1/style-card-check"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") },
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") },
          { name: 'Content-Type', value: 'application/json' }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ card: $json.style_card, brief: $('Build Style Request').first().json.brief || {}, image_count: $('Build Style Request').first().json.reference_count, sheets: $('Parse Sheets').first().json.sheets ?? null, reference_ids: $('Build Style Request').first().json.reference_ids || [], client_garments: $('Get Client').first().json.garment_colors || [] }) }}"),
      options: { timeout: 60000, response: { response: { responseFormat: 'json' } } }
    },
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 2000,
    onError: 'continueErrorOutput',
    position: [5040, 208]
  },
  output: [sampleCheck]
});

const cardOk = ifElse({
  version: 2.2,
  config: {
    name: 'Card OK?',
    parameters: {
      conditions: {
        options: looseOptions,
        conditions: [
          { id: 'v1', leftValue: expr("{{ Array.isArray($json.errors) ? String($json.errors.length) : 'invalid' }}"), operator: { type: 'string', operation: 'equals' }, rightValue: '0' }
        ],
        combinator: 'and'
      },
      options: {}
    },
    position: [5280, 208]
  },
  output: [sampleCheck]
});

// ---- Repair, once: a text model fixes ONLY the listed violations, then the validator judges again ----
const buildRepairRequest = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build Repair Request',
    parameters: {
      mode: 'runOnceForEachItem',
      jsCode: "const j = $json || {};\nif (!Array.isArray(j.errors) || !j.card || typeof j.card !== 'object') throw new Error('style-card-check returned no errors array - ' + JSON.stringify(j).slice(0, 200).replace(/:/g, '='));\nconst model = ($('Get Settings').first().json.openrouter_models || {}).text || 'anthropic/claude-sonnet-4.6';\nconst text = 'Return the full JSON with ONLY these violations fixed, changing nothing else, keeping every other value byte-identical: ' + j.errors.join('; ') + '\\n' + JSON.stringify(j.card);\nreturn { json: { body: { model, max_tokens: 8000, messages: [{ role: 'user', content: text }] }, errors: j.errors, card: j.card } };"
    },
    onError: 'continueErrorOutput',
    position: [5280, 496]
  },
  output: [{ body: { model: 'anthropic/claude-sonnet-4.6', max_tokens: 8000, messages: [{ role: 'user', content: 'Return the full JSON with ONLY these violations fixed, changing nothing else, keeping every other value byte-identical: palette has 2 entries, 3 to 8 required\n{"medium":"..."}' }] }, errors: ['palette has 2 entries, 3 to 8 required'], card: sampleStyleCard }]
});

const repairStyleCard = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Repair Style Card',
    parameters: {
      method: 'POST',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'Authorization', value: expr("Bearer {{ $('Load Config').first().json.openrouterKey }}") },
          { name: 'Content-Type', value: 'application/json' },
          { name: 'X-Title', value: 'DM Studio' }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify($json.body) }}'),
      options: { timeout: 180000 }
    },
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 5000,
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [5520, 496]
  },
  output: [{ id: 'gen-or-repair', model: 'anthropic/claude-sonnet-4.6', choices: [{ index: 0, message: { role: 'assistant', content: sampleStyleContent }, finish_reason: 'stop' }] }]
});

const parseRepair = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Parse Repair',
    parameters: {
      mode: 'runOnceForEachItem',
      jsCode: "const req = $('Build Repair Request').first().json;\nconst was = 'Style Card failed validation (' + (req.errors || []).join('; ').replace(/:/g, ' -') + ')';\nif (!$json.choices) { const e = (typeof $json.error === 'object' && $json.error) || {}; let why = String($json.msg || e.message || (typeof $json.error === 'string' ? $json.error : '') || 'no reply'); const code = $json.code || e.status || e.httpCode || e.code || '?'; if (String(code) === '401' || String(code) === '403') why = 'OpenRouter API key missing or invalid - add it in n8n WF-0 Studio Config (OpenRouter Config node)'; throw new Error(was + ' and the repair call failed (OpenRouter error ' + code + ' - ' + why.replace(/:/g, ' -').slice(0, 160) + ')'); }\nconst content = ($json.choices[0] && $json.choices[0].message && $json.choices[0].message.content) || '';\nconst cleaned = String(content).replace(/```json|```/g, '').trim();\nconst m = cleaned.match(/\\{[\\s\\S]*\\}/);\nlet card;\ntry { card = JSON.parse(m ? m[0] : cleaned); } catch (e) { throw new Error(was + ' and the repair reply was not JSON - ' + cleaned.slice(0, 160).replace(/:/g, '=')); }\nif (!card || typeof card !== 'object' || Array.isArray(card)) throw new Error(was + ' and the repair reply was not an object');\n// the studio-set keys never come from the model\nconst src = $('Parse Style Card').first().json;\ncard.rules = Object.assign({}, card.rules || {}, (src.style_card || {}).rules || {});\ncard.reference_ids = (src.style_card || {}).reference_ids || [];\ncard.source = 'library';\nreturn { json: { style_card: card, template_version: src.template_version, template_versions: src.template_versions, reference_count: src.reference_count, repaired_errors: req.errors } };"
    },
    onError: 'continueErrorOutput',
    position: [5760, 496]
  },
  output: [{ style_card: sampleStyleCard, template_version: 3, template_versions: sampleTemplateVersions, reference_count: 6, repaired_errors: ['palette has 2 entries, 3 to 8 required'] }]
});

const checkRepairedCard = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Check Repaired Card',
    parameters: {
      method: 'POST',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/functions/v1/style-card-check"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") },
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") },
          { name: 'Content-Type', value: 'application/json' }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ card: $json.style_card, brief: $('Build Style Request').first().json.brief || {}, image_count: $('Build Style Request').first().json.reference_count, sheets: $('Parse Sheets').first().json.sheets ?? null, reference_ids: $('Build Style Request').first().json.reference_ids || [], client_garments: $('Get Client').first().json.garment_colors || [] }) }}"),
      options: { timeout: 60000, response: { response: { responseFormat: 'json' } } }
    },
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 2000,
    onError: 'continueErrorOutput',
    position: [6000, 496]
  },
  output: [sampleCheck]
});

const repairedCardOk = ifElse({
  version: 2.2,
  config: {
    name: 'Repaired Card OK?',
    parameters: {
      conditions: {
        options: looseOptions,
        conditions: [
          { id: 'v2', leftValue: expr("{{ Array.isArray($json.errors) ? String($json.errors.length) : 'invalid' }}"), operator: { type: 'string', operation: 'equals' }, rightValue: '0' }
        ],
        combinator: 'and'
      },
      options: {}
    },
    position: [6240, 496]
  },
  output: [sampleCheck]
});

const newStyleCardVersion = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'New Style Card Version',
    parameters: {
      method: 'POST',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/rpc/new_style_card_version"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") },
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") },
          { name: 'Content-Type', value: 'application/json' }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_client_id: $('Config').first().json.clientId, p_json: $json.card }) }}"),
      options: { timeout: 15000 }
    },
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 2000,
    onError: 'continueErrorOutput',
    position: [6480, 208]
  },
  output: [{ id: sampleStyleCardId, client_id: sampleClientId, version: 3, status: 'draft', json: sampleCheck.card, note: null }]
});

const extractStyleCardId = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Extract Style Card Id',
    parameters: {
      mode: 'runOnceForEachItem',
      jsCode: "const j = $json;\nconst first = Array.isArray(j) ? j[0] : j;\nlet id = '';\nif (typeof first === 'string') id = first;\nelse if (first && typeof first === 'object') id = first.id || first.style_card_id || first.data || first.new_style_card_version || '';\nif (id && typeof id === 'object') id = id.id || '';\nif (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id))) throw new Error('new_style_card_version returned no id - ' + JSON.stringify(j).slice(0, 200).replace(/:/g, '='));\n// audit trail for style_draft_requests.raw: what the profiler saw and how the validator judged the stored card\nconst chk = $('Check Repaired Card').isExecuted ? $('Check Repaired Card').first().json : $('Check Style Card').first().json;\nconst raw = { sheets: $('Parse Sheets').first().json.sheets || null, card: chk.card || null, validation: { errors: chk.errors || [], warnings: chk.warnings || [], fixes: chk.fixes || [], agreement: chk.agreement || {} }, template_versions: $('Parse Style Card').first().json.template_versions || null, repaired: Boolean($('Check Repaired Card').isExecuted) };\nreturn { json: { style_card_id: String(id), version: (first && typeof first === 'object' && first.version) || null, raw } };"
    },
    onError: 'continueErrorOutput',
    position: [6720, 208]
  },
  output: [{ style_card_id: sampleStyleCardId, version: 3, raw: { sheets: [sampleSheet], card: sampleCheck.card, validation: { errors: [], warnings: [], fixes: [], agreement: {} }, template_versions: sampleTemplateVersions, repaired: false } }]
});

// Direct PATCH (policy sdr_worker_all: anon + x-studio-secret): the RPC style_draft_update has no raw argument
const draftDone = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Draft → done',
    parameters: {
      method: 'PATCH',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/style_draft_requests?id=eq.{{ $('Config').first().json.requestId }}"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") },
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") },
          { name: 'Content-Type', value: 'application/json' },
          { name: 'Prefer', value: 'return=representation' }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ status: 'done', style_card_id: $json.style_card_id, n8n_execution_id: $('Config').first().json.executionId, raw: $json.raw ?? null, updated_at: new Date().toISOString() }) }}"),
      options: { timeout: 15000 }
    },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 3000,
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [6960, 208]
  },
  output: [{ ...sampleRequest, status: 'done', style_card_id: sampleStyleCardId, raw: { sheets: [sampleSheet], card: sampleCheck.card, validation: { errors: [], warnings: [], fixes: [], agreement: {} }, template_versions: sampleTemplateVersions } }]
});

const emptyLibrary = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Empty Library Message',
    parameters: {
      mode: 'manual',
      assignments: {
        assignments: [
          { id: 'e1', name: 'message', type: 'string', value: 'client reference library is empty - upload references on the client panel, then draft again' }
        ]
      },
      includeOtherFields: false,
      options: {}
    },
    position: [2400, 784]
  },
  output: [{ message: 'client reference library is empty - upload references on the client panel, then draft again' }]
});

const failMessage = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Fail Message',
    parameters: {
      mode: 'runOnceForEachItem',
      jsCode: "const j = $json || {};\nconst cfg = $('Config').first().json;\nconst text = (v) => (v === undefined || v === null || v === '' ? '' : (typeof v === 'object' ? String(v.message || v.description || JSON.stringify(v)) : String(v)));\nconst validation = Array.isArray(j.errors) && j.errors.length ? 'Style Card still fails validation after one repair - ' + j.errors.join(' - ').replace(/:/g, ' -') : '';\nconst message = (validation || text(j.error) || text(j.message) || text(j.msg) || text(j.detail) || text(j.hint) || 'style draft failed').slice(0, 500);\n// keep whatever the run produced so the failure can be judged and a re-run costs only what is missing (sheets survive a Pass B failure)\nconst out = (n) => { try { return ($(n).isExecuted && $(n).first().json) || {}; } catch (e) { return {}; } };\nconst chk = $('Check Repaired Card').isExecuted ? out('Check Repaired Card') : out('Check Style Card');\nconst card = chk.card || out('Parse Repair').style_card || out('Parse Style Card').style_card || null;\nconst raw = { sheets: out('Parse Sheets').sheets || null, card, validation: Array.isArray(chk.errors) ? { errors: chk.errors, warnings: chk.warnings || [], fixes: chk.fixes || [], agreement: chk.agreement || {} } : null, template_versions: out('Parse Style Card').template_versions || null };\nreturn { json: { message, requestId: cfg.requestId, clientId: cfg.clientId, raw } };"
    },
    position: [6480, 784]
  },
  output: [{ message: 'Style Card still fails validation after one repair - palette has 2 entries, 3 to 8 required', requestId: sampleRequestId, clientId: sampleClientId, raw: { sheets: [sampleSheet], card: sampleStyleCard, validation: { errors: ['palette has 2 entries, 3 to 8 required'], warnings: [], fixes: [], agreement: {} }, template_versions: sampleTemplateVersions } }]
});

const draftFailed = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Draft → failed',
    parameters: {
      method: 'PATCH',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/style_draft_requests?id=eq.{{ $('Config').first().json.requestId }}"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") },
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") },
          { name: 'Content-Type', value: 'application/json' },
          { name: 'Prefer', value: 'return=representation' }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ status: 'failed', last_error: String($json.message || 'style draft failed').slice(0, 500), n8n_execution_id: $('Config').first().json.executionId, raw: $json.raw ?? null, updated_at: new Date().toISOString() }) }}"),
      options: { timeout: 15000 }
    },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 3000,
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [6720, 784]
  },
  output: [{ ...sampleRequest, status: 'failed', last_error: 'Style Card still fails validation after one repair - palette has 2 entries, 3 to 8 required', raw: { sheets: [sampleSheet], card: sampleStyleCard, validation: { errors: ['palette has 2 entries, 3 to 8 required'], warnings: [], fixes: [], agreement: {} }, template_versions: sampleTemplateVersions } }]
});

export default workflow('dm-studio-wf1b-style-draft', 'DM Studio · WF-1b Style Draft')
  .add(styleDraftNote)
  .add(styleDraftWebhook)
  .to(loadConfig)
  .to(secretOk.onTrue(config).onFalse(rejected))
  .add(config)
  .to(draftWorking)
  .to(getClient)
  .to(getSettings)
  .to(getTemplates.onError(failMessage))
  .to(listLibrary.onError(failMessage))
  .to(hasLibrary.onTrue(signLibraryRef.onError(failMessage)).onFalse(emptyLibrary))
  .add(signLibraryRef)
  .to(buildSheetRequest.onError(parseSheets))
  .to(sheetPlatform.onCase(0, describeDesigns.onError(kieSheetDown)).onCase(1, orDescribeDesigns))
  .add(describeDesigns)
  .to(kieSheetDown.onTrue(orDescribeDesigns).onFalse(parseSheets))
  .add(orDescribeDesigns)
  .to(parseSheets)
  .to(buildStyleRequest.onError(failMessage))
  .to(stylePlatform.onCase(0, profileStyle.onError(kieStyleDown)).onCase(1, orProfileStyle))
  .add(profileStyle)
  .to(kieStyleDown.onTrue(orProfileStyle).onFalse(parseStyleCard))
  .add(orProfileStyle)
  .to(parseStyleCard.onError(failMessage))
  .to(checkStyleCard.onError(failMessage))
  .to(cardOk.onTrue(newStyleCardVersion).onFalse(buildRepairRequest))
  .add(buildRepairRequest.onError(failMessage))
  .to(repairStyleCard)
  .to(parseRepair.onError(failMessage))
  .to(checkRepairedCard.onError(failMessage))
  .to(repairedCardOk.onTrue(newStyleCardVersion).onFalse(failMessage))
  .add(newStyleCardVersion.onError(failMessage))
  .to(extractStyleCardId.onError(failMessage))
  .to(draftDone)
  .add(emptyLibrary)
  .to(draftFailed)
  .add(failMessage)
  .to(draftFailed);
