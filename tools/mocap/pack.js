// Retarget a list of takes and pack them into a script the game loads (js/mocap/<pack>.js), for js/match/mocap.js.
//   node tools/mocap/pack.js <list.json> <takes dir> <out.js>
// list.json: { pack, credit, map, clips: [{ file, name, label, group, from, to }] }
// The pose channels are kept as integers (angles in tenths of a degree, lengths in thousandths of a foot or ten
// thousandths of the height), 30 frames a second.
'use strict';
const fs = require('fs'), path = require('path');
const B = require('./bvh');
const { retarget, loadRig } = require('./retarget');

const DEG10 = 1800 / Math.PI;
function quant(name) {
  if (name === 'rootZ') return 1e4;
  if (/^root|Clv|Fing$/.test(name)) return 1e3;
  return DEG10;
}

function main() {
  const [listF, dir, outF] = process.argv.slice(2);
  const list = JSON.parse(fs.readFileSync(listF, 'utf8'));
  const M = loadRig();
  const clips = [];
  for (const c of list.clips) {
    const bvh = B.parse(fs.readFileSync(path.join(dir, c.file), 'utf8'));
    const r = retarget(bvh, { M, map: list.map, from: c.from, to: c.to, fps: list.fps || 30 });
    const q = r.ch.map(quant);
    const f = [];
    for (const fr of r.frames) for (let k = 0; k < fr.length; k++) f.push(Math.round(fr[k] * q[k]));
    clips.push({
      name: c.name, label: c.label, group: c.group || list.group, src: list.credit + ' ' + c.file.replace(/\.bvh$/, ''),
      fps: r.fps, n: r.n, H: r.H, ch: r.ch, q: q.map(v => +v.toFixed(6)), f,
      tx: r.track.x.map(v => Math.round(v * 1e4)), ty: r.track.y.map(v => Math.round(v * 1e4)), yaw: r.track.yaw.map(v => Math.round(v * 1e4)),
      yaw0: +r.yaw0.toFixed(5), c: r.contacts,
    });
    console.log(c.name.padEnd(14), (r.n / r.fps).toFixed(2) + 's', 'feet off the floor (p90)', (r.stats.floorMiss * 12).toFixed(1) + ' in', 'contacts', r.contacts.l.length + '/' + r.contacts.r.length);
  }
  const body = '/* Pro BBALL Coach: motion capture clips (' + list.pack + '), retargeted onto the rig by tools/mocap/pack.js.\n' +
    ' * Source: ' + list.source + '\n * Generated: do not edit by hand. */\n' +
    '(window.PBC = window.PBC || {}).MocapData = (window.PBC.MocapData || []).concat(' + JSON.stringify(clips) + ');\n';
  fs.writeFileSync(outF, body);
  console.log('wrote', outF, (body.length / 1024).toFixed(0) + ' KB', clips.length + ' clips');
}

main();
