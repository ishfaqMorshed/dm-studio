#!/usr/bin/env node
// Unit test for WF-1's vision-analysis nodes (../wf1-intake.sdk.js, built with the real @n8n/workflow-sdk):
//   Build Analysis Request renders analysis_prompt v3 - one SLOT_BLOCK per attached image from cards.reference_roles
//   (fallback settings.reference_roles, then the recorded default), NICHE = style_brief.niche else the client name,
//   BRIEF and TEXT_LINES as context - and still renders the v2 body for rollback.
//   Parse Analysis stores a v3 {references:[...]} reply as references / roles / same_design / notes / template_version
//   plus the flat compat keys, each mapped from its OWN slot (spec 2.2 cases a-d), and keeps today's handling of the
//   legacy v2 single-object and array replies and of v1 STYLE:/TYPOGRAPHY_TEXT: text replies.
// Template bodies come from ../../supabase/migrations through ./template-from-migrations.js (plain $tag$ inserts and the
// jsonb_populate_record form of studio_18/21): analysis_prompt v2 from 20260924_prompt_templates_v1_fix.sql ($body$), v3 from
// 20260930_studio_21_style_card_v2.sql ($analysis$). fixtures/analysis_prompt_v3.txt (spec 1.4 text) is only the fallback when
// no migration inserts v3, and a check below fails when the migration body drifts from it.
// Usage: node test-wf1-analysis.js
const fs = require('fs');
const path = require('path');
const { parseWorkflowCodeToBuilder } = require('@n8n/workflow-sdk');

const raw = fs.readFileSync(path.resolve(__dirname, '..', 'wf1-intake.sdk.js'), 'utf8').split('\n').filter((l) => !/^\s*import\s.*from\s+['"]@n8n\/workflow-sdk['"]/.test(l)).join('\n');
const nodes = parseWorkflowCodeToBuilder(raw).toJSON().nodes;
const jsCode = (name) => { const n = nodes.find((x) => x.name === name); if (!n) throw new Error('node not found: ' + name); return String(n.parameters.jsCode); };

const { templateFromMigrations } = require('./template-from-migrations.js');
const migV2 = templateFromMigrations('analysis_prompt', 2);
if (!migV2) throw new Error('no migration inserts analysis_prompt v2');
const v2 = migV2.body;
const fixtureV3 = fs.readFileSync(path.resolve(__dirname, 'fixtures', 'analysis_prompt_v3.txt'), 'utf8').replace(/\n$/, '');
const migV3 = templateFromMigrations('analysis_prompt', 3);
const v3 = migV3 ? migV3.body : fixtureV3;
console.log(migV3
  ? 'analysis_prompt v3 body from ' + migV3.file + (migV3.body.trim() === fixtureV3.trim() ? ' (identical to fixtures/analysis_prompt_v3.txt)' : ' (DIFFERS from fixtures/analysis_prompt_v3.txt - testing the migration text)')
  : 'analysis_prompt v3 body from fixtures/analysis_prompt_v3.txt (no migration inserts it yet)');

function run(code, nodeData, inputItems) {
  const items = (arr) => arr.map((json) => ({ json }));
  const $ = (name) => { if (!(name in nodeData)) throw new Error('unmocked node ' + name); const arr = nodeData[name]; return { first: () => ({ json: arr[0] }), all: () => items(arr), isExecuted: true }; };
  const $input = { first: () => ({ json: inputItems[0] }), all: () => items(inputItems) };
  return new Function('$', '$input', '$json', code)($, $input, inputItems[0]);
}
let failures = 0;
const check = (cond, msg) => { if (cond) console.log('ok   ' + msg); else { failures++; console.log('FAIL ' + msg); } };
const section = (t) => console.log('\n-- ' + t);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

section('Template sources');
check(/20260924_prompt_templates_v1_fix\.sql$/.test(migV2.file), 'analysis_prompt v2 read from ' + migV2.file);
check(!migV3 || migV3.body === fixtureV3, 'fixtures/analysis_prompt_v3.txt is byte-identical to the migration body' + (migV3 ? ' in ' + migV3.file : ' (no migration yet - fixture used)') + ' - update the fixture when the migration changes');

// ---- Build Analysis Request ------------------------------------------------------------------------------------
const cfg = { sbUrl: 'https://voatrqhfsdfjomyajovi.supabase.co' };
const settings = { vision_model: 'gemini-3.1-pro', ai_platform: 'kie', openrouter_models: {}, reference_roles: ['subject', 'art_style', 'typography'] };
const client = { name: 'Test Client', notes: 'n', garment_colors: ['black'], style_brief: { niche: 'farm humour', audience: 'homesteaders' } };
const card = { brief_text: 'Retro camping badge with a bear over a lake', print_text: [{ role: 'headline', text: 'FAMILY FIRST' }, { role: 'sub', text: 'EST 2019' }], reference_roles: null, clients: client };
const tpl3 = [{ slug: 'analysis_prompt', version: 3, body: v3 }];
const tpl2 = [{ slug: 'analysis_prompt', version: 2, body: v2 }];
const signed = (n) => Array.from({ length: n }, (_, i) => ({ signedURL: '/object/sign/refs/a/' + (i + 1) + '.png?token=t' }));
const build = (cardRow, templates, settingsRow, n) => run(jsCode('Build Analysis Request'), { 'Load Config': [cfg], 'Get Card': [cardRow], 'Get Templates': templates, 'Get Vision Model': [settingsRow] }, signed(n)).json;
const promptOf = (r) => r.body.messages[0].content[0].text;
const blockHeads = (text) => text.split('\n').filter((l) => /^IMAGE \d+ - /.test(l)).map((l) => l.split(':')[0]);

section('Build Analysis Request - analysis_prompt v3');
const r1 = build(card, tpl3, settings, 3); const t1 = promptOf(r1);
check(t1.startsWith('You are a precise visual analyst for a "farm humour" print-on-demand design for the client Test Client.'), 'NICHE = style_brief.niche, CLIENT_NAME = client name');
check(same(blockHeads(t1), ['IMAGE 1 - WHAT TO MAKE', 'IMAGE 2 - ART STYLE', 'IMAGE 3 - LETTERING']), 'SLOT_BLOCKS: three lines in the settings order (subject, art_style, typography), numbered IMAGE 1..3');
check(/IMAGE 1 - WHAT TO MAKE: the hero subject and exactly how it is posed and framed/.test(t1) && /IMAGE 2 - ART STYLE: only how it is drawn - medium/.test(t1) && /IMAGE 3 - LETTERING: only the letterforms - headline lettering family/.test(t1), 'SLOT_BLOCKS wording matches the spec (2.2 / 1.4)');
check(t1.includes('The brief for this design: Retro camping badge with a bear over a lake') && t1.includes('it is not in the images): FAMILY FIRST\nEST 2019'), 'BRIEF and TEXT_LINES rendered (v2 never used them)');
check(!/\{\{[A-Z_]+\}\}/.test(t1) && t1.includes('"same_design":false'), 'no unrendered tokens; v3 JSON contract present');
check(r1.body.response_format.type === 'json_object' && r1.body.messages[0].content.length === 4 && r1.template_version === 3, 'JSON mode, one image part per reference, template_version 3');
check(same(r1.roles, ['subject', 'art_style', 'typography']) && r1.reference_urls.length === 3 && same(r1.text_lines, ['FAMILY FIRST', 'EST 2019']), 'output carries roles, reference_urls, text_lines');

const r2 = build({ ...card, reference_roles: ['typography', 'subject', 'art_style'] }, tpl3, settings, 3);
check(same(blockHeads(promptOf(r2)), ['IMAGE 1 - LETTERING', 'IMAGE 2 - WHAT TO MAKE', 'IMAGE 3 - ART STYLE']) && same(r2.roles, ['typography', 'subject', 'art_style']), 'cards.reference_roles wins over the settings order');

const r3 = build(card, tpl3, settings, 1); const t3 = promptOf(r3);
check(same(blockHeads(t3), ['IMAGE 1 - WHAT TO MAKE']) && !t3.includes('IMAGE 2') && same(r3.roles, ['subject']) && r3.body.messages[0].content.length === 2, 'one attached image -> one SLOT_BLOCK, roles sliced to the image count');

const r4 = build({ ...card, clients: { ...client, style_brief: {} } }, tpl3, settings, 2);
check(promptOf(r4).startsWith('You are a precise visual analyst for a "Test Client" print-on-demand design'), 'no niche in the brief -> NICHE falls back to the client name');

const r5 = build(card, tpl3, { error: { message: 'column settings.reference_roles does not exist', status: 400 } }, 3);
check(same(r5.roles, ['subject', 'art_style', 'typography']), 'settings row unavailable -> recorded default order subject, art_style, typography');

const r6 = build(card, tpl3, { ...settings, reference_roles: ['typography', 'art_style', 'subject'] }, 2);
check(same(r6.roles, ['typography', 'art_style']) && same(blockHeads(promptOf(r6)), ['IMAGE 1 - LETTERING', 'IMAGE 2 - ART STYLE']), 'settings.reference_roles swapped by one UPDATE relabels the slots without a deploy');

const r6b = build({ ...card, reference_roles: ['subject', 'logo'] }, tpl3, settings, 2);
check(same(r6b.roles, ['subject', 'art_style']), 'an unknown role value falls back to the settings order for that slot (never an empty block)');

const r6c = build({ ...card, brief_text: null, print_text: [] }, tpl3, settings, 1); const t6c = promptOf(r6c);
check(t6c.includes('The brief for this design: not given') && t6c.includes('it is not in the images): NONE'), 'empty brief / no print text -> "not given" / NONE, never an empty line');

section('Build Analysis Request - analysis_prompt v2 (rollback) and failures');
const r7 = build(card, tpl2, settings, 2); const t7 = promptOf(r7);
check(t7.startsWith('You are a precise visual analyst for a "farm humour" print-on-demand design.') && !/\{\{[A-Z_]+\}\}/.test(t7) && t7.includes('"text_detected":[]') && r7.template_version === 2, 'v2 body still renders (NICHE from the brief, no tokens, flat JSON contract)');
let thrown = '';
try { build(card, [{ slug: 'style_profiler', version: 3, body: 'x' }], settings, 2); } catch (e) { thrown = e.message; }
check(/no active analysis_prompt template/.test(thrown) && !thrown.includes(':'), 'missing template fails loudly; message has no colon');
thrown = '';
try { run(jsCode('Build Analysis Request'), { 'Load Config': [cfg], 'Get Card': [card], 'Get Templates': tpl3, 'Get Vision Model': [settings] }, [{ error: 'sign failed' }]); } catch (e) { thrown = e.message; }
check(/no signed reference URLs/.test(thrown) && !thrown.includes(':'), 'no signed URLs fails loudly; message has no colon');

// ---- Parse Analysis - v3 ---------------------------------------------------------------------------------------
section('Parse Analysis - analysis_prompt v3 replies (spec 2.2 cases a-d)');
const parseCode = jsCode('Parse Analysis');
const reqNode = (roles) => ({ 'Build Analysis Request': [{ template_version: 3, reference_urls: roles.map((r, i) => 'u' + (i + 1)), roles }], 'OpenRouter Analyze': [{}], 'Analyze References': [{}] });
const reply = (obj) => ({ choices: [{ message: { content: typeof obj === 'string' ? obj : JSON.stringify(obj) } }] });
const parse = (roles, obj) => run(parseCode, reqNode(roles), [reply(obj)]).json;
const subjectSlot = { slot: 1, role: 'subject', hero: { subject: 'bear silhouette', pose: 'standing in profile', framing: 'full_figure', scale: 'large' }, supporting_elements: ['lake', 'pine trees'], layout: 'badge', text_zones: 'arched along the top', text_detected: ['WILD & FREE'] };
const artSlot = { slot: 2, role: 'art_style', medium: 'screen-print style vector illustration', realism: 'stylised', line_weight: 'bold', line_style: 'clean closed outlines', shading: 'halftone', texture: 'light grain', edge_finish: 'clean', palette: [{ name: 'cream', hex: '#F2E8D5', role: 'fill' }, { name: 'ink', hex: '#1C1B1A', role: 'line' }], text_detected: ['HAPPY HOUR FARM'] };
const typoSlot = { slot: 3, role: 'typography', headline: { family: 'slab_serif', weight: 'bold', effects: ['arched', 'outline'] }, secondary: { family: 'condensed_sans', weight: 'regular', effects: [] }, placement: 'above and below the hero', case: 'UPPER', text_detected: ['CHICKEN', 'WILD & FREE'] };
const three = ['subject', 'art_style', 'typography'];

const a = parse(three, { references: [subjectSlot, artSlot, typoSlot], same_design: false, notes: 'image 2 is a mockup' });
const ra = a.reference_analysis;
check(ra.references.length === 3 && same(ra.roles, three) && ra.same_design === false && ra.notes === 'image 2 is a mockup' && ra.template_version === 3 && a.template_version === 3 && a.reference_count === 3, '(a) references[3], roles, same_design, notes, template_version 3 stored');
check(ra.art_style === 'screen-print style vector illustration; stylised realism; bold clean closed outlines linework; halftone shading; light grain texture; clean edges', '(a) art_style <- ART STYLE slot (medium, realism, line weight + style, shading, texture, edge finish)');
check(same(ra.palette, artSlot.palette), '(a) palette <- ART STYLE slot palette (array; name, hex and role kept)');
check(ra.subject_structure === 'bear silhouette, standing in profile, full_figure framing, large scale; supporting elements lake, pine trees', '(a) subject_structure <- WHAT TO MAKE slot hero + supporting elements');
check(ra.composition === 'badge layout; full_figure framing; text zones arched along the top', '(a) composition <- WHAT TO MAKE slot layout + framing + text zones');
check(ra.typography_transcription === 'headline slab_serif bold arched, outline; secondary condensed_sans regular; placed above and below the hero; UPPER case', '(a) typography_transcription <- LETTERING slot (headline, secondary, placement, case, effects)');
check(same(ra.text_detected, ['WILD & FREE', 'HAPPY HOUR FARM', 'CHICKEN']), '(a) text_detected = union of every slot, de-duplicated, slot order');
check(ra.references[0].role === 'subject' && ra.references[1].slot === 2 && ra.references[2].headline.family === 'slab_serif' && same(ra.references[0].hero, subjectSlot.hero), '(a) per-slot objects kept verbatim (ReferencesPanel renders references[i] under slot i; prompt-engine v8 reads them)');
check(!/\bhalftone\b|slab_serif|#1C1B1A/.test(ra.subject_structure) && !/bear|slab_serif/.test(ra.art_style) && !/bear|halftone|#1C1B1A/.test(ra.typography_transcription), '(a) no cross-talk: each compat key holds only its own slot\'s reading');

const b = parse(three, { references: [subjectSlot, artSlot, { ...typoSlot, text_detected: ['CHICKEN'] }], same_design: false, notes: '' }).reference_analysis;
check(/bear/.test(b.subject_structure) && !/chicken/i.test(b.subject_structure) && !/chicken/i.test(b.composition) && !/chicken/i.test(b.art_style), '(b) slot 1 bear badge, slot 3 shows the word CHICKEN -> subject_structure names the bear and never chicken');
check(b.text_detected.includes('CHICKEN') && b.text_detected.includes('WILD & FREE'), '(b) CHICKEN lands in text_detected (never reproduce), not in the subject');

const c = parse(three, { references: [subjectSlot, artSlot, typoSlot], same_design: true, notes: 'all three are mockups of one design' }).reference_analysis;
check(c.same_design === true && c.art_style.startsWith('screen-print') && /bear/.test(c.subject_structure) && c.references.length === 3 && c.notes === 'all three are mockups of one design', '(c) same_design true stored; every block still mapped from its slot');

const d = parse(['subject'], { references: [subjectSlot], same_design: false, notes: '' });
check(d.reference_analysis.references.length === 1 && d.reference_analysis.typography_transcription === '' && d.reference_analysis.art_style === '' && d.reference_analysis.palette === '' && /bear/.test(d.reference_analysis.subject_structure) && d.reference_count === 1 && same(d.reference_analysis.roles, ['subject']), '(d) one attached slot -> references.length 1, typography_transcription / art_style / palette left \'\' (prompt-engine: not attached - the Style Card governs)');

const noRole = (o) => { const x = { ...o }; delete x.role; return x; };
const e = parse(three, { references: [noRole(subjectSlot), noRole(artSlot), noRole(typoSlot)] }).reference_analysis;
check(e.references.map((r) => r.role).join(',') === three.join(',') && /bear/.test(e.subject_structure) && e.typography_transcription.startsWith('headline slab_serif') && e.same_design === false && e.notes === '', 'reply without role keys -> roles restored from the request by slot; same_design / notes default false / \'\'');
const f = parse(three, { references: [typoSlot, artSlot, subjectSlot], same_design: false }).reference_analysis;
check(/bear/.test(f.subject_structure) && f.typography_transcription.startsWith('headline slab_serif') && f.art_style.startsWith('screen-print'), 'slots mapped by role, never by position');
const g = parse(three, '```json\n' + JSON.stringify({ references: [subjectSlot], same_design: false, notes: '' }) + '\n```').reference_analysis;
check(g.references.length === 1 && same(g.text_detected, ['WILD & FREE']) && g.typography_transcription === '', 'fenced v3 reply parsed; missing slots stay \'\'');
const h = parse(three, { references: [{ ...subjectSlot, hero: 'a rooster' }, { ...artSlot, palette: 'cream and ink' }, typoSlot] }).reference_analysis;
check(h.subject_structure.startsWith('a rooster') && h.palette === '', 'defensive: hero given as a string still reads; a non-array palette is dropped to \'\'');

// ---- Parse Analysis - legacy -----------------------------------------------------------------------------------
section('Parse Analysis - legacy replies (v2 single object / array, v1 text) keep today\'s handling');
const legacyReq = { 'Build Analysis Request': [{ template_version: 2, reference_urls: ['u1', 'u2'] }], 'OpenRouter Analyze': [{}], 'Analyze References': [{}] };
const jsonReply = reply('```json\n{"art_style":"vintage badge","palette":[{"name":"ink","hex":"#1C1B1A"}],"subject_structure":"bear","typography_transcription":"slab serif","text_detected":["WILD & FREE"],"composition":"centred","notes":""}\n```');
const l1 = run(parseCode, legacyReq, [jsonReply]).json;
check(l1.reference_analysis.art_style === 'vintage badge' && l1.reference_analysis.text_detected[0] === 'WILD & FREE' && l1.reference_count === 2 && l1.template_version === 2 && !('references' in l1.reference_analysis), 'v2 single-object reply (fenced) stored as today, no references key invented');
const arrayReply = reply([{ art_style: 'vintage badge', subject_structure: 'bear', text_detected: [], notes: 'n1' }, { art_style: 'x', subject_structure: 'a rooster on a fence' }]);
const l2 = run(parseCode, legacyReq, [arrayReply]).json.reference_analysis;
check(l2.subject_structure === 'bear' && l2.notes === 'n1 Supporting references (style and subject cues only, not the design to re-create) - IMAGE 2 - a rooster on a fence', 'v2 array reply keeps IMAGE 1 and folds the rest into notes (today\'s handling)');
const textReply = reply('STYLE:\nBold vintage badge, bear in profile, cream and ink palette.\nHalftone shading.\n\nTYPOGRAPHY_TEXT:\nWILD & FREE\n\nTYPOGRAPHY_STYLE:\ncondensed slab serif');
const l3 = run(parseCode, legacyReq, [textReply]).json.reference_analysis;
check(l3.art_style === 'Bold vintage badge, bear in profile, cream and ink palette.\nHalftone shading.' && l3.typography_transcription === 'WILD & FREE' && same(l3.text_detected, ['WILD & FREE']), 'v1-style STYLE/TYPOGRAPHY_TEXT reply mapped to art_style/typography_transcription/text_detected');
const noneReply = reply('STYLE:\nMinimal line art.\n\nTYPOGRAPHY_TEXT:\nNONE\n\nTYPOGRAPHY_STYLE:\nNONE');
const l4 = run(parseCode, legacyReq, [noneReply]).json.reference_analysis;
check(l4.art_style === 'Minimal line art.' && l4.typography_transcription === '' && l4.text_detected.length === 0, 'v1-style reply with TYPOGRAPHY_TEXT NONE -> no text');
thrown = '';
try { run(parseCode, legacyReq, [reply('I cannot see the image: sorry.')]); } catch (e) { thrown = e.message; }
check(/neither JSON nor a STYLE block/.test(thrown) && !thrown.includes(':'), 'prose reply still fails loudly; message has no colon');
thrown = '';
try { run(parseCode, legacyReq, [{ error: { message: 'upstream: timeout', status: 504 } }]); } catch (e) { thrown = e.message; }
check(/^Vision service unavailable \(Kie and OpenRouter error 504 - upstream - timeout\)/.test(thrown) && !thrown.includes(':'), 'vendor error (no choices) -> "Vision service unavailable" with the code, no colon');

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
