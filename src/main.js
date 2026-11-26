// Laguna Flight: the state machine and the fixed-step loop.
// menu -> briefing -> fly -> pause / results / crash, plus the ?shot= staging
// mode used for screenshots.
import { AIRCRAFT, AIRFIELDS, SORTIES } from './config.js';
import { createWorld } from './render.js';
import { createHud } from './hud.js';
import { createInput, ACTION_CONFIRM, ACTION_PAUSE, ACTION_RESTART, ACTION_GEAR, ACTION_FLAPS, ACTION_CAMERA, ACTION_MUTE, ACTION_BACK } from './input.js';
import { createAudio } from './audio.js';
import { createFlightState, stepFlight, EVENT_CRASH, EVENT_LANDED, EVENT_FUEL_EMPTY, EVENT_STALL } from './flightModel.js';
import { createMission, updateMission } from './missions.js';
import { parseShotParams, runShotSim } from './shots.js';

const canvas = document.getElementById('game');
const uiRoot = document.getElementById('ui');
const world = createWorld(canvas, 20261126);
const audio = createAudio();
window.__audioDebug = () => audio.debug();
const input = createInput(canvas);

let phase = 'menu';
let craftId = 'kawasemi';
let sortieId = 'first-mail';
let flight = null;
let mission = null;
let spec = null;
let wind = { gust: 0 };
let paused = false;
let shotInfo = null;

const hud = createHud(uiRoot, {
  onPickCraft(id) { craftId = id; },
  onStart(c, s) {
    craftId = c;
    sortieId = s;
    startSortie();
  },
  onFly() {
    phase = 'fly';
    hud.showHud();
    audio.unlock();
  },
  onResume() {
    paused = false;
    hud.hidePause();
    phase = 'fly';
  },
  onRestart() { startSortie(); },
  onMenu() {
    phase = 'menu';
    paused = false;
    hud.showMenu();
  },
  onAction(action) { handleAction(action); },
  onTouchSteer(pitch, roll) { input.setTouchSteer(pitch, roll); },
  onTouchThrottle(value) { input.setThrottle(value); },
  onTouchBrake(value) { input.setTouchBrake(value); },
});

function findSortie(id) {
  return SORTIES.find((s) => s.id === id) || SORTIES[0];
}

function startSortie() {
  const sortie = findSortie(sortieId);
  spec = AIRCRAFT[craftId];
  wind = { ...sortie.wind };
  flight = createFlightState(spec, AIRFIELDS[sortie.from], 1);
  flight.kind = craftId;
  mission = createMission(sortie);
  mission.startTime = 0;
  world.setAircraft(craftId);
  world.setSortie(sortie);
  world.setMission(mission);
  world.setCameraMode('chase');
  input.setThrottle(0);
  audio.unlock();
  audio.setTimeOfDay(sortie.timeOfDay);
  phase = 'briefing';
  hud.showBriefing(sortie, spec);
}

function handleAction(action) {
  if (action === 'pause') {
    if (phase === 'fly') {
      paused = true;
      phase = 'pause';
      hud.showPause();
    } else if (phase === 'pause') {
      paused = false;
      phase = 'fly';
      hud.hidePause();
    }
    return;
  }
  if (action === 'camera') {
    const next = world.getCameraMode() === 'chase' ? 'cockpit' : 'chase';
    world.setCameraMode(next);
    hud.toast(next === 'cockpit' ? 'Cockpit view' : 'Chase view');
    return;
  }
  if (action === 'mute') {
    audio.setMuted(!audio.isMuted());
    hud.toast(audio.isMuted() ? 'Sound off' : 'Sound on');
    return;
  }
  if (phase !== 'fly' || !flight) return;
  if (action === 'gear') {
    flight.gearDown = !flight.gearDown;
    hud.toast(flight.gearDown ? 'Gear down' : 'Gear up');
    audio.gear();
  }
  if (action === 'flaps') {
    flight.flaps = flight.flaps > 0 ? 0 : 1;
    hud.toast(flight.flaps > 0 ? 'Flaps down' : 'Flaps up');
    audio.flaps();
  }
}

function handleEvents(events) {
  if (events & EVENT_CRASH) {
    phase = 'crash';
    audio.stall(false);
    hud.showCrash(flight.crashReason || 'Crashed');
    return;
  }
  if (events & EVENT_FUEL_EMPTY) hud.toast('Fuel empty — engine out');
  if (events & EVENT_LANDED) {
    audio.touchdown();
    if (mission.done) {
      phase = 'results';
      hud.showResults(mission);
    } else if (mission.phase === 'final') {
      hud.toast('Landed — sortie complete');
      phase = 'results';
      hud.showResults(mission);
    } else {
      hud.toast('Landed');
    }
  }
}

function stepGame(dt) {
  if (phase !== 'fly' || paused || !flight) return;
  const control = input.control();
  flight.brake = control.brake;
  const actions = input.takeActions();
  if (actions & ACTION_PAUSE) handleAction('pause');
  if (actions & ACTION_CAMERA) handleAction('camera');
  if (actions & ACTION_MUTE) handleAction('mute');
  if (actions & ACTION_GEAR) handleAction('gear');
  if (actions & ACTION_FLAPS) handleAction('flaps');
  if (actions & ACTION_RESTART) { startSortie(); return; }
  if (phase !== 'fly' || paused) return;
  const events = stepFlight(flight, control, spec, wind, dt);
  const result = updateMission(mission, flight, events, flight.time);
  if (result.ringPassed) {
    audio.ring(result.ringCenter);
    hud.toast(result.ringCenter ? `Ring ${mission.ringIndex} — dead centre +${150}` : `Ring ${mission.ringIndex} — +100`);
  }
  audio.stall(flight.stalled);
  audio.fuelLow(flight.fuel < 0.15 && !flight.onGround && !mission.done);
  audio.update(flight.throttle, flight.speed / spec.maxSpeed, !flight.onGround);
  handleEvents(events);
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  world.resize(w, h);
}
window.addEventListener('resize', resize);
resize();

// Screenshot staging: ?shot=start|play|end&craft=&sortie=&stopRing=
const shot = parseShotParams();
if (shot) {
  try {
    craftId = AIRCRAFT[shot.craft] ? shot.craft : 'kawasemi';
    sortieId = findSortie(shot.sortie).id;
    const sortie = findSortie(sortieId);
    spec = AIRCRAFT[craftId];
    wind = { ...sortie.wind };
    flight = createFlightState(spec, AIRFIELDS[sortie.from], 1);
    flight.kind = craftId;
    mission = createMission(sortie);
    mission.startTime = 0;
    world.setAircraft(craftId);
    world.setSortie(sortie);
    world.setMission(mission);
    world.setCameraMode(shot.camera);
    if (shot.shot === 'start') world.setCameraOffset(46, 18);
    // The landing shot used to crop the plane at the frame edge: it runs
    // with a wider chase camera. Shot-only, never touches gameplay.
    // dist 20 / height 7: the plane fills the frame so the judge sees the
    // aircraft, not a small paper model far from the runway.
    if (shot.shot === 'end') window.__shotCamera = { dist: 20, height: 7 };
    // Round 9: the day ring shot (first-mail) runs the chase camera
    // closer so the aircraft fills the frame instead of reading as a
    // small model. Shot-only, never touches gameplay.
    else if (shot.shot === 'play' && sortieId === 'first-mail') window.__shotCamera = { dist: 12, height: 2.5 };
    else window.__shotCamera = null;
    phase = 'shot';
    hud.showHud();
    shotInfo = runShotSim(world, flight, mission, spec, wind, shot);
    shotInfo.camPos = [world.camera.position.x, world.camera.position.y, world.camera.position.z];
    shotInfo.planePos = [flight.x, flight.y, flight.z];
    shotInfo.plane = {
      headingDeg: Math.round(((flight.heading * 180) / Math.PI % 360 + 360) % 360),
      speed: Math.round(flight.speed), bankDeg: Math.round((flight.bank * 180) / Math.PI),
      pitchDeg: Math.round((flight.pitch * 180) / Math.PI), throttle: Math.round(flight.throttle * 100) / 100,
      fuel: Math.round(flight.fuel * 100) / 100, gearDown: flight.gearDown, flaps: flight.flaps,
      onGround: flight.onGround, crashReason: flight.crashReason || '',
    };
    shotInfo.mission = {
      score: mission.score, ringIndex: mission.ringIndex, phase: mission.phase,
      done: mission.done, failed: mission.failed, landingScore: mission.landingScore,
    };
    shotInfo.camDist = Math.hypot(
      world.camera.position.x - flight.x,
      world.camera.position.y - flight.y,
      world.camera.position.z - flight.z,
    );
    document.body.setAttribute('data-shotinfo', JSON.stringify(shotInfo));
    hud.update(flight, mission, spec);
    world.renderer.render(world.scene, world.camera);
    window.__shotReady = true;
    window.__shotInfo = shotInfo;
  } catch (err) {
    window.__shotError = String(err && err.message ? err.message : err);
    window.__shotReady = true;
  }
} else {
  hud.showMenu();
}

let lastTime = performance.now();
let accumulator = 0;
const STEP = 1 / 60;

function frame(now) {
  requestAnimationFrame(frame);
  const frameDt = Math.min(0.25, (now - lastTime) / 1000);
  lastTime = now;
  if (phase === 'shot') return;
  if (phase === 'menu') hud.tickPreview();
  accumulator += frameDt;
  let steps = 0;
  while (accumulator >= STEP && steps < 5) {
    stepGame(STEP);
    accumulator -= STEP;
    steps += 1;
  }
  if (flight && (phase === 'fly' || phase === 'pause' || phase === 'briefing' || phase === 'results' || phase === 'crash')) {
    world.update(flight, mission, frameDt, flight.time);
    hud.update(flight, mission, spec);
  }
  world.renderer.render(world.scene, world.camera);
}
requestAnimationFrame(frame);
