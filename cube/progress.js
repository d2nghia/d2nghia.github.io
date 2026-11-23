/** Versioned, self-contained progress links. The saved moves keep old links
 * on the same lesson even if the beginner solver changes in a later release. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./solver.js'));
  else root.CubeProgress = factory(root.CubeLib);
})(typeof self !== 'undefined' ? self : this, function (L) {
  'use strict';
  var COLOURS = { w: 'white', y: 'yellow', g: 'green', b: 'blue', r: 'red', o: 'orange' };
  var GOALS = ['cross', 'corners', 'belt', 'yellowCross', 'yellowFace', 'cornerPlace', 'lastEdges'];
  var STORE = 'cube-coach/progress1';
  var MAX_MOVES = 2048;

  function encodeNames(names) {
    return names.map(function (name) { return name ? name[0] : '.'; }).join('');
  }

  function decode(hash) {
    if (typeof hash !== 'string' || hash.length > 10000) return null;
    var params = new URLSearchParams(hash.replace(/^#/, ''));
    var keys = ['v', 'cube', 'view', 'step', 'turns', 'goals'];
    if (keys.some(function (key) { return params.getAll(key).length > 1; }) || params.get('v') !== '1') return null;
    var cube = params.get('cube') || '', view = params.get('view');
    if (!/^[wygbro.]{54}$/.test(cube) || ['capture', 'check', 'coach'].indexOf(view) < 0) return null;
    var names = cube.split('').map(function (c) { return COLOURS[c] || null; });
    if (view !== 'coach') return { view: view, names: names };

    var turns = params.get('turns'), goals = params.get('goals'), step = params.get('step');
    if (turns == null || goals == null || turns.length > MAX_MOVES || goals.length !== turns.length ||
        !/^[URFDLBurfdlb]*$/.test(turns) || !/^[0-6]*$/.test(goals) || !/^[1-9]\d{0,3}$/.test(step || '')) return null;
    var cursor = Number(step) - 1;
    if (cursor > turns.length || names.some(function (name) { return !name; })) return null;
    var faceColour = L.FACE_ORDER.map(function (_, i) { return names[i * 9 + 4]; });
    if (new Set(faceColour).size !== 6) return null;
    var start = Int8Array.from(names, function (name) { return faceColour.indexOf(name); });
    if (!L.validate(start).ok) return null;
    var moves = turns.split('').map(function (move) {
      return move === move.toLowerCase() ? move.toUpperCase() + "'" : move;
    });
    if (!L.isSolved(L.applyMoves(start, moves))) return null;
    return { view: view, names: names, session: {
      start: start, faceColour: faceColour, moves: moves,
      targets: goals.split('').map(function (n) { return GOALS[Number(n)]; }), cursor: cursor
    } };
  }

  function encode(progress) {
    var params = new URLSearchParams();
    params.set('v', '1');
    params.set('cube', encodeNames(progress.names));
    params.set('view', progress.view);
    if (progress.view === 'coach') {
      var session = progress.session;
      params.set('step', session.cursor + 1);
      params.set('turns', session.moves.map(function (move) {
        return move.length === 1 ? move : move[0].toLowerCase();
      }).join(''));
      params.set('goals', session.targets.map(function (key) { return GOALS.indexOf(key); }).join(''));
    }
    return '#' + params.toString();
  }

  function fromSession(session, cursor) {
    return { view: 'coach', names: Array.from(session.start, function (face) { return session.faceColour[face]; }),
      session: { start: session.start, faceColour: session.faceColour, moves: session.moves,
        targets: session.targets, cursor: cursor == null ? session.cursor : cursor } };
  }

  return { encode: encode, decode: decode, fromSession: fromSession, STORE: STORE };
});
