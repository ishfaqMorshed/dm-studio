#!/usr/bin/env node
// Validates every *.sdk.js workflow file in ../ with the real @n8n/workflow-sdk.
// Usage: node check.js [file ...]   (defaults to all ../*.sdk.js)
const fs = require('fs');
const path = require('path');
const { parseWorkflowCodeToBuilder, validateWorkflowBuilder } = require('@n8n/workflow-sdk');

// --worker-cred-id <id>  : validate as if the n8n credential "DM Studio Worker Secret" existed with that id
//                          (rewrites newCredential('DM Studio Worker Secret') -> newCredential('DM Studio Worker Secret', '<id>') in memory only)
const argv = process.argv.slice(2);
const credFlag = argv.indexOf('--worker-cred-id');
const workerCredId = credFlag >= 0 ? argv[credFlag + 1] : '';
const fileArgs = argv.filter((a, i) => a !== '--worker-cred-id' && !(credFlag >= 0 && i === credFlag + 1));

const dir = path.resolve(__dirname, '..');
const files = fileArgs.length
  ? fileArgs.map((f) => path.resolve(f))
  : fs.readdirSync(dir).filter((f) => f.endsWith('.sdk.js')).map((f) => path.join(dir, f));

if (workerCredId) console.log(`(validating with DM Studio Worker Secret bound to id ${workerCredId})`);
let allOk = true;
for (const file of files) {
  const raw = fs.readFileSync(file, 'utf8');
  let code = raw.split('\n').filter((l) => !/^\s*import\s.*from\s+['"]@n8n\/workflow-sdk['"]/.test(l)).join('\n');
  if (workerCredId) code = code.replace("newCredential('DM Studio Worker Secret')", "newCredential('DM Studio Worker Secret', '" + workerCredId + "')");
  const name = path.basename(file);
  try {
    const builder = parseWorkflowCodeToBuilder(code);
    const result = validateWorkflowBuilder(builder, { lint: true, source: code });
    const json = builder.toJSON();
    const nodes = json.nodes || [];
    const functional = nodes.filter((n) => n.type !== 'n8n-nodes-base.stickyNote');
    const codeNodes = nodes.filter((n) => n.type === 'n8n-nodes-base.code');
    const longCode = codeNodes
      .map((n) => ({ name: n.name, lines: String(n.parameters?.jsCode || '').split('\n').length }))
      .filter((c) => c.lines > 20);
    const connCount = Object.values(json.connections || {}).reduce((acc, outs) => {
      for (const arr of Object.values(outs)) for (const group of arr) acc += (group || []).length;
      return acc;
    }, 0);
    const blocking = result.blocking || [];
    const info = result.informational || [];
    console.log(`\n=== ${name} ===`);
    console.log(`valid: ${result.valid}  ok: ${result.ok}  nodes: ${nodes.length} (functional ${functional.length}, sticky ${nodes.length - functional.length})  connections: ${connCount}`);
    console.log(`blocking issues: ${blocking.length}  informational: ${info.length}  lint: ${(result.lint || []).length}`);
    for (const i of blocking) console.log(`  [BLOCK] ${i.source}/${i.code} ${i.nodeName ? '(' + i.nodeName + ') ' : ''}${i.message}`);
    for (const i of info) console.log(`  [info]  ${i.source}/${i.code} ${i.nodeName ? '(' + i.nodeName + ') ' : ''}${i.message}`);
    for (const l of result.lint || []) console.log(`  [lint]  ${l.code || ''} ${l.message}${l.line ? ' (line ' + l.line + ')' : ''}`);
    if (longCode.length) { console.log(`  [RULE] Code nodes over 20 lines: ${JSON.stringify(longCode)}`); allOk = false; }
    if (result.unchecked?.length) console.log(`  unchecked: ${result.unchecked.join('; ')}`);
    for (const [from, outs] of Object.entries(json.connections || {})) {
      for (const [kind, arr] of Object.entries(outs)) {
        arr.forEach((group, idx) => {
          for (const c of group || []) console.log(`  ${from} [${kind}:${idx}] -> ${c.node}${c.type !== 'main' ? ' (' + c.type + ')' : ''}${c.index ? ' @in' + c.index : ''}`);
        });
      }
    }
    if (!result.valid || blocking.length) allOk = false;
  } catch (err) {
    allOk = false;
    console.log(`\n=== ${name} ===\nPARSE/BUILD ERROR: ${err.stack || err.message}`);
  }
}
process.exit(allOk ? 0 : 1);
