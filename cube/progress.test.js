/** Run with: node --test cube/progress.test.js */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('./solver.js');

const colours = ['white', 'red', 'green', 'yellow', 'orange', 'blue'];
const checkpoints = [
  { name: 'cross', alg: 'cornerInsert', completed: 1 },
  { name: 'first layer', alg: 'beltRight', completed: 2 },
  { name: 'first two layers', alg: 'yellowCross', completed: 3 },
  { name: 'top cross', alg: 'sune', completed: 4 },
  { name: 'top face', alg: 'cornerCycle', completed: 5 },
  { name: 'top corners', alg: 'edgeCycle', completed: 6 }
];

function orient(state, faceColours, seq) {
  for (const rot of seq) {
    state = C.rotateState(state, rot);
    faceColours = C.rotateFaces(faceColours, rot);
  }
  return { state, faceColours };
}

for (const checkpoint of checkpoints) {
  test('continues after the ' + checkpoint.name + ' in all 24 scan orientations', () => {
    // These setups have genuine completed layers, including matching side
    // centres. The original starting side is yellow, rather than white.
    const setup = C.inverse(C.ALGS[checkpoint.alg]).concat(checkpoint.completed === 1 ? ['U'] : []);
    const partial = C.applyMoves(C.solvedState(), setup);
    for (const scanOrientation of C.ORIENTATIONS) {
      const scanned = orient(partial, colours, scanOrientation);
      const original = new Int8Array(scanned.state), originalColours = scanned.faceColours.slice();
      const next = orient(scanned.state, scanned.faceColours,
        C.orientationForProgress(scanned.state));
      assert.equal(next.faceColours[C.FACE_INDEX.D], 'yellow');
      const result = C.solve(next.state);
      assert.equal(result.ok, true);
      assert.ok(result.stages.slice(0, checkpoint.completed).every(s => s.moves.length === 0),
        'Completed stages must not be taught again');
      assert.ok(result.stages[checkpoint.completed].moves.length > 0);
      assert.equal(C.isSolved(C.applyMoves(next.state, result.moves)), true);
      assert.deepEqual(scanned.state, original, 'Inspecting progress must not change scanned stickers');
      assert.deepEqual(scanned.faceColours, originalColours);
    }
  });
}

test('recognizes completed layers in every starting colour', () => {
  const partial = C.applyMoves(C.solvedState(), C.inverse(C.ALGS.yellowCross));
  const seen = new Set();
  for (const setup of C.ORIENTATIONS) {
    // Rotate the arrangement but keep this colour scheme, simulating a child
    // who chose a different starting colour on the same physical cube.
    const state = orient(partial, colours, setup).state;
    let faceMap = [0, 1, 2, 3, 4, 5];
    for (const rot of setup) faceMap = C.rotateFaces(faceMap, rot);
    const startingColour = colours[faceMap.indexOf(C.FACE_INDEX.D)];
    const chosen = orient(state, colours, C.orientationForProgress(state));
    assert.equal(chosen.faceColours[C.FACE_INDEX.D], startingColour);
    seen.add(startingColour);
    const result = C.solve(chosen.state);
    assert.equal(result.ok, true);
    assert.ok(result.stages.slice(0, 3).every(s => s.moves.length === 0));
    assert.equal(C.isSolved(C.applyMoves(chosen.state, result.moves)), true);
  }
  assert.equal(seen.size, 6);
});

test('a cube one turn from solved needs only that remaining turn', () => {
  for (const face of C.FACE_ORDER) for (const suffix of ['', "'", '2']) {
    const scanned = C.applyMoves(C.solvedState(), [face + suffix]);
    const chosen = orient(scanned, colours, C.orientationForProgress(scanned));
    const result = C.solve(chosen.state);
    assert.equal(result.ok, true);
    assert.equal(result.moves.length, 1);
    assert.equal(C.isSolved(C.applyMoves(chosen.state, result.moves)), true);
  }
});

test('an already solved cube has no remaining moves in any orientation', () => {
  for (const seq of C.ORIENTATIONS) {
    const scanned = orient(C.solvedState(), colours, seq);
    const chosen = orient(scanned.state, scanned.faceColours,
      C.orientationForProgress(scanned.state));
    const result = C.solve(chosen.state);
    assert.equal(result.ok, true);
    assert.equal(result.moves.length, 0);
  }
});

test('equal progress keeps the scanned orientation without a preferred colour', () => {
  for (const seq of C.ORIENTATIONS) {
    const scanned = orient(C.solvedState(), colours, seq);
    assert.deepEqual(C.orientationForProgress(scanned.state), []);
  }
  const partial = C.applyMoves(C.solvedState(), C.inverse(C.ALGS.cornerInsert));
  for (const seq of [[], ['y'], ["y'"], ['y', 'y']]) {
    const scanned = orient(partial, colours, seq);
    assert.deepEqual(C.orientationForProgress(scanned.state), [], 'Keep the current front face when it ties');
  }
});
