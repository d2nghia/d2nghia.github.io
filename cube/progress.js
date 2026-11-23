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
    if (!/^[23]\.[A-Za-z0-9_-]+$/.test(value) || value.length > 2500) return null;
    try {
      var data = value.slice(2);
      var bytes = Array.from(atob(data.replace(/-/g, '+').replace(/_/g, '/')), function (c) { return c.charCodeAt(0); });
      if (bytes.length < (value[0] === '2' ? 23 : 3) || base64(bytes) !== data) return null;
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
      if (value[0] === '3') {
        var progress = readCompressed(view, read);
        if (bytes.length !== Math.ceil(offset / 8) || read(bytes.length * 8 - offset) !== 0) return null;
        return progress;
      }
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

  // Positive integers use Elias gamma codes: short runs/references cost fewer
  // bits, with no dictionaries or browser compression APIs needed to restore.
  function gammaSize(value) { return Math.floor(Math.log2(value)) * 2 + 1; }

  function writeSymbols(values, width, write) {
    function gamma(value, put) {
      var bits = Math.floor(Math.log2(value));
      put(0, bits); put(value, bits + 1);
    }
    function raw(put) { values.forEach(function (v) { put(v, width); }); }
    function runs(put) {
      for (var at = 0; at < values.length;) {
        var end = at + 1;
        while (end < values.length && values[end] === values[at]) end++;
        put(values[at], width); gamma(end - at, put); at = end;
      }
    }
    // LZ references copy a previous sequence, including overlapping repeats.
    var tokens = [];
    for (var at = 0; at < values.length;) {
      var best = null, saving = 0;
      for (var distance = 1; distance <= at; distance++) {
        var length = 0;
        while (at + length < values.length && values[at + length] === values[at + length - distance]) length++;
        if (length < 3) continue;
        var gain = length * (width + 1) - 1 - gammaSize(distance) - gammaSize(length - 2);
        if (gain > saving) { saving = gain; best = { distance: distance, length: length }; }
      }
      tokens.push(best || { value: values[at] });
      at += best ? best.length : 1;
    }
    function references(put) {
      tokens.forEach(function (token) {
        put(token.distance ? 1 : 0, 1);
        if (token.distance) { gamma(token.distance, put); gamma(token.length - 2, put); }
        else put(token.value, width);
      });
    }
    var choices = [raw, runs, references], sizes = choices.map(function (emit) {
      var size = 0; emit(function (_, bits) { size += bits; }); return size;
    });
    var mode = sizes.indexOf(Math.min.apply(null, sizes));
    write(mode, 2); choices[mode](write);
  }

  function readSymbols(count, width, limit, read) {
    var mode = read(2), values = [];
    if (mode === 3) throw new Error('Unknown compression');
    function gamma() {
      var zeros = 0;
      while (read(1) === 0) if (++zeros > 11) throw new Error('Oversized reference');
      return Math.pow(2, zeros) + read(zeros);
    }
    while (values.length < count) {
      if (mode === 2 && read(1)) {
        var distance = gamma(), length = gamma() + 2;
        if (distance > values.length || length > count - values.length) throw new Error('Invalid reference');
        while (length--) values.push(values[values.length - distance]);
      } else {
        var value = read(width), run = mode === 1 ? gamma() : 1;
        if (value >= limit || run > count - values.length) throw new Error('Invalid run');
        while (run--) values.push(value);
      }
    }
    return values;
  }

  function readCompressed(view, read) {
    if (view !== 'coach') return { view: view, names: readSymbols(54, 3, NAMES.length, read).map(function (n) { return NAMES[n]; }) };
    var colours = [];
    for (var i = 0; i < 6; i++) {
      var colour = NAMES[read(3)];
      if (!colour || colours.indexOf(colour) >= 0) throw new Error('Invalid centres');
      colours.push(colour);
    }
    var cursor = read(12), count = read(12);
    if (count > MAX_MOVES || cursor > count) throw new Error('Invalid step');
    var moves = readSymbols(count, 4, MOVES.length, read).map(function (m) { return MOVES[m]; });
    var targets = readSymbols(count, 3, GOALS.length, read).map(function (g) { return GOALS[g]; });
    // The exact saved solution uniquely determines its starting cube. Keeping
    // the centres preserves the child's colours without storing 54 duplicates.
    var start = L.applyMoves(L.solvedState(), L.inverse(moves));
    return restoreLesson(Array.from(start, function (face) { return colours[face]; }), moves, targets, cursor);
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

  function encodePacked(progress) {
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

  function encode(progress) {
    // Keep v2 as a fallback when compression would make the URL longer.
    var packed = encodePacked(progress), bytes = [], offset = 0;
    function write(value, width) {
      while (width--) {
        var at = offset >> 3;
        bytes[at] = (bytes[at] || 0) | (((value >> width) & 1) << (7 - (offset & 7)));
        offset++;
      }
    }
    write(VIEWS.indexOf(progress.view), 2);
    if (progress.view === 'coach') {
      var s = progress.session, colours = progress.names.filter(function (_, i) { return i % 9 === 4; });
      var start = L.applyMoves(L.solvedState(), L.inverse(s.moves));
      if (new Set(colours).size !== 6 || progress.names.some(function (name, i) { return name !== colours[start[i]]; })) return packed;
      colours.forEach(function (name) { write(NAMES.indexOf(name), 3); });
      write(s.cursor, 12); write(s.moves.length, 12);
      writeSymbols(s.moves.map(function (m) { return MOVES.indexOf(m); }), 4, write);
      writeSymbols(s.targets.map(function (g) { return GOALS.indexOf(g); }), 3, write);
    } else writeSymbols(progress.names.map(function (name) { return NAMES.indexOf(name); }), 3, write);
    var crc = checksum(bytes);
    bytes.push(crc >> 8, crc & 255);
    var compressed = '#p=3.' + base64(bytes);
    return compressed.length < packed.length ? compressed : packed;
  }

  function fromSession(session, cursor) {
    return { view: 'coach', names: Array.from(session.start, function (face) { return session.faceColour[face]; }),
      session: { start: session.start, faceColour: session.faceColour, moves: session.moves,
        targets: session.targets, cursor: cursor == null ? session.cursor : cursor } };
  }

  return { encode: encode, decode: decode, fromSession: fromSession, STORE: STORE };
});
