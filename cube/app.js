/**
 * Cube Coach — read a child's cube through the camera, then hand out one turn
 * at a time in plain words. This is solve.html; the chooser that leads here is
 * index.html, and the step guide is steps.html.
 *
 * Three pieces: a camera capture flow that confirms each face before moving on,
 * an optional flat sticker editor for entering colours without the camera,
 * and a coach that walks the solver's moves on a 3D model of their own cube.
 */
(function () {
  'use strict';
  var L = window.CubeLib;
  var P = window.CubeProgress;
  var CHECK = window.CubeValidation;
  // Generate once; the resulting progress URL restores this cube on reload.
  var query = new URLSearchParams(window.location.search);
  var autofillRandom = query.get('autofill') === 'random';
  // The chooser links here with ?fresh=1 when the child asked to start over.
  var startFresh = query.get('fresh') === '1';

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
  var currentScreen = 'capture', restoringProgress = false, pendingProgress = null;
  var progressURL = '', shareTimer = 0, shareRequest = 0, shareStatus = 'copying';
  function show(screen) {
    hideShare();
    $('share-tools').hidden = false;
    currentScreen = screen;
    if (screen !== 'capture') { clearCaptureIssue(); closeReopen(false); }
    document.body.classList.toggle('is-coaching', screen === 'coach');
    document.body.classList.toggle('is-capturing', screen === 'capture');
    if (screen !== 'coach' && cubeView) cubeView.stopDemo();
    ['capture', 'check', 'coach'].forEach(function (s) {
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
  var captureIssue = null, repairIndex = 0;
  var cam = { stream: null, timer: 0, live: false, cells: new Array(9).fill(null), place: null, palette: null, waiting: 0, permission: null, canvas: null, found: null, view: null, history: [], gone: 0, on: false, mirror: false, handFixed: {}, candidate: { key: '', cells: null, streak: 0 } };

  function setBrush(colour) {
    $('cap-cube').style.cursor = window.CubeView.pencilCursor(colour);
  }

  function paintModel() {
    clearCaptureIssue();
    if (capView) capView.setNames(names);
    $('cap-msg').hidden = true;
    rememberCube();
  }

  function clearCaptureIssue() {
    captureIssue = null;
    renderSuggestionCube(null);
    if (capView) capView.stopRepair();
    $('cap-issue').hidden = true;
  }

  /* The suggested colours get a cube of their own, the same size as the one
   * being worked on and turned to the same angle, so a child can look from one
   * to the other and to the cube in their hands without remembering anything.
   * Either cube can be spun, and the other follows: comparing them only works
   * while both are seen from the same side. Neither can be painted here. */
  var suggestionView = null, mirroring = false;
  /** The same angle, by the shortest way round, and turning if the other did. */
  function mirrorAngles(view, rx, ry, smooth) {
    if (!view || mirroring) return;
    function near(angle, current) { return angle + 360 * Math.round((current - angle) / 360); }
    var at = view.angles();
    mirroring = true;
    try { view.look(near(rx, at.rx), near(ry, at.ry), smooth); } finally { mirroring = false; }
  }
  function renderSuggestionCube(suggestion) {
    if (!suggestion) { if (suggestionView) suggestionView.stopRepair(); return; }
    var fresh = false;
    if (!suggestionView) {
      fresh = true;
      suggestionView = window.CubeView.create($('cap-issue-cube'));
      // Registering reports the angle it happens to start at. That is not a
      // turn anyone asked for, and copying it would drag the cube above back
      // to where it was before it aimed at the piece.
      mirroring = true;
      try {
        suggestionView.onView(function (rx, ry, face, smooth) { mirrorAngles(capView, rx, ry, smooth); });
      } finally { mirroring = false; }
    }
    suggestionView.setNames(suggestion.after.slice());
    // It is aimed by the cube above it, in one turn, rather than aiming itself
    // at the piece and then being turned again to match.
    // The arrows belong on this cube alone: it is the one being copied from,
    // and a pair of cubes both sprouting arrows is a busy thing to read.
    suggestionView.showRepair({ indices: suggestion.indices, pieces: suggestion.pieces,
      hold: true, arrows: true });
    // Stepping to another suggestion turns both cubes over to the new piece
    // rather than snapping: a jump leaves no idea of which way the cube moved.
    var angles = capView.angles();
    mirrorAngles(suggestionView, angles.rx, angles.ry, !fresh);
  }

  function renderCaptureIssue(animate) {
    if (!captureIssue) return;
    var report = captureIssue, suggestion = report.suggestions[repairIndex];
    var known = ['missing', 'centres', 'count', 'twist', 'flip', 'parity', 'corner-order', 'stuck'];
    var code = known.indexOf(report.code) >= 0 ? report.code : 'pieces';
    $('cap-issue-title').textContent = t('repair.' + code + '.title');
    // A problem in a piece is answered by the cube below; the other codes
    // (missing, centres, count) each have something of their own to say.
    var pieceProblem = ['twist', 'flip', 'parity', 'corner-order', 'pieces'].indexOf(code) >= 0;
    var hint = t(pieceProblem
      ? (suggestion ? 'repair.suggestion.hint' : 'repair.review.hint')
      : 'repair.' + code + '.hint');
    $('cap-issue-compare').hidden = !suggestion;
    $('cap-issue-prev').disabled = repairIndex === 0;
    $('cap-issue-next').disabled = repairIndex >= report.suggestions.length - 1;
    $('cap-issue-prev').setAttribute('aria-label', t('repair.previous'));
    $('cap-issue-next').setAttribute('aria-label', t('repair.next'));
    $('cap-issue-option').textContent = t('repair.option', { n: repairIndex + 1, total: report.suggestions.length });
    $('cap-issue-counts').hidden = code !== 'count';
    $('cap-issue-counts').innerHTML = '';
    if (code === 'count') report.counts.forEach(function (item) {
      var badge = document.createElement('span');
      badge.className = item.count === 9 ? '' : 'wrong-count';
      var swatch = document.createElement('i');
      swatch.style.background = HEX[item.colour];
      badge.appendChild(swatch);
      var label = document.createElement('span'); label.textContent = item.count + '/9'; badge.appendChild(label);
      badge.setAttribute('aria-label', LANG.colour(item.colour) + ': ' + item.count + '/9');
      $('cap-issue-counts').appendChild(badge);
    });
    var groups = suggestion ? suggestion.pieces : report.groups;
    var options = suggestion || { indices: groups.reduce(function (all, p) { return all.concat(p); }, []), pieces: groups };
    // Without a suggestion to compare against, point at the suspect stickers.
    // The turn to the piece is always played: it is not decoration but how the
    // child is shown which piece is meant, and a cube that simply appears at a
    // new angle says nothing about where it went.
    var aim = capView.showRepair({ indices: options.indices, pieces: options.pieces,
      point: !suggestion, animate: true });
    renderSuggestionCube(suggestion);
    // Opposite sides cannot both face the child, so now and then a square has
    // to stay round the back. Saying so beats leaving them hunting for it.
    $('cap-issue-hint').textContent = hint + (aim && aim.hidden ? ' ' + t('repair.hidden.hint') : '');
  }

  function showCaptureIssue(report) {
    if (currentScreen !== 'capture') startCapture(false, names);
    clearCaptureIssue();
    captureIssue = report; repairIndex = 0;
    $('cap-msg').hidden = true;
    $('cap-issue').hidden = false;
    renderCaptureIssue();
    $('cap-issue-title').focus({ preventScroll: true });
    if ($('cap-cube').scrollIntoView) $('cap-cube').scrollIntoView({ block: 'start',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
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

  /* ================= cubes already tried =================
   * Every press of Solve keeps the cube as it was entered, finished or not, so
   * a child can step back to a cube they were working on instead of colouring
   * it in again. Newest first, the same cube never twice.
   */
  var TRIED_STORE = 'cube-coach/tried', TRIED_MAX = 6;
  var tried = [];

  function cubeKey(list) {
    return list.map(function (c) { return c || '-'; }).join('|');
  }
  function loadTried() {
    try {
      var saved = JSON.parse(localStorage.getItem(TRIED_STORE) || '[]');
      if (!Array.isArray(saved)) return [];
      return saved.filter(function (entry) {
        return entry && Array.isArray(entry.names) && entry.names.length === 54;
      }).map(function (entry) {
        return { names: entry.names.map(function (c) { return COLORS.indexOf(c) >= 0 ? c : null; }) };
      }).slice(0, TRIED_MAX);
    } catch (e) { return []; }
  }
  function rememberTry() {
    // An untouched cube is not a cube anyone tried.
    if (!names.some(function (c) { return !!c; })) return;
    var key = cubeKey(names);
    tried = tried.filter(function (entry) { return cubeKey(entry.names) !== key; });
    tried.unshift({ names: names.slice() });
    tried = tried.slice(0, TRIED_MAX);
    try { localStorage.setItem(TRIED_STORE, JSON.stringify(tried)); }
    catch (e) { /* the list still works for this visit without storage */ }
    renderTried();
  }
  /** A still picture: this cube cannot be spun or painted, only picked up again. */
  function triedFigure(entry, size) {
    var fig = window.CubeView.figure(entry.names.map(function (c) {
      return Math.max(0, COLORS.indexOf(c));
    }), {
      size: size, faceColour: COLORS,
      mask: function (idx) { return !!entry.names[idx]; }
    });
    fig.classList.add('cube-thumb');
    return fig;
  }
  function renderTried() {
    var list = $('history-list');
    list.innerHTML = '';
    $('cube-history').hidden = !tried.length;
    tried.forEach(function (entry, i) {
      var item = document.createElement('button');
      item.type = 'button';
      item.className = 'history-item';
      item.setAttribute('aria-label', t('history.item', { n: i + 1 }));
      item.appendChild(triedFigure(entry, 92));
      item.onclick = function () { askReopen(entry, item); };
      list.appendChild(item);
    });
  }

  /* Picking a cube off the shelf throws away whatever is on the big cube, so it
   * asks first, with the chosen cube shown beside the question. */
  var pendingTry = null;
  function askReopen(entry, item) {
    pendingTry = { entry: entry, item: item };
    var preview = $('history-confirm-cube');
    preview.innerHTML = '';
    preview.appendChild(triedFigure(entry, 108));
    $('history-confirm').hidden = false;
    $('history-confirm-yes').focus({ preventScroll: true });
  }
  function closeReopen(toItem) {
    if ($('history-confirm').hidden) return;
    $('history-confirm').hidden = true;
    var item = pendingTry && pendingTry.item;
    pendingTry = null;
    if (toItem && item && item.focus) item.focus({ preventScroll: true });
  }
  function reopenTried() {
    if (!pendingTry) return;
    var entry = pendingTry.entry;
    closeReopen(false);
    stopCamera();
    startCapture(false, entry.names);
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
        // Say so, but do not replace a saved lesson with a malformed link.
        $('progress-error').hidden = false;
      }
    }
    // No link to open: carry on with the lesson this device saved last, which
    // is how closing the page and coming back lands on the same turn.
    var local = null;
    try { local = localStorage.getItem(P.STORE); }
    catch (e) { /* a private window simply has nothing to carry on from */ }
    var saved = local && P.decode(local);
    if (saved) { restoreProgress(saved); return true; }
    return false;
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
      /* While the camera is on, the side facing the child glows: that is the
       * one it writes onto. With the camera off, nothing is singled out. */
      capView.onView(function (rx, ry, face, smooth) {
        capView.focus(cam.on ? K.frameFromView(rx, ry).front : null);
        mirrorAngles(suggestionView, rx, ry, smooth);
      });
    }
    if (!capPalette) capPalette = makePalette($('cap-palette'), setBrush, 'white');
    setBrush(capPalette.get());
    paintModel();
    var done = 6 - facesLeft();
    if (!fresh && !randomFill && done && done < 6) {
      $('cap-msg').hidden = false;
      $('cap-msg').className = 'small center kept-line';
      $('cap-msg').textContent = t('cap.kept.some', { n: done });
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
    clearCaptureIssue();
    cam.on = true;
    cam.found = null;
    cam.history = [];
    cam.candidate = { key: '', cells: null, streak: 0 };
    cam.handFixed = {};
    $('cam-dock').hidden = false;
    $('cap-msg').hidden = true;
    $('cam-status').textContent = t('cam.starting');
    $('cap-open-cam').classList.add('on');
    lightFacingSide();
    startStream();
  }
  function stopCamera() {
    cam.on = false;
    stopLive();
    stopStream();
    $('cam-dock').hidden = true;
    $('cap-open-cam').classList.remove('on');
    lightFacingSide();
  }

  /** Light the side the camera is aimed at, or no side while it is off. */
  function lightFacingSide() {
    if (!capView) return;
    var a = capView.angles();
    capView.focus(cam.on ? K.frameFromView(a.rx, a.ry).front : null);
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
    rememberTry();
    var left = facesLeft();
    if (left > 0) {
      // The camera still sees the previous physical side while the model turns.
      stopCamera();
      capView.showMissing();
      if ($('cap-cube').scrollIntoView) $('cap-cube').scrollIntoView({
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
    var report = CHECK.inspect(names);
    if (!report.ok) { showCaptureIssue(report); return; }
    solveAndTeach(report.state, report.centres.slice());
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
      showCaptureIssue({ code: 'stuck', source: names.slice(), suggestions: [], groups: [] });
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
      // Keep wrapped step controls and the fixed home button clear of the
      // centered panel, including when it is resized to fill the viewport.
      var space = 2 * (controls.offsetHeight + 84);
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
    renderTried();
    labelShare();
    labelResizeHandle();
    if (!$('screen-capture').hidden) setBrush(capPalette.get());
    if (captureIssue) renderCaptureIssue();
    if (!$('screen-coach').hidden && session) { startCoachChrome(); render(); }
  });
  tried = loadTried();
  renderTried();
  $('history-confirm-yes').onclick = reopenTried;
  $('history-confirm-no').onclick = function () { closeReopen(true); };
  $('history-confirm').onclick = function (e) {
    if (!e || e.target === $('history-confirm')) closeReopen(true);
  };
  $('net-redo').onclick = function () { startCapture(false); };
  $('cap-clear').onclick = function () { stopCamera(); startCapture(true); };
  $('cap-solve').onclick = trySolve;
  $('cap-issue-close').onclick = clearCaptureIssue;
  $('cap-issue-prev').onclick = function () { if (captureIssue && repairIndex > 0) { repairIndex--; renderCaptureIssue(); } };
  $('cap-issue-next').onclick = function () { if (captureIssue && repairIndex < captureIssue.suggestions.length - 1) { repairIndex++; renderCaptureIssue(); } };
  $('net-solve').onclick = assemble;
  $('coach-next').onclick = function () { step(1); };
  $('coach-back').onclick = function () { step(-1); };
  $('done-again').onclick = function () {
    if (cubeView.busy()) return;
    stopCamera();
    // Hide the lesson so nothing answers while the chooser loads.
    $('screen-coach').hidden = true;
    window.location.href = 'index.html';
  };
  $('cap-open-cam').onclick = toggleCamera;
  $('cam-close').onclick = stopCamera;
  $('share-progress').onclick = shareProgress;
  document.addEventListener('pointerdown', function (e) {
    if (!$('share-popover').hidden && !($('share-tools').contains(e.target))) hideShare();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('history-confirm').hidden) {
      closeReopen(true);
      e.preventDefault();
      return;
    }
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
    if (capView && document.hidden) capView.stopRepair();
    else if (captureIssue && currentScreen === 'capture') renderCaptureIssue();
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
  // A practice cube wins, then a link to a lesson; "start over" from the chooser
  // empties the cube, and a plain visit picks up the cube left here last time.
  if (autofillRandom) startCapture(false, null, true);
  else if (startFresh) startCapture(true);
  else if (!restoreSharedProgress()) startCapture(false);
})();
