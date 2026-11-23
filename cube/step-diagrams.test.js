const { test } = require('node:test');
const assert = require('node:assert/strict');
const L = require('./solver.js');
const G = require('./step-diagrams.js');

test('every manual example has legal, consecutive quarter-turn pictures and reaches its goal', () => {
  assert.equal(G.STAGES.length, 7);
  for (const stage of G.STAGES) for (const recipe of stage.recipes) {
    const frames = G.lesson(recipe), moves = G.quarterTurns(recipe.alg);
    assert.equal(frames.length, moves.length + 1);
    assert.deepEqual(frames[0].state, L.applyMoves(L.solvedState(), L.inverse(L.parse(recipe.alg))));
    for (let i = 0; i < moves.length; i++) {
      assert.match(frames[i].move, /^[URFDLB]'?$/);
      assert.equal(L.validate(frames[i].state).ok, true);
      assert.deepEqual(L.applyMoves(frames[i].state, [frames[i].move]), frames[i + 1].state);
      assert.notEqual(frames[i].state, frames[i + 1].state, 'Frames must own separate states');
    }
    assert.equal(frames.at(-1).move, null);
    assert.equal(L.isSolved(frames.at(-1).state), true);
  }
  const double = G.lesson(G.STAGES[0].recipes[0]);
  assert.deepEqual(double.map(f => f.move), ['F', 'F', null]);
  assert.equal(L.isSolved(double[1].state), false, 'The halfway point of a double turn must be visible');
});

test('strip arrows agree with actual sticker motion on all six faces and reverse for inverse turns', () => {
  const labels = Int8Array.from({ length: 54 }, (_, i) => i);
  for (const face of L.FACE_ORDER) for (const suffix of ['', "'"]) {
    const move = face + suffix, state = L.applyMoves(labels, [move]), cues = G.cues(move);
    assert.ok(cues.filter(c => c.type === 'strip').length >= 2);
    for (const cue of cues.filter(c => c.type === 'strip')) {
      assert.equal(cue.cells.length, 3);
      const source = cue.cells[1], sourceIndex = L.FACELETS.indexOf(source), dest = L.FACELETS[state.indexOf(sourceIndex)];
      const from = G.project(source.pos), to = G.project(dest.pos);
      const arrow = [cue.points[1][0] - cue.points[0][0], cue.points[1][1] - cue.points[0][1]];
      assert.ok(arrow[0] * (to[0] - from[0]) + arrow[1] * (to[1] - from[1]) > 0, move + ' on ' + cue.face);
      const inverse = G.cues(L.inverse([move])[0]).find(c => c.face === cue.face && c.type === 'strip');
      cue.points.forEach((point, n) => point.forEach((value, axis) => assert.ok(Math.abs(value - inverse.points[1 - n][axis]) < 1e-8)));
    }
    for (const cue of cues) for (const point of cue.points) assert.ok(point.every(Number.isFinite));
  }
});

test('face rings follow the real clockwise and anticlockwise permutations', () => {
  const labels = Int8Array.from({ length: 54 }, (_, i) => i);
  const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
  const subtract = (a, b) => a.map((n, i) => n - b[i]);
  for (const face of ['F', 'R', 'U']) for (const suffix of ['', "'"]) {
    const move = face + suffix, base = L.FACE_INDEX[face] * 9, state = L.applyMoves(labels, [move]);
    const centre = G.project(L.FACELETS[base + 4].pos), from = G.project(L.FACELETS[base + 5].pos);
    const to = G.project(L.FACELETS[state.indexOf(base + 5)].pos);
    const actual = cross(subtract(from, centre), subtract(to, centre));
    const ring = G.cues(move).find(c => c.type === 'ring');
    const ringCentre = G.project(L.FACELETS[base + 4].pos.map(n => n * 1.5));
    const drawn = cross(subtract(ring.points[0], ringCentre), subtract(ring.points[1], ringCentre));
    assert.ok(actual * drawn > 0, move);
  }
});

test('the manual colour orientation and compact SVGs match the instructions', () => {
  assert.equal(G.COLOURS[L.FACE_INDEX.U], '#ffd400');
  assert.equal(G.COLOURS[L.FACE_INDEX.D], '#fafafa');
  assert.equal(G.COLOURS[L.FACE_INDEX.F], '#00a550');
  const standard = ['#fafafa', '#e1372b', '#00a550', '#ffd400', '#ff8400', '#1769d6'];
  assert.ok(L.ORIENTATIONS.some(seq => {
    let colours = standard;
    for (const rotation of seq) colours = L.rotateFaces(colours, rotation);
    return colours.every((colour, i) => colour === G.COLOURS[i]);
  }), 'The manual colour scheme must be a rotation of the real cube, never a mirror');
  const svg = G.cubeSVG(L.solvedState(), 'R');
  assert.equal([...svg.matchAll(/data-facelet=/g)].length, 27);
  assert.equal(svg.includes('diagram-arrowhead'), true);
  assert.equal(/cubie|translate3d|rotate[XYZ]|<div/.test(svg), false);
  assert.equal([...G.goalSVG('cross').matchAll(/fill="#fafafa"/g)].length, 5);
  assert.equal([...G.goalSVG('corners').matchAll(/fill="#fafafa"/g)].length, 9);
  assert.equal([...G.goalSVG('yellowCross').matchAll(/fill="#ffd400"/g)].length, 5);
});

test('case labels match the white corner direction and the middle edge destination in their first picture', () => {
  for (const recipe of G.STAGES.find(s => s.key === 'corners').recipes) {
    const start = G.lesson(recipe)[0].state;
    const sticker = L.FACELETS.findIndex((f, i) => f.pos.every(n => n === 1) && start[i] === L.FACE_INDEX.D);
    assert.equal(L.FACELETS[sticker].face, { right: 'R', front: 'F', top: 'U' }[recipe.id]);
  }
  for (const recipe of G.STAGES.find(s => s.key === 'belt').recipes) {
    const start = G.lesson(recipe)[0].state;
    const front = L.FACELETS.findIndex(f => f.face === 'F' && f.row === 0 && f.col === 1);
    const top = L.FACELETS.findIndex(f => f.face === 'U' && f.row === 2 && f.col === 1);
    assert.equal(start[front], L.FACE_INDEX.F, 'The edge must line up with the front centre');
    assert.equal(start[top], L.FACE_INDEX[recipe.id === 'right' ? 'R' : 'L']);
  }
});
