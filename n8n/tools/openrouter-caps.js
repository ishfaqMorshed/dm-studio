// Shared helpers for the OpenRouter image capability checks (test-wf2-prompts.js, test-wf3-region.js, test-openrouter-caps.js,
// test-openrouter-hotfix.js). Since 2026-10-06 OpenRouter validates image request parameters per model (an absent key in the capability
// descriptor = unsupported, HTTP 400), so Build OpenRouter Image in WF-2 / WF-3 prunes its body to the live descriptor
// GET https://openrouter.ai/api/v1/images/models/<model>/endpoints (public, no key) and falls back to a static table inside the node; an
// aspect_ratio the model does not list is replaced by the nearest listed ratio (by |ln(w/h) - ln(x/y)|, auto never chosen) and reported in mapped;
// when the head defined fit (WF-3 region branch: the real pixel size WxH of the parent from mask_rect) and the ratio sent is more than 1 % off it
// (region-composite's size_mismatch tolerance), the node throws a colon-free message before the paid call - WF-2 and the region-free hot-fix never
// define fit, so that check is inert there (ratioValue / fitsWithin below reproduce the rule for the tests).
// Here: the saved descriptors (fixtures/openrouter-caps/<model with / as __>.json, raw responses of 2026-10-06, refreshed by
// node test-openrouter-caps.js --write), a ctx whose helpers.httpRequest answers from them (what the Code node sees as this), the union of
// supported_parameters over the endpoints of a descriptor (first wins per key, the rule the node uses), the static table read out of a
// Build OpenRouter Image jsCode (never duplicated by hand: [regex, keys, ratios] per family + COMMON), the pruning tail of a jsCode (the part
// shared byte for byte by WF-2, WF-3 and both hot-fix nodes), and a body validator against a descriptor.
const fs = require('fs');
const path = require('path');

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'openrouter-caps');
const descriptorUrl = (model) => 'https://openrouter.ai/api/v1/images/models/' + model + '/endpoints';
const LISTING_URL = 'https://openrouter.ai/api/v1/images/models';
const fixtureFile = (model) => path.join(FIXTURE_DIR, model.replace(/\//g, '__') + '.json');
const fixtureModels = () => fs.readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.json')).sort().map((f) => f.slice(0, -5).replace(/__/g, '/'));
const loadFixture = (model) => JSON.parse(fs.readFileSync(fixtureFile(model), 'utf8'));
const saveFixture = (model, descriptor) => fs.writeFileSync(fixtureFile(model), JSON.stringify(descriptor));

// n8n runs a Code node inside an async function (top-level await works) with this = the node context (this.helpers.httpRequest)
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
// ctx for this: answer = a value, or a function of the request options (it may throw or reject - the node must fall back to static)
const ctxWith = (answer) => ({ helpers: { httpRequest: async (opts) => (typeof answer === 'function' ? answer(opts) : answer) } });
const modelOfUrl = (url) => { const m = String(url).match(/^https:\/\/openrouter\.ai\/api\/v1\/images\/models\/(.+)\/endpoints$/); if (!m) throw new Error('unexpected descriptor url ' + url); return m[1]; };
// answers every descriptor request from the fixtures (throws for a model without a fixture, like a 404 would); log collects the requests
const ctxFixtures = (log) => ctxWith((opts) => { if (log) log.push(opts); return loadFixture(modelOfUrl(opts.url)); });

// the descriptor body: {id, endpoints} today (the docs show it wrapped in data, the node accepts both)
const dataOf = (desc) => (desc && desc.data && typeof desc.data === 'object' ? desc.data : desc);
function unionCaps(desc) {
  const d = dataOf(desc), out = {};
  for (const ep of (d && Array.isArray(d.endpoints) ? d.endpoints : [])) for (const [k, v] of Object.entries((ep && ep.supported_parameters) || {})) if (!(k in out)) out[k] = v;
  return out;
}
// the comparable part of a descriptor (id + per-endpoint supported_parameters) - pricing and tags change on their own
const capsShape = (desc) => { const d = dataOf(desc) || {}; return { id: d.id, endpoints: (d.endpoints || []).map((ep) => ({ provider_slug: ep.provider_slug, supported_parameters: ep.supported_parameters || {} })) }; };

// the static table of a Build OpenRouter Image jsCode, evaluated from the code text: { table: [[RegExp, keys, ratios]], common: keys }
function staticTableOf(jsCode) {
  const t = String(jsCode).match(/const STATIC = (\[\[[\s\S]*?\]\]);/), c = String(jsCode).match(/const COMMON = (\[[^\]]*\]);/);
  if (!t || !c) throw new Error('STATIC / COMMON table not found in the jsCode');
  return { table: new Function('return ' + t[1])(), common: new Function('return ' + c[1])(), text: t[0] + '\n' + c[0] };
}
const staticKeysFor = (tbl, model) => { const hit = tbl.table.find(([re]) => re.test(model)); return hit ? hit[1] : tbl.common; };
// the aspect_ratio list the static table gives a model (null = no list, the value passes through)
const staticRatiosFor = (tbl, model) => { const hit = tbl.table.find(([re]) => re.test(model)); return hit && Array.isArray(hit[2]) ? hit[2] : null; };

// the pruning tail of a Build OpenRouter Image jsCode: from the top-level comment that starts with MARK to the end (the final return)
const MARK = '// OpenRouter validates image parameters per model';
function pruningTailOf(jsCode) {
  const lines = String(jsCode).split('\n'), m = lines.findIndex((l) => l.startsWith(MARK));
  if (m < 0) throw new Error('pruning tail not found (no line starts with the OpenRouter validates comment)');
  return lines.slice(m).join('\n');
}

// a ratio string a:b (listed values) or WxH (fit, real pixels) as the number w/h; null for auto, 0 or anything else
const ratioValue = (s) => { const m = /^([0-9]+)[:x]([0-9]+)$/.exec(String(s)); return m && Number(m[1]) > 0 && Number(m[2]) > 0 ? Number(m[1]) / Number(m[2]) : null; };
// region-composite's C1 rule as the node applies it before the paid call: some listed value is within 1 % of want (|got / want - 1| <= 0.01)
const fitsWithin = (values, want) => { const w = ratioValue(want); return w !== null && (values || []).some((v) => { const r = ratioValue(v); return r !== null && Math.abs(r / w - 1) <= 0.01; }); };

// what a descriptor would reject in a body: unsupported keys (model and prompt are always fine), enum values not listed, ranges exceeded
function bodyViolations(body, caps) {
  const out = [];
  for (const [k, v] of Object.entries(body)) {
    if (k === 'model' || k === 'prompt') continue;
    const c = caps[k];
    if (!c) { out.push(k + ' unsupported'); continue; }
    if (c.type === 'enum' && Array.isArray(c.values) && !c.values.includes(String(v))) out.push(k + '=' + v + ' not in enum');
    if (c.type === 'range') { const n = Array.isArray(v) ? v.length : v; if (typeof n === 'number' && ((typeof c.min === 'number' && n < c.min) || (typeof c.max === 'number' && n > c.max))) out.push(k + ' out of range'); }
  }
  return out;
}

// GET with a timeout; returns { ok, status, json } or throws a network error (the caller decides offline = SKIP)
async function fetchJson(url, timeoutMs) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs || 15000);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { accept: 'application/json' } });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { json = null; }
    return { ok: res.ok, status: res.status, json };
  } finally { clearTimeout(t); }
}

module.exports = { FIXTURE_DIR, LISTING_URL, MARK, descriptorUrl, fixtureFile, fixtureModels, loadFixture, saveFixture, AsyncFunction, ctxWith, ctxFixtures, modelOfUrl, unionCaps, capsShape, staticTableOf, staticKeysFor, staticRatiosFor, pruningTailOf, ratioValue, fitsWithin, bodyViolations, fetchJson };
