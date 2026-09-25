/* Pro BBALL Coach — one face per player (PBC.Identity).
 * The pixel portraits (magazine, cards, box scores) and the in-game character model draw from the same
 * feature set, so a player looks like the same person everywhere: face shape, jaw, chin, cheekbones, forehead
 * and hairline, eyes (size, spacing, tilt, colour), brows, nose, lips and mouth width, ears, neck, plus the
 * hair style / colour, facial hair, skin tone and build already stored on p.look.
 * Features come deterministically from the player id (so existing saves keep their faces) and any explicit
 * p.look.feat values from the editor override them. All values are 0..1 (0.5 = average). */
(function () {
  'use strict';
  const PBC = (window.PBC = window.PBC || {});
  const U = PBC.U;

  const KEYS = ['faceLen', 'jaw', 'chin', 'cheek', 'forehead', 'hairline', 'eyeSize', 'eyeSpace', 'eyeTilt', 'lid', 'browThick', 'browArch',
    'noseW', 'noseL', 'noseBridge', 'lipFull', 'mouthW', 'earSize', 'neck', 'musc'];
  const LABELS = {
    faceLen: 'Face length', jaw: 'Jaw width', chin: 'Chin', cheek: 'Cheekbones', forehead: 'Forehead', hairline: 'Hairline',
    eyeSize: 'Eye size', eyeSpace: 'Eye spacing', eyeTilt: 'Eye tilt', lid: 'Eyelids', browThick: 'Brow thickness', browArch: 'Brow arch',
    noseW: 'Nose width', noseL: 'Nose length', noseBridge: 'Nose bridge', lipFull: 'Lip fullness', mouthW: 'Mouth width', earSize: 'Ears', neck: 'Neck', musc: 'Muscle',
  };
  const EYE_COLORS = ['#2b1a10', '#3a2416', '#5a3a1e', '#6b4a2a', '#4a5d3a', '#5c7a3a', '#3f6a8a', '#6e8fa8', '#7a7a70'];

  /** deterministic 0..1 from the player id and a salt */
  function h01(id, salt) { return (U.hash(String(id) + '|' + salt) % 10007) / 10007; }
  /** gaussian-ish 0..1 centred on 0.5 (sum of three hashes) */
  function g01(id, salt) { return U.clamp((h01(id, salt) + h01(id, salt + 'b') + h01(id, salt + 'c')) / 3 * 1.35 - 0.175, 0, 1); }

  /**
   * Feature set for a player (or a look object with an id). Cached on the look under `_feat` with a version stamp
   * of the inputs so editor changes show up immediately.
   */
  function features(p) {
    if (!p) return defaults();
    const lk = p.look || (p.look = {});
    const id = p.id != null ? p.id : (lk.id != null ? lk.id : (p.last || 'x'));
    const gender = p.gender || lk.gender || 'm';
    const fem = gender === 'f';
    const stamp = id + '|' + gender + '|' + (lk.skin | 0) + '|' + (lk.hair || '') + '|' + (lk.beard || '') + '|' + (lk.build == null ? '' : lk.build) + '|' + JSON.stringify(lk.feat || null) + '|' + (lk.eyes || '');
    if (lk._feat && lk._feat.stamp === stamp) return lk._feat;
    const f = { stamp, id, fem };
    for (const k of KEYS) f[k] = g01(id, k);
    // gentle gender priors: women in the game get a slightly narrower jaw, fuller lips, thinner brows
    if (fem) { f.jaw = f.jaw * 0.8; f.lipFull = 0.35 + f.lipFull * 0.65; f.browThick *= 0.7; f.neck *= 0.8; }
    // bigger, heavier players tend to have wider jaws and necks
    const build = lk.build == null ? 0.5 : +lk.build;
    f.jaw = U.clamp(f.jaw + (build - 0.5) * 0.35, 0, 1);
    f.neck = U.clamp(f.neck + (build - 0.5) * 0.5, 0, 1);
    f.musc = U.clamp(f.musc * 0.6 + build * 0.4 - (fem ? 0.1 : 0), 0, 1);
    // explicit overrides from the editor
    if (lk.feat) for (const k of KEYS) if (lk.feat[k] != null && isFinite(+lk.feat[k])) f[k] = U.clamp(+lk.feat[k], 0, 1);
    // colours
    f.skin = U.clamp(lk.skin == null ? 3 : lk.skin | 0, 0, 7);
    f.hair = lk.hair || (fem ? 'ponytail' : 'fade');
    f.hairColor = lk.hairColor && lk.hairColor !== '#000000' ? lk.hairColor : '#1b1410';
    f.beard = fem ? 'none' : (lk.beard || 'none');
    f.eyeColor = lk.eyes || EYE_COLORS[f.skin >= 4 ? (h01(id, 'ec') < 0.85 ? (h01(id, 'ec2') < 0.5 ? 0 : 1) : 3) : Math.floor(h01(id, 'ec') * EYE_COLORS.length)];
    f.build = build;
    f.headband = lk.headband || null;
    f.tattoo = lk.tattoo || 'none';
    lk._feat = f;
    return f;
  }
  function defaults() {
    const f = { stamp: '', id: 0, fem: false };
    for (const k of KEYS) f[k] = 0.5;
    f.skin = 3; f.hair = 'fade'; f.hairColor = '#1b1410'; f.beard = 'none'; f.eyeColor = '#2b1a10'; f.build = 0.5; f.headband = null; f.tattoo = 'none';
    return f;
  }
  /** a short human description ("long face, strong jaw, full lips") for the editor / scouting text */
  function describe(f) {
    const out = [];
    if (f.faceLen > 0.72) out.push('long face'); else if (f.faceLen < 0.28) out.push('round face');
    if (f.jaw > 0.72) out.push('strong jaw'); else if (f.jaw < 0.28) out.push('narrow jaw');
    if (f.cheek > 0.75) out.push('high cheekbones');
    if (f.eyeSize > 0.75) out.push('big eyes'); else if (f.eyeSize < 0.25) out.push('narrow eyes');
    if (f.browThick > 0.75) out.push('heavy brows');
    if (f.noseW > 0.75) out.push('broad nose'); else if (f.noseL > 0.75) out.push('long nose');
    if (f.lipFull > 0.75) out.push('full lips');
    if (f.earSize > 0.8) out.push('big ears');
    return out.join(', ');
  }

  PBC.Identity = { features, KEYS, LABELS, EYE_COLORS, describe };
})();
