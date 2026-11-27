// Skylark Courier: constants, the five variable fighters and the three sorties.
// One file, one job: every number the rest of the game shares lives here.
//
// The five aircraft are original builds inspired by the twelve anime variable
// fighters in the reference image the user shared: the five most different
// silhouettes and colour schemes of the twelve, picked by grid position:
//  - green angular swept-wing (row 1, right)      -> Kawasemi
//  - red heavy bulky fighter (row 2, centre)      -> Ootaka
//  - blue gunship with the big cannon (row 3, right) -> Oowashi
//  - all-black stealth needle (row 4, right)      -> Hayabusa
//  - white dart with the long purple nose (row 3, centre) -> Tsuru
// Names, colours and stats are our own; no commercial design is copied.
export const STEP = 1 / 60;
export const WORLD_SEED = 7;
export const GRAVITY = 9.81;
export const KNOTS_PER_MS = 1.94384;
export const FEET_PER_M = 3.28084;

// Aircraft: name, role line, look, and the numbers that change how it flies.
// maxSpeed / stallSpeed in m/s; accel in m/s^2; turn and roll in rad/s at full input;
// stability 0..1 (auto-level strength and gust resistance); climb in m/s at full power;
// fuelBurn is a multiplier on the base burn; rotateSpeed in m/s; camera metres behind.
export const AIRCRAFT = {
  kawasemi: {
    id: 'kawasemi',
    name: 'Kawasemi',
    short: 'Kawasemi',
    role: 'Interceptor sayap-sapu',
    blurb: 'Green swept-wing interceptor. Turns on a coin, quick to bite.',
    color: 0x3fae4a,
    maxSpeed: 150, stallSpeed: 34, accel: 12.0, turnRate: 0.95, rollRate: 2.4,
    stability: 0.45, climbRate: 18, fuelBurn: 1.3, rotateSpeed: 40, camDist: 28, camHeight: 7,
    speed: 5, agility: 5, stabilityBar: 2,
  },
  ootaka: {
    id: 'ootaka',
    name: 'Ootaka',
    short: 'Ootaka',
    role: 'Heavy fighter',
    blurb: 'Big red heavy fighter. Slow to turn, rock steady, hard to shake.',
    color: 0xc22e2e,
    maxSpeed: 120, stallSpeed: 36, accel: 7.0, turnRate: 0.45, rollRate: 1.0,
    stability: 0.9, climbRate: 10, fuelBurn: 1.1, rotateSpeed: 48, camDist: 34, camHeight: 9,
    speed: 3, agility: 2, stabilityBar: 5,
  },
  oowashi: {
    id: 'oowashi',
    name: 'Oowashi',
    short: 'Oowashi',
    role: 'Gunship serang',
    blurb: 'Blue attack fighter with a heavy cannon pod. Precise and planted.',
    color: 0x2e6fd8,
    maxSpeed: 135, stallSpeed: 35, accel: 9.0, turnRate: 0.6, rollRate: 1.5,
    stability: 0.75, climbRate: 12, fuelBurn: 1.2, rotateSpeed: 44, camDist: 30, camHeight: 8,
    speed: 4, agility: 3, stabilityBar: 4,
  },
  hayabusa: {
    id: 'hayabusa',
    name: 'Hayabusa',
    short: 'Hayabusa',
    role: 'Stealth needle',
    blurb: 'All-black stealth needle. The fastest thing here, and the wildest.',
    color: 0x22242c,
    maxSpeed: 175, stallSpeed: 42, accel: 15.0, turnRate: 0.65, rollRate: 2.0,
    stability: 0.3, climbRate: 24, fuelBurn: 1.9, rotateSpeed: 50, camDist: 32, camHeight: 8,
    speed: 5, agility: 4, stabilityBar: 1,
  },
  tsuru: {
    id: 'tsuru',
    name: 'Tsuru',
    short: 'Tsuru',
    role: 'Dart penembus',
    blurb: 'White dart with a long purple nose. Leaps forward, rolls like a drill.',
    color: 0xe8e8ec,
    maxSpeed: 140, stallSpeed: 32, accel: 13.0, turnRate: 0.85, rollRate: 2.5,
    stability: 0.55, climbRate: 16, fuelBurn: 1.25, rotateSpeed: 38, camDist: 28, camHeight: 7,
    speed: 4, agility: 5, stabilityBar: 3,
  },
};
export const AIRCRAFT_ORDER = ['kawasemi', 'ootaka', 'oowashi', 'hayabusa', 'tsuru'];

// Airfields. headingDeg is the runway direction (07 = 70 deg). elevation in metres.
export const AIRFIELDS = {
  merpati: {
    id: 'merpati', name: 'Merpati Field', runwayName: '13 / 31',
    x: 0, z: 900, headingDeg: 130, elevation: 30, length: 900, width: 30,
  },
  kenari: {
    id: 'kenari', name: 'Kenari Strip', runwayName: '32 / 14',
    x: 4200, z: -2600, headingDeg: 320, elevation: 45, length: 700, width: 26,
  },
};

// The ten mission levels. Level 1 has 5 enemy jets, each level adds one:
// enemyCount = 4 + level (L1 5, L2 6, ... L10 14). Enemies only appear in
// missions, never in free flight (there is no free-flight mode). Rings are
// [x, altitude, z] waypoints; the last ring sits over the destination
// runway so the flight ends on final approach. Ring altitudes are clamped
// to terrain + 130 m in missions.js, so every route here is flyable.
export const SORTIES = [
  {
    id: 'first-mail', level: 1, enemyCount: 5, name: 'Level 1 — First Mail Run', sub: 'Merpati Field to Kenari Strip',
    from: 'merpati', to: 'kenari', timeOfDay: 'day', wind: { gust: 0 },
    fuel: 1.0, brief: 'Take off, thread five sky rings over the lagoon, land at Kenari. 5 enemy jets patrol the route — gun them down for bonus points.',
    rings: [
      [900, 320, 300], [1900, 370, -500], [2900, 410, -1400],
      [3800, 370, -2100], [4300, 310, -2500],
    ],
  },
  {
    id: 'crosswind-mail', level: 2, enemyCount: 6, name: 'Level 2 — Crosswind Mail', sub: 'Kenari Strip to Merpati Field',
    from: 'kenari', to: 'merpati', timeOfDay: 'day', wind: { gust: 1 },
    fuel: 0.9, brief: 'Six rings in a stiff crosswind. 6 enemy jets on the route. Hold your line, watch the gusts.',
    rings: [
      [3600, 350, -2100], [2600, 410, -1400], [1600, 450, -600],
      [700, 390, 100], [-200, 340, 600], [100, 300, 850],
    ],
  },
  {
    id: 'dusk-express', level: 3, enemyCount: 7, name: 'Level 3 — Dusk Express', sub: 'Merpati Field to Kenari Strip',
    from: 'merpati', to: 'kenari', timeOfDay: 'dusk', wind: { gust: 0.4 },
    fuel: 0.85, brief: 'Seven rings as the sun goes down. 7 enemy jets, some carry missiles. Land by runway lights.',
    rings: [
      [1000, 350, 200], [1800, 430, -700], [900, 470, -1600],
      [-800, 450, -1400], [-1800, 390, -200], [-1200, 350, 700], [200, 300, 850],
    ],
  },
  {
    id: 'night-mail', level: 4, enemyCount: 8, name: 'Level 4 — Night Mail', sub: 'Merpati Field to Kenari Strip',
    from: 'merpati', to: 'kenari', timeOfDay: 'night', wind: { gust: 0.2 },
    fuel: 0.9, brief: 'Six rings under the moon. 8 enemy jets in the dark. Trust your instruments and the runway lights.',
    rings: [
      [1000, 360, 250], [2000, 420, -600], [3000, 400, -1500],
      [3900, 380, -2100], [4300, 330, -2500], [4100, 300, -2700],
    ],
  },
  {
    id: 'dawn-patrol', level: 5, enemyCount: 9, name: 'Level 5 — Dawn Patrol', sub: 'Merpati Field to Kenari Strip',
    from: 'merpati', to: 'kenari', timeOfDay: 'day', wind: { gust: 0.3 },
    fuel: 0.9, brief: 'Six rings at first light. 9 enemy jets sweep the lagoon. Clear the sky, then land the mail.',
    rings: [
      [1000, 350, 100], [2000, 410, -700], [3000, 430, -1500],
      [3800, 390, -2100], [4200, 330, -2500], [4100, 300, -2700],
    ],
  },
  {
    id: 'lagoon-hunt', level: 6, enemyCount: 10, name: 'Level 6 — Lagoon Hunt', sub: 'Kenari Strip to Merpati Field',
    from: 'kenari', to: 'merpati', timeOfDay: 'day', wind: { gust: 0.6 },
    fuel: 0.9, brief: 'Six rings back across the lagoon. 10 enemy jets, missile carriers among them. Hunt them between the rings.',
    rings: [
      [3400, 360, -2000], [2400, 420, -1300], [1400, 450, -500],
      [600, 390, 100], [-300, 340, 600], [100, 300, 850],
    ],
  },
  {
    id: 'sunset-intercept', level: 7, enemyCount: 11, name: 'Level 7 — Sunset Intercept', sub: 'Merpati Field to Kenari Strip',
    from: 'merpati', to: 'kenari', timeOfDay: 'dusk', wind: { gust: 0.5 },
    fuel: 0.85, brief: 'Seven rings into the sunset. 11 enemy jets intercept the mail run. Land by runway lights.',
    rings: [
      [1100, 360, 300], [1900, 440, -600], [1000, 480, -1500],
      [-700, 460, -1300], [-1700, 400, -100], [-1100, 360, 800], [200, 310, 850],
    ],
  },
  {
    id: 'moonlit-patrol', level: 8, enemyCount: 12, name: 'Level 8 — Moonlit Patrol', sub: 'Kenari Strip to Merpati Field',
    from: 'kenari', to: 'merpati', timeOfDay: 'night', wind: { gust: 0.3 },
    fuel: 0.9, brief: 'Six rings under the moon. 12 enemy jets on patrol. Your gun charges the missile — spend it wisely.',
    rings: [
      [3500, 370, -2200], [2500, 430, -1400], [1500, 460, -600],
      [600, 400, 200], [-100, 350, 700], [0, 310, 900],
    ],
  },
  {
    id: 'storm-mail', level: 9, enemyCount: 13, name: 'Level 9 — Storm Mail', sub: 'Merpati Field to Kenari Strip',
    from: 'merpati', to: 'kenari', timeOfDay: 'day', wind: { gust: 1 },
    fuel: 0.85, brief: 'Seven rings in a storm crosswind. 13 enemy jets in the murk. Hold your line and fight through.',
    rings: [
      [900, 330, 400], [1800, 390, -400], [2800, 450, -1200],
      [3600, 410, -1900], [4200, 350, -2400], [4300, 320, -2600], [4100, 300, -2750],
    ],
  },
  {
    id: 'merpati-defence', level: 10, enemyCount: 14, name: 'Level 10 — Merpati Defence', sub: 'Kenari Strip to Merpati Field',
    from: 'kenari', to: 'merpati', timeOfDay: 'dusk', wind: { gust: 0.8 },
    fuel: 0.85, brief: 'Seven rings home at dusk. 14 enemy jets — the full squadron. Survive the gauntlet and bring the mail home.',
    rings: [
      [3800, 370, -2300], [2900, 430, -1600], [1900, 470, -800],
      [900, 430, 0], [0, 370, 500], [-200, 330, 800], [0, 300, 900],
    ],
  },
];

export const RING_RADIUS = 42;
export const RING_SCORE = 100;
export const RING_CENTER_BONUS = 50;

// Combat: enemy jets in missions only. Enemy count is 4 + level (L1 5 .. L10 14).
// Player gun: Space (in the air; on the ground Space is still the brake) or
// the FIRE button. Player missile: Q or the MSL button, only when the
// charger bar is full — firing a missile spends the full charge.
// Charger fills from gun hits (+20% each), passing a ring (+15%) and a slow
// passive trickle (+1.5% per second), so a missile is earned by fighting,
// not given for free. Enemy jets fire guns; every third enemy also fires
// homing missiles.
export const ENEMY_KILL_SCORE = 150;
export const MISSILE_KILL_BONUS = 50;
export const CHARGER_PER_GUN_HIT = 0.20;
export const CHARGER_PER_RING = 0.15;
export const CHARGER_PASSIVE_PER_SEC = 0.015;
export const ENEMY_COUNT_FOR_LEVEL = (level) => 4 + (level || 1);
