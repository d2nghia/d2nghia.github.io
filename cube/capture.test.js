/**
 * Capture checks. Run with: node cube/capture.test.js
 *
 * A wrong photo-to-face mapping does not crash — it quietly builds a cube that
 * never existed. So this photographs a known cube at the angles a child would
 * spin the model to, and insists the readings rebuild exactly that cube.
 *
 * The simulated camera is derived from the cube's geometry, not from the page's
 * own view maths, so the two have to agree independently.
 */
const C = require('./solver.js');
const K = require('./capture.js');

const NORMAL = K.NORMAL;
const INDEX = {};
C.FACELETS.forEach((f, i) => { INDEX[f.pos.join(',') + '|' + f.face] = i; });

let failures = 0;
function check(name, cond, extra) {
  if (!cond) { failures++; console.log('FAIL  ' + name + (extra ? '  ' + extra : '')); }
  else console.log('ok    ' + name);
}
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** What the camera sees: the face `frame.front`, with `frame.up` at the top of the picture. */
function photograph(state, frame) {
  const up = NORMAL[frame.up], right = NORMAL[frame.right], cells = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const pos = [0, 1, 2].map(function (ax) {
      return NORMAL[frame.front][ax] + up[ax] * (1 - r) + right[ax] * (c - 1);
    });
    const idx = INDEX[pos.join(',') + '|' + frame.front];
    if (idx == null) throw new Error('no sticker at view cell ' + r + ',' + c);
    cells.push(state[idx]);
  }
  return cells;
}

/* the view frame must be a real frame at every angle, not just the tidy ones */
let frameOk = true, sawFaces = new Set();
for (let rx = -360; rx <= 360; rx += 7) {         // the cube rolls right over, so no range is off-limits
  for (let ry = -360; ry <= 360; ry += 11) {
    const f = K.frameFromView(rx, ry);
    sawFaces.add(f.front);
    const got = cross(NORMAL[f.right], NORMAL[f.up]).join(',');
    if (got !== NORMAL[f.front].join(',')) { frameOk = false; break; }
    if (f.up === f.front || f.up === K.OPP[f.front]) { frameOk = false; break; }
  }
}
check('every view angle gives a sensible frame, upside down included', frameOk);
check('spinning the model can reach all six sides', sawFaces.size === 6, 'reached ' + [...sawFaces].join(','));

/* the resting view shows the front face the right way up */
const rest = K.frameFromView(-22, -32);
check('the resting view faces F with U on top',
  rest.front === 'F' && rest.up === 'U' && rest.right === 'R', JSON.stringify(rest));

/* photograph a known cube at six angles and rebuild it */
const ANGLES = [[-22, -32], [-22, -122], [-22, -212], [-22, 58], [-68, -32], [68, -32]];
let mismatches = 0, covered = 0;
for (let t = 0; t < 300; t++) {
  const truth = C.applyMoves(C.solvedState(), C.randomScramble(30));
  const rebuilt = new Int8Array(54).fill(-1);
  const faces = new Set();
  ANGLES.forEach(function (a) {
    const place = K.placement(a[0], a[1]);
    faces.add(place.face);
    const photo = photograph(truth, place.frame);              // what the child shows the camera
    const base = C.FACE_ORDER.indexOf(place.face) * 9;
    for (let j = 0; j < 9; j++) rebuilt[base + place.fromCamera[j]] = photo[j];
  });
  if (faces.size === 6) covered++;
  for (let i = 0; i < 54; i++) if (rebuilt[i] !== truth[i]) { mismatches++; break; }
}
check('six angles cover all six sides', covered === 300);
check('readings rebuild the same cube, 300 times', mismatches === 0, mismatches + ' cubes came back wrong');

/* and from angles nobody would choose on purpose */
let oddOk = true;
for (let i = 0; i < 200; i++) {
  const truth = C.applyMoves(C.solvedState(), C.randomScramble(20));
  const rx = Math.random() * 720 - 360, ry = Math.random() * 720 - 360;
  const place = K.placement(rx, ry);
  const photo = photograph(truth, place.frame);
  const base = C.FACE_ORDER.indexOf(place.face) * 9;
  for (let j = 0; j < 9; j++) {
    if (truth[base + place.fromCamera[j]] !== photo[j]) { oddOk = false; break; }
  }
}
check('a side read at an awkward angle still lands correctly', oddOk);

/* a mirrored picture must be refused rather than solved */
const truth = C.applyMoves(C.solvedState(), C.randomScramble(30));
const mirrored = new Int8Array(54);
ANGLES.forEach(function (a) {
  const place = K.placement(a[0], a[1]);
  const photo = photograph(truth, place.frame);
  const flip = [2, 1, 0, 5, 4, 3, 8, 7, 6].map(function (j) { return photo[j]; }); // left-right swap
  const base = C.FACE_ORDER.indexOf(place.face) * 9;
  for (let j = 0; j < 9; j++) mirrored[base + place.fromCamera[j]] = flip[j];
});
check('a mirrored capture is rejected', !C.validate(mirrored).ok, JSON.stringify(C.validate(mirrored)));

/* reading a whole face, which is how the page actually does it */
const CUBE_RGB = {
  white: [250, 250, 250], yellow: [255, 212, 0], green: [0, 165, 80],
  blue: [23, 105, 214], red: [225, 55, 43], orange: [255, 132, 0]
};
/** A face under a given light: gains per channel, overall brightness, and noise. */
function litFace(names, opts) {
  opts = opts || {};
  const gain = opts.gain || [1, 1, 1], lift = opts.lift || 0, scale = opts.scale == null ? 1 : opts.scale;
  return names.map(function (n, i) {
    const c = CUBE_RGB[n];
    const wobble = opts.wobble ? ((i * 37) % 21) - 10 : 0;     // repeatable per-sticker variation
    return {
      r: Math.max(0, Math.min(255, c[0] * gain[0] * scale + lift + wobble)),
      g: Math.max(0, Math.min(255, c[1] * gain[1] * scale + lift + wobble)),
      b: Math.max(0, Math.min(255, c[2] * gain[2] * scale + lift + wobble))
    };
  });
}
function readsBack(names, opts, label) {
  const got = K.classifyFace(litFace(names, opts));
  const same = got.every(function (g, i) { return g === names[i]; });
  check('a face reads back under ' + label, same, same ? '' : 'got ' + got.join(','));
}

const MIXED = ['blue', 'red', 'blue', 'yellow', 'red', 'yellow', 'white', 'white', 'white'];
const ONE_COLOUR = ['white', 'white', 'white', 'white', 'white', 'white', 'white', 'white', 'white'];
const ALL_SIX = ['white', 'yellow', 'green', 'blue', 'red', 'orange', 'white', 'green', 'blue'];

readsBack(MIXED, {}, 'plain light');
readsBack(MIXED, { gain: [1.12, 1.02, 0.82], label: 'warm' }, 'a warm bulb');
readsBack(MIXED, { gain: [0.88, 0.98, 1.15] }, 'a cool bulb');
readsBack(MIXED, { scale: 0.55 }, 'a dim room');
readsBack(MIXED, { scale: 0.75, lift: 28, wobble: true }, 'washed-out light with noise');
readsBack(ALL_SIX, {}, 'plain light, all six colours');
readsBack(ALL_SIX, { gain: [1.12, 1.02, 0.82] }, 'a warm bulb, all six colours');
readsBack(ALL_SIX, { scale: 0.6, wobble: true }, 'a dim room, all six colours');
readsBack(ONE_COLOUR, {}, 'a face that is all one colour');
readsBack(ONE_COLOUR, { gain: [1.12, 1.02, 0.82] }, 'an all-white face under a warm bulb');

/* the old reading, one sticker at a time, got this face wrong — it must not now */
const warmMixed = litFace(MIXED, { gain: [1.15, 1.03, 0.78] });
const oneByOne = warmMixed.map(function (c) { return K.classify(c.r, c.g, c.b); });
const together = K.classifyFace(warmMixed);
check('judging the nine together beats one at a time',
  together.join(',') === MIXED.join(',') , 'together=' + together.join(',') + ' oneByOne=' + oneByOne.join(','));

/* colour reading */
const SWATCHES = {
  white: [250, 250, 250], yellow: [255, 212, 0], green: [0, 165, 80],
  blue: [23, 105, 214], red: [225, 55, 43], orange: [255, 132, 0]
};
let colourOk = true, dim = true;
Object.keys(SWATCHES).forEach(function (name) {
  const c = SWATCHES[name];
  if (K.classify(c[0], c[1], c[2]) !== name) { colourOk = false; console.log('      ' + name + ' read as ' + K.classify(c[0], c[1], c[2])); }
  const half = c.map(function (v) { return Math.round(v * 0.55 + 18); });   // same cube in dimmer light
  if (K.classify(half[0], half[1], half[2]) !== name) { dim = false; console.log('      dim ' + name + ' read as ' + K.classify(half[0], half[1], half[2])); }
});
check('clean swatches are read correctly', colourOk);
check('dimmer swatches are still read correctly', dim);
check('a black frame reads as "no idea" rather than a colour', K.classify(8, 8, 10) === null);

process.exit(failures ? 1 : 0);
