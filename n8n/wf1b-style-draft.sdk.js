import { workflow, node, trigger, sticky, placeholder, newCredential, ifElse, switchCase, merge, splitInBatches, nextBatch, languageModel, memory, tool, outputParser, embedding, embeddings, vectorStore, retriever, documentLoader, textSplitter, reranker, fromAi, expr } from '@n8n/workflow-sdk';

const supabaseUrl = 'https://voatrqhfsdfjomyajovi.supabase.co';
const supabasePublishableKey = 'sb_publishable_shDVoGzgpaS2L9OTmzyRGA_JOx52p0I';
const n8nBaseUrl = 'https://n8n.srv1202488.hstgr.cloud';
const kieBaseUrl = 'https://api.kie.ai';

const workerSecretCredential = newCredential('DM Studio Worker Secret');
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
const sampleVisionBody = { messages: [{ role: 'user', content: [{ type: 'text', text: 'You are a style profiler ...' }, { type: 'image_url', image_url: { url: sampleSignedUrl } }] }], response_format: { type: 'json_object' } };

const styleDraftNote = sticky(
  '## DM Studio · WF-1b Style Draft (style_draft_requests insert → /webhook/studio-style-draft)\n' +
  'Payload {request_id, client_id}. Respond 200 → style_draft_update(working, execution id) → Get Client + Get Settings (max_style_refs, default 12) → Get Template (prompt_templates slug **style_profiler**, never inlined) → List Library (client_references newest first, limit max_style_refs) → sign each path (POST /storage/v1/object/sign/refs/<path>, 1 h) → Profile Style (Kie gemini-3.1-pro chat/completions, one text part + one image_url part per reference, JSON mode) → Parse Style Card (must return every key of the Style Card schema) → new_style_card_version(client, json) → style_draft_update(done, style_card_id).\n\n' +
  'Empty library → style_draft_update(failed, "reference library is empty"). Any other failure → Fail Message → style_draft_update(failed, message). Template tokens replaced at runtime: {{CLIENT_NAME}}, {{CLIENT_NOTES}}, {{GARMENT_COLORS}}, {{IMAGE_COUNT}}, {{REFERENCE_NOTES}}.\n\n' +
  'Auth on every Supabase call: publishable key as apikey + x-studio-secret from the credential **DM Studio Worker Secret** (also validates the webhook). Vision calls use **Gemini 3.1 Pro [DM-Kie]**.',
  { color: 4, width: 400, height: 640, position: [-460, 80] }
);

const styleDraftWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Style Draft Webhook',
    parameters: {
      httpMethod: 'POST',
      path: 'studio-style-draft',
      authentication: 'headerAuth',
      responseMode: 'onReceived',
      options: {}
    },
    credentials: { httpHeaderAuth: workerSecretCredential },
    position: [0, 304]
  },
  output: [{ headers: { 'content-type': 'application/json' }, params: {}, query: {}, body: { request_id: sampleRequestId, client_id: sampleClientId }, webhookUrl: n8nBaseUrl + '/webhook/studio-style-draft', executionMode: 'production' }]
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
          { id: 'c1', name: 'sbUrl', type: 'string', value: supabaseUrl },
          { id: 'c2', name: 'anonKey', type: 'string', value: supabasePublishableKey },
          { id: 'c3', name: 'requestId', type: 'string', value: expr('{{ $json.body?.request_id ?? "" }}') },
          { id: 'c4', name: 'clientId', type: 'string', value: expr('{{ $json.body?.client_id ?? "" }}') },
          { id: 'c5', name: 'executionId', type: 'string', value: expr('{{ String($execution.id) }}') }
        ]
      },
      includeOtherFields: false,
      options: {}
    },
    position: [240, 304]
  },
  output: [{ sbUrl: supabaseUrl, anonKey: 'sb_publishable_redacted', requestId: sampleRequestId, clientId: sampleClientId, executionId: '48212' }]
});

const draftWorking = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Draft → working',
    parameters: {
      method: 'POST',
      url: expr("{{ $('Config').first().json.sbUrl }}/rest/v1/rpc/style_draft_update"),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: expr("{{ $('Config').first().json.anonKey }}") },
          { name: 'Content-Type', value: 'application/json' }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_request_id: $('Config').first().json.requestId, p_status: 'working', p_execution_id: $('Config').first().json.executionId }) }}"),
      options: { timeout: 15000 }
    },
    credentials: { httpHeaderAuth: workerSecretCredential },
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [480, 304]
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
      url: expr("{{ $('Config').first().json.sbUrl }}/rest/v1/clients?id=eq.{{ $('Config').first().json.clientId }}&select=id,name,garment_colors,notes&limit=1"),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: expr("{{ $('Config').first().json.anonKey }}") }
        ]
      },
      options: { timeout: 15000 }
    },
    credentials: { httpHeaderAuth: workerSecretCredential },
    executeOnce: true,
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [720, 304]
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
      url: expr("{{ $('Config').first().json.sbUrl }}/rest/v1/settings?select=max_style_refs,vision_model&limit=1"),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: expr("{{ $('Config').first().json.anonKey }}") }
        ]
      },
      options: { timeout: 15000 }
    },
    credentials: { httpHeaderAuth: workerSecretCredential },
    executeOnce: true,
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [960, 304]
  },
  output: [{ max_style_refs: 12, vision_model: 'gemini-3.1-pro' }]
});

const getTemplate = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Get Template',
    parameters: {
      method: 'GET',
      url: expr("{{ $('Config').first().json.sbUrl }}/rest/v1/prompt_templates?slug=eq.style_profiler&active=is.true&select=slug,version,body&order=version.desc&limit=1"),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: expr("{{ $('Config').first().json.anonKey }}") },
          { name: 'Accept', value: 'application/vnd.pgrst.object+json' }
        ]
      },
      options: { timeout: 15000 }
    },
    credentials: { httpHeaderAuth: workerSecretCredential },
    executeOnce: true,
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 2000,
    onError: 'continueErrorOutput',
    position: [1200, 304]
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
      url: expr("{{ $('Config').first().json.sbUrl }}/rest/v1/client_references?client_id=eq.{{ $('Config').first().json.clientId }}&select=id,path,note&order=created_at.desc&limit={{ Math.min(16, Number($('Get Settings').first().json.max_style_refs) || 12) }}"),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: expr("{{ $('Config').first().json.anonKey }}") }
        ]
      },
      options: { timeout: 15000 }
    },
    credentials: { httpHeaderAuth: workerSecretCredential },
    executeOnce: true,
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 2000,
    onError: 'continueErrorOutput',
    alwaysOutputData: true,
    position: [1440, 304]
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
    position: [1680, 304]
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
      url: expr("{{ $('Config').first().json.sbUrl }}/storage/v1/object/sign/refs/{{ String($json.path ?? '').replace(/^refs\\//, '') }}"),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: expr("{{ $('Config').first().json.anonKey }}") },
          { name: 'Content-Type', value: 'application/json' }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '{"expiresIn":3600}',
      options: { timeout: 15000 }
    },
    credentials: { httpHeaderAuth: workerSecretCredential },
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 2000,
    onError: 'continueErrorOutput',
    position: [1920, 208]
  },
  output: [{ signedURL: sampleSignedPath }]
});

const buildStyleRequest = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build Style Request',
    parameters: {
      jsCode: "const cfg = $('Config').first().json;\nconst tpl = $('Get Template').first().json;\nif (!tpl || !tpl.body) throw new Error('prompt_templates: no active style_profiler template');\nconst client = $('Get Client').first().json || {};\nconst refs = $('List Library').all().map((i) => i.json);\nconst urls = $input.all().map((i) => cfg.sbUrl + '/storage/v1' + String(i.json.signedURL || '')).filter((u) => /token=/.test(u));\nif (!urls.length) throw new Error('no signed library URLs');\nconst notes = refs.slice(0, urls.length).map((r, i) => 'Image ' + (i + 1) + ': ' + (r.note || 'no note')).join('\\n');\nconst vars = { CLIENT_NAME: client.name || '', CLIENT_NOTES: client.notes || '', GARMENT_COLORS: JSON.stringify(client.garment_colors || []), IMAGE_COUNT: String(urls.length), REFERENCE_NOTES: notes };\nconst text = String(tpl.body).replace(/\\{\\{\\s*([A-Z_]+)\\s*\\}\\}/g, (m, k) => (k in vars ? vars[k] : m));\nconst content = [{ type: 'text', text }].concat(urls.map((url) => ({ type: 'image_url', image_url: { url } })));\nreturn { json: { body: { messages: [{ role: 'user', content }], response_format: { type: 'json_object' } }, template_version: tpl.version, reference_count: urls.length } };"
    },
    onError: 'continueErrorOutput',
    position: [2160, 208]
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
    waitBetweenTries: 5000,
    onError: 'continueErrorOutput',
    position: [2400, 208]
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
      jsCode: "const REQUIRED = ['medium', 'linework', 'shading', 'texture', 'palette', 'composition', 'typography', 'background', 'mood', 'subjects', 'forbid', 'signature_moves', 'garment_colors'];\nconst content = ($json.choices && $json.choices[0] && $json.choices[0].message && $json.choices[0].message.content) || '';\nconst cleaned = String(content).replace(/```json|```/g, '').trim();\nconst m = cleaned.match(/\\{[\\s\\S]*\\}/);\nlet card;\ntry { card = JSON.parse(m ? m[0] : cleaned); } catch (e) { throw new Error('style profiler returned no JSON: ' + cleaned.slice(0, 200)); }\nif (!card || typeof card !== 'object' || Array.isArray(card)) throw new Error('style profiler returned no object');\nconst missing = REQUIRED.filter((k) => !(k in card));\nif (missing.length) throw new Error('style card missing keys: ' + missing.join(', '));\nif (!Array.isArray(card.palette) || !card.palette.length) throw new Error('style card palette is empty');\nreturn { json: { style_card: card, template_version: $('Build Style Request').first().json.template_version, reference_count: $('Build Style Request').first().json.reference_count } };"
    },
    onError: 'continueErrorOutput',
    position: [2640, 208]
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
      url: expr("{{ $('Config').first().json.sbUrl }}/rest/v1/rpc/new_style_card_version"),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: expr("{{ $('Config').first().json.anonKey }}") },
          { name: 'Content-Type', value: 'application/json' }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_client_id: $('Config').first().json.clientId, p_json: $json.style_card }) }}"),
      options: { timeout: 15000 }
    },
    credentials: { httpHeaderAuth: workerSecretCredential },
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 2000,
    onError: 'continueErrorOutput',
    position: [2880, 208]
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
      jsCode: "const j = $json;\nconst first = Array.isArray(j) ? j[0] : j;\nlet id = '';\nif (typeof first === 'string') id = first;\nelse if (first && typeof first === 'object') id = first.id || first.style_card_id || first.data || first.new_style_card_version || '';\nif (id && typeof id === 'object') id = id.id || '';\nif (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id))) throw new Error('new_style_card_version returned no id: ' + JSON.stringify(j).slice(0, 200));\nreturn { json: { style_card_id: String(id), version: (first && typeof first === 'object' && first.version) || null } };"
    },
    onError: 'continueErrorOutput',
    position: [3120, 208]
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
      url: expr("{{ $('Config').first().json.sbUrl }}/rest/v1/rpc/style_draft_update"),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: expr("{{ $('Config').first().json.anonKey }}") },
          { name: 'Content-Type', value: 'application/json' }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_request_id: $('Config').first().json.requestId, p_status: 'done', p_style_card_id: $json.style_card_id, p_execution_id: $('Config').first().json.executionId }) }}"),
      options: { timeout: 15000 }
    },
    credentials: { httpHeaderAuth: workerSecretCredential },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 3000,
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [3360, 208]
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
    position: [1920, 496]
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
    position: [2640, 496]
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
      url: expr("{{ $('Config').first().json.sbUrl }}/rest/v1/rpc/style_draft_update"),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: expr("{{ $('Config').first().json.anonKey }}") },
          { name: 'Content-Type', value: 'application/json' }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_request_id: $('Config').first().json.requestId, p_status: 'failed', p_error: $json.message, p_execution_id: $('Config').first().json.executionId }) }}"),
      options: { timeout: 15000 }
    },
    credentials: { httpHeaderAuth: workerSecretCredential },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 3000,
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [2880, 496]
  },
  output: [{ ...sampleRequest, status: 'failed', last_error: 'style card missing keys: signature_moves' }]
});

export default workflow('dm-studio-wf1b-style-draft', 'DM Studio · WF-1b Style Draft')
  .add(styleDraftNote)
  .add(styleDraftWebhook)
  .to(config)
  .to(draftWorking)
  .to(getClient)
  .to(getSettings)
  .to(getTemplate.onError(failMessage))
  .to(listLibrary.onError(failMessage))
  .to(hasLibrary.onTrue(signLibraryRef.onError(failMessage)).onFalse(emptyLibrary))
  .add(signLibraryRef)
  .to(buildStyleRequest.onError(failMessage))
  .to(profileStyle.onError(failMessage))
  .to(parseStyleCard.onError(failMessage))
  .to(newStyleCardVersion.onError(failMessage))
  .to(extractStyleCardId.onError(failMessage))
  .to(draftDone)
  .add(emptyLibrary)
  .to(draftFailed)
  .add(failMessage)
  .to(draftFailed);
