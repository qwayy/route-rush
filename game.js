'use strict';

// =====================================================================
//  ROUTE RUSH — prototype
//
//  Sections:
//    1. CONFIG          every tuning number lives here
//   1b. THEMES          Kansas City neighborhoods (one per day) + HOUSE_STYLES
//    2. LAYOUT / COLORS street geometry + placeholder palette
//    3. SETUP           canvas scaling, storage, small helpers
//    4. GAME STATE      new game / days / crash / lives
//    5. INPUT           pointer (touch + mouse) and keyboard
//    6. SPAWNING        the street, props, obstacles, bonus course
//    7. UPDATE          per-frame simulation, papers and scoring
//    8. RENDER          all drawing (swap shapes for sprites here)
//    9. UI              overlay screens, day summary, share
//   10. LOOP
//
//  Coordinates: the world is a long vertical strip. `x` is across the
//  street (0..gameWidth), `z` is distance along the route. The bike sits
//  at z = game.dist; things with bigger z are further ahead (higher on
//  screen). sy(z) converts a world z to a screen y. "lx" is an x measured
//  as if on the LEFT side (right-side things are mirrored with sideX).
//
//  A run is endless weeks (Monday..Sunday, then WEEK 2, 3...) on the same
//  street. Each day: route (20 houses) -> bonus course -> summary. Papers
//  are unlimited; the only way to lose is crashing (CONFIG.lives).
// =====================================================================


// ---------------------------------------------------------------------
// 1. CONFIG
// ---------------------------------------------------------------------
const CONFIG = {
  // View
  gameWidth: 400,            // logical width; height adapts to the screen
  minGameHeight: 560,
  maxGameHeight: 900,
  bikeScreenY: 0.72,         // bike's vertical position (fraction of height)
  fullscreenOnTouch: true,   // request fullscreen when a phone player starts

  // Look: pixel art + fake 3D
  typeSpeed: 38,             // cutscene typewriter, characters per second
  pixelSize: 2,              // logical units per art pixel; must divide gameWidth (2 = crisp, 4 = chunky)
  heightY: 0.75,             // how far up the screen one unit of height draws
  perspX: 0.0026,            // how much tall things lean away from the centre line

  // Speed (world units / second)
  startSpeed: 210,
  speedPerDay: 22,           // added each new day
  speedPerLevel: 12,         // added every housesPerLevel houses within a day
  housesPerLevel: 8,         // houses passed (both sides count)
  speedPerWeek: 20,          // each new week starts this much faster than the last
  maxSpeed: 400,             // hard cap: later difficulty comes from obstacles, not speed
  speedEase: 1.5,            // how quickly speed eases toward its target

  // Steering. Phones: tilt left/right (falls back to drag). Desktop: arrows.
  tiltFullAngle: 13,         // degrees of tilt for full steering (at sensitivity 5)
  tiltDeadZone: 2,           // degrees around "level" that keep the bike straight
  tiltCurve: 1.6,            // >1: small tilts steer gently, bigger tilts steer hard
  tiltMaxSteer: 380,         // sideways speed at full tilt
  tiltSensDefault: 5,        // sensitivity slider 1..10 (start screen + pause menu, saved)
  tiltSensStep: 1.12,        // each slider step shrinks/grows the full-tilt angle by this factor
  tiltSmoothing: 12,         // filters sensor jitter (higher = snappier, lower = smoother)
  maxLean: 0.3,              // bike lean (radians) at full sideways speed
  leanPerSpeed: 0.0022,      // lean per unit of sideways speed
  dragSensitivity: 1.15,     // logical units moved per logical unit dragged
  steerSmoothing: 14,        // higher = bike snaps to finger faster
  keySteerSpeed: 300,        // arrow-key steering speed

  // Tap vs drag detection
  tapMaxMove: 10,            // CSS px a finger may wander and still be a tap
  tapMaxTime: 200,           // ms a tap may last

  // Throwing: papers fly straight out sideways, perpendicular to the street.
  // Throw when the target is beside you. Timing is everything.
  throwSpeed: 460,           // sideways speed
  paperCarry: 0,             // fraction of the bike's forward speed a paper keeps (0 = dead straight)
  throwHeight: 12,           // height papers fly at
  throwCooldown: 0.25,       // seconds between throws (papers are unlimited)
  throwBuffer: 0.1,          // a tap this close to the end of the cooldown still throws (right after it)
  paperMinLx: -20,           // a paper that hits nothing flies until it's off the screen edge
  paperStep: 4,              // papers move at most this far between hit checks (no skipped hits)

  // The street and days
  housesPerSide: 10,         // 2 x 10 = 20 houses per day
  startSubscribers: 8,
  routeLeadIn: 260,          // empty road before the first house
  houseLenMin: 130,
  houseLenMax: 170,
  houseInterval: 1.2,        // seconds between houses on each side, at any speed
  houseIntervalJitter: 0.08, // +-8% so the rhythm isn't robotic
  yardMin: 60,               // never less side yard than this between houses
  drivewayChance: 0.5,
  sideFenceChance: 0.35,
  propChance: 0.55,          // chance of a trash can at a house (plus maybe a fence / lawn ornament)
  // Hit areas. Triple-tap the score (or press H) to see them.
  // Subscriber houses: mailbox > porch > window > rest of the property.
  mailboxHitHalf: 8,         // mailbox, along the street (drawn mailbox is +-6, so near hits count)
  mailboxHitHalfX: 6,        // mailbox, across the street (drawn mailbox is +-4)
  porchHitHalf: 26,          // door + porch + front steps: generous, fair at full speed
  paperHalf: 4,              // a paper's own half-length; touching the porch zone counts
  windowGap: 4,              // windows start this far beyond the porch zone, so they never overlap
  propertyMargin: 30,        // a property reaches this far into each side yard (never past halfway)
  propertyLandLx: 90,        // a paper over a subscriber's lawn lands (and counts) at this line
  debugTrailLife: 2.5,       // seconds a paper's path stays on the debug overlay
  introTime: 2.6,            // "MONDAY · 8 SUBSCRIBERS" banner
  bannerTime: 2.4,
  outroTime: 1.4,            // ride-out after the bonus before the summary

  // Scoring
  pointsPorch: 300,          // subscriber porch / door / steps
  pointsMailbox: 700,        // subscriber mailbox
  pointsProperty: 100,       // subscriber lawn / walkway / driveway / house front
  pointsVandalWindow: 300,   // non-subscriber window
  pointsProp: 300,           // trash can / fence / lawn ornament at a non-subscriber
  pointsBonusTarget: 300,
  pointsBonusClear: 1000,
  perfectMultiplier: 2,      // perfect day multiplies the day's route points

  // Lives: crashing is the only way to lose. 1 = one crash ends the run
  // (no hearts in the HUD); more than 1 respawns you with a short blink.
  lives: 1,
  respawnInvuln: 2,          // seconds of blinking invulnerability after a crash
  respawnClear: 420,         // obstacles this close are removed on respawn

  // Bonus course
  bonusGap: 380,             // road between the last house and the start line
  bonusDuration: 12,         // seconds of course (at the day's speed)
  bonusWeights: { jump: 2, targets: 2, slalom: 1 },
  targetHalf: 10,            // target hit half-length along the street
  jumpTime: 0.85,
  jumpHeight: 34,

  // Obstacles
  graceTime: 10,             // Monday: seconds with no obstacles (hint is shown)
  obstacleGapStart: 520,     // world distance between obstacles at level 0
  obstacleGapMin: 210,
  obstacleGapMul: 0.9,       // gap multiplier per level (each day + each speed-up)
  weekObstacleMul: 0.88,     // and per week, so every week is busier than the last
  obstacleGapFloor: 130,     // obstacles never get closer than this (keeps it survivable)
  dogSpeedMin: 110,
  dogSpeedMax: 145,
  dogRunLeadMin: 0.6,        // seconds before the bike arrives that a dog bolts
  dogRunLeadMax: 1.0,
  skaterSpeed: 80,           // skater rolls forward (slower than you)
  skaterWeave: 28,
  skaterWeaveFreq: 1.8,
  bikeHalfW: 8,
  bikeHalfL: 15,
  hitForgiveness: 0.8,       // <1 shrinks hitboxes so near-misses feel fair

  // Juice
  shakeCrash: 14,
  shakeWindow: 6,
  shakeMailbox: 3,
  shakeDecay: 40,
  particleCount: 14,
  popLife: 1.0,
  crashDelay: 0.9,           // crash animation before respawn / game over
  restartLock: 0.35,         // ignore taps this long after an overlay appears

  spawnMargin: 220,          // spawn this far above the top of the screen

  // Kansas City extras (per-day colors/props/obstacle mixes live in THEMES)
  joggerSpeed: 70,           // joggers run toward you
  trafficSpeedMin: 90,       // Plaza boulevard traffic drives ahead of you, slower than you
  trafficSpeedMax: 140,
  streetcarLead: 1.9,        // seconds before you arrive that the streetcar starts across
  streetcarWarn: 1.2,        // bell + flashing lights this much earlier
  streetcarClear: 95,        // its centre is this far past the middle when you arrive
  smokeDrift: 55,            // sideways speed of BBQ smoke
  smokeFollow: 0.55,         // smoke drifts up the road at this fraction of your speed (lingers)
  smokeLife: 4.5,
  smokeMax: 2,

  // Sound: every effect is generated in code (see 9b. SOUND). Players set the
  // volume, SFX on/off and music (your song / 8-bit / off) on the start and
  // pause screens; their choices are saved.
  masterVolume: 0.8,         // starting master volume (the slider saves the player's choice)
  sfxVolume: 0.9,
  musicVolume: 0.45,         // music sits under the effects
  musicDuck: 0.25,           // music level for a moment after a crash
  pedalVolume: 0.35,         // pedal ticks + whir (kept quiet)
  pedalStroke: 44,           // distance ridden per pedal tick
  pitchJitter: 0.07,         // +-7% random pitch on repeated sounds
  comboMaxSteps: 12,         // the delivery blip climbs up to this many semitones
  honkLead: 0.9,             // a parked car honks this many seconds before you reach it (if you're close)
  defaultMusic: 'song',      // 'song' (musicFile), 'chip' (generated 8-bit) or 'off'
  musicFile: 'music/shit-talking.mp3',
};

const BEST_KEY = 'routeRush.best';
const TILT_KEY = 'routeRush.tiltSensitivity';
const DAY_NAMES = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];


// ---------------------------------------------------------------------
// 1b. KANSAS CITY THEMES
// One entry per day (Monday..Sunday). `bonus` themes that day's bonus
// course (what you jump, what the targets are, who lines the street).
// The street layout and subscribers
// carry over between days; each day re-skins every house slot in that
// neighborhood's styles. Weights are relative ({ a: 3, b: 1 } = 3:1).
// ---------------------------------------------------------------------
const BASE_GROUND = {
  grass: '#5d9e4a', grassStripe: '#56953f', grassLight: '#79b85a', grassDark: '#4b8a3b',
  sidewalk: '#cfcabe', sidewalkJoint: '#b6b0a2', curb: '#ece8de',
  street: '#3b3f47', streetDark: '#32353c', streetLight: '#4a4e57', laneLine: '#f2c94c',
};
const FALL_LEAVES = ['#e07a2e', '#c9452f', '#e8b33a', '#a5502a'];

const THEMES = [
  {
    name: 'WALDO',                                        // Monday: quiet bungalows, easiest
    houses: { bungalow: 6, shirtwaist: 3, tudor: 1 },
    ground: { ...BASE_GROUND },
    trees: { green: 5, orange: 1, gold: 1 },              // canopy colors (see LEAF_PALETTES)
    leaves: 0.08, leafColors: FALL_LEAVES,                // fallen leaves on lawns (0..1)
    decor: { tree: 6, bush: 3, fountain: 1, smoker: 2 },  // what fills the gaps between houses
    retainingWalls: 0.3, flags: 0, murals: 0, muralColors: [],
    obstacles: { dog: 3, pothole: 3, cone: 2, car: 1, skater: 1 },
    obstacleGapScale: 1.35,                               // >1 = obstacles further apart
    smoke: 0.1,                                           // BBQ smoke puffs per smoker per second
    streetcars: 0,
    bonus: { jumps: { cones: 2, car: 1, fountain: 1 }, targets: { mailboxes: 3, newsstand: 1, smoker: 2 }, sideline: 'joggers', sidelineGap: 70, murals: 0 },
    music: { bpm: 118, root: 60, scale: 'major', prog: [0, 4, 5, 3], swing: 0, seed: 11 },   // 8-bit track: key, scale, chords, tempo
  },
  {
    name: 'BROOKSIDE',                                    // Tuesday: Tudors, big fall trees, joggers
    houses: { tudor: 6, shirtwaist: 2, bungalow: 2 },
    ground: { ...BASE_GROUND, grass: '#6b9a44', grassStripe: '#64913e', grassLight: '#8aab4f', grassDark: '#55803a' },
    trees: { green: 2, orange: 3, red: 3, gold: 2 },
    leaves: 0.45, leafColors: FALL_LEAVES,
    decor: { tree: 9, bush: 2, fountain: 1 },
    retainingWalls: 0.5, flags: 0, murals: 0, muralColors: [],
    obstacles: { jogger: 5, dog: 2, pothole: 2, car: 1, cone: 1 },
    obstacleGapScale: 1.15, smoke: 0, streetcars: 0,
    bonus: { jumps: { cones: 1, car: 1, fountain: 1 }, targets: { mailboxes: 3, newsstand: 1, fountain: 1 }, sideline: 'joggers', sidelineGap: 55, murals: 0 },
    music: { bpm: 110, root: 67, scale: 'major', prog: [0, 3, 4, 0], swing: 0.05, seed: 23 },   // 8-bit track: key, scale, chords, tempo
  },
  {
    name: 'PLAZA',                                        // Wednesday: Spanish/Moorish-style shopping district
    houses: { plazaShop: 6, plazaApartment: 3 },
    ground: { ...BASE_GROUND, grass: '#58a24c', grassStripe: '#519a46', sidewalk: '#e2d3b8', sidewalkJoint: '#c8b896', curb: '#f0e6d2', street: '#3f3a3a', streetDark: '#353030', streetLight: '#4d4747' },
    trees: { green: 5, gold: 1 },
    leaves: 0.05, leafColors: FALL_LEAVES,
    decor: { planter: 4, tree: 2, fountain: 1 },
    plazas: 0.55,                                         // chance a side yard becomes a paved plaza with a grand fountain
    lamps: 85,                                            // ornate lamp posts along the sidewalks, this far apart
    crosswalks: 600,                                      // brick crosswalks across the boulevard, this far apart
    retainingWalls: 0, flags: 0, murals: 0, muralColors: [],
    obstacles: { traffic: 3, median: 3, car: 2, skater: 1, pothole: 1, cone: 1 },
    obstacleGapScale: 1.05, smoke: 0, streetcars: 0,
    bonus: { jumps: { fountain: 3, cones: 1 }, targets: { fountain: 3, sign: 1, newsstand: 1 }, sideline: null, murals: 0 },
    music: { bpm: 112, root: 62, scale: 'mixo', prog: [0, 6, 3, 0], swing: 0.08, seed: 37 },   // 8-bit track: key, scale, chords, tempo
  },
  {
    name: 'WESTPORT',                                     // Thursday: houses + storefronts, more cars
    houses: { storefront: 5, bungalow: 2, shirtwaist: 2 },
    ground: { ...BASE_GROUND, grass: '#5a9446', grassStripe: '#538c40', sidewalk: '#c4c0b8', sidewalkJoint: '#a9a49a', street: '#36393f' },
    trees: { green: 4, orange: 1 },
    leaves: 0.08, leafColors: FALL_LEAVES,
    decor: { tree: 3, bush: 2, smoker: 3 },
    retainingWalls: 0.2, flags: 0, murals: 0, muralColors: [],
    obstacles: { car: 6, skater: 2, pothole: 2, cone: 2, dog: 1 },
    obstacleGapScale: 0.95, smoke: 0.15, streetcars: 0,
    bonus: { jumps: { car: 2, cones: 2 }, targets: { sign: 3, newsstand: 2, smoker: 1 }, sideline: 'patios', lights: true, murals: 0 },
    music: { bpm: 126, root: 57, scale: 'minor', prog: [0, 5, 2, 6], swing: 0, seed: 41 },   // 8-bit track: key, scale, chords, tempo
  },
  {
    name: '18TH & VINE',                                  // Friday: brick blocks with jazz murals
    houses: { brickblock: 6, storefront: 3, shirtwaist: 1 },
    ground: { ...BASE_GROUND, grass: '#4f8a42', grassStripe: '#49823d', sidewalk: '#b9b2a6', sidewalkJoint: '#9d968a', street: '#2f3238', streetDark: '#282a30', streetLight: '#3c3f46' },
    trees: { green: 4, gold: 1 },
    leaves: 0.05, leafColors: FALL_LEAVES,
    decor: { tree: 3, bush: 1, smoker: 4 },
    retainingWalls: 0, flags: 0, murals: 0.85,
    muralColors: [
      ['#2b2d5c', '#ffd23f', '#ff5a5f', '#3ddc84'],
      ['#7a2e5c', '#f2c94c', '#2ec4b6', '#ff8c42'],
      ['#1f4e5f', '#e8a33d', '#f15bb5', '#9fd3f0'],
    ],
    obstacles: { car: 3, pothole: 3, cone: 3, skater: 2, dog: 1 },
    obstacleGapScale: 0.9, smoke: 0.2, streetcars: 0,
    bonus: { jumps: { cones: 2, car: 1 }, targets: { sign: 2, smoker: 2, newsstand: 1 }, sideline: null, murals: 1 },
    music: { bpm: 100, root: 65, scale: 'dorian', prog: [0, 3, 0, 4], swing: 0.18, seed: 53 },   // 8-bit track: key, scale, chords, tempo
  },
  {
    name: 'RIVER MARKET',                                 // Saturday: lofts, streetcar
    houses: { loft: 6, brickblock: 3, storefront: 2 },
    ground: { ...BASE_GROUND, grass: '#4f8a42', grassStripe: '#49823d', sidewalk: '#a8644a', sidewalkJoint: '#8a4c38', curb: '#d8cfc0', street: '#34363c' },
    trees: { green: 4, orange: 1 },
    leaves: 0.05, leafColors: FALL_LEAVES,
    decor: { tree: 3, bush: 2, smoker: 1 },
    retainingWalls: 0, flags: 0, murals: 0.2,
    muralColors: [['#3a3f6a', '#ffd23f', '#ff8c42', '#9fd3f0']],
    obstacles: { car: 3, pothole: 3, cone: 3, skater: 2 },
    obstacleGapScale: 0.85, smoke: 0.1,
    streetcars: 3,                                        // timed crossings on this day's route
    bonus: { jumps: { cones: 2, car: 2 }, targets: { newsstand: 2, sign: 2, mailboxes: 1 }, sideline: null, tracks: 2, murals: 0.2 },
    music: { bpm: 132, root: 64, scale: 'minor', prog: [0, 6, 5, 6], swing: 0, seed: 67 },   // 8-bit track: key, scale, chords, tempo
  },
  {
    name: 'GAME DAY',                                     // Sunday: red & gold, tailgates, hardest
    houses: { bungalow: 4, shirtwaist: 3, tudor: 2 },
    ground: { ...BASE_GROUND, grass: '#4fa04a', grassStripe: '#479542', laneLine: '#ffd23f' },
    trees: { orange: 3, red: 2, gold: 2, green: 2 },
    leaves: 0.25, leafColors: FALL_LEAVES,
    decor: { crowd: 5, grill: 4, tree: 2 },
    retainingWalls: 0.3, flags: 0.85, murals: 0, muralColors: [],
    obstacles: { fan: 5, car: 3, cone: 2, pothole: 2, dog: 1 },
    obstacleGapScale: 0.72, smoke: 0.25, streetcars: 0,
    bonus: { jumps: { car: 2, cones: 2 }, targets: { smoker: 3, mailboxes: 1, sign: 1 }, sideline: 'crowd', sidelineGap: 60, murals: 0 },
    music: { bpm: 140, root: 62, scale: 'major', prog: [0, 3, 4, 4], swing: 0, seed: 79 },   // 8-bit track: key, scale, chords, tempo
  },
];
function theme() { return THEMES[game.day] || THEMES[0]; }

// House looks. Every style keeps the same footprint, porch, mailbox and
// window hit areas; only the drawing changes.
//   finish: brick | shirtwaist (stone/brick lower, siding upper) | tudor | stucco
//   roof:   gable (roofH = height) | tile (gable with clay tile rows) | flat
//   porch:  standard | deep (columns on stone piers) | stoop (shop awning) | canopy
const HOUSE_STYLES = {
  bungalow: {
    finish: 'brick', roof: 'gable', roofH: 16, wallH: [30, 36], porch: 'deep', door: 'plain', chimney: 0.6, yard: true,
    walls: ['#9c4a3a', '#8a5a44', '#7a3f33', '#a5623f'], roofs: ['#4a4f57', '#5b4a3f', '#3f4a3f'], trims: ['#efe6d6'],
  },
  shirtwaist: {
    finish: 'shirtwaist', roof: 'gable', roofH: 24, wallH: [44, 52], porch: 'standard', door: 'plain', chimney: 0.4, yard: true,
    walls: ['#e9e2cf', '#cfdde6', '#e8d8a8', '#d9e4d0'], lowers: ['#b9ab8f', '#a8543f', '#c7bba0'],
    roofs: ['#5b6b7a', '#4a4f57', '#6b4f4f'], trims: ['#f6f3ea'],
  },
  tudor: {
    finish: 'tudor', roof: 'gable', roofH: 40, wallH: [38, 46], porch: 'standard', door: 'arch', chimney: 0.8, yard: true,
    walls: ['#efe4c8', '#f2ead6'], roofs: ['#4a3f3a', '#3f3a45', '#5a4436'], trims: ['#3b2a20', '#2e2a28'],
  },
  spanish: {
    finish: 'stucco', roof: 'tile', roofH: 14, wallH: [32, 40], porch: 'standard', door: 'arch', chimney: 0.2, yard: true,
    walls: ['#f2dfc2', '#efd2b0', '#f5e6d0'], roofs: ['#c45a35', '#b8502f', '#cf6a3f'], trims: ['#6b4226'],
  },
  storefront: {
    finish: 'brick', roof: 'flat', wallH: [34, 40], porch: 'stoop', door: 'glass', paved: true,
    walls: ['#a5623f', '#6a7f8a', '#c9a55a', '#7a4f6a'], roofs: ['#55585f'], trims: ['#f6f3ea'],
    awnings: ['#d64545', '#2f9e6b', '#3a7bd5', '#e8a33d'],
  },
  brickblock: {
    finish: 'brick', roof: 'flat', wallH: [40, 50], porch: 'canopy', door: 'plain', paved: true, mural: true,
    walls: ['#8a3f30', '#9c5a3a', '#6e3a2e'], roofs: ['#4a4d55'], trims: ['#e8dcc0'],
  },
  // Plaza: cream/tan/peach stucco, clay tile roofs, arched windows; some
  // get a corner bell tower or domed tower (towers: chance of each).
  plazaShop: {
    finish: 'stucco', roof: 'tile', roofH: 10, wallH: [30, 38], porch: 'stoop', door: 'arch', paved: true, arches: true,
    walls: ['#f3e3c3', '#e6cfa3', '#f2c9a5', '#efd9b4'], roofs: ['#b8502f', '#c45a35', '#a84a2c'], trims: ['#6b4226', '#8a5a3a'],
    awnings: ['#8c2f2f', '#2f5d4a', '#2b3f66', '#b8862f'], towers: { bell: 0.1, dome: 0.18 },
  },
  plazaApartment: {
    finish: 'stucco', roof: 'tile', roofH: 14, wallH: [46, 56], porch: 'canopy', door: 'arch', paved: true, arches: true, balconies: true,
    walls: ['#f2dcb8', '#ead2a8', '#f5d2b5'], roofs: ['#b8502f', '#c45a35'], trims: ['#6b4226'], towers: { bell: 0.05, dome: 0.25 },
  },
  loft: {
    finish: 'brick', roof: 'flat', wallH: [56, 66], porch: 'canopy', door: 'glass', paved: true, mural: true, tower: 0.35,
    walls: ['#7a3f33', '#8a5a44', '#5f4a40'], roofs: ['#3f4248'], trims: ['#2b2b35', '#e8dcc0'],
  },
};


// ---------------------------------------------------------------------
// 2. LAYOUT / COLORS
// Layout is described for the LEFT side; the right side is mirrored.
// ---------------------------------------------------------------------
const L = {
  houseX0: 16, wallX: 78,          // house footprint; wallX is the street-facing wall
  eaveX0: 12, eaveX1: 83, ridgeX: 47,
  porchX1: 96, porchHalf: 22, stepsX: 102,   // porch deck + front steps (drawn); hit area is CONFIG.porchHitHalf
  sidewalkX0: 110, sidewalkX1: 130,
  streetX0: 130, streetX1: 270,
  mailboxX: 104,
  fenceX: 100, decoX: 90, trashX: 118, targetX: 118,
  bikeMinX: 148, bikeMaxX: 252,
};

const COLORS = {
  bg: '#16202c',
  grass: '#5d9e4a', grassStripe: '#56953f',
  sidewalk: '#cfcabe', sidewalkJoint: '#b6b0a2', curb: '#ece8de',
  grassLight: '#79b85a', grassDark: '#4b8a3b',
  street: '#3b3f47', streetDark: '#32353c', streetLight: '#4a4e57', laneLine: '#f2c94c',
  trim: '#f6f3ea', outline: '#1a1c2c', shadow: 'rgba(0,0,0,0.22)', brick: '#9c4a3a',
  window: '#7fc4ea', windowShine: '#c9ecfb', windowBroken: '#27303b', crack: '#cfe9f7',
  doorPlain: '#7a5a43', doorSub: '#ff5a5f',
  porch: '#c79a6b', path: '#bdb6a6', post: '#6b5440',
  mailbox: '#6a707b', mailboxSub: '#ffd23f', flag: '#3ddc84',
  paper: '#f7f4ea', tire: '#1d1f24', shirt: '#ff8c42',
  cars: ['#d64545', '#3a7bd5', '#e0e0e0', '#2f9e6b', '#e8a33d'],
  carGlass: '#2a3b52', tail: '#ff4b4b',
  trash: '#5f7f6a', garbage: ['#c9b458', '#8a6a4a', '#e0e0e0'], fence: '#f4efe2',
  ramp: '#e8a33d', rampStripe: '#2b2b35', barrier: '#f4f1ea', barrierStripe: '#d64545',
  perfect: '#ffd23f', good: '#3ddc84', bad: '#ff5a5f', neutral: '#ffffff', glass: '#9fd3f0', debugProperty: '#4fa3ff',
  stone: '#b9ab8f', limestone: '#d8cfb8', water: '#4f9fd8', waterLight: '#bfe6ff',
  smoke: '#d9d6d0', smokeDark: '#b9b5ae', bronze: '#8a6a3a', brickPave: '#a5523f',
  rail: '#9aa0a8', tie: '#5a4130', streetcar: '#e9ecef', streetcarAccent: '#2a6f97',
  flagRed: '#d0312d', flagGold: '#f2b630',
};


// ---------------------------------------------------------------------
// 3. SETUP
// ---------------------------------------------------------------------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// Low-res pixel buffer the world is drawn into (see RENDER).
const buf = document.createElement('canvas');
const pix = buf.getContext('2d');
const PAD = 8;   // spare art pixels around the buffer so screen shake never shows an edge

const view = { W: CONFIG.gameWidth, H: 700, scale: 1, offX: 0, offY: 0, dpr: 1, bikeY: 500, safeTop: 0, camZ: 0 };

function resize() {
  const cssW = window.innerWidth;
  const cssH = window.innerHeight;
  view.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.width = Math.round(cssW * view.dpr);
  canvas.height = Math.round(cssH * view.dpr);

  view.W = CONFIG.gameWidth;
  const ps = CONFIG.pixelSize;
  view.H = Math.round(clamp(view.W * cssH / cssW, CONFIG.minGameHeight, CONFIG.maxGameHeight) / ps) * ps;
  view.scale = Math.min(cssW / view.W, cssH / view.H);
  view.offX = (cssW - view.W * view.scale) / 2;
  view.offY = (cssH - view.H * view.scale) / 2;
  view.bikeY = Math.round(view.H * CONFIG.bikeScreenY / ps) * ps;

  buf.width = view.W / ps + PAD * 2;
  buf.height = view.H / ps + PAD * 2;
  pix.imageSmoothingEnabled = false;

  const sat = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sat')) || 0;
  view.safeTop = Math.max(0, sat - view.offY) / view.scale;
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
resize();

const storage = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, String(value)); } catch (e) { /* storage blocked: ignore */ }
  },
};

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function rand(a, b) { return a + Math.random() * (b - a); }
function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
function damp(a, b, k, dt) { return a + (b - a) * (1 - Math.exp(-k * dt)); }
function weightedPick(weights, rng = Math.random) {
  let total = 0;
  for (const k in weights) total += weights[k];
  let r = rng() * total;
  for (const k in weights) { r -= weights[k]; if (r <= 0) return k; }
  return Object.keys(weights)[0];
}
function pickR(arr, rng) { return arr[(rng() * arr.length) | 0]; }
// Small seeded RNG so a house slot looks the same every time a day is played.
function mulberry32(a) {
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Mirror a left-side layout x to the given side (-1 left, +1 right).
function sideX(side, x) { return side < 0 ? x : view.W - x; }
// World z -> screen y (camZ is game.dist snapped to the pixel grid).
function sy(z) { return view.bikeY - (z - view.camZ); }


// ---------------------------------------------------------------------
// 4. GAME STATE
// ---------------------------------------------------------------------
// state: 'title' | 'menu' | 'cutscene' | 'playing' | 'crashed' | 'paused' | 'summary' | 'over'
// phase (while playing): 'route' -> 'bonus' -> 'outro'
const game = { state: 'title' };
const bike = { x: 200, vx: 0, spin: 0, crashed: false, airT: 0, h: 0, invuln: 0 };
const input = { steerTarget: 200, left: false, right: false };
const debug = { hitAreas: false, taps: [] };   // triple-tap the score (or H) toggles hit-area outlines
let best = parseInt(storage.get(BEST_KEY, '0'), 10) || 0;

function resetGame() {
  Object.assign(game, {
    score: 0, lives: CONFIG.lives, day: 0, week: 1, totalDelivered: 0,
    street: buildStreet(),
    overTitle: '', overReason: '', overShownAt: 0,
  });
  setupDay();
}

function startGame() {
  if (audio.settings.music !== 'off') startMusic();   // inside the tap that starts the run, so phones allow it
  sfx.dayStart();
  resetGame();
  if (tilt.enabled) calibrateTilt();   // "level" = how the phone is held right now
  game.state = 'playing';
  hideOverlay();
}

// Fresh world for game.day; score, lives and the street carry over.
function setupDay() {
  Object.assign(game, {
    phase: 'route', time: 0, dist: 0, level: 0, housesPassedToday: 0, phaseTimer: 0,
    throwCooldown: 0, dayStartDelivered: game.totalDelivered,
    shake: 0, flash: 0, flashColor: COLORS.bad, crashTimer: 0, crashOutcome: '', crashReason: '',
    warnedObstacles: false, banners: [],
    houses: [], decor: [], obstacles: [], ramps: [], targets: [], lines: [], tracks: [], smokes: [], driveways: [], pavedLots: [], lights: [], trails: [], queuedThrow: 0, combo: 0, pedalPhase: 0,
    flying: [], groundPapers: [], particles: [], pops: [],
    stats: {
      subs: 0, deliveries: 0, mailbox: 0, windows: 0, subWindows: 0, props: 0, targets: 0,
      routePoints: 0, perfectBonus: 0, bonusPoints: 0, startScore: game.score,
      perfect: false, bonusClean: false, added: 0,
    },
  });
  Object.assign(bike, { x: 200, vx: 0, spin: 0, crashed: false, airT: 0, h: 0, invuln: 0 });
  input.steerTarget = 200;
  pointers.clear();
  layoutDay();
  game.speed = targetSpeed();
  noteFurthest();
  pushBanner(DAY_NAMES[game.day], `${game.stats.subs} SUBSCRIBER${game.stats.subs === 1 ? '' : 'S'}`, COLORS.neutral, CONFIG.introTime, `${theme().name} · WEEK ${game.week}`);
}

function speedFor(day, housesPassed) {
  const lvl = Math.floor(housesPassed / CONFIG.housesPerLevel);
  const base = CONFIG.startSpeed + (game.week - 1) * CONFIG.speedPerWeek;
  return Math.min(CONFIG.maxSpeed, base + day * CONFIG.speedPerDay + lvl * CONFIG.speedPerLevel);
}
// Very first Monday only: a few obstacle-free seconds + the controls hint.
function isFirstDay() { return game.day === 0 && game.week === 1; }
function targetSpeed() { return speedFor(game.day, game.housesPassedToday); }

function pushBanner(title, sub, color, time, place) {
  game.banners.push({ title, sub, color, place, t: time, max: time });
}

function crash(o) {
  bike.crashed = true; bike.airT = 0; bike.h = 0;
  game.state = 'crashed';
  game.crashTimer = CONFIG.crashDelay;
  pointers.clear();
  game.shake = CONFIG.shakeCrash;
  game.flash = 0.35; game.flashColor = COLORS.bad;
  burst(bike.x, game.dist, '#ffffff', CONFIG.particleCount + 6, 160);
  burst(bike.x, game.dist, COLORS.shirt, 8, 120);
  if (game.phase !== 'route') {
    // Bonus course: the bonus just ends, no life lost.
    game.bonus.clean = false;
    game.crashOutcome = 'bonusEnd';
    popText('BONUS OVER', bike.x, game.dist + 40, COLORS.bad, 26);
    sfx.crash(false);
    duckMusic();
    return;
  }
  game.lives--;
  game.crashReason = CRASH_REASONS[o.type] || 'Wipeout!';
  game.crashOutcome = game.lives > 0 ? 'respawn' : 'over';
  popText(game.lives > 0 ? `CRASH! ${game.lives} LEFT` : 'CRASH!', bike.x, game.dist + 40, COLORS.bad, 26);
  sfx.crash(game.crashOutcome === 'over');
  duckMusic();
}

function afterCrash() {
  bike.crashed = false; bike.spin = 0;
  if (game.crashOutcome === 'over') { endGame('Wipeout!', game.crashReason); return; }
  if (game.crashOutcome === 'bonusEnd') { showDaySummary(); return; }
  bike.invuln = CONFIG.respawnInvuln;
  game.obstacles = game.obstacles.filter((o) => Math.abs(o.z - game.dist) > CONFIG.respawnClear);
  game.state = 'playing';
}

function endGame(title, reason) {
  game.overTitle = title;
  game.overReason = reason;
  showGameOver();
}

const CRASH_REASONS = {
  dog: 'A dog got you.',
  pothole: 'Swallowed by a pothole.',
  car: 'You kissed a parked car.',
  skater: 'Tangled with a skateboarder.',
  fountain: 'Took a dip in a fountain.',
  traffic: 'Rear-ended a car on the boulevard.',
  cone: 'Plowed through the construction cones.',
  jogger: 'Collided with a jogger.',
  fan: 'Bowled over by an excited fan.',
  median: 'Jumped the median. Badly.',
  streetcar: 'Lost a race with the streetcar.',
};


// ---------------------------------------------------------------------
// 5. INPUT
// Each pointer starts "pending". It becomes a drag once it moves more than
// tapMaxMove; only drags steer. On release, a pending pointer that lasted
// <= tapMaxTime is a tap and throws. So a tap never steers and a drag
// never throws. Multiple fingers are tracked independently.
// ---------------------------------------------------------------------
const pointers = new Map();

// --- Tilt steering ---
// Phones steer by tilting left/right (gamma in portrait). "Level" is how the
// player holds the phone when a run (or day) starts; inside the dead zone the
// bike rides straight. Tilt sets sideways SPEED, so it's smooth and analog.
// No sensor, no permission, or no https -> drag-to-steer takes over.
const tilt = {
  listening: false, enabled: false, denied: false,
  raw: 0, smooth: 0, base: 0, last: 0,
  sens: clamp(parseInt(storage.get(TILT_KEY, ''), 10) || CONFIG.tiltSensDefault, 1, 10),
  needsPermission: typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function',
};
const isTouchDevice = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

function onOrientation(e) {
  if (e.gamma == null || e.beta == null) return;
  const angle = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
  tilt.raw = angle === 90 ? e.beta : angle === -90 || angle === 270 ? -e.beta : e.gamma;
  tilt.last = performance.now();
  if (!tilt.enabled) { tilt.enabled = true; calibrateTilt(); updateSteerUI(); }
}
function listenForTilt() {
  if (tilt.listening || !isTouchDevice) return;
  tilt.listening = true;
  window.addEventListener('deviceorientation', onOrientation);
}
// iPhone only lets a page read motion after the player taps "enable".
async function requestTilt() {
  try {
    if ((await DeviceOrientationEvent.requestPermission()) === 'granted') listenForTilt();
    else tilt.denied = true;
  } catch (e) { tilt.denied = true; }
  updateSteerUI();
}
function tiltActive() { return tilt.enabled && performance.now() - tilt.last < 1000; }
function calibrateTilt() { tilt.base = tilt.smooth = tilt.raw; }
// Sideways steering speed from tilt: dead zone, then a gentle-to-hard curve up
// to full steering at tiltFullAngle (scaled by the sensitivity slider).
function tiltSteer() {
  const a = tilt.smooth - tilt.base, dz = CONFIG.tiltDeadZone;
  const full = CONFIG.tiltFullAngle * Math.pow(CONFIG.tiltSensStep, 5 - tilt.sens);   // higher sensitivity = less tilt needed
  const n = clamp((Math.abs(a) - dz) / Math.max(1, full - dz), 0, 1);
  return Math.sign(a) * Math.pow(n, CONFIG.tiltCurve) * CONFIG.tiltMaxSteer;
}
// --- Touch / mouse ---
// With tilt on, every touch is a throw (left half = left, right half =
// right), fired on touch-down for speed. Without tilt, a pointer is "pending"
// until it moves more than tapMaxMove (then it's a drag and steers) or lifts
// within tapMaxTime (then it's a tap and throws). Taps never steer.
function toLogicalX(clientX) {
  const rect = canvas.getBoundingClientRect();
  return (clientX - rect.left - view.offX) / view.scale;
}
function toLogicalY(clientY) {
  const rect = canvas.getBoundingClientRect();
  return (clientY - rect.top - view.offY) / view.scale;
}
// Three quick taps on the score toggle the hit-area debug view (works on phones).
function scoreTap() {
  const now = performance.now();
  debug.taps = debug.taps.filter((t) => now - t < 700);
  debug.taps.push(now);
  if (debug.taps.length >= 3) { debug.taps = []; debug.hitAreas = !debug.hitAreas; game.trails = []; }
}

canvas.addEventListener('pointerdown', (e) => {
  if (game.state === 'cutscene') { e.preventDefault(); cutsceneTap(toLogicalX(e.clientX), toLogicalY(e.clientY)); return; }
  if (game.state !== 'playing') return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  e.preventDefault();
  if (toLogicalX(e.clientX) < 150 && toLogicalY(e.clientY) < view.safeTop + 62) { scoreTap(); return; }   // score corner never throws
  if (tiltActive()) {
    throwPaper(toLogicalX(e.clientX) < view.W / 2 ? -1 : 1);
    return;
  }
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  pointers.set(e.pointerId, {
    startX: e.clientX, startY: e.clientY, lastX: e.clientX,
    t0: performance.now(), dragging: false,
  });
});

canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  if (!p.dragging) {
    const dx = e.clientX - p.startX;
    const dy = e.clientY - p.startY;
    if (dx * dx + dy * dy > CONFIG.tapMaxMove * CONFIG.tapMaxMove) {
      p.dragging = true;
      p.lastX = p.startX;   // count the movement so far so steering doesn't lag
    }
  }
  if (p.dragging) {
    const d = (e.clientX - p.lastX) / view.scale;
    input.steerTarget = clamp(input.steerTarget + d * CONFIG.dragSensitivity, L.bikeMinX, L.bikeMaxX);
    p.lastX = e.clientX;
  }
});

function endPointer(e, cancelled) {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  pointers.delete(e.pointerId);
  if (cancelled || p.dragging) return;
  if (performance.now() - p.t0 <= CONFIG.tapMaxTime) {
    throwPaper(toLogicalX(p.startX) < view.W / 2 ? -1 : 1);
  }
}
canvas.addEventListener('pointerup', (e) => endPointer(e, false));
canvas.addEventListener('pointercancel', (e) => endPointer(e, true));
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());   // iOS pinch

const KEYS_LEFT = ['ArrowLeft'];
const KEYS_RIGHT = ['ArrowRight'];
const KEYS_THROW_LEFT = ['KeyA', 'KeyZ'];
const KEYS_THROW_RIGHT = ['KeyD', 'KeyX'];

window.addEventListener('keydown', (e) => {
  if (KEYS_LEFT.includes(e.code)) { input.left = true; e.preventDefault(); }
  else if (KEYS_RIGHT.includes(e.code)) { input.right = true; e.preventDefault(); }
  if (e.repeat) return;
  if (game.state === 'cutscene') {
    if (e.code === 'Escape') endCutscene();
    else if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); advanceCutscene(); }
    return;
  }
  if (e.code === 'KeyH') { debug.hitAreas = !debug.hitAreas; return; }
  if (game.state === 'over' && overUnlocked() && (e.code === 'KeyR' || e.code === 'KeyN')) { e.code === 'KeyR' ? retryDay() : startGame(); return; }
  if (e.code === 'KeyM') { cycleMusic(); return; }
  if (e.code === 'KeyP' || e.code === 'Escape') { if (game.state === 'playing') pauseGame(); else resumeGame(); return; }
  if (KEYS_THROW_LEFT.includes(e.code)) throwPaper(-1);
  else if (KEYS_THROW_RIGHT.includes(e.code)) throwPaper(1);
  else if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    tryStartFromOverlay();
  }
});
window.addEventListener('keyup', (e) => {
  if (KEYS_LEFT.includes(e.code)) input.left = false;
  else if (KEYS_RIGHT.includes(e.code)) input.right = false;
});
window.addEventListener('blur', () => { input.left = input.right = false; pointers.clear(); });


// ---------------------------------------------------------------------
// 6. SPAWNING
// The street (house layout + who subscribes) is built once per game and
// re-ridden every day. layoutDay() turns it into this day's world.
// ---------------------------------------------------------------------
function buildStreet() {
  const street = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < CONFIG.housesPerSide; i++) {
      const len = rand(CONFIG.houseLenMin, CONFIG.houseLenMax);
      street.push({
        side, len, sub: false, newSub: false,
        seed: (Math.random() * 1e9) | 0,   // drives this slot's look each day
        props: makeProps(len),
      });
    }
  }
  const shuffled = street.slice().sort(() => Math.random() - 0.5);
  for (const t of shuffled.slice(0, CONFIG.startSubscribers)) t.sub = true;
  return street;
}

// Props sit where they don't block the mailbox (22% along) or the porch (centre).
function makeProps(len) {
  const props = [];
  if (Math.random() < CONFIG.propChance) props.push({ type: 'trash', lx: L.trashX, off: len * 0.06 + 4, hw: 5, hz: 5 });
  const r = Math.random();
  if (r < 0.3) props.push({ type: 'fence', lx: L.fenceX, off: len * 0.86, hw: 3, hz: 14 });
  else if (r < 0.55) props.push({ type: 'flamingo', lx: L.decoX, off: len * 0.8, hw: 4, hz: 4 });
  else if (r < 0.75) props.push({ type: 'gnome', lx: L.decoX, off: len * 0.8, hw: 4, hz: 4 });
  return props;
}

// Houses are spaced by TIME: one roughly every houseInterval seconds per side
// at the speed you'll be riding there, so faster days spread them out instead
// of cramming them together. The gaps become side yards.
function layoutDay() {
  const th = theme(), z0 = CONFIG.routeLeadIn;
  let end = 0;
  for (const side of [-1, 1]) {
    const slots = game.street.filter((t) => t.side === side);
    let z = z0 + (side > 0 ? CONFIG.houseInterval * speedFor(game.day, 0) * 0.5 : 0);   // sides alternate
    slots.forEach((tpl, i) => {
      const rng = mulberry32(tpl.seed + game.day * 7919);   // same slot + day = same look
      const h = makeHouse(tpl, side, z, tpl.len, rng, false);
      game.houses.push(h);
      if (tpl.sub) game.stats.subs++;
      const step = houseStep(tpl.len, speedFor(game.day, i * 2), rng);
      if (i < slots.length - 1) decorateGap(side, z + tpl.len, z + step, rng, HOUSE_STYLES[h.style]);   // the bonus course continues the street after the last one
      end = Math.max(end, z + tpl.len);
      z += step;
    });
  }
  game.routeEndZ = end + 40;
  setPropertyBounds();
  addTrees(-view.H, z0 - 40);

  for (let k = 1; k <= th.streetcars; k++) addStreetcar(z0 + (end - z0) * k / (th.streetcars + 1));

  game.nextObstacleZ = z0 + (isFirstDay() ? CONFIG.graceTime * CONFIG.startSpeed : 300);

  const bz0 = game.routeEndZ + CONFIG.bonusGap;
  const bonusSpeed = speedFor(game.day, CONFIG.housesPerSide * 2);
  buildBonus(bz0, bz0 + CONFIG.bonusDuration * bonusSpeed);
  addLamps(-view.H, game.bonus.z1 + 400);
}

// Ornate lamp posts along both sidewalks (THEMES[].lamps = spacing).
function addLamps(zFrom, zTo) {
  const gap = theme().lamps;
  if (!gap) return;
  for (const side of [-1, 1]) {
    for (let z = zFrom + (side > 0 ? gap / 2 : 0); z < zTo; z += gap) game.decor.push({ type: 'lamp', x: sideX(side, 127), z });
  }
}

// Each lot reaches propertyMargin into its side yards, but never past the
// halfway point to the neighbor, so two properties never overlap.
function setPropertyBounds() {
  for (const side of [-1, 1]) {
    const hs = game.houses.filter((h) => h.side === side && !h.scenery).sort((a, b) => a.z - b.z);
    hs.forEach((h, i) => {
      const before = i > 0 ? (h.z - (hs[i - 1].z + hs[i - 1].len)) / 2 : CONFIG.propertyMargin;
      const after = i < hs.length - 1 ? (hs[i + 1].z - (h.z + h.len)) / 2 : CONFIG.propertyMargin;
      h.propZ0 = h.z - Math.min(CONFIG.propertyMargin, before);
      h.propZ1 = h.z + h.len + Math.min(CONFIG.propertyMargin, after);
    });
  }
}

// Start-to-start distance for the next house at this speed.
function houseStep(len, speed, rng) {
  const jitter = 1 + (rng() * 2 - 1) * CONFIG.houseIntervalJitter;
  return Math.max(len + CONFIG.yardMin, CONFIG.houseInterval * speed * jitter);
}

// One house in this day's neighborhood style. Scenery houses (bonus course)
// have no subscriber, mailbox or props and can't be scored on.
function makeHouse(tpl, side, z, len, rng, scenery) {
  const th = theme();
  const style = weightedPick(th.houses, rng), st = HOUSE_STYLES[style];
  const muralChance = scenery ? th.bonus.murals : th.murals;
  return {
    tpl, side, z, len, scenery,
    sub: !scenery && tpl.sub, newSub: !scenery && tpl.newSub,
    delivered: false, passed: false, missed: false, windows: [false, false],
    mailZ: z + len * 0.22,
    propZ0: z - CONFIG.propertyMargin, propZ1: z + len + CONFIG.propertyMargin,   // trimmed to the side yards in layoutDay
    style, seed: scenery ? (rng() * 1e9) | 0 : tpl.seed,
    wall: pickR(st.walls, rng), roof: pickR(st.roofs, rng), trim: pickR(st.trims, rng),
    lower: st.lowers ? pickR(st.lowers, rng) : null,
    accent: st.awnings ? pickR(st.awnings, rng) : null,
    wallH: Math.round(lerp(st.wallH[0], st.wallH[1], rng()) / 2) * 2,
    chimney: rng() < (st.chimney || 0),
    tower: rng() < (st.tower || 0),
    retaining: !!st.yard && rng() < th.retainingWalls,
    flags: rng() < th.flags,
    mural: st.mural && th.muralColors.length && rng() < muralChance ? pickR(th.muralColors, rng) : null,
    spire: st.towers ? pickSpire(st.towers, rng()) : null,
    props: scenery ? [] : tpl.props.map((p) => ({ ...p, z: z + p.off, knocked: false })),
  };
}

function pickSpire(towers, r) { return r < towers.bell ? 'bell' : r < towers.bell + towers.dome ? 'dome' : null; }

// Side yard between two houses: maybe a driveway, maybe a fence along the
// lot line, then trees / fountains / smokers / crowds from the theme.
function decorateGap(side, za, zb, rng, st) {
  const gap = zb - za, th = theme();
  if (gap < 30) return;
  if (th.plazas && gap > 110 && rng() < th.plazas) {   // paved plaza with a grand fountain
    game.pavedLots.push({ side, z0: za, z1: zb });
    game.decor.push({ type: 'grandFountain', x: sideX(side, 58), z: (za + zb) / 2, s: Math.min(1.25, (gap - 30) / 110) });
    for (const pz of [za + 10, zb - 10]) game.decor.push({ type: 'planter', x: sideX(side, 96), z: pz, seed: (rng() * 100) | 0 });
    return;
  }
  let from = za;
  if (st.yard && gap > 70 && rng() < CONFIG.drivewayChance) {
    game.driveways.push({ side, z0: za + 8, z1: za + 32 });
    from = za + 40;
  }
  if (st.yard && gap > 90 && rng() < CONFIG.sideFenceChance) game.decor.push({ type: 'sidefence', side, z: zb - 10 });
  const n = Math.max(1, Math.floor((zb - from) / 95));
  for (let k = 0; k < n; k++) game.decor.push(makeDecor(side, lerp(from, zb - 12, (k + 0.5) / n), rng));
}

// Something for the gap between two houses (decor only, papers fly past).
function makeDecor(side, z, rng) {
  const th = theme(), type = weightedPick(th.decor, rng);
  switch (type) {
    case 'tree': return { type, x: sideX(side, lerp(26, 52, rng())), z, pal: weightedPick(th.trees, rng) };
    case 'fountain': return { type, x: sideX(side, lerp(66, 78, rng())), z };
    case 'planter': return { type, x: sideX(side, lerp(84, 96, rng())), z, seed: (rng() * 100) | 0 };
    case 'smoker':
    case 'grill': return { type, x: sideX(side, lerp(50, 70, rng())), z };
    case 'crowd': return { type, x: sideX(side, lerp(58, 78, rng())), z, n: 3 + ((rng() * 3) | 0), seed: (rng() * 1e6) | 0 };
    default: return { type: 'bush', x: sideX(side, lerp(84, 92, rng())), z };
  }
}

function addTrees(zFrom, zTo) {
  const th = theme();
  for (const side of [-1, 1]) {
    for (let z = zFrom + rand(0, 60); z < zTo; z += rand(80, 130)) {
      game.decor.push(Math.random() < 0.75
        ? { type: 'tree', x: sideX(side, rand(24, 80)), z, pal: weightedPick(th.trees) }
        : { type: 'bush', x: sideX(side, rand(24, 80)), z });
    }
  }
}

// Streetcar: crosses the road on rails. It starts moving streetcarLead
// seconds before you arrive (bell + lights streetcarWarn seconds earlier)
// and is part-way across when you get there: ride on the side it came from.
function addStreetcar(z) {
  const dir = Math.random() < 0.5 ? -1 : 1;
  const car = {
    type: 'streetcar', z, dir, w: 170, h: 26, x: view.W / 2 - dir * (view.W / 2 + 100),
    arriveX: view.W / 2 + dir * CONFIG.streetcarClear, active: false, warned: false, vx: 0,
  };
  game.obstacles.push(car);
  game.tracks.push({ z, car });
}
function nearTrack(z) { return game.tracks.some((tr) => Math.abs(tr.z - z) < 170); }

// Bonus course: ramps that jump full-width barriers, roadside targets,
// and half-width barriers to weave through.
// Bonus course: the same neighborhood keeps going (scenery houses, yards,
// theme touches) with ramps that jump KC-style obstacles and targets on
// things that belong on a city street.
function buildBonus(z0, z1) {
  const th = theme(), B = th.bonus;
  game.bonus = { z0, z1, clean: true };
  game.lines.push({ z: z0 }, { z: z1 });
  const rng = mulberry32(game.street[0].seed + game.day * 131 + game.week * 977);
  const speed = speedFor(game.day, CONFIG.housesPerSide * 2);

  for (const side of [-1, 1]) {
    let z = game.routeEndZ + 40 + (side > 0 ? CONFIG.houseInterval * speed * 0.5 : 0);
    while (z < z1 + 500) {
      const len = lerp(CONFIG.houseLenMin, CONFIG.houseLenMax, rng());
      const h = makeHouse(null, side, z, len, rng, true);
      game.houses.push(h);
      const st = HOUSE_STYLES[h.style];
      if (B.sideline === 'patios' && st.paved) {
        for (const f of [0.3, 0.7]) game.decor.push({ type: 'patio', x: sideX(side, 94), z: z + len * f, seed: (rng() * 1e6) | 0 });
      }
      const step = houseStep(len, speed, rng);
      decorateGap(side, z + len, z + step, rng, st);
      z += step;
    }
    if (B.lights) game.lights.push({ side, z0: game.routeEndZ, z1: z1 + 400 });
    if (B.sideline === 'joggers' || B.sideline === 'crowd') {
      for (let zz = z0 - 150; zz < z1 + 150; zz += B.sidelineGap * lerp(0.8, 1.2, rng())) {
        game.decor.push(B.sideline === 'joggers'
          ? { type: 'jogside', x: sideX(side, 126), z: zz, phase: rng() * 6 }
          : { type: 'crowd', x: sideX(side, 100), z: zz, n: 3 + ((rng() * 3) | 0), seed: (rng() * 1e6) | 0 });
      }
    }
  }
  for (let k = 0; k < (B.tracks || 0); k++) game.tracks.push({ z: lerp(z0, z1, (k + 0.5) / B.tracks) + 60, car: null });

  const mid = view.W / 2, streetW = L.streetX1 - L.streetX0;
  let z = z0 + 240, side = rng() < 0.5 ? -1 : 1;
  while (z < z1 - 260) {
    switch (weightedPick(CONFIG.bonusWeights, rng)) {
      case 'jump':
        addJump(z, weightedPick(B.jumps, rng), rng);
        z += 380;
        break;
      case 'targets':
        for (let i = 0; i < 3; i++) { addTargets(side, z + i * 100, weightedPick(B.targets, rng)); side = -side; }
        z += 360;
        break;
      case 'slalom':
        for (let i = 0; i < 3; i++) {
          game.obstacles.push({ type: 'barrier', x: mid + side * streetW * 0.2, z: z + i * 130, w: streetW * 0.6, h: 8 });
          side = -side;
        }
        z += 460;
        break;
    }
  }
}

// Ramp, then something to jump: a fountain, a parked car across the road, or
// a row of cones. Cones fill the rest of the road so the jump is the way over.
function addJump(z, kind, rng) {
  const mid = view.W / 2, oz = z + 95;
  game.ramps.push({ x: mid + (rng() < 0.5 ? -1 : 1) * lerp(30, 44, rng()), z, w: 48, h: 34, used: false });
  let w = 0;   // width of the middle piece; cones overlap its edges so there's no gap to sneak through
  if (kind === 'fountain') {
    w = 60;
    game.obstacles.push({ type: 'fountain', x: mid, z: oz, w, h: 36 });
  } else if (kind === 'car') {
    w = 80;
    game.obstacles.push({ type: 'car', cross: true, x: mid, z: oz, w, h: 34, color: pickR(COLORS.cars, rng) });
  }
  for (let x = L.streetX0 + 8; x <= L.streetX1 - 8; x += 14) {
    if (!w || x <= mid - w / 2 + 6 || x >= mid + w / 2 - 6) game.obstacles.push({ type: 'cone', x, z: oz, w: 12, h: 10 });
  }
}

// Roadside targets (+300 each): a row of mailboxes, a sidewalk sign, a
// newsstand, a BBQ smoker or a fountain basin.
function addTargets(side, z, kind) {
  if (kind === 'mailboxes') {
    for (let i = -1; i <= 1; i++) game.targets.push({ side, lx: 116, z: z + i * 24, hit: false, kind: 'mailbox' });
    return;
  }
  game.targets.push({ side, lx: kind === 'fountain' ? 112 : 116, z, hit: false, kind });
}

function spawnAhead() {
  const ahead = game.dist + view.bikeY + CONFIG.spawnMargin;
  const stop = game.routeEndZ - 120;
  while (game.nextObstacleZ < ahead && game.nextObstacleZ < stop) {
    if (!nearTrack(game.nextObstacleZ)) spawnObstacle(game.nextObstacleZ);
    game.nextObstacleZ += obstacleGap() * rand(0.75, 1.25);
  }
}

function obstacleGap() {
  const gap = CONFIG.obstacleGapStart * Math.pow(CONFIG.obstacleGapMul, game.day + game.level);
  const weekly = Math.pow(CONFIG.weekObstacleMul, game.week - 1);
  return Math.max(CONFIG.obstacleGapFloor, Math.max(CONFIG.obstacleGapMin, gap) * theme().obstacleGapScale * weekly);
}

function spawnObstacle(z) {
  const type = weightedPick(theme().obstacles);
  const side = Math.random() < 0.5 ? -1 : 1;
  switch (type) {
    case 'dog':
    case 'fan':   // Game Day fans dart across like dogs do
      game.obstacles.push({
        type, z, x: sideX(side, 118), dir: -side, w: type === 'fan' ? 16 : 26, h: type === 'fan' ? 12 : 14,
        active: false, anim: 0,
        speed: rand(CONFIG.dogSpeedMin, CONFIG.dogSpeedMax),
        lead: rand(CONFIG.dogRunLeadMin, CONFIG.dogRunLeadMax),
      });
      break;
    case 'pothole':
      game.obstacles.push({ type, z, x: rand(L.bikeMinX + 4, L.bikeMaxX - 4), w: 30, h: 22 });
      break;
    case 'car':
      game.obstacles.push({ type, z, x: sideX(side, 152), w: 38, h: 72, color: pick(COLORS.cars) });
      break;
    case 'skater': {
      const x = rand(L.bikeMinX + 20, L.bikeMaxX - 20);
      game.obstacles.push({ type, z, x, baseX: x, phase: rand(0, Math.PI * 2), w: 18, h: 26 });
      break;
    }
    case 'cone':   // construction taper closing one side of the road
      for (let i = 0; i < 3; i++) {
        game.obstacles.push({ type, z: z + i * 22, x: sideX(side, L.streetX0 + 10 + i * 13), w: 12, h: 10 });
      }
      break;
    case 'jogger': {   // runs toward you
      const x = rand(L.bikeMinX + 8, L.bikeMaxX - 8);
      game.obstacles.push({ type, z: z + 200, x, baseX: x, phase: rand(0, Math.PI * 2), w: 14, h: 14, anim: 0 });
      break;
    }
    case 'traffic':   // a car driving up the boulevard ahead of you (slower, so you catch up to it)
      game.obstacles.push({ type, z: z + 120, x: pick([L.bikeMinX + 16, view.W / 2, L.bikeMaxX - 16]), w: 34, h: 66,
        color: pick(COLORS.cars), speed: rand(CONFIG.trafficSpeedMin, CONFIG.trafficSpeedMax) });
      break;
    case 'median':   // planted island with a fountain in the middle of the road
      game.obstacles.push({ type, z, x: view.W / 2, w: 40, h: 90 });
      break;
  }
}

// ---------------------------------------------------------------------
// 7. UPDATE
// ---------------------------------------------------------------------
function update(dt) {
  if (game.state === 'cutscene') { updateCutscene(dt); return; }
  updateFx(dt);
  const banner = game.banners[0];
  if (banner && game.state === 'playing' && (banner.t -= dt) <= 0) game.banners.shift();

  if (game.state === 'crashed') {
    game.crashTimer -= dt;
    bike.spin += dt * 12;
    if (game.crashTimer <= 0) afterCrash();
    return;
  }
  if (game.state !== 'playing') return;

  game.time += dt;
  game.throwCooldown = Math.max(0, game.throwCooldown - dt);
  if (game.throwCooldown <= 0 && game.queuedThrow) throwPaper(game.queuedThrow);   // tap made during the cooldown
  bike.invuln = Math.max(0, bike.invuln - dt);

  // Difficulty + forward motion
  const level = Math.floor(game.housesPassedToday / CONFIG.housesPerLevel);
  if (level > game.level) {
    game.level = level;
    popText('FASTER!', view.W / 2, game.dist + 200, COLORS.neutral, 22);
    sfx.faster();
  }
  game.speed = damp(game.speed, targetSpeed(), CONFIG.speedEase, dt);
  game.dist += game.speed * dt;
  const stroke = Math.floor(game.dist / CONFIG.pedalStroke);
  if (stroke !== game.pedalPhase) { game.pedalPhase = stroke; if (bike.airT <= 0) sfx.pedalTick(game.speed); }

  // Steering
  if (tilt.enabled) tilt.smooth = damp(tilt.smooth, tilt.raw, CONFIG.tiltSmoothing, dt);
  if (tiltActive()) input.steerTarget += tiltSteer() * dt;
  if (input.left) input.steerTarget -= CONFIG.keySteerSpeed * dt;
  if (input.right) input.steerTarget += CONFIG.keySteerSpeed * dt;
  input.steerTarget = clamp(input.steerTarget, L.bikeMinX, L.bikeMaxX);
  const prevX = bike.x;
  bike.x = damp(bike.x, input.steerTarget, CONFIG.steerSmoothing, dt);
  bike.vx = (bike.x - prevX) / dt;

  // Ramps + jumping (airborne = immune to obstacles)
  if (bike.airT > 0) {
    bike.airT -= dt;
    if (bike.airT <= 0) {
      bike.airT = 0; bike.h = 0;
      burst(bike.x, game.dist, COLORS.sidewalk, 8, 70);
      sfx.land();
    } else {
      bike.h = Math.sin(Math.PI * (1 - bike.airT / CONFIG.jumpTime)) * CONFIG.jumpHeight;
    }
  }
  for (const r of game.ramps) {
    if (!r.used && bike.airT <= 0 && overlapsBike(r, 0.8)) {
      r.used = true;
      bike.airT = CONFIG.jumpTime;
      popText('AIR!', bike.x, game.dist + 60, COLORS.perfect, 22);
      sfx.boing();
    }
  }

  // Papers in flight
  for (const p of game.flying) updatePaper(p, dt);
  game.flying = game.flying.filter((p) => !p.done);

  // Obstacles
  for (const o of game.obstacles) {
    if (o.type === 'dog' || o.type === 'fan') {
      if (!o.active && (o.z - game.dist) / game.speed < o.lead) { o.active = true; if (o.type === 'dog') sfx.bark(); }
      if (o.active) { o.x += o.dir * o.speed * dt; o.anim += dt * 16; }
    } else if (o.type === 'skater') {
      o.z += CONFIG.skaterSpeed * dt;
      o.x = o.baseX + Math.sin(o.phase + game.time * CONFIG.skaterWeaveFreq) * CONFIG.skaterWeave;
    } else if (o.type === 'jogger') {
      o.z -= CONFIG.joggerSpeed * dt;
      o.anim += dt * 8;
      o.x = o.baseX + Math.sin(o.phase + game.time * 1.3) * 10;
    } else if (o.type === 'traffic') {
      o.z += o.speed * dt;
    } else if (o.type === 'car' && !o.cross && !o.honked && o.z > game.dist &&
               (o.z - game.dist) / game.speed < CONFIG.honkLead && Math.abs(o.x - bike.x) < 60) {
      o.honked = true;   // honks as you come up on it
      sfx.honk();
    } else if (o.type === 'streetcar') {
      updateStreetcar(o, dt);
    }
    if (bike.airT <= 0 && bike.invuln <= 0 && overlapsBike(o, CONFIG.hitForgiveness)) { crash(o); return; }
  }

  if (isFirstDay() && !game.warnedObstacles && game.time >= CONFIG.graceTime) {
    game.warnedObstacles = true;
    popText('Watch the road!', view.W / 2, game.dist + 260, COLORS.perfect, 22);
  }

  updateSmoke(dt);

  // Houses we've ridden past (drives the speed-ups)
  for (const h of game.houses) {
    if (h.scenery || h.passed || h.z + h.len > game.dist) continue;
    h.passed = true;
    game.housesPassedToday++;
  }
  // MISSED only once a subscriber house is completely off the bottom of the
  // screen and no paper is still flying toward it (a missed subscriber just
  // means no points).
  for (const h of game.houses) {
    if (!h.sub || h.delivered || h.missed || !h.passed) continue;
    const st = HOUSE_STYLES[h.style], top = h.wallH + (st.roof === 'flat' ? 6 : st.roofH);
    const screenY = view.bikeY - (h.propZ1 - game.dist) - top * CONFIG.heightY;   // top of the house, on screen
    if (screenY < view.H) continue;
    if (game.flying.some((p) => p.side === h.side && p.z >= h.propZ0 && p.z <= h.propZ1)) continue;
    h.missed = true;
    popText('MISSED', sideX(h.side, 80), game.dist + view.bikeY - (view.H - 70), COLORS.neutral, 16);
    sfx.missed();
    game.combo = 0;
  }

  // Day phases
  if (game.phase === 'route' && game.dist > game.routeEndZ && !game.flying.length) finishRoute();   // let the last papers land first
  else if (game.phase === 'bonus' && game.dist > game.bonus.z1) finishBonus();
  else if (game.phase === 'outro' && (game.phaseTimer -= dt) <= 0) { showDaySummary(); return; }

  spawnAhead();
  despawnBehind();
}

function updateStreetcar(o, dt) {
  const tta = (o.z - game.dist) / Math.max(game.speed, 1);
  if (!o.warned && tta < CONFIG.streetcarLead + CONFIG.streetcarWarn) {
    o.warned = true;
    sfx.streetcarBell();
    popText('DING DING!', view.W / 2, game.dist + 260, COLORS.perfect, 24);
  }
  if (!o.active && tta < CONFIG.streetcarLead) {
    o.active = true;
    o.vx = (o.arriveX - o.x) / CONFIG.streetcarLead;
    sfx.streetcarBell();
  }
  if (o.active) o.x += o.vx * dt;
}

// BBQ smoke: smokers/grills ahead sometimes puff a cloud that drifts across
// the road (and up it, so it lingers on screen).
function updateSmoke(dt) {
  const th = theme();
  if (th.smoke > 0 && game.smokes.length < CONFIG.smokeMax) {
    for (const d of game.decor) {
      if (d.type !== 'smoker' && d.type !== 'grill') continue;
      const ahead = d.z - game.dist;
      if (ahead > 120 && ahead < view.bikeY + 80 && Math.random() < th.smoke * dt) {
        game.smokes.push({
          x: d.x, z: d.z, vx: (d.x < view.W / 2 ? 1 : -1) * CONFIG.smokeDrift,
          life: CONFIG.smokeLife, max: CONFIG.smokeLife, seed: (Math.random() * 1e6) | 0,
        });
        break;
      }
    }
  }
  for (const s of game.smokes) {
    s.x += s.vx * dt;
    s.z += game.speed * CONFIG.smokeFollow * dt;
    s.life -= dt;
  }
  game.smokes = game.smokes.filter((s) => s.life > 0);
}
function finishRoute() {
  const s = game.stats;
  s.perfect = s.subs > 0 && s.deliveries === s.subs && s.subWindows === 0;
  game.phase = 'bonus';
  if (s.perfect) {
    s.perfectBonus = s.routePoints * (CONFIG.perfectMultiplier - 1);
    game.score += s.perfectBonus;
    pushBanner('PERFECT DELIVERY!', `DAY POINTS x${CONFIG.perfectMultiplier}  +${s.perfectBonus}`, COLORS.perfect, CONFIG.bannerTime + 0.6);
    celebrate();
    sfx.perfect();
  }
  pushBanner('BONUS COURSE!', 'HIT TARGETS · JUMP RAMPS', COLORS.good, CONFIG.bannerTime);
}

function finishBonus() {
  game.stats.bonusClean = game.bonus.clean;
  if (game.bonus.clean) {
    addPoints(CONFIG.pointsBonusClear);
    popText(`+${CONFIG.pointsBonusClear} COURSE CLEAR!`, view.W / 2, game.dist + 140, COLORS.perfect, 24);
    sfx.clear();
    celebrate();
  }
  game.phase = 'outro';
  game.phaseTimer = CONFIG.outroTime;
}

function celebrate() {
  game.flash = 0.4; game.flashColor = COLORS.perfect;
  const confetti = [COLORS.perfect, COLORS.good, COLORS.bad, COLORS.glass, '#ffffff'];
  for (let i = 0; i < 7; i++) {
    burst(rand(40, view.W - 40), game.dist + rand(60, view.bikeY), pick(confetti), 14, 160);
  }
}

function updateFx(dt) {
  game.shake = Math.max(0, game.shake - CONFIG.shakeDecay * dt);
  game.flash = Math.max(0, game.flash - dt);
  for (const p of game.particles) {
    p.x += p.vx * dt; p.z += p.vz * dt;
    p.vx *= 0.92; p.vz *= 0.92;
    p.vh -= 520 * dt;
    p.h = Math.max(0, p.h + p.vh * dt);
    p.life -= dt;
  }
  game.particles = game.particles.filter((p) => p.life > 0);
  for (const p of game.pops) { p.y -= 38 * dt; p.life -= dt; }
  game.pops = game.pops.filter((p) => p.life > 0);
  if (game.trails) { for (const tr of game.trails) tr.life -= dt; game.trails = game.trails.filter((tr) => tr.life > 0); }
}

// Houses are kept all day (only 20); everything else is dropped once behind.
function despawnBehind() {
  const limit = game.dist - (view.H - view.bikeY) - 120;
  game.decor = game.decor.filter((d) => d.z > limit);
  game.obstacles = game.obstacles.filter((o) => o.z + o.h > limit && (o.type === 'streetcar' || (o.x > -60 && o.x < view.W + 60)));
  game.groundPapers = game.groundPapers.filter((p) => p.z > limit);
  game.ramps = game.ramps.filter((r) => r.z + r.h > limit);
  game.targets = game.targets.filter((t) => t.z > limit);
}

function overlapsBike(o, forgiveness) {
  return Math.abs(o.x - bike.x) < (o.w / 2 + CONFIG.bikeHalfW) * forgiveness &&
         Math.abs(o.z - game.dist) < (o.h / 2 + CONFIG.bikeHalfL) * forgiveness;
}

// --- Throwing ---
// A paper is a point travelling in left-side coordinates (lx shrinks as it
// flies outward) at a fixed height. It keeps flying until it hits something
// or leaves the screen; nothing is decided at throw time.
// A tap in the last throwBuffer seconds of the cooldown is remembered and
// thrown as soon as it ends (earlier double-taps are ignored, so a late
// buffered paper can't land somewhere you didn't aim).
function throwPaper(side) {
  if (game.state !== 'playing') return;
  if (game.throwCooldown > 0) {   // a tap just before the cooldown ends is thrown the moment it does
    if (game.throwCooldown <= CONFIG.throwBuffer) game.queuedThrow = side;
    return;
  }
  game.throwCooldown = CONFIG.throwCooldown;
  game.queuedThrow = 0;
  sfx.throw();
  const x = bike.x + side * 8;
  const p = {
    side, lx: side < 0 ? x : view.W - x, z: game.dist, vz: game.speed * CONFIG.paperCarry,
    h: CONFIG.throwHeight + bike.h, rot: 0, spin: side * rand(14, 20), done: false, trail: [],
  };
  p.trail.push([p.lx, p.z]);
  game.flying.push(p);
}

// Moves the paper in sub-steps of at most CONFIG.paperStep units and sweeps
// each step against every hitbox, so nothing is skipped at low frame rates.
function updatePaper(p, dt) {
  p.rot += p.spin * dt;
  if (p.h > CONFIG.throwHeight) p.h = Math.max(CONFIG.throwHeight, p.h - 80 * dt);   // thrown mid-jump
  const dx = CONFIG.throwSpeed * dt, dz = p.vz * dt;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / CONFIG.paperStep));
  for (let i = 0; i < steps; i++) {
    const a = [p.lx, p.z];
    p.lx -= dx / steps;
    p.z += dz / steps;
    const hit = paperHit(p, a);
    if (hit) {
      p.lx = hit.lx; p.z = hit.z;
      p.trail.push([p.lx, p.z]);
      applyPaperHit(p, hit);
      endPaper(p, hit.type);
      return;
    }
  }
  p.trail.push([p.lx, p.z]);
  if (p.lx < CONFIG.paperMinLx) endPaper(p, 'miss');   // flew off the edge of the screen
}

// Keep the paper's path around briefly for the debug overlay.
function endPaper(p, outcome) {
  p.done = true;
  if (debug.hitAreas) game.trails.push({ side: p.side, pts: p.trail, outcome, life: CONFIG.debugTrailLife });
}

// Segment (a -> b) vs box [x0,x1] x [z0,z1] in left-side coords.
// Returns the entry fraction 0..1, or -1 if the segment misses the box.
function sweepBox(a, b, x0, x1, z0, z1) {
  let t0 = 0, t1 = 1;
  const d = [b[0] - a[0], b[1] - a[1]], lo = [x0, z0], hi = [x1, z1];
  for (let k = 0; k < 2; k++) {
    if (Math.abs(d[k]) < 1e-9) {
      if (a[k] < lo[k] || a[k] > hi[k]) return -1;
    } else {
      let ta = (lo[k] - a[k]) / d[k], tb = (hi[k] - a[k]) / d[k];
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) return -1;
    }
  }
  return t0;
}

// What the paper runs into on this step (a -> current position), earliest
// first. Subscriber houses use tiered zones: at any spot along the street
// exactly one of mailbox > porch > window > property applies.
function paperHit(p, a) {
  const b = [p.lx, p.z];
  let hit = null;
  const test = (x0, x1, z0, z1, info) => {
    const t = sweepBox(a, b, x0, x1, z0, z1);
    if (t >= 0 && (!hit || t < hit.t)) hit = { t, lx: lerp(a[0], b[0], t), z: lerp(a[1], b[1], t), ...info };
  };
  const FAR = -1000;   // "from this line inward": a box reaching to the back of the lot
  for (const t of game.targets) {
    if (t.side === p.side && !t.hit) test(t.lx - 6, t.lx + 4, t.z - CONFIG.targetHalf, t.z + CONFIG.targetHalf, { type: 'target', t });
  }
  for (const h of game.houses) {
    if (h.side !== p.side || p.z < h.propZ0 - 40 || p.z > h.propZ1 + 40) continue;
    if (h.scenery) { test(FAR, L.wallX, h.z, h.z + h.len, { type: 'thud', h }); continue; }
    if (h.sub) {
      const zone = subZoneAt(h, (a[1] + b[1]) / 2);
      if (zone) test(zone.x0, zone.x1, zone.z0, zone.z1, { type: zone.type, h, idx: zone.idx });
      continue;
    }
    // Non-subscribers: props, mailbox, porch and walls in the order the paper meets them.
    const zn = hitZones(h);
    for (const pr of h.props) {
      if (!pr.knocked) test(pr.lx - pr.hw, pr.lx + pr.hw, pr.z - pr.hz - 3, pr.z + pr.hz + 3, { type: 'prop', h, pr });
    }
    test(zn.mailboxX[0], zn.mailboxX[1], zn.mailbox[0], zn.mailbox[1], { type: 'mailbox', h });
    test(FAR, L.stepsX, zn.porch[0], zn.porch[1], { type: 'porch', h });
    test(FAR, L.wallX, h.z, zn.porch[0], { type: 'wall', h });
    test(FAR, L.wallX, zn.porch[1], h.z + h.len, { type: 'wall', h });
  }
  return hit;
}

// The single delivery zone of a subscriber house at street position z
// (or null outside its property), with the box the paper must reach.
function subZoneAt(h, z) {
  const zn = hitZones(h), FAR = -1000;
  if (z < zn.property[0] || z > zn.property[1]) return null;
  if (z >= zn.mailbox[0] && z <= zn.mailbox[1]) {
    return { type: 'mailbox', x0: zn.mailboxX[0], x1: zn.mailboxX[1], z0: zn.mailbox[0], z1: zn.mailbox[1] };
  }
  if (z >= zn.porch[0] && z <= zn.porch[1]) return { type: 'porch', x0: FAR, x1: L.stepsX, z0: zn.porch[0], z1: zn.porch[1] };
  const idx = zn.windows.findIndex(([lo, hi]) => z >= lo && z <= hi);
  if (idx >= 0 && !h.windows[idx]) {
    return { type: 'window', idx, x0: FAR, x1: L.wallX + 2, z0: zn.windows[idx][0], z1: zn.windows[idx][1] };
  }
  // Everything else on the lot: the house front, or the lawn / walkway / driveway.
  const onHouse = z >= h.z && z <= h.z + h.len;
  const front = onHouse ? L.wallX : CONFIG.propertyLandLx;
  const [z0, z1] = onHouse ? [h.z, h.z + h.len] : z < h.z ? [zn.property[0], h.z] : [h.z + h.len, zn.property[1]];
  return { type: 'property', x0: FAR, x1: front, z0, z1 };
}

function applyPaperHit(p, hit) {
  const x = sideX(p.side, hit.lx), z = hit.z, h = hit.h, s = game.stats;
  switch (hit.type) {
    case 'target':
      hit.t.hit = true;
      s.targets++;
      sfx.ping();
      addPoints(CONFIG.pointsBonusTarget);
      popText(`+${CONFIG.pointsBonusTarget}`, x, z, COLORS.perfect, 24);
      burst(x, z, { fountain: COLORS.waterLight, smoker: COLORS.smoke, newsstand: COLORS.paper }[hit.t.kind] || COLORS.bad, 12, 130);
      burst(x, z, '#ffffff', 8, 110);
      dropPaper(p, hit.lx + 6);
      break;

    case 'thud':
      burst(x, z, '#d9d3c3', 5, 50);
      dropPaper(p, L.wallX + 8);
      break;

    case 'prop':   // non-subscriber yard stuff
      hit.pr.knocked = true;
      burst(x, z, hit.pr.type === 'trash' ? pick(COLORS.garbage) : COLORS.fence, 10, 120);
      s.props++;
      sfx.clatter();
      addPoints(CONFIG.pointsProp);
      popText(`+${CONFIG.pointsProp} BAM!`, x, z, COLORS.good, 22);
      dropPaper(p, hit.lx + 4);
      break;

    case 'mailbox':
      if (h.sub) { if (deliverTo(h, 'mailbox', x, z)) return; }   // it's in the mailbox: nothing left on the lawn
      else popText('THUNK', x, z, COLORS.neutral, 14);
      dropPaper(p, hit.lx + 4);
      break;

    case 'porch':
      if (h.sub) deliverTo(h, 'porch', x, z);
      dropPaper(p, L.porchX1 - 6);
      break;

    case 'property':
      deliverTo(h, 'property', x, z);
      dropPaper(p, hit.lx + 2);
      break;

    case 'window':   // subscriber window: breaks, no points, no Perfect Day today
      breakWindow(h, hit.idx, x, z);
      dropPaper(p, L.wallX + 8);
      break;

    case 'wall': {   // non-subscriber wall: windows are fair game
      const idx = hitZones(h).windows.findIndex(([lo, hi]) => z >= lo && z <= hi);
      if (idx >= 0 && !h.windows[idx]) breakWindow(h, idx, x, z);
      dropPaper(p, L.wallX + 8);
      break;
    }
  }
}

const DELIVERY = {
  mailbox: { points: () => CONFIG.pointsMailbox, label: 'MAILBOX!', color: COLORS.perfect, size: 26 },
  porch: { points: () => CONFIG.pointsPorch, label: 'PORCH!', color: COLORS.good, size: 24 },
  property: { points: () => CONFIG.pointsProperty, label: 'DELIVERED', color: COLORS.neutral, size: 20 },
};

// Returns true if this paper delivered (first paper to the house only).
function deliverTo(h, kind, x, z) {
  if (h.delivered) { popText('GOT ONE ALREADY', x, z, COLORS.neutral, 14); return false; }
  const d = DELIVERY[kind];
  deliver(h);
  addPoints(d.points());
  sfx[kind](game.combo++);   // success blip climbs with each delivery in a row
  popText(`+${d.points()} ${d.label}`, x, z, d.color, d.size);
  burst(x, z, d.color, CONFIG.particleCount + (kind === 'mailbox' ? 6 : 0), kind === 'mailbox' ? 150 : 110);
  if (kind === 'mailbox') { game.stats.mailbox++; game.shake = Math.max(game.shake, CONFIG.shakeMailbox); }
  return true;
}

function breakWindow(h, idx, x, z) {
  const s = game.stats;
  h.windows[idx] = true;
  s.windows++;
  sfx.glass();
  burst(x, z, COLORS.glass, CONFIG.particleCount + 6, 170);
  burst(x, z, '#ffffff', 6, 140);
  game.shake = Math.max(game.shake, CONFIG.shakeWindow);
  if (h.sub) {
    s.subWindows++;
    game.combo = 0;
    popText('OOPS! SUBSCRIBER', x, z, COLORS.bad, 20);
    game.flash = 0.3; game.flashColor = COLORS.bad;
  } else {
    addPoints(CONFIG.pointsVandalWindow);
    popText(`+${CONFIG.pointsVandalWindow} CRASH!`, x, z, COLORS.glass, 22);
  }
}

// Where a house's hit areas are: along the street (z) and, for the mailbox,
// across it (lx). Used by hit detection, window drawing and the debug
// overlay so they always agree.
function hitZones(h) {
  const cz = h.z + h.len / 2;
  const porch = CONFIG.porchHitHalf + CONFIG.paperHalf;   // door/porch/steps (paper touching it counts)
  const winNear = porch + CONFIG.windowGap, winFar = h.len / 2 - 6;
  return {
    cz,
    porch: [cz - porch, cz + porch],
    mailbox: [h.mailZ - CONFIG.mailboxHitHalf, h.mailZ + CONFIG.mailboxHitHalf],
    mailboxX: [L.mailboxX - CONFIG.mailboxHitHalfX, L.mailboxX + CONFIG.mailboxHitHalfX],
    windows: winFar > winNear ? [[cz - winFar, cz - winNear], [cz + winNear, cz + winFar]] : [],
    property: [h.propZ0, h.propZ1],
  };
}

function canDeliver(h) { return h.sub && !h.delivered; }
function deliver(h) { h.delivered = true; game.stats.deliveries++; game.totalDelivered++; }
function dropPaper(p, lx) { game.groundPapers.push({ x: sideX(p.side, lx), z: p.z, rot: p.rot }); }

function addPoints(n) {
  game.score += n;
  if (game.phase === 'route') game.stats.routePoints += n;
  else game.stats.bonusPoints += n;
}

// --- Effects ---
function burst(x, z, color, n, speed) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), s = rand(0.3, 1) * speed;
    const life = rand(0.35, 0.7);
    game.particles.push({
      x, z, h: 4, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vh: rand(60, 170),
      life, max: life, color, size: rand(2, 4.5),
    });
  }
}

// Pop text lives in screen space so it stays readable while the world scrolls.
function popText(text, x, z, color, size) {
  game.pops.push({ text, x: clamp(x, 110, view.W - 110), y: sy(z), color, size, life: CONFIG.popLife, max: CONFIG.popLife });
}


// ---------------------------------------------------------------------
// 8. RENDER
// The world is drawn into a small offscreen pixel buffer (1 buffer pixel =
// 1 art pixel = CONFIG.pixelSize logical units), then scaled up with no
// smoothing so it stays crisp on any screen. HUD text is drawn on top at
// full resolution.
//
// Fake 3D: the ground is top-down. Anything with height h is projected up
// the screen (h * heightY) and leans away from the centre line
// (h * perspX), like a camera floating above the middle of the street.
// proj(x, z, h) does that. Walls, roofs and boxes are flat polygons filled
// one pixel row at a time (fillPoly), so every edge is a hard pixel edge.
//
// Sprites are tiny ASCII pixel-art grids (SPRITE_ART) baked to canvases at
// startup. To use real art later, put a loaded Image in SPR under the same
// name (1 image pixel = 1 art pixel); drawSprite() doesn't care.
// ---------------------------------------------------------------------
const FONT = '"Press Start 2P", ui-monospace, Menlo, monospace';

const PAL = {
  k: '#1a1c2c',                 // outline
  w: '#2b2b35',                 // tires
  g: '#a7b0ba',                 // handlebar
  s: '#f2c8a0',                 // skin
  c: '#2d3a4a',                 // cap
  o: '#ff8c42', O: '#d0662a',   // shirt
  y: '#d8b06a', Y: '#a37e44',   // paper bag
  n: '#34495e',                 // shorts / jeans
  d: '#b0713f', D: '#7a4a28',   // dog
  h: '#6b4226',                 // hair
  p: '#9b5de5', P: '#6f3fb0',   // skater shirt
  m: '#f15bb5',                 // skateboard
  e: '#f7f4ea', E: '#d9d1bd', r: '#d64545',   // newspaper
  a: '#ffd23f',                 // gold
  f: '#ff7eb6', F: '#d9548f',   // flamingo
  b: '#3a7bd5',                 // gnome coat
  t: '#2ec4b6',                 // jogger top
};

const RIDER_TOP = [
  '.....kk.....',
  '.....ww.....',
  '.kgggwwgggk.',
  '.ss..ww..ss.',
  '..s.kkkk.s..',
  '..skccccks..',
  '..okccccko..',
  '.oooOssOooo.',
  '.yooooooooy.',
  'yyOooooooOyy',
  'yyOooooooOyy',
  'yYOOooooOOYy',
  '.Y.OOooOO.Y.',
  '....knnk....',
  '...nnkknn...',
];
const RIDER_BOTTOM = ['....kwwk....', '....kwwk....', '.....kk.....'];

const SPRITE_ART = {
  riderA: [...RIDER_TOP, '...s.ww.....', '...k.ww.s...', '.....ww.k...', ...RIDER_BOTTOM],
  riderB: [...RIDER_TOP, '.....ww.s...', '...s.ww.k...', '...k.ww.....', ...RIDER_BOTTOM],
  dogA: [
    '.........dk...',
    'k........ddkd.',
    '.k.ddddddddddk',
    '..ddddddddddd.',
    '..dDDDDDDDd...',
    '..D.D....D.D..',
    '..D.D....D.D..',
  ],
  dogB: [
    '.........dk...',
    '.k.......ddkd.',
    'k..ddddddddddk',
    '..ddddddddddd.',
    '..dDDDDDDDd...',
    '.D...D..D...D.',
    'D.....DD.....D',
  ],
  skater: [
    '....kkk....',
    '...khhhk...',
    '....hhh....',
    'sspppppppss',
    's..ppppp..s',
    '...ppppp...',
    '...PPPPP...',
    '...nn.nn...',
    '...nn.nn...',
    '...kk.kk...',
    '..mmmmmmm..',
    '..wmmmmmw..',
  ],
  paper: [
    '.kkkkk.',
    'keereek',
    '.kkkkk.',
  ],
  arrow: [
    'kkkkkkk',
    'kaaaaak',
    '.kaaak.',
    '..kak..',
    '...k...',
  ],
  bang: ['kkk', 'kak', 'kak', 'kak', 'kkk', 'kak', 'kkk'],
  flamingo: [
    '...ff.',
    '...fkk',
    '...f..',
    '...f..',
    '..f...',
    '.ffff.',
    'fffFF.',
    '.fFF..',
    '..k...',
    '..k...',
    '..k...',
    '.kk...',
  ],
  gnome: [
    '..r..',
    '.rrr.',
    '.rrr.',
    'rrrrr',
    '.sks.',
    'eeeee',
    '.eee.',
    'bbebb',
    '.k.k.',
  ],
  cone: [
    '...k...',
    '..kok..',
    '..kek..',
    '.koook.',
    '.keeek.',
    'koooook',
    'kkkkkkk',
  ],
  joggerA: [
    '...hhh...',
    '..hsssh..',
    '...sss...',
    '..ttttt..',
    '.sttttts.',
    's.ttttt.s',
    '...ttt...',
    '...nnn...',
    '..nn.nn..',
    '..s...s..',
    '..s...s..',
    '..e...e..',
  ],
  joggerB: [
    '...hhh...',
    '..hsssh..',
    '...sss...',
    '..ttttt..',
    '.sttttts.',
    '.sttttts.',
    '...ttt...',
    '...nnn...',
    '...n.n...',
    '...s.s...',
    '..s...s..',
    '.e.....e.',
  ],
  fanA: [
    '....aaa...',
    '...aaaaa..',
    '....sss...',
    '....ssk...',
    '...rrrr...',
    '..srrrrs..',
    '.s.rrrr.s.',
    '...rrrr...',
    '...nnnn...',
    '..nn..nn..',
    '.nn....nn.',
    'kk......kk',
  ],
  fanB: [
    '....aaa...',
    '...aaaaa..',
    '....sss...',
    '....ssk...',
    '...rrrr...',
    '..srrrrs..',
    '..srrrrs..',
    '...rrrr...',
    '...nnnn...',
    '...nnn....',
    '...n.nn...',
    '..kk..kk..',
  ],
  crowd: [
    '.hhh.',
    '.sss.',
    '.rrr.',
    'srrrs',
    '.rrr.',
    '.n.n.',
    '.n.n.',
    '.k.k.',
  ],
  marker: [
    '..kkkkkkk..',
    '.kaaaaaaak.',
    'kaaaaaaaaak',
    'kaakkkkkaak',
    'kaakerekaak',
    'kaakkkkkaak',
    'kaaaaaaaaak',
    '.kaaaaaaak.',
    '..kkaaakk..',
    '....kak....',
    '.....k.....',
  ],
  heart: [
    '.kk.kk.',
    'krrkrrk',
    'krrrrrk',
    '.krrrk.',
    '..krk..',
    '...k...',
  ],
};

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function spriteFromFn(w, h, fn) {
  const c = makeCanvas(w, h), g = c.getContext('2d');
  fn((x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); });
  return c;
}
function spriteFromArt(rows, pal = PAL) {
  const w = Math.max(...rows.map((r) => r.length));
  return spriteFromFn(w, rows.length, (px) => {
    rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (pal[row[x]]) px(x, y, pal[row[x]]); });
  });
}
function flipped(src) {
  const c = makeCanvas(src.width, src.height), g = c.getContext('2d');
  g.translate(src.width, 0); g.scale(-1, 1); g.drawImage(src, 0, 0);
  return c;
}
// Round blob shapes (trees, bushes) with an outline and top-left light.
function makeBlob(w, h, blobs, colors, trunk) {
  const inside = (x, y) => blobs.some(([cx, cy, r]) => (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r);
  return spriteFromFn(w, h, (px) => {
    if (trunk) {
      for (let y = trunk.y0; y < h; y++) for (let x = trunk.x0; x < trunk.x1; x++) {
        px(x, y, x === trunk.x0 || x === trunk.x1 - 1 ? '#4a2f1d' : '#6e4a2e');
      }
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!inside(x, y)) continue;
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      const light = -(x - w / 2) * 0.5 - (y - h * 0.35) * 0.6;
      let col = colors.mid;
      if (light > 3) col = (x + y) % 2 ? colors.hi : colors.mid;
      if (light > 5) col = colors.hi;
      else if (light < -4) col = colors.lo;
      px(x, y, edge ? colors.edge : col);
    }
  });
}
function makePothole() {
  return spriteFromFn(16, 11, (px) => {
    for (let y = 0; y < 11; y++) for (let x = 0; x < 16; x++) {
      const d = ((x + 0.5 - 8) / 8) ** 2 + ((y + 0.5 - 5.5) / 5.5) ** 2;
      if (d > 1) continue;
      if (d > 0.6) px(x, y, y > 5 ? '#7a7d84' : '#55585f');
      else px(x, y, y < 5 ? '#141519' : '#25272d');
    }
  });
}
// Bullseye on a post (bonus course).
function makeTarget() {
  return spriteFromFn(13, 20, (px) => {
    for (let y = 12; y < 20; y++) { px(5, y, '#4a2f1d'); px(6, y, '#6e4a2e'); px(7, y, '#4a2f1d'); }
    for (let y = 0; y < 13; y++) for (let x = 0; x < 13; x++) {
      const d = Math.hypot(x + 0.5 - 6.5, y + 0.5 - 6.5);
      if (d > 6.5) continue;
      px(x, y, d > 5.6 ? PAL.k : d > 4.2 ? PAL.r : d > 2.8 ? '#ffffff' : d > 1.4 ? PAL.r : '#ffffff');
    }
  });
}
function makeShadow(w, h) {
  return spriteFromFn(w, h, (px) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (((x + 0.5 - w / 2) / (w / 2)) ** 2 + ((y + 0.5 - h / 2) / (h / 2)) ** 2 <= 1) px(x, y, 'rgba(0,0,0,0.28)');
    }
  });
}

const SPR = {};
for (const k in SPRITE_ART) SPR[k] = spriteFromArt(SPRITE_ART[k]);
SPR.dogA_L = flipped(SPR.dogA);
SPR.dogB_L = flipped(SPR.dogB);
const LEAVES = { hi: '#6cbf4f', mid: '#4a9a3e', lo: '#2f6b2e', edge: '#1f4a22' };
// Big leafy oaks / maples, one sprite per canopy color (THEMES[].trees picks).
const LEAF_PALETTES = {
  green: LEAVES,
  orange: { hi: '#f2a24a', mid: '#e07a2e', lo: '#a8501f', edge: '#5e2c12' },
  red: { hi: '#e8664a', mid: '#c9452f', lo: '#8a2a1f', edge: '#4a1510' },
  gold: { hi: '#f5d76a', mid: '#e8b33a', lo: '#b07d22', edge: '#5e4212' },
};
const OAK_BLOBS = [[14, 11, 10], [7, 15, 7], [21, 15, 7], [10, 21, 7], [18, 21, 7]];
for (const k in LEAF_PALETTES) SPR['tree_' + k] = makeBlob(28, 38, OAK_BLOBS, LEAF_PALETTES[k], { x0: 12, x1: 16, y0: 25 });
SPR.fanA_L = flipped(SPR.fanA);
SPR.fanB_L = flipped(SPR.fanB);
SPR.crowdR = spriteFromArt(SPRITE_ART.crowd, { ...PAL, r: COLORS.flagRed });
SPR.crowdG = spriteFromArt(SPRITE_ART.crowd, { ...PAL, r: COLORS.flagGold, h: '#2b2b35' });
SPR.bush = makeBlob(14, 9, [[4, 5, 4], [9, 4, 5], [11, 6, 3]], LEAVES);
SPR.pothole = makePothole();
SPR.target = makeTarget();
SPR.marker = (() => {   // the subscriber marker, drawn at double size so it reads from far away
  const src = spriteFromArt(SPRITE_ART.marker), c = makeCanvas(src.width * 2, src.height * 2), g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
})();
SPR.ring = spriteFromFn(9, 9, (px) => {
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    const d = Math.hypot(x + 0.5 - 4.5, y + 0.5 - 4.5);
    if (d <= 4.5) px(x, y, d > 3.7 ? PAL.k : d > 2.6 ? PAL.r : d > 1.5 ? '#ffffff' : PAL.r);
  }
});
SPR.shadowS = makeShadow(6, 2);
SPR.shadowM = makeShadow(14, 4);
SPR.shadowBike = makeShadow(10, 16);
SPR.shadowTree = makeShadow(24, 7);

// --- Buffer helpers (all positions in logical units) ---
function bx(x) { return x / CONFIG.pixelSize + PAD; }
function by(y) { return y / CONFIG.pixelSize + PAD; }

// World point -> logical screen point [x, y].
function proj(x, z, h) {
  return [x + (x - view.W / 2) * h * CONFIG.perspX, sy(z) - h * CONFIG.heightY];
}

const shadeCache = new Map();
// f < 1 darkens, f > 1 lightens toward white.
function shade(hex, f) {
  const key = hex + f;
  let c = shadeCache.get(key);
  if (!c) {
    const n = parseInt(hex.slice(1), 16);
    const ch = (v) => Math.round(clamp(f <= 1 ? v * f : v + (255 - v) * (f - 1), 0, 255));
    c = `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
    shadeCache.set(key, c);
  }
  return c;
}

function hash(a, b) {
  let h = Math.imul(a, 374761393) ^ Math.imul(b + 1, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function rectL(x, y, w, h, color) {
  const x0 = Math.round(bx(x)), y0 = Math.round(by(y));
  pix.fillStyle = color;
  pix.fillRect(x0, y0, Math.max(1, Math.round(bx(x + w)) - x0), Math.max(1, Math.round(by(y + h)) - y0));
}

// Scanline fill of a convex polygon given as logical [x, y] points.
function fillPoly(pts, color) {
  const n = pts.length, xs = [], ys = [];
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    const x = bx(p[0]), y = by(p[1]);
    xs.push(x); ys.push(y);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const y0 = Math.max(0, Math.round(minY)), y1 = Math.min(buf.height, Math.round(maxY));
  if (y0 >= y1) return;
  pix.fillStyle = color;
  for (let y = y0; y < y1; y++) {
    const yc = y + 0.5;
    let l = Infinity, r = -Infinity;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const ya = ys[j], yb = ys[i];
      if ((ya <= yc && yb > yc) || (yb <= yc && ya > yc)) {
        const x = xs[j] + (yc - ya) / (yb - ya) * (xs[i] - xs[j]);
        if (x < l) l = x;
        if (x > r) r = x;
      }
    }
    const a = Math.round(l), c = Math.round(r);
    if (c > a) pix.fillRect(a, y, c - a, 1);
  }
}
function poly3(pts, color) { fillPoly(pts.map((p) => proj(p[0], p[1], p[2])), color); }

// 1-pixel line between logical screen points.
function lineL(a, c, color) {
  let x0 = Math.round(bx(a[0])), y0 = Math.round(by(a[1]));
  const x1 = Math.round(bx(c[0])), y1 = Math.round(by(c[1]));
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const stepX = x0 < x1 ? 1 : -1, stepY = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  pix.fillStyle = color;
  for (let i = 0; i < 2000; i++) {
    pix.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += stepX; }
    if (e2 <= dx) { err += dx; y0 += stepY; }
  }
}
function line3(a, c, color) { lineL(proj(a[0], a[1], a[2]), proj(c[0], c[1], c[2]), color); }

// Axis-aligned 3D box: draws the faces the camera can see.
function box3(x0, x1, z0, z1, h0, h1, color, topColor) {
  if (x0 > x1) [x0, x1] = [x1, x0];
  const cx = view.W / 2;
  if (x1 < cx) poly3([[x1, z0, h0], [x1, z1, h0], [x1, z1, h1], [x1, z0, h1]], shade(color, 0.8));
  else if (x0 > cx) poly3([[x0, z0, h0], [x0, z1, h0], [x0, z1, h1], [x0, z0, h1]], shade(color, 0.8));
  poly3([[x0, z0, h0], [x1, z0, h0], [x1, z0, h1], [x0, z0, h1]], shade(color, 0.65));
  poly3([[x0, z0, h1], [x1, z0, h1], [x1, z1, h1], [x0, z1, h1]], topColor || shade(color, 1.12));
}

function ellipsePts(x, z, rx, rz, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([x + Math.cos(a) * rx, sy(z) + Math.sin(a) * rz]);
  }
  return pts;
}
// Dotted ground ellipse in the current fillStyle / globalAlpha.
function ringPixels(x, z, rx, rz) {
  for (const [px, py] of ellipsePts(x, z, rx, rz, 22)) pix.fillRect(Math.round(bx(px)), Math.round(by(py)), 1, 1);
}

// Sprite with its bottom-centre on logical point (x, y), optionally rotated.
function drawSprite(img, x, y, rot) {
  const px = Math.round(bx(x)), py = Math.round(by(y));
  if (!rot) { pix.drawImage(img, px - (img.width >> 1), py - img.height); return; }
  pix.save();
  pix.translate(px, py - img.height / 2);
  pix.rotate(rot);
  pix.drawImage(img, -(img.width >> 1), -(img.height >> 1));
  pix.restore();
}
function drawSpriteC(img, x, y, rot) { drawSprite(img, x, y + img.height * CONFIG.pixelSize / 2, rot); }


function render(now) {
  if (game.state === 'cutscene') { renderCutscene(now); return; }
  const t = now / 1000, ps = CONFIG.pixelSize;
  view.camZ = Math.round(game.dist / ps) * ps;   // snap the camera so static things don't shimmer

  // --- World into the pixel buffer ---
  drawGround();
  for (const o of game.obstacles) if (o.type === 'pothole') drawSpriteC(SPR.pothole, o.x, sy(o.z));
  for (const p of game.groundPapers) drawSpriteC(SPR.paper, p.x, sy(p.z), p.rot);

  // Painter's order: far things first so near things overlap them.
  const items = [];
  for (const h of game.houses) items.push([h.z, drawHouse, h]);
  for (const d of game.decor) items.push([d.z, drawDecor, d]);
  for (const o of game.obstacles) if (o.type !== 'pothole') items.push([o.z - o.h / 2, drawObstacle, o]);
  for (const r of game.ramps) items.push([r.z - r.h / 2, drawRamp, r]);
  for (const tg of game.targets) items.push([tg.z, drawTarget, tg]);
  for (const tr of game.tracks) items.push([tr.z - 12, drawCrossing, tr]);
  items.push([game.dist - CONFIG.bikeHalfL, drawBike, null]);
  items.sort((a, c) => c[0] - a[0]);
  for (const [, fn, o] of items) fn(o, t);

  drawLights(t);
  for (const p of game.flying) drawFlyingPaper(p);
  drawSmoke();
  drawSubMarkers(t);
  drawParticles();
  if (debug.hitAreas) drawHitAreas();

  // --- Scale the buffer up to the screen ---
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const s = view.scale * view.dpr;
  ctx.setTransform(s, 0, 0, s, view.offX * view.dpr, view.offY * view.dpr);
  ctx.imageSmoothingEnabled = false;
  let shx = 0, shy = 0;
  if (game.shake > 0) {
    shx = clamp(Math.round(rand(-1, 1) * game.shake / ps), -PAD, PAD);
    shy = clamp(Math.round(rand(-1, 1) * game.shake / ps), -PAD, PAD);
  }
  ctx.drawImage(buf, PAD + shx, PAD + shy, view.W / ps, view.H / ps, 0, 0, view.W, view.H);

  // --- Crisp overlays ---
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, view.W, view.H); ctx.clip();
  drawPops();
  drawFlash();
  if (game.state !== 'title' && game.state !== 'menu') drawHUD();
  drawHint(t);
  if (game.state === 'playing' || game.state === 'crashed') drawBanner();
  ctx.restore();
}

// Calls fn(y, k) for each line of a world-anchored repeating pattern.
function forEachWorldLine(period, fn) {
  const m = PAD * CONFIG.pixelSize + period;
  const zMin = view.camZ - (view.H - view.bikeY) - m;
  const zMax = view.camZ + view.bikeY + m;
  for (let k = Math.floor(zMin / period); k <= Math.ceil(zMax / period); k++) fn(sy(k * period), k);
}

function drawGround() {
  const G = theme().ground, th = theme();
  const ps = CONFIG.pixelSize, ext = PAD * ps;
  const top = -ext, tall = view.H + ext * 2;
  pix.fillStyle = G.grass;
  pix.fillRect(0, 0, buf.width, buf.height);

  // Mowed lawn stripes, grass tufts, fallen leaves
  forEachWorldLine(80, (y) => {
    rectL(-ext, y - 40, L.sidewalkX0 + ext, 40, G.grassStripe);
    rectL(sideX(1, L.sidewalkX0), y - 40, L.sidewalkX0 + ext, 40, G.grassStripe);
  });
  forEachWorldLine(12, (y, k) => {
    for (const side of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        const x = sideX(side, -ext + hash(k * side, i) * (L.sidewalkX0 + ext - ps * 2));
        rectL(x, y, ps, ps, G.grassLight);
        rectL(x + ps, y + ps, ps, ps, G.grassDark);
      }
      for (let i = 0; i < 4; i++) {
        if (hash(k * side + 99, i) >= th.leaves) continue;
        const x = sideX(side, -ext + hash(k * side, i + 20) * (L.sidewalkX0 + ext - ps * 2));
        const c = th.leafColors[(hash(k, i + 50) * th.leafColors.length) | 0];
        rectL(x, y + 4, ps, ps, c);
        if (hash(k, i + 70) < 0.5) rectL(x + ps, y + 4, ps, ps, c);
      }
    }
  });

  // Sidewalks
  const sw = L.sidewalkX1 - L.sidewalkX0;
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? L.sidewalkX0 : sideX(1, L.sidewalkX1);
    rectL(x0, top, sw, tall, G.sidewalk);
    forEachWorldLine(32, (y) => rectL(x0, y, sw, ps, G.sidewalkJoint));
  }

  // Driveways across the side yards, down to the curb
  for (const d of game.driveways) {
    const ya = sy(d.z1), yb = sy(d.z0);
    if (yb < -10 || ya > view.H + 10) continue;
    const xa = d.side < 0 ? 20 : view.W - L.streetX0;
    rectL(xa, ya, L.streetX0 - 20, yb - ya, '#c9c4b8');
    rectL(xa, ya, L.streetX0 - 20, ps, '#b1ab9d');
  }

  // Paved plazas (Plaza side yards)
  for (const p of game.pavedLots) {
    const ya = sy(p.z1), yb = sy(p.z0);
    if (yb < -10 || ya > view.H + 10) continue;
    const xa = p.side < 0 ? -ext : view.W - L.sidewalkX0, w = L.sidewalkX0 + ext;
    rectL(xa, ya, w, yb - ya, G.sidewalk);
    for (let zz = p.z0 + 12; zz < p.z1; zz += 12) rectL(xa, sy(zz), w, ps, G.sidewalkJoint);
  }

  // Street, speckles, curbs, centre dashes
  const stW = L.streetX1 - L.streetX0;
  rectL(L.streetX0, top, stW, tall, G.street);
  forEachWorldLine(8, (y, k) => {
    for (let i = 0; i < 2; i++) {
      rectL(L.streetX0 + 4 + hash(k, i + 7) * (stW - 8), y, ps, ps, i ? G.streetLight : G.streetDark);
    }
  });
  rectL(L.streetX0 - ps, top, ps, tall, G.curb);
  rectL(L.streetX0, top, ps, tall, G.streetDark);
  rectL(L.streetX1, top, ps, tall, G.curb);
  rectL(L.streetX1 - ps, top, ps, tall, G.streetDark);
  forEachWorldLine(64, (y) => rectL(view.W / 2 - ps, y - 32, ps * 2, 28, G.laneLine));
  if (th.crosswalks) {   // brick crosswalks across the boulevard
    forEachWorldLine(th.crosswalks, (y) => {
      rectL(L.streetX0, y - 24, stW, 24, COLORS.brickPave);
      for (let r = 0; r < 4; r++) {
        for (let x = L.streetX0 + (r % 2) * 6; x < L.streetX1; x += 12) rectL(x, y - 24 + r * 6, ps, 6, shade(COLORS.brickPave, 0.72));
        rectL(L.streetX0, y - 24 + r * 6, stW, ps * 0.5, shade(COLORS.brickPave, 0.72));
      }
      rectL(L.streetX0, y - 26, stW, ps, G.curb);
      rectL(L.streetX0, y, stW, ps, G.curb);
    });
  }

  // Streetcar tracks across the whole road
  for (const tr of game.tracks) {
    const y = sy(tr.z);
    if (y < -20 || y > view.H + 20) continue;
    for (let x = -ext; x < view.W + ext; x += 10) rectL(x, y - 9, 4, 18, COLORS.tie);
    rectL(-ext, y - 6, view.W + ext * 2, ps, COLORS.rail);
    rectL(-ext, y + 4, view.W + ext * 2, ps, COLORS.rail);
  }

  // Bonus course start / finish lines (checkered)
  for (const ln of game.lines) {
    const y = sy(ln.z);
    if (y < -20 || y > view.H + 20) continue;
    for (let i = 0; i < stW / 10; i++) {
      for (let j = 0; j < 2; j++) rectL(L.streetX0 + i * 10, y - j * 8, 10, 8, (i + j) % 2 ? '#ffffff' : PAL.k);
    }
  }
}

// Houses are described in left-side coordinates; X() mirrors them.
function drawHouse(h, t) {
  const st = HOUSE_STYLES[h.style];
  const z0 = h.z, z1 = h.z + h.len, WH = h.wallH;
  const rh = WH + (st.roof === 'flat' ? 0 : st.roofH);
  if (sy(z0) < -20 || sy(z1) - (rh + 40) * CONFIG.heightY > view.H + 20) return;
  const X = (x) => sideX(h.side, x);
  const q = (pts, col) => poly3(pts.map(([x, z, hh]) => [X(x), z, hh]), col);
  const g = {
    h, st, t, z0, z1, WH, rh, cz: z0 + h.len / 2, X, q,
    l3: (a, c, col) => line3([X(a[0]), a[1], a[2]], [X(c[0]), c[1], c[2]], col),
    quadX: (x, za, zb, ha, hb, col) => q([[x, za, ha], [x, zb, ha], [x, zb, hb], [x, za, hb]], col),   // street-facing plane
    quadZ: (z, xa, xb, ha, hb, col) => q([[xa, z, ha], [xb, z, ha], [xb, z, hb], [xa, z, hb]], col),   // camera-facing plane
    box: (xa, xb, za, zb, ha, hb, col, top) => box3(X(xa), X(xb), za, zb, ha, hb, col, top),
  };
  houseGround(g);
  houseWalls(g);
  houseOpenings(g);
  if (st.roof === 'flat') flatRoof(g); else gableRoof(g);
  if (h.spire) drawSpire(g);
  housePorch(g);
  if (h.flags) houseFlags(g);
  for (const p of h.props) drawProp(h, p);
  if (!h.scenery) drawMailbox(h, t);
}

function houseGround(g) {
  const { h, st, q, z0, z1, cz } = g;
  const G = theme().ground, hx0 = L.houseX0, wx = L.wallX;
  q([[hx0, z0 - 8, 0], [wx + 6, z0 - 8, 0], [wx + 6, z1 - 8, 0], [hx0, z1 - 8, 0]], COLORS.shadow);
  if (st.paved) {   // city lots: paved forecourt (the doorstep target is unchanged)
    q([[wx, z0, 0], [L.sidewalkX0, z0, 0], [L.sidewalkX0, z1, 0], [wx, z1, 0]], shade(G.sidewalk, 0.95));
    for (let zz = z0 + 16; zz < z1; zz += 16) g.l3([wx, zz, 0], [L.sidewalkX0, zz, 0], G.sidewalkJoint);
  } else {
    q([[L.porchX1, cz - 6, 0], [L.sidewalkX0, cz - 6, 0], [L.sidewalkX0, cz + 6, 0], [L.porchX1, cz + 6, 0]], COLORS.path);
  }
  if (h.spire) drawSpireShadow(g);
  if (h.retaining) {   // limestone retaining wall along the front yard
    for (const [a, b] of [[z0 + 2, h.mailZ - 10], [h.mailZ + 10, cz - 9], [cz + 9, z1 - 2]]) {
      if (b - a < 6) continue;
      g.box(107, 111, a, b, 0, 7, COLORS.limestone, shade(COLORS.limestone, 1.15));
      for (let zz = a + 9; zz < b - 2; zz += 9) g.l3([111, zz, 0], [111, zz, 7], shade(COLORS.limestone, 0.78));
    }
  }
}

function houseWalls(g) {
  const { h, st, quadX, quadZ, z0, z1, WH } = g;
  const hx0 = L.houseX0, wx = L.wallX;
  const both = (col, ha, hb) => { quadZ(z0, hx0, wx, ha, hb, shade(col, 0.82)); quadX(wx, z0, z1, ha, hb, col); };
  if (st.finish === 'shirtwaist') {
    const lh = Math.round(WH * 0.45);
    both(h.lower, 0, lh);
    courses(g, 0, lh, h.lower, 7, true);
    both(h.wall, lh, WH);
    courses(g, lh, WH, h.wall, 4, false);
    quadX(wx, z0, z1, lh - 1, lh + 1, h.trim);
    quadZ(z0, hx0, wx, lh - 1, lh + 1, shade(h.trim, 0.85));
  } else {
    both(h.wall, 0, WH);
    if (st.finish === 'brick') courses(g, 0, WH, h.wall, 6, true);
    else if (st.finish === 'tudor') timbers(g);
    else if (st.finish === 'stucco') stucco(g);
  }
  quadX(wx, z0, z1, 0, 3, shade(st.finish === 'shirtwaist' ? h.lower : h.wall, 0.6));
}

// Brick / stone / siding coursing. Joints only on the big camera-facing wall;
// the narrow street wall gets every other course so it doesn't turn to stripes.
function courses(g, ha, hb, col, step, joints) {
  const { l3, z0, z1, h } = g;
  const hx0 = L.houseX0, wx = L.wallX;
  const line = shade(col, 0.74), lineS = shade(col, 0.62);
  let row = 0;
  for (let v = ha + step; v < hb - 1; v += step, row++) {
    l3([hx0, z0, v], [wx, z0, v], lineS);
    if (row % 2 === 0) l3([wx, z0, v], [wx, z1, v], line);
    if (!joints) continue;
    for (let u = hx0 + 4 + hash(h.seed + row, 1) * 8; u < wx - 2; u += 9 + hash(row, u | 0) * 4) {
      l3([u, z0, v - step], [u, z0, v], lineS);
    }
  }
}

function timbers(g) {
  const { h, quadX, quadZ, l3, z0, z1, WH } = g;
  const hx0 = L.houseX0, wx = L.wallX, tc = h.trim, mid = Math.round(WH * 0.5);
  for (let zz = z0 + 4; zz < z1 - 4; zz += 18) quadX(wx, zz, zz + 3, 0, WH, tc);
  for (const v of [mid, WH - 3]) { quadX(wx, z0, z1, v, v + 2, tc); quadZ(z0, hx0, wx, v, v + 2, shade(tc, 0.9)); }
  for (let u = hx0; u < wx - 2; u += 14) {
    quadZ(z0, u, u + 3, 0, WH, shade(tc, 0.9));
    if (u + 14 < wx) { l3([u + 3, z0, mid + 2], [u + 14, z0, WH - 3], tc); l3([u + 3, z0, WH - 3], [u + 14, z0, mid + 2], tc); }
  }
}

function stucco(g) {
  const { h, z0, WH } = g;
  for (let i = 0; i < 14; i++) {
    const [x, y] = proj(g.X(lerp(L.houseX0 + 2, L.wallX - 2, hash(h.seed, i))), z0, lerp(2, WH - 2, hash(h.seed, i + 30)));
    rectL(x, y, CONFIG.pixelSize, CONFIG.pixelSize, shade(h.wall, 0.88));
  }
}

// Windows on the street wall match the hit zones in applyPaperHit.
function houseOpenings(g) {
  const { h, st, q, l3, quadX, quadZ, z0, WH, cz } = g;
  const wx = L.wallX, hx0 = L.houseX0;
  const shop = st.porch === 'stoop';
  const frame = st.finish === 'tudor' || st.finish === 'stucco' ? h.trim : COLORS.trim;
  const zones = hitZones(h).windows;
  const wh0 = shop ? 5 : 12, wh1 = shop ? Math.min(WH - 12, 22) : Math.min(WH - 8, 30);
  const pane = shop ? 24 : st.roof === 'flat' ? 10 : 14;
  zones.forEach(([lo, hi], wi) => {
    quadX(wx, lo, hi, wh0 - 2, wh1 + 2, frame);
    if (h.windows[wi]) {
      quadX(wx, lo + 2, hi - 2, wh0, wh1, COLORS.windowBroken);
      l3([wx, lo + 4, wh1 - 2], [wx, (lo + hi) / 2, wh0 + 4], COLORS.crack);
      l3([wx, hi - 4, wh0 + 2], [wx, (lo + hi) / 2 + 4, wh1 - 3], COLORS.crack);
    } else {
      quadX(wx, lo + 2, hi - 2, wh0, wh1, COLORS.window);
      quadX(wx, lo + 2, hi - 2, wh1 - 4, wh1, COLORS.windowShine);
      for (let m = lo + pane; m < hi - 8; m += pane) quadX(wx, m, m + 2, wh0, wh1, frame);
      if (st.arches) {   // arched top on each pane (Moorish arcade look)
        for (let m = lo + 2; m < hi - 6; m += pane) {
          const m1 = Math.min(hi - 2, m + pane - 2), mc = (m + m1) / 2, r = (m1 - m) / 2;
          const arc = (rr) => { const pts = []; for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI; pts.push([wx, mc + Math.cos(a) * rr, wh1 + Math.sin(a) * rr * 0.8]); } return pts; };
          q(arc(r + 1.5), frame);
          q(arc(r), COLORS.window);
        }
      }
    }
    // Upper floor (decoration only; papers fly at ground-floor height)
    if (WH >= 44 && !shop) {
      const u0 = wh1 + 8, u1 = Math.min(WH - 6, wh1 + 22);
      for (let m = lo + 2; m + 10 < hi; m += 16) {
        quadX(wx, m, m + 10, u0 - 1, u1 + 1, frame);
        quadX(wx, m + 1, m + 9, u0, u1, shade(COLORS.window, 0.85));
        if (st.balconies) {   // wrought-iron balcony
          g.box(wx, wx + 4, m - 1, m + 11, u0 - 3, u0 - 1, shade(h.wall, 0.88));
          l3([wx + 4, m - 1, u0 + 3], [wx + 4, m + 11, u0 + 3], '#2b2b35');
        }
      }
    }
  });

  // Door
  const doorCol = h.sub ? COLORS.doorSub : st.door === 'glass' ? COLORS.window : COLORS.doorPlain;
  if (st.door === 'arch') {
    const arch = (r, hh) => {
      const pts = [[wx, cz - r, 0], [wx, cz + r, 0]];
      for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI; pts.push([wx, cz + Math.cos(a) * r, hh + Math.sin(a) * r]); }
      return pts;
    };
    q(arch(9, 18), frame);
    q(arch(7, 18), doorCol);
  } else {
    quadX(wx, cz - 9, cz + 9, 0, 26, frame);
    quadX(wx, cz - 7, cz + 7, 0, 24, doorCol);
    if (st.door === 'glass') quadX(wx, cz - 1, cz + 1, 0, 24, frame);
  }
  q([[wx, cz + 3, 11], [wx, cz + 5, 11], [wx, cz + 5, 13], [wx, cz + 3, 13]], COLORS.perfect);

  // Camera-facing wall: mural, window grid, or a window or two
  if (h.mural) drawMural(g);
  else if (WH >= 50) {
    for (let v = 8; v + 10 < WH - 4; v += 15) {
      for (let u = hx0 + 5; u + 9 < wx - 3; u += 14) { quadZ(z0, u, u + 9, v, v + 10, frame); quadZ(z0, u + 1, u + 8, v + 1, v + 9, shade(COLORS.window, 0.75)); }
    }
  } else {
    quadZ(z0, 30, 52, 12, 28, frame);
    quadZ(z0, 32, 50, 14, 26, shade(COLORS.window, 0.8));
    if (WH >= 44) { quadZ(z0, 32, 50, 34, Math.min(WH - 4, 46), frame); quadZ(z0, 34, 48, 36, Math.min(WH - 6, 44), shade(COLORS.window, 0.8)); }
  }
}

// Jazz mural: color bands, a big disc and some music notes (no text, no logos).
function drawMural(g) {
  const { h, q, l3, quadZ, z0, WH } = g;
  const pal = h.mural, r = mulberry32(h.seed);
  const xa = L.houseX0 + 4, xb = L.wallX - 4, va = 4, vb = WH - 6;
  quadZ(z0, xa, xb, va, vb, pal[0]);
  for (let i = 0; i < 3; i++) {
    const u = lerp(xa, xb - 12, r()), w = 5 + r() * 7;
    q([[u, z0, va], [Math.min(xb, u + w), z0, va], [Math.min(xb, u + w + 10), z0, vb], [Math.min(xb, u + 10), z0, vb]], pal[1 + (i % 3)]);
  }
  const cu = lerp(xa + 10, xb - 10, r()), cv = lerp(va + 10, vb - 10, r()), rad = Math.min(9, (vb - va) / 3);
  const disc = [];
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; disc.push([cu + Math.cos(a) * rad, z0, cv + Math.sin(a) * rad]); }
  q(disc, pal[1]);
  q(disc.map(([x, z, v]) => [lerp(cu, x, 0.3), z, lerp(cv, v, 0.3)]), pal[0]);
  for (let i = 0; i < 3; i++) {
    const nu = lerp(xa + 3, xb - 8, r()), nv = lerp(va + 2, vb - 12, r());
    q([[nu, z0, nv], [nu + 4, z0, nv], [nu + 4, z0, nv + 3], [nu, z0, nv + 3]], '#ffffff');
    l3([nu + 4, z0, nv + 1], [nu + 4, z0, nv + 10], '#ffffff');
    l3([nu + 4, z0, nv + 10], [nu + 7, z0, nv + 7], '#ffffff');
  }
}

function gableRoof(g) {
  const { h, st, q, l3, box, z0, z1, WH, rh } = g;
  const hx0 = L.houseX0, wx = L.wallX, eh = WH - 2;
  const e0 = L.eaveX0, e1 = L.eaveX1, rx = L.ridgeX, ez0 = z0 - 4, ez1 = z1 + 4;
  q([[hx0, z0, WH], [wx, z0, WH], [rx, z0, rh]], shade(h.wall, 0.72));
  if (st.finish === 'tudor') {   // half-timbering in the gable
    for (const f of [0.3, 0.5, 0.7]) {
      const u = lerp(hx0, wx, f), top = WH + (1 - Math.abs(u - rx) / (rx - hx0)) * (rh - WH);
      l3([u, z0, WH], [u, z0, top - 1], h.trim);
    }
  }
  q([[e0, ez0, eh], [e0, ez1, eh], [rx, ez1, rh], [rx, ez0, rh]], shade(h.roof, 0.7));
  if (h.chimney) {
    const cz0 = z0 + h.len * 0.62;
    box(24, 32, cz0, cz0 + 10, WH + 6, rh + 6, st.finish === 'tudor' ? COLORS.stone : COLORS.brick);
  }
  q([[e1, ez0, eh], [e1, ez1, eh], [rx, ez1, rh], [rx, ez0, rh]], h.roof);
  const rows = st.roof === 'tile' ? [0.2, 0.4, 0.6, 0.8] : [0.33, 0.66];
  for (const f of rows) {
    const x = lerp(e1, rx, f), hh = lerp(eh, rh, f);
    l3([x, ez0, hh], [x, ez1, hh], shade(h.roof, st.roof === 'tile' ? 1.25 : 0.82));
  }
  l3([rx, ez0, rh], [rx, ez1, rh], shade(h.roof, 1.35));
  l3([e1, ez0, eh], [e1, ez1, eh], COLORS.outline);
  l3([e0, ez0, eh], [rx, ez0, rh], COLORS.outline);
  l3([rx, ez0, rh], [e1, ez0, eh], COLORS.outline);
}

function flatRoof(g) {
  const { h, st, q, quadX, box, z0, z1, WH } = g;
  const hx0 = L.houseX0, wx = L.wallX, cap = shade(h.wall, 1.12);
  q([[hx0, z0, WH], [wx, z0, WH], [wx, z1, WH], [hx0, z1, WH]], h.roof);
  if (h.tower) {   // rooftop water tank
    const tz = z0 + h.len * 0.55;
    for (const [a, b] of [[24, 26], [36, 38]]) box(a, b, tz, tz + 2, WH, WH + 12, PAL.k);
    box(22, 40, tz - 6, tz + 8, WH + 12, WH + 26, '#7a5a43');
    box(25, 37, tz - 3, tz + 5, WH + 26, WH + 30, '#5a4130');
  } else {
    box(26, 38, z0 + h.len * 0.6, z0 + h.len * 0.6 + 10, WH, WH + 6, '#9aa0a8');
  }
  box(wx - 2, wx + 1, z0, z1, WH, WH + 4, cap);
  box(hx0, wx + 1, z0 - 1, z0 + 2, WH, WH + 4, cap);
  if (st.porch === 'stoop') {   // sign band with pixel "lettering"
    quadX(wx, z0 + 8, z1 - 8, WH - 9, WH - 3, h.accent);
    for (let zz = z0 + 14, i = 0; zz < z1 - 14; zz += 5, i++) {
      if (hash(h.seed, i) < 0.7) quadX(wx, zz, zz + 3, WH - 7, WH - 5, '#ffffff');
    }
  }
}

function housePorch(g) {
  const { h, st, q, l3, box, z0, z1, cz } = g;
  const wx = L.wallX, ph = L.porchHalf, px1 = L.porchX1;
  switch (st.porch) {
    case 'deep': {   // bungalow: wide porch, tapered columns on stone piers
      box(wx, px1, cz - ph - 2, cz + ph + 2, 0, 5, COLORS.stone);
      box(px1, L.stepsX, cz - 9, cz + 9, 0, 2, shade(COLORS.stone, 0.9));   // front steps
      for (const s of [1, -1]) {
        const pz = cz + s * (ph - 2);
        box(px1 - 8, px1 - 1, pz - 3.5, pz + 3.5, 5, 15, COLORS.stone);
        box(px1 - 7, px1 - 2, pz - 2.5, pz + 2.5, 15, 29, h.trim);
      }
      const pr = ph + 5;
      q([[wx, cz - pr, 33], [wx, cz + pr, 33], [px1 + 2, cz + pr, 28], [px1 + 2, cz - pr, 28]], shade(h.roof, 1.1));
      l3([px1 + 2, cz - pr, 28], [px1 + 2, cz + pr, 28], COLORS.outline);
      break;
    }
    case 'stoop': {   // shop step + striped awning over the display windows
      box(wx, wx + 5, cz - 10, cz + 10, 0, 3, COLORS.stone);
      const za = z0 + 6, zb = z1 - 6;
      for (let zz = za, i = 0; zz < zb; zz += 10, i++) {
        const ze = Math.min(zb, zz + 10);
        q([[wx, zz, 26], [wx, ze, 26], [wx + 14, ze, 21], [wx + 14, zz, 21]], i % 2 ? '#f6f3ea' : h.accent);
      }
      l3([wx + 14, za, 21], [wx + 14, zb, 21], COLORS.outline);
      break;
    }
    case 'canopy':
      box(wx, wx + 5, cz - 12, cz + 12, 0, 3, COLORS.stone);
      box(wx, wx + 12, cz - 14, cz + 14, 26, 28, '#2b2b35');
      break;
    default: {
      box(wx, px1, cz - ph, cz + ph, 0, 4, COLORS.porch);
      box(px1, L.stepsX, cz - 8, cz + 8, 0, 2, shade(COLORS.porch, 0.85));   // front steps
      for (const s of [1, -1]) {
        const pz = cz + s * (ph - 3);
        box(px1 - 4, px1 - 1, pz - 1.5, pz + 1.5, 4, 22, st.finish === 'tudor' || st.finish === 'stucco' ? h.trim : COLORS.trim);
      }
      const pr = ph + 2;
      q([[wx, cz - pr, 26], [wx, cz + pr, 26], [px1 + 1, cz + pr, 21], [px1 + 1, cz - pr, 21]], shade(h.roof, 1.15));
      l3([px1 + 1, cz - pr, 21], [px1 + 1, cz + pr, 21], COLORS.outline);
    }
  }
}

// Game Day: pennants under the eaves and a waving flag by the porch.
function houseFlags(g) {
  const { q, box, z0, z1, WH, cz, t } = g;
  const wx = L.wallX;
  for (let zz = z0 + 6, i = 0; zz + 10 < z1 - 4; zz += 12, i++) {
    q([[wx, zz, WH - 3], [wx, zz + 10, WH - 3], [wx, zz + 5, WH - 11]], i % 2 ? COLORS.flagGold : COLORS.flagRed);
  }
  const pz = cz + L.porchHalf + 10;
  box(97, 99, pz - 1, pz + 1, 0, 46, '#c9ccd2');
  const wave = (i) => Math.sin(t * 6 + i) * 1.5;
  for (let i = 0; i < 4; i++) {
    const xa = 99 + i * 4, xb = xa + 4;
    q([[xa, pz, 34 + wave(i)], [xb, pz, 34 + wave(i + 1)], [xb, pz, 44 + wave(i + 1)], [xa, pz, 44 + wave(i)]],
      i % 2 ? COLORS.flagGold : COLORS.flagRed);
  }
}

// Trash cans, fences and lawn ornaments; knocked ones lie on the ground.
function drawProp(h, p) {
  const x = sideX(h.side, p.lx), y = sy(p.z), z = p.z;
  if (y < -40 || y > view.H + 40) return;
  switch (p.type) {
    case 'trash':
      if (!p.knocked) {
        drawSpriteC(SPR.shadowS, x + 2, y + 3);
        box3(x - 4, x + 4, z - 4, z + 4, 0, 13, COLORS.trash);
        box3(x - 5, x + 5, z - 5, z + 5, 13, 15, shade(COLORS.trash, 0.75));
      } else {
        for (let i = 0; i < 5; i++) rectL(x + (i - 2) * 5, y + ((i * 7) % 5) - 6, 2, 2, COLORS.garbage[i % 3]);
        box3(x - 7, x + 7, z - 4, z + 4, 0, 7, COLORS.trash);
        box3(x + 9, x + 15, z + 2, z + 8, 0, 2, shade(COLORS.trash, 0.75));
      }
      break;
    case 'fence': {
      const z0 = z - p.hz, z1 = z + p.hz;
      if (!p.knocked) {
        for (let zz = z0; zz <= z1; zz += 7) box3(x - 1, x + 1, zz - 1, zz + 1, 0, 13, COLORS.fence);
        for (const hh of [4, 9]) poly3([[x, z0, hh], [x, z1, hh], [x, z1, hh + 2], [x, z0, hh + 2]], shade(COLORS.fence, 0.85));
      } else {
        const out = sideX(h.side, p.lx - 14);
        poly3([[x, z0, 0], [x, z1, 0], [out, z1, 0], [out, z0, 0]], shade(COLORS.fence, 0.9));
        for (let zz = z0 + 3; zz < z1; zz += 7) poly3([[x, zz, 0], [x, zz + 1, 0], [out, zz + 1, 0], [out, zz, 0]], shade(COLORS.fence, 0.7));
      }
      break;
    }
    default: {   // flamingo / gnome
      const spr = SPR[p.type];
      drawSpriteC(SPR.shadowS, x, y + 1);
      if (!p.knocked) drawSprite(spr, x, y);
      else drawSprite(spr, x, y, h.side * Math.PI / 2);
    }
  }
}

function drawMailbox(h, t) {
  const mx = sideX(h.side, L.mailboxX), mz = h.mailZ;
  const waiting = canDeliver(h);
  if (waiting) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 6);
    pix.globalAlpha = 0.25 + pulse * 0.15;
    fillPoly(ellipsePts(mx, mz, 16, 11, 16), COLORS.perfect);
    pix.globalAlpha = 0.9;
    pix.fillStyle = COLORS.perfect;
    ringPixels(mx, mz, 18 + pulse * 4, 13 + pulse * 3);
    pix.globalAlpha = 1;
  }
  box3(mx - 1, mx + 1, mz - 1, mz + 1, 0, 11, COLORS.post);
  box3(sideX(h.side, L.mailboxX - 4), sideX(h.side, L.mailboxX + 4), mz - 6, mz + 6, 11, 18,
    h.sub ? COLORS.mailboxSub : COLORS.mailbox);
  if (h.delivered) box3(sideX(h.side, L.mailboxX + 4), sideX(h.side, L.mailboxX + 6), mz - 2, mz + 3, 14, 25, COLORS.flag);
}

// --- Plaza (Wednesday): corner towers, grand fountains, lamp posts, planters ---
// A Plaza building can have a corner tower: a brick bell tower with a clay
// tile pyramid cap, or a stucco tower with a small glazed-tile dome. Drawn
// from above so the tops show; the shadow is drawn with the ground.
const SPIRE = { x0: 50, x1: 70, off: 8, len: 20, bell: 58, dome: 34 };   // near the street front so the top stays on screen
function spireBox(g) {
  const za = g.z0 + SPIRE.off;
  return { x0: SPIRE.x0, x1: SPIRE.x1, za, zb: za + SPIRE.len, top: g.WH + SPIRE[g.h.spire] };
}
function drawSpireShadow(g) {
  const s = spireBox(g), len = s.top * 0.3;
  g.q([[s.x0, s.za - len, 0], [s.x1, s.za - len, 0], [s.x1, s.zb, 0], [s.x0, s.zb, 0]], COLORS.shadow);
}
function drawSpire(g) {
  const { h, q, l3, box, quadZ } = g, s = spireBox(g), cx = (s.x0 + s.x1) / 2, cz = (s.za + s.zb) / 2;
  const dark = '#2a1d18';
  if (h.spire === 'bell') {
    box(s.x0, s.x1, s.za, s.zb, 0, s.top, COLORS.brick);
    for (let v = 8; v < s.top - 18; v += 7) l3([s.x0, s.za, v], [s.x1, s.za, v], shade(COLORS.brick, 0.78));
    for (const [a, b] of [[s.x0 + 3, cx - 1], [cx + 1, s.x1 - 3]]) {   // arched belfry openings
      quadZ(s.za, a, b, s.top - 16, s.top - 6, dark);
      q([[a, s.za, s.top - 6], [b, s.za, s.top - 6], [(a + b) / 2, s.za, s.top - 3]], dark);
    }
    box(s.x0 - 1, s.x1 + 1, s.za - 1, s.zb + 1, s.top, s.top + 2, COLORS.limestone);   // cornice
    const apex = s.top + 18;
    q([[s.x0 - 1, s.za - 1, s.top + 2], [s.x1 + 1, s.za - 1, s.top + 2], [cx, cz, apex]], shade(h.roof, 0.85));
    q([[s.x1 + 1, s.za - 1, s.top + 2], [s.x1 + 1, s.zb + 1, s.top + 2], [cx, cz, apex]], h.roof);
    l3([cx, cz, apex], [cx, cz, apex + 5], COLORS.perfect);   // finial
  } else {
    box(s.x0, s.x1, s.za, s.zb, 0, s.top, h.wall);
    quadZ(s.za, cx - 3, cx + 3, s.top - 14, s.top - 4, dark);
    box(s.x0 + 2, s.x1 - 2, s.za + 2, s.zb - 2, s.top, s.top + 5, shade(h.wall, 1.1));   // drum
    const r = (s.x1 - s.x0) / 2 - 2, tiles = ['#1f6f73', '#2a8a8a', '#3fa3a0', '#7fd0c4'];
    for (let k = 0; k < 6; k++) {   // stacked rings, lighter toward the top = a dome
      const f = k / 6, rr = r * Math.sqrt(1 - f * f);
      fillPoly(ell3(sideX(h.side, cx), cz, rr, rr * 0.9, s.top + 5 + f * r * 1.1, 14), tiles[Math.min(3, k)]);
    }
    l3([cx, cz, s.top + 5 + r * 1.1], [cx, cz, s.top + 11 + r * 1.1], COLORS.perfect);
  }
}

// Multi-tier ornate fountain: wide basin, two raised bowls, a bronze figure
// on top, water spilling over each rim. s scales the whole thing.
function drawGrandFountain(x, z, t, s) {
  const stone = COLORS.limestone, H1 = 16 * s, H2 = 26 * s, H3 = 34 * s;
  fillPoly(ell3(x, z - 4, 26 * s, 17 * s, 0, 18), COLORS.shadow);
  fillPoly(ell3(x, z, 24 * s, 16 * s, 0, 18), shade(stone, 0.68));
  fillPoly(ell3(x, z, 24 * s, 16 * s, 6, 18), stone);
  fillPoly(ell3(x, z, 21 * s, 14 * s, 6, 18), COLORS.water);
  for (let i = 0; i < 8; i++) {
    const r = ((t * 9 + i * 4) % 20) * s, a = i * 0.8;
    pixelAt(x + Math.cos(a) * r, z + Math.sin(a) * r * 0.65, 6, COLORS.waterLight);
  }
  box3(x - 3 * s, x + 3 * s, z - 3 * s, z + 3 * s, 6, H1, stone);
  fillPoly(ell3(x, z, 12 * s, 8 * s, H1, 14), shade(stone, 0.85));
  fillPoly(ell3(x, z, 10 * s, 6.5 * s, H1 + 1, 14), COLORS.water);
  box3(x - 2 * s, x + 2 * s, z - 2 * s, z + 2 * s, H1, H2, stone);
  fillPoly(ell3(x, z, 6 * s, 4 * s, H2, 12), shade(stone, 0.85));
  fillPoly(ell3(x, z, 4.5 * s, 3 * s, H2 + 1, 12), COLORS.water);
  for (const [r, top, bottom] of [[11 * s, H1, 6], [6 * s, H2, H1]]) {   // water spilling over the rims
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2, ph = (t * 1.6 + i * 0.37) % 1;
      pixelAt(x + Math.cos(a) * r, z + Math.sin(a) * r * 0.66, lerp(top, bottom, ph), COLORS.waterLight);
    }
  }
  box3(x - 1.5 * s, x + 1.5 * s, z - s, z + s, H2, H3, COLORS.bronze);   // sculpture
  pixelAt(x, z, H3 + 2 * s, shade(COLORS.bronze, 1.25));
  for (let k = 0; k < 4; k++) pixelAt(x + (k - 1.5) * 2, z, H3 + 4 * s + ((t * 18 + k * 5) % 6), '#ffffff');
}

// Ornate iron lamp post with three globe lights.
function drawLamp(d) {
  const x = d.x, z = d.z, iron = '#2b2b35';
  drawSpriteC(SPR.shadowS, x + 2, sy(z) + 2);
  box3(x - 2, x + 2, z - 2, z + 2, 0, 4, iron);
  box3(x - 1, x + 1, z - 1, z + 1, 4, 36, iron);
  box3(x - 9, x + 9, z - 0.6, z + 0.6, 33, 34.5, iron);
  for (const [gx, gh] of [[-9, 37], [0, 41], [9, 37]]) {
    fillPoly(ell3(x + gx, z, 2.6, 2, gh, 8), '#fff4c2');
    pixelAt(x + gx, z, gh + 1, '#ffffff');
  }
}

// Terracotta planter full of flowers.
function drawPlanter(d) {
  const x = d.x, z = d.z, flowers = ['#ff5a5f', '#f15bb5', '#ffd23f', '#9b5de5', '#ffffff'];
  box3(x - 6, x + 6, z - 4, z + 4, 0, 6, '#b8613f', '#5a3a24');
  for (let i = 0; i < 8; i++) {
    pixelAt(x - 5 + i * 1.5, z - 2 + ((i * 3) % 5), 7, '#3f8a3a');
    if (i % 2 === 0) pixelAt(x - 5 + i * 1.5, z - 2 + ((i * 7) % 5), 9, flowers[(d.seed + i) % flowers.length]);
  }
}

function drawDecor(d, t) {
  const y = sy(d.z);
  if (y < -20 || y - 90 > view.H) return;
  switch (d.type) {
    case 'tree':
      drawSpriteC(SPR.shadowTree, d.x + 4, y - 2);
      drawSprite(SPR['tree_' + (d.pal || 'green')], d.x, y);
      break;
    case 'fountain': drawFountain(d.x, d.z, t, 1); break;
    case 'smoker': drawSmoker(d.x, d.z, t); break;
    case 'grill': drawGrill(d.x, d.z, t); break;
    case 'crowd': drawCrowd(d, t); break;
    case 'sidefence': drawSideFence(d); break;
    case 'grandFountain': drawGrandFountain(d.x, d.z, t, d.s); break;
    case 'lamp': drawLamp(d); break;
    case 'planter': drawPlanter(d); break;
    case 'patio': drawPatio(d); break;
    case 'jogside': {   // joggers running in place along the sidewalk
      drawSpriteC(SPR.shadowS, d.x, y + 1);
      drawSprite(Math.floor(t * 8 + d.phase) % 2 ? SPR.joggerB : SPR.joggerA, d.x, y - (Math.floor(t * 8 + d.phase) % 2) * CONFIG.pixelSize);
      break;
    }
    default: drawSprite(SPR.bush, d.x, y);
  }
}

// Ellipse in the ground plane at height h, projected.
function ell3(x, z, rx, rz, h, n = 16) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(proj(x + Math.cos(a) * rx, z + Math.sin(a) * rz, h));
  }
  return pts;
}
function pixelAt(x, z, h, color) {
  const [px, py] = proj(x, z, h);
  pix.fillStyle = color;
  pix.fillRect(Math.round(bx(px)), Math.round(by(py)), 1, 1);
}

// Stone basin, pedestal and animated jets.
function drawFountain(x, z, t, s) {
  fillPoly(ell3(x, z - 3, 17 * s, 11 * s, 0), COLORS.shadow);
  fillPoly(ell3(x, z, 16 * s, 10 * s, 0), shade(COLORS.limestone, 0.7));
  fillPoly(ell3(x, z, 16 * s, 10 * s, 5), COLORS.limestone);
  fillPoly(ell3(x, z, 13 * s, 8 * s, 5), COLORS.water);
  for (let i = 0; i < 6; i++) {
    const r = ((t * 8 + i * 3) % 12) * s, a = i * 1.7;
    pixelAt(x + Math.cos(a) * r, z + Math.sin(a) * r * 0.6, 5, COLORS.waterLight);
  }
  const top = 14 * s + 2;
  box3(x - 2 * s, x + 2 * s, z - 2 * s, z + 2 * s, 5, top, COLORS.limestone);
  fillPoly(ell3(x, z, 5 * s, 3.5 * s, top), COLORS.water);
  const N = 10;
  for (let i = 0; i < N; i++) {
    const ph = (t * 1.3 + i / N) % 1, a = (i / N) * Math.PI * 2, r = (3 + ph * 9) * s;
    pixelAt(x + Math.cos(a) * r, z + Math.sin(a) * r * 0.7, top + Math.sin(Math.PI * ph) * 9 * s, COLORS.waterLight);
  }
  for (let k = 0; k < 3; k++) pixelAt(x, z, top + 2 + k * 3 + ((t * 20) % 3), '#ffffff');
}

function smokePuffs(x, z, h, t) {
  for (let i = 0; i < 4; i++) {
    const ph = (t * 0.6 + i / 4) % 1;
    pix.globalAlpha = 1 - ph;
    pixelAt(x + ph * 6, z + ph * 4, h + ph * 16, COLORS.smoke);
    pixelAt(x + ph * 6 + 2, z + ph * 4, h + ph * 16, COLORS.smoke);
  }
  pix.globalAlpha = 1;
}

function drawSmoker(x, z, t) {
  drawSpriteC(SPR.shadowM, x, sy(z) + 2);
  for (const lx of [-6, 5]) box3(x + lx, x + lx + 1, z - 1, z + 1, 0, 6, PAL.k);
  box3(x - 12, x - 8, z - 3, z + 3, 5, 11, '#2b2b35', '#45454f');   // firebox
  box3(x - 8, x + 8, z - 4, z + 4, 6, 14, '#2b2b35', '#45454f');    // barrel
  box3(x + 5, x + 7, z - 1, z + 1, 14, 24, '#2b2b35');              // stack
  smokePuffs(x + 6, z, 25, t);
}

function drawGrill(x, z, t) {
  drawSpriteC(SPR.shadowM, x, sy(z) + 2);
  box3(x - 14, x - 7, z - 3, z + 3, 0, 6, COLORS.flagRed, '#ffffff');   // cooler
  for (const lx of [-3, 2]) box3(x + lx, x + lx + 1, z - 1, z + 1, 0, 6, PAL.k);
  box3(x - 4, x + 4, z - 4, z + 4, 6, 12, '#2b2b35', '#45454f');      // kettle
  for (const lx of [9, 20]) box3(x + lx, x + lx + 1, z - 4, z - 2, 0, 9, '#9aa0a8');
  box3(x + 8, x + 22, z - 5, z + 5, 9, 11, '#f4f1ea');                // folding table
  smokePuffs(x, z, 13, t);
}

function drawCrowd(d, t) {
  const ps = CONFIG.pixelSize, folks = [];
  for (let i = 0; i < d.n; i++) folks.push({ i, ox: (hash(d.seed, i) - 0.5) * 30, oz: (hash(d.seed, i + 9) - 0.5) * 26 });
  folks.sort((a, b) => b.oz - a.oz);
  for (const f of folks) {
    const y = sy(d.z + f.oz);
    const jump = Math.floor(t * 4 + f.i * 1.7) % 3 === 0 ? ps * 2 : 0;   // cheering
    drawSpriteC(SPR.shadowS, d.x + f.ox, y + 1);
    drawSprite(f.i % 2 ? SPR.crowdG : SPR.crowdR, d.x + f.ox, y - jump);
  }
}

// Crossing signals at both curbs; lights flash from the bell until the car is past.
function drawCrossing(tr, t) {
  if (!tr.car) return;   // bonus-course rails have no streetcar
  const y = sy(tr.z);
  if (y < -10 || y - 60 > view.H) return;
  const car = tr.car;
  const gone = car.active && (car.dir > 0 ? car.x > view.W + 90 : car.x < -90);
  const flashing = car.warned && !gone;
  const blink = Math.floor(t * 4) % 2 === 0;
  for (const side of [-1, 1]) {
    const x = sideX(side, 114), z = tr.z - 12;
    box3(x - 1, x + 1, z - 1, z + 1, 0, 34, '#e0e0e0');
    line3([x - 6, z, 28], [x + 6, z, 36], '#ffffff');
    line3([x - 6, z, 36], [x + 6, z, 28], '#ffffff');
    box3(x - 5, x - 2, z - 1, z + 1, 20, 23, flashing && blink ? COLORS.bad : '#5a2a2a');
    box3(x + 2, x + 5, z - 1, z + 1, 20, 23, flashing && !blink ? COLORS.bad : '#5a2a2a');
  }
}

function drawStreetcar(o) {
  if (o.x + o.w / 2 < -40 || o.x - o.w / 2 > view.W + 40) return;
  const x0 = o.x - o.w / 2, x1 = o.x + o.w / 2, z0 = o.z - o.h / 2, z1 = o.z + o.h / 2;
  poly3([[x0, z0 - 6, 0], [x1, z0 - 6, 0], [x1, z1 - 6, 0], [x0, z1 - 6, 0]], COLORS.shadow);
  box3(x0, x1, z0, z1, 3, 30, COLORS.streetcar, shade(COLORS.streetcar, 1.2));
  poly3([[x0, z0, 6], [x1, z0, 6], [x1, z0, 10], [x0, z0, 10]], COLORS.streetcarAccent);
  poly3([[x0 + 6, z0, 15], [x1 - 6, z0, 15], [x1 - 6, z0, 26], [x0 + 6, z0, 26]], COLORS.carGlass);
  for (let xx = x0 + 24; xx < x1 - 12; xx += 24) poly3([[xx, z0, 15], [xx + 3, z0, 15], [xx + 3, z0, 26], [xx, z0, 26]], COLORS.streetcar);
  const head = o.dir > 0 ? x1 - 8 : x0 + 4;
  poly3([[head, z0, 11], [head + 4, z0, 11], [head + 4, z0, 14], [head, z0, 14]], COLORS.perfect);
  box3(o.x - 12, o.x + 12, o.z - 5, o.z + 5, 30, 33, '#9aa0a8');
  line3([o.x - 8, o.z, 33], [o.x, o.z, 44], PAL.k);
  line3([o.x, o.z, 44], [o.x + 8, o.z, 33], PAL.k);
}

// Drifting BBQ smoke cloud (drawn over the world, partly hides the road).
function drawSmoke() {
  for (const s of game.smokes) {
    const age = s.max - s.life;
    const grow = 0.6 + 0.6 * (age / s.max);
    pix.globalAlpha = clamp(Math.min(age / 0.6, s.life / 0.8), 0, 1) * 0.8;
    for (let k = 0; k < 6; k++) {
      const [px, py] = proj(s.x + (hash(s.seed, k) - 0.5) * 60 * grow, s.z + (hash(s.seed, k + 7) - 0.5) * 34 * grow, 18);
      const r = (16 + hash(s.seed, k + 3) * 14) * grow;
      const pts = [];
      for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; pts.push([px + Math.cos(a) * r, py + Math.sin(a) * r * 0.75]); }
      fillPoly(pts, k % 2 ? COLORS.smoke : COLORS.smokeDark);
    }
  }
  pix.globalAlpha = 1;
}

function drawObstacle(o, t) {
  const y = sy(o.z);
  if (y < -80 || y > view.H + 80) return;
  const ps = CONFIG.pixelSize;
  switch (o.type) {
    case 'fountain':   // bonus-course fountain in the road (jump it)
      if (theme().plazas) drawGrandFountain(o.x, o.z, t, 1.2); else drawFountain(o.x, o.z, t, 1.6);
      break;
    case 'traffic':
    case 'car': {
      if (o.cross) { drawCrossCar(o); break; }
      const x0 = o.x - o.w / 2, x1 = o.x + o.w / 2, z0 = o.z - o.h / 2, z1 = o.z + o.h / 2;
      poly3([[x0 - 2, z0 - 6, 0], [x1 + 2, z0 - 6, 0], [x1 + 2, z1 - 6, 0], [x0 - 2, z1 - 6, 0]], COLORS.shadow);
      for (const zw of [z1 - 14, z0 + 12]) {
        box3(x0 - 1, x0 + 5, zw - 6, zw + 6, 0, 8, COLORS.tire);
        box3(x1 - 5, x1 + 1, zw - 6, zw + 6, 0, 8, COLORS.tire);
      }
      box3(x0, x1, z0, z1, 4, 16, o.color);
      for (const lx of [x0 + 3, x1 - 9]) poly3([[lx, z0, 10], [lx + 6, z0, 10], [lx + 6, z0, 13], [lx, z0, 13]], COLORS.tail);
      box3(x0 + 4, x1 - 4, z0 + 18, z1 - 16, 16, 27, COLORS.carGlass, shade(o.color, 1.2));
      break;
    }
    case 'dog':
    case 'fan': {
      const base = y + o.h / 2;
      drawSpriteC(SPR.shadowM, o.x, base - 1);
      const run = o.active && Math.floor(o.anim / Math.PI) % 2 === 1;
      drawSprite(SPR[o.type + (run ? 'B' : 'A') + (o.dir > 0 ? '' : '_L')], o.x, base);
      if (!o.active) {   // telegraph before it bolts
        drawSprite(SPR.bang, o.x + Math.round(Math.sin(t * 15)) * ps, base - (o.type === 'fan' ? 30 : 18));
      }
      break;
    }
    case 'cone':
      drawSpriteC(SPR.shadowS, o.x, y + 3);
      drawSprite(SPR.cone, o.x, y + o.h / 2);
      break;
    case 'jogger': {
      const base = y + o.h / 2;
      drawSpriteC(SPR.shadowS, o.x, base - 1);
      drawSprite(Math.floor(o.anim) % 2 ? SPR.joggerB : SPR.joggerA, o.x, base);
      break;
    }
    case 'median': {
      const x0 = o.x - o.w / 2, x1 = o.x + o.w / 2;
      box3(x0, x1, o.z - o.h / 2, o.z + o.h / 2, 0, 3, COLORS.limestone, theme().ground.grass);
      if (theme().plazas) drawGrandFountain(o.x, o.z, t, 0.75); else drawFountain(o.x, o.z, t, 0.9);
      break;
    }
    case 'streetcar':
      drawStreetcar(o);
      break;
    case 'skater': {
      const base = y + o.h / 2;
      drawSpriteC(SPR.shadowM, o.x, base - 2);
      drawSprite(SPR.skater, o.x, base);
      break;
    }
    case 'barrier': {   // striped sawhorse (bonus course)
      const x0 = o.x - o.w / 2, x1 = o.x + o.w / 2, z = o.z;
      poly3([[x0, z - 6, 0], [x1, z - 6, 0], [x1, z, 0], [x0, z, 0]], COLORS.shadow);
      for (const lx of [x0 + 5, x1 - 5]) box3(lx - 2, lx + 2, z - 3, z + 3, 0, 10, COLORS.post);
      box3(x0, x1, z - 2, z + 2, 10, 18, COLORS.barrier);
      for (let sx = x0 + 4; sx < x1 - 8; sx += 16) {
        poly3([[sx, z - 2, 10], [sx + 8, z - 2, 10], [sx + 8, z - 2, 18], [sx, z - 2, 18]], COLORS.barrierStripe);
      }
      break;
    }
  }
}

// Wedge ramp with hazard stripes (bonus course).
function drawRamp(r) {
  const x0 = r.x - r.w / 2, x1 = r.x + r.w / 2, z0 = r.z - r.h / 2, z1 = r.z + r.h / 2, H = 12;
  if (sy(z0) < -20 || sy(z1) > view.H + 40) return;
  const cx = view.W / 2;
  if (x1 < cx) poly3([[x1, z0, 0], [x1, z1, 0], [x1, z1, H]], shade(COLORS.ramp, 0.65));
  else if (x0 > cx) poly3([[x0, z0, 0], [x0, z1, 0], [x0, z1, H]], shade(COLORS.ramp, 0.65));
  const n = 5;
  for (let i = 0; i < n; i++) {
    const za = lerp(z0, z1, i / n), zb = lerp(z0, z1, (i + 1) / n);
    poly3([[x0, za, H * i / n], [x1, za, H * i / n], [x1, zb, H * (i + 1) / n], [x0, zb, H * (i + 1) / n]],
      i % 2 ? COLORS.rampStripe : COLORS.ramp);
  }
}

// Bonus targets: a city object plus a floating bullseye until it's hit.
function drawTarget(tg, t) {
  const x = sideX(tg.side, tg.lx), y = sy(tg.z), z = tg.z;
  if (y < -10 || y - 70 > view.H) return;
  switch (tg.kind) {
    case 'mailbox':
      box3(x - 1, x + 1, z - 1, z + 1, 0, 11, COLORS.post);
      box3(x - 4, x + 4, z - 5, z + 5, 11, 18, '#3a5a8c');
      if (tg.hit) box3(x + 4, x + 5, z - 2, z + 3, 14, 24, COLORS.bad);
      break;
    case 'sign': {   // sidewalk sign board facing the street
      const col = ['#d64545', '#2f9e6b', '#3a7bd5', '#e8a33d'][(hash(z | 0, 3) * 4) | 0];
      if (!tg.hit) {
        for (const pz of [z - 8, z + 8]) box3(x - 1, x + 1, pz - 1, pz + 1, 0, 24, '#4a4d55');
        poly3([[x, z - 10, 12], [x, z + 10, 12], [x, z + 10, 25], [x, z - 10, 25]], col);
        for (let i = 0; i < 4; i++) poly3([[x, z - 7 + i * 4, 18], [x, z - 5 + i * 4, 18], [x, z - 5 + i * 4, 20], [x, z - 7 + i * 4, 20]], '#ffffff');
      } else {   // knocked flat
        const out = sideX(tg.side, tg.lx - 13);
        poly3([[x, z - 10, 0], [out, z - 10, 0], [out, z + 10, 0], [x, z + 10, 0]], col);
      }
      break;
    }
    case 'newsstand':
      box3(x - 5, x + 5, z - 7, z + 7, 0, 16, '#2f6b4f', tg.hit ? '#9fd3a8' : '#3f8a63');
      poly3([[x - 4, z - 7, 6], [x + 4, z - 7, 6], [x + 4, z - 7, 13], [x - 4, z - 7, 13]], '#cfe9f7');
      for (let i = 0; i < 3; i++) rectL(...proj(x - 3 + i * 3, z - 7, 9), 2, 2, PAL.e);
      break;
    case 'smoker': drawSmoker(x, z, t); break;
    case 'fountain': drawFountain(x, z, t, 0.75); break;
    default:
      drawSpriteC(SPR.shadowS, x, y + 1);
      drawSprite(SPR.target, x, y, tg.hit ? tg.side * Math.PI / 2 : 0);
  }
  if (!tg.hit && tg.kind) {
    const [rx, ry] = proj(x, z, 34 + (Math.sin(t * 5 + z) > 0 ? CONFIG.pixelSize : 0));
    drawSprite(SPR.ring, rx, ry);
  }
}

// Big gold marker over every subscriber still waiting for a paper. It sits
// above the roof, so it's the first thing of the house to scroll on screen;
// while the house is still above the HUD it peeks out right under it.
function drawSubMarkers(t) {
  const minY = view.safeTop + 66;
  for (const h of game.houses) {
    if (!canDeliver(h) || h.passed) continue;
    const st = HOUSE_STYLES[h.style];
    const top = h.wallH + (st.roof === 'flat' ? 6 : st.roofH);
    const [mx, my] = proj(sideX(h.side, 66), h.z + h.len / 2, top + 16);
    if (my < -40 || my > view.H + 10) continue;
    const bob = Math.sin(t * 5 + h.z) > 0 ? CONFIG.pixelSize * 2 : 0;
    drawSprite(SPR.marker, mx, Math.max(my, minY + SPR.marker.height * CONFIG.pixelSize) - bob);
  }
}

// Westport string lights along the sidewalks, twinkling.
function drawLights(t) {
  const colors = ['#ffd76a', '#ff8c42', '#ff5a5f', '#9fd3f0'];
  for (const ln of game.lights) {
    const x = sideX(ln.side, 108);
    for (let za = ln.z0; za < ln.z1; za += 60) {
      if (sy(za) < -60 || sy(za + 60) > view.H + 20) continue;
      box3(x - 1, x + 1, za - 1, za + 1, 0, 30, '#4a4d55');
      for (let f = 0.1; f < 1; f += 0.15) {
        const z = za + f * 60, hh = 30 - Math.sin(Math.PI * f) * 7;
        const c = colors[((za / 60 + f * 7) | 0) % colors.length];
        pix.globalAlpha = hash((z | 0) + Math.floor(t * 3), 1) < 0.15 ? 0.4 : 1;
        pixelAt(x, z, hh, c);
      }
      pix.globalAlpha = 1;
    }
  }
}

function drawPatio(d) {
  const col = ['#d64545', '#2f9e6b', '#e8a33d', '#3a7bd5'][d.seed % 4];
  box3(d.x - 1, d.x + 1, d.z - 1, d.z + 1, 0, 12, '#4a4d55');
  box3(d.x - 6, d.x + 6, d.z - 6, d.z + 6, 9, 11, '#f4f1ea');
  for (const ox of [-9, 8]) box3(d.x + ox, d.x + ox + 2, d.z - 2, d.z + 2, 0, 7, '#6b5440');
  fillPoly(ell3(d.x, d.z, 12, 9, 22, 8), col);
  fillPoly(ell3(d.x, d.z, 6, 4, 23, 8), shade(col, 1.25));
}

// Picket fence along the lot line between two houses.
function drawSideFence(d) {
  const z = d.z, X = (lx) => sideX(d.side, lx);
  for (let lx = 18; lx <= 92; lx += 6) box3(X(lx) - 1, X(lx) + 1, z - 1, z + 1, 0, 12, COLORS.fence);
  for (const hh of [4, 9]) poly3([[X(18), z, hh], [X(92), z, hh], [X(92), z, hh + 2], [X(18), z, hh + 2]], shade(COLORS.fence, 0.85));
}

// Parked car turned across the road (bonus course jump).
function drawCrossCar(o) {
  const x0 = o.x - o.w / 2, x1 = o.x + o.w / 2, z0 = o.z - o.h / 2, z1 = o.z + o.h / 2;
  poly3([[x0 - 2, z0 - 6, 0], [x1 + 2, z0 - 6, 0], [x1 + 2, z1 - 6, 0], [x0 - 2, z1 - 6, 0]], COLORS.shadow);
  for (const xw of [x0 + 10, x1 - 16]) {
    box3(xw, xw + 8, z0 - 1, z0 + 4, 0, 8, COLORS.tire);
    box3(xw, xw + 8, z1 - 4, z1 + 1, 0, 8, COLORS.tire);
  }
  box3(x0, x1, z0, z1, 4, 16, o.color);
  box3(x0 + 18, x1 - 16, z0 + 3, z1 - 3, 16, 27, COLORS.carGlass, shade(o.color, 1.2));
  poly3([[x0 + 22, z0 + 3, 18], [x1 - 20, z0 + 3, 18], [x1 - 20, z0 + 3, 25], [x0 + 22, z0 + 3, 25]], shade(COLORS.carGlass, 1.4));
}

function drawBike(_, t) {
  if (bike.invuln > 0 && Math.floor(t * 12) % 2) return;   // blink after respawn
  drawSpriteC(SPR.shadowBike, bike.x + 4, view.bikeY + 4);
  const pedal = !bike.crashed && bike.airT <= 0 && Math.floor(game.dist / 22) % 2 === 1;
  const lean = Math.round(clamp(bike.vx * CONFIG.leanPerSpeed, -CONFIG.maxLean, CONFIG.maxLean) / 0.1) * 0.1;
  drawSprite(pedal ? SPR.riderB : SPR.riderA, bike.x, view.bikeY + CONFIG.bikeHalfL - bike.h * CONFIG.heightY,
    bike.crashed ? bike.spin : lean);
}

// Papers fly flat and straight sideways; the shadow shows where they are.
function drawFlyingPaper(p) {
  const x = sideX(p.side, p.lx);
  drawSpriteC(SPR.shadowS, x, sy(p.z));
  const [px, py] = proj(x, p.z, p.h);
  drawSpriteC(SPR.paper, px, py, p.rot);
}

function drawParticles() {
  for (const p of game.particles) {
    pix.globalAlpha = clamp(p.life / p.max, 0, 1);
    pix.fillStyle = p.color;
    const [x, y] = proj(p.x, p.z, p.h);
    const s = p.size > 3 ? 2 : 1;
    pix.fillRect(Math.round(bx(x)), Math.round(by(y)), s, s);
  }
  pix.globalAlpha = 1;
}

// Debug overlay (triple-tap the score, or H): every hitbox at paper height,
// plus the path of each paper. gold = mailbox, green = porch, blue = rest of
// a subscriber's property, red = windows, white = props / bonus targets.
function drawHitAreas() {
  const hgt = CONFIG.throwHeight, FRONT = L.sidewalkX0;
  const outline = (side, lx0, lx1, z0, z1, color) => {
    const c = [[lx0, z0], [lx1, z0], [lx1, z1], [lx0, z1]].map(([lx, z]) => proj(sideX(side, lx), z, hgt));
    for (let i = 0; i < 4; i++) lineL(c[i], c[(i + 1) % 4], color);
  };
  for (const h of game.houses) {
    if (h.scenery || sy(h.propZ0) < -40 || sy(h.propZ1) > view.H + 40) continue;
    const zn = hitZones(h);
    if (h.sub) outline(h.side, 4, FRONT, zn.property[0], zn.property[1], COLORS.debugProperty);
    outline(h.side, L.wallX, L.stepsX, zn.porch[0], zn.porch[1], COLORS.good);
    zn.windows.forEach(([lo, hi]) => outline(h.side, L.wallX - 3, L.wallX + 2, lo, hi, COLORS.bad));
    outline(h.side, zn.mailboxX[0], zn.mailboxX[1], zn.mailbox[0], zn.mailbox[1], COLORS.perfect);
    if (!h.sub) for (const pr of h.props) if (!pr.knocked) outline(h.side, pr.lx - pr.hw, pr.lx + pr.hw, pr.z - pr.hz - 3, pr.z + pr.hz + 3, '#ffffff');
  }
  for (const t of game.targets) if (!t.hit) outline(t.side, t.lx - 6, t.lx + 4, t.z - CONFIG.targetHalf, t.z + CONFIG.targetHalf, '#ffffff');

  // Paper paths: live papers in white, finished ones end in their outcome color.
  const OUTCOME = { mailbox: COLORS.perfect, porch: COLORS.good, property: COLORS.debugProperty, window: COLORS.bad, wall: COLORS.bad };
  const path = (side, pts, color) => {
    for (let i = 1; i < pts.length; i++) {
      lineL(proj(sideX(side, pts[i - 1][0]), pts[i - 1][1], hgt), proj(sideX(side, pts[i][0]), pts[i][1], hgt), color);
    }
  };
  for (const p of game.flying) path(p.side, p.trail, '#ffffff');
  for (const tr of game.trails) {
    const col = OUTCOME[tr.outcome] || '#9aa0a8';
    path(tr.side, tr.pts, col);
    const [ex, ez] = tr.pts[tr.pts.length - 1];
    const [cx, cy] = proj(sideX(tr.side, ex), ez, hgt);
    lineL([cx - 4, cy - 4], [cx + 4, cy + 4], col);
    lineL([cx - 4, cy + 4], [cx + 4, cy - 4], col);
  }
}

// --- Screen-space overlays (full resolution) ---
function drawPops() {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (const p of game.pops) {
    const k = p.life / p.max;
    const scale = k > 0.85 ? 1 + (k - 0.85) * 3 : 1;   // little pop on spawn
    ctx.globalAlpha = clamp(k * 1.6, 0, 1);
    ctx.font = `${Math.round(p.size * 0.62 * scale)}px ${FONT}`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = PAL.k;
    ctx.strokeText(p.text, p.x, p.y);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, p.x, p.y);
  }
  ctx.globalAlpha = 1;
}

function drawFlash() {
  if (game.flash <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.min(0.5, game.flash);
  ctx.strokeStyle = game.flashColor;
  ctx.lineWidth = 16;
  ctx.strokeRect(0, 0, view.W, view.H);
  ctx.restore();
}

function textShadowed(text, x, y, color) {
  ctx.fillStyle = PAL.k;
  ctx.fillText(text, x + 2, y + 2);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function drawHUD() {
  const top = view.safeTop;
  const fade = ctx.createLinearGradient(0, 0, 0, top + 84);   // subtle dark fade so the score reads over the street
  fade.addColorStop(0, 'rgba(10,12,22,0.62)');
  fade.addColorStop(0.6, 'rgba(10,12,22,0.3)');
  fade.addColorStop(1, 'rgba(10,12,22,0)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, view.W, top + 84);

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.font = `20px ${FONT}`;
  textShadowed(String(game.score), 12, top + 32, '#fff');
  ctx.font = `8px ${FONT}`;
  const s = game.stats;
  textShadowed(`W${game.week} ${DAY_NAMES[game.day].slice(0, 3)} ${theme().name}  ${s.deliveries}/${s.subs}`, 12, top + 50, '#b8c0cc');

  if (game.phase !== 'route') {
    ctx.textAlign = 'center';
    ctx.font = `10px ${FONT}`;
    textShadowed('BONUS', view.W / 2, top + 30, COLORS.good);
  }

  if (debug.hitAreas) {   // label + color key
    ctx.textAlign = 'center';
    ctx.font = `8px ${FONT}`;
    textShadowed('DEBUG: TRIPLE-TAP SCORE', view.W / 2, top + 76, COLORS.good);
    ctx.textAlign = 'left';
    const key = [['MAILBOX', COLORS.perfect], ['PORCH', COLORS.good], ['PROPERTY', COLORS.debugProperty], ['WINDOW', COLORS.bad]];
    let kx = 8;
    for (const [label, col] of key) { textShadowed(label, kx, view.H - 10, col); kx += ctx.measureText(label).width + 12; }
  }

  // Lives (hidden when one crash ends the run)
  if (CONFIG.lives <= 1) return;
  const hw = SPR.heart.width * 2, hh = SPR.heart.height * 2;
  for (let i = 0; i < CONFIG.lives; i++) {
    ctx.globalAlpha = i < game.lives ? 1 : 0.25;
    ctx.drawImage(SPR.heart, view.W - 12 - hw - i * (hw + 4), top + 40, hw, hh);
  }
  ctx.globalAlpha = 1;
}

// Big centred card: day intro, PERFECT DELIVERY!, BONUS COURSE!
function drawBanner() {
  const b = game.banners[0];
  if (!b) return;
  const age = b.max - b.t;
  const a = clamp(Math.min(age / 0.2, b.t / 0.35), 0, 1);
  const pop = age < 0.25 ? 1 + (0.25 - age) * 1.6 : 1;
  const y = view.H * 0.24;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(20 * pop)}px ${FONT}`;
  const w = Math.min(view.W - 16, Math.max(ctx.measureText(b.title).width, 200) + 36);
  const extra = b.place ? 18 : 0;
  ctx.fillStyle = PAL.k;
  ctx.fillRect(view.W / 2 - w / 2 - 4, y - 34, w + 8, 72 + extra);
  ctx.fillStyle = '#2a3346';
  ctx.fillRect(view.W / 2 - w / 2, y - 30, w, 64 + extra);
  textShadowed(b.title, view.W / 2, y - 8, b.color);
  if (b.place) {   // neighborhood under the day name
    ctx.font = `11px ${FONT}`;
    textShadowed(b.place, view.W / 2, y + 16, COLORS.perfect);
  }
  ctx.font = `9px ${FONT}`;
  textShadowed(b.sub, view.W / 2, y + 18 + extra, '#ffffff');
  ctx.restore();
}

function drawHint(t) {
  if (game.state !== 'playing' || !isFirstDay() || game.time > CONFIG.graceTime) return;
  const a = clamp(Math.min((CONFIG.graceTime - game.time) / 0.8, game.time / 0.3), 0, 1);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `10px ${FONT}`;
  const lines = [tiltActive() ? 'TILT TO STEER' : 'DRAG TO STEER', 'TAP LEFT/RIGHT TO THROW'];
  const w = Math.max(...lines.map((s) => ctx.measureText(s).width)) + 28;
  const y = view.H * 0.44;
  ctx.fillStyle = PAL.k;
  ctx.fillRect(view.W / 2 - w / 2 - 3, y - 25, w + 6, 50);
  ctx.fillStyle = '#2a3346';
  ctx.fillRect(view.W / 2 - w / 2, y - 22, w, 44);
  ctx.fillStyle = '#fff';
  ctx.fillText(lines[0], view.W / 2, y - 8);
  ctx.fillStyle = COLORS.perfect;
  ctx.fillText(lines[1], view.W / 2, y + 10);

  // Tap-zone labels near the bottom
  ctx.globalAlpha = a * (0.6 + 0.3 * Math.sin(t * 5));
  ctx.font = `10px ${FONT}`;
  const ty = view.H - 26;
  textShadowed('<< TAP', 56, ty, '#fff');
  textShadowed('TAP >>', view.W - 56, ty, '#fff');
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(view.W / 2 - 1, view.bikeY + 40, 2, view.H - view.bikeY - 50);
  ctx.restore();
}


// ---------------------------------------------------------------------
// 9. UI (HTML overlay: title + game over + share)
// ---------------------------------------------------------------------
const ui = {
  overlay: document.getElementById('overlay'),
  title: document.getElementById('screen-title'),
  over: document.getElementById('screen-over'),
  day: document.getElementById('screen-day'),
  pause: document.getElementById('screen-pause'),
  pauseBtn: document.getElementById('pause-btn'),
  resumeBtn: document.getElementById('resume-btn'),
  overTitle: document.getElementById('over-title'),
  retryBtn: document.getElementById('retry-btn'),
  newRunBtn: document.getElementById('newrun-btn'),
  tiltBtn: document.getElementById('tilt-btn'),
  steerMode: document.getElementById('steer-mode'),
  titleBest: document.getElementById('title-best'),
  dayTitle: document.getElementById('day-title'),
  dayPlace: document.getElementById('day-place'),
  dayPerfect: document.getElementById('day-perfect'),
  sumDeliveries: document.getElementById('sum-deliveries'),
  sumMailbox: document.getElementById('sum-mailbox'),
  sumWindows: document.getElementById('sum-windows'),
  sumBonus: document.getElementById('sum-bonus'),
  sumScore: document.getElementById('sum-score'),
  sumSubs: document.getElementById('sum-subs'),
  sumNext: document.getElementById('sum-next'),
  reason: document.getElementById('over-reason'),
  score: document.getElementById('over-score'),
  best: document.getElementById('over-best'),
  reached: document.getElementById('over-reached'),
  newBest: document.getElementById('new-best'),
  share: document.getElementById('share-btn'),
  toast: document.getElementById('toast'),
};
let lastPointerType = 'mouse';
window.addEventListener('pointerdown', (e) => { lastPointerType = e.pointerType; }, true);

function hideOverlay() { ui.overlay.classList.add('hidden'); }

function showPanel(panel) {
  for (const p of document.querySelectorAll('#overlay .panel')) p.classList.toggle('hidden', p !== panel);
  ui.overlay.classList.remove('hidden');
}

function showTitle() {
  game.state = 'title';
  ui.titleBest.textContent = best;
  updateSteerUI();
  showPanel(ui.title);
}

function showGameOver() {
  game.state = 'over';
  game.overShownAt = performance.now();
  const isNewBest = game.score > best;
  if (isNewBest) { best = game.score; storage.set(BEST_KEY, best); }

  ui.overTitle.textContent = game.overTitle || 'Route over';
  ui.reason.textContent = game.overReason;
  ui.score.textContent = game.score;
  ui.best.textContent = best;
  ui.reached.textContent = `${DAY_NAMES[game.day].slice(0, 3)} W${game.week}`;   // furthest day / week
  ui.newBest.classList.toggle('hidden', !isNewBest || best === 0);
  ui.toast.textContent = '';
  showPanel(ui.over);
}

// End of day: a perfect day earns one more subscriber house for tomorrow.
// Tapping continues to the next day; after Sunday comes the next week.
function showDaySummary() {
  game.state = 'summary';
  game.overShownAt = performance.now();
  pointers.clear();
  const s = game.stats;

  for (const t of game.street) t.newSub = false;
  if (s.perfect) {
    const free = game.street.filter((t) => !t.sub);
    if (free.length) { const t = pick(free); t.sub = true; t.newSub = true; s.added = 1; }
  }
  const subsNext = game.street.filter((t) => t.sub).length;
  const nextDay = (game.day + 1) % DAY_NAMES.length;

  const name = DAY_NAMES[game.day];
  ui.dayTitle.textContent = `${name[0]}${name.slice(1).toLowerCase()} done`;
  ui.dayPlace.textContent = theme().name;
  ui.dayPerfect.classList.toggle('hidden', !s.perfect);
  ui.sumDeliveries.textContent = `${s.deliveries}/${s.subs}`;
  ui.sumMailbox.textContent = s.mailbox;
  ui.sumWindows.textContent = s.windows;
  ui.sumBonus.textContent = s.bonusClean ? `${s.bonusPoints} CLEAR` : s.bonusPoints;
  ui.sumScore.textContent = game.score - s.startScore;
  const parts = [];
  if (s.added) parts.push('Perfect day: +1 new subscriber');
  parts.push(`${subsNext} subscriber${subsNext === 1 ? '' : 's'} tomorrow`);
  ui.sumSubs.textContent = parts.join(' · ');
  const next = `${DAY_NAMES[nextDay][0]}${DAY_NAMES[nextDay].slice(1).toLowerCase()}`;
  ui.sumNext.textContent = nextDay === 0 ? `Tap for ${next} · Week ${game.week + 1}` : `Tap for ${next}`;
  showPanel(ui.day);
}

// Wipeout screen: replay the day you crashed on with the score you started
// it with (same week, same neighborhood, same subscribers).
function retryDay() {
  game.score = game.stats.startScore;
  game.totalDelivered = game.dayStartDelivered;
  game.lives = CONFIG.lives;
  setupDay();
  if (tilt.enabled) calibrateTilt();
  game.state = 'playing';
  hideOverlay();
  if (audio.settings.music !== 'off') startMusic();
  sfx.dayStart();
}
function overUnlocked() { return performance.now() - game.overShownAt > CONFIG.restartLock * 1000; }

function continueFromSummary() {
  const finished = game.day === DAY_NAMES.length - 1 ? game.week : 0;
  game.day++;
  if (game.day >= DAY_NAMES.length) { game.day = 0; game.week++; }   // keeps going forever
  setupDay();
  const go = () => {
    if (tilt.enabled) calibrateTilt();
    game.state = 'playing';
    hideOverlay();
    sfx.dayStart();
  };
  const scene = finished ? weekDone(finished) : null;   // medal + once-only cutscene at the end of a week
  if (scene) playCutscene(scene, go); else go();
}

function tryStartFromOverlay() {
  const unlocked = performance.now() - game.overShownAt > CONFIG.restartLock * 1000;
  if (game.state === 'paused') { resumeGame(); return; }
  if (game.state === 'title') { maybeFullscreen(); requestRun(); return; }
  if (game.state === 'summary' && unlocked) { continueFromSummary(); return; }
}

// Title screen: steering status + the iPhone "enable tilt" button.
function updateSteerUI() {
  if (!ui.tiltBtn) return;
  const secure = window.isSecureContext;
  ui.tiltBtn.classList.toggle('hidden', !(isTouchDevice && tilt.needsPermission && secure && !tilt.listening && !tilt.denied));
  ui.steerMode.textContent =
    tiltActive() ? 'Tilt steering on'
    : !isTouchDevice ? ''
    : tilt.needsPermission && !secure ? 'Tilt needs https: drag to steer'
    : tilt.denied ? 'Tilt not allowed: drag to steer'
    : tilt.listening ? 'Tilt or drag to steer' : 'Drag to steer';
}

ui.tiltBtn.addEventListener('click', async (e) => {
  e.stopPropagation();
  sfx.click();
  if (audio.settings.music !== 'off') startMusic();   // start audio while we still have the tap
  await requestTilt();   // shows the iPhone motion prompt
  if (game.state === 'title') requestRun();
});

ui.retryBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (game.state !== 'over' || !overUnlocked()) return;
  sfx.click();
  retryDay();
});
ui.newRunBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (game.state !== 'over' || !overUnlocked()) return;
  sfx.click();
  startGame();
});

// Tilt sensitivity slider (start screen + pause menu), saved.
function updateTiltUI() {
  document.querySelectorAll('.set-tilt').forEach((r) => { r.value = tilt.sens; });
  document.querySelectorAll('.tilt-val').forEach((b) => { b.textContent = tilt.sens; });
}
document.querySelectorAll('.set-tilt').forEach((r) => {
  r.addEventListener('click', (e) => e.stopPropagation());
  r.addEventListener('input', () => {
    tilt.sens = clamp(parseInt(r.value, 10) || CONFIG.tiltSensDefault, 1, 10);
    storage.set(TILT_KEY, tilt.sens);
    updateTiltUI();
  });
});
updateTiltUI();

ui.overlay.addEventListener('click', (e) => {
  if (e.target.closest('#share-btn') || e.target.closest('#tilt-btn') || e.target.closest('.audio-row') || e.target.closest('.tilt-row') || e.target.closest('#resume-btn') || e.target.closest('.over-btns') || e.target.closest('.title-btns') || e.target.closest('.menu-panel')) return;
  if (game.state === 'paused') return;   // only the Resume button unpauses
  tryStartFromOverlay();
});

ui.share.addEventListener('click', async (e) => {
  e.stopPropagation();
  sfx.click();
  const n = game.totalDelivered, day = DAY_NAMES[game.day];
  const text = `I delivered ${n} paper${n === 1 ? '' : 's'} and reached ${day[0]}${day.slice(1).toLowerCase()} of week ${game.week} in Route Rush. Beat that.`;
  const url = location.href.startsWith('http') ? location.href : '';
  if (navigator.share) {
    try { await navigator.share({ title: 'Route Rush', text, url: url || undefined }); return; }
    catch (err) { if (err && err.name === 'AbortError') return; }
  }
  const ok = await copyText(url ? `${text} ${url}` : text);
  ui.toast.textContent = ok ? 'Copied to clipboard!' : text;
});

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch (e) { /* fall through */ }
  try {   // Fallback for plain-http LAN testing, where the Clipboard API is blocked
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (e) { return false; }
}


function maybeFullscreen() {
  if (!CONFIG.fullscreenOnTouch || lastPointerType !== 'touch') return;
  const el = document.documentElement;
  if (document.fullscreenElement || !el.requestFullscreen) return;
  el.requestFullscreen({ navigationUI: 'hide' })
    .then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('portrait'))
    .catch(() => { /* not allowed (e.g. iOS Safari): ignore */ });
}


// ---------------------------------------------------------------------
// 9b. SOUND
// Every effect is synthesized with the Web Audio API (no sound files): one
// function per sound, sfx.throw(), sfx.mailbox() ... Music is either your
// song (CONFIG.musicFile) or a generated chiptune that changes key and tempo
// per neighborhood (THEMES[].music). One AudioContext, unlocked by the first
// tap. Routing: sounds -> sfx bus / music bus -> master volume -> speakers.
// ---------------------------------------------------------------------
const AUDIO_KEY = 'routeRush.audio';
const audio = {
  ctx: null, master: null, sfxBus: null, musicBus: null, noise: null, voices: {},
  settings: { volume: CONFIG.masterVolume, sfx: true, music: CONFIG.defaultMusic },   // saved
};
try { Object.assign(audio.settings, JSON.parse(storage.get(AUDIO_KEY, '{}'))); } catch (e) { /* bad save: defaults */ }
function saveAudio() { storage.set(AUDIO_KEY, JSON.stringify(audio.settings)); }

function unlockAudio() {
  if (!audio.ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* older Safari */ }
    const ctx = audio.ctx = new AC();
    audio.master = ctx.createGain();
    audio.master.connect(ctx.destination);
    audio.sfxBus = ctx.createGain();
    audio.sfxBus.connect(audio.master);
    audio.musicBus = ctx.createGain();
    audio.musicBus.connect(audio.master);
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    audio.noise = buf;
    applyAudioSettings();
  }
  if (audio.ctx.state !== 'running') audio.ctx.resume().catch(() => { /* needs a tap */ });
}
// iPhone only starts audio inside a tap, so try on every kind of first input.
for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) window.addEventListener(ev, unlockAudio, true);

function applyAudioSettings() {
  const s = audio.settings;
  if (audio.ctx) {
    const t = audio.ctx.currentTime;
    audio.master.gain.setTargetAtTime(s.volume, t, 0.02);
    audio.sfxBus.gain.setTargetAtTime(s.sfx ? CONFIG.sfxVolume : 0, t, 0.02);
    audio.musicBus.gain.setTargetAtTime(CONFIG.musicVolume, t, 0.02);
  }
  updateAudioUI();
}

// --- Synth helpers ---
const NOTE = (m) => 440 * Math.pow(2, (m - 69) / 12);   // MIDI note -> Hz
function sfxOn() { return !!audio.ctx && audio.settings.sfx; }   // a just-unlocked context may still be resuming: sounds queue up
function jit(f) { return f * (1 + (Math.random() * 2 - 1) * CONFIG.pitchJitter); }
// At most `max` copies of one sound at a time.
function claim(name, max, dur) {
  const n = audio.voices[name] || 0;
  if (n >= max) return false;
  audio.voices[name] = n + 1;
  setTimeout(() => { audio.voices[name]--; }, dur * 1000 + 40);
  return true;
}
// One enveloped oscillator note. o: { f, f2 (glide to), type, dur, vol, at (delay) | t0 (absolute), bus }
function tone(o) {
  const ctx = audio.ctx, t = o.t0 != null ? o.t0 : ctx.currentTime + (o.at || 0), d = o.dur;
  const osc = ctx.createOscillator(), g = ctx.createGain();
  osc.type = o.type || 'square';
  osc.frequency.setValueAtTime(o.f, t);
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + d);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.vol, t + (o.attack || 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  osc.connect(g);
  g.connect(o.bus || audio.sfxBus);
  osc.start(t);
  osc.stop(t + d + 0.02);
}
// Filtered noise burst. o: { f, f2, filter, q, dur, vol, at | t0, bus }
function noise(o) {
  const ctx = audio.ctx, t = o.t0 != null ? o.t0 : ctx.currentTime + (o.at || 0), d = o.dur;
  const src = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = audio.noise;
  src.loop = true;
  flt.type = o.filter || 'bandpass';
  flt.Q.value = o.q || 1;
  flt.frequency.setValueAtTime(o.f, t);
  if (o.f2) flt.frequency.exponentialRampToValueAtTime(o.f2, t + d);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.vol, t + (o.attack || 0.004));
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  src.connect(flt); flt.connect(g); g.connect(o.bus || audio.sfxBus);
  src.start(t, Math.random() * 0.5);
  src.stop(t + d + 0.02);
}
function notes(list, step, type, vol, at = 0) {   // quick melody: [midi, lengthInSteps?]
  let t = at;
  for (const n of list) {
    const [m, len] = Array.isArray(n) ? n : [n, 1];
    if (m) tone({ type, f: NOTE(m), dur: step * len * 0.95, vol, at: t });
    t += step * len;
  }
}

// --- Sound effects ---
const sfx = {
  throw() {
    if (!sfxOn() || !claim('throw', 3, 0.15)) return;
    noise({ filter: 'bandpass', f: jit(800), f2: jit(3800), q: 0.9, dur: 0.13, vol: 0.32 });
  },
  // Success blip that climbs a semitone per consecutive delivery.
  blip(step, vol = 0.16) {
    if (!sfxOn() || !claim('blip', 3, 0.16)) return;
    const f = NOTE(76 + Math.min(step, CONFIG.comboMaxSteps));
    tone({ type: 'square', f, dur: 0.07, vol });
    tone({ type: 'square', f: f * 1.5, dur: 0.09, vol: vol * 0.8, at: 0.06 });
  },
  property(step) {   // soft thud on the lawn
    if (!sfxOn() || !claim('thud', 3, 0.15)) return;
    tone({ type: 'sine', f: jit(150), f2: 55, dur: 0.14, vol: 0.45 });
    noise({ filter: 'lowpass', f: 500, dur: 0.06, vol: 0.2 });
    this.blip(step, 0.07);
  },
  porch(step) {      // solid thump + blip
    if (!sfxOn() || !claim('thump', 3, 0.15)) return;
    tone({ type: 'sine', f: jit(130), f2: 45, dur: 0.13, vol: 0.6 });
    tone({ type: 'triangle', f: jit(95), f2: 60, dur: 0.1, vol: 0.3 });
    noise({ filter: 'lowpass', f: 380, dur: 0.07, vol: 0.3 });
    this.blip(step);
  },
  mailbox(step) {    // metallic clang + bright rising ding: the best sound in the game
    if (!sfxOn() || !claim('mailbox', 2, 0.6)) return;
    const c = jit(1180);
    tone({ type: 'square', f: c, dur: 0.28, vol: 0.12 });
    tone({ type: 'square', f: c * 1.47, dur: 0.22, vol: 0.08 });
    tone({ type: 'triangle', f: c * 2.03, dur: 0.18, vol: 0.1 });
    noise({ filter: 'highpass', f: 4000, dur: 0.05, vol: 0.2 });
    const s = Math.min(step, CONFIG.comboMaxSteps);
    notes([84 + s, 88 + s, 91 + s, [96 + s, 3]], 0.055, 'square', 0.13, 0.07);
    tone({ type: 'sine', f: NOTE(96 + s), dur: 0.5, vol: 0.12, at: 0.24 });
  },
  glass() {
    if (!sfxOn() || !claim('glass', 2, 0.45)) return;
    noise({ filter: 'highpass', f: 2600, dur: 0.42, vol: 0.38 });
    for (let i = 0; i < 6; i++) tone({ type: i % 2 ? 'square' : 'sine', f: 2400 + Math.random() * 3600, dur: 0.05 + Math.random() * 0.08, vol: 0.07, at: i * 0.028 });
  },
  clatter() {        // trash cans, fences, lawn ornaments
    if (!sfxOn() || !claim('clatter', 2, 0.25)) return;
    for (const at of [0, 0.06, 0.13]) noise({ filter: 'bandpass', f: jit(1300), q: 2, dur: 0.07, vol: 0.28, at });
    tone({ type: 'square', f: jit(190), f2: 110, dur: 0.14, vol: 0.1 });
  },
  missed() {         // soft "bwomp", not punishing
    if (!sfxOn() || !claim('missed', 1, 0.3)) return;
    tone({ type: 'sine', f: 240, f2: 110, dur: 0.3, vol: 0.14 });
  },
  bark() {
    if (!sfxOn() || !claim('bark', 1, 0.3)) return;
    for (const at of [0, 0.15]) {
      tone({ type: 'square', f: jit(540), f2: 260, dur: 0.08, vol: 0.13, at });
      noise({ filter: 'bandpass', f: 900, q: 3, dur: 0.08, vol: 0.22, at });
    }
  },
  honk() {
    if (!sfxOn() || !claim('honk', 1, 0.35)) return;
    tone({ type: 'square', f: 392, dur: 0.3, vol: 0.1 });
    tone({ type: 'square', f: 494, dur: 0.3, vol: 0.08 });
  },
  streetcarBell() {  // "clang clang"
    if (!sfxOn() || !claim('bell', 1, 0.7)) return;
    for (const at of [0, 0.3]) {
      tone({ type: 'triangle', f: 1046, dur: 0.45, vol: 0.2, at });
      tone({ type: 'sine', f: 2620, dur: 0.3, vol: 0.09, at });
      tone({ type: 'square', f: 1568, dur: 0.06, vol: 0.06, at });
    }
  },
  crash(gameOver) {  // skid + crunch (+ descending jingle when the run is over)
    if (!sfxOn() || !claim('crash', 1, 1.6)) return;
    noise({ filter: 'bandpass', f: 2600, f2: 1600, q: 6, dur: 0.24, vol: 0.25 });
    noise({ filter: 'lowpass', f: 1100, f2: 140, dur: 0.45, vol: 0.7, at: 0.12 });
    tone({ type: 'square', f: 95, f2: 38, dur: 0.35, vol: 0.22, at: 0.12 });
    if (gameOver) notes([72, 67, 64, [60, 3]], 0.15, 'square', 0.12, 0.75);
  },
  dayStart() {       // bike bell "ding ding" + short upbeat jingle
    if (!sfxOn() || !claim('day', 1, 1.2)) return;
    for (const at of [0, 0.17]) { tone({ type: 'triangle', f: 2093, dur: 0.22, vol: 0.16, at }); tone({ type: 'sine', f: 3136, dur: 0.15, vol: 0.06, at }); }
    notes([60, 64, 67, [72, 2], 0, [76, 2]], 0.09, 'square', 0.1, 0.45);
  },
  faster() {         // rising whoosh
    if (!sfxOn() || !claim('faster', 1, 0.4)) return;
    noise({ filter: 'bandpass', f: 400, f2: 3500, q: 1.2, dur: 0.35, vol: 0.22 });
    tone({ type: 'square', f: 300, f2: 900, dur: 0.3, vol: 0.06 });
  },
  perfect() {        // fanfare
    if (!sfxOn() || !claim('fanfare', 1, 1.4)) return;
    notes([67, 72, 76, [79, 2], 76, [84, 4]], 0.11, 'square', 0.12);
    notes([[55, 2], [60, 2], [64, 2], [60, 4]], 0.11, 'triangle', 0.18);
  },
  clear() {          // bonus course finished clean
    if (!sfxOn() || !claim('fanfare', 1, 0.8)) return;
    notes([72, 76, 79, [84, 3]], 0.09, 'square', 0.12);
  },
  boing() {          // ramp launch
    if (!sfxOn() || !claim('boing', 1, 0.3)) return;
    tone({ type: 'sine', f: 180, f2: 720, dur: 0.28, vol: 0.32 });
    tone({ type: 'square', f: 90, f2: 360, dur: 0.24, vol: 0.06 });
    noise({ filter: 'bandpass', f: 600, f2: 2500, dur: 0.2, vol: 0.15 });
  },
  land() {
    if (!sfxOn() || !claim('land', 1, 0.2)) return;
    tone({ type: 'sine', f: 110, f2: 45, dur: 0.15, vol: 0.5 });
    noise({ filter: 'lowpass', f: 420, dur: 0.09, vol: 0.25 });
  },
  ping() {           // bonus target
    if (!sfxOn() || !claim('ping', 2, 0.3)) return;
    const f = jit(NOTE(88));
    tone({ type: 'sine', f, dur: 0.25, vol: 0.25 });
    tone({ type: 'sine', f: f * 1.5, dur: 0.2, vol: 0.12, at: 0.03 });
  },
  pedalTick(speed) { // one soft tick per pedal stroke
    if (!sfxOn() || !claim('tick', 2, 0.05)) return;
    noise({ filter: 'bandpass', f: 1500 + speed * 4, q: 5, dur: 0.03, vol: 0.12 * CONFIG.pedalVolume });
  },
  type() {           // typewriter tick in cutscenes
    if (!sfxOn() || !claim('type', 2, 0.05)) return;
    tone({ type: 'square', f: jit(880), dur: 0.018, vol: 0.025 });
  },
  click() {
    if (!sfxOn()) return;
    tone({ type: 'square', f: 1800, dur: 0.025, vol: 0.08 });
  },
};

// Pedal whir: one quiet looping tone that follows the bike's speed.
const pedal = { osc: null, flt: null, gain: null };
function updatePedalSound(on) {
  if (!audio.ctx) return;
  if (!pedal.osc) {
    pedal.osc = audio.ctx.createOscillator();
    pedal.flt = audio.ctx.createBiquadFilter();
    pedal.gain = audio.ctx.createGain();
    pedal.osc.type = 'triangle';
    pedal.flt.type = 'lowpass';
    pedal.gain.gain.value = 0;
    pedal.osc.connect(pedal.flt); pedal.flt.connect(pedal.gain); pedal.gain.connect(audio.sfxBus);
    pedal.osc.start();
  }
  const t = audio.ctx.currentTime, speed = game.speed || 0;
  pedal.gain.gain.setTargetAtTime(on ? 0.05 * CONFIG.pedalVolume : 0, t, 0.08);
  pedal.osc.frequency.setTargetAtTime(50 + speed * 0.12, t, 0.2);
  pedal.flt.frequency.setTargetAtTime(250 + speed * 1.4, t, 0.2);
}

// --- Music ---
// 'song' plays CONFIG.musicFile through the music bus (so volume and ducking
// work on iPhone too); 'chip' plays the generated chiptune; 'off' is silence.
const music = { el: null, chip: null, on: false };
function startMusic() {
  unlockAudio();
  if (!audio.ctx) return;
  music.on = true;
  const mode = audio.settings.music;
  if (mode !== 'song' && music.el) music.el.pause();
  if (mode !== 'chip') stopChip();
  if (mode === 'song') {
    if (!music.el) {
      music.el = new Audio(CONFIG.musicFile);
      music.el.loop = true;
      music.el.preload = 'auto';
      audio.ctx.createMediaElementSource(music.el).connect(audio.musicBus);
    }
    if (!document.hidden && game.state !== 'paused') music.el.play().catch(() => { /* retried on the next tap */ });
  } else if (mode === 'chip' && !music.chip && game.state !== 'paused') {
    music.chip = { step: 0, next: audio.ctx.currentTime + 0.1, timer: setInterval(scheduleChip, 25) };
  }
}
function pauseMusic() { if (music.el) music.el.pause(); stopChip(); }
function stopChip() { if (music.chip) { clearInterval(music.chip.timer); music.chip = null; } }
// Briefly drop the music under a crash.
function duckMusic() {
  if (!audio.ctx) return;
  const g = audio.musicBus.gain, t = audio.ctx.currentTime;
  g.cancelScheduledValues(t);
  g.setTargetAtTime(CONFIG.musicVolume * CONFIG.musicDuck, t, 0.03);
  g.setTargetAtTime(CONFIG.musicVolume, t + 0.8, 0.4);
}

// Chiptune: 4-bar loop of bass, arpeggio, a seeded little melody and drums,
// in the neighborhood's key, scale, tempo and swing. Notes are scheduled a
// moment ahead so timing stays tight even if a frame stutters.
const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], mixo: [0, 2, 4, 5, 7, 9, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
};
function scheduleChip() {
  const st = music.chip, ctx = audio.ctx;
  if (!st || ctx.state !== 'running') return;
  const m = theme().music, fast = game.phase !== 'route' && game.state === 'playing' ? 1.08 : 1;   // bonus course: a bit quicker
  const step = 60 / (m.bpm * fast) / 4;
  while (st.next < ctx.currentTime + 0.12) {
    chipStep(st.step, st.next, m, step);
    st.next += step * (st.step % 2 === 0 ? 1 + m.swing : 1 - m.swing);
    st.step = (st.step + 1) % 64;
  }
}
function chipStep(i, t0, m, step) {
  const bus = audio.musicBus, sc = SCALES[m.scale], s = i % 16, deg = m.prog[i >> 4];
  const chord = (k) => { const idx = deg + k * 2; return m.root + sc[idx % 7] + 12 * Math.floor(idx / 7); };
  if (s % 4 === 0) tone({ t0, bus, type: 'triangle', f: NOTE(chord(0) - 24), dur: step * 3.5, vol: 0.32 });
  if (s % 4 === 2) tone({ t0, bus, type: 'triangle', f: NOTE(chord(s % 8 === 2 ? 2 : 0) - 12), dur: step * 1.5, vol: 0.18 });
  if (s % 2 === 0) tone({ t0, bus, type: 'square', f: NOTE(chord([0, 1, 2, 1][(s / 2) % 4]) + 12), dur: step * 1.4, vol: 0.035 });
  if (s % 4 === 0 && hash(m.seed, (i % 32) + 1) > 0.3) {   // melody repeats every 2 bars
    const k = (hash(m.seed, i % 32) * 4) | 0;
    tone({ t0, bus, type: 'square', f: NOTE(chord(k === 3 ? 1 : k) + 24), dur: step * (hash(m.seed, i % 32 + 99) > 0.5 ? 3.5 : 1.8), vol: 0.05 });
  }
  if (s % 8 === 0) tone({ t0, bus, type: 'sine', f: 150, f2: 45, dur: 0.12, vol: 0.4 });            // kick
  if (s % 8 === 4) noise({ t0, bus, filter: 'bandpass', f: 1800, q: 0.8, dur: 0.09, vol: 0.16 });    // snare
  if (s % 2 === 1) noise({ t0, bus, filter: 'highpass', f: 7000, dur: 0.025, vol: 0.06 });           // hat
}

// --- Pause ---
function pauseGame() {
  if (game.state !== 'playing') return;
  game.state = 'paused';
  pointers.clear();
  input.left = input.right = false;
  pauseMusic();
  updatePedalSound(false);
  showPanel(ui.pause);
}
function resumeGame() {
  if (game.state !== 'paused') return;
  game.state = 'playing';
  hideOverlay();
  if (music.on) startMusic();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { pauseGame(); pauseMusic(); }
  else if (music.on && game.state !== 'paused') startMusic();
});

// --- Sound settings UI (start screen + pause menu) ---
const MUSIC_MODES = ['song', 'chip', 'off'];
const MUSIC_LABEL = { song: '🎵 SONG', chip: '🎵 8-BIT', off: '🔇 MUSIC' };
function updateAudioUI() {
  const s = audio.settings;
  document.querySelectorAll('.set-sfx').forEach((b) => { b.textContent = s.sfx ? '🔊 SFX' : '🔇 SFX'; b.classList.toggle('off', !s.sfx); });
  document.querySelectorAll('.set-music').forEach((b) => { b.textContent = MUSIC_LABEL[s.music]; b.classList.toggle('off', s.music === 'off'); });
  document.querySelectorAll('.set-vol').forEach((r) => { r.value = Math.round(s.volume * 100); });
}
function cycleMusic() {
  const s = audio.settings;
  s.music = MUSIC_MODES[(MUSIC_MODES.indexOf(s.music) + 1) % MUSIC_MODES.length];
  saveAudio();
  if (s.music === 'off') { pauseMusic(); music.on = false; } else startMusic();
  updateAudioUI();
}
document.querySelectorAll('.set-sfx').forEach((b) => b.addEventListener('click', (e) => {
  e.stopPropagation(); unlockAudio();
  audio.settings.sfx = !audio.settings.sfx; saveAudio(); applyAudioSettings(); sfx.click();
}));
document.querySelectorAll('.set-music').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); sfx.click(); cycleMusic(); }));
document.querySelectorAll('.set-vol').forEach((r) => {
  r.addEventListener('click', (e) => e.stopPropagation());
  r.addEventListener('input', () => { unlockAudio(); audio.settings.volume = r.value / 100; saveAudio(); applyAudioSettings(); });
});
ui.pauseBtn.addEventListener('click', (e) => { e.stopPropagation(); sfx.click(); pauseGame(); });
ui.resumeBtn.addEventListener('click', (e) => { e.stopPropagation(); sfx.click(); resumeGame(); });
updateAudioUI();


// ---------------------------------------------------------------------
// 9c. RIDERS, CUTSCENES, MEDALS
// Riders are cosmetic only: a palette + hairstyle applied to the bike sprite
// and to a front-view figure used for portraits and cutscenes. Cutscenes are
// small pixel scenes drawn into the art buffer, with a typewriter dialogue
// box on top: tap to advance, SKIP in the corner. Progress (rider, medals,
// cutscenes seen, furthest week) is saved in localStorage.
// ---------------------------------------------------------------------
const RIDER_KEY = 'routeRush.rider';
const PROGRESS_KEY = 'routeRush.progress';

const RIDERS = [
  { id: 'jada', name: 'JADA', skin: '#5c3a24', hair: '#17110e', style: 'afro', helmet: '#ff8c42', shirt: '#2ec4b6', pants: '#34495e' },
  { id: 'marcus', name: 'MARCUS', skin: '#7a4a2c', hair: '#21160f', style: 'locs', helmet: '#d64545', shirt: '#ffd23f', pants: '#2b2b35' },
  { id: 'aaliyah', name: 'AALIYAH', skin: '#8f5b3a', hair: '#1a1210', style: 'braids', helmet: '#9b5de5', shirt: '#f15bb5', pants: '#34495e' },
  { id: 'mateo', name: 'MATEO', skin: '#c48a5c', hair: '#3a2416', style: 'curly', helmet: '#3fa34d', shirt: '#ff8c42', pants: '#3b4a6b' },
  { id: 'ethan', name: 'ETHAN', skin: '#f2c8a0', hair: '#d9b45a', style: 'straight', helmet: '#3a7bd5', shirt: '#d64545', pants: '#2b2b35' },
  { id: 'kenji', name: 'KENJI', skin: '#e6b88a', hair: '#15151a', style: 'buzz', helmet: '#ffd23f', shirt: '#3a7bd5', pants: '#4a4a55' },
  { id: 'emma', name: 'EMMA', skin: '#f8dcc8', hair: '#b5502a', style: 'ponytail', helmet: '#f15bb5', shirt: '#7fd0c4', pants: '#34495e' },
  { id: 'amira', name: 'AMIRA', skin: '#a8714a', hair: '#7a2d4a', style: 'hijab', helmet: '#f7f4ea', shirt: '#3fa3a0', pants: '#2b2b35' },
];
function hairShade(hex) {   // texture color: lighter for dark hair, darker for light hair
  const n = parseInt(hex.slice(1), 16), lum = 0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255);
  return lum < 90 ? shade(hex, 1.25) : shade(hex, 0.72);
}

// Hair seen from above/behind on the bike sprite: [row, col, pixels] over
// RIDER_TOP (spaces leave the pixel alone). Ponytail has a sway frame.
const TOP_HAIR = {
  buzz: [],
  straight: [[7, 4, 'hhhh'], [8, 5, 'hh']],
  afro: [[3, 4, 'h  h'], [4, 3, 'h    h'], [5, 3, 'h    h'], [6, 3, 'h    h'], [7, 3, 'hhhhhh'], [8, 4, 'hhhh']],
  locs: [[7, 4, 'hhhh'], [8, 4, 'hHhH'], [9, 4, 'hHhH'], [10, 4, 'h H ']],
  braids: [[7, 4, 'hhhh'], [8, 4, 'H  H'], [9, 4, 'h  h'], [10, 4, 'H  H'], [11, 4, 'a  a']],
  curly: [[5, 3, 'h    h'], [6, 3, 'H    H'], [7, 4, 'hHhH'], [8, 4, 'HhHh'], [9, 5, 'h']],
  hijab: [[4, 3, 'j    j'], [5, 3, 'j    j'], [6, 3, 'j    j'], [7, 3, 'jjjjjj'], [8, 3, 'jJJJJj'], [9, 4, 'JJJJ']],
  ponytail: [[7, 5, 'hh'], [8, 5, 'h'], [9, 4, 'H'], [10, 4, 'h']],
  ponytailB: [[7, 5, 'hh'], [8, 6, 'h'], [9, 7, 'H'], [10, 7, 'h']],
};
function riderTopSprite(r, frame) {
  const rows = SPRITE_ART[frame ? 'riderB' : 'riderA'].map((row) => row.split(''));
  for (const [y, x, str] of TOP_HAIR[r.style === 'ponytail' && frame ? 'ponytailB' : r.style]) {
    for (let i = 0; i < str.length; i++) if (str[i] !== ' ') rows[y][x + i] = str[i];
  }
  return spriteFromArt(rows.map((row) => row.join('')), {
    ...PAL, s: r.skin, c: r.helmet, o: r.shirt, O: shade(r.shirt, 0.78), n: r.pants,
    h: r.hair, H: hairShade(r.hair), j: r.hair, J: shade(r.hair, 0.75),
  });
}

// Front-view figure, 16x26 art pixels (+1 outline). Options: skin, hair,
// style, helmet, shirt, pants, suit (torso color; jacket: sleeves too), tie,
// sash, glasses, mustache, bag, medal, armsUp, back (seen from behind).
const SKIN_TONES = ['#f8dcc8', '#f2c8a0', '#e0ac7e', '#c48a5c', '#a8714a', '#8f5b3a', '#6e4a32', '#5c3a24'];
const personCache = new Map();
function makePerson(o) {
  const key = JSON.stringify(o);
  if (personCache.has(key)) return personCache.get(key);
  const W = 18, H = 28, g = new Array(W * H);
  const set = (x, y, c) => { if (c && x >= 0 && x < 16 && y >= 0 && y < 26) g[(y + 1) * W + x + 1] = c; };
  const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, c); };
  const ell = (cx, cy, rx, ry, c, c2) => {
    for (let y = 0; y < 26; y++) for (let x = 0; x < 16; x++) {
      if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) set(x, y, c2 && (x * 2 + y) % 5 === 0 ? c2 : c);
    }
  };
  const skin = o.skin, hair = o.hair, hair2 = hairShade(hair), st = o.style;
  const hasHair = !['bald', 'buzz', 'short'].includes(st);

  // Hair behind the head
  if (st === 'afro') ell(8, 6.5, 7.6, 6.8, hair, hair2);
  else if (st === 'curly') ell(8, 6.5, 6.4, 6.2, hair, hair2);
  else if (st === 'locs') { rect(3, 3, 12, 8, hair); for (let x = 3; x <= 12; x++) for (let y = 9; y <= 14 + (x % 3); y++) set(x, y, x % 2 ? hair : hair2); }
  else if (st === 'braids') { rect(3, 3, 12, 9, hair); for (let y = 10; y <= 17; y++) { set(3, y, y % 2 ? hair : hair2); set(12, y, y % 2 ? hair : hair2); } set(3, 18, '#ffd23f'); set(12, 18, '#ffd23f'); }
  else if (st === 'straight') { rect(3, 3, 12, 14, hair); rect(3, 6, 3, 14, hair2); rect(12, 6, 12, 14, hair2); }
  else if (st === 'ponytail') { rect(3, 3, 12, 8, hair); for (const [x, y] of [[13, 5], [13, 6], [14, 7], [14, 8], [14, 9], [14, 10], [13, 11], [14, 11], [13, 12]]) set(x, y, hair); set(13, 5, '#ffd23f'); }
  else if (st === 'hijab') { rect(3, 3, 12, 14, hair); rect(2, 12, 13, 15, hair); }

  // Head
  const headC = o.back && hasHair ? hair : skin;
  rect(5, 4, 10, 11, headC); rect(4, 5, 11, 10, headC);
  if (['buzz', 'short', 'bald', 'ponytail'].includes(st)) { set(3, 8, skin); set(12, 8, skin); }   // ears
  if (st === 'hijab') { rect(4, 4, 11, 5, hair); rect(4, 6, 4, 11, hair); rect(11, 6, 11, 11, hair); rect(5, 12, 10, 12, hair); if (o.back) rect(5, 6, 10, 11, hair); }
  if (o.helmet) {
    const hc = o.helmet;
    rect(5, 1, 10, 1, hc); rect(4, 2, 11, 2, hc); rect(3, 3, 12, 4, hc); rect(3, 5, 12, 5, shade(hc, 0.72));
    rect(7, 1, 8, 4, shade(hc, 0.85)); set(5, 2, shade(hc, 1.5)); set(4, 3, shade(hc, 1.5));
    if (hasHair && st !== 'hijab' && st !== 'afro') { set(4, 6, hair); set(11, 6, hair); }
  } else if (st === 'bald') { rect(4, 6, 4, 8, hair); rect(11, 6, 11, 8, hair); }
  else if (st !== 'hijab') {
    rect(5, 3, 10, 3, hair); rect(4, 4, 11, 4, hair); set(4, 5, hair); set(11, 5, hair);
    if (hasHair) rect(5, 5, 7, 5, hair);   // fringe
  }
  if (!o.back) {
    set(6, 8, PAL.k); set(9, 8, PAL.k);
    set(5, 9, shade(skin, 1.12)); set(10, 9, shade(skin, 1.12));
    set(7, 10, '#8a3b3b'); set(8, 10, '#8a3b3b');
    if (o.glasses) { rect(5, 7, 7, 9, PAL.k); rect(8, 7, 10, 9, PAL.k); set(6, 8, '#bfe3ff'); set(9, 8, '#bfe3ff'); }
    if (o.mustache) rect(6, 10, 9, 10, hair);
  }
  rect(7, 12, 8, 12, st === 'hijab' ? hair : skin);   // neck

  // Body
  const sh = o.shirt, torso = o.suit || sh, sleeve = o.jacket ? o.suit : sh;
  rect(4, 13, 11, 19, torso); rect(4, 13, 4, 19, shade(torso, 0.78)); rect(11, 13, 11, 19, shade(torso, 0.78));
  if (o.suit && !o.back) { set(7, 13, '#f7f4ea'); set(8, 13, '#f7f4ea'); if (o.tie) rect(7, 14, 8, 17, o.tie); }
  if (st === 'hijab') rect(3, 13, 12, 15, hair);
  if (o.sash && !o.back) for (let i = 0; i < 8; i++) { const y = 13 + Math.round(i * 0.85); set(4 + i, y, o.sash); set(4 + i, y + 1, shade(o.sash, 0.8)); }
  if (o.armsUp) {
    rect(2, 10, 3, 13, sleeve); rect(1, 7, 2, 9, sleeve); rect(1, 5, 2, 6, skin);   // arms up in a V
    rect(12, 10, 13, 13, sleeve); rect(13, 7, 14, 9, sleeve); rect(13, 5, 14, 6, skin);
  } else {
    rect(2, 13, 3, 18, sleeve); rect(12, 13, 13, 18, sleeve); rect(2, 19, 3, 19, skin); rect(12, 19, 13, 19, skin);
  }
  if (o.bag && !o.back) {
    for (let i = 0; i < 6; i++) set(5 + i, 13 + i, PAL.Y);
    rect(11, 17, 14, 21, PAL.y); rect(11, 17, 14, 17, PAL.Y); rect(12, 16, 13, 16, PAL.e);
  }
  if (o.medal && !o.back) {
    set(6, 13, '#d64545'); set(7, 14, '#d64545'); set(9, 13, '#3a7bd5'); set(8, 14, '#3a7bd5');
    rect(6, 15, 9, 17, o.medal); set(7, 15, shade(o.medal, 1.45)); set(9, 17, shade(o.medal, 0.7));
  }
  const pants = o.pants;
  rect(4, 20, 11, 20, shade(pants, 0.7)); rect(4, 21, 11, 21, pants); rect(4, 22, 6, 24, pants); rect(9, 22, 11, 24, pants);
  rect(3, 25, 6, 25, '#3a3a40'); rect(9, 25, 12, 25, '#3a3a40');

  const c = spriteFromFn(W, H, (px) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const col = g[y * W + x];
      if (col) px(x, y, col);
      else if (g[y * W + x - 1] && x > 0 || g[y * W + x + 1] && x < W - 1 || g[(y - 1) * W + x] || g[(y + 1) * W + x]) px(x, y, PAL.k);
    }
  });
  personCache.set(key, c);
  return c;
}
function riderPerson(r, extra) { return makePerson({ skin: r.skin, hair: r.hair, style: r.style, helmet: r.helmet, shirt: r.shirt, pants: r.pants, ...extra }); }

// Head-and-shoulders portrait for the select screen (its own canvas).
function makePortrait(r, bg) {
  const src = riderPerson(r, {}), c = makeCanvas(18, 18), g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 18, 18);
  g.drawImage(src, 0, 0, 18, 18, 0, 1, 18, 18);
  return c;
}

// Medal icon 14x20; locked = gray silhouette.
function makeMedal(color, locked) {
  return spriteFromFn(14, 20, (px) => {
    const rib = locked ? ['#4a4f5a', '#3e434d'] : ['#d64545', '#3a7bd5'];
    for (let y = 0; y < 8; y++) { px(3 + (y >> 1), y, rib[0]); px(4 + (y >> 1), y, rib[0]); px(10 - (y >> 1), y, rib[1]); px(9 - (y >> 1), y, rib[1]); }
    const main = locked ? '#5a5f6a' : color, dark = locked ? '#3e434d' : shade(color, 0.68), lite = locked ? '#5a5f6a' : shade(color, 1.45);
    for (let y = 8; y < 20; y++) for (let x = 0; x < 14; x++) {
      const d = ((x + 0.5 - 7) / 6) ** 2 + ((y + 0.5 - 14) / 6) ** 2;
      if (d <= 1) px(x, y, d > 0.62 ? dark : (x < 7 && y < 13 ? lite : main));
    }
    if (!locked) for (const [x, y] of [[7, 11], [6, 13], [7, 13], [8, 13], [5, 13], [9, 13], [6, 14], [7, 14], [8, 14], [6, 15], [8, 15]]) px(x, y, lite);   // star
  });
}
const MEDALS = [
  { id: 'bronze', name: 'BRONZE', week: 1, color: '#cd7f32' },
  { id: 'silver', name: 'SILVER', week: 2, color: '#c9d1da' },
  { id: 'gold', name: 'GOLD', week: 3, color: '#ffd23f' },
];
SPR.key = spriteFromArt([
  '.aaa..............',
  'a...a.............',
  'a...aaaaaaaaaaaaaa',
  'a...a........a.a.a',
  '.aaa.........a.a..',
], { a: '#ffd23f' });

// --- Saved choices + progress ---
let rider = RIDERS.find((r) => r.id === storage.get(RIDER_KEY, '')) || null;
const progress = (() => {
  const base = { seen: {}, medals: {}, furthest: 0, weeksDone: 0 };
  try { return { ...base, ...JSON.parse(storage.get(PROGRESS_KEY, '{}')) }; } catch (e) { return base; }
})();
function saveProgress() { storage.set(PROGRESS_KEY, JSON.stringify(progress)); }
function curRider() { return rider || RIDERS[0]; }
function applyRider() {
  const r = curRider();
  SPR.riderA = riderTopSprite(r, 0);
  SPR.riderB = riderTopSprite(r, 1);
}
applyRider();
function noteFurthest() {   // called each new day
  const n = (game.week - 1) * DAY_NAMES.length + game.day;
  if (n > progress.furthest) { progress.furthest = n; saveProgress(); }
}
// A week was finished: award its medal, return the cutscene to play (or null).
function weekDone(w) {
  const m = MEDALS.find((md) => md.week === w);
  if (m) progress.medals[m.id] = 1;
  progress.weeksDone = Math.max(progress.weeksDone, w);
  const id = 'week' + w;
  const play = !progress.seen[id];
  progress.seen[id] = 1;
  saveProgress();
  return play ? id : null;
}

// --- Cutscene scripts ---
// Each step: one line of dialogue + what the scene shows. Short on purpose.
const MAYOR = { skin: '#c99a6e', hair: '#b8bcc6', style: 'short', suit: '#2d3a4a', jacket: true, shirt: '#f7f4ea', tie: '#d64545', sash: '#ffd23f', mustache: true, pants: '#2d3a4a' };
const BOSS = { skin: '#6e4a32', hair: '#9aa0a8', style: 'bald', glasses: true, shirt: '#f7f4ea', suit: '#7a4a28', tie: '#3a7bd5', pants: '#3b3b44' };
function cutsceneScript(id) {
  const me = curRider().name;
  if (id === 'intro') return { scene: 'office', steps: [
    { who: 'BOSS', text: 'So you\'re the new carrier! Welcome to the Daily Route.' },
    { who: 'BOSS', text: 'Seven neighborhoods. Every morning. Rain or shine.' },
    { who: 'BOSS', text: 'Kansas City\'s counting on you. Don\'t miss a porch.', bag: true },
    { who: me, text: 'I won\'t let you down!', bag: true, cheer: true },
  ] };
  if (id === 'week1') return { scene: 'stage', steps: [
    { who: '', text: 'One week later... a ceremony downtown!' },
    { who: 'MAYOR', text: 'Every porch, every morning. This city noticed.' },
    { who: 'MAYOR', text: 'For outstanding delivery service to Kansas City!', medal: 'bronze', pin: true },
    { who: me, text: 'Thank you! See you on the route!', medal: 'bronze', cheer: true },
  ] };
  if (id === 'week2') return { scene: 'stage', steps: [
    { who: 'MAYOR', text: 'Two weeks! The porches have never looked happier.' },
    { who: 'MAYOR', text: 'Please accept this silver medal...', medal: 'silver', pin: true },
    { who: 'MAYOR', text: '...and the Key to the City!', medal: 'silver', key: true },
    { who: me, text: 'Does it open the newspaper office?', medal: 'silver', key: true, cheer: true },
  ] };
  if (id === 'week3') return { scene: 'stage', steps: [
    { who: 'MAYOR', text: 'Three weeks! Kansas City has never been better read.' },
    { who: 'MAYOR', text: 'The gold medal. You earned every inch of it.', medal: 'gold', pin: true },
    { who: '', text: 'And the whole city came out for a parade!', medal: 'gold', parade: true },
    { who: me, text: 'Same time tomorrow, everybody!', medal: 'gold', parade: true },
  ] };
  const n = parseInt(id.slice(4), 10) || 4;
  return { scene: 'party', week: n, steps: [
    { who: '', text: `WEEK ${n} COMPLETE!` },
    { who: me, text: pick(['On to the next one!', 'Papers never sleep!', 'Fresh week, fresh porches!', 'Kansas City, here I come again!']), cheer: true },
  ] };
}
const CUTSCENE_TITLES = { intro: 'THE NEW HIRE', week1: 'BRONZE', week2: 'SILVER + KEY', week3: 'GOLD PARADE' };

const cs = { id: '', script: null, step: 0, typed: 0, stepT: 0, t: 0, done: null, lastBlip: 0 };
function playCutscene(id, done) {
  Object.assign(cs, { id, script: cutsceneScript(id), step: 0, typed: 0, stepT: 0, t: 0, done, lastBlip: 0 });
  progress.seen[id] = 1;
  saveProgress();
  game.state = 'cutscene';
  pointers.clear();
  hideOverlay();
  if (audio.settings.music !== 'off') startMusic();   // still inside the tap that got us here
  stepSound();
}
function stepSound() {
  const st = cs.script.steps[cs.step];
  if (st.pin) setTimeout(() => sfx.perfect(), 350);
  else if (st.key || (st.parade && cs.step > 0 && !cs.script.steps[cs.step - 1].parade)) sfx.clear();
  else if (cs.script.scene === 'party' && cs.step === 0) sfx.perfect();
}
function updateCutscene(dt) {
  cs.t += dt; cs.stepT += dt;
  const text = cs.script.steps[cs.step].text;
  if (cs.typed < text.length) {
    cs.typed = Math.min(text.length, cs.typed + dt * CONFIG.typeSpeed);
    if (cs.t - cs.lastBlip > 0.07 && text[Math.floor(cs.typed) - 1] !== ' ') { cs.lastBlip = cs.t; sfx.type(); }
  }
}
function advanceCutscene() {
  const text = cs.script.steps[cs.step].text;
  if (cs.typed < text.length) { cs.typed = text.length; return; }
  if (cs.step + 1 >= cs.script.steps.length) { endCutscene(); return; }
  cs.step++; cs.typed = 0; cs.stepT = 0;
  stepSound();
}
function endCutscene() {
  if (game.state !== 'cutscene') return;
  const done = cs.done;
  cs.done = null;
  game.state = 'menu';
  if (done) done();
}
function skipRect() { return { x: view.W - 78, y: view.safeTop + 10, w: 68, h: 28 }; }
function cutsceneTap(x, y) {
  const r = skipRect();
  if (x >= r.x - 8 && x <= r.x + r.w + 8 && y >= r.y - 8 && y <= r.y + r.h + 8) { sfx.click(); endCutscene(); return; }
  advanceCutscene();
}

// --- Cutscene drawing (art-pixel coordinates in the buffer) ---
const DIALOG_H = 150;
function cr(x, y, w, h, c) { pix.fillStyle = c; pix.fillRect(PAD + Math.round(x), PAD + Math.round(y), Math.round(w), Math.round(h)); }
function cimg(img, x, y, s = 1) { pix.drawImage(img, PAD + Math.round(x), PAD + Math.round(y), img.width * s, img.height * s); }
const CONFETTI = ['#ffd23f', '#ff5a5f', '#2ec4b6', '#3a7bd5', '#f15bb5', '#ffffff', '#7fd0c4'];
function confetti(t, AW, SH, n) {
  for (let i = 0; i < n; i++) {
    const sp = 18 + hash(i, 2) * 30, y = (t * sp + hash(i, 3) * SH) % SH - 4;
    const x = (hash(i, 1) * AW + Math.sin(t * 2 + i) * 4 + AW) % AW;
    cr(x, y, (i + Math.floor(t * 6)) % 3 ? 2 : 1, 2, CONFETTI[i % CONFETTI.length]);
  }
}
const crowdCache = [];
function crowdPerson(i, up) {
  const k = i % 12;
  if (!crowdCache[k]) {
    const rng = mulberry32(900 + k * 37);
    const styles = ['afro', 'curly', 'straight', 'short', 'ponytail', 'braids', 'hijab', 'locs', 'bald', 'buzz'];
    const base = {
      skin: pickR(SKIN_TONES, rng), hair: pickR(['#17110e', '#3a2416', '#6b4226', '#d9b45a', '#b5502a', '#2a2a30', '#9aa0a8', '#7a2d4a', '#2f6db5'], rng),
      style: pickR(styles, rng), shirt: pickR(['#ff5a5f', '#2ec4b6', '#ffd23f', '#9b5de5', '#3a7bd5', '#ff8c42', '#3fa34d', '#f15bb5'], rng), pants: '#34495e', back: true,
    };
    crowdCache[k] = [makePerson(base), makePerson({ ...base, armsUp: true })];
  }
  return crowdCache[k][up ? 1 : 0];
}
// Rows of cheering heads seen from behind, bobbing; only the top shows.
function drawCrowdRow(t, AW, y, seed, cheer) {
  for (let i = 0; i < 9; i++) {
    const x = i * 26 - 12 + ((seed * 13) % 17);
    const up = cheer && Math.floor(t * 3 + hash(i, seed) * 4) % 2 === 0;
    const bob = Math.round(Math.abs(Math.sin(t * 6 + i * 1.7 + seed)) * (cheer ? 3 : 1));
    cimg(crowdPerson(i + seed * 3, up), x, y - bob, 2);
  }
}
function drawSkyline(AW, base, cols) {   // generic downtown silhouette, no real buildings
  for (let i = 0; i < 12; i++) {
    const w = 14 + Math.floor(hash(i, 5) * 14), h = 30 + Math.floor(hash(i, 6) * 60), x = i * 18 - 6;
    cr(x, base - h, w, h, cols[i % cols.length]);
    for (let wy = base - h + 4; wy < base - 4; wy += 6) for (let wx = x + 3; wx < x + w - 2; wx += 5) {
      if (hash(wx, wy) > 0.45) cr(wx, wy, 2, 3, '#ffe9a8');
    }
  }
}

function sceneOffice(t, st, AW, SH) {
  const floorY = Math.round(SH * 0.78);
  cr(0, 0, AW, floorY, '#7c6a58');                    // wall
  cr(0, floorY - 24, AW, 24, '#5e4c3c');              // wainscot
  cr(0, floorY - 25, AW, 1, '#a08870');
  // Window with a city view
  const wx = 18, wy = Math.round(SH * 0.12), ww = 74, wh = Math.round(SH * 0.34);
  cr(wx - 3, wy - 3, ww + 6, wh + 6, '#3b2c22');
  cr(wx, wy, ww, wh, '#8fc8e8');
  pix.save(); pix.beginPath(); pix.rect(PAD + wx, PAD + wy, ww, wh); pix.clip();
  drawSkyline(AW, wy + wh, ['#5b6b80', '#4a586b', '#6a7a90']);
  pix.restore();
  cr(wx + ww / 2 - 1, wy, 2, wh, '#3b2c22'); cr(wx, wy + wh / 2 - 1, ww, 2, '#3b2c22');
  // Masthead sign for the (made-up) paper
  cr(112, wy, 72, 20, '#f7f4ea'); cr(112, wy + 20, 72, 2, '#1a1c2c');
  for (let i = 0; i < 6; i++) cr(116 + i * 11, wy + 6, 8, 3, '#1a1c2c');
  cr(116, wy + 13, 64, 2, '#d64545');
  // Floor + paper stacks
  cr(0, floorY, AW, SH - floorY, '#4a3a2e');
  for (let i = 0; i < AW; i += 16) cr(i, floorY, 1, SH - floorY, '#3e3026');
  for (const [x, n] of [[8, 5], [24, 3], [176, 6]]) for (let k = 0; k < n; k++) { cr(x, floorY + 8 - k * 4, 14, 4, k % 2 ? '#e8e2d0' : '#f7f4ea'); cr(x, floorY + 11 - k * 4, 14, 1, '#b8b0a0'); }
  // Boss behind the desk
  const deskY = floorY - 18, bossX = 113;
  cimg(makePerson(BOSS), bossX, deskY - 56, 3);
  cr(96, deskY, 88, 30, '#6b4226'); cr(96, deskY, 88, 4, '#8a5a36'); cr(100, deskY + 8, 80, 1, '#4a2e1a');
  cr(104, deskY - 6, 18, 6, '#f7f4ea'); cr(104, deskY - 3, 18, 1, '#b8b0a0');   // papers on the desk
  cr(160, deskY - 8, 10, 8, '#d64545'); cr(163, deskY - 11, 4, 3, '#2b2b35');   // mug + phone-ish
  // Rider; the bag slides over on the hand-off step
  const handed = st.bag, k = handed ? clamp(cs.stepT / 0.6, 0, 1) : 0;
  const hop = st.cheer ? Math.round(Math.abs(Math.sin(cs.stepT * 8)) * 3) : 0;
  cimg(riderPerson(curRider(), { bag: handed && k >= 1, armsUp: !!st.cheer }), 22, floorY - 72 - hop, 3);
  if (handed && k < 1) {
    const bx0 = lerp(bossX - 4, 58, k), by0 = lerp(deskY - 14, floorY - 30, k) - Math.sin(k * Math.PI) * 14;
    cr(bx0, by0, 10, 10, PAL.y); cr(bx0, by0, 10, 2, PAL.Y); cr(bx0 + 2, by0 - 2, 6, 2, PAL.e);
  }
}

function sceneStage(t, st, AW, SH) {
  if (st.parade) { sceneParade(t, st, AW, SH); return; }
  // Dusk sky + downtown
  const bands = ['#2b3a67', '#3e4f86', '#6a5f9e', '#c0749a', '#f0a070'];
  const skyH = Math.round(SH * 0.62);
  for (let i = 0; i < bands.length; i++) cr(0, Math.round(i * skyH / bands.length), AW, Math.ceil(skyH / bands.length), bands[i]);
  drawSkyline(AW, skyH, ['#2a2f45', '#353a55', '#232838']);
  cr(0, skyH, AW, SH - skyH, '#3a3f4e');
  // Stage with bunting
  const stageY = Math.round(SH * 0.72);
  cr(14, stageY, AW - 28, 14, '#8a5a36'); cr(14, stageY, AW - 28, 3, '#b07a4a');
  cr(14, stageY + 14, AW - 28, SH - stageY, '#5a3a24');
  for (let x = 20; x < AW - 20; x += 10) { cr(x, stageY + 4, 6, 3, ['#d64545', '#f7f4ea', '#3a7bd5'][(x / 10) % 3 | 0]); cr(x + 2, stageY + 7, 2, 2, ['#d64545', '#f7f4ea', '#3a7bd5'][(x / 10) % 3 | 0]); }
  // Banner poles + streamer
  const top = Math.max(6, stageY - 112);
  cr(10, top, 3, stageY - top, '#2b2b35'); cr(AW - 13, top, 3, stageY - top, '#2b2b35');
  cr(13, top + 4, AW - 26, 12, '#d64545'); cr(13, top + 4, AW - 26, 2, '#ff8a8a');
  for (let x = 22; x < AW - 22; x += 12) cr(x, top + 8, 6, 4, '#ffd23f');
  // Mayor and rider on stage
  const m = MEDALS.find((md) => md.id === st.medal);
  const pinK = st.pin ? clamp((cs.stepT - 0.2) / 0.6, 0, 1) : 1;
  const hop = st.cheer ? Math.round(Math.abs(Math.sin(cs.stepT * 8)) * 3) : 0;
  const rx = 34, mx = 112, py = stageY - 80;
  cimg(makePerson(MAYOR), mx, py, 3);
  cimg(riderPerson(curRider(), { medal: m && pinK >= 1 ? m.color : undefined, armsUp: !!(st.cheer || st.key) }), rx, py - hop, 3);
  if (m && pinK < 1) {   // medal travels from the mayor's hand to the rider
    const x = lerp(mx + 2, rx + 20, pinK), y = lerp(py + 50, py + 40, pinK) - Math.sin(pinK * Math.PI) * 14;
    cimg(makeMedal(m.color, false), x, y);
  }
  if (st.key) {   // key held up high, glinting
    const kx = rx, ky = py - 12 - hop + Math.round(Math.sin(cs.stepT * 4));
    cimg(SPR.key, kx, ky, 3);
    if (Math.floor(cs.t * 4) % 2) { cr(kx - 4, ky - 4, 2, 2, '#ffffff'); cr(kx + 50, ky + 12, 2, 2, '#ffffff'); }
  }
  // Crowd in front + confetti
  drawCrowdRow(t, AW, SH - 40, 1, true);
  drawCrowdRow(t, AW, SH - 22, 2, true);
  confetti(t, AW, SH, m && pinK >= 1 ? 70 : 24);
}

// Gold-week parade: the gameplay street seen from above, crowds both sides.
function sceneParade(t, st, AW, SH) {
  const scroll = (cs.t * 60) % 24;
  cr(0, 0, AW, SH, '#9a9a8e');                     // sidewalks
  cr(52, 0, AW - 104, SH, '#4a4f5a');              // street
  cr(50, 0, 2, SH, '#d8d4c4'); cr(AW - 52, 0, 2, SH, '#d8d4c4');
  for (let y = -24 + scroll; y < SH; y += 24) cr(AW / 2 - 1, y, 2, 12, '#ffd23f');
  for (let y = -40 + (cs.t * 60) % 40; y < SH; y += 40) { cr(0, y, 16, 34, '#b8613f'); cr(AW - 16, y, 16, 34, '#6a7a90'); cr(0, y + 34, 16, 6, '#7a4a28'); cr(AW - 16, y + 34, 16, 6, '#4a586b'); }
  for (let y = -16 + scroll * 0.66; y < SH; y += 16) {   // cheering fans along both curbs
    for (const [x, flip] of [[24, 0], [34, 1], [AW - 26, 0], [AW - 36, 1]]) {
      const i = Math.round(y / 16) + x, jump = Math.floor(t * 6 + i) % 2 ? 1 : 0;
      cimg(flip ? SPR.crowdG : SPR.crowdR, x - 4, y - jump);
    }
  }
  // Balloons drifting up
  for (let i = 0; i < 6; i++) {
    const y = SH - ((cs.t * 22 + hash(i, 8) * SH) % (SH + 20)), x = 60 + hash(i, 9) * (AW - 120) + Math.sin(cs.t + i) * 3;
    cr(x, y, 5, 6, CONFETTI[i]); cr(x + 2, y + 6, 1, 6, '#e8e8e8');
  }
  const pedal = Math.floor(cs.t * 5) % 2;
  cimg(pedal ? SPR.riderB : SPR.riderA, AW / 2 - 12, SH * 0.55 + Math.sin(cs.t * 2) * 2, 2);
  confetti(t, AW, SH, 60);
}

function sceneParty(t, st, AW, SH) {
  cr(0, 0, AW, SH, '#141a33');
  for (let i = 0; i < 30; i++) cr(hash(i, 11) * AW, hash(i, 12) * SH * 0.6, 1, 1, Math.floor(t * 2 + i) % 3 ? '#ffffff' : '#7a86b8');
  const base = Math.round(SH * 0.74);
  drawSkyline(AW, base, ['#1e2440', '#262d4d', '#1a1f38']);
  cr(0, base, AW, SH - base, '#2a2f45');
  for (let k = 0; k < 4; k++) {   // fireworks
    const period = 1.6, ph = (cs.t + k * 0.45) % period, cycle = Math.floor((cs.t + k * 0.45) / period);
    const cx = 25 + hash(k, cycle) * (AW - 50), cy = 20 + hash(k + 9, cycle) * SH * 0.35;
    const col = CONFETTI[(k + cycle) % CONFETTI.length];
    if (ph < 0.4) { cr(cx, cy + (0.4 - ph) * 150, 1, 3, '#ffe9a8'); continue; }
    const r = (ph - 0.4) * 30, fade = ph > 1.2;
    for (let a = 0; a < 12; a++) cr(cx + Math.cos(a * 0.5236) * r, cy + Math.sin(a * 0.5236) * r + (ph - 0.4) * 6, fade ? 1 : 2, fade ? 1 : 2, col);
  }
  const hop = Math.round(Math.abs(Math.sin(cs.t * 7)) * 6);
  cimg(riderPerson(curRider(), { armsUp: true, medal: progress.medals.gold ? '#ffd23f' : undefined }), AW / 2 - 27, base - 78 - hop, 3);
  confetti(t, AW, SH, 40);
}

function renderCutscene(now) {
  const t = now / 1000, ps = CONFIG.pixelSize;
  const AW = view.W / ps, SH = Math.round((view.H - DIALOG_H) / ps), AH = view.H / ps;
  const st = cs.script.steps[cs.step];
  pix.fillStyle = '#10141f';
  pix.fillRect(0, 0, buf.width, buf.height);
  ({ office: sceneOffice, stage: sceneStage, party: sceneParty })[cs.script.scene](t, st, AW, SH);
  cr(0, SH, AW, AH - SH, '#10141f');

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const s = view.scale * view.dpr;
  ctx.setTransform(s, 0, 0, s, view.offX * view.dpr, view.offY * view.dpr);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(buf, PAD, PAD, view.W / ps, view.H / ps, 0, 0, view.W, view.H);

  // Dialogue box
  const bx0 = 10, by0 = view.H - DIALOG_H + 6, bw = view.W - 20, bh = DIALOG_H - 18;
  ctx.fillStyle = PAL.k; ctx.fillRect(bx0 - 4, by0 - 4, bw + 8, bh + 8);
  ctx.fillStyle = '#f6f3ea'; ctx.fillRect(bx0, by0, bw, bh);
  ctx.fillStyle = '#2a3346'; ctx.fillRect(bx0 + 4, by0 + 4, bw - 8, bh - 8);
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  let ty = by0 + 16;
  if (st.who) {
    ctx.font = `10px ${FONT}`;
    textShadowed(st.who, bx0 + 16, ty, COLORS.perfect);
    ty += 22;
  }
  ctx.font = `11px ${FONT}`;
  const shown = st.text.slice(0, Math.floor(cs.typed));
  for (const line of wrapText(st.text, bw - 32).map((l, i, all) => {   // wrap the full text so words don't jump lines while typing
    const start = all.slice(0, i).reduce((n, x) => n + x.length + 1, 0);
    return shown.slice(start, start + l.length);
  })) { textShadowed(line, bx0 + 16, ty, '#ffffff'); ty += 20; }
  if (cs.typed >= st.text.length && Math.floor(t * 2.5) % 2) {
    ctx.fillStyle = COLORS.perfect;
    const ax = bx0 + bw - 24, ay = by0 + bh - 20;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + 10, ay); ctx.lineTo(ax + 5, ay + 6); ctx.fill();
  }
  ctx.font = `7px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillText(`${cs.step + 1}/${cs.script.steps.length}`, bx0 + 16, by0 + bh - 16);

  // Skip button
  const r = skipRect();
  ctx.fillStyle = PAL.k; ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = '#2a3346'; ctx.fillRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6);
  ctx.font = `9px ${FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('SKIP ▸', r.x + r.w / 2, r.y + r.h / 2 + 1);
}
function wrapText(text, maxW) {
  const lines = [];
  let cur = '';
  for (const w of text.split(' ')) {
    const next = cur ? cur + ' ' + w : w;
    if (cur && ctx.measureText(next).width > maxW) { lines.push(cur); cur = w; } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

// --- Rider select + Medals screens (HTML panels) ---
const selUI = {
  panel: document.getElementById('screen-rider'),
  grid: document.getElementById('rider-grid'),
  preview: document.getElementById('rider-preview'),
  name: document.getElementById('rider-name'),
  go: document.getElementById('rider-go'),
  back: document.getElementById('rider-back'),
  medals: document.getElementById('screen-medals'),
  medalRow: document.getElementById('medal-row'),
  medBest: document.getElementById('med-best'),
  medFar: document.getElementById('med-far'),
  rewatch: document.getElementById('rewatch'),
  medBack: document.getElementById('medals-back'),
  riderBtn: document.getElementById('rider-btn'),
  medalsBtn: document.getElementById('medals-btn'),
  titleFace: document.getElementById('title-face'),
};
let selPick = curRider(), selThen = null;
function canvasInto(el, c, cls) {
  el.innerHTML = '';
  c.className = cls || '';
  el.appendChild(c);
}
function cloneCanvas(src) { const c = makeCanvas(src.width, src.height); c.getContext('2d').drawImage(src, 0, 0); return c; }
function updateRiderPreview() {
  selUI.name.textContent = selPick.name;
  canvasInto(selUI.preview, cloneCanvas(riderPerson(selPick, { bag: true })), 'px big');
  const top = riderTopSprite(selPick, 0);
  top.className = 'px bike';
  selUI.preview.appendChild(top);
  selUI.grid.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.dataset.id === selPick.id));
}
function buildRiderGrid() {
  selUI.grid.innerHTML = '';
  for (const r of RIDERS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.id = r.id;
    const pc = makePortrait(r, '#1a1c2c');
    pc.className = 'px';
    b.appendChild(pc);
    const s = document.createElement('span');
    s.textContent = r.name;
    b.appendChild(s);
    b.addEventListener('click', (e) => { e.stopPropagation(); sfx.click(); selPick = r; updateRiderPreview(); });
    selUI.grid.appendChild(b);
  }
}
buildRiderGrid();
function updateTitleRider() {
  const pc = makePortrait(curRider(), '#2a3346');
  pc.className = 'px';
  canvasInto(selUI.titleFace, pc, 'px');
}
updateTitleRider();
function showRiderSelect(then) {
  game.state = 'menu';
  selThen = then || null;
  selPick = curRider();
  selUI.go.textContent = then ? 'RIDE!' : 'CHOOSE';
  selUI.back.classList.toggle('hidden', !!then && !rider);
  updateRiderPreview();
  showPanel(selUI.panel);
}
selUI.go.addEventListener('click', (e) => {
  e.stopPropagation();
  sfx.click();
  rider = selPick;
  storage.set(RIDER_KEY, rider.id);
  applyRider();
  updateTitleRider();
  const then = selThen;
  selThen = null;
  if (then) then(); else showTitle();
});
selUI.back.addEventListener('click', (e) => { e.stopPropagation(); sfx.click(); showTitle(); });

function showMedals() {
  game.state = 'menu';
  selUI.medalRow.innerHTML = '';
  for (const m of MEDALS) {
    const got = !!progress.medals[m.id];
    const d = document.createElement('div');
    d.className = 'medal' + (got ? '' : ' locked');
    const c = makeMedal(m.color, !got);
    c.className = 'px';
    d.appendChild(c);
    const s = document.createElement('span');
    s.textContent = got ? m.name : `WEEK ${m.week}`;
    d.appendChild(s);
    selUI.medalRow.appendChild(d);
  }
  if (progress.medals.silver) {
    const d = document.createElement('div');
    d.className = 'medal key';
    const c = cloneCanvas(SPR.key);
    c.className = 'px';
    d.appendChild(c);
    const s = document.createElement('span');
    s.textContent = 'KEY TO THE CITY';
    d.appendChild(s);
    selUI.medalRow.appendChild(d);
  }
  selUI.medBest.textContent = best;
  const f = progress.furthest, fd = DAY_NAMES[f % DAY_NAMES.length];
  selUI.medFar.textContent = `W${Math.floor(f / DAY_NAMES.length) + 1} ${fd.slice(0, 3)}`;
  selUI.rewatch.innerHTML = '';
  const list = ['intro', 'week1', 'week2', 'week3'];
  if (progress.weeksDone >= 4) list.push('week' + progress.weeksDone);
  for (const id of list) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'aud-btn';
    const open = !!progress.seen[id];
    b.disabled = !open;
    b.textContent = open ? `▶ ${CUTSCENE_TITLES[id] || 'WEEK ' + id.slice(4)}` : '🔒 ???';
    b.addEventListener('click', (e) => { e.stopPropagation(); if (!open) return; sfx.click(); playCutscene(id, showMedals); });
    selUI.rewatch.appendChild(b);
  }
  showPanel(selUI.medals);
}
selUI.medBack.addEventListener('click', (e) => { e.stopPropagation(); sfx.click(); showTitle(); });
selUI.riderBtn.addEventListener('click', (e) => { e.stopPropagation(); sfx.click(); showRiderSelect(null); });
selUI.medalsBtn.addEventListener('click', (e) => { e.stopPropagation(); sfx.click(); showMedals(); });

// Start from the title: pick a rider the first time, then the intro, then ride.
function requestRun() {
  if (!rider) { showRiderSelect(requestRun); return; }
  if (!progress.seen.intro) { playCutscene('intro', startGame); return; }
  startGame();
}


// ---------------------------------------------------------------------
// 10. LOOP
// ---------------------------------------------------------------------
let lastTime = performance.now();

function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));   // clamp after tab switches
  lastTime = now;
  update(dt);
  render(now);
  updatePedalSound(game.state === 'playing' && bike.airT <= 0 && !bike.crashed);
  const hidePause = game.state !== 'playing';
  if (ui.pauseBtn.hidden !== hidePause) ui.pauseBtn.hidden = hidePause;
  requestAnimationFrame(frame);
}

resetGame();
showTitle();
requestAnimationFrame(frame);
