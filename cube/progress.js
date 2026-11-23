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
  var NAMES = [null, 'white', 'yellow', 'green', 'blue', 'red', 'orange'];
  var VIEWS = ['capture', 'check', 'coach'];
  var MOVES = ['U', "U'", 'R', "R'", 'F', "F'", 'D', "D'", 'L', "L'", 'B', "B'"];

  function checksum(bytes) {
    var crc = 65535;
    bytes.forEach(function (byte) {
      crc ^= byte << 8;
      for (var bit = 0; bit < 8; bit++) crc = ((crc << 1) ^ (crc & 32768 ? 4129 : 0)) & 65535;
    });
    return crc;
  }

  function base64(bytes) {
    return btoa(String.fromCharCode.apply(null, bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function restoreLesson(names, moves, targets, cursor) {
    if (names.some(function (name) { return !name; })) return null;
    var faceColour = L.FACE_ORDER.map(function (_, i) { return names[i * 9 + 4]; });
    if (new Set(faceColour).size !== 6) return null;
    var start = Int8Array.from(names, function (name) { return faceColour.indexOf(name); });
    if (!L.validate(start).ok || !L.isSolved(L.applyMoves(start, moves))) return null;
    return { view: 'coach', names: names, session: {
      start: start, faceColour: faceColour, moves: moves, targets: targets, cursor: cursor
    } };
  }

  function decodeCompact(value) {
    if (!/^2\.[A-Za-z0-9_-]+$/.test(value) || value.length > 2500) return null;
    try {
      var data = value.slice(2);
      var bytes = Array.from(atob(data.replace(/-/g, '+').replace(/_/g, '/')), function (c) { return c.charCodeAt(0); });
      if (bytes.length < 23 || base64(bytes) !== data) return null;
      var crc = bytes[bytes.length - 2] * 256 + bytes[bytes.length - 1];
      bytes = bytes.slice(0, -2);
      if (checksum(bytes) !== crc) return null;
      var offset = 0;
      function read(width) {
        if (offset + width > bytes.length * 8) throw new Error('Incomplete progress');
        var value = 0;
        while (width--) { value = value * 2 + ((bytes[offset >> 3] >> (7 - (offset & 7))) & 1); offset++; }
        return value;
      }
      var view = VIEWS[read(2)], names = [];
      if (!view) return null;
      for (var i = 0; i < 54; i++) {
        var colour = read(3);
        if (colour >= NAMES.length) return null;
        names.push(NAMES[colour]);
      }
      var cursor = 0, moves = [], targets = [];
      if (view === 'coach') {
        cursor = read(12);
        var count = read(12);
        if (count > MAX_MOVES || cursor > count) return null;
        for (i = 0; i < count; i++) {
          var move = MOVES[read(4)], target = GOALS[read(3)];
          if (!move || !target) return null;
          moves.push(move); targets.push(target);
        }
      }
      // Only zero padding to the final byte is permitted, with no extra data.
      if (bytes.length !== Math.ceil(offset / 8) || read(bytes.length * 8 - offset) !== 0) return null;
      return view === 'coach' ? restoreLesson(names, moves, targets, cursor) : { view: view, names: names };
    } catch (e) { return null; }
  }

  function decode(hash) {
    if (typeof hash !== 'string' || hash.length > 10000) return null;
    var params = new URLSearchParams(hash.replace(/^#/, ''));
    if (params.has('p')) {
      if (params.getAll('p').length !== 1 || Array.from(params.keys()).some(function (key) { return key !== 'p'; })) return null;
      return decodeCompact(params.get('p'));
    }
    // Version 1 links and local saves remain readable and migrate on saving.
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
    if (cursor > turns.length) return null;
    var moves = turns.split('').map(function (move) {
      return move === move.toLowerCase() ? move.toUpperCase() + "'" : move;
    });
    return restoreLesson(names, moves, goals.split('').map(function (n) { return GOALS[Number(n)]; }), cursor);
  }

  function encode(progress) {
    // Version 2: view (2 bits), colours (54 x 3), then for lessons cursor/count
    // (12 bits each) and moves/goals (4 + 3 bits per turn), plus a CRC-16.
    // Packing first makes Base64 genuinely shorter than encoding query text.
    var bytes = [], offset = 0;
    function write(value, width) {
      if (!Number.isInteger(value) || value < 0 || value >= Math.pow(2, width)) throw new Error('Invalid progress');
      while (width--) {
        var at = offset >> 3;
        bytes[at] = (bytes[at] || 0) | (((value >> width) & 1) << (7 - (offset & 7)));
        offset++;
      }
    }
    write(VIEWS.indexOf(progress.view), 2);
    if (progress.names.length !== 54) throw new Error('Invalid cube');
    progress.names.forEach(function (name) { write(NAMES.indexOf(name), 3); });
    if (progress.view === 'coach') {
      var session = progress.session;
      if (session.moves.length > MAX_MOVES || session.targets.length !== session.moves.length || session.cursor > session.moves.length) throw new Error('Invalid lesson');
      write(session.cursor, 12);
      write(session.moves.length, 12);
      session.moves.forEach(function (move, i) {
        write(MOVES.indexOf(move), 4); write(GOALS.indexOf(session.targets[i]), 3);
      });
    }
    var crc = checksum(bytes);
    bytes.push(crc >> 8, crc & 255);
    return '#p=2.' + base64(bytes);
  }

  function fromSession(session, cursor) {
    return { view: 'coach', names: Array.from(session.start, function (face) { return session.faceColour[face]; }),
      session: { start: session.start, faceColour: session.faceColour, moves: session.moves,
        targets: session.targets, cursor: cursor == null ? session.cursor : cursor } };
  }

  return { encode: encode, decode: decode, fromSession: fromSession, STORE: STORE };
});
