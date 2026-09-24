import { workflow, node, trigger, sticky, placeholder, newCredential, ifElse, switchCase, merge, splitInBatches, nextBatch, languageModel, memory, tool, outputParser, embedding, embeddings, vectorStore, retriever, documentLoader, textSplitter, reranker, fromAi, expr } from '@n8n/workflow-sdk';

const configWorkflowId = 'vbyjWhK4ZRN9uZUM';
const pollWorkflowId = '3Sr7H74AxZUu6QiW';
const kieBaseUrl = 'https://api.kie.ai';

const kieImageCredential = newCredential('GPT Image 2 [DM-Kie]', 'w0sDpl2nll4HkF6h');
const kieVisionCredential = newCredential('Gemini 3.1 Pro [DM-Kie]', '0l2nHQUQNnsCAfTR');

const looseOptions = { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 1 };

const sampleSbUrl = 'https://voatrqhfsdfjomyajovi.supabase.co';
const sampleN8nBaseUrl = 'https://n8n.srv1202488.hstgr.cloud';
const sampleConfig = { sbUrl: sampleSbUrl, anonKey: 'sb_publishable_redacted', n8nBaseUrl: sampleN8nBaseUrl, studioSecret: 'redacted', ideogramKey: 'redacted', imgbbKey: 'redacted', mlKey: 'redacted', upscaleModel: 'ultra_resolution', upscaleScale: 4 };

const sampleCardId = '1a2b3c4d-5e6f-4a70-8b91-0c1d2e3f4a5b';
const sampleClientId = '7c6d5e4f-3a2b-4c1d-9e8f-0a1b2c3d4e5f';
const sampleParentId = '9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b';
const sampleGenerationId = '4b3a2c1d-0e9f-4a8b-9c7d-6e5f4a3b2c1d';
const sampleStyleCardId = '3f2e1d0c-9b8a-4765-8321-0fedcba98765';
const sampleTaskId = 'b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7';
const sampleExecutionId = '48302';
const sampleParentPath = sampleCardId + '/' + sampleParentId + '.png';
const sampleMaskPath = sampleCardId + '/' + sampleGenerationId + '-mask.png';
const sampleImagePath = sampleCardId + '/' + sampleGenerationId + '.png';
const sampleSignedParentPath = '/object/sign/gens/' + sampleParentPath + '?token=redacted';
const sampleSignedParentUrl = sampleSbUrl + '/storage/v1' + sampleSignedParentPath;
const sampleSignedMaskPath = '/object/sign/gens/' + sampleMaskPath + '?token=redacted';
const sampleSignedMaskUrl = sampleSbUrl + '/storage/v1' + sampleSignedMaskPath;
const sampleSignedGenPath = '/object/sign/gens/' + sampleImagePath + '?token=redacted';
const sampleSignedGenUrl = sampleSbUrl + '/storage/v1' + sampleSignedGenPath;
const sampleResultUrl = 'https://tempfile.aiquickdraw.com/s/' + sampleTaskId + '.png';
const sampleEditPrompt = 'Change the headline lettering so it reads exactly "FAMILY FOREVER" (F A M I L Y   F O R E V E R) in the same vintage condensed sans, same size and arched placement. Keep everything else exactly the same, including all lettering, layout, colors, textures, and the flat grey background, with no shadows.';

const sampleStyleCard = {
  medium: 'screen-print style vector illustration',
  linework: { weight: 'bold', style: 'clean, closed outlines' },
  shading: 'flat fills with sparse halftone',
  texture: 'light grain',
  palette: [{ name: 'cream', hex: '#F2E8D5', weight: 'dominant' }, { name: 'forest green', hex: '#2F5D3A', weight: 'secondary' }],
  composition: 'centered badge or stacked lockup',
  typography: { vibe: 'vintage condensed sans', placement: 'arched top', case: 'upper' },
  background: 'flat mid-grey #808080, isolated artwork',
  mood: ['rugged', 'warm'],
  subjects: ['wildlife', 'camping', 'family'],
  forbid: ['gradients', 'photorealism'],
  signature_moves: ['thick outer keyline', 'two-tone hero'],
  garment_colors: ['black', 'navy']
};
const sampleCardEmbedded = { id: sampleCardId, client_id: sampleClientId, print_text: [{ role: 'headline', text: 'FAMILY FIRST' }], garment_color: 'black', placement: 'front_chest', reference_paths: [sampleClientId + '/' + sampleCardId + '/1.png'], similarity_tier: 3, brief_text: 'Retro camping badge with a bear over a lake', style_card_id: sampleStyleCardId };
const sampleGenerationRow = { id: sampleGenerationId, card_id: sampleCardId, kind: 'edit_text', status: 'queued', attempt: 1, parent_generation_id: sampleParentId, vendor_job_id: null, image_path: null, n8n_execution_id: null, edit_instruction: 'Replace the headline text', old_text: 'FAMILY FIRST', new_text: 'FAMILY FOREVER', mask_path: null };
const sampleGeneration = {
  ...sampleGenerationRow,
  magic_prompt_json: null,
  final_prompt: null,
  rendered_prompt: null,
  model: null,
  vendor: null,
  style_card_id: sampleStyleCardId,
  style_card_version: 1,
  style_card_snapshot: sampleStyleCard,
  brief_snapshot: { brief_text: 'Retro camping badge with a bear over a lake', print_text: [{ role: 'headline', text: 'FAMILY FIRST' }] },
  qc_report: null,
  needs_regen: null,
  aspect_ratio: null,
  resolution: null,
  reference_urls: null,
  last_error: null,
  cards: sampleCardEmbedded
};
const samplePromptEngine = {
  generation_id: sampleGenerationId,
  kind: 'edit_text',
  base: 'parent',
  model: 'gpt-image-2-5-sunburst-image-to-image',
  aspect_ratio: '1:1',
  resolution: '2K',
  rendered_prompt: sampleEditPrompt,
  magic_prompt_json: { print_rules: '...', style_card: '...', lessons: '...', exemplars: '...', reference_reading: '...', similarity_tier: 'TARGETED EDIT ...', brief: '...', text: '...', edit: '...' },
  input_paths: [
    { bucket: 'gens', path: sampleParentPath, role: 'previous_version' }
  ],
  style_card_version: 1,
  templates: { tier_rules: 1, text_rules: 1, background_rule: 1, defects: 1, placement_aspect: 1 }
};
const sampleInputPath = { path: sampleParentPath, role: 'previous_version', bucket: 'gens', index: 1 };
const sampleEditBody = { model: 'google/nano-banana-edit', input: { prompt: sampleEditPrompt, image_urls: [sampleSignedParentUrl], output_format: 'png' } };
const sampleCreateResponse = { code: 200, msg: 'success', data: { taskId: sampleTaskId } };
const samplePollData = { taskId: sampleTaskId, model: 'google/nano-banana-edit', state: 'success', param: '{}', resultJson: '{"resultUrls":["' + sampleResultUrl + '"]}', failCode: null, failMsg: null, completeTime: 1790000060000, createTime: 1790000000000, costTime: 60000, creditsConsumed: 4, progress: 100 };
const samplePollResponse = { code: 200, msg: 'success', data: samplePollData };
const samplePollResult = { ok: true, decision: 'success', failMsg: '', taskId: sampleTaskId, state: 'success', resultUrls: [sampleResultUrl], resultUrl: sampleResultUrl, creditsConsumed: 4, raw: samplePollResponse, finishedAt: '2026-09-24T10:01:00.000Z' };
const sampleQcContent = '{"text_found":"FAMILY FOREVER","text_matches":true,"text_once":true,"extra_text":false,"text_legible":true,"no_halos":true,"background_ok":true,"no_shadows":true,"flat_artwork":true,"edges_clean":true,"palette_ok":true,"style_violations":[],"min_text_height_frac":0.08,"issues":[],"pass":true}';
const sampleQcResponse = { id: 'chatcmpl-qc', object: 'chat.completion', model: 'gemini-3.1-pro', choices: [{ index: 0, message: { role: 'assistant', content: sampleQcContent }, finish_reason: 'stop' }], usage: { prompt_tokens: 1800, completion_tokens: 200 } };
const sampleQcReport = { checks: [{ id: 'text_matches', name: 'text_matches', pass: true, note: '' }, { id: 'background_ok', name: 'background_ok', pass: true, note: '' }], score: 100, needs_regen: false, corrective_instruction: '', style_violations: [], text_ok: true, min_text_height_frac: 0.08 };
const sampleJudge = { ok: true, generation_id: sampleGenerationId, qc_report: sampleQcReport, needs_regen: false, corrective_instruction: '', text_elements: [{ text: 'FAMILY FOREVER', height_frac: 0.08 }] };

const editNote = sticky(
  '## DM Studio · WF-3 Edit (generations insert kind ≠ generate → /webhook/studio-edit)\n' +
  'Payload {generation_id, card_id, kind} from the pg_net trigger (request_edit inserts the row). The webhook has NO n8n authentication: **Load Config** runs the shared sub-workflow **WF-0 Studio Config** first, then **Secret OK?** compares the request header x-studio-secret with config.studioSecret and drops mismatches into **Rejected** (no-op).\n\n' +
  '**Config convention:** no n8n credentials except Kie and Slack (bound by id). Every URL and key is read as `$(\'Load Config\').first().json.<field>` (sbUrl, anonKey, n8nBaseUrl, studioSecret). Supabase REST / RPC / Storage / Edge Function calls send headers apikey = anonKey and x-studio-secret = studioSecret. **Paste locations:** (1) the WF-0 workflow id into the SDK const `configWorkflowId` (vbyjWhK4ZRN9uZUM) before creating this workflow; (2) the WF-5 Poll workflow id into `pollWorkflowId` (3Sr7H74AxZUu6QiW); (3) keys are pasted ONLY in WF-0\'s "Studio Config" Set node, never here. Kie images = credential **GPT Image 2 [DM-Kie]** (w0sDpl2nll4HkF6h), Kie vision = **Gemini 3.1 Pro [DM-Kie]** (0l2nHQUQNnsCAfTR).\n\n' +
  '**Flow:** Edit Context → Get Generation (+card) → Regenerate? · **regenerate**: POST <n8nBaseUrl>/webhook/studio-generate (WF-2\'s dispatcher, x-studio-secret header; body {generation_id, card_id} is informational only) and stop - claim_generations() hands the queued row to exactly one worker and enforces settings.max_active_generations, so the row is never fired twice by this call and the 5-min sweep. · **edit_text / edit_region**: PATCH working → Edge Function **prompt-engine** (rendered_prompt = the short edit instruction; input_paths = previous_version + optional mask, bucket gens) → sign each path (1 h) → Build Edit Task (Kie createTask model **google/nano-banana-edit**, EXTRACT.md tweak shape: {prompt, image_urls, output_format png}; the mask is appended as the second image_url and the prompt states that only the white region may change) → Create Edit Task → PATCH vendor_job_id → **WF-5 Poll** (recordInfo every 10 s, 10-min cap, inside the 20-min requeue_stale() window) → download resultUrls[0] → upload gens/<card_id>/<generation_id>.png (x-upsert) → PATCH image_path → sign → Get QC Templates (qc_prompt, corrective_suffix) → Build QC Request (edit_text swaps old_text → new_text in the expected lines) → Vision QC (Kie gemini-3.1-pro, JSON mode, fail-open) → Edge Function **qc-judge** → PATCH done → PATCH cards.current_generation_id (set_current_generation is staff-only; cards_worker_update allows the PATCH) → move_card(needs_review). drift_pct stays null in v1.\n\n' +
  'Any failure → Fail Message → PATCH generation failed + last_error → move_card(failed, message, force). Set WF-6 as this workflow\'s error workflow.',
  { color: 4, width: 440, height: 980, position: [-500, 40] }
);

const editWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Edit Webhook',
    parameters: {
      httpMethod: 'POST',
      path: 'studio-edit',
      responseMode: 'onReceived',
      options: {}
    },
    position: [0, 304]
  },
  output: [{ headers: { 'content-type': 'application/json', 'x-studio-secret': 'redacted' }, params: {}, query: {}, body: { generation_id: sampleGenerationId, card_id: sampleCardId, kind: 'edit_text' }, webhookUrl: sampleN8nBaseUrl + '/webhook/studio-edit', executionMode: 'production' }]
});

const loadConfig = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.2,
  config: {
    name: 'Load Config',
    parameters: {
      workflowId: { __rl: true, mode: 'id', value: configWorkflowId, cachedResultName: 'DM Studio · WF-0 Studio Config' },
      workflowInputs: {
        mappingMode: 'defineBelow',
        value: {},
        matchingColumns: [],
        schema: [],
        attemptToConvertTypes: false,
        convertFieldsToString: true
      },
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
          { id: 's1', leftValue: expr("{{ $('Edit Webhook').first().json.headers?.['x-studio-secret'] ?? '' }}"), operator: { type: 'string', operation: 'equals' }, rightValue: expr("{{ $('Load Config').first().json.studioSecret }}") }
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
          { id: 'x1', name: 'rejected', type: 'boolean', value: true },
          { id: 'x2', name: 'reason', type: 'string', value: 'x-studio-secret header missing or wrong' }
        ]
      },
      includeOtherFields: false,
      options: {}
    },
    position: [720, 496]
  },
  output: [{ rejected: true, reason: 'x-studio-secret header missing or wrong' }]
});

const editContext = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Edit Context',
    parameters: {
      mode: 'manual',
      assignments: {
        assignments: [
          { id: 'c1', name: 'generationId', type: 'string', value: expr("{{ $('Edit Webhook').first().json.body?.generation_id ?? '' }}") },
          { id: 'c2', name: 'cardId', type: 'string', value: expr("{{ $('Edit Webhook').first().json.body?.card_id ?? '' }}") },
          { id: 'c3', name: 'kind', type: 'string', value: expr("{{ $('Edit Webhook').first().json.body?.kind ?? '' }}") },
          { id: 'c4', name: 'executionId', type: 'string', value: expr('{{ String($execution.id) }}') },
          { id: 'c5', name: 'imagePath', type: 'string', value: expr("{{ ($('Edit Webhook').first().json.body?.card_id ?? '') + '/' + ($('Edit Webhook').first().json.body?.generation_id ?? '') + '.png' }}") }
        ]
      },
      includeOtherFields: false,
      options: {}
    },
    position: [720, 208]
  },
  output: [{ generationId: sampleGenerationId, cardId: sampleCardId, kind: 'edit_text', executionId: sampleExecutionId, imagePath: sampleImagePath }]
});

const getGeneration = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Get Generation',
    parameters: {
      method: 'GET',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/generations?id=eq.{{ $('Edit Context').first().json.generationId }}&select=*,cards!generations_card_id_fkey(id,client_id,print_text,garment_color,placement,reference_paths,similarity_tier,brief_text,style_card_id)"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") },
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") },
          { name: 'Accept', value: 'application/vnd.pgrst.object+json' }
        ]
      },
      options: { timeout: 15000 }
    },
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 2000,
    onError: 'continueErrorOutput',
    position: [960, 208]
  },
  output: [sampleGeneration]
});

const isRegenerate = ifElse({
  version: 2.2,
  config: {
    name: 'Regenerate?',
    parameters: {
      conditions: {
        options: looseOptions,
        conditions: [
          { id: 'k1', leftValue: expr('{{ $json.kind ?? "" }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'regenerate' }
        ],
        combinator: 'and'
      },
      options: {}
    },
    position: [1200, 208]
  },
  output: [sampleGeneration]
});

const fireGenerateWorker = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Fire Generate Dispatcher',
    parameters: {
      method: 'POST',
      url: expr("{{ $('Load Config').first().json.n8nBaseUrl }}/webhook/studio-generate"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'Content-Type', value: 'application/json' },
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ generation_id: $('Edit Context').first().json.generationId, card_id: $('Edit Context').first().json.cardId }) }}"),
      options: { timeout: 15000 }
    },
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 3000,
    onError: 'continueErrorOutput',
    position: [1440, 16]
  },
  output: [{ message: 'Workflow was started' }]
});

const generationWorking = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Generation → working',
    parameters: {
      method: 'PATCH',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/generations?id=eq.{{ $('Edit Context').first().json.generationId }}"),
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
      jsonBody: expr("{{ JSON.stringify({ status: 'working', n8n_execution_id: $('Edit Context').first().json.executionId, started_at: $now.toISO(), last_error: null }) }}"),
      options: { timeout: 15000 }
    },
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [1440, 304]
  },
  output: [{ ...sampleGenerationRow, status: 'working', n8n_execution_id: sampleExecutionId }]
});

const promptEngine = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Prompt Engine',
    parameters: {
      method: 'POST',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/functions/v1/prompt-engine"),
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
      jsonBody: expr("{{ JSON.stringify({ generation_id: $('Edit Context').first().json.generationId }) }}"),
      options: { timeout: 90000 }
    },
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 5000,
    onError: 'continueErrorOutput',
    position: [1680, 304]
  },
  output: [samplePromptEngine]
});

const listInputPaths = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'List Input Paths',
    parameters: {
      jsCode: "const pe = $input.first().json || {};\nconst gen = $('Get Generation').first().json;\nconst plan = Array.isArray(pe.input_paths) ? pe.input_paths : [];\nlet items = plan.map((p) => (typeof p === 'string' ? { path: p, role: 'previous_version', bucket: 'gens' } : { path: String((p && (p.path || p.storage_path)) || ''), role: String((p && (p.role || p.label)) || 'previous_version'), bucket: (p && p.bucket) || 'gens' }));\nitems = items.map((it) => ({ path: it.path.replace(/^(refs|gens)\\//, '').trim(), role: it.role, bucket: it.bucket || 'gens' })).filter((it) => it.path);\nconst prev = items.filter((it) => it.role === 'previous_version').slice(0, 1);\nconst mask = items.filter((it) => it.role === 'mask').slice(0, 1);\nif (!prev.length) throw new Error('prompt-engine returned no previous_version path for ' + (gen.kind || 'edit') + ' (parent generation has no image)');\nreturn prev.concat(mask).map((it, i) => ({ json: Object.assign(it, { index: i + 1 }) }));"
    },
    onError: 'continueErrorOutput',
    position: [1920, 304]
  },
  output: [sampleInputPath]
});

const signInput = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Sign Input',
    parameters: {
      method: 'POST',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/storage/v1/object/sign/{{ $json.bucket }}/{{ $json.path }}"),
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
    position: [2160, 304]
  },
  output: [{ signedURL: sampleSignedParentPath }]
});

const buildEditTask = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build Edit Task',
    parameters: {
      jsCode: "const cfg = $('Load Config').first().json;\nconst pe = $('Prompt Engine').first().json;\nconst plan = $('List Input Paths').all().map((i) => i.json);\nconst urls = $input.all().map((i) => cfg.sbUrl + '/storage/v1' + String(i.json.signedURL || ''));\nif (urls.length !== plan.length || urls.some((u) => !/token=/.test(u))) throw new Error('could not sign every edit input (' + urls.length + '/' + plan.length + ')');\nlet prompt = String(pe.final_prompt || pe.rendered_prompt || '').trim();\nif (!prompt) throw new Error('prompt-engine returned an empty edit instruction');\nconst hasMask = plan.some((p) => p.role === 'mask');\nif (hasMask) prompt += '\\n\\nThe second image is a black-and-white mask of the first image: change ONLY the white region of the mask; every pixel under the black region must stay exactly identical to the first image.';\nconst body = { model: 'google/nano-banana-edit', input: { prompt: prompt.slice(0, 20000), image_urls: urls, output_format: 'png' } };\nreturn { json: { body, attempt: Number($('Get Generation').first().json.attempt) || 1, has_mask: hasMask, input_roles: plan.map((p) => p.role) } };"
    },
    onError: 'continueErrorOutput',
    position: [2400, 304]
  },
  output: [{ body: sampleEditBody, attempt: 1, has_mask: false, input_roles: ['previous_version'] }]
});

const createEditTask = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Create Edit Task',
    parameters: {
      method: 'POST',
      url: kieBaseUrl + '/api/v1/jobs/createTask',
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
      options: { timeout: 60000 }
    },
    credentials: { httpHeaderAuth: kieImageCredential },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 5000,
    onError: 'continueErrorOutput',
    position: [2640, 304]
  },
  output: [sampleCreateResponse]
});

const taskCreated = ifElse({
  version: 2.2,
  config: {
    name: 'Task Created?',
    parameters: {
      conditions: {
        options: looseOptions,
        conditions: [
          { id: 't1', leftValue: expr('{{ $json.code }}'), operator: { type: 'number', operation: 'equals' }, rightValue: 200 },
          { id: 't2', leftValue: expr('{{ $json.data?.taskId ?? "" }}'), operator: { type: 'string', operation: 'notEmpty', singleValue: true } }
        ],
        combinator: 'and'
      },
      options: {}
    },
    position: [2880, 304]
  },
  output: [sampleCreateResponse]
});

const saveVendorJob = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Save Vendor Job',
    parameters: {
      method: 'PATCH',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/generations?id=eq.{{ $('Edit Context').first().json.generationId }}"),
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
      jsonBody: expr("{{ JSON.stringify({ vendor_job_id: $('Create Edit Task').first().json.data.taskId, vendor: 'kie', model: 'google/nano-banana-edit', status: 'working' }) }}"),
      options: { timeout: 15000 }
    },
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [3120, 304]
  },
  output: [{ ...sampleGenerationRow, status: 'working', vendor: 'kie', model: 'google/nano-banana-edit', vendor_job_id: sampleTaskId }]
});

const pollUntilDone = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.2,
  config: {
    name: 'Poll Until Done',
    parameters: {
      workflowId: { __rl: true, mode: 'id', value: pollWorkflowId, cachedResultName: 'DM Studio · WF-5 Poll' },
      workflowInputs: {
        mappingMode: 'defineBelow',
        value: {
          taskId: expr("{{ $('Create Edit Task').first().json.data.taskId }}"),
          url: expr("{{ '" + kieBaseUrl + "/api/v1/jobs/recordInfo?taskId=' + $('Create Edit Task').first().json.data.taskId }}"),
          interval: 10,
          timeout: 600
        },
        matchingColumns: [],
        schema: [
          { id: 'taskId', displayName: 'taskId', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string', removed: false },
          { id: 'url', displayName: 'url', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string', removed: false },
          { id: 'interval', displayName: 'interval', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'number', removed: false },
          { id: 'timeout', displayName: 'timeout', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'number', removed: false }
        ],
        attemptToConvertTypes: false,
        convertFieldsToString: true
      },
      mode: 'once',
      options: { waitForSubWorkflow: true }
    },
    onError: 'continueErrorOutput',
    position: [3360, 304]
  },
  output: [samplePollResult]
});

const downloadResult = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Download Result',
    parameters: {
      method: 'GET',
      url: expr('{{ $json.resultUrl }}'),
      options: {
        response: { response: { responseFormat: 'file' } },
        timeout: 120000
      }
    },
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 3000,
    onError: 'continueErrorOutput',
    position: [3600, 304]
  },
  output: [{ json: {}, binary: { data: { fileName: sampleTaskId + '.png', mimeType: 'image/png', fileExtension: 'png' } } }]
});

const uploadToGens = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Upload To Gens',
    parameters: {
      method: 'POST',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/storage/v1/object/gens/{{ $('Edit Context').first().json.imagePath }}"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") },
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") },
          { name: 'Content-Type', value: 'image/png' },
          { name: 'x-upsert', value: 'true' }
        ]
      },
      sendBody: true,
      contentType: 'binaryData',
      inputDataFieldName: 'data',
      options: { timeout: 180000 }
    },
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 3000,
    onError: 'continueErrorOutput',
    position: [3840, 304]
  },
  output: [{ Key: 'gens/' + sampleImagePath, Id: '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f' }]
});

const saveImagePath = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Save Image Path',
    parameters: {
      method: 'PATCH',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/generations?id=eq.{{ $('Edit Context').first().json.generationId }}"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") },
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") },
          { name: 'Content-Type', value: 'application/json' },
          { name: 'Prefer', value: 'return=representation' },
          { name: 'Accept', value: 'application/vnd.pgrst.object+json' }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ image_path: $('Edit Context').first().json.imagePath, vendor_job_id: $('Create Edit Task').first().json.data.taskId, vendor: 'kie', reference_urls: $('List Input Paths').all().map((i) => i.json) }) }}"),
      options: { timeout: 15000 }
    },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 3000,
    onError: 'continueErrorOutput',
    position: [4080, 304]
  },
  output: [{ ...sampleGenerationRow, status: 'working', vendor: 'kie', vendor_job_id: sampleTaskId, image_path: sampleImagePath, reference_urls: [sampleInputPath] }]
});

const signResult = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Sign Result',
    parameters: {
      method: 'POST',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/storage/v1/object/sign/gens/{{ $('Edit Context').first().json.imagePath }}"),
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
    position: [4320, 304]
  },
  output: [{ signedURL: sampleSignedGenPath }]
});

const getQcTemplates = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Get QC Templates',
    parameters: {
      method: 'GET',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/prompt_templates?slug=in.(qc_prompt,corrective_suffix)&active=is.true&select=slug,version,body&order=version.desc"),
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
    position: [4560, 304]
  },
  output: [{ slug: 'qc_prompt', version: 1, body: 'You are a strict print-on-demand quality inspector. Inspect the attached generated design image.\n\nEXPECTED ON-DESIGN TEXT: """{{EXPECTED_TEXT}}"""\n\nPerform these checks: ...' }, { slug: 'corrective_suffix', version: 1, body: '\n\nCRITICAL CORRECTIONS - a previous attempt failed quality inspection. Fix ALL of the following while keeping everything else identical: {{ISSUES}}. The ONLY text in the image must read exactly: "{{EXPECTED_TEXT}}" - spelled letter for letter ({{EXPECTED_TEXT_SPACED}}) - with no other words, watermarks or signatures anywhere.' }]
});

const buildQcRequest = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build QC Request',
    parameters: {
      jsCode: "const cfg = $('Load Config').first().json;\nconst gen = $('Get Generation').first().json;\nconst rows = $input.all().map((i) => i.json);\nconst tpl = rows.find((r) => r.slug === 'qc_prompt');\nif (!tpl || !tpl.body) throw new Error('prompt_templates: no active qc_prompt template');\nconst src = (gen.brief_snapshot && Array.isArray(gen.brief_snapshot.print_text)) ? gen.brief_snapshot.print_text : ((gen.cards && gen.cards.print_text) || []);\nlet lines = src.map((t) => String((t && t.text) || '').trim()).filter(Boolean);\nif (gen.kind === 'edit_text' && gen.old_text && gen.new_text) lines = lines.map((l) => (l === String(gen.old_text).trim() ? String(gen.new_text).trim() : l));\nconst styleCard = gen.style_card_snapshot || {};\nconst imageUrl = cfg.sbUrl + '/storage/v1' + String($('Sign Result').first().json.signedURL || '');\nconst vars = { EXPECTED_TEXT: lines.join('\\n'), TEXT_LINES: lines.length ? lines.join('\\n') : 'NONE', TEXT_LINES_JSON: JSON.stringify(lines), STYLE_CARD_JSON: JSON.stringify(styleCard), PALETTE_JSON: JSON.stringify(styleCard.palette || []), GARMENT_COLOR: (gen.cards && gen.cards.garment_color) || '' };\nlet text = String(tpl.body).replace(/\\{\\{\\s*([A-Z_]+)\\s*\\}\\}/g, (m, k) => (k in vars ? vars[k] : m));\nif (!lines.length) text = text.replace(/EXPECTED ON-DESIGN TEXT: \"\"\"[\\s\\S]*?\"\"\"/, 'EXPECTED ON-DESIGN TEXT: (none - the image must contain NO text at all)');\nif (!/STYLE_CARD_JSON|PALETTE_JSON/.test(tpl.body)) text += '\\n\\nSTYLE CARD (locked JSON for this client - report any palette or style violation):\\n' + vars.STYLE_CARD_JSON;\nif (!/EXPECTED_TEXT|TEXT_LINES/.test(tpl.body)) text += '\\n\\nEXACT TEXT LINES (each must appear verbatim, exactly once):\\n' + vars.TEXT_LINES;\nconst body = { messages: [{ role: 'user', content: [{ type: 'text', text }, { type: 'image_url', image_url: { url: imageUrl } }] }], response_format: { type: 'json_object' } };\nreturn { json: { body, text_lines: lines, expected_text: lines.join('\\n'), image_url: imageUrl, template_version: tpl.version } };"
    },
    onError: 'continueErrorOutput',
    position: [4800, 304]
  },
  output: [{ body: { messages: [{ role: 'user', content: [{ type: 'text', text: 'You are a strict print-on-demand quality inspector ...' }, { type: 'image_url', image_url: { url: sampleSignedGenUrl } }] }], response_format: { type: 'json_object' } }, text_lines: ['FAMILY FOREVER'], expected_text: 'FAMILY FOREVER', image_url: sampleSignedGenUrl, template_version: 1 }]
});

const visionQc = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Vision QC',
    parameters: {
      method: 'POST',
      url: kieBaseUrl + '/gemini-3.1-pro/v1/chat/completions',
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
      options: { timeout: 120000 }
    },
    credentials: { httpHeaderAuth: kieVisionCredential },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2500,
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [5040, 304]
  },
  output: [sampleQcResponse]
});

const qcJudge = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'QC Judge',
    parameters: {
      method: 'POST',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/functions/v1/qc-judge"),
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
      jsonBody: expr("{{ JSON.stringify({ generation_id: $('Edit Context').first().json.generationId, qc_raw: ($json.choices?.[0]?.message?.content ?? JSON.stringify($json)), exact_text_lines: $('Build QC Request').first().json.text_lines, attempt: $('Build Edit Task').first().json.attempt }) }}"),
      options: { timeout: 60000 }
    },
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 3000,
    onError: 'continueErrorOutput',
    position: [5280, 304]
  },
  output: [sampleJudge]
});

const generationDone = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Generation → done',
    parameters: {
      method: 'PATCH',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/generations?id=eq.{{ $('Edit Context').first().json.generationId }}"),
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
      jsonBody: expr("{{ JSON.stringify({ status: 'done', finished_at: $now.toISO(), last_error: null }) }}"),
      options: { timeout: 15000 }
    },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 3000,
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [5520, 304]
  },
  output: [{ ...sampleGenerationRow, status: 'done', vendor_job_id: sampleTaskId, image_path: sampleImagePath }]
});

const setCurrentGeneration = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Set Current Generation',
    parameters: {
      method: 'PATCH',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/cards?id=eq.{{ $('Edit Context').first().json.cardId }}"),
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
      jsonBody: expr("{{ JSON.stringify({ current_generation_id: $('Edit Context').first().json.generationId }) }}"),
      options: { timeout: 15000 }
    },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 3000,
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [5760, 304]
  },
  output: [{ ...sampleCardEmbedded, stage: 'editing', current_generation_id: sampleGenerationId }]
});

const cardNeedsReview = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Card → needs_review',
    parameters: {
      method: 'POST',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/rpc/move_card"),
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
      jsonBody: expr("{{ JSON.stringify({ p_card_id: $('Edit Context').first().json.cardId, p_stage: 'needs_review', p_note: ($('Get Generation').first().json.kind || 'edit') + ' ' + $('Edit Context').first().json.generationId + ' ready (QC score ' + String($('QC Judge').first().json.qc_report?.score ?? 'n/a') + ')' }) }}"),
      options: { timeout: 15000 }
    },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 3000,
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [6000, 304]
  },
  output: [{ ...sampleCardEmbedded, stage: 'needs_review', current_generation_id: sampleGenerationId }]
});

const failMessage = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Fail Message',
    parameters: {
      mode: 'runOnceForEachItem',
      jsCode: "const j = $json || {};\nconst ctx = $('Edit Context').first().json;\nconst text = (v) => (v === undefined || v === null || v === '' ? '' : (typeof v === 'object' ? String(v.message || v.description || JSON.stringify(v)) : String(v)));\nconst vendor = (typeof j.code === 'number' && j.code !== 200) ? ('Kie ' + j.code + ': ' + text(j.msg)) : '';\nconst message = (text(j.error) || vendor || text(j.failMsg) || text(j.message) || text(j.detail) || text(j.hint) || 'edit failed').slice(0, 500);\nreturn { json: { message, generationId: ctx.generationId, cardId: ctx.cardId } };"
    },
    position: [3600, 800]
  },
  output: [{ message: 'Poll failed for task ' + sampleTaskId + ': edit failed', generationId: sampleGenerationId, cardId: sampleCardId }]
});

const generationFailed = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Generation → failed',
    parameters: {
      method: 'PATCH',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/generations?id=eq.{{ $('Edit Context').first().json.generationId }}"),
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
      jsonBody: expr("{{ JSON.stringify({ status: 'failed', last_error: $json.message, finished_at: $now.toISO() }) }}"),
      options: { timeout: 15000 }
    },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 3000,
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [3840, 800]
  },
  output: [{ ...sampleGenerationRow, status: 'failed', last_error: 'Poll failed for task ' + sampleTaskId + ': edit failed' }]
});

const cardFailed = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Card → failed',
    parameters: {
      method: 'POST',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/rpc/move_card"),
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
      jsonBody: expr("{{ JSON.stringify({ p_card_id: $('Edit Context').first().json.cardId, p_stage: 'failed', p_note: $('Fail Message').first().json.message, p_force: true }) }}"),
      options: { timeout: 15000 }
    },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 3000,
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [4080, 800]
  },
  output: [{ ...sampleCardEmbedded, stage: 'failed', last_error: 'Poll failed for task ' + sampleTaskId + ': edit failed' }]
});

export default workflow('dm-studio-wf3-edit', 'DM Studio · WF-3 Edit')
  .add(editNote)
  .add(editWebhook)
  .to(loadConfig)
  .to(secretOk.onTrue(editContext).onFalse(rejected))
  .add(editContext)
  .to(getGeneration.onError(failMessage))
  .to(isRegenerate.onTrue(fireGenerateWorker).onFalse(generationWorking))
  .add(fireGenerateWorker.onError(failMessage))
  .add(generationWorking)
  .to(promptEngine.onError(failMessage))
  .to(listInputPaths.onError(failMessage))
  .to(signInput.onError(failMessage))
  .to(buildEditTask.onError(failMessage))
  .to(createEditTask.onError(failMessage))
  .to(taskCreated.onTrue(saveVendorJob).onFalse(failMessage))
  .add(saveVendorJob)
  .to(pollUntilDone.onError(failMessage))
  .to(downloadResult.onError(failMessage))
  .to(uploadToGens.onError(failMessage))
  .to(saveImagePath.onError(failMessage))
  .to(signResult.onError(failMessage))
  .to(getQcTemplates.onError(failMessage))
  .to(buildQcRequest.onError(failMessage))
  .to(visionQc)
  .to(qcJudge.onError(failMessage))
  .to(generationDone)
  .to(setCurrentGeneration)
  .to(cardNeedsReview)
  .add(failMessage)
  .to(generationFailed)
  .to(cardFailed);
