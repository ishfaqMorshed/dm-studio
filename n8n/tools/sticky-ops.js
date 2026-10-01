#!/usr/bin/env node
// Prints the update_workflow operation that copies the canvas note (sticky) of an *.sdk.js file onto the LIVE sticky node.
// diff-ops.js skips stickies because the SDK generates their names ("Sticky Note <hash>") on every parse, so the live name
// must be given: read it from get_workflow_details(<id>).workflow.nodes (type n8n-nodes-base.stickyNote).
// Usage: node sticky-ops.js <after.sdk.js> "<live sticky node name>" [index]   (index = which sticky of the file, default 0)
const fs = require('fs');
const path = require('path');
const { parseWorkflowCodeToBuilder } = require('@n8n/workflow-sdk');
const [file, liveName, idx] = process.argv.slice(2);
if (!file || !liveName) { console.error('usage: node sticky-ops.js <after.sdk.js> "<live sticky node name>" [index]'); process.exit(2); }
const code = fs.readFileSync(path.resolve(file), 'utf8').split('\n').filter((l) => !/^\s*import\s.*from\s+['"]@n8n\/workflow-sdk['"]/.test(l)).join('\n');
const stickies = parseWorkflowCodeToBuilder(code).toJSON().nodes.filter((n) => n.type === 'n8n-nodes-base.stickyNote');
const s = stickies[Number(idx) || 0];
if (!s) { console.error('no sticky note #' + (idx || 0) + ' in ' + file); process.exit(1); }
const p = { content: s.parameters.content };
for (const k of ['color', 'width', 'height']) if (s.parameters[k] !== undefined) p[k] = s.parameters[k];
process.stdout.write(JSON.stringify([{ type: 'updateNodeParameters', nodeName: liveName, parameters: p }]) + '\n');
