#!/usr/bin/env node
// Prints update_workflow operations that set the jsCode of Code nodes from an *.sdk.js source file.
// Usage: node export-nodes.js <file.sdk.js> [--match <substring>]... [--node <name>]...
//   --match keeps Code nodes whose jsCode contains the substring; --node keeps nodes by name.
// Output: JSON array of {type:"updateNodeParameters", nodeName, parameters:{jsCode}} ready for update_workflow.
const fs = require('fs');
const path = require('path');
const { parseWorkflowCodeToBuilder } = require('@n8n/workflow-sdk');

const argv = process.argv.slice(2);
const file = argv.find((a, i) => !a.startsWith('--') && !['--match', '--node'].includes(argv[i - 1]));
const pick = (flag) => argv.flatMap((a, i) => (a === flag ? [argv[i + 1]] : []));
const matches = pick('--match');
const names = pick('--node');

const raw = fs.readFileSync(path.resolve(file), 'utf8');
const code = raw.split('\n').filter((l) => !/^\s*import\s.*from\s+['"]@n8n\/workflow-sdk['"]/.test(l)).join('\n');
const nodes = parseWorkflowCodeToBuilder(code).toJSON().nodes || [];
const ops = nodes
  .filter((n) => n.type === 'n8n-nodes-base.code')
  .filter((n) => names.includes(n.name) || matches.some((m) => String(n.parameters?.jsCode || '').includes(m)))
  .map((n) => ({ type: 'updateNodeParameters', nodeName: n.name, parameters: { jsCode: n.parameters.jsCode } }));
process.stdout.write(JSON.stringify(ops, null, 1) + '\n');
