#!/usr/bin/env node
// Diffs two versions of an *.sdk.js workflow and prints the update_workflow operations that turn the live workflow
// (built from <before>) into <after>: addNode (+ setNodeSettings), updateNodeParameters (replace: true) for changed
// parameters, setNodeSettings for changed node settings, removeNode, and connection removes/adds.
// Sticky notes are skipped (their names are generated). Positions of existing nodes are left alone.
// Usage: node diff-ops.js <before.sdk.js> <after.sdk.js> [--split N]   (--split prints batches of N ops per line)
const fs = require('fs');
const path = require('path');
const { parseWorkflowCodeToBuilder } = require('@n8n/workflow-sdk');

const SETTING_KEYS = ['onError', 'retryOnFail', 'maxTries', 'waitBetweenTries', 'alwaysOutputData', 'executeOnce'];
const STICKY = 'n8n-nodes-base.stickyNote';

function load(file) {
  const code = fs.readFileSync(path.resolve(file), 'utf8')
    .split('\n').filter((l) => !/^\s*import\s.*from\s+['"]@n8n\/workflow-sdk['"]/.test(l)).join('\n');
  return parseWorkflowCodeToBuilder(code).toJSON();
}
const settingsOf = (n) => Object.fromEntries(SETTING_KEYS.filter((k) => n[k] !== undefined).map((k) => [k, n[k]]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function edges(json) {
  const out = [];
  for (const [source, outs] of Object.entries(json.connections || {})) {
    for (const [type, arr] of Object.entries(outs)) {
      arr.forEach((group, sourceIndex) => {
        for (const c of group || []) out.push({ source, sourceIndex, target: c.node, targetIndex: c.index || 0, type: c.type || type });
      });
    }
  }
  return out;
}
const key = (e) => [e.source, e.sourceIndex, e.target, e.targetIndex, e.type].join('|');
function connOp(type, e) {
  const op = { type, source: e.source, target: e.target };
  if (e.sourceIndex) op.sourceIndex = e.sourceIndex;
  if (e.targetIndex) op.targetIndex = e.targetIndex;
  if (e.type && e.type !== 'main') op.connectionType = e.type;
  return op;
}

const [beforeFile, afterFile] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const splitIdx = process.argv.indexOf('--split');
const split = splitIdx > 0 ? Number(process.argv[splitIdx + 1]) : 0;
const before = load(beforeFile);
const after = load(afterFile);
const bNodes = new Map(before.nodes.filter((n) => n.type !== STICKY).map((n) => [n.name, n]));
const aNodes = new Map(after.nodes.filter((n) => n.type !== STICKY).map((n) => [n.name, n]));

const adds = [], updates = [], removes = [];
for (const [name, n] of aNodes) {
  const b = bNodes.get(name);
  if (!b) {
    const node = { name, type: n.type, typeVersion: n.typeVersion, position: n.position, parameters: n.parameters || {} };
    if (n.credentials) node.credentials = n.credentials;
    adds.push({ type: 'addNode', node });
    const s = settingsOf(n);
    if (Object.keys(s).length) adds.push({ type: 'setNodeSettings', nodeName: name, settings: s });
    continue;
  }
  if (b.type !== n.type || b.typeVersion !== n.typeVersion) throw new Error('type/version change on ' + name + ' - handle by hand');
  if (!same(b.parameters || {}, n.parameters || {})) updates.push({ type: 'updateNodeParameters', nodeName: name, parameters: n.parameters || {}, replace: true });
  const sb = settingsOf(b), sa = settingsOf(n);
  if (!same(sb, sa)) updates.push({ type: 'setNodeSettings', nodeName: name, settings: sa });
  if (!same(b.credentials || null, n.credentials || null)) throw new Error('credential change on ' + name + ' - handle by hand');
}
for (const name of bNodes.keys()) if (!aNodes.has(name)) removes.push({ type: 'removeNode', nodeName: name });

const eb = new Map(edges(before).map((e) => [key(e), e]));
const ea = new Map(edges(after).map((e) => [key(e), e]));
const connRemoves = [...eb.keys()].filter((k) => !ea.has(k) && aNodes.has(eb.get(k).source) && aNodes.has(eb.get(k).target)).map((k) => connOp('removeConnection', eb.get(k)));
const connAdds = [...ea.keys()].filter((k) => !eb.has(k)).map((k) => connOp('addConnection', ea.get(k)));

const ops = [...adds, ...updates, ...connRemoves, ...removes, ...connAdds];
if (split) {
  for (let i = 0; i < ops.length; i += split) process.stdout.write(JSON.stringify(ops.slice(i, i + split)) + '\n');
} else {
  process.stdout.write(JSON.stringify(ops) + '\n');
}
process.stderr.write(`ops: ${ops.length} (addNode ${adds.filter((o) => o.type === 'addNode').length}, update ${updates.length}, removeConn ${connRemoves.length}, removeNode ${removes.length}, addConn ${connAdds.length})\n`);
