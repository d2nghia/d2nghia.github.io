const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('./solver.js');
const P = require('./progress.js');

function lesson(scramble) {
  const start = C.applyMoves(C.solvedState(), scramble), result = C.solve(start);
  assert.equal(result.ok, true);
  const moves = [], targets = [];
  for (const stage of result.stages) for (const move of stage.moves) {
    for (let i = 0; i < (move.endsWith('2') ? 2 : 1); i++) {
      moves.push(move.endsWith('2') ? move[0] : move);
      targets.push(stage.key);
    }
  }
  return { start, faceColour: ['white', 'red', 'green', 'yellow', 'orange', 'blue'], moves, targets, cursor: 0 };
}

test('progress links round-trip every step, including the halfway point of a double turn and Done', () => {
  for (const scramble of [[], ['U2'], C.parse('R U F L D B')]) {
    const session = lesson(scramble);
    for (let cursor = 0; cursor <= session.moves.length; cursor++) {
      const decoded = P.decode(P.encode(P.fromSession(session, cursor)));
      assert.equal(decoded.view, 'coach');
      assert.equal(decoded.session.cursor, cursor);
      assert.deepEqual(decoded.session.start, session.start);
      assert.deepEqual(decoded.session.faceColour, session.faceColour);
      assert.deepEqual(decoded.session.moves, session.moves);
      assert.deepEqual(decoded.session.targets, session.targets);
      assert.deepEqual(C.applyMoves(decoded.session.start, decoded.session.moves.slice(0, cursor)),
        C.applyMoves(session.start, session.moves.slice(0, cursor)));
    }
  }
});

test('links preserve the actual sticker colours in every colour orientation', () => {
  const session = lesson(C.parse("R U F'"));
  for (const sequence of C.ORIENTATIONS) {
    let colours = ['white', 'red', 'green', 'yellow', 'orange', 'blue'];
    for (const rotation of sequence) colours = C.rotateFaces(colours, rotation);
    session.faceColour = colours;
    const progress = P.fromSession(session, 1), hash = P.encode(progress), decoded = P.decode(hash);
    assert.deepEqual(decoded.names, progress.names);
    assert.deepEqual(decoded.session.faceColour, colours);
    assert.deepEqual(decoded.session.start, session.start);
    assert.ok(hash.length < 2000, 'A lesson should fit comfortably in a saved URL');
  }
});

test('capture and manual-editor links preserve blank, incomplete, and incorrectly entered colours', () => {
  const blank = Array(54).fill(null);
  const partial = blank.slice(); partial[0] = 'blue'; partial[17] = 'orange'; partial[50] = 'yellow';
  for (const view of ['capture', 'check']) for (const names of [blank, partial, Array(54).fill('red')]) {
    assert.deepEqual(P.decode(P.encode({ view, names })), { view, names });
  }
});

test('malformed, unsupported, impossible, or inconsistent lesson links are rejected', () => {
  const hash = P.encode(P.fromSession(lesson(['U2']), 1));
  function changed(key, value) {
    const params = new URLSearchParams(hash.slice(1));
    if (value === null) params.delete(key); else params.set(key, value);
    return '#' + params;
  }
  for (const [key, value] of [
    ['v', '2'], ['v', null], ['cube', 'x'.repeat(54)], ['cube', '.'.repeat(54)],
    ['cube', 'w'.repeat(54)], ['cube', 'w'.repeat(53)], ['view', 'unknown'],
    ['turns', 'U2'], ['turns', 'X'], ['turns', null], ['turns', 'U'.repeat(2049)],
    ['goals', '99'], ['goals', ''], ['goals', null],
    ['step', '0'], ['step', '-1'], ['step', '1.5'], ['step', 'NaN'], ['step', '4'], ['step', null]
  ]) assert.equal(P.decode(changed(key, value)), null, key + '=' + value);
  assert.equal(P.decode(hash + '&step=1'), null);
  const wrong = new URLSearchParams(hash.slice(1)); wrong.set('turns', 'RR');
  assert.equal(P.decode('#' + wrong), null, 'The saved path must actually solve the saved cube');
  const flipped = lesson(['U2']);
  const edge = C.EDGES[0];
  [flipped.start[edge[0]], flipped.start[edge[1]]] = [flipped.start[edge[1]], flipped.start[edge[0]]];
  assert.equal(P.decode(P.encode(P.fromSession(flipped))), null);
  for (const invalid of [null, undefined, {}, 1, '', '#', 'x'.repeat(10001)]) assert.equal(P.decode(invalid), null);
});
