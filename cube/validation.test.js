/** Correction candidates must be honest, non-destructive and solvable. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const L = require('./solver.js');
const V = require('./validation.js');
const colours = ['white', 'red', 'green', 'yellow', 'orange', 'blue'];
const named = state => Array.from(state, i => colours[i]);
const solved = () => named(L.solvedState());
function cycle(names, piece, shift = 1) {
  const after = names.slice();
  piece.forEach((index, n) => { after[index] = names[piece[(n + shift) % piece.length]]; });
  return after;
}
function check(names, code) {
  const before = names.slice(), r = V.inspect(names);
  assert.equal(r.ok, false);
  assert.equal(r.code, code);
  assert.deepEqual(names, before, 'Diagnosis must not change entered colours');
  for (const s of r.suggestions) {
    assert.equal(V.assess(s.after).ok, true, 'Every proposed correction must pass all cube invariants');
    assert.ok(s.indices.length);
    assert.deepEqual(s.indices, before.flatMap((c, i) => c !== s.after[i] ? [i] : []));
    assert.ok(s.indices.every(i => s.pieces.some(p => p.includes(i))));
  }
  return r;
}
test('legal cubes, arbitrary centre colour assignments and rotations pass unchanged', () => {
  const remap = ['blue', 'yellow', 'orange', 'green', 'red', 'white'];
  for (let n = 0; n < 200; n++) {
    const state = L.applyMoves(L.solvedState(), L.randomScramble(30));
    const names = Array.from(state, i => remap[i]);
    const r = V.inspect(names);
    assert.equal(r.ok, true);
    assert.deepEqual(Array.from(r.state), Array.from(state));
  }
});
test('a twist or flip identifies an invariant, not a uniquely known erroneous piece', () => {
  for (const pieces of [L.CORNERS, L.EDGES]) for (const p of pieces) {
    const names = cycle(solved(), p), code = p.length === 3 ? 'twist' : 'flip';
    const report = check(names, code);
    assert.equal(report.suggestions.length, pieces.length, 'Any one piece could explain this invariant');
    assert.deepEqual(report.suggestions[0].after, solved(), 'Prefer the simplest visual match, without claiming certainty');
    assert.ok(report.suggestions.every(s => s.kind === code));
  }
});
test('every twist/flip preview on scrambled cubes is independently valid', () => {
  for (let n = 0; n < 30; n++) {
    const names = named(L.applyMoves(L.solvedState(), L.randomScramble(30)));
    for (const pieces of [L.CORNERS, L.EDGES]) {
      const p = pieces[n % pieces.length];
      const report = check(cycle(names, p), p.length === 3 ? 'twist' : 'flip');
      assert.ok(report.suggestions.some(s => s.after.every((c, i) => c === names[i])));
    }
  }
});
test('missing colours and duplicate centres have their own inline diagnoses', () => {
  const missing = solved(); missing[7] = null;
  assert.deepEqual(check(missing, 'missing').indices, [7]);
  const names = solved(); names[4] = names[13];
  const report = check(names, 'centres');
  assert.deepEqual(report.indices, [4, 13]);
  assert.deepEqual(report.suggestions[0].after, solved());
});
test('one or two mistyped colours offer only verified repaint corrections', () => {
  const names = solved(); names[0] = 'red';
  let r = check(names, 'count');
  assert.deepEqual(r.suggestions[0].after, solved());
  assert.equal(r.counts.find(c => c.colour === 'red').count, 10);
  names[1] = 'green'; r = check(names, 'count');
  assert.ok(r.suggestions.some(s => s.after.every((c, i) => c === solved()[i])));
});
test('mirrored corners are rejected even when colour counts and orientation sums match', () => {
  const names = solved(), p = L.CORNERS[0];
  [names[p[1]], names[p[2]]] = [names[p[2]], names[p[1]]];
  const r = check(names, 'corner-order');
  assert.ok(r.groups.some(group => group.join(',') === p.join(',')));
  assert.ok(r.suggestions.some(s => s.after.every((c, i) => c === solved()[i])));
});
test('a two-piece parity swap offers validated comparisons without claiming its cause', () => {
  const names = solved(), [p, q] = L.EDGES;
  p.forEach((index, n) => { [names[index], names[q[n]]] = [names[q[n]], names[index]]; });
  const report = check(names, 'parity');
  assert.ok(report.suggestions.some(s => s.after.every((c, i) => c === solved()[i])));
});
test('several simultaneous errors never produce an unverified automatic fix', () => {
  let names = cycle(solved(), L.CORNERS[0]);
  names = cycle(names, L.EDGES[1]);
  const report = check(names, 'twist');
  assert.equal(report.suggestions.length, 0);
  assert.equal(report.groups.length, 8);
  const many = solved(); [0, 1, 2, 3].forEach(i => { many[i] = 'red'; });
  assert.equal(check(many, 'count').suggestions.length, 0);
});
