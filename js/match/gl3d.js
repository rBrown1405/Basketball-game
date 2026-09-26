/* Pro BBALL Coach — match view: WebGL2 renderer for the realistic 3D people (PBC.Match.GL3D).
 * Every visible person is rendered into its own cell of an offscreen WebGL2 canvas (4x MSAA) with a projection
 * that maps exactly onto the broadcast camera; the cells are then drawn onto the 2D scene in the view's depth-sorted
 * order, so hoops, the ball and other players still overlap correctly. Meshes come from js/match/human_build.js.
 * Shading follows the research notes in docs/ANIMATION_RESEARCH.md: wrap-lit skin with a red scatter band and two
 * Beckmann specular lobes (Kelemen / Szirmay-Kalos, F0 0.028) that get oilier with sweat, face paint from UV masks
 * (brows, lips, beard, scalp hair, lash line), cloth with wrap diffuse and Charlie sheen, Kajiya-Kay hair, eyes with
 * an iris / limbal ring / cornea glint, a neutral arena light rig (overhead key, far-side fill, camera-side fill,
 * warm hardwood bounce, rim) and the Khronos PBR Neutral tone map. Without WebGL2 the view keeps the 2D figures. */
(function () {
  'use strict';
  const M = window.PBC.Match, U = M.U;
  const BD = M.Body3D;

  const VS = `#version 300 es
precision highp float;
precision highp int;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in uvec4 aBone;
layout(location=3) in vec4 aW;
layout(location=4) in vec4 aTw;
layout(location=5) in vec4 aMat;
layout(location=6) in vec2 aUV;
uniform highp sampler2D uBones;
uniform int uRow;
uniform mat4 uVP;
uniform vec3 uFlut;
uniform vec3 uSway;
uniform mat4 uShM;      // world -> shadow tile (xy in atlas uv, z depth 0..1)
out vec3 vW; out vec3 vN; out vec3 vB; out vec3 vBN; out vec4 vM; out vec2 vUV; out vec3 vSh; flat out float vMat;
void main() {
  vec3 p = vec3(0.0), n = vec3(0.0);
  vec4 P4 = vec4(aPos, 1.0);
  for (int i = 0; i < 4; i++) {
    float w = aW[i];
    if (w <= 0.0) continue;
    int b = int(aBone[i]) * 7;
    vec4 a0 = texelFetch(uBones, ivec2(b, uRow), 0);
    vec4 a1 = texelFetch(uBones, ivec2(b + 1, uRow), 0);
    vec4 a2 = texelFetch(uBones, ivec2(b + 2, uRow), 0);
    vec4 i0 = texelFetch(uBones, ivec2(b + 3, uRow), 0);
    vec4 i1 = texelFetch(uBones, ivec2(b + 4, uRow), 0);
    vec4 i2 = texelFetch(uBones, ivec2(b + 5, uRow), 0);
    float th = texelFetch(uBones, ivec2(b + 6, uRow), 0).x * aTw[i];
    vec3 lp = vec3(dot(i0, P4), dot(i1, P4), dot(i2, P4));
    vec3 ln = vec3(dot(i0.xyz, aNrm), dot(i1.xyz, aNrm), dot(i2.xyz, aNrm));
    float c = cos(th), s = sin(th);
    lp.xy = vec2(c * lp.x - s * lp.y, s * lp.x + c * lp.y);
    ln.xy = vec2(c * ln.x - s * ln.y, s * ln.x + c * ln.y);
    vec4 L4 = vec4(lp, 1.0);
    p += w * vec3(dot(a0, L4), dot(a1, L4), dot(a2, L4));
    n += w * vec3(dot(a0.xyz, ln), dot(a1.xyz, ln), dot(a2.xyz, ln));
  }
  int mat = int(aMat.x * 255.0 + 0.5);
  float f = aMat.z;
  if (mat == 2 || mat == 3) p += uFlut * f * f;       // shorts / jersey hem sway
  if (mat == 7) p += uSway * f * f;                  // hanging hair
  vW = p; vN = n; vB = aPos; vBN = aNrm; vM = aMat; vUV = aUV; vMat = aMat.x;
  // normal offset against acne
  vec4 sp = uShM * vec4(p + normalize(n) * 0.035, 1.0);
  vSh = sp.xyz;
  gl_Position = uVP * vec4(p, 1.0);
}`;

  const FS = `#version 300 es
precision highp float;
in vec3 vW; in vec3 vN; in vec3 vB; in vec3 vBN; in vec4 vM; in vec2 vUV; in vec3 vSh; flat in float vMat;
uniform highp sampler2DShadow uShadow;
uniform vec4 uShTile;   // atlas tile: u0, v0, du, dv
uniform float uShOn;
uniform vec3 uCam;
uniform sampler2D uMask1, uMask2;
uniform vec4 uMaskP;    // has masks, hairline threshold, brow threshold, lash strength
uniform vec4 uBeardW;   // full, mustache, goatee, stubble density
uniform vec4 uScalpP;   // scalp hair density on the sides, fade line (cm), fade width, 0
uniform vec3 uL0, uC0, uL1, uC1, uL2, uC2;
uniform vec3 uSky, uGround;
uniform float uExpo;
uniform vec3 uSkin, uJersey, uShorts, uTrim, uNum, uSock, uShoe, uShoeAcc, uSole, uHair, uSleeve, uBand, uIris, uLip;
uniform vec4 uHeadO;     // head origin (bind, feet) + feet per cm
uniform vec4 uFace;      // head-local cm: eye |x|, eye y (depth), eye z, mouth line z
uniform float uMouthW;   // half mouth width (cm)
uniform vec4 uEyeL, uEyeR; // eye centres (bind) + radius
uniform vec4 uGaze;      // gaze yaw, pitch (radians, head frame), blink 0..1, eyelid open
uniform vec4 uFlags;     // referee, tattoo ink, H (feet), sweat 0..1
uniform vec4 uHairF;     // coil (0 straight .. 1 coily), fade, shine, hair style id
uniform vec3 uRight;     // head right axis (world)
uniform sampler2D uNumTex;
uniform vec4 uNumRect;
uniform vec4 uCloth;     // jersey style: side panel, mesh pattern strength, stripe, 0
out vec4 oCol;

const float PI = 3.14159265;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float beck(float c, float m) { float c2 = c * c; return exp(-(1.0 - c2) / (c2 * m * m)) / (PI * m * m * c2 * c2); }
float ksk(vec3 N, vec3 L, vec3 V, float m) {
  float ndl = dot(N, L); if (ndl <= 0.0) return 0.0;
  vec3 h = L + V; vec3 H = normalize(h);
  float ndh = max(dot(N, H), 1e-3);
  float b = pow(1.0 - clamp(dot(V, H), 0.0, 1.0), 5.0);
  float F = b + 0.028 * (1.0 - b);
  return ndl * max(beck(ndh, m) * F / max(dot(h, h), 1e-3), 0.0);
}
vec3 wrapD(float ndl, vec3 w) { return clamp((vec3(ndl) + w) / ((1.0 + w) * (1.0 + w)), 0.0, 1.0); }
float charlie(float r, float ndh) { float inv = 1.0 / r; float s2 = max(1.0 - ndh * ndh, 0.0078125); return (2.0 + inv) * pow(s2, inv * 0.5) / (2.0 * PI); }
vec3 amb(vec3 N, float ao) { return mix(uGround, uSky, 0.5 + 0.5 * N.z) * ao; }
// key-light visibility from the person's shadow tile (5-tap PCF; arena light arrays make soft shadows)
float gKey = 1.0;
float keyShadow() {
  if (uShOn < 0.5) return 1.0;
  vec2 uv = vSh.xy;
  if (uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0) return 1.0;
  vec2 tuv = uShTile.xy + uv * uShTile.zw;
  float z = vSh.z - 0.004;
  vec2 px = uShTile.zw / 512.0 * 1.6;
  float s = texture(uShadow, vec3(tuv, z));
  s += texture(uShadow, vec3(tuv + vec2(px.x, 0.0), z));
  s += texture(uShadow, vec3(tuv - vec2(px.x, 0.0), z));
  s += texture(uShadow, vec3(tuv + vec2(0.0, px.y), z));
  s += texture(uShadow, vec3(tuv - vec2(0.0, px.y), z));
  return mix(0.28, 1.0, s / 5.0);
}
float rim(vec3 N, vec3 V) { return pow(1.0 - max(dot(N, V), 0.0), 4.0) * max(N.z, 0.0); }

float th21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float ln(float d, float w, float aa) { return 1.0 - smoothstep(w, w + aa, abs(d)); }
// tattoo ink density at tattoo coords t (x: around the limb 0..1, y: along it 0..1 upper arm to wrist; y >= 2: chest)
float tattooInk(vec2 t, float H, float seed) {
  bool chest = t.y > 1.5;
  vec2 q = chest ? vec2(t.x * 0.4 * H, (t.y - 2.0) * 0.15 * H) : vec2(t.x * 0.29 * H, t.y * 0.34 * H);
  q /= 0.3;                                   // ~0.3 ft motif cells
  float aa = max(fwidth(q.x) + fwidth(q.y), 0.01);
  // smoke / shading between the pieces
  float sm = noise(vec3(q * 1.1, seed * 9.0)) * 0.6 + noise(vec3(q * 3.1, seed * 5.0)) * 0.3 + noise(vec3(q * 9.0, seed)) * 0.1;
  float ink = smoothstep(0.3, 0.72, sm) * 0.62;
  if (chest) {
    // script across the chest: two lines of looping strokes
    float row = abs(q.y - 0.9) < 0.28 ? 1.0 : 0.0;
    float w = sin(q.x * 18.0 + sin(q.x * 5.0 + seed * 20.0) * 2.0) * 0.12;
    float tx = step(0.18, fract(q.x * 0.7 + seed)) ;
    return clamp(row * tx * ln(q.y - 0.9 - w, 0.03, aa * 0.5) + row * 0.15, 0.0, 1.0) * step(abs(q.x - 0.5 * 0.4 * H / 0.3), 1.6);
  }
  vec2 cell = floor(q + vec2(0.0, 0.5 * mod(floor(q.x), 2.0)));
  vec2 f = fract(q + vec2(0.0, 0.5 * mod(floor(q.x), 2.0))) - 0.5;
  float h = th21(cell + seed * 17.3), h2 = th21(cell * 1.7 + 3.1 + seed);
  float ang = h2 * 6.2832, ca = cos(ang), sa = sin(ang);
  f = mat2(ca, -sa, sa, ca) * f * (1.05 + 0.3 * h2);
  float r = length(f), a = atan(f.y, f.x);
  float m = 0.0;
  if (h < 0.22) {
    // rose: petal rings inside a scalloped outline, darker toward the heart
    float petal = ln(fract(r * 8.0 + 0.22 * sin(a * 3.0 + r * 10.0)) - 0.5, 0.07, aa * 8.0) * step(r, 0.36);
    float rim = ln(r - 0.36 - 0.03 * sin(a * 5.0), 0.022, aa);
    m = max(max(petal * 0.8, rim), (0.55 - r) * 0.8 * step(r, 0.36));
  } else if (h < 0.36) {
    // five-point star, outlined and filled
    float k = 6.2832 / 5.0, an = mod(a, k) - 0.5 * k;
    float st = r * cos(an) - mix(0.18, 0.36, pow(abs(cos(an * 2.5)), 6.0));
    m = max(ln(st, 0.02, aa), step(st, 0.0) * 0.7);
  } else if (h < 0.5) {
    // clock face: ring, ticks and hands
    float ring = ln(r - 0.34, 0.024, aa);
    float tick = ln(fract(a / 6.2832 * 12.0 + 0.5) - 0.5, 0.06, aa * 6.0) * step(0.26, r) * step(r, 0.32);
    vec2 h1 = vec2(cos(h2 * 9.0), sin(h2 * 9.0)), h3 = vec2(cos(h * 40.0), sin(h * 40.0));
    float hand = max(ln(dot(f, vec2(-h1.y, h1.x)), 0.015, aa) * step(0.0, dot(f, h1)) * step(r, 0.2),
                     ln(dot(f, vec2(-h3.y, h3.x)), 0.012, aa) * step(0.0, dot(f, h3)) * step(r, 0.28));
    m = max(max(ring, tick), hand);
    m = max(m, 0.18 * step(r, 0.34));
  } else if (h < 0.64) {
    // tribal blade: a solid crescent
    float c1 = length(f - vec2(0.06, 0.0)) - 0.36, c2 = length(f - vec2(-0.1, 0.07)) - 0.3;
    m = smoothstep(aa, -aa, max(c1, -c2));
  } else if (h < 0.76) {
    // lettering band around the limb
    float band = step(abs(f.y), 0.14);
    float w = sin(f.x * 40.0 + h * 30.0) * 0.06;
    m = band * ln(f.y - w, 0.02, aa) + band * step(abs(f.y), 0.16) * ln(abs(f.y) - 0.16, 0.012, aa);
  } else if (h < 0.84) {
    // cross
    vec2 g = abs(f);
    m = step(max(g.x - 0.06, g.y - 0.3), 0.0) + step(max(g.x - 0.2, abs(f.y - 0.1) - 0.05), 0.0);
    m = min(m, 1.0) * 0.9;
  }
  // negative space around each piece keeps the design readable
  float halo = smoothstep(0.46, 0.4, r) * step(h, 0.84);
  ink = mix(ink, 0.0, halo * 0.75);
  return clamp(max(ink, m), 0.0, 1.0);
}
// skin micro relief (pores, fine creases) for the specular only; fades out as soon as a pixel covers more than
// a millimetre or so (no shimmer at broadcast distance)
vec3 poreNormal(vec3 N) {
  float fp = length(fwidth(vB));
  float pk = smoothstep(0.005, 0.0015, fp);
  if (pk <= 0.0) return N;
  vec3 pp = vB * 520.0;
  float n0 = noise(pp), e = 0.35;
  vec3 g = vec3(noise(pp + vec3(e, 0.0, 0.0)) - n0, noise(pp + vec3(0.0, e, 0.0)) - n0, noise(pp + vec3(0.0, 0.0, e)) - n0) / e;
  vec3 q = vB * 140.0;
  float c0 = noise(q);
  vec3 g2 = vec3(noise(q + vec3(e, 0.0, 0.0)) - c0, noise(q + vec3(0.0, e, 0.0)) - c0, noise(q + vec3(0.0, 0.0, e)) - c0) / e;
  return normalize(N - (g * 0.1 + g2 * 0.05) * pk);
}
vec3 shadeSkin(vec3 alb, vec3 N, vec3 V, float ao, float oil) {
  vec3 w = vec3(0.36, 0.2, 0.15);
  vec3 Ns = poreNormal(N);
  vec3 dif = vec3(0.0), spc = vec3(0.0);
  float mu = mix(0.16, 0.5, oil);
  float m1 = mix(0.42, 0.34, oil), m2 = mix(0.19, 0.1, oil);
  float rs = mix(0.32, 0.55, oil);
  // (baked creases dim the lights a little too: the shadow map is too coarse for eye sockets and nostrils, and the
  // arena's big fill lights would otherwise flatten them)
  vec3 Ls[3] = vec3[3](uL0, uL1, uL2); vec3 Cs[3] = vec3[3](uC0 * gKey * mix(1.0, ao, 0.35), uC1 * mix(1.0, ao, 0.6), uC2 * mix(1.0, ao, 0.6));
  for (int i = 0; i < 3; i++) {
    float ndl = dot(N, Ls[i]);
    float t = ndl + 0.25;
    float band = smoothstep(0.0, 0.3, t) * smoothstep(0.62, 0.3, t);
    dif += Cs[i] * (wrapD(ndl, w) + band * vec3(0.07, 0.015, 0.008));
    spc += Cs[i] * rs * ((1.0 - mu) * ksk(Ns, Ls[i], V, m1) + mu * ksk(Ns, Ls[i], V, m2));
  }
  vec3 c = alb * (dif + amb(N, ao)) + spc * mix(0.6, 1.0, ao);
  c += alb * rim(N, V) * uC1 * 0.9 + vec3(0.02) * rim(N, V) * (1.0 + oil);
  return c;
}
vec3 shadeCloth(vec3 alb, vec3 N, vec3 V, float ao, float rough, float sheen) {
  vec3 dif = vec3(0.0), spc = vec3(0.0);
  vec3 sc = sqrt(max(alb, vec3(0.0))) * sheen;
  float ndv = max(dot(N, V), 1e-3);
  vec3 Ls[3] = vec3[3](uL0, uL1, uL2); vec3 Cs[3] = vec3[3](uC0 * gKey * mix(1.0, ao, 0.3), uC1 * mix(1.0, ao, 0.5), uC2 * mix(1.0, ao, 0.5));
  for (int i = 0; i < 3; i++) {
    float ndl = dot(N, Ls[i]);
    dif += Cs[i] * clamp((ndl + 0.5) / 2.25, 0.0, 1.0);
    if (ndl > 0.0) {
      vec3 H = normalize(Ls[i] + V);
      float D = charlie(rough, max(dot(N, H), 0.0));
      float Vis = 1.0 / (4.0 * (ndl + ndv - ndl * ndv));
      spc += Cs[i] * D * Vis * ndl;
    }
  }
  return alb * (dif + amb(N, ao)) + spc * sc * ao + alb * rim(N, V) * uC1 * 0.6;
}
vec3 shadeGloss(vec3 alb, vec3 N, vec3 V, float ao, float m, float ks) {
  vec3 dif = vec3(0.0), spc = vec3(0.0);
  vec3 Ls[3] = vec3[3](uL0, uL1, uL2); vec3 Cs[3] = vec3[3](uC0 * gKey, uC1, uC2);
  for (int i = 0; i < 3; i++) {
    float ndl = dot(N, Ls[i]);
    dif += Cs[i] * max(ndl, 0.0);
    vec3 H = normalize(Ls[i] + V);
    float ndh = max(dot(N, H), 1e-3);
    float F = 0.04 + 0.96 * pow(1.0 - clamp(dot(V, H), 0.0, 1.0), 5.0);
    if (ndl > 0.0) spc += Cs[i] * ks * beck(ndh, m) * F * ndl / max(4.0 * ndl * max(dot(N, V), 0.05), 1e-3);
  }
  return alb * (dif + amb(N, ao)) + spc * ao;
}
float kk(vec3 T, vec3 H, float n) { float th = dot(T, H); return clamp(th + 1.0, 0.0, 1.0) * (n + 2.0) / (2.0 * PI) * pow(max(1.0 - th * th, 0.0), 0.5 * n); }
vec3 shadeHair(vec3 alb, vec3 N, vec3 V, float ao, vec3 T, float shift, float coil) {
  vec3 dif = vec3(0.0), spc = vec3(0.0);
  float shift2 = clamp(0.35 + 2.2 * (shift + 0.15), 0.2, 1.4);
  vec3 t1 = normalize(T + (0.12 + shift) * N), t2 = normalize(T + (-0.08 + shift) * N);
  float n1 = mix(90.0, 18.0, coil), n2 = mix(28.0, 8.0, coil);
  vec3 Ls[3] = vec3[3](uL0, uL1, uL2); vec3 Cs[3] = vec3[3](uC0 * gKey, uC1, uC2);
  for (int i = 0; i < 3; i++) {
    float ndl = dot(N, Ls[i]);
    dif += Cs[i] * mix(0.25, 1.0, clamp(ndl, 0.0, 1.0));
    vec3 H = normalize(Ls[i] + V);
    float vis = smoothstep(-0.15, 0.25, ndl);
    // (a shell has no strands to break the highlight up, so it is kept low and broken by the strand noise;
    // tightly coiled hair scatters it into a soft sheen)
    spc += Cs[i] * vis * (0.014 * kk(t1, H, n1) * mix(1.0, 0.3, coil) * shift2 + 0.02 * kk(t2, H, n2) * (alb * 2.0 + 0.15));
  }
  return alb * (dif * 0.75 + amb(N, ao)) + spc * ao * uHairF.z;
}

vec3 toLinear(vec3 c) { return c; }
vec3 pbrNeutral(vec3 color) {
  const float start = 0.8 - 0.04;
  const float desat = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float off = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= off;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < start) return color;
  float d = 1.0 - start;
  float np = 1.0 - d * d / (peak + d - start);
  color *= np / peak;
  float g = 1.0 - 1.0 / (desat * (peak - np) + 1.0);
  return mix(color, vec3(np), g);
}
vec3 toSRGB(vec3 c) { c = max(c, vec3(0.0)); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }

void main() {
  gKey = keyShadow();
  int mat = int(vMat * 255.0 + 0.5);   // per triangle: no dotted seams where two materials meet
  // skin is a closed surface: a back face showing is only ever a sliver at a silhouette (the jaw's underside
  // seen edge-on), which the flipped normal would light as bright dots
  if (!gl_FrontFacing && (mat == 0 || mat == 1)) discard;
  float ao = vM.y, a0 = vM.z, a1 = vM.w;
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(uCam - vW);
  float H = uFlags.z;
  float sweat = uFlags.w;
  vec3 col;
  if (mat == 0 || mat == 1) {
    vec3 alb = uSkin;
    float oil = sweat;
    // subtle skin variation and flush (knees, knuckles, elbows get a little redder)
    float nz = noise(vB * 38.0);
    alb *= 0.94 + 0.12 * nz;
    if (mat == 0 && a1 > 0.01 && uFlags.y > 0.0) {
      // black-and-grey sleeve: motifs (roses, stars, clocks, script, tribal blades) over smoke shading,
      // blue-black ink softened under the skin
      // (tattoo coordinates: u around the limb stored as u / 2, v along it as v / 3)
      float tu = vUV.x * 2.0, tv = vUV.y * 3.0;
      float ink = tattooInk(vec2(fract(tu), tv), H, fract(uFlags.y * 7.31));
      if (tv < 1.5) {
        // a sleeve starts at the shoulder, stops in a clean line an inch above the wrist, and leaves a thin strip of
        // skin along the inside of the arm where the pattern wraps around
        float fw = fwidth(tv) + 1e-4, su = min(fract(tu), 1.0 - fract(tu));
        ink *= smoothstep(0.012, 0.035, tv) * (1.0 - smoothstep(0.935 - fw, 0.935 + fw, tv)) * smoothstep(0.015, 0.045, su);
      }
      alb = mix(alb, vec3(0.03, 0.036, 0.05), ink * a1 * 0.9);
    }
    if (mat == 1 && uMaskP.x > 0.5) {  // face paint from the UV masks
      vec3 lc = (vB - uHeadO.xyz) / uHeadO.w;          // head-local centimetres (MakeHuman scale)
      vec4 m1 = texture(uMask1, vUV), m2 = texture(uMask2, vUV);
      // regional colour: cheeks, nose tip and ears a little flushed, the skin under the eyes a little darker and
      // cooler (strongest on light skin, where it shows)
      float light = clamp(dot(uSkin, vec3(0.3, 0.55, 0.15)) * 2.2 - 0.25, 0.15, 1.0);
      float cheek = smoothstep(2.0, 3.2, abs(lc.x)) * smoothstep(5.6, 4.2, abs(lc.x)) * smoothstep(uFace.w - 0.5, uFace.w + 1.0, lc.z) * smoothstep(uFace.z - 0.6, uFace.z - 2.2, lc.z) * step(uFace.y - 1.5, lc.y);
      float noseTip = smoothstep(1.4, 0.4, abs(lc.x)) * smoothstep(uFace.y + 2.2, uFace.y + 3.6, lc.y) * smoothstep(uFace.w + 0.6, uFace.w + 1.6, lc.z) * smoothstep(uFace.z - 0.5, uFace.z - 2.0, lc.z);
      float ear = smoothstep(6.0, 7.0, abs(lc.x));
      alb *= mix(vec3(1.0), vec3(1.06, 0.93, 0.92), clamp(cheek * 0.8 + noseTip + ear * 0.7, 0.0, 1.0) * light);
      float under = smoothstep(1.2, 0.3, abs(abs(lc.x) - uFace.x) / 1.6) * smoothstep(uFace.z - 2.2, uFace.z - 0.9, lc.z) * smoothstep(uFace.z - 0.1, uFace.z - 0.7, lc.z) * step(uFace.y - 1.0, lc.y);
      alb *= mix(vec3(1.0), vec3(0.9, 0.88, 0.92), under * 0.8);
      // lips: the upper lip a shade darker than the lower, the line between them dark, the corners tucked in
      float lipM = smoothstep(0.3, 0.8, m1.a), lz = lc.z - uFace.w;
      alb = mix(alb, uLip * mix(1.0, 0.8, smoothstep(0.05, 0.45, lz)), lipM * 0.78);
      float mline = (1.0 - smoothstep(0.02, 0.14, abs(lz))) * (1.0 - smoothstep(0.85, 1.05, abs(lc.x) / uMouthW)) * smoothstep(0.1, 0.35, m1.a);
      alb *= 1.0 - 0.62 * mline;
      oil = max(oil, lipM * smoothstep(-0.15, -0.55, lz) * 0.55);
      // cavities: nostrils
      alb *= 1.0 - 0.55 * m2.a;
      // brows: fine hairs lying along the brow (growing up and out at the inner end), dense along the centre line
      // and thinning out to bare skin at the edges and the tail, instead of a painted band
      float bd0 = smoothstep(uMaskP.z - 0.2, uMaskP.z + 0.1, m1.b);
      float tail = smoothstep(uFace.x + 3.2, uFace.x + 1.4, abs(lc.x));
      float slant = (abs(lc.x) - uFace.x) * 0.35;
      // (hairs ~6 mm long and a fraction of a millimetre wide: stretched noise, two layers)
      vec3 hp = vec3(abs(lc.x) * 1.7, (lc.z - slant) * 26.0, lc.y * 1.5);
      float hairs = max(smoothstep(0.48, 0.66, noise(hp)), smoothstep(0.5, 0.68, noise(hp * vec3(1.3, 1.7, 1.0) + 11.0)) * 0.8);
      float brow = clamp(bd0 * (0.35 + 0.65 * hairs) * mix(0.55, 1.0, tail), 0.0, 1.0);
      alb = mix(alb, uHair * 0.5, brow * 0.86);
      // lash line (upper lid margin)
      alb *= 1.0 - uMaskP.w * smoothstep(0.45, 0.9, m2.b);
      // beard: full shape, mustache, goatee; stubble uses the full shape at low density
      float bd = max(max(m1.g * uBeardW.x, m2.r * uBeardW.y), m2.g * uBeardW.z);
      float st = smoothstep(0.15, 0.6, m1.g) * uBeardW.w;
      float g = noise(lc * 6.0) * 0.55 + noise(lc * 21.0) * 0.45;
      float cover = clamp(smoothstep(0.1, 0.7, bd) * (0.55 + 0.4 * g) + st * (0.35 + 0.65 * smoothstep(0.3, 0.8, g)), 0.0, 1.0);
      alb = mix(alb, uHair * 0.7, cover * 0.85);
      // scalp hair: coverage above the player's hairline; sides thinner for fades
      float sc = smoothstep(uMaskP.y - 0.025, uMaskP.y + 0.025, m1.r);
      float side = mix(uScalpP.x, 1.0, smoothstep(uScalpP.y - uScalpP.z, uScalpP.y + uScalpP.z, lc.z));
      float hg = noise(lc * vec3(9.0, 9.0, 4.0)) * 0.5 + noise(lc * 23.0) * 0.5;
      float dens = sc * side * (0.78 + 0.22 * hg);
      alb = mix(alb, uHair * (0.75 + 0.35 * hg), clamp(dens, 0.0, 1.0));
      oil *= 1.0 - 0.8 * dens;
      oil = clamp(oil + sweat * 0.35 * smoothstep(3.0, 7.0, lc.z) * step(9.0, lc.y), 0.0, 1.0);
    }
    col = shadeSkin(alb, N, V, ao, oil);
  } else if (mat == 2 || mat == 3 || mat == 14) {
    vec3 base = mat == 2 ? uJersey : mat == 3 ? uShorts : vec3(0.012);
    float rough = 0.55, sheen = 0.9;
    if (mat == 2 && uFlags.x > 0.5) {
      // referee: grey shirt with black pinstripes... classic black and white vertical stripes
      float th = atan(vB.x, vB.y - 0.0);
      float s = fract(th / (2.0 * PI) * 26.0);
      base = mix(vec3(0.78), vec3(0.01), smoothstep(0.46, 0.5, s) * smoothstep(0.96, 0.92, s));
    }
    // trim along the edges (neck, arm holes, waistband, hems): a1 is the distance to the cut along the body
    // (0..1 over 0.04 H); bindings about an inch wide
    float trimW = mat == 3 ? 0.3 : 0.27;
    base = mix(base, uTrim, 1.0 - smoothstep(trimW - 0.04, trimW + 0.02, a1));
    if (mat == 2 && uFlags.x < 0.5) {
      // side panel down the ribs
      float side = smoothstep(0.075, 0.085, abs(vB.x) / H) * smoothstep(0.02, -0.03, abs(vB.y) / H - 0.01) * uCloth.x;
      base = mix(base, uTrim, side * 0.9);
      // numbers / name from the atlas
      float fx = vB.x / H, fz = vB.z / H;
      bool front = vB.y > 0.0;
      float u = 0.5 + (front ? -fx : fx) / 0.2;   // the player's right is the viewer's left on the front
      float v = (0.81 - fz) / 0.2;
      float facing = smoothstep(0.35, 0.6, abs(normalize(vBN).y));
      if (u > 0.0 && u < 1.0 && v > 0.0 && v < 1.0 && facing > 0.0) {
        vec2 uv = vec2(uNumRect.x + (front ? 0.0 : 0.5 * uNumRect.z) + u * 0.5 * uNumRect.z, uNumRect.y + v * uNumRect.w);
        vec4 t = texture(uNumTex, uv);
        base = mix(base, t.rgb / max(t.a, 1e-3), t.a * facing);
      }
      // athletic mesh (only visible up close)
      float mesh = noise(vB * 900.0);
      base *= 1.0 - 0.06 * uCloth.y * smoothstep(0.55, 0.8, mesh);
    }
    if (mat == 3) {
      // side stripe down the leg
      float st = smoothstep(0.012, 0.004, abs(abs(vB.x) / H - 0.105)) * step(vB.z / H, 0.56) * uCloth.z;
      base = mix(base, uTrim, st);
    }
    if (mat == 14) { rough = 0.6; sheen = 0.6; }
    // sweat darkens the fabric on the chest and back late in games
    base *= 1.0 - 0.18 * sweat * smoothstep(0.7, 0.78, vB.z / H) * step(0.5, float(mat == 2));
    col = shadeCloth(base, N, V, ao, rough, sheen);
  } else if (mat == 4 || mat == 11) {
    vec3 base = mat == 4 ? uSock : uSleeve;
    float rib = 0.93 + 0.07 * sin(atan(vB.x, vB.y) * 80.0);
    // crew socks: a ribbed cuff and a team stripe near the top
    if (mat == 4) {
      // two team stripes just under the cuff (a1: distance below the top, 0..1 over 0.04 H), antialiased
      float fw = fwidth(a1) + 1e-4;
      float s1 = smoothstep(0.11 - fw, 0.11 + fw, a1) * (1.0 - smoothstep(0.19 - fw, 0.19 + fw, a1));
      float s2 = smoothstep(0.26 - fw, 0.26 + fw, a1) * (1.0 - smoothstep(0.34 - fw, 0.34 + fw, a1));
      base *= rib; base = mix(base, uTrim, max(s1, s2) * uCloth.w);
    }
    col = shadeCloth(base, N, V, ao, 0.5, 0.8);
  } else if (mat == 5 || mat == 6 || mat == 13) {
    // basketball shoe, drawn per pixel from shoe-local coordinates (H units): x across (outer side +), y along the
    // foot (heel -), z above the floor; a1 = how much the surface faces up (the top of the vamp)
    float sx = a0 * 0.08 - 0.04, sy = vUV.x * 0.24 - 0.08, sz = vUV.y * 0.12, ax = abs(sx);
    float px = fwidth(sz) + 1e-5;
    float toe = smoothstep(0.1, 0.14, sy), heel = 1.0 - smoothstep(-0.05, -0.028, sy);
    float outTop = 0.0035 + 0.003 * toe + 0.0012 * heel;          // outsole rubber wraps up at the toe and heel
    float soleTop = 0.0143 + 0.0045 * toe + 0.0022 * heel;        // midsole top edge (toe spring)
    bool lightShoe = dot(uShoe, vec3(0.333)) > 0.5;
    vec3 outsole = lightShoe ? mix(uShoeAcc, vec3(0.05), 0.55) : vec3(0.045);
    float rough = 0.42, ks = 0.45;
    vec3 base;
    float inSole = 1.0 - smoothstep(soleTop - px, soleTop + px, sz);
    float inOut = 1.0 - smoothstep(outTop - px, outTop + px, sz);
    // midsole: foam with a moulded groove line around it
    vec3 mid = uSole * (1.0 - 0.18 * (1.0 - smoothstep(0.00075 - px, 0.00075 + px, abs(sz - (outTop + soleTop) * 0.52))));
    // upper
    vec3 up = uShoe;
    float acc = 0.0;
    // heel counter and pull tab
    acc = max(acc, (1.0 - smoothstep(-0.03, -0.026, sy)) * (1.0 - smoothstep(0.044, 0.046, sz)));
    acc = max(acc, (1.0 - smoothstep(-0.04, -0.036, sy)) * smoothstep(0.066, 0.07, sz));
    // toe cap overlay
    float cap = smoothstep(0.106, 0.11, sy) * (1.0 - smoothstep(0.03, 0.032, sz));
    // side stripe: a crescent sweeping up from the forefoot toward the heel (both sides, bolder outside)
    float s = clamp((0.088 - sy) / 0.108, 0.0, 1.0);
    float zc = 0.021 + 0.024 * pow(s, 1.4);
    float w = 0.0022 + 0.0052 * sin(3.14159 * min(s * 1.05, 1.0)) * (sx > 0.0 ? 1.0 : 0.75);
    float stripe = (1.0 - smoothstep(w - px, w + px, abs(sz - zc))) * step(0.0, 0.088 - sy) * step(sy, 0.088) * step(-0.022, sy) * (1.0 - a1);
    acc = max(acc, stripe);
    up = mix(up, uShoeAcc, acc);
    up = mix(up, mix(uShoe, uShoeAcc, 0.35), cap * (1.0 - acc));
    // padded collar: the top of the high-top, a touch darker and softer
    float collar = smoothstep(0.069, 0.073, sz);
    up *= 1.0 - 0.14 * collar;
    // laces and eyelets on top of the vamp
    float onTop = smoothstep(0.45, 0.8, a1) * step(0.012, sy) * step(sy, 0.088);
    float lacesW = 0.0085;
    float row = abs(fract(sy / 0.0095) - 0.5);
    float lace = (1.0 - smoothstep(lacesW - px, lacesW + px, ax)) * (1.0 - smoothstep(0.26, 0.34, row)) * onTop;
    vec3 laceCol = lightShoe ? mix(uShoeAcc, vec3(0.08), 0.3) : vec3(0.9);
    up = mix(up, laceCol, lace * 0.92);
    float eyelet = (1.0 - smoothstep(0.0012, 0.0019, length(vec2(ax - 0.0098, (fract(sy / 0.0095) - 0.5) * 0.0095)))) * onTop;
    up = mix(up, vec3(0.03), eyelet * 0.85);
    // stitching along the overlays and above the sole
    float stitch = (1.0 - smoothstep(0.00025, 0.0006, abs(sz - soleTop - 0.0024))) * step(0.5, fract(sy * 900.0));
    up *= 1.0 - 0.25 * stitch * (1.0 - a1);
    // fabric: fine knit / mesh grain up close
    up *= 0.97 + 0.03 * noise(vB * 700.0);
    base = mix(up, mid, inSole);
    base = mix(base, outsole, inOut);
    rough = mix(0.45, mix(0.55, 0.85, inOut), inSole);
    ks = mix(0.5, mix(0.3, 0.15, inOut), inSole);
    col = shadeGloss(base, N, V, ao, rough, ks);
  } else if (mat == 7) {
    vec3 lc = (vB - uHeadO.xyz) / uHeadO.w;
    // clumps (cm scale) and strand-scale streaks (~1.5 mm) that a pixel can still resolve up close
    float g = noise(lc * vec3(3.0, 3.0, 14.0)) * 0.5 + noise(lc * vec3(7.0, 7.0, 2.2)) * 0.5;
    vec3 alb = uHair * (0.7 + 0.55 * g);
    float coil = a1 > 0.5 ? 0.85 : uHairF.x;
    if (coil > 0.75) {
      // coily volume (afro, puffs, twists, curls): clumps as bumps in the shading, not a smooth helmet
      vec3 pc = lc * 2.3;
      float n0 = noise(pc), e = 0.2;
      vec3 gN = vec3(noise(pc + vec3(e, 0.0, 0.0)) - n0, noise(pc + vec3(0.0, e, 0.0)) - n0, noise(pc + vec3(0.0, 0.0, e)) - n0) / e;
      N = normalize(N - gN * 0.45 * (coil - 0.5));
      alb *= 0.8 + 0.4 * n0;
    }
    vec3 T = normalize(cross(uRight, N) + 1e-4);
    col = shadeHair(alb, N, V, 1.0, T, (g - 0.5) * 0.3, coil);
    // fuzz: flyaway strands catch light at the silhouette
    col += uHair * (0.25 + 0.5 * coil) * pow(1.0 - max(dot(N, V), 0.0), 3.0) * amb(N, 1.0) * 2.0;
    // fuzzy edge darkening where the shell is thin
    col *= 0.85 + 0.15 * g;
  } else if (mat == 8) {
    vec4 E = distance(vB, uEyeL.xyz) < distance(vB, uEyeR.xyz) ? uEyeL : uEyeR;
    vec3 d = normalize(vB - E.xyz);
    // gaze: rotate the eye direction by the look yaw / pitch
    float cy = cos(uGaze.x), sy = sin(uGaze.x), cp = cos(uGaze.y), sp = sin(uGaze.y);
    vec3 dd = vec3(cy * d.x + sy * d.y, -sy * d.x + cy * d.y, d.z);
    dd = vec3(dd.x, cp * dd.y + sp * dd.z, -sp * dd.y + cp * dd.z);
    float r = length(dd.xz) * step(0.0, dd.y);
    if (dd.y < 0.0) r = 2.0;
    // sclera: warm off-white, pinker toward the corners, with faint vessels
    float cornerK = smoothstep(0.35, 0.8, abs(dd.x));
    vec3 scl = mix(vec3(0.7, 0.6, 0.5), vec3(0.68, 0.45, 0.4), cornerK * 0.6);
    scl *= 1.0 - 0.12 * cornerK * smoothstep(0.55, 0.8, noise(vec3(atan(dd.z, dd.x) * 9.0, r * 7.0, 3.0)));
    vec3 alb = scl;
    // iris: radial fibres, a lighter collarette around the pupil, a dark limbal ring
    float iris = 1.0 - smoothstep(0.43, 0.47, r);
    float ang = atan(dd.x, dd.z);
    float fib = noise(vec3(ang * 14.0, r * 6.0, 1.0)) * 0.6 + noise(vec3(ang * 38.0, r * 3.0, 2.0)) * 0.4;
    vec3 ic = uIris * (0.62 + 0.75 * fib);
    ic = mix(ic, uIris * 1.45 + 0.03, (1.0 - smoothstep(0.2, 0.28, r)) * smoothstep(0.16, 0.2, r) * 0.6);
    float ring = smoothstep(0.32, 0.46, r) * iris;
    alb = mix(alb, ic * (1.0 - 0.6 * ring), iris);
    alb = mix(alb, vec3(0.008), 1.0 - smoothstep(0.16, 0.2, r));
    // the upper lid and lashes shade the top third of the eye; the corners sit in the socket's shadow
    float lid = mix(0.3, 1.0, smoothstep(0.32, -0.12, dd.z)) * mix(0.62, 1.0, smoothstep(0.78, 0.32, abs(dd.x)));
    // (lit mostly by the warm bounce and the key: the cool sky term alone turned the whites blue-grey)
    vec3 c = alb * (uC0 * gKey * max(dot(N, uL0), 0.12) * 0.45 + uC2 * max(dot(N, uL2), 0.0) * 0.35 + mix(uGround, uSky, 0.35) * 0.95) * lid;
    // cornea: a sharp catchlight from the camera side, a softer one from the overhead lights, the wet lower margin
    vec3 R = reflect(-V, N);
    c += vec3(1.1) * pow(max(dot(R, uL2), 0.0), 260.0) + vec3(0.6) * pow(max(dot(R, uL0), 0.0), 140.0) * lid;
    c += vec3(0.08) * smoothstep(-0.3, -0.42, dd.z) * (1.0 - cornerK);
    col = c;
  } else if (mat == 9) {
    col = shadeCloth(uBand, N, V, ao, 0.5, 0.8);
  } else {
    col = shadeGloss(vec3(0.6, 0.25, 0.08), N, V, ao, 0.5, 0.2);
  }
  col *= uExpo;
  col = pbrNeutral(col);
  oCol = vec4(toSRGB(col), 1.0);
}`;

  const BALL_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uVP;
uniform vec4 uBall;      // centre (world, feet) + radius
uniform mat3 uRot;       // ball rotation (local -> world)
uniform vec2 uSquash;    // horizontal stretch, vertical squash
out vec3 vL; out vec3 vW; out vec3 vN;
void main() {
  vec3 w = uRot * aPos;
  vN = w;
  vec3 p = w * uBall.w;
  p.xy *= uSquash.x; p.z *= uSquash.y;
  vW = uBall.xyz + p; vL = aPos;
  gl_Position = uVP * vec4(vW, 1.0);
}`;
  const BALL_FS = `#version 300 es
precision highp float;
in vec3 vL; in vec3 vW; in vec3 vN;
uniform vec3 uCam;
uniform vec3 uL0, uC0, uL1, uC1, uL2, uC2;
uniform vec3 uSky, uGround;
out vec4 oCol;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z); }
vec3 pbrNeutral(vec3 color) {
  const float start = 0.76, desat = 0.15;
  float x = min(color.r, min(color.g, color.b)); float off = x < 0.08 ? x - 6.25 * x * x : 0.04; color -= off;
  float peak = max(color.r, max(color.g, color.b)); if (peak < start) return color;
  float d = 1.0 - start; float np = 1.0 - d * d / (peak + d - start); color *= np / peak;
  float g = 1.0 - 1.0 / (desat * (peak - np) + 1.0); return mix(color, vec3(np), g); }
vec3 toSRGB(vec3 c) { c = max(c, vec3(0.0)); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  vec3 d = normalize(vL);
  // seams: equator, meridian and the two curved seams of a basketball
  float s = min(abs(d.z), abs(d.x));
  float t = atan(d.y, d.x);
  for (int k = 0; k < 2; k++) {
    vec3 c = vec3(0.62 * cos(t), 0.62 * sin(t), (0.39 * cos(2.0 * t) + 0.55) * (k == 0 ? 1.0 : -1.0));
    s = min(s, acos(clamp(dot(d, normalize(c)), -1.0, 1.0)));
  }
  float seam = 1.0 - smoothstep(0.022, 0.04, s);
  float peb = noise(d * 90.0);
  vec3 N = normalize(normalize(vN) + (peb - 0.5) * 0.08 * (1.0 - seam));
  vec3 V = normalize(uCam - vW);
  vec3 alb = mix(vec3(0.42, 0.12, 0.035) * (0.9 + 0.15 * peb), vec3(0.018, 0.012, 0.01), seam);
  vec3 Ls[3] = vec3[3](uL0, uL1, uL2); vec3 Cs[3] = vec3[3](uC0, uC1, uC2);
  vec3 dif = vec3(0.0), spc = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float ndl = max(dot(N, Ls[i]), 0.0);
    dif += Cs[i] * ndl;
    vec3 H = normalize(Ls[i] + V);
    spc += Cs[i] * pow(max(dot(N, H), 0.0), 28.0) * 0.08 * ndl;
  }
  vec3 col = alb * (dif + mix(uGround, uSky, 0.5 + 0.5 * N.z)) + spc;
  oCol = vec4(toSRGB(pbrNeutral(col)), 1.0);
}`;

  const DEPTH_FS = `#version 300 es
precision mediump float;
out vec4 oCol;
void main() { oCol = vec4(1.0); }`;

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const log = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error('shader: ' + log); }
    return s;
  }
  function program(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
    return p;
  }
  const lin = c => { const p = U.parseColor(c); const f = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return [f(p.r), f(p.g), f(p.b)]; };
  // measured skin albedo (linear sRGB, Fitzpatrick I..VI, physicallybased.info after Jensen / Donner)
  const SKIN_MEAS = [[0.847, 0.638, 0.552], [0.799, 0.485, 0.347], [0.623, 0.433, 0.343], [0.436, 0.227, 0.131], [0.283, 0.148, 0.079], [0.09, 0.05, 0.02]];
  function skinAlbedo(hex, idx) {
    const a = lin(hex);
    const t = U.clamp((idx || 0) / 7 * 5, 0, 5), i = Math.min(4, Math.floor(t)), f = t - i;
    const m = [0, 1, 2].map(k => Math.exp(U.lerp(Math.log(SKIN_MEAS[i][k]), Math.log(SKIN_MEAS[i + 1][k]), f)));
    // keep the portrait's tone (recognisable) but pull the saturation toward measured skin
    // match the measured chroma but keep the portrait tone's luminance
    const la = 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2], lm = 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2];
    return a.map((v, k) => U.lerp(v, m[k] * la / lm, 0.6));
  }

  class Renderer {
    constructor() {
      this.ok = false;
      this.meshes = new Map();
      this.queue = [];
      this.cells = new Map();
      this.frame = 0;
      this.budgetMs = 14;
      try { this._init(); this.ok = true; } catch (e) { U.warn('3D players unavailable', e && e.message); this.ok = false; }
    }
    _init() {
      const cv = document.createElement('canvas');
      cv.width = 1024; cv.height = 1024;
      const gl = cv.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: false, depth: true });
      if (!gl) throw new Error('no webgl2');
      this.cv = cv; this.gl = gl;
      this.prog = program(gl, VS, FS);
      this.dprog = program(gl, VS, DEPTH_FS);
      this.du = {};
      const nd = gl.getProgramParameter(this.dprog, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < nd; i++) { const info = gl.getActiveUniform(this.dprog, i); this.du[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(this.dprog, info.name); }
      // shadow atlas: 4 x 4 tiles of 512 px
      this.shTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.shTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, 2048, 2048, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
      this.shFbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shFbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shTex, 0);
      gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
      this.shadowsOk = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.shM = new Float32Array(16);
      this.bprog = program(gl, BALL_VS, BALL_FS);
      this.bu = {};
      const nb = gl.getProgramParameter(this.bprog, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < nb; i++) { const info = gl.getActiveUniform(this.bprog, i); this.bu[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(this.bprog, info.name); }
      {
        const nt = 32, nu = 20, P = [], I = [];
        for (let j = 0; j <= nu; j++) { const ph = j / nu * Math.PI; for (let i = 0; i <= nt; i++) { const t = i / nt * Math.PI * 2; P.push(Math.sin(ph) * Math.cos(t), Math.sin(ph) * Math.sin(t), Math.cos(ph)); } }
        for (let j = 0; j < nu; j++) for (let i = 0; i < nt; i++) { const a = j * (nt + 1) + i, b = a + 1, c = a + nt + 1, d = c + 1; I.push(a, c, d, a, d, b); }
        this.bvao = gl.createVertexArray(); gl.bindVertexArray(this.bvao);
        const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(P), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
        const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(I), gl.STATIC_DRAW);
        gl.bindVertexArray(null);
        this.bcount = I.length;
      }
      const u = this.u = {};
      const n = gl.getProgramParameter(this.prog, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(this.prog, i); u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(this.prog, info.name); }
      // bone palette texture: 7 texels per bone, one row per person drawn this frame
      this.maxRows = 32;
      this.boneW = BD.NB * 7;
      this.boneData = new Float32Array(this.boneW * 4 * this.maxRows);
      this.boneTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.boneTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, this.boneW, this.maxRows, 0, gl.RGBA, gl.FLOAT, null);
      // numbers / names atlas
      this.numCv = U.makeCanvas(2048, 1024);
      this.numG = this.numCv.getContext('2d');
      this.numTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.numTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.numCv);
      gl.generateMipmap(gl.TEXTURE_2D);
      this.numSlots = new Map(); this.numNext = 0; this.numDirty = false;
      this.maskTex = [gl.createTexture(), gl.createTexture()];
      this.masksReady = false;
      if (M.Human) M.Human.load();
      this.O = new Float64Array(BD.NB * 3); this.R = new Float64Array(BD.NB * 9); this.TW = new Float64Array(BD.NB);
      this.ex = { tw: [0, 0, 0, 0, 0, 0], curl: [0, 0] };
      this.pt = { x: 0, y: 0, s: 0, d: 0 };
      this.VP = new Float32Array(16);
    }

    // ---------------------------------------------------------- meshes
    key(style, dims, detail) {
      const F = style.F || {};
      return [style.kind, F.stamp || '', dims.H.toFixed(3), dims.bulk.toFixed(3), style.hair, style.beard, style.headband || '', style.armSleeve, style.legSleeve, style.tattoo, style.seed, detail].join('|');
    }
    /** mesh for a person (built synchronously when allowed, else queued and null for now) */
    mesh(style, dims, detail, allowBuild) {
      const HU = M.Human;
      if (!HU || !HU.ready()) return null;
      detail = 'high';
      const k = this.key(style, dims, detail);
      let m = this.meshes.get(k);
      if (m) { m.used = this.frame; return m; }
      if (!allowBuild) { if (!this.queue.some(q => q.k === k)) this.queue.push({ k, style, dims, detail }); return null; }
      m = this._upload(k, M.Human.build(null, dims, style, { detail }));
      return m;
    }
    _upload(k, b) {
      const gl = this.gl;
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const vb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vb);
      gl.bufferData(gl.ARRAY_BUFFER, b.buf, gl.STATIC_DRAW);
      const S = b.stride || 40;
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, S, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, S, 12);
      gl.enableVertexAttribArray(2); gl.vertexAttribIPointer(2, 4, gl.UNSIGNED_BYTE, S, 24);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, true, S, 28);
      gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 4, gl.UNSIGNED_BYTE, true, S, 32);
      gl.enableVertexAttribArray(5); gl.vertexAttribPointer(5, 4, gl.UNSIGNED_BYTE, true, S, 36);
      if (S >= 44) { gl.enableVertexAttribArray(6); gl.vertexAttribPointer(6, 2, gl.UNSIGNED_SHORT, true, S, 40); }
      else { gl.disableVertexAttribArray(6); gl.vertexAttrib2f(6, 0, 0); }
      const ib = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, b.index, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      const m = { k, vao, vb, ib, n: b.nIdx, bindInv: b.bindInv, bindTw: b.bindTw || null, head: b.head, used: this.frame, ms: b.ms, detail: b.detail, human: !!b.human };
      this.meshes.set(k, m);
      // keep the cache bounded
      if (this.meshes.size > 60) {
        let old = null;
        for (const mm of this.meshes.values()) if (!old || mm.used < old.used) old = mm;
        if (old && old !== m) { gl.deleteVertexArray(old.vao); gl.deleteBuffer(old.vb); gl.deleteBuffer(old.ib); this.meshes.delete(old.k); }
      }
      return m;
    }
    /**
     * Queue meshes for people who will be on screen soon (the view calls this when a game opens), and build them in
     * the background, one per timer tick, so the first frames of play do not stall.
     */
    warm(list) {
      for (const pp of list) this.mesh(pp.style, pp.dims, 'high', false);
      if (this._warmT || !this.queue.length) return;
      const tick = () => {
        this._warmT = null;
        if (!this.queue.length || !M.Human || !M.Human.ready()) return;
        this.pump(40);
        if (this.queue.length) this._warmT = setTimeout(tick, 30);
      };
      this._warmT = setTimeout(tick, 30);
    }
    /** build queued meshes within a time budget (called once per frame) */
    pump(ms) {
      const t0 = performance.now();
      while (this.queue.length && performance.now() - t0 < (ms || this.budgetMs)) {
        const q = this.queue.shift();
        if (this.meshes.has(q.k)) continue;
        try { this._upload(q.k, M.Human.build(null, q.dims, q.style, { detail: q.detail })); } catch (e) { U.warn('3D build failed', e && e.message); }
        break; // one build per frame keeps the frame time sane
      }
    }

    // ---------------------------------------------------------- jersey numbers / names
    numSlot(style) {
      const k = [style.num, style.numColor, style.trim, style.lastName || '', style.kind].join('|');
      let s = this.numSlots.get(k);
      if (s) return s;
      const i = this.numNext++ % 64;
      const cw = 256, ch = 128, x = (i % 8) * cw, y = Math.floor(i / 8) * ch;
      const g = this.numG;
      g.clearRect(x, y, cw, ch);
      const num = String(style.num == null ? '' : style.num);
      const font = '"Arial Black", "Arial Narrow", Impact, "Helvetica Neue", sans-serif';
      const drawNum = (cx, cy, size) => {
        g.font = '900 ' + size + 'px ' + font;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineJoin = 'round';
        g.lineWidth = size * 0.12; g.strokeStyle = style.trim || '#000'; g.strokeText(num, cx, cy);
        g.fillStyle = style.numColor || '#111'; g.fillText(num, cx, cy);
      };
      if (style.kind === 'ref') { drawNum(x + cw * 0.75, y + ch * 0.36, 34); }
      else {
        drawNum(x + cw * 0.25, y + ch * 0.47, 62);
        drawNum(x + cw * 0.75, y + ch * 0.55, 66);
        if (style.lastName) {
          g.font = '800 17px ' + font; g.fillStyle = style.numColor || '#111'; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText(String(style.lastName).toUpperCase().slice(0, 14), x + cw * 0.75, y + ch * 0.17);
        }
      }
      s = [x / 2048, y / 1024, cw * 2 / 2048 / 2 * 2, ch / 1024];
      s[2] = cw / 2048; // full cell width (front half + back half)
      this.numSlots.set(k, s);
      this.numDirty = true;
      return s;
    }

    // ---------------------------------------------------------- frame
    /**
     * Render every person into its cell. people: [{sk, style, a}] (sk: skeleton-like {P, R, dims, pose?} or a
     * replay ghost with .ex {tw, curl}). Returns the number of people drawn in 3D.
     */
    render(cam, people, opts) {
      if (!this.ok) return 0;
      opts = opts || {};
      const gl = this.gl, dpr = opts.dpr || 1;
      this.frame++;
      const cells = this.cells; cells.clear();
      const list = [];
      const pt = this.pt;
      for (const pp of people) {
        const sk = pp.sk, P = sk.P;
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, dmin = 1e9, dmax = -1e9;
        for (let j = 0; j < 27; j++) {
          cam.project(P[j * 3], P[j * 3 + 1], P[j * 3 + 2], pt);
          if (pt.x < x0) x0 = pt.x; if (pt.x > x1) x1 = pt.x; if (pt.y < y0) y0 = pt.y; if (pt.y > y1) y1 = pt.y;
          if (pt.d < dmin) dmin = pt.d; if (pt.d > dmax) dmax = pt.d;
        }
        const s = cam.scaleAt(P[1], 3);
        const big = pp.style.hair === 'afro' || pp.style.hair === 'hightop' || pp.style.hair === 'puffs' ? 0.75 : 0.4;
        x0 -= s * 0.55; x1 += s * 0.55; y0 -= s * big; y1 += s * 0.3;
        const ball = opts.ball && opts.ball.sk === sk ? opts.ball : null;
        if (ball) {
          cam.project(ball.x, ball.y, ball.z, pt);
          const r = ball.R * pt.s * 1.3;
          x0 = Math.min(x0, pt.x - r); x1 = Math.max(x1, pt.x + r); y0 = Math.min(y0, pt.y - r); y1 = Math.max(y1, pt.y + r);
          dmin = Math.min(dmin, pt.d - 1); dmax = Math.max(dmax, pt.d + 1);
        }
        if (x1 < 0 || x0 > cam.W || y1 < 0 || y0 > cam.H) continue;
        const heightPx = (y1 - y0);
        const detail = heightPx * dpr > 190 || opts.detail === 'high' ? 'high' : 'low';
        let m = this.mesh(pp.style, sk.dims, detail, !!opts.sync);
        if (!m && detail === 'high') m = this.mesh(pp.style, sk.dims, 'low', !!opts.sync);
        if (!m) continue;
        list.push({ pp, m, x0, y0, x1, y1, dmin: dmin - 3, dmax: dmax + 3, ball, hasBall: false });
      }
      if (!opts.sync) this.pump();
      if (!list.length) return 0;
      // pack cells (device pixels)
      let scale = dpr;
      let W = 0, Hh = 0;
      for (let attempt = 0; attempt < 4; attempt++) {
        const maxW = 2048;
        let x = 0, y = 0, rowH = 0;
        W = 0; Hh = 0;
        const sorted = list.slice().sort((a, b) => (b.y1 - b.y0) - (a.y1 - a.y0));
        for (const c of sorted) {
          const w = Math.max(2, Math.ceil((c.x1 - c.x0) * scale)), h = Math.max(2, Math.ceil((c.y1 - c.y0) * scale));
          if (x + w > maxW) { x = 0; y += rowH + 2; rowH = 0; }
          c.cx = x; c.cy = y; c.cw = w; c.ch = h;
          x += w + 2; rowH = Math.max(rowH, h);
          W = Math.max(W, x); Hh = Math.max(Hh, y + rowH);
        }
        if (Hh <= 2048) break;
        scale *= Math.sqrt(2048 / Hh) * 0.95;
      }
      W = Math.min(2048, Math.max(64, W)); Hh = Math.min(2048, Math.max(64, Hh));
      const cv = this.cv;
      if (cv.width < W || cv.height < Hh || cv.width > W * 2.5 || cv.height > Hh * 2.5) {
        cv.width = Math.min(2048, Math.ceil(W / 128) * 128); cv.height = Math.min(2048, Math.ceil(Hh / 128) * 128);
      }
      const CW = cv.width, CH = cv.height;
      gl.viewport(0, 0, CW, CH);
      gl.disable(gl.SCISSOR_TEST);
      gl.clearColor(0, 0, 0, 0); gl.clearDepth(1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.BLEND);
      gl.useProgram(this.prog);
      const u = this.u;
      // bones for everyone at once
      const rows = Math.min(this.maxRows, list.length);
      for (let r = 0; r < rows; r++) this._bones(list[r], r);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.boneTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.boneW, rows, gl.RGBA, gl.FLOAT, this.boneData, 0);
      gl.uniform1i(u.uBones, 0);
      // numbers
      for (let r = 0; r < rows; r++) list[r].num = this.numSlot(list[r].pp.style);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.numTex);
      if (this.numDirty) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.numCv); gl.generateMipmap(gl.TEXTURE_2D); this.numDirty = false; }
      gl.uniform1i(u.uNumTex, 1);
      this._masks();
      // ---- shadow pass: each person's depth from the overhead key light into a 512 px tile
      const useSh = this.shadowsOk && opts.shadows !== false && rows <= 16;
      if (useSh) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.shFbo);
        gl.viewport(0, 0, 2048, 2048);
        gl.clearDepth(1); gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.useProgram(this.dprog);
        gl.uniform1i(this.du.uBones, 0);
        gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.5, 2);
        for (let r = 0; r < rows; r++) {
          const c = list[r];
          c.tile = [(r % 4) * 0.25, Math.floor(r / 4) * 0.25, 0.25, 0.25];
          this._lightMatrix(c);
          gl.viewport((r % 4) * 512, Math.floor(r / 4) * 512, 512, 512);
          gl.uniformMatrix4fv(this.du.uVP, false, c.lvp);
          gl.uniform1i(this.du.uRow, r);
          const sw = this._sway(c);
          gl.uniform3f(this.du.uFlut, sw[0], sw[1], 0); gl.uniform3f(this.du.uSway, sw[2], sw[3], 0);
          gl.bindVertexArray(c.m.vao);
          gl.drawElements(gl.TRIANGLES, c.m.n, gl.UNSIGNED_INT, 0);
        }
        gl.disable(gl.POLYGON_OFFSET_FILL);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.useProgram(this.prog);
      }
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, this.shTex);
      gl.uniform1i(u.uShadow, 4);
      gl.uniform1f(u.uShOn, useSh ? 1 : 0);
      this._lights(cam);
      for (let r = 0; r < rows; r++) {
        const c = list[r];
        if (useSh) { gl.uniformMatrix4fv(u.uShM, false, c.shm); gl.uniform4fv(u.uShTile, c.tile); }
        else gl.uniformMatrix4fv(u.uShM, false, this.shM);
        gl.viewport(c.cx, CH - c.cy - c.ch, c.cw, c.ch);
        this._vp(cam, c);
        gl.uniformMatrix4fv(u.uVP, false, this.VP);
        gl.uniform1i(u.uRow, r);
        this._person(c);
        gl.bindVertexArray(c.m.vao);
        gl.drawElements(gl.TRIANGLES, c.m.n, gl.UNSIGNED_INT, 0);
        cells.set(c.pp.sk, c);
      }
      // the ball in its holder's hands, in the same cell (so fingers and body occlude it correctly)
      for (let r = 0; r < rows; r++) {
        const c = list[r];
        if (!c.ball) continue;
        const b = c.ball, bu = this.bu;
        gl.useProgram(this.bprog);
        gl.viewport(c.cx, CH - c.cy - c.ch, c.cw, c.ch);
        this._vp(cam, c);
        gl.uniformMatrix4fv(bu.uVP, false, this.VP);
        gl.uniform4f(bu.uBall, b.x, b.y, b.z, b.R);
        const m = b.rot;
        gl.uniformMatrix3fv(bu.uRot, false, [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);
        gl.uniform2f(bu.uSquash, 1 + 0.12 * (b.squash || 0), 1 - 0.16 * (b.squash || 0));
        this._lightsTo(bu, cam);
        gl.bindVertexArray(this.bvao);
        gl.drawElements(gl.TRIANGLES, this.bcount, gl.UNSIGNED_SHORT, 0);
        c.hasBall = true;
        gl.useProgram(this.prog);
      }
      gl.bindVertexArray(null);
      this.CH = CH;
      return rows;
    }
    /** draw a person's cell onto the 2D scene (returns false if it has none) */
    blit(g, sk) {
      const c = this.cells.get(sk);
      if (!c) return false;
      g.drawImage(this.cv, c.cx, c.cy, c.cw, c.ch, c.x0, c.y0, c.x1 - c.x0, c.y1 - c.y0);
      return true;
    }
    /** floor reflection: the cell mirrored about the person's floor contact */
    reflect(g, cam, sk, alpha) {
      const c = this.cells.get(sk);
      if (!c) return false;
      const P = sk.P;
      const fy = cam.sy((P[19 * 3 + 1] + P[25 * 3 + 1]) * 0.5, 0);
      g.save();
      g.globalAlpha = alpha;
      g.translate(0, fy * 2);
      g.scale(1, -1);
      g.drawImage(this.cv, c.cx, c.cy, c.cw, c.ch, c.x0, c.y0, c.x1 - c.x0, c.y1 - c.y0);
      g.restore();
      return true;
    }

    _masks() {
      const gl = this.gl, u = this.u;
      if (!this.masksReady && M.Human && M.Human.ready()) {
        const D = M.Human.data;
        [D.mask1.img, D.mask2.img].forEach((im, i) => {
          gl.activeTexture(gl.TEXTURE2 + i);
          gl.bindTexture(gl.TEXTURE_2D, this.maskTex[i]);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
          gl.generateMipmap(gl.TEXTURE_2D);
        });
        this.masksReady = true;
      }
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.maskTex[0]);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.maskTex[1]);
      gl.uniform1i(u.uMask1, 2); gl.uniform1i(u.uMask2, 3);
    }
    /** orthographic light view of one person: c.lvp (clip) and c.shm (world -> tile uv + depth 0..1) */
    _lightMatrix(c) {
      const sk = c.pp.sk, P = sk.P, H = sk.dims.H;
      // bounding sphere around the pelvis
      const cx = P[0], cy = P[1], cz = P[2] + 0.1 * H, r = 0.72 * H;
      const L = [0.18, -0.42, 1], ll = Math.hypot(L[0], L[1], L[2]);
      const f = [-L[0] / ll, -L[1] / ll, -L[2] / ll];           // light travel direction
      let rx = f[1] * 0 - f[2] * 1, ry = f[2] * 0 - f[0] * 0, rz = f[0] * 1 - f[1] * 0; // right = f x (0,1,0)
      let rl = Math.hypot(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl;
      const ux = ry * f[2] - rz * f[1], uy = rz * f[0] - rx * f[2], uz = rx * f[1] - ry * f[0]; // up = right x f
      const k = 1 / r;
      const m = c.lvp || (c.lvp = new Float32Array(16)), sm = c.shm || (c.shm = new Float32Array(16));
      const row = (M, i, a, b, cc, d) => { M[i] = a; M[4 + i] = b; M[8 + i] = cc; M[12 + i] = d; };
      // clip: x = right.(p-c)/r, y = up.(p-c)/r, z = f.(p-c)/r
      row(m, 0, rx * k, ry * k, rz * k, -(rx * cx + ry * cy + rz * cz) * k);
      row(m, 1, ux * k, uy * k, uz * k, -(ux * cx + uy * cy + uz * cz) * k);
      row(m, 2, f[0] * k, f[1] * k, f[2] * k, -(f[0] * cx + f[1] * cy + f[2] * cz) * k);
      row(m, 3, 0, 0, 0, 1);
      // tile uv (0..1 inside the tile) and depth (0..1)
      for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) sm[j * 4 + i] = m[j * 4 + i] * 0.5 + (j === 3 ? 0.5 : 0);
      sm[3] = 0; sm[7] = 0; sm[11] = 0; sm[15] = 1;
    }
    _vp(cam, c) {
      const sp = cam.sp, cp = cam.cp, f = cam.f;
      const bw = c.x1 - c.x0, bh = c.y1 - c.y0;
      const near = Math.max(0.3, c.dmin), far = c.dmax;
      const A = (far + near) / (far - near), Bv = -2 * far * near / (far - near);
      const kx = 2 * (cam.ox - c.x0) / bw - 1, ky = 1 - 2 * (cam.oy - c.y0) / bh;
      const ax = 2 * f / bw, ay = 2 * f / bh;
      // view rows: Xc = x - cx; Yc = (y-cy) sp + (z-cz) cp; Zc = (y-cy) cp - (z-cz) sp
      const tY = -(cam.y * sp + cam.z * cp), tZ = -(cam.y * cp - cam.z * sp);
      // clip = P * V (row-major here), stored column-major
      const r0 = [ax, kx * cp, kx * -sp, -ax * cam.x + kx * tZ];
      const r0b = [ax, ax * 0 + kx * cp, kx * -sp, 0];
      void r0b;
      // row 0: ax*Xc + kx*Zc
      const m = this.VP;
      const row = (i, a, b, cc, d) => { m[i] = a; m[4 + i] = b; m[8 + i] = cc; m[12 + i] = d; };
      row(0, ax, kx * cp, -kx * sp, -ax * cam.x + kx * tZ);
      row(1, 0, ay * sp + ky * cp, ay * cp - ky * sp, ay * tY + ky * tZ);
      row(2, 0, A * cp, -A * sp, A * tZ + Bv);
      row(3, 0, cp, -sp, tZ);
      void r0;
    }
    _lights(cam) { this._lightsTo(this.u, cam); }
    _lightsTo(u, cam) {
      const gl = this.gl;
      const n = v => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
      gl.uniform3f(u.uCam, cam.x, cam.y, cam.z);
      const L0 = n([0.18, -0.42, 1]), L1 = n([-0.35, 0.8, 0.75]), L2 = n([0.05, -1, 0.3]);
      // broadcast cameras white-balance to the arena lights, so the rig is neutral: an overhead key, a far-side
      // fill, a soft camera-side fill, a cool sky term and a warm (maple) floor bounce
      gl.uniform3fv(u.uL0, L0); gl.uniform3f(u.uC0, 2.05, 2.05, 2.02);
      gl.uniform3fv(u.uL1, L1); gl.uniform3f(u.uC1, 0.8, 0.82, 0.86);
      gl.uniform3fv(u.uL2, L2); gl.uniform3f(u.uC2, 0.5, 0.5, 0.52);
      gl.uniform3f(u.uSky, 0.26, 0.27, 0.3);
      gl.uniform3f(u.uGround, 0.2, 0.15, 0.1);
      if (u.uExpo) gl.uniform1f(u.uExpo, 1.0);
    }
    _bones(c, row) {
      const sk = c.pp.sk, m = c.m;
      let ex;
      if (sk.ex) ex = sk.ex;
      else if (sk.pose) ex = BD.poseExtras(sk, this.ex);
      else { this.ex.tw.fill(0); this.ex.curl[0] = this.ex.curl[1] = 0.3; ex = this.ex; }
      BD.boneFrames(sk, ex, this.O, this.R, this.TW);
      const D = this.boneData, base = row * this.boneW * 4, O = this.O, R = this.R, bi = m.bindInv;
      for (let b = 0; b < BD.NB; b++) {
        const o = base + b * 28, r = b * 9;
        for (let k = 0; k < 3; k++) {
          D[o + k * 4] = R[r + k * 3]; D[o + k * 4 + 1] = R[r + k * 3 + 1]; D[o + k * 4 + 2] = R[r + k * 3 + 2]; D[o + k * 4 + 3] = O[b * 3 + k];
        }
        for (let k = 0; k < 12; k++) D[o + 12 + k] = bi[b * 12 + k];
        D[o + 24] = this.TW[b] - (m.bindTw ? m.bindTw[b] : 0); D[o + 25] = 0; D[o + 26] = 0; D[o + 27] = 0;
      }
    }
    _person(c) {
      const gl = this.gl, u = this.u, st = c.pp.style, m = c.m, sk = c.pp.sk;
      const cache = st._gl || (st._gl = this._styleColors(st));
      for (const k in cache.v3) gl.uniform3fv(u[k], cache.v3[k]);
      const hd = m.head;
      gl.uniform4f(u.uHeadO, hd.o[0], hd.o[1], hd.o[2], hd.s);
      if (u.uFace) { const ey = hd.eye || { x: 3, y: 8, z: 0 }, mo = hd.mouth || { z: -6, w: 2.3 }; gl.uniform4f(u.uFace, ey.x, ey.y, ey.z, mo.z); gl.uniform1f(u.uMouthW, mo.w); }
      const e0 = hd.eyes[0], e1 = hd.eyes[1];
      gl.uniform4f(u.uEyeL, e0.c[0], e0.c[1], e0.c[2], e0.r);
      gl.uniform4f(u.uEyeR, e1.c[0], e1.c[1], e1.c[2], e1.r);
      const F = st.F || {};
      gl.uniform4f(u.uGaze, 0, 0, 0, 0);
      const sweat = c.pp.a && c.pp.a.sweat != null ? c.pp.a.sweat : 0.35;
      gl.uniform4f(u.uFlags, st.kind === 'ref' ? 1 : 0, st.tattoo && st.tattoo !== 'none' ? 1 + ((st.seed || 0) % 997) / 997 : 0, sk.dims.H, sweat);
      gl.uniform4f(u.uHairF, cache.coil, st.hair === 'fade' ? 0.35 : 1, cache.shine, 0);
      const hr = (BD.B.HED) * 9, SR = sk.R;
      gl.uniform3f(u.uRight, SR[4 * 9], SR[4 * 9 + 3], SR[4 * 9 + 6]);
      void hr;
      gl.uniform4fv(u.uNumRect, c.num);
      // face masks: hairline (per player), brow thickness, lashes; beard style weights; fade sides
      const hlShift = F.hairline == null ? 0 : (F.hairline - 0.5) * 2.2;
      const bald = st.hair === 'bald';
      gl.uniform4f(u.uMaskP, m.human && this.masksReady ? 1 : 0, bald ? 2 : 0.5 + hlShift / 6, 0.62 - 0.26 * (F.browThick == null ? 0.5 : F.browThick) + (st.fem ? 0.1 : 0), st.fem ? 0.75 : 0.45);
      const bd = st.fem ? 'none' : st.beard;
      gl.uniform4f(u.uBeardW, bd === 'full' ? 1 : 0, bd === 'full' || bd === 'goatee' || bd === 'mustache' ? 1 : 0, bd === 'goatee' || bd === 'full' ? 1 : 0, bd === 'stubble' ? 0.55 : bd === 'none' ? 0.0 : 0.3);
      const fadeSides = { fade: 0.55, hightop: 0.5, mohawk: 0.25, buzz: 1, waves: 1 }[st.hair];
      gl.uniform4f(u.uScalpP, fadeSides == null ? 1 : fadeSides, (m.head.eye ? m.head.eye.z : 3) + 5.5, 2.2, 0);
      gl.uniform4f(u.uCloth, cache.panel, 1, cache.stripe, cache.sockStripe);
      const sw = this._sway(c);
      gl.uniform3f(u.uFlut, sw[0], sw[1], 0);
      gl.uniform3f(u.uSway, sw[2], sw[3], 0);
    }
    /** cloth and hair sway from the person's running velocity: [flutter x, y, hair x, y] */
    _sway(c) {
      const a = c.pp.a, o = this._swv || (this._swv = [0, 0, 0, 0]);
      o[0] = o[1] = o[2] = o[3] = 0;
      if (a && a.vx != null) {
        o[0] = -U.clamp((a.vx || 0) * 0.012, -0.12, 0.12); o[1] = -U.clamp((a.vy || 0) * 0.012, -0.12, 0.12);
        o[2] = o[0] * 2; o[3] = o[1] * 2;
      }
      return o;
    }
    _styleColors(st) {
      const v3 = {};
      const S = (k, c) => { v3[k] = new Float32Array(lin(c || '#888')); };
      const skinHex = typeof st.skin === 'object' ? st.skin.b : st.skin;
      v3.uSkin = new Float32Array(skinAlbedo(skinHex || '#a26a45', st.skinI));
      if (st.kind === 'ref') { S('uJersey', '#dcdcdc'); S('uShorts', '#141416'); S('uTrim', '#111'); S('uNum', '#111'); }
      else { S('uJersey', st.jersey && st.jersey.b); S('uShorts', st.shorts && st.shorts.b); S('uTrim', st.trim); S('uNum', st.numColor); }
      S('uSock', st.sock && st.sock.b); S('uShoe', st.shoe); S('uShoeAcc', st.shoeAccent); S('uSole', st.sole);
      S('uHair', st.hairColor); S('uSleeve', st.sleeve ? st.sleeve.b : '#111'); S('uBand', st.headband || '#fff');
      S('uIris', st.eyeColor || '#3a2416');
      // lips: the skin a little darker and redder (vermilion), a touch more colour for women
      const sk = v3.uSkin, lr = st.fem ? [0.86, 0.6, 0.62] : [0.8, 0.6, 0.6];
      v3.uLip = new Float32Array([sk[0] * lr[0] + 0.012, sk[1] * lr[1], sk[2] * lr[2]]);
      const coily = { afro: 1, curly: 0.9, twists: 0.95, locs: 0.8, puffs: 1, braids: 0.6, hightop: 0.9, fade: 0.7, buzz: 0.6, waves: 0.5 };
      const shine = { waves: 1.2, buzz: 0.55, fade: 0.6, hightop: 0.6, braids: 0.8, locs: 0.6, twists: 0.6, afro: 0.5, puffs: 0.5, curly: 0.7 }[st.hair];
      return { v3, coil: coily[st.hair] != null ? coily[st.hair] : 0.2, shine: shine != null ? shine : 1, panel: (st.seed >> 1) & 1 ? 1 : 0, stripe: (st.seed >> 4) & 1 ? 1 : 0, sockStripe: (st.seed >> 6) & 1 ? 1 : 0 };
    }
  }

  let shared = null;
  M.GL3D = {
    get() { if (shared === null) { try { shared = new Renderer(); } catch (e) { shared = { ok: false }; } } return shared.ok ? shared : null; },
    Renderer, skinAlbedo,
  };
})();
