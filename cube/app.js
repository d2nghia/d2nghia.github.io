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
  var cam = { stream: null, timer: 0, live: false, cells: new Array(9).fill(null), place: null, palette: null, waiting: 0, permission: null, canvas: null, found: null, view: null, history: [], held: null, manual: false, gone: 0, candidate: { key: '', cells: null, streak: 0 } };

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
    $('cam-grid').style.cursor = pencil;
    var read = $('cap-colour');
    read.firstElementChild.style.background = HEX[colour];
    read.lastElementChild.textContent = t('cap.painting', { colour: LANG.colour(colour) });
    if (cam.palette) cam.palette.set(colour);
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

  /* ================= camera popup ================= */
  function openCamera() {
    var a = capView.angles();
    cam.place = K.placement(a.rx, a.ry);              // the side showing when the popup opened
    cam.cells = new Array(9).fill(null);
    cam.found = null;
    cam.history = [];
    $('cam-modal').hidden = false;
    resetCameraPopup();
    clearHeld();
    if (!cam.palette) {
      cam.palette = makePalette($('cam-palette'), function (colour) {
        capPalette.set(colour);
        setBrush(colour);
      }, capPalette.get());
    }
    cam.palette.set(capPalette.get());
    setBrush(capPalette.get());
    $('cam-status').textContent = t('cam.starting');
    placeGuide();
    startStream();
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
    if (!window.isSecureContext) {
      return t('cam.err.https');
    }
    /* Inside a frame that has not been given the camera, nobody is ever asked —
     * including when the browser reports that as a flat refusal. */
    if (framed() && frameAllowsCamera() !== true) {
      return t('cam.err.frame');
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') {
      return t('cam.err.none');
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return t('cam.err.busy');
    }
    if (name === 'NotAllowedError') {
      return t(cam.permission === 'denied' ? 'cam.err.off' : 'cam.err.refused');
    }
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
        $('cam-msg').hidden = true;
        placeGuide();
        startLive();
        clearTimeout(cam.waiting);
        /* Permission can be granted and still no picture arrive, which would
         * otherwise leave a black box and a button that does nothing. */
        cam.waiting = setTimeout(function () {
          if ($('cam').videoWidth) return;
          cameraFailed(t('cam.err.blank'));
        }, 6000);
      })
      .catch(function (err) {
        /* If a stream was already handed over, the camera is not the problem —
         * saying "no camera" would send the child hunting for the wrong thing. */
        if (cam.stream) {
          cameraFailed(t('cam.err.ours'));
        } else {
          cameraFailed(cameraTrouble(err));
        }
      });
  }
  /** Nothing to capture or correct, so the popup becomes a plain explanation. */
  function cameraFailed(text) {
    clearTimeout(cam.waiting);
    stopLive();
    stopStream();
    $('cam-msg').hidden = false;
    $('cam-msg').textContent = text;
    $('cam-status').textContent = '';
    $('cam-title').textContent = t('cam.title.trouble');
    clearHeld();
    $('cam-guide').hidden = true;
    $('cam-modal').querySelector('.modal-card').classList.add('trouble');
    $('cam-cancel').textContent = t('cam.byhand');
  }
  function resetCameraPopup() {
    $('cam-msg').hidden = true;
    $('cam-guide').hidden = false;
    $('cam-title').textContent = t('cam.title');
    $('cam-modal').querySelector('.modal-card').classList.remove('trouble');
    $('cam-cancel').textContent = t('cam.cancel');
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
    $('cam-status').textContent = t('cam.reading');
    cam.timer = setInterval(sampleFrame, 180);
  }
  function stopLive() {
    cam.live = false;
    clearInterval(cam.timer);
    cam.timer = 0;
  }

  function placeGuide() {
    var wrap = $('cam-wrap'), guide = $('cam-guide');
    var w = wrap.clientWidth, h = wrap.clientHeight;
    var size = Math.round(Math.min(w, h) * 0.72);
    guide.style.width = size + 'px';
    guide.style.height = size + 'px';
    guide.style.left = Math.round((w - size) / 2) + 'px';
    guide.style.top = Math.round((h - size) / 2) + 'px';
  }
  window.addEventListener('resize', function () { if (!$('cam-modal').hidden) placeGuide(); });

  var REGION = 180;              // the search picture, in pixels
  var SPREAD = 1.45;             // how far outside the square to look for the cube

  /**
   * Look for the cube in the picture and read it.
   *
   * The square on screen is a hint, not a frame: a child holding the cube a
   * little too far away or off to one side would otherwise have the colours
   * read off the background. So a patch wider than the square is searched for
   * something that looks like a face.
   */
  function sampleFrame() {
    var video = $('cam'), wrap = $('cam-wrap');
    if (!video.videoWidth) return;
    var vw = video.videoWidth, vh = video.videoHeight;
    var w = wrap.clientWidth, h = wrap.clientHeight;
    var scale = Math.max(w / vw, h / vh);                 // object-fit: cover
    var offX = (w - vw * scale) / 2, offY = (h - vh * scale) / 2;
    var guide = Math.round(Math.min(w, h) * 0.72);
    var region = guide * SPREAD;

    var fs = region / scale;                              // the patch, in the frame's own pixels
    fs = Math.min(fs, vw, vh);
    var fx = (w - region) / 2, fy = (h - region) / 2;
    fx = (fx - offX) / scale; fy = (fy - offY) / scale;
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
    }
    considerReading(cam.found);
    if (!cam.held) cam.cells = cam.found ? cam.found.names : new Array(9).fill(null);
    drawFoundGrid();
    renderCamGrid();
    if (cam.live) {
      if (cam.held) sayHeld();
      else $('cam-status').textContent = t(cam.found ? 'cam.holdstill' : 'cam.show');
    }
  }

  /** Draw the grid that was actually found, so the child can see it lock on. */
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
    ctx.lineWidth = 3;
    for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) {
      var p = toScreen(f.x + (c - 1) * f.cell, f.y + (r - 1) * f.cell);
      var side = step * 0.74;
      ctx.strokeStyle = f.names[r * 3 + c] ? 'rgba(39,224,245,.95)' : 'rgba(255,255,255,.6)';
      ctx.strokeRect(p[0] - side / 2, p[1] - side / 2, side, side);
    }
  }
  window.addEventListener('resize', function () { if (!$('cam-modal').hidden) drawFoundGrid(); });

  var camGrid = null;
  function renderCamGrid() {
    if (!camGrid) {
      camGrid = makeGrid($('cam-grid'),
        function (i) { return cam.cells[i]; },
        function (i) {
          if (!cam.held) return;                     // nothing to correct yet
          cam.manual = true;
          cam.cells[i] = cam.palette.get();
          cam.held.cells[i] = cam.cells[i];
          sayHeld();
        });
    }
    camGrid.render();
  }

  /** Capture freezes the picture so the reading can be corrected before it lands. */
  /**
   * Keep a reading once it settles.
   *
   * Holding a cube still with one hand and reaching for a button with the other
   * is a job a child does not have the hands for. So the page watches until the
   * same nine colours come back several times over, keeps that reading, and
   * then the cube can be put down.
   */
  function holdReading(cells) {
    cam.held = { cells: cells.slice() };
    cam.cells = cells.slice();
    $('cam-shot').src = faceThumbnail();
    $('cam-shot').hidden = false;
    $('cam-accept').disabled = false;
    $('cam-grid').classList.add('editable');
    $('cam-grid').classList.remove('locking');
    void $('cam-grid').offsetWidth;                  // restart the flash
    $('cam-grid').classList.add('locking');
    renderCamGrid();
    sayHeld();
  }
  function sayHeld() {
    var unsure = cam.held.cells.filter(function (c) { return !c; }).length;
    $('cam-status').textContent = unsure === 0 ? t('cam.got')
      : unsure === 1 ? t('cam.got.one') : t('cam.got.many', { n: unsure });
  }
  function clearHeld() {
    cam.held = null;
    cam.manual = false;
    cam.gone = 0;
    cam.candidate = { key: '', cells: null, streak: 0 };
    cam.cells = new Array(9).fill(null);
    $('cam-shot').hidden = true;
    $('cam-accept').disabled = true;
    $('cam-grid').classList.remove('editable', 'locking');
    renderCamGrid();
  }

  /** Decide whether this frame's reading is steady enough to keep. */
  function considerReading(found) {
    if (!found) {
      cam.candidate = { key: '', cells: null, streak: 0 };
      /* Once the cube has been taken away, whatever was on screen is settled:
       * holding it up again means "read it afresh", corrections and all. */
      if (++cam.gone > 4) cam.manual = false;
      return;
    }
    cam.gone = 0;
    if (cam.manual) return;                          // being corrected by hand: leave it alone
    var cells = found.names;
    if (cam.history.length > 1) {
      cells = K.settle(cam.history.map(function (h) { return h.patches; }),
        cam.history.map(function (h) { return h.sure; }));
    }
    var known = cells.filter(function (c) { return c; }).length;
    if (known < 7) { cam.candidate = { key: '', cells: null, streak: 0 }; return; }
    /* Never trade a reading where every square came out for a patchier one. */
    if (known < 9 && cam.held && cam.held.cells.every(Boolean)) return;
    var key = cells.join(',');
    if (key === cam.candidate.key) cam.candidate.streak++;
    else cam.candidate = { key: key, cells: cells, streak: 1 };
    /* A complete reading only has to hold for a moment; one with a grey square
     * has to prove itself for longer, in case it is about to come good. */
    /* Settling on a first reading should be quick. Throwing away one already
     * kept should not: two readings that differ by a single square would
     * otherwise swap back and forth while the cube sits still. */
    var needed = cam.held ? (known === 9 ? 7 : 12) : (known === 9 ? 3 : 7);
    if (cam.candidate.streak < needed) return;
    if (cam.held && cam.held.cells.join(',') === key) return;    // already keeping exactly this
    holdReading(cam.candidate.cells);
  }

  /** The square the reading came from, cut out for checking against the colours. */
  function faceThumbnail() {
    if (!cam.canvas) return '';
    if (!cam.found) return cam.canvas.toDataURL('image/jpeg', 0.75);
    var f = cam.found, side = f.cell * 3.1;
    var out = document.createElement('canvas');
    out.width = out.height = 120;
    out.getContext('2d').drawImage(cam.canvas, f.x - side / 2, f.y - side / 2, side, side, 0, 0, 120, 120);
    return out.toDataURL('image/jpeg', 0.8);
  }

  function acceptCamera() {
    var cells = cam.held ? cam.held.cells : cam.cells;
    var base = L.FACE_ORDER.indexOf(cam.place.face) * 9;
    for (var j = 0; j < 9; j++) {
      if (cells[j]) names[base + cam.place.fromCamera[j]] = cells[j];
    }
    paintModel();
    closeCamera();
  }
  function closeCamera() {
    stopLive();
    stopStream();
    $('cam-modal').hidden = true;
  }

  function trySolve() {
    var left = facesLeft();
    if (left > 0) {
      $('cap-msg').hidden = false;
      $('cap-msg').className = 'small warn-line center';
      $('cap-msg').textContent = left === 1 ? t('cap.left.one') : t('cap.left.many', { n: left });
      return;
    }
    closeCamera();
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
    closeCamera();
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
  $('coach-restart').onclick = function () { closeCamera(); show('start'); };
  $('done-again').onclick = function () { show('start'); };
  $('cap-open-cam').onclick = openCamera;
  $('cam-accept').onclick = acceptCamera;
  $('cam-cancel').onclick = closeCamera;
  $('cam-modal').onclick = function (e) { if (e.target === this) closeCamera(); };
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('cam-modal').hidden) closeCamera();
  });
})();
