// Enemy jets for Laguna Flight missions: gun + missile combat, 10 levels.
// Level 1 spawns 5 enemies, each level adds one (4 + level, up to 14 at L10).
// No THREE.js here: plain positions and velocities, so the logic can be
// stepped by the live game and by the screenshot autopilot alike.
// Player gun: hold Space in the air (on the ground Space is still brake)
// or the FIRE button. Player missile: Q / MSL button, only when the charger
// bar is full (charger 1.0) — firing spends the whole charge. Charger fills
// from gun hits (+20%), passing a ring (+15%) and a slow passive trickle.
import {
  CHARGER_PASSIVE_PER_SEC, CHARGER_PER_GUN_HIT,
  ENEMY_KILL_SCORE, MISSILE_KILL_BONUS,
} from './config.js';
import { angleDelta, headingTo } from './flightModel.js';
import { heightAt } from './terrain.js';
import { createRandom } from './random.js';

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

export function createCombat(sortie, mission) {
  const level = sortie.level || 1;
  const count = sortie.enemyCount || (4 + level);
  const rand = createRandom(20261126 + level * 97 + 13);
  const rings = mission.rings.length ? mission.rings : [{ x: 2000, y: 250, z: -1000 }];
  const enemies = [];
  for (let i = 0; i < count; i += 1) {
    const ring = rings[i % rings.length];
    const a = rand() * Math.PI * 2;
    const r = 220 + rand() * 280;
    let x = ring.x + Math.cos(a) * r;
    let z = ring.z + Math.sin(a) * r;
    let y = clamp(ring.y + (rand() - 0.5) * 120, heightAt(x, z) + 80, ring.y + 120);
    // The first two enemies sit on the approach line to the early rings,
    // ahead of the mail route — interceptors the player actually sees in
    // the chase view, instead of all of them orbiting off-frame.
    if (i < 2) {
      const ahead = rings[Math.min(i + 1, rings.length - 1)];
      const back = 300 + i * 120;
      x = ahead.x - (ahead.nx || 0) * back + (i === 0 ? 60 : -60);
      z = ahead.z - (ahead.nz || 0) * back;
      y = ahead.y + 10;
    }
    enemies.push({
      id: i, x, y, z,
      heading: rand() * Math.PI * 2, pitch: 0, bank: 0,
      speed: 62 + level * 4 + rand() * 10,
      hp: level <= 3 ? 1 : level <= 6 ? 2 : 3,
      maxHp: level <= 3 ? 1 : level <= 6 ? 2 : 3,
      alive: true,
      missileCarrier: i % 3 === 2,
      anchor: { x: ring.x, y: ring.y, z: ring.z },
      gunTimer: 1 + rand() * 2,
      missileTimer: 5 + rand() * 5,
    });
  }
  return {
    level, total: count, enemies,
    projectiles: [], missiles: [],
    charger: 0, gunCooldown: 0,
    kills: 0, combatScore: 0,
    explosions: [], rand,
  };
}

export function aliveCount(combat) {
  return combat.enemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0);
}

// Step combat one fixed step. `input` is { firing, missileRequested, simMode }.
// simMode is screenshot staging only: enemy fire is shown but does no damage,
// so the four bounty shots keep their previous staging.
export function updateCombat(combat, flight, mission, dt, input) {
  const events = {
    kills: 0, killScore: 0, playerDamage: 0, gunHit: false,
    gunFired: false, missileFired: false, missileDenied: false,
    enemyMissileActive: false, explosions: [],
  };
  const level = combat.level;
  const fwdX = Math.sin(flight.heading) * Math.cos(flight.pitch);
  const fwdY = Math.sin(flight.pitch);
  const fwdZ = -Math.cos(flight.heading) * Math.cos(flight.pitch);

  // Charger trickle while airborne.
  if (!flight.onGround && !mission.done) {
    combat.charger = Math.min(1, combat.charger + CHARGER_PASSIVE_PER_SEC * dt);
  }

  // Player gun.
  combat.gunCooldown -= dt;
  if (input.firing && !flight.onGround && combat.gunCooldown <= 0) {
    combat.gunCooldown = 0.14;
    combat.projectiles.push({
      x: flight.x + fwdX * 14, y: flight.y + fwdY * 14, z: flight.z + fwdZ * 14,
      vx: fwdX * 600 + fwdX * flight.speed, vy: fwdY * 600, vz: fwdZ * 600 + fwdZ * flight.speed,
      life: 1.1, from: 'player', damage: 1,
    });
    events.gunFired = true;
  }

  // Player missile: only on a full charger, and only with a live target.
  if (input.missileRequested) {
    if (combat.charger < 0.999) {
      events.missileDenied = true;
    } else {
      let best = null;
      let bestDist = 1400;
      for (const e of combat.enemies) {
        if (!e.alive) continue;
        const d = Math.hypot(e.x - flight.x, e.y - flight.y, e.z - flight.z);
        if (d < bestDist) { bestDist = d; best = e; }
      }
      if (!best) {
        events.missileDenied = true;
      } else {
        combat.charger = 0;
        combat.missiles.push({
          x: flight.x + fwdX * 14, y: flight.y - 2, z: flight.z + fwdZ * 14,
          vx: fwdX * 180, vy: fwdY * 180, vz: fwdZ * 180,
          life: 8, from: 'player', target: best, speed: 180, turn: 2.4,
        });
        events.missileFired = true;
      }
    }
  }

  // Enemy AI: chase the player inside 1600 m, otherwise circle the anchor ring.
  for (const e of combat.enemies) {
    if (!e.alive) continue;
    const dx = flight.x - e.x;
    const dy = flight.y - e.y;
    const dz = flight.z - e.z;
    const dist = Math.hypot(dx, dy, dz) || 1;
    const chase = dist < 1600 && !flight.onGround;
    const tx = chase ? flight.x : e.anchor.x;
    const tz = chase ? flight.z : e.anchor.z;
    const desired = headingTo(e.x, e.z, tx, tz);
    const turn = clamp(angleDelta(desired, e.heading), -0.9 * dt, 0.9 * dt);
    e.heading += turn;
    e.bank = clamp(-turn / dt * 0.25, -0.9, 0.9);
    const targetPitch = chase ? clamp(dy / Math.max(dist, 1), -0.3, 0.3) : 0;
    e.pitch += clamp(targetPitch - e.pitch, -0.5 * dt, 0.5 * dt);
    e.x += Math.sin(e.heading) * Math.cos(e.pitch) * e.speed * dt;
    e.z += -Math.cos(e.heading) * Math.cos(e.pitch) * e.speed * dt;
    e.y += Math.sin(e.pitch) * e.speed * dt;
    e.y = Math.max(e.y, heightAt(e.x, e.z) + 40);
    // Stay inside the archipelago: steer back if drifting out.
    if (Math.hypot(e.x, e.z) > 5800) {
      e.heading = headingTo(e.x, e.z, 0, 0);
    }

    // Enemy gun: bursts when the player is ahead and in range.
    e.gunTimer -= dt;
    if (chase && dist < 750 && e.gunTimer <= 0) {
      const toPlayer = Math.atan2(dx, -dz);
      const facing = Math.abs(angleDelta(toPlayer, e.heading));
      if (facing < 0.6) {
        const lead = 0.4;
        const px = flight.x + fwdX * flight.speed * lead;
        const py = flight.y + fwdY * flight.speed * lead;
        const pz = flight.z + fwdZ * flight.speed * lead;
        const len = Math.hypot(px - e.x, py - e.y, pz - e.z) || 1;
        const sp = 380;
        combat.projectiles.push({
          x: e.x, y: e.y, z: e.z,
          vx: ((px - e.x) / len) * sp, vy: ((py - e.y) / len) * sp, vz: ((pz - e.z) / len) * sp,
          life: 2.2, from: 'enemy', damage: 0.07,
        });
      }
      e.gunTimer = Math.max(0.9, 1.7 - level * 0.07) + combat.rand() * 0.5;
    }

    // Enemy missile: only missile carriers, mid range, on a long cooldown.
    e.missileTimer -= dt;
    if (e.missileCarrier && chase && dist > 350 && dist < 1300 && e.missileTimer <= 0) {
      const len = dist;
      combat.missiles.push({
        x: e.x, y: e.y, z: e.z,
        vx: (dx / len) * 140, vy: (dy / len) * 140, vz: (dz / len) * 140,
        life: 6.5, from: 'enemy', target: null, speed: 150, turn: 1.4,
      });
      e.missileTimer = Math.max(6, 9.5 - level * 0.35) + combat.rand() * 2;
    }
  }

  // Projectiles: move, hit-test, expire.
  const keptProj = [];
  for (const p of combat.projectiles) {
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.life -= dt;
    let dead = p.life <= 0 || p.y < heightAt(p.x, p.z);
    if (!dead && p.from === 'player') {
      for (const e of combat.enemies) {
        if (!e.alive) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y, e.z - p.z) < 22) {
          dead = true;
          e.hp -= 1;
          combat.charger = Math.min(1, combat.charger + CHARGER_PER_GUN_HIT);
          events.gunHit = true;
          if (e.hp <= 0) {
            e.alive = false;
            combat.kills += 1;
            combat.combatScore += ENEMY_KILL_SCORE;
            events.kills += 1;
            events.killScore += ENEMY_KILL_SCORE;
            events.explosions.push({ x: e.x, y: e.y, z: e.z, t: 0 });
          }
          break;
        }
      }
    } else if (!dead && p.from === 'enemy') {
      if (Math.hypot(flight.x - p.x, flight.y - p.y, flight.z - p.z) < 16) {
        dead = true;
        const dmg = input.simMode ? 0 : p.damage;
        flight.damage = Math.min(1, flight.damage + dmg);
        events.playerDamage += dmg;
      }
    }
    if (!dead) keptProj.push(p);
  }
  combat.projectiles = keptProj;

  // Homing missiles: steer toward the target, proximity-fused.
  const keptMissiles = [];
  for (const m of combat.missiles) {
    m.life -= dt;
    let tx; let ty; let tz; let targetAlive = true;
    if (m.from === 'player') {
      if (!m.target || !m.target.alive) targetAlive = false;
      else { tx = m.target.x; ty = m.target.y; tz = m.target.z; }
    } else {
      tx = flight.x; ty = flight.y; tz = flight.z;
    }
    if (targetAlive && m.life > 0) {
      const dx = tx - m.x; const dy = ty - m.y; const dz = tz - m.z;
      const len = Math.hypot(dx, dy, dz) || 1;
      const sp = Math.hypot(m.vx, m.vy, m.vz) || 1;
      const want = [dx / len, dy / len, dz / len];
      const cur = [m.vx / sp, m.vy / sp, m.vz / sp];
      const k = Math.min(1, m.turn * dt);
      const nx = cur[0] + (want[0] - cur[0]) * k;
      const ny = cur[1] + (want[1] - cur[1]) * k;
      const nz = cur[2] + (want[2] - cur[2]) * k;
      const nl = Math.hypot(nx, ny, nz) || 1;
      const speed = m.from === 'player'
        ? Math.min(260, sp + 120 * dt)
        : Math.min(175, sp + 40 * dt);
      m.vx = (nx / nl) * speed; m.vy = (ny / nl) * speed; m.vz = (nz / nl) * speed;
      m.speed = speed;
    }
    m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt;
    let dead = m.life <= 0 || m.y < heightAt(m.x, m.z);
    if (!dead && m.from === 'player' && m.target && m.target.alive) {
      if (Math.hypot(m.target.x - m.x, m.target.y - m.y, m.target.z - m.z) < 22) {
        dead = true;
        m.target.hp -= 3;
        if (m.target.hp <= 0) {
          m.target.alive = false;
          combat.kills += 1;
          combat.combatScore += ENEMY_KILL_SCORE + MISSILE_KILL_BONUS;
          events.kills += 1;
          events.killScore += ENEMY_KILL_SCORE + MISSILE_KILL_BONUS;
          events.explosions.push({ x: m.target.x, y: m.target.y, z: m.target.z, t: 0 });
        }
      }
    } else if (!dead && m.from === 'enemy') {
      events.enemyMissileActive = true;
      if (Math.hypot(flight.x - m.x, flight.y - m.y, flight.z - m.z) < 20) {
        dead = true;
        const dmg = input.simMode ? 0 : 0.18;
        flight.damage = Math.min(1, flight.damage + dmg);
        events.playerDamage += dmg;
        events.explosions.push({ x: flight.x, y: flight.y, z: flight.z, t: 0 });
      }
    }
    if (!dead) keptMissiles.push(m);
  }
  combat.missiles = keptMissiles;
  combat.explosions = events.explosions;
  return events;
}
