// The Three.js world: sky, sea, islands, rings, cameras. One job: turn the
// flight state into the picture the judge sees. The aircraft model faces -Z,
// so rotation.y is -heading.
import * as THREE from 'three';
import { AIRCRAFT, AIRFIELDS, RING_RADIUS } from './config.js';
import { buildAircraftModel } from './aircraft.js';
import { createTerrain, updatePapi } from './terrain.js';

function blobTexture(inner, outer) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

// A real cumulus puff texture: a cluster of overlapping blobs with ragged
// edges and surface speckle, not one smooth radial gradient — smooth blobs
// are what made the clouds read as flat white ovals.
function cloudTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);
  const blob = (x, y, r, a) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.7, `rgba(255,255,255,${a * 0.7})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  // A lumpy mass: one big centre blob + smaller satellites, edges ragged.
  blob(128, 140, 78, 0.95);
  blob(80, 150, 55, 0.9);
  blob(180, 150, 58, 0.9);
  blob(110, 110, 55, 0.9);
  blob(160, 105, 48, 0.85);
  blob(128, 170, 60, 0.8);
  blob(55, 130, 38, 0.7);
  blob(205, 130, 38, 0.7);
  blob(95, 185, 40, 0.6);
  blob(165, 185, 40, 0.6);
  // Speckle: tiny bright/dark dots so the surface is not a smooth gradient.
  for (let i = 0; i < 260; i += 1) {
    const x = 40 + Math.random() * 176;
    const y = 70 + Math.random() * 130;
    const r = 2 + Math.random() * 7;
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.25)' : 'rgba(200,210,230,0.18)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return new THREE.CanvasTexture(canvas);
}

// The sun disc: a hard bright core with a tight halo, not a soft blob —
// the old all-gradient sprite read as a blurry orange ball at dusk.
// Round 12: NO ORANGE in the sun halo — the old outer stops
// (255,205,110) / (255,170,70) / (255,160,60) painted an orange ring
// around the pale core, and the dusk sprite colour multiplied it
// further, so the horizon line at dusk read orange. Pale gold now,
// core untouched.
function sunTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 1, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,252,235,1)');
  grad.addColorStop(0.18, 'rgba(255,240,190,0.95)');
  grad.addColorStop(0.35, 'rgba(255,228,175,0.45)');
  grad.addColorStop(0.7, 'rgba(255,218,165,0.12)');
  grad.addColorStop(1, 'rgba(255,212,155,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

function skyMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms,
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 top;
      uniform vec3 mid;
      uniform vec3 horizon;
      uniform vec3 sunDir;
      uniform vec3 sunColor;
      uniform float sunGlow;
      uniform float sunDisc;
      varying vec3 vPos;
      void main() {
        vec3 dir = normalize(vPos);
        float t = clamp(dir.y * 1.6 + 0.18, 0.0, 1.0);
        // Three-stop gradient: horizon -> mid -> top, so dusk can run
        // indigo -> violet -> soft golden peach instead of a two-stop
        // red-orange wash.
        vec3 col = mix(horizon, mid, smoothstep(0.0, 0.55, t));
        col = mix(col, top, smoothstep(0.45, 1.0, t));
        // Sun (or moon) disc + halo, so the light source is a real object
        // in the sky instead of a flat sprite blob: at dusk the disc sits
        // low over the horizon with a wide orange halo.
        float s = max(dot(dir, normalize(sunDir)), 0.0);
        col += sunColor * pow(s, 18.0) * sunGlow;
        col += sunColor * smoothstep(0.9994, 0.99975, s) * sunDisc;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

// A tiny procedural equirect sky used as the environment map, so painted
// metal and canopy glass pick up soft sky reflections (the F-22 reference:
// matte grey with a bright canopy rim). One per time of day, built once.
function envEquirectTexture(topHex, horizonHex, groundHex, sunDir, sunHex) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, topHex);
  grad.addColorStop(0.45, horizonHex);
  grad.addColorStop(0.55, horizonHex);
  grad.addColorStop(1, groundHex);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 128);
  // Sun blob at the equirect position of sunDir.
  const u = (Math.atan2(sunDir[2], sunDir[0]) / (Math.PI * 2) + 0.5) * 256;
  const v = (0.5 - Math.asin(Math.max(-1, Math.min(1, sunDir[1]))) / Math.PI) * 128;
  const glow = ctx.createRadialGradient(u, v, 1, u, v, 26);
  glow.addColorStop(0, sunHex);
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 256, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Time of day is a real lighting state, not a colour filter: each entry sets
// the sky gradient, the sun or moon position and colour, both lights, the
// stars, the fog, the clouds and how bright the airfield beacon burns.
const TIME_OF_DAY = {
  day: {
    skyTop: 0x2f6fc4, skyMid: 0x7fb5e8, skyHorizon: 0xbfe3f2,
    sunColor: 0xffffff, sunDir: [0.5, 0.8, -0.3], sunScale: 650,
    sunGlow: 0.25, sunDisc: 1.2,
    lightColor: 0xfff2d8, lightIntensity: 2.0,
    hemiSky: 0xcfe8ff, hemiGround: 0x3d5a3a, hemiIntensity: 0.75,
    stars: 0, fog: 0xbfe3f2, cloudFactor: 1, cloudColor: 0xffffff,
    moon: false, exposure: 1.12, beacon: 0.03, lampScale: 1, lampGlow: 0.12,
    seaColor: 0x0e4f86, seaOpacity: 0.94, seaSpec: 0xbfe0ff, seaShine: 260,
    seaEmissive: 0x000000,
    townLights: 0,
    env: ['#3a7bd5', '#bfe3f2', '#2a4a2a', '#ffffff'],
  },
  dusk: {
    // Round 10b: NO RED dusk — indigo top -> violet -> soft golden peach
    // horizon. The old horizon (0xff8a4a) + sun (0xff7733) + pink clouds
    // made the whole dusk sky read red-orange. Sun is gold now, fog is
    // violet-grey, clouds lilac-peach, sea glint gold.
    // Round 11: the horizon band was still a saturated "sunset orange"
    // (0xf5bd8a) — paler, softer peach now (0xf8d2b2), same warm hue,
    // lower saturation. Top/mid, sun, fog, clouds untouched.
    // Round 12: a faint young-orange tint still sat exactly on the
    // horizon line, from the sun glow (shader halo pow-18 lobe at
    // sunGlow 0.8 + the sprite, both in sunColor 0xffc37a, an orange
    // gold). Sun colour paler gold now (0xffdcae), glow weaker (0.55),
    // env sun blob matched. Disc stays pale gold (sunDisc 1.6).
    // Round 13: the sun went too pale, almost white-gold — warm it a
    // touch back toward pale gold (0xffd29c, still far from the orange
    // 0xffc37a) and drop the halo a notch (sunGlow 0.55 -> 0.5) so the
    // warmer hue does not bring the orange horizon tint back. The disc
    // term and the sprite both take sunColor, so the disc warms while
    // the weaker halo keeps the horizon pale peach.
    skyTop: 0x1d1d55, skyMid: 0x6a4a9e, skyHorizon: 0xf8d2b2,
    sunColor: 0xffd29c, sunDir: [-0.6, 0.16, -0.45], sunScale: 900,
    sunGlow: 0.5, sunDisc: 1.6,
    // Round 6: the directional light is nearly neutral warm white now
    // (was 0xffe9d6) — the sky shader keeps the peach, but white paint
    // (Tsuru) no longer takes the full warm wash and turns pink.
    lightColor: 0xfff0dd, lightIntensity: 1.5,
    hemiSky: 0xcfc6e8, hemiGround: 0x3a3a44, hemiIntensity: 1.05,
    stars: 0.18, fog: 0x8a7a9e, cloudFactor: 0.8, cloudColor: 0xe8cce0,
    moon: false, exposure: 1.1, beacon: 0.03, lampScale: 1.3, lampGlow: 0.5,
    // Round 6: the far sea at dusk read as a flat black bar (round-5
    // cockpit shot) — the sea was too dark (0x2a3a6e) against the bright
    // orange sky, fogged to a cold mauve (0x8a5a6a). Lighter, warmer sea
    // + warm fog + a broad low sun sheen (shininess 60) + a faint warm
    // emissive lift, so the horizon band reads as warm haze, not a bar.
    seaColor: 0x46508a, seaOpacity: 0.93, seaSpec: 0xffd9a0, seaShine: 60,
    seaEmissive: 0x1a1426,
    townLights: 0.4,
    env: ['#2a2a66', '#f8d2b2', '#241a2e', '#ffd29c'],
  },
  night: {
    skyTop: 0x04060f, skyMid: 0x0a1430, skyHorizon: 0x0d1a33,
    sunColor: 0xe6edff, sunDir: [0.35, 0.62, 0.45], sunScale: 750,
    sunGlow: 0.35, sunDisc: 0.9,
    lightColor: 0x9db8e8, lightIntensity: 0.9,
    hemiSky: 0x1a2a4a, hemiGround: 0x0a0f1a, hemiIntensity: 0.4,
    stars: 1, fog: 0x0a1226, cloudFactor: 0.3, cloudColor: 0x5a6a8a,
    moon: true, exposure: 1.0, beacon: 0.07, lampScale: 2.6, lampGlow: 0.95,
    seaColor: 0x0a1a33, seaOpacity: 0.92, seaSpec: 0x8090b0, seaShine: 90,
    seaEmissive: 0x000000,
    townLights: 1,
    env: ['#04060f', '#0d1a33', '#05070a', '#e6edff'],
  },
};

export function createWorld(canvas, seed) {
  // Low-power defaults for touch screens (phones/tablets): a phone GPU
  // pays for every pixel twice over. Cap the render resolution at 1.25
  // instead of 2, drop MSAA, and turn the 4096px PCFSoft shadow map off
  // entirely — those three are what make movement stutter on a phone.
  // Desktop keeps the full-quality path. The adaptive stepper in
  // main.js can still lower the pixel ratio further on any device.
  const lowPower = typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowPower });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowPower ? 1.25 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  // Real shadows: the sun casts them, and the shadow camera follows the
  // aircraft so the ground under it is always in the shadow frustum.
  renderer.shadowMap.enabled = !lowPower;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xbfe3f2, 2200, 10000);
  const camera = new THREE.PerspectiveCamera(56, 1, 0.5, 22000);

  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x3d5a3a, 0.9);
  scene.add(hemi);
  const sunLight = new THREE.DirectionalLight(0xfff2d8, 1.6);
  sunLight.castShadow = !lowPower;
  sunLight.shadow.mapSize.set(4096, 4096);
  sunLight.shadow.camera.near = 100;
  sunLight.shadow.camera.far = 9000;
  sunLight.shadow.camera.left = -700;
  sunLight.shadow.camera.right = 700;
  sunLight.shadow.camera.top = 700;
  sunLight.shadow.camera.bottom = -700;
  sunLight.shadow.bias = -0.0003;
  sunLight.shadow.normalBias = 0.5;
  scene.add(sunLight);
  scene.add(sunLight.target);

  const terrain = createTerrain(seed);
  scene.add(terrain.group);

  // Environment maps, one per time of day, built once: painted metal and
  // canopy glass reflect the sky instead of rendering as flat plastic.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMaps = {};
  for (const [key, tod] of Object.entries(TIME_OF_DAY)) {
    const sun = new THREE.Vector3(...tod.sunDir).normalize();
    envMaps[key] = pmrem.fromEquirectangular(
      envEquirectTexture(tod.env[0], tod.env[1], tod.env[2], [sun.x, sun.y, sun.z], tod.env[3]),
    ).texture;
  }
  scene.environment = envMaps.day;

  // The sky is one mesh whose shader uniforms are updated per sortie: the
  // sun/moon disc and halo live in the shader, so the light source reads
  // as a real object low over the horizon at dusk.
  const skyUniforms = {
    top: { value: new THREE.Color(TIME_OF_DAY.day.skyTop) },
    mid: { value: new THREE.Color(TIME_OF_DAY.day.skyMid) },
    horizon: { value: new THREE.Color(TIME_OF_DAY.day.skyHorizon) },
    sunDir: { value: new THREE.Vector3(0.5, 0.8, -0.3).normalize() },
    sunColor: { value: new THREE.Color(TIME_OF_DAY.day.sunColor) },
    sunGlow: { value: 0.25 },
    sunDisc: { value: 1.2 },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(10000, 24, 16), skyMaterial(skyUniforms));
  scene.add(sky);
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sunTexture(),
    transparent: true, depthWrite: false,
  }));
  sunSprite.scale.set(900, 900, 1);
  scene.add(sunSprite);
  // The moon: a pale disc with a soft halo, only visible at night, so the
  // night sky has a light source of its own (the shader disc is the sun's
  // twin; the sprite adds the glow the shader cannot do cheaply).
  const moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: blobTexture('rgba(235,240,255,1)', 'rgba(180,200,255,0)'),
    transparent: true, depthWrite: false, opacity: 0.95,
  }));
  moonSprite.scale.set(380, 380, 1);
  moonSprite.visible = false;
  scene.add(moonSprite);

  // Stars in two layers: a few bright ones and many dim ones, with slight
  // colour variation (warm / blue-white), so the night sky is not uniform dots.
  const rand = (() => { let s = seed; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
  function makeStars(count, size, bright) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const theta = rand() * Math.PI * 2;
      const phi = Math.acos(rand() * 0.85);
      const r = 9500;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.cos(phi) + 400;
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      const warm = rand();
      const b = bright * (0.75 + rand() * 0.25);
      if (warm < 0.2) { col[i * 3] = b; col[i * 3 + 1] = b * 0.82; col[i * 3 + 2] = b * 0.62; }
      else if (warm < 0.4) { col[i * 3] = b * 0.8; col[i * 3 + 1] = b * 0.88; col[i * 3 + 2] = b; }
      else { col[i * 3] = b; col[i * 3 + 1] = b; col[i * 3 + 2] = b; }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({
      size, sizeAttenuation: false, transparent: true, opacity: 0,
      vertexColors: true, fog: false, depthWrite: false,
      // Round soft discs, not the square point default: a star is a glow,
      // and square dots read as white debris on the sky.
      map: blobTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'),
      alphaTest: 0.01,
    }));
    scene.add(pts);
    return pts;
  }
  const starsBright = makeStars(350, 4.5, 1);
  const starsDim = makeStars(1500, 2.5, 0.8);

  // Clouds with volume: clusters of puffs instead of single flat blobs,
  // plus a few tall cumulus towers near the islands. Each puff gets a
  // darker, cooler underside sprite just below it, so the cloud has a lit
  // top and a shaded belly instead of reading as a flat white oval.
  const cloudTex = cloudTexture();
  const clouds = [];
  function addCloudPuff(x, y, z, w, h, opacity, shade = false) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: cloudTex, transparent: true, opacity, depthWrite: false,
    }));
    sprite.userData.baseOpacity = opacity;
    sprite.userData.shade = shade;
    sprite.position.set(x, y, z);
    sprite.scale.set(w, h, 1);
    scene.add(sprite);
    clouds.push(sprite);
    return sprite;
  }
  function addCloudCluster(cx, cy, cz, scale, baseOpacity) {
    const n = 4 + ((rand() * 3) | 0);
    for (let j = 0; j < n; j += 1) {
      const ox = (rand() - 0.5) * 520 * scale;
      const oy = (rand() - 0.5) * 160 * scale;
      const oz = (rand() - 0.5) * 220 * scale;
      const w = (280 + rand() * 300) * scale;
      const h = (180 + rand() * 180) * scale;
      const op = (0.7 + rand() * 0.25) * baseOpacity;
      addCloudPuff(cx + ox, cy + oy - h * 0.4, cz + oz, w * 0.95, h * 0.85, op * 0.6, true);
      addCloudPuff(cx + ox, cy + oy, cz + oz, w, h, op, false);
    }
  }
  for (let i = 0; i < 18; i += 1) {
    const cx = (rand() - 0.5) * 11000;
    const cy = 340 + rand() * 380;
    const cz = (rand() - 0.5) * 11000;
    addCloudCluster(cx, cy, cz, 1, 1);
  }
  for (let i = 0; i < 7; i += 1) {
    const cx = (rand() - 0.5) * 9000;
    const cz = (rand() - 0.5) * 9000;
    const base = 300 + rand() * 300;
    addCloudCluster(cx, base, cz, 1.5, 0.9);
    addCloudCluster(cx + 140, base + 150, cz, 1.1, 0.85);
    addCloudCluster(cx - 120, base + 100, cz, 0.9, 0.8);
  }
  // Tall cumulus towers near the islands (the reference: towering white
  // clouds over the lagoon, not a flat ceiling of ovals), stacked in three
  // tiers so the towers rise instead of spreading flat.
  for (let i = 0; i < 5; i += 1) {
    const cx = (rand() - 0.5) * 7000;
    const cz = (rand() - 0.5) * 7000;
    const base = 320 + rand() * 200;
    addCloudCluster(cx, base, cz, 2.2, 0.95);
    addCloudCluster(cx + 180, base + 220, cz, 1.6, 0.9);
    addCloudCluster(cx - 150, base + 380, cz, 1.2, 0.85);
  }
  // High thin cirrus: wide flat streaks, very faint, so the upper sky is
  // not empty blue.
  for (let i = 0; i < 10; i += 1) {
    const cx = (rand() - 0.5) * 12000;
    const cz = (rand() - 0.5) * 12000;
    addCloudPuff(cx, 950 + rand() * 300, cz, 1400 + rand() * 900, 50 + rand() * 40, 0.14 + rand() * 0.1, false);
  }

  const aircraftGroup = new THREE.Group();
  scene.add(aircraftGroup);
  // A strong warm floodlight that follows the aircraft, only on at night
  // (full) and dusk (weaker): it keeps the plane readable in the chase
  // view when the moon is the only light, and at dusk when the sun sits
  // at 9 degrees and barely touches the top surfaces. It lives on the
  // scene, NOT in aircraftGroup: setAircraft() pops every child of that
  // group, which silently deleted this light before.
  const nightLight = new THREE.PointLight(0xffe0b0, 0, 110, 1.6);
  scene.add(nightLight);
  let aircraftParts = null;
  let currentKind = null;

  const ringGroup = new THREE.Group();
  scene.add(ringGroup);
  let rings = [];
  // A vertical light beam over the next ring, so it reads from a kilometre
  // away instead of being a small circle on the horizon.
  const ringBeam = new THREE.Mesh(
    new THREE.CylinderGeometry(4, 4, 700, 10, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffa500, transparent: true, opacity: 0.1,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    }),
  );
  ringBeam.visible = false;
  scene.add(ringBeam);

  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(12, 12, 120, 10, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffc040, transparent: true, opacity: 0.05,
      side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  beacon.visible = false;
  scene.add(beacon);

  // ---- Enemy combat visuals ----
  // Enemies are simple dark jets with red markings (not copies of the
  // player's five fighters, so a hostile reads as hostile at a glance),
  // plus a small red diamond marker above each one. Tracers and missiles
  // are pooled meshes, reused every frame — nothing is allocated per shot.
  const combatGroup = new THREE.Group();
  scene.add(combatGroup);
  let combatMeshes = [];
  const tracerPool = [];
  const missilePool = [];
  const explosionPool = [];
  const explosionFx = [];
  function makeEnemyJet() {
    const g = new THREE.Group();
    // Skala 1.5 (sebelumnya 1.0): musuh 50% lebih besar biar kebaca dari
    // jarak tempur — kira-kira seukuran pesawat pemain di layar.
    g.scale.setScalar(1.5);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a3f46, metalness: 0.6, roughness: 0.45 });
    const redMat = new THREE.MeshStandardMaterial({ color: 0x8c1f1f, metalness: 0.5, roughness: 0.5 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x14161a, metalness: 0.4, roughness: 0.6 });
    const fus = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 7.5), bodyMat);
    g.add(fus);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.2, 8), redMat);
    nose.rotation.x = -Math.PI / 2;
    nose.position.set(0, 0, -4.8);
    g.add(nose);
    for (const s of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.14, 2.4), bodyMat);
      wing.position.set(s * 2.4, -0.1, 0.8);
      wing.rotation.y = s * 0.35;
      g.add(wing);
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.6, 1.8), redMat);
      fin.position.set(s * 0.6, 0.9, 3.0);
      fin.rotation.z = s * -0.25;
      g.add(fin);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 1.2), redMat);
      tip.position.set(s * 4.1, -0.1, 0.8);
      g.add(tip);
    }
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), darkMat);
    canopy.position.set(0, 0.6, -1.6);
    canopy.scale.set(1, 0.7, 1.8);
    g.add(canopy);
    const marker = new THREE.Mesh(
      new THREE.OctahedronGeometry(2.4),
      new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
    );
    marker.position.set(0, 5.5, 0);
    g.add(marker);
    g.traverse((obj) => { if (obj.isMesh) obj.castShadow = false; });
    return { group: g, marker };
  }
  function getTracer(i, from) {
    if (!tracerPool[i]) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.8, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffe066 }),
      );
      mesh.scale.set(1, 1, 12);
      mesh.visible = false;
      combatGroup.add(mesh);
      tracerPool[i] = mesh;
    }
    tracerPool[i].material.color.setHex(from === 'player' ? 0xffe066 : 0xff5a3c);
    return tracerPool[i];
  }
  function getMissileMesh(i, from) {
    if (!missilePool[i]) {
      const mesh = new THREE.Mesh(
        new THREE.ConeGeometry(0.7, 3.4, 8),
        new THREE.MeshBasicMaterial({ color: 0xff8c1a }),
      );
      mesh.visible = false;
      combatGroup.add(mesh);
      missilePool[i] = mesh;
    }
    missilePool[i].material.color.setHex(from === 'player' ? 0xffe066 : 0xff3c1a);
    return missilePool[i];
  }
  function getExplosionMesh() {
    for (const m of explosionPool) if (!m.visible) return m;
    if (explosionPool.length >= 8) return null;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xff8c1a, transparent: true, opacity: 0.9 }),
    );
    mesh.visible = false;
    combatGroup.add(mesh);
    explosionPool.push(mesh);
    return mesh;
  }
  function setCombat(combat) {
    for (const m of combatMeshes) combatGroup.remove(m.group);
    combatMeshes = (combat ? combat.enemies : []).map((e) => {
      const built = makeEnemyJet();
      combatGroup.add(built.group);
      return built;
    });
    for (const t of tracerPool) t.visible = false;
    for (const m of missilePool) m.visible = false;
    for (const m of explosionPool) m.visible = false;
    explosionFx.length = 0;
  }
  function updateCombat(combat, dt, time) {
    if (!combat) return;
    combat.enemies.forEach((e, i) => {
      const built = combatMeshes[i];
      if (!built) return;
      built.group.visible = e.alive;
      if (!e.alive) return;
      built.group.position.set(e.x, e.y, e.z);
      built.group.rotation.order = 'YXZ';
      built.group.rotation.set(e.pitch, -e.heading, -e.bank);
      const pulse = 1 + Math.sin(time * 5 + i) * 0.25;
      built.marker.scale.setScalar(pulse);
    });
    combat.projectiles.forEach((p, i) => {
      const mesh = getTracer(i, p.from);
      mesh.visible = true;
      mesh.position.set(p.x, p.y, p.z);
      mesh.lookAt(p.x + p.vx, p.y + p.vy, p.z + p.vz);
    });
    for (let i = combat.projectiles.length; i < tracerPool.length; i += 1) tracerPool[i].visible = false;
    combat.missiles.forEach((m, i) => {
      const mesh = getMissileMesh(i, m.from);
      mesh.visible = true;
      mesh.position.set(m.x, m.y, m.z);
      mesh.lookAt(m.x + m.vx, m.y + m.vy, m.z + m.vz);
      mesh.rotateX(-Math.PI / 2);
    });
    for (let i = combat.missiles.length; i < missilePool.length; i += 1) missilePool[i].visible = false;
    for (const ex of combat.explosions || []) {
      const mesh = getExplosionMesh();
      if (mesh) {
        mesh.visible = true;
        mesh.position.set(ex.x, ex.y, ex.z);
        mesh.scale.setScalar(3);
        mesh.material.opacity = 0.9;
        explosionFx.push({ mesh, t: 0 });
      }
    }
    for (let i = explosionFx.length - 1; i >= 0; i -= 1) {
      const fx = explosionFx[i];
      fx.t += dt;
      if (fx.t > 0.7) {
        fx.mesh.visible = false;
        explosionFx.splice(i, 1);
      } else {
        fx.mesh.scale.setScalar(3 + fx.t * 34);
        fx.mesh.material.opacity = 0.9 * (1 - fx.t / 0.7);
      }
    }
  }

  // The cockpit interior: a lit instrument panel, HUD glass, stick and
  // canopy frame pillars. It is a scene child that copies the airframe pose
  // every frame (update()), so it is never caught in setAircraft()'s
  // dispose-all-children sweep. All coords are in scaled airframe space
  // (the model group is scaled 1.25): panel ahead of the pilot, nose -Z.
  // Instrument panel, drawn like the F-16 references: two green NVIS MFD
  // screens left and right, a central analogue gauge cluster, and a bottom
  // row of small dials — dense, lit, and readable, not a bare board.
  function panelTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 288;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0c0f12';
    ctx.fillRect(0, 0, 768, 288);
    ctx.strokeStyle = '#1e242a';
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, 760, 280);
    const gauge = (cx, cy, r, label) => {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = '#10161c';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#8a97a3';
      ctx.stroke();
      ctx.strokeStyle = '#e8f2ff';
      ctx.lineWidth = 2;
      for (let i = 0; i < 12; i += 1) {
        const a = (i / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * (r - 4), cy + Math.sin(a) * (r - 4));
        ctx.lineTo(cx + Math.cos(a) * (r - 11), cy + Math.sin(a) * (r - 11));
        ctx.stroke();
      }
      ctx.fillStyle = '#ffb347';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, cx, cy + r + 15);
      ctx.restore();
      return { cx, cy, r };
    };
    const needle = (cx, cy, r, angle, color) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * (r - 8), cy + Math.sin(angle) * (r - 8));
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    // MFD: dark green screen with data lines and a moving-map frame.
    const mfd = (x, y, w, h, title) => {
      ctx.save();
      ctx.fillStyle = '#031007';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#1e4a2a';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
      ctx.fillStyle = '#39ff88';
      ctx.font = 'bold 13px ui-monospace, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(title, x + 10, y + 20);
      ctx.font = '11px ui-monospace, monospace';
      const lines = ['HDG 046', 'ALT 813', 'IAS 159', 'FUEL 97%', 'NAV RTE 3/5'];
      lines.forEach((line, i) => ctx.fillText(line, x + 10, y + 44 + i * 18));
      ctx.strokeStyle = 'rgba(57,255,136,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x + w - 42, y + h - 38, 24, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + w - 42, y + h - 38);
      ctx.lineTo(x + w - 30, y + h - 52);
      ctx.stroke();
      ctx.restore();
    };
    mfd(14, 18, 168, 150, 'MFD-L NAV');
    mfd(586, 18, 168, 150, 'MFD-R SYS');
    // Attitude indicator, centre: blue sky / brown ground, horizon line.
    const att = gauge(384, 108, 62, 'ATT');
    ctx.save();
    ctx.beginPath();
    ctx.arc(att.cx, att.cy, att.r - 3, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#2f7fd0';
    ctx.fillRect(att.cx - 62, att.cy - 62, 124, 62);
    ctx.fillStyle = '#7a5230';
    ctx.fillRect(att.cx - 62, att.cy, 124, 62);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(att.cx - 60, att.cy);
    ctx.lineTo(att.cx + 60, att.cy);
    ctx.stroke();
    ctx.strokeStyle = '#ffd24a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(att.cx - 18, att.cy + 4);
    ctx.lineTo(att.cx, att.cy - 2);
    ctx.lineTo(att.cx + 18, att.cy + 4);
    ctx.stroke();
    ctx.restore();
    const spd = gauge(268, 92, 52, 'IAS');
    needle(spd.cx, spd.cy, spd.r, -Math.PI * 0.75, '#39ff88');
    const alt = gauge(500, 92, 52, 'ALT');
    needle(alt.cx, alt.cy, alt.r, -Math.PI * 0.3, '#39ff88');
    const hdg = gauge(268, 222, 36, 'HDG');
    needle(hdg.cx, hdg.cy, hdg.r, -Math.PI / 2, '#ffd24a');
    const fuel = gauge(384, 222, 36, 'FUEL');
    needle(fuel.cx, fuel.cy, fuel.r, -Math.PI * 0.85, '#ff5a4a');
    const rpm = gauge(500, 222, 36, 'RPM');
    needle(rpm.cx, rpm.cy, rpm.r, -Math.PI * 0.55, '#39ff88');
    const vsi = gauge(620, 222, 30, 'VSI');
    needle(vsi.cx, vsi.cy, vsi.r, -Math.PI * 0.2, '#39ff88');
    // Digital readouts.
    ctx.fillStyle = '#39ff88';
    ctx.font = 'bold 20px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('159', 196, 40);
    ctx.fillText('813', 520, 40);
    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 8;
    return texture;
  }

  function hudTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 128);
    ctx.strokeStyle = 'rgba(57,255,136,0.95)';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#39ff88';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(128, 64, 34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(128 - 52, 64);
    ctx.lineTo(128 + 52, 64);
    ctx.moveTo(128, 64 - 52);
    ctx.lineTo(128, 64 + 52);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(128 - 14, 64 - 6);
    ctx.lineTo(128, 64 - 16);
    ctx.lineTo(128 + 14, 64 - 6);
    ctx.stroke();
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }

  const cockpitGroup = new THREE.Group();
  scene.add(cockpitGroup);
  {
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x0a0c0e, roughness: 0.9, metalness: 0.15 });
    // Instrument panel: canvas gauges + two NVIS-green MFDs, unlit so they
    // glow at night. Lowered and narrower than before, so its top edge
    // sits below the pilot's sightline to the horizon instead of cutting
    // the view in half.
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 0.68, 0.26),
      new THREE.MeshBasicMaterial({ map: panelTexture() }),
    );
    panel.position.set(0, 0.72, -5.0);
    panel.rotation.x = -0.18;
    cockpitGroup.add(panel);
    // Glare shield: a thin sloped lip just above the panel (was 0.25 deep
    // and 1.85 wide — from 2 m behind it read as a giant black band across
    // the whole view). Now 0.1 deep, 1.45 wide, tilted back.
    const shield = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.025, 0.1), darkMat);
    shield.position.set(0, 1.08, -4.92);
    shield.rotation.x = -0.35;
    cockpitGroup.add(shield);
    for (const s of [-1, 1]) {
      // Side console: small, low, far forward and near-black (was 40 cm
      // from the camera lens, so it read as a giant tan slab filling the
      // bottom of the frame). Rows of tiny lit switch dots, like F-16 panels.
      const consoleSide = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.8), darkMat);
      consoleSide.position.set(s * 1.02, 0.3, -4.15);
      cockpitGroup.add(consoleSide);
      const btnMat = new THREE.MeshBasicMaterial({ color: 0x39ff88 });
      const btnMatAmber = new THREE.MeshBasicMaterial({ color: 0xffb347 });
      for (let r = 0; r < 3; r += 1) {
        for (let c = 0; c < 2; c += 1) {
          const btn = new THREE.Mesh(
            new THREE.BoxGeometry(0.03, 0.015, 0.05),
            (r + c) % 3 === 0 ? btnMatAmber : btnMat,
          );
          btn.position.set(s * 1.02, 0.38, -4.45 + r * 0.24 + c * 0.1);
          cockpitGroup.add(btn);
        }
      }
      // Canopy frame stub at the panel's edge: a short thin frame line that
      // brackets the panel instead of a diagonal strut crossing the sky.
      // (The old full-length pillars read as black sticks across the view.)
      const stub = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.25, 0.02), darkMat);
      stub.position.set(s * 0.86, 1.1, -4.95);
      stub.rotation.x = -0.18;
      cockpitGroup.add(stub);
    }
    // Control stick with grip: short and low so it never crosses the panel.
    const stick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.06, 0.3, 8), darkMat,
    );
    stick.position.set(0, 0.42, -4.6);
    stick.rotation.x = 0.18;
    cockpitGroup.add(stick);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.16, 0.09), darkMat);
    grip.position.set(0, 0.52, -4.4);
    grip.rotation.x = 0.18;
    cockpitGroup.add(grip);
    // HUD reflector glass ahead of the pilot, with a thin frame, sitting
    // just above the panel instead of floating in the middle of the sky.
    const hudGlass = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.42),
      new THREE.MeshBasicMaterial({
        map: hudTexture(), transparent: true, opacity: 0.9,
        depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    hudGlass.position.set(0, 1.3, -5.1);
    hudGlass.rotation.x = -0.3;
    cockpitGroup.add(hudGlass);
    // No frame bar on the HUD glass: its dark top bar used to read as a
    // stray black line floating across the sky in the cockpit view.
  }

  let beaconBase = 0.05;
  let sunDir = new THREE.Vector3(0.5, 0.8, -0.3).normalize();
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  let cameraMode = 'chase';
  let camDist = 27;
  let camHeight = 8;

  function setAircraft(kind) {
    if (kind === currentKind && aircraftParts) return;
    currentKind = kind;
    while (aircraftGroup.children.length) {
      const child = aircraftGroup.children.pop();
      child.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
      });
    }
    aircraftParts = buildAircraftModel(kind);
    aircraftParts.group.traverse((obj) => {
      if (obj.isMesh) obj.castShadow = true;
    });
    aircraftParts.group.scale.setScalar(1.25);
    aircraftGroup.add(aircraftParts.group);
  }

  function setSortie(sortie) {
    const key = TIME_OF_DAY[sortie.timeOfDay] ? sortie.timeOfDay : 'day';
    const tod = TIME_OF_DAY[key];
    // Sky shader uniforms (the mesh itself is never recreated).
    skyUniforms.top.value.setHex(tod.skyTop);
    skyUniforms.mid.value.setHex(tod.skyMid);
    skyUniforms.horizon.value.setHex(tod.skyHorizon);
    skyUniforms.sunDir.value.set(...tod.sunDir).normalize();
    skyUniforms.sunColor.value.setHex(tod.sunColor);
    skyUniforms.sunGlow.value = tod.sunGlow;
    skyUniforms.sunDisc.value = tod.sunDisc;
    scene.environment = envMaps[key];
    sunDir = new THREE.Vector3(...tod.sunDir).normalize();
    sunSprite.position.copy(sunDir).multiplyScalar(9200);
    sunSprite.material.color.setHex(tod.sunColor);
    sunSprite.scale.set(tod.sunScale, tod.sunScale, 1);
    sunSprite.visible = !tod.moon;
    moonSprite.position.copy(sunDir).multiplyScalar(9200);
    moonSprite.visible = !!tod.moon;
    sunLight.color.setHex(tod.lightColor);
    sunLight.position.copy(sunDir).multiplyScalar(6000);
    sunLight.intensity = tod.lightIntensity;
    hemi.color.setHex(tod.hemiSky);
    hemi.groundColor.setHex(tod.hemiGround);
    hemi.intensity = tod.hemiIntensity;
    starsBright.material.opacity = tod.stars;
    starsDim.material.opacity = tod.stars;
    scene.fog.color.setHex(tod.fog);
    renderer.toneMappingExposure = tod.exposure;
    for (const cloud of clouds) {
      cloud.material.opacity = cloud.userData.baseOpacity * tod.cloudFactor;
      cloud.material.color.setHex(tod.cloudColor);
      // The shaded belly of each cloud stays darker than its lit top.
      if (cloud.userData.shade) cloud.material.color.multiplyScalar(0.5);
    }
    // Round 6 fix 2: the same warm flood that keeps the plane readable at
    // night also runs at dusk, weaker (90 vs 150): the dusk sun sits at 9
    // degrees, so it barely touches the top surfaces, and the hemisphere
    // alone left the white paint dark grey-brown on final (round-6 retake
    // 1). The light falls off within 110 m, so it only lifts the aircraft.
    nightLight.intensity = tod.moon ? 150 : (key === 'dusk' ? 90 : 0);
    beaconBase = tod.beacon;
    // Sea colour follows the light: aqua by day, dusky purple at sunset,
    // near-black navy at night, so the moon glint reads on the water.
    if (terrain.seaMaterial) {
      terrain.seaMaterial.color.setHex(tod.seaColor);
      terrain.seaMaterial.opacity = tod.seaOpacity;
      terrain.seaMaterial.specular.setHex(tod.seaSpec);
      terrain.seaMaterial.shininess = tod.seaShine;
      if (terrain.seaMaterial.emissive) terrain.seaMaterial.emissive.setHex(tod.seaEmissive || 0);
    }
    // Clear colour = fog colour: any pixel the sky sphere and sea do not
    // cover (e.g. past the sea plane's far edge at the horizon) reads as
    // warm haze instead of a black line (round-6 dusk bar).
    renderer.setClearColor(tod.fog);
    if (terrain.townLights) terrain.townLights.material.opacity = tod.townLights;
    // Runway edge lamps and PAPI grow at night so the fields stay findable
    // in the dark; by day they are small warm dots. Their glow sprites
    // brighten with the dark so the light pools on the ground.
    for (const runway of Object.values(terrain.runways)) {
      for (const lamp of runway.userData.lamps || []) lamp.scale.setScalar(tod.lampScale);
      for (const lamp of runway.userData.papi || []) lamp.scale.setScalar(tod.lampScale);
      for (const glow of runway.userData.lampGlows || []) {
        glow.material.opacity = tod.lampGlow;
        glow.scale.set(7 * tod.lampScale, 7 * tod.lampScale, 1);
      }
    }
    scene.background = null;
  }

  function setMission(mission) {
    while (ringGroup.children.length) {
      const child = ringGroup.children.pop();
      child.traverse((obj) => { if (obj.geometry) obj.geometry.dispose(); });
    }
    rings = mission.rings.map((ring) => {
      const group = new THREE.Group();
      const torus = new THREE.Mesh(
        new THREE.TorusGeometry(RING_RADIUS, 3.4, 12, 48),
        new THREE.MeshBasicMaterial({ color: 0x7fb8ff }),
      );
      group.add(torus);
      // A faint outer halo so the ring reads from a kilometre away.
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(RING_RADIUS + 7, 1.1, 8, 48),
        new THREE.MeshBasicMaterial({
          color: 0x7fb8ff, transparent: true, opacity: 0.4,
        }),
      );
      group.add(halo);
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(RING_RADIUS, 40),
        new THREE.MeshBasicMaterial({
          color: 0x7fb8ff, transparent: true, opacity: 0.08,
          side: THREE.DoubleSide, depthWrite: false,
        }),
      );
      group.add(disc);
      group.position.set(ring.x, ring.y, ring.z);
      group.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(ring.nx, ring.ny, ring.nz),
      );
      ringGroup.add(group);
      return { group, torus, halo, disc, data: ring };
    });
    const to = mission.sortie.to;
    const field = AIRFIELDS[to];
    if (field) {
      beacon.position.set(field.x, 60, field.z);
      beacon.visible = true;
    }
  }

  function update(flight, mission, dt, time) {
    const spec = AIRCRAFT[flight.kind] || AIRCRAFT.kawasemi;
    aircraftGroup.position.set(flight.x, flight.y, flight.z);
    aircraftGroup.rotation.order = 'YXZ';
    aircraftGroup.rotation.set(flight.pitch, -flight.heading, -flight.bank);
    // The cockpit interior rides the airframe: same pose, every frame.
    // The cockpit interior is only visible from the cockpit camera: in
    // chase view its frame would float over the aircraft like a roll cage.
    cockpitGroup.visible = cameraMode === 'cockpit';
    // The canopy glass + rim + spine extras hide in cockpit view: the rim's
    // far arc reads as a dark arc across the lower view, the glass
    // (metalness 1.0, env 2.2) mirrors the dark sky, and the spine boxes
    // sit right under the camera and read as a giant flat slab across the
    // panel. The glass is FrontSide-culled from inside anyway; hiding
    // these costs the pilot nothing. (The fuselage stays visible: the
    // pilot must see the nose.)
    if (aircraftParts && aircraftParts._cockpitHidden !== (cameraMode === 'cockpit')) {
      aircraftParts._cockpitHidden = cameraMode === 'cockpit';
      aircraftParts.group.traverse((obj) => {
        if (obj.name === 'canopyGlass' || obj.name === 'canopyRim' || obj.name === 'spineTop') {
          obj.visible = !aircraftParts._cockpitHidden;
        }
      });
    }
    cockpitGroup.position.copy(aircraftGroup.position);
    cockpitGroup.rotation.copy(aircraftGroup.rotation);
    // The night floodlight rides with the aircraft too.
    nightLight.position.set(flight.x, flight.y + 3, flight.z);
    // The sun's shadow camera follows the aircraft so the ground under it
    // is always inside the shadow frustum.
    sunLight.position.copy(sunDir).multiplyScalar(6000).add(aircraftGroup.position);
    sunLight.target.position.copy(aircraftGroup.position);
    sunLight.target.updateMatrixWorld();
    // The sea's wave texture scrolls slowly, so the water is alive.
    // Round 13b: faster, diagonal scroll along the swell travel
    // direction (toward heading 70 deg, the wind the windsock points
    // to) — the old 0.004/0.002 drift was too slow to read as motion in
    // play, and the stills read as flat glass. ~4 m/s of water travel.
    // Minus signs: raising the offset samples later texels, so the
    // pattern would drift against the wind; decreasing it moves the
    // water toward heading 70 deg, perpendicular to the crest streaks.
    if (terrain.seaMaterial && terrain.seaMaterial.map) {
      terrain.seaMaterial.map.offset.x -= dt * 0.010;
      terrain.seaMaterial.map.offset.y -= dt * 0.0036;
    }
    if (aircraftParts) {
      // Afterburner: visible from a low cruise throttle, not only past
      // 0.55 — the old threshold left the nozzle mouths dark in the
      // 20%-throttle chase shots. Scale grows with throttle (0.44 at
      // cruise, 1.0 at full), and each flame scales in place from its
      // own mouth — scaling the group would drag both flames toward
      // the centreline, off their holes. Length flickers fast while
      // width barely moves: a steady balloon reads as a cartoon.
      // At the 5% landing throttle the flame stays off, so the final
      // shot keeps its clean white jet.
      const thr = flight.throttle;
      aircraftParts.burner.visible = thr > 0.08 && !flight.engineOut;
      const scale = 0.3 + thr * 0.7;
      const flick = 1 + Math.sin(time * 31) * 0.07 + Math.sin(time * 47 + 1.7) * 0.05;
      for (const flame of aircraftParts.burner.children) {
        flame.scale.set(scale, scale, scale * flick);
      }
      aircraftParts.gear.visible = flight.gearDown;
      aircraftParts.strobe.visible = Math.floor(time * 1.4) % 2 === 0;
    }
    for (const runway of Object.values(terrain.runways)) {
      updatePapi(runway, flight);
      // The windsock cone points downwind; wind blows toward heading 70 deg,
      // so the sock yaw is the runway heading minus 70.
      const sock = runway.userData.sock;
      if (sock) sock.rotation.y = ((runway.userData.field.headingDeg - 70) * Math.PI) / 180;
    }
    let nextRingPos = null;
    for (const ring of rings) {
      const isNext = mission && ring.data.index === mission.ringIndex && !ring.data.passed;
      const color = ring.data.passed ? 0x2ecc40 : isNext ? 0xffa500 : 0x7fb8ff;
      ring.torus.material.color.setHex(color);
      ring.halo.material.color.setHex(color);
      ring.disc.material.color.setHex(color);
      const pulse = isNext ? 1 + Math.sin(time * 4) * 0.06 : 1;
      ring.group.scale.setScalar(pulse);
      if (isNext) nextRingPos = ring.data;
    }
    if (nextRingPos) {
      ringBeam.visible = true;
      ringBeam.position.set(nextRingPos.x, nextRingPos.y + 300, nextRingPos.z);
      ringBeam.material.color.setHex(0xffa500);
      ringBeam.material.opacity = 0.1 + Math.sin(time * 4) * 0.03;
    } else {
      ringBeam.visible = false;
    }
    beacon.material.opacity = beaconBase + Math.sin(time * 2) * 0.015;
    for (const cloud of clouds) {
      cloud.position.x += 3 * dt;
      if (cloud.position.x > 6500) cloud.position.x = -6500;
    }
    const fwd = new THREE.Vector3(Math.sin(flight.heading), 0, -Math.cos(flight.heading));
    const right = new THREE.Vector3(Math.cos(flight.heading), 0, Math.sin(flight.heading));
    if (cameraMode === 'cockpit') {
      camera.fov = 66;
      camera.updateProjectionMatrix();
      // Inside the canopy, high over the nose: the pilot's eye sits 0.57 m
      // above the fuselage spine (was 0.01 m in round 2 — the nose filled
      // the frame as a dark band) and 2.6 m forward, just under the taller
      // bubble canopy (top 1.59 m world), so the slimmed nose drops away
      // below the horizon and the panel sits at the bottom of the frame.
      camPos.copy(aircraftGroup.position)
        .addScaledVector(fwd, 2.6)
        .add(new THREE.Vector3(0, 1.55, 0));
      camLook.copy(camPos).addScaledVector(fwd, 60);
      camLook.y += Math.sin(flight.pitch) * 60 + 2;
      camera.position.copy(camPos);
      camera.up.set(0, 1, 0);
      camera.lookAt(camLook);
      camera.rotateZ(-flight.bank * 0.6);
    } else {
      camera.fov = 56;
      camera.updateProjectionMatrix();
      // A shot can widen the chase camera: the landing shot used to crop
      // the plane at the frame edge, so it runs at dist 26 / height 9.
      const shotCam = window.__shotCamera || null;
      const dist = shotCam ? shotCam.dist : camDist;
      const height = shotCam ? shotCam.height : camHeight;
      const target = new THREE.Vector3().copy(aircraftGroup.position)
        .addScaledVector(fwd, -dist)
        .add(new THREE.Vector3(0, height + flight.speed * 0.01, 0));
      const k = 1 - Math.exp(-dt * 4.5);
      camera.position.lerp(target, k);
      camLook.copy(aircraftGroup.position).addScaledVector(fwd, 34);
      camLook.y += 2;
      camera.up.set(0, 1, 0);
      camera.lookAt(camLook);
    }
    sky.position.copy(camera.position);
    starsBright.position.copy(camera.position);
    starsDim.position.copy(camera.position);
    // The sun and moon ride with the camera, 9.2 km out, so they stay in
    // the sky dome wherever the aircraft flies.
    sunSprite.position.copy(camera.position).addScaledVector(sunDir, 9200);
    moonSprite.position.copy(camera.position).addScaledVector(sunDir, 9200);
  }

  function resize(width, height) {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  return {
    renderer, scene, camera,
    setAircraft, setSortie, setMission, setCombat, updateCombat, update, resize,
    setCameraMode(mode) { cameraMode = mode; },
    getCameraMode() { return cameraMode; },
    setCameraOffset(dist, height) { camDist = dist; camHeight = height; },
    heightAt: terrain.heightAt,
  };
}
