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

/* finding the face in a photograph, which is the part a child cannot do for us */
function drawPhoto(W, opts) {
  const o = Object.assign({
    face: ['yellow', 'blue', 'orange', 'white', 'yellow', 'orange', 'green', 'blue', 'white'],
    cell: W / 4.2, dx: 0, dy: 0, gain: [1, 1, 1], scale: 1, lift: 0, glare: null, noise: 6
  }, opts || {});
  const data = new Uint8ClampedArray(W * W * 4);
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  function put(x, y, rgb) {
    if (x < 0 || y < 0 || x >= W || y >= W) return;
    const i = (y * W + x) * 4;
    data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255;
  }
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    let v = 232 + rnd() * 12;
    if ((x + y) % 97 < 14 && x < W * 0.4) v = 150 + rnd() * 40;     // a drawing on the table
    if (x > W * 0.78 && y < W * 0.5) v = 205 + rnd() * 20;          // a hand
    put(x, y, [v, v * 0.97, v * 0.93]);
  }
  const cx = W / 2 + o.dx, cy = W / 2 + o.dy, cell = o.cell;
  for (let y = Math.round(cy - cell * 1.5); y < cy + cell * 1.5; y++) {
    for (let x = Math.round(cx - cell * 1.5); x < cx + cell * 1.5; x++) put(x, y, [18, 18, 20]);
  }
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const base = CUBE_RGB[o.face[r * 3 + c]];
    const col = [0, 1, 2].map(i => Math.min(255, base[i] * o.gain[i] * o.scale + o.lift));
    const sx = cx + (c - 1.5) * cell, sy = cy + (r - 1.5) * cell;
    for (let y = Math.round(sy + cell * 0.1); y < sy + cell * 0.9; y++) {
      for (let x = Math.round(sx + cell * 0.1); x < sx + cell * 0.9; x++) {
        put(x, y, col.map(v => Math.max(0, Math.min(255, v + (rnd() - 0.5) * o.noise))));
      }
    }
  }
  if (o.glare) {
    const gx = cx + o.glare[0] * cell, gy = cy + o.glare[1] * cell, gr = o.glare[2] * cell;
    for (let y = Math.round(gy - gr); y < gy + gr; y++) for (let x = Math.round(gx - gr); x < gx + gr; x++) {
      const d = Math.hypot(x - gx, y - gy);
      if (d > gr || x < 0 || y < 0 || x >= W || y >= W) continue;
      const i = (y * W + x) * 4, k = 0.85 * (1 - d / gr);
      data[i] += (255 - data[i]) * k; data[i + 1] += (255 - data[i + 1]) * k; data[i + 2] += (255 - data[i + 2]) * k;
    }
  }
  return data;
}

const PHOTO = 180, NOMINAL = PHOTO / 4.2;
const PHOTO_FACE = ['yellow', 'blue', 'orange', 'white', 'yellow', 'orange', 'green', 'blue', 'white'];
function photoReads(label, opts) {
  const got = K.readFace(drawPhoto(PHOTO, Object.assign({ face: PHOTO_FACE }, opts)), PHOTO, NOMINAL);
  if (!got) { check('a photo with the cube ' + label, false, 'found no face at all'); return; }
  const wrong = got.names.filter((n, i) => n && n !== PHOTO_FACE[i]).length;
  const unsure = got.names.filter(n => !n).length;
  check('a photo with the cube ' + label, wrong === 0 && unsure === 0,
    'wrong=' + wrong + ' unsure=' + unsure + ' got ' + got.names.join(','));
}

photoReads('filling the square', {});
photoReads('off to one side', { dx: 16 });
photoReads('off and up', { dx: -14, dy: -12 });
photoReads('held too far away', { cell: PHOTO / 6 });
photoReads('far away and off to one side', { cell: PHOTO / 5.6, dx: 14, dy: -10 });
photoReads('held too close', { cell: PHOTO / 3.4 });
photoReads('under a warm bulb', { gain: [1.15, 1.03, 0.78] });
photoReads('under a very warm bulb', { gain: [1.32, 1.0, 0.62] });
photoReads('in a dim room', { scale: 0.5 });
photoReads('in washed-out light', { scale: 0.75, lift: 35 });
photoReads('with a reflection on the middle', { glare: [0, 0, 0.55] });
photoReads('with a reflection on a corner', { glare: [-1, -1, 0.5] });
photoReads('far away, warm, with a reflection', { cell: PHOTO / 5.6, dx: 10, gain: [1.15, 1.03, 0.78], glare: [1, 0, 0.45] });

/* and it must not invent a face where there is none */
function emptyScene(kind) {
  const data = new Uint8ClampedArray(PHOTO * PHOTO * 4);
  let seed = 3;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < PHOTO * PHOTO; i++) {
    const v = kind === 'paper' ? 230 + rnd() * 14 : kind === 'hand' ? 180 + rnd() * 30 : rnd() * 255;
    data[i * 4] = v; data[i * 4 + 1] = v * 0.95; data[i * 4 + 2] = v * 0.9; data[i * 4 + 3] = 255;
  }
  return data;
}
['paper', 'hand', 'noise'].forEach(function (kind) {
  const got = K.readFace(emptyScene(kind), PHOTO, NOMINAL);
  check('nothing but ' + kind + ' scores too low to be a face', !got || got.score < 20,
    'score=' + (got ? got.score.toFixed(1) : 'none'));
});

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
