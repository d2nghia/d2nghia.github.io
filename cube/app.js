/**
 * Cube Coach — read a child's cube through the camera, then hand out one turn
 * at a time in plain words.
 *
 * Three pieces: a camera capture flow that confirms each face before moving on,
 * a sticker editor that doubles as the fix-up screen and the no-camera path,
 * and a coach that walks the solver's moves on a 3D model of their own cube.
 */
(function () {
  'use strict';
  var L = window.CubeLib;

  var COLORS = ['white', 'yellow', 'green', 'blue', 'red', 'orange'];
  var HEX = {
    white: '#fafafa', yellow: '#ffd400', green: '#00a550',
    blue: '#1769d6', red: '#e1372b', orange: '#ff8400'
  };
  var DEFAULT_CENTRES = { U: 'white', R: 'red', F: 'green', D: 'yellow', L: 'orange', B: 'blue' };

  var K = window.CubeCapture;
  var LANG = window.CubeLang;
  var t = LANG.t;
  var $ = function (id) { return document.getElementById(id); };
  function show(screen) {
    ['start', 'capture', 'check', 'coach', 'done'].forEach(function (s) {
      $('screen-' + s).hidden = s !== screen;
    });
    window.scrollTo(0, 0);
  }

  /* ================= sticker grids ================= */
  function makeGrid(host, get, set, opts) {
    opts = opts || {};
    host.innerHTML = '';
    var cells = [];
    for (var i = 0; i < 9; i++) {
      var b = document.createElement('button');
      b.type = 'button';
      if (i === 4) b.className = 'centre';
      b.setAttribute('aria-label', 'sticker ' + (i + 1));
      (function (i, b) {
        b.onclick = function () { set(i); render(); };
      })(i, b);
      host.appendChild(b);
      cells.push(b);
    }
    function render() {
      for (var i = 0; i < 9; i++) {
        var c = get(i);
        cells[i].style.background = c ? HEX[c] : 'var(--c-none)';
        cells[i].setAttribute('aria-pressed', opts.selected && opts.selected() === i ? 'true' : 'false');
      }
    }
    render();
    return { render: render };
  }

  function makePalette(host, onPick, initial) {
    host.innerHTML = '';
    var current = initial || 'white', buttons = {};
    COLORS.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'sw-' + c;
      b.title = c;
      b.setAttribute('aria-label', c);
      b.onclick = function () { current = c; sync(); onPick(c); };
      host.appendChild(b);
      buttons[c] = b;
    });
    var DARK_TICK = { white: 1, yellow: 1, orange: 1 };
    function sync() {
      COLORS.forEach(function (c) {
        var on = c === current;
        buttons[c].setAttribute('aria-pressed', on ? 'true' : 'false');
        buttons[c].textContent = on ? '✓' : '';
        buttons[c].style.color = DARK_TICK[c] ? '#1b2130' : '#ffffff';
      });
    }
    sync();
    return { get: function () { return current; }, set: function (c) { current = c; sync(); } };
  }

  /* ================= capture flow ================= */
  var names = new Array(54).fill(null);
  var capView = null, capPalette = null;
  var cam = { stream: null, timer: 0, live: false, cells: new Array(9).fill(null), place: null, palette: null, waiting: 0, permission: null, canvas: null, found: null, view: null, history: [], gone: 0, on: false, handFixed: {}, candidate: { key: '', cells: null, streak: 0 } };

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
  function setBrush(colour) {
    var pencil = pencilCursor(colour);
    $('cap-cube').style.cursor = pencil;
    var read = $('cap-colour');
    read.firstElementChild.style.background = HEX[colour];
    read.lastElementChild.textContent = t('cap.painting', { colour: LANG.colour(colour) });
  }

  function paintModel() {
    if (capView) capView.setNames(names);
    $('cap-msg').hidden = true;
    rememberCube();
  }

  /* The colours are kept on this device, so a cube read once does not have to
   * be read again: closing the page, or coming back tomorrow, picks up the
   * same cube. Nothing leaves the browser. */
  var STORE = 'cube-coach/cube';
  function rememberCube() {
    try { localStorage.setItem(STORE, JSON.stringify({ names: names, at: Date.now() })); }
    catch (e) { /* private window, or storage turned off */ }
  }
  function rememberedCube() {
    try {
      var saved = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (!saved || !saved.names || saved.names.length !== 54) return null;
      var any = saved.names.some(function (c) { return c && COLORS.indexOf(c) >= 0; });
      return any ? saved.names.map(function (c) { return COLORS.indexOf(c) >= 0 ? c : null; }) : null;
    } catch (e) { return null; }
  }
  function forgetCube() {
    try { localStorage.removeItem(STORE); } catch (e) { /* nothing to do */ }
  }
  function facesLeft() {
    var left = 0;
    for (var f = 0; f < 6; f++) {
      for (var i = 0; i < 9; i++) if (!names[f * 9 + i]) { left++; break; }
    }
    return left;
  }

  function startCapture(fresh) {
    show('capture');
    if (fresh) { forgetCube(); names = new Array(54).fill(null); }
    else names = rememberedCube() || new Array(54).fill(null);
    if (!capView) {
      capView = window.CubeView.create($('cap-cube'));
      capView.onSticker(function (idx) {
        if (!capPalette) return;
        names[idx] = capPalette.get();
        cam.handFixed[L.FACE_ORDER[Math.floor(idx / 9)]] = true;
        paintModel();
      });
      /* The side facing the child glows: that is the one the camera writes onto. */
      capView.onView(function (rx, ry) {
        capView.focus(K.frameFromView(rx, ry).front);
      });
    }
    if (!capPalette) capPalette = makePalette($('cap-palette'), setBrush, 'white');
    setBrush(capPalette.get());
    $('cap-hint').textContent = t(window.matchMedia('(pointer: coarse)').matches
      ? 'cap.hint.touch' : 'cap.hint.mouse');
    paintModel();
    var done = 6 - facesLeft();
    if (!fresh && done) {
      $('cap-msg').hidden = false;
      $('cap-msg').className = 'small center kept-line';
      $('cap-msg').textContent = done === 6 ? t('cap.kept.all') : t('cap.kept.some', { n: done });
    }
  }

  /* ================= the camera, in the corner of the cube =================
   * No separate screen: a small view sits on the cube's mat, and whatever it
   * reads is painted straight onto the side the cube is showing. Spin to the
   * next side and hold it up again; that is the whole loop.
   */
  function toggleCamera() {
    if (cam.on) stopCamera(); else startCamera();
  }
  function startCamera() {
    cam.on = true;
    cam.found = null;
    cam.history = [];
    cam.candidate = { key: '', cells: null, streak: 0 };
    cam.handFixed = {};
    $('cam-dock').hidden = false;
    $('cap-msg').hidden = true;
    $('cam-status').textContent = t('cam.starting');
    $('cap-open-cam').classList.add('on');
    startStream();
  }
  function stopCamera() {
    cam.on = false;
    stopLive();
    stopStream();
    $('cam-dock').hidden = true;
    $('cap-open-cam').classList.remove('on');
  }

  /**
   * Why the camera did not start. The honest answer matters: a page inside a
   * preview frame is refused without anyone being asked, which is not the same
   * as the child saying no.
   */
  function framed() {
    try { return window.self !== window.top; } catch (e) { return true; }
  }
  function frameAllowsCamera() {
    var policy = document.featurePolicy || document.permissionsPolicy;
    try {
      if (policy && policy.allowsFeature) return policy.allowsFeature('camera');
    } catch (e) { /* not supported */ }
    return null;                                   // cannot tell
  }
  function cameraTrouble(err) {
    var name = err && err.name;
    if (!window.isSecureContext) return t('cam.err.https');
    /* Inside a frame that has not been given the camera, nobody is ever asked —
     * including when the browser reports that as a flat refusal. */
    if (framed() && frameAllowsCamera() !== true) return t('cam.err.frame');
    if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') {
      return t('cam.err.none');
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') return t('cam.err.busy');
    if (name === 'NotAllowedError') return t(cam.permission === 'denied' ? 'cam.err.off' : 'cam.err.refused');
    return t('cam.err.other');
  }

  /** Has this page been told "no" before? Answered quickly, or not at all. */
  function cameraPermission() {
    return new Promise(function (resolve) {
      var done = false;
      function finish(v) { if (!done) { done = true; resolve(v); } }
      setTimeout(function () { finish(null); }, 300);     // never hold the camera up for this
      try {
        if (navigator.permissions && navigator.permissions.query) {
          navigator.permissions.query({ name: 'camera' })
            .then(function (p) { finish(p.state); }, function () { finish(null); });
        } else finish(null);
      } catch (e) { finish(null); }                        // Safari does not answer for the camera
    });
  }

  function startStream() {
    var video = $('cam');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      cameraFailed(cameraTrouble({ name: 'Unsupported' }));
      return;
    }
    cam.permission = null;
    cameraPermission()
      .then(function (state) {
        cam.permission = state;
        return navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
      })
      .then(function (stream) {
        cam.stream = stream;
        video.srcObject = stream;
        return video.play().catch(function () { });
      })
      .then(function () {
        $('cap-msg').hidden = true;
        startLive();
        clearTimeout(cam.waiting);
        /* Permission can be granted and still no picture arrive, which would
         * otherwise leave a black box and nothing happening. */
        cam.waiting = setTimeout(function () {
          if ($('cam').videoWidth) return;
          cameraFailed(t('cam.err.blank'));
        }, 6000);
      })
      .catch(function (err) {
        /* If a stream was already handed over, the camera is not the problem —
         * saying "no camera" would send the child hunting for the wrong thing. */
        cameraFailed(cam.stream ? t('cam.err.ours') : cameraTrouble(err));
      });
  }
  function cameraFailed(text) {
    clearTimeout(cam.waiting);
    stopLive();
    stopStream();
    cam.on = false;
    $('cap-open-cam').classList.remove('on');
    $('cam-dock').hidden = true;
    $('cap-msg').hidden = false;
    $('cap-msg').className = 'small warn-line center';
    $('cap-msg').textContent = text;
  }
  function stopStream() {
    clearTimeout(cam.waiting);
    if (cam.stream) {
      cam.stream.getTracks().forEach(function (t) { t.stop(); });
      cam.stream = null;
    }
    $('cam').srcObject = null;
  }

  function startLive() {
    stopLive();
    cam.live = true;
    $('cam-status').textContent = t('cam.show');
    cam.timer = setInterval(sampleFrame, 180);
  }
  function stopLive() {
    cam.live = false;
    clearInterval(cam.timer);
    cam.timer = 0;
  }

  var REGION = 180;              // the search picture, in pixels
  var SPREAD = 1.45;             // how much of the view to search for the cube

  /** Read the camera, find the face, and paint it onto the side being shown. */
  function sampleFrame() {
    var video = $('cam'), wrap = $('cam-wrap');
    if (!video.videoWidth) return;
    var vw = video.videoWidth, vh = video.videoHeight;
    var w = wrap.clientWidth, h = wrap.clientHeight;
    if (!w || !h) return;
    var scale = Math.max(w / vw, h / vh);                 // object-fit: cover
    var offX = (w - vw * scale) / 2, offY = (h - vh * scale) / 2;
    var guide = Math.round(Math.min(w, h) * 0.72);
    var region = guide * SPREAD;

    var fs = Math.min(region / scale, vw, vh);
    var fx = ((w - region) / 2 - offX) / scale, fy = ((h - region) / 2 - offY) / scale;
    fx = Math.max(0, Math.min(vw - fs, fx));
    fy = Math.max(0, Math.min(vh - fs, fy));

    var canvas = cam.canvas || (cam.canvas = document.createElement('canvas'));
    canvas.width = canvas.height = REGION;
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, fx, fy, fs, fs, 0, 0, REGION, REGION);

    var found = K.readFace(ctx.getImageData(0, 0, REGION, REGION).data, REGION, REGION / SPREAD / 3);
    cam.view = { fx: fx, fy: fy, fs: fs, scale: scale, offX: offX, offY: offY };
    cam.found = found && found.score > 20 ? found : null;
    if (cam.found) {
      cam.history.push({ patches: cam.found.patches, sure: cam.found.sure });
      if (cam.history.length > 5) cam.history.shift();
    } else {
      cam.history.length = 0;
      if (++cam.gone > 4) cam.handFixed = {};          // out of view: start afresh next time
    }
    drawFoundGrid();
    considerReading(cam.found);
  }

  /** Draw the grid that was found, over the little picture. */
  function drawFoundGrid() {
    var wrap = $('cam-wrap'), canvas = $('cam-overlay');
    var w = wrap.clientWidth, h = wrap.clientHeight;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    if (!cam.found || !cam.view) return;
    var v = cam.view, f = cam.found;
    function toScreen(px, py) {
      return [(v.fx + px * v.fs / REGION) * v.scale + v.offX,
      (v.fy + py * v.fs / REGION) * v.scale + v.offY];
    }
    var step = toScreen(f.cell, 0)[0] - toScreen(0, 0)[0];
    ctx.lineWidth = 2;
    for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) {
      var p = toScreen(f.x + (c - 1) * f.cell, f.y + (r - 1) * f.cell);
      var side = step * 0.74;
      ctx.strokeStyle = f.names[r * 3 + c] ? 'rgba(39,224,245,.95)' : 'rgba(255,255,255,.6)';
      ctx.strokeRect(p[0] - side / 2, p[1] - side / 2, side, side);
    }
  }

  /**
   * Keep a reading only once it settles, then paint it onto the side the cube
   * is showing. The side is part of what has to settle: spinning the model
   * while the camera sees the same colours must not drop them on the new side.
   */
  function considerReading(found) {
    if (!found) {
      cam.candidate = { key: '', cells: null, streak: 0 };
      if (cam.live) $('cam-status').textContent = t('cam.show');
      return;
    }
    cam.gone = 0;
    var cells = found.names;
    if (cam.history.length > 1) {
      cells = K.settle(cam.history.map(function (h) { return h.patches; }),
        cam.history.map(function (h) { return h.sure; }));
    }
    var known = cells.filter(function (c) { return c; }).length;
    if (known < 9) {
      cam.candidate = { key: '', cells: null, streak: 0 };
      if (cam.live) $('cam-status').textContent = t('cam.holdstill');
      return;
    }
    var a = capView.angles();
    var place = K.placement(a.rx, a.ry);
    var key = place.face + ':' + cells.join(',');
    if (key === cam.candidate.key) cam.candidate.streak++;
    else cam.candidate = { key: key, cells: cells, streak: 1 };
    if (cam.live) $('cam-status').textContent = t('cam.holdstill');
    if (cam.candidate.streak < 3) return;
    if (cam.handFixed[place.face]) return;             // this side was just corrected by hand
    if (sameAsCube(place, cells)) {
      $('cam-status').textContent = t('cam.side.done', { side: LANG.side(place.face) });
      return;
    }
    applyReading(place, cells);
  }
  function sameAsCube(place, cells) {
    var base = L.FACE_ORDER.indexOf(place.face) * 9;
    for (var j = 0; j < 9; j++) {
      if (names[base + place.fromCamera[j]] !== cells[j]) return false;
    }
    return true;
  }
  function applyReading(place, cells) {
    var base = L.FACE_ORDER.indexOf(place.face) * 9;
    for (var j = 0; j < 9; j++) names[base + place.fromCamera[j]] = cells[j];
    paintModel();
    capView.flash();
    $('cam-status').textContent = t('cam.side.read', { side: LANG.side(place.face) });
  }

  function trySolve() {
    var left = facesLeft();
    if (left > 0) {
      $('cap-msg').hidden = false;
      $('cap-msg').className = 'small warn-line center';
      $('cap-msg').textContent = left === 1 ? t('cap.left.one') : t('cap.left.many', { n: left });
      return;
    }
    stopCamera();
    assemble();
  }

  /* ================= net editor ================= */
  var NET_ORDER = ['U', 'L', 'F', 'R', 'B', 'D'];
  var netPalette, netGrids = {};

  function startManual() {
    L.FACE_ORDER.forEach(function (f) {
      var base = L.FACE_ORDER.indexOf(f) * 9;
      if (!names[base + 4]) names[base + 4] = DEFAULT_CENTRES[f];
    });
    renderNet(t('net.title'), t('net.hint'));
  }

  function renderNet(title, hint) {
    $('check-title').textContent = title;
    $('check-hint').textContent = hint || '';
    $('check-note').className = 'card' + (hint ? ' problem' : '');
    var net = $('net');
    net.innerHTML = '';
    NET_ORDER.forEach(function (f) {
      var slot = document.createElement('div');
      slot.className = 'slot' + (f === 'U' ? ' u' : f === 'D' ? ' d' : '');
      var label = document.createElement('span');
      label.textContent = t('net.face.' + f);
      var g = document.createElement('div');
      g.className = 'grid3';
      slot.appendChild(label);
      slot.appendChild(g);
      net.appendChild(slot);
      var base = L.FACE_ORDER.indexOf(f) * 9;
      netGrids[f] = makeGrid(g,
        function (i) { return names[base + i]; },
        function (i) { names[base + i] = netPalette.get(); });
    });
    if (!netPalette) netPalette = makePalette($('net-palette'), function () { }, 'white');
    show('check');
  }

  /* ================= assemble, check, solve ================= */
  var session = null;

  function assemble() {
    var centres = L.FACE_ORDER.map(function (f, i) { return names[i * 9 + 4]; });
    if (centres.some(function (c) { return !c; })) {
      renderNet(t('net.err.centre'), t('net.err.centre.why'));
      return;
    }
    var distinct = {};
    for (var i = 0; i < 6; i++) {
      if (distinct[centres[i]]) {
        renderNet(t('net.err.same'), t('net.err.same.why', { colour: LANG.colour(centres[i]) }));
        return;
      }
      distinct[centres[i]] = 1;
    }
    var faceOfColour = {};
    centres.forEach(function (c, i) { faceOfColour[c] = i; });

    var state = new Int8Array(54);
    for (i = 0; i < 54; i++) {
      var f = faceOfColour[names[i]];
      if (f == null) {
        renderNet(t('net.err.unknown'), t('net.err.unknown.why'));
        return;
      }
      state[i] = f;
    }
    var check = L.validate(state);
    if (!check.ok) {
      renderNet(t('net.err.impossible'), t('net.err.impossible.why', { hint: check.hint }));
      return;
    }

    solveAndTeach(state, centres.slice());
  }

  /** Turn a checked cube into a lesson. */
  function solveAndTeach(state, faceColour) {
    /* Put white underneath and green in front so the spoken turns match their hands. */
    var seq = L.orientationFor(faceColour, 'white', 'green') || findBottom(faceColour, 'white') || [];
    seq.forEach(function (rot) {
      state = L.rotateState(state, rot);
      faceColour = L.rotateFaces(faceColour, rot);
    });
    var result = L.solve(state);
    if (!result.ok) {
      renderNet(t('net.err.stuck'), t('net.err.stuck.why'));
      return;
    }
    session = { start: state, faceColour: faceColour, moves: result.moves, stages: result.stages, cursor: 0 };
    startCoach();
  }

  /** A scrambled cube to practise on, for anyone without one in their hands. */
  function startDemo() {
    stopCamera();
    var state = L.applyMoves(L.solvedState(), L.randomScramble(30));
    solveAndTeach(state, ['white', 'red', 'green', 'yellow', 'orange', 'blue']);
  }
  function findBottom(faceColour, colour) {
    for (var i = 0; i < L.ORIENTATIONS.length; i++) {
      var f = faceColour;
      L.ORIENTATIONS[i].forEach(function (n) { f = L.rotateFaces(f, n); });
      if (f[L.FACE_INDEX.D] === colour) return L.ORIENTATIONS[i];
    }
    return null;
  }

  /* ================= coach ================= */
  var ARROW = {
    U: '←', "U'": '→', U2: '⇄', D: '→', "D'": '←', D2: '⇄',
    R: '↑', "R'": '↓', R2: '⇅', L: '↓', "L'": '↑', L2: '⇅',
    F: '↻', "F'": '↺', F2: '⇄', B: '←', "B'": '→', B2: '⇄'
  };
  function moveWords(move) { return [t('move.' + move), ARROW[move] || '']; }
  var STAGE_NUMBER = {
    cross: 1, corners: 2, belt: 3, yellowCross: 4, yellowFace: 5, cornerPlace: 6, lastEdges: 7
  };
  function stageInfo(key) {
    return {
      n: STAGE_NUMBER[key], short: t('stage.' + key + '.short'),
      name: t('stage.' + key + '.name'), goal: t('stage.' + key + '.goal')
    };
  }
  var STAGE_KEYS = ['cross', 'corners', 'belt', 'yellowCross', 'yellowFace', 'cornerPlace', 'lastEdges'];
  var cubeView = null;

  function startCoachChrome() {
    var strip = $('stage-strip');
    strip.innerHTML = '';
    STAGE_KEYS.forEach(function (k) {
      var d = document.createElement('div');
      d.textContent = stageInfo(k).short;
      d.dataset.key = k;
      strip.appendChild(d);
    });
    $('coach-hold').innerHTML = '';
    [['bottom', L.FACE_INDEX.D], ['front', L.FACE_INDEX.F]].forEach(function (pair) {
      var c = session.faceColour[pair[1]];
      var chip = document.createElement('span');
      chip.className = 'chip';
      chip.innerHTML = '<b style="background:' + HEX[c] + '"></b> ' +
        t(pair[0] === 'bottom' ? 'coach.chip.bottom' : 'coach.chip.front', { colour: LANG.colour(c) });
      $('coach-hold').appendChild(chip);
    });
    var hint = document.createElement('span');
    hint.className = 'small';
    hint.textContent = t('coach.hold');
    $('coach-hold').appendChild(hint);
  }

  function startCoach() {
    if (!cubeView) cubeView = window.CubeView.create($('coach-cube'), session.faceColour);
    cubeView.colours(session.faceColour);
    cubeView.set(session.start);
    session.cursor = 0;
    var strip = $('stage-strip');
    strip.innerHTML = '';
    STAGE_KEYS.forEach(function (k) {
      var d = document.createElement('div');
      d.textContent = stageInfo(k).short;
      d.dataset.key = k;
      strip.appendChild(d);
    });
    $('coach-hold').innerHTML = '';
    [['bottom', L.FACE_INDEX.D], ['front', L.FACE_INDEX.F]].forEach(function (pair) {
      var c = session.faceColour[pair[1]];
      var chip = document.createElement('span');
      chip.className = 'chip';
      chip.innerHTML = '<b style="background:' + HEX[c] + '"></b> ' +
        t(pair[0] === 'bottom' ? 'coach.chip.bottom' : 'coach.chip.front', { colour: LANG.colour(c) });
      $('coach-hold').appendChild(chip);
    });
    var hint = document.createElement('span');
    hint.className = 'small';
    hint.textContent = t('coach.hold');
    $('coach-hold').appendChild(hint);
    show('coach');
    step(1);
  }

  /** Move the lesson on by one turn (or back by one) and animate it. */
  function step(dir) {
    if (!session || cubeView.busy()) return;
    if (dir > 0) {
      if (session.cursor >= session.moves.length) return;
      var move = session.moves[session.cursor];
      session.cursor++;
      render();
      cubeView.play(move).then(function () {
        if (session.cursor >= session.moves.length) finish();
      });
    } else {
      if (session.cursor === 0) return;
      session.cursor--;
      var back = L.inverse([session.moves[session.cursor]])[0];
      render();
      cubeView.play(back, 380);
    }
  }
  function replay() {
    if (!session || cubeView.busy() || session.cursor === 0) return;
    var move = session.moves[session.cursor - 1];
    var back = L.inverse([move])[0];
    cubeView.play(back, 220).then(function () { return cubeView.play(move); });
  }

  function stateAt(n) { return L.applyMoves(session.start, session.moves.slice(0, n)); }

  function render() {
    var i = session.cursor, total = session.moves.length;
    var current = session.moves[Math.max(0, i - 1)];
    var stageKey = stageOf(Math.max(0, i - 1));
    var info = stageInfo(stageKey);
    var w = moveWords(current);
    $('coach-word').innerHTML = '<span class="arrow">' + w[1] + '</span>' + w[0];
    $('coach-letters').textContent = current;
    $('coach-stage').textContent = info.name;
    $('coach-goal').textContent = info.goal;

    var bounds = stageBounds(stageKey);
    $('coach-step').textContent = t('coach.step', {
      n: info.n, i: Math.max(1, i - bounds.from), of: bounds.to - bounds.from, left: total - i
    });
    $('coach-bar').style.width = Math.round(i / total * 100) + '%';
    Array.prototype.forEach.call($('stage-strip').children, function (d) {
      var k = d.dataset.key;
      d.className = k === stageKey ? 'on' : (STAGE_NUMBER[k] < info.n ? 'done' : '');
    });
    renderCase(stageKey, bounds.from);
    $('coach-back').disabled = i === 0;
  }

  function stageOf(moveIndex) {
    var at = 0;
    for (var s = 0; s < session.stages.length; s++) {
      at += session.stages[s].moves.length;
      if (moveIndex < at) return session.stages[s].key;
    }
    return session.stages[session.stages.length - 1].key;
  }
  function stageBounds(key) {
    var from = 0;
    for (var s = 0; s < session.stages.length; s++) {
      if (session.stages[s].key === key) return { from: from, to: from + session.stages[s].moves.length };
      from += session.stages[s].moves.length;
    }
    return { from: 0, to: session.moves.length };
  }

  /** The "which one is yours" bit: name the case the child is actually looking at. */
  function renderCase(stageKey, stageStart) {
    var box = $('coach-case'), grid = $('coach-case-grid'), text = $('coach-case-text');
    var state = stateAt(stageStart);
    var top = [];
    for (var i = 0; i < 9; i++) top.push(session.faceColour[state[i]]);
    var topColour = session.faceColour[L.FACE_INDEX.U];
    var lateStages = ['yellowCross', 'yellowFace', 'cornerPlace', 'lastEdges'];
    if (lateStages.indexOf(stageKey) < 0) {
      box.hidden = false;
      grid.innerHTML = '';
      grid.hidden = true;
      text.textContent = countHome(state, stageKey);
      return;
    }
    box.hidden = false;
    grid.innerHTML = '';
    grid.hidden = false;
    top.forEach(function (c, i) {
      var d = document.createElement('div');
      d.style.background = c === topColour ? HEX[c] : '#b9bfcc';
      grid.appendChild(d);
    });
    var edges = [1, 3, 5, 7].filter(function (i) { return top[i] === topColour; }).length;
    var corners = [0, 2, 6, 8].filter(function (i) { return top[i] === topColour; }).length;
    if (stageKey === 'yellowCross') {
      text.textContent = edges === 0 ? t('case.dot')
        : edges === 2 ? ((top[1] === topColour && top[7] === topColour) || (top[3] === topColour && top[5] === topColour)
          ? t('case.line') : t('case.L'))
        : edges === 4 ? t('case.cross') : t('case.nearly');
    } else if (stageKey === 'yellowFace') {
      text.textContent = t('case.corners', { n: corners, colour: LANG.colour(topColour) });
    } else {
      text.textContent = t('case.sides', { colour: LANG.colour(topColour) });
    }
  }
  function countHome(state, stageKey) {
    var pieces = stageKey === 'cross' ? L.EDGES.filter(function (p) { return homeHas(p, L.FACE_INDEX.D) && p.length === 2; })
      : stageKey === 'corners' ? L.CORNERS.filter(function (p) { return homeHas(p, L.FACE_INDEX.D); })
        : L.EDGES.filter(function (p) { return !homeHas(p, L.FACE_INDEX.D) && !homeHas(p, L.FACE_INDEX.U); });
    var done = pieces.filter(function (p) {
      return p.every(function (i) { return state[i] === L.FACE_INDEX[L.FACELETS[i].face]; });
    }).length;
    return t('case.home', { done: done, what: t('case.what.' + stageKey) });
  }
  function homeHas(piece, face) {
    return piece.some(function (i) { return L.FACE_INDEX[L.FACELETS[i].face] === face; });
  }

  function finish() {
    $('done-count').textContent = t('coach.done.count', { n: session.moves.length });
    show('done');
  }

  /* ================= wiring ================= */
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  LANG.apply(document);
  $('lang-switch').onclick = function () { LANG.toggle(); };
  LANG.onChange(function () {
    if (!$('screen-capture').hidden) { setBrush(capPalette.get()); renderCaptureStep(); }
    if (!$('screen-coach').hidden && session) { startCoachChrome(); render(); }
    if (!$('screen-done').hidden && session) finish();
  });
  $('go-camera').onclick = function () { startCapture(false); };
  $('go-manual').onclick = function () { startManual(); };
  $('net-redo').onclick = function () { startCapture(false); };
  $('cap-restart').onclick = function () { startCapture(true); };
  $('cap-solve').onclick = trySolve;
  $('go-demo').onclick = startDemo;
  $('net-solve').onclick = assemble;
  $('coach-next').onclick = function () { step(1); };
  $('coach-back').onclick = function () { step(-1); };
  $('coach-again').onclick = replay;
  $('coach-show-letters').onchange = function () { $('coach-letters').hidden = !this.checked; };
  $('coach-restart').onclick = function () { stopCamera(); show('start'); };
  $('done-again').onclick = function () { show('start'); };
  $('cap-open-cam').onclick = toggleCamera;
  $('cam-close').onclick = stopCamera;
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && cam.on) stopCamera();
  });
})();
