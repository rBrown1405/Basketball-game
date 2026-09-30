#!/usr/bin/env node
// Rebuilds report.md, report.html and metrics.json from a saved games.json (after a change to report.js), without
// playing the games again:
//   node tools/audit/rebuild.js audit/phase1 [--label "..."] [--baseline audit/phase0/metrics.json] [--baseLabel "..."]
'use strict';
const fs = require('fs'), path = require('path');
const report = require('./report.js');
const dir = path.resolve(process.argv[2] || 'audit/latest');
const args = {};
for (let i = 3; i < process.argv.length; i++) { const k = process.argv[i]; if (k.startsWith('--')) { args[k.slice(2)] = process.argv[i + 1]; i++; } }
const data = JSON.parse(fs.readFileSync(path.join(dir, 'games.json'), 'utf8'));
const label = args.label || data.label || 'now';
const base = args.baseline ? JSON.parse(fs.readFileSync(path.resolve(args.baseline), 'utf8')) : null;
const o = { label, baseline: base ? base.metrics || report.metrics(base.games) : null, baseLabel: args.baseLabel || (base && base.label) || 'baseline' };
const old = fs.existsSync(path.join(dir, 'metrics.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'metrics.json'), 'utf8')) : {};
fs.writeFileSync(path.join(dir, 'metrics.json'), JSON.stringify({ label, date: old.date || new Date().toISOString().slice(0, 10), metrics: report.metrics(data.games) }, null, 1));
const r = report.html(data.games, o);
fs.writeFileSync(path.join(dir, 'report.md'), r.md);
fs.writeFileSync(path.join(dir, 'report.html'), r.html);
console.log('rebuilt', path.join(dir, 'report.md'), 'and report.html');
