// The five variable fighters, built from Three.js primitives so the game
// ships no model files at all. Nose points toward -Z, wings span X, up is +Y.
// The silhouettes follow the five reference designs the user picked from his
// anime variable-fighter sheet, rebuilt to real-jet proportions from the
// F-22 / F-16 photos in REFERENCE-PHOTOS.md and /tmp/refs (f22.jpg, f16.jpg)
// and the bounty poster mood (cinematic, big jet low in frame, hard light):
// long slim lofted fuselage with a raised spine the bubble canopy grows
// out of, thin tapered wings with rounded edges, small swept tail fins.
// All names, colours and shapes are our own — the photos are style
// reference only, no commercial design is copied.
//
// Build language: a smooth spline loft (16 radial segments, real UVs) with
// a procedural skin texture (panel lines + rivets baked into the paint),
// extruded wing/fin planforms with a bevel so no edge reads as a flat
// plank, and unlit accent strips + small nav lights so the plane stays
// readable at night.
import * as THREE from 'three';

function mat(color, opts = {}) {
  // Painted metal, like the F-16 reference: matte, not mirror-glossy, with
  // a soft sheen from the environment map (scene.environment). The env map
  // is what stops the fuselage reading as flat coloured plastic.
  return new THREE.MeshStandardMaterial({
    color, metalness: 0.68, roughness: 0.34, flatShading: false,
    envMapIntensity: 1.05,
    ...opts,
  });
}

function basic(color, opts = {}) {
  return new THREE.MeshBasicMaterial({ color, ...opts });
}

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

function cyl(rt, rb, h, material, x = 0, y = 0, z = 0, seg = 10) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  mesh.position.set(x, y, z);
  return mesh;
}

function cone(r, h, material, x = 0, y = 0, z = 0, seg = 10) {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), material);
  mesh.position.set(x, y, z);
  return mesh;
}

function sphere(r, material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), material);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  return mesh;
}

// Procedural aircraft skin: the base paint with panel lines and rivet rows
// baked in, so the fuselage reads as riveted metal instead of a smooth toy.
// Canvas maps to the loft UVs: u runs around the hull (0.25 = top spine),
// v runs nose (0) to tail (1). Colour space is sRGB for the map; the same
// canvas doubles as a subtle bump map for panel-line relief.
function skinTexture(baseHex) {
  const W = 2048;
  const H = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  // Desaturate the base toward grey (~18%): a real jet's paint is never a
  // pure saturated colour — the reference F-22 is grey with a hint of tint.
  // The aircraft keeps its identity colour, but it stops reading as a
  // plastic toy. Accent colours (livery) stay vivid; only the skin is muted.
  const base = new THREE.Color(baseHex);
  base.lerp(new THREE.Color(0x808080), 0.18);
  ctx.fillStyle = `#${base.getHexString()}`;
  ctx.fillRect(0, 0, W, H);
  // Faint tonal patches, like sun-faded paint panels.
  for (let i = 0; i < 40; i += 1) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = 80 + Math.random() * 220;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    const lighter = Math.random() < 0.5;
    grad.addColorStop(0, lighter ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const dark = 'rgba(20,20,26,0.62)';
  const darker = 'rgba(20,20,26,0.68)';
  // Rectangular tonal panels, like a real jet's airframe: each panel is a
  // slightly different shade of the base paint, bounded by the panel lines.
  // The old big soft camo blobs are gone — from a distance they read as a
  // toy's paint splodges, not as painted metal. Panels are seeded so the
  // pattern is stable.
  const shade = (hex, f) => {
    const c = new THREE.Color(hex);
    c.multiplyScalar(f);
    return `#${c.getHexString()}`;
  };
  let seed = baseHex ^ 0x9e3779b9;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const panelCols = [0.92, 0.96, 1.04, 1.08];
  for (let i = 0; i < 16; i += 1) {
    const x = rnd() * W * 0.85;
    const y = rnd() * H * 0.8;
    const w = 140 + rnd() * 320;
    const h = 90 + rnd() * 200;
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = shade(baseHex, panelCols[i % panelCols.length]);
    ctx.fillRect(x, y, w, h);
  }
  ctx.globalAlpha = 1;
  // Exhaust staining near the tail (v > 0.85): a soft dark wash like the
  // soot on a real jet's rear fuselage, strongest at the very tail.
  const soot = ctx.createLinearGradient(0, (1 - 0.85) * H, 0, H);
  soot.addColorStop(0, 'rgba(15,15,18,0)');
  soot.addColorStop(1, 'rgba(15,15,18,0.28)');
  ctx.fillStyle = soot;
  ctx.fillRect(0, (1 - 0.85) * H, W, H * 0.15);
  // Radome: the very nose (v < 0.06) reads as a darker grey radome, like
  // a real jet's nose cone, so the tip is a distinct part, not a blob.
  const radome = ctx.createLinearGradient(0, H * 0.94, 0, H);
  radome.addColorStop(0, 'rgba(38,40,46,0)');
  radome.addColorStop(1, 'rgba(38,40,46,0.5)');
  ctx.fillStyle = radome;
  ctx.fillRect(0, H * 0.94, W, H * 0.06);
  // Belly grime: the underside of the hull (u ~ 0.75) carries a soft dark
  // wash, so the fuselage has a shaded belly and does not float like paper.
  const belly = ctx.createLinearGradient(W * 0.62, 0, W * 0.88, 0);
  belly.addColorStop(0, 'rgba(12,12,16,0)');
  belly.addColorStop(0.5, 'rgba(12,12,16,0.20)');
  belly.addColorStop(1, 'rgba(12,12,16,0)');
  ctx.fillStyle = belly;
  ctx.fillRect(W * 0.62, 0, W * 0.26, H);
  // Circumferential panel rings (v stations, horizontal lines on canvas).
  // Round 14: width 3 -> 4 — the fuselage rings carry the "panelled jet"
  // read from the side, and the user asked for visible panel lines.
  const ringVs = [0.08, 0.2, 0.32, 0.45, 0.58, 0.7, 0.82, 0.93];
  ctx.lineWidth = 4;
  for (const v of ringVs) {
    const y = (1 - v) * H;
    ctx.strokeStyle = dark;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
    // Rivet row just below each ring line.
    ctx.fillStyle = darker;
    for (let x = 12; x < W; x += 36) {
      ctx.beginPath();
      ctx.arc(x, y + 14, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Longitudinal panel seams (u stations, vertical lines on canvas).
  ctx.lineWidth = 3;
  for (const u of [0.0, 0.125, 0.375, 0.5, 0.625, 0.875]) {
    const x = u * W;
    ctx.strokeStyle = dark;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  // Access hatches: a few small rounded rectangles on the flanks.
  ctx.strokeStyle = darker;
  ctx.lineWidth = 3;
  for (const [u, v, w, h] of [
    [0.06, 0.3, 0.07, 0.06], [0.56, 0.3, 0.07, 0.06],
    [0.1, 0.62, 0.05, 0.05], [0.6, 0.62, 0.05, 0.05],
  ]) {
    ctx.strokeRect(u * W, (1 - v) * H - h * H / 2, w * W, h * H);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// Wings and fins get their own skin: fine panel lines and rivets, no big
// camo blobs — the fuselage camo mapped onto the wing read as graph paper
// from the landing angle. UVs on the airfoil: u = chordwise (LE 0 -> TE 1),
// v = spanwise (root 0 -> tip 1).
function wingSkinTexture(baseHex) {
  const W = 1024;
  const H = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  // Desaturate like the fuselage skin: real jet paint is never pure colour.
  const base = new THREE.Color(baseHex);
  base.lerp(new THREE.Color(0x808080), 0.18);
  ctx.fillStyle = `#${base.getHexString()}`;
  ctx.fillRect(0, 0, W, H);
  // Very subtle tonal patches only.
  for (let i = 0; i < 10; i += 1) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = 100 + Math.random() * 200;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, Math.random() < 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Round 8 — BOLDER tonal panels (seeded, stable): round 7's ±4-10%
  // at alpha 0.75 still washed out under flat noon sun from directly
  // behind, where the wing top is one broad plane at a grazing angle.
  // The range is now ±6-16% at alpha 0.9 with bigger rects, so each
  // panel is a large readable patch of the span instead of a whisper.
  // The landing shot (dusk, warm light, close range) is the guard:
  // panels must stay soft tone, not hard lines — the line alphas below
  // stay at round-7 values.
  const shade = (hex, f) => {
    const c = new THREE.Color(hex);
    c.multiplyScalar(f);
    return `#${c.getHexString()}`;
  };
  let seed = baseHex ^ 0x51ed270b;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const panelCols = [0.84, 0.94, 1.06, 1.16];
  for (let i = 0; i < 14; i += 1) {
    const x = rnd() * W * 0.8;
    const y = rnd() * H * 0.8;
    const w = 160 + rnd() * 240;
    const h = 200 + rnd() * 280;
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = shade(baseHex, panelCols[i % panelCols.length]);
    ctx.fillRect(x, y, w, h);
  }
  ctx.globalAlpha = 1;
  // Round 14: the user said the wings have NO lines at all — from
  // directly behind, the round-7 whisper lines (0.38) wash out under
  // flat noon sun. The lines are back to readable (0.55, width 3) plus
  // a bold flap/aileron hinge line at u = 0.72, matching the 3D hinge
  // strip. The landing shot (dusk, close range) is still the guard:
  // the lines stay dark-grey tone, never black, and the tonal panels
  // above keep them from reading as a model-kit grid.
  const line = 'rgba(18,18,24,0.55)';
  // Chordwise panel lines (constant u): the ribs of the wing.
  ctx.lineWidth = 3;
  for (const u of [0.15, 0.3, 0.45, 0.6, 0.75, 0.9]) {
    const x = u * W;
    ctx.strokeStyle = line;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  // Flap/aileron hinge line: the one chordwise seam a real jet shows
  // from any angle — the hinge where the control surfaces meet the wing.
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(18,18,24,0.65)';
  ctx.beginPath();
  ctx.moveTo(0.72 * W, 0);
  ctx.lineTo(0.72 * W, H);
  ctx.stroke();
  // Chordwise shading: the trailing edge sits slightly darker than the
  // leading edge, so the wing top reads as a curved surface with depth
  // instead of one flat-lit plate (the round-5 day shot). Round 8: the
  // gradient is stronger again (TE 0.30 -> 0.48) and the bright band
  // riding the leading edge is stronger (0.14 -> 0.30) — from directly
  // behind, the camber now reads as a light gradient across the chord.
  const shadeGrad = ctx.createLinearGradient(0, 0, W, 0);
  shadeGrad.addColorStop(0, 'rgba(0,0,0,0)');
  shadeGrad.addColorStop(0.6, 'rgba(0,0,0,0.05)');
  shadeGrad.addColorStop(1, 'rgba(0,0,0,0.48)');
  ctx.fillStyle = shadeGrad;
  ctx.fillRect(0, 0, W, H);
  const leGlow = ctx.createLinearGradient(0, 0, W * 0.12, 0);
  leGlow.addColorStop(0, 'rgba(255,255,255,0.30)');
  leGlow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = leGlow;
  ctx.fillRect(0, 0, W * 0.12, H);
  // Trailing-edge band: a hard dark strip on the last 6% of chord, the
  // hinge line of the aileron/flap — from behind it is the one chordwise
  // feature that survives distance and flat light. Round 7: softened
  // 0.38 -> 0.26 with the rest of the grid.
  ctx.fillStyle = 'rgba(16,16,22,0.26)';
  ctx.fillRect(W * 0.94, 0, W * 0.06, H);
  // Leading-edge strip: a darker metal band along the leading edge, like
  // the bare-metal LE on a real jet — it is what stops the wing reading
  // as a flat paper plate from the landing angle. Round 7: 0.45 -> 0.30.
  ctx.fillStyle = 'rgba(18,18,24,0.30)';
  ctx.fillRect(0, 0, 10, H);
  // Root fairing band: the wing root darkens where it blends into the
  // fuselage, so the wing does not float as a separate flat slab.
  // (Canvas y is flipped: v=0 root sits at the bottom of the canvas.)
  const root = ctx.createLinearGradient(0, H * 0.85, 0, H);
  root.addColorStop(0, 'rgba(12,12,16,0)');
  root.addColorStop(1, 'rgba(12,12,16,0.22)');
  ctx.fillStyle = root;
  ctx.fillRect(0, H * 0.85, W, H * 0.15);
  // Spanwise panel lines (constant v): from directly behind, the
  // chordwise lines run parallel to the view and vanish — the spanwise
  // lines are what the eye sees, so there are four of them and they are
  // stronger (round 6 day shot). Round 14: 0.32 -> 0.50, width 2 -> 3 —
  // the user wants the lines to read, and the spanwise ones are the ones
  // the chase camera actually sees.
  ctx.lineWidth = 3;
  for (const v of [0.2, 0.4, 0.6, 0.8]) {
    const y = v * H;
    ctx.strokeStyle = 'rgba(18,18,24,0.50)';
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  // Sunlit tip band: the outer wing catches more light, so the tip reads
  // as a separate panel instead of the slab ending in a flat edge.
  const tipBand = ctx.createLinearGradient(0, 0, 0, H * 0.14);
  tipBand.addColorStop(0, 'rgba(255,255,255,0.10)');
  tipBand.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = tipBand;
  ctx.fillRect(0, 0, W, H * 0.14);
  // Rivet rows along the chordwise lines, sparse. Round 14: 0.28 -> 0.40.
  ctx.fillStyle = 'rgba(18,18,24,0.40)';
  for (const u of [0.15, 0.45, 0.75]) {
    for (let y = 10; y < H; y += 34) {
      ctx.beginPath();
      ctx.arc(u * W + 5, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function wingMat(baseHex, opts = {}) {
  const tex = wingSkinTexture(baseHex);
  return new THREE.MeshStandardMaterial({
    map: tex, bumpMap: tex, bumpScale: 0.04,
    metalness: 0.6, roughness: 0.36, flatShading: false,
    // Env reflection kept modest (0.55): at dusk the env is orange, and a
    // mirror-gloss wing turns pink-tan under it — the round-4 landing shot.
    // A per-aircraft override (Tsuru's matOpts) can push it lower still.
    envMapIntensity: opts.envMapIntensity ?? 0.55,
    ...opts,
  });
}

function skinMat(baseHex, opts = {}) {
  const tex = skinTexture(baseHex);
  return new THREE.MeshStandardMaterial({
    map: tex, bumpMap: tex, bumpScale: 0.08,
    metalness: 0.6, roughness: 0.38, flatShading: false,
    envMapIntensity: 1.0,
    ...opts,
  });
}

// A smooth hull lofted through elliptical cross-sections.
// sections: [[z, rx, ry, yc], ...] nose-first, yc = spine rise at that
// station (the canopy hump). radial: 16 = smooth jet, 4 = diamond stealth.
// exp: superellipse exponent — 2 = pure ellipse (smooth tube, reads as a
// plastic toy), 2.6-2.8 = squarish faceted section with flat sides and a
// defined chine line, like the F-22 in the user's reference photo. The
// flat sides catch the sun in broad panels instead of one smooth highlight,
// which is what stops the fuselage reading as a toy.
// UVs: u around the hull, v nose-to-tail, so the skin texture wraps cleanly.
function loft(sections, material, radial = 16, exp = 2) {
  const ringCount = sections.length;
  const positions = [];
  const uvs = [];
  const indices = [];
  const se = (a) => {
    const c = Math.cos(a);
    const s = Math.sin(a);
    const p = 2 / exp;
    return [
      Math.sign(c) * Math.pow(Math.abs(c), p),
      Math.sign(s) * Math.pow(Math.abs(s), p),
    ];
  };
  for (let i = 0; i < ringCount; i += 1) {
    const [z, rx, ry, yc = 0] = sections[i];
    for (let j = 0; j < radial; j += 1) {
      const a = (j / radial) * Math.PI * 2 + (radial === 4 ? Math.PI / 4 : 0);
      const [sx, sy] = se(a);
      positions.push(sx * rx, yc + sy * ry, z);
      uvs.push(j / radial, i / (ringCount - 1));
    }
  }
  for (let i = 0; i < ringCount - 1; i += 1) {
    for (let j = 0; j < radial; j += 1) {
      const a = i * radial + j;
      const b = i * radial + ((j + 1) % radial);
      const c = (i + 1) * radial + j;
      const d = (i + 1) * radial + ((j + 1) % radial);
      // Wound outward: from outside the hull the faces read FrontSide.
      indices.push(a, b, c, b, d, c);
    }
  }
  // Cap the tail with a fan to the centre point, facing +Z.
  const tailZ = sections[ringCount - 1][0];
  const tailYc = sections[ringCount - 1][3] || 0;
  const tailIndex = positions.length / 3;
  positions.push(0, tailYc, tailZ + 0.4);
  uvs.push(0.5, 1);
  const tailBase = (ringCount - 1) * radial;
  for (let j = 0; j < radial; j += 1) {
    indices.push(tailBase + j, tailBase + ((j + 1) % radial), tailIndex);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}

// NACA 4-digit half-thickness at chord fraction x (0..1). Factored out
// of airfoilGeometry so the surface-strip helper below uses the exact
// same section math — a strip that guesses the surface height floats or
// sinks; one that shares the formula hugs it.
function nacaYt(x, thick) {
  return 5 * thick * (0.2969 * Math.sqrt(Math.max(x, 1e-6)) - 0.1260 * x - 0.3516 * x * x + 0.2843 * x * x * x - 0.1015 * x * x * x * x);
}

// Top-surface point of the main wing at span fraction fs and chord
// fraction x. w: { span, le, te, leTip, teTip, thickRoot, thickTip,
// camber, dihedral } — the same numbers the wing airfoil is built from.
// Returns { y, z } in the wing's local coords (span along +X).
function wingTopY(fs, x, w) {
  const leS = w.le + (w.leTip - w.le) * fs;
  const chord = (w.te - w.le) + ((w.teTip - w.leTip) - (w.te - w.le)) * fs;
  const thick = w.thickRoot + (w.thickTip - w.thickRoot) * fs;
  const yLift = (w.dihedral || 0) * fs * w.span;
  let yt = nacaYt(x, thick);
  yt = Math.max(yt, 0.01 * Math.max(0, Math.min(1, (x - 0.85) / 0.15)));
  const yc = (w.camber || 0) * 4 * x * (1 - x);
  return { y: yLift + (yc + yt) * chord, z: leS + x * chord };
}

// A thin ribbon hugging the wing top surface across a chord band
// [x0, x1], fs 0.08..0.97. This is the round-14 answer to "no lines on
// the wing": a real 3D seam that catches light and shadow from directly
// behind, where texture lines run parallel to the view and vanish under
// flat noon sun. Sits 0.02 above the surface so it never z-fights the
// skin; the caller mirrors it (scale.x = -1) for the left wing, so the
// material must be DoubleSide.
function wingStrip(w, x0, x1, material) {
  const positions = [];
  const indices = [];
  const N = 12;
  for (let i = 0; i <= N; i += 1) {
    const fs = 0.08 + (0.97 - 0.08) * (i / N);
    const a = wingTopY(fs, x0, w);
    const b = wingTopY(fs, x1, w);
    positions.push(fs * w.span, a.y + 0.02, a.z, fs * w.span, b.y + 0.02, b.z);
  }
  for (let i = 0; i < N; i += 1) {
    const r = i * 2;
    indices.push(r, r + 2, r + 1, r + 1, r + 2, r + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}

// A real airfoil, lofted through NACA-style sections along the span:
// thick at the root (12-13% of chord), thin at the tip (7%), cambered top,
// rounded leading edge, sharp trailing edge. The surface curves in two
// directions and catches the sun, so the wing reads as a wing, not a flat
// plank. Local coords: span 0..span along +X, chord along Z (le = leading
// edge z at root, te = trailing edge z at root, leTip/teTip at the tip),
// thickness along Y. `from`/`to` (0..1) build a spanwise slice, so the
// accent wingtip is a real slice of the same airfoil.
function airfoilGeometry({ span, le, te, leTip, teTip, thickRoot = 0.12, thickTip = 0.07, camber = 0.02, dihedral = 0, from = 0, to = 1, stations = 7, pts = 16 }) {
  const positions = [];
  const uvs = [];
  const indices = [];
  // One airfoil ring: top LE->TE, then bottom TE->LE.
  const ringLen = (pts + 1) * 2;
  const chordRoot = te - le;
  const chordTip = teTip - leTip;
  for (let s = 0; s < stations; s += 1) {
    const fs = from + (to - from) * (s / (stations - 1));
    const leS = le + (leTip - le) * fs;
    const chord = chordRoot + (chordTip - chordRoot) * fs;
    const thick = thickRoot + (thickTip - thickRoot) * fs;
    const yLift = dihedral * fs * span;
    for (let i = 0; i <= pts; i += 1) {
      const x = i / pts;
      let yt = nacaYt(x, thick);
      // Blunt trailing edge (round 8): the NACA formula closes to a
      // knife edge, so from directly behind the wing ended in an
      // invisible line and read as a flat sheet. A small finite TE
      // thickness (~1% of chord, like a real jet) gives the wing a
      // visible rear edge that catches a shadow line from behind.
      yt = Math.max(yt, 0.01 * Math.max(0, Math.min(1, (x - 0.85) / 0.15)));
      const yc = camber * 4 * x * (1 - x);
      positions.push(fs * span, yLift + (yc + yt) * chord, leS + x * chord);
      uvs.push(x, fs);
    }
    for (let i = pts; i >= 0; i -= 1) {
      const x = i / pts;
      let yt = nacaYt(x, thick);
      yt = Math.max(yt, 0.01 * Math.max(0, Math.min(1, (x - 0.85) / 0.15)));
      const yc = camber * 4 * x * (1 - x);
      positions.push(fs * span, yLift + (yc - yt) * chord, leS + x * chord);
      uvs.push(x, fs);
    }
  }
  for (let s = 0; s < stations - 1; s += 1) {
    for (let j = 0; j < ringLen; j += 1) {
      const a = s * ringLen + j;
      const b = s * ringLen + ((j + 1) % ringLen);
      const c = (s + 1) * ringLen + j;
      const d = (s + 1) * ringLen + ((j + 1) % ringLen);
      indices.push(a, c, b, b, c, d);
    }
  }
  // Caps: fan each end to its centroid.
  for (const s of [0, stations - 1]) {
    const base = s * ringLen;
    let cx = 0; let cy = 0; let cz = 0;
    for (let j = 0; j < ringLen; j += 1) {
      cx += positions[(base + j) * 3]; cy += positions[(base + j) * 3 + 1]; cz += positions[(base + j) * 3 + 2];
    }
    cx /= ringLen; cy /= ringLen; cz /= ringLen;
    const ci = positions.length / 3;
    positions.push(cx, cy, cz);
    uvs.push(0.5, s === 0 ? from : to);
    for (let j = 0; j < ringLen; j += 1) {
      if (s === 0) indices.push(base + j, base + ((j + 1) % ringLen), ci);
      else indices.push(base + ((j + 1) % ringLen), base + j, ci);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// A swept wing planform, extruded thin with a bevel so the edge is rounded
// like a real airfoil instead of a flat plank. Shape is drawn in
// (x = span, y = world z): leading edge first. The extrusion is centred
// on y = 0 via the bounding box, so the wing sits on the fuselage centreline.
function wingPanel(points, thickness, material) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.02, thickness - 0.1), bevelEnabled: true,
    bevelThickness: 0.05, bevelSize: 0.07, bevelSegments: 2, steps: 1,
  });
  geo.rotateX(Math.PI / 2); // shape Y becomes world Z, extrusion becomes -Y
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  geo.translate(0, -(bb.min.y + bb.max.y) / 2, 0);
  return new THREE.Mesh(geo, material);
}

// A vertical fin, drawn in (x = world z, y = height), extruded thin in X,
// bevelled like the wings. The extrusion is centred on x = 0.
function finPanel(points, thickness, material) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.02, thickness - 0.08), bevelEnabled: true,
    bevelThickness: 0.04, bevelSize: 0.05, bevelSegments: 2, steps: 1,
  });
  geo.rotateY(-Math.PI / 2); // shape X becomes world Z, extrusion becomes -X
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  geo.translate(-(bb.min.x + bb.max.x) / 2, 0, 0);
  return new THREE.Mesh(geo, material);
}

let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 1, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(canvas);
  return glowTex;
}

function glowSprite(color, scale, x, y, z) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  sprite.scale.set(scale, scale, 1);
  sprite.position.set(x, y, z);
  return sprite;
}

// Panel rings around the fuselage: thin dark torus hoops at three stations,
// sized from the loft sections so they hug the hull. Reads as panel lines
// in full 3D, no toon outline.
function panelRings(group, sections, color) {
  const ringMat = new THREE.MeshStandardMaterial({
    color, metalness: 0.4, roughness: 0.6,
  });
  const interp = (z) => {
    for (let i = 0; i < sections.length - 1; i += 1) {
      const [z0, rx0, ry0, yc0 = 0] = sections[i];
      const [z1, rx1, ry1, yc1 = 0] = sections[i + 1];
      if (z >= z0 && z <= z1) {
        const t = (z - z0) / (z1 - z0 || 1);
        return [
          rx0 + (rx1 - rx0) * t, ry0 + (ry1 - ry0) * t,
          yc0 + (yc1 - yc0) * t,
        ];
      }
    }
    const last = sections[sections.length - 1];
    return [last[1], last[2], last[3] || 0];
  };
  for (const z of [-2.2, 1.4, 4.2]) {
    const [rx, ry, yc] = interp(z);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.04, 6, 32), ringMat);
    ring.scale.set(rx + 0.03, ry + 0.03, 1);
    ring.position.set(0, yc, z);
    group.add(ring);
  }
}

// Shared bits: small glowing nav lights (points, not bokeh blobs), emissive
// accent strips that stay visible at night, a retractable gear, and a
// two-stage afterburner (small orange cone + hot white core) the renderer
// scales with throttle. opts: span, length, edge (outline colour), accent.
function finishModel(group, opts) {
  const half = opts.span / 2;
  // Nav lights ride at the wingtip height: with the round-8 dihedral the
  // tips sit ~0.8 m above the centreline, and a light at y=0 would float
  // visibly below the tip from behind.
  const navY = (opts.dihedral || 0) * (half - 0.2);
  const navL = sphere(0.12, basic(0xff2a2a), -half, navY, 0);
  const navR = sphere(0.12, basic(0x2aff66), half, navY, 0);
  const strobe = sphere(0.1, basic(0xffffff), 0, 0.25, opts.length / 2);
  group.add(navL, navR, strobe);
  group.add(glowSprite(0xff2a2a, 0.9, -half, navY, 0));
  group.add(glowSprite(0x2aff66, 0.9, half, navY, 0));
  group.add(glowSprite(0xffffff, 0.55, 0, 0.25, opts.length / 2));
  // Emissive accent strips along the fuselage flanks: unlit, so they read
  // as lit trim at night and as livery by day.
  const stripMat = basic(opts.accent);
  for (const s of [-1, 1]) {
    const strip = box(0.14, 0.14, 7.5, stripMat, s * (opts.beam + 0.06), 0.28, 0.3);
    group.add(strip);
  }
  // Afterburner: one flame PER nozzle mouth, not a single central plume
  // (the old one sat at x=0, between the holes, so the mouths read
  // empty). Three stages per flame, like a real burner: blue Mach-diamond
  // root at the mouth, hot pale core, orange outer sheath — all additive,
  // grouped per flame so the renderer can scale each flame in place from
  // its own mouth. ConeGeometry apex is +Y; rotation.x = +90 deg sends
  // the apex to +Z (trailing), base toward the nozzle; each cone is
  // centred at h/2 so its base sits exactly on the mouth plane. The
  // flame group sits 0.02 behind the mouth disc so the cone base cap
  // never z-fights the black disc.
  const burner = new THREE.Group();
  const nozzleList = opts.nozzles || [[-0.48, opts.length / 2 + 0.7, 0.30], [0.48, opts.length / 2 + 0.7, 0.30]];
  for (const [nx, mouthZ, mouthR] of nozzleList) {
    const flame = new THREE.Group();
    const stage = (r, h, color, opacity, zOff = 0) => {
      const c = cone(r, h, new THREE.MeshBasicMaterial({
        color, transparent: true, opacity,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }), 0, 0, h / 2 + zOff, 10);
      c.rotation.x = Math.PI / 2;
      return c;
    };
    // Round 13 (second attempt): the first try's wider blue cone + lip
    // ring still read white — the pale core and orange sheath both start
    // at the mouth, so the additive stack sums to white-hot at the base,
    // and the orange glow sprite washes the lip orange. Now the pale
    // core and orange sheath start 0.6 mouth-radii downstream, so the
    // first stretch of flame is blue-only (like a real burner: blue at
    // the nozzle, orange downstream), and the orange glow sprite shrinks
    // (3 -> 1.8 mouth radii) so it no longer paints over the blue band.
    flame.add(stage(mouthR * 1.05, mouthR * 7.0, 0xff7722, 0.5, mouthR * 0.6)); // orange sheath
    flame.add(stage(mouthR * 0.62, mouthR * 4.5, 0xffe9a8, 0.85, mouthR * 0.6)); // hot pale core
    // Blue root: nearly the full mouth wide (0.95 vs pale core 0.62),
    // so from behind a real blue ring reads at the nozzle lip — the
    // first two tries hid the blue inside the additive stack (a 0.06
    // annulus is sub-pixel at cruise scale). Blue at the base, orange
    // downstream, like a real burner.
    // Round 13: the blue still read faint at night — the cone now pokes
    // just past the orange sheath (1.12 vs 1.05), longer (4.0) and fully
    // opaque (1.0), plus a thin blue ring hugging the lip itself, so a
    // blue rim reads at the mouth without a cartoon blue blob.
    flame.add(stage(mouthR * 1.12, mouthR * 4.0, 0x3f8cff, 1.0)); // blue root
    const lipRing = new THREE.Mesh(
      new THREE.TorusGeometry(mouthR * 1.02, mouthR * 0.14, 8, 24),
      new THREE.MeshBasicMaterial({
        color: 0x3f8cff, transparent: true, opacity: 0.8,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    flame.add(lipRing);
    flame.add(glowSprite(0xff8830, mouthR * 1.8, 0, 0, 0.2));
    flame.position.set(nx, 0, mouthZ + 0.02);
    burner.add(flame);
  }
  burner.visible = false;
  group.add(burner);
  const gearMat = mat(0x8a8f96, { metalness: 0.85, roughness: 0.3 });
  const tyreMat = mat(0x111114, { metalness: 0.1, roughness: 0.9 });
  const hubMat = mat(0xb9bec6, { metalness: 0.9, roughness: 0.25 });
  const gear = new THREE.Group();
  for (const [gx, gz] of [[-1.4, 1.5], [1.4, 1.5], [0, -4.5]]) {
    const strut = cyl(0.1, 0.13, 1.15, gearMat, gx, -0.85, gz, 8);
    const wheel = cyl(0.42, 0.42, 0.28, tyreMat, gx, -1.5, gz, 12);
    wheel.rotation.z = Math.PI / 2;
    const hub = cyl(0.2, 0.2, 0.3, hubMat, gx, -1.5, gz, 10);
    hub.rotation.z = Math.PI / 2;
    gear.add(strut, wheel, hub);
  }
  gear.visible = false;
  group.add(gear);
  return { group, burner, gear, strobe };
}

// One sleek fighter from parameters. p: {
//   sections, radial, main, accent, tip, dark, glass, matOpts,
//   span (one side), sweep (tip leading-edge z), chord, tipChord,
//   canard (bool), tails (cant angle), beam (half-width at fuselage),
//   extras(group, mats) — model-specific parts like the cannon pod.
// }
function buildFighter(p) {
  const g = new THREE.Group();
  const main = skinMat(p.main, p.matOpts || {});
  const accent = mat(p.accent);
  const tipMat = mat(p.tip);
  const dark = mat(p.dark);
  // Thin plates (wings, fins, stabilators) are mirrored with scale.x = -1,
  // which flips their winding, so they need DoubleSide. The lofted hull and
  // all closed solids stay FrontSide: from the cockpit camera inside the
  // hull, their backfaces are culled and the pilot can actually see out.
  const plate = (m) => { const c = m.clone(); c.side = THREE.DoubleSide; return c; };
  const mainP = plate(main);
  const accentP = plate(accent);
  const tipP = plate(tipMat);
  const darkP = plate(dark);
  // Fins and wings in the main colour with the fine wing skin, not the
  // accent: accent fins read as flat planks in shadow (yellow went brown,
  // purple went slab-purple) and dominated the rear view. The accent
  // survives as a thin edge strip. Wing env follows the airframe's own env
  // setting (Tsuru's low env keeps its white wings white at dusk instead
  // of pink — the round-4 landing shot).
  const wingEnv = (p.matOpts && p.matOpts.envMapIntensity !== undefined)
    ? Math.min(p.matOpts.envMapIntensity, 0.55) : 0.55;
  const wing = wingMat(p.main, { envMapIntensity: wingEnv });
  const wingP = plate(wing);
  const glass = new THREE.MeshStandardMaterial({
    // Smoked-glass bubble canopy like the F-22/F-16 references: dark,
    // near-black glass. The dusk sky is orange, so ANY strong env or sun
    // reflection turns the dome brown like a wooden egg — the env
    // reflection is kept faint (0.2) and the specular soft (roughness
    // 0.2), so the dark base colour dominates and the dome reads as glass.
    color: 0x0a0e12, metalness: 0.3, roughness: 0.2,
    emissive: 0x000000, emissiveIntensity: 0,
    transparent: true, opacity: 0.9, depthWrite: false,
    envMapIntensity: 0.2,
  });
  const body = loft(p.sections.map(([z, rx, ry, yc = 0]) => {
    // Widen the mid-body where the wing roots sit (LEX blending), and slim
    // + droop the nose (F-16 style): from the cockpit the old fat nose
    // filled the lower frame as a giant dome.
    if (z <= -2.5) return [z, rx * 0.88, ry * 0.78, yc - 0.05];
    return [z, rx * (z < 3.5 ? 1.22 : 1), ry, yc];
  }), main, p.radial || 16, p.exp || 2);
  body.name = 'fuselageHull'; // DEBUG: named so the cockpit view can hide it
  g.add(body);
  panelRings(g, p.sections, 0x1c1c22);
  // Canopy: a LOW flush bubble that grows out of the raised spine, not a
  // ball sitting on top. The reference jet's canopy is a slim smoked-glass
  // bubble barely rising above the spine — the old tall dome read as a
  // black egg from behind and as a wooden dome at dusk. Base sunk into the
  // hull so only the top third of the glass shows; the eye point (camera
  // 1.55 world) stays well above it, so the nose still drops out of the
  // cockpit frame.
  const canopyGeo = new THREE.SphereGeometry(1, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  canopyGeo.scale(0.58, 0.5, 2.3);
  const canopy = new THREE.Mesh(canopyGeo, glass);
  canopy.name = 'canopyGlass';
  canopy.position.set(0, 0.38, -2.6);
  g.add(canopy);
  // Dark rim around the canopy base: a flattened torus ring, so the glass
  // sits in a frame instead of floating on the paint.
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.055, 6, 28),
    new THREE.MeshStandardMaterial({ color: 0x14161a, metalness: 0.5, roughness: 0.5 }),
  );
  rim.name = 'canopyRim';
  rim.rotation.x = Math.PI / 2;
  rim.scale.set(0.62, 2.3, 1);
  rim.position.set(0, 0.42, -2.6);
  g.add(rim);
  // Pitot tube on the nose, and a small ventral fin under the tail.
  const pitot = cyl(0.05, 0.05, 1.4, dark, 0.3, -0.12, -6.4, 6);
  pitot.rotation.x = Math.PI / 2;
  g.add(pitot);
  const ventral = finPanel([[-1.2, 0], [-0.3, -1.0], [0.3, -1.0], [1.0, 0]], 0.1, wingP);
  ventral.position.set(0, -0.5, 4.8);
  g.add(ventral);
  // Dorsal antenna mast on the spine + wingtip rails: small hard details
  // that make the silhouette read as a real jet, not a smooth toy.
  const antenna = finPanel([[-0.5, 0], [-0.1, 0.7], [0.3, 0.7], [0.6, 0]], 0.06, darkP);
  antenna.position.set(0, 0.75, 2.6);
  g.add(antenna);
  // Side intakes, flush against the fuselage flanks: dark recessed
  // mouths, not boxes sticking out. Ootaka overrides with its own intakes.
  // Bigger than round 4 (caret intakes like the reference jet): a real jet
  // reads its intakes from behind as much as its wings.
  if (p.intakes !== false) {
    for (const s of [-1, 1]) {
      const scoop = box(0.5, 1.1, 3.2, dark, s * (p.beam + 0.1), -0.15, -0.8);
      scoop.rotation.y = s * -0.15;
      g.add(scoop);
      const lip = box(0.54, 0.16, 3.2, main, s * (p.beam + 0.1), 0.4, -0.8);
      lip.rotation.y = s * -0.15;
      g.add(lip);
      // Round 14 — black mouth: a near-black plate just ahead of the
      // intake's front face, so the intake reads as a deep hole instead
      // of a dark box painted on the flank.
      const mouth = box(0.4, 0.9, 0.08, basic(0x050506), s * (p.beam + 0.1), -0.15, -2.42);
      mouth.rotation.y = s * -0.15;
      g.add(mouth);
    }
  }
  const span = p.span;
  const lead = p.lead; // leading-edge z at root
  const trail = p.trail; // trailing-edge z at root
  const tipLead = p.tipLead; // leading-edge z at tip
  const tipTrail = p.tipTrail; // trailing-edge z at tip
  // The main wing's section numbers, shared by the airfoil and by the
  // 3D surface strips below so the strips sit exactly on the skin.
  // Round 14: camber 0.06 -> 0.085 — the user wants a wing with a real
  // curve ("lekukan"), not a flat board; the deeper camber reads as a
  // curved top surface from behind instead of one flat-lit plate.
  const wParams = {
    span, le: lead, te: trail, leTip: tipLead, teTip: tipTrail,
    thickRoot: 0.21, thickTip: 0.11, camber: 0.085, dihedral: 0.14,
  };
  // Near-black seam material for the 3D wing strips: darker than any
  // airframe's own dark (Kawasemi's dark green would vanish on a green
  // wing), so the hinge/seam lines read on every colour, day and night.
  const seamMat = plate(mat(0x14161a, { metalness: 0.4, roughness: 0.6 }));
  const airfoil = (opts) => new THREE.Mesh(airfoilGeometry(opts), opts.mat);
  for (const s of [-1, 1]) {
    // Main swept wing: a real airfoil, thick at the root, thin and sharp at
    // the tip, slight dihedral. Round 8: thicker again (21% root) and more
    // cambered (0.06) with a stronger V (dihedral 0.14) — from directly
    // behind, the old thin flat wing read as a green board; the V and the
    // curved top now catch the sun unevenly, and the thicker section puts
    // a real shadow under the trailing edge.
    const wing = airfoil({ ...wParams, mat: wingP });
    if (s < 0) wing.scale.x = -1;
    g.add(wing);
    // Round 14 — 3D wing seams: texture lines alone wash out from
    // behind, so three ribbons hug the wing top surface: a dark
    // flap/aileron hinge strip at 72% chord (the control-surface break
    // every real jet shows), a panel seam at 38% chord, and a thin
    // accent livery stripe along the leading edge. Real geometry, so
    // they catch light and shadow from the chase view at any time of day.
    const hinge = wingStrip(wParams, 0.67, 0.77, seamMat);
    if (s < 0) hinge.scale.x = -1;
    g.add(hinge);
    const seam = wingStrip(wParams, 0.355, 0.405, seamMat);
    if (s < 0) seam.scale.x = -1;
    g.add(seam);
    const leStripe = wingStrip(wParams, 0.03, 0.09, accentP);
    if (s < 0) leStripe.scale.x = -1;
    g.add(leStripe);
    // Vortex generators: a row of tiny fins on the wing top near the
    // leading edge, like the real jet's — small hard details that break
    // the flat slab and read as fighter hardware from behind.
    for (const fs of [0.3, 0.4, 0.5, 0.6, 0.7]) {
      const vgTop = wingTopY(fs, 0.18, wParams);
      const vg = finPanel([[-0.18, 0], [0, 0.16], [0.18, 0]], 0.03, darkP);
      vg.position.set(s * fs * span, vgTop.y + 0.01, vgTop.z);
      g.add(vg);
    }
    // Wingtip rail + wing fence: hard details that stop the wing reading
    // as a flat board from behind (round-6 day shot). The rail is a real
    // jet's missile rail at the tip; the fence is a boundary-layer fence
    // on the wing top — both break the flat slab silhouette. Round 8:
    // rail thickened again (0.24 -> 0.30, taller 0.22 -> 0.30) and the
    // tip plate taller (0.45 -> 0.75) — from directly behind it is the
    // one vertical feature that breaks the wing's flat horizontal slab
    // line, and it was still too small to read at shot distance.
    const tipChord = tipTrail - tipLead;
    const rail = box(0.30, 0.30, tipChord + 0.5, dark, s * (span + 0.03), 0.14 * span + 0.06, (tipLead + tipTrail) / 2);
    g.add(rail);
    const tipPlate = finPanel([[-0.8, 0], [0, 0.75], [0.8, 0]], 0.05, darkP);
    tipPlate.position.set(s * (span + 0.04), 0.14 * span + 0.12, (tipLead + tipTrail) / 2);
    g.add(tipPlate);
    // Round 14 — wingtip missile on the rail's outboard edge: a slim dark
    // body with an accent nose, like a real jet's tip-mounted AAM. Mounted
    // clear of the tip plate (x = span + 0.18, radius 0.08) so it reads as
    // a separate weapon, not a skewer through the plate. From behind it is
    // the one horizontal hard shape at the very tip — the wing no longer
    // ends in a bare flat edge.
    const missile = cyl(0.08, 0.08, 2.6, dark, s * (span + 0.18), 0.14 * span + 0.32, (tipLead + tipTrail) / 2 + 0.1, 8);
    missile.rotation.x = Math.PI / 2;
    g.add(missile);
    const missileNose = cone(0.08, 0.35, accent, s * (span + 0.18), 0.14 * span + 0.32, (tipLead + tipTrail) / 2 - 1.38, 8);
    missileNose.rotation.x = -Math.PI / 2;
    g.add(missileNose);
    const fsF = 0.55;
    const leF = lead + (tipLead - lead) * fsF;
    const chordF = (trail - lead) + ((tipTrail - tipLead) - (trail - lead)) * fsF;
    const fence = finPanel([[-0.45, 0], [0, 0.5], [0.45, 0]], 0.05, darkP);
    fence.position.set(s * span * fsF, 0.14 * fsF * span + 0.12, leF + 0.45 * chordF);
    g.add(fence);
    // LERX: the blended leading-edge extension that joins the wing root to
    // the fuselage, like the reference jet — without it the wing reads as
    // a flat slab bolted onto a tube.
    const lerx = airfoil({
      span: span * 0.34, le: lead - 1.7, te: trail - 0.6,
      leTip: lead - 0.2, teTip: trail - 0.2,
      thickRoot: 0.1, thickTip: 0.08, camber: 0.02, dihedral: 0.02, mat: wingP,
      from: 0.55, to: 1,
    });
    if (s < 0) lerx.scale.x = -1;
    g.add(lerx);
    // Accent wingtip cap: a thin slice of the same airfoil in the accent
    // colour (was 0.82-1.0 — a fat coloured tip read as a toy's paint job).
    const tip = airfoil({ ...wParams, from: 0.9, to: 1, mat: tipP });
    if (s < 0) tip.scale.x = -1;
    g.add(tip);
    // Canard near the nose, same airfoil family, thinner. Body colour,
    // not accent: a bright accent canard reads as a toy's yellow tab
    // stuck on the nose (round-5 day shot).
    if (p.canard) {
      const canard = airfoil({
        span: span * 0.42, le: -4.6, te: -2.9, leTip: -3.4, teTip: -2.4,
        thickRoot: 0.09, thickTip: 0.06, camber: 0.02, dihedral: 0.1, mat: wingP,
      });
      if (s < 0) canard.scale.x = -1;
      g.add(canard);
    }
    // Twin canted tail fin: a vertical airfoil, not a flat plate — bigger
    // and more swept than round 4 (1.15 -> 1.45 tall). Small fins read as
    // cardboard; a real jet's tails dominate its rear silhouette.
    const fin = airfoil({
      span: 1.45, le: -2.8, te: 0.9, leTip: -0.9, teTip: -0.3,
      thickRoot: 0.13, thickTip: 0.06, camber: 0, mat: wingP,
    });
    fin.rotation.z = Math.PI / 2 - s * p.tailCant;
    fin.position.set(s * 1.0, 0.3, 4.6);
    g.add(fin);
  }
  // Horizontal stabilators at the tail, body colour like a real jet:
  // dark slabs read as heavy flat plates from behind.
  const stab = airfoil({
    span: span * 0.55, le: 3.4, te: 5.2, leTip: 4.4, teTip: 5.6,
    thickRoot: 0.10, thickTip: 0.07, camber: 0.02, dihedral: 0.15, mat: wingP,
  });
  g.add(stab);
  const stabL = stab.clone();
  stabL.scale.x = -1;
  g.add(stabL);
  // Twin engine nozzles at the tail, like the reference jet: two dark
  // metal cylinders with a black inner disc, set into the wide flat tail
  // deck. A single pointy tube tail is what made the old rear view read
  // as a toy rocket. Ootaka keeps its own twin engines from extras.
  // Tail station, shared by the nozzles below and the flame mouths
  // passed to finishModel: the flame must start exactly at the hole.
  const tailZ = p.sections[p.sections.length - 1][0];
  if (p.nozzles !== false) {
    const nozzleMat = mat(0x3a3d42, { metalness: 0.85, roughness: 0.32 });
    const innerMat = basic(0x070708);
    for (const s of [-1, 1]) {
      const nozzle = cyl(0.3, 0.36, 0.95, nozzleMat, s * 0.48, 0, tailZ + 0.2, 12);
      nozzle.rotation.x = Math.PI / 2;
      g.add(nozzle);
      const mouth = new THREE.Mesh(
        new THREE.CircleGeometry(0.28, 12), innerMat,
      );
      mouth.position.set(s * 0.48, 0, tailZ + 0.68);
      g.add(mouth);
      // Round 14 — gunmetal lip ring at the nozzle mouth: the exhaust
      // reads as a real petalled nozzle with a defined rim, not a smooth
      // tube ending in a black disc.
      const lipRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.31, 0.045, 8, 20), nozzleMat,
      );
      lipRing.position.set(s * 0.48, 0, tailZ + 0.66);
      g.add(lipRing);
    }
  }
  // Round 14 — chaff/flare dispensers: small dark blocks under the tail
  // deck between the nozzles — visible from behind, another hard fighter
  // detail. Half-sunk into the belly so they read as mounted, not floating.
  for (const s of [-1, 1]) {
    const dispenser = box(0.16, 0.12, 0.55, dark, s * 0.3, -0.35, 5.8);
    g.add(dispenser);
  }
  if (p.extras) p.extras(g, { main, accent, tip: tipMat, dark, glass });
  // Flame mouths: [x, mouthZ, mouthRadius] per nozzle. Ootaka builds its
  // own bigger nozzles in extras and stashes them on userData; the rest
  // use the twin standard nozzles above; the last fallback keeps a sane
  // flame if a future craft forgets both.
  const nozzleFlames = g.userData.nozzleFlames || (p.nozzles !== false
    ? [[-0.48, tailZ + 0.68, 0.30], [0.48, tailZ + 0.68, 0.30]]
    : [[-0.48, p.length / 2 + 0.7, 0.30], [0.48, p.length / 2 + 0.7, 0.30]]);
  return finishModel(g, {
    span: span * 2 + 0.4, length: p.length, edge: p.edge,
    accent: p.accent, beam: p.beam, dihedral: 0.14, nozzles: nozzleFlames,
  });
}

function noseCone(r, h, material, z) {
  const nose = cone(r, h, material, 0, 0, z, 8);
  nose.rotation.x = -Math.PI / 2;
  return nose;
}

// Row 1 right: green angular swept-wing interceptor, yellow wingtips.
function buildKawasemi() {
  return buildFighter({
    sections: [
      [-8.2, 0.04, 0.034, -0.06], [-7.4, 0.22, 0.153, -0.06], [-6.4, 0.38, 0.272, -0.06],
      [-5.2, 0.52, 0.374, -0.06], [-4.0, 0.62, 0.442, -0.05], [-3.0, 0.70, 0.51, -0.01],
      [-2.2, 0.74, 0.64, 0.08], [-1.2, 0.78, 0.68, 0.1], [-0.2, 0.82, 0.74, 0.06],
      [0.8, 0.84, 0.76, 0.02], [2.0, 0.80, 0.72, 0], [3.4, 0.72, 0.64, 0],
      [4.8, 0.62, 0.50, 0], [6.0, 0.62, 0.34, 0], [6.6, 0.55, 0.28, 0],
    ],
    main: 0x2a8a38, accent: 0xf2c230, tip: 0xf2c230, dark: 0x1e5c26,
    glass: 0x1a2a3a, edge: 0x14301a, beam: 0.85, length: 14.6,
    span: 6.0, lead: -1.6, trail: 2.6, tipLead: 1.4, tipTrail: 3.2,
    canard: true, tailCant: 0.32, exp: 2.7,
    extras(g, m) {
      // White spine panel down the back, like the reference sheet's livery.
      // Narrow in round 6: the old 0.5-wide box read as a flat white plank
      // laid on the fuselage from behind.
      const spine = box(0.36, 0.10, 6.0, mat(0xeef2ea), 0, 0.73, 1.2);
      spine.name = 'spineTop'; // hidden in cockpit view: it sits under the camera
      g.add(spine);
      const noseTip = noseCone(0.22, 1.6, mat(0x1e5c26), -7.6);
      g.add(noseTip);
    },
  });
}

// Row 2 centre: big red heavy fighter, wide intakes, twin engines.
function buildOotaka() {
  return buildFighter({
    sections: [
      [-8.0, 0.05, 0.043, -0.06], [-7.2, 0.3, 0.221, -0.06], [-6.2, 0.5, 0.374, -0.06],
      [-4.8, 0.72, 0.527, -0.06], [-3.4, 0.9, 0.663, -0.04], [-2.2, 1.0, 0.86, 0.06],
      [-1.0, 1.08, 0.94, 0.07], [0.2, 1.12, 0.98, 0.04], [1.4, 1.1, 0.96, 0],
      [2.8, 1.02, 0.88, 0], [4.2, 0.9, 0.78, 0], [5.4, 0.74, 0.62, 0],
      [6.4, 0.62, 0.40, 0], [6.8, 0.55, 0.30, 0],
    ],
    main: 0xc22e2e, accent: 0xe8e4da, tip: 0xe8e4da, dark: 0x2a2a2e,
    glass: 0x1a2a3a, edge: 0x2a0d0d, beam: 1.14, length: 14.6,
    span: 6.4, lead: -1.8, trail: 3.0, tipLead: 0.6, tipTrail: 3.4,
    canard: false, tailCant: 0.18, intakes: false, nozzles: false, exp: 2.7,
    extras(g, m) {
      // Ootaka's own twin nozzles (nozzles: false above): mouths at
      // z = 7.5, radius 0.55 — the flames must start here, not at the
      // standard ±0.48 mouths.
      g.userData.nozzleFlames = [[-0.85, 7.5, 0.55], [0.85, 7.5, 0.55]];
      for (const s of [-1, 1]) {
        // Intakes hugging the fuselage flanks, not boxes sticking out.
        const intake = box(1.0, 1.3, 3.6, m.dark, s * 1.05, -0.3, -1.0);
        g.add(intake);
        const intakeLip = box(1.04, 0.16, 3.6, m.main, s * 1.05, 0.38, -1.0);
        g.add(intakeLip);
        // Round 14 — black mouth, like the shared intakes: a deep hole,
        // not a dark box.
        const mouth = box(0.85, 1.1, 0.08, basic(0x050506), s * 1.05, -0.3, -2.82);
        g.add(mouth);
        const engine = cyl(0.72, 0.82, 3.6, m.dark, s * 0.85, 0, 5.4, 8);
        engine.rotation.x = Math.PI / 2;
        g.add(engine);
        const nozzle = cyl(0.55, 0.72, 1.0, mat(0x555560, { metalness: 0.7, roughness: 0.35 }), s * 0.85, 0, 7.0, 8);
        nozzle.rotation.x = Math.PI / 2;
        g.add(nozzle);
        // Round 14 — gunmetal lip ring at the big nozzle mouth.
        const lipRing = new THREE.Mesh(
          new THREE.TorusGeometry(0.58, 0.07, 8, 20),
          mat(0x555560, { metalness: 0.7, roughness: 0.35 }),
        );
        lipRing.position.set(s * 0.85, 0, 7.5);
        g.add(lipRing);
      }
      const belly = box(1.4, 0.3, 7.0, mat(0xe8e4da), 0, -1.0, 0.4);
      g.add(belly);
    },
  });
}

// Row 3 right: blue attack fighter with the long cannon pod underneath.
function buildOowashi() {
  return buildFighter({
    sections: [
      [-8.2, 0.04, 0.034, -0.06], [-7.4, 0.24, 0.17, -0.06], [-6.4, 0.4, 0.289, -0.06],
      [-5.2, 0.58, 0.425, -0.06], [-4.0, 0.68, 0.493, -0.05], [-3.0, 0.76, 0.561, -0.01],
      [-2.2, 0.8, 0.7, 0.08], [-1.2, 0.84, 0.74, 0.1], [-0.2, 0.88, 0.78, 0.06],
      [0.8, 0.88, 0.78, 0.02], [2.0, 0.84, 0.74, 0], [3.4, 0.76, 0.66, 0],
      [4.8, 0.62, 0.54, 0], [6.0, 0.60, 0.34, 0], [6.6, 0.52, 0.28, 0],
    ],
    main: 0x2e6fd8, accent: 0xe8e8ec, tip: 0xe8e8ec, dark: 0x22242c,
    glass: 0x1a2a3a, edge: 0x0e1e3a, beam: 0.92, length: 14.6,
    span: 6.1, lead: -1.7, trail: 2.8, tipLead: 0.9, tipTrail: 3.3,
    canard: true, tailCant: 0.26, exp: 2.7,
    extras(g, m) {
      // The cannon pod: the silhouette that makes this one unmistakable.
      const pod = cyl(0.55, 0.55, 7.5, m.dark, 0, -1.25, -0.5, 10);
      pod.rotation.x = Math.PI / 2;
      g.add(pod);
      const muzzle = cyl(0.28, 0.34, 2.0, m.dark, 0, -1.25, -5.0, 8);
      muzzle.rotation.x = Math.PI / 2;
      g.add(muzzle);
      const top = box(0.5, 0.18, 7.6, mat(0xf0f2f8), 0, 0.78, 0.4);
      top.name = 'spineTop'; // hidden in cockpit view: it sits under the camera
      g.add(top);
    },
  });
}

// Row 4 right: all-black stealth needle, faceted diamond hull, long sharp nose.
function buildHayabusa() {
  return buildFighter({
    sections: [
      [-9.6, 0.03, 0.025, -0.06], [-8.6, 0.18, 0.128, -0.06], [-7.4, 0.32, 0.23, -0.06],
      [-6.0, 0.44, 0.323, -0.06], [-4.6, 0.54, 0.383, -0.05], [-3.4, 0.6, 0.425, -0.02],
      [-2.2, 0.64, 0.53, 0.06], [-1.0, 0.68, 0.56, 0.07], [0.2, 0.68, 0.56, 0.04],
      [1.6, 0.64, 0.52, 0], [3.0, 0.56, 0.46, 0], [4.4, 0.46, 0.38, 0],
      [5.6, 0.50, 0.26, 0], [6.6, 0.45, 0.22, 0],
    ],
    radial: 4,
    matOpts: { flatShading: true, metalness: 0.5, roughness: 0.45 },
    main: 0x2e323e, accent: 0x8a1f1f, tip: 0x8a1f1f, dark: 0x0e0f13,
    glass: 0x0a1218, edge: 0x8a93a8, beam: 0.72, length: 16.2,
    span: 5.8, lead: -1.2, trail: 3.0, tipLead: 2.2, tipTrail: 3.6,
    canard: false, tailCant: 0.45,
    extras(g, m) {
      // Red leading-edge strips on the delta wings: the only bright lines
      // on the airframe, and what makes it readable at night.
      for (const s of [-1, 1]) {
        const edge = box(0.16, 0.1, 4.4, basic(0xff3b30), s * 4.6, 0.05, 0.6);
        edge.rotation.y = s * -0.62;
        g.add(edge);
      }
      const spine = box(0.3, 0.42, 6.5, m.dark, 0, 0.66, 1.5);
      spine.name = 'spineTop'; // hidden in cockpit view: it sits under the camera
      g.add(spine);
    },
  });
}

// Row 3 centre: white dart with the long purple nose spike.
// Cool white, low metalness: the dusk sun is orange and a mirror-gloss
// white turns tan under it. Matte cool white stays white at golden hour.
function buildTsuru() {
  return buildFighter({
    sections: [
      [-8.0, 0.04, 0.034, -0.06], [-7.2, 0.2, 0.145, -0.06], [-6.2, 0.36, 0.264, -0.06],
      [-5.0, 0.48, 0.357, -0.06], [-3.8, 0.58, 0.425, -0.05], [-2.8, 0.64, 0.56, 0.05],
      [-2.0, 0.66, 0.58, 0.08], [-1.0, 0.7, 0.62, 0.09], [0.0, 0.72, 0.64, 0.06],
      [1.0, 0.72, 0.64, 0.02], [2.2, 0.68, 0.6, 0], [3.6, 0.6, 0.52, 0],
      [5.0, 0.48, 0.42, 0], [6.0, 0.52, 0.30, 0], [6.5, 0.46, 0.24, 0],
    ],
    // Round 6: env 0.30 -> 0.15, metalness 0.28 -> 0.18, cooler base —
    // the round-5 landing shot still washed pink from the orange dusk
    // env map + sun on the white paint.
    matOpts: { metalness: 0.22, roughness: 0.52, envMapIntensity: 0.22 },
    main: 0xdfe6ff, accent: 0x9b59d0, tip: 0x9b59d0, dark: 0x2a2a2e,
    glass: 0x1a2a3a, edge: 0x3a2a4a, beam: 0.74, length: 14.4,
    span: 5.9, lead: -1.8, trail: 2.6, tipLead: 1.0, tipTrail: 3.1,
    canard: true, tailCant: 0.3, exp: 2.6,
    extras(g, m) {
      // The long purple spike that makes this one unmistakable.
      const spike = cyl(0.09, 0.2, 4.8, mat(0x9b59d0), 0, 0, -9.6, 6);
      spike.rotation.x = Math.PI / 2;
      g.add(spike);
      const spikeTip = noseCone(0.09, 1.2, mat(0x7a3fb0), -12.4);
      g.add(spikeTip);
      const stripe = box(0.22, 0.1, 8.0, mat(0x9b59d0), 0, 0.66, 0.2);
      stripe.name = 'spineTop'; // hidden in cockpit view: it sits under the camera
      g.add(stripe);
    },
  });
}

const BUILDERS = {
  kawasemi: buildKawasemi,
  ootaka: buildOotaka,
  oowashi: buildOowashi,
  hayabusa: buildHayabusa,
  tsuru: buildTsuru,
};

// Build the model for an aircraft id. Returns { group, burner, gear, strobe }.
export function buildAircraftModel(kind) {
  const build = BUILDERS[kind] || BUILDERS.kawasemi;
  return build();
}

