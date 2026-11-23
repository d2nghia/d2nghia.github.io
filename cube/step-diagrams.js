/** Small SVG diagrams for the manual guide: no 3D DOM or animation loop. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./solver.js'));
  else root.CubeStepDiagrams = factory(root.CubeLib);
})(typeof self !== 'undefined' ? self : this, function (L) {
  'use strict';
  var HEX = { white: '#fafafa', yellow: '#ffd400', green: '#00a550', blue: '#1769d6', red: '#e1372b', orange: '#ff8400' };
  var NAMES = ['white', 'yellow', 'green', 'blue', 'red', 'orange'];
  // The renderer's default is retained for standalone figures. The manual UI
  // asks the child to choose, then supplies a physically rotated colour scheme.
  var COLOURS = ['#ffd400', '#ff8400', '#00a550', '#fafafa', '#e1372b', '#1769d6'];
  function centreNames(centres) {
    if (!centres || typeof centres !== 'object') throw new Error('Invalid centre colours');
    var names = L.FACE_ORDER.map(function (face) {
      var name = centres[face] == null ? null : centres[face];
      if (name !== null && NAMES.indexOf(name) < 0) throw new Error('Unknown centre colour');
      return name;
    });
    var filled = names.filter(function (name) { return name !== null; });
    if (new Set(filled).size !== filled.length) throw new Error('Repeated centre colour');
    return names;
  }
  function schemeForCentres(centres) {
    var names = centreNames(centres);
    if (names.indexOf(null) >= 0) return null;
    // Centre colours define the child's own cube. Do not infer opposites or
    // handedness from a standard factory colour scheme.
    return { base: centres.D, top: centres.U, front: centres.F, names: names, colours: names.map(function (name) { return HEX[name]; }) };
  }
  function assignCentre(centres, face, colour) {
    if (L.FACE_ORDER.indexOf(face) < 0 || NAMES.indexOf(colour) < 0) throw new Error('Invalid centre choice');
    var names = centreNames(centres), next = {}, owner = null;
    L.FACE_ORDER.forEach(function (key, i) { next[key] = names[i]; if (key !== face && names[i] === colour) owner = key; });
    if (owner) next[owner] = next[face];
    next[face] = colour;
    return { centres: next, swappedFace: owner };
  }
  function orientation(base) {
    if (NAMES.indexOf(base) < 0) throw new Error('Unknown starting colour');
    var front = base === 'green' || base === 'blue' ? 'white' : 'green';
    var standard = ['white', 'red', 'green', 'yellow', 'orange', 'blue'];
    for (var i = 0; i < L.ORIENTATIONS.length; i++) {
      var names = standard.slice();
      L.ORIENTATIONS[i].forEach(function (rotation) { names = L.rotateFaces(names, rotation); });
      if (names[L.FACE_INDEX.D] === base && names[L.FACE_INDEX.F] === front) {
        return { base: base, top: names[L.FACE_INDEX.U], front: front, names: names, colours: names.map(function (name) { return HEX[name]; }) };
      }
    }
    throw new Error('No matching cube orientation');
  }
  var GEO = { U: ['y', 1, 1], D: ['y', -1, -1], R: ['x', 1, 1], L: ['x', -1, -1], F: ['z', 1, 1], B: ['z', -1, -1] };
  var AXIS = { x: 0, y: 1, z: 2 }, VISIBLE = ['F', 'R', 'U'];
  var STAGES = [
    { key: 'cross', recipes: [{ id: 'petal', alg: 'F2' }, { id: 'gap', alg: 'D' }] },
    { key: 'corners', recipes: [{ id: 'right', alg: "R U R'" }, { id: 'front', alg: "F' U' F" }, { id: 'top', alg: "R U2 R' U' R U R'" }] },
    { key: 'belt', recipes: [{ id: 'right', alg: "U R U' R' U' F' U F" }, { id: 'left', alg: "U' L' U L U F U' F'" }] },
    { key: 'yellowCross', recipes: [{ id: 'cross', alg: "F R U R' U' F'" }] },
    { key: 'yellowFace', recipes: [{ id: 'fish', alg: "R U R' U R U2 R'" }, { id: 'back', alg: "R U2 R' U' R U' R'" }] },
    { key: 'cornerPlace', recipes: [{ id: 'circle', alg: "R' F R' B2 R F' R' B2 R2" }, { id: 'back', alg: "R B' R F2 R' B R F2 R2" }] },
    { key: 'lastEdges', recipes: [{ id: 'circle', alg: "R U' R U R U R U' R' U' R2" }, { id: 'back', alg: "R2 U R U R' U' R' U' R' U R'" }] }
  ];
  function quarterTurns(alg) {
    return L.parse(alg).reduce(function (out, move) { return out.concat(move.endsWith('2') ? [move[0], move[0]] : [move]); }, []);
  }
  function lesson(recipe) {
    var moves = quarterTurns(recipe.alg), state = L.applyMoves(L.solvedState(), L.inverse(moves)), frames = [];
    moves.forEach(function (move) { frames.push({ state: state, move: move }); state = L.applyMoves(state, [move]); });
    frames.push({ state: state, move: null }); return frames;
  }
  function project(p) { return [100 + (p[0] - p[2]) * 82 / 3, 91 - p[1] * 94 / 3 + (p[0] + p[2]) * 34 / 3]; }
  function point(face, col, row) {
    var p = face === 'F' ? [col - 1, 1 - row, 1.5] : face === 'R' ? [1.5, 1 - row, 1 - col] : [col - 1, 1.5, row - 1];
    return project(p);
  }
  function pair(p) { return p.map(function (v) { return Number(v.toFixed(2)); }).join(','); }
  function polygon(face, col, row, radius) {
    return [[-radius, -radius], [radius, -radius], [radius, radius], [-radius, radius]].map(function (d) { return pair(point(face, col + d[0], row + d[1])); }).join(' ');
  }
  // Project the same model-space rotation tangents used by the live cube.
  function velocity(pos, axis, d) {
    return axis === 'x' ? [0, d * pos[2], -d * pos[1]] : axis === 'y' ? [-d * pos[2], 0, d * pos[0]] : [d * pos[1], -d * pos[0], 0];
  }
  function cues(move) {
    var geo = GEO[move[0]], d = geo[2] * (move.endsWith("'") ? -1 : 1), out = [];
    VISIBLE.forEach(function (face) {
      var cells = L.FACELETS.filter(function (f) { return f.face === face && f.pos[AXIS[geo[0]]] === geo[1]; });
      if (cells.length === 3) {
        var mid = cells[1], v = velocity(mid.pos, geo[0], d), a = project(mid.pos), b = project(mid.pos.map(function (n, i) { return n + v[i]; }));
        var direction = [b[0] - a[0], b[1] - a[1]], length = Math.hypot(direction[0], direction[1]);
        var centre = point(face, mid.col, mid.row), unit = direction.map(function (n) { return n / length; });
        var start = centre.map(function (n, i) { return n - unit[i] * 20; }), end = centre.map(function (n, i) { return n + unit[i] * 20; });
        out.push({ face: face, type: 'strip', cells: cells, tangent: direction, points: [start, end], path: 'M' + pair(start) + ' L' + pair(end) });
      } else if (face === move[0]) {
        var points = [], sign = move.endsWith("'") ? -1 : 1;
        for (var i = 0; i <= 16; i++) {
          var angle = (-150 + sign * i * 260 / 16) * Math.PI / 180;
          points.push(point(face, 1 + Math.cos(angle) * .95, 1 + Math.sin(angle) * .95));
        }
        out.push({ face: face, type: 'ring', points: points, path: points.map(function (p, n) { return (n ? ' L' : 'M') + pair(p); }).join('') });
      }
    }); return out;
  }
  function arrow(path, points) {
    var end = points[points.length - 1], before = points[points.length - 2], dx = end[0] - before[0], dy = end[1] - before[1];
    var length = Math.hypot(dx, dy), ux = dx / length, uy = dy / length;
    var head = [end, [end[0] - ux * 9 - uy * 6, end[1] - uy * 9 + ux * 6], [end[0] - ux * 9 + uy * 6, end[1] - uy * 9 - ux * 6]];
    return '<path d="' + path + '" class="diagram-arrow-shadow"/><path d="' + path + '" class="diagram-arrow"/>' + '<polygon points="' + head.map(pair).join(' ') + '" class="diagram-arrowhead"/>';
  }
  function cubeSVG(state, move, mask, colours) {
    colours = colours || COLOURS;
    var geo = move && GEO[move[0]], html = '<svg class="step-diagram" viewBox="0 0 200 186" aria-hidden="true" focusable="false">';
    VISIBLE.forEach(function (face) {
      html += '<polygon points="' + polygon(face, 1, 1, 1.5) + '" fill="#182231"/>';
      L.FACELETS.forEach(function (f, i) {
        if (f.face !== face) return;
        var moving = geo && f.pos[AXIS[geo[0]]] === geo[1], fill = !mask || mask(f) ? colours[state[i]] : '#aab2bf';
        html += '<polygon data-facelet="' + i + '" points="' + polygon(face, f.col, f.row, .455) + '" fill="' + fill + '"' + (moving ? ' stroke="#9bfff0" stroke-width="2.3"' : '') + (geo && !moving ? ' opacity=".4"' : '') + '/>';
      });
    });
    if (move) cues(move).forEach(function (cue) { html += arrow(cue.path, cue.points); });
    return html + '</svg>';
  }
  function faceSVG(cells, colour) {
    var out = '<svg class="face-diagram" viewBox="0 0 66 66" aria-hidden="true" focusable="false">';
    cells.forEach(function (on, i) { out += '<rect x="' + (i % 3 * 22 + 1) + '" y="' + (Math.floor(i / 3) * 22 + 1) + '" width="20" height="20" rx="3" fill="' + (on ? colour : '#aab2bf') + '" stroke="#586273" stroke-width=".6"/>'; });
    return out + '</svg>';
  }
  function goalSVG(key, colours) {
    colours = colours || COLOURS;
    if (key === 'cross' || key === 'corners' || key === 'yellowCross' || key === 'yellowFace') {
      var cross = key === 'cross' || key === 'yellowCross';
      return faceSVG(Array.from({ length: 9 }, function (_, i) { return !cross || [1, 3, 4, 5, 7].indexOf(i) >= 0; }), key === 'cross' || key === 'corners' ? colours[3] : colours[0]);
    }
    return cubeSVG(L.solvedState(), null, key === 'belt' ? function (f) { return f.face !== 'U' && f.row >= 1; } : key === 'cornerPlace' ? function (f) { return f.face === 'U' || f.row === 0; } : null, colours);
  }
  return { STAGES: STAGES, COLOURS: COLOURS, NAMES: NAMES, HEX: HEX, schemeForCentres: schemeForCentres, assignCentre: assignCentre, orientation: orientation, quarterTurns: quarterTurns, lesson: lesson, cues: cues, project: project, cubeSVG: cubeSVG, faceSVG: faceSVG, goalSVG: goalSVG };
});
