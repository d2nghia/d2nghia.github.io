/** Diagnose entered colours and find small, verified correction previews. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./solver.js'));
  else root.CubeValidation = factory(root.CubeLib);
})(typeof self !== 'undefined' ? self : this, function (L) {
  'use strict';
  var COLOURS = ['white', 'yellow', 'green', 'blue', 'red', 'orange'];
  var PIECES = L.CORNERS.concat(L.EDGES), SOLVED = L.solvedState();
  var CENTRES = L.FACE_ORDER.map(function (_, i) { return i * 9 + 4; });
  function key(values) { return values.slice().sort().join(','); }
  function assess(names) {
    var missing = [];
    for (var i = 0; i < 54; i++) if (COLOURS.indexOf(names[i]) < 0) missing.push(i);
    if (missing.length) return { ok: false, code: 'missing', indices: missing };
    var centres = CENTRES.map(function (i) { return names[i]; });
    if (new Set(centres).size !== 6) return { ok: false, code: 'centres', indices: CENTRES.filter(function (i) { return centres.filter(function (c) { return c === names[i]; }).length > 1; }) };
    var state = Int8Array.from(names, function (name) { return centres.indexOf(name); });
    var result = L.validate(state);
    return { ok: result.ok, code: result.error || null, state: state, centres: centres };
  }
  function groupsFor(indices) {
    var groups = [], used = {};
    indices.forEach(function (index) {
      var piece = PIECES.find(function (p) { return p.indexOf(index) >= 0; }) || [index], id = piece.join(',');
      if (!used[id]) { groups.push(piece.slice()); used[id] = true; }
    });
    return groups;
  }
  function badPieces(state) {
    var out = [];
    [L.CORNERS, L.EDGES].forEach(function (pieces) {
      var homes = pieces.map(function (p) { return key(p.map(function (i) { return SOLVED[i]; })); }), seen = {};
      pieces.forEach(function (p) {
        var id = key(p.map(function (i) { return state[i]; }));
        if (homes.indexOf(id) < 0) out.push(p.slice());
        else if (seen[id]) { out.push(seen[id].slice(), p.slice()); }
        else seen[id] = p;
        if (p.length === 3 && homes.indexOf(id) >= 0) {
          var home = pieces[homes.indexOf(id)].map(function (i) { return SOLVED[i]; });
          if (![0, 1, 2].some(function (shift) { return p.every(function (i, n) { return state[i] === home[(n + shift) % 3]; }); })) out.push(p.slice());
        }
      });
    });
    return out;
  }
  function inspect(input) {
    var names = Array.from(input || []).slice(0, 54);
    while (names.length < 54) names.push(null);
    var report = assess(names);
    if (report.ok) return report;
    report.source = names;
    report.suggestions = [];
    report.counts = COLOURS.map(function (colour) { return { colour: colour, count: names.filter(function (n) { return n === colour; }).length }; });
    var groups = report.state ? badPieces(report.state) : groupsFor(report.indices || []);
    if (!groups.length && report.code === 'twist') groups = L.CORNERS.map(function (p) { return p.slice(); });
    if (!groups.length && report.code === 'flip') groups = L.EDGES.map(function (p) { return p.slice(); });
    if (!groups.length && report.code === 'count') {
      var excess = report.counts.filter(function (c) { return c.count > 9; }).map(function (c) { return c.colour; });
      groups = groupsFor(names.map(function (name, i) { return excess.indexOf(name) >= 0 && CENTRES.indexOf(i) < 0 ? i : -1; }).filter(function (i) { return i >= 0; }));
    }
    var identities = {};
    function offer(after, kind, pieces) {
      var indices = names.map(function (name, i) { return name !== after[i] ? i : -1; }).filter(function (i) { return i >= 0; });
      if (!indices.length) return;
      var id = indices.map(function (i) { return i + ':' + after[i]; }).join(',');
      if (identities[id]) return;
      identities[id] = true;
      if (!assess(after).ok) return;
      var score = indices.reduce(function (sum, i) { return sum + (after[i] === after[Math.floor(i / 9) * 9 + 4] ? 1 : 0); }, 0);
      report.suggestions.push({ kind: kind, pieces: pieces || groupsFor(indices), indices: indices, after: after, score: score });
    }
    function rotatePiece(piece, shift, kind) {
      var after = names.slice();
      piece.forEach(function (i, n) { after[i] = names[piece[(n + shift) % piece.length]]; });
      offer(after, kind, [piece.slice()]);
    }
    function swap(a, b) {
      var after = names.slice(); after[a] = names[b]; after[b] = names[a]; offer(after, 'paint');
    }
    if (report.code === 'missing') {
      report.groups = groups;
      return report;
    }
    if (report.code === 'centres') {
      report.indices.forEach(function (i) {
        COLOURS.filter(function (c) { return CENTRES.every(function (k) { return names[k] !== c; }); }).forEach(function (c) {
          var after = names.slice(); after[i] = c; offer(after, 'paint', [[i]]);
        });
      });
    } else if (report.code === 'twist') {
      L.CORNERS.forEach(function (p) { rotatePiece(p, 1, 'twist'); rotatePiece(p, 2, 'twist'); });
    } else if (report.code === 'flip') {
      L.EDGES.forEach(function (p) { rotatePiece(p, 1, 'flip'); });
    } else if (report.code === 'count') {
      var tooMany = report.counts.filter(function (c) { return c.count > 9; }).map(function (c) { return c.colour; });
      var tooFew = report.counts.filter(function (c) { return c.count < 9; }).map(function (c) { return c.colour; });
      var excessCount = report.counts.reduce(function (n, c) { return n + Math.max(0, c.count - 9); }, 0);
      if (excessCount <= 2) {
        var suspects = names.map(function (c, i) { return tooMany.indexOf(c) >= 0 && CENTRES.indexOf(i) < 0 ? i : -1; }).filter(function (i) { return i >= 0; });
        suspects.forEach(function (i, n) { tooFew.forEach(function (colour) {
          var after = names.slice(); after[i] = colour; offer(after, 'paint');
          if (excessCount === 2) suspects.slice(n + 1).forEach(function (j) { tooFew.forEach(function (other) {
            var pair = after.slice(); pair[j] = other; offer(pair, 'paint');
          }); });
        }); });
      }
    } else {
      // A pair of mis-entered stickers is often enough to explain a bad piece.
      var suspects = groups.reduce(function (all, group) { return all.concat(group); }, []);
      for (var a = 0; a < 54; a++) for (var b = a + 1; b < 54; b++) {
        if (CENTRES.indexOf(a) >= 0 || CENTRES.indexOf(b) >= 0 || names[a] === names[b]) continue;
        if (report.code !== 'parity' && suspects.length && suspects.indexOf(a) < 0 && suspects.indexOf(b) < 0) continue;
        swap(a, b);
      }
      if (report.code === 'parity') [L.EDGES, L.CORNERS].forEach(function (pieces) {
        pieces.forEach(function (p, a) { pieces.slice(a + 1).forEach(function (q) {
          for (var x = 0; x < p.length; x++) for (var y = 0; y < p.length; y++) {
            var after = names.slice();
            p.forEach(function (i, n) { after[i] = names[q[(n + x) % p.length]]; });
            q.forEach(function (i, n) { after[i] = names[p[(n + y) % p.length]]; });
            offer(after, 'paint', [p.slice(), q.slice()]);
          }
        }); });
      });
    }
    report.suggestions.sort(function (a, b) { return b.score - a.score || a.indices.length - b.indices.length; });
    report.suggestions = report.suggestions.slice(0, 48);
    report.groups = groups.length ? groups : report.suggestions.length ? report.suggestions[0].pieces : PIECES.map(function (p) { return p.slice(); });
    return report;
  }
  return { inspect: inspect, assess: assess };
});
