#!/usr/bin/env node
// Unit test for WF-1's vision-analysis nodes: Build Analysis Request renders the ACTIVE analysis_prompt (v2, JSON contract,
// {{NICHE}} = client name) and Parse Analysis accepts both a JSON reply and a v1-style STYLE:/TYPOGRAPHY_TEXT: text reply.
// Usage: node test-wf1-analysis.js
const fs = require('fs');
const path = require('path');
const { parseWorkflowCodeToBuilder } = require('@n8n/workflow-sdk');

const raw = fs.readFileSync(path.resolve(__dirname, '..', 'wf1-intake.sdk.js'), 'utf8').split('\n').filter((l) => !/^\s*import\s.*from\s+['"]@n8n\/workflow-sdk['"]/.test(l)).join('\n');
const nodes = parseWorkflowCodeToBuilder(raw).toJSON().nodes;
const jsCode = (name) => { const n = nodes.find((x) => x.name === name); if (!n) throw new Error('node not found: ' + name); return String(n.parameters.jsCode); };
const fix = fs.readFileSync(path.resolve(__dirname, '..', '..', 'supabase', 'migrations', '20260924_prompt_templates_v1_fix.sql'), 'utf8');
const v2 = fix.match(/\('analysis_prompt', 2, \$body\$([\s\S]*?)\$body\$, true\)/)[1];

function run(code, nodeData, inputItems) {
  const items = (arr) => arr.map((json) => ({ json }));
  const $ = (name) => { if (!(name in nodeData)) throw new Error('unmocked node ' + name); const arr = nodeData[name]; return { first: () => ({ json: arr[0] }), all: () => items(arr) }; };
  const $input = { first: () => ({ json: inputItems[0] }), all: () => items(inputItems) };
  return new Function('$', '$input', '$json', code)($, $input, inputItems[0]);
}
let failures = 0;
const check = (cond, msg) => { if (cond) console.log('ok   ' + msg); else { failures++; console.log('FAIL ' + msg); } };

const cfg = { sbUrl: 'https://voatrqhfsdfjomyajovi.supabase.co' };
const card = { brief_text: 'Retro camping badge', print_text: [{ role: 'headline', text: 'FAMILY FIRST' }], clients: { name: 'Test Client', notes: 'n', garment_colors: ['black'] } };
const templates = [{ slug: 'analysis_prompt', version: 2, body: v2 }, { slug: 'style_profiler', version: 1, body: 'x' }];
const signed = [{ signedURL: '/object/sign/refs/a/1.png?token=t' }, { signedURL: '/object/sign/refs/a/2.png?token=t' }];
const req = run(jsCode('Build Analysis Request'), { Config: [cfg], 'Get Card': [card], 'Get Templates': templates }, signed).json;
const text = req.body.messages[0].content[0].text;
check(text.startsWith('You are a precise visual analyst for a "Test Client" print-on-demand design.'), 'analysis_prompt v2 fetched by slug and {{NICHE}} rendered as the client name');
check(!/\{\{[A-Z_]+\}\}/.test(text) && text.includes('"text_detected":[]'), 'no unrendered tokens; JSON contract present');
check(req.body.response_format.type === 'json_object' && req.body.messages[0].content.length === 3 && req.template_version === 2, 'JSON mode, one image part per reference, template_version 2');

const parseCode = jsCode('Parse Analysis');
const reqNode = { 'Build Analysis Request': [{ template_version: 2, reference_urls: ['u1', 'u2'] }] };
const jsonReply = { choices: [{ message: { content: '```json\n{"art_style":"vintage badge","palette":[{"name":"ink","hex":"#1C1B1A"}],"subject_structure":"bear","typography_transcription":"slab serif","text_detected":["WILD & FREE"],"composition":"centred","notes":""}\n```' } }] };
const a = run(parseCode, reqNode, [jsonReply]).json;
check(a.reference_analysis.art_style === 'vintage badge' && a.reference_analysis.text_detected[0] === 'WILD & FREE' && a.reference_count === 2 && a.template_version === 2, 'JSON reply (fenced) parsed into reference_analysis');

const textReply = { choices: [{ message: { content: 'STYLE:\nBold vintage badge, bear in profile, cream and ink palette.\nHalftone shading.\n\nTYPOGRAPHY_TEXT:\nWILD & FREE\n\nTYPOGRAPHY_STYLE:\ncondensed slab serif' } }] };
const b = run(parseCode, reqNode, [textReply]).json.reference_analysis;
check(b.art_style === 'Bold vintage badge, bear in profile, cream and ink palette.\nHalftone shading.' && b.typography_transcription === 'WILD & FREE' && JSON.stringify(b.text_detected) === '["WILD & FREE"]', 'v1-style STYLE/TYPOGRAPHY_TEXT reply mapped to art_style/typography_transcription/text_detected');
const noneReply = { choices: [{ message: { content: 'STYLE:\nMinimal line art.\n\nTYPOGRAPHY_TEXT:\nNONE\n\nTYPOGRAPHY_STYLE:\nNONE' } }] };
const c = run(parseCode, reqNode, [noneReply]).json.reference_analysis;
check(c.art_style === 'Minimal line art.' && c.typography_transcription === '' && c.text_detected.length === 0, 'v1-style reply with TYPOGRAPHY_TEXT NONE -> no text');
let threw = '';
try { run(parseCode, reqNode, [{ choices: [{ message: { content: 'I cannot see the image.' } }] }]); } catch (e) { threw = e.message; }
check(/neither JSON nor a STYLE block/.test(threw), 'prose reply still fails loudly');

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
