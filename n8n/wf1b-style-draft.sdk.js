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
const sampleLibraryPath = sampleClientId + '/library/0d1e2f3a-4b5c-4d6e-8f90-a1b2c3d4e5f6.png';
const sampleSignedPath = '/object/sign/refs/' + sampleLibraryPath + '?token=redacted';
const sampleSignedUrl = supabaseUrl + '/storage/v1' + sampleSignedPath;

const sampleClient = { id: sampleClientId, name: 'Test Client', garment_colors: ['black', 'navy'], notes: 'Loves vintage badges' };
const sampleRequest = { id: sampleRequestId, client_id: sampleClientId, status: 'working', style_card_id: null, last_error: null, n8n_execution_id: '48212' };
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
const sampleStyleContent = '{"medium":"screen-print style vector illustration","linework":{"weight":"bold","style":"clean"},"shading":"flat fills","texture":"light grain","palette":[{"name":"cream","hex":"#F2E8D5","weight":"dominant"}],"composition":"centered badge","typography":{"vibe":"vintage sans","placement":"arched top","case":"upper"},"background":"flat mid-grey #808080, isolated artwork","mood":["rugged"],"subjects":["wildlife"],"forbid":["gradients"],"signature_moves":["thick keyline"],"garment_colors":["black"],"evidence":["Images 1-4 share the cream/green pairing"]}';
const sampleStyleResponse = { id: 'chatcmpl-style', object: 'chat.completion', model: 'gemini-3.1-pro', choices: [{ index: 0, message: { role: 'assistant', content: sampleStyleContent }, finish_reason: 'stop' }], usage: { prompt_tokens: 4200, completion_tokens: 480 } };
const sampleConfig = { sbUrl: supabaseUrl, anonKey: 'sb_publishable_redacted', n8nBaseUrl: n8nBaseUrl, studioSecret: 'redacted', ideogramKey: 'redacted', imgbbKey: 'redacted', mlKey: 'redacted', upscaleModel: 'ultra_resolution', upscaleScale: 4 };
const sampleVisionBody = { messages: [{ role: 'user', content: [{ type: 'text', text: 'You are a style profiler ...' }, { type: 'image_url', image_url: { url: sampleSignedUrl } }] }], response_format: { type: 'json_object' } };

const styleDraftNote = sticky(
  '## DM Studio · WF-1b Style Draft (style_draft_requests insert → /webhook/studio-style-draft)\n' +
  'Payload {request_id, client_id}. Respond 200 → style_draft_update(working, execution id) → Get Client + Get Settings (max_style_refs, default 12) → Get Template (prompt_templates slug **style_profiler**, never inlined) → List Library (client_references newest first, limit max_style_refs) → sign each path (POST /storage/v1/object/sign/refs/<path>, 1 h) → Profile Style (Kie gemini-3.1-pro chat/completions, one text part + one image_url part per reference, JSON mode) → Parse Style Card (must return every key of the Style Card schema) → new_style_card_version(client, json) → style_draft_update(done, style_card_id).\n\n' +
  'Empty library → style_draft_update(failed, "reference library is empty"). Any other failure → Fail Message → style_draft_update(failed, message). Template tokens replaced at runtime: {{CLIENT_NAME}}, {{CLIENT_NOTES}}, {{GARMENT_COLORS}}, {{IMAGE_COUNT}}, {{REFERENCE_NOTES}}.\n\n' +
  '**Config convention (no credentials except Kie):** the webhook has NO n8n auth. First node **Load Config** runs the sub-workflow WF-0 Studio Config (paste its id into `const configWorkflowId` before creating this workflow); every later node reads `$(\'Load Config\').first().json.<field>`. **Secret OK?** compares the incoming `x-studio-secret` header with config.studioSecret - the pg_net trigger always sends it; mismatch ends in the no-op **Rejected** node. Every Supabase REST/RPC/Storage call sends headers apikey = anonKey and x-studio-secret = studioSecret from config, no credential attached. Vision calls keep the existing credential **Gemini 3.1 Pro [DM-Kie]** (0l2nHQUQNnsCAfTR). Nothing to paste in this workflow: all keys live in WF-0.',
  { color: 4, width: 400, height: 760, position: [-460, 80] }
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
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/clients?id=eq.{{ $('Config').first().json.clientId }}&select=id,name,garment_colors,notes&limit=1"),
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
  output: [{ max_style_refs: 12, vision_model: 'gemini-3.1-pro', ai_platform: 'kie', openrouter_models: { vision: 'google/gemini-3.1-pro-preview', image: 'openai/gpt-image-2.5-sunburst', edit: 'google/gemini-2.5-flash-image', text: 'anthropic/claude-sonnet-4.6' } }]
});

const getTemplate = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Get Template',
    parameters: {
      method: 'GET',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/prompt_templates?slug=eq.style_profiler&active=is.true&select=slug,version,body&order=version.desc&limit=1"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") },
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") },
          { name: 'Accept', value: 'application/vnd.pgrst.object+json' }
        ]
      },
      options: { timeout: 15000, response: { response: { responseFormat: 'json' } } }
    },
    executeOnce: true,
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 2000,
    onError: 'continueErrorOutput',
    position: [1680, 304]
  },
  output: [{ slug: 'style_profiler', version: 1, body: 'You are a style profiler for the client "{{CLIENT_NAME}}". Study the {{IMAGE_COUNT}} attached designs ... Return ONLY the Style Card JSON.' }]
});

const listLibrary = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'List Library',
    parameters: {
      method: 'GET',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/client_references?client_id=eq.{{ $('Config').first().json.clientId }}&select=id,path,note&order=created_at.desc&limit={{ Math.min(16, Number($('Get Settings').first().json.max_style_refs) || 12) }}"),
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
  output: [{ id: '8a7b6c5d-4e3f-4a2b-9c1d-0e9f8a7b6c5d', path: sampleLibraryPath, note: 'bestseller 2025' }]
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
  output: [{ id: '8a7b6c5d-4e3f-4a2b-9c1d-0e9f8a7b6c5d', path: sampleLibraryPath, note: 'bestseller 2025' }]
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

const buildStyleRequest = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build Style Request',
    parameters: {
      jsCode: "const cfg = $('Load Config').first().json;\nconst tpl = $('Get Template').first().json;\nif (!tpl || !tpl.body) throw new Error('no active style_profiler template in prompt_templates');\nconst client = $('Get Client').first().json || {};\nconst refs = $('List Library').all().map((i) => i.json);\nconst urls = $input.all().map((i) => cfg.sbUrl + '/storage/v1' + String(i.json.signedURL || '')).filter((u) => /token=/.test(u));\nif (!urls.length) throw new Error('no signed library URLs');\nconst notes = refs.slice(0, urls.length).map((r, i) => 'Image ' + (i + 1) + ': ' + (r.note || 'no note')).join('\\n');\nconst vars = { CLIENT_NAME: client.name || '', CLIENT_NOTES: client.notes || '', GARMENT_COLORS: JSON.stringify(client.garment_colors || []), IMAGE_COUNT: String(urls.length), REFERENCE_NOTES: notes };\nconst text = String(tpl.body).replace(/\\{\\{\\s*([A-Z_]+)\\s*\\}\\}/g, (m, k) => (k in vars ? vars[k] : m));\nconst content = [{ type: 'text', text }].concat(urls.map((url) => ({ type: 'image_url', image_url: { url } })));\nreturn { json: { body: { messages: [{ role: 'user', content }], response_format: { type: 'json_object' } }, template_version: tpl.version, reference_count: urls.length } };"
    },
    onError: 'continueErrorOutput',
    position: [2640, 208]
  },
  output: [{ body: sampleVisionBody, template_version: 1, reference_count: 6 }]
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
      options: { timeout: 120000 }
    },
    credentials: { httpHeaderAuth: kieVisionCredential },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 5000,
    onError: 'continueErrorOutput',
    position: [2880, 208]
  },
  output: [sampleStyleResponse]
});

const parseStyleCard = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Parse Style Card',
    parameters: {
      mode: 'runOnceForEachItem',
      jsCode: "if (!$json.choices) { const e = (typeof $json.error === 'object' && $json.error) || {}; const via = $('OpenRouter Profile Style').isExecuted ? ($('Profile Style').isExecuted ? 'Kie and OpenRouter' : 'OpenRouter') : 'Kie'; let why = String($json.msg || e.message || (typeof $json.error === 'string' ? $json.error : '') || 'no reply'); const inner = why.match(/message\\\\?\":\\\\?\"([^\"\\\\]+)/); if (inner) why = inner[1]; const code = $json.code || e.status || e.httpCode || e.code || '?'; if (via !== 'Kie' && (String(code) === '401' || String(code) === '403')) why = 'OpenRouter API key missing or invalid - add it in n8n WF-0 Studio Config (OpenRouter Config node)'; throw new Error('Vision service unavailable (' + via + ' error ' + code + ' - ' + why.replace(/:/g, ' -').slice(0, 160) + '). Nothing was changed; try again in a few minutes.'); }\nconst REQUIRED = ['medium', 'linework', 'shading', 'texture', 'palette', 'composition', 'typography', 'background', 'mood', 'subjects', 'forbid', 'signature_moves', 'garment_colors'];\nconst content = ($json.choices && $json.choices[0] && $json.choices[0].message && $json.choices[0].message.content) || '';\nconst cleaned = String(content).replace(/```json|```/g, '').trim();\nconst m = cleaned.match(/\\{[\\s\\S]*\\}/);\nlet card;\ntry { card = JSON.parse(m ? m[0] : cleaned); } catch (e) { throw new Error('style profiler returned no JSON - reply was ' + cleaned.slice(0, 200).replace(/:/g, '=')); }\nif (!card || typeof card !== 'object' || Array.isArray(card)) throw new Error('style profiler returned no object');\nconst missing = REQUIRED.filter((k) => !(k in card));\nif (missing.length) throw new Error('style card missing keys - ' + missing.join(', '));\nif (!Array.isArray(card.palette) || !card.palette.length) throw new Error('style card palette is empty');\nreturn { json: { style_card: card, template_version: $('Build Style Request').first().json.template_version, reference_count: $('Build Style Request').first().json.reference_count } };"
    },
    onError: 'continueErrorOutput',
    position: [3120, 208]
  },
  output: [{ style_card: sampleStyleCard, template_version: 1, reference_count: 6 }]
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
      jsonBody: expr("{{ JSON.stringify({ p_client_id: $('Config').first().json.clientId, p_json: $json.style_card }) }}"),
      options: { timeout: 15000 }
    },
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 2000,
    onError: 'continueErrorOutput',
    position: [3360, 208]
  },
  output: [{ id: sampleStyleCardId, client_id: sampleClientId, version: 1, status: 'draft', json: sampleStyleCard, note: null }]
});

const extractStyleCardId = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Extract Style Card Id',
    parameters: {
      mode: 'runOnceForEachItem',
      jsCode: "const j = $json;\nconst first = Array.isArray(j) ? j[0] : j;\nlet id = '';\nif (typeof first === 'string') id = first;\nelse if (first && typeof first === 'object') id = first.id || first.style_card_id || first.data || first.new_style_card_version || '';\nif (id && typeof id === 'object') id = id.id || '';\nif (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id))) throw new Error('new_style_card_version returned no id - ' + JSON.stringify(j).slice(0, 200).replace(/:/g, '='));\nreturn { json: { style_card_id: String(id), version: (first && typeof first === 'object' && first.version) || null } };"
    },
    onError: 'continueErrorOutput',
    position: [3600, 208]
  },
  output: [{ style_card_id: sampleStyleCardId, version: 1 }]
});

const draftDone = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Draft → done',
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
      jsonBody: expr("{{ JSON.stringify({ p_request_id: $('Config').first().json.requestId, p_status: 'done', p_style_card_id: $json.style_card_id, p_execution_id: $('Config').first().json.executionId }) }}"),
      options: { timeout: 15000 }
    },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 3000,
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [3840, 208]
  },
  output: [{ ...sampleRequest, status: 'done', style_card_id: sampleStyleCardId }]
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
    position: [2400, 496]
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
      jsCode: "const j = $json || {};\nconst cfg = $('Config').first().json;\nconst text = (v) => (v === undefined || v === null || v === '' ? '' : (typeof v === 'object' ? String(v.message || v.description || JSON.stringify(v)) : String(v)));\nconst message = (text(j.error) || text(j.message) || text(j.msg) || text(j.detail) || text(j.hint) || 'style draft failed').slice(0, 500);\nreturn { json: { message, requestId: cfg.requestId, clientId: cfg.clientId } };"
    },
    position: [3120, 496]
  },
  output: [{ message: 'style card missing keys: signature_moves', requestId: sampleRequestId, clientId: sampleClientId }]
});

const draftFailed = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Draft → failed',
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
      jsonBody: expr("{{ JSON.stringify({ p_request_id: $('Config').first().json.requestId, p_status: 'failed', p_error: $json.message, p_execution_id: $('Config').first().json.executionId }) }}"),
      options: { timeout: 15000 }
    },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 3000,
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [3360, 496]
  },
  output: [{ ...sampleRequest, status: 'failed', last_error: 'style card missing keys: signature_moves' }]
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
    position: [2760, 400]
  },
  output: [{}]
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
    position: [3000, 400]
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
      options: { timeout: 180000 }
    },
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 5000,
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [3000, 16]
  },
  output: [{ id: 'gen-or-sample', model: 'google/gemini-3.1-pro-preview', choices: [{ index: 0, message: { role: 'assistant', content: '{}' }, finish_reason: 'stop' }] }]
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
  .to(getTemplate.onError(failMessage))
  .to(listLibrary.onError(failMessage))
  .to(hasLibrary.onTrue(signLibraryRef.onError(failMessage)).onFalse(emptyLibrary))
  .add(signLibraryRef)
  .to(buildStyleRequest.onError(failMessage))
  .to(stylePlatform.onCase(0, profileStyle.onError(kieStyleDown)).onCase(1, orProfileStyle))
  .add(profileStyle)
  .to(kieStyleDown.onTrue(orProfileStyle).onFalse(parseStyleCard))
  .add(orProfileStyle)
  .to(parseStyleCard.onError(failMessage))
  .to(newStyleCardVersion.onError(failMessage))
  .to(extractStyleCardId.onError(failMessage))
  .to(draftDone)
  .add(emptyLibrary)
  .to(draftFailed)
  .add(failMessage)
  .to(draftFailed);
