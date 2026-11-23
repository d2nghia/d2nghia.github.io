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
    assert.match(compact, /^#p=[23]\.[A-Za-z0-9_-]+$/);
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
  for (const hash of [P.encode({ view: 'capture', names: Array(54).fill(null) }),
    P.encode(P.fromSession(lesson(['U2']), 1)), '#p=2.iSSSTtrbbZI222kkkkrbtts25JJAAQAgoUCi6g']) {
    const payload = hash.slice(5);
    for (let i = 0; i < payload.length; i++) {
      const modified = payload.slice(0, i) + alphabet[(alphabet.indexOf(payload[i]) + 1) % 64] + payload.slice(i + 1);
      assert.equal(P.decode(hash.slice(0, 5) + modified), null, 'Corruption at character ' + i + ' must be detected');
    }
    for (const invalid of [hash.slice(0, -1), hash + 'A', hash + '=', hash + '&p=2.AAAA',
      hash + '&v=1', hash.replace(/^#p=\d\./, '#p=4.'), '#p=3.' + 'A'.repeat(2501)]) {
      assert.equal(P.decode(invalid), null);
    }
  }
  const wrong = lesson(['U2']); wrong.moves = ['R', 'R'];
  assert.equal(P.decode(P.encode(P.fromSession(wrong))), null, 'A valid checksum cannot make an incorrect solution valid');
  for (const invalid of ['#p=', '#p=2.', '#p=2.A', '#p=2.@@@', '#p=2./+==']) assert.equal(P.decode(invalid), null);
});

test('existing version 2 links remain readable and migrate to compressed links', () => {
  // Fixed fixtures produced by the released v2 encoder, independent of v3.
  const records = [
    [{ view: 'capture', names: Array(54).fill(null) }, '#p=2.AAAAAAAAAAAAAAAAAAAAAAAAAAAAN9k'],
    [{ view: 'check', names: Array(54).fill('orange') }, '#p=2.dttttttttttttttttttttttttttg_Fs'],
    [P.fromSession(lesson(['U2']), 1), '#p=2.iSSSTtrbbZI222kkkkrbtts25JJAAQAgoUCi6g']
  ];
  for (const [record, hash] of records) {
    assert.deepEqual(P.decode(hash), P.decode(legacy(record)));
    assert.match(P.encode(P.decode(hash)), /^#p=3\./);
    assert.deepEqual(P.decode(P.encode(P.decode(hash))), P.decode(hash));
  }
});

test('compression reduces repeated colours and complete lessons beyond the bit-packed v2 format', () => {
  function packedLength(record) {
    const bits = 164 + (record.session ? 24 + record.session.moves.length * 7 : 0);
    return 5 + Math.ceil((Math.ceil(bits / 8) + 2) * 8 / 6);
  }
  for (const names of [Array(54).fill(null), Array(54).fill('red'),
    Array.from(C.solvedState(), n => ['white', 'red', 'green', 'yellow', 'orange', 'blue'][n])]) {
    const record = { view: 'capture', names };
    assert.ok(P.encode(record).length < packedLength(record) * 0.6);
    assert.deepEqual(P.decode(P.encode(record)), record);
  }
  const record = P.fromSession(lesson(C.parse('R U F L D B')), 20);
  assert.ok(P.encode(record).length < packedLength(record) * 0.65);
  // Deterministic samples cover unrelated scrambles, stages, colour runs, and
  // LZ references. Compression must never expand the released packed format.
  let seed = 48271;
  function random(max) { seed = (seed * 16807) % 2147483647; return seed % max; }
  const turns = ['U', "U'", 'U2', 'R', "R'", 'R2', 'F', "F'", 'F2',
    'D', "D'", 'D2', 'L', "L'", 'L2', 'B', "B'", 'B2'];
  let oldTotal = 0, newTotal = 0, rawFallbacks = 0;
  for (let i = 0; i < 100; i++) {
    const s = lesson(Array.from({ length: 20 }, () => turns[random(turns.length)]));
    const progress = P.fromSession(s, random(s.moves.length + 1)), hash = P.encode(progress);
    assert.ok(hash.length <= packedLength(progress));
    assert.deepEqual(P.decode(hash), P.decode(legacy(progress)));
    oldTotal += packedLength(progress); newTotal += hash.length;
    const capture = { view: i % 2 ? 'check' : 'capture', names: Array.from({ length: 54 },
      () => [null, 'white', 'yellow', 'green', 'blue', 'red', 'orange'][random(7)]) };
    const captureHash = P.encode(capture);
    if (captureHash.startsWith('#p=2.')) rawFallbacks++;
    assert.ok(captureHash.length <= packedLength(capture));
    assert.deepEqual(P.decode(captureHash), capture);
  }
  assert.ok(rawFallbacks > 0, 'Incompressible colours should use the smaller v2 format');
  assert.ok(newTotal < oldTotal * 0.7, newTotal + ' vs ' + oldTotal);
});

test('compressed lessons preserve overlapping references, arbitrary stage changes, and the maximum step count', () => {
  const s = lesson([]);
  s.moves = Array(2048).fill('U');
  for (const targets of [Array(2048).fill('cross'), Array.from({ length: 2048 }, (_, i) => GOALS[i % 7])]) {
    s.targets = targets;
    for (const cursor of [0, 1, 1024, 2048]) {
      const record = P.fromSession(s, cursor), hash = P.encode(record);
      assert.match(hash, /^#p=3\./);
      assert.deepEqual(P.decode(hash), P.decode(legacy(record)));
    }
  }
});

test('compressed links reject invalid runs, references, modes, centres, and step counts even with a valid checksum', () => {
  function payload(fields) {
    const bits = fields.map(([value, width]) => value.toString(2).padStart(width, '0')).join('');
    const padded = bits.padEnd(Math.ceil(bits.length / 8) * 8, '0');
    const bytes = Array.from({ length: padded.length / 8 }, (_, i) => parseInt(padded.slice(i * 8, i * 8 + 8), 2));
    let crc = 65535;
    for (const byte of bytes) {
      crc ^= byte << 8;
      for (let i = 0; i < 8; i++) crc = ((crc << 1) ^ (crc & 32768 ? 4129 : 0)) & 65535;
    }
    return '#p=3.' + Buffer.from([...bytes, crc >> 8, crc & 255]).toString('base64url');
  }
  const coach = [[2, 2], ...[1, 5, 3, 2, 6, 4].map(n => [n, 3])];
  const invalid = [
    [[3, 2]], // Unknown screen.
    [[0, 2], [3, 2]], // Unknown colour compression.
    [[0, 2], [0, 2], [7, 3]], // Unknown colour.
    [[0, 2], [1, 2], [1, 3], [55, 11]], // A run beyond the last sticker.
    [[0, 2], [2, 2], [1, 1], [1, 1], [1, 1]], // Reference before any literal.
    [[0, 2], [1, 2], [1, 3], [0, 12]], // Oversized gamma integer.
    [[2, 2], ...[1, 1, 3, 2, 6, 4].map(n => [n, 3])], // Duplicate centres.
    [[2, 2], ...[0, 5, 3, 2, 6, 4].map(n => [n, 3])], // Blank centre.
    [...coach, [2, 12], [1, 12]], // Cursor after Done.
    [...coach, [0, 12], [2049, 12]], // Too many moves.
    [...coach, [0, 12], [1, 12], [0, 2], [15, 4]], // Unknown move.
    [...coach, [0, 12], [0, 12], [0, 2], [3, 2]], // Unknown goal compression.
    [...coach, [0, 12], [0, 12], [0, 2], [0, 2], [1, 1]] // Nonzero final padding.
  ];
  for (const fields of invalid) assert.equal(P.decode(payload(fields)), null, JSON.stringify(fields));
});
