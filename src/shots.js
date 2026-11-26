// Screenshot presets: ?shot=start|play|end with &craft=&sortie=&stopRing=.
// A simple autopilot flies the sortie forward in a tight loop (no rendering
// per step), so a screenshot can be staged at a chosen moment: on the runway,
// mid-ring, or on final approach. The game itself is always flown by hand.
import { AIRFIELDS } from './config.js';
import { EVENT_CRASH } from './flightModel.js';
import { headingTo, angleDelta, stepFlight, runwayAt } from './flightModel.js';
import { heightAt } from './terrain.js';
import { nextRing, updateMission } from './missions.js';

export function parseShotParams() {
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  if (!shot) return null;
  return {
    shot,
    craft: params.get('craft') || 'kawasemi',
    sortie: params.get('sortie') || 'first-mail',
    stopRing: parseInt(params.get('stopRing') || '2', 10),
    maxSeconds: parseInt(params.get('maxSeconds') || '240', 10),
    camera: params.get('camera') || 'chase',
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Steer toward the next objective: ring, then the destination threshold.
// Rings are flown in two parts: line up 600 m before the ring along its
// approach normal, then a straight, slow run through the centre. Aiming
// straight at a ring from far away ends in an orbit around it, never through.
export function autopilotControl(flight, mission, spec, wind, straight = false) {
  const ring = nextRing(mission);
  let targetX;
  let targetY;
  let targetZ;
  let landing = false;
  let landingOnFinal = false;
  let landingAcross = 0;
  let landingAlong = 0;
  let ringDist = Infinity;
  if (ring) {
    ringDist = Math.hypot(ring.x - flight.x, ring.y - flight.y, ring.z - flight.z);
    // Line up farther out when fast: a 175 m/s needle needs more room to
    // turn onto the ring than a 120 m/s heavy fighter.
    const lineupDist = Math.min(1200, Math.max(600, flight.speed * 8));
    if (ringDist > lineupDist) {
      targetX = ring.x - ring.nx * lineupDist;
      targetY = ring.y - ring.ny * lineupDist;
      targetZ = ring.z - ring.nz * lineupDist;
    } else {
      targetX = ring.x;
      targetY = ring.y;
      targetZ = ring.z;
    }
  } else {
    const field = AIRFIELDS[mission.sortie.to];
    const rad = (field.headingDeg * Math.PI) / 180;
    const fwdX = Math.sin(rad);
    const fwdZ = -Math.cos(rad);
    const dx = flight.x - field.x;
    const dz = flight.z - field.z;
    // Along the runway: negative is on the approach side, positive is past
    // the threshold. Only a plane on the approach side, near the centreline,
    // is on final; anything else goes around to the line-up point first.
    // Once on final the latch holds until the plane is 1500 m past the
    // field, or the target would flip-flop every time it crosses the
    // threshold and the sortie would never land.
    const along = dx * fwdX + dz * fwdZ;
    const across = dx * Math.cos(rad) + dz * Math.sin(rad);
    landingAlong = along;
    landingAcross = across;
    if (along < -300 && Math.abs(across) < 500) mission._finalLatched = true;
    if (along > 1500) mission._finalLatched = false;
    landingOnFinal = !!mission._finalLatched;
    if (landingOnFinal) {
      // Short final: aim 1200 m past the threshold so the run down the
      // centreline converges instead of drifting parallel to it, 3000 m was
      // too far and let a 300 m offset survive all the way past the runway.
      // The altitude target rides a two-segment glidepath: 12% far out to
      // clear the rising ground around the field, 6% inside 400 m so the
      // sink rate at the wheels is inside the touchdown window instead of
      // a hard arrival.
      const distToThreshold = Math.max(0, -along);
      targetX = field.x + fwdX * 1200;
      targetY = field.elevation + distToThreshold * 0.06 + Math.max(0, distToThreshold - 400) * 0.06;
      targetZ = field.z + fwdZ * 1200;
    } else {
      // Line up on the runway heading, at 170 m. The distance scales with
      // the aircraft's top speed: a 175 m/s needle needs more room to turn
      // onto final than a 120 m/s heavy fighter.
      const lineupDist = 2000 * (spec.maxSpeed / 150);
      targetX = field.x - fwdX * lineupDist;
      targetY = field.elevation + 170;
      targetZ = field.z - fwdZ * lineupDist;
    }
    landing = true;
  }
  const control = {
    pitch: 0, roll: 0, throttle: 0.72, brake: false,
    flaps: flight.flaps, gear: true,
  };
  if (flight.onGround) {
    control.throttle = 1;
    control.pitch = flight.speed > spec.rotateSpeed ? 1 : 0;
    control.roll = 0;
    control.gear = true;
    return control;
  }
  const desiredHeading = headingTo(flight.x, flight.z, targetX, targetZ);
  const headingErr = angleDelta(desiredHeading, flight.heading);
  if (straight) {
    control.roll = 0; // takeoff shot: wings level, straight ahead
  } else if (ring && ringDist <= 300 && Math.abs(headingErr) < 0.35) {
    control.roll = 0; // straight run through the ring
  } else {
    control.roll = clamp(headingErr * 1.6, -1, 1);
  }
  if (landingOnFinal) {
    // Cross-track correction, applied out to 400 m of the centreline with
    // a firm gain: the old 200 m / 0.003 let a 300 m offset survive until
    // the runway was already behind the plane.
    if (Math.abs(landingAcross) < 400) {
      control.roll = clamp(control.roll - landingAcross * 0.006, -1, 1);
    }
  }
  const altErr = targetY - flight.y;
  control.pitch = clamp(altErr / 130, -0.55, 0.55);
  // Climb hard while very low so the hills never win.
  const agl = flight.y - heightAt(flight.x, flight.z);
  if (agl < 40) control.pitch = Math.max(control.pitch, 0.3);
  if (flight.stalled) control.pitch = 0.4;
  if (ring) control.throttle = ringDist > 1200 ? 0.72 : (ringDist > 400 ? 0.2 : 0.08);
  if (landing) {
    if (landingOnFinal) {
      // Short final: fly straight down the centreline, low and slow, gear
      // and flaps down. The glidepath target makes the descent steep early
      // and soft at the flare, so the sink rate is inside the touchdown
      // window when the wheels meet the runway. The ground-clearance floor
      // stays on until the plane is actually over the runway, or the rising
      // ground around the field eats the approach.
      control.throttle = 0.05;
      control.flaps = 1;
      control.gear = true;
      control.pitch = clamp((targetY - flight.y) / 40, -0.45, 0.15);
      // The ground-clearance floor stays on until the plane is over the
      // landing corridor (40 m either side of the centreline, over the
      // runway), or the rising ground around the field eats the approach.
      const overCorridor = Math.abs(landingAcross) < 40 && landingAlong > -600 && landingAlong < 600;
      if (agl < 15 && !overCorridor) {
        control.pitch = Math.max(control.pitch, 0.25);
      }
    } else {
      // Lining up: 170 m, gear and flaps down, ready for final. Slow to
      // approach speed first: a fast aircraft arriving at the line-up
      // point at cruise speed cannot turn onto the runway heading in time
      // and keeps missing the centreline by a hundred metres.
      control.throttle = 0.15;
      control.flaps = 1;
      control.gear = true;
    }
  } else {
    // Gear up once airborne; only the landing run brings it back down.
    control.gear = false;
  }
  return control;
}

// Fly the sortie forward until the preset's stop condition, or the crash.
export function runShotSim(world, flight, mission, spec, wind, preset) {
  const dt = 1 / 60;
  const maxSteps = preset.maxSeconds * 60;
  let steps = 0;
  let stopped = 'timeout';
  let airborneAt = -1;
  const trace = [];
  for (let i = 0; i < maxSteps; i += 1) {
    steps += 1;
    const control = autopilotControl(flight, mission, spec, wind, preset.shot === 'start');
    flight.flaps = control.flaps;
    flight.gearDown = control.gear;
    const events = stepFlight(flight, control, spec, wind, dt);
    updateMission(mission, flight, events, flight.time);
    if (i % 600 === 0) {
      trace.push([
        Math.round(flight.x), Math.round(flight.y), Math.round(flight.z),
        Math.round(((flight.heading * 180) / Math.PI % 360 + 360) % 360),
        Math.round(flight.speed),
        Math.round(control.pitch * 100) / 100,
        Math.round((flight.y - heightAt(flight.x, flight.z)) * 10) / 10,
      ]);
    }
    if (events & EVENT_CRASH) {
      stopped = 'crash';
      break;
    }
    if (!flight.onGround && airborneAt < 0) airborneAt = flight.time;
    if (preset.shot === 'start' && flight.onGround && flight.speed > 28) {
      stopped = 'roll';
      break;
    }
    if (preset.shot === 'play' && mission.ringIndex >= preset.stopRing) {
      // A few more seconds past the ring so the next one is ahead in frame.
      // In the cockpit the shot also waits for wings level: a banked
      // cockpit frame is filled by the rising wing, which reads as a giant
      // slab across the view and hides the panel and the world.
      const levelOk = preset.camera !== 'cockpit' || Math.abs(flight.bank) < 0.15;
      if ((mission.ringIndex > preset.stopRing || flight.time - mission.lastRingAt > 4) && levelOk) {
        stopped = 'ring';
        break;
      }
    }
    if (preset.shot === 'end' && mission.phase === 'final') {
      const field = AIRFIELDS[mission.sortie.to];
      const dist = Math.hypot(field.x - flight.x, field.z - flight.z);
      const toField = headingTo(flight.x, flight.z, field.x, field.z);
      const aligned = Math.abs(angleDelta(toField, flight.heading)) < 0.35;
      const level = Math.abs(flight.bank) < 0.2;
      // On the centreline, not just near the field: the old stop fired
      // while the plane was 200 m off the centreline and banking hard.
      const frad = (field.headingDeg * Math.PI) / 180;
      const fdx = flight.x - field.x;
      const fdz = flight.z - field.z;
      const centred = Math.abs(fdx * Math.cos(frad) + fdz * Math.sin(frad)) < 120;
      // Aligned with the RUNWAY heading, not just the field point: the old
      // stop fired mid-turn onto final (heading 318 vs runway 32) and the
      // plane read as banking into a crash. Final approach only.
      const runwayAligned = Math.abs(angleDelta(frad, flight.heading)) < 0.3;
      // Wait until the last ring is well behind the camera, the nose is
      // roughly on the field, the wings are near level and the plane is
      // actually over the centreline, or the runway slides out of frame.
      if (dist < 600 && flight.y < field.elevation + 180 && flight.time - mission.lastRingAt > 6 && aligned && level && centred && runwayAligned) {
        stopped = 'final';
        break;
      }
    }
    if (preset.shot === 'land' && mission.done) {
      stopped = 'done';
      break;
    }
  }
  // Settle the chase camera on the final pose.
  for (let i = 0; i < 80; i += 1) world.update(flight, mission, dt, flight.time);
  return { steps, stopped, ringsPassed: mission.ringIndex, phase: mission.phase, trace };
}
