/**
 * Cube model + beginner-method solver.
 *
 * The solver deliberately returns the moves a beginner is taught, not the
 * shortest solution: every stage searches over the handful of algorithms the
 * lesson introduces, so the page can always say "do the move you just learned".
 *
 * Works in the browser (window.CubeLib) and in Node (module.exports).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CubeLib = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var FACE_ORDER = ['U', 'R', 'F', 'D', 'L', 'B'];
  var FACE_INDEX = { U: 0, R: 1, F: 2, D: 3, L: 4, B: 5 };
  var NORMAL = { U: [0, 1, 0], D: [0, -1, 0], R: [1, 0, 0], L: [-1, 0, 0], F: [0, 0, 1], B: [0, 0, -1] };

  /** Model space: x right, y up, z toward the viewer. */
  function rotVec(v, axis, d) {
    var x = v[0], y = v[1], z = v[2], s = -d;
    if (axis === 'x') return [x, -z * s, y * s];
    if (axis === 'y') return [z * s, y, -x * s];
    return [-y * s, x * s, z];
  }
  function labelOf(v) {
    for (var k in NORMAL) {
      var n = NORMAL[k];
      if (n[0] === v[0] && n[1] === v[1] && n[2] === v[2]) return k;
    }
    return null;
  }

  /**
   * Facelet order follows the usual convention: U, R, F, D, L, B, nine each,
   * read row by row as seen looking straight at the face, with U at the top of
   * the view for R/F/L/B, B at the top for U, and F at the top for D.
   */
  function gridPos(face, r, c) {
    switch (face) {
      case 'U': return [-1 + c, 1, -1 + r];
      case 'D': return [-1 + c, -1, 1 - r];
      case 'F': return [-1 + c, 1 - r, 1];
      case 'B': return [1 - c, 1 - r, -1];
      case 'R': return [1, 1 - r, 1 - c];
      default: return [-1, 1 - r, -1 + c];
    }
  }

  var FACELETS = [];
  var INDEX = {};
  function keyOf(pos, face) { return pos[0] + ',' + pos[1] + ',' + pos[2] + '|' + face; }
  FACE_ORDER.forEach(function (face) {
    for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) {
      var pos = gridPos(face, r, c);
      INDEX[keyOf(pos, face)] = FACELETS.length;
      FACELETS.push({ pos: pos, face: face, row: r, col: c });
    }
  });

  var SOLVED = new Int8Array(54);
  FACELETS.forEach(function (f, i) { SOLVED[i] = FACE_INDEX[f.face]; });

  function permute(axis, layer, d, whole) {
    var perm = new Int8Array(54);
    for (var i = 0; i < 54; i++) perm[i] = i;
    for (i = 0; i < 54; i++) {
      var f = FACELETS[i];
      var coord = axis === 'x' ? f.pos[0] : axis === 'y' ? f.pos[1] : f.pos[2];
      if (!whole && coord !== layer) continue;
      var np = rotVec(f.pos, axis, d);
      var nf = labelOf(rotVec(NORMAL[f.face], axis, d));
      perm[INDEX[keyOf(np, nf)]] = i;
    }
    return perm;
  }
  function compose(a, b) { // apply a, then b
    var out = new Int8Array(54);
    for (var i = 0; i < 54; i++) out[i] = a[b[i]];
    return out;
  }
  function applyPerm(state, perm, out) {
    out = out || new Int8Array(54);
    for (var i = 0; i < 54; i++) out[i] = state[perm[i]];
    return out;
  }

  var BASE = {
    U: permute('y', 1, 1), D: permute('y', -1, -1),
    R: permute('x', 1, 1), L: permute('x', -1, -1),
    F: permute('z', 1, 1), B: permute('z', -1, -1)
  };
  var MOVES = {};
  Object.keys(BASE).forEach(function (m) {
    MOVES[m] = BASE[m];
    MOVES[m + "2"] = compose(BASE[m], BASE[m]);
    MOVES[m + "'"] = compose(MOVES[m + "2"], BASE[m]);
  });
  var ALL_MOVES = Object.keys(MOVES);
  /** Whole-cube reorientations, for putting a captured cube into a known pose. */
  var ROT = {
    x: permute('x', 0, 1, true), y: permute('y', 0, 1, true), z: permute('z', 0, 1, true)
  };
  ROT["x'"] = compose(compose(ROT.x, ROT.x), ROT.x);
  ROT["y'"] = compose(compose(ROT.y, ROT.y), ROT.y);
  ROT["z'"] = compose(compose(ROT.z, ROT.z), ROT.z);

  function seqPerm(moves) {
    var p = new Int8Array(54);
    for (var i = 0; i < 54; i++) p[i] = i;
    moves.forEach(function (m) { p = compose(p, MOVES[m]); });
    return p;
  }
  function parse(s) { return s.trim().split(/\s+/).filter(Boolean); }

  /* ---------------- pieces ---------------- */
  var CORNERS = [], EDGES = [];
  (function () {
    var byPos = {};
    FACELETS.forEach(function (f, i) {
      var k = f.pos.join(',');
      (byPos[k] = byPos[k] || []).push(i);
    });
    Object.keys(byPos).forEach(function (k) {
      var idx = byPos[k];
      if (idx.length === 3) CORNERS.push(orderCorner(idx));
      else if (idx.length === 2) EDGES.push(idx);
    });
    /**
     * Corner orientation only adds up to a legal total if every corner's three
     * facelets are listed turning the same way around the piece, so force a
     * right-handed triple.
     */
    function orderCorner(idx) {
      var n = idx.map(function (i) { return NORMAL[FACELETS[i].face]; });
      var det = n[0][0] * (n[1][1] * n[2][2] - n[1][2] * n[2][1])
        - n[0][1] * (n[1][0] * n[2][2] - n[1][2] * n[2][0])
        + n[0][2] * (n[1][0] * n[2][1] - n[1][1] * n[2][0]);
      return det > 0 ? idx : [idx[0], idx[2], idx[1]];
    }
  })();

  function homeLabels(piece) { return piece.map(function (i) { return SOLVED[i]; }); }
  function pieceSolved(state, piece) {
    for (var i = 0; i < piece.length; i++) if (state[piece[i]] !== SOLVED[piece[i]]) return false;
    return true;
  }
  function pieceColors(state, piece) {
    return piece.map(function (i) { return state[i]; }).sort().join(',');
  }
  function homeKey(piece) { return homeLabels(piece).slice().sort().join(','); }

  var D_EDGES = EDGES.filter(function (p) { return homeLabels(p).indexOf(FACE_INDEX.D) >= 0; });
  var D_CORNERS = CORNERS.filter(function (p) { return homeLabels(p).indexOf(FACE_INDEX.D) >= 0; });
  var BELT_EDGES = EDGES.filter(function (p) {
    var h = homeLabels(p);
    return h.indexOf(FACE_INDEX.D) < 0 && h.indexOf(FACE_INDEX.U) < 0;
  });
  var U_EDGES = EDGES.filter(function (p) { return homeLabels(p).indexOf(FACE_INDEX.U) >= 0; });
  var U_CORNERS = CORNERS.filter(function (p) { return homeLabels(p).indexOf(FACE_INDEX.U) >= 0; });
  var U_FACELETS = [];
  FACELETS.forEach(function (f, i) { if (f.face === 'U') U_FACELETS.push(i); });

  /* ---------------- taught algorithms ----------------
   * Each is expressed for one slot and conjugated to the others by whole-cube
   * y turns, which is what a kid does physically ("turn the cube so the gap is
   * on your right").
   */
  var SLOTS = ['FR', 'RB', 'BL', 'LF'];
  function rotateMoves(moves, quarters) {
    // y rotation maps R->B->L->F->R for the purposes of rewriting an algorithm
    var ring = ['R', 'B', 'L', 'F'];
    return moves.map(function (m) {
      var face = m[0], rest = m.slice(1);
      var k = ring.indexOf(face);
      if (k < 0) return m; // U and D are unaffected
      return ring[(k + quarters) % 4] + rest;
    });
  }
  var ALGS = {
    cornerInsert: parse("R U R' U'"),
    beltRight: parse("U R U' R' U' F' U F"),
    beltLeft: parse("U' L' U L U F U' F'"),
    yellowCross: parse("F R U R' U' F'"),
    sune: parse("R U R' U R U2 R'"),
    antiSune: parse("R U2 R' U' R U' R'"),
    cornerCycle: parse("R' F R' B2 R F' R' B2 R2"),
    cornerCycle2: parse("R B' R F2 R' B R F2 R2"),
    edgeCycle: parse("R U' R U R U R U' R' U' R2")
  };
  function inverse(moves) {
    return moves.slice().reverse().map(function (m) {
      if (m.length === 1) return m + "'";
      if (m[1] === '2') return m;
      return m[0];
    });
  }

  /* ---------------- search ---------------- */
  function Buf(n) {
    var a = [];
    for (var i = 0; i <= n; i++) a.push(new Int8Array(54));
    return a;
  }
  function faceOf(move) { return move[0]; }
  var OPPOSITE = { U: 'D', D: 'U', R: 'L', L: 'R', F: 'B', B: 'F' };

  /** Iterative-deepening search over raw moves (used only for the first cross). */
  function searchRaw(state, isGoal, maxDepth) {
    var bufs = Buf(maxDepth + 1), path = [];
    bufs[0].set(state);
    for (var limit = 0; limit <= maxDepth; limit++) {
      if (dfs(0, limit, null)) return path.slice(0, limit);
    }
    return null;
    function dfs(depth, limit, prevFace) {
      if (depth === limit) return isGoal(bufs[depth]);
      for (var i = 0; i < ALL_MOVES.length; i++) {
        var m = ALL_MOVES[i], f = faceOf(m);
        if (prevFace) {
          if (f === prevFace) continue;
          if (OPPOSITE[f] === prevFace && FACE_INDEX[f] > FACE_INDEX[prevFace]) continue;
        }
        applyPerm(bufs[depth], MOVES[m], bufs[depth + 1]);
        path[depth] = m;
        if (dfs(depth + 1, limit, f)) return true;
      }
      return false;
    }
  }

  /** Iterative-deepening search over whole algorithms ("macros"). */
  function searchMacros(state, macros, isGoal, maxDepth) {
    var bufs = Buf(maxDepth + 1), path = [];
    bufs[0].set(state);
    for (var limit = 0; limit <= maxDepth; limit++) {
      if (dfs(0, limit)) {
        return path.slice(0, pathLen).map(function (k) { return macros[k]; });
      }
    }
    return null;
    var pathLen;
    function dfs(depth, limit) {
      if (depth === limit) { pathLen = depth; return isGoal(bufs[depth]); }
      for (var i = 0; i < macros.length; i++) {
        applyPerm(bufs[depth], macros[i].perm, bufs[depth + 1]);
        path[depth] = i;
        if (dfs(depth + 1, limit)) return true;
      }
      return false;
    }
  }

  function macro(name, moves, label) {
    return { name: name, moves: moves, perm: seqPerm(moves), label: label || name };
  }
  function uMacros() {
    return [macro('U', ['U']), macro("U'", ["U'"]), macro('U2', ['U2'])];
  }

  /* ---------------- stages ---------------- */
  function solvedCount(state, pieces) {
    var n = 0;
    pieces.forEach(function (p) { if (pieceSolved(state, p)) n++; });
    return n;
  }
  function allSolved(state, pieces) { return solvedCount(state, pieces) === pieces.length; }

  function stageCross(state, out) {
    var guard = 0;
    while (!allSolved(state, D_EDGES) && guard++ < 8) {
      var before = solvedCount(state, D_EDGES);
      var moves = searchRaw(state, function (s) { return solvedCount(s, D_EDGES) > before; }, 6);
      if (!moves) return false;
      push(state, out, moves, 'cross');
    }
    return allSolved(state, D_EDGES);
  }

  function stageCorners(state, out) {
    /**
     * Three short insertions cover every case a kid will see; the repeated
     * "R U R' U'" is kept as a fallback because that is what tutorials teach
     * when the corner is stuck in the bottom layer the wrong way round.
     */
    var macros = uMacros();
    SLOTS.forEach(function (slot, q) {
      macros.push(macro('insertRight' + slot, rotateMoves(parse("R U R'"), q), 'corner insert'));
      macros.push(macro('insertFront' + slot, rotateMoves(parse("F' U' F"), q), 'corner insert'));
      macros.push(macro('insertTop' + slot, rotateMoves(parse("R U2 R' U' R U R'"), q), 'corner insert'));
      var base = rotateMoves(ALGS.cornerInsert, q), seq = [];
      for (var k = 1; k <= 6; k++) {
        seq = seq.concat(base);
        macros.push(macro('kick' + slot + 'x' + k, seq.slice(), 'corner insert'));
      }
    });
    macros.sort(function (a, b) { return a.moves.length - b.moves.length; });
    var guard = 0;
    while (!allSolved(state, D_CORNERS) && guard++ < 8) {
      var before = solvedCount(state, D_CORNERS);
      var sol = searchMacros(state, macros, function (s) {
        return solvedCount(s, D_CORNERS) > before && allSolved(s, D_EDGES);
      }, 3);
      if (!sol) return false;
      sol.forEach(function (m) { push(state, out, m.moves, 'corners'); });
    }
    return true;
  }

  function stageBelt(state, out) {
    var macros = uMacros();
    SLOTS.forEach(function (slot, q) {
      macros.push(macro('beltR' + slot, rotateMoves(ALGS.beltRight, q), 'belt insert'));
      macros.push(macro('beltL' + slot, rotateMoves(ALGS.beltLeft, q), 'belt insert'));
    });
    macros.sort(function (a, b) { return a.moves.length - b.moves.length; });
    var guard = 0;
    while (!allSolved(state, BELT_EDGES) && guard++ < 8) {
      var before = solvedCount(state, BELT_EDGES);
      var sol = searchMacros(state, macros, function (s) {
        return solvedCount(s, BELT_EDGES) > before && allSolved(s, D_EDGES) && allSolved(s, D_CORNERS);
      }, 4);
      if (!sol) return false;
      sol.forEach(function (m) { push(state, out, m.moves, 'belt'); });
    }
    return true;
  }

  function yellowCrossDone(state) {
    for (var i = 0; i < U_FACELETS.length; i++) {
      var f = FACELETS[U_FACELETS[i]];
      if (f.row === 1 && f.col === 1) continue;
      if ((f.row === 1) !== (f.col === 1)) { // edge facelet
        if (state[U_FACELETS[i]] !== FACE_INDEX.U) return false;
      }
    }
    return true;
  }

  function stageYellowCross(state, out) {
    var macros = uMacros().concat([macro('yellowCross', ALGS.yellowCross, 'yellow cross')]);
    if (yellowCrossDone(state)) return true;
    var sol = searchMacros(state, macros, yellowCrossDone, 6);
    if (!sol) return false;
    sol.forEach(function (m) { push(state, out, m.moves, 'yellowCross'); });
    return true;
  }

  function cornersOriented(state) {
    for (var i = 0; i < U_CORNERS.length; i++) {
      var piece = U_CORNERS[i];
      for (var j = 0; j < 3; j++) {
        if (FACELETS[piece[j]].face === 'U' && state[piece[j]] !== FACE_INDEX.U) return false;
      }
    }
    return true;
  }

  /** Stage 5: make the whole top face one colour. */
  function stageYellowFace(state, out) {
    var macros = uMacros().concat([
      macro('sune', ALGS.sune, 'fish move'),
      macro('antiSune', ALGS.antiSune, 'fish move')
    ]);
    if (cornersOriented(state)) return true;
    var sol = searchMacros(state, macros, cornersOriented, 5);
    if (!sol) return false;
    sol.forEach(function (m) { push(state, out, m.moves, 'yellowFace'); });
    return true;
  }

  /** Stage 6: send the top corners to their own seats (orientation already done). */
  function stageCornerPlace(state, out) {
    var macros = uMacros().concat([
      macro('cornerCycle', ALGS.cornerCycle, 'corner cycle'),
      macro('cornerCycle2', ALGS.cornerCycle2, 'corner cycle')
    ]);
    var goal = function (s) { return allSolved(s, U_CORNERS); };
    if (goal(state)) return true;
    var sol = searchMacros(state, macros, goal, 4);
    if (!sol) return false;
    sol.forEach(function (m) { push(state, out, m.moves, 'cornerPlace'); });
    return true;
  }

  /** Stage 7: slide the last four edges round until the cube is finished. */
  function stageLastEdges(state, out) {
    var macros = uMacros().concat([
      macro('edgeCycle', ALGS.edgeCycle, 'edge cycle'),
      macro("edgeCycle'", inverse(ALGS.edgeCycle), 'edge cycle')
    ]);
    if (isSolved(state)) return true;
    var sol = searchMacros(state, macros, isSolved, 4);
    if (!sol) return false;
    sol.forEach(function (m) { push(state, out, m.moves, 'lastEdges'); });
    return true;
  }

  function push(state, out, moves, stage) {
    var buf = new Int8Array(54);
    moves.forEach(function (m) {
      applyPerm(state, MOVES[m], buf);
      state.set(buf);
      out.push({ move: m, stage: stage });
    });
  }

  function isSolved(state) {
    for (var i = 0; i < 54; i++) if (state[i] !== SOLVED[i]) return false;
    return true;
  }

  var STAGE_PIPELINE = [
    { key: 'cross', fn: stageCross },
    { key: 'corners', fn: stageCorners },
    { key: 'belt', fn: stageBelt },
    { key: 'yellowCross', fn: stageYellowCross },
    { key: 'yellowFace', fn: stageYellowFace },
    { key: 'cornerPlace', fn: stageCornerPlace },
    { key: 'lastEdges', fn: stageLastEdges }
  ];

  /**
   * Solve a cube state, returning the moves grouped into the lesson's stages.
   * @param {Int8Array|Array} state 54 face indices in URFDLB order
   * @returns {{ok:boolean, stages:Array, moves:Array, error:string|undefined}}
   */
  function solve(state) {
    var work = new Int8Array(54);
    work.set(state);
    var moves = [], stages = [];
    for (var i = 0; i < STAGE_PIPELINE.length; i++) {
      var st = STAGE_PIPELINE[i], from = moves.length;
      if (!st.fn(work, moves)) return { ok: false, error: 'stuck at ' + st.key, stages: stages, moves: moves };
      stages.push({ key: st.key, moves: moves.slice(from).map(function (m) { return m.move; }) });
    }
    if (!isSolved(work)) return { ok: false, error: 'not solved', stages: stages, moves: moves };
    return { ok: true, stages: stages, moves: moves.map(function (m) { return m.move; }) };
  }

  /* ---------------- validation ---------------- */
  var CORNER_HOMES = CORNERS.map(homeKey);
  var EDGE_HOMES = EDGES.map(homeKey);

  /**
   * Check that 54 stickers describe a cube that can physically exist and be
   * solved. Returns {ok, error, hint} where hint names what to look at.
   */
  function validate(state) {
    var counts = [0, 0, 0, 0, 0, 0], i;
    for (i = 0; i < 54; i++) {
      if (state[i] == null || state[i] < 0) return { ok: false, error: 'missing', hint: 'Some stickers have no colour yet.' };
      counts[state[i]]++;
    }
    for (i = 0; i < 6; i++) {
      if (counts[i] !== 9) {
        return {
          ok: false, error: 'count',
          hint: 'There should be exactly 9 of each colour. ' + FACE_ORDER[i] + '-side colour has ' + counts[i] + '.'
        };
      }
    }
    for (i = 0; i < 6; i++) {
      if (state[i * 9 + 4] !== i) return { ok: false, error: 'centre', hint: 'The middle stickers look wrong.' };
    }
    var seen = {};
    for (i = 0; i < CORNERS.length; i++) {
      var ck = pieceColors(state, CORNERS[i]);
      if (CORNER_HOMES.indexOf(ck) < 0) return { ok: false, error: 'corner', hint: 'One corner has a colour mix that cannot exist.' };
      if (seen['c' + ck]) return { ok: false, error: 'corner-dup', hint: 'Two corners look like the same piece.' };
      seen['c' + ck] = 1;
      var cornerHome = homeLabels(CORNERS[CORNER_HOMES.indexOf(ck)]);
      if (![0, 1, 2].some(function (shift) {
        return CORNERS[i].every(function (index, n) { return state[index] === cornerHome[(n + shift) % 3]; });
      })) return { ok: false, error: 'corner-order', hint: 'A corner has its stickers in a mirrored order — compare its three colours with your real cube.' };
    }
    for (i = 0; i < EDGES.length; i++) {
      var ek = pieceColors(state, EDGES[i]);
      if (EDGE_HOMES.indexOf(ek) < 0) return { ok: false, error: 'edge', hint: 'One edge has a colour mix that cannot exist.' };
      if (seen['e' + ek]) return { ok: false, error: 'edge-dup', hint: 'Two edges look like the same piece.' };
      seen['e' + ek] = 1;
    }
    var p = parityCheck(state);
    if (!p.ok) return p;
    return { ok: true };
  }

  function parityCheck(state) {
    // corner twist: the sum of corner rotations must be a multiple of 3
    var twist = 0, i, j;
    for (i = 0; i < CORNERS.length; i++) {
      var piece = CORNERS[i], labels = piece.map(function (k) { return state[k]; });
      var up = labels.indexOf(FACE_INDEX.U), down = labels.indexOf(FACE_INDEX.D);
      var axisFacelet = up >= 0 ? up : down;
      if (axisFacelet < 0) return { ok: false, error: 'corner-axis', hint: 'A corner is missing its top or bottom colour.' };
      var homeIdx = -1, home = homeLabels(piece);
      for (j = 0; j < 3; j++) if (home[j] === FACE_INDEX.U || home[j] === FACE_INDEX.D) homeIdx = j;
      twist += (axisFacelet - homeIdx + 3) % 3;
    }
    if (twist % 3 !== 0) return { ok: false, error: 'twist', hint: 'One corner looks twisted in place — check its three stickers.' };

    // edge flip: each edge must be flipped an even number of times in total
    var flip = 0;
    for (i = 0; i < EDGES.length; i++) {
      var e = EDGES[i], l = [state[e[0]], state[e[1]]], h = homeLabels(e);
      var refSlot = refIndex(h);          // which half of this slot counts as "upright"
      var refColor = l[refIndex(l)];      // the piece's own upright colour
      if (l[refSlot] !== refColor) flip++;
    }
    if (flip % 2 !== 0) return { ok: false, error: 'flip', hint: 'One edge looks flipped in place — check its two stickers.' };

    // permutation parity of corners and edges must match
    var cp = permParity(CORNERS, CORNER_HOMES, state);
    var ep = permParity(EDGES, EDGE_HOMES, state);
    if (cp !== ep) return { ok: false, error: 'parity', hint: 'Two pieces look swapped — that cannot happen on a real cube, so a sticker is probably mis-read.' };
    return { ok: true };
  }

  /** Edge orientation is measured against the U/D sticker, or F/B for the middle slice. */
  function refIndex(labels) {
    var order = [FACE_INDEX.U, FACE_INDEX.D, FACE_INDEX.F, FACE_INDEX.B];
    for (var k = 0; k < order.length; k++) {
      var at = labels.indexOf(order[k]);
      if (at >= 0) return at;
    }
    return 0;
  }

  function permParity(pieces, homes, state) {
    var perm = pieces.map(function (p) { return homes.indexOf(pieceColors(state, p)); });
    var seen = new Array(perm.length).fill(false), swaps = 0;
    for (var i = 0; i < perm.length; i++) {
      if (seen[i]) continue;
      var len = 0, j = i;
      while (!seen[j]) { seen[j] = true; j = perm[j]; len++; }
      swaps += len - 1;
    }
    return swaps % 2;
  }

  /* ---------------- helpers for the page ---------------- */
  function fromFaceString(s) {
    var out = new Int8Array(54);
    for (var i = 0; i < 54; i++) out[i] = FACE_INDEX[s[i]];
    return out;
  }
  function toFaceString(state) {
    var s = '';
    for (var i = 0; i < 54; i++) s += FACE_ORDER[state[i]];
    return s;
  }
  function solvedState() { var s = new Int8Array(54); s.set(SOLVED); return s; }

  /* ---------------- whole-cube reorientation ----------------
   * Turning the whole cube moves the stickers and renames the faces at the same
   * time, so the labels have to be remapped too or the target would move with
   * them.
   */
  var ROT_FACE = {};
  [['x', 'x', 1], ["x'", 'x', -1], ['y', 'y', 1], ["y'", 'y', -1], ['z', 'z', 1], ["z'", 'z', -1]]
    .forEach(function (r) {
      var map = new Int8Array(6);
      FACE_ORDER.forEach(function (f) {
        map[FACE_INDEX[f]] = FACE_INDEX[labelOf(rotVec(NORMAL[f], r[1], r[2]))];
      });
      ROT_FACE[r[0]] = map;
    });

  function rotateState(state, name) {
    var perm = ROT[name], map = ROT_FACE[name], out = new Int8Array(54);
    for (var i = 0; i < 54; i++) out[i] = map[state[perm[i]]];
    return out;
  }
  /** Rotate a per-face array (colour names, for instance) the same way. */
  function rotateFaces(arr, name) {
    var map = ROT_FACE[name], out = new Array(6);
    for (var i = 0; i < 6; i++) out[map[i]] = arr[i];
    return out;
  }
  /** The 24 ways a cube can sit, as short sequences of whole-cube turns. */
  function orientations() {
    var names = ['x', "x'", 'y', "y'", 'z', "z'"];
    var seen = {}, out = [], frontier = [[]];
    function key(seq) {
      var f = [0, 1, 2, 3, 4, 5];
      seq.forEach(function (n) { f = rotateFaces(f, n); });
      return f.join(',');
    }
    seen[key([])] = 1; out.push([]);
    for (var depth = 0; depth < 3 && out.length < 24; depth++) {
      var next = [];
      frontier.forEach(function (seq) {
        names.forEach(function (n) {
          var s2 = seq.concat(n), k = key(s2);
          if (seen[k]) return;
          seen[k] = 1; out.push(s2); next.push(s2);
        });
      });
      frontier = next;
    }
    return out;
  }
  var ORIENTATIONS = orientations();

  /**
   * Find the whole-cube turns that put `bottom` underneath and `front` facing
   * the solver, so the spoken instructions match what the child is holding.
   * @param {string[]} faceColors colour name per face, indexed U R F D L B
   */
  function orientationFor(faceColors, bottom, front) {
    for (var i = 0; i < ORIENTATIONS.length; i++) {
      var f = faceColors;
      ORIENTATIONS[i].forEach(function (n) { f = rotateFaces(f, n); });
      if (f[FACE_INDEX.D] === bottom && f[FACE_INDEX.F] === front) return ORIENTATIONS[i];
    }
    return null;
  }

  /** Rank progress in the beginner method, counting only pieces that match
   * their centres. A finished face with mismatched side colours is not a layer.
   * Completed stages take priority over partial progress in the next stage. */
  function progressScore(state) {
    function topCount(pieces) {
      return pieces.filter(function (piece) {
        return piece.some(function (i) { return FACELETS[i].face === 'U' && state[i] === FACE_INDEX.U; });
      }).length;
    }
    var counts = [
      solvedCount(state, D_EDGES), solvedCount(state, D_CORNERS), solvedCount(state, BELT_EDGES),
      topCount(U_EDGES), topCount(U_CORNERS), solvedCount(state, U_CORNERS), solvedCount(state, U_EDGES)
    ];
    for (var i = 0; i < counts.length; i++) if (counts[i] < 4) return i * 10 + counts[i];
    return counts.length * 10;
  }

  /** Continue solely from completed work, without any colour preference.
   * Keep the scanned orientation when progress ties; otherwise use the shortest
   * reorientation that reaches the furthest progress. These rotations change
   * the reference frame, not the cube. */
  function orientationForProgress(state) {
    var best = [], score = progressScore(state);
    ORIENTATIONS.forEach(function (seq) {
      var candidate = state;
      seq.forEach(function (rot) { candidate = rotateState(candidate, rot); });
      var next = progressScore(candidate);
      if (next > score) { best = seq; score = next; }
    });
    return best.slice();
  }
  function applyMoves(state, moves) {
    var cur = new Int8Array(54), buf = new Int8Array(54);
    cur.set(state);
    moves.forEach(function (m) { applyPerm(cur, MOVES[m], buf); cur.set(buf); });
    return cur;
  }
  function applyRotation(state, rot) { return applyPerm(state, ROT[rot]); }
  function randomScramble(n) {
    var out = [];
    for (var i = 0; i < (n || 25); i++) out.push(ALL_MOVES[Math.floor(Math.random() * ALL_MOVES.length)]);
    return out;
  }

  return {
    FACE_ORDER: FACE_ORDER, FACE_INDEX: FACE_INDEX, FACELETS: FACELETS,
    MOVES: MOVES, ALL_MOVES: ALL_MOVES, ALGS: ALGS,
    CORNERS: CORNERS, EDGES: EDGES,
    solve: solve, validate: validate, isSolved: isSolved,
    solvedState: solvedState, applyMoves: applyMoves, applyRotation: applyRotation,
    fromFaceString: fromFaceString, toFaceString: toFaceString,
    randomScramble: randomScramble, parse: parse, inverse: inverse, seqPerm: seqPerm,
    rotateState: rotateState, rotateFaces: rotateFaces, orientationFor: orientationFor,
    orientationForProgress: orientationForProgress,
    ORIENTATIONS: ORIENTATIONS
  };
});
