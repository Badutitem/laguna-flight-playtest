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

// The four sorties. rings are [x, altitude, z] waypoints; the last ring sits over the
// destination runway so the flight ends on final approach.
export const SORTIES = [
  {
    id: 'first-mail', name: 'First Mail Run', sub: 'Merpati Field to Kenari Strip',
    from: 'merpati', to: 'kenari', timeOfDay: 'day', wind: { gust: 0 },
    fuel: 1.0, brief: 'Take off, thread five sky rings over the lagoon, land at Kenari.',
    rings: [
      [900, 170, 300], [1900, 220, -500], [2900, 260, -1400],
      [3800, 220, -2100], [4300, 160, -2500],
    ],
  },
  {
    id: 'crosswind-mail', name: 'Crosswind Mail', sub: 'Kenari Strip to Merpati Field',
    from: 'kenari', to: 'merpati', timeOfDay: 'day', wind: { gust: 1 },
    fuel: 0.9, brief: 'Six rings in a stiff crosswind. Hold your line, watch the gusts.',
    rings: [
      [3600, 200, -2100], [2600, 260, -1400], [1600, 300, -600],
      [700, 240, 100], [-200, 190, 600], [100, 150, 850],
    ],
  },
  {
    id: 'dusk-express', name: 'Dusk Express', sub: 'Merpati Field to Kenari Strip',
    from: 'merpati', to: 'kenari', timeOfDay: 'dusk', wind: { gust: 0.4 },
    fuel: 0.85, brief: 'Seven rings as the sun goes down. Land by runway lights.',
    rings: [
      [1000, 200, 200], [1800, 280, -700], [900, 320, -1600],
      [-800, 300, -1400], [-1800, 240, -200], [-1200, 200, 700], [200, 150, 850],
    ],
  },
  {
    id: 'night-mail', name: 'Night Mail', sub: 'Merpati Field to Kenari Strip',
    from: 'merpati', to: 'kenari', timeOfDay: 'night', wind: { gust: 0.2 },
    fuel: 0.9, brief: 'Six rings under the moon. Trust your instruments and the runway lights.',
    rings: [
      [1000, 210, 250], [2000, 270, -600], [3000, 250, -1500],
      [3900, 230, -2100], [4300, 180, -2500], [4100, 150, -2700],
    ],
  },
];

export const RING_RADIUS = 42;
export const RING_SCORE = 100;
export const RING_CENTER_BONUS = 50;
