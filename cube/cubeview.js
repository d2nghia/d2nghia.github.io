/**
 * Drawing cubes: one live cube you can spin and turn, and small still figures
 * with an arrow over the layer that moves. Shared by the coach and the step
 * guide so a cube looks the same on both pages.
 */
(function () {
  'use strict';
  var L = window.CubeLib;

  var HEX = {
    white: '#fafafa', yellow: '#ffd400', green: '#00a550',
    blue: '#1769d6', red: '#e1372b', orange: '#ff8400'
  };
  var STANDARD = ['white', 'red', 'green', 'yellow', 'orange', 'blue']; // U R F D L B
  var MOVE_GEO = {
    U: { axis: 'y', layer: 1, d: 1 }, D: { axis: 'y', layer: -1, d: -1 },
    R: { axis: 'x', layer: 1, d: 1 }, L: { axis: 'x', layer: -1, d: -1 },
    F: { axis: 'z', layer: 1, d: 1 }, B: { axis: 'z', layer: -1, d: -1 }
  };
  var CSS_SIGN = { x: 1, y: -1, z: 1 };
  var S = 44, CUBE = 132, DEAD = '#1a1d26', MUTED = '#a7aebd';

  var FACELET_AT = {};
  L.FACELETS.forEach(function (f, i) { FACELET_AT[f.pos.join(',') + '|' + f.face] = i; });

  function faceTransform(f) {
    var h = S / 2;
    if (f === 'F') return 'translateZ(' + h + 'px)';
    if (f === 'B') return 'rotateY(180deg) translateZ(' + h + 'px)';
    if (f === 'R') return 'rotateY(90deg) translateZ(' + h + 'px)';
    if (f === 'L') return 'rotateY(-90deg) translateZ(' + h + 'px)';
    if (f === 'U') return 'rotateX(90deg) translateZ(' + h + 'px)';
    return 'rotateX(-90deg) translateZ(' + h + 'px)';
  }
  function base(p) { return 'translate3d(' + (p[0] * S) + 'px,' + (-p[1] * S) + 'px,' + (p[2] * S) + 'px)'; }

  function build(host) {
    var cube = document.createElement('div');
    cube.className = 'cube';
    host.appendChild(cube);
    var cubies = [];
    for (var x = -1; x < 2; x++) for (var y = -1; y < 2; y++) for (var z = -1; z < 2; z++) {
      if (!x && !y && !z) continue;
      var el = document.createElement('div');
      el.className = 'cubie';
      var faces = {};
      ['U', 'D', 'R', 'L', 'F', 'B'].forEach(function (f) {
        var s = document.createElement('div');
        s.className = 'sticker';
        s.style.transform = faceTransform(f);
        var idx = FACELET_AT[[x, y, z].join(',') + '|' + f];
        if (idx != null) s.dataset.facelet = idx;
        el.appendChild(s);
        faces[f] = s;
      });
      cube.appendChild(el);
      cubies.push({ el: el, faces: faces, pos: [x, y, z] });
    }
    cubies.forEach(function (c) { c.el.style.transform = base(c.pos); });
    return { cube: cube, cubies: cubies };
  }

  function paint(cubies, state, faceColour, opts) {
    opts = opts || {};
    cubies.forEach(function (c) {
      var inLayer = !opts.highlight || layerHit(c.pos, opts.highlight);
      Object.keys(c.faces).forEach(function (f) {
        var idx = FACELET_AT[c.pos.join(',') + '|' + f];
        var el = c.faces[f];
        if (idx == null) { el.style.background = DEAD; el.style.boxShadow = 'none'; return; }
        var lit = !opts.mask || opts.mask(idx);
        el.style.background = lit ? HEX[faceColour[state[idx]]] : MUTED;
        el.style.boxShadow = opts.highlight && inLayer ? 'inset 0 0 0 4px #00a7bd' : 'none';
      });
    });
  }
  function layerHit(pos, h) {
    var v = h.axis === 'x' ? pos[0] : h.axis === 'y' ? pos[1] : pos[2];
    return v === h.layer;
  }
  function geoOf(move) {
    var g = MOVE_GEO[move[0]];
    if (!g) return null;
    var prime = move.length > 1 && move[1] === "'";
    var quarters = move.length > 1 && move[1] === '2' ? 2 : 1;
    return { axis: g.axis, layer: g.layer, d: g.d * (prime ? -1 : 1), quarters: quarters, face: move[0], prime: prime };
  }

  /* ---------------- live cube ---------------- */
  var UNSEEN = '#878f9e';
  function create(host, faceColour) {
    faceColour = faceColour || STANDARD;
    var built = build(host), state = L.solvedState(), busy = false;
    var names = null;          // when set, the cube is drawn from colour names instead
    var focusFace = null;      // the side the camera will write onto
    var onView = null;
    var view = { rx: -22, ry: -32 };

    function applyView() {
      built.cube.style.transform = 'rotateX(' + view.rx + 'deg) rotateY(' + view.ry + 'deg)';
      if (onView) onView(view.rx, view.ry);
    }
    /** Draw whatever has been read so far; anything still unknown stays grey. */
    function paintByName() {
      built.cubies.forEach(function (c) {
        Object.keys(c.faces).forEach(function (f) {
          var idx = FACELET_AT[c.pos.join(',') + '|' + f];
          var el = c.faces[f];
          if (idx == null) { el.style.background = DEAD; el.style.boxShadow = 'none'; return; }
          var n = names[idx];
          el.style.background = n ? HEX[n] : UNSEEN;
          el.style.boxShadow = f === focusFace ? 'inset 0 0 0 4px #27e0f5'
            : n ? 'none' : 'inset 0 0 0 2px rgba(255,255,255,.18)';
        });
      });
    }
    function fit() {
      var w = host.clientWidth || 300;
      built.cube.style.scale = Math.max(0.7, Math.min(1.7, w / 230));
    }
    function repaint(highlight) {
      if (names) paintByName();
      else paint(built.cubies, state, faceColour, { highlight: highlight });
    }

    function play(move, ms) {
      return new Promise(function (done) {
        var g = geoOf(move);
        if (!g || busy) { done(); return; }
        busy = true;
        var target = 90 * g.quarters * g.d * CSS_SIGN[g.axis];
        var fn = g.axis === 'x' ? 'rotateX' : g.axis === 'y' ? 'rotateY' : 'rotateZ';
        var group = built.cubies.filter(function (c) { return layerHit(c.pos, g); });
        repaint(g);
        var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        var dur = reduce ? 1 : (ms || 620) * g.quarters, t0 = performance.now();
        var settled = false;
        /* A hidden tab stops serving animation frames, so the turn also has a
         * timer behind it — otherwise the lesson would wait for ever. */
        var safety = setTimeout(finish, dur + 400);
        function finish() {
          if (settled) return;
          settled = true;
          clearTimeout(safety);
          state = L.applyMoves(state, [move]);
          group.forEach(function (c) { c.el.style.transform = base(c.pos); });
          repaint(null);
          busy = false;
          done();
        }
        requestAnimationFrame(function frame(now) {
          if (settled) return;
          var t = Math.min(1, (now - t0) / dur);
          var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
          group.forEach(function (c) { c.el.style.transform = fn + '(' + (target * e) + 'deg) ' + base(c.pos); });
          if (t < 1) requestAnimationFrame(frame);
          else finish();
        });
      });
    }

    /* Painting is always on: with a mouse, left paints a sticker (and keeps
     * painting while held) and right drags the cube round. Touch has no right
     * button, so there a drag spins and a tap paints. */
    var drag = null, painting = false, onSticker = null;
    function faceletUnder(e) {
      var el = e.target && e.target.dataset && e.target.dataset.facelet != null
        ? e.target
        : document.elementFromPoint(e.clientX, e.clientY);
      if (!el || !el.dataset || el.dataset.facelet == null) return null;
      return Number(el.dataset.facelet);
    }
    function paintAt(e) {
      var idx = faceletUnder(e);
      if (idx != null) onSticker(idx);
    }
    function startDrag(e) {
      /* Upside down, a sideways drag would otherwise appear to go the wrong way,
       * so the direction is taken from the tilt the drag started at. */
      var flip = Math.cos(view.rx * Math.PI / 180) < 0 ? -1 : 1;
      drag = { x: e.clientX, y: e.clientY, rx: view.rx, ry: view.ry, moved: false, flip: flip };
      built.cube.style.transition = 'none';
      try { host.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
    }

    host.addEventListener('pointerdown', function (e) {
      var mouse = e.pointerType === 'mouse';
      if (mouse && e.button === 0 && onSticker && faceletUnder(e) != null) {
        painting = true;
        paintAt(e);
        try { host.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
        e.preventDefault();
        return;
      }
      if (mouse && e.button !== 0 && e.button !== 2) return;   // leave the middle button alone
      if (mouse && e.button === 2) e.preventDefault();
      startDrag(e);
    });
    host.addEventListener('pointermove', function (e) {
      if (painting) { paintAt(e); return; }
      if (!drag) return;
      if (Math.abs(e.clientX - drag.x) > 4 || Math.abs(e.clientY - drag.y) > 4) drag.moved = true;
      view.ry = drag.ry + (e.clientX - drag.x) * 0.6 * drag.flip;
      view.rx = drag.rx - (e.clientY - drag.y) * 0.6;      // no stops: it rolls right over
      applyView();
    });
    host.addEventListener('pointerup', function (e) {
      if (painting) { painting = false; drag = null; return; }
      var wasTap = drag && !drag.moved;
      drag = null;
      if (!wasTap || !onSticker) return;
      paintAt(e);
    });
    host.addEventListener('pointercancel', function () { drag = null; painting = false; });
    window.addEventListener('resize', fit);

    repaint(null); applyView(); fit();
    return {
      set: function (s) { state = new Int8Array(s); repaint(null); },
      get: function () { return state; },
      play: play,
      busy: function () { return busy; },
      colours: function (fc) { faceColour = fc; repaint(null); },
      setNames: function (arr) { names = arr; repaint(null); },
      onSticker: function (cb) { onSticker = cb; },
      onView: function (cb) { onView = cb; cb(view.rx, view.ry); },
      focus: function (face) {
        if (face === focusFace) return;
        focusFace = face;
        repaint(null);
      },
      angles: function () { return { rx: view.rx, ry: view.ry }; },
      look: function (rx, ry, smooth) {
        built.cube.style.transition = smooth ? 'transform .55s cubic-bezier(.4,0,.2,1)' : 'none';
        view.rx = rx; view.ry = ry;
        applyView();
      }
    };
  }

  /* ---------------- still figure with an arrow ----------------
   * The arrow sits outside the cube's outline rather than on the face, so it
   * stays readable whichever way the figure is tilted.
   */
  var ARROWS = {
    U: { d: 'M88 14 C66 2, 34 2, 12 14', head: [12, 14, -152] },
    "U'": { d: 'M12 14 C34 2, 66 2, 88 14', head: [88, 14, -28] },
    D: { d: 'M12 88 C34 99, 66 99, 88 88', head: [88, 88, -28] },
    "D'": { d: 'M88 88 C66 99, 34 99, 12 88', head: [12, 88, -152] },
    R: { d: 'M90 88 C99 66, 99 34, 90 12', head: [90, 12, -62] },
    "R'": { d: 'M90 12 C99 34, 99 66, 90 88', head: [90, 88, 62] },
    L: { d: 'M10 12 C1 34, 1 66, 10 88', head: [10, 88, 118] },
    "L'": { d: 'M10 88 C1 66, 1 34, 10 12', head: [10, 12, -118] },
    F: { d: 'M24 74 A30 30 0 1 1 76 74', head: [76, 74, 50] },
    "F'": { d: 'M76 74 A30 30 0 1 0 24 74', head: [24, 74, 130] },
    B: { d: 'M28 72 A26 26 0 1 0 72 72', head: [28, 72, -130], dash: 1 },
    "B'": { d: 'M72 72 A26 26 0 1 1 28 72', head: [72, 72, -50], dash: 1 }
  };
  function arrowSvg(move) {
    var key = move.length > 1 && move[1] === '2' ? move[0] : move;
    var a = ARROWS[key] || ARROWS[move[0]];
    if (!a) return '';
    var head = a.head;
    return '<svg class="fig-arrow" viewBox="0 0 100 100" aria-hidden="true">' +
      '<path d="' + a.d + '" fill="none" stroke="#111622" stroke-width="9" stroke-linecap="round"' +
      (a.dash ? ' stroke-dasharray="7 5"' : '') + ' opacity=".22"/>' +
      '<path d="' + a.d + '" fill="none" stroke="#00a7bd" stroke-width="6" stroke-linecap="round"' +
      (a.dash ? ' stroke-dasharray="7 5"' : '') + '/>' +
      '<path d="M0 -8 L12 0 L0 8 Z" fill="#00a7bd" stroke="#0b3b43" stroke-width="1" transform="translate(' + head[0] + ',' + head[1] + ') rotate(' + head[2] + ')"/>' +
      '</svg>';
  }

  /**
   * @param {Int8Array} state the cube to draw
   * @param {object} [opts] size, faceColour, mask(faceletIndex), move (draws the arrow
   *   and lights up the layer that turns), caption
   */
  function figure(state, opts) {
    opts = opts || {};
    var size = opts.size || 104;
    var wrap = document.createElement('div');
    wrap.className = 'fig';
    wrap.style.width = size + 'px';
    var box = document.createElement('div');
    box.className = 'fig-box';
    box.style.height = size + 'px';
    wrap.appendChild(box);
    var stage = document.createElement('div');
    stage.className = 'fig-stage';
    box.appendChild(stage);
    var built = build(stage);
    var g = opts.move ? geoOf(opts.move) : null;
    paint(built.cubies, state, opts.faceColour || STANDARD, { mask: opts.mask, highlight: g });
    built.cube.style.transform = 'rotateX(' + (opts.rx == null ? -22 : opts.rx) + 'deg) rotateY(' + (opts.ry == null ? -32 : opts.ry) + 'deg)';
    built.cube.style.scale = size / 245;
    if (opts.move) box.insertAdjacentHTML('beforeend', arrowSvg(opts.move));
    var half = opts.move && opts.move.length > 1 && opts.move[1] === '2';
    if (opts.caption || half) {
      var cap = document.createElement('p');
      cap.className = 'fig-cap';
      var twice = window.CubeLang ? window.CubeLang.t('steps.twice') : 'turn it twice';
      cap.textContent = (opts.caption || '') + (half ? ' ' + twice : '');
      wrap.appendChild(cap);
    }
    return wrap;
  }

  window.CubeView = { create: create, figure: figure, HEX: HEX, STANDARD: STANDARD, geoOf: geoOf };
})();
