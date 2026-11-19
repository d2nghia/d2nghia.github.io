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

  /** Name the colour of an average sticker patch, or null when it is too dark to tell. */
  function classify(r, g, b) {
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var v = max / 255, s = max ? (max - min) / max : 0, h = 0;
    if (max !== min) {
      var d = max - min;
      if (max === r) h = 60 * (((g - b) / d) % 6);
      else if (max === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
      if (h < 0) h += 360;
    }
    if (v < 0.18) return null;
    if (s < 0.22 || (v > 0.72 && s < 0.3)) return 'white';
    if (h < 14 || h >= 345) return 'red';
    if (h < 42) return 'orange';
    if (h < 70) return 'yellow';
    if (h < 170) return 'green';
    if (h < 265) return 'blue';
    return 'red';
  }

  return {
    OPP: OPP, CANON: CANON, NORMAL: NORMAL,
    frameFromView: frameFromView, placement: placement,
    readRotations: readRotations, rotateGrid: rotateGrid, classify: classify
  };
});
