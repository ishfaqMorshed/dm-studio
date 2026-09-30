import { workflow, node, trigger, sticky, placeholder, newCredential, ifElse, switchCase, merge, splitInBatches, nextBatch, languageModel, memory, tool, outputParser, embedding, embeddings, vectorStore, retriever, documentLoader, textSplitter, reranker, fromAi, expr } from '@n8n/workflow-sdk';

const supabaseUrl = 'https://voatrqhfsdfjomyajovi.supabase.co';
const n8nBaseUrl = 'https://n8n.srv1202488.hstgr.cloud';
const kieBaseUrl = 'https://api.kie.ai';

const configWorkflowId = 'vbyjWhK4ZRN9uZUM';
const kieVisionCredential = newCredential('Gemini 3.1 Pro [DM-Kie]', '0l2nHQUQNnsCAfTR');

const looseOptions = { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 1 };
const uuidPattern = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

const sampleCardId = '1a2b3c4d-5e6f-4a70-8b91-0c1d2e3f4a5b';
const sampleClientId = '7c6d5e4f-3a2b-4c1d-9e8f-0a1b2c3d4e5f';
const sampleStyleCardId = '3f2e1d0c-9b8a-4765-8321-0fedcba98765';
const sampleRequestId = '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a';
const sampleRefPath1 = sampleClientId + '/' + sampleCardId + '/1.png';
const sampleRefPath2 = sampleClientId + '/' + sampleCardId + '/2.jpg';
const sampleSignedPath = '/object/sign/refs/' + sampleRefPath1 + '?token=redacted';
const sampleSignedUrl = supabaseUrl + '/storage/v1' + sampleSignedPath;

const sampleClient = { id: sampleClientId, name: 'Test Client', default_similarity_tier: 3, garment_colors: ['black', 'navy'], notes: 'Loves vintage badges' };
const sampleCard = {
  id: sampleCardId,
  client_id: sampleClientId,
  stage: 'intake',
  brief_text: 'Retro camping badge with a bear over a lake',
  print_text: [{ role: 'headline', text: 'FAMILY FIRST' }],
  reference_paths: [sampleRefPath1, sampleRefPath2],
  reference_analysis: null,
  garment_color: 'black',
  placement: 'front_chest',
  similarity_tier: 3,
  style_card_id: null,
  n8n_execution_id: null,
  clients: sampleClient
};
const sampleAnalysis = {
  art_style: 'bold vintage badge illustration, screen-print feel',
  palette: [{ name: 'cream', hex: '#F2E8D5' }, { name: 'forest green', hex: '#2F5D3A' }],
  subject_structure: 'centered bear silhouette over a lake inside a circular badge',
  typography_transcription: 'FAMILY FIRST',
  text_detected: ['FAMILY FIRST'],
  composition: 'circular badge, text arched along the top',
  notes: 'reference 2 is a worn shirt mockup; judged as flat artwork'
};
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
const sampleAnalysisContent = '{"art_style":"bold vintage badge illustration, screen-print feel","palette":[{"name":"cream","hex":"#F2E8D5"}],"subject_structure":"centered bear over a lake","typography_transcription":"FAMILY FIRST","text_detected":["FAMILY FIRST"],"composition":"circular badge","notes":"reference 2 is a mockup"}';
const sampleStyleContent = '{"medium":"screen-print style vector illustration","linework":{"weight":"bold","style":"clean"},"shading":"flat fills","texture":"light grain","palette":[{"name":"cream","hex":"#F2E8D5","weight":"dominant"}],"composition":"centered badge","typography":{"vibe":"vintage sans","placement":"arched top","case":"upper"},"background":"flat mid-grey #808080, isolated artwork","mood":["rugged"],"subjects":["wildlife"],"forbid":["gradients"],"signature_moves":["thick keyline"],"garment_colors":["black"]}';
const sampleAnalysisResponse = { id: 'chatcmpl-analysis', object: 'chat.completion', model: 'gemini-3.1-pro', choices: [{ index: 0, message: { role: 'assistant', content: sampleAnalysisContent }, finish_reason: 'stop' }], usage: { prompt_tokens: 1400, completion_tokens: 260 } };
const sampleStyleResponse = { id: 'chatcmpl-style', object: 'chat.completion', model: 'gemini-3.1-pro', choices: [{ index: 0, message: { role: 'assistant', content: sampleStyleContent }, finish_reason: 'stop' }], usage: { prompt_tokens: 2200, completion_tokens: 420 } };
const sampleConfig = { sbUrl: supabaseUrl, anonKey: 'sb_publishable_redacted', n8nBaseUrl: n8nBaseUrl, studioSecret: 'redacted', ideogramKey: 'redacted', imgbbKey: 'redacted', mlKey: 'redacted', upscaleModel: 'ultra_resolution', upscaleScale: 4 };
const sampleVisionBody = { messages: [{ role: 'user', content: [{ type: 'text', text: 'You are a precise visual analyst ...' }, { type: 'image_url', image_url: { url: sampleSignedUrl } }] }], response_format: { type: 'json_object' } };

const intakeNote = sticky(
  '## DM Studio · WF-1 Intake (cards insert → /webhook/studio-intake)\n' +
  'Payload {card_id, client_id} from the pg_net trigger. Respond 200 immediately, then: Tag Execution (cards.n8n_execution_id, read by WF-6) → Get Card (+client) → Get Templates (prompt_templates slugs **analysis_prompt** (active v2, JSON contract), **style_profiler**; prompts are never inlined here) → sign the card\'s reference_paths (POST /storage/v1/object/sign/refs/<path>, 1 h) → Analyze References (Kie gemini-3.1-pro chat/completions, text + one image_url part per reference, JSON mode) → Parse Analysis (JSON first; a v1-style STYLE:/TYPOGRAPHY_TEXT: text reply is mapped to art_style/typography_transcription/text_detected instead of failing) → PATCH cards.reference_analysis → Style Card check.\n\n' +
  '**Style Card check:** locked or draft card exists → move_card(review). Otherwise, if the client has a reference library → insert style_draft_requests (WF-1b drafts from the library); if the library is empty → draft from these references with the same style_profiler prompt → new_style_card_version → move_card(review). The fallback draft is best-effort: a vision or JSON failure still moves the card to review.\n\n' +
  'Any failure in the analysis lane → Fail Message → move_card(failed, message). Template tokens replaced at runtime: {{NICHE}}, {{CLIENT_NAME}}, {{BRIEF}}, {{TEXT_LINES}}, {{IMAGE_COUNT}}, {{CLIENT_NOTES}}, {{GARMENT_COLORS}}.\n\n' +
  '**Config convention (no credentials except Kie):** the webhook has NO n8n auth. First node **Load Config** runs the sub-workflow WF-0 Studio Config (paste its id into `const configWorkflowId` before creating this workflow); every later node reads `$(\'Load Config\').first().json.<field>`. **Secret OK?** compares the incoming `x-studio-secret` header with config.studioSecret - the pg_net trigger always sends it; mismatch ends in the no-op **Rejected** node. Every Supabase REST/RPC/Storage call sends headers apikey = anonKey and x-studio-secret = studioSecret from config, no credential attached. Vision calls keep the existing credential **Gemini 3.1 Pro [DM-Kie]** (0l2nHQUQNnsCAfTR). Nothing to paste in this workflow: all keys live in WF-0.',
  { color: 4, width: 400, height: 800, position: [-460, 80] }
);

const intakeWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Intake Webhook',
    parameters: {
      httpMethod: 'POST',
      path: 'studio-intake',
      responseMode: 'onReceived',
      options: {}
    },
    position: [0, 304]
  },
  output: [{ headers: { 'content-type': 'application/json', 'x-studio-secret': 'redacted' }, params: {}, query: {}, body: { card_id: sampleCardId, client_id: sampleClientId }, webhookUrl: n8nBaseUrl + '/webhook/studio-intake', executionMode: 'production' }]
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
          { id: 'k', leftValue: expr("{{ $('Intake Webhook').first().json.headers?.['x-studio-secret'] ?? '' }}"), operator: { type: 'string', operation: 'equals' }, rightValue: expr("{{ $('Load Config').first().json.studioSecret }}") }
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
          { id: 'c3', name: 'cardId', type: 'string', value: expr("{{ $('Intake Webhook').first().json.body?.card_id ?? '' }}") },
          { id: 'c4', name: 'clientId', type: 'string', value: expr("{{ $('Intake Webhook').first().json.body?.client_id ?? '' }}") },
          { id: 'c5', name: 'executionId', type: 'string', value: expr('{{ String($execution.id) }}') }
        ]
      },
      includeOtherFields: false,
      options: {}
    },
    position: [720, 304]
  },
  output: [{ cardId: sampleCardId, clientId: sampleClientId, executionId: '48211' }]
});

const tagExecution = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Tag Execution',
    parameters: {
      method: 'PATCH',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/cards?id=eq.{{ $('Config').first().json.cardId }}"),
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
      jsonBody: expr("{{ JSON.stringify({ n8n_execution_id: $('Config').first().json.executionId }) }}"),
      options: { timeout: 15000 }
    },
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [960, 304]
  },
  output: [{ ...sampleCard, n8n_execution_id: '48211' }]
});

const getVisionModel = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Get Vision Model',
    parameters: {
      method: 'GET',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/settings?id=eq.1&select=vision_model,ai_platform,openrouter_models"),
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
    alwaysOutputData: true,
    onError: 'continueRegularOutput',
    position: [1080, 496]
  },
  output: [{ vision_model: 'gemini-3.1-pro', ai_platform: 'kie', openrouter_models: { vision: 'google/gemini-3.1-pro-preview', image: 'openai/gpt-image-2.5-sunburst', edit: 'google/gemini-2.5-flash-image', text: 'anthropic/claude-sonnet-4.6' } }]
});

const getCard = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Get Card',
    parameters: {
      method: 'GET',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/cards?id=eq.{{ $('Config').first().json.cardId }}&select=*,clients(id,name,default_similarity_tier,garment_colors,notes,style_brief)"),
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
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 2000,
    onError: 'continueErrorOutput',
    position: [1200, 304]
  },
  output: [sampleCard]
});

const getTemplates = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Get Templates',
    parameters: {
      method: 'GET',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/prompt_templates?slug=in.(analysis_prompt,style_profiler)&active=is.true&select=slug,version,body&order=version.desc"),
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
    position: [1440, 304]
  },
  output: [{ slug: 'analysis_prompt', version: 2, body: 'You are a precise visual analyst for a "{{NICHE}}" print-on-demand design. ... Return ONLY this JSON object - no markdown fences: {"art_style":"","palette":[{"name":"","hex":"#RRGGBB"}],"subject_structure":"","typography_transcription":"","text_detected":[],"composition":"","notes":""}' }]
});

const listReferencePaths = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'List Reference Paths',
    parameters: {
      jsCode: "const card = $('Get Card').first().json;\nconst raw = Array.isArray(card.reference_paths) ? card.reference_paths : [];\nconst paths = raw.map((p) => String(p || '').replace(/^refs\\//, '').trim()).filter(Boolean).slice(0, 3);\nif (!paths.length) throw new Error('card has no reference_paths');\nreturn paths.map((path, i) => ({ json: { path, index: i + 1, bucket: 'refs' } }));"
    },
    onError: 'continueErrorOutput',
    position: [1680, 304]
  },
  output: [{ path: sampleRefPath1, index: 1, bucket: 'refs' }]
});

const signReference = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Sign Reference',
    parameters: {
      method: 'POST',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/storage/v1/object/sign/refs/{{ $json.path }}"),
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
    position: [1920, 304]
  },
  output: [{ signedURL: sampleSignedPath }]
});

const buildAnalysisRequest = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build Analysis Request',
    parameters: {
      jsCode: "const cfg = $('Load Config').first().json;\nconst card = $('Get Card').first().json;\nconst rows = $('Get Templates').all().map((i) => i.json);\nconst tpl = rows.find((r) => r.slug === 'analysis_prompt');\nif (!tpl || !tpl.body) throw new Error('no active analysis_prompt template in prompt_templates');\nconst urls = $input.all().map((i) => cfg.sbUrl + '/storage/v1' + String(i.json.signedURL || '')).filter((u) => /token=/.test(u));\nif (!urls.length) throw new Error('no signed reference URLs');\nconst lines = (Array.isArray(card.print_text) ? card.print_text : []).map((t) => (t && t.text) || '').filter(Boolean);\nconst client = card.clients || {};\nconst vars = { NICHE: client.name || '', CLIENT_NAME: client.name || '', CLIENT_NOTES: client.notes || '', GARMENT_COLORS: JSON.stringify(client.garment_colors || []), BRIEF: card.brief_text || '', TEXT_LINES: lines.length ? lines.join('\\n') : 'NONE', IMAGE_COUNT: String(urls.length) };\nconst text = String(tpl.body).replace(/\\{\\{\\s*([A-Z_]+)\\s*\\}\\}/g, (m, k) => (k in vars ? vars[k] : m));\nconst content = [{ type: 'text', text }].concat(urls.map((url) => ({ type: 'image_url', image_url: { url } })));\nreturn { json: { body: { messages: [{ role: 'user', content }], response_format: { type: 'json_object' } }, template_version: tpl.version, reference_urls: urls, text_lines: lines } };"
    },
    onError: 'continueErrorOutput',
    position: [2160, 304]
  },
  output: [{ body: sampleVisionBody, template_version: 1, reference_urls: [sampleSignedUrl], text_lines: ['FAMILY FIRST'] }]
});

const analyzeReferences = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Analyze References',
    parameters: {
      method: 'POST',
      url: expr("https://api.kie.ai/{{ $('Get Vision Model').first().json.vision_model || 'gemini-3.1-pro' }}/v1/chat/completions"),
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
    position: [2400, 304]
  },
  output: [sampleAnalysisResponse]
});

const parseAnalysis = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Parse Analysis',
    parameters: {
      mode: 'runOnceForEachItem',
      jsCode: "if (!$json.choices) { const e = (typeof $json.error === 'object' && $json.error) || {}; const via = $('OpenRouter Analyze').isExecuted ? ($('Analyze References').isExecuted ? 'Kie and OpenRouter' : 'OpenRouter') : 'Kie'; let why = String($json.msg || e.message || (typeof $json.error === 'string' ? $json.error : '') || 'no reply'); const inner = why.match(/message\\\\?\":\\\\?\"([^\"\\\\]+)/); if (inner) why = inner[1]; const code = $json.code || e.status || e.httpCode || e.code || '?'; if (via !== 'Kie' && (String(code) === '401' || String(code) === '403')) why = 'OpenRouter API key missing or invalid - add it in n8n WF-0 Studio Config (OpenRouter Config node)'; throw new Error('Vision service unavailable (' + via + ' error ' + code + ' - ' + why.replace(/:/g, ' -').slice(0, 160) + '). Nothing was changed; try again in a few minutes.'); }\nconst content = ($json.choices && $json.choices[0] && $json.choices[0].message && $json.choices[0].message.content) || '';\nconst cleaned = String(content).replace(/```json|```/g, '').trim();\nconst tryParse = (t) => { try { return JSON.parse(t); } catch (e) { return null; } };\nlet analysis = tryParse(cleaned);\nif (analysis === null) { const m = cleaned.match(/\\{[\\s\\S]*\\}/); analysis = m ? tryParse(m[0]) : null; }\nif (Array.isArray(analysis)) {\n  // The model sometimes answers with one object per image (typically when the references are unrelated designs).\n  // IMAGE 1 is the design to re-create; the others become supporting notes so nothing is silently dropped.\n  const objs = analysis.filter((o) => o && typeof o === 'object' && !Array.isArray(o));\n  const primary = objs[0] || null;\n  if (primary && objs.length > 1) {\n    const extra = objs.slice(1).map((o, i) => 'IMAGE ' + (i + 2) + ' - ' + String(o.subject_structure || o.art_style || '').slice(0, 300)).join(' | ');\n    primary.notes = [String(primary.notes || '').trim(), 'Supporting references (style and subject cues only, not the design to re-create) - ' + extra].filter(Boolean).join(' ');\n  }\n  analysis = primary;\n}\nif (!analysis || typeof analysis !== 'object' || Array.isArray(analysis)) {\n  // v1-style text reply (STYLE: / TYPOGRAPHY_TEXT: / TYPOGRAPHY_STYLE:) -> minimal reference_analysis object\n  const block = (k) => { const r = cleaned.match(new RegExp('(?:^|\\\\n)' + k + ':\\\\s*([\\\\s\\\\S]*?)(?=\\\\n[A-Z_]+:|$)')); return r ? r[1].trim() : ''; };\n  const style = block('STYLE');\n  if (!style) throw new Error('reference analysis is neither JSON nor a STYLE block - reply was ' + cleaned.slice(0, 200).replace(/:/g, '='));\n  const text = block('TYPOGRAPHY_TEXT');\n  const hasText = Boolean(text) && !/^none$/i.test(text);\n  analysis = { art_style: style, palette: '', subject_structure: '', typography_transcription: hasText ? text : '', text_detected: hasText ? [text] : [], composition: '', notes: 'parsed from a STYLE/TYPOGRAPHY_TEXT text reply (analysis_prompt v1 format)' };\n}\nif (!Array.isArray(analysis.text_detected)) analysis.text_detected = analysis.typography_transcription && !/^none$/i.test(String(analysis.typography_transcription)) ? [String(analysis.typography_transcription)] : [];\nconst req = $('Build Analysis Request').first().json;\nreturn { json: { reference_analysis: analysis, template_version: req.template_version, reference_count: req.reference_urls.length } };"
    },
    onError: 'continueErrorOutput',
    position: [2640, 304]
  },
  output: [{ reference_analysis: sampleAnalysis, template_version: 1, reference_count: 2 }]
});

const saveAnalysis = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Save Analysis',
    parameters: {
      method: 'PATCH',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/cards?id=eq.{{ $('Config').first().json.cardId }}"),
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
      jsonBody: expr('{{ JSON.stringify({ reference_analysis: $json.reference_analysis }) }}'),
      options: { timeout: 15000, response: { response: { responseFormat: 'json' } } }
    },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 3000,
    onError: 'continueErrorOutput',
    position: [2880, 304]
  },
  output: [{ ...sampleCard, reference_analysis: sampleAnalysis, clients: undefined }]
});

const getStyleCards = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Get Style Cards',
    parameters: {
      method: 'GET',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/style_cards?client_id=eq.{{ $('Config').first().json.clientId }}&status=in.(locked,draft)&select=id,status,version&order=version.desc&limit=1"),
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
    position: [3120, 304]
  },
  output: [{ id: sampleStyleCardId, status: 'locked', version: 1 }]
});

const hasStyleCard = ifElse({
  version: 2.2,
  config: {
    name: 'Has Style Card?',
    parameters: {
      conditions: {
        options: looseOptions,
        conditions: [
          { id: 's', leftValue: expr('{{ $json.id ?? "" }}'), operator: { type: 'string', operation: 'regex' }, rightValue: uuidPattern }
        ],
        combinator: 'and'
      },
      options: {}
    },
    position: [3360, 304]
  },
  output: [{ id: sampleStyleCardId, status: 'locked', version: 1 }]
});

const countLibrary = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Count Library',
    parameters: {
      method: 'GET',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/client_references?client_id=eq.{{ $('Config').first().json.clientId }}&select=id&limit=1"),
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
    position: [3600, 496]
  },
  output: [{ id: '8a7b6c5d-4e3f-4a2b-9c1d-0e9f8a7b6c5d' }]
});

const libraryHasRefs = ifElse({
  version: 2.2,
  config: {
    name: 'Library Has Refs?',
    parameters: {
      conditions: {
        options: looseOptions,
        conditions: [
          { id: 'l', leftValue: expr('{{ $json.id ?? "" }}'), operator: { type: 'string', operation: 'regex' }, rightValue: uuidPattern }
        ],
        combinator: 'and'
      },
      options: {}
    },
    position: [3840, 496]
  },
  output: [{ id: '8a7b6c5d-4e3f-4a2b-9c1d-0e9f8a7b6c5d' }]
});

const requestStyleDraft = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Request Style Draft',
    parameters: {
      method: 'POST',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/style_draft_requests"),
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
      jsonBody: expr("{{ JSON.stringify({ client_id: $('Config').first().json.clientId, status: 'queued' }) }}"),
      options: { timeout: 15000 }
    },
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [4080, 400]
  },
  output: [{ id: sampleRequestId, client_id: sampleClientId, status: 'queued', style_card_id: null }]
});

const buildStyleRequest = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build Style Request',
    parameters: {
      jsCode: "const card = $('Get Card').first().json;\nconst rows = $('Get Templates').all().map((i) => i.json);\nconst tpl = rows.find((r) => r.slug === 'style_profiler');\nif (!tpl || !tpl.body) throw new Error('no active style_profiler template in prompt_templates');\nconst urls = $('Build Analysis Request').first().json.reference_urls || [];\nif (!urls.length) throw new Error('no signed reference URLs for the style draft');\nconst client = card.clients || {};\nconst sb = (client.style_brief && typeof client.style_brief === 'object') ? client.style_brief : {};\nconst list = (v) => (Array.isArray(v) ? v.map((x) => String(x || '').trim()).filter(Boolean) : String(v || '').split(/\\n|;/).map((x) => x.trim()).filter(Boolean));\nconst rules = { palette_mode: sb.palette_mode === 'flexible' ? 'flexible' : 'strict', text_case: ['upper', 'title'].includes(sb.text_case) ? sb.text_case : 'as_typed', lock_typography: sb.lock_typography !== false, lock_composition: sb.lock_composition !== false };\nconst briefVars = { NICHE: [sb.niche, sb.audience].filter(Boolean).join(' / ') || 'not given', MUST_HAVE: list(sb.must_have).join('; ') || 'none given', AVOID: list(sb.avoid).join('; ') || 'none given', PALETTE_MODE: rules.palette_mode, TEXT_CASE: rules.text_case, LOCK_TYPOGRAPHY: rules.lock_typography ? 'locked' : 'a guide', LOCK_COMPOSITION: rules.lock_composition ? 'locked' : 'a guide' };\nconst vars = Object.assign({ CLIENT_NAME: client.name || '', CLIENT_NOTES: client.notes || 'none', GARMENT_COLORS: JSON.stringify(client.garment_colors || []), IMAGE_COUNT: String(urls.length), REFERENCE_NOTES: 'These are the references attached to one brief, not a curated library.' }, briefVars);\nconst text = String(tpl.body).replace(/\\{\\{\\s*([A-Z_]+)\\s*\\}\\}/g, (m, k) => (k in vars ? vars[k] : m));\nconst content = [{ type: 'text', text }].concat(urls.map((url) => ({ type: 'image_url', image_url: { url } })));\nreturn { json: { body: { messages: [{ role: 'user', content }], response_format: { type: 'json_object' } }, template_version: tpl.version, source: 'card_references', rules } };"
    },
    onError: 'continueRegularOutput',
    position: [4080, 592]
  },
  output: [{ body: sampleVisionBody, template_version: 1, source: 'card_references' }]
});

const profileStyle = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Profile Style',
    parameters: {
      method: 'POST',
      url: expr("https://api.kie.ai/{{ $('Get Vision Model').first().json.vision_model || 'gemini-3.1-pro' }}/v1/chat/completions"),
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
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [4320, 592]
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
      jsCode: "const REQUIRED = ['medium', 'linework', 'shading', 'texture', 'palette', 'composition', 'typography', 'background', 'mood', 'subjects', 'forbid', 'signature_moves', 'garment_colors'];\nlet card = null, error = '';\nconst vendorDown = !$json.choices;\nconst e0 = (typeof $json.error === 'object' && $json.error) || {};\nconst via = $('OpenRouter Profile Style').isExecuted ? ($('Profile Style').isExecuted ? 'Kie and OpenRouter' : 'OpenRouter') : 'Kie';\nif (vendorDown) { const e = e0; let why = String($json.msg || e.message || (typeof $json.error === 'string' ? $json.error : '') || 'no reply'); const inner = why.match(/message\\\\?\":\\\\?\"([^\"\\\\]+)/); if (inner) why = inner[1]; const code = $json.code || e.status || e.httpCode || e.code || '?'; if (via !== 'Kie' && (String(code) === '401' || String(code) === '403')) why = 'OpenRouter API key missing or invalid - add it in n8n WF-0 Studio Config (OpenRouter Config node)'; error = 'Vision service unavailable (' + via + ' error ' + code + ' - ' + why.replace(/:/g, ' -').slice(0, 160) + '). Draft the Style Card from the client panel later.'; }\ntry {\n  const content = ($json.choices && $json.choices[0] && $json.choices[0].message && $json.choices[0].message.content) || '';\n  const cleaned = String(content).replace(/```json|```/g, '').trim();\n  const m = cleaned.match(/\\{[\\s\\S]*\\}/);\n  card = JSON.parse(m ? m[0] : cleaned);\n} catch (e) { if (!vendorDown) error = 'style profiler returned no JSON'; card = null; }\nif (vendorDown) card = null;\nelse if (card && typeof card === 'object' && !Array.isArray(card)) {\n  const missing = REQUIRED.filter((k) => !(k in card));\n  if (missing.length) { error = 'style card missing keys - ' + missing.join(', '); card = null; }\n  else card.rules = Object.assign({}, card.rules || {}, $('Build Style Request').first().json.rules || {});\n} else if (card) { error = 'style profiler returned no object'; card = null; }\nif ($json.error && !error) error = String($json.error.message || $json.error).slice(0, 300);\nreturn { json: { ok: !!card, style_card: card, error } };"
    },
    position: [4560, 592]
  },
  output: [{ ok: true, style_card: sampleStyleCard, error: '' }]
});

const styleDraftOk = ifElse({
  version: 2.2,
  config: {
    name: 'Style Draft OK?',
    parameters: {
      conditions: {
        options: looseOptions,
        conditions: [
          { id: 'o', leftValue: expr('{{ $json.ok }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } }
        ],
        combinator: 'and'
      },
      options: {}
    },
    position: [4800, 592]
  },
  output: [{ ok: true, style_card: sampleStyleCard, error: '' }]
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
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [5040, 496]
  },
  output: [{ id: sampleStyleCardId, client_id: sampleClientId, version: 1, status: 'draft', json: sampleStyleCard, note: null }]
});

const cardReview = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Card → review',
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
      jsonBody: expr("{{ JSON.stringify({ p_card_id: $('Config').first().json.cardId, p_stage: 'review', p_note: 'reference analysis complete (' + $('Parse Analysis').first().json.reference_count + ' references)' }) }}"),
      options: { timeout: 15000 }
    },
    executeOnce: true,
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 3000,
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [5280, 304]
  },
  output: [{ ...sampleCard, stage: 'review', reference_analysis: sampleAnalysis, clients: undefined }]
});

const failMessage = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Fail Message',
    parameters: {
      mode: 'runOnceForEachItem',
      jsCode: "const j = $json || {};\nconst cfg = $('Config').first().json;\nconst text = (v) => (v === undefined || v === null || v === '' ? '' : (typeof v === 'object' ? String(v.message || v.description || JSON.stringify(v)) : String(v)));\nconst message = (text(j.error) || text(j.message) || text(j.msg) || text(j.detail) || text(j.hint) || 'intake failed').slice(0, 500);\nreturn { json: { message, cardId: cfg.cardId, clientId: cfg.clientId } };"
    },
    position: [2880, 800]
  },
  output: [{ message: 'reference analysis is not valid JSON: STYLE: ...', cardId: sampleCardId, clientId: sampleClientId }]
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
      jsonBody: expr("{{ JSON.stringify({ p_card_id: $('Config').first().json.cardId, p_stage: 'failed', p_note: $json.message, p_force: true }) }}"),
      options: { timeout: 15000 }
    },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 3000,
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [3120, 800]
  },
  output: [{ ...sampleCard, stage: 'failed', last_error: 'reference analysis is not valid JSON: STYLE: ...', clients: undefined }]
});

// ---- AI platform: Switch (Kie / OpenRouter) + Auto fallback when Kie reports it is down ----
const analysisPlatform = switchCase({
  version: 3.2,
  config: {
    name: 'Analysis Platform?',
    parameters: {
      rules: {
        values: [
          { outputKey: 'Kie', renameOutput: true, conditions: { options: looseOptions, conditions: [{ leftValue: expr("{{ $('Get Vision Model').first().json.ai_platform || 'kie' }}"), operator: { type: 'string', operation: 'notEquals' }, rightValue: 'openrouter' }], combinator: 'and' } },
          { outputKey: 'OpenRouter', renameOutput: true, conditions: { options: looseOptions, conditions: [{ leftValue: expr("{{ $('Get Vision Model').first().json.ai_platform || 'kie' }}"), operator: { type: 'string', operation: 'equals' }, rightValue: 'openrouter' }], combinator: 'and' } }
        ]
      },
      options: {}
    },
    position: [2280, 112]
  },
  output: [{}]
});

const kieAnalysisDown = ifElse({
  version: 2.2,
  config: {
    name: 'Kie Analysis Down?',
    parameters: {
      conditions: {
        options: looseOptions,
        conditions: [
          { id: 'a1', leftValue: expr("{{ $('Get Vision Model').first().json.ai_platform || 'kie' }}"), operator: { type: 'string', operation: 'equals' }, rightValue: 'auto' },
          { id: 'a2', leftValue: expr("{{ $json.choices ? 'up' : 'down' }}"), operator: { type: 'string', operation: 'equals' }, rightValue: 'down' }
        ],
        combinator: 'and'
      },
      options: {}
    },
    position: [2520, 112]
  },
  output: [{}]
});

const orAnalyze = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'OpenRouter Analyze',
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
      jsonBody: expr("{{ JSON.stringify(Object.assign({}, $('Build Analysis Request').first().json.body, { model: ($('Get Vision Model').first().json.openrouter_models || {}).vision || 'google/gemini-3.1-pro-preview' })) }}"),
      options: { timeout: 180000 }
    },
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 5000,
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [2520, -80]
  },
  output: [{ id: 'gen-or-sample', model: 'google/gemini-3.1-pro-preview', choices: [{ index: 0, message: { role: 'assistant', content: '{}' }, finish_reason: 'stop' }] }]
});

const stylePlatform = switchCase({
  version: 3.2,
  config: {
    name: 'Style Platform?',
    parameters: {
      rules: {
        values: [
          { outputKey: 'Kie', renameOutput: true, conditions: { options: looseOptions, conditions: [{ leftValue: expr("{{ $('Get Vision Model').first().json.ai_platform || 'kie' }}"), operator: { type: 'string', operation: 'notEquals' }, rightValue: 'openrouter' }], combinator: 'and' } },
          { outputKey: 'OpenRouter', renameOutput: true, conditions: { options: looseOptions, conditions: [{ leftValue: expr("{{ $('Get Vision Model').first().json.ai_platform || 'kie' }}"), operator: { type: 'string', operation: 'equals' }, rightValue: 'openrouter' }], combinator: 'and' } }
        ]
      },
      options: {}
    },
    position: [4200, 784]
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
          { id: 'a1', leftValue: expr("{{ $('Get Vision Model').first().json.ai_platform || 'kie' }}"), operator: { type: 'string', operation: 'equals' }, rightValue: 'auto' },
          { id: 'a2', leftValue: expr("{{ $json.choices ? 'up' : 'down' }}"), operator: { type: 'string', operation: 'equals' }, rightValue: 'down' }
        ],
        combinator: 'and'
      },
      options: {}
    },
    position: [4440, 784]
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
      jsonBody: expr("{{ JSON.stringify(Object.assign({}, $('Build Style Request').first().json.body, { model: ($('Get Vision Model').first().json.openrouter_models || {}).vision || 'google/gemini-3.1-pro-preview' })) }}"),
      options: { timeout: 180000 }
    },
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 5000,
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [4440, 976]
  },
  output: [{ id: 'gen-or-sample', model: 'google/gemini-3.1-pro-preview', choices: [{ index: 0, message: { role: 'assistant', content: '{}' }, finish_reason: 'stop' }] }]
});

export default workflow('dm-studio-wf1-intake', 'DM Studio · WF-1 Intake')
  .add(intakeNote)
  .add(intakeWebhook)
  .to(loadConfig)
  .to(secretOk.onTrue(config).onFalse(rejected))
  .add(config)
  .to(tagExecution)
  .to(getVisionModel)
  .to(getCard.onError(failMessage))
  .to(getTemplates.onError(failMessage))
  .to(listReferencePaths.onError(failMessage))
  .to(signReference.onError(failMessage))
  .to(buildAnalysisRequest.onError(failMessage))
  .to(analysisPlatform.onCase(0, analyzeReferences.onError(kieAnalysisDown)).onCase(1, orAnalyze))
  .add(analyzeReferences)
  .to(kieAnalysisDown.onTrue(orAnalyze).onFalse(parseAnalysis))
  .add(orAnalyze)
  .to(parseAnalysis.onError(failMessage))
  .to(saveAnalysis.onError(failMessage))
  .to(getStyleCards)
  .to(hasStyleCard.onTrue(cardReview).onFalse(countLibrary))
  .add(countLibrary)
  .to(libraryHasRefs.onTrue(requestStyleDraft).onFalse(buildStyleRequest))
  .add(requestStyleDraft)
  .to(cardReview)
  .add(buildStyleRequest)
  .to(stylePlatform.onCase(0, profileStyle).onCase(1, orProfileStyle))
  .add(profileStyle)
  .to(kieStyleDown.onTrue(orProfileStyle).onFalse(parseStyleCard))
  .add(orProfileStyle)
  .to(parseStyleCard)
  .to(styleDraftOk.onTrue(newStyleCardVersion).onFalse(cardReview))
  .add(newStyleCardVersion)
  .to(cardReview)
  .add(failMessage)
  .to(cardFailed);
