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

  function faceTransform(f, distance) {
    var h = distance == null ? S / 2 : distance;
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
    var arrows = document.createElement('div');
    arrows.className = 'repair-arrows';
    arrows.setAttribute('aria-hidden', 'true');
    host.appendChild(arrows);
    return { cube: cube, cubies: cubies, arrows: arrows };
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
        el.classList.toggle('is-moving', !!opts.highlight && inLayer);
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
  function create(host, faceColour, options) {
    options = options || {};
    faceColour = faceColour || STANDARD;
    // The whole mat accepts drags; the smaller stage still controls cube sizing.
    var surface = host.closest('.cap-model, .mat') || host;
    var built = build(host), state = L.solvedState(), busy = false;
    // One glow plane per side lets the focus fade between faces as we spin.
    // These follow the cube in 3D and never intercept sticker painting or dragging.
    var lights = {};
    ['U', 'D', 'R', 'L', 'F', 'B'].forEach(function (f) {
      var light = document.createElement('div');
      light.className = 'face-light';
      light.setAttribute('aria-hidden', 'true');
      light.style.transform = faceTransform(f, CUBE / 2 + 1);
      built.cube.appendChild(light);
      lights[f] = light;
    });
    var names = null;          // when set, the cube is drawn from colour names instead
    var focusFace = null;      // the side the camera will write onto
    var onView = null;
    var view = { rx: -22, ry: -32 };
    var hintFace = null, hintTimer = 0, demo = null, repair = null;
    // Squares that keep an arrow for as long as they are round the back, outside
    // of any validation: the centre picker points at the sides still to colour.
    var pointers = [];

    function clearHints() {
      clearTimeout(hintTimer);
      hintTimer = 0;
      hintFace = null;
      built.cubies.forEach(function (c) {
        Object.keys(c.faces).forEach(function (f) { c.faces[f].classList.remove('needs-colour'); });
      });
      built.cube.querySelectorAll('.missing-pointer').forEach(function (el) { el.remove(); });
    }

    function markMissing(el, active) {
      el.classList.toggle('needs-colour', active);
      var pointer = el.querySelector('.missing-pointer');
      if (!active) { if (pointer) pointer.remove(); return; }
      if (pointer) return;
      pointer = document.createElement('div');
      pointer.className = 'missing-pointer';
      pointer.setAttribute('aria-hidden', 'true');
      function plane(kind, transform, colour) {
        var side = document.createElement('span');
        side.className = 'pointer-' + kind;
        side.style.transform = transform;
        side.style.background = colour;
        pointer.appendChild(side);
      }
      // The tip sits just above the sticker; the shaft extends out along its
      // normal. Each flat polygon remains in the cube's shared 3D scene.
      ['#f04444', '#b6192b', '#d52636', '#ff7770'].forEach(function (colour, i) {
        var turn = 'rotateZ(' + (i * 90) + 'deg) ';
        plane('head', turn + 'translate3d(-9px,0,2px) rotateX(90deg)', colour);
        plane('shaft', turn + 'translate3d(-2px,-2px,22px) rotateX(90deg)', colour);
      });
      plane('cap', 'translate3d(-2px,-2px,44px)', '#ffaaa1');
      el.appendChild(pointer);
    }

    // Equivalent views keep the turn short even after the child has rolled the
    // cube upside down or spun it through several full revolutions.
    function facingAngles(face) {
      function near(angle, current) { return angle + 360 * Math.round((current - angle) / 360); }
      var candidates;
      if (face === 'U' || face === 'D') {
        candidates = [{ rx: near(face === 'U' ? -56 : 56, view.rx), ry: view.ry }];
      } else {
        var y = { F: 0, R: -90, B: 180, L: 90 }[face];
        candidates = [
          { rx: near(-24, view.rx), ry: near(y - 28, view.ry) },
          { rx: near(156, view.rx), ry: near(y + 208, view.ry) }
        ];
      }
      candidates.forEach(function (a) { a.distance = Math.pow(a.rx - view.rx, 2) + Math.pow(a.ry - view.ry, 2); });
      return candidates.sort(function (a, b) { return a.distance - b.distance; })[0];
    }

    var TURN_MS = 550, TURN_EASE = 'cubic-bezier(.4,0,.2,1)';
    function pose(rx, ry) { return 'rotateX(' + rx + 'deg) rotateY(' + ry + 'deg)'; }
    function look(rx, ry, smooth) {
      var from = pose(view.rx, view.ry), to = pose(rx, ry);
      built.cube.style.transition = 'none';
      view.rx = rx; view.ry = ry;
      applyView(smooth);
      if (!smooth || from === to || !built.cube.animate) return;
      var turning = built.cube.animate([{ transform: from }, { transform: to }],
        { duration: TURN_MS, easing: TURN_EASE });
      if (!built.arrows || !turning) return;
      built.arrows.classList.add('is-turning');
      turning.onfinish = turning.oncancel = function () {
        built.arrows.classList.remove('is-turning');
      };
    }

    function showMissing() {
      clearHints();
      if (!names) return;
      var missing = L.FACE_ORDER.filter(function (f, i) {
        return names.slice(i * 9, i * 9 + 9).some(function (n) { return !n; });
      }).map(function (f) { return { face: f, angles: facingAngles(f) }; });
      if (!missing.length) return;
      missing.sort(function (a, b) {
        return Number(b.face === focusFace) - Number(a.face === focusFace) || a.angles.distance - b.angles.distance;
      });
      var next = missing[0];
      // Restart the brief cue when Solve is pressed again before it has faded.
      void built.cube.offsetWidth;
      hintFace = next.face;
      look(next.angles.rx, next.angles.ry, true);
      repaint(null);
      // Let the .55s turn settle, then show exactly two .85s pulses.
      hintTimer = setTimeout(clearHints, 2250);
    }

    function applyView(smooth) {
      built.cube.style.transform = pose(view.rx, view.ry);
      drawArrows();
      if (onView) onView(view.rx, view.ry, facingFace(view.rx, view.ry), !!smooth);
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
          el.style.boxShadow = n ? 'none' : 'inset 0 0 0 2px rgba(255,255,255,.18)';
          el.classList.toggle('is-focused', f === focusFace);
          el.classList.toggle('validation-target', !!repair && repair.indices.indexOf(idx) >= 0);
          markMissing(el, (!n && f === hintFace) || (!!repair && repair.point && repair.indices.indexOf(idx) >= 0));
        });
      });
    }
    function fit() {
      var w = host.clientWidth || 300;
      if (host.id === 'guide-centre-cube') {
        built.cube.style.scale = Math.max(0.25, Math.min(w, host.clientHeight || 250) / 200);
        return;
      }
      if (host.id === 'coach-cube') w = Math.min(w, host.clientHeight || 300);
      built.cube.style.scale = host.id === 'coach-cube' ? Math.max(0.25, w / 230) : Math.max(0.7, Math.min(1.7, w / 230));
    }
    function repaint(highlight) {
      var litFace = names && !repair ? focusFace : null;
      built.cube.classList.toggle('has-focus', !!litFace);
      built.cube.classList.toggle('has-move', !!highlight);
      Object.keys(lights).forEach(function (f) {
        lights[f].classList.toggle('is-lit', f === litFace);
      });
      if (names) paintByName();
      else paint(built.cubies, state, faceColour, { highlight: highlight });
    }

    function play(move, ms, options) {
      if (busy) return Promise.resolve();
      options = options || {};
      // Continue a matching preview by default. The coach requests a full
      // replay so every confirmation includes a clearly visible rotation.
      var shownAngle = demo && demo.move === move ? demo.angle : 0;
      var startAngle = options.fromStart ? 0 : shownAngle;
      stopDemo();
      return new Promise(function (done) {
        var g = geoOf(move);
        if (!g || busy) { done(); return; }
        busy = true;
        var target = 90 * g.quarters * g.d * CSS_SIGN[g.axis];
        var fn = g.axis === 'x' ? 'rotateX' : g.axis === 'y' ? 'rotateY' : 'rotateZ';
        var group = built.cubies.filter(function (c) { return layerHit(c.pos, g); });
        // Automatic previews respect reduced motion. A requested instructional
        // turn can opt in to animation so the child can actually follow it.
        var reduce = !options.animate && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        var resetPreview = options.fromStart && shownAngle !== 0 && !reduce;
        var guides = options.fromStart ? addTurnGuides(g, built.cube) : [];
        function pose(angle) {
          var rotation = fn + '(' + angle + 'deg) ';
          group.forEach(function (c) { c.el.style.transform = rotation + base(c.pos); });
          rotateTurnGuides(guides, rotation);
        }
        pose(resetPreview ? shownAngle : startAngle);
        repaint(g);
        var remaining = Math.abs(target - startAngle) / 90;
        var dur = reduce ? 1 : Math.max(1, (ms || 620) * remaining), t0 = performance.now();
        var hold = reduce ? 0 : (options.hold || 0);
        var settled = false, frame = 0, timer = 0;
        var transition = built.cube.style.transition;
        /* A hidden tab stops serving animation frames, so the turn also has a
         * timer behind it — otherwise the lesson would wait for ever. */
        var safety = setTimeout(finish, (resetPreview ? 280 : 0) + dur + hold + 400);
        function finish() {
          if (settled) return;
          settled = true;
          clearTimeout(safety);
          clearTimeout(timer);
          cancelAnimationFrame(frame);
          guides.forEach(function (el) { el.remove(); });
          built.cube.style.opacity = '';
          built.cube.style.transition = transition;
          state = L.applyMoves(state, [move]);
          group.forEach(function (c) { c.el.style.transform = base(c.pos); });
          repaint(null);
          busy = false;
          done();
        }
        function animate(now) {
          if (settled) return;
          var t = Math.min(1, (now - t0) / dur);
          var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
          var angle = startAngle + (target - startAngle) * e;
          pose(angle);
          if (t < 1) frame = requestAnimationFrame(animate);
          else if (hold) timer = setTimeout(finish, hold);
          else finish();
        }
        function startTurn() {
          t0 = performance.now();
          frame = requestAnimationFrame(animate);
        }
        if (resetPreview) {
          // Always show a full confirmation turn, even when the preview has
          // already reached 90 degrees. Conceal its reset rather than reversing.
          built.cube.style.transition = 'opacity 140ms ease';
          built.cube.style.opacity = '0';
          timer = setTimeout(function () {
            pose(0);
            built.cube.style.opacity = '1';
            timer = setTimeout(startTurn, 140);
          }, 140);
        } else startTurn();
      });
    }

    // Preview turns never change state. Each repeat starts from the same cube;
    // the coach commits a turn only when the child confirms it.
    function stopDemo() {
      stopRepair();
      if (!demo) return;
      clearTimeout(demo.timer);
      cancelAnimationFrame(demo.frame);
      demo.guides.forEach(function (el) { el.remove(); });
      demo = null;
      built.cubies.forEach(function (c) { c.el.style.transform = base(c.pos); });
      built.cube.classList.remove('demonstrating', 'demo-reset');
      delete host.dataset.demoPhase;
      repaint(null);
    }

    function demonstrate(move) {
      stopDemo();
      var g = geoOf(move);
      if (!g || busy) return;
      var group = built.cubies.filter(function (c) { return layerHit(c.pos, g); });
      var run = { timer: 0, frame: 0, guides: [], move: move, angle: 0 };
      demo = run;
      built.cube.classList.add('demonstrating');
      repaint(g);
      addTurnGuides(g, built.cube).forEach(function (el) { run.guides.push(el); });
      function later(fn, ms) {
        run.timer = setTimeout(function () { if (demo === run) fn(); }, ms);
      }
      function phase(name) { host.dataset.demoPhase = name; }
      function reset() {
        phase('reset');
        // Hide the reset rather than teaching an extra turn in reverse.
        built.cube.classList.add('demo-reset');
        later(function () {
          group.forEach(function (c) { c.el.style.transform = base(c.pos); });
          rotateTurnGuides(run.guides, '');
          run.angle = 0;
          later(function () {
            built.cube.classList.remove('demo-reset');
            begin();
          }, 80);
        }, 180);
      }
      function turn(quarter) {
        phase('turn');
        var start = performance.now(), duration = 1000;
        var fn = g.axis === 'x' ? 'rotateX' : g.axis === 'y' ? 'rotateY' : 'rotateZ';
        run.frame = requestAnimationFrame(function frame(now) {
          if (demo !== run) return;
          var t = Math.min(1, (now - start) / duration);
          var ease = t * t * (3 - 2 * t);
          var angle = 90 * (quarter + ease) * g.d * CSS_SIGN[g.axis];
          run.angle = angle;
          var rotation = fn + '(' + angle + 'deg) ';
          group.forEach(function (c) { c.el.style.transform = rotation + base(c.pos); });
          rotateTurnGuides(run.guides, rotation);
          if (t < 1) run.frame = requestAnimationFrame(frame);
          else if (quarter + 1 < g.quarters) later(function () { turn(quarter + 1); }, 300);
          else { phase('hold'); later(reset, 950); }
        });
      }
      function begin() {
        phase('focus');
        later(function () {
          if (document.hidden) { begin(); return; }
          turn(0);
        }, 750);
      }
      phase('focus');
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) begin();
    }

    function stopRepair() {
      if (!repair) return;
      var old = repair;
      repair = null;
      built.cube.classList.remove('repairing');
      delete host.dataset.validationPhase;
      clearHints(); repaint(null); drawArrows();
      if (old.onPhase) old.onPhase('stopped');
    }

    /* A curved arrow for a marked square that is round the back. Reading comes
     * later than seeing for a child, and spinning the cube is the answer in
     * either case, so the arrow says what the hint says without words. It is
     * redrawn at every angle: the square it points at may come into view, and
     * the one on the far side goes out of it.
     *
     * It points at the square itself, not at the side the square is on: it
     * stands outside the cube on the square's own line and its head faces back
     * in, at the spot the square sits behind. */
    var ARROW_SIZE = 52, ARROW_CLEAR = 30;
    function arrowTowards(angle, radius) {
      var span = document.createElement('span');
      span.className = 'repair-arrow';
      span.style.transform = 'translate(-50%, -50%) rotate(' + Math.round(angle) +
        'deg) translateX(' + Math.round(radius) + 'px)';
      // One even bend, like a hand sweeping round the cube: it comes in from
      // outside, turns, and runs level into the head, which lies on the line
      // to the square.
      span.innerHTML = '<svg viewBox="0 0 48 48" focusable="false">' +
        '<path class="repair-arrow-bend" d="M41 5 C 41 18, 33 26, 13 26" />' +
        '<path class="repair-arrow-tip" d="M16 17 L3 26 L16 35 Z" /></svg>';
      return span;
    }
    /* Where a square itself lands on the screen, behind the cube or not: the
     * cubie it belongs to, plus half a cubie out along its own side. */
    function squareAt(idx) {
      var facelet = L.FACELETS[idx];
      var n = L.FACELETS[L.FACE_INDEX[facelet.face] * 9 + 4].pos;
      var at = faceAt([facelet.pos[0] * S + n[0] * S / 2,
        facelet.pos[1] * S + n[1] * S / 2,
        facelet.pos[2] * S + n[2] * S / 2], view.rx, view.ry);
      var scale = Number(built.cube.style.scale) || 1;
      var near = DEPTH / Math.max(DEPTH - at.z * scale, 1);
      return { x: at.x * scale * near, y: at.y * scale * near };
    }
    /* Just outside the cube's outline and never off the mat. The outline is
     * the eight corners as they fall on the screen, since the cube is drawn at
     * whatever size the mat allows and in perspective, and a box around the
     * cube element alone says nothing about where its corners reach. */
    var HALF = CUBE / 2, DEPTH = 900;
    function arrowRadius(angle) {
      var scale = Number(built.cube.style.scale) || 1;
      var across = Math.cos(angle), down = Math.sin(angle), reach = 0;
      for (var i = 0; i < 8; i++) {
        var at = faceAt([i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1], view.rx, view.ry);
        // faceAt works in the same cube space the cubies are placed in, where
        // the screen is x right, y down and z towards the child.
        var near = DEPTH / Math.max(DEPTH - at.z * HALF * scale, 1);
        reach = Math.max(reach, (at.x * across + at.y * down) * HALF * scale * near);
      }
      // The whole arrow has to stay on the mat, head included; against a cube
      // that fills its mat it then lies over the edge rather than beyond it.
      var mat = host.getBoundingClientRect ? host.getBoundingClientRect() : null;
      var room = (mat && mat.width ? Math.min(mat.width, mat.height) / 2 : 150) - ARROW_SIZE / 2 - 4;
      return Math.max(70, Math.min(reach + ARROW_CLEAR, room));
    }
    function drawArrows() {
      if (!built.arrows) return;
      built.arrows.innerHTML = '';
      var marked = repair && repair.arrows ? pointers.concat(repair.indices) : pointers;
      marked.forEach(function (idx) {
        var side = faceAt(L.FACELETS[L.FACE_INDEX[L.FACELETS[idx].face] * 9 + 4].pos, view.rx, view.ry);
        if (side.z >= AIM_SEEN) return;
        // A square straight behind the middle of the cube gives no direction
        // of its own, and then the side it is on is all there is to go by.
        var spot = squareAt(idx);
        var angle = Math.sqrt(spot.x * spot.x + spot.y * spot.y) > 12
          ? Math.atan2(spot.y, spot.x) : Math.atan2(side.y, side.x);
        built.arrows.appendChild(arrowTowards(angle * 180 / Math.PI, arrowRadius(angle)));
      });
    }

    /**
     * Turn the cube to the pieces the validator is unsure about and light
     * them up. The colours stay exactly as the child entered them: the
     * suggested colours are drawn on a second cube beside this one, at the
     * same angle, so the two can be held up against the real cube.
     *
     * @param {object} options indices (the stickers in question), pieces,
     *   point (add a pointer at each one, for a problem with no suggestion),
     *   animate (turn there even when reduced motion is asked for),
     *   hold (leave the angle alone: this cube is following another one),
     *   arrows (point at any of them that end up round the back)
     * @returns {object} the angle chosen and how many stickers it leaves
     *   hidden, or nothing if there was nothing to show
     */
    function showRepair(options, onPhase) {
      stopDemo(); clearHints();
      if (!names || !options.indices || !options.indices.length) return;
      repair = { indices: options.indices.slice(), pieces: options.pieces || [],
        point: !!options.point, arrows: !!options.arrows, onPhase: onPhase };
      built.cube.classList.add('repairing');
      function near(angle, current) { return angle + 360 * Math.round((current - angle) / 360); }
      var reduce = !options.animate && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var aim = aimAngles(repair.indices, repair.pieces, view);
      if (!options.hold) look(near(aim.rx, view.rx), near(aim.ry, view.ry), !reduce);
      repaint(null); drawArrows();
      host.dataset.validationPhase = 'focus';
      if (onPhase) onPhase('focus');
      return aim;
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
      var repairing = !!repair;
      if (repairing) stopRepair();
      var idx = faceletUnder(e);
      if (repairing && document.elementFromPoint) {
        var hit = document.elementFromPoint(e.clientX, e.clientY);
        idx = hit && hit.dataset && hit.dataset.facelet != null ? Number(hit.dataset.facelet) : null;
      }
      if (idx != null) onSticker(idx);
    }
    function startDrag(e) {
      /* Upside down, a sideways drag would otherwise appear to go the wrong way,
       * so the direction is taken from the tilt the drag started at. */
      var flip = Math.cos(view.rx * Math.PI / 180) < 0 ? -1 : 1;
      drag = { x: e.clientX, y: e.clientY, rx: view.rx, ry: view.ry, moved: false, flip: flip };
      built.cube.style.transition = 'none';
      try { surface.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
    }

    surface.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.cam-dock')) return;
      var mouse = e.pointerType === 'mouse';
      if (mouse && e.button === 0 && onSticker && !options.tapToSelect && faceletUnder(e) != null) {
        // singlePaint: one square per click. Used where a square holds a choice
        // rather than a colour to be spread over a side.
        painting = !options.singlePaint;
        paintAt(e);
        try { surface.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
        e.preventDefault();
        return;
      }
      if (mouse && e.button !== 0 && e.button !== 2) return;   // leave the middle button alone
      if (mouse && e.button === 2) e.preventDefault();
      // Spinning the cube is how a diagnosis is looked at from another side,
      // so the highlight stays; only painting a sticker dismisses it.
      startDrag(e);
    });
    surface.addEventListener('pointermove', function (e) {
      if (painting) { paintAt(e); return; }
      if (!drag) return;
      if (Math.abs(e.clientX - drag.x) > 4 || Math.abs(e.clientY - drag.y) > 4) drag.moved = true;
      view.ry = drag.ry + (e.clientX - drag.x) * 0.6 * drag.flip;
      view.rx = drag.rx - (e.clientY - drag.y) * 0.6;      // no stops: it rolls right over
      applyView();
    });
    surface.addEventListener('pointerup', function (e) {
      if (painting) { painting = false; drag = null; return; }
      var wasTap = drag && !drag.moved;
      drag = null;
      if (!wasTap || !onSticker) return;
      paintAt(e);
    });
    surface.addEventListener('pointercancel', function () { drag = null; painting = false; });
    window.addEventListener('resize', fit);
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fit).observe(host);

    repaint(null); applyView(); fit();
    return {
      set: function (s) { stopDemo(); state = new Int8Array(s); repaint(null); },
      get: function () { return state; },
      play: play,
      demonstrate: demonstrate,
      stopDemo: stopDemo,
      busy: function () { return busy; },
      colours: function (fc) { stopDemo(); faceColour = fc; repaint(null); },
      setNames: function (arr) { stopDemo(); if (arr !== names) clearHints(); names = arr; repaint(null); },
      showMissing: showMissing,
      /** Point a curved arrow at each of these squares whenever it is hidden. */
      pointAt: function (indices) {
        pointers = indices ? indices.slice() : [];
        drawArrows();
      },
      showRepair: showRepair,
      stopRepair: stopRepair,
      onSticker: function (cb) { onSticker = cb; },
      onView: function (cb) { onView = cb; cb(view.rx, view.ry, facingFace(view.rx, view.ry)); },
      flash: function () {
        host.classList.remove('read-flash');
        void host.offsetWidth;
        host.classList.add('read-flash');
      },
      focus: function (face) {
        if (face === focusFace) return;
        focusFace = face;
        repaint(null);
      },
      angles: function () { return { rx: view.rx, ry: view.ry }; },
      look: look,
      lookFace: function (face, smooth) {
        var angles = facingAngles(face);
        look(angles.rx, angles.ry, smooth);
      }
    };
  }

  /**
   * Where a side's outward normal lands once the cube is turned: z is how far
   * it leans towards the child (1 facing them), and x and y are which way it
   * lies on the screen, x to the right and y downwards.
   */
  function faceAt(n, rx, ry) {
    var x = rx * Math.PI / 180, y = ry * Math.PI / 180;
    var flat = -n[0] * Math.sin(y) + n[2] * Math.cos(y);
    return {
      x: n[0] * Math.cos(y) + n[2] * Math.sin(y),
      y: -n[1] * Math.cos(x) - flat * Math.sin(x),
      z: -n[1] * Math.sin(x) + flat * Math.cos(x)
    };
  }
  function faceDepth(n, rx, ry) { return faceAt(n, rx, ry).z; }

  // The face whose outward normal points most directly towards the viewer.
  function facingFace(rx, ry) {
    var best = null, score = -Infinity;
    L.FACE_ORDER.forEach(function (face, i) {
      var z = faceDepth(L.FACELETS[i * 9 + 4].pos, rx, ry);
      if (z > score) { best = face; score = z; }
    });
    return best;
  }

  // Always some tilt, so the cube keeps its corner-on look rather than
  // flattening into a single square.
  var AIM_TILTS = [-42, -34, -26, -16, 16, 26, 34, 42];
  // Below this the side is too edge-on to read a colour off.
  var AIM_SEEN = 0.3;

  /**
   * An angle showing as much of these stickers as a cube can show at once.
   * Aiming at the first of them turns the rest out of sight, and a difference
   * the child cannot see is one they cannot copy.
   *
   * No cube shows opposite sides at once, so something sometimes has to stay
   * hidden. Which one matters: a piece with every sticker round the back has
   * gone missing from the comparison altogether, while a piece still showing
   * one square can at least be found. So views are judged first on how many of
   * the pieces they leave something of, then on how many stickers in all, then
   * on how squarely those face the child, and last on how little the cube has
   * to turn to get there.
   */
  function aimAngles(indices, pieces, at) {
    var groups = [], held = {};
    function normalOf(idx) {
      return L.FACELETS[L.FACE_INDEX[L.FACELETS[idx].face] * 9 + 4].pos;
    }
    (pieces || []).forEach(function (piece) {
      var group = [];
      piece.forEach(function (idx) {
        if (indices.indexOf(idx) < 0) return;
        held[idx] = true;
        group.push(normalOf(idx));
      });
      if (group.length) groups.push(group);
    });
    indices.forEach(function (idx) { if (!held[idx]) groups.push([normalOf(idx)]); });
    var best = null;
    for (var i = 0; i < AIM_TILTS.length; i++) {
      for (var ry = -177; ry < 180; ry += 6) {
        var rx = AIM_TILTS[i], kept = 0, seen = 0, worst = Infinity, total = 0, top = -Infinity;
        for (var g = 0; g < groups.length; g++) {
          var any = false;
          for (var j = 0; j < groups[g].length; j++) {
            var z = faceDepth(groups[g][j], rx, ry);
            if (z > top) top = z;
            if (z < AIM_SEEN) continue;
            any = true; seen++; total += z;
            if (z < worst) worst = z;
          }
          if (any) kept++;
        }
        if (!seen) { worst = top; total = top; }
        var away = Math.abs(rx - at.rx) + Math.abs(((ry - at.ry) % 360 + 540) % 360 - 180);
        var score = kept * 1000 + seen * 10 + worst + 0.2 * (total / Math.max(seen, 1)) - away * 0.0005;
        if (!best || score > best.score) {
          best = { rx: rx, ry: ry, score: score, seen: seen, hidden: indices.length - seen };
        }
      }
    }
    return best;
  }

  function rotateTurnGuides(guides, rotation) {
    guides.forEach(function (el) {
      el.style.transform = rotation + faceTransform(el.dataset.face, CUBE / 2 + 5);
    });
  }

  // Place cues in the cube's own 3D scene, so they stay on the right row or
  // column when dragged. Four strip arrows cover the sides around a turn;
  // the fifth cue shows clockwise/counterclockwise on the turning face.
  function addTurnGuides(g, cube) {
    var guides = [];
    function add(face, path, transform) {
      var el = document.createElement('div');
      el.className = 'turn-guide';
      el.dataset.face = face;
      el.setAttribute('aria-hidden', 'true');
      el.style.transform = faceTransform(face, CUBE / 2 + 5);
      el.innerHTML = '<svg viewBox="-66 -66 132 132"><g transform="' + transform + '">' +
        '<path class="turn-guide-shadow" d="' + path + '"/>' +
        '<path class="turn-guide-ink" d="' + path + '"/></g></svg>';
      cube.appendChild(el);
      guides.push(el);
    }
    var ring = 'M0 -42 A42 42 0 1 1 -42 0 M-53 12 L-42 0 L-30 10';
    add(g.face, ring, g.prime ? 'scale(-1 1)' : '');
    L.FACE_ORDER.forEach(function (face) {
      var cells = L.FACELETS.filter(function (f) { return f.face === face && layerHit(f.pos, g); });
      if (cells.length !== 3) return;
      var middle = cells[1], p = middle.pos;
      // Model rotation uses -d. Project its tangent onto this face's own
      // horizontal and vertical axes, taken from the facelet grid itself.
      var velocity = g.axis === 'x' ? [0, g.d * p[2], -g.d * p[1]]
        : g.axis === 'y' ? [-g.d * p[2], 0, g.d * p[0]]
          : [g.d * p[1], -g.d * p[0], 0];
      var grid = L.FACELETS.slice(L.FACE_INDEX[face] * 9, L.FACE_INDEX[face] * 9 + 9);
      function along(a, b) {
        return velocity.reduce(function (sum, v, i) { return sum + v * (grid[b].pos[i] - grid[a].pos[i]); }, 0);
      }
      var angle = Math.atan2(along(4, 7), along(4, 5)) * 180 / Math.PI;
      add(face, 'M-32 0 H30 M18 -12 L30 0 L18 12',
        'translate(' + ((middle.col - 1) * S) + ' ' + ((middle.row - 1) * S) + ') rotate(' + angle + ')');
    });
    return guides;
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
   *   and lights up the layer that turns), caption, rx/ry (the angle to draw it from)
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

  /**
   * A pencil cursor in the colour being painted, so a child can see what they
   * are about to put down before they put it down.
   */
  function pencilCursor(colour) {
    var tip = 'M3.5,28.5 11.6,25.9 6.1,20.4 Z';
    var body = 'M11.6,25.9 6.1,20.4 18.4,8.1 23.9,13.6 Z';
    var cap = 'M18.4,8.1 23.9,13.6 27.5,10 22,4.5 Z';
    var shapes = '<path d="' + tip + '"/><path d="' + body + '"/><path d="' + cap + '"/>';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">' +
      '<g fill="none" stroke="#ffffff" stroke-width="4" stroke-linejoin="round">' + shapes + '</g>' +
      '<g stroke="#1b2130" stroke-width="1.5" stroke-linejoin="round">' +
      '<path d="' + tip + '" fill="#f6e3c0"/>' +
      '<path d="' + body + '" fill="' + HEX[colour] + '"/>' +
      '<path d="' + cap + '" fill="#8d94a6"/>' +
      '</g></svg>';
    return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '") 3 29, crosshair';
  }

  window.CubeView = { create: create, figure: figure, HEX: HEX, STANDARD: STANDARD, geoOf: geoOf, pencilCursor: pencilCursor };
})();
