// Rings sit in the air: never below the hill they hang over. The clamp keeps
// every ring 130 m above the terrain at its spot, so a sortie is always
// flyable however the config places its waypoints.
import { AIRFIELDS, RING_CENTER_BONUS, RING_RADIUS, RING_SCORE } from './config.js';
import { heightAt } from './terrain.js';
import { EVENT_CRASH, EVENT_LANDED } from './flightModel.js';

export function createMission(sortie) {
  const points = [];
  const from = AIRFIELDS[sortie.from];
  points.push([from.x, from.elevation + 60, from.z]);
  for (const ring of sortie.rings) {
    points.push([ring[0], Math.max(ring[1], heightAt(ring[0], ring[2]) + 130), ring[2]]);
  }
  const to = AIRFIELDS[sortie.to];
  points.push([to.x, to.elevation + 60, to.z]);
  const rings = sortie.rings.map((ring, i) => {
    const alt = Math.max(ring[1], heightAt(ring[0], ring[2]) + 130);
    const prev = points[i];
    const next = points[i + 2] || [to.x, to.elevation + 60, to.z];
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const dz = next[2] - prev[2];
    const len = Math.hypot(dx, dy, dz) || 1;
    return {
      x: ring[0], y: alt, z: ring[2],
      nx: dx / len, ny: dy / len, nz: dz / len,
      passed: false, center: false, index: i,
    };
  });
  return {
    sortie,
    rings,
    ringIndex: 0,
    score: 0,
    ringScore: 0,
    landingScore: 0,
    timeBonus: 0,
    fuelBonus: 0,
    phase: 'takeoff',
    done: false,
    failed: false,
    failReason: '',
    startTime: 0,
    endTime: 0,
    lastRingAt: 0,
    kills: 0,
    combatScore: 0,
  };
}

export function nextRing(mission) {
  return mission.rings[mission.ringIndex] || null;
}

export function objectiveText(mission) {
  if (mission.phase === 'takeoff') return 'Take off and climb';
  if (mission.phase === 'rings') {
    return `Ring ${mission.ringIndex + 1} of ${mission.rings.length}`;
  }
  if (mission.phase === 'final') {
    return `Land at ${AIRFIELDS[mission.sortie.to].name}`;
  }
  return mission.failed ? 'Sortie failed' : 'Sortie complete';
}

function landingPoints(touchdown) {
  if (!touchdown) return 0;
  if (!touchdown.field) return 80; // a field landing: survived, barely counts
  let points = 300;
  const sink = Math.abs(touchdown.vspeed);
  points += Math.max(0, Math.round((4.5 - sink) * 30)); // soft is good, to 135
  points += Math.max(0, Math.round((12 - Math.abs(touchdown.across)) * 4)); // centreline, to 48
  points += touchdown.headingError < 0.12 ? 20 : 0; // aligned
  return Math.min(500, points);
}

// Advance the mission one step. Returns { ringPassed, ringCenter } for feedback.
export function updateMission(mission, flight, events, now) {
  const result = { ringPassed: false, ringCenter: false };
  if (mission.done) return result;
  if (events & EVENT_CRASH) {
    mission.done = true;
    mission.failed = true;
    mission.failReason = flight.crashReason || 'Crashed';
    mission.endTime = now;
    return result;
  }
  if (!flight.onGround && mission.phase === 'takeoff') mission.phase = 'rings';
  const ring = nextRing(mission);
  if (ring && !flight.onGround) {
    const dx = flight.x - ring.x;
    const dy = flight.y - ring.y;
    const dz = flight.z - ring.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < RING_RADIUS) {
      ring.passed = true;
      ring.center = dist < 15;
      mission.ringIndex += 1;
      mission.ringScore += RING_SCORE + (ring.center ? RING_CENTER_BONUS : 0);
      mission.score += RING_SCORE + (ring.center ? RING_CENTER_BONUS : 0);
      mission.lastRingAt = now;
      result.ringPassed = true;
      result.ringCenter = ring.center;
      if (mission.ringIndex >= mission.rings.length) mission.phase = 'final';
    }
  }
  if (events & EVENT_LANDED) {
    const touchdown = flight.touchdown;
    const landedAt = touchdown && touchdown.field ? touchdown.field.id : null;
    if (mission.phase === 'final' && landedAt === mission.sortie.to) {
      mission.landingScore = landingPoints(touchdown);
      mission.score += mission.landingScore;
      const elapsed = now - mission.startTime;
      const par = 150 + mission.rings.length * 25;
      mission.timeBonus = Math.max(0, Math.round((par - elapsed) * 1.5));
      mission.fuelBonus = Math.round(flight.fuel * 100);
      mission.score += mission.timeBonus + mission.fuelBonus;
      mission.done = true;
      mission.endTime = now;
    } else if (landedAt && landedAt !== mission.sortie.from) {
      // Landed somewhere else entirely: the sortie is over, gently.
      mission.landingScore = landingPoints(touchdown);
      mission.score += mission.landingScore;
      mission.done = true;
      mission.endTime = now;
    }
    // Landing back at the departure field before finishing: stay in the sortie.
  }
  return result;
}
