import { workflow, node, trigger, sticky, placeholder, newCredential, ifElse, switchCase, merge, splitInBatches, nextBatch, languageModel, memory, tool, outputParser, embedding, embeddings, vectorStore, retriever, documentLoader, textSplitter, reranker, fromAi, expr } from '@n8n/workflow-sdk';

const supabaseUrl = 'https://voatrqhfsdfjomyajovi.supabase.co';
const n8nBaseUrl = 'https://n8n.srv1202488.hstgr.cloud';
const kieBaseUrl = 'https://api.kie.ai';

const configWorkflowId = 'vbyjWhK4ZRN9uZUM';
// Same Kie credential WF-7 Distill uses for Claude on Kie (bound by id, nothing to paste here)
const kieClaudeCredential = newCredential('GPT Image 2 [DM-Kie]', 'w0sDpl2nll4HkF6h');

const looseOptions = { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 1 };

// SDK parser rule: no apostrophe in a // comment at this level. The parser scans the source for quotes before it runs it,
// an odd quote in a comment flips its string state, and it then turns every backslash-n INSIDE the jsCode strings into a
// real line break (a Code node reading replace(/x/g, then a line break) is a syntax error live). test-wf8-parse.js compares
// every jsCode and the sticky against plain Node evaluation of this file, so a regression fails the test.

const sampleClientId = '7c6d5e4f-3a2b-4c1d-9e8f-0a1b2c3d4e5f';
const sampleRequestId = '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a';
const sampleText = 'Hi! We sell vintage-style outdoor badges for hikers on Etsy (US). Subjects are Highland cows and chickens. Always put @TrailBadgeCo and EST. 2019 somewhere. Everything in CAPS, chunky slab serif. Must have a circular badge frame and an ink banner across the bottom. No gradients, no photo-realism. Shirts are black and white.';
const sampleExistingBrief = { niche: 'farm humour', audience: 'homesteaders', subjects: ['Highland cows'], brand_text: ['@TrailBadgeCo'], palette_mode: 'strict', text_case: 'upper', lock_typography: true, lock_composition: true };
const sampleRequestRow = { id: sampleRequestId, client_id: sampleClientId, text: sampleText, clients: { name: 'Trail Badge Co', style_brief: sampleExistingBrief } };
const sampleStatusRow = { id: sampleRequestId, client_id: sampleClientId, status: 'working', result: null, last_error: null, n8n_execution_id: '48310' };
const sampleSettings = { ai_platform: 'openrouter', openrouter_models: { vision: 'google/gemini-3.1-pro-preview', image: 'openai/gpt-image-2.5-sunburst', edit: 'google/gemini-2.5-flash-image', text: 'anthropic/claude-sonnet-4.6' } };
const sampleTemplate = { slug: 'brief_parser', version: 1, body: 'You extract a print-on-demand client\'s design brief from free text. Client: {{CLIENT_NAME}}. Saved brief: {{EXISTING_BRIEF}} ... Return ONLY the JSON. BRIEF TEXT: {{BRIEF_TEXT}}' };
const sampleConfig = { sbUrl: supabaseUrl, anonKey: 'sb_publishable_redacted', n8nBaseUrl: n8nBaseUrl, studioSecret: 'redacted', ideogramKey: 'redacted', imgbbKey: 'redacted', mlKey: 'redacted', upscaleModel: 'ultra_resolution', upscaleScale: 4, openrouterKey: 'redacted' };
const sampleResult = { niche: 'vintage-style outdoor badges for hikers', audience: 'US, Etsy', subjects: ['Highland cows', 'chickens'], brand_text: ['@TrailBadgeCo', 'EST. 2019'], typography_note: 'chunky slab serif', palette_mode: null, text_case: 'upper', must_have: ['circular badge frame', 'ink banner across the bottom'], avoid: ['gradients', 'photo-realism'], lock_typography: null, lock_composition: null, default_similarity_tier: null, garment_colors: ['black', 'white'], notes: '', notes_for_designer: ['Palette strictness not stated'] };
const sampleChatBody = { messages: [{ role: 'system', content: 'You extract a print-on-demand client\'s design brief from free text. Client: Trail Badge Co. ...' }, { role: 'user', content: sampleText }], response_format: { type: 'json_object' }, temperature: 0, max_tokens: 2000 };
const sampleKieBody = { model: 'claude-sonnet-4-6', max_tokens: 2000, temperature: 0, system: sampleChatBody.messages[0].content, messages: [{ role: 'user', content: sampleText }] };
const sampleKieResponse = { id: 'msg_brief', type: 'message', role: 'assistant', model: 'claude-sonnet-4-6', content: [{ type: 'text', text: JSON.stringify(sampleResult) }], stop_reason: 'end_turn', usage: { input_tokens: 900, output_tokens: 210 } };

const briefParseNote = sticky(
  '## DM Studio · WF-8 Brief Parse (brief_parse_requests insert → /webhook/studio-brief-parse)\n' +
  'Onboarding wizard, Written brief step, panel "Fill from text": the app inserts a brief_parse_requests row {client_id, text}; the DB trigger POSTs {request_id, client_id} here with header x-studio-secret. Respond 200 at once (responseMode onReceived), then **Request → working** (rpc brief_parse_update) → **Get Request** (id, client_id, text, clients(name, style_brief) - single object) → **Get Settings** (ai_platform, openrouter_models) → **Get Template** (prompt_templates slug **brief_parser**, active row, never inlined) → **Build Request** (system = template body with {{CLIENT_NAME}}, {{EXISTING_BRIEF}} = the saved brief JSON without source_text, or "none", {{BRIEF_TEXT}}; user = the pasted text; temperature 0; max_tokens 2000; `body` = OpenRouter chat body with response_format json_object, `kie_body` = Claude Messages body) → **Text Platform?** (Kie | OpenRouter; Auto = Kie first, then OpenRouter via **Kie Parse Down?**) → **Kie Parse Brief** (POST api.kie.ai/claude/v1/messages, model claude-sonnet-4-6, header anthropic-version 2023-06-01, credential GPT Image 2 [DM-Kie] - the WF-7 Distill endpoint) | **OpenRouter Parse Brief** (model settings.openrouter_models.text) → **Parse** (reads Claude content[] or chat choices, strips fences, JSON.parse, keeps ONLY the 15 contract keys (invented keys dropped) and coerces each: strings max 400 chars, arrays max 20 distinct items with empty strings dropped, palette_mode strict|flexible|null, text_case as_typed|upper|title|null, locks true|false|null, default_similarity_tier 1..5|null) → **Request → done** (rpc brief_parse_update p_result). The wizard watches the row and fills the form; nothing is saved until the designer presses Save brief.\n\n' +
  'Every failure (no template, text under 20 chars, vendor error, no JSON) → **Fail Message** (readable text, no colons - n8n keeps only the text after the last colon) → **Request → failed** (rpc brief_parse_update p_error). Model calls: timeout 120 s, 2 tries. Cost about $0.01 per parse.\n\n' +
  '**Config convention (no credentials except Kie):** the webhook has NO n8n auth. First node **Load Config** runs the sub-workflow WF-0 Studio Config (`const configWorkflowId`); every later node reads `$(\'Load Config\').first().json.<field>`. **Secret OK?** compares the incoming `x-studio-secret` header with config.studioSecret - the pg_net trigger always sends it; mismatch ends in the no-op **Rejected** node. Supabase REST/RPC calls send headers apikey = anonKey and x-studio-secret = studioSecret. OpenRouter reads config.openrouterKey. Nothing to paste in this workflow.',
  { color: 4, width: 420, height: 760, position: [-460, 40] }
);

const briefParseWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Brief Parse Webhook',
    parameters: {
      httpMethod: 'POST',
      path: 'studio-brief-parse',
      responseMode: 'onReceived',
      options: {}
    },
    position: [0, 304]
  },
  output: [{ headers: { 'content-type': 'application/json', 'x-studio-secret': 'redacted' }, params: {}, query: {}, body: { request_id: sampleRequestId, client_id: sampleClientId }, webhookUrl: n8nBaseUrl + '/webhook/studio-brief-parse', executionMode: 'production' }]
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
          { id: 'k', leftValue: expr("{{ $('Brief Parse Webhook').first().json.headers?.['x-studio-secret'] ?? '' }}"), operator: { type: 'string', operation: 'equals' }, rightValue: expr("{{ $('Load Config').first().json.studioSecret }}") }
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
          { id: 'c1', name: 'requestId', type: 'string', value: expr("{{ $('Brief Parse Webhook').first().json.body?.request_id ?? '' }}") },
          { id: 'c2', name: 'clientId', type: 'string', value: expr("{{ $('Brief Parse Webhook').first().json.body?.client_id ?? '' }}") },
          { id: 'c3', name: 'executionId', type: 'string', value: expr('{{ String($execution.id) }}') }
        ]
      },
      includeOtherFields: false,
      options: {}
    },
    position: [720, 304]
  },
  output: [{ requestId: sampleRequestId, clientId: sampleClientId, executionId: '48310' }]
});

const requestWorking = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Request → working',
    parameters: {
      method: 'POST',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/rpc/brief_parse_update"),
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
  output: [sampleStatusRow]
});

// Single object (Accept vnd.pgrst.object+json): the row plus the client name and saved brief through the client_id FK
const getRequest = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Get Request',
    parameters: {
      method: 'GET',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/brief_parse_requests?id=eq.{{ $('Config').first().json.requestId }}&select=id,client_id,text,clients(name,style_brief)"),
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
    position: [1200, 304]
  },
  output: [sampleRequestRow]
});

const getSettings = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Get Settings',
    parameters: {
      method: 'GET',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/settings?select=ai_platform,openrouter_models&limit=1"),
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
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [1440, 304]
  },
  output: [sampleSettings]
});

// Array response on purpose: an empty array still yields one (empty) item, so Build Request can name the missing template
const getTemplate = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Get Template',
    parameters: {
      method: 'GET',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/prompt_templates?slug=eq.brief_parser&active=is.true&select=slug,version,body&order=version.desc&limit=1"),
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
  output: [sampleTemplate]
});

const buildRequest = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build Request',
    parameters: {
      jsCode: "const tpl = $('Get Template').all().map((i) => i.json).find((t) => t && t.slug === 'brief_parser' && t.body);\nif (!tpl) throw new Error('no active brief_parser template in prompt_templates - activate brief_parser v1 under Settings > Prompt templates, then try again');\nconst req = $('Get Request').first().json || {};\nconst text = String(req.text || '').replace(/\\r\\n?/g, '\\n').trim();\nif (text.length < 20) throw new Error('the brief text is too short to parse - paste at least 20 characters');\nconst client = (req.clients && typeof req.clients === 'object') ? req.clients : {};\n// the saved brief is context only; its source_text (an earlier paste) is left out so the model never re-reads old text as new\nconst sb = (client.style_brief && typeof client.style_brief === 'object' && !Array.isArray(client.style_brief)) ? Object.assign({}, client.style_brief) : {};\ndelete sb.source_text;\nconst vars = { CLIENT_NAME: String(client.name || '').trim() || 'the client', EXISTING_BRIEF: Object.keys(sb).length ? JSON.stringify(sb) : 'none', BRIEF_TEXT: text };\n// function replacer, so $& or $1 inside the pasted text stay literal; unknown tokens are left as they are\nconst system = String(tpl.body).replace(/\\{\\{\\s*([A-Z_]+)\\s*\\}\\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : m));\nconst model = ($('Get Settings').first().json.openrouter_models || {}).text || 'anthropic/claude-sonnet-4.6';\n// body = OpenRouter chat/completions (JSON mode); kie_body = Kie Claude Messages (/claude/v1/messages, the WF-7 Distill endpoint)\nconst body = { messages: [{ role: 'system', content: system }, { role: 'user', content: text }], response_format: { type: 'json_object' }, temperature: 0, max_tokens: 2000 };\nconst kie_body = { model: 'claude-sonnet-4-6', max_tokens: 2000, temperature: 0, system, messages: [{ role: 'user', content: text }] };\nreturn { json: { body, kie_body, model, template_version: tpl.version, client_name: vars.CLIENT_NAME, text_length: text.length } };"
    },
    onError: 'continueErrorOutput',
    position: [1920, 304]
  },
  output: [{ body: sampleChatBody, kie_body: sampleKieBody, model: 'anthropic/claude-sonnet-4.6', template_version: 1, client_name: 'Trail Badge Co', text_length: sampleText.length }]
});

// ---- AI platform: Switch (Kie / OpenRouter) + Auto fallback when Kie reports it is down (same trio as WF-7 Distill) ----
const textPlatform = switchCase({
  version: 3.2,
  config: {
    name: 'Text Platform?',
    parameters: {
      rules: {
        values: [
          { outputKey: 'Kie', renameOutput: true, conditions: { options: looseOptions, conditions: [{ leftValue: expr("{{ $('Get Settings').first().json.ai_platform || 'kie' }}"), operator: { type: 'string', operation: 'notEquals' }, rightValue: 'openrouter' }], combinator: 'and' } },
          { outputKey: 'OpenRouter', renameOutput: true, conditions: { options: looseOptions, conditions: [{ leftValue: expr("{{ $('Get Settings').first().json.ai_platform || 'kie' }}"), operator: { type: 'string', operation: 'equals' }, rightValue: 'openrouter' }], combinator: 'and' } }
        ]
      },
      options: {}
    },
    position: [2160, 304]
  },
  output: [{}]
});

const kieParseBrief = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Kie Parse Brief',
    parameters: {
      method: 'POST',
      url: kieBaseUrl + '/claude/v1/messages',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'Content-Type', value: 'application/json' },
          { name: 'anthropic-version', value: '2023-06-01' }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify($('Build Request').first().json.kie_body) }}"),
      options: { timeout: 120000 }
    },
    credentials: { httpHeaderAuth: kieClaudeCredential },
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 5000,
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [2400, 304]
  },
  output: [sampleKieResponse]
});

const kieParseDown = ifElse({
  version: 2.2,
  config: {
    name: 'Kie Parse Down?',
    parameters: {
      conditions: {
        options: looseOptions,
        conditions: [
          { id: 'a1', leftValue: expr("{{ $('Get Settings').first().json.ai_platform || 'kie' }}"), operator: { type: 'string', operation: 'equals' }, rightValue: 'auto' },
          { id: 'a2', leftValue: expr("{{ (Array.isArray($json.content) || $json.choices) ? 'up' : 'down' }}"), operator: { type: 'string', operation: 'equals' }, rightValue: 'down' }
        ],
        combinator: 'and'
      },
      options: {}
    },
    position: [2640, 304]
  },
  output: [{}]
});

const orParseBrief = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'OpenRouter Parse Brief',
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
      jsonBody: expr("{{ JSON.stringify(Object.assign({}, $('Build Request').first().json.body, { model: $('Build Request').first().json.model || ($('Get Settings').first().json.openrouter_models || {}).text || 'anthropic/claude-sonnet-4.6' })) }}"),
      options: { timeout: 120000 }
    },
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 5000,
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [2640, 112]
  },
  output: [{ id: 'gen-or-brief', model: 'anthropic/claude-sonnet-4.6', choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(sampleResult) }, finish_reason: 'stop' }] }]
});

const parse = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Parse',
    parameters: {
      mode: 'runOnceForEachItem',
      jsCode: "const j = $json || {};\nlet p = j;\nif (typeof j.data === 'string') { try { p = JSON.parse(j.data) || j; } catch (e) { p = j; } }\nconst content = Array.isArray(p.content) ? p.content.filter((c) => c && c.type === 'text').map((c) => String(c.text || '')).join('\\n') : (p.choices && p.choices[0] && p.choices[0].message ? p.choices[0].message.content : undefined);\nif (typeof content !== 'string') { const e = (typeof p.error === 'object' && p.error) || {}; const via = $('OpenRouter Parse Brief').isExecuted ? ($('Kie Parse Brief').isExecuted ? 'Kie and OpenRouter' : 'OpenRouter') : 'Kie'; let why = String(p.msg || e.message || (typeof p.error === 'string' ? p.error : '') || 'no reply'); const inner = why.match(/message\\\\?\":\\\\?\"([^\"\\\\]+)/); if (inner) why = inner[1]; const lead = String(e.message || '').match(/^(\\d{3})\\b/); const code = p.code || e.status || e.httpCode || (lead && lead[1]) || e.code || '?'; if (via !== 'Kie' && (String(code) === '401' || String(code) === '403')) why = 'OpenRouter API key missing or invalid - add it in n8n WF-0 Studio Config (OpenRouter Config node)'; throw new Error(('Text model unavailable (' + via + ' error ' + code + ' - ' + why.replace(/\\s*:\\s*/g, ' - ').slice(0, 160) + '). Nothing was changed; try again in a few minutes.').replace(/\\s*:\\s*/g, ' - ')); }\nconst cleaned = content.replace(/```(?:json)?/gi, '').trim();\nconst m = cleaned.match(/\\{[\\s\\S]*\\}/);\nlet raw;\ntry { raw = JSON.parse(m ? m[0] : cleaned); } catch (e) { throw new Error('brief parser returned no JSON - reply was ' + cleaned.slice(0, 200).replace(/:/g, '=')); }\nif (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('brief parser returned no object');\n// only the 15 contract keys are read (anything else the model adds is dropped); unknown -> \"\" / [] / null; strings max 400 chars; lists max 20 distinct items, blanks dropped; enums validated\nconst str = (v) => (v === null || v === undefined ? '' : (Array.isArray(v) ? v.filter((x) => x !== null && typeof x !== 'object').join('; ') : (typeof v === 'object' ? '' : String(v)))).trim().slice(0, 400);\nconst list = (v) => (Array.isArray(v) ? v : (typeof v === 'string' ? v.split(/\\n|;/) : [])).map(str).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).slice(0, 20);\nconst oneOf = (v, opts) => (typeof v === 'string' && opts.includes(v.trim().toLowerCase()) ? v.trim().toLowerCase() : null);\nconst bool = (v) => { const s = typeof v === 'string' ? v.trim().toLowerCase() : v; return s === true || s === 'true' ? true : (s === false || s === 'false' ? false : null); };\nconst t = raw.default_similarity_tier, tier = typeof t === 'number' ? t : (typeof t === 'string' && t.trim() ? Number(t) : NaN);\nconst result = { niche: str(raw.niche), audience: str(raw.audience), subjects: list(raw.subjects), brand_text: list(raw.brand_text), typography_note: str(raw.typography_note), palette_mode: oneOf(raw.palette_mode, ['strict', 'flexible']), text_case: oneOf(raw.text_case, ['as_typed', 'upper', 'title']), must_have: list(raw.must_have), avoid: list(raw.avoid), lock_typography: bool(raw.lock_typography), lock_composition: bool(raw.lock_composition), default_similarity_tier: Number.isInteger(tier) && tier >= 1 && tier <= 5 ? tier : null, garment_colors: list(raw.garment_colors), notes: str(raw.notes), notes_for_designer: list(raw.notes_for_designer) };\nconst req = $('Build Request').first().json || {};\nreturn { json: { result, template_version: req.template_version || null, model: p.model || null, via: $('OpenRouter Parse Brief').isExecuted ? 'openrouter' : 'kie' } };"
    },
    onError: 'continueErrorOutput',
    position: [2880, 304]
  },
  output: [{ result: sampleResult, template_version: 1, model: 'claude-sonnet-4-6', via: 'kie' }]
});

const requestDone = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Request → done',
    parameters: {
      method: 'POST',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/rpc/brief_parse_update"),
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
      jsonBody: expr("{{ JSON.stringify({ p_request_id: $('Config').first().json.requestId, p_status: 'done', p_result: $json.result, p_execution_id: $('Config').first().json.executionId }) }}"),
      options: { timeout: 15000 }
    },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 3000,
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [3120, 304]
  },
  output: [{ ...sampleStatusRow, status: 'done', result: sampleResult }]
});

const failMessage = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Fail Message',
    parameters: {
      mode: 'runOnceForEachItem',
      jsCode: "const j = $json || {};\nconst cfg = $('Config').first().json;\nconst text = (v) => (v === undefined || v === null || v === '' ? '' : (typeof v === 'object' ? String(v.message || v.description || JSON.stringify(v)) : String(v)));\nconst message = (text(j.error) || text(j.message) || text(j.msg) || text(j.detail) || text(j.hint) || 'brief parse failed').slice(0, 500);\nreturn { json: { message, requestId: cfg.requestId, clientId: cfg.clientId } };"
    },
    position: [2880, 592]
  },
  output: [{ message: 'Text model unavailable (Kie error 502 - upstream busy). Nothing was changed; try again in a few minutes.', requestId: sampleRequestId, clientId: sampleClientId }]
});

const requestFailed = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Request → failed',
    parameters: {
      method: 'POST',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/rpc/brief_parse_update"),
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
      jsonBody: expr("{{ JSON.stringify({ p_request_id: $('Config').first().json.requestId, p_status: 'failed', p_error: String($json.message || 'brief parse failed').slice(0, 500), p_execution_id: $('Config').first().json.executionId }) }}"),
      options: { timeout: 15000 }
    },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 3000,
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [3120, 592]
  },
  output: [{ ...sampleStatusRow, status: 'failed', last_error: 'Text model unavailable (Kie error 502 - upstream busy). Nothing was changed; try again in a few minutes.' }]
});

export default workflow('dm-studio-wf8-brief-parse', 'DM Studio · WF-8 Brief Parse')
  .add(briefParseNote)
  .add(briefParseWebhook)
  .to(loadConfig)
  .to(secretOk.onTrue(config).onFalse(rejected))
  .add(config)
  .to(requestWorking)
  .to(getRequest.onError(failMessage))
  .to(getSettings)
  .to(getTemplate.onError(failMessage))
  .to(buildRequest.onError(failMessage))
  .to(textPlatform.onCase(0, kieParseBrief).onCase(1, orParseBrief))
  .add(kieParseBrief)
  .to(kieParseDown.onTrue(orParseBrief).onFalse(parse))
  .add(orParseBrief)
  .to(parse.onError(failMessage))
  .to(requestDone)
  .add(failMessage)
  .to(requestFailed);
