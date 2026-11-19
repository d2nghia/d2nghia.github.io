/**
 * Solver checks. Run with: node cube/solver.test.js [count]
 *
 * The whole page rests on these two claims: the validator accepts exactly the
 * states a real cube can be in, and the solver finishes every one of them with
 * the moves the lesson teaches.
 */
const C = require('./solver.js');

const N = parseInt(process.argv[2] || '2000', 10);
let failures = 0;
function check(name, cond, extra) {
  if (!cond) { failures++; console.log('FAIL  ' + name + (extra ? '  ' + extra : '')); }
  else console.log('ok    ' + name);
}

const solved = C.solvedState();

/* model */
check('four U turns are a no-op', C.isSolved(C.applyMoves(solved, ['U', 'U', 'U', 'U'])));
check("(R U R' U') six times is a no-op", C.isSolved(C.applyMoves(solved, C.parse("R U R' U'").concat(
  C.parse("R U R' U'"), C.parse("R U R' U'"), C.parse("R U R' U'"), C.parse("R U R' U'"), C.parse("R U R' U'")))));

/* every taught last-layer algorithm must leave the first two layers finished */
function firstTwoLayersIntact(state) {
  return C.FACELETS.every(function (f, i) {
    if (f.face === 'U') return true;         // last layer is allowed to change
    if (f.row === 0) return true;            // top row of the side faces too
    return state[i] === C.FACE_INDEX[f.face];
  });
}
['yellowCross', 'sune', 'antiSune', 'cornerCycle', 'cornerCycle2', 'edgeCycle'].forEach(function (k) {
  check(k + ' keeps the first two layers', firstTwoLayersIntact(C.applyMoves(solved, C.ALGS[k])));
});

/* validator */
let falseNegatives = 0;
for (let i = 0; i < 500; i++) {
  if (!C.validate(C.applyMoves(solved, C.randomScramble(25))).ok) falseNegatives++;
}
check('validator accepts legal cubes', falseNegatives === 0, falseNegatives + ' rejected');

const twisted = Int8Array.from(solved);
[twisted[0], twisted[9], twisted[20]] = [twisted[9], twisted[20], twisted[0]]; // twist one corner
check('validator rejects a single twisted corner', !C.validate(twisted).ok);

const flipped = Int8Array.from(solved);
const e = C.EDGES.find(function (p) { return p.length === 2; });
[flipped[e[0]], flipped[e[1]]] = [flipped[e[1]], flipped[e[0]]];
check('validator rejects a single flipped edge', !C.validate(flipped).ok);

const miscount = Int8Array.from(solved);
miscount[0] = C.FACE_INDEX.R;
check('validator rejects a wrong colour count', !C.validate(miscount).ok);

/* solver */
let ok = 0, lens = [], worst = 0, errors = {};
for (let i = 0; i < N; i++) {
  const state = C.applyMoves(solved, C.randomScramble(30));
  const t = Date.now();
  const r = C.solve(state);
  worst = Math.max(worst, Date.now() - t);
  if (!r.ok) { errors[r.error] = (errors[r.error] || 0) + 1; continue; }
  if (!C.isSolved(C.applyMoves(state, r.moves))) { errors['moves do not solve'] = (errors['moves do not solve'] || 0) + 1; continue; }
  ok++;
  lens.push(r.moves.length);
}
lens.sort((a, b) => a - b);
check('solves ' + N + ' random cubes', ok === N, JSON.stringify(errors));
console.log('      moves: min ' + lens[0] + ', median ' + lens[Math.floor(lens.length / 2)] +
  ', max ' + lens[lens.length - 1] + '; slowest solve ' + worst + 'ms');

process.exit(failures ? 1 : 0);
