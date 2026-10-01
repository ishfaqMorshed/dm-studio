import { workflow, node, trigger, sticky, placeholder, newCredential, ifElse, switchCase, merge, splitInBatches, nextBatch, languageModel, memory, tool, outputParser, embedding, embeddings, vectorStore, retriever, documentLoader, textSplitter, reranker, fromAi, expr } from '@n8n/workflow-sdk';

const supabaseUrl = 'https://voatrqhfsdfjomyajovi.supabase.co';
const n8nBaseUrl = 'https://n8n.srv1202488.hstgr.cloud';
const kieBaseUrl = 'https://api.kie.ai';
const configWorkflowId = 'vbyjWhK4ZRN9uZUM';
const pollWorkflowId = '3Sr7H74AxZUu6QiW';

const kieImageCredential = newCredential('GPT Image 2 [DM-Kie]', 'w0sDpl2nll4HkF6h');
const kieVisionCredential = newCredential('Gemini 3.1 Pro [DM-Kie]', '0l2nHQUQNnsCAfTR');

const looseOptions = { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 1 };
const sampleConfig = { sbUrl: supabaseUrl, anonKey: 'sb_publishable_redacted', n8nBaseUrl, studioSecret: 'redacted', ideogramKey: 'redacted', imgbbKey: 'redacted', mlKey: 'redacted', upscaleModel: 'ultra_resolution', upscaleScale: 4 };
const sampleRejected = { rejected: true, reason: 'x-studio-secret header missing or wrong' };
const uuidPattern = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

const sampleCardId = '1a2b3c4d-5e6f-4a70-8b91-0c1d2e3f4a5b';
const sampleClientId = '7c6d5e4f-3a2b-4c1d-9e8f-0a1b2c3d4e5f';
const sampleGenerationId = '9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b';
const sampleStyleCardId = '3f2e1d0c-9b8a-4765-8321-0fedcba98765';
const sampleTaskId = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
const sampleExecutionId = '48213';
const sampleRefPath1 = sampleClientId + '/' + sampleCardId + '/1.png';
const sampleRefPath2 = sampleClientId + '/' + sampleCardId + '/2.jpg';
const sampleLibraryPath = sampleClientId + '/library/0d1e2f3a-4b5c-4d6e-8f90-a1b2c3d4e5f6.png';
const sampleSignedRefPath = '/object/sign/refs/' + sampleRefPath1 + '?token=redacted';
const sampleSignedRefUrl = supabaseUrl + '/storage/v1' + sampleSignedRefPath;
const sampleImagePath = sampleCardId + '/' + sampleGenerationId + '.png';
const sampleSignedGenPath = '/object/sign/gens/' + sampleImagePath + '?token=redacted';
const sampleSignedGenUrl = supabaseUrl + '/storage/v1' + sampleSignedGenPath;
const sampleResultUrl = 'https://tempfile.aiquickdraw.com/s/' + sampleTaskId + '.png';
const samplePrompt = 'Flat print-ready screen-print style vector illustration of a bear over a lake inside a circular badge ... The ONLY text is "FAMILY FIRST" (F A M I L Y   F I R S T) ... solid flat even grey background #808080, no shadows.';

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
const sampleCardEmbedded = { id: sampleCardId, client_id: sampleClientId, print_text: [{ role: 'headline', text: 'FAMILY FIRST' }], garment_color: 'black', placement: 'front_chest', reference_paths: [sampleRefPath1, sampleRefPath2], similarity_tier: 3, brief_text: 'Retro camping badge with a bear over a lake', style_card_id: sampleStyleCardId };
const sampleClaimed = { id: sampleGenerationId, card_id: sampleCardId, kind: 'generate', status: 'dispatched', attempt: 1, parent_generation_id: null, vendor_job_id: null, image_path: null, n8n_execution_id: null };
const sampleGeneration = {
  ...sampleClaimed,
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
  kind: 'generate',
  base: 'fresh',
  model: 'gpt-image-2-5-sunburst-image-to-image',
  aspect_ratio: '1:1',
  resolution: '2K',
  rendered_prompt: samplePrompt,
  magic_prompt_json: { print_rules: '...', style_card: '...', lessons: '...', exemplars: '...', reference_reading: '...', similarity_tier: '...', brief: '...', text: '...' },
  input_paths: [
    { bucket: 'refs', path: sampleRefPath1, role: 'style_reference' },
    { bucket: 'refs', path: sampleRefPath2, role: 'style_reference' },
    { bucket: 'refs', path: sampleLibraryPath, role: 'client_look' }
  ],
  style_card_version: 1,
  templates: { tier_rules: 1, text_rules: 1, background_rule: 1, defects: 1, placement_aspect: 1 }
};
const sampleInputPath = { path: sampleRefPath1, role: 'style_reference', bucket: 'refs', index: 1 };
const sampleCreateBody = {
  model: 'gpt-image-2-5-sunburst-image-to-image',
  callBackUrl: n8nBaseUrl + '/webhook-waiting/' + sampleExecutionId,
  input: { prompt: samplePrompt, input_urls: [sampleSignedRefUrl], aspect_ratio: '1:1', resolution: '2K', background: 'opaque' }
};
const sampleCreateResponse = { code: 200, msg: 'success', data: { taskId: sampleTaskId } };
const samplePollData = { taskId: sampleTaskId, model: 'gpt-image-2-5-sunburst-image-to-image', state: 'success', param: '{}', resultJson: '{"resultUrls":["' + sampleResultUrl + '"]}', failCode: null, failMsg: null, completeTime: 1790000060000, createTime: 1790000000000, costTime: 60000, creditsConsumed: 6, progress: 100 };
const samplePollResponse = { code: 200, msg: 'success', data: samplePollData };
const samplePollResult = { ok: true, decision: 'success', failMsg: '', taskId: sampleTaskId, state: 'success', resultUrls: [sampleResultUrl], resultUrl: sampleResultUrl, creditsConsumed: 6, raw: samplePollResponse, finishedAt: '2026-09-24T10:01:00.000Z' };
const sampleQcContent = '{"text_found":"FAMILY FIRST","text_matches":true,"text_once":true,"extra_text":false,"text_legible":true,"no_halos":true,"background_ok":true,"no_shadows":true,"flat_artwork":true,"edges_clean":true,"palette_ok":true,"style_violations":[],"min_text_height_frac":0.08,"issues":[],"pass":true}';
const sampleQcResponse = { id: 'chatcmpl-qc', object: 'chat.completion', model: 'gemini-3.1-pro', choices: [{ index: 0, message: { role: 'assistant', content: sampleQcContent }, finish_reason: 'stop' }], usage: { prompt_tokens: 1800, completion_tokens: 200 } };
const sampleQcReport = { checks: [{ id: 'text_matches', name: 'text_matches', pass: true, note: '' }, { id: 'background_ok', name: 'background_ok', pass: true, note: '' }], score: 100, needs_regen: false, corrective_instruction: '', style_violations: [], text_ok: true, min_text_height_frac: 0.08 };
const sampleJudge = { ok: true, generation_id: sampleGenerationId, qc_report: sampleQcReport, needs_regen: false, corrective_instruction: '', text_elements: [{ text: 'FAMILY FIRST', height_frac: 0.08 }] };
const sampleDecision = { regen: false, attempt: 1, needs_regen: false, score: 100, corrective_instruction: '', parse_error: '' };

const generateNote = sticky(
  '## DM Studio · WF-2 Generate (Supabase ⇄ n8n ⇄ Kie GPT Image 2.5)\n' +
  '**Config convention (no n8n credentials except Kie).** Both triggers first run **Load Config** / **Load Dispatch Config** = Execute Workflow → *DM Studio · WF-0 Studio Config* (SDK const configWorkflowId = vbyjWhK4ZRN9uZUM, substituted with the WF-0 id at create time). WF-0 returns one item { sbUrl, anonKey, n8nBaseUrl, studioSecret, ideogramKey, imgbbKey, mlKey, upscaleModel, upscaleScale } and every downstream node reads $(\'Load Config\').first().json.<field> (dispatcher branch: $(\'Load Dispatch Config\')). **Secret OK?** / **Dispatch Secret OK?** compare the incoming x-studio-secret header with config.studioSecret and are the only webhook auth (both Webhook nodes: authentication none); a mismatch ends in the no-op Set *Rejected* / *Dispatch Rejected*. Every Supabase REST / RPC / Storage / Edge Function call sends headers apikey = anonKey and x-studio-secret = studioSecret (no Authorization header, no service-role key anywhere); the Fire Worker self-call sends the same secret header and uses config.n8nBaseUrl.\n\n' +
  '**What to paste where:** nothing in this workflow. All keys are pasted once in WF-0 Studio Config → Set node *Studio Config* (studioSecret = private.secrets key studio_secret, Ideogram / imgbb / ModelsLab keys). Kie stays on the existing n8n credentials bound by id: images **GPT Image 2 [DM-Kie]** (w0sDpl2nll4HkF6h) on Create Task, vision **Gemini 3.1 Pro [DM-Kie]** (0l2nHQUQNnsCAfTR) on Vision QC. Poll Until Done is bound to *DM Studio · WF-5 Poll* through the SDK const pollWorkflowId = 3Sr7H74AxZUu6QiW.\n\n' +
  '**Dispatcher** (Generate Webhook studio-generate ← cards stage→approved trigger and the 5-min pg_cron sweep): Load Dispatch Config → Dispatch Secret OK? → claim_generations() → one Fire Worker call per claimed generation (Split In Batches size 1 / 300 ms). Concurrency (settings.max_active_generations) is enforced by the RPC.\n\n' +
  '**Worker** (Worker Webhook studio-generate-worker; one generation per execution, so $execution.id, the Wait resume URL and WF-6 lookups are unambiguous; WF-3 regenerate rows arrive through the dispatcher, never by a direct POST here): Load Config → Secret OK? → Config (ids) → Get Generation (+card) → move_card(generating) → PATCH working + n8n_execution_id → Edge Function **prompt-engine** → List Input Paths (the engine\'s input_paths plan: card refs as style_reference, up to 3 library refs as client_look for tier ≥ 3; card reference_paths only as a fallback) → sign every planned path (bucket from the plan, 1 h) → Build Create Task (model/aspect/resolution from the engine, rendered_prompt as-is - it already carries the per-image role labels -, background opaque, callBackUrl = this execution\'s resume URL) → Kie jobs/createTask → PATCH vendor_job_id → **Wait For Callback** (resume on webhook, 8-min limit) → on callback OR timeout: **WF-5 Poll** sub-workflow (recordInfo every 10 s, 10-min cap; 8 + 10 min keeps every pass inside the 20-min requeue_stale() window, and PATCH attempt 2 re-stamps started_at so the corrective pass gets its own window) → download resultUrls[0] → upload gens/<card_id>/<generation_id>.png (x-upsert) → PATCH image_path + vendor_job_id + reference_urls → sign the PNG → Get QC Templates (prompt_templates slugs **qc_prompt**, **corrective_suffix**; never inlined, EXTRACT.md §3.8/§3.9 verbatim) → Vision QC (Kie gemini-3.1-pro; {{EXPECTED_TEXT}} = bare text lines inside the template\'s own triple quotes, whole EXPECTED line replaced by the (none ...) variant when the card has no text; Style Card JSON appended; image as image_url, JSON mode, fail-open) → Edge Function **qc-judge** → Decide Regen: needs_regen && attempt 1 → PATCH attempt 2 → corrective_suffix rendered ({{ISSUES}}, {{EXPECTED_TEXT}}, {{EXPECTED_TEXT_SPACED}}; no-text tail variant) and appended after exactly one blank line → Create Task once more (same Wait/Poll/upload path, same image_path) → PATCH done → PATCH cards.current_generation_id (set_current_generation is staff-only, the cards_worker_update policy allows the PATCH) → move_card(needs_review).\n\n' +
  'Any failure → Fail Message → PATCH generation failed + last_error → move_card(failed, message). **Create order:** WF-0 Studio Config and WF-5 Poll first, then paste their ids into configWorkflowId / pollWorkflowId, create this workflow, then set WF-6 as its error workflow. Never publish from code.',
  { color: 4, width: 460, height: 1180, position: [-1000, 40] }
);

const generateWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Generate Webhook',
    parameters: {
      httpMethod: 'POST',
      path: 'studio-generate',
      responseMode: 'onReceived',
      options: {}
    },
    position: [-480, 800]
  },
  output: [{ headers: { 'content-type': 'application/json', 'x-studio-secret': 'redacted' }, params: {}, query: {}, body: { card_id: sampleCardId, generation_id: sampleGenerationId }, webhookUrl: n8nBaseUrl + '/webhook/studio-generate', executionMode: 'production' }]
});

const loadDispatchConfig = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.2,
  config: {
    name: 'Load Dispatch Config',
    parameters: {
      workflowId: { __rl: true, mode: 'id', value: configWorkflowId, cachedResultName: 'DM Studio · WF-0 Studio Config' },
      mode: 'once',
      options: { waitForSubWorkflow: true }
    },
    executeOnce: true,
    position: [-240, 800]
  },
  output: [sampleConfig]
});

const dispatchSecretOk = ifElse({
  version: 2.2,
  config: {
    name: 'Dispatch Secret OK?',
    parameters: {
      conditions: {
        options: looseOptions,
        conditions: [
          { id: 'ds1', leftValue: expr("{{ $('Generate Webhook').first().json.headers?.['x-studio-secret'] ?? '' }}"), operator: { type: 'string', operation: 'equals' }, rightValue: expr("{{ $('Load Dispatch Config').first().json.studioSecret }}") }
        ],
        combinator: 'and'
      },
      options: {}
    },
    position: [0, 800]
  },
  output: [sampleConfig]
});

const dispatchRejected = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Dispatch Rejected',
    parameters: {
      mode: 'manual',
      assignments: {
        assignments: [
          { id: 'dr1', name: 'rejected', type: 'boolean', value: true },
          { id: 'dr2', name: 'reason', type: 'string', value: 'x-studio-secret header missing or wrong' }
        ]
      },
      includeOtherFields: false,
      options: {}
    },
    position: [240, 992]
  },
  output: [sampleRejected]
});

const claimGenerations = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Claim Generations',
    parameters: {
      method: 'POST',
      url: expr("{{ $('Load Dispatch Config').first().json.sbUrl }}/rest/v1/rpc/claim_generations"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'x-studio-secret', value: expr("{{ $('Load Dispatch Config').first().json.studioSecret }}") },
          { name: 'apikey', value: expr("{{ $('Load Dispatch Config').first().json.anonKey }}") },
          { name: 'Content-Type', value: 'application/json' }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '{}',
      options: { timeout: 15000 }
    },
    executeOnce: true,
    onError: 'continueRegularOutput',
    position: [480, 800]
  },
  output: [sampleClaimed]
});

const hasGenerationId = node({
  type: 'n8n-nodes-base.filter',
  version: 2.2,
  config: {
    name: 'Has Generation ID',
    parameters: {
      conditions: {
        options: looseOptions,
        conditions: [
          { id: 'h', leftValue: expr('{{ $json.id ?? "" }}'), operator: { type: 'string', operation: 'regex' }, rightValue: uuidPattern }
        ],
        combinator: 'and'
      },
      options: {}
    },
    position: [720, 800]
  },
  output: [sampleClaimed]
});

const eachGeneration = splitInBatches({
  version: 3,
  config: {
    name: 'Each Generation',
    parameters: { batchSize: 1, options: {} },
    position: [960, 800]
  },
  output: [sampleClaimed]
});

const dispatchComplete = node({
  type: 'n8n-nodes-base.noOp',
  version: 1,
  config: { name: 'Dispatch Complete', parameters: {}, position: [1200, 656] },
  output: [sampleClaimed]
});

const fireWorker = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Fire Worker',
    parameters: {
      method: 'POST',
      url: expr("{{ $('Load Dispatch Config').first().json.n8nBaseUrl }}/webhook/studio-generate-worker"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'x-studio-secret', value: expr("{{ $('Load Dispatch Config').first().json.studioSecret }}") },
          { name: 'Content-Type', value: 'application/json' }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ generation_id: $json.id, card_id: $json.card_id }) }}'),
      options: {
        batching: { batch: { batchSize: 1, batchInterval: 300 } },
        timeout: 10000
      }
    },
    onError: 'continueRegularOutput',
    position: [1200, 896]
  },
  output: [{ message: 'Workflow was started' }]
});

const workerWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Worker Webhook',
    parameters: {
      httpMethod: 'POST',
      path: 'studio-generate-worker',
      responseMode: 'onReceived',
      options: {}
    },
    position: [-480, 208]
  },
  output: [{ headers: { 'content-type': 'application/json', 'x-studio-secret': 'redacted' }, params: {}, query: {}, body: { generation_id: sampleGenerationId, card_id: sampleCardId }, webhookUrl: n8nBaseUrl + '/webhook/studio-generate-worker', executionMode: 'production' }]
});

const loadConfig = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.2,
  config: {
    name: 'Load Config',
    parameters: {
      workflowId: { __rl: true, mode: 'id', value: configWorkflowId, cachedResultName: 'DM Studio · WF-0 Studio Config' },
      mode: 'once',
      options: { waitForSubWorkflow: true }
    },
    executeOnce: true,
    position: [-240, 208]
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
          { id: 's1', leftValue: expr("{{ $('Worker Webhook').first().json.headers?.['x-studio-secret'] ?? '' }}"), operator: { type: 'string', operation: 'equals' }, rightValue: expr("{{ $('Load Config').first().json.studioSecret }}") }
        ],
        combinator: 'and'
      },
      options: {}
    },
    position: [0, 208]
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
    position: [240, 400]
  },
  output: [sampleRejected]
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
          { id: 'c3', name: 'generationId', type: 'string', value: expr('{{ $(\'Worker Webhook\').first().json.body?.generation_id ?? "" }}') },
          { id: 'c4', name: 'cardId', type: 'string', value: expr('{{ $(\'Worker Webhook\').first().json.body?.card_id ?? "" }}') },
          { id: 'c5', name: 'executionId', type: 'string', value: expr('{{ String($execution.id) }}') },
          { id: 'c6', name: 'imagePath', type: 'string', value: expr('{{ ($(\'Worker Webhook\').first().json.body?.card_id ?? "") + "/" + ($(\'Worker Webhook\').first().json.body?.generation_id ?? "") + ".png" }}') }
        ]
      },
      includeOtherFields: false,
      options: {}
    },
    position: [240, 208]
  },
  output: [{ generationId: sampleGenerationId, cardId: sampleCardId, executionId: sampleExecutionId, imagePath: sampleImagePath }]
});

const getGeneration = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Get Generation',
    parameters: {
      method: 'GET',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/generations?id=eq.{{ $('Config').first().json.generationId }}&select=*,cards!generations_card_id_fkey(id,client_id,print_text,garment_color,placement,reference_paths,similarity_tier,brief_text,style_card_id)"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") },
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") },
          { name: 'Accept', value: 'application/vnd.pgrst.object+json' }
        ]
      },
      options: { timeout: 15000, response: { response: { responseFormat: 'json' } } }
    },
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 2000,
    onError: 'continueErrorOutput',
    position: [480, 208]
  },
  output: [sampleGeneration]
});

const cardGenerating = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Card → generating',
    parameters: {
      method: 'POST',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/rpc/move_card"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") },
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") },
          { name: 'Content-Type', value: 'application/json' }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_card_id: $('Config').first().json.cardId, p_stage: 'generating', p_note: 'generation ' + $('Config').first().json.generationId + ' started' }) }}"),
      options: { timeout: 15000 }
    },
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [720, 208]
  },
  output: [{ ...sampleCardEmbedded, stage: 'generating' }]
});

const generationWorking = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Generation → working',
    parameters: {
      method: 'PATCH',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/generations?id=eq.{{ $('Config').first().json.generationId }}"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") },
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") },
          { name: 'Content-Type', value: 'application/json' },
          { name: 'Prefer', value: 'return=representation' }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ status: 'working', n8n_execution_id: $('Config').first().json.executionId, started_at: $now.toISO(), last_error: null }) }}"),
      options: { timeout: 15000 }
    },
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [960, 208]
  },
  output: [{ ...sampleClaimed, status: 'working', n8n_execution_id: sampleExecutionId }]
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
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") },
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") },
          { name: 'Content-Type', value: 'application/json' }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ generation_id: $('Config').first().json.generationId }) }}"),
      options: { timeout: 90000 }
    },
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 5000,
    onError: 'continueErrorOutput',
    position: [1200, 208]
  },
  output: [samplePromptEngine]
});

const listInputPaths = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'List Input Paths',
    parameters: {
      jsCode: "const pe = $input.first().json || {};\nconst gen = $('Get Generation').first().json;\n// prompt-engine returns the attachment plan as input_paths: [{bucket, path, role: style_reference|client_look|previous_version|mask}]\nconst plan = Array.isArray(pe.input_paths) ? pe.input_paths : (Array.isArray(pe.input_urls_plan) ? pe.input_urls_plan : []);\nlet items = plan.map((p) => (typeof p === 'string' ? { path: p, role: 'style_reference', bucket: 'refs' } : { path: String((p && (p.path || p.storage_path)) || ''), role: String((p && (p.role || p.label)) || 'style_reference'), bucket: (p && p.bucket) || 'refs' }));\nif (!items.length) items = ((gen.cards && gen.cards.reference_paths) || []).map((p) => ({ path: String(p || ''), role: 'style_reference', bucket: 'refs' }));\nitems = items.map((it, i) => ({ path: it.path.replace(/^(refs|gens)\\//, '').trim(), role: it.role, bucket: it.bucket || 'refs', index: i + 1 })).filter((it) => it.path).slice(0, 16);\nif (!items.length) throw new Error('prompt-engine returned no input paths and the card has no reference_paths');\nreturn items.map((it) => ({ json: it }));"
    },
    onError: 'continueErrorOutput',
    position: [1440, 208]
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
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") },
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") },
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
    position: [1680, 208]
  },
  output: [{ signedURL: sampleSignedRefPath }]
});

const buildCreateTask = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build Create Task',
    parameters: {
      jsCode: "const cfg = $('Config').first().json;\nconst pe = $('Prompt Engine').first().json;\nconst plan = $('List Input Paths').all().map((i) => i.json);\nconst urls = $input.all().map((i) => $('Load Config').first().json.sbUrl + '/storage/v1' + String(i.json.signedURL || ''));\nif (urls.length !== plan.length || urls.some((u) => !/token=/.test(u))) throw new Error('could not sign every input reference (' + urls.length + '/' + plan.length + ')');\nconst prompt = String(pe.final_prompt || pe.rendered_prompt || '').trim();\nif (!prompt) throw new Error('prompt-engine returned an empty final_prompt');\n// the engine already renders the per-image role labels into rendered_prompt; roles are kept for the record only\nconst roles = plan.map((p) => p.role).filter(Boolean);\nconst body = { model: pe.model || 'gpt-image-2-5-sunburst-image-to-image', callBackUrl: $execution.resumeUrl, input: { prompt: prompt.slice(0, 20000), input_urls: urls, aspect_ratio: pe.aspect_ratio || '1:1', resolution: pe.resolution || '2K', background: 'opaque' } };\nreturn { json: { body, attempt: 1, input_roles: roles } };"
    },
    onError: 'continueErrorOutput',
    position: [1920, 208]
  },
  output: [{ body: sampleCreateBody, attempt: 1, input_roles: ['style_reference', 'style_reference', 'client_look'] }]
});

const createTask = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Create Task',
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
    position: [2160, 208]
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
    position: [2400, 208]
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
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/generations?id=eq.{{ $('Config').first().json.generationId }}"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") },
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") },
          { name: 'Content-Type', value: 'application/json' },
          { name: 'Prefer', value: 'return=representation' }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ vendor_job_id: $('Create Task').first().json.data.taskId, vendor: 'kie', status: 'working' }) }}"),
      options: { timeout: 15000 }
    },
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [2640, 208]
  },
  output: [{ ...sampleClaimed, status: 'working', vendor: 'kie', vendor_job_id: sampleTaskId }]
});

const waitForCallback = node({
  type: 'n8n-nodes-base.wait',
  version: 1.1,
  config: {
    name: 'Wait For Callback',
    parameters: {
      resume: 'webhook',
      httpMethod: 'POST',
      limitWaitTime: true,
      limitType: 'afterTimeInterval',
      resumeAmount: 8,
      resumeUnit: 'minutes',
      options: {}
    },
    position: [2880, 208]
  },
  output: [{ headers: { 'content-type': 'application/json' }, params: {}, query: {}, body: samplePollResponse }]
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
          taskId: expr("{{ $('Create Task').first().json.data.taskId }}"),
          url: expr("{{ '" + kieBaseUrl + "/api/v1/jobs/recordInfo?taskId=' + $('Create Task').first().json.data.taskId }}"),
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
    position: [3120, 208]
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
    position: [3360, 208]
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
      url: expr("{{ $('Load Config').first().json.sbUrl }}/storage/v1/object/gens/{{ $('Config').first().json.imagePath }}"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") },
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") },
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
    position: [3600, 208]
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
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/generations?id=eq.{{ $('Config').first().json.generationId }}"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") },
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") },
          { name: 'Content-Type', value: 'application/json' },
          { name: 'Prefer', value: 'return=representation' },
          { name: 'Accept', value: 'application/vnd.pgrst.object+json' }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ image_path: $('Config').first().json.imagePath, reference_urls: $('List Input Paths').all().map((i) => i.json) }) }}"),
      options: { timeout: 15000, response: { response: { responseFormat: 'json' } } }
    },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 3000,
    onError: 'continueErrorOutput',
    position: [3840, 208]
  },
  output: [{ ...sampleClaimed, status: 'working', vendor: 'kie', vendor_job_id: sampleTaskId, image_path: sampleImagePath, reference_urls: [sampleInputPath] }]
});

const signResult = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Sign Result',
    parameters: {
      method: 'POST',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/storage/v1/object/sign/gens/{{ $('Config').first().json.imagePath }}"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") },
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") },
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
    position: [4080, 208]
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
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") },
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") }
        ]
      },
      options: { timeout: 15000 }
    },
    executeOnce: true,
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 2000,
    onError: 'continueErrorOutput',
    position: [4320, 208]
  },
  output: [{ slug: 'qc_prompt', version: 1, body: 'You are a strict print-on-demand quality inspector. Inspect the attached generated design image.\n\nEXPECTED ON-DESIGN TEXT: """{{EXPECTED_TEXT}}"""\n\nPerform these checks: ...' }, { slug: 'corrective_suffix', version: 1, body: '\n\nCRITICAL CORRECTIONS - a previous attempt failed quality inspection. Fix ALL of the following while keeping everything else identical: {{ISSUES}}. The ONLY text in the image must read exactly: "{{EXPECTED_TEXT}}" - spelled letter for letter ({{EXPECTED_TEXT_SPACED}}) - with no other words, watermarks or signatures anywhere.' }]
});

const buildQcRequest = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build QC Request',
    parameters: {
      jsCode: "const cfg = $('Config').first().json;\nconst gen = $('Get Generation').first().json;\nconst rows = $input.all().map((i) => i.json);\nconst tpl = rows.find((r) => r.slug === 'qc_prompt');\nif (!tpl || !tpl.body) throw new Error('no active qc_prompt template in prompt_templates');\nconst peText = ((($('Prompt Engine').first().json || {}).magic_prompt_json || {}).text || {}).lines;\n// QC checks exactly the text the prompt asked for (the engine's text slot); the brief snapshot is the fallback\nconst src = Array.isArray(peText) ? peText : ((gen.brief_snapshot && Array.isArray(gen.brief_snapshot.print_text)) ? gen.brief_snapshot.print_text : ((gen.cards && gen.cards.print_text) || []));\nconst lines = src.map((t) => String((t && t.text) || '').trim()).filter(Boolean);\nconst styleCard = gen.style_card_snapshot || {};\nconst imageUrl = $('Load Config').first().json.sbUrl + '/storage/v1' + String($('Sign Result').first().json.signedURL || '');\nconst vars = { EXPECTED_TEXT: lines.join('\\n'), TEXT_LINES: lines.length ? lines.join('\\n') : 'NONE', TEXT_LINES_JSON: JSON.stringify(lines), STYLE_CARD_JSON: JSON.stringify(styleCard), PALETTE_JSON: JSON.stringify(styleCard.palette || []), GARMENT_COLOR: (gen.cards && gen.cards.garment_color) || '' };\nlet text = String(tpl.body).replace(/\\{\\{\\s*([A-Z_]+)\\s*\\}\\}/g, (m, k) => (k in vars ? vars[k] : m));\n// EXTRACT.md section 3.8: the template wraps {{EXPECTED_TEXT}} in triple quotes itself; with no text the WHOLE line is replaced\nif (!lines.length) text = text.replace(/EXPECTED ON-DESIGN TEXT: \"\"\"[\\s\\S]*?\"\"\"/, 'EXPECTED ON-DESIGN TEXT: (none - the image must contain NO text at all)');\nif (!/STYLE_CARD_JSON|PALETTE_JSON/.test(tpl.body)) text += '\\n\\nSTYLE CARD (the locked look for this client, JSON below). Add two keys to your JSON: \"palette_ok\" (' + ((styleCard.rules || {}).palette_mode === 'flexible' ? 'true unless a LARGE, obvious area uses a colour clearly outside the palette - small natural accents are allowed' : 'true only when every colour in the artwork belongs to the palette or is a shade of one; small natural details count') + ') and \"style_violations\" (array of short strings, [] when none: only a forbidden element from \"forbid\", or a palette problem). These style keys NEVER change \"pass\" or the 9 checks. Letter case, font and wording of the text are defined ONLY by the EXPECTED ON-DESIGN TEXT above - never report them as a violation.\\n' + vars.STYLE_CARD_JSON;\nif (!/EXPECTED_TEXT|TEXT_LINES/.test(tpl.body)) text += '\\n\\nEXACT TEXT LINES (each must appear verbatim, exactly once):\\n' + vars.TEXT_LINES;\nconst body = { messages: [{ role: 'user', content: [{ type: 'text', text }, { type: 'image_url', image_url: { url: imageUrl } }] }], response_format: { type: 'json_object' } };\nreturn { json: { body, text_lines: lines, expected_text: lines.join('\\n'), image_url: imageUrl, template_version: tpl.version } };"
    },
    onError: 'continueErrorOutput',
    position: [4560, 208]
  },
  output: [{ body: { messages: [{ role: 'user', content: [{ type: 'text', text: 'You are a strict print-on-demand quality inspector ...' }, { type: 'image_url', image_url: { url: sampleSignedGenUrl } }] }], response_format: { type: 'json_object' } }, text_lines: ['FAMILY FIRST'], expected_text: 'FAMILY FIRST', image_url: sampleSignedGenUrl, template_version: 1 }]
});

const visionQc = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Vision QC',
    parameters: {
      method: 'POST',
      url: expr("https://api.kie.ai/{{ $('Prompt Engine').first().json.vision_model || 'gemini-3.1-pro' }}/v1/chat/completions"),
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
    position: [4800, 208]
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
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") },
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") },
          { name: 'Content-Type', value: 'application/json' }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ generation_id: $('Config').first().json.generationId, qc_raw: ($json.choices?.[0]?.message?.content ?? JSON.stringify($json)), exact_text_lines: $('Build QC Request').first().json.text_lines, attempt: $('Build Create Task').first().json.attempt }) }}"),
      options: { timeout: 60000 }
    },
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 3000,
    onError: 'continueErrorOutput',
    position: [5040, 208]
  },
  output: [sampleJudge]
});

const decideRegen = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Decide Regen',
    parameters: {
      mode: 'runOnceForEachItem',
      jsCode: "const judge = $json || {};\nconst rep = judge.qc_report || judge;\nlet attempt = Number($('Get Generation').first().json.attempt) || 1;\ntry { $('Build Corrective Prompt').first(); attempt = 2; } catch (e) { /* first pass */ }\nconst needs = rep.needs_regen === true || judge.needs_regen === true;\nconst regen = needs && attempt === 1;\nreturn { json: { regen, attempt, needs_regen: needs, score: rep.score ?? null, corrective_instruction: String(rep.corrective_instruction || judge.corrective_instruction || ''), parse_error: String(rep.parse_error || '') } };"
    },
    position: [5280, 208]
  },
  output: [sampleDecision]
});

const regenIf = ifElse({
  version: 2.2,
  config: {
    name: 'Regen?',
    parameters: {
      conditions: {
        options: looseOptions,
        conditions: [
          { id: 'r', leftValue: expr('{{ $json.regen }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } }
        ],
        combinator: 'and'
      },
      options: {}
    },
    position: [5520, 208]
  },
  output: [sampleDecision]
});

const markAttempt2 = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Mark Attempt 2',
    parameters: {
      method: 'PATCH',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/generations?id=eq.{{ $('Config').first().json.generationId }}"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") },
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") },
          { name: 'Content-Type', value: 'application/json' },
          { name: 'Prefer', value: 'return=representation' }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ attempt: 2, status: 'working', needs_regen: true, started_at: $now.toISO() }) }}"),
      options: { timeout: 15000 }
    },
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [5760, 400]
  },
  output: [{ ...sampleClaimed, status: 'working', attempt: 2, needs_regen: true, image_path: sampleImagePath }]
});

const buildCorrectivePrompt = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build Corrective Prompt',
    parameters: {
      mode: 'runOnceForEachItem',
      jsCode: "const orig = $('Build Create Task').first().json;\nconst judge = $('QC Judge').first().json;\nconst rep = judge.qc_report || judge;\nconst qc = $('Build QC Request').first().json;\nconst rows = $('Get QC Templates').all().map((i) => i.json);\nconst tpl = rows.find((r) => r.slug === 'corrective_suffix');\nif (!tpl || !tpl.body) throw new Error('no active corrective_suffix template in prompt_templates');\nconst issues = (Array.isArray(rep.checks) ? rep.checks.filter((c) => c && c.pass === false).map((c) => c.note || c.name) : []).concat(Array.isArray(rep.style_violations) ? rep.style_violations : []).filter(Boolean);\nconst expected = (qc.text_lines || []).join('\\n');\nconst spaced = expected.split('').join(' ');\nconst vars = { CORRECTIVE_INSTRUCTION: String(rep.corrective_instruction || judge.corrective_instruction || ''), ISSUES: issues.join('; ') || 'render the text perfectly, keep the background one flat solid grey, remove all shadows', EXPECTED_TEXT: expected, EXPECTED_TEXT_SPACED: spaced, EXPECTED_TEXT_SPELLED: spaced, TEXT_LINES: expected || 'NONE' };\n// trim(): the seeded suffix starts with a blank line; exactly one blank line must separate the master prompt from CRITICAL CORRECTIONS\nlet suffix = String(tpl.body).replace(/\\{\\{\\s*([A-Z_]+)\\s*\\}\\}/g, (m, k) => (k in vars ? vars[k] : m)).trim();\n// EXTRACT.md section 3.9 no-text variant: replace the tail from '. The ONLY text in the image must read exactly:'\nif (!expected) suffix = suffix.replace(/\\. The ONLY text in the image must read exactly:[\\s\\S]*$/, '. The image must contain NO text at all - no words, letters, watermarks or signatures.');\nconst body = JSON.parse(JSON.stringify(orig.body));\nbody.input.prompt = (String(body.input.prompt || '').trim() + '\\n\\n' + suffix).slice(0, 20000);\nreturn { json: { body, attempt: 2, corrective_suffix: suffix, input_roles: orig.input_roles, text_lines: qc.text_lines || [] } };"
    },
    onError: 'continueErrorOutput',
    position: [6000, 400]
  },
  output: [{ body: sampleCreateBody, attempt: 2, corrective_suffix: 'CRITICAL CORRECTIONS - a previous attempt failed quality inspection. Fix ALL of the following while keeping everything else identical: ...', input_roles: ['style_reference', 'style_reference', 'client_look'], text_lines: ['FAMILY FIRST'] }]
});

const generationDone = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Generation → done',
    parameters: {
      method: 'PATCH',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/generations?id=eq.{{ $('Config').first().json.generationId }}"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") },
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") },
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
    position: [5760, 112]
  },
  output: [{ ...sampleClaimed, status: 'done', vendor_job_id: sampleTaskId, image_path: sampleImagePath }]
});

const setCurrentGeneration = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Set Current Generation',
    parameters: {
      method: 'PATCH',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/cards?id=eq.{{ $('Config').first().json.cardId }}"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") },
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") },
          { name: 'Content-Type', value: 'application/json' },
          { name: 'Prefer', value: 'return=representation' }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ current_generation_id: $('Config').first().json.generationId }) }}"),
      options: { timeout: 15000 }
    },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 3000,
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [6000, 112]
  },
  output: [{ ...sampleCardEmbedded, stage: 'generating', current_generation_id: sampleGenerationId }]
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
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") },
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") },
          { name: 'Content-Type', value: 'application/json' }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_card_id: $('Config').first().json.cardId, p_stage: 'needs_review', p_note: 'generation ' + $('Config').first().json.generationId + ' ready (QC score ' + String($('Decide Regen').first().json.score ?? 'n/a') + ', attempt ' + String($('Decide Regen').first().json.attempt) + ')' }) }}"),
      options: { timeout: 15000 }
    },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 3000,
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [6240, 112]
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
      jsCode: "const j = $json || {};\nconst cfg = $('Config').first().json;\nconst text = (v) => (v === undefined || v === null || v === '' ? '' : (typeof v === 'object' ? String(v.message || v.description || JSON.stringify(v)) : String(v)));\nconst vendor = (typeof j.code === 'number' && j.code !== 200) ? ('Kie ' + j.code + ': ' + text(j.msg)) : '';\nlet message = (text(j.error) || vendor || text(j.failMsg) || text(j.message) || text(j.detail) || text(j.hint) || 'generation failed').slice(0, 500);\nconst status = (j.error && typeof j.error === 'object' && (j.error.status || j.error.httpCode)) || '';\nconst inner = message.match(/message\\\\?\":\\\\?\"([^\"\\\\]+)/);\nif (inner) message = ($('OpenRouter Image').isExecuted ? 'OpenRouter: ' : '') + inner[1] + (status ? ' (HTTP ' + status + ')' : '');\nif ((String(status) === '401' || String(status) === '403') && $('OpenRouter Image').isExecuted) message = 'OpenRouter API key missing or invalid - add it in n8n WF-0 Studio Config (OpenRouter Config node)';\nreturn { json: { message, generationId: cfg.generationId, cardId: cfg.cardId } };"
    },
    position: [3360, 800]
  },
  output: [{ message: 'Poll failed for task ' + sampleTaskId + ': generation failed', generationId: sampleGenerationId, cardId: sampleCardId }]
});

const generationFailed = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Generation → failed',
    parameters: {
      method: 'PATCH',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/generations?id=eq.{{ $('Config').first().json.generationId }}"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") },
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") },
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
    position: [3600, 800]
  },
  output: [{ ...sampleClaimed, status: 'failed', last_error: 'Poll failed for task ' + sampleTaskId + ': generation failed' }]
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
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") },
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") },
          { name: 'Content-Type', value: 'application/json' }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_card_id: $('Config').first().json.cardId, p_stage: 'failed', p_note: $('Fail Message').first().json.message, p_force: true }) }}"),
      options: { timeout: 15000 }
    },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 3000,
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [3840, 800]
  },
  output: [{ ...sampleCardEmbedded, stage: 'failed', last_error: 'Poll failed for task ' + sampleTaskId + ': generation failed' }]
});

// ---- AI platform: Switch (Kie / OpenRouter) + Auto fallback when Kie reports it is down ----
const imagePlatform = switchCase({
  version: 3.2,
  config: {
    name: 'Image Platform?',
    parameters: {
      rules: {
        values: [
          { outputKey: 'Kie', renameOutput: true, conditions: { options: looseOptions, conditions: [{ leftValue: expr("{{ $('Prompt Engine').first().json.platform || 'kie' }}"), operator: { type: 'string', operation: 'notEquals' }, rightValue: 'openrouter' }], combinator: 'and' } },
          { outputKey: 'OpenRouter', renameOutput: true, conditions: { options: looseOptions, conditions: [{ leftValue: expr("{{ $('Prompt Engine').first().json.platform || 'kie' }}"), operator: { type: 'string', operation: 'equals' }, rightValue: 'openrouter' }], combinator: 'and' } }
        ]
      },
      options: {}
    },
    position: [2040, 400]
  },
  output: [{}]
});

const kieImageDown = ifElse({
  version: 2.2,
  config: {
    name: 'Kie Image Down?',
    parameters: {
      conditions: {
        options: looseOptions,
        conditions: [
          { id: 'a1', leftValue: expr("{{ $('Prompt Engine').first().json.platform || 'kie' }}"), operator: { type: 'string', operation: 'equals' }, rightValue: 'auto' }
        ],
        combinator: 'and'
      },
      options: {}
    },
    position: [2520, 608]
  },
  output: [{}]
});

const buildOrImage = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build OpenRouter Image',
    parameters: {
      jsCode: "const pe = $('Prompt Engine').first().json;\nconst src = ($json.body && $json.body.input) ? $json.body : ($('Build Corrective Prompt').isExecuted ? $('Build Corrective Prompt').last().json.body : $('Build Create Task').first().json.body);\nif (!src || !src.input || !src.input.prompt) throw new Error('no image request to send to OpenRouter');\nconst models = pe.openrouter_models || {};\nconst refs = (src.input.input_urls || []).map((url) => ({ type: 'image_url', image_url: { url } }));\nconst body = { model: models.image || 'openai/gpt-image-2.5-sunburst', prompt: String(src.input.prompt).slice(0, 20000), n: 1, aspect_ratio: src.input.aspect_ratio || pe.aspect_ratio || '1:1', resolution: src.input.resolution || pe.resolution || '2K', output_format: 'png', background: 'opaque' };\nif (refs.length) body.input_references = refs;\nreturn { json: { body } };"
    },
    onError: 'continueErrorOutput',
    position: [2280, 16]
  },
  output: [{}]
});

const markOpenRouter = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Mark OpenRouter',
    parameters: {
      method: 'PATCH',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/generations?id=eq.{{ $('Config').first().json.generationId }}"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") },
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") },
          { name: 'Content-Type', value: 'application/json' },
          { name: 'Prefer', value: 'return=minimal' }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ vendor: 'openrouter', model: $('Build OpenRouter Image').first().json.body.model, vendor_job_id: null, status: 'working' }) }}"),
      options: { timeout: 15000 }
    },
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [2520, 16]
  },
  output: [{}]
});

const orImage = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'OpenRouter Image',
    parameters: {
      method: 'POST',
      url: 'https://openrouter.ai/api/v1/images',
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
      jsonBody: expr("{{ JSON.stringify($('Build OpenRouter Image').first().json.body) }}"),
      options: { timeout: 300000 }
    },
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 5000,
    onError: 'continueErrorOutput',
    position: [2760, 16]
  },
  output: [{ created: 1790580000, data: [{ b64_json: 'iVBORw0KGgo=', media_type: 'image/png' }], usage: { cost: 0.04 } }]
});

const decodeOrImage = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Decode OpenRouter Image',
    parameters: {
      jsCode: "const d = (Array.isArray($json.data) && $json.data[0]) || {};\nconst b64 = String(d.b64_json || '').replace(/^data:[^,]*,/, '');\nif (!b64) { const e = (typeof $json.error === 'object' && $json.error) || {}; throw new Error('OpenRouter returned no image - ' + String(e.message || (typeof $json.error === 'string' ? $json.error : '') || JSON.stringify($json).slice(0, 200)).replace(/:/g, '=')); }\nconst mime = d.media_type || 'image/png';\nconst ext = (mime.split('/')[1] || 'png').replace('jpeg', 'jpg');\nreturn { json: { vendor: 'openrouter', media_type: mime, cost_usd: ($json.usage && $json.usage.cost) || null }, binary: { data: { data: b64, mimeType: mime, fileName: 'openrouter.' + ext, fileExtension: ext } } };"
    },
    onError: 'continueErrorOutput',
    position: [3000, 16]
  },
  output: [{ vendor: 'openrouter', media_type: 'image/png', cost_usd: 0.04 }]
});

const qcPlatform = switchCase({
  version: 3.2,
  config: {
    name: 'QC Platform?',
    parameters: {
      rules: {
        values: [
          { outputKey: 'Kie', renameOutput: true, conditions: { options: looseOptions, conditions: [{ leftValue: expr("{{ $('Prompt Engine').first().json.platform || 'kie' }}"), operator: { type: 'string', operation: 'notEquals' }, rightValue: 'openrouter' }], combinator: 'and' } },
          { outputKey: 'OpenRouter', renameOutput: true, conditions: { options: looseOptions, conditions: [{ leftValue: expr("{{ $('Prompt Engine').first().json.platform || 'kie' }}"), operator: { type: 'string', operation: 'equals' }, rightValue: 'openrouter' }], combinator: 'and' } }
        ]
      },
      options: {}
    },
    position: [4680, 400]
  },
  output: [{}]
});

const kieQcDown = ifElse({
  version: 2.2,
  config: {
    name: 'Kie QC Down?',
    parameters: {
      conditions: {
        options: looseOptions,
        conditions: [
          { id: 'a1', leftValue: expr("{{ $('Prompt Engine').first().json.platform || 'kie' }}"), operator: { type: 'string', operation: 'equals' }, rightValue: 'auto' },
          { id: 'a2', leftValue: expr("{{ $json.choices ? 'up' : 'down' }}"), operator: { type: 'string', operation: 'equals' }, rightValue: 'down' }
        ],
        combinator: 'and'
      },
      options: {}
    },
    position: [4920, 400]
  },
  output: [{}]
});

const orVisionQc = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'OpenRouter QC',
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
      jsonBody: expr("{{ JSON.stringify(Object.assign({}, $('Build QC Request').first().json.body, { model: ($('Prompt Engine').first().json.openrouter_models || {}).vision || 'google/gemini-3.1-pro-preview' })) }}"),
      options: { timeout: 180000 }
    },
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 5000,
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [4920, 16]
  },
  output: [{ id: 'gen-or-sample', model: 'google/gemini-3.1-pro-preview', choices: [{ index: 0, message: { role: 'assistant', content: '{}' }, finish_reason: 'stop' }] }]
});

export default workflow('dm-studio-wf2-generate', 'DM Studio · WF-2 Generate')
  .add(generateNote)
  .add(generateWebhook)
  .to(loadDispatchConfig)
  .to(dispatchSecretOk.onTrue(claimGenerations).onFalse(dispatchRejected))
  .add(claimGenerations)
  .to(hasGenerationId)
  .to(eachGeneration
    .onDone(dispatchComplete)
    .onEachBatch(fireWorker.to(nextBatch(eachGeneration))))
  .add(workerWebhook)
  .to(loadConfig)
  .to(secretOk.onTrue(config).onFalse(rejected))
  .add(config)
  .to(getGeneration.onError(failMessage))
  .to(cardGenerating)
  .to(generationWorking)
  .to(promptEngine.onError(failMessage))
  .to(listInputPaths.onError(failMessage))
  .to(signInput.onError(failMessage))
  .to(buildCreateTask.onError(failMessage))
  .to(imagePlatform.onCase(0, createTask.onError(kieImageDown)).onCase(1, buildOrImage))
  .add(createTask)
  .to(taskCreated.onTrue(saveVendorJob).onFalse(kieImageDown))
  .add(saveVendorJob)
  .to(waitForCallback)
  .to(pollUntilDone.onError(kieImageDown))
  .to(downloadResult.onError(failMessage))
  .to(uploadToGens.onError(failMessage))
  .to(saveImagePath.onError(failMessage))
  .to(signResult.onError(failMessage))
  .to(getQcTemplates.onError(failMessage))
  .to(buildQcRequest.onError(failMessage))
  .to(qcPlatform.onCase(0, visionQc).onCase(1, orVisionQc))
  .add(visionQc)
  .to(kieQcDown.onTrue(orVisionQc).onFalse(qcJudge))
  .add(orVisionQc)
  .to(qcJudge.onError(failMessage))
  .to(decideRegen)
  .to(regenIf.onTrue(markAttempt2).onFalse(generationDone))
  .add(markAttempt2)
  .to(buildCorrectivePrompt.onError(failMessage))
  .to(imagePlatform)
  .add(kieImageDown.onTrue(buildOrImage).onFalse(failMessage))
  .add(buildOrImage.onError(failMessage))
  .to(markOpenRouter)
  .to(orImage.onError(failMessage))
  .to(decodeOrImage.onError(failMessage))
  .to(uploadToGens)
  .add(generationDone)
  .to(setCurrentGeneration)
  .to(cardNeedsReview)
  .add(failMessage)
  .to(generationFailed)
  .to(cardFailed);
