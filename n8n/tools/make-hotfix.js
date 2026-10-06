#!/usr/bin/env node
// Deterministic generator of the hot-fix bundle ../ops/hotfix-2026-10-06-openrouter-params/ (OpenRouter image parameters: one Build OpenRouter
// Image node update per workflow). Inputs: the BEFORE baselines ../ops/before/wf2-generate.sdk.js / wf3-edit.sdk.js (= live WF-2 / WF-3) and the
// main sources ../wf2-generate.sdk.js / ../wf3-edit.sdk.js. Outputs (all composed from those, never edited by hand):
//   wf2-generate.hotfix.sdk.js  = BEFORE WF-2 with ONLY the jsCode: line of Build OpenRouter Image replaced by the main-source line (hotfix node = main node)
//   wf3-edit.hotfix.sdk.js      = BEFORE WF-3 with ONLY that line replaced by: the BEFORE node jsCode minus its last line (return { json: { body } };)
//                                 + the pruning tail of the main WF-3 node (from the top-level comment that starts with "// OpenRouter validates" to the
//                                 end). The live WF-3 graph has no region lane, so the hot-fix carries no region branch whatever prompt-engine is deployed;
//                                 the tail's shape check (fit = the parent's real pixel size, defined only by the main WF-3 head) is inert in it.
//   wf2.ops.json / wf3.ops.json = node diff-ops.js <before> <hotfix> (exactly one updateNodeParameters op each)
//   wf2-build-openrouter-image.js / wf3-build-openrouter-image.js = the hotfix node jsCode as plain JS (exact bytes, NO trailing newline), paste-ready
//   wf2-build-openrouter-image.before.js / wf3-build-openrouter-image.before.js = the BEFORE node jsCode, same form (rollback)
// Usage: node make-hotfix.js            writes the bundle (prints each file and whether it changed)
//        node make-hotfix.js --check    writes nothing; exits 1 and names every file that differs from what it would write
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { parseWorkflowCodeToBuilder } = require('@n8n/workflow-sdk');

const H = path.resolve(__dirname, '..', 'ops', 'hotfix-2026-10-06-openrouter-params');
const NODE = 'Build OpenRouter Image';
const MARK = '// OpenRouter validates image parameters per model';
const check = process.argv.includes('--check');
const stripImport = (raw) => raw.split('\n').filter((l) => !/^\s*import\s.*from\s+['"]@n8n\/workflow-sdk['"]/.test(l)).join('\n');
const nodeCode = (src) => { const n = parseWorkflowCodeToBuilder(stripImport(src)).toJSON().nodes.find((x) => x.name === NODE); if (!n) throw new Error(NODE + ' not found'); return String(n.parameters.jsCode); };
// the jsCode: line of Build OpenRouter Image in an sdk source = the line after "name: 'Build OpenRouter Image'," that starts with jsCode:
function codeLineIndex(lines) {
  const at = lines.findIndex((l) => l.trim() === "name: '" + NODE + "',");
  if (at < 0) throw new Error(NODE + ' config not found');
  const idx = lines.findIndex((l, i) => i > at && /^\s*jsCode: /.test(l));
  if (idx < 0 || idx - at > 5) throw new Error('jsCode line of ' + NODE + ' not found');
  return idx;
}
// the pruning tail of a main-source node: from the MARK comment line to the end
function tailOf(code) {
  const lines = code.split('\n'), m = lines.findIndex((l) => l.startsWith(MARK));
  if (m < 0) throw new Error('pruning tail not found (no line starts with ' + MARK + ')');
  return lines.slice(m).join('\n');
}
// BEFORE source with only the jsCode: line of Build OpenRouter Image replaced by the given code (JSON string literal, same indent, no trailing comma = the sources' form)
function compose(beforeSrc, code) {
  const lines = beforeSrc.split('\n'), idx = codeLineIndex(lines);
  const indent = lines[idx].match(/^\s*/)[0];
  if (/,\s*$/.test(lines[idx])) throw new Error('unexpected trailing comma on the jsCode line');
  lines[idx] = indent + 'jsCode: ' + JSON.stringify(code);
  return lines.join('\n');
}

const SETS = [
  { wf: 'wf2', before: path.resolve(__dirname, '..', 'ops', 'before', 'wf2-generate.sdk.js'), main: path.resolve(__dirname, '..', 'wf2-generate.sdk.js'), hotfix: 'wf2-generate.hotfix.sdk.js', ops: 'wf2.ops.json', paste: 'wf2-build-openrouter-image.js', pasteBefore: 'wf2-build-openrouter-image.before.js' },
  { wf: 'wf3', before: path.resolve(__dirname, '..', 'ops', 'before', 'wf3-edit.sdk.js'), main: path.resolve(__dirname, '..', 'wf3-edit.sdk.js'), hotfix: 'wf3-edit.hotfix.sdk.js', ops: 'wf3.ops.json', paste: 'wf3-build-openrouter-image.js', pasteBefore: 'wf3-build-openrouter-image.before.js' }
];

// what the bundle must contain: { <file name>: <exact content> }
function expected() {
  const out = {};
  for (const s of SETS) {
    const beforeSrc = fs.readFileSync(s.before, 'utf8'), mainSrc = fs.readFileSync(s.main, 'utf8');
    const beforeCode = nodeCode(beforeSrc), mainCode = nodeCode(mainSrc);
    let hotCode;
    if (s.wf === 'wf2') hotCode = mainCode;
    else {
      const head = beforeCode.split('\n');
      if (head[head.length - 1] !== 'return { json: { body } };') throw new Error('BEFORE WF-3 node does not end with return { json: { body } };');
      hotCode = head.slice(0, -1).join('\n') + '\n' + tailOf(mainCode);
    }
    if (/\\/.test(hotCode)) throw new Error('backslash in the ' + s.wf + ' hotfix jsCode');
    if (s.wf === 'wf3' && /const fit = |region/.test(hotCode)) throw new Error('the wf3 hotfix jsCode carries region-branch code (fit / region)');
    if (!/typeof fit === 'string'/.test(tailOf(mainCode))) throw new Error('the pruning tail of ' + s.wf + ' lacks the fit shape check');
    if (hotCode.split('\n').length > 20) throw new Error(s.wf + ' hotfix jsCode over 20 lines');
    const hotSrc = compose(beforeSrc, hotCode);
    if (nodeCode(hotSrc) !== hotCode) throw new Error(s.wf + ' composed hotfix source does not parse back to the hotfix jsCode');
    out[s.hotfix] = hotSrc;
    out[s.paste] = hotCode;
    out[s.pasteBefore] = beforeCode;
    out[s.ops] = null; // filled below from the hotfix file on disk (diff-ops.js reads files)
  }
  return out;
}

const want = expected();
const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'make-hotfix-'));
try {
  for (const s of SETS) {
    const tmp = path.join(tmpDir, s.hotfix);
    fs.writeFileSync(tmp, want[s.hotfix]);
    want[s.ops] = execFileSync('node', [path.join(__dirname, 'diff-ops.js'), s.before, tmp], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const ops = JSON.parse(want[s.ops]);
    if (!(ops.length === 1 && ops[0].type === 'updateNodeParameters' && ops[0].nodeName === NODE && ops[0].replace === true && Object.keys(ops[0].parameters).join() === 'jsCode' && ops[0].parameters.jsCode === want[s.paste])) throw new Error(s.wf + ' diff-ops did not produce exactly one jsCode update of ' + NODE);
  }
} finally { fs.rmSync(tmpDir, { recursive: true, force: true }); }

let differs = 0;
for (const [name, content] of Object.entries(want)) {
  const file = path.join(H, name);
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  const same = current === content;
  if (!same) differs++;
  if (check) console.log((same ? 'ok   ' : 'DIFF ') + path.relative(process.cwd(), file) + (current === null ? ' (missing)' : ''));
  else { if (!same) fs.writeFileSync(file, content); console.log((same ? 'same ' : 'wrote') + ' ' + path.relative(process.cwd(), file)); }
}
if (check && differs) { console.log(differs + ' file(s) differ from the generated bundle - run node make-hotfix.js'); process.exit(1); }
console.log(check ? 'bundle matches the sources' : 'bundle written');
