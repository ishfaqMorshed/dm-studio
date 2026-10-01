#!/usr/bin/env node
// Unit test for the prompt text WF-2 sends to the vision QC model and to Kie on the corrective pass (plus WF-3's Build QC Request).
// It parses ../wf2-generate.sdk.js and ../wf3-edit.sdk.js with the real SDK, pulls the jsCode of the Code nodes and runs it under mocked
// n8n globals ($, $input) against the VERBATIM seeded templates: qc_prompt v1 + corrective_suffix v1 from
// ../../supabase/migrations/20260924_prompt_templates_v1.sql, and qc_prompt v2 read through ./template-from-migrations.js from the
// migration that inserts it (20260930_studio_21_style_card_v2.sql, jsonb_populate_record form, $qc$ tag); the copy embedded below
// (v1 body + the spec 1.4 tail) is only the fallback and a check fails when the migration body drifts from it. Usage: node test-wf2-prompts.js
const fs = require('fs');
const path = require('path');
const { parseWorkflowCodeToBuilder } = require('@n8n/workflow-sdk');

const loadNodes = (file) => { const raw = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8').split('\n').filter((l) => !/^\s*import\s.*from\s+['"]@n8n\/workflow-sdk['"]/.test(l)).join('\n'); return parseWorkflowCodeToBuilder(raw).toJSON().nodes; };
const wf2Nodes = loadNodes('wf2-generate.sdk.js');
const wf3Nodes = loadNodes('wf3-edit.sdk.js');
const jsCodeOf = (nodes, name) => { const n = nodes.find((x) => x.name === name); if (!n) throw new Error('node not found: ' + name); return String(n.parameters.jsCode); };
const jsCode = (name) => jsCodeOf(wf2Nodes, name);

const { templateFromMigrations, templateFromSql } = require('./template-from-migrations.js');
const migration = fs.readFileSync(path.resolve(__dirname, '..', '..', 'supabase', 'migrations', '20260924_prompt_templates_v1.sql'), 'utf8');
const seeded = (slug) => { const b = templateFromSql(migration, slug, 1); if (b === null) throw new Error('template not seeded: ' + slug); return b; };
// qc_prompt v2 tail, verbatim from the Style Card v2 spec section 1.4 (v2 body = v1 body + this tail)
const QC_V2_TAIL = 'STYLE CARD (the client\'s locked look, JSON below) and EXPECTED SUBJECT: "{{EXPECTED_SUBJECT}}".\n' +
  'Add a key "style" judged against the card only, never against taste: {"subject_seen":"two or three words naming the hero","subject_ok":true|false|null (true only when the hero clearly IS the expected subject; false when it is something else, for example the thing the text names; null when no subject is given),"palette_ok":true|false ({{PALETTE_RULE}}),"off_palette_colours":[{"name":"","hex":"#RRGGBB","area":"large|small"}],"medium_ok":true|false (drawn in the card\'s medium, linework and shading method),"typography_ok":true|false (letterform style and placement match the card\'s typography; letter case is NOT judged),"composition_ok":true|false (matches the card\'s composition; always true when it is a guide),"forbid_hits":[numbers of FORBID items visibly present],"case_seen":"UPPER|lower|Title|Mixed","text_height_ok":true|false (the smallest expected text line is at least 3% of the image height),"min_text_height_frac":0.0,"cropped":true|false (artwork touches or leaves the frame)}. These keys never change "pass" or the 9 checks. Letter case, font and wording of the text are defined ONLY by the EXPECTED ON-DESIGN TEXT above - never report them as an issue.\n' +
  'FORBID: {{FORBID_LIST}}\n{{STYLE_CARD_JSON}}';
const specV2Body = seeded('qc_prompt') + '\n\n' + QC_V2_TAIL;
const migV2 = templateFromMigrations('qc_prompt', 2);
const qcV2Body = migV2 ? migV2.body : specV2Body, qcV2Source = migV2 ? migV2.file : 'spec section 1.4 copy (no migration inserts qc_prompt v2)';
const templatesV1 = [{ slug: 'qc_prompt', version: 1, body: seeded('qc_prompt') }, { slug: 'corrective_suffix', version: 1, body: seeded('corrective_suffix') }];
const templatesV2 = [{ slug: 'qc_prompt', version: 2, body: qcV2Body }, { slug: 'corrective_suffix', version: 1, body: seeded('corrective_suffix') }];

function run(code, nodeData, inputItems) {
  const items = (arr) => arr.map((json) => ({ json }));
  const $ = (name) => { if (!(name in nodeData)) throw new Error('unmocked node ' + name); const arr = nodeData[name]; return { first: () => ({ json: arr[0] }), all: () => items(arr) }; };
  const $input = { first: () => ({ json: inputItems[0] }), all: () => items(inputItems) };
  return new Function('$', '$input', '$json', '$execution', code)($, $input, inputItems[0], { resumeUrl: 'https://n8n.example/webhook-waiting/1' });
}
const promptOf = (out) => out.body.messages[0].content[0].text;
const jsonLine = (text, startsWith) => { const i = text.indexOf(startsWith); if (i < 0) throw new Error('no ' + startsWith + ' in the QC text'); return JSON.parse(text.slice(i).split('\n')[0]); };

let failures = 0;
const check = (cond, msg) => { if (cond) console.log('ok   ' + msg); else { failures++; console.log('FAIL ' + msg); } };

check(!migV2 || migV2.body === specV2Body, 'qc_prompt v2 body' + (migV2 ? ' in ' + migV2.file : '') + ' = the seeded v1 body + the spec 1.4 tail, byte for byte (source used: ' + qcV2Source + ')');

const cfg = { sbUrl: 'https://voatrqhfsdfjomyajovi.supabase.co', anonKey: 'redacted', generationId: 'g', cardId: 'c', imagePath: 'c/g.png' };
const signResult = { signedURL: '/object/sign/gens/c/g.png?token=redacted' };
// Style Card v2 fixture shaped like the live Chicken Happy Hour v2 draft: a text demand in forbid, the handle in signature_moves, two palette_variants
const styleCard = {
  schema: 2, medium: 'screen-print', realism: 'stylised', linework: { weight: 'bold', style: 'clean vector', outline: 'thick' }, shading: 'flat fills', shading_method: 'flat', texture: 'none', edge_finish: 'clean',
  palette: [{ name: 'cream', hex: '#EAE6D9', weight: 'dominant', role: 'fill' }, { name: 'charcoal', hex: '#151515', weight: 'secondary', role: 'line' }, { name: 'rust', hex: '#BA4B36', weight: 'accent', role: 'accent' }],
  palette_variants: [{ garment: 'dark', hexes: ['#EAE6D9', '#BA4B36'], images: [1, 2] }, { garment: 'light', hexes: ['#151515', '#BA4B36'], images: [3] }],
  composition: 'the hero centred under an arched headline', hero: { framing: 'chest_up', scale: 'large' }, typography: { vibe: 'western slab', placement: 'arched above the hero', case: 'UPPER' },
  background: 'flat mid-grey #808080, isolated artwork', mood: ['rustic'], subjects: ['Highland cows', 'chickens'],
  brand_text: { items: [{ text: '@TheHappyHourFarm', role: 'handle', placement: 'bottom_margin' }], always_present: true },
  forbid: ['gradients', 'drop shadows', 'photorealism', 'Omitting the bottom center social media handle'], signature_moves: ['arched headline', 'the @TheHappyHourFarm handle bottom centre'],
  evidence: ['IMAGE 1: arched headline'], rules: { palette_mode: 'strict', text_case: 'UPPER', lock_typography: true, lock_composition: false }
};
const PRUNED_KEYS = ['medium', 'realism', 'linework', 'shading', 'shading_method', 'texture', 'edge_finish', 'palette', 'composition', 'typography', 'rules'];
const STRICT = 'true only when every colour in the artwork belongs to the palette or is a shade of one; small natural details count';
const FLEXIBLE = 'true unless a LARGE, obvious area uses a colour clearly outside the palette - small natural accents are allowed';
const cardRow = { print_text: [{ role: 'headline', text: 'FAMILY FIRST' }, { role: 'sub', text: 'EST 2019' }], garment_color: 'black', reference_paths: [], client_submission: { source: 'style_test', subject: 'Highland cow' } };
const genWithText = { id: 'g', attempt: 1, style_card_snapshot: styleCard, brief_snapshot: null, cards: cardRow };
const genNoText = { ...genWithText, cards: { ...cardRow, print_text: [] } };
const peLegacy = { magic_prompt_json: { text: '...' } }; // prompt-engine <= v7: no text.lines array, no SUBJECT block
const peV8 = { magic_prompt_json: { text: { lines: [{ role: 'headline', text: 'FAMILY FIRST' }, { role: 'sub', text: 'EST 2019' }] }, subject: { text: 'Highland cow', source: 'brief', pool: ['Highland cows', 'chickens'] } } };

// ---- Build QC Request, qc_prompt v1 (no Style Card tokens -> the hard-coded fallback paragraph) ------------------------------------
const qcCode = jsCode('Build QC Request');
const qcRun = (gen, pe, tpls) => run(qcCode, { Config: [cfg], 'Load Config': [cfg], 'Get Generation': [gen], 'Sign Result': [signResult], 'Prompt Engine': [pe] }, tpls).json;
const qcV1 = qcRun(genWithText, peLegacy, templatesV1);
const qcPrompt = promptOf(qcV1);
check(qcPrompt.includes('EXPECTED ON-DESIGN TEXT: """FAMILY FIRST\nEST 2019"""'), 'QC v1 with text: EXPECTED line = template triple quotes around the bare joined lines (EXTRACT §3.8)');
check(!/""""/.test(qcPrompt), 'QC v1 with text: no doubled quote marks');
check(qcPrompt.startsWith('You are a strict print-on-demand quality inspector. Inspect the attached generated design image.\n\nEXPECTED ON-DESIGN TEXT: """'), 'QC v1 with text: verbatim opening kept');
check(qcPrompt.includes('9. edges_clean:') && qcPrompt.includes('pass must be true ONLY if every single check is satisfied.'), 'QC v1 with text: 9 checks + verdict schema kept verbatim');
const fallbackHead = '\n\nSTYLE CARD (the locked look for this client, JSON below). Add two keys to your JSON: "palette_ok" (' + STRICT + ') and "style_violations" (array of short strings, [] when none: only a forbidden element from "forbid", or a palette problem). These style keys NEVER change "pass" or the 9 checks. Letter case, font and wording of the text are defined ONLY by the EXPECTED ON-DESIGN TEXT above - never report them as a violation.\n';
check(qcPrompt.includes(fallbackHead), 'QC v1 (template without STYLE_CARD_JSON): hard-coded palette_ok/style_violations paragraph appended with the strict palette sentence');
const v1Json = JSON.parse(qcPrompt.slice(qcPrompt.indexOf(fallbackHead) + fallbackHead.length).split('\n')[0]);
check(JSON.stringify(Object.keys(v1Json)) === JSON.stringify(PRUNED_KEYS.concat(['forbid'])) && JSON.stringify(v1Json.forbid) === JSON.stringify(['gradients', 'drop shadows', 'photorealism']), 'QC v1: appended JSON = pruned card + the filtered forbid list (the handle demand dropped; signature_moves / brand_text / evidence never sent)');
check(!/handle|@/i.test(qcPrompt), 'QC v1: no "handle" and no @ anywhere in the QC text');
check(!/\{\{[A-Z_]+\}\}/.test(qcPrompt), 'QC v1: no unrendered {{TOKENS}}');
check(JSON.stringify(qcV1.text_lines) === JSON.stringify(['FAMILY FIRST', 'EST 2019']) && qcV1.body.messages[0].content[1].image_url.url.endsWith('token=redacted'), 'QC v1: text_lines + signed image URL returned');
check(qcV1.expected_subject === 'Highland cow', 'QC: expected_subject falls back to cards.client_submission.subject when the engine has no SUBJECT block');

const qcNone = promptOf(qcRun(genNoText, peLegacy, templatesV1));
check(qcNone.includes('\n\nEXPECTED ON-DESIGN TEXT: (none - the image must contain NO text at all)\n\n'), 'QC no text: whole EXPECTED line replaced by the verbatim (none ...) variant');
check(!qcNone.includes('"""'), 'QC no text: no triple quotes left');
check(qcNone.replace('EXPECTED ON-DESIGN TEXT: (none - the image must contain NO text at all)', 'X') === qcPrompt.replace('EXPECTED ON-DESIGN TEXT: """FAMILY FIRST\nEST 2019"""', 'X'), 'QC no text: only the EXPECTED line differs from the with-text variant');

const snapGen = { ...genWithText, brief_snapshot: { print_text: [{ role: 'headline', text: 'SNAPSHOT LINE' }], subject: 'goat' } };
const qcSnap = qcRun(snapGen, peLegacy, templatesV1);
check(qcSnap.expected_text === 'SNAPSHOT LINE', 'QC: brief_snapshot.print_text wins over cards.print_text (same source as prompt-engine)');
check(qcSnap.expected_subject === 'goat', 'QC: brief_snapshot.subject wins over cards.client_submission.subject when the engine has no SUBJECT block');
const qcEngine = qcRun(snapGen, peV8, templatesV1);
check(qcEngine.expected_text === 'FAMILY FIRST\nEST 2019' && qcEngine.expected_subject === 'Highland cow', 'QC: the engine text slot (magic_prompt_json.text.lines) and SUBJECT block (magic_prompt_json.subject.text) win over the snapshot');

// ---- Build QC Request, qc_prompt v2 (EXPECTED_SUBJECT / PALETTE_RULE / FORBID_LIST / STYLE_CARD_JSON) -----------------------------
check(/\{\{EXPECTED_SUBJECT\}\}/.test(qcV2Body) && /\{\{PALETTE_RULE\}\}/.test(qcV2Body) && /\{\{FORBID_LIST\}\}/.test(qcV2Body) && /\{\{STYLE_CARD_JSON\}\}/.test(qcV2Body), 'qc_prompt v2 body carries the four Style Card tokens (source: ' + qcV2Source + ')');
const qcV2 = qcRun(genWithText, peV8, templatesV2);
const p2 = promptOf(qcV2);
check(p2.includes('EXPECTED SUBJECT: "Highland cow"'), 'QC v2: EXPECTED SUBJECT = magic_prompt_json.subject.text');
check(p2.includes('FORBID: 1. gradients; 2. drop shadows; 3. photorealism\n'), 'QC v2: FORBID list numbered "1. ..." in card order');
check(!/handle|@/i.test(p2), 'QC v2: never a forbid containing "handle" and never the @handle (text demands dropped; signature_moves / brand_text not sent)');
check(p2.includes('"palette_ok":true|false (' + STRICT + ')'), 'QC v2: PALETTE_RULE = the strict sentence for rules.palette_mode strict');
check(!p2.includes('Add two keys to your JSON'), 'QC v2: the hard-coded fallback paragraph is NOT appended when the template has the token');
check(!/\{\{[A-Z_]+\}\}/.test(p2), 'QC v2: no unrendered {{TOKENS}}');
const cardJson = jsonLine(p2, '{"medium":');
check(JSON.stringify(Object.keys(cardJson)) === JSON.stringify(PRUNED_KEYS), 'QC v2: STYLE_CARD_JSON pruned to ' + PRUNED_KEYS.join(', '));
check(JSON.stringify(cardJson.palette) === JSON.stringify({ garment: 'dark', hexes: ['#EAE6D9', '#BA4B36'] }), 'QC v2: palette = the dark palette_variants entry on a black garment');
check(qcV2.expected_subject === 'Highland cow' && qcV2.template_version === 2 && qcV2.expected_text === 'FAMILY FIRST\nEST 2019', 'QC v2: expected_subject / expected_text / template_version returned for qc-judge');
const qcLight = promptOf(qcRun({ ...genWithText, cards: { ...cardRow, garment_color: 'white' } }, peV8, templatesV2));
check(JSON.stringify(jsonLine(qcLight, '{"medium":').palette) === JSON.stringify({ garment: 'light', hexes: ['#151515', '#BA4B36'] }), 'QC v2: white garment -> the light palette_variants entry');
const noVariants = { ...styleCard, rules: { ...styleCard.rules, palette_mode: 'flexible' } }; delete noVariants.palette_variants;
const qcFlex = promptOf(qcRun({ ...genWithText, style_card_snapshot: noVariants }, peV8, templatesV2));
check(JSON.stringify(jsonLine(qcFlex, '{"medium":').palette) === JSON.stringify(styleCard.palette) && qcFlex.includes('"palette_ok":true|false (' + FLEXIBLE + ')'), 'QC v2: without palette_variants the full palette is sent; flexible palette_mode -> the flexible sentence');
const qcNoSub = qcRun({ ...genWithText, cards: { ...cardRow, client_submission: null } }, peLegacy, templatesV2);
check(promptOf(qcNoSub).includes('EXPECTED SUBJECT: ""') && qcNoSub.expected_subject === '', 'QC v2: no subject anywhere -> EXPECTED SUBJECT "" (the judge answers subject_ok null)');
const qcNoForbid = promptOf(qcRun({ ...genWithText, style_card_snapshot: { ...styleCard, forbid: ['Omitting the bottom center social media handle', 'no @TheHappyHourFarm'] } }, peV8, templatesV2));
check(qcNoForbid.includes('FORBID: none\n') && !/handle|@/i.test(qcNoForbid), 'QC v2: forbid made only of text demands -> "FORBID: none"');
// Only TEXT demands are dropped (the validator TEXT_DEMAND_RE, not its PRESENCE_TEXT_RE): negated visual bans ('No gradients'), the studio print rule
// 'watermarks' and a physical object named handle ('a mug handle') survive; an @handle / social media handle and an EST. line are text demands.
const mixedForbid = ['No gradients', 'watermarks', 'a mug handle', 'social media handle @farm', 'EST. 2019 line'];
const qcMixed = promptOf(qcRun({ ...genWithText, style_card_snapshot: { ...styleCard, forbid: mixedForbid } }, peV8, templatesV2));
check(qcMixed.includes('FORBID: 1. No gradients; 2. watermarks; 3. a mug handle\n') && !/@|social media handle|EST\. 2019 line/i.test(qcMixed), 'QC v2: forbid filter keeps "No gradients", "watermarks", "a mug handle" and drops "social media handle @farm", "EST. 2019 line" (text demands only, as the validator)');
const qcMixedV1 = promptOf(qcRun({ ...genWithText, style_card_snapshot: { ...styleCard, forbid: mixedForbid } }, peLegacy, templatesV1));
check(JSON.stringify(JSON.parse(qcMixedV1.slice(qcMixedV1.indexOf(fallbackHead) + fallbackHead.length).split('\n')[0]).forbid) === JSON.stringify(['No gradients', 'watermarks', 'a mug handle']) && !/@|social media handle/i.test(qcMixedV1), 'QC v1 fallback JSON: the same three visual forbids survive, the two text demands are dropped');
const forbidLineOf = (code) => { const m = code.match(/^const forbid = .*$/m); if (!m) throw new Error('no forbid filter line in Build QC Request'); return m[0]; };
check(forbidLineOf(qcCode) === forbidLineOf(jsCodeOf(wf3Nodes, 'Build QC Request')) && /\(\?:social\|media\|instagram\|ig\|tiktok\)/.test(forbidLineOf(qcCode)) && !/watermark|\\bhandle\\b|omitting/.test(forbidLineOf(qcCode)), 'WF-2 and WF-3 Build QC Request share one forbid filter line: text-demand regex only (no watermark, no bare handle, no negation prefix)');

// ---- WF-3 Build QC Request (edit lane) ---------------------------------------------------------------------------------------------
const qc3Code = jsCodeOf(wf3Nodes, 'Build QC Request');
const editGen = { id: 'g', kind: 'edit_text', attempt: 1, old_text: 'FAMILY FIRST', new_text: 'FAMILY FOREVER', style_card_snapshot: styleCard, brief_snapshot: { print_text: [{ role: 'headline', text: 'FAMILY FIRST' }, { role: 'sub', text: 'EST 2019' }], subject: 'Highland cow' }, cards: { print_text: [{ role: 'headline', text: 'FAMILY FIRST' }], garment_color: 'black', reference_paths: [] } };
const qc3Run = (gen, pe, tpls) => run(qc3Code, { 'Load Config': [cfg], 'Get Generation': [gen], 'Sign Result': [signResult], 'Prompt Engine': [pe] }, tpls).json;
const qc3 = qc3Run(editGen, peLegacy, templatesV2);
const p3 = promptOf(qc3);
check(qc3.expected_text === 'FAMILY FOREVER\nEST 2019' && p3.includes('EXPECTED ON-DESIGN TEXT: """FAMILY FOREVER\nEST 2019"""'), 'WF-3 QC: edit_text swaps old_text -> new_text in the expected lines');
check(p3.includes('EXPECTED SUBJECT: "Highland cow"') && qc3.expected_subject === 'Highland cow', 'WF-3 QC v2: EXPECTED SUBJECT from brief_snapshot.subject when the engine has no SUBJECT block');
check(p3.includes('FORBID: 1. gradients; 2. drop shadows; 3. photorealism\n') && !/handle|@/i.test(p3), 'WF-3 QC v2: numbered FORBID list, never a forbid containing "handle"');
check(JSON.stringify(Object.keys(jsonLine(p3, '{"medium":'))) === JSON.stringify(PRUNED_KEYS) && JSON.stringify(jsonLine(p3, '{"medium":').palette) === JSON.stringify({ garment: 'dark', hexes: ['#EAE6D9', '#BA4B36'] }) && !p3.includes('Add two keys') && !/\{\{[A-Z_]+\}\}/.test(p3), 'WF-3 QC v2: pruned card with the dark variant, no fallback paragraph, no unrendered tokens');
const qc3v1 = promptOf(qc3Run(editGen, peLegacy, templatesV1));
check(qc3v1.includes(fallbackHead) && !/handle|@/i.test(qc3v1), 'WF-3 QC v1 template: hard-coded fallback paragraph kept, handle demand still dropped');
const qc3Engine = qc3Run(editGen, { magic_prompt_json: { text: { lines: [{ role: 'headline', text: 'FAMILY FOREVER' }] }, subject: { text: 'goat' } } }, templatesV2);
check(qc3Engine.expected_text === 'FAMILY FOREVER' && qc3Engine.expected_subject === 'goat', 'WF-3 QC: the engine text slot is used as-is (no swap) and its SUBJECT block wins');
const qc3Card = qc3Run({ ...editGen, brief_snapshot: { print_text: editGen.brief_snapshot.print_text }, cards: { ...editGen.cards, client_submission: { source: 'style_test', subject: 'Highland cow' } } }, peLegacy, templatesV2);
check(qc3Card.expected_subject === 'Highland cow' && promptOf(qc3Card).includes('EXPECTED SUBJECT: "Highland cow"'), 'WF-3 QC v2: cards.client_submission.subject is the fallback when neither the engine nor the brief snapshot names a subject');
const getGenUrl = (nodes) => String((nodes.find((n) => n.name === 'Get Generation') || { parameters: {} }).parameters.url || '');
const embedsSubmission = (url) => /cards!generations_card_id_fkey\([^)]*\bclient_submission\b[^)]*\)/.test(url);
check(embedsSubmission(getGenUrl(wf2Nodes)) && embedsSubmission(getGenUrl(wf3Nodes)), 'WF-2 and WF-3 Get Generation embed cards(client_submission), so the fallback can fire in both lanes');

// ---- Build Corrective Prompt ----------------------------------------------------------------------------------------------------
const corrCode = jsCode('Build Corrective Prompt');
const master = 'MASTER PROMPT ... flat grey background, no shadows.';
const orig = { body: { model: 'gpt-image-2-5-sunburst-image-to-image', input: { prompt: master + '\n', input_urls: ['u'], aspect_ratio: '1:1', resolution: '2K', background: 'opaque' } }, attempt: 1, input_roles: ['style_reference'] };
const corrRun = (judge, textLines) => run(corrCode, { 'Build Create Task': [orig], 'QC Judge': [judge], 'Build QC Request': [{ text_lines: textLines }], 'Get QC Templates': templatesV1 }, [{}]).json;
const failedChecks = [{ id: 'text_matches', name: 'text_matches', pass: false, note: 'Spell the text exactly "FAMILY FIRST"' }, { id: 'no_halos', name: 'no_halos', pass: false, note: 'Remove the white halo around the letters' }, { id: 'background_ok', name: 'background_ok', pass: true, note: '' }];
const HEAD = 'CRITICAL CORRECTIONS - a previous attempt failed quality inspection. Fix ALL of the following while keeping everything else identical: ';
const TAIL = '. The ONLY text in the image must read exactly: "FAMILY FIRST" - spelled letter for letter (F A M I L Y   F I R S T) - with no other words, watermarks or signatures anywhere.';
const NO_TEXT_TAIL = '. The image must contain NO text at all - no words, letters, watermarks or signatures.';
// (1) no corrective_instruction from qc-judge -> today's rebuild from the failed checks + style_violations
const corr = corrRun({ qc_report: { checks: failedChecks, style_violations: ['gradient on the badge'], corrective_instruction: null }, needs_regen: true }, ['FAMILY FIRST']);
check(corr.corrective_suffix === HEAD + 'Spell the text exactly "FAMILY FIRST"; Remove the white halo around the letters; gradient on the badge' + TAIL, 'corrective without corrective_instruction: rebuilt from failed checks + style_violations (EXTRACT §3.9 wording, {{EXPECTED_TEXT_SPACED}} rendered)');
check(corr.body.input.prompt === master + '\n\n' + corr.corrective_suffix, 'corrective: exactly one blank line between the master prompt and CRITICAL CORRECTIONS');
check(corr.attempt === 2 && corr.body.input.input_urls[0] === 'u' && corr.body.model === orig.body.model, 'corrective: attempt 2, same model and inputs as the first attempt');
// (2) qc-judge corrective_instruction present, in the full-paragraph shape qc.ts buildCorrective emits (incl. the subject correction) -> it is what WF-2 appends, wrapped ONCE by the template
const judgeCi = HEAD + 'Spell the text exactly "FAMILY FIRST"; Draw Highland cow as the hero, not a chicken; the text is lettering only and never chooses the subject' + TAIL;
const corrCi = corrRun({ qc_report: { checks: failedChecks, style_violations: ['gradient on the badge'], corrective_instruction: judgeCi }, needs_regen: true, corrective_instruction: judgeCi }, ['FAMILY FIRST']);
check(corrCi.corrective_suffix === HEAD + 'Spell the text exactly "FAMILY FIRST"; Draw Highland cow as the hero, not a chicken; the text is lettering only and never chooses the subject' + TAIL, 'corrective with corrective_instruction: ISSUES = qc-judge\'s corrective_instruction (its head/tail stripped, the template wraps it once); the checks rebuild is not used');
check((corrCi.corrective_suffix.match(/CRITICAL CORRECTIONS/g) || []).length === 1 && (corrCi.corrective_suffix.match(/The ONLY text/g) || []).length === 1 && !corrCi.corrective_suffix.includes('..'), 'corrective with corrective_instruction: exactly one head, one exact-text tail, no double period');
// (3) issues-only corrective_instruction (ends with a period) -> used as ISSUES, trailing period stripped
const corrShort = corrRun({ qc_report: { checks: [], style_violations: [], corrective_instruction: 'Draw Highland cow as the hero, not a chicken.' }, needs_regen: true }, ['FAMILY FIRST']);
check(corrShort.corrective_suffix === HEAD + 'Draw Highland cow as the hero, not a chicken' + TAIL, 'corrective with an issues-only corrective_instruction: used as ISSUES, no double period');
// (4) no text, no issues -> EXTRACT §3.9 fallback wording
const corrNone = corrRun({ qc_report: { checks: [], style_violations: [] } }, []);
check(corrNone.corrective_suffix === HEAD + 'render the text perfectly, keep the background one flat solid grey, remove all shadows' + NO_TEXT_TAIL, 'corrective no text + no issues: EXTRACT §3.9 fallback wording verbatim');
// (5) no text, qc-judge paragraph carrying its own no-text tail -> stripped, then the template's no-text variant is applied once
const corrNoneCi = corrRun({ qc_report: { checks: [], style_violations: [], corrective_instruction: HEAD + 'Remove the stray marks' + NO_TEXT_TAIL } }, []);
check(corrNoneCi.corrective_suffix === HEAD + 'Remove the stray marks' + NO_TEXT_TAIL, 'corrective no text + judge paragraph: no-text tail stripped and re-added once by the template variant');

// ---- List Input Paths / Build Create Task ------------------------------------------------------------------------
const pe = { rendered_prompt: 'PROMPT with Image 1-2: style/subject references for this design; Image 3: examples of the client\'s established look.', model: 'gpt-image-2-5-sunburst-image-to-image', aspect_ratio: '4:5', resolution: '2K', input_paths: [{ bucket: 'refs', path: 'c/k/1.png', role: 'style_reference' }, { bucket: 'refs', path: 'refs/c/k/2.png', role: 'style_reference' }, { bucket: 'refs', path: 'c/library/a.png', role: 'client_look' }] };
const listed = run(jsCode('List Input Paths'), { 'Get Generation': [genWithText] }, [pe]).map((i) => i.json);
check(JSON.stringify(listed.map((i) => [i.bucket, i.path, i.role, i.index])) === JSON.stringify([['refs', 'c/k/1.png', 'style_reference', 1], ['refs', 'c/k/2.png', 'style_reference', 2], ['refs', 'c/library/a.png', 'client_look', 3]]), 'List Input Paths: reads the engine input_paths plan (card refs + client_look library refs), strips a bucket prefix');
const editPe = { input_paths: [{ bucket: 'gens', path: 'c/prev.png', role: 'previous_version' }, { bucket: 'gens', path: 'c/mask.png', role: 'mask' }] };
const listedEdit = run(jsCode('List Input Paths'), { 'Get Generation': [{ cards: { reference_paths: ['c/k/1.png'] } }] }, [editPe]).map((i) => i.json);
check(listedEdit.length === 2 && listedEdit[0].bucket === 'gens' && listedEdit[0].role === 'previous_version' && listedEdit[1].role === 'mask', 'List Input Paths: edit plan (gens bucket previous_version + mask) is not replaced by card refs');
const listedFallback = run(jsCode('List Input Paths'), { 'Get Generation': [{ cards: { reference_paths: ['refs/c/k/1.png'] } }] }, [{}]).map((i) => i.json);
check(listedFallback.length === 1 && listedFallback[0].path === 'c/k/1.png' && listedFallback[0].role === 'style_reference', 'List Input Paths: card reference_paths fallback only when the plan is empty');

const signed = listed.map((it) => ({ signedURL: '/object/sign/' + it.bucket + '/' + it.path + '?token=redacted' }));
const created = run(jsCode('Build Create Task'), { Config: [cfg], 'Load Config': [cfg], 'Prompt Engine': [pe], 'List Input Paths': listed }, signed).json;
check(created.body.input.prompt === pe.rendered_prompt, 'Build Create Task: rendered_prompt sent as-is (no role strings appended)');
check(created.body.input.input_urls.length === 3 && created.body.input.aspect_ratio === '4:5' && created.body.input.background === 'opaque' && created.body.callBackUrl === 'https://n8n.example/webhook-waiting/1', 'Build Create Task: all planned inputs signed, aspect/resolution from the engine, callback = resume URL');
check(!('text_lines' in created), 'Build Create Task: no text_lines expectation on the engine reply');

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
