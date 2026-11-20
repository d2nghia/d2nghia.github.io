/**
 * Reading a cube through the camera.
 *
 * The child spins a 3D model until the side they are showing the camera is the
 * one facing them, so the page has to work out, from the model's own angles,
 * which side that is and which way up it sits. That gives the nine readings
 * somewhere to land. The maths lives here, away from the DOM, so it can be
 * tested on its own.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CubeCapture = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var OPP = { U: 'D', D: 'U', L: 'R', R: 'L', F: 'B', B: 'F' };
  var NORMAL = { U: [0, 1, 0], D: [0, -1, 0], R: [1, 0, 0], L: [-1, 0, 0], F: [0, 0, 1], B: [0, 0, -1] };

  /**
   * How each stored face is read: which side of the cube is at the top of the
   * picture, and which is on the right, when the face is read row by row.
   */
  var CANON = { F: ['U', 'R'], R: ['U', 'B'], B: ['U', 'L'], L: ['U', 'F'], U: ['B', 'R'], D: ['F', 'R'] };

  function labelOf(v) {
    for (var k in NORMAL) {
      var n = NORMAL[k];
      if (n[0] === v[0] && n[1] === v[1] && n[2] === v[2]) return k;
    }
    return null;
  }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }

  /**
   * Which side of the model is facing the viewer, and how it is turned, for a
   * view of `rotateX(rx) rotateY(ry)`. The model has y up; the screen has y down.
   * @returns {{front: string, up: string, right: string}}
   */
  function frameFromView(rx, ry) {
    var rad = Math.PI / 180;
    var ca = Math.cos(rx * rad), sa = Math.sin(rx * rad);
    var cb = Math.cos(ry * rad), sb = Math.sin(ry * rad);
    function onScreen(n) {
      var x = n[0], y = -n[1], z = n[2];
      var x1 = x * cb + z * sb, z1 = -x * sb + z * cb;
      return [x1, y * ca - z1 * sa, y * sa + z1 * ca];
    }
    var front = null, bestZ = -Infinity, up = null, bestY = Infinity, f;
    for (f in NORMAL) {
      var s = onScreen(NORMAL[f]);
      if (s[2] > bestZ) { bestZ = s[2]; front = f; }
    }
    for (f in NORMAL) {
      if (f === front || f === OPP[front]) continue;
      var s2 = onScreen(NORMAL[f]);
      if (s2[1] < bestY) { bestY = s2[1]; up = f; }
    }
    /* Deriving right rather than measuring it keeps the three at right angles
     * even when the cube is turned exactly between two sides. */
    return { front: front, up: up, right: labelOf(cross(NORMAL[up], NORMAL[front])) };
  }

  /** How many clockwise quarter turns of the photo line it up with the stored face. */
  function readRotations(face, up, right) {
    for (var k = 0; k < 4; k++) {
      var u = up, r = right;
      for (var j = 0; j < k; j++) { var nu = OPP[r]; r = u; u = nu; }
      if (u === CANON[face][0] && r === CANON[face][1]) return k;
    }
    return 0;
  }

  function rotateGrid(cells, k) {
    var out = cells.slice();
    for (var i = 0; i < k; i++) {
      var n = new Array(9);
      for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) n[r * 3 + c] = out[(2 - c) * 3 + r];
      out = n;
    }
    return out;
  }

  /**
   * Where each camera cell belongs among a face's nine stored stickers, for the
   * side the model is currently showing.
   * @returns {{face: string, fromCamera: number[]}} fromCamera[cameraCell] = stored slot
   */
  function placement(rx, ry) {
    var frame = frameFromView(rx, ry);
    var k = readRotations(frame.front, frame.up, frame.right);
    var order = rotateGrid([0, 1, 2, 3, 4, 5, 6, 7, 8], k);   // stored slot i <- camera cell order[i]
    var inv = new Array(9);
    order.forEach(function (cameraCell, stored) { inv[cameraCell] = stored; });
    return { face: frame.front, frame: frame, fromCamera: inv };
  }

  function toHsv(c) {
    var r = c.r / 255, g = c.g / 255, b = c.b / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    var h = 0;
    if (d) {
      if (max === r) h = 60 * (((g - b) / d) % 6);
      else if (max === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
      if (h < 0) h += 360;
    }
    return { h: h, s: max ? d / max : 0, v: max };
  }

  function hueName(h) {
    if (h < 18 || h >= 345) return 'red';
    if (h < 45) return 'orange';
    if (h < 72) return 'yellow';
    if (h < 172) return 'green';
    if (h < 268) return 'blue';
    return 'red';
  }

  /** Name one colour on its own. Kept for checking swatches; a face uses classifyFace. */
  function classify(r, g, b) {
    var c = toHsv({ r: r, g: g, b: b });
    if (c.v < 0.18) return null;
    if (c.s < 0.22 || (c.v > 0.72 && c.s < 0.3)) return 'white';
    return hueName(c.h);
  }

  /**
   * Name all nine stickers of one face together.
   *
   * Reading each sticker on its own fails under real light: a warm bulb pushes
   * white towards yellow, and a dim corner pushes everything towards grey.
   * Judging the nine against each other is far steadier, because whatever the
   * light is doing, it is doing it to all nine.
   *
   * @param {{r:number,g:number,b:number}[]} samples nine patch colours, reading order
   * @returns {(string|null)[]} nine colour names, null where it is too dark to tell
   */
  function classifyFace(samples) {
    var n = samples.length, i;
    function clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }
    function sat(c) {
      var max = Math.max(c.r, c.g, c.b);
      return max ? (max - Math.min(c.r, c.g, c.b)) / max : 0;
    }

    /* Work out the colour of the light from the white sticker, not from the
     * average of the face. Faces are often mostly red, orange and yellow, and
     * an average would call that a warm light and "correct" it by adding blue,
     * which turns the white sticker blue and slides orange towards red. The
     * least colourful sticker is white if there is one at all, and white is
     * what the light's own colour shows up in. */
    var least = 0;
    for (i = 1; i < n; i++) if (sat(samples[i]) < sat(samples[least])) least = i;
    var lit = samples;
    if (sat(samples[least]) < 0.42) {
      var ref = samples[least], top = Math.max(ref.r, ref.g, ref.b) || 1;
      var gr = top / (ref.r || 1), gg = top / (ref.g || 1), gb = top / (ref.b || 1);
      lit = samples.map(function (c) {
        return { r: clamp(c.r * gr), g: clamp(c.g * gg), b: clamp(c.b * gb) };
      });
    }

    var hsv = lit.map(toHsv);
    var maxV = 0;
    for (i = 0; i < n; i++) if (hsv[i].v > maxV) maxV = hsv[i].v;

    // White is whatever is clearly less colourful than the rest of this face.
    var sats = hsv.map(function (c) { return c.s; }).slice().sort(function (a, b) { return a - b; });
    var cut = 0.3, bestGap = 0;
    for (i = 0; i < n - 1; i++) {
      var gap = sats[i + 1] - sats[i], mid = (sats[i] + sats[i + 1]) / 2;
      if (gap > bestGap && mid > 0.1 && mid < 0.55) { bestGap = gap; cut = mid; }
    }
    if (bestGap < 0.1) cut = sats[n - 1] < 0.3 ? 1 : 0.3;   // all white, or no white at all

    var names = hsv.map(function (c) {
      if (c.v < 0.14) return null;                  // too dark to call
      if (c.s < cut && c.v > maxV * 0.4) return 'white';
      return hueName(c.h);
    });
    return splitWarm(hsv, names);
  }

  /**
   * Red and orange sit next to each other, and a sticker read slightly dark
   * drifts from one to the other. Judging the warm stickers of a face against
   * each other is steadier than judging each against a fixed boundary.
   */
  function splitWarm(hsv, names) {
    var warm = [];
    for (var i = 0; i < names.length; i++) {
      if (names[i] === 'red' || names[i] === 'orange') warm.push(i);
    }
    if (!warm.length) return names;
    var hues = warm.map(function (i) { return hsv[i].h > 300 ? hsv[i].h - 360 : hsv[i].h; });
    var lo = Math.min.apply(null, hues), hi = Math.max.apply(null, hues);
    if (hi - lo < 12) {
      /* All of one colour: which one is decided by where the group sits, not by
       * where each sticker falls relative to the boundary. */
      var mean = hues.reduce(function (a, b) { return a + b; }, 0) / hues.length;
      var one = mean < 19 ? 'red' : 'orange';
      warm.forEach(function (i) { names[i] = one; });
      return names;
    }
    // Two groups: split them at the widest gap between the hues on show.
    var sorted = hues.slice().sort(function (a, b) { return a - b; });
    var split = 19, widest = 0;
    for (var k = 0; k < sorted.length - 1; k++) {
      var gap = sorted[k + 1] - sorted[k];
      if (gap > widest) { widest = gap; split = (sorted[k] + sorted[k + 1]) / 2; }
    }
    if (widest < 8) return names;
    warm.forEach(function (i, j) { names[i] = hues[j] < split ? 'red' : 'orange'; });
    return names;
  }

  /* ---------------- finding the face in the picture ----------------
   * Asking a child to line a cube up inside a square is a deal they lose: a
   * little too far away, a little off to one side, and the reading squares sit
   * on the background. So instead of trusting where the square is, the page
   * looks for the face: it tries many positions and sizes of a 3x3 grid and
   * keeps the one that lands on nine flat patches of colour separated by the
   * cube's dark lines.
   */

  /** Running totals, so the average and the variation of any box cost the same. */
  function buildSums(data, W) {
    var n = (W + 1) * (W + 1);
    var R = new Float64Array(n), G = new Float64Array(n), B = new Float64Array(n);
    var L = new Float64Array(n), Q = new Float64Array(n);
    for (var y = 0; y < W; y++) {
      var rr = 0, rg = 0, rb = 0, rl = 0, rq = 0;
      for (var x = 0; x < W; x++) {
        var i = (y * W + x) * 4;
        var r = data[i], g = data[i + 1], b = data[i + 2];
        var l = r * 0.299 + g * 0.587 + b * 0.114;
        rr += r; rg += g; rb += b; rl += l; rq += l * l;
        var k = (y + 1) * (W + 1) + (x + 1), up = y * (W + 1) + (x + 1);
        R[k] = R[up] + rr; G[k] = G[up] + rg; B[k] = B[up] + rb;
        L[k] = L[up] + rl; Q[k] = Q[up] + rq;
      }
    }
    return { R: R, G: G, B: B, L: L, Q: Q, W: W, S: W + 1 };
  }
  function boxStats(sums, cx, cy, w, h) {
    var W = sums.W, S = sums.S;
    var x0 = Math.max(0, Math.min(W - 1, Math.round(cx - w / 2)));
    var y0 = Math.max(0, Math.min(W - 1, Math.round(cy - h / 2)));
    var x1 = Math.max(x0 + 1, Math.min(W, Math.round(cx + w / 2)));
    var y1 = Math.max(y0 + 1, Math.min(W, Math.round(cy + h / 2)));
    var n = (x1 - x0) * (y1 - y0);
    function sum(A) { return A[y1 * S + x1] - A[y0 * S + x1] - A[y1 * S + x0] + A[y0 * S + x0]; }
    var l = sum(sums.L) / n, q = sum(sums.Q) / n;
    return {
      r: sum(sums.R) / n, g: sum(sums.G) / n, b: sum(sums.B) / n,
      l: l, sd: Math.sqrt(Math.max(0, q - l * l)), n: n
    };
  }

  /** How much a 3x3 grid at this position and size looks like a cube face. */
  function gridScore(sums, x0, y0, cell) {
    var W = sums.W;
    var half = cell * 1.5;
    if (x0 - half < 1 || y0 - half < 1 || x0 + half > W - 1 || y0 + half > W - 1) return null;
    var inner = cell * 0.56, lums = [], flat = 0, i, r, c;
    for (r = 0; r < 3; r++) for (c = 0; c < 3; c++) {
      var st = boxStats(sums, x0 + (c - 1) * cell, y0 + (r - 1) * cell, inner, inner);
      lums.push(st.l);
      flat += st.sd;                                  // a sticker is flat; an edge or a gap is not
    }
    var gaps = 0, lines = 0;
    for (r = 0; r < 3; r++) for (c = 0; c < 2; c++) {
      var gx = boxStats(sums, x0 + (c - 0.5) * cell, y0 + (r - 1) * cell, cell * 0.16, cell * 0.5);
      gaps += Math.max(0, (lums[r * 3 + c] + lums[r * 3 + c + 1]) / 2 - gx.l);
      lines++;
    }
    for (r = 0; r < 2; r++) for (c = 0; c < 3; c++) {
      var gy = boxStats(sums, x0 + (c - 1) * cell, y0 + (r - 0.5) * cell, cell * 0.5, cell * 0.16);
      gaps += Math.max(0, (lums[r * 3 + c] + lums[(r + 1) * 3 + c] ) / 2 - gy.l);
      lines++;
    }
    return (gaps / lines) - 0.75 * (flat / 9);
  }

  /**
   * Find the face and read its nine colours.
   * @param {Uint8ClampedArray} data RGBA pixels of a square region, row by row
   * @param {number} W the region's width in pixels
   * @param {number} nominal the cell size to expect, in the same pixels
   * @returns {{names:(string|null)[], sure:boolean[], x:number, y:number, cell:number, score:number}|null}
   */
  function readFace(data, W, nominal) {
    var sums = buildSums(data, W);
    var best = null, si, dx, dy;
    var scales = [0.62, 0.72, 0.84, 0.96, 1.08, 1.2, 1.34];
    for (si = 0; si < scales.length; si++) {
      var cell = nominal * scales[si];
      var step = cell * 0.14;
      for (dy = -4; dy <= 4; dy++) for (dx = -4; dx <= 4; dx++) {
        var x = W / 2 + dx * step, y = W / 2 + dy * step;
        var score = gridScore(sums, x, y, cell);
        if (score == null) continue;
        if (!best || score > best.score) best = { score: score, x: x, y: y, cell: cell };
      }
    }
    if (!best) return null;

    /* Read each sticker from five spots and take the middle one, so a
     * reflection or a shadow on part of it does not decide the answer. */
    var off = best.cell * 0.22, spot = best.cell * 0.2;
    var patches = [], sure = [];
    for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) {
      var cx = best.x + (c - 1) * best.cell, cy = best.y + (r - 1) * best.cell;
      var reads = [[0, 0], [-off, -off], [off, -off], [-off, off], [off, off]].map(function (d) {
        return boxStats(sums, cx + d[0], cy + d[1], spot, spot);
      });
      var mid = {
        r: middle(reads.map(function (p) { return p.r; })),
        g: middle(reads.map(function (p) { return p.g; })),
        b: middle(reads.map(function (p) { return p.b; }))
      };
      var agree = reads.filter(function (p) {
        var dr = p.r - mid.r, dg = p.g - mid.g, db = p.b - mid.b;
        return Math.sqrt(dr * dr + dg * dg + db * db) < 72;
      }).length;
      /* A sticker lit flat reads the same all over. A reflection sitting on it
       * is a bright patch fading outwards, and no reading can say what colour
       * is underneath, so it is better to admit that than to invent one. */
      var lums = reads.map(function (p) { return p.l; });
      var spread = Math.max.apply(null, lums) - Math.min.apply(null, lums);
      patches.push(mid);
      sure.push(agree >= 3 && spread < 55);
    }
    var names = classifyFace(patches);
    return {
      names: names.map(function (n, i) { return sure[i] ? n : null; }),
      patches: patches, sure: sure,
      x: best.x, y: best.y, cell: best.cell, score: best.score
    };
  }
  /**
   * Settle a reading over several frames. A reflection slides across the cube
   * as the hand moves while the stickers stay put, so the middle value of a few
   * frames is steadier than any one of them.
   * @param {{r,g,b}[][]} frames each frame's nine colours
   * @param {boolean[][]} sureFlags each frame's nine confidence flags
   */
  function settle(frames, sureFlags) {
    var patches = [], sure = [];
    for (var i = 0; i < 9; i++) {
      patches.push({
        r: middle(frames.map(function (f) { return f[i].r; })),
        g: middle(frames.map(function (f) { return f[i].g; })),
        b: middle(frames.map(function (f) { return f[i].b; }))
      });
      var yes = sureFlags.filter(function (f) { return f[i]; }).length;
      sure.push(yes * 2 > frames.length);
    }
    var names = classifyFace(patches);
    return names.map(function (n, i) { return sure[i] ? n : null; });
  }

  function middle(values) {
    var v = values.slice().sort(function (a, b) { return a - b; });
    return v[(v.length - 1) >> 1];
  }

  return {
    OPP: OPP, CANON: CANON, NORMAL: NORMAL,
    frameFromView: frameFromView, placement: placement,
    readRotations: readRotations, rotateGrid: rotateGrid,
    classify: classify, classifyFace: classifyFace, toHsv: toHsv,
    readFace: readFace, settle: settle, buildSums: buildSums, boxStats: boxStats
  };
});
