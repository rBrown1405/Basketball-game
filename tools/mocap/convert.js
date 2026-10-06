// One command for a licensed pack on your own computer: its FBX (or BVH) files in, the lab's private pack out.
//   node tools/mocap/convert.js <folder or file> [--name animo] [--label "Animo"] [--blender <path to Blender>]
// FBX files go through Blender (the app, found where it usually installs, or --blender, or $BLENDER; or python3 with
// bpy). The BVH land in tools/mocap/private/<name>_bvh, the clip list in tools/mocap/private/<name>.json (edit it to
// trim or rename clips, mark dribbles, then run this again: it is kept) and the clips in js/mocap/private/packs.js,
// which the Animation Lab loads. All of tools/mocap/private and js/mocap/private stay out of git (docs/MOCAP.md).
'use strict';
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const B = require('./bvh'), MAPS = require('./maps');
const { pack } = require('./pack');

const ROOT = path.join(__dirname, '..', '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const src = args[0];
if (!src || !fs.existsSync(src)) {
  console.log('usage: node tools/mocap/convert.js <folder or file of .fbx / .bvh> [--name animo] [--label "Animo"] [--blender <path>]');
  process.exit(1);
}
const name = (opt('name', 'pack') || 'pack').replace(/[^a-zA-Z0-9_]/g, '_');
const label = opt('label', name.charAt(0).toUpperCase() + name.slice(1));
const PRIV = path.join(ROOT, 'tools', 'mocap', 'private'), bvhDir = path.join(PRIV, name + '_bvh');
fs.mkdirSync(bvhDir, { recursive: true });

// ---------------- the files
const files = [];
const walk = (p) => { const st = fs.statSync(p); if (st.isDirectory()) for (const f of fs.readdirSync(p).sort()) walk(path.join(p, f)); else files.push(p); };
walk(src);
const fbx = files.filter(f => /\.fbx$/i.test(f)), bvhIn = files.filter(f => /\.bvh$/i.test(f));
console.log(fbx.length + ' FBX and ' + bvhIn.length + ' BVH files in ' + src);
if (!fbx.length && !bvhIn.length) {
  const kinds = [...new Set(files.map(f => path.extname(f).toLowerCase()))].join(' ');
  console.log('nothing to convert (files here: ' + (kinds || 'none') + ').' + (/uasset/.test(kinds) ? ' These are Unreal Engine files: export the animations to FBX from the Unreal editor first, or download the FBX version.' : ''));
  process.exit(1);
}
for (const f of bvhIn) fs.copyFileSync(f, path.join(bvhDir, path.basename(f)));

// ---------------- FBX through Blender
if (fbx.length) {
  const script = path.join(__dirname, 'fbx2bvh.py');
  const tries = [opt('blender'), process.env.BLENDER, '/Applications/Blender.app/Contents/MacOS/Blender', 'blender'].filter(Boolean);
  let run = null;
  for (const b of tries) { const r = spawnSync(b, ['--version'], { encoding: 'utf8' }); if (r.status === 0) { run = (input) => spawnSync(b, ['--background', '--python', script, '--', input, bvhDir], { encoding: 'utf8', maxBuffer: 1 << 26 }); console.log('Blender: ' + b); break; } }
  if (!run) {
    for (const py of ['python3', 'python']) {
      const r = spawnSync(py, ['-c', 'import bpy'], { encoding: 'utf8' });
      if (r.status === 0) { run = (input) => spawnSync(py, [script, input, bvhDir], { encoding: 'utf8', maxBuffer: 1 << 26 }); console.log('Blender: the bpy module in ' + py); break; }
    }
  }
  if (!run) {
    console.log('Blender was not found. Install it from https://www.blender.org/download/ (or: pip install bpy), or pass --blender <path to the Blender program>.');
    process.exit(1);
  }
  for (const f of fbx) {
    const r = run(f);
    const out = (r.stdout || '') + (r.stderr || '');
    const made = out.split('\n').filter(l => /\.bvh \d+ \d+ fps/.test(l)).length;
    console.log((made ? 'ok    ' : 'FAILED') + ' ' + path.basename(f) + (made > 1 ? ' (' + made + ' clips)' : '') + (made ? '' : '\n' + out.split('\n').slice(-6).join('\n')));
  }
}

// ---------------- the clip list (kept between runs: new takes are added, edits stay)
const takes = fs.readdirSync(bvhDir).filter(f => /\.bvh$/i.test(f)).sort();
if (!takes.length) { console.log('no BVH came out of the conversion'); process.exit(1); }
const listF = path.join(PRIV, name + '.json');
const list = fs.existsSync(listF) ? JSON.parse(fs.readFileSync(listF, 'utf8')) : { pack: label, source: label + ' (licensed; kept private)', credit: label, map: 'auto', fps: 30, group: 'Motion capture (' + label + ')', clips: [] };
// (labels from the file names, less the start every file shares)
const stems = takes.map(f => f.replace(/\.bvh$/i, ''));
let pre = stems[0];
for (const s of stems) while (pre && !s.startsWith(pre)) pre = pre.slice(0, -1);
if (stems.length < 2) pre = '';
const pretty = (s) => s.slice(pre.length).replace(/__/g, ' ').replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/\s+/g, ' ').trim() || s;
const known = new Set(list.clips.map(c => c.file));
let added = 0;
for (const f of takes) {
  if (known.has(f)) continue;
  const stem = f.replace(/\.bvh$/i, '');
  list.clips.push({ file: f, name: name + '_' + stem.replace(/[^a-zA-Z0-9]/g, '_'), label: pretty(stem), ball: /dribbl/i.test(stem) ? 'dribble' : undefined });
  added++;
}
fs.writeFileSync(listF, JSON.stringify(list, null, 2) + '\n');
console.log(added + ' new clips in ' + path.relative(ROOT, listF) + ' (' + list.clips.length + ' in all)');
// the skeleton, read off the first take
const first = B.parse(fs.readFileSync(path.join(bvhDir, list.clips[0].file), 'utf8'));
const det = MAPS.detect(first.joints.map(j => j.name));
if (!det && list.map === 'auto') { console.log('no joint map fits this skeleton yet; its joints: ' + first.joints.map(j => j.name).join(', ') + '\nadd one to tools/mocap/maps.js'); process.exit(1); }
console.log('skeleton: ' + (det ? det.name : list.map));

// ---------------- retarget and pack
const outF = path.join(ROOT, 'js', 'mocap', 'private', 'packs.js');
pack(list, bvhDir, outF);
console.log('\nOpen the Animation Lab to see them: in ' + ROOT + ' run\n  python3 -m http.server 8765\nthen open http://localhost:8765/lab.html and pick "' + list.group + '".');
