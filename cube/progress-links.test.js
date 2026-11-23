const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('./solver.js');
const P = require('./progress.js');
const GOALS = ['cross', 'corners', 'belt', 'yellowCross', 'yellowFace', 'cornerPlace', 'lastEdges'];

function legacy(progress) {
  const params = new URLSearchParams({ v: '1', cube: progress.names.map(n => n ? n[0] : '.').join(''), view: progress.view });
  if (progress.session) {
    const s = progress.session;
    params.set('step', s.cursor + 1);
    params.set('turns', s.moves.map(m => m.length === 1 ? m : m[0].toLowerCase()).join(''));
    params.set('goals', s.targets.map(key => GOALS.indexOf(key)).join(''));
  }
  return '#' + params;
}

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
  const hash = legacy(P.fromSession(lesson(['U2']), 1));
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

test('compact links use URL-safe Base64 and are substantially shorter than the previous format', () => {
  const records = [
    { view: 'capture', names: Array(54).fill(null) },
    { view: 'check', names: Array.from({ length: 54 }, (_, i) => ['white', 'blue', null][i % 3]) },
    P.fromSession(lesson([])), P.fromSession(lesson(['U2']), 1),
    P.fromSession(lesson(C.parse('R U F L D B')), 20)
  ];
  for (const record of records) {
    const compact = P.encode(record), old = legacy(record);
    assert.match(compact, /^#p=2\.[A-Za-z0-9_-]+$/);
    assert.ok(compact.length < old.length * 0.65, compact.length + ' vs ' + old.length);
    assert.deepEqual(P.decode(compact), P.decode(old), 'Both formats must restore exactly the same progress');
  }
});

test('all existing version 1 link types remain readable and can be converted to Base64 without data loss', () => {
  const records = [
    { view: 'capture', names: Array(54).fill(null) },
    { view: 'check', names: Array(54).fill('orange') },
    P.fromSession(lesson(['U2']), 1), P.fromSession(lesson(['U2']), 2)
  ];
  for (const record of records) {
    const decoded = P.decode(legacy(record));
    assert.ok(decoded);
    assert.deepEqual(P.decode(P.encode(decoded)), decoded);
  }
});

test('compact links reject damaged, truncated, noncanonical, oversized, and unsupported payloads', () => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  for (const progress of [{ view: 'capture', names: Array(54).fill(null) }, P.fromSession(lesson(['U2']), 1)]) {
    const hash = P.encode(progress), payload = hash.slice(5);
    for (let i = 0; i < payload.length; i++) {
      const modified = payload.slice(0, i) + alphabet[(alphabet.indexOf(payload[i]) + 1) % 64] + payload.slice(i + 1);
      assert.equal(P.decode('#p=2.' + modified), null, 'Corruption at character ' + i + ' must be detected');
    }
    for (const invalid of [hash.slice(0, -1), hash + 'A', hash + '=', hash + '&p=2.AAAA',
      hash + '&v=1', hash.replace('#p=2.', '#p=3.'), '#p=2.' + 'A'.repeat(2501)]) {
      assert.equal(P.decode(invalid), null);
    }
  }
  const wrong = lesson(['U2']); wrong.moves = ['R', 'R'];
  assert.equal(P.decode(P.encode(P.fromSession(wrong))), null, 'A valid checksum cannot make an incorrect solution valid');
  for (const invalid of ['#p=', '#p=2.', '#p=2.A', '#p=2.@@@', '#p=2./+==']) assert.equal(P.decode(invalid), null);
});
