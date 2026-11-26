// Every DOM surface: the in-flight HUD, the aircraft and sortie pickers, the
// briefing, pause, results and crash screens. One job: show the numbers and
// take the clicks; the flight logic lives elsewhere.
import * as THREE from 'three';
import { AIRCRAFT, AIRCRAFT_ORDER, AIRFIELDS, SORTIES } from './config.js';
import { buildAircraftModel } from './aircraft.js';
import { headingTo } from './flightModel.js';
import { nextRing, objectiveText } from './missions.js';

function bar(value, max) {
  const pct = Math.round((value / max) * 100);
  return `<span class="bar"><span style="width:${pct}%"></span></span>`;
}

export function createHud(root, callbacks) {
  root.innerHTML = `
  <div id="hud" class="hidden">
    <div class="hud-left">
      <canvas id="attitude" width="150" height="150"></canvas>
      <div class="readouts">
        <div class="ro"><label>IAS</label><b id="ro-ias">0</b><span>kt</span></div>
        <div class="ro"><label>ALT</label><b id="ro-alt">0</b><span>ft</span></div>
        <div class="ro"><label>HDG</label><b id="ro-hdg">000</b><span>°</span></div>
        <div class="ro"><label>VS</label><b id="ro-vs">0</b><span>fpm</span></div>
      </div>
    </div>
    <div class="hud-right">
      <div class="craft-badge" id="craft-badge">Kawasemi</div>
      <div class="time-badge" id="time-badge">SIANG</div>
      <div class="objective" id="objective">Take off</div>
      <div class="director"><span id="dir-arrow">➤</span><span id="dir-dist">0 m</span></div>
      <div class="score">SCORE <b id="score">0</b></div>
      <div class="rings" id="rings"></div>
    </div>
    <div class="hud-bottom">
      <div class="throttle"><label>THR</label><div class="tbar"><div id="thr-fill"></div></div><b id="thr-pct">0%</b></div>
      <div class="fuel"><label>FUEL</label><div class="tbar"><div id="fuel-fill"></div></div><b id="fuel-pct">100%</b></div>
      <div class="flags"><span id="flag-gear">GEAR</span><span id="flag-flap">FLAPS</span><span id="flag-dmg">DMG 0%</span></div>
    </div>
    <div class="hud-buttons">
      <button data-action="gear">GEAR <span class="key">G</span></button>
      <button data-action="flaps">FLAPS <span class="key">F</span></button>
      <button data-action="camera">CAM <span class="key">C</span></button>
      <button data-action="pause">II <span class="key">P</span></button>
      <button data-action="mute">SOUND <span class="key">M</span></button>
    </div>
    <div id="touch-controls">
      <div id="stick"><div id="stick-knob"></div></div>
      <div id="thr-slider"><div id="thr-track"></div><div id="thr-handle"></div></div>
      <div id="touch-actions">
        <button id="btn-brake">BRAKE</button>
        <button data-action="gear">GEAR</button>
        <button data-action="flaps">FLAPS</button>
        <button data-action="camera">CAM</button>
        <button data-action="pause">II</button>
      </div>
    </div>
    <div id="warn" class="warn hidden"></div>
    <div id="toast" class="toast hidden"></div>
  </div>
  <div id="menu" class="overlay">
    <div class="panel">
      <h1>LAGUNA FLIGHT</h1>
      <p class="tag">Mail runs over the Merpati archipelago. Pick a fighter, fly the rings, land the mail.</p>
      <h2>Choose your fighter</h2>
      <div class="cards" id="craft-cards"></div>
      <div class="preview"><canvas id="preview" width="340" height="190"></canvas><p id="craft-desc"></p></div>
      <h2>Choose a sortie</h2>
      <div class="cards sorties" id="sortie-cards"></div>
      <button class="big" id="btn-start">START ENGINE</button>
      <p class="keys kbd">Arrows steer · W/S throttle · G gear · F flaps · Space brake · C camera · P pause · drag to steer</p>
      <p class="keys touch-only">Left stick steers · right slider is throttle · GEAR / FLAPS / CAM on the right</p>
    </div>
  </div>
  <div id="briefing" class="overlay hidden">
    <div class="panel narrow">
      <h2 id="brief-title">Sortie briefing</h2>
      <p id="brief-text"></p>
      <button class="big" id="btn-fly">TAKE OFF</button>
    </div>
  </div>
  <div id="pause" class="overlay hidden">
    <div class="panel narrow">
      <h2>Paused</h2>
      <button class="big" id="btn-resume">RESUME</button>
      <button class="ghost" id="btn-restart">RESTART SORTIE</button>
      <button class="ghost" id="btn-menu">CHANGE FIGHTER</button>
    </div>
  </div>
  <div id="results" class="overlay hidden">
    <div class="panel narrow">
      <h2 id="res-title">Sortie complete</h2>
      <div class="scoreboard" id="res-board"></div>
      <button class="big" id="btn-again">FLY AGAIN</button>
      <button class="ghost" id="btn-results-menu">CHANGE FIGHTER</button>
    </div>
  </div>
  <div id="crash" class="overlay hidden">
    <div class="panel narrow">
      <h2 id="crash-title">Crashed</h2>
      <p id="crash-text"></p>
      <button class="big" id="btn-retry">TRY AGAIN</button>
      <button class="ghost" id="btn-crash-menu">CHANGE FIGHTER</button>
    </div>
  </div>`;

  const $ = (id) => root.querySelector(`#${id}`);
  const attitude = $('attitude');
  const actx = attitude.getContext('2d');
  // Attitude ball at device pixels: the canvas is 150 CSS px wide, so on
  // a DPR-2 phone its 150x150 backing was upscaled 2x and read blurry.
  // Backing is 150*dpr, the 2d transform keeps all drawing in 150-space.
  const attitudeDpr = Math.min(window.devicePixelRatio || 1, 2);
  attitude.width = 150 * attitudeDpr;
  attitude.height = 150 * attitudeDpr;
  actx.setTransform(attitudeDpr, 0, 0, attitudeDpr, 0, 0);
  // Touch controls exist only on coarse-pointer devices (phones/tablets):
  // on desktop the touch layer stays hidden and the keyboard HUD is used.
  const isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  if (isTouch) root.classList.add('touch');
  let selectedCraft = 'kawasemi';
  let selectedSortie = 'first-mail';
  let previewRenderer = null;
  let previewScene = null;
  let previewModel = null;
  let previewAngle = 0;
  let toastTimer = null;

  function renderCraftCards() {
    $('craft-cards').innerHTML = AIRCRAFT_ORDER.map((id) => {
      const a = AIRCRAFT[id];
      return `<div class="card ${id === selectedCraft ? 'sel' : ''}" data-craft="${id}">
        <div class="swatch" style="background:#${a.color.toString(16).padStart(6, '0')}"></div>
        <b>${a.name}</b><i>${a.role}</i>
        <div class="stats">SPD ${bar(a.speed, 5)} AGL ${bar(a.agility, 5)} STB ${bar(a.stabilityBar, 5)}</div>
      </div>`;
    }).join('');
    root.querySelectorAll('[data-craft]').forEach((el) => {
      el.addEventListener('click', () => {
        selectedCraft = el.dataset.craft;
        renderCraftCards();
        renderPreview();
        callbacks.onPickCraft?.(selectedCraft);
      });
    });
    $('craft-desc').textContent = AIRCRAFT[selectedCraft].blurb;
  }

  function renderSortieCards() {
    const timeLabel = { day: 'siang', dusk: 'sore', night: 'malam' };
    $('sortie-cards').innerHTML = SORTIES.map((s) => `
      <div class="card ${s.id === selectedSortie ? 'sel' : ''}" data-sortie="${s.id}">
        <b>${s.name}</b><i>${s.rings.length} rings · ${timeLabel[s.timeOfDay] || 'siang'}${s.wind.gust >= 1 ? ', crosswind' : s.wind.gust > 0 ? ', gusty' : ', calm'}</i>
        <span>${s.from} → ${s.to}</span>
      </div>`).join('');
    root.querySelectorAll('[data-sortie]').forEach((el) => {
      el.addEventListener('click', () => {
        selectedSortie = el.dataset.sortie;
        renderSortieCards();
      });
    });
  }

  function renderPreview() {
    try {
      if (!previewRenderer) {
        const canvas = $('preview');
        previewRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        // Menu preview at device pixels: without this the 340x190 backing
        // was upscaled on DPR-2 phones and the fighter read pixelated.
        previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        previewRenderer.setSize(340, 190, false);
        previewScene = new THREE.Scene();
        previewScene.add(new THREE.AmbientLight(0xffffff, 0.9));
        const dir = new THREE.DirectionalLight(0xffffff, 1.4);
        dir.position.set(4, 6, 6);
        previewScene.add(dir);
        const cam = new THREE.PerspectiveCamera(42, 340 / 190, 0.1, 100);
        cam.position.set(0, 3.2, 13);
        cam.lookAt(0, 0, 0);
        previewScene.userData.camera = cam;
      }
      if (previewModel) {
        previewScene.remove(previewModel.group);
        previewModel = null;
      }
      previewModel = buildAircraftModel(selectedCraft);
      previewScene.add(previewModel.group);
    } catch { /* preview is decoration */ }
  }

  function tickPreview() {
    if (!previewRenderer || !previewModel || $('menu').classList.contains('hidden')) return;
    previewAngle += 0.012;
    previewModel.group.rotation.y = previewAngle;
    previewModel.group.rotation.x = 0.08;
    previewRenderer.render(previewScene, previewScene.userData.camera);
  }

  function drawAttitude(flight) {
    const w = 150;
    const h = 150;
    const cx = w / 2;
    const cy = h / 2;
    actx.clearRect(0, 0, w, h);
    actx.save();
    actx.beginPath();
    actx.arc(cx, cy, 66, 0, Math.PI * 2);
    actx.clip();
    actx.translate(cx, cy);
    actx.rotate(-flight.bank);
    actx.translate(0, flight.pitch * 220);
    actx.fillStyle = '#3a7bd5';
    actx.fillRect(-90, -120, 180, 120);
    actx.fillStyle = '#7a5a34';
    actx.fillRect(-90, 0, 180, 120);
    actx.strokeStyle = '#ffffff';
    actx.lineWidth = 2;
    actx.beginPath();
    actx.moveTo(-90, 0);
    actx.lineTo(90, 0);
    actx.stroke();
    // Pitch ladder: short white ticks every 10 degrees above and below
    // the horizon, so the ball reads as an instrument, not a flat disc.
    actx.strokeStyle = 'rgba(255,255,255,0.7)';
    actx.lineWidth = 1.5;
    for (const off of [-44, -22, 22, 44]) {
      const w = off % 44 === 0 ? 26 : 16;
      actx.beginPath();
      actx.moveTo(-w, off);
      actx.lineTo(w, off);
      actx.stroke();
    }
    actx.restore();
    actx.strokeStyle = '#ffffff';
    actx.lineWidth = 2;
    actx.beginPath();
    actx.arc(cx, cy, 66, 0, Math.PI * 2);
    actx.stroke();
    actx.fillStyle = '#ffcc00';
    actx.beginPath();
    actx.moveTo(cx - 26, cy);
    actx.lineTo(cx - 8, cy);
    actx.lineTo(cx + 8, cy);
    actx.lineTo(cx + 26, cy);
    actx.stroke();
    actx.beginPath();
    actx.arc(cx, cy, 3, 0, Math.PI * 2);
    actx.fill();
    // Heading tape under the ball.
    const hdg = Math.round(((flight.heading * 180) / Math.PI % 360 + 360) % 360);
    actx.fillStyle = 'rgba(0,0,0,0.55)';
    actx.fillRect(cx - 30, h - 20, 60, 18);
    actx.fillStyle = '#ffffff';
    actx.font = 'bold 12px system-ui, sans-serif';
    actx.textAlign = 'center';
    actx.fillText(String(hdg).padStart(3, '0'), cx, h - 7);
  }

  function show(id) { $(id).classList.remove('hidden'); }
  function hide(id) { $(id).classList.add('hidden'); }
  function hideAllOverlays() {
    for (const id of ['menu', 'briefing', 'pause', 'results', 'crash']) hide(id);
  }

  root.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => callbacks.onAction?.(btn.dataset.action));
  });
  $('btn-start').addEventListener('click', () => {
    callbacks.onStart?.(selectedCraft, selectedSortie);
  });
  $('btn-fly').addEventListener('click', () => callbacks.onFly?.());
  $('btn-resume').addEventListener('click', () => callbacks.onResume?.());
  $('btn-restart').addEventListener('click', () => callbacks.onRestart?.());
  $('btn-menu').addEventListener('click', () => callbacks.onMenu?.());
  $('btn-again').addEventListener('click', () => callbacks.onRestart?.());
  $('btn-results-menu').addEventListener('click', () => callbacks.onMenu?.());
  $('btn-retry').addEventListener('click', () => callbacks.onRestart?.());
  $('btn-crash-menu').addEventListener('click', () => callbacks.onMenu?.());

  // ---- Touch flight controls (stick + throttle slider + BRAKE) ----
  // Pointer events with setPointerCapture, so a finger sliding off the
  // element keeps steering until it lifts. Values flow to input.js via
  // callbacks; the HUD only owns the DOM, never the flight model.
  const stick = $('stick');
  const stickKnob = $('stick-knob');
  const thrSlider = $('thr-slider');
  const thrHandle = $('thr-handle');
  const STICK_R = 40; // px of knob travel from centre = full deflection
  let stickPointer = null;
  function stickCenter() {
    const b = stick.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }
  function stickMove(clientX, clientY) {
    const c = stickCenter();
    let dx = clientX - c.x;
    let dy = clientY - c.y;
    const len = Math.hypot(dx, dy);
    if (len > STICK_R) { dx = (dx / len) * STICK_R; dy = (dy / len) * STICK_R; }
    stickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    callbacks.onTouchSteer?.(-dy / STICK_R, dx / STICK_R);
  }
  function stickEnd() {
    stickPointer = null;
    stickKnob.style.transform = 'translate(-50%, -50%)';
    callbacks.onTouchSteer?.(0, 0);
  }
  stick.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    stickPointer = event.pointerId;
    stick.setPointerCapture(event.pointerId);
    stickMove(event.clientX, event.clientY);
  });
  stick.addEventListener('pointermove', (event) => {
    if (event.pointerId !== stickPointer) return;
    stickMove(event.clientX, event.clientY);
  });
  stick.addEventListener('pointerup', (event) => {
    if (event.pointerId === stickPointer) stickEnd();
  });
  stick.addEventListener('pointercancel', (event) => {
    if (event.pointerId === stickPointer) stickEnd();
  });
  function sliderSet(clientY) {
    const b = thrSlider.getBoundingClientRect();
    const v = Math.max(0, Math.min(1, 1 - (clientY - b.y) / b.height));
    callbacks.onTouchThrottle?.(v);
    thrHandle.style.bottom = `${v * 100}%`;
  }
  let sliderPointer = null;
  thrSlider.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    sliderPointer = event.pointerId;
    thrSlider.setPointerCapture(event.pointerId);
    sliderSet(event.clientY);
  });
  thrSlider.addEventListener('pointermove', (event) => {
    if (event.pointerId !== sliderPointer) return;
    sliderSet(event.clientY);
  });
  function sliderEnd(event) {
    if (event.pointerId === sliderPointer) sliderPointer = null;
  }
  thrSlider.addEventListener('pointerup', sliderEnd);
  thrSlider.addEventListener('pointercancel', sliderEnd);
  const brakeBtn = $('btn-brake');
  brakeBtn.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    brakeBtn.classList.add('held');
    callbacks.onTouchBrake?.(true);
  });
  function brakeEnd() {
    brakeBtn.classList.remove('held');
    callbacks.onTouchBrake?.(false);
  }
  brakeBtn.addEventListener('pointerup', brakeEnd);
  brakeBtn.addEventListener('pointercancel', brakeEnd);
  brakeBtn.addEventListener('pointerleave', brakeEnd);

  renderCraftCards();
  renderSortieCards();
  renderPreview();

  return {
    tickPreview,
    showMenu() {
      hideAllOverlays();
      hide('hud');
      show('menu');
      renderCraftCards();
      renderSortieCards();
      renderPreview();
    },
    showBriefing(sortie, craft) {
      hideAllOverlays();
      $('brief-title').textContent = `${sortie.name} — ${craft.name}`;
      $('brief-text').textContent = `${sortie.brief} Fly ${sortie.rings.length} rings, then land at ${sortie.to === 'merpati' ? 'Merpati Field' : 'Kenari Strip'}. Watch your fuel, mind the stall speed, gear down before you land.`;
      show('briefing');
    },
    showPause() { show('pause'); },
    hidePause() { hide('pause'); },
    showHud() {
      hideAllOverlays();
      show('hud');
    },
    showResults(mission) {
      hideAllOverlays();
      hide('hud');
      $('res-title').textContent = mission.failed ? 'Sortie failed' : 'Sortie complete';
      const rings = mission.ringScore;
      const rows = [
        ['Rings', `${mission.ringIndex}/${mission.rings.length} — ${rings} pts`],
        ['Landing', `${mission.landingScore} pts`],
        ['Time bonus', `${mission.timeBonus} pts`],
        ['Fuel bonus', `${mission.fuelBonus} pts`],
        ['TOTAL', `${mission.score} pts`],
      ];
      $('res-board').innerHTML = rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
      show('results');
    },
    showCrash(reason) {
      hideAllOverlays();
      hide('hud');
      $('crash-title').textContent = 'Crashed';
      $('crash-text').textContent = `${reason}. The mail is in the lagoon.`;
      show('crash');
    },
    toast(text) {
      const el = $('toast');
      el.textContent = text;
      el.classList.remove('hidden');
      if (toastTimer) window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => el.classList.add('hidden'), 2400);
    },
    update(flight, mission, spec) {
      drawAttitude(flight);
      const knots = Math.round(flight.speed * 1.944);
      $('ro-ias').textContent = knots;
      $('ro-alt').textContent = Math.round(flight.y * 3.281);
      $('ro-hdg').textContent = String(Math.round(((flight.heading * 180) / Math.PI % 360 + 360) % 360)).padStart(3, '0');
      $('ro-vs').textContent = Math.round(flight.vspeed * 196.85);
      $('craft-badge').textContent = spec.name;
      const tod = mission.sortie.timeOfDay;
      $('time-badge').textContent = tod === 'night' ? 'MALAM' : tod === 'dusk' ? 'SORE' : 'SIANG';
      $('hud').classList.toggle('night', tod === 'night');
      $('objective').textContent = objectiveText(mission);
      $('score').textContent = mission.score;
      const ring = nextRing(mission);
      const target = ring || null;
      let dist = 0;
      let bearing = 0;
      if (target) {
        dist = Math.hypot(target.x - flight.x, target.y - flight.y, target.z - flight.z);
        bearing = headingTo(flight.x, flight.z, target.x, target.z);
      } else if (mission.phase === 'final') {
        const field = AIRFIELDS[mission.sortie.to];
        dist = Math.hypot(field.x - flight.x, field.z - flight.z);
        bearing = headingTo(flight.x, flight.z, field.x, field.z);
      }
      const rel = ((bearing - flight.heading) * 180) / Math.PI;
      $('dir-arrow').style.transform = `rotate(${Math.round(rel - 90)}deg)`;
      $('dir-dist').textContent = `${Math.round(dist)} m`;
      $('rings').innerHTML = mission.rings.map((r, i) => `<span class="${r.passed ? 'done' : i === mission.ringIndex ? 'next' : ''}">◯</span>`).join('');
      $('thr-fill').style.width = `${Math.round(flight.throttle * 100)}%`;
      $('thr-pct').textContent = `${Math.round(flight.throttle * 100)}%`;
      // Keep the touch throttle handle in sync when throttle moves from
      // any other source (keys, wheel, autopilot shots).
      const thrHandle = $('thr-handle');
      if (thrHandle) thrHandle.style.bottom = `${Math.round(flight.throttle * 100)}%`;
      $('fuel-fill').style.width = `${Math.round(flight.fuel * 100)}%`;
      $('fuel-pct').textContent = `${Math.round(flight.fuel * 100)}%`;
      $('flag-gear').className = flight.gearDown ? 'on' : 'off';
      $('flag-flap').className = flight.flaps > 0 ? 'on' : 'off';
      $('flag-dmg').textContent = `DMG ${Math.round(flight.damage * 100)}%`;
      const warn = $('warn');
      let warnText = '';
      if (flight.stalled) warnText = 'STALL';
      else if (flight.engineOut) warnText = 'ENGINE OUT — GLIDE';
      else if (flight.fuel < 0.15 && !flight.onGround) warnText = 'LOW FUEL';
      else if (mission.phase === 'final' && !flight.gearDown && flight.y < 200) warnText = 'GEAR UP';
      if (warnText) {
        warn.textContent = warnText;
        warn.classList.remove('hidden');
      } else {
        warn.classList.add('hidden');
      }
    },
  };
}
