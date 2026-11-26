// The archipelago: one height function shared by the mesh, the physics and the
// altimeter, so what you see is exactly what you can hit. Islands rise out of
// a blue sea, a shallow lagoon rings the main island, beaches give way to
// forest and rock. Two runways are flattened into the hills.
import * as THREE from 'three';
import { AIRFIELDS } from './config.js';
import { createNoise2D, createRandom } from './random.js';

const ISLANDS = [
  { x: 0, z: 0, radius: 2600, peak: 230, name: 'Merpati' },
  { x: 4200, z: -2600, radius: 1700, peak: 175, name: 'Kenari' },
  { x: -3200, z: -1800, radius: 1300, peak: 150, name: 'Kawasemi' },
  { x: 2400, z: 1800, radius: 600, peak: 60, name: 'Islet A' },
  { x: -1800, z: 2400, radius: 500, peak: 45, name: 'Islet B' },
  { x: 5200, z: 800, radius: 700, peak: 80, name: 'Islet C' },
];

const noise = createNoise2D(1234);

function smoothstep(a, b, t) {
  const s = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return s * s * (3 - 2 * s);
}

// Height in metres at world (x, z). Sea level is 0; the seabed sits near -14.
export function heightAt(x, z) {
  let h = -14;
  for (const island of ISLANDS) {
    const dx = x - island.x;
    const dz = z - island.z;
    // Irregular coastline: the island radius varies with angle (two lobes
    // plus smooth noise), so no island is ever a circle. Without this the
    // whole archipelago reads as a set of flat discs from the air.
    const ang = Math.atan2(dz, dx);
    const wob = 1
      + 0.2 * Math.sin(ang * 2 + island.x * 0.01 + island.z * 0.007)
      + 0.14 * Math.sin(ang * 3 + island.z * 0.013)
      + 0.18 * (noise(Math.cos(ang) * 1.6 + island.x * 0.013, Math.sin(ang) * 1.6 + island.z * 0.017) - 0.5) * 2;
    const r = island.radius * wob;
    const ddx = dx / r;
    const ddz = dz / r;
    const d2 = ddx * ddx + ddz * ddz;
    if (d2 >= 1) continue;
    const fall = Math.pow(1 - d2, 1.4);
    const rough = (noise(x * 0.0011 + 7, z * 0.0011 - 3) - 0.5) * 2;
    const rough2 = (noise(x * 0.0038 + 31, z * 0.0038 + 17) - 0.5) * 2;
    // Broad ridge: one big hill system per island, so the island is not a
    // flat-topped disc — the silhouette breaks against the sky. Steeper in
    // round 4 (reference: green mountains, not gentle bumps), with a second
    // crag octave; the approach valley still only lowers terrain, so the
    // ridges never block the final.
    const ridge = (noise(x * 0.0006 + 99, z * 0.0006 + 55) - 0.5) * 2;
    const ridge2 = (noise(x * 0.0016 + 7, z * 0.0016 + 3) - 0.5) * 2;
    h += island.peak * fall + rough * 38 * fall + rough2 * 14 * fall * fall
      + island.peak * 0.42 * ridge * fall * fall
      + island.peak * 0.15 * ridge2 * fall * fall;
  }
  // Flatten the ground under each runway so a landing is possible, and level
  // a broad coastal shelf around each field so takeoffs head over flat ground.
  for (const field of Object.values(AIRFIELDS)) {
    const rad = (field.headingDeg * Math.PI) / 180;
    const dx = x - field.x;
    const dz = z - field.z;
    const along = dx * Math.sin(rad) - dz * Math.cos(rad);
    const across = dx * Math.cos(rad) + dz * Math.sin(rad);
    const margin = 90;
    if (Math.abs(along) < field.length / 2 + margin && Math.abs(across) < field.width / 2 + margin) {
      const edge = Math.max(
        Math.abs(along) - field.length / 2,
        Math.abs(across) - field.width / 2,
      );
      const blend = 1 - smoothstep(0, margin, Math.max(0, edge));
      h = h * (1 - blend) + field.elevation * blend;
    }
    const dist = Math.hypot(dx, dz);
    if (dist < 900) {
      // A flat coastal plain at field elevation, so the runway, hangar and
      // camera all sit on the same ground instead of in a trench.
      const blend = 1 - smoothstep(600, 900, dist);
      h = h * (1 - blend) + field.elevation * blend;
    }
    // Approach valley: a gentle valley along the final-approach path, so the
    // autopilot (and a human pilot) can descend on the 6% glidepath without
    // the island ridge blocking the way. The valley floor rises 2% with
    // distance from the threshold, staying well below the glidepath, and
    // blends smoothly into the surrounding hills so it reads as a river
    // valley, not a trench. It only LOWERS terrain, never raises it, so the
    // sea and lagoon stay water.
    if (along < 0 && along > -2500 && Math.abs(across) < 350) {
      const valleyFloor = field.elevation + (-along) * 0.02;
      if (h > valleyFloor) {
        const acrossBlend = 1 - smoothstep(150, 350, Math.abs(across));
        const alongBlend = 1 - smoothstep(1800, 2500, -along);
        const blend = Math.min(acrossBlend, alongBlend);
        h = h * (1 - blend) + valleyFloor * blend;
      }
    }
  }
  return h;
}

function groundColor(height, slope, x, z) {
  const jitter = (noise(x * 0.01, z * 0.01) - 0.5) * 0.12;
  // Patchy cover: forest clusters and dry-grass meadows break the flat green.
  const forest = noise(x * 0.0009 + 51, z * 0.0009 + 13);
  const dry = noise(x * 0.0016 + 91, z * 0.0016 + 47);
  // Coral / reef mottling in the shallows: darker teal patches and pale
  // sand bars, like the Aitutaki lagoon reference — the seabed colour is
  // what makes the water read shallow near shore and deep further out.
  const coral = noise(x * 0.004 + 7, z * 0.004 + 3);
  const mix3 = (a, b, t) => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
  // Height zones BLEND into each other over metres, never hard steps:
  // hard vertex-colour steps on 40 m triangles are what drew the angular
  // shards in the shallows in round 3 — seen through the transparent sea
  // at grazing angles they read as broken glass.
  // Underwater seabed: dark, so the shallows do not blaze pale grey
  // through the sea at grazing angles (the round-4 wedge). The aqua
  // lagoon look comes from the shallow disc + lagoon ring, not the sand.
  // Round 6: the wedge was STILL there in round 5 — the pale sand-bar
  // mottle below was applied to the deep seabed too (height < 0.6 with
  // no lower bound), so big pale patches showed through the sea. The
  // mottle is now restricted to real shallows (height > -6), and DEEP /
  // LAGOON are darker still.
  const DEEP = [0.16, 0.16, 0.14];
  const LAGOON = [0.26, 0.30, 0.26];
  const WET = [0.6, 0.56, 0.44];
  const BEACH = [0.9, 0.88, 0.8];
  const MEADOW = [0.15, 0.36, 0.11];
  const FOREST = [0.07, 0.22, 0.09];
  const ROCK = [0.42, 0.38, 0.33];
  const PEAK = [0.72, 0.7, 0.66];
  let c;
  if (height < -6) c = DEEP;
  else if (height < -1) c = mix3(DEEP, LAGOON, smoothstep(-6, -1, height));
  else if (height < 1.5) c = mix3(LAGOON, WET, smoothstep(-1, 1.5, height));
  else if (height < 7) c = mix3(WET, BEACH, smoothstep(1.5, 7, height));
  else if (height < 60) c = mix3(BEACH, MEADOW, smoothstep(7, 60, height));
  else if (height < 130) c = mix3(MEADOW, FOREST, smoothstep(60, 130, height));
  else if (height < 180) c = mix3(FOREST, ROCK, smoothstep(130, 180, height));
  else c = mix3(ROCK, PEAK, smoothstep(180, 210, height));
  let [r, g, b] = c;
  // Coral heads and sand bars in the shallows ONLY (height > -6): on the
  // deep seabed they read as pale grey wedges through the transparent sea
  // at grazing angles (round-6 diagnosis: terrain hidden -> wedge gone).
  if (height > -6 && height < 0.6) {
    const w = 1 - smoothstep(0.2, 0.6, height);
    if (coral > 0.62) {
      const t = smoothstep(0.62, 0.75, coral) * w;
      [r, g, b] = mix3([r, g, b], [0.32, 0.52, 0.48], t);
    } else if (coral < 0.34) {
      const t = smoothstep(0.34, 0.22, coral) * w;
      [r, g, b] = mix3([r, g, b], [0.72, 0.78, 0.68], t);
    }
  }
  // Forest and dry-grass patches on the green slopes, blended on noise.
  if (height >= 7 && height < 130) {
    if (forest > 0.62) {
      const t = smoothstep(0.62, 0.72, forest);
      [r, g, b] = mix3([r, g, b], [0.06, 0.22, 0.08], t);
    } else if (dry > 0.66) {
      const t = smoothstep(0.66, 0.76, dry);
      [r, g, b] = mix3([r, g, b], [0.48, 0.5, 0.2], t);
    }
  }
  // Cliffs: steep slopes blend to rock, so mountain faces read as rock,
  // not as a green sheet sliced by a hard line.
  if (slope > 0.45 && height > 7) {
    const t = smoothstep(0.45, 0.8, slope);
    [r, g, b] = mix3([r, g, b], [0.44, 0.4, 0.35], t);
  }
  const f = 1 + jitter;
  return [Math.min(1, r * f), Math.min(1, g * f), Math.min(1, b * f)];
}

// Fine speckle so the ground is not a flat colour at close range: a mottled
// canvas texture multiplied over the vertex-colour zones.
function groundDetailTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 512, 512);
  const dots = ['#e8e8e8', '#d5d5d5', '#c2c2c2', '#efefef', '#b8c4a8', '#a8b898'];
  for (let i = 0; i < 12000; i += 1) {
    ctx.fillStyle = dots[(Math.random() * dots.length) | 0];
    ctx.globalAlpha = 0.16 + Math.random() * 0.25;
    const r = 1 + Math.random() * 3.5;
    ctx.beginPath();
    ctx.arc(Math.random() * 512, Math.random() * 512, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Short grass-grain strokes, so close ground reads as vegetation grain,
  // not just dots.
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 2600; i += 1) {
    ctx.strokeStyle = Math.random() < 0.5 ? 'rgba(120,140,90,0.35)' : 'rgba(90,110,70,0.35)';
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const a = Math.random() * Math.PI;
    const len = 4 + Math.random() * 8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  // Fine grain: at 90 repeats over 12 km each tile is ~130 m, so the
  // speckle reads as grass grain at landing-shot range instead of a flat
  // green carpet. (Was 28: tiles 430 m, dots blurred into nothing.)
  texture.repeat.set(90, 90);
  texture.anisotropy = 8;
  return texture;
}

function buildTerrainMesh() {
  const size = 12000;
  const segments = 300;
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const slope = Math.max(
      Math.abs(heightAt(x + 30, z) - h),
      Math.abs(heightAt(x, z + 30) - h),
    ) / 30;
    const [r, g, b] = groundColor(h, slope, x, z);
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  // Smooth shading on purpose now: full 3D, not the old flat-shaded look.
  // The vertex-colour zones + speckle texture carry the detail.
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true, map: groundDetailTexture(),
    roughness: 0.95, metalness: 0,
  });
  return new THREE.Mesh(geometry, material);
}

// Moving wave streaks on the sea: a tiled canvas texture whose offset the
// renderer scrolls each frame, plus the sun's specular glint.
function seaWaveTexture() {
  const S = 512;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, S, S);
  // Broad swell mottling: big soft light/dark patches, like the aerial
  // ocean reference — multi-scale mottling, not a flat blue sheet.
  for (let i = 0; i < 16; i += 1) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const r = 60 + Math.random() * 140;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    const light = Math.random() < 0.5;
    grad.addColorStop(0, light ? 'rgba(200,235,255,0.10)' : 'rgba(10,60,110,0.08)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Fine foam lace: thin filaments at random angles, like the white lace
  // network on the aerial ocean photo — kept faint, close-range bright
  // streaks read as scratches on the water.
  ctx.strokeStyle = 'rgba(180,220,255,0.16)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 50; i += 1) {
    ctx.beginPath();
    const x = Math.random() * S;
    const y = Math.random() * S;
    const ang = Math.random() * Math.PI;
    const len = 40 + Math.random() * 90;
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(
      x + Math.cos(ang) * len * 0.3, y + Math.sin(ang) * len * 0.3 - 10 + Math.random() * 20,
      x + Math.cos(ang) * len * 0.7, y + Math.sin(ang) * len * 0.7 - 10 + Math.random() * 20,
      x + Math.cos(ang) * len, y + Math.sin(ang) * len,
    );
    ctx.stroke();
  }
  // Round 13b — directional swell streaks: long foam lines along the wave
  // crests, all sharing one angle so the sea reads as moving water with a
  // flow direction instead of flat glass. The angle (110 deg in texture
  // space) is the crest line for waves travelling toward heading 70 deg
  // (the same wind the windsock points to): heading 0 is -z, so travel
  // toward 70 deg is texture direction (0.94, 0.34), angle ~20 deg, and
  // the crest runs perpendicular to it at 110 deg. Slight bow + jitter
  // so they read as wave crests, not ruler lines; alpha clearly above
  // the faint lace so they survive at chase distance, but thin enough
  // not to turn the sea noisy.
  // Second attempt: the first pass used only LIGHT streaks, and light
  // on a white base barely changes the colour map (a few percent) —
  // the day sea still read as flat glass; only the low dusk sun caught
  // them through the bump map. Now light and dark streaks alternate:
  // dark trough lines give ~20% colour contrast at day, light crests
  // keep the glint. Both share the crest angle.
  const swellAng = (110 * Math.PI) / 180;
  for (let i = 0; i < 60; i += 1) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const ang = swellAng + (Math.random() - 0.5) * 0.28;
    const len = 120 + Math.random() * 100;
    const bow = (Math.random() - 0.5) * 26;
    const px = -Math.sin(ang);
    const py = Math.cos(ang);
    const dark = i % 2 === 0;
    ctx.lineWidth = dark ? 3 : 2.5;
    ctx.strokeStyle = dark
      ? `rgba(8,45,95,${0.2 + Math.random() * 0.08})`
      : `rgba(190,225,255,${0.22 + Math.random() * 0.08})`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(
      x + Math.cos(ang) * len * 0.33 + px * bow, y + Math.sin(ang) * len * 0.33 + py * bow,
      x + Math.cos(ang) * len * 0.66 + px * bow, y + Math.sin(ang) * len * 0.66 + py * bow,
      x + Math.cos(ang) * len, y + Math.sin(ang) * len,
    );
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.20)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 90; i += 1) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 14 + Math.random() * 26, y + (Math.random() - 0.5) * 7);
    ctx.stroke();
  }
  for (let i = 0; i < 140; i += 1) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const r = 2 + Math.random() * 8;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(255,255,255,${0.1 + Math.random() * 0.22})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(64, 64);
  texture.anisotropy = 8;
  return texture;
}

function buildSea() {
  // Round 6: 24000 -> 40000 wide, so the plane's far edge sits past the
  // fog (far 10000) and past the sky sphere (10000) — the old edge drew a
  // thin black line at the horizon in the dusk cockpit shot. Texture
  // repeat 100 keeps the wave tiles ~400 m like before.
  const geometry = new THREE.PlaneGeometry(40000, 40000);
  geometry.rotateX(-Math.PI / 2);
  const wave = seaWaveTexture();
  wave.repeat.set(100, 100);
  // envMapIntensity 0: the sea reads deep blue like the aerial reference
  // instead of a milky sky sheen. (The round-4 pale wedge was the shore
  // rings, not the env map — diagnosed by hiding the rings.)
  const material = new THREE.MeshPhongMaterial({
    color: 0x0e4f86, transparent: true, opacity: 0.94,
    shininess: 260, specular: 0xbfe0ff, map: wave,
    bumpMap: wave, bumpScale: 0.9, envMapIntensity: 0,
  });
  const sea = new THREE.Mesh(geometry, material);
  sea.position.y = 0;
  sea.receiveShadow = true; // the aircraft shadow lands on the water
  return sea;
}

// Soft pale shallows around each island: a radial-gradient disc (white sand
// fading to nothing) so the water reads depth-graded like the Aitutaki
// reference — aqua near the beach, deep blue further out.
function shallowDiscTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(128, 128, 60, 128, 128, 128);
  grad.addColorStop(0, 'rgba(190,235,225,0.45)');
  grad.addColorStop(0.4, 'rgba(120,205,215,0.25)');
  grad.addColorStop(0.7, 'rgba(60,170,200,0.08)');
  grad.addColorStop(1, 'rgba(40,150,190,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(canvas);
}

// A ring whose radius wobbles with angle (two noise octaves), so the
// lagoon and surf never draw a perfect circle around the island — perfect
// circles are what made the island read as a flat disc from the air.
function irregularRingGeometry(inner, outer, segments, wobble, seed) {
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= segments; i += 1) {
    const a = (i / segments) * Math.PI * 2;
    const w1 = 1 + wobble * (noise(Math.cos(a) * 1.6 + seed, Math.sin(a) * 1.6 + seed * 1.7) - 0.5) * 2;
    const w2 = 1 + wobble * 0.8 * (noise(Math.cos(a) * 3.3 + seed * 2.3, Math.sin(a) * 3.3 + seed) - 0.5) * 2;
    positions.push(Math.cos(a) * inner * w1, 0, Math.sin(a) * inner * w1);
    positions.push(Math.cos(a) * outer * w2, 0, Math.sin(a) * outer * w2);
    uvs.push(i / segments, 0, i / segments, 1);
  }
  for (let i = 0; i < segments; i += 1) {
    const a = i * 2;
    const b = i * 2 + 1;
    const c = i * 2 + 2;
    const d = i * 2 + 3;
    indices.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// An irregular shallow-water blob: a filled shape whose outline wobbles
// with angle, UV-mapped so a radial-gradient texture fades from pale aqua
// at the centre to nothing at the edge.
function irregularShallowGeometry(radius, seed) {
  const shape = new THREE.Shape();
  const N = 48;
  for (let i = 0; i <= N; i += 1) {
    const a = (i / N) * Math.PI * 2;
    const w = 1 + 0.22 * (noise(Math.cos(a) * 1.6 + seed, Math.sin(a) * 1.6 + seed * 1.7) - 0.5) * 2
      + 0.12 * Math.sin(a * 3 + seed);
    const x = Math.cos(a) * radius * w;
    const y = Math.sin(a) * radius * w;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  const geo = new THREE.ShapeGeometry(shape, 4);
  // UVs from shape coords so the radial gradient texture maps centre->edge.
  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i += 1) {
    uv[i * 2] = (pos.getX(i) / radius) * 0.5 + 0.5;
    uv[i * 2 + 1] = (pos.getY(i) / radius) * 0.5 + 0.5;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.rotateX(-Math.PI / 2);
  return geo;
}

// Foam gradient across the band: the ring geometry's v runs 0 at the
// inner (shore) edge to 1 at the outer edge. Round-10 fix: the old solid
// white band drew a hard-edged pale slab in the open water at grazing
// angles (shot 1 bottom-left, the foam ring around Merpati at 2444-2600 m
// seen nearly edge-on from 700 m). The fade keeps the surf line strong
// at the waterline and dissolves it outward, like real foam.
function foamBandTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  // Canvas row 0 is the TOP; with flipY, v=1 (outer edge) samples the top
  // and v=0 (inner/shore edge) samples the bottom — so alpha 0 goes at
  // the top of the canvas and alpha 1 at the bottom.
  const grad = ctx.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.2, 'rgba(255,255,255,0.12)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,1)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, 64);
  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

// Turquoise lagoon band + white surf rings around each island.
function buildShoreRings() {
  const group = new THREE.Group();
  const shallowTex = shallowDiscTexture();
  const foamTex = foamBandTexture();
  for (const island of ISLANDS) {
    const seed = island.x * 0.001 + island.z * 0.0013;
    const shallow = new THREE.Mesh(
      irregularShallowGeometry(island.radius * 1.1, seed),
      new THREE.MeshBasicMaterial({
        map: shallowTex, transparent: true, opacity: 0.15,
        depthWrite: false,
      }),
    );
    shallow.position.set(island.x, 0.6, island.z);
    group.add(shallow);
    const lagoon = new THREE.Mesh(
      irregularRingGeometry(island.radius * 1.0, island.radius * 1.15, 72, 0.16, seed),
      new THREE.MeshBasicMaterial({
        // Faint: the solid cyan ring at 0.26 drew a hard-edged pale wedge
        // in the open water at grazing angles (round-4 diagnosis). The
        // lagoon cue survives from the seabed + shallow disc.
        color: 0x2fd4e8, transparent: true, opacity: 0.1,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    lagoon.position.set(island.x, 0.5, island.z);
    group.add(lagoon);
    const foam = new THREE.Mesh(
      irregularRingGeometry(island.radius * 0.94, island.radius * 1.0, 72, 0.2, seed + 7),
      new THREE.MeshBasicMaterial({
        map: foamTex, color: 0xffffff, transparent: true, opacity: 0.25,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    foam.position.set(island.x, 0.4, island.z);
    group.add(foam);
    // Reef surf line far out: the thin white line at the reef edge in the
    // Aitutaki reference — it is what makes the lagoon read as a lagoon.
    const reef = new THREE.Mesh(
      irregularRingGeometry(island.radius * 1.5, island.radius * 1.62, 72, 0.12, seed + 13),
      new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.15,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    reef.position.set(island.x, 0.45, island.z);
    group.add(reef);
  }
  return group;
}

function runwayTexture(field) {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#33383e';
  ctx.fillRect(0, 0, 2048, 128);
  // Asphalt mottling: faint dark patches so the strip is not a flat slab.
  for (let i = 0; i < 60; i += 1) {
    const x = Math.random() * 2048;
    const y = Math.random() * 128;
    const r = 20 + Math.random() * 70;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(0,0,0,0.10)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#ffffff';
  for (let x = 80; x < 2048; x += 180) ctx.fillRect(x, 58, 92, 12); // centreline
  for (const y of [8, 112]) ctx.fillRect(0, y, 2048, 6); // edge lines
  // Touchdown zone: pairs of white bars on both approach ends, like a real
  // runway — the landing shot reads the strip as a real airport.
  for (const bx of [300, 480, 660]) {
    for (const y of [26, 92]) {
      ctx.fillRect(bx, y, 70, 12);
      ctx.fillRect(2048 - bx - 70, y, 70, 12);
    }
  }
  // Threshold piano keys at both ends.
  for (let i = 0; i < 8; i += 1) {
    ctx.fillRect(24, 8 + i * 15, 40, 9);
    ctx.fillRect(1984, 8 + i * 15, 40, 9);
  }
  ctx.fillStyle = '#f5f5f5';
  ctx.font = 'bold 68px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.save();
  ctx.translate(104, 64);
  ctx.rotate(Math.PI / 2);
  ctx.fillText(field.runwayName.slice(0, 2), 0, 0);
  ctx.restore();
  ctx.save();
  ctx.translate(1944, 64);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(field.runwayName.slice(5, 7), 0, 0);
  ctx.restore();
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 8;
  return texture;
}

function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 1, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

let sharedGlowTex = null;

function buildRunway(field) {
  // The group is rotated so local +X runs along the runway and local +Z is
  // right of the runway heading: rotation.y = 90 deg - heading.
  const group = new THREE.Group();
  group.rotation.y = ((90 - field.headingDeg) * Math.PI) / 180;
  group.position.set(field.x, field.elevation, field.z);
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(field.length, field.width),
    new THREE.MeshLambertMaterial({ map: runwayTexture(field) }),
  );
  strip.rotation.x = -Math.PI / 2;
  strip.position.y = 1.2;
  group.add(strip);
  // Edge lights: small warm lamps that matter at dusk. Each lamp also gets
  // a soft additive glow sprite, so the light pools on the ground at night
  // instead of reading as a flat yellow box.
  if (!sharedGlowTex) sharedGlowTex = glowTexture();
  const lampGeo = new THREE.BoxGeometry(1.6, 1.6, 1.6);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd27a });
  const lamps = [];
  const lampGlows = [];
  for (let d = -field.length / 2; d <= field.length / 2; d += 90) {
    for (const side of [-1, 1]) {
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(d, 1.8, side * (field.width / 2 + 3));
      group.add(lamp);
      lamps.push(lamp);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: sharedGlowTex, color: 0xffc070, transparent: true, opacity: 0.12,
        depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      glow.scale.set(7, 7, 1);
      glow.position.copy(lamp.position);
      group.add(glow);
      lampGlows.push(glow);
    }
  }
  // PAPI: four lamps beside the threshold; red/white by glidepath, set per frame.
  const papi = [];
  for (let i = 0; i < 4; i += 1) {
    const lamp = new THREE.Mesh(
      new THREE.BoxGeometry(3, 2, 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    lamp.position.set(-(field.length / 2 - 40), 2.0, field.width / 2 + 14 + i * 5);
    group.add(lamp);
    papi.push(lamp);
  }
  // Taxiway + apron + small field buildings, so the ground around the
  // runway is a working airfield, not an empty green carpet.
  const asphalt = new THREE.MeshLambertMaterial({ color: 0x3d4148 });
  const taxiTexCanvas = document.createElement('canvas');
  taxiTexCanvas.width = 512;
  taxiTexCanvas.height = 32;
  {
    const tctx = taxiTexCanvas.getContext('2d');
    tctx.fillStyle = '#4a4f55';
    tctx.fillRect(0, 0, 512, 32);
    tctx.fillStyle = '#e8c33a';
    for (let x = 0; x < 512; x += 42) tctx.fillRect(x, 14, 24, 4);
    tctx.fillStyle = '#d8d8d8';
    tctx.fillRect(0, 2, 512, 2);
    tctx.fillRect(0, 28, 512, 2);
  }
  const taxiTex = new THREE.CanvasTexture(taxiTexCanvas);
  taxiTex.wrapS = THREE.RepeatWrapping;
  taxiTex.repeat.set(12, 1);
  const taxiway = new THREE.Mesh(
    new THREE.PlaneGeometry(field.length * 0.85, 8),
    new THREE.MeshLambertMaterial({ map: taxiTex }),
  );
  taxiway.rotation.x = -Math.PI / 2;
  taxiway.position.set(0, 1.0, -(field.width / 2 + 34));
  group.add(taxiway);
  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 44), asphalt,
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(60, 1.0, field.width / 2 + 46);
  group.add(apron);
  const shedMat = new THREE.MeshLambertMaterial({ color: 0xcfc8b8 });
  const shedRoofMat = new THREE.MeshLambertMaterial({ color: 0x4a5a6a });
  for (const [bx, by, bz, bw, bh, bd] of [
    [110, 3, field.width / 2 + 62, 14, 6, 10],
    [140, 2.5, field.width / 2 + 44, 10, 5, 8],
  ]) {
    const shed = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), shedMat);
    shed.position.set(bx, by, bz);
    group.add(shed);
    const shedRoof = new THREE.Mesh(new THREE.BoxGeometry(bw + 1, 1, bd + 1), shedRoofMat);
    shedRoof.position.set(bx, by + bh / 2 + 0.5, bz);
    group.add(shedRoof);
  }
  const tank = new THREE.Mesh(
    new THREE.CylinderGeometry(4, 4, 8, 12),
    new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }),
  );
  tank.position.set(95, 4, field.width / 2 + 84);
  group.add(tank);
  const tankTop = new THREE.Mesh(
    new THREE.ConeGeometry(4, 2, 12),
    new THREE.MeshLambertMaterial({ color: 0xb03a2a }),
  );
  tankTop.position.set(95, 9, field.width / 2 + 84);
  group.add(tankTop);
  // Control tower: a shaft + glass cab, so the field has a landmark taller
  // than the hangars and reads as a working airport from the air.
  const towerMat = new THREE.MeshLambertMaterial({ color: 0xd8d3c8 });
  const towerGlass = new THREE.MeshStandardMaterial({
    color: 0x18242e, metalness: 0.7, roughness: 0.25,
    emissive: 0x2a3a2a, emissiveIntensity: 0.4,
  });
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 3.5, 24, 10), towerMat);
  tower.position.set(100, 12, field.width / 2 + 100);
  group.add(tower);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(11, 5, 11), towerGlass);
  cab.position.set(100, 26, field.width / 2 + 100);
  group.add(cab);
  const cabRoof = new THREE.Mesh(new THREE.BoxGeometry(12, 1, 12), shedRoofMat);
  cabRoof.position.set(100, 29, field.width / 2 + 100);
  group.add(cabRoof);
  // Small terminal with a glass window strip beside the apron.
  const terminal = new THREE.Mesh(new THREE.BoxGeometry(26, 9, 16), shedMat);
  terminal.position.set(150, 4.5, field.width / 2 + 60);
  group.add(terminal);
  const termGlass = new THREE.Mesh(new THREE.BoxGeometry(26.4, 2.5, 16.4), towerGlass);
  termGlass.position.set(150, 6.5, field.width / 2 + 60);
  group.add(termGlass);
  // Windsock on a pole near the threshold.
  const sock = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.25, 9, 6),
    new THREE.MeshLambertMaterial({ color: 0xdddddd }),
  );
  pole.position.y = 4.5;
  sock.add(pole);
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(1.1, 4.5, 8, 1, true),
    new THREE.MeshLambertMaterial({ color: 0xff7722, side: THREE.DoubleSide }),
  );
  cone.rotation.z = Math.PI / 2;
  cone.position.set(2.4, 8.6, 0);
  sock.add(cone);
  sock.position.set(0, 0, field.width / 2 + 22);
  sock.userData.cone = cone;
  group.add(sock);
  // A small hangar and a beacon tower for the eye to find the field from afar.
  const hangar = new THREE.Mesh(
    new THREE.BoxGeometry(34, 12, 24),
    new THREE.MeshLambertMaterial({ color: 0xd8d3c8 }),
  );
  hangar.position.set(60, 6, field.width / 2 + 48);
  group.add(hangar);
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(36, 3, 26),
    new THREE.MeshLambertMaterial({ color: 0x8a2f2f }),
  );
  roof.position.copy(hangar.position);
  roof.position.y += 7.5;
  group.add(roof);
  group.userData.papi = papi;
  group.userData.lamps = lamps;
  group.userData.lampGlows = lampGlows;
  group.userData.sock = sock;
  group.userData.field = field;
  return group;
}

// A small town near each airfield: warm window lights that only read at
// night, so the islands are not dead black below the aircraft after dark.
function buildTownLights(random) {
  const positions = [];
  const colors = [];
  for (const field of Object.values(AIRFIELDS)) {
    for (let i = 0; i < 90; i += 1) {
      const a = random() * Math.PI * 2;
      const r = 250 + random() * 650;
      const x = field.x + Math.cos(a) * r;
      const z = field.z + Math.sin(a) * r;
      const h = heightAt(x, z);
      if (h < 4) continue;
      positions.push(x, h + 2.5, z);
      const warm = 0.75 + random() * 0.25;
      colors.push(1.0 * warm, 0.72 * warm, 0.38 * warm);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  // Town lights: round glowing dots (radial-gradient sprite, additive),
  // not the square point default — squares read as white debris on the field.
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = 32;
  glowCanvas.height = 32;
  const glowCtx = glowCanvas.getContext('2d');
  const glowGrad = glowCtx.createRadialGradient(16, 16, 0, 16, 16, 16);
  glowGrad.addColorStop(0, 'rgba(255,255,255,1)');
  glowGrad.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  glowGrad.addColorStop(1, 'rgba(255,255,255,0)');
  glowCtx.fillStyle = glowGrad;
  glowCtx.fillRect(0, 0, 32, 32);
  const mat = new THREE.PointsMaterial({
    size: 3.5, sizeAttenuation: true, vertexColors: true,
    transparent: true, opacity: 0, depthWrite: false,
    map: new THREE.CanvasTexture(glowCanvas), blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(geo, mat);
}

function scatterTrees(random) {
  const spots = [];
  let tries = 0;
  const clearOfFields = (x, z) => !Object.values(AIRFIELDS).some((f) => Math.hypot(x - f.x, z - f.z) < 900);
  while (spots.length < 2400 && tries < 30000) {
    tries += 1;
    const x = (random() - 0.5) * 11000;
    const z = (random() - 0.5) * 11000;
    const h = heightAt(x, z);
    // Clustered forest: three quarters of the trees land where the forest
    // noise is high, so the canopy merges into a continuous dark mass like
    // the Aitutaki reference instead of scattered triangles.
    const forestN = noise(x * 0.0009 + 51, z * 0.0009 + 13);
    if (h > 6 && h < 120 && clearOfFields(x, z) && (forestN > 0.52 || random() < 0.25)) spots.push([x, h, z, 0.8 + random() * 1.5]);
  }
  const trunkGeo = new THREE.CylinderGeometry(0.6, 1.0, 6, 5);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f, flatShading: true });
  const crownGeo = new THREE.ConeGeometry(6.5, 16, 6);
  // Dense dark canopy like the island reference: four deep greens, not
  // one bright flat green, so the forest reads as a mass from the air.
  const crownMats = [
    new THREE.MeshLambertMaterial({ color: 0x14521c, flatShading: true }),
    new THREE.MeshLambertMaterial({ color: 0x1e6b24, flatShading: true }),
    new THREE.MeshLambertMaterial({ color: 0x0d3d15, flatShading: true }),
    new THREE.MeshLambertMaterial({ color: 0x2a6b1e, flatShading: true }),
  ];
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
  const crowns = crownMats.map((m) => new THREE.InstancedMesh(crownGeo, m, spots.length));
  // Round-canopy broadleaf trees: one in five trees gets a squashed
  // icosahedron crown instead of a cone, so the forest is not all
  // identical triangles from the air.
  const ballGeo = new THREE.IcosahedronGeometry(6.5, 1);
  const ballMats = [
    new THREE.MeshLambertMaterial({ color: 0x1e6b24, flatShading: true }),
    new THREE.MeshLambertMaterial({ color: 0x2a7a26, flatShading: true }),
    new THREE.MeshLambertMaterial({ color: 0x14521c, flatShading: true }),
  ];
  const balls = ballMats.map((m) => new THREE.InstancedMesh(ballGeo, m, spots.length));
  let ballCount = 0;
  const dummy = new THREE.Object3D();
  const counts = [0, 0, 0, 0];
  const ballCounts = [0, 0, 0];
  spots.forEach(([x, h, z, s], i) => {
    dummy.position.set(x, h + 3 * s, z);
    dummy.scale.setScalar(s);
    dummy.rotation.set(0, random() * Math.PI * 2, 0);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    // Half the trees get a round broadleaf canopy instead of a cone: a
    // forest of identical triangles reads as a toy from the air.
    if (i % 2 === 0) {
      dummy.position.set(x, h + (6 + 9) * s, z);
      dummy.scale.set(s * (0.9 + random() * 0.5) * 1.25, s * 0.75 * 1.25, s * (0.9 + random() * 0.5) * 1.25);
      dummy.updateMatrix();
      const bi = ballCount % 3;
      balls[bi].setMatrixAt(ballCounts[bi], dummy.matrix);
      ballCounts[bi] += 1;
      ballCount += 1;
    } else {
      dummy.position.set(x, h + (6 + 8) * s, z);
      dummy.scale.setScalar(s * 1.25);
      dummy.updateMatrix();
      const ci = i % 4;
      crowns[ci].setMatrixAt(counts[ci], dummy.matrix);
      counts[ci] += 1;
    }
  });
  crowns.forEach((c, i) => { c.count = counts[i]; });
  balls.forEach((b, i) => { b.count = ballCounts[i]; });
  // Palms on the beaches: tall thin trunk, wide flat canopy fan.
  const palmSpots = [];
  tries = 0;
  while (palmSpots.length < 320 && tries < 12000) {
    tries += 1;
    const x = (random() - 0.5) * 11000;
    const z = (random() - 0.5) * 11000;
    const h = heightAt(x, z);
    if (h > 1 && h < 14 && clearOfFields(x, z)) palmSpots.push([x, h, z, 0.8 + random() * 0.7]);
  }
  const palmTrunkGeo = new THREE.CylinderGeometry(0.35, 0.6, 11, 5);
  const palmTrunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a45, flatShading: true });
  const palmCrownGeo = new THREE.ConeGeometry(7.5, 5, 7);
  const palmCrownMat = new THREE.MeshLambertMaterial({ color: 0x35a83c, flatShading: true });
  const palmTrunks = new THREE.InstancedMesh(palmTrunkGeo, palmTrunkMat, palmSpots.length);
  const palmCrowns = new THREE.InstancedMesh(palmCrownGeo, palmCrownMat, palmSpots.length);
  palmSpots.forEach(([x, h, z, s], i) => {
    dummy.position.set(x, h + 5.5 * s, z);
    dummy.scale.setScalar(s);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    palmTrunks.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, h + 12.5 * s, z);
    dummy.scale.set(s, s * 0.8, s);
    dummy.updateMatrix();
    palmCrowns.setMatrixAt(i, dummy.matrix);
  });
  const group = new THREE.Group();
  group.add(trunks);
  for (const c of crowns) group.add(c);
  for (const b of balls) group.add(b);
  group.add(palmTrunks);
  group.add(palmCrowns);
  // Low bushes: squashed dark-green blobs that fill the gaps between trees
  // so the ground is not bare green between the cones. Allowed near the
  // fields (only the strip itself stays clear) so the landing shot has
  // texture around the runway too.
  const bushSpots = [];
  tries = 0;
  const clearOfStrip = (x, z) => !Object.values(AIRFIELDS).some((f) => Math.hypot(x - f.x, z - f.z) < 150);
  while (bushSpots.length < 900 && tries < 16000) {
    tries += 1;
    const x = (random() - 0.5) * 11000;
    const z = (random() - 0.5) * 11000;
    const h = heightAt(x, z);
    if (h > 4 && h < 130 && clearOfStrip(x, z)) bushSpots.push([x, h, z, 0.7 + random() * 1.3]);
  }
  const bushGeo = new THREE.IcosahedronGeometry(3.0, 0);
  const bushMats = [
    new THREE.MeshLambertMaterial({ color: 0x1e6b24, flatShading: true }),
    new THREE.MeshLambertMaterial({ color: 0x2a7a26, flatShading: true }),
  ];
  const bushes = bushMats.map((m) => new THREE.InstancedMesh(bushGeo, m, bushSpots.length));
  const bushCounts = [0, 0];
  bushSpots.forEach(([x, h, z, s], i) => {
    dummy.position.set(x, h + 0.8 * s, z);
    dummy.scale.set(s, s * 0.55, s);
    dummy.rotation.set(0, random() * Math.PI * 2, 0);
    dummy.updateMatrix();
    const bi = i % 2;
    bushes[bi].setMatrixAt(bushCounts[bi], dummy.matrix);
    bushCounts[bi] += 1;
  });
  bushes.forEach((b, i) => { b.count = bushCounts[i]; group.add(b); });
  return group;
}

function scatterRocks(random) {
  const spots = [];
  let tries = 0;
  while (spots.length < 380 && tries < 9000) {
    tries += 1;
    const x = (random() - 0.5) * 11000;
    const z = (random() - 0.5) * 11000;
    const h = heightAt(x, z);
    if ((h > -2 && h < 6) || h > 140) spots.push([x, h, z, 1 + random() * 4]);
  }
  const geo = new THREE.DodecahedronGeometry(3, 0);
  const mat = new THREE.MeshLambertMaterial({ color: 0x7a756c, flatShading: true });
  const rocks = new THREE.InstancedMesh(geo, mat, spots.length);
  const dummy = new THREE.Object3D();
  spots.forEach(([x, h, z, s], i) => {
    dummy.position.set(x, h + s, z);
    dummy.scale.set(s, s * 0.7, s);
    dummy.rotation.y = random() * Math.PI;
    dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
  });
  return rocks;
}

// Two white lamps high over the threshold: two white / two red is on slope.
export function updatePapi(runwayGroup, planePos) {
  const field = runwayGroup.userData.field;
  const rad = (field.headingDeg * Math.PI) / 180;
  const dx = planePos.x - field.x;
  const dz = planePos.z - field.z;
  const along = dx * Math.sin(rad) - dz * Math.cos(rad);
  const dist = Math.max(30, -along + field.length / 2);
  const heightAbove = planePos.y - field.elevation;
  const glide = Math.atan2(heightAbove, dist) * (180 / Math.PI);
  const good = glide > 2.2 && glide < 3.8;
  runwayGroup.userData.papi.forEach((lamp, i) => {
    const white = good ? i < 2 : glide >= 3.8 ? i < 3 : i < 1;
    lamp.material.color.setHex(white ? 0xffffff : 0xff2222);
  });
}

export function createTerrain(seed) {
  const random = createRandom(seed);
  const group = new THREE.Group();
  const mesh = buildTerrainMesh();
  mesh.receiveShadow = true;
  mesh.castShadow = true; // hills self-shadow: without it the relief reads flat
  group.add(mesh);
  const sea = buildSea();
  group.add(sea);
  group.add(buildShoreRings());
  const runways = {};
  for (const field of Object.values(AIRFIELDS)) {
    const runway = buildRunway(field);
    runways[field.id] = runway;
    group.add(runway);
  }
  const trees = scatterTrees(random);
  trees.traverse((obj) => { if (obj.isInstancedMesh) obj.castShadow = true; });
  group.add(trees);
  const rocks = scatterRocks(random);
  rocks.castShadow = true;
  group.add(rocks);
  const townLights = buildTownLights(random);
  group.add(townLights);
  return { group, runways, heightAt, seaMaterial: sea.material, townLights };
}
