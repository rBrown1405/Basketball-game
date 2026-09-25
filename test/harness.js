// Loads the game's core scripts into Node for testing (no DOM).
const fs = require('fs'), vm = require('vm'), path = require('path');
global.window = global;
const root = path.join(__dirname, '..');
const CORE = ['util', 'names', 'config', 'player', 'persona', 'tendency', 'sliders', 'league', 'stats', 'ai', 'sim', 'season', 'coach', 'draft', 'offseason', 'trade', 'magazine', 'storage'];
for (const f of CORE) {
  const p = path.join(root, 'js/core', f + '.js');
  if (fs.existsSync(p)) vm.runInThisContext(fs.readFileSync(p, 'utf8'), { filename: p });
}
module.exports = global.PBC;
