import { workflow, node, trigger, sticky, placeholder, newCredential, ifElse, switchCase, merge, splitInBatches, nextBatch, languageModel, memory, tool, outputParser, embedding, embeddings, vectorStore, retriever, documentLoader, textSplitter, reranker, fromAi, expr } from '@n8n/workflow-sdk';

const configWorkflowId = 'vbyjWhK4ZRN9uZUM';
const kieBaseUrl = 'https://api.kie.ai';

const kieClaudeCredential = newCredential('GPT Image 2 [DM-Kie]', 'w0sDpl2nll4HkF6h');

const looseOptions = { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 1 };

const sampleSbUrl = 'https://voatrqhfsdfjomyajovi.supabase.co';
const sampleN8nBaseUrl = 'https://n8n.srv1202488.hstgr.cloud';
const sampleConfig = { sbUrl: sampleSbUrl, anonKey: 'sb_publishable_redacted', n8nBaseUrl: sampleN8nBaseUrl, studioSecret: 'redacted', ideogramKey: 'redacted', imgbbKey: 'redacted', mlKey: 'redacted', upscaleModel: 'ultra_resolution', upscaleScale: 4 };

const sampleClientId = '7c6d5e4f-3a2b-4c1d-9e8f-0a1b2c3d4e5f';
const sampleCardId = '1a2b3c4d-5e6f-4a70-8b91-0c1d2e3f4a5b';
const sampleGenerationId1 = '9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b';
const sampleGenerationId2 = '4b3a2c1d-0e9f-4a8b-9c7d-6e5f4a3b2c1d';
const sampleLessonId = '6a5b4c3d-2e1f-4a0b-9c8d-7e6f5a4b3c2d';
const sampleRule = 'The client prefers headline lettering with solid, crisp edges - avoid any distress texture that erodes letterforms.';

const sampleRejected1 = { id: sampleGenerationId1, card_id: sampleCardId, kind: 'generate', rejection_reason: 'text_wrong', rejection_note: 'Letters are eaten by the grunge texture, unreadable from print distance', reviewed_at: '2026-09-23T14:12:00.000Z', cards: { client_id: sampleClientId, clients: { name: 'Test Client' } } };
const sampleRejected2 = { id: sampleGenerationId2, card_id: sampleCardId, kind: 'edit_text', rejection_reason: 'colour', rejection_note: 'Too much orange, the client palette is cream and forest green', reviewed_at: '2026-09-23T16:40:00.000Z', cards: { client_id: sampleClientId, clients: { name: 'Test Client' } } };
const sampleExistingLesson = { id: sampleLessonId, client_id: sampleClientId, category: 'style_drift', rule: 'Avoid gradients and photorealistic shading for this client.', active: true };
const sampleGroup = { client_id: sampleClientId, client_name: 'Test Client', generation_ids: [sampleGenerationId1, sampleGenerationId2], reasons: { text_wrong: 1, colour: 1 }, notes: ['- [text_wrong] Letters are eaten by the grunge texture, unreadable from print distance', '- [colour] Too much orange, the client palette is cream and forest green'], top_reason: 'text_wrong', rejection_count: 2 };
const sampleDistillBody = { model: 'claude-sonnet-4-6', max_tokens: 1200, system: 'You maintain a small rulebook of design lessons ...', messages: [{ role: 'user', content: 'EXISTING RULEBOOK:\n- id:' + sampleLessonId + ' [client:style_drift] (freq 1) Avoid gradients and photorealistic shading for this client.\n\nNEW REJECTION FEEDBACK:\n- [text_wrong] Letters are eaten by the grunge texture, unreadable from print distance\n- [colour] Too much orange, the client palette is cream and forest green' }] };
const sampleDistillText = '{"updates":[],"new_lessons":[{"scope":"global","niche":null,"text":"' + sampleRule + '"},{"scope":"global","niche":null,"text":"The client prefers the locked palette (cream and forest green) - avoid introducing warm orange accents."}]}';
const sampleDistillResponse = { id: 'msg_01', type: 'message', role: 'assistant', model: 'claude-sonnet-4-6', content: [{ type: 'text', text: sampleDistillText }], stop_reason: 'end_turn', usage: { input_tokens: 620, output_tokens: 140 } };
const sampleRows = [
  { client_id: sampleClientId, category: 'text_wrong', rule: sampleRule, active: false, source_generation_ids: [sampleGenerationId1, sampleGenerationId2] },
  { client_id: sampleClientId, category: 'text_wrong', rule: 'The client prefers the locked palette (cream and forest green) - avoid introducing warm orange accents.', active: false, source_generation_ids: [sampleGenerationId1, sampleGenerationId2] }
];
const sampleParsed = { client_id: sampleClientId, client_name: 'Test Client', rejection_count: 2, rows: sampleRows, rule_count: 2, updates: [], error: '' };
const sampleInserted = { id: '8c7d6e5f-4a3b-4c2d-9e1f-0a9b8c7d6e5f', client_id: sampleClientId, category: 'text_wrong', rule: sampleRule, active: false, source_generation_ids: [sampleGenerationId1, sampleGenerationId2], created_at: '2026-09-24T02:00:05.000Z' };

const lessonsNote = sticky(
  '## DM Studio · WF-7 Lessons (pg_cron 02:00 UTC → /webhook/studio-lessons)\n' +
  'Nightly self-learning pass. The webhook has NO n8n authentication: **Load Config** runs the shared sub-workflow **WF-0 Studio Config** first, then **Secret OK?** compares the request header x-studio-secret with config.studioSecret and drops mismatches into **Rejected** (no-op). pg_cron sends the header, so the IF is the auth.\n\n' +
  '**Config convention:** no n8n credentials except Kie (bound by id). Every URL and key is read as `$(\'Load Config\').first().json.<field>` (sbUrl, anonKey, studioSecret). Supabase REST calls send headers apikey = anonKey and x-studio-secret = studioSecret. **Paste locations:** (1) the WF-0 workflow id into the SDK const `configWorkflowId` (vbyjWhK4ZRN9uZUM) before creating this workflow; (2) keys are pasted ONLY in WF-0\'s "Studio Config" Set node, never here.\n\n' +
  '**Flow:** Get Rejected Generations (rejection_reason not null, reviewed_at > now - 1 day, with cards.client_id + client name) → Group Per Client (one item per client: generation ids, notes, dominant rejection_reason) → Get Distill Templates (prompt_templates slugs **distill_system** / **distill_user**, EXTRACT.md §3.10, never inlined) → Get Existing Lessons (design_lessons, for the EXISTING RULEBOOK block) → Build Distill Request (Anthropic Messages body: model claude-sonnet-4-6, max_tokens 1200, system, one user message) → Kie Claude Distill (POST api.kie.ai/claude/v1/messages, header anthropic-version 2023-06-01, continueRegularOutput, retry 3×/5 s) → Parse Distill (lenient JSON from content[].text, tolerates a data string wrapper; up to 3 new_lessons per client) → Insert Lessons (design_lessons rows: client_id, category = dominant rejection_reason, rule, active=false, source_generation_ids) → Build Digest (summary in the execution log). A lead reviews the proposed rules and turns them on in the app under Settings > Lessons.\n\n' +
  'No rejected generations in the window → the run ends after Get Rejected Generations with nothing to insert.',
  { color: 4, width: 440, height: 860, position: [-500, 40] }
);

const lessonsWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Lessons Webhook',
    parameters: {
      httpMethod: 'POST',
      path: 'studio-lessons',
      responseMode: 'onReceived',
      options: {}
    },
    position: [0, 304]
  },
  output: [{ headers: { 'content-type': 'application/json', 'x-studio-secret': 'redacted' }, params: {}, query: {}, body: { source: 'pg_cron' }, webhookUrl: sampleN8nBaseUrl + '/webhook/studio-lessons', executionMode: 'production' }]
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
          { id: 's1', leftValue: expr("{{ $('Lessons Webhook').first().json.headers?.['x-studio-secret'] ?? '' }}"), operator: { type: 'string', operation: 'equals' }, rightValue: expr("{{ $('Load Config').first().json.studioSecret }}") }
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

const getRejectedGenerations = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Get Rejected Generations',
    parameters: {
      method: 'GET',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/generations?rejection_reason=not.is.null&reviewed_at=gt.{{ encodeURIComponent($now.minus({ days: 1 }).toUTC().toISO()) }}&select=id,card_id,kind,rejection_reason,rejection_note,reviewed_at,cards!generations_card_id_fkey(client_id,clients(name))&order=reviewed_at.desc&limit=200"),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: expr("{{ $('Load Config').first().json.anonKey }}") },
          { name: 'x-studio-secret', value: expr("{{ $('Load Config').first().json.studioSecret }}") }
        ]
      },
      options: { timeout: 20000 }
    },
    executeOnce: true,
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 3000,
    position: [720, 208]
  },
  output: [sampleRejected1, sampleRejected2]
});

const groupPerClient = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Group Per Client',
    parameters: {
      jsCode: "const rows = $input.all().map((i) => i.json).filter((r) => r && r.id && r.cards && r.cards.client_id);\nconst groups = {};\nfor (const r of rows) {\n  const cid = r.cards.client_id;\n  if (!groups[cid]) groups[cid] = { client_id: cid, client_name: (r.cards.clients && r.cards.clients.name) || cid, generation_ids: [], reasons: {}, notes: [] };\n  const g = groups[cid];\n  const reason = String(r.rejection_reason || 'other');\n  g.generation_ids.push(r.id);\n  g.reasons[reason] = (g.reasons[reason] || 0) + 1;\n  g.notes.push('- [' + reason + '] ' + String(r.rejection_note || r.rejection_reason || '').trim().slice(0, 200));\n}\nreturn Object.values(groups).map((g) => {\n  const top = Object.entries(g.reasons).sort((a, b) => b[1] - a[1])[0];\n  return { json: Object.assign(g, { top_reason: top ? top[0] : 'other', rejection_count: g.generation_ids.length }) };\n});"
    },
    position: [960, 208]
  },
  output: [sampleGroup]
});

const getDistillTemplates = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Get Distill Templates',
    parameters: {
      method: 'GET',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/prompt_templates?slug=in.(distill_system,distill_user)&active=is.true&select=slug,version,body&order=version.desc"),
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
    position: [1200, 208]
  },
  output: [{ slug: 'distill_system', version: 1, body: 'You maintain a small rulebook of design lessons for an AI print-on-demand design engine, learned from client rejection feedback. ... Return ONLY this JSON, no markdown: {"updates":[{"id":"<existing lesson id>","freq":3}],"new_lessons":[{"scope":"global","niche":null,"text":"..."}]}' }, { slug: 'distill_user', version: 1, body: 'EXISTING RULEBOOK:\n- id:{{LESSON_ID}} [global] (freq 2) {{EXISTING_LESSON_TEXT}}\n\nNEW REJECTION FEEDBACK:\n- [{{NICHE}}] {{REJECTION_FEEDBACK}}' }]
});

const getExistingLessons = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Get Existing Lessons',
    parameters: {
      method: 'GET',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/design_lessons?select=id,client_id,category,rule,active&order=created_at.desc&limit=300"),
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
    position: [1440, 208]
  },
  output: [sampleExistingLesson]
});

const buildDistillRequest = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build Distill Request',
    parameters: {
      jsCode: "const groups = $('Group Per Client').all().map((i) => i.json);\nconst tpls = $('Get Distill Templates').all().map((i) => i.json);\nconst lessons = $('Get Existing Lessons').all().map((i) => i.json).filter((l) => l && l.id && l.rule);\nconst sys = tpls.find((t) => t.slug === 'distill_system');\nconst usr = tpls.find((t) => t.slug === 'distill_user');\nif (!sys || !sys.body || !usr || !usr.body) throw new Error('prompt_templates: no active distill_system / distill_user template');\nreturn groups.map((g) => {\n  const mine = lessons.filter((l) => !l.client_id || l.client_id === g.client_id);\n  const existing = mine.length ? mine.map((l) => '- id:' + l.id + ' [' + (l.client_id ? 'client:' + (l.category || 'general') : 'global') + '] (freq 1) ' + String(l.rule).trim()).join('\\n') : '(none yet)';\n  const user = String(usr.body).replace(/^- id:\\{\\{LESSON_ID\\}\\}.*$/m, existing).replace(/^- \\[\\{\\{NICHE\\}\\}\\].*$/m, g.notes.join('\\n'));\n  const body = { model: 'claude-sonnet-4-6', max_tokens: 1200, system: String(sys.body), messages: [{ role: 'user', content: user }] };\n  return { json: Object.assign({}, g, { body, template_versions: { distill_system: sys.version, distill_user: usr.version } }) };\n});"
    },
    onError: 'continueErrorOutput',
    position: [1680, 208]
  },
  output: [{ ...sampleGroup, body: sampleDistillBody, template_versions: { distill_system: 1, distill_user: 1 } }]
});

const kieClaudeDistill = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Kie Claude Distill',
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
      jsonBody: expr('{{ JSON.stringify($json.body) }}'),
      options: { timeout: 120000 }
    },
    credentials: { httpHeaderAuth: kieClaudeCredential },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 5000,
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [1920, 208]
  },
  output: [sampleDistillResponse]
});

const parseDistill = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Parse Distill',
    parameters: {
      mode: 'runOnceForEachItem',
      jsCode: "const g = $('Build Distill Request').item.json;\nlet payload = $json || {};\nif (typeof payload.data === 'string') { try { payload = JSON.parse(payload.data); } catch (e) { payload = $json; } }\nconst txt = Array.isArray(payload.content) ? payload.content.filter((c) => c && c.type === 'text').map((c) => c.text).join('\\n') : String(payload.text || payload.output_text || '');\nlet parsed = null;\ntry { const m = txt.replace(/```(?:json)?/g, '').match(/\\{[\\s\\S]*\\}/); parsed = m ? JSON.parse(m[0]) : null; } catch (e) { parsed = null; }\nconst proposed = parsed && Array.isArray(parsed.new_lessons) ? parsed.new_lessons : [];\nconst rows = proposed.map((l) => String((l && l.text) || '').trim()).filter(Boolean).slice(0, 3).map((rule) => ({ client_id: g.client_id, category: g.top_reason || 'other', rule: rule.slice(0, 220), active: false, source_generation_ids: g.generation_ids }));\nconst error = parsed ? '' : ('distill reply was not JSON' + (payload.error ? ': ' + String(payload.error.message || payload.error).slice(0, 200) : ''));\nreturn { json: { client_id: g.client_id, client_name: g.client_name, rejection_count: g.rejection_count, rows, rule_count: rows.length, updates: parsed && Array.isArray(parsed.updates) ? parsed.updates.slice(0, 20) : [], error } };"
    },
    position: [2160, 208]
  },
  output: [sampleParsed]
});

const insertLessons = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Insert Lessons',
    parameters: {
      method: 'POST',
      url: expr("{{ $('Load Config').first().json.sbUrl }}/rest/v1/design_lessons"),
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
      jsonBody: expr('{{ JSON.stringify($json.rows ?? []) }}'),
      options: { timeout: 20000 }
    },
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 3000,
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [2400, 208]
  },
  output: [sampleInserted]
});

const buildDigest = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build Digest',
    parameters: {
      jsCode: "const parsed = $('Parse Distill').all().map((i) => i.json);\nconst inserted = $('Insert Lessons').all().map((i) => i.json).filter((r) => r && r.id && r.rule);\nconst total = parsed.reduce((n, p) => n + (Number(p.rule_count) || 0), 0);\nconst lines = parsed.map((p) => {\n  const head = '• *' + p.client_name + '* — ' + p.rejection_count + ' rejection(s) → ' + p.rule_count + ' proposed rule(s)' + (p.error ? ' ⚠ ' + p.error : '');\n  const rules = (p.rows || []).map((r) => '    ◦ [' + r.category + '] ' + r.rule).join('\\n');\n  return rules ? head + '\\n' + rules : head;\n});\nconst text = ':mortar_board: *DM Studio lessons digest* — ' + parsed.length + ' client(s), ' + total + ' proposed rule(s), ' + inserted.length + ' inserted (inactive until a lead approves them in the app)\\n' + lines.join('\\n');\nreturn [{ json: { text, clients: parsed.length, proposed: total, inserted: inserted.length } }];"
    },
    position: [2640, 208]
  },
  output: [{ text: ':mortar_board: *DM Studio lessons digest* — 1 client(s), 2 proposed rule(s), 2 inserted (inactive until a lead approves them in the app)\n• *Test Client* — 2 rejection(s) → 2 proposed rule(s)\n    ◦ [text_wrong] ' + sampleRule, clients: 1, proposed: 2, inserted: 2 }]
});


const distillFailed = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Distill Skipped',
    parameters: {
      mode: 'manual',
      assignments: {
        assignments: [
          { id: 'f1', name: 'skipped', type: 'boolean', value: true },
          { id: 'f2', name: 'reason', type: 'string', value: 'distill request could not be built (see the Build Distill Request error output)' }
        ]
      },
      includeOtherFields: false,
      options: {}
    },
    position: [1920, 400]
  },
  output: [{ skipped: true, reason: 'distill request could not be built (see the Build Distill Request error output)' }]
});

export default workflow('dm-studio-wf7-lessons', 'DM Studio · WF-7 Lessons')
  .add(lessonsNote)
  .add(lessonsWebhook)
  .to(loadConfig)
  .to(secretOk.onTrue(getRejectedGenerations).onFalse(rejected))
  .add(getRejectedGenerations)
  .to(groupPerClient)
  .to(getDistillTemplates)
  .to(getExistingLessons)
  .to(buildDistillRequest.onError(distillFailed))
  .to(kieClaudeDistill)
  .to(parseDistill)
  .to(insertLessons)
  .to(buildDigest);
