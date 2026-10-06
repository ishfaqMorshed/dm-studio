#!/usr/bin/env node
// Unit test for the WF-3 Fix an area lane (2026-10-05, user decision: GPT Image 2.5 Sunburst on OpenRouter, locked outside).
// It parses ../wf3-edit.sdk.js (AFTER) and ../ops/before/wf3-edit.sdk.js (BEFORE = live 1fbb0856) with the real SDK, pulls the jsCode
// of the Code nodes and the expressions of the HTTP nodes and runs them under mocked n8n globals ($, $input, $json) - same harness
// style as test-wf2-prompts.js. Covers: Build Edit Task (Kie Sunburst body for a region, Nano Banana byte for byte otherwise), Save
// Vendor Job (model from Build Edit Task), Build OpenRouter Image (the probe body - checked against the body the probe workflow
// docs/region-edit/probe/wf-probe.sdk.js built for its variant A_mask, for all three probe cases), Region QC Prompt (the REGION EDIT
// paragraph of the architect plan CONTRACTS F4, the previous version as the SECOND image, pass-through for edit_text), Fail Message
// (no OpenRouter prefix on Region composite errors), Edit Context rawPath, the three new HTTP nodes, the wiring, the 7 removed nodes,
// the 20-line rule and quote-free top-level comments. The escaping audit of wf3-edit.sdk.js runs in test-wf2-prompts.js.
// Usage: node test-wf3-region.js
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { parseWorkflowCodeToBuilder } = require('@n8n/workflow-sdk');
const { templateFromSql } = require('./template-from-migrations.js');

const stripImport = (raw) => raw.split('\n').filter((l) => !/^\s*import\s.*from\s+['"]@n8n\/workflow-sdk['"]/.test(l)).join('\n');
const parse = (raw) => parseWorkflowCodeToBuilder(stripImport(raw)).toJSON();
const AFTER_FILE = path.resolve(__dirname, '..', 'wf3-edit.sdk.js');
const BEFORE_FILE = path.resolve(__dirname, '..', 'ops', 'before', 'wf3-edit.sdk.js');
const PROBE_FILE = path.resolve(__dirname, '..', '..', 'docs', 'region-edit', 'probe', 'wf-probe.sdk.js');
const afterSrc = fs.readFileSync(AFTER_FILE, 'utf8');
const after = parse(afterSrc), before = parse(fs.readFileSync(BEFORE_FILE, 'utf8'));
const nodeOf = (wf, name) => { const n = wf.nodes.find((x) => x.name === name); if (!n) throw new Error('node not found: ' + name); return n; };
const codeOf = (wf, name) => String(nodeOf(wf, name).parameters.jsCode);

let failures = 0;
const check = (cond, msg) => { if (cond) console.log('ok   ' + msg); else { failures++; console.log('FAIL ' + msg); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// $ mock: first() / all() throw for an unmocked node; isExecuted = the node has data
function mock$(data) {
  return (name) => ({
    get isExecuted() { return name in data; },
    first: () => { if (!(name in data)) throw new Error('unmocked node ' + name); return { json: data[name][0] }; },
    all: () => { if (!(name in data)) throw new Error('unmocked node ' + name); return data[name].map((json) => ({ json })); }
  });
}
function run(code, data, inputItems) {
  const items = inputItems.map((json) => ({ json }));
  const $input = { first: () => items[0], all: () => items };
  return new Function('$', '$input', '$json', code)(mock$(data), $input, inputItems[0]);
}
// an n8n parameter value: "={{ expr }}" (single expression) or "=text {{ expr }} text" (template)
function evalParam(value, data, $json) {
  const s = String(value);
  if (!s.startsWith('=')) return s;
  const $ = mock$(data);
  const ev = (e) => new Function('$', '$json', '$now', '$execution', 'return (' + e + ');')($, $json || {}, { toISO: () => '2026-10-05T12:00:00.000Z' }, { id: 'e1' });
  const single = s.match(/^=\{\{([\s\S]*)\}\}$/);
  if (single && !/\}\}[\s\S]*\{\{/.test(s)) return ev(single[1]);
  return s.slice(1).replace(/\{\{([\s\S]*?)\}\}/g, (m, e) => String(ev(e)));
}
const headersOf = (n) => Object.fromEntries(((n.parameters.headerParameters || {}).parameters || []).map((h) => [h.name, h.value]));

// ---- fixtures ------------------------------------------------------------------------------------------------------------------
const SB = 'https://voatrqhfsdfjomyajovi.supabase.co';
const cfg = { sbUrl: SB, anonKey: 'anon-redacted', studioSecret: 'secret-redacted', openrouterKey: 'or-redacted' };
const ctxRegion = { generationId: 'g', cardId: 'c', kind: 'edit_region', executionId: 'e1', imagePath: 'c/g.png', rawPath: 'c/g.raw.png' };
const ctxText = { ...ctxRegion, kind: 'edit_text' };
const cases = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', 'docs', 'region-edit', 'probe', 'cases.json'), 'utf8'));
const PCT = { b33727a9: { x0: 40, x1: 70, y0: 28, y1: 43 }, '45eadf6a': { x0: 44, x1: 83, y0: 37, y1: 51 }, dace73f3: { x0: 49, x1: 72, y0: 50, y1: 67 } };

// the probe bodies: run the Probe Cases Code node of the probe workflow with every probe path signed
let probe = null;
if (fs.existsSync(PROBE_FILE)) {
  const pwf = parse(fs.readFileSync(PROBE_FILE, 'utf8'));
  const pcode = codeOf(pwf, 'Probe Cases');
  const paths = new Set();
  for (const c of Object.values(cases)) { paths.add(c.parent_path); for (const k of ['mask', 'marked']) paths.add(c.out_prefix + '_' + k + '.png'); }
  const signedRows = [...paths].map((p) => ({ path: p, signedURL: '/object/sign/gens/' + p + '?token=probe' }));
  probe = Object.fromEntries(run(pcode, { 'Load Config': [cfg] }, [{ signed: signedRows }]).map((i) => [i.json.key, i.json.body]));
}
check(probe && Object.keys(probe).length === 9 && probe.b33727a9_A_mask && probe.b33727a9_A_mask.model === 'openai/gpt-image-2.5-sunburst', 'probe workflow parsed: 9 probe bodies rebuilt from docs/region-edit/probe/wf-probe.sdk.js (Probe Cases)');

const signedPath = (p) => '/object/sign/gens/' + p + '?token=probe';
function regionFixture(cid, overrides) {
  const c = cases[cid], body = probe[cid + '_A_mask'];
  const rect = Object.assign({}, c.rect, { width: c.size[0], height: c.size[1] });
  const region = Object.assign({ rect, pct: PCT[cid], where: c.where, prompt: body.prompt, mask_attached: true, kie_model: 'gpt-image-2-5-sunburst-image-to-image', openrouter_model: 'openai/gpt-image-2.5-sunburst', resolution: '1K', aspect_ratio: '1:1', quality: 'high' }, overrides || {});
  const plan = [{ path: c.parent_path, role: 'previous_version', bucket: 'gens', index: 1 }, { path: c.out_prefix + '_mask.png', role: 'mask', bucket: 'gens', index: 2 }];
  const signed = plan.map((p) => ({ signedURL: signedPath(p.path) }));
  const pe = { generation_id: 'g', kind: 'edit_region', base: 'parent', platform: 'openrouter', model: 'openai/gpt-image-2.5-sunburst', aspect_ratio: '1:1', resolution: region.resolution, rendered_prompt: region.prompt, magic_prompt_json: { edit: '...' }, input_paths: plan.map((p) => ({ bucket: p.bucket, path: p.path, role: p.role })), openrouter_models: { vision: 'google/gemini-3.1-pro-preview', image: 'openai/gpt-image-2.5-sunburst', edit: 'google/gemini-2.5-flash-image', region: 'openai/gpt-image-2.5-sunburst', text: 'anthropic/claude-sonnet-4.6' }, region };
  return { c, body, region, plan, signed, pe, urls: signed.map((s) => SB + '/storage/v1' + s.signedURL) };
}
const F = regionFixture('b33727a9');

// ---- Build Edit Task -------------------------------------------------------------------------------------------------------------
const betNew = codeOf(after, 'Build Edit Task'), betOld = codeOf(before, 'Build Edit Task');
const betRun = (code, pe, plan, signed) => run(code, { 'Load Config': [cfg], 'Prompt Engine': [pe], 'List Input Paths': plan, 'Get Generation': [{ attempt: 1 }] }, signed).json;
const betR = betRun(betNew, F.pe, F.plan, F.signed);
check(same(betR.body, { model: 'gpt-image-2-5-sunburst-image-to-image', input: { prompt: F.region.prompt, input_urls: F.urls, aspect_ratio: '1:1', resolution: '1K', background: 'opaque' } }), 'Build Edit Task region: Kie Sunburst body {model gpt-image-2-5-sunburst-image-to-image, input {prompt = region.prompt, input_urls [design, mask], aspect_ratio 1:1, resolution 1K, background opaque}}');
check(betR.region === true && betR.has_mask === true && same(betR.input_roles, ['previous_version', 'mask']) && betR.attempt === 1, 'Build Edit Task region: output region true, has_mask true, input_roles [previous_version, mask], attempt 1');
check(!betR.body.input.prompt.includes('The second image is a black-and-white mask') && (betR.body.input.prompt.match(/black-and-white mask/g) || []).length === 1 && betR.body.input.prompt.endsWith(' Image 2 is a black-and-white mask of the same size - the WHITE rectangle marks the only area that may change; everything black must stay identical.'), 'Build Edit Task region: no extra Nano Banana mask sentence - the region prompt names the mask once, as Image 2');
const betR2k = betRun(betNew, { ...F.pe, resolution: '2K', region: { ...F.region, resolution: '2K' } }, F.plan, F.signed);
check(betR2k.body.input.resolution === '2K', 'Build Edit Task region: resolution follows region.resolution (2K for a 2048 px parent on Kie)');
const textPe = { kind: 'edit_text', rendered_prompt: 'Change the headline lettering so it reads exactly "FAMILY FOREVER".', aspect_ratio: '1:1', resolution: '2K', region: null };
const prevOnly = F.plan.slice(0, 1), prevSigned = F.signed.slice(0, 1);
const betT = betRun(betNew, textPe, prevOnly, prevSigned), betTOld = betRun(betOld, textPe, prevOnly, prevSigned);
const minusRegion = (o) => { const x = { ...o }; delete x.region; return x; };
check(same(minusRegion(betT), betTOld) && betT.region === false && betT.body.model === 'google/nano-banana-edit', 'Build Edit Task edit_text: output deep-equals the live (BEFORE) node for the same inputs, plus region false');
const betTM = betRun(betNew, textPe, F.plan, F.signed), betTMOld = betRun(betOld, textPe, F.plan, F.signed);
check(same(minusRegion(betTM), betTMOld) && betTM.body.input.prompt.includes('The second image is a black-and-white mask of the first image') && same(betTM.body.input.image_urls, F.urls), 'Build Edit Task with a planned mask and no region block (edit_text, or edit_region from an older prompt-engine): byte for byte the live Nano Banana body incl. the mask sentence');

// ---- Save Vendor Job: model from Build Edit Task -----------------------------------------------------------------------------------
const svj = nodeOf(after, 'Save Vendor Job').parameters.jsonBody;
const svjR = JSON.parse(evalParam(svj, { 'Create Edit Task': [{ data: { taskId: 't1' } }], 'Build Edit Task': [betR] }));
const svjT = JSON.parse(evalParam(svj, { 'Create Edit Task': [{ data: { taskId: 't1' } }], 'Build Edit Task': [betT] }));
const svjOld = JSON.parse(evalParam(nodeOf(before, 'Save Vendor Job').parameters.jsonBody, { 'Create Edit Task': [{ data: { taskId: 't1' } }] }));
check(svjR.model === 'gpt-image-2-5-sunburst-image-to-image' && same(svjT, svjOld) && same(Object.keys(svjR), ['vendor_job_id', 'vendor', 'model', 'status']), 'Save Vendor Job: model = Build Edit Task body.model (Sunburst for a region; edit_text body identical to the live literal google/nano-banana-edit)');

// ---- Build OpenRouter Image ----------------------------------------------------------------------------------------------------
const borNew = codeOf(after, 'Build OpenRouter Image'), borOld = codeOf(before, 'Build OpenRouter Image');
const borRun = (code, pe, $json, bet) => run(code, { 'Prompt Engine': [pe], 'Build Edit Task': [bet] }, [$json]).json.body;
const KEYS = ['model', 'prompt', 'input_references', 'aspect_ratio', 'quality', 'background', 'n'];
const borR = borRun(borNew, F.pe, betR, betR);
check(same(Object.keys(borR), KEYS) && borR.model === 'openai/gpt-image-2.5-sunburst' && borR.quality === 'high' && borR.n === 1 && borR.background === 'opaque' && borR.aspect_ratio === '1:1' && borR.input_references.length === 2, 'Build OpenRouter Image region (from Image Platform?): exactly the keys ' + KEYS.join(',') + ', model openai/gpt-image-2.5-sunburst, quality high, n 1, two input_references');
for (const cid of Object.keys(cases)) {
  const f = regionFixture(cid);
  const bet = betRun(betNew, f.pe, f.plan, f.signed);
  const b = borRun(borNew, f.pe, bet, bet);
  check(JSON.stringify(b) === JSON.stringify(f.body), 'Build OpenRouter Image region ' + cid + ': the request body is byte-identical (JSON) to the probe body ' + cid + '_A_mask that measured shift 0');
}
check(same(borRun(borNew, F.pe, { body: betR.body }, betR), borR) && same(borRun(borNew, F.pe, { code: 500, msg: 'server busy' }, betR), borR) && same(borRun(borNew, F.pe, { error: { message: 'Kie down' } }, betR), borR), 'Build OpenRouter Image region via Kie Image Down? (a Kie body with input_urls, a Task Created? false item, a Create Edit Task error item): the same body');
const borCustom = borRun(borNew, { ...F.pe, openrouter_models: { ...F.pe.openrouter_models, region: 'openai/gpt-image-2.5-custom' }, region: { ...F.region, openrouter_model: undefined } }, betR, betR);
check(borCustom.model === 'openai/gpt-image-2.5-custom', 'Build OpenRouter Image region: settings openrouter_models.region is used when the region block names no model');
const betTOr = betRun(betNew, { ...textPe, openrouter_models: { edit: 'google/gemini-2.5-flash-image' } }, F.plan, F.signed);
const borT = borRun(borNew, { ...textPe, openrouter_models: { edit: 'google/gemini-2.5-flash-image' } }, betTOr, betTOr);
const borTOld = borRun(borOld, { ...textPe, openrouter_models: { edit: 'google/gemini-2.5-flash-image' } }, betTOr, betTOr);
check(JSON.stringify(borT) === JSON.stringify(borTOld) && borT.model === 'google/gemini-2.5-flash-image' && borT.resolution === '2K' && borT.input_references.length === 2, 'Build OpenRouter Image edit_text: byte-identical to the live node (Nano Banana model, resolution, output_format png)');
const mark = JSON.parse(evalParam(nodeOf(after, 'Mark OpenRouter').parameters.jsonBody, { 'Build OpenRouter Image': [{ body: borR }] }));
check(mark.model === 'openai/gpt-image-2.5-sunburst' && mark.vendor === 'openrouter', 'Mark OpenRouter (unchanged node): stores model openai/gpt-image-2.5-sunburst for a region');

// ---- Region QC Prompt ------------------------------------------------------------------------------------------------------------
const PARA_TPL = 'REGION EDIT - this design is a targeted edit of its previous version. Only the area from {x0}% to {x1}% across and {y0}% to {y1}% down the image was asked to change, with this instruction: "{instruction}". Pixels just around that area may be softly blended. {prev}The colours and objects this instruction asks for are intended - never report them as a palette, subject or forbid problem. Add a key "region" to your JSON: {"instruction_done":true|false (the requested change is clearly done inside that area),"seam_visible":true|false (a visible edge, step, colour jump, halo or ghosted or duplicated shape along the border of that area),"object_cut_off":true|false (the new or changed element is sliced, cropped or fades out at the border of that area),"text_changed":true|false|null ({lettering}; null when no lettering lies inside or touches that area),"notes":"<= 25 words"}. This key never changes "pass" or the 9 checks.';
const para = (p, instruction, prevAttached) => PARA_TPL.replace('{x0}', p.x0).replace('{x1}', p.x1).replace('{y0}', p.y0).replace('{y1}', p.y1).replace('{instruction}', instruction)
  .replace('{prev}', prevAttached ? 'The SECOND image is the previous version, for comparison only - judge every check above on the FIRST image. ' : '')
  .replace('{lettering}', prevAttached ? 'any lettering differs from the previous version' : 'any lettering looks altered');
const migration = fs.readFileSync(path.resolve(__dirname, '..', '..', 'supabase', 'migrations', '20260924_prompt_templates_v1.sql'), 'utf8');
const templatesV1 = [{ slug: 'qc_prompt', version: 1, body: templateFromSql(migration, 'qc_prompt', 1) }, { slug: 'corrective_suffix', version: 1, body: templateFromSql(migration, 'corrective_suffix', 1) }];
const NEW_URL = SB + '/storage/v1/object/sign/gens/c/g.png?token=new', PREV_URL = F.urls[0];
const genRegion = { id: 'g', kind: 'edit_region', attempt: 1, edit_instruction: 'change the sunglass color to red', mask_rect: F.region.rect, style_card_snapshot: { palette: [], rules: { palette_mode: 'strict' } }, brief_snapshot: { print_text: [{ role: 'headline', text: 'SUN CLUB' }] }, cards: { print_text: [], garment_color: 'black' } };
const qcOut = run(codeOf(after, 'Build QC Request'), { 'Load Config': [cfg], 'Get Generation': [genRegion], 'Sign Result': [{ signedURL: '/object/sign/gens/c/g.png?token=new' }], 'Prompt Engine': [F.pe] }, templatesV1).json;
const rqpCode = codeOf(after, 'Region QC Prompt');
const rqpRun = (ctx, pe, gen, signed, qc) => run(rqpCode, { 'Edit Context': [ctx], 'Prompt Engine': [pe], 'Get Generation': [gen], 'Sign Input': signed, 'Load Config': [cfg] }, [qc]);
const qcCopy = JSON.parse(JSON.stringify(qcOut));
const textIn = [{ json: qcOut }];
const rqpText = run(rqpCode, { 'Edit Context': [ctxText], 'Prompt Engine': [textPe] }, [qcOut]);
check(same(rqpText, textIn) && rqpText[0].json === qcOut, 'Region QC Prompt edit_text: output deep-equals its input (the same item, untouched)');
const rqpOld = run(rqpCode, { 'Edit Context': [ctxRegion], 'Prompt Engine': [{ ...F.pe, region: null }] }, [qcOut]);
check(same(rqpOld, textIn), 'Region QC Prompt edit_region without a region block (prompt-engine before v8.1): pass-through');
const rqp = rqpRun(ctxRegion, F.pe, genRegion, F.signed, qcOut);
const rq = rqp[0].json, content = rq.body.messages[0].content, P1 = para(PCT.b33727a9, 'change the sunglass color to red', true);
check(Array.isArray(rqp) && rqp.length === 1 && content[0].text === qcOut.body.messages[0].content[0].text + '\n\n' + P1 && content[0].text.endsWith(P1), 'Region QC Prompt edit_region: the Build QC Request text + a blank line + the CONTRACTS F4 paragraph with 40/70/28/43 and the instruction');
check(content.length === 3 && content.map((x) => x.type).join(',') === 'text,image_url,image_url' && content[1].image_url.url === NEW_URL && content[2].image_url.url === PREV_URL, 'Region QC Prompt edit_region: content = [text, the new design, the previous version (Sign Input item 0 signed URL)]');
check(same(rq.region, { pct: PCT.b33727a9, instruction: 'change the sunglass color to red', previous_attached: true }) && same(rq.text_lines, qcOut.text_lines) && rq.image_url === qcOut.image_url && rq.template_version === qcOut.template_version && same(rq.body.response_format, { type: 'json_object' }), 'Region QC Prompt edit_region: output region {pct, instruction, previous_attached true}, the other Build QC Request keys kept');
check(same(qcOut, qcCopy), 'Region QC Prompt never mutates the Build QC Request item (deep copy)');
check(['instruction_done', 'seam_visible', 'object_cut_off', 'text_changed', 'notes'].every((k) => P1.includes('"' + k + '":')) && P1.includes('Add a key "region" to your JSON'), 'Region QC Prompt: asks for the region key with the 5 fields qc-judge v2.3 reads (instruction_done, seam_visible, object_cut_off, text_changed, notes)');
const rqpNoPrev = rqpRun(ctxRegion, F.pe, genRegion, [{ error: 'not found' }, F.signed[1]], qcOut)[0].json;
check(rqpNoPrev.body.messages[0].content.length === 2 && rqpNoPrev.body.messages[0].content[0].text.endsWith(para(PCT.b33727a9, 'change the sunglass color to red', false)) && !rqpNoPrev.body.messages[0].content[0].text.includes('SECOND image') && rqpNoPrev.region.previous_attached === false, 'Region QC Prompt with no signed previous URL: the no-Image-2 paragraph variant (any lettering looks altered) and 2 content parts');
const rqpQuote = rqpRun(ctxRegion, F.pe, { ...genRegion, edit_instruction: '  make the "bear"\n to look   like a tiger ' }, F.signed, qcOut)[0].json;
check(rqpQuote.body.messages[0].content[0].text.includes('with this instruction: "make the \'bear\' to look like a tiger".') && rqpQuote.region.instruction === "make the 'bear' to look like a tiger", 'Region QC Prompt: double quotes in the instruction become single quotes, whitespace collapsed');
const rqpWhere = rqpRun(ctxRegion, { ...F.pe, region: { ...F.region, pct: null } }, genRegion, F.signed, qcOut)[0].json;
check(rqpWhere.body.messages[0].content[0].text.endsWith(P1), 'Region QC Prompt: without pct the region where text gives the same paragraph');
for (const cid of Object.keys(cases)) {
  const f = regionFixture(cid);
  const out = rqpRun(ctxRegion, f.pe, { ...genRegion, edit_instruction: f.c.instruction }, f.signed, qcOut)[0].json;
  check(out.body.messages[0].content[0].text.endsWith(para(PCT[cid], f.c.instruction, true)) && out.body.messages[0].content[0].text.includes('Only ' + f.c.where + ' was asked to change'), 'Region QC Prompt ' + cid + ': the paragraph names the same area as the image prompt (' + f.c.where + ')');
}
// the vision calls send the Region QC Prompt body: Kie Vision QC = $json.body (via QC Platform?), OpenRouter QC = that body + the vision model
const kieQc = JSON.parse(evalParam(nodeOf(after, 'Vision QC').parameters.jsonBody, {}, rq));
const orQc = JSON.parse(evalParam(nodeOf(after, 'OpenRouter QC').parameters.jsonBody, { 'Region QC Prompt': [rq], 'Prompt Engine': [F.pe] }));
check(same(kieQc, rq.body) && orQc.model === 'google/gemini-3.1-pro-preview' && same({ ...orQc, model: undefined }, { ...rq.body, model: undefined }) && orQc.messages[0].content.length === 3, 'Vision QC (Kie) and OpenRouter QC request bodies = the Region QC Prompt body (3 parts for a region), OpenRouter adds the vision model');
const orQcText = JSON.parse(evalParam(nodeOf(after, 'OpenRouter QC').parameters.jsonBody, { 'Region QC Prompt': [qcOut], 'Prompt Engine': [textPe] }));
const orQcTextOld = JSON.parse(evalParam(nodeOf(before, 'OpenRouter QC').parameters.jsonBody, { 'Build QC Request': [qcOut], 'Prompt Engine': [textPe] }));
check(same(orQcText, orQcTextOld), 'OpenRouter QC edit_text: the same request body as the live node (Region QC Prompt passed Build QC Request through)');

// ---- Fail Message --------------------------------------------------------------------------------------------------------------
const fmNew = codeOf(after, 'Fail Message'), fmOld = codeOf(before, 'Fail Message');
const fmRun = (code, j, orExecuted) => run(code, Object.assign({ 'Edit Context': [ctxRegion] }, orExecuted ? { 'OpenRouter Image': [{}] } : {}), [j]).json.message;
const RC = { error: { message: '422 - "{\\"message\\":\\"Region composite: the regenerated image moved by more than 16 px\\",\\"code\\":\\"misaligned\\"}"' } };
const RCplain = { error: { message: '422 - "{"message":"Region composite: the regenerated image moved by more than 16 px","code":"misaligned"}"' } };
check(fmRun(fmNew, RCplain, true) === 'Region composite: the regenerated image moved by more than 16 px' && fmRun(fmNew, RC, true) === 'Region composite: the regenerated image moved by more than 16 px', 'Fail Message: a Region composite error after OpenRouter Image ran keeps its message without the OpenRouter prefix (plain and escaped JSON body)');
const RCbody = { error: { message: '422 - "{\\"ok\\":false,\\"code\\":\\"misaligned\\",\\"message\\":\\"Region composite: the regenerated image moved by more than 16 px - run Fix an area again\\"}"', httpCode: '422' } };
check(fmRun(fmNew, RCbody, true) === 'Region composite: the regenerated image moved by more than 16 px - run Fix an area again (HTTP 422)' && fmRun(fmNew, RCbody, false) === fmRun(fmOld, RCbody, false), 'Fail Message: the region-composite error body {ok,code,message} gives Region composite: ... (HTTP 422); on the Kie lane the same as the live node');
const OR400 = { error: { message: '400 - "{\\"error\\":{\\"message\\":\\"Invalid model openai/x\\",\\"code\\":400}}"', httpCode: '400' } };
check(fmRun(fmNew, OR400, true) === 'OpenRouter: Invalid model openai/x (HTTP 400)' && fmRun(fmNew, OR400, true) === fmRun(fmOld, OR400, true), 'Fail Message: an OpenRouter error keeps the OpenRouter prefix, byte-identical to the live node');
const OR401 = { error: { message: '401 - "{\\"error\\":{\\"message\\":\\"No auth credentials found\\",\\"code\\":401}}"', httpCode: '401' } };
check(fmRun(fmNew, OR401, true) === 'OpenRouter API key missing or invalid - add it in n8n WF-0 Studio Config (OpenRouter Config node)' && fmRun(fmNew, OR401, true) === fmRun(fmOld, OR401, true), 'Fail Message: today OpenRouter 401 path unchanged (API key message)');
for (const j of [{ code: 500, msg: 'server busy' }, { failMsg: 'content policy' }, { error: 'OpenRouter returned no image - x' }, {}]) check(fmRun(fmNew, j, false) === fmRun(fmOld, j, false) && fmRun(fmNew, j, true) === fmRun(fmOld, j, true), 'Fail Message: same as the live node for ' + JSON.stringify(j));

// ---- Edit Context, the new HTTP nodes ------------------------------------------------------------------------------------------
const ecAssign = nodeOf(after, 'Edit Context').parameters.assignments.assignments;
const raw = ecAssign.find((a) => a.name === 'rawPath');
const webhook = { 'Edit Webhook': [{ body: { generation_id: 'g', card_id: 'c', kind: 'edit_region' } }] };
check(raw && raw.id === 'c6' && raw.type === 'string' && evalParam(raw.value, webhook) === 'c/g.raw.png' && evalParam(ecAssign.find((a) => a.name === 'imagePath').value, webhook) === 'c/g.png', 'Edit Context: c6 rawPath = <card_id>/<generation_id>.raw.png next to imagePath <card_id>/<generation_id>.png');
const httpData = { 'Load Config': [cfg], 'Edit Context': [ctxRegion] };
const urr = nodeOf(after, 'Upload Raw Regen'), urrH = headersOf(urr);
check(urr.type === 'n8n-nodes-base.httpRequest' && urr.typeVersion === 4.2 && urr.parameters.method === 'POST' && evalParam(urr.parameters.url, httpData) === SB + '/storage/v1/object/gens/c/g.raw.png' && urrH['x-upsert'] === 'true' && urrH['Content-Type'] === 'image/png' && evalParam(urrH.apikey, httpData) === cfg.anonKey && evalParam(urrH['x-studio-secret'], httpData) === cfg.studioSecret && urr.parameters.contentType === 'binaryData' && urr.parameters.inputDataFieldName === 'data' && urr.parameters.options.timeout === 180000 && urr.retryOnFail === true && urr.maxTries === 2 && urr.waitBetweenTries === 3000, 'Upload Raw Regen: POST gens/<card>/<gen>.raw.png, binary data, x-upsert true, apikey + x-studio-secret, timeout 180000, 2 tries / 3 s');
const srp = nodeOf(after, 'Save Raw Path'), srpH = headersOf(srp);
check(srp.parameters.method === 'PATCH' && evalParam(srp.parameters.url, httpData) === SB + '/rest/v1/generations?id=eq.g' && same(JSON.parse(evalParam(srp.parameters.jsonBody, httpData)), { raw_image_path: 'c/g.raw.png' }) && srpH.Prefer === 'return=minimal' && srpH['Content-Type'] === 'application/json' && evalParam(srpH['x-studio-secret'], httpData) === cfg.studioSecret && srp.parameters.options.timeout === 15000 && srp.maxTries === 3 && srp.waitBetweenTries === 3000, 'Save Raw Path: PATCH generations raw_image_path = rawPath, return=minimal, timeout 15000, 3 tries / 3 s');
const rc = nodeOf(after, 'Region Composite'), rcH = headersOf(rc);
const rcUrl = evalParam(rc.parameters.url, httpData), rcBody = JSON.parse(evalParam(rc.parameters.jsonBody, httpData));
check(rc.parameters.method === 'POST' && rcUrl === SB + '/functions/v1/region-composite' && rcUrl.endsWith('/functions/v1/region-composite') && same(rcBody, { generation_id: 'g', mode: 'locked' }) && same(Object.keys(rcH).sort(), ['Content-Type', 'apikey', 'x-studio-secret']) && evalParam(rcH.apikey, httpData) === cfg.anonKey && evalParam(rcH['x-studio-secret'], httpData) === cfg.studioSecret && rc.parameters.options.timeout === 150000 && rc.maxTries === 2 && rc.waitBetweenTries === 5000, 'Region Composite: POST /functions/v1/region-composite {generation_id, mode locked}, headers apikey + x-studio-secret (no JWT), timeout 150000, 2 tries / 5 s');
const newNames = ['Upload Raw Regen', 'Save Raw Path', 'Region Composite', 'Region QC Prompt'];
check(newNames.every((n) => nodeOf(after, n).onError === 'continueErrorOutput'), 'the 4 new nodes have onError continueErrorOutput');

// ---- Wiring ------------------------------------------------------------------------------------------------------------------
const targets = (from, idx) => ((((after.connections[from] || {}).main || [])[idx]) || []).map((c) => c.node + (c.index ? '@' + c.index : ''));
check(same(targets('Region Edit?', 0), ['Upload Raw Regen']) && same(targets('Upload Raw Regen', 0), ['Save Raw Path']) && same(targets('Save Raw Path', 0), ['Region Composite']) && same(targets('Region Composite', 0), ['Save Image Path']), 'wiring: Region Edit? [0] -> Upload Raw Regen -> Save Raw Path -> Region Composite -> Save Image Path');
check(same(targets('Region Edit?', 1), ['Upload To Gens']) && same(targets('Upload To Gens', 0), ['Save Image Path']) && same(targets('Save Image Path', 0), ['Sign Result']), 'wiring: Region Edit? [1] -> Upload To Gens -> Save Image Path -> Sign Result (edit_text unchanged)');
check(same(targets('Build QC Request', 0), ['Region QC Prompt']) && same(targets('Region QC Prompt', 0), ['QC Platform?']) && same(targets('QC Platform?', 0), ['Vision QC']) && same(targets('QC Platform?', 1), ['OpenRouter QC']), 'wiring: Build QC Request -> Region QC Prompt -> QC Platform? [0] Vision QC / [1] OpenRouter QC');
check(newNames.every((n) => same(targets(n, 1), ['Fail Message'])), 'wiring: the error output of each of the 4 new nodes goes to Fail Message');
check(same(targets('Decode OpenRouter Image', 0), ['Region Edit?']) && same(targets('Download Result', 0), ['Region Edit?']), 'wiring: both image lanes (Kie Download Result, OpenRouter Decode) still end in Region Edit?');
const REMOVED = ['Download Original', 'Both Images', 'Original Size', 'Fit Edit To Original', 'Crop Edit To Region', 'Composite Region', 'Use Composite'];
check(REMOVED.every((n) => !after.nodes.some((x) => x.name === n)) && REMOVED.every((n) => before.nodes.some((x) => x.name === n)), 'none of the 7 removed nodes (' + REMOVED.join(', ') + ') exist any more (all 7 exist live)');
check(!after.nodes.some((n) => n.type === 'n8n-nodes-base.editImage' || n.type === 'n8n-nodes-base.merge'), 'WF-3 has no n8n-nodes-base.editImage (and no merge) node');
const functional = (wf) => wf.nodes.filter((n) => n.type !== 'n8n-nodes-base.stickyNote').length;
check(functional(after) === functional(before) - REMOVED.length + newNames.length, 'node count: ' + functional(before) + ' live - 7 removed + 4 added = ' + functional(after));
check(same(nodeOf(after, 'Region Edit?').parameters, nodeOf(before, 'Region Edit?').parameters), 'Region Edit? condition unchanged (kind edit_region and mask_rect present)');
check(String(nodeOf(after, 'OpenRouter QC').parameters.jsonBody).includes("$('Region QC Prompt').first().json.body") && !String(nodeOf(after, 'OpenRouter QC').parameters.jsonBody).includes('Build QC Request') && nodeOf(after, 'Vision QC').parameters.jsonBody === '={{ JSON.stringify($json.body) }}', 'OpenRouter QC jsonBody reads Region QC Prompt; Vision QC jsonBody is $json.body');
// Build QC Request / QC Judge / Vision QC byte-identical to the committed source (HEAD), which test-wf2-prompts.js pins against WF-2
let head = null;
try { head = parse(execFileSync('git', ['show', 'HEAD:n8n/wf3-edit.sdk.js'], { cwd: path.resolve(__dirname, '..', '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })); } catch (e) { head = null; }
if (head) check(['Build QC Request', 'QC Judge', 'Vision QC', 'Get Generation', 'Region Edit?', 'Upload To Gens', 'Save Image Path'].every((n) => same(nodeOf(after, n).parameters, nodeOf(head, n).parameters)), 'Build QC Request, QC Judge, Vision QC, Get Generation, Region Edit?, Upload To Gens, Save Image Path parameters byte-identical to git HEAD');
else console.log('skip parameters vs git HEAD (no git)');

// ---- Code rules ----------------------------------------------------------------------------------------------------------------
const codeNodes = after.nodes.filter((n) => n.type === 'n8n-nodes-base.code');
const long = codeNodes.filter((n) => String(n.parameters.jsCode).split('\n').length > 20).map((n) => n.name);
check(!long.length, 'every Code node has at most 20 lines (' + codeNodes.map((n) => n.name + ' ' + String(n.parameters.jsCode).split('\n').length).join(', ') + ')');
const topComments = afterSrc.split('\n').filter((l) => /^\s*\/\//.test(l));
check(topComments.every((l) => !/['"`]/.test(l)), 'top-level comments of wf3-edit.sdk.js carry no quote characters (docs/n8n-config-contract.md item 15)');
const throwsIn = (name) => (codeOf(after, name).match(/throw new Error\(([^;]*)\);/g) || []);
const badThrows = ['Build Edit Task', 'Build OpenRouter Image', 'Region QC Prompt'].flatMap((n) => throwsIn(n).filter((t) => /:/.test(t)).map((t) => n + ' ' + t));
check(!badThrows.length, 'thrown messages of Build Edit Task, Build OpenRouter Image and Region QC Prompt carry no colon' + (badThrows.length ? ' ' + JSON.stringify(badThrows) : ''));
for (const n of codeNodes) { let ok = true; try { new Function('$', '$input', '$json', String(n.parameters.jsCode)); } catch (e) { ok = false; } if (!ok) check(false, 'jsCode compiles: ' + n.name); }

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
