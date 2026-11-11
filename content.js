(() => {
  // Only one instance may live in a frame. An older instance can linger after the extension is
  // reloaded/updated (its chrome.* APIs die but its DOM listeners and canvas stay), or after the
  // popup re-injects this script. Two overlays get out of sync and the stale one keeps eating
  // clicks, so every new instance tells earlier ones (via the shared DOM) to tear down.
  const TAKEOVER_EVENT = 'writeupslides:takeover';
  const CANVAS_ATTR = 'data-writeupslides';
  // Names used before the rename (v1.7), so an older instance still gets cleaned up.
  const LEGACY_TAKEOVER_EVENT = 'slides-free-draw:takeover';
  const LEGACY_CANVAS_ATTR = 'data-slides-free-draw';
  document.dispatchEvent(new CustomEvent(TAKEOVER_EVENT));
  document.dispatchEvent(new CustomEvent(LEGACY_TAKEOVER_EVENT));

  const lifetime = new AbortController();
  const signal = lifetime.signal;
  let teardownHooks = [];

  function teardown() {
    if (signal.aborted) return;
    lifetime.abort();
    teardownHooks.forEach((fn) => {
      try { fn(); } catch (_) { /* ignore */ }
    });
    teardownHooks = [];
  }

  document.addEventListener(TAKEOVER_EVENT, teardown, { signal });

  // After an extension reload the old instance's runtime is invalidated.
  function extensionAlive() {
    try {
      return Boolean(chrome.runtime && chrome.runtime.id);
    } catch (_) {
      return false;
    }
  }

  const HOTKEY_MSG = 'writeupslides-hotkey';
  const HOTKEYS = { KeyD: 'toggle_drawing', KeyE: 'toggle_eraser', KeyC: 'clear_canvas' };
  const HOTKEY_ACTIONS = new Set(Object.values(HOTKEYS));

  // Use e.code (physical key) so Option+key works on macOS, where e.key becomes "∂", "´", "ç".
  function hotkeyAction(e) {
    if (!e.altKey || e.ctrlKey || e.metaKey) return null;
    return HOTKEYS[e.code] || null;
  }

  if (window.top !== window.self) {
    // Sub-frame (e.g. Slides' hidden keyboard-input iframe, which usually holds focus):
    // catch the hotkeys here and forward them to the top frame, which owns the canvas.
    window.addEventListener('keydown', (e) => {
      const action = hotkeyAction(e);
      if (!action) return;
      if (!extensionAlive()) {
        teardown();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      try {
        window.top.postMessage({ type: HOTKEY_MSG, action }, 'https://docs.google.com');
      } catch (_) {
        // Top frame not reachable; nothing to do.
      }
    }, { capture: true, signal });
    return;
  }

  let canvas, ctx;
  let isDrawing = false;
  let drawingModeActive = false;
  let manualEraserMode = false;
  let currentColor = '#FF0000';
  let strokePoints = [];
  let currentDpr = 1;

  const PEN_WIDTH = 4;
  const ERASER_WIDTH = 28;
  // Elements whose children are never rendered, so the canvas can't be attached inside them.
  const REPLACED_ELEMENTS = new Set(['IFRAME', 'VIDEO', 'IMG', 'CANVAS', 'OBJECT', 'EMBED']);

  function getValidParent() {
    const fsElem = document.fullscreenElement;
    if (fsElem && fsElem.nodeType === Node.ELEMENT_NODE) {
      if (!REPLACED_ELEMENTS.has(fsElem.tagName)) return fsElem;
      console.warn('writeUpSlides: fullscreen element is a <' + fsElem.tagName.toLowerCase() +
        '>; the drawing overlay cannot be shown on top of it.');
    }
    return document.body || document.documentElement;
  }

  function initCanvas() {
    if (canvas) return;

    // Remove overlays left behind by earlier instances.
    document.querySelectorAll(`canvas[${CANVAS_ATTR}], canvas[${LEGACY_CANVAS_ATTR}]`).forEach((old) => old.remove());

    canvas = document.createElement('canvas');
    canvas.setAttribute(CANVAS_ATTR, '');
    teardownHooks.push(() => {
      canvas.remove();
      canvas = null;
      ctx = null;
      drawingModeActive = false;
      isDrawing = false;
    });
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.zIndex = '2147483647';
    canvas.style.pointerEvents = drawingModeActive ? 'auto' : 'none';
    canvas.style.cursor = 'crosshair';
    // Stop the browser from turning pen/touch strokes into scroll/pan gestures (which cancels them).
    canvas.style.touchAction = 'none';
    canvas.style.userSelect = 'none';

    const parent = getValidParent();
    try {
      parent.appendChild(canvas);
    } catch (e) {
      if (document.body) document.body.appendChild(canvas);
    }

    ctx = canvas.getContext('2d');
    resizeCanvas();

    canvas.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });

    canvas.addEventListener('pointerdown', startDrawing, { signal });
    canvas.addEventListener('pointermove', draw, { signal });
    canvas.addEventListener('pointerup', stopDrawing, { signal });
    canvas.addEventListener('pointercancel', stopDrawing, { signal });
    canvas.addEventListener('lostpointercapture', stopDrawing, { signal });
  }

  function resizeCanvas() {
    if (!canvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * dpr);
    const height = Math.round(window.innerHeight * dpr);

    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;

    if (canvas.width === width && canvas.height === height && dpr === currentDpr) return;

    // Setting canvas.width/height wipes the bitmap, so copy the existing ink first.
    let snapshot = null;
    if (canvas.width > 0 && canvas.height > 0) {
      snapshot = document.createElement('canvas');
      snapshot.width = canvas.width;
      snapshot.height = canvas.height;
      snapshot.getContext('2d').drawImage(canvas, 0, 0);
    }

    const scale = dpr / currentDpr;
    canvas.width = width;
    canvas.height = height;
    currentDpr = dpr;

    // Context state was reset by the resize: identity transform, source-over.
    if (snapshot) {
      ctx.drawImage(snapshot, 0, 0, snapshot.width * scale, snapshot.height * scale);
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  function updateStyle(isErasing) {
    if (!ctx) return;
    if (isErasing) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = ERASER_WIDTH;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = currentColor;
      ctx.fillStyle = currentColor;
      ctx.lineWidth = PEN_WIDTH;
    }
  }

  function checkIsErasing(e) {
    // Bitmask checks: pen tip (1) + barrel button (2) gives buttons === 3, eraser end is 32.
    // e.button covers pointerdown (2 = barrel/right-click, 5 = eraser end).
    const sideButton = (e.buttons & 2) !== 0 || (e.buttons & 32) !== 0 ||
      e.button === 2 || e.button === 5;
    return manualEraserMode || sideButton;
  }

  function startDrawing(e) {
    if (!drawingModeActive || !ctx) return;
    e.preventDefault();
    isDrawing = true;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (_) {
      // Capture is best-effort.
    }

    updateStyle(checkIsErasing(e));
    strokePoints = [{ x: e.clientX, y: e.clientY }];

    // Draw a dot so a single tap leaves a mark (or erases a spot).
    ctx.beginPath();
    ctx.arc(e.clientX, e.clientY, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function draw(e) {
    if (!isDrawing || !drawingModeActive || !ctx) return;

    updateStyle(checkIsErasing(e));

    const coalesced = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    const events = coalesced.length ? coalesced : [e];

    for (const event of events) {
      strokePoints.push({ x: event.clientX, y: event.clientY });
      const n = strokePoints.length;

      if (n === 2) {
        // First segment: from the start point to the first midpoint, so the stroke has no gap.
        const p0 = strokePoints[0];
        const p1 = strokePoints[1];
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo((p0.x + p1.x) / 2, (p0.y + p1.y) / 2);
        ctx.stroke();
      } else if (n >= 3) {
        const p1 = strokePoints[n - 3];
        const p2 = strokePoints[n - 2];
        const p3 = strokePoints[n - 1];

        ctx.beginPath();
        ctx.moveTo((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
        ctx.quadraticCurveTo(p2.x, p2.y, (p2.x + p3.x) / 2, (p2.y + p3.y) / 2);
        ctx.stroke();
      }
    }
  }

  function stopDrawing(e) {
    if (canvas && e && e.pointerId !== undefined && canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
    isDrawing = false;
    strokePoints = [];
  }

  function toggleDrawing(forceState) {
    if (signal.aborted) return;
    drawingModeActive = forceState !== undefined ? forceState : !drawingModeActive;
    if (!canvas) {
      initCanvas();
    }
    if (canvas) {
      canvas.style.pointerEvents = drawingModeActive ? 'auto' : 'none';
    }
    if (!drawingModeActive) stopDrawing();
  }

  function clearScreen() {
    if (ctx && canvas) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
  }

  function getState() {
    return { drawingModeActive, manualEraserMode, currentColor };
  }

  function runCommand(action) {
    if (action === 'toggle_drawing') toggleDrawing();
    else if (action === 'toggle_eraser') manualEraserMode = !manualEraserMode;
    else if (action === 'clear_canvas') clearScreen();
  }

  // Capture phase + preventDefault so Slides doesn't swallow the keys and Chrome doesn't
  // act on them (Alt+D = address bar, Alt+E = Chrome menu on Windows/Linux).
  window.addEventListener('keydown', (e) => {
    const action = hotkeyAction(e);
    if (!action) return;
    if (!extensionAlive()) {
      teardown();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    runCommand(action);
  }, { capture: true, signal });

  // Hotkeys forwarded from sub-frames (see top of file).
  window.addEventListener('message', (e) => {
    if (e.origin !== window.location.origin) return;
    if (!extensionAlive()) {
      teardown();
      return;
    }
    const data = e.data;
    if (data && data.type === HOTKEY_MSG && HOTKEY_ACTIONS.has(data.action)) {
      runCommand(data.action);
    }
  }, { signal });

  document.addEventListener('fullscreenchange', () => {
    if (canvas) {
      const parent = getValidParent();
      if (parent && canvas.parentNode !== parent) {
        try {
          parent.appendChild(canvas);
        } catch (e) {
          console.warn('Fullscreen canvas attach notice:', e);
        }
      }
      resizeCanvas();
    }
  }, { signal });

  window.addEventListener('resize', resizeCanvas, { signal });

  function onRuntimeMessage(request, sender, sendResponse) {
    if (signal.aborted) return;
    switch (request.command) {
      case 'get_state':
        break;
      case 'toggle_drawing':
      case 'toggle_eraser':
      case 'clear_canvas':
        runCommand(request.command);
        break;
      case 'set_color':
        if (request.color) {
          currentColor = request.color;
          manualEraserMode = false;
        }
        break;
      default:
        sendResponse({ status: 'unknown' });
        return;
    }
    sendResponse(getState());
  }

  chrome.runtime.onMessage.addListener(onRuntimeMessage);
  teardownHooks.push(() => {
    try { chrome.runtime.onMessage.removeListener(onRuntimeMessage); } catch (_) { /* invalidated */ }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCanvas, { signal });
  } else {
    initCanvas();
  }
})();
