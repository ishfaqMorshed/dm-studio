#!/usr/bin/env node
// Unit test for the WF-8 Brief Parse Code nodes. Parses ../wf8-brief-parse.sdk.js with the real SDK, runs Build Request /
// Parse / Fail Message under mocked n8n globals ($, $input, $json incl. $('Node').isExecuted) against the ACTIVE brief_parser
// body (v2, studio_25b; v1 when v2 is absent) read from supabase/migrations through ./template-from-migrations.js (the inline
// fixture below is the last fallback), checks that v2 keeps the v1 output object and placeholders, and
// asserts the HTTP node contracts (webhook path, rpc brief_parse_update, single-object GET, Kie / OpenRouter twins with
// 120 s timeouts, wiring, no colon in thrown messages, Code nodes <= 20 lines). It also evaluates the SDK file with plain Node
// (stubbed builder) and requires every jsCode / sticky / string parameter to equal what the SDK parser produced: the parser
// pre-scans quotes, and an apostrophe in a builder-level comment once made it turn the escaped newlines inside jsCode into
// real line breaks (a Code node syntax error live). Usage: node test-wf8-parse.js
const fs = require('fs');
const path = require('path');
const { parseWorkflowCodeToBuilder } = require('@n8n/workflow-sdk');
const { templateFromMigrations } = require('./template-from-migrations.js');

const raw = fs.readFileSync(path.resolve(__dirname, '..', 'wf8-brief-parse.sdk.js'), 'utf8').split('\n').filter((l) => !/^\s*import\s.*from\s+['"]@n8n\/workflow-sdk['"]/.test(l)).join('\n');
const wf = parseWorkflowCodeToBuilder(raw).toJSON();
const nodes = wf.nodes;
const nodeByName = (name) => { const n = nodes.find((x) => x.name === name); if (!n) throw new Error('node not found: ' + name); return n; };
const jsCode = (name) => String(nodeByName(name).parameters.jsCode);

// Plain Node evaluation of the same source with a stubbed builder: records every node config and the sticky text exactly
// as JavaScript itself reads the string literals (the ground truth the SDK parse must match).
function nativeConfigs(source) {
  const captured = [];
  const chain = () => { const px = new Proxy(function () {}, { get: (t, k) => (k === 'then' ? undefined : () => px), apply: () => px }); return px; };
  const rec = (o) => { captured.push(o && o.config ? o.config : o); return chain(); };
  const stub = { workflow: () => chain(), node: rec, trigger: rec, ifElse: rec, switchCase: rec, sticky: (content) => { captured.push({ name: 'sticky', content }); return chain(); }, newCredential: (name, id) => ({ name, id }), expr: (x) => x, placeholder: (x) => x };
  const names = Object.keys(stub);
  new Function(...names, source.replace(/^\s*export default\s+/m, 'return '))(...names.map((n) => stub[n]));
  return captured;
}
const native = nativeConfigs(raw);

const CONTRACT_KEYS = ['niche', 'audience', 'subjects', 'brand_text', 'typography_note', 'palette_mode', 'text_case', 'must_have', 'avoid', 'lock_typography', 'lock_composition', 'default_similarity_tier', 'garment_colors', 'notes', 'notes_for_designer'];
const fixtureBody = 'You extract a print-on-demand client\'s design brief from free text. Client: {{CLIENT_NAME}}.\nSaved brief (JSON or "none"): {{EXISTING_BRIEF}}\nExtract ONLY what the text supports into this JSON (every key present; unknown -> "" / [] / null; never invent subjects; keep the client\'s wording):\n{"niche":"","audience":"","subjects":[],"brand_text":[],"typography_note":"","palette_mode":null,"text_case":null,"must_have":[],"avoid":[],"lock_typography":null,"lock_composition":null,"default_similarity_tier":null,"garment_colors":[],"notes":"","notes_for_designer":[]}\nBRIEF TEXT:\n{{BRIEF_TEXT}}\nReturn ONLY the JSON.';
const migV1 = templateFromMigrations('brief_parser', 1);
const migV2 = templateFromMigrations('brief_parser', 2);
const mig = migV2 || migV1;
const tplVersion = migV2 ? 2 : 1;
const tplBody = mig ? mig.body : fixtureBody;
console.log('brief_parser v' + tplVersion + ' body from ' + (mig ? mig.file : 'inline fixture (no migration inserts it yet)'));

// nodeData[name] = array of output items (executed) | null (not executed in this run)
function run(code, nodeData, inputItems) {
  const items = (arr) => arr.map((json) => ({ json }));
  const $ = (name) => {
    if (!(name in nodeData)) throw new Error('unmocked node ' + name);
    const arr = nodeData[name];
    const executed = Array.isArray(arr);
    return { isExecuted: executed, first: () => { if (!executed || !arr.length) throw new Error('no output for ' + name); return { json: arr[0] }; }, all: () => items(executed ? arr : []) };
  };
  const $input = { first: () => ({ json: inputItems[0] }), all: () => items(inputItems) };
  return new Function('$', '$input', '$json', code)($, $input, inputItems[0]);
}
const threw = (fn) => { try { fn(); return ''; } catch (e) { return e.message || String(e); } };
let failures = 0;
const check = (cond, msg) => { if (cond) console.log('ok   ' + msg); else { failures++; console.log('FAIL ' + msg); } };
const fill = (body, vars) => String(body).replace(/\{\{\s*([A-Z_]+)\s*\}\}/g, (m, k) => (k in vars ? vars[k] : m));

// ---- SDK parse == plain JavaScript (escaping audit) --------------------------------------------------------------
const nativeByName = (name) => native.find((c) => c && c.name === name);
const auditCodeNodes = nodes.filter((n) => n.type === 'n8n-nodes-base.code');
const codeMismatch = auditCodeNodes.filter((n) => !nativeByName(n.name) || String(nativeByName(n.name).parameters.jsCode) !== String(n.parameters.jsCode)).map((n) => n.name);
check(codeMismatch.length === 0, 'Escaping audit: every jsCode the SDK parser produced equals the plain-JS string literal' + (codeMismatch.length ? ' - MISMATCH in ' + codeMismatch.join(', ') : ''));
for (const n of auditCodeNodes) { let err = ''; try { new Function('$', '$input', '$json', String(n.parameters.jsCode)); } catch (e) { err = e.message; } check(!err, 'Escaping audit: ' + n.name + ' jsCode compiles' + (err ? ' - ' + err : '')); }
const nativeSticky = native.find((c) => c && c.name === 'sticky');
check(nativeSticky && nativeSticky.content === String((nodes.find((n) => n.type === 'n8n-nodes-base.stickyNote') || { parameters: {} }).parameters.content || ''), 'Escaping audit: sticky text equals the plain-JS string');
const strDiffs = [];
const walk = (a, b, at) => { if (typeof b === 'string') { if (a !== b && a !== '=' + b) strDiffs.push(at); return; } if (b && typeof b === 'object') for (const k of Object.keys(b)) walk(a == null ? undefined : a[k], b[k], at + '.' + k); };
for (const n of nodes.filter((x) => x.type !== 'n8n-nodes-base.stickyNote')) { const c = nativeByName(n.name); if (!c) strDiffs.push(n.name + ' (not found natively)'); else walk(n.parameters, c.parameters, n.name); }
check(strDiffs.length === 0, 'Escaping audit: every string parameter of all 18 nodes equals plain JS (expressions with the = prefix)' + (strDiffs.length ? ' - ' + strDiffs.slice(0, 5).join(' | ') : ''));
check(raw.split('\n').filter((l) => /^\s*\/\//.test(l)).every((l) => !/['"`]/.test(l)), 'No quote character in builder-level // comments (the SDK quote scanner would desync)');
if (failures) { console.log('\nescaping audit failed - the Code nodes would not run as written; fix the SDK source before the behaviour checks'); process.exit(1); }

// ---- fixtures ---------------------------------------------------------------------------------------------------
const settings = { ai_platform: 'openrouter', openrouter_models: { vision: 'google/gemini-3.1-pro-preview', text: 'anthropic/claude-sonnet-4.6' } };
const templates = [{ slug: 'brief_parser', version: tplVersion, body: tplBody }];
const text = 'Hi! We sell vintage-style outdoor badges for hikers on Etsy (US). Subjects are Highland cows and chickens. Always put @TrailBadgeCo and EST. 2019 somewhere. Everything in CAPS, chunky slab serif. Must have a circular badge frame and an ink banner across the bottom. No gradients, no photo-realism. Shirts are black and white.';
const savedBrief = { niche: 'farm humour', audience: 'homesteaders', subjects: ['Highland cows'], brand_text: ['@TrailBadgeCo'], palette_mode: 'strict', text_case: 'upper', lock_typography: true, lock_composition: true };
const request = { id: 'req-1', client_id: 'cli-1', text: '  ' + text.replace(/\. /g, '.\r\n') + '\n', clients: { name: 'Trail Badge Co', style_brief: savedBrief } };
const configItem = { requestId: 'req-1', clientId: 'cli-1', executionId: '77' };
const reply = (obj, fenced) => ({ model: 'claude-sonnet-4-6', choices: [{ message: { content: fenced ? '```json\n' + (typeof obj === 'string' ? obj : JSON.stringify(obj)) + '\n```' : (typeof obj === 'string' ? obj : JSON.stringify(obj)) } }] });
// Kie /claude/v1/messages answers in the Claude Messages shape (content[] of text blocks)
const claude = (txt) => ({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-4-6', content: [{ type: 'text', text: txt }], stop_reason: 'end_turn' });

// ---- brief_parser template contract (studio_25 v1 -> studio_25b v2) -----------------------------------------------
const skeleton = (body) => { const m = String(body).match(/\{"niche":[^\n]*\}/); try { return m ? JSON.parse(m[0]) : null; } catch (e) { return null; } };
const shape = (o) => (o ? Object.keys(o).map((k) => k + '=' + (Array.isArray(o[k]) ? '[]' : JSON.stringify(o[k]))).join(',') : 'none');
check(!!migV1 && !!migV2, 'Template: migrations hold brief_parser v1 (studio_25) and v2 (studio_25b)');
if (migV1 && migV2) {
  check(JSON.stringify(Object.keys(skeleton(migV2.body) || {})) === JSON.stringify(CONTRACT_KEYS) && shape(skeleton(migV2.body)) === shape(skeleton(migV1.body)), 'Template: v2 output object = the 15 contract keys with the v1 empty values ("" / [] / null)');
  check(['{{CLIENT_NAME}}', '{{EXISTING_BRIEF}}', '{{BRIEF_TEXT}}'].every((t) => migV2.body.includes(t)) && !/\{\{(?!CLIENT_NAME\}\}|EXISTING_BRIEF\}\}|BRIEF_TEXT\}\})/.test(migV2.body), 'Template: v2 uses exactly the placeholders Build Request fills');
  check(/ADDED to the saved list/.test(migV2.body) && /Saved wording wins/.test(migV2.body) && /return the SAVED entry exactly/.test(migV2.body) && /"photo-real stuff" is "photo-realism"/.test(migV2.body), 'Template: v2 explains the list merge, reuses saved wording and asks for plain design terms');
  check(/never write a note saying the text does not specify something you filled/.test(migV2.body) && /NOT a tier/.test(migV2.body) && /silence keeps the saved value/.test(migV2.body), 'Template: v2 forbids a field and a note that contradict, keeps house style out of the tier, no notes for silence');
  const fixSql = fs.readFileSync(path.resolve(__dirname, '..', '..', 'supabase', 'migrations', migV2.file), 'utf8');
  const retire = fixSql.indexOf("update public.prompt_templates set active = false where slug = 'brief_parser' and version = 1");
  check(retire >= 0 && retire < fixSql.indexOf('insert into public.prompt_templates'), 'Template: studio_25b retires v1 before it writes the active v2 (one active row per slug)');
}

// ---- Build Request (token filling) ----------------------------------------------------------------------------
const br = jsCode('Build Request');
const brNodes = { 'Get Template': templates, 'Get Request': [request], 'Get Settings': [settings] };
const built = run(br, brNodes, [settings]).json;
const normText = text.replace(/\. /g, '.\n');
const expectedSystem = fill(tplBody, { CLIENT_NAME: 'Trail Badge Co', EXISTING_BRIEF: JSON.stringify(savedBrief), BRIEF_TEXT: normText });
check(built.body.messages.length === 2 && built.body.messages[0].role === 'system' && built.body.messages[1].role === 'user', 'Build Request: chat body = one system + one user message');
check(built.body.messages[0].content === expectedSystem, 'Build Request: system = template body with {{CLIENT_NAME}}, {{EXISTING_BRIEF}} (saved brief JSON) and {{BRIEF_TEXT}} filled');
check(built.body.messages[1].content === normText, 'Build Request: user = the pasted text, trimmed, CRLF normalised');
check(!/\{\{[A-Z_]+\}\}/.test(built.body.messages[0].content), 'Build Request: no unrendered tokens');
check(built.body.response_format.type === 'json_object' && built.body.temperature === 0 && built.body.max_tokens === 2000, 'Build Request: response_format json_object, temperature 0, max_tokens 2000');
check(built.model === 'anthropic/claude-sonnet-4.6' && built.template_version === tplVersion && built.client_name === 'Trail Badge Co' && built.text_length === normText.length, 'Build Request: model from settings.openrouter_models.text, template_version ' + tplVersion + ', client_name, text_length');
const noBrief = run(br, { ...brNodes, 'Get Request': [{ ...request, clients: { name: 'Bare', style_brief: {} } }] }, [settings]).json;
check(noBrief.body.messages[0].content === fill(tplBody, { CLIENT_NAME: 'Bare', EXISTING_BRIEF: 'none', BRIEF_TEXT: normText }), 'Build Request: empty saved brief -> {{EXISTING_BRIEF}} = none');
const nullBrief = run(br, { ...brNodes, 'Get Request': [{ ...request, clients: { name: '', style_brief: null } }] }, [settings]).json;
check(nullBrief.body.messages[0].content === fill(tplBody, { CLIENT_NAME: 'the client', EXISTING_BRIEF: 'none', BRIEF_TEXT: normText }), 'Build Request: null saved brief -> none; empty client name -> the client');
const noSettings = run(br, { ...brNodes, 'Get Settings': [{ error: { message: 'boom' } }] }, [{}]).json;
check(noSettings.model === 'anthropic/claude-sonnet-4.6', 'Build Request: settings failure -> default OpenRouter text model');
const noTpl = threw(() => run(br, { ...brNodes, 'Get Template': [{}] }, [settings]));
check(/no active brief_parser template/.test(noTpl) && !/:/.test(noTpl), 'Build Request: no active brief_parser template (empty array -> one empty item) -> throws, no colon');
const shortText = threw(() => run(br, { ...brNodes, 'Get Request': [{ ...request, text: 'too short' }] }, [settings]));
check(/too short/.test(shortText) && !/:/.test(shortText), 'Build Request: text under 20 chars -> throws, no colon');
check(built.kie_body && built.kie_body.model === 'claude-sonnet-4-6' && built.kie_body.system === expectedSystem && built.kie_body.messages.length === 1 && built.kie_body.messages[0].role === 'user' && built.kie_body.messages[0].content === normText && built.kie_body.max_tokens === 2000 && built.kie_body.temperature === 0 && !('response_format' in built.kie_body), 'Build Request: kie_body = Claude Messages body (model claude-sonnet-4-6, same system as top-level field, user = text, no response_format)');
const withSource = run(br, { ...brNodes, 'Get Request': [{ ...request, clients: { name: 'Trail Badge Co', style_brief: { ...savedBrief, source_text: 'OLD PASTE that must not reach the model' } } }] }, [settings]).json;
check(withSource.body.messages[0].content === expectedSystem && !/OLD PASTE/.test(withSource.body.messages[0].content), 'Build Request: saved brief source_text (an earlier paste) is left out of {{EXISTING_BRIEF}}');
const onlySource = run(br, { ...brNodes, 'Get Request': [{ ...request, clients: { name: 'X', style_brief: { source_text: 'old' } } }] }, [settings]).json;
check(onlySource.body.messages[0].content === fill(tplBody, { CLIENT_NAME: 'X', EXISTING_BRIEF: 'none', BRIEF_TEXT: normText }), 'Build Request: a saved brief holding only source_text -> {{EXISTING_BRIEF}} = none');
const dollarText = 'Prices: $& and $1 and $$ stay literal, $` too, in this brief text';
const tokTpl = [{ slug: 'brief_parser', version: 7, body: 'A {{ CLIENT_NAME }} B {{EXISTING_BRIEF}} C {{BRIEF_TEXT}} D {{UNKNOWN_TOKEN}} E {{ BRIEF_TEXT}}' }];
const tok = run(br, { 'Get Template': tokTpl, 'Get Request': [{ ...request, text: dollarText, clients: { name: 'Tok & Co', style_brief: savedBrief } }], 'Get Settings': [settings] }, [settings]).json;
check(tok.body.messages[0].content === 'A Tok & Co B ' + JSON.stringify(savedBrief) + ' C ' + dollarText + ' D {{UNKNOWN_TOKEN}} E ' + dollarText && tok.template_version === 7, 'Build Request: spaced tokens filled, every occurrence filled, unknown token left as is, $& / $1 / $$ in the text stay literal');
check(tok.body.messages[1].content === dollarText, 'Build Request: user message is the text verbatim');
const multi = run(br, { 'Get Template': [{}, { slug: 'other', body: 'x' }, { slug: 'brief_parser', version: 2, body: 'T {{BRIEF_TEXT}}' }], 'Get Request': [request], 'Get Settings': [settings] }, [settings]).json;
check(multi.template_version === 2 && multi.body.messages[0].content === 'T ' + normText, 'Build Request: picks the brief_parser row among other items');
const crOnly = run(br, { ...brNodes, 'Get Request': [{ ...request, text: 'line one is long enough\rline two' }] }, [settings]).json;
check(crOnly.body.messages[1].content === 'line one is long enough\nline two', 'Build Request: lone CR normalised to LF');

// ---- Parse (coercion / enums / caps) -----------------------------------------------------------------------------
const ps = jsCode('Parse');
const psKie = { 'Build Request': [built], 'OpenRouter Parse Brief': null, 'Kie Parse Brief': [{}] };
const psOr = { 'Build Request': [built], 'OpenRouter Parse Brief': [{}], 'Kie Parse Brief': null };
const psAuto = { 'Build Request': [built], 'OpenRouter Parse Brief': [{}], 'Kie Parse Brief': [{}] };
const full = { niche: 'vintage outdoor badges for hikers', audience: 'US, Etsy', subjects: ['Highland cows', 'chickens'], brand_text: ['@TrailBadgeCo', 'EST. 2019'], typography_note: 'chunky slab serif', palette_mode: 'strict', text_case: 'upper', must_have: ['circular badge frame', 'ink banner across the bottom'], avoid: ['gradients', 'photo-realism'], lock_typography: true, lock_composition: false, default_similarity_tier: 3, garment_colors: ['black', 'white'], notes: 'client email of 2026-10-01', notes_for_designer: ['Palette strictness not stated'] };
const ok = run(ps, psKie, [reply(full, true)]).json;
check(JSON.stringify(ok.result) === JSON.stringify(full), 'Parse: fenced JSON -> every value kept as given when it already matches the contract');
check(JSON.stringify(Object.keys(ok.result)) === JSON.stringify(CONTRACT_KEYS), 'Parse: result has exactly the 15 contract keys in contract order');
check(ok.template_version === tplVersion && ok.model === 'claude-sonnet-4-6' && ok.via === 'kie', 'Parse: template_version, model, via = kie');
const empty = run(ps, psOr, [reply({}, false)]).json;
check(JSON.stringify(empty.result) === JSON.stringify({ niche: '', audience: '', subjects: [], brand_text: [], typography_note: '', palette_mode: null, text_case: null, must_have: [], avoid: [], lock_typography: null, lock_composition: null, default_similarity_tier: null, garment_colors: [], notes: '', notes_for_designer: [] }) && empty.via === 'openrouter', 'Parse: {} -> every key present with "" / [] / null defaults; via = openrouter');
const wrong = run(ps, psKie, [reply({ niche: 42, audience: { a: 1 }, subjects: 'Highland cows; chickens\n  ', brand_text: ['@x', '', '  ', null, 7, { bad: true }], typography_note: ['chunky', 'slab'], palette_mode: ' STRICT ', text_case: 'Upper', must_have: 'one', avoid: null, lock_typography: 'true', lock_composition: 'no', default_similarity_tier: '3', garment_colors: 'black; Heather Grey', notes: null, notes_for_designer: 'unsure about tier' }, false)]).json.result;
check(wrong.niche === '42' && wrong.audience === '' && wrong.notes === '', 'Parse: wrong types -> number becomes a string, object becomes ""');
check(JSON.stringify(wrong.subjects) === '["Highland cows","chickens"]' && JSON.stringify(wrong.must_have) === '["one"]' && JSON.stringify(wrong.avoid) === '[]' && JSON.stringify(wrong.notes_for_designer) === '["unsure about tier"]', 'Parse: a string where an array belongs is split on ; / newline, null -> []');
check(JSON.stringify(wrong.brand_text) === '["@x","7"]', 'Parse: empty / blank / null / object array items dropped, numbers stringified');
check(wrong.typography_note === 'chunky; slab', 'Parse: an array where a string belongs is joined with "; "');
check(wrong.palette_mode === 'strict' && wrong.text_case === 'upper', 'Parse: enums trimmed + lower-cased (STRICT -> strict, Upper -> upper)');
check(wrong.lock_typography === true && wrong.lock_composition === null, 'Parse: "true" -> true, "no" -> null');
check(wrong.default_similarity_tier === 3 && JSON.stringify(wrong.garment_colors) === '["black","Heather Grey"]', 'Parse: tier "3" -> 3, garment colours kept as given');
const bad = run(ps, psKie, [reply({ palette_mode: 'loose', text_case: 'camel', lock_typography: 1, default_similarity_tier: 9, subjects: [[1, 2]] }, false)]).json.result;
check(bad.palette_mode === null && bad.text_case === null && bad.lock_typography === null && bad.default_similarity_tier === null, 'Parse: invalid enum / 1 / tier 9 -> null');
check(JSON.stringify(bad.subjects) === '["1; 2"]', 'Parse: nested array item -> joined string');
const tiers = [0, 1, 5, 6, 2.5, 'x', null].map((t) => run(ps, psKie, [reply({ default_similarity_tier: t }, false)]).json.result.default_similarity_tier);
check(JSON.stringify(tiers) === '[null,1,5,null,null,null,null]', 'Parse: default_similarity_tier accepts integers 1..5 only');
const big = run(ps, psKie, [reply({ subjects: Array.from({ length: 25 }, (_, i) => 'subject ' + i), niche: 'n'.repeat(500), avoid: ['a'.repeat(500)] }, true)]).json.result;
check(big.subjects.length === 20 && big.subjects[19] === 'subject 19' && big.niche.length === 400 && big.avoid[0].length === 400, 'Parse: arrays capped at 20 items, strings at 400 chars (also inside arrays)');
const kieMsg = run(ps, psKie, [claude('```json\n' + JSON.stringify(full) + '\n```')]).json;
check(JSON.stringify(kieMsg.result) === JSON.stringify(full) && kieMsg.via === 'kie' && kieMsg.model === 'claude-sonnet-4-6', 'Parse: Kie Claude Messages reply (content[] text block, fenced) -> same result, via = kie');
const split = run(ps, psKie, [{ model: 'claude-sonnet-4-6', content: [{ type: 'text', text: '{"niche":"badges",' }, { type: 'tool_use', id: 'x' }, { type: 'text', text: '"subjects":["cows"]}' }] }]).json.result;
check(split.niche === 'badges' && JSON.stringify(split.subjects) === '["cows"]', 'Parse: several Claude text blocks are joined, non-text blocks ignored');
const wrapped = run(ps, psKie, [{ data: JSON.stringify(claude(JSON.stringify({ niche: 'wrapped' }))) }]).json.result;
check(wrapped.niche === 'wrapped', 'Parse: a reply delivered as a JSON string in data is unwrapped');
const bareFence = run(ps, psKie, [reply('```\n' + JSON.stringify({ niche: 'bare fence' }) + '\n```', false)]).json.result;
const upperFence = run(ps, psKie, [reply('```JSON\n' + JSON.stringify({ niche: 'upper fence' }) + '\n```', false)]).json.result;
check(bareFence.niche === 'bare fence' && upperFence.niche === 'upper fence', 'Parse: fences without a language tag or with JSON in capitals are stripped');
const invented = run(ps, psKie, [reply({ ...full, brand_colors: ['#000'], style_card_id: 'x', __proto__extra: 1, rules: { a: 1 }, notes_for_client: ['hi'] }, true)]).json.result;
check(JSON.stringify(Object.keys(invented)) === JSON.stringify(CONTRACT_KEYS) && JSON.stringify(invented) === JSON.stringify(full), 'Parse: invented keys (brand_colors, style_card_id, rules, notes_for_client ...) are dropped, contract keys unchanged');
const protoReply = run(ps, psKie, [reply('{"__proto__":{"niche":"polluted"},"constructor":{"x":1},"subjects":["cows"]}', false)]).json.result;
check(protoReply.niche === '' && JSON.stringify(Object.keys(protoReply)) === JSON.stringify(CONTRACT_KEYS) && ({}).niche === undefined, 'Parse: __proto__ / constructor keys in the reply change nothing');
const dupes = run(ps, psKie, [reply({ subjects: ['cows', 'cows', ' cows ', 'Cows', ''], avoid: 'gradients; gradients;;' }, false)]).json.result;
check(JSON.stringify(dupes.subjects) === '["cows","Cows"]' && JSON.stringify(dupes.avoid) === '["gradients"]', 'Parse: exact duplicate list entries (after trim) collapse, blanks dropped, case kept');
const enumCases = [['strict', 'strict'], ['FLEXIBLE', 'flexible'], [' flexible ', 'flexible'], ['loose', null], ['', null], [null, null], [1, null], [['strict'], null], [true, null]].map(([v, want]) => run(ps, psKie, [reply({ palette_mode: v }, false)]).json.result.palette_mode === want);
check(enumCases.every(Boolean), 'Parse: palette_mode enum strict | flexible | null, anything else (loose, "", 1, array, true) -> null');
const caseCases = [['as_typed', 'as_typed'], ['UPPER', 'upper'], ['Title', 'title'], ['lower', null], ['as typed', null], ['caps', null], [false, null]].map(([v, want]) => run(ps, psKie, [reply({ text_case: v }, false)]).json.result.text_case === want);
check(caseCases.every(Boolean), 'Parse: text_case enum as_typed | upper | title | null, anything else (lower, "as typed", caps, false) -> null');
const boolCases = [[true, true], [false, false], ['TRUE', true], [' false ', false], ['yes', null], [0, null], [1, null], [null, null], [[true], null]].map(([v, want]) => run(ps, psKie, [reply({ lock_composition: v }, false)]).json.result.lock_composition === want);
check(boolCases.every(Boolean), 'Parse: locks true | false | null ("TRUE" / " false " accepted, yes / 0 / 1 / [true] -> null)');
const tierOdd = [true, false, [3], '', ' 4 ', '4.0', 4.0].map((t) => run(ps, psKie, [reply({ default_similarity_tier: t }, false)]).json.result.default_similarity_tier);
check(JSON.stringify(tierOdd) === '[null,null,null,null,4,4,4]', 'Parse: tier true / false / [3] / "" -> null (no Number(true) = 1 slip), " 4 " / "4.0" / 4.0 -> 4');
const bigArr = run(ps, psKie, [reply({ must_have: Array.from({ length: 50 }, (_, i) => 'rule ' + i + ' ' + 'x'.repeat(450)), notes_for_designer: 'a\nb\nc', typography_note: Array.from({ length: 30 }, () => 'slab serif').join(' ') + ' '.repeat(10) + 'y'.repeat(400) }, false)]).json.result;
check(bigArr.must_have.length === 20 && bigArr.must_have.every((x) => x.length === 400) && bigArr.typography_note.length === 400 && JSON.stringify(bigArr.notes_for_designer) === '["a","b","c"]', 'Parse: 50 oversize list items -> 20 items of 400 chars; long string -> 400 chars; newline-separated string -> list');
const prose = run(ps, psKie, [reply('Here is the brief: {"niche":"badges","subjects":["cows"]} - hope it helps', false)]).json.result;
check(prose.niche === 'badges' && JSON.stringify(prose.subjects) === '["cows"]', 'Parse: JSON embedded in prose is extracted');
const noJson = threw(() => run(ps, psKie, [reply('Sorry, I cannot: no brief found.', false)]));
check(/^brief parser returned no JSON - reply was /.test(noJson) && !/:/.test(noJson), 'Parse: prose without JSON -> throws, colons in the echoed reply replaced');
const arrReply = threw(() => run(ps, psKie, [reply('[1,2]', false)]));
check(/returned no JSON|returned no object/.test(arrReply) && !/:/.test(arrReply), 'Parse: non-object JSON -> throws, no colon');
const kieErr = threw(() => run(ps, psKie, [{ error: { message: 'Kie: 502 upstream busy', status: 502 } }]));
check(kieErr === 'Text model unavailable (Kie error 502 - Kie - 502 upstream busy). Nothing was changed; try again in a few minutes.', 'Parse: Kie vendor error -> readable message naming the lane and code, no colon');
const kieEnvelope = threw(() => run(ps, psKie, [{ code: 500, msg: 'upstream: timeout' }]));
check(kieEnvelope === 'Text model unavailable (Kie error 500 - upstream - timeout). Nothing was changed; try again in a few minutes.', 'Parse: Kie {code, msg} envelope -> readable message, no colon');
const orErr = threw(() => run(ps, psOr, [{ error: { message: '401 - "{\\"error\\":{\\"message\\":\\"No auth credentials found\\",\\"code\\":401}}"', status: 401 } }]));
check(orErr === 'Text model unavailable (OpenRouter error 401 - OpenRouter API key missing or invalid - add it in n8n WF-0 Studio Config (OpenRouter Config node)). Nothing was changed; try again in a few minutes.', 'Parse: OpenRouter 401 -> key hint naming WF-0');
const orInner = threw(() => run(ps, psOr, [{ error: { message: '400 - "{\\"error\\":{\\"message\\":\\"response_format is not supported: use json_schema\\",\\"code\\":400}}"', status: 400 } }]));
check(orInner === 'Text model unavailable (OpenRouter error 400 - response_format is not supported - use json_schema). Nothing was changed; try again in a few minutes.', 'Parse: OpenRouter error body -> inner message extracted, colons replaced');
const autoErr = threw(() => run(ps, psAuto, [{ error: 'ECONNRESET' }]));
check(autoErr === 'Text model unavailable (Kie and OpenRouter error ? - ECONNRESET). Nothing was changed; try again in a few minutes.', 'Parse: Auto lane (both executed) -> names both lanes; string error passthrough');
const noReply = threw(() => run(ps, psKie, [{}]));
check(/^Text model unavailable \(Kie error \? - no reply\)/.test(noReply), 'Parse: empty item -> no reply');
const claudeErr = threw(() => run(ps, psKie, [{ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded: retry later' } }]));
check(claudeErr === 'Text model unavailable (Kie error ? - Overloaded - retry later). Nothing was changed; try again in a few minutes.', 'Parse: Claude Messages error body {type error, error{message}} -> readable message, no colon');
const leadCode = threw(() => run(ps, psOr, [{ error: { message: '502 - "Bad gateway: upstream"', name: 'NodeApiError' } }]));
check(leadCode === 'Text model unavailable (OpenRouter error 502 - 502 - "Bad gateway - upstream"). Nothing was changed; try again in a few minutes.', 'Parse: n8n HTTP error without status -> code read from the leading 3 digits of the message');
const colonCode = threw(() => run(ps, psKie, [{ error: { message: 'connect ECONNREFUSED 1.2.3.4:443', code: 'ECONNREFUSED:443' } }]));
check(!/:/.test(colonCode) && /ECONNREFUSED - 443/.test(colonCode), 'Parse: colons in the error code itself are replaced too');
const nullContent = threw(() => run(ps, psOr, [{ choices: [{ message: { content: null, refusal: 'no' } }] }]));
check(/^Text model unavailable \(OpenRouter error \? - no reply\)/.test(nullContent), 'Parse: choices with null content -> treated as no reply, not a crash');
const longWhy = threw(() => run(ps, psKie, [{ msg: 'x:'.repeat(400), code: 503 }]));
check(longWhy.length < 260 && !/:/.test(longWhy) && /^Text model unavailable \(Kie error 503 - /.test(longWhy), 'Parse: very long vendor text is cut to 160 chars, no colon');
const vendorMsgs = [kieErr, kieEnvelope, orErr, orInner, autoErr, noReply, claudeErr, leadCode, colonCode, nullContent, longWhy];
check(vendorMsgs.every((m2) => m2 && !/:/.test(m2) && /Nothing was changed; try again in a few minutes\.$/.test(m2)), 'Parse: every vendor error message (' + vendorMsgs.length + ' shapes) is readable, ends with the retry hint and has no ":"');

// ---- Fail Message ------------------------------------------------------------------------------------------------
const fm = jsCode('Fail Message');
const fmCode = run(fm, { Config: [configItem] }, [{ error: 'brief parser returned no object' }]).json;
check(fmCode.message === 'brief parser returned no object' && fmCode.requestId === 'req-1' && fmCode.clientId === 'cli-1', 'Fail Message: Code node error string -> message + request / client ids');
const fmHttp = run(fm, { Config: [configItem] }, [{ error: { message: '406 - {"code":"PGRST116","details":"The result contains 0 rows"}', description: 'x' } }]).json;
check(fmHttp.message.startsWith('406 - {"code":"PGRST116"'), 'Fail Message: HTTP node error object -> error.message');
const fmDefault = run(fm, { Config: [configItem] }, [{}]).json;
check(fmDefault.message === 'brief parse failed', 'Fail Message: nothing recognisable -> brief parse failed');
check(run(fm, { Config: [configItem] }, [{ message: 'x'.repeat(900) }]).json.message.length === 500, 'Fail Message: capped at 500 chars');

// ---- HTTP node contracts, settings and wiring -------------------------------------------------------------------
const p = (name) => nodeByName(name).parameters;
const s = (name) => nodeByName(name);
const hdr = (name, key) => ((p(name).headerParameters || {}).parameters || []).find((h) => h.name === key);
check(p('Brief Parse Webhook').path === 'studio-brief-parse' && p('Brief Parse Webhook').httpMethod === 'POST' && p('Brief Parse Webhook').responseMode === 'onReceived', 'Webhook: POST /webhook/studio-brief-parse, responds on receipt');
check(p('Load Config').workflowId.value === 'vbyjWhK4ZRN9uZUM' && s('Load Config').executeOnce === true && p('Load Config').mode === 'once', 'Load Config: WF-0 vbyjWhK4ZRN9uZUM, once');
const sec = p('Secret OK?').conditions.conditions[0];
check(/Brief Parse Webhook'\)\.first\(\)\.json\.headers\?\.\['x-studio-secret'\]/.test(String(sec.leftValue)) && /studioSecret/.test(String(sec.rightValue)), 'Secret OK?: webhook x-studio-secret header vs config.studioSecret');
for (const n of ['Request → working', 'Request → done', 'Request → failed']) check(p(n).method === 'POST' && /\/rest\/v1\/rpc\/brief_parse_update$/.test(String(p(n).url)) && hdr(n, 'apikey') && hdr(n, 'x-studio-secret') && /p_request_id: \$\('Config'\)\.first\(\)\.json\.requestId/.test(String(p(n).jsonBody)) && /p_execution_id/.test(String(p(n).jsonBody)), n + ': rpc brief_parse_update with apikey + x-studio-secret, p_request_id + p_execution_id');
check(/p_status: 'working'/.test(String(p('Request → working').jsonBody)) && /p_status: 'done', p_result: \$json\.result/.test(String(p('Request → done').jsonBody)) && /p_status: 'failed', p_error: String\(\$json\.message/.test(String(p('Request → failed').jsonBody)), 'Request → working / done / failed: p_status + p_result / p_error');
check(/\/rest\/v1\/brief_parse_requests\?id=eq\.\{\{ \$\('Config'\)\.first\(\)\.json\.requestId \}\}&select=id,client_id,text,clients\(name,style_brief\)$/.test(String(p('Get Request').url)) && hdr('Get Request', 'Accept').value === 'application/vnd.pgrst.object+json' && p('Get Request').options.response.response.responseFormat === 'json', 'Get Request: single-object GET (Accept vnd.pgrst.object+json + responseFormat json) with clients(name,style_brief)');
check(/\/rest\/v1\/settings\?select=ai_platform,openrouter_models&limit=1$/.test(String(p('Get Settings').url)) && hdr('Get Settings', 'Accept').value === 'application/vnd.pgrst.object+json' && p('Get Settings').options.response.response.responseFormat === 'json' && s('Get Settings').alwaysOutputData === true && s('Get Settings').onError === 'continueRegularOutput', 'Get Settings: ai_platform + openrouter_models (settings has no text_model column), never stops the run');
check(/prompt_templates\?slug=eq\.brief_parser&active=is\.true&select=slug,version,body&order=version\.desc&limit=1$/.test(String(p('Get Template').url)) && !hdr('Get Template', 'Accept') && s('Get Template').alwaysOutputData === true && s('Get Template').onError === 'continueErrorOutput', 'Get Template: active brief_parser row, array response + alwaysOutputData so a missing template reaches Build Request');
check(p('Kie Parse Brief').url === 'https://api.kie.ai/claude/v1/messages' && p('Kie Parse Brief').authentication === 'genericCredentialType' && p('Kie Parse Brief').genericAuthType === 'httpHeaderAuth' && s('Kie Parse Brief').credentials && s('Kie Parse Brief').credentials.httpHeaderAuth && s('Kie Parse Brief').credentials.httpHeaderAuth.id === 'w0sDpl2nll4HkF6h' && hdr('Kie Parse Brief', 'anthropic-version').value === '2023-06-01' && /Build Request'\)\.first\(\)\.json\.kie_body/.test(String(p('Kie Parse Brief').jsonBody)), 'Kie Parse Brief: Kie /claude/v1/messages (the WF-7 Distill endpoint) + anthropic-version, WF-7 Kie credential w0sDpl2nll4HkF6h, kie_body from Build Request');
check(p('OpenRouter Parse Brief').url === 'https://openrouter.ai/api/v1/chat/completions' && /openrouterKey/.test(hdr('OpenRouter Parse Brief', 'Authorization').value) && /Build Request'\)\.first\(\)\.json\.body/.test(String(p('OpenRouter Parse Brief').jsonBody)) && /model: \$\('Build Request'\)\.first\(\)\.json\.model/.test(String(p('OpenRouter Parse Brief').jsonBody)) && !s('OpenRouter Parse Brief').credentials, 'OpenRouter Parse Brief: chat/completions with the WF-0 key, same body + model from settings.openrouter_models.text, no credential');
for (const n of ['Kie Parse Brief', 'OpenRouter Parse Brief']) check(p(n).options.timeout === 120000 && s(n).onError === 'continueRegularOutput' && s(n).alwaysOutputData === true && s(n).retryOnFail === true && s(n).maxTries === 2, n + ': timeout 120000, 2 tries, failures flow on as items');
const sw = p('Text Platform?').rules.values;
check(sw.length === 2 && sw[0].outputKey === 'Kie' && sw[0].conditions.conditions[0].operator.operation === 'notEquals' && sw[0].conditions.conditions[0].rightValue === 'openrouter' && sw[1].outputKey === 'OpenRouter' && sw[1].conditions.conditions[0].rightValue === 'openrouter' && /Get Settings'\)\.first\(\)\.json\.ai_platform \|\| 'kie'/.test(String(sw[0].conditions.conditions[0].leftValue)), 'Text Platform?: Kie (anything but openrouter, incl. auto) | OpenRouter');
const down = p('Kie Parse Down?').conditions.conditions;
check(down.length === 2 && down[0].rightValue === 'auto' && /\(Array\.isArray\(\$json\.content\) \|\| \$json\.choices\) \? 'up' : 'down'/.test(String(down[1].leftValue)) && down[1].rightValue === 'down' && p('Kie Parse Down?').conditions.combinator === 'and', 'Kie Parse Down?: ai_platform auto AND no Claude content[] (nor choices) -> OpenRouter fallback');
const conns = wf.connections;
const edge = (from, idx, to) => Boolean(((conns[from] || {}).main || [])[idx] && conns[from].main[idx].some((c) => c.node === to));
check(edge('Brief Parse Webhook', 0, 'Load Config') && edge('Load Config', 0, 'Secret OK?') && edge('Secret OK?', 0, 'Config') && edge('Secret OK?', 1, 'Rejected') && edge('Config', 0, 'Request → working') && edge('Request → working', 0, 'Get Request') && edge('Get Request', 0, 'Get Settings') && edge('Get Settings', 0, 'Get Template') && edge('Get Template', 0, 'Build Request') && edge('Build Request', 0, 'Text Platform?'), 'Wiring: webhook -> Load Config -> Secret OK? -> Config -> working -> Get Request -> Get Settings -> Get Template -> Build Request -> Text Platform?');
check(edge('Text Platform?', 0, 'Kie Parse Brief') && edge('Text Platform?', 1, 'OpenRouter Parse Brief') && edge('Kie Parse Brief', 0, 'Kie Parse Down?') && edge('Kie Parse Down?', 0, 'OpenRouter Parse Brief') && edge('Kie Parse Down?', 1, 'Parse') && edge('OpenRouter Parse Brief', 0, 'Parse') && edge('Parse', 0, 'Request → done'), 'Wiring: Text Platform? / Kie Parse Down? / OpenRouter Parse Brief -> every outcome reaches Parse, then Request → done');
for (const n of ['Get Request', 'Get Template', 'Build Request', 'Parse']) check(edge(n, 1, 'Fail Message'), n + ': error output -> Fail Message');
check(edge('Fail Message', 0, 'Request → failed') && !edge('Request → done', 0, 'Request → failed') && !((conns['Request → failed'] || {}).main || []).some((g) => g && g.length), 'Wiring: Fail Message -> Request → failed, both status writes are terminal');
const codeNodes = nodes.filter((n) => n.type === 'n8n-nodes-base.code');
const colonThrows = [];
for (const n of codeNodes) { const code = String(n.parameters.jsCode); const re = /throw new Error\(([\s\S]*?)\);/g; let m; while ((m = re.exec(code))) { const lits = m[1].match(/'([^']*)'/g) || []; if (lits.some((l) => l.includes(':'))) colonThrows.push(n.name + ' -> ' + m[1].slice(0, 60)); } }
check(colonThrows.length === 0, 'No thrown message literal contains ":" (n8n keeps only the text after the last colon)' + (colonThrows.length ? ' - ' + colonThrows.join(' | ') : ''));
check(codeNodes.length === 3 && codeNodes.every((n) => String(n.parameters.jsCode).split('\n').length <= 20), 'Three Code nodes (Build Request, Parse, Fail Message), each 20 lines or fewer');
check(!/=>/.test(raw.split('\n').filter((l) => !/jsCode:/.test(l)).join('\n')), 'No arrow functions at the builder level (only inside jsCode strings)');
check(nodes.filter((n) => n.type !== 'n8n-nodes-base.stickyNote').length === 18, '18 functional nodes');
const stickyText = String((nodes.find((n) => n.type === 'n8n-nodes-base.stickyNote') || { parameters: {} }).parameters.content || '');
check(/studio-brief-parse/.test(stickyText) && /brief_parser/.test(stickyText) && /brief_parse_update/.test(stickyText) && /EXISTING_BRIEF/.test(stickyText) && /Kie Parse Down\?/.test(stickyText), 'Sticky note documents the webhook, template, RPC, tokens and the Auto fallback');

check(/claude\/v1\/messages/.test(stickyText) && /invented keys dropped/.test(stickyText), 'Sticky note names the Kie Claude Messages endpoint and the dropped invented keys');

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
