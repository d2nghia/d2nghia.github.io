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
  var P = window.CubeProgress;
  // Generate once; the resulting progress URL restores this cube on reload.
  var autofillRandom = new URLSearchParams(window.location.search).get('autofill') === 'random';

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
  var currentScreen = 'start', restoringProgress = false, pendingProgress = null;
  var progressURL = '', shareTimer = 0, shareRequest = 0, shareStatus = 'copying';
  var modePreviewsReady = false;
  function show(screen) {
    if (screen === 'start') renderModePreviews();
    hideShare();
    $('share-tools').hidden = screen === 'start';
    $('go-home').hidden = screen === 'start';
    $('back-links').hidden = screen !== 'start';
    currentScreen = screen;
    document.body.classList.toggle('is-starting', screen === 'start');
    document.body.classList.toggle('is-coaching', screen === 'coach');
    document.body.classList.toggle('is-capturing', screen === 'capture');
    if (screen !== 'coach' && cubeView) cubeView.stopDemo();
    ['start', 'capture', 'check', 'coach'].forEach(function (s) {
      $('screen-' + s).hidden = s !== screen;
    });
    window.scrollTo(0, 0);
  }

  function renderModePreviews() {
    if (modePreviewsReady) return;
    modePreviewsReady = true;
    // A static illustration uses the same cube renderer as the lesson. It
    // neither creates a lesson nor reads or changes the child's saved cube.
    $('guided-preview').appendChild(window.CubeView.figure(L.applyMoves(L.solvedState(), L.parse('R U F')), { size: 155, move: 'R' }));
    ['cross', 'corners', 'belt', 'yellowCross', 'yellowFace', 'cornerPlace', 'lastEdges'].forEach(function (stage, n) {
      var step = document.createElement('span');
      step.className = 'mode-sheet-step';
      var face = document.createElement('span');
      face.className = 'mode-mini-face';
      for (var i = 0; i < 9; i++) {
        var cell = document.createElement('i');
        if ([1, 3, 4, 5, 7].indexOf(i) >= 0 || n > 3) cell.className = 'is-coloured';
        face.appendChild(cell);
      }
      var label = document.createElement('small');
      label.setAttribute('data-t', 'stage.' + stage + '.short');
      label.textContent = t('stage.' + stage + '.short');
      step.appendChild(face); step.appendChild(label);
      $('instructions-preview').appendChild(step);
    });
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
  var cam = { stream: null, timer: 0, live: false, cells: new Array(9).fill(null), place: null, palette: null, waiting: 0, permission: null, canvas: null, found: null, view: null, history: [], gone: 0, on: false, mirror: false, handFixed: {}, candidate: { key: '', cells: null, streak: 0 } };

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
  }

  function paintModel() {
    if (capView) capView.setNames(names);
    $('cap-msg').hidden = true;
    rememberCube();
  }

  /* The colours are kept on this device, so a cube read once does not have to
   * be read again: closing the page, or coming back tomorrow, picks up the
   * same cube. Nothing leaves the browser. */
  /* The name carries a number: a cube read before the camera flip was fixed is
   * mirrored, and it is better to forget it than to hand someone a cube that
   * is not theirs. */
  var STORE = 'cube-coach/cube2';
  function rememberCube() {
    try { localStorage.setItem(STORE, JSON.stringify({ names: names, at: Date.now() })); }
    catch (e) { /* private window, or storage turned off */ }
    saveProgress();
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

  function saveProgress(cursor) {
    if (restoringProgress) return;
    var progress;
    if (currentScreen === 'coach' && session) progress = P.fromSession(session, cursor);
    else if (currentScreen === 'capture' || currentScreen === 'check') progress = { view: currentScreen, names: names };
    else return;
    var hash = P.encode(progress);
    var params = new URLSearchParams(window.location.search);
    if (params.get('autofill') === 'random') params.delete('autofill');
    var query = params.toString(), search = query ? '?' + query : '';
    // Keep the share link accurate even if the History API is unavailable,
    // or a confirmed turn is still animating toward its saved step.
    progressURL = window.location.origin + window.location.pathname + search + hash;
    // Replacing the URL keeps Back from filling up with every sticker and turn.
    try {
      if (window.location.hash !== hash || window.location.search !== search) {
        window.history.replaceState(null, '', window.location.pathname + search + hash);
      }
    }
    catch (e) { /* a restricted frame can still save progress locally */ }
    try { localStorage.setItem(P.STORE, hash); }
    catch (e) { /* the shareable URL still works when storage is unavailable */ }
  }

  function hideShare() {
    clearTimeout(shareTimer);
    shareRequest++;
    $('share-popover').hidden = true;
    $('share-progress').setAttribute('aria-expanded', 'false');
  }

  function labelShare() {
    $('share-status').textContent = t('share.' + shareStatus);
    $('share-copied').hidden = shareStatus !== 'copied';
    $('share-failed').hidden = shareStatus !== 'failed';
    $('share-popover').setAttribute('title', t('share.' + shareStatus));
    $('share-url').setAttribute('aria-label', t('share.url'));
  }

  function copyShareFallback() {
    var active = document.activeElement, copied = false;
    try {
      $('share-url').select();
      copied = document.execCommand('copy');
    } catch (e) { /* leave the link available for manual copying */ }
    if (active && active.focus) active.focus({ preventScroll: true });
    return copied;
  }

  async function shareProgress() {
    if (!progressURL || $('share-tools').hidden) return;
    clearTimeout(shareTimer);
    var request = ++shareRequest, url = progressURL, copied = false;
    $('share-url').value = url;
    shareStatus = 'copying';
    labelShare();
    $('share-popover').hidden = false;
    $('share-progress').setAttribute('aria-expanded', 'true');
    shareTimer = setTimeout(hideShare, 4000);
    try {
      if (window.navigator && window.navigator.clipboard && window.navigator.clipboard.writeText) {
        await window.navigator.clipboard.writeText(url);
        copied = true;
      }
    } catch (e) { /* try copying the selectable URL if the Clipboard API is blocked */ }
    if (request !== shareRequest) return;
    if (!copied) copied = copyShareFallback();
    shareStatus = copied ? 'copied' : 'failed';
    labelShare();
    clearTimeout(shareTimer);
    shareTimer = setTimeout(hideShare, copied ? 4000 : 8000);
  }

  function restoreProgress(progress) {
    restoringProgress = true;
    try {
      stopCamera();
      names = progress.names.slice();
      session = progress.session || null;
      if (progress.view === 'coach') startCoach(session.cursor);
      else if (progress.view === 'capture') startCapture(false, names);
      else renderNet(t('net.title'), t('net.hint'));
    } finally { restoringProgress = false; }
    saveProgress();
  }

  function restoreSharedProgress() {
    var hash = window.location.hash || '';
    if (hash) {
      var shared = P.decode(hash);
      if (shared) { restoreProgress(shared); return true; }
      var params = new URLSearchParams(hash.slice(1));
      if (params.has('p') || params.has('v') || params.has('cube')) {
        // Do not replace a saved lesson with a malformed or incomplete link.
        $('progress-error').hidden = false;
        return true;
      }
    }
    return false;
  }

  function startGuided() {
    $('progress-error').hidden = true;
    session = null;
    startCapture(true);
  }
  function facesLeft() {
    var left = 0;
    for (var f = 0; f < 6; f++) {
      for (var i = 0; i < 9; i++) if (!names[f * 9 + i]) { left++; break; }
    }
    return left;
  }

  function startCapture(fresh, initialNames, randomFill) {
    show('capture');
    if (initialNames) names = initialNames.slice();
    else if (fresh) { forgetCube(); names = new Array(54).fill(null); }
    else if (randomFill) {
      // Legal turns keep the random colours solvable, with nine of each colour.
      var state = L.applyMoves(L.solvedState(), L.randomScramble(30));
      names = Array.from(state, function (face) { return DEFAULT_CENTRES[L.FACE_ORDER[face]]; });
    }
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
    paintModel();
    var done = 6 - facesLeft();
    if (!fresh && !randomFill && done) {
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
        /* A camera pointing back at the child looks at the cube from the far
         * side, so a column on their left lands on the right of its picture.
         * Both the picture and the reading are therefore flipped, and the cube
         * on screen then matches the one in their hands. A rear camera looks
         * the same way the child does, and is left alone. */
        var track = stream.getVideoTracks()[0];
        var facing = track && track.getSettings ? track.getSettings().facingMode : null;
        cam.mirror = facing !== 'environment';
        $('cam-wrap').classList.toggle('mirror', cam.mirror);
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
    ctx.save();
    if (cam.mirror) { ctx.translate(REGION, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, fx, fy, fs, fs, 0, 0, REGION, REGION);
    ctx.restore();

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
      /* The reading was taken from a flipped picture; the overlay is drawn in
       * the frame's own coordinates, because it flips back with the video. */
      var x = cam.mirror ? REGION - px : px;
      return [(v.fx + x * v.fs / REGION) * v.scale + v.offX,
      (v.fy + py * v.fs / REGION) * v.scale + v.offY];
    }
    var flipStep = cam.mirror ? -1 : 1;
    var step = (toScreen(f.cell, 0)[0] - toScreen(0, 0)[0]) * flipStep;
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
      // The camera still sees the previous physical side while the model turns.
      stopCamera();
      capView.showMissing();
      $('cap-msg').hidden = false;
      $('cap-msg').className = 'small warn-line center';
      $('cap-msg').textContent = t('cap.missing');
      $('cap-cube').scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'center'
      });
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
        function (i) { names[base + i] = netPalette.get(); rememberCube(); });
    });
    if (!netPalette) netPalette = makePalette($('net-palette'), function () { }, 'white');
    show('check');
    rememberCube();
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
    // Use the child's most complete starting layer, whatever colour they chose.
    var seq = L.orientationForProgress(state);
    seq.forEach(function (rot) {
      state = L.rotateState(state, rot);
      faceColour = L.rotateFaces(faceColour, rot);
    });
    var result = L.solve(state);
    if (!result.ok) {
      renderNet(t('net.err.stuck'), t('net.err.stuck.why'));
      return;
    }
    // One numbered step is always one quarter turn. Keep repeated turns as
    // separate actions, including the halfway state between them.
    var moves = [], targets = [];
    result.stages.forEach(function (stage) {
      stage.moves.forEach(function (move) {
        var count = move[1] === '2' ? 2 : 1;
        for (var i = 0; i < count; i++) {
          moves.push(count === 2 ? move[0] : move);
          targets.push(stage.key);
        }
      });
    });
    session = { start: state, faceColour: faceColour, moves: moves, targets: targets, cursor: 0 };
    startCoach();
  }

  /** A scrambled cube to practise on, for anyone without one in their hands. */
  function startDemo() {
    stopCamera();
    var state = L.applyMoves(L.solvedState(), L.randomScramble(30));
    solveAndTeach(state, ['white', 'red', 'green', 'yellow', 'orange', 'blue']);
  }
  /* ================= coach ================= */
  var cubeView = null, trackDrag = null, trackWasDragged = false;

  function startCoachChrome() {
    var track = $('coach-move-track');
    track.innerHTML = '';
    track.dataset.cursor = '';
    track.setAttribute('aria-label', t('coach.steps'));
    // The solved cube is the final step, so the child can still go back.
    for (var i = 0; i <= session.moves.length; i++) {
      var number = document.createElement('button');
      number.type = 'button';
      number.dataset.step = i;
      number.textContent = i + 1;
      number.setAttribute('aria-label', t('coach.progress', { current: i + 1, total: session.moves.length + 1 }) +
        (i === session.moves.length ? ' — ' + t('coach.done.title') : ''));
      number.onclick = function (e) {
        if (e.detail && trackWasDragged) return;
        jumpTo(Number(this.dataset.step));
      };
      track.appendChild(number);
    }
  }

  function startCoach(cursor) {
    if (!cubeView) cubeView = window.CubeView.create($('coach-cube'), session.faceColour);
    cubeView.colours(session.faceColour);
    session.cursor = cursor || 0;
    startCoachChrome();
    show('coach');
    previewTurn();
  }

  function previewTurn() {
    cubeView.set(L.applyMoves(session.start, session.moves.slice(0, session.cursor)));
    render();
    saveProgress();
    if (!document.hidden && session.cursor < session.moves.length) {
      cubeView.demonstrate(session.moves[session.cursor]);
    }
  }

  /** Only the child's confirmation advances the solution, never a demo repeat. */
  async function step(dir) {
    if (!session || $('screen-coach').hidden || cubeView.busy()) return;
    if (dir < 0 && session.cursor === 0) return;
    if (dir > 0 && session.cursor === session.moves.length) return;
    var move = dir > 0 ? session.moves[session.cursor] : L.inverse([session.moves[session.cursor - 1]])[0];
    var turn = cubeView.play(move, 1200, { fromStart: true, hold: 300, animate: true });
    // A confirmation represents a physical turn already made by the child.
    // Reloading during its animation should not make them repeat that turn.
    saveProgress(session.cursor + dir);
    render();
    await turn;
    if (pendingProgress) {
      var progress = pendingProgress;
      pendingProgress = null;
      restoreProgress(progress);
      return;
    }
    session.cursor += dir;
    previewTurn();
  }
  function replay() {
    if (session && !$('screen-coach').hidden && !cubeView.busy() &&
        session.cursor < session.moves.length) previewTurn();
  }

  function jumpTo(index) {
    if (!session || $('screen-coach').hidden || cubeView.busy() ||
        !Number.isInteger(index) || index < 0 || index > session.moves.length) return false;
    session.cursor = index;
    previewTurn();
    return true;
  }

  function wireStepTrack() {
    var track = $('coach-move-track');
    track.addEventListener('pointerdown', function (e) {
      // Keep the cube's mat from interpreting a strip drag as a cube rotation.
      e.stopPropagation();
      if ((e.button !== 0 && e.button !== 2) || e.isPrimary === false) return;
      if (e.button === 2) e.preventDefault();
      trackWasDragged = false;
      trackDrag = { id: e.pointerId, x: e.clientX, scroll: track.scrollLeft, moved: false };
    });
    track.addEventListener('pointermove', function (e) {
      if (!trackDrag || e.pointerId !== trackDrag.id) return;
      var delta = e.clientX - trackDrag.x;
      if (!trackDrag.moved && Math.abs(delta) < 5) return;
      if (!trackDrag.moved) {
        trackDrag.moved = true;
        track.classList.add('is-dragging');
        try { track.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
      }
      e.preventDefault();
      e.stopPropagation();
      track.scrollLeft = trackDrag.scroll - delta;
    });
    function endDrag(e) {
      if (!trackDrag || e.pointerId !== trackDrag.id) return;
      trackWasDragged = trackDrag.moved;
      trackDrag = null;
      track.classList.remove('is-dragging');
      try { track.releasePointerCapture(e.pointerId); } catch (err) { /* no capture on a tap */ }
    }
    track.addEventListener('pointerup', endDrag);
    track.addEventListener('contextmenu', function (e) { e.preventDefault(); e.stopPropagation(); });
    track.addEventListener('pointercancel', endDrag);
    track.addEventListener('lostpointercapture', function (e) { if (e.target === track) endDrag(e); });
    track.addEventListener('keydown', function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.isComposing) return;
      var button = e.target.closest('button[data-step]');
      if (!button) return;
      var index = Number(button.dataset.step);
      if (e.key === 'ArrowLeft') index--;
      else if (e.key === 'ArrowRight') index++;
      else if (e.key === 'Home') index = 0;
      else if (e.key === 'End') index = session.moves.length;
      else return;
      e.preventDefault();
      e.stopPropagation();
      index = Math.max(0, Math.min(session.moves.length, index));
      if (jumpTo(index)) track.children[index].focus({ preventScroll: true });
    });
  }

  function labelResizeHandle() {
    $('coach-resize').setAttribute('aria-label', t('coach.resize'));
    $('coach-resize').title = t('coach.resize');
  }

  function wirePanelResize() {
    var panel = $('coach-panel'), section = $('screen-coach'), handle = $('coach-resize');
    var controls = $('coach-controls');
    var drag = null, reference = null;
    function controlsSpace() {
      // Leave room for wrapped labels below the centered panel on small screens.
      var space = 2 * (controls.offsetHeight + 56);
      section.style.setProperty('--coach-controls-space', space + 'px');
      return space;
    }
    function size(width, height) {
      if (!reference) reference = panel.getBoundingClientRect();
      var maxWidth = Math.max(1, document.documentElement.clientWidth - 32);
      width = Math.max(Math.min(320, maxWidth), Math.min(maxWidth, width));
      section.style.width = Math.round(width) + 'px';
      var maxHeight = Math.max(240, window.innerHeight - controlsSpace());
      height = Math.max(Math.min(360, maxHeight), Math.min(maxHeight, height));
      panel.style.height = Math.round(height) + 'px';
      // Scale the text, step buttons, spacing, and handle with the panel area.
      var scale = Math.sqrt(width * height / (reference.width * reference.height));
      panel.style.setProperty('--coach-scale', Math.max(0.75, Math.min(2.5, scale)).toFixed(4));
      panel.classList.add('is-resized');
    }
    handle.addEventListener('pointerdown', function (e) {
      e.stopPropagation();
      if (e.button !== 0 || e.isPrimary === false) return;
      e.preventDefault();
      var bounds = panel.getBoundingClientRect();
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, width: bounds.width, height: bounds.height };
      panel.classList.add('is-resizing');
      handle.focus({ preventScroll: true });
      try { handle.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
    });
    handle.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      e.preventDefault();
      e.stopPropagation();
      // Both opposite edges move because the panel stays centered.
      size(drag.width + 2 * (e.clientX - drag.x), drag.height + 2 * (e.clientY - drag.y));
    });
    function end(e) {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null;
      panel.classList.remove('is-resizing');
      try { handle.releasePointerCapture(e.pointerId); } catch (err) { /* capture already lost */ }
    }
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    handle.addEventListener('lostpointercapture', end);
    handle.addEventListener('keydown', function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return;
      var delta = e.shiftKey ? 50 : 20, bounds = panel.getBoundingClientRect();
      var width = bounds.width, height = bounds.height;
      if (e.key === 'ArrowRight') width += delta;
      else if (e.key === 'ArrowLeft') width -= delta;
      else if (e.key === 'ArrowDown') height += delta;
      else if (e.key === 'ArrowUp') height -= delta;
      else return;
      e.preventDefault();
      e.stopPropagation();
      size(width, height);
    });
    window.addEventListener('resize', function () {
      if (!panel.classList.contains('is-resized') || section.hidden) return;
      var bounds = panel.getBoundingClientRect();
      size(bounds.width, bounds.height);
    });
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(function () {
      if (section.hidden) return;
      controlsSpace();
      if (panel.classList.contains('is-resized')) {
        var bounds = panel.getBoundingClientRect();
        size(bounds.width, bounds.height);
      }
    }).observe(controls);
    labelResizeHandle();
  }

  function render() {
    var i = session.cursor;
    var done = i === session.moves.length;
    var current = session.moves[i];
    $('coach-word').textContent = done ? '' : t('move.' + current);
    $('coach-progress').textContent = t('coach.progress', { current: i + 1, total: session.moves.length + 1 });
    $('coach-goal').textContent = done ? t('coach.done.title') : t('coach.target.' + session.targets[i], {
      base: LANG.colour(session.faceColour[L.FACE_INDEX.D]),
      top: LANG.colour(session.faceColour[L.FACE_INDEX.U])
    });
    var track = $('coach-move-track');
    Array.prototype.forEach.call(track.children, function (number, n) {
      number.className = n === i ? 'on' : (n < i ? 'done' : '');
      number.disabled = cubeView.busy();
      number.tabIndex = n === i ? 0 : -1;
      if (n === i) number.setAttribute('aria-current', 'step');
      else number.removeAttribute('aria-current');
    });
    var active = track.children[i];
    // Scroll only the number strip; advancing a move must not scroll the page.
    if (track.dataset.cursor !== String(i)) {
      track.scrollLeft = active.offsetLeft + active.offsetWidth / 2 - track.clientWidth / 2;
      track.dataset.cursor = String(i);
    }
    $('coach-back').disabled = i === 0 || cubeView.busy();
    $('coach-next').hidden = done;
    $('coach-next').disabled = done || cubeView.busy();
    $('done-again').hidden = !done;
    $('done-again').disabled = cubeView.busy();
    $('done-count').hidden = !done;
    $('done-count').textContent = t('coach.done.count', { n: session.moves.length });
  }

  /* ================= wiring ================= */
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  LANG.apply(document);
  wireStepTrack();
  wirePanelResize();
  $('lang-switch').onclick = function () { LANG.toggle(); };
  LANG.onChange(function () {
    labelShare();
    labelResizeHandle();
    if (!$('screen-capture').hidden) setBrush(capPalette.get());
    if (!$('screen-coach').hidden && session) { startCoachChrome(); render(); }
  });
  $('go-camera').onclick = startGuided;
  $('go-manual').onclick = function () { startManual(); };
  $('net-redo').onclick = function () { startCapture(false); };
  $('cap-clear').onclick = function () { stopCamera(); startCapture(true); };
  $('cap-solve').onclick = trySolve;
  $('go-demo').onclick = startDemo;
  $('net-solve').onclick = assemble;
  $('coach-next').onclick = function () { step(1); };
  $('coach-back').onclick = function () { step(-1); };
  $('done-again').onclick = function () {
    if (cubeView.busy()) return;
    stopCamera();
    show('start');
    try { window.history.replaceState(null, '', window.location.pathname + window.location.search); }
    catch (e) { /* the mode picker still works if History is unavailable */ }
  };
  $('cap-open-cam').onclick = toggleCamera;
  $('cam-close').onclick = stopCamera;
  $('share-progress').onclick = shareProgress;
  document.addEventListener('pointerdown', function (e) {
    if (!$('share-popover').hidden && !($('share-tools').contains(e.target))) hideShare();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('share-popover').hidden) {
      hideShare();
      $('share-progress').focus({ preventScroll: true });
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape' && cam.on) stopCamera();
    if (!session || $('screen-coach').hidden || e.defaultPrevented || e.isComposing ||
        e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    var target = e.target;
    if (target && target.closest && target.closest('#share-tools')) return;
    if (target && target.closest && target.closest('#coach-move-track, #coach-resize')) return;
    if (target && (target.isContentEditable || (target.closest &&
        target.closest('input, textarea, select, [role="textbox"], [role="slider"]')))) return;
    var back = e.key === 'ArrowLeft', next = e.key === 'ArrowRight';
    var again = e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown';
    // On the done step, leave Space free to activate Solve another one.
    if (session.cursor === session.moves.length && !back) return;
    if (!back && !next && !again) return;
    // Prevent scrolling and Space activating a focused Next/Back button.
    e.preventDefault();
    // Let held navigation keys follow the keyboard's normal repeat rate.
    // Repeating a replay key would continually reset the animation.
    if (e.repeat && again) return;
    if (back) step(-1);
    else if (next) step(1);
    else replay();
  });
  document.addEventListener('visibilitychange', function () {
    if (!cubeView) return;
    if (document.hidden) cubeView.stopDemo();
    else replay();
  });
  window.addEventListener('hashchange', function () {
    var progress = P.decode(window.location.hash);
    if (!progress) return;
    if (cubeView && cubeView.busy()) pendingProgress = progress;
    else restoreProgress(progress);
  });
  show('start');
  // Only an explicit shared link or practice request bypasses the mode picker.
  // Choosing guided solving starts fresh; an active lesson's URL restores it.
  if (autofillRandom) startCapture(false, null, true);
  else restoreSharedProgress();
})();
