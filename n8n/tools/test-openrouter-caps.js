#!/usr/bin/env node
// Network test for the OpenRouter image capability pruning of Build OpenRouter Image (WF-2 ../wf2-generate.sdk.js and WF-3 ../wf3-edit.sdk.js).
// It fetches the live capability descriptors GET https://openrouter.ai/api/v1/images/models/<model>/endpoints (public, no key) for every
// model with a fixture under fixtures/openrouter-caps/ and asserts (a) the static fallback table of BOTH nodes (read out of the jsCode) equals
// the live key set per model - any difference fails, a superset too, the table is refreshed on purpose - and its aspect_ratio list equals the
// live enum (for google/gemini-3.1-flash-image-preview, which shares the gemini-3 entry, the static list must be a subset of the live one);
// (b) the bodies the two nodes build for each model (run with the live descriptor and with the static table, at aspect_ratio 1:1 and at the
// placement ratio 4:5) carry only live-supported keys with valid enum values and ranges, and 4:5 is kept where the model lists it and mapped
// to 3:4 (mapped [aspect_ratio 4:5 to 3:4]) where it does not - except the WF-3 region lane, whose parent is really 4:5 here (mask_rect 1638x2048): there
// the node throws the colon-free shape message before the paid call when no listed ratio is within 1 % of the real shape (region-composite would
// refuse the regeneration), which is what a Kie- or Gemini-made 4:5 parent meets on GPT Image; (c) the saved fixtures still equal the live descriptors (id + supported_parameters
// per endpoint) and every model is still listed. Offline (no network): prints SKIP and exits 0.
// Usage: node test-openrouter-caps.js [--write]   (--write refreshes the fixture files)
const fs = require('fs');
const path = require('path');
const { parseWorkflowCodeToBuilder } = require('@n8n/workflow-sdk');
const caps = require('./openrouter-caps.js');

const loadNodes = (file) => parseWorkflowCodeToBuilder(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8').split('\n').filter((l) => !/^\s*import\s.*from\s+['"]@n8n\/workflow-sdk['"]/.test(l)).join('\n')).toJSON().nodes;
const codeOf = (nodes) => { const n = nodes.find((x) => x.name === 'Build OpenRouter Image'); if (!n) throw new Error('node not found'); return String(n.parameters.jsCode); };
const wf2Code = codeOf(loadNodes('wf2-generate.sdk.js')), wf3Code = codeOf(loadNodes('wf3-edit.sdk.js'));
const write = process.argv.includes('--write');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let failures = 0;
const check = (cond, msg) => { if (cond) console.log('ok   ' + msg); else { failures++; console.log('FAIL ' + msg); } };

// the mocked n8n globals: $ with isExecuted, $input, $json; this = ctx
const mock$ = (data) => (name) => ({ get isExecuted() { return name in data; }, first: () => { if (!(name in data)) throw new Error('unmocked node ' + name); return { json: data[name][0] }; }, last: () => { if (!(name in data)) throw new Error('unmocked node ' + name); return { json: data[name][data[name].length - 1] }; }, all: () => { if (!(name in data)) throw new Error('unmocked node ' + name); return data[name].map((json) => ({ json })); } });
const run = (code, data, item, ctx) => new caps.AsyncFunction('$', '$input', '$json', '$execution', code).call(ctx, mock$(data), { first: () => ({ json: item }), all: () => [{ json: item }] }, item, { resumeUrl: 'https://n8n.example/webhook-waiting/1' }).then((o) => o.json);
const urls = ['https://sb.example/sign/a.png?token=1', 'https://sb.example/sign/b.png?token=2'];
const kieBody = (ar) => ({ model: 'gpt-image-2-5-sunburst-image-to-image', input: { prompt: 'a bold illustrated bear', input_urls: urls, aspect_ratio: ar, resolution: '2K', background: 'opaque' } });
const editBody = { model: 'google/nano-banana-edit', input: { prompt: 'change the headline', image_urls: urls, output_format: 'png' } };
const peOf = (models, ar) => ({ aspect_ratio: ar, resolution: '2K', openrouter_models: { image: models.image || 'openai/gpt-image-2.5-sunburst', edit: models.edit || 'google/gemini-2.5-flash-image', region: models.region || 'openai/gpt-image-2.5-sunburst', vision: 'google/gemini-3.1-pro-preview', text: 'anthropic/claude-sonnet-4.6' } });
// the region parent's real pixel size (mask_rect width x height) matches its stored ratio here, as a Kie- or Gemini-made parent does
const SIZE = { '1:1': [1024, 1024], '4:5': [1638, 2048] };
const regionOf = (ar) => ({ rect: { x: 10, y: 10, w: 20, h: 20, width: SIZE[ar][0], height: SIZE[ar][1] }, prompt: 'make the sunglasses red', aspect_ratio: ar, quality: 'high', mask_attached: true });
const bodiesFor = async (model, ctx, ar) => ({
  'WF-2 generate': await run(wf2Code, { 'Prompt Engine': [peOf({ image: model }, ar)], 'Build Create Task': [{ body: kieBody(ar) }] }, { body: kieBody(ar) }, ctx),
  'WF-3 edit_text': await run(wf3Code, { 'Prompt Engine': [peOf({ edit: model }, ar)], 'Build Edit Task': [{ body: editBody }] }, { body: editBody }, ctx),
  'WF-3 region': await run(wf3Code, { 'Prompt Engine': [{ ...peOf({ region: model }, ar), region: regionOf(ar) }], 'Build Edit Task': [{ body: kieBody(ar) }] }, { body: kieBody(ar) }, ctx).catch((e) => ({ thrown: e.message }))
});
// the WF-3 region branch throws before the paid call when no listed ratio is within 1 % of the parent's real shape (region-composite would refuse the regeneration)
const shapeMsg = (ar) => 'Fix an area cannot run on this ' + SIZE[ar][0] + 'x' + SIZE[ar][1] + ' px design - the image model lists no aspect ratio within 1 percent of that shape (nearest ';

(async () => {
  const models = caps.fixtureModels();
  const live = {};
  let listing = null;
  try {
    for (const m of models) {
      const r = await caps.fetchJson(caps.descriptorUrl(m), 15000);
      if (!r.ok || !r.json) { check(false, 'GET ' + caps.descriptorUrl(m) + ' answered HTTP ' + r.status + ' - the model is gone or the endpoint moved'); continue; }
      live[m] = r.json;
    }
    const l = await caps.fetchJson(caps.LISTING_URL, 15000);
    listing = l.ok && l.json ? (Array.isArray(l.json.data) ? l.json.data : l.json) : null;
  } catch (e) {
    console.log('SKIP test-openrouter-caps.js: no network (' + (e && e.message) + ')');
    process.exit(0);
  }
  if (!Object.keys(live).length) { console.log('SKIP test-openrouter-caps.js: no descriptor could be fetched'); process.exit(0); }
  console.log('live descriptors fetched for ' + Object.keys(live).length + ' of ' + models.length + ' fixture models' + (listing ? ', listing has ' + listing.length + ' image models' : ', listing unavailable'));

  const t2 = caps.staticTableOf(wf2Code), t3 = caps.staticTableOf(wf3Code);
  check(t2.text === t3.text && caps.pruningTailOf(wf2Code) === caps.pruningTailOf(wf3Code), 'the static table (STATIC + COMMON) and the whole pruning tail of WF-2 and WF-3 Build OpenRouter Image are the same text');
  for (const [m, desc] of Object.entries(live)) {
    const liveKeys = Object.keys(caps.unionCaps(desc)).sort();
    const liveCaps = caps.unionCaps(desc);
    const liveRatios = liveCaps.aspect_ratio && Array.isArray(liveCaps.aspect_ratio.values) ? [...liveCaps.aspect_ratio.values].sort() : null;
    for (const [wf, tbl] of [['WF-2', t2], ['WF-3', t3]]) {
      const stat = [...caps.staticKeysFor(tbl, m)].sort();
      check(same(stat, liveKeys), wf + ' static table for ' + m + ' = live key set ' + JSON.stringify(liveKeys) + (same(stat, liveKeys) ? '' : ' (static ' + JSON.stringify(stat) + ')'));
      const ratios = caps.staticRatiosFor(tbl, m), statRatios = ratios ? [...ratios].sort() : null;
      if (/^google\/gemini-3\.1-flash-image/.test(m)) check(liveRatios && statRatios && statRatios.every((r) => liveRatios.includes(r)) && liveRatios.length > statRatios.length, wf + ' static ratio list for ' + m + ' is a SUBSET of its live aspect_ratio enum (' + statRatios.length + ' of ' + (liveRatios || []).length + ' values: the model shares the gemini-3 entry, so its extra ' + JSON.stringify((liveRatios || []).filter((r) => !statRatios.includes(r))) + ' are only reachable with a live descriptor; offline they map to the nearest of the shared 10)');
      else check(same(statRatios, liveRatios), wf + ' static ratio list for ' + m + ' = live aspect_ratio enum ' + JSON.stringify(liveRatios) + (same(statRatios, liveRatios) ? '' : ' (static ' + JSON.stringify(statRatios) + ')'));
    }
    if (listing) check(listing.some((x) => x && x.id === m), m + ' is still in GET /api/v1/images/models');
    const fixtureSame = same(caps.capsShape(caps.loadFixture(m)), caps.capsShape(desc));
    check(fixtureSame || write, 'fixture ' + path.basename(caps.fixtureFile(m)) + ' = live descriptor (id + supported_parameters per endpoint)' + (fixtureSame ? '' : ' - DIFFERS, rerun with --write and review the static table'));
    if (write) { caps.saveFixture(m, desc); console.log('     wrote ' + path.relative(path.resolve(__dirname, '..', '..'), caps.fixtureFile(m))); }
    for (const ar of ['1:1', '4:5']) {
      const expectMapped = ar === '1:1' || (liveRatios && liveRatios.includes(ar)) ? [] : ['aspect_ratio ' + ar + ' to 3:4'];
      const withLive = await bodiesFor(m, caps.ctxWith(desc), ar), withStatic = await bodiesFor(m, {}, ar);
      for (const [lane, out] of Object.entries(withLive)) {
        if (out.thrown || (lane === 'WF-3 region' && !caps.fitsWithin(liveRatios, ar))) { check(lane === 'WF-3 region' && !caps.fitsWithin(liveRatios, ar) && typeof out.thrown === 'string' && out.thrown.startsWith(shapeMsg(ar)) && !/:/.test(out.thrown), lane + ' on ' + m + ' at ' + ar + ' with the live descriptor: no listed ratio within 1 % of the real ' + ar + ' parent, so the node throws the colon-free shape message before the paid call (' + JSON.stringify(out.thrown || out.body) + ')'); continue; }
        const v = caps.bodyViolations(out.body, liveCaps);
        check(out.caps_source === 'live' && !v.length && out.body.model === m && typeof out.body.prompt === 'string' && same(out.mapped, expectMapped), lane + ' on ' + m + ' at ' + ar + ' with the live descriptor: body ' + JSON.stringify(Object.keys(out.body)) + ' only live-supported keys and values, aspect_ratio ' + out.body.aspect_ratio + ', dropped ' + JSON.stringify(out.dropped) + ', mapped ' + JSON.stringify(out.mapped) + (v.length ? ' VIOLATIONS ' + JSON.stringify(v) : ''));
      }
      for (const [lane, out] of Object.entries(withStatic)) {
        const statFits = caps.staticRatiosFor(t3, m) === null || caps.fitsWithin(caps.staticRatiosFor(t3, m), ar);
        if (out.thrown || (lane === 'WF-3 region' && !statFits)) { check(lane === 'WF-3 region' && !statFits && typeof out.thrown === 'string' && out.thrown.startsWith(shapeMsg(ar)) && !/:/.test(out.thrown), lane + ' on ' + m + ' at ' + ar + ' with the static table: no listed ratio within 1 % of the real ' + ar + ' parent, the same colon-free shape message before the paid call (' + JSON.stringify(out.thrown || out.body) + ')'); continue; }
        const v = caps.bodyViolations(out.body, liveCaps);
        check(out.caps_source === 'static' && !v.length && same(out.mapped, expectMapped), lane + ' on ' + m + ' at ' + ar + ' with the static table: body ' + JSON.stringify(Object.keys(out.body)) + ' passes the live descriptor too, aspect_ratio ' + out.body.aspect_ratio + ', mapped ' + JSON.stringify(out.mapped) + (v.length ? ' VIOLATIONS ' + JSON.stringify(v) : ''));
      }
    }
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('FAIL test threw ' + (e && e.stack || e)); process.exit(1); });
