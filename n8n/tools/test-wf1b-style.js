#!/usr/bin/env node
// Unit test for the WF-1b Code nodes (Style Card v2: two-pass profiler + validator + one repair).
// Parses ../wf1b-style-draft.sdk.js with the real SDK, runs every Code node's jsCode under mocked n8n globals
// ($, $input, $json, incl. $('Node').isExecuted) against the VERBATIM style_sheet v1 / style_profiler v3 bodies read from
// supabase/migrations through ./template-from-migrations.js (fixtures/stylecard-v2-templates.js = spec section 1.4 is the
// fallback and must stay byte-identical - checked), and asserts the HTTP node contracts (style-card-check URL,
// PATCH on style_draft_requests, 240 s vision timeouts, wiring). Usage: node test-wf1b-style.js
const fs = require('fs');
const path = require('path');
const { parseWorkflowCodeToBuilder } = require('@n8n/workflow-sdk');

const raw = fs.readFileSync(path.resolve(__dirname, '..', 'wf1b-style-draft.sdk.js'), 'utf8').split('\n').filter((l) => !/^\s*import\s.*from\s+['"]@n8n\/workflow-sdk['"]/.test(l)).join('\n');
const wf = parseWorkflowCodeToBuilder(raw).toJSON();
const nodes = wf.nodes;
const nodeByName = (name) => { const n = nodes.find((x) => x.name === name); if (!n) throw new Error('node not found: ' + name); return n; };
const jsCode = (name) => String(nodeByName(name).parameters.jsCode);
const T = require('./fixtures/stylecard-v2-templates.js');
const { templateFromMigrations } = require('./template-from-migrations.js');
const migTpl = (slug, version, fixtureBody) => { const m = templateFromMigrations(slug, version); console.log(slug + ' v' + version + ' body from ' + (m ? m.file : 'fixtures/stylecard-v2-templates.js (no migration inserts it)')); return { body: m ? m.body : fixtureBody, migration: m }; };
const sheetTpl = migTpl('style_sheet', 1, T.style_sheet.body), profilerTpl = migTpl('style_profiler', 3, T.style_profiler.body);

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

// ---- fixtures ---------------------------------------------------------------------------------------------------
const cfg = { sbUrl: 'https://voatrqhfsdfjomyajovi.supabase.co', anonKey: 'redacted', studioSecret: 'redacted', openrouterKey: 'redacted' };
const configItem = { requestId: 'req-1', clientId: 'cli-1', executionId: '77' };
const settings = { max_style_refs: 16, vision_model: 'gemini-3.1-pro', ai_platform: 'kie', openrouter_models: { vision: 'google/gemini-3.1-pro-preview', text: 'anthropic/claude-sonnet-4.6' } };
const templates = [{ slug: 'style_profiler', version: 3, body: profilerTpl.body }, { slug: 'style_sheet', version: 1, body: sheetTpl.body }];
check(!sheetTpl.migration || sheetTpl.migration.body === T.style_sheet.body, 'fixture style_sheet v1 is byte-identical to the migration body' + (sheetTpl.migration ? ' in ' + sheetTpl.migration.file : ' (no migration yet)') + ' - update fixtures/stylecard-v2-templates.js when the migration changes');
check(!profilerTpl.migration || profilerTpl.migration.body === T.style_profiler.body, 'fixture style_profiler v3 is byte-identical to the migration body' + (profilerTpl.migration ? ' in ' + profilerTpl.migration.file : ' (no migration yet)'));
const refs = [
  { id: 'r1', path: 'cli-1/library/a.png', note: 'bestseller 2025', meta: { kind: 'mockup', garment: 'black', best_for: ['lettering', 'layout'], outlier: false } },
  { id: 'r2', path: 'cli-1/library/b.png', note: null, meta: {} },
  { id: 'r3', path: 'cli-1/library/c.png', note: 'old logo', meta: { kind: 'draft', outlier: true } }
];
const signed = refs.map((r) => ({ signedURL: '/object/sign/refs/' + r.path + '?token=t' }));
const brief = { niche: 'farm humour', audience: 'homesteaders', subjects: ['Highland cows', 'chickens'], brand_text: ['@TheHappyHourFarm', 'EST. 2019'], typography_note: 'chunky slab serif', must_have: 'thick outer keyline\nhalftone', avoid: ['gradients'], palette_mode: 'flexible', text_case: 'upper', lock_typography: false, lock_composition: true };
const client = { id: 'cli-1', name: 'Happy Hour Farm', garment_colors: ['black', 'navy'], notes: 'Loves vintage badges', style_brief: brief };
const sheet = (i) => ({ image: 90 + i, quality: 'clean', garment_seen: 'black', colorway: 'dark_garment', medium: 'vector', realism: 'stylised', line_weight: 'bold', line_style: 'clean', outline: 'thick', shading: 'halftone', texture: 'grain', edge_finish: 'clean', layout: 'badge', hero: { subject: 'cow head', framing: 'head_only', scale: 'large' }, supporting_elements: [], swatches: [{ hex: '#F2E8D5', role: 'fill', area: 'dominant' }], text: [], mood: ['rugged'], off_style: false });
const sheets3 = [sheet(1), sheet(2), sheet(3)];
const reply = (obj, fenced) => ({ choices: [{ message: { content: fenced ? '```json\n' + JSON.stringify(obj) + '\n```' : JSON.stringify(obj) } }] });

// ---- Build Sheet Request (Pass A request) ----------------------------------------------------------------------
const bsr = jsCode('Build Sheet Request');
const sheetReq = run(bsr, { 'Load Config': [cfg], 'Get Templates': templates, 'List Library': refs }, signed).json;
const sheetText = sheetReq.body.messages[0].content[0].text;
check(sheetText.startsWith('Attached are 3 past designs of one print-on-demand client, IMAGE 1 .. IMAGE 3 in the order attached.'), 'Build Sheet Request: style_sheet v1 body, IMAGE_COUNT rendered twice');
check(sheetText.includes('Image 1: mockup on a black garment; best example of lettering, layout; bestseller 2025\nImage 2: design\nImage 3: draft; OUTLIER - not the style; old logo'), 'Build Sheet Request: REFERENCE_NOTES one line per image from client_references.meta (kind, garment, best_for, outlier) + note');
check(!/\{\{[A-Z_]+\}\}/.test(sheetText) && sheetReq.body.response_format.type === 'json_object', 'Build Sheet Request: no unrendered tokens, JSON mode');
check(sheetReq.body.messages[0].content.length === 4 && sheetReq.body.messages[0].content[1].image_url.url === cfg.sbUrl + '/storage/v1' + signed[0].signedURL && sheetReq.template_version === 1 && sheetReq.reference_count === 3, 'Build Sheet Request: one image_url per signed library image, in order; template_version 1');
const noSheetTpl = threw(() => run(bsr, { 'Load Config': [cfg], 'Get Templates': [templates[0]], 'List Library': refs }, signed));
check(/style_sheet/.test(noSheetTpl) && !/:/.test(noSheetTpl), 'Build Sheet Request: no active style_sheet template -> throws (error output feeds Parse Sheets, the run continues), no colon');
const partialSign = threw(() => run(bsr, { 'Load Config': [cfg], 'Get Templates': templates, 'List Library': refs }, signed.slice(0, 2)));
check(/Could not sign 1 of 3 library images/.test(partialSign) && !/:/.test(partialSign), 'Build Sheet Request: a partial signing failure throws BEFORE the paid Pass A call (error output -> Parse Sheets, sheets null; Build Style Request then fails the run), no colon');

// ---- Parse Sheets (never fails the run) ------------------------------------------------------------------------
const ps = jsCode('Parse Sheets');
const psNodes = { 'List Library': refs, 'Build Sheet Request': [sheetReq] };
const okSheets = run(ps, psNodes, [reply({ sheets: sheets3 }, true)]).json;
check(Array.isArray(okSheets.sheets) && okSheets.sheets.length === 3 && okSheets.sheets.map((s) => s.image).join(',') === '1,2,3' && okSheets.sheets[0].line_weight === 'bold' && okSheets.sheet_note === '' && okSheets.sheet_template_version === 1, 'Parse Sheets: fenced {sheets:[...]} parsed, image numbers forced to attach order 1..N');
const bareArr = run(ps, psNodes, [reply(sheets3, false)]).json;
check(Array.isArray(bareArr.sheets) && bareArr.sheets.length === 3, 'Parse Sheets: a bare array reply is accepted');
const short = run(ps, psNodes, [reply({ sheets: sheets3.slice(0, 2) }, false)]).json;
check(short.sheets === null && short.sheet_note === 'sheet count mismatch - expected 3 got 2', 'Parse Sheets: wrong sheet count -> sheets null with the spec message');
const vendor = run(ps, psNodes, [{ error: { message: 'Kie: 502 upstream', status: 502 } }]).json;
check(vendor.sheets === null && vendor.sheet_note === 'Kie - 502 upstream', 'Parse Sheets: vendor error item -> sheets null, note without colons');
const skipMsg = 'no active style_sheet template in prompt_templates - profiling without per-image sheets';
const skipped = run(ps, { 'List Library': refs, 'Build Sheet Request': [{ error: skipMsg }] }, [{ error: skipMsg }]).json;
check(skipped.sheets === null && /style_sheet/.test(skipped.sheet_note) && skipped.sheet_template_version === null, 'Parse Sheets: Build Sheet Request error item -> sheets null, template version null');
const prose = run(ps, psNodes, [{ choices: [{ message: { content: 'I cannot see the images.' } }] }]).json;
check(prose.sheets === null && prose.sheet_note !== '', 'Parse Sheets: prose reply -> sheets null (never throws)');

// ---- Build Style Request (Pass B request) ----------------------------------------------------------------------
const bstr = jsCode('Build Style Request');
const styleNodes = { 'Load Config': [cfg], 'Get Templates': templates, 'Get Client': [client], 'List Library': refs, 'Sign Library Ref': signed };
const styleReq = run(bstr, styleNodes, [okSheets]).json;
const styleText = styleReq.body.messages[0].content[0].text;
check(styleText.includes("Attached are 3 of this client's PAST DESIGNS, numbered in the order attached (IMAGE 1 .. IMAGE 3)."), 'Build Style Request: style_profiler v3 IMAGE_COUNT rendered');
check(styleText.includes('- Client: Happy Hour Farm. Niche / audience: farm humour / homesteaders\n- Subjects the client sells designs about: Highland cows; chickens\n- Brand text that recurs on designs (a handle, an EST. line, a tagline): @TheHappyHourFarm; EST. 2019\n- Garments the client prints on: black, navy\n- Notes: Loves vintage badges\n- Must-have signature moves: thick outer keyline; halftone\n- Never do: gradients\n- Typography note: chunky slab serif\n- Studio rules, for your information only - NEVER write these words into any field: palette flexible, text case upper, typography a guide, composition locked.'), 'Build Style Request: SUBJECTS / BRAND_TEXT / GARMENT_COLORS (comma list) / TYPOGRAPHY_NOTE / MUST_HAVE / AVOID / rules rendered from the brief');
check(styleText.includes('Per-image notes from the studio:\nImage 1: mockup on a black garment; best example of lettering, layout; bestseller 2025\nImage 2: design\nImage 3: draft; OUTLIER - not the style; old logo\n'), 'Build Style Request: REFERENCE_NOTES identical to Pass A');
check(styleText.includes('cite their IMAGE numbers:\n' + JSON.stringify(okSheets.sheets) + '\n'), 'Build Style Request: SHEETS_JSON = the parsed sheets');
check(!/\{\{[A-Z_]+\}\}/.test(styleText) && !styleText.includes('["black"'), 'Build Style Request: no unrendered tokens; GARMENT_COLORS is a comma list, not JSON');
check(styleReq.body.messages[0].content.length === 4 && styleReq.template_version === 3 && styleReq.reference_count === 3 && JSON.stringify(styleReq.reference_ids) === '["r1","r2","r3"]' && JSON.stringify(styleReq.rules) === JSON.stringify({ palette_mode: 'flexible', text_case: 'upper', lock_typography: false, lock_composition: true }) && JSON.stringify(styleReq.brief) === JSON.stringify(brief), 'Build Style Request: images from Sign Library Ref, reference_ids in attach order, rules and brief passed on');
const noSheets = run(bstr, styleNodes, [{ sheets: null, sheet_note: 'x' }]).json.body.messages[0].content[0].text;
check(noSheets.includes('cite their IMAGE numbers:\nnot available - describe from the images\n'), 'Build Style Request: sheets null -> SHEETS_JSON literal fallback');
const bareBrief = run(bstr, { ...styleNodes, 'Get Client': [{ id: 'cli-1', name: 'Bare', garment_colors: [], notes: null, style_brief: {} }] }, [{ sheets: null }]).json.body.messages[0].content[0].text;
check(bareBrief.includes('Niche / audience: not given\n- Subjects the client sells designs about: not given\n- Brand text that recurs on designs (a handle, an EST. line, a tagline): none given\n- Garments the client prints on: not given\n- Notes: none\n- Must-have signature moves: none given\n- Never do: none given\n- Typography note: none\n') && bareBrief.includes('palette strict, text case as_typed, typography locked, composition locked.'), 'Build Style Request: empty brief -> not given / none given / none defaults, strict + as_typed + locked rules');
const signFail = threw(() => run(bstr, { ...styleNodes, 'Sign Library Ref': signed.slice(0, 2) }, [okSheets]));
check(/Could not sign 1 of 3 library images/.test(signFail) && !/:/.test(signFail), 'Build Style Request: a missing signed URL fails the run with the count, no colon');

// ---- Parse Style Card (JSON extraction only) -------------------------------------------------------------------
const psc = jsCode('Parse Style Card');
const cardReply = { schema: 2, medium: 'vector', palette: [{ name: 'cream', hex: '#F2E8D5', weight: 'dominant' }], typography: { vibe: 'slab' }, rules: { palette_mode: 'strict' } };
const pscNodes = { 'Build Style Request': [styleReq], 'Get Templates': templates, 'Parse Sheets': [okSheets], 'OpenRouter Profile Style': null, 'Profile Style': [reply(cardReply, true)] };
const parsed = run(psc, pscNodes, [reply(cardReply, true)]).json;
check(parsed.style_card.medium === 'vector' && parsed.style_card.source === 'library' && JSON.stringify(parsed.style_card.reference_ids) === '["r1","r2","r3"]' && parsed.style_card.rules.palette_mode === 'flexible' && parsed.style_card.rules.lock_composition === true, 'Parse Style Card: JSON extracted; studio rules override the model, reference_ids + source = library stamped');
check(parsed.template_version === 3 && JSON.stringify(parsed.template_versions) === '{"sheet":1,"profiler":3}' && parsed.reference_count === 3, 'Parse Style Card: template_versions {sheet 1, profiler 3}');
check(!('signature_moves' in parsed.style_card), 'Parse Style Card: JSON extraction only - missing keys are left to style-card-check (no REQUIRED list)');
const noSheetVer = run(psc, { ...pscNodes, 'Parse Sheets': [{ sheets: null }] }, [reply(cardReply, false)]).json;
check(noSheetVer.template_versions.sheet === null && noSheetVer.template_versions.profiler === 3, 'Parse Style Card: sheets null -> template_versions.sheet null');
const down = threw(() => run(psc, pscNodes, [{ error: { message: 'upstream: timeout', status: 504 } }]));
check(/^Vision service unavailable \(Kie error 504 - upstream - timeout\)/.test(down), 'Parse Style Card: vendor error -> Vision service unavailable message (colons replaced)');
const noJson = threw(() => run(psc, pscNodes, [{ choices: [{ message: { content: 'Sorry.' } }] }]));
check(/style profiler returned no JSON/.test(noJson), 'Parse Style Card: prose -> fails loudly');

// ---- Build Repair Request / Parse Repair ------------------------------------------------------------------------
const brr = jsCode('Build Repair Request');
const checkFail = { card: { ...cardReply, source: 'library', validation: { errors: ['palette has 1 entry: 3 to 8 required', 'forbid is empty'] } }, errors: ['palette has 1 entry: 3 to 8 required', 'forbid is empty'], warnings: [], fixes: ['x'], agreement: {} };
const rep = run(brr, { 'Get Settings': [settings] }, [checkFail]).json;
check(rep.body.model === 'anthropic/claude-sonnet-4.6' && rep.body.max_tokens === 8000 && rep.body.messages.length === 1 && typeof rep.body.messages[0].content === 'string', 'Build Repair Request: OpenRouter text model from settings.openrouter_models.text, text only (no images)');
check(rep.body.messages[0].content === 'Return the full JSON with ONLY these violations fixed, changing nothing else, keeping every other value byte-identical: palette has 1 entry: 3 to 8 required; forbid is empty\n' + JSON.stringify(checkFail.card), 'Build Repair Request: spec wording + errors joined with "; " + the validator-fixed card JSON');
const badCheck = threw(() => run(brr, { 'Get Settings': [settings] }, [{ message: 'not a validator reply' }]));
check(/no errors array/.test(badCheck) && !/:/.test(badCheck), 'Build Repair Request: unexpected validator shape -> throws without colon');

const pr = jsCode('Parse Repair');
const prNodes = { 'Build Repair Request': [rep], 'Parse Style Card': [parsed] };
const repaired = run(pr, prNodes, [reply({ ...cardReply, palette: [1, 2, 3].map((i) => ({ name: 'c' + i, hex: '#00000' + i, weight: i === 1 ? 'dominant' : 'accent' })), forbid: ['gradients', 'photos'], rules: { palette_mode: 'strict' }, reference_ids: [] }, true)]).json;
check(repaired.style_card.palette.length === 3 && repaired.style_card.rules.palette_mode === 'flexible' && JSON.stringify(repaired.style_card.reference_ids) === '["r1","r2","r3"]' && repaired.style_card.source === 'library', 'Parse Repair: repaired JSON parsed; rules / reference_ids / source re-stamped from the studio, never from the model');
check(repaired.template_version === 3 && JSON.stringify(repaired.template_versions) === '{"sheet":1,"profiler":3}' && JSON.stringify(repaired.repaired_errors) === JSON.stringify(checkFail.errors), 'Parse Repair: template versions carried, repaired_errors recorded');
const repDown = threw(() => run(pr, prNodes, [{ error: { message: 'Unauthorized', status: 401 } }]));
check(repDown === 'Style Card failed validation (palette has 1 entry - 3 to 8 required; forbid is empty) and the repair call failed (OpenRouter error 401 - OpenRouter API key missing or invalid - add it in n8n WF-0 Studio Config (OpenRouter Config node))', 'Parse Repair: OpenRouter failure -> one message naming the validation errors AND the vendor error, no colon');
const repProse = threw(() => run(pr, prNodes, [{ choices: [{ message: { content: 'Here you go' } }] }]));
check(/^Style Card failed validation \(.*\) and the repair reply was not JSON - Here you go$/.test(repProse), 'Parse Repair: prose reply -> fails loudly, still naming the validation errors');

// ---- Fail Message (message + raw audit trail) -----------------------------------------------------------------
const fm = jsCode('Fail Message');
const checkStill = { card: repaired.style_card, errors: ['forbid is empty: add 2 to 8 entries'], warnings: ['w'], fixes: [], agreement: { a: 1 } };
const fmAfterRepair = run(fm, { Config: [configItem], 'Check Repaired Card': [checkStill], 'Check Style Card': [checkFail], 'Parse Sheets': [okSheets], 'Parse Repair': [repaired], 'Parse Style Card': [parsed] }, [checkStill]).json;
check(fmAfterRepair.message === 'Style Card still fails validation after one repair - forbid is empty - add 2 to 8 entries' && fmAfterRepair.requestId === 'req-1', 'Fail Message: second validator failure -> errors joined with " - ", colons removed');
check(fmAfterRepair.raw.sheets.length === 3 && fmAfterRepair.raw.card === repaired.style_card && JSON.stringify(fmAfterRepair.raw.validation) === JSON.stringify({ errors: checkStill.errors, warnings: ['w'], fixes: [], agreement: { a: 1 } }) && fmAfterRepair.raw.template_versions.profiler === 3, 'Fail Message: raw = {sheets, card (repaired), validation (second check), template_versions}');
const fmEarly = run(fm, { Config: [configItem], 'Check Repaired Card': null, 'Check Style Card': null, 'Parse Sheets': [okSheets], 'Parse Repair': null, 'Parse Style Card': null }, [{ error: 'Vision service unavailable (Kie error 504 - upstream - timeout). Nothing was changed; try again in a few minutes.' }]).json;
check(fmEarly.message.startsWith('Vision service unavailable (Kie error 504') && fmEarly.raw.sheets.length === 3 && fmEarly.raw.card === null && fmEarly.raw.validation === null && fmEarly.raw.template_versions === null, 'Fail Message: Pass B vendor failure keeps the sheets in raw; card and validation null');
const fmEmpty = run(fm, { Config: [configItem], 'Check Repaired Card': null, 'Check Style Card': null, 'Parse Sheets': null, 'Parse Repair': null, 'Parse Style Card': null }, [{ message: 'client reference library is empty - upload references on the client panel, then draft again' }]).json;
check(/library is empty/.test(fmEmpty.message) && fmEmpty.raw.sheets === null && fmEmpty.raw.card === null, 'Fail Message: nothing executed yet -> message passthrough, raw all null');
const httpErr = { error: { message: 'style-card-check 404: not found' } };
const fmCheckHttp = run(fm, { Config: [configItem], 'Check Repaired Card': null, 'Check Style Card': [httpErr], 'Parse Sheets': [okSheets], 'Parse Repair': null, 'Parse Style Card': [parsed] }, [httpErr]).json;
check(fmCheckHttp.message === 'style-card-check 404: not found' && fmCheckHttp.raw.card === parsed.style_card && fmCheckHttp.raw.validation === null, 'Fail Message: validator HTTP failure -> raw.card = the parsed (unchecked) card, validation null');

// ---- Extract Style Card Id (id + raw for Draft → done) ----------------------------------------------------------
const ex = jsCode('Extract Style Card Id');
const checkOk = { card: { ...cardReply, validation: { errors: [], warnings: [], fixes: ['f'], checked_at: 'now' } }, errors: [], warnings: [], fixes: ['f'], agreement: { 'linework.weight': 1 } };
const row = { id: '3f2e1d0c-9b8a-4765-8321-0fedcba98765', client_id: 'cli-1', version: 3, status: 'draft', json: checkOk.card };
const exNodes = { 'Check Repaired Card': null, 'Check Style Card': [checkOk], 'Parse Sheets': [okSheets], 'Parse Style Card': [parsed] };
const got = run(ex, exNodes, [row]).json;
check(got.style_card_id === row.id && got.version === 3 && got.raw.repaired === false && got.raw.card === checkOk.card && got.raw.sheets.length === 3 && JSON.stringify(got.raw.validation) === JSON.stringify({ errors: [], warnings: [], fixes: ['f'], agreement: { 'linework.weight': 1 } }) && got.raw.template_versions.sheet === 1, 'Extract Style Card Id: id + raw {sheets, checked card, validation, template_versions, repaired false}');
const gotRep = run(ex, { ...exNodes, 'Check Repaired Card': [checkStill] }, [row]).json;
check(gotRep.raw.repaired === true && gotRep.raw.card === checkStill.card, 'Extract Style Card Id: after a repair, raw.card / validation come from Check Repaired Card');
const noId = threw(() => run(ex, exNodes, [{ ok: true }]));
check(/new_style_card_version returned no id/.test(noId) && !/:/.test(noId), 'Extract Style Card Id: missing id fails loudly, no colon');

// ---- HTTP node contracts, settings and wiring -------------------------------------------------------------------
const p = (name) => nodeByName(name).parameters;
const hdr = (name, key) => ((p(name).headerParameters || {}).parameters || []).find((h) => h.name === key);
for (const n of ['Check Style Card', 'Check Repaired Card']) {
  const b = String(p(n).jsonBody);
  check(/\/functions\/v1\/style-card-check$/.test(p(n).url) && hdr(n, 'apikey') && hdr(n, 'x-studio-secret') && /card: \$json\.style_card/.test(b) && /brief: /.test(b) && /image_count: /.test(b) && /sheets: /.test(b) && /reference_ids: /.test(b) && /client_garments: /.test(b) && p(n).options.response.response.responseFormat === 'json', n + ': POST {{sbUrl}}/functions/v1/style-card-check with apikey + x-studio-secret and {card, brief, image_count, sheets, reference_ids, client_garments}');
}
for (const n of ['Draft → done', 'Draft → failed']) {
  check(p(n).method === 'PATCH' && /\/rest\/v1\/style_draft_requests\?id=eq\./.test(p(n).url) && /raw: \$json\.raw/.test(String(p(n).jsonBody)) && hdr(n, 'Prefer').value === 'return=representation' && hdr(n, 'apikey') && hdr(n, 'x-studio-secret'), n + ': PATCH style_draft_requests (status + raw) - rpc style_draft_update has no raw argument');
}
check(/status: 'done', style_card_id: \$json\.style_card_id/.test(String(p('Draft → done').jsonBody)) && /status: 'failed', last_error: /.test(String(p('Draft → failed').jsonBody)), 'Draft → done / failed: status + style_card_id / last_error in the PATCH body');
check(/p_status: 'working'/.test(String(p('Draft → working').jsonBody)) && /rpc\/style_draft_update$/.test(p('Draft → working').url), 'Draft → working: unchanged RPC call');
for (const n of ['Describe Designs', 'OpenRouter Describe Designs', 'Profile Style', 'OpenRouter Profile Style']) check(p(n).options.timeout === 240000, n + ': vision timeout 240000');
check(/slug=in\.\(style_sheet,style_profiler\)&active=is\.true/.test(p('Get Templates').url) && !nodes.some((n) => n.name === 'Get Template'), 'Get Templates: both slugs in one call, active rows only; old Get Template removed');
check(/select=id,path,note,meta&order=created_at\.desc,id\.desc/.test(p('List Library').url), 'List Library: selects meta, deterministic order (created_at desc, id desc)');
check(/select=id,name,garment_colors,notes,style_brief/.test(p('Get Client').url), 'Get Client: selects style_brief and garment_colors');
check(/p_json: \$json\.card/.test(String(p('New Style Card Version').jsonBody)), 'New Style Card Version: stores the CHECKED card (validator output), not the raw profiler JSON');
check(p('Repair Style Card').url === 'https://openrouter.ai/api/v1/chat/completions' && /openrouterKey/.test(hdr('Repair Style Card', 'Authorization').value) && /\$json\.body/.test(String(p('Repair Style Card').jsonBody)), 'Repair Style Card: OpenRouter chat/completions with the WF-0 key, body from Build Repair Request');
check(/Build Sheet Request'\)\.first\(\)\.json\.body/.test(String(p('Describe Designs').jsonBody)) && /Build Sheet Request'\)\.first\(\)\.json\.body/.test(String(p('OpenRouter Describe Designs').jsonBody)) && /openrouter_models \|\| \{\}\)\.vision/.test(String(p('OpenRouter Describe Designs').jsonBody)), 'Describe Designs twins: both send the Pass A body; OpenRouter twin uses openrouter_models.vision');
check(nodeByName('Describe Designs').credentials && nodeByName('Profile Style').credentials && !nodeByName('OpenRouter Describe Designs').credentials && !nodeByName('Repair Style Card').credentials, 'Kie nodes carry the Gemini credential, OpenRouter nodes do not');
const s = (name) => nodeByName(name);
check(s('Parse Sheets').onError === 'continueRegularOutput' && s('Build Sheet Request').onError === 'continueErrorOutput' && s('Describe Designs').onError === 'continueErrorOutput' && s('OpenRouter Describe Designs').onError === 'continueRegularOutput' && s('OpenRouter Describe Designs').alwaysOutputData === true && s('Repair Style Card').onError === 'continueRegularOutput' && s('Repair Style Card').alwaysOutputData === true, 'Pass A and the repair call never stop the run by themselves (continue settings)');
const conns = wf.connections;
const edge = (from, idx, to) => Boolean(((conns[from] || {}).main || [])[idx] && conns[from].main[idx].some((c) => c.node === to));
check(edge('Get Templates', 0, 'List Library') && edge('Get Templates', 1, 'Fail Message') && edge('Sign Library Ref', 0, 'Build Sheet Request'), 'Wiring: Get Templates -> List Library, Sign Library Ref -> Build Sheet Request');
check(edge('Build Sheet Request', 0, 'Sheet Platform?') && edge('Build Sheet Request', 1, 'Parse Sheets') && edge('Sheet Platform?', 0, 'Describe Designs') && edge('Sheet Platform?', 1, 'OpenRouter Describe Designs') && edge('Describe Designs', 0, 'Kie Sheet Down?') && edge('Describe Designs', 1, 'Kie Sheet Down?') && edge('Kie Sheet Down?', 0, 'OpenRouter Describe Designs') && edge('Kie Sheet Down?', 1, 'Parse Sheets') && edge('OpenRouter Describe Designs', 0, 'Parse Sheets') && edge('Parse Sheets', 0, 'Build Style Request'), 'Wiring: Sheet Platform? / Kie Sheet Down? / Describe Designs / OpenRouter Describe Designs -> every Pass A outcome reaches Parse Sheets, then Build Style Request');
check(edge('Parse Style Card', 0, 'Check Style Card') && edge('Check Style Card', 0, 'Card OK?') && edge('Card OK?', 0, 'New Style Card Version') && edge('Card OK?', 1, 'Build Repair Request') && edge('Build Repair Request', 0, 'Repair Style Card') && edge('Repair Style Card', 0, 'Parse Repair') && edge('Parse Repair', 0, 'Check Repaired Card') && edge('Check Repaired Card', 0, 'Repaired Card OK?') && edge('Repaired Card OK?', 0, 'New Style Card Version') && edge('Repaired Card OK?', 1, 'Fail Message') && edge('New Style Card Version', 0, 'Extract Style Card Id') && edge('Extract Style Card Id', 0, 'Draft → done') && edge('Fail Message', 0, 'Draft → failed') && edge('Empty Library Message', 0, 'Draft → failed'), 'Wiring: validator gate, exactly one repair pass (no cycle), then store or fail');
for (const n of ['Check Style Card', 'Check Repaired Card', 'Parse Repair', 'Build Repair Request', 'Parse Style Card', 'Build Style Request', 'New Style Card Version', 'Extract Style Card Id']) check(edge(n, 1, 'Fail Message'), n + ': error output -> Fail Message');
const codeNodes = nodes.filter((n) => n.type === 'n8n-nodes-base.code');
const colonThrows = [];
for (const n of codeNodes) { const code = String(n.parameters.jsCode); const re = /throw new Error\(([\s\S]*?)\);/g; let m; while ((m = re.exec(code))) { const lits = m[1].match(/'([^']*)'/g) || []; if (lits.some((l) => l.includes(':'))) colonThrows.push(n.name + ' -> ' + m[1].slice(0, 60)); } }
check(colonThrows.length === 0, 'No thrown message literal contains ":" (n8n keeps only the text after the last colon)' + (colonThrows.length ? ' - ' + colonThrows.join(' | ') : ''));
check(codeNodes.every((n) => String(n.parameters.jsCode).split('\n').length <= 20), 'Every Code node is 20 lines or fewer');
const stickyText = String((nodes.find((n) => n.type === 'n8n-nodes-base.stickyNote') || { parameters: {} }).parameters.content || '');
check(/style_sheet/.test(stickyText) && /style-card-check/.test(stickyText) && /SHEETS_JSON/.test(stickyText) && /raw = \{sheets, card, validation, template_versions\}/.test(stickyText), 'Sticky note documents Pass A, the validator and raw');

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
