#!/usr/bin/env node
// Unit test for the prompt text WF-2 sends to the vision QC model and to Kie on the corrective pass.
// It parses ../wf2-generate.sdk.js with the real SDK, pulls the jsCode of the Code nodes and runs it under mocked n8n
// globals ($, $input) against the VERBATIM seeded templates (qc_prompt / corrective_suffix bodies from
// ../../supabase/migrations/20260924_prompt_templates_v1.sql). Usage: node test-wf2-prompts.js
const fs = require('fs');
const path = require('path');
const { parseWorkflowCodeToBuilder } = require('@n8n/workflow-sdk');

const sdkFile = path.resolve(__dirname, '..', 'wf2-generate.sdk.js');
const raw = fs.readFileSync(sdkFile, 'utf8').split('\n').filter((l) => !/^\s*import\s.*from\s+['"]@n8n\/workflow-sdk['"]/.test(l)).join('\n');
const nodes = parseWorkflowCodeToBuilder(raw).toJSON().nodes;
const jsCode = (name) => { const n = nodes.find((x) => x.name === name); if (!n) throw new Error('node not found: ' + name); return String(n.parameters.jsCode); };

const migration = fs.readFileSync(path.resolve(__dirname, '..', '..', 'supabase', 'migrations', '20260924_prompt_templates_v1.sql'), 'utf8');
const seeded = (slug) => { const m = migration.match(new RegExp("\\('" + slug + "', 1, \\$body\\$([\\s\\S]*?)\\$body\\$, true\\)")); if (!m) throw new Error('template not seeded: ' + slug); return m[1]; };
const templates = [{ slug: 'qc_prompt', version: 1, body: seeded('qc_prompt') }, { slug: 'corrective_suffix', version: 1, body: seeded('corrective_suffix') }];

function run(code, nodeData, inputItems) {
  const items = (arr) => arr.map((json) => ({ json }));
  const $ = (name) => { if (!(name in nodeData)) throw new Error('unmocked node ' + name); const arr = nodeData[name]; return { first: () => ({ json: arr[0] }), all: () => items(arr) }; };
  const $input = { first: () => ({ json: inputItems[0] }), all: () => items(inputItems) };
  return new Function('$', '$input', '$json', '$execution', code)($, $input, inputItems[0], { resumeUrl: 'https://n8n.example/webhook-waiting/1' });
}

let failures = 0;
const check = (cond, msg) => { if (cond) console.log('ok   ' + msg); else { failures++; console.log('FAIL ' + msg); } };

const cfg = { sbUrl: 'https://voatrqhfsdfjomyajovi.supabase.co', anonKey: 'redacted', generationId: 'g', cardId: 'c', imagePath: 'c/g.png' };
const signResult = { signedURL: '/object/sign/gens/c/g.png?token=redacted' };
const styleCard = { medium: 'screen-print', palette: [{ name: 'ink', hex: '#1C1B1A', weight: 'dominant' }], forbid: ['gradients'] };
const genWithText = { id: 'g', attempt: 1, style_card_snapshot: styleCard, brief_snapshot: null, cards: { print_text: [{ role: 'headline', text: 'FAMILY FIRST' }, { role: 'sub', text: 'EST 2019' }], garment_color: 'black', reference_paths: [] } };
const genNoText = { ...genWithText, cards: { ...genWithText.cards, print_text: [] } };

// ---- Build QC Request -------------------------------------------------------------------------------------------
const qcCode = jsCode('Build QC Request');
const qcText = run(qcCode, { Config: [cfg], 'Get Generation': [genWithText], 'Sign Result': [signResult] }, templates);
const qcPrompt = qcText.json.body.messages[0].content[0].text;
check(qcPrompt.includes('EXPECTED ON-DESIGN TEXT: """FAMILY FIRST\nEST 2019"""'), 'QC with text: EXPECTED line = template triple quotes around the bare joined lines (EXTRACT §3.8)');
check(!/""""/.test(qcPrompt), 'QC with text: no doubled quote marks');
check(qcPrompt.startsWith('You are a strict print-on-demand quality inspector. Inspect the attached generated design image.\n\nEXPECTED ON-DESIGN TEXT: """'), 'QC with text: verbatim opening kept');
check(qcPrompt.includes('9. edges_clean:') && qcPrompt.includes('pass must be true ONLY if every single check is satisfied.'), 'QC with text: 9 checks + verdict schema kept verbatim');
check(qcPrompt.includes('STYLE CARD (locked JSON for this client - report any palette or style violation):\n' + JSON.stringify(styleCard)), 'QC with text: Style Card JSON appended (seed has no STYLE_CARD_JSON token)');
check(!/\{\{[A-Z_]+\}\}/.test(qcPrompt), 'QC with text: no unrendered {{TOKENS}}');
check(JSON.stringify(qcText.json.text_lines) === JSON.stringify(['FAMILY FIRST', 'EST 2019']) && qcText.json.body.messages[0].content[1].image_url.url.endsWith('token=redacted'), 'QC with text: text_lines + signed image URL returned');

const qcNone = run(qcCode, { Config: [cfg], 'Get Generation': [genNoText], 'Sign Result': [signResult] }, templates).json.body.messages[0].content[0].text;
check(qcNone.includes('\n\nEXPECTED ON-DESIGN TEXT: (none - the image must contain NO text at all)\n\n'), 'QC no text: whole EXPECTED line replaced by the verbatim (none ...) variant');
check(!qcNone.includes('"""'), 'QC no text: no triple quotes left');
check(qcNone.replace('EXPECTED ON-DESIGN TEXT: (none - the image must contain NO text at all)', 'X') === qcPrompt.replace('EXPECTED ON-DESIGN TEXT: """FAMILY FIRST\nEST 2019"""', 'X'), 'QC no text: only the EXPECTED line differs from the with-text variant');

const snapGen = { ...genWithText, brief_snapshot: { print_text: [{ role: 'headline', text: 'SNAPSHOT LINE' }] } };
const qcSnap = run(qcCode, { Config: [cfg], 'Get Generation': [snapGen], 'Sign Result': [signResult] }, templates).json;
check(qcSnap.expected_text === 'SNAPSHOT LINE', 'QC: brief_snapshot.print_text wins over cards.print_text (same source as prompt-engine)');

// ---- Build Corrective Prompt ------------------------------------------------------------------------------------
const corrCode = jsCode('Build Corrective Prompt');
const master = 'MASTER PROMPT ... flat grey background, no shadows.';
const orig = { body: { model: 'gpt-image-2-5-sunburst-image-to-image', input: { prompt: master + '\n', input_urls: ['u'], aspect_ratio: '1:1', resolution: '2K', background: 'opaque' } }, attempt: 1, input_roles: ['style_reference'] };
const judge = { qc_report: { checks: [{ id: 'text_matches', name: 'text_matches', pass: false, note: 'Spell the text exactly "FAMILY FIRST"' }, { id: 'no_halos', name: 'no_halos', pass: false, note: 'Remove the white halo around the letters' }, { id: 'background_ok', name: 'background_ok', pass: true, note: '' }], style_violations: ['gradient on the badge'], corrective_instruction: 'x' }, needs_regen: true };
const corr = run(corrCode, { 'Build Create Task': [orig], 'QC Judge': [judge], 'Build QC Request': [{ text_lines: ['FAMILY FIRST'] }], 'Get QC Templates': templates }, [{}]).json;
const expectedSuffix = 'CRITICAL CORRECTIONS - a previous attempt failed quality inspection. Fix ALL of the following while keeping everything else identical: Spell the text exactly "FAMILY FIRST"; Remove the white halo around the letters; gradient on the badge. The ONLY text in the image must read exactly: "FAMILY FIRST" - spelled letter for letter (F A M I L Y   F I R S T) - with no other words, watermarks or signatures anywhere.';
check(corr.corrective_suffix === expectedSuffix, 'corrective with text: EXTRACT §3.9 wording, {{EXPECTED_TEXT_SPACED}} rendered, no unrendered tokens');
check(corr.body.input.prompt === master + '\n\n' + expectedSuffix, 'corrective with text: exactly one blank line between the master prompt and CRITICAL CORRECTIONS');
check(corr.attempt === 2 && corr.body.input.input_urls[0] === 'u' && corr.body.model === orig.body.model, 'corrective: attempt 2, same model and inputs as the first attempt');

const corrNone = run(corrCode, { 'Build Create Task': [orig], 'QC Judge': [{ qc_report: { checks: [], style_violations: [] } }], 'Build QC Request': [{ text_lines: [] }], 'Get QC Templates': templates }, [{}]).json;
check(corrNone.corrective_suffix === 'CRITICAL CORRECTIONS - a previous attempt failed quality inspection. Fix ALL of the following while keeping everything else identical: render the text perfectly, keep the background one flat solid grey, remove all shadows. The image must contain NO text at all - no words, letters, watermarks or signatures.', 'corrective no text + no issues: EXTRACT §3.9 fallback wording verbatim');

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
const created = run(jsCode('Build Create Task'), { Config: [cfg], 'Prompt Engine': [pe], 'List Input Paths': listed }, signed).json;
check(created.body.input.prompt === pe.rendered_prompt, 'Build Create Task: rendered_prompt sent as-is (no role strings appended)');
check(created.body.input.input_urls.length === 3 && created.body.input.aspect_ratio === '4:5' && created.body.input.background === 'opaque' && created.body.callBackUrl === 'https://n8n.example/webhook-waiting/1', 'Build Create Task: all planned inputs signed, aspect/resolution from the engine, callback = resume URL');
check(!('text_lines' in created), 'Build Create Task: no text_lines expectation on the engine reply');

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
