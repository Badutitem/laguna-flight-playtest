// Arcade flight physics, one job: move the aircraft the way its stats say it
// should move. Heading is clockwise from north (-Z): forward is
// (sin h, 0, -cos h). Speed in m/s, angles in radians, heights in metres.
import { AIRFIELDS } from './config.js';
import { heightAt } from './terrain.js';

export const EVENT_NONE = 0;
export const EVENT_LANDED = 1;
export const EVENT_CRASH = 2;
export const EVENT_STALL = 4;
export const EVENT_FUEL_EMPTY = 8;
export const EVENT_TOUCHDOWN = 16;

export function headingTo(x1, z1, x2, z2) {
  return Math.atan2(x2 - x1, -(z2 - z1));
}

function angleDelta(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Which runway, if any, is under (x, z)? Returns { field, along, across }.
export function runwayAt(x, z) {
  for (const field of Object.values(AIRFIELDS)) {
    const rad = (field.headingDeg * Math.PI) / 180;
    const dx = x - field.x;
    const dz = z - field.z;
    const along = dx * Math.sin(rad) - dz * Math.cos(rad);
    const across = dx * Math.cos(rad) + dz * Math.sin(rad);
    if (Math.abs(along) < field.length / 2 && Math.abs(across) < field.width / 2) {
      return { field, along, across };
    }
  }
  return null;
}

export function createFlightState(spec, field, fuelFraction) {
  const rad = (field.headingDeg * Math.PI) / 180;
  // Parked just past the threshold, facing down the runway.
  const x = field.x - Math.sin(rad) * (field.length / 2 - 80);
  const z = field.z + Math.cos(rad) * (field.length / 2 - 80);
  return {
    x, y: field.elevation + 1.5, z,
    heading: rad, pitch: 0, bank: 0,
    speed: 0, throttle: 0, fuel: fuelFraction,
    damage: 0, gearDown: true, flaps: 0, brake: false,
    onGround: true, engineOut: false, stalled: false,
    vspeed: 0, time: 0, crashReason: '', landed: false,
  };
}

function approach(value, target, rate, dt) {
  const d = target - value;
  const step = Math.max(-rate * dt, Math.min(rate * dt, d));
  return value + step;
}

// Advance one fixed step. `input` is { pitch, roll, throttle, flaps, gear, brake }
// with pitch/roll in -1..1. Returns an event bitmask.
export function stepFlight(state, input, spec, wind, dt) {
  let events = EVENT_NONE;
  state.time += dt;
  const wasStalled = state.stalled;

  // Throttle and fuel.
  state.throttle = Math.min(1, Math.max(0, input.throttle));
  if (state.fuel > 0) {
    state.fuel -= (0.12 + state.throttle * 0.88) * spec.fuelBurn * dt / 900;
    if (state.fuel <= 0) {
      state.fuel = 0;
      state.engineOut = true;
      events |= EVENT_FUEL_EMPTY;
    }
  }
  const throttle = state.engineOut ? 0 : state.throttle;

  // Stall state: below stall speed the wing quits and the nose drops.
  const stallSpeed = spec.stallSpeed * (state.flaps > 0 ? 0.88 : 1);
  state.stalled = !state.onGround && state.speed < stallSpeed;
  if (state.stalled && !wasStalled) events |= EVENT_STALL;
  const authority = state.onGround ? 1 : Math.min(1, Math.max(0.35, state.speed / stallSpeed));

  if (state.onGround) {
    // Rolling: throttle pushes, brake and drag hold back.
    const push = throttle * spec.accel * 1.6;
    const drag = state.brake ? 14 : 1.2 + state.speed * 0.02;
    state.speed = Math.max(0, state.speed + (push - drag) * dt);
    // Gentle taxi steering with the roll keys.
    state.heading += input.roll * 0.35 * dt * Math.min(1, state.speed / 15);
    state.pitch = 0;
    state.bank = 0;
    // Rolling down the runway actually moves the aircraft.
    state.x += Math.sin(state.heading) * state.speed * dt;
    state.z += -Math.cos(state.heading) * state.speed * dt;
    if (state.speed >= spec.rotateSpeed && input.pitch > 0.25) {
      state.onGround = false;
      state.pitch = 0.14;
    }
    state.vspeed = 0;
  } else {
    // Air: bank turns the nose, pitch sets the flight path.
    const maxBank = 1.15;
    const targetBank = input.roll * maxBank;
    state.bank = approach(state.bank, targetBank, spec.rollRate, dt);
    if (Math.abs(input.roll) < 0.05) {
      state.bank = approach(state.bank, 0, spec.stability * 1.4, dt);
    }
    const turnRate = (9.81 * Math.tan(state.bank)) / Math.max(state.speed, 15);
    state.heading += turnRate * dt;
    // Gusts shove the nose around; stable aircraft shrug most of it off.
    if (wind.gust > 0) {
      const gustStrength = (1 - spec.stability) * wind.gust;
      state.heading += Math.sin(state.time * 1.7) * 0.03 * gustStrength * dt;
      state.bank += Math.sin(state.time * 2.3 + 1) * 0.12 * gustStrength * dt;
    }
    const targetPitch = input.pitch * 0.42;
    state.pitch = approach(state.pitch, targetPitch, 0.9 * authority, dt);
    if (Math.abs(input.pitch) < 0.05) {
      state.pitch = approach(state.pitch, 0, spec.stability * 0.5, dt);
    }
    if (state.stalled) state.pitch = approach(state.pitch, -0.18, 0.8, dt);

    // Speed: throttle sets a target, climbing bleeds it, diving restores it.
    const targetSpeed = stallSpeed + (spec.maxSpeed - stallSpeed) * (0.12 + 0.88 * throttle);
    const accel = throttle > 0.05 ? spec.accel : 7;
    state.speed += Math.max(-7 * dt, Math.min(accel * dt, targetSpeed - state.speed));
    state.speed -= Math.sin(state.pitch) * 9.81 * 0.45 * dt;
    state.speed = Math.max(8, state.speed);

    // Vertical speed from the flight path, plus the stall sink.
    state.vspeed = state.speed * Math.sin(state.pitch);
    if (state.stalled) state.vspeed -= (stallSpeed - state.speed) * 1.6;
    state.y += state.vspeed * dt;
    state.x += Math.sin(state.heading) * Math.cos(state.pitch) * state.speed * dt;
    state.z += -Math.cos(state.heading) * Math.cos(state.pitch) * state.speed * dt;
  }

  // Ground and water contact.
  const ground = heightAt(state.x, state.z);
  const agl = state.y - ground;
  if (!state.onGround && agl <= 1.2 && state.vspeed <= 0) {
    const strip = runwayAt(state.x, state.z);
    if (ground < 0.5) {
      state.crashReason = 'Ditched in the sea';
      return EVENT_CRASH;
    }
    const soft = state.vspeed > -4.5 && Math.abs(state.bank) < 0.25 && state.speed < stallSpeed * 2.0;
    if (strip && state.gearDown && soft) {
      state.onGround = true;
      state.landed = true;
      state.y = strip.field.elevation + 1.5;
      state.pitch = 0;
      state.bank = 0;
      state.vspeed = 0;
      events |= EVENT_LANDED | EVENT_TOUCHDOWN;
      state.touchdown = {
        field: strip.field, vspeed: state.vspeed, across: strip.across,
        speed: state.speed, headingError: Math.abs(angleDelta(state.heading, (strip.field.headingDeg * Math.PI) / 180)),
      };
    } else if (strip && !state.gearDown) {
      state.crashReason = 'Belly landing: gear was up';
      return EVENT_CRASH;
    } else if (!strip && soft && state.gearDown && state.speed < stallSpeed * 1.8) {
      // A gentle field landing: survivable, but rough and scored as such.
      state.onGround = true;
      state.landed = true;
      state.y = ground + 1.5;
      state.damage += 0.25;
      state.pitch = 0;
      state.bank = 0;
      events |= EVENT_LANDED | EVENT_TOUCHDOWN;
      state.touchdown = { field: null, vspeed: state.vspeed, across: 999, speed: state.speed, headingError: 0 };
    } else {
      state.crashReason = state.vspeed <= -9 ? 'Hit the ground too hard' : 'Crashed into terrain';
      return EVENT_CRASH;
    }
  }
  if (state.onGround) {
    state.y = heightAt(state.x, state.z) + 1.5;
    const strip = runwayAt(state.x, state.z);
    if (strip) state.y = strip.field.elevation + 1.5;
  }
  return events;
}

export { angleDelta };
