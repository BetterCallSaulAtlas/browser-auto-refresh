// ==UserScript==
// @name         Jamf Auto Refresh (Toggle + Timer, Draggable Top-Right)
// @namespace    Charlie Chimp
// @version      1.3.0
// @author       BetterCallSaul <sherman@atlassian.com>
// @description  Automatically refreshes the current page at a user-selectable interval with an on-page toggle and countdown timer. Panel sits top-right, is draggable, and remembers its position and settings.
// @match        https://pke.atlassian.com/
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // Prevent duplicate instances more robustly
  const instanceId = 'cc-auto-refresh-panel';
  if (window.__ccAutoRefreshLoaded || document.getElementById(instanceId)) {
    return;
  }
  window.__ccAutoRefreshLoaded = true;

  const REFRESH_INTERVAL_MS = 1 * 60 * 1000; // default 1 minute
  const DELAY_WHILE_TYPING_MS = 10 * 1000;   // Delay if user is typing when refresh would occur
  const STORAGE_KEY_ENABLED = 'cc_auto_refresh_enabled:' + location.host;
  const STORAGE_KEY_POS = 'cc_auto_refresh_pos:' + location.host;
const STORAGE_KEY_INTERVAL = 'cc_auto_refresh_interval_ms:' + location.host;
const MIN_REFRESH_MS = 5 * 1000;          // 5 seconds minimum for safety
const MAX_REFRESH_MS = 12 * 60 * 60 * 1000; // 12 hours max

// Load refresh interval from storage or use default
let refreshIntervalMs = (() => {
  const raw = parseInt(localStorage.getItem(STORAGE_KEY_INTERVAL) || '', 10);
  const v = Number.isFinite(raw) ? raw : REFRESH_INTERVAL_MS;
  return Math.max(MIN_REFRESH_MS, Math.min(MAX_REFRESH_MS, v));
})();

  let enabled = (() => {
    const raw = localStorage.getItem(STORAGE_KEY_ENABLED);
    return raw === null ? true : raw === 'true';
  })();

  let nextRefreshAt = enabled ? Date.now() + refreshIntervalMs : null;
  let ui, panel, handle, toggleBtn, countdownEl, statusEl, tickTimer, intervalLabel, intervalSelect, intervalRow;

  function formatTime(ms) {
    if (ms < 0) ms = 0;
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    const mm = String(m);
    const ss = String(s).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  function isUserTyping() {
    const a = document.activeElement;
    if (!a) return false;
    const tag = (a.tagName || '').toLowerCase();
    const isFormField = ['input', 'textarea', 'select'].includes(tag);
    return a.isContentEditable || isFormField;
  }

  function scheduleNext(ms = refreshIntervalMs) {
    nextRefreshAt = Date.now() + ms;
  }

  function updateUI() {
    if (!ui) return;

    if (enabled) {
      toggleBtn.textContent = 'Auto-refresh: ON';
      toggleBtn.style.background = '#22c55e';
      const remaining = nextRefreshAt ? nextRefreshAt - Date.now() : 0;
      const absolute = nextRefreshAt
        ? new Date(nextRefreshAt).toLocaleTimeString()
        : '—';
      countdownEl.textContent = `Next refresh in ${formatTime(remaining)} (at ${absolute})`;
    } else {
      toggleBtn.textContent = 'Auto-refresh: OFF';
      toggleBtn.style.background = '#ef4444';
      countdownEl.textContent = 'Auto-refresh is OFF';
      statusEl.textContent = '';
    }
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function savePosition() {
    const rect = ui.getBoundingClientRect();
    const pos = { left: Math.round(rect.left), top: Math.round(rect.top) };
    try { localStorage.setItem(STORAGE_KEY_POS, JSON.stringify(pos)); } catch {}
  }

  function loadPosition() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_POS);
      if (!raw) return false;
      const pos = JSON.parse(raw);
      if (typeof pos?.left === 'number' && typeof pos?.top === 'number') {
        // Ensure within viewport
        const left = clamp(pos.left, 0, window.innerWidth - ui.offsetWidth);
        const top = clamp(pos.top, 0, window.innerHeight - ui.offsetHeight);
        ui.style.left = left + 'px';
        ui.style.top = top + 'px';
        ui.style.right = '';   // switch to left/top anchoring
        ui.style.bottom = '';
        return true;
      }
    } catch {}
    return false;
  }

  function createUI() {
    ui = document.createElement('div');
    ui.id = instanceId; // Set the ID for duplicate detection
    ui.style.position = 'fixed';
    ui.style.top = '16px';
    ui.style.right = '16px';  // initial anchor top-right
    ui.style.zIndex = '2147483647';
    ui.style.display = 'flex';
    ui.style.flexDirection = 'column';
    ui.style.gap = '6px';
    ui.style.fontFamily = 'system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,"Helvetica Neue",Arial,"Noto Sans",sans-serif';
    ui.style.fontSize = '12px';
    ui.style.color = '#f8fafc';
    ui.style.userSelect = 'none';

    panel = document.createElement('div');
    panel.style.background = 'rgba(15, 23, 42, 0.9)';
    panel.style.border = '1px solid rgba(255,255,255,0.15)';
    panel.style.borderRadius = '8px';
    panel.style.padding = '10px 12px';
    panel.style.boxShadow = '0 8px 20px rgba(0,0,0,0.3)';
    panel.style.minWidth = '240px';
    panel.style.maxWidth = '60vw';

    // Drag handle
    handle = document.createElement('div');
    handle.title = 'Drag to move';
    handle.style.height = '10px';
    handle.style.margin = '-4px -6px 6px -6px';
    handle.style.borderRadius = '6px 6px 0 0';
    handle.style.cursor = 'grab';
    handle.style.background = 'linear-gradient(180deg, rgba(255,255,255,0.15), rgba(255,255,255,0.05))';
    handle.style.border = '1px solid rgba(255,255,255,0.08)';

    toggleBtn = document.createElement('button');
    toggleBtn.textContent = enabled ? 'Auto-refresh: ON' : 'Auto-refresh: OFF';
    toggleBtn.style.cursor = 'pointer';
    toggleBtn.style.border = 'none';
    toggleBtn.style.borderRadius = '6px';
    toggleBtn.style.padding = '8px 10px';
    toggleBtn.style.fontWeight = '600';
    toggleBtn.style.color = '#0b1220';
    toggleBtn.style.background = enabled ? '#22c55e' : '#ef4444';
    toggleBtn.setAttribute('aria-label', 'Toggle auto-refresh');
    toggleBtn.addEventListener('click', () => {
      enabled = !enabled;
      localStorage.setItem(STORAGE_KEY_ENABLED, String(enabled));
      if (enabled) scheduleNext();
      else nextRefreshAt = null;
      statusEl.textContent = '';
      updateUI();
    });

    // Interval picker row
    intervalRow = document.createElement('div');
    intervalRow.style.display = 'flex';
    intervalRow.style.alignItems = 'center';
    intervalRow.style.gap = '8px';
    intervalRow.style.marginTop = '8px';

    intervalLabel = document.createElement('label');
    intervalLabel.textContent = 'Refresh every:';
    intervalLabel.style.opacity = '0.9';

    intervalSelect = document.createElement('select');
    intervalSelect.style.flex = '0 0 auto';
    intervalSelect.style.padding = '4px 6px';
    intervalSelect.style.borderRadius = '6px';
    intervalSelect.style.border = '1px solid rgba(255,255,255,0.2)';
    intervalSelect.style.background = '#0b1220';
    intervalSelect.style.color = '#f8fafc';

    const options = [
      { label: '15 sec', value: 15 * 1000 },
      { label: '30 sec', value: 30 * 1000 },
      { label: '1 min', value: 1 * 60 * 1000 },
      { label: '2 min', value: 2 * 60 * 1000 },
      { label: '3 min', value: 3 * 60 * 1000 },
      { label: '5 min', value: 5 * 60 * 1000 },
      { label: '10 min', value: 10 * 60 * 1000 },
      { label: '15 min', value: 15 * 60 * 1000 },
      { label: '30 min', value: 30 * 60 * 1000 },
    ];
    options.forEach(opt => {
      const o = document.createElement('option');
      o.text = opt.label;
      o.value = String(opt.value);
      if (opt.value === refreshIntervalMs) o.selected = true;
      intervalSelect.add(o);
    });

    intervalSelect.addEventListener('change', () => {
      const val = parseInt(intervalSelect.value, 10);
      if (Number.isFinite(val)) {
        refreshIntervalMs = Math.max(MIN_REFRESH_MS, Math.min(MAX_REFRESH_MS, val));
        localStorage.setItem(STORAGE_KEY_INTERVAL, String(refreshIntervalMs));
        if (enabled) scheduleNext(refreshIntervalMs);
        updateUI();
      }
    });

    intervalRow.appendChild(intervalLabel);
    intervalRow.appendChild(intervalSelect);

    countdownEl = document.createElement('div');
    countdownEl.style.marginTop = '8px';

    statusEl = document.createElement('div');
    statusEl.style.marginTop = '4px';
    statusEl.style.opacity = '0.8';

    panel.appendChild(handle);
    panel.appendChild(toggleBtn);
    panel.appendChild(intervalRow);
    panel.appendChild(countdownEl);
    panel.appendChild(statusEl);
    ui.appendChild(panel);
    document.body.appendChild(ui);

    // If we have saved position, apply it now that it's in the DOM
    loadPosition();

    // Drag logic (pointer events with fallback)
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    const onPointerDown = (e) => {
      dragging = true;
      handle.setPointerCapture?.(e.pointerId);
      handle.style.cursor = 'grabbing';

      const rect = ui.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;

      // Switch to left/top anchoring for free movement
      ui.style.left = rect.left + 'px';
      ui.style.top = rect.top + 'px';
      ui.style.right = '';
      ui.style.bottom = '';

      e.preventDefault();
      e.stopPropagation();
    };

    const onPointerMove = (e) => {
      if (!dragging) return;
      const left = clamp(e.clientX - offsetX, 0, window.innerWidth - ui.offsetWidth);
      const top = clamp(e.clientY - offsetY, 0, window.innerHeight - ui.offsetHeight);
      ui.style.left = left + 'px';
      ui.style.top = top + 'px';
    };

    const onPointerUp = (e) => {
      if (!dragging) return;
      dragging = false;
      handle.releasePointerCapture?.(e.pointerId);
      handle.style.cursor = 'grab';
      savePosition();
    };

    // Use pointer events if available
    if (window.PointerEvent) {
      handle.addEventListener('pointerdown', onPointerDown);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
    } else {
      // Fallback to mouse/touch
      handle.addEventListener('mousedown', (e) => onPointerDown(e));
      window.addEventListener('mousemove', (e) => onPointerMove(e));
      window.addEventListener('mouseup', (e) => onPointerUp(e));

      handle.addEventListener('touchstart', (e) => {
        const t = e.touches[0];
        onPointerDown({ clientX: t.clientX, clientY: t.clientY, preventDefault: () => e.preventDefault(), stopPropagation: () => e.stopPropagation() });
      }, { passive: false });
      window.addEventListener('touchmove', (e) => {
        const t = e.touches[0];
        onPointerMove({ clientX: t.clientX });
        // Y coordinate is also required:
        onPointerMove({ clientX: t.clientX, clientY: t.clientY });
      }, { passive: false });
      window.addEventListener('touchend', (e) => onPointerUp(e));
      window.addEventListener('touchcancel', (e) => onPointerUp(e));
    }

    // Keep panel inside viewport when resizing
    window.addEventListener('resize', () => {
      const rect = ui.getBoundingClientRect();
      const left = clamp(rect.left, 0, window.innerWidth - ui.offsetWidth);
      const top = clamp(rect.top, 0, window.innerHeight - ui.offsetHeight);
      ui.style.left = left + 'px';
      ui.style.top = top + 'px';
      ui.style.right = '';
      ui.style.bottom = '';
      savePosition();
    });
  }

  function tick() {
    if (!enabled) {
      updateUI();
      return;
    }

    if (!nextRefreshAt) {
      scheduleNext();
    }

    const now = Date.now();
    const remaining = nextRefreshAt - now;

    if (remaining <= 0) {
      if (isUserTyping()) {
        // Delay refresh slightly to avoid interrupting text entry
        scheduleNext(DELAY_WHILE_TYPING_MS);
        statusEl.textContent = 'Refresh delayed while typing…';
      } else {
        statusEl.textContent = '';
        window.location.reload();
        return; // In case reload is blocked for some reason
      }
    }

    updateUI();
  }

  function init() {
    createUI();
    updateUI();
    tickTimer = setInterval(tick, 1000);

    // If the site navigates via SPA, re-render timer text after URL changes.
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    function handleUrlChange() {
      // Reset the timer on SPA navigation for clarity
      if (enabled) scheduleNext();
      updateUI();
    }
    history.pushState = function () {
      const ret = originalPushState.apply(this, arguments);
      handleUrlChange();
      return ret;
    };
    history.replaceState = function () {
      const ret = originalReplaceState.apply(this, arguments);
      handleUrlChange();
      return ret;
    };
    window.addEventListener('popstate', handleUrlChange);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
