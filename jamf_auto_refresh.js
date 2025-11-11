// ==UserScript==
// @name         Jamf Auto Refresh (Floating Window)
// @namespace    Charlie Chimp
// @version      1.8.0
// @author       BetterCallSaul <sherman@atlassian.com>
// @description  Automatically refreshes the current page at a user-selectable interval with draggable floating window and countdown timer.
// @match        https://pke.atlassian.com/*
// @match        https://atlassian.jamfcloud.com/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  // Prevent duplicate instances more robustly
  const instanceId = 'cc-auto-refresh-nav';
  if (window.__ccAutoRefreshLoaded || document.getElementById(instanceId)) {
    return;
  }
  window.__ccAutoRefreshLoaded = true;

  const REFRESH_INTERVAL_MS = 1 * 60 * 1000; // default 1 minute
  const DELAY_WHILE_TYPING_MS = 10 * 1000;   // Delay if user is typing when refresh would occur
  const STORAGE_KEY_ENABLED = 'cc_auto_refresh_enabled:' + location.host;
  const STORAGE_KEY_POS = 'cc_auto_refresh_pos:' + location.host;
  const STORAGE_KEY_INTERVAL = 'cc_auto_refresh_interval_ms:' + location.host;
  const STORAGE_KEY_COUNT = 'cc_auto_refresh_count:' + location.host;
  const STORAGE_KEY_LAST_REFRESH = 'cc_auto_refresh_last:' + location.host;
  const STORAGE_KEY_SESSION_START = 'cc_auto_refresh_session_start:' + location.host;
  const MIN_REFRESH_MS = 5 * 1000;          // 5 seconds minimum for safety
  const MAX_REFRESH_MS = 12 * 60 * 60 * 1000; // 12 hours max
  const INTERVAL_OPTIONS = [
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
  let refreshContainer, statusEl, tickTimer;
  let statusMessage = null;
  
  // Load session data from localStorage
  let sessionRefreshCount = (() => {
    const raw = parseInt(localStorage.getItem(STORAGE_KEY_COUNT) || '0', 10);
    return Number.isFinite(raw) ? raw : 0;
  })();
  
  let lastRefreshTime = (() => {
    const raw = parseInt(localStorage.getItem(STORAGE_KEY_LAST_REFRESH) || '', 10);
    return Number.isFinite(raw) ? raw : null;
  })();
  
  let sessionStartTime = (() => {
    const raw = parseInt(localStorage.getItem(STORAGE_KEY_SESSION_START) || '', 10);
    if (Number.isFinite(raw) && raw > 0) {
      return raw;
    }
    // First time - initialize session start time
    const now = Date.now();
    localStorage.setItem(STORAGE_KEY_SESSION_START, String(now));
    return now;
  })();
  
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  function formatTime(ms) {
    if (ms < 0) ms = 0;
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    const mm = String(m);
    const ss = String(s).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  function formatDuration(ms) {
    const totalSec = Math.round(ms / 1000);
    if (totalSec < 60) return `${totalSec} sec`;
    const minutes = totalSec / 60;
    if (Number.isInteger(minutes)) {
      return `${minutes} min`;
    }
    const whole = Math.floor(minutes);
    const remainderSec = totalSec - whole * 60;
    return `${whole} min ${remainderSec} sec`;
  }

  function formatTimeAgo(ms) {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds} sec ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    const remainingMins = minutes % 60;
    if (hours < 24) {
      return remainingMins > 0 ? `${hours}h ${remainingMins}m ago` : `${hours}h ago`;
    }
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  function formatSessionDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      const remainingSec = seconds % 60;
      return remainingSec > 0 ? `${minutes}m ${remainingSec}s` : `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMins = minutes % 60;
    if (hours < 24) {
      return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`;
    }
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
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
    if (!refreshContainer || !statusEl) return;

    if (statusMessage) {
      statusEl.textContent = statusMessage;
      return;
    }

    // Update countdown content
    if (enabled) {
      const remaining = Math.max(0, nextRefreshAt ? nextRefreshAt - Date.now() : 0);
      statusEl.textContent = `Next refresh: ${formatTime(remaining)}`;
    } else {
      statusEl.textContent = 'Auto-refresh is OFF';
    }
  }

  function loadPosition() {
    const saved = localStorage.getItem(STORAGE_KEY_POS);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // Ignore parse errors
      }
    }
    return { bottom: '20px', left: '20px' };
  }

  function savePosition(bottom, left) {
    localStorage.setItem(STORAGE_KEY_POS, JSON.stringify({ bottom, left }));
  }

  function startDragging(e) {
    isDragging = true;
    const rect = refreshContainer.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    refreshContainer.style.cursor = 'grabbing';
    e.preventDefault();
  }

  function stopDragging() {
    if (isDragging) {
      isDragging = false;
      refreshContainer.style.cursor = 'grab';
      // Save position
      const bottom = refreshContainer.style.bottom;
      const left = refreshContainer.style.left;
      savePosition(bottom, left);
    }
  }

  function drag(e) {
    if (!isDragging) return;
    
    const x = e.clientX - dragOffsetX;
    const y = e.clientY - dragOffsetY;
    
    // Convert to bottom/left positioning
    const bottom = window.innerHeight - y - refreshContainer.offsetHeight;
    const left = x;
    
    refreshContainer.style.bottom = `${Math.max(0, bottom)}px`;
    refreshContainer.style.left = `${Math.max(0, Math.min(window.innerWidth - refreshContainer.offsetWidth, left))}px`;
  }

  function createUI() {
    const position = loadPosition();
    
    // Create floating window container
    refreshContainer = document.createElement('div');
    refreshContainer.id = instanceId;
    refreshContainer.style.position = 'fixed';
    refreshContainer.style.bottom = position.bottom;
    refreshContainer.style.left = position.left;
    refreshContainer.style.width = '300px';
    refreshContainer.style.background = 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)';
    refreshContainer.style.border = '1px solid rgba(255,255,255,0.2)';
    refreshContainer.style.borderRadius = '12px';
    refreshContainer.style.boxShadow = '0 8px 32px rgba(0,0,0,0.4)';
    refreshContainer.style.padding = '16px';
    refreshContainer.style.fontFamily = 'system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
    refreshContainer.style.fontSize = '14px';
    refreshContainer.style.color = '#f8fafc';
    refreshContainer.style.zIndex = '99999';
    refreshContainer.style.cursor = 'grab';
    refreshContainer.style.userSelect = 'none';
    
    // Header with title and drag handle
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.marginBottom = '12px';
    header.style.paddingBottom = '12px';
    header.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
    
    const title = document.createElement('div');
    title.style.fontWeight = '600';
    title.style.fontSize = '16px';
    title.style.color = '#22c55e';
    title.textContent = '🔄 Auto Refresh';
    
    const dragHandle = document.createElement('div');
    dragHandle.style.color = 'rgba(255,255,255,0.4)';
    dragHandle.style.fontSize = '12px';
    dragHandle.style.cursor = 'grab';
    dragHandle.textContent = '⋮⋮';
    
    header.appendChild(title);
    header.appendChild(dragHandle);
    
    // Status display
    const statusRow = document.createElement('div');
    statusRow.style.marginBottom = '12px';
    statusRow.style.padding = '12px';
    statusRow.style.background = 'rgba(0,0,0,0.3)';
    statusRow.style.borderRadius = '8px';
    statusRow.style.border = '1px solid rgba(255,255,255,0.1)';
    
    statusEl = document.createElement('div');
    statusEl.style.fontSize = '13px';
    statusEl.style.fontWeight = '500';
    statusEl.style.marginBottom = '8px';
    statusEl.style.color = '#22c55e';
    statusRow.appendChild(statusEl);
    
    // Session counter
    const sessionCounterEl = document.createElement('div');
    sessionCounterEl.style.fontSize = '11px';
    sessionCounterEl.style.opacity = '0.7';
    sessionCounterEl.style.marginTop = '6px';
    sessionCounterEl.textContent = `Refreshed ${sessionRefreshCount} times this session`;
    statusRow.appendChild(sessionCounterEl);
    
    // Last refresh timestamp
    const lastRefreshEl = document.createElement('div');
    lastRefreshEl.style.fontSize = '11px';
    lastRefreshEl.style.opacity = '0.7';
    lastRefreshEl.style.marginTop = '2px';
    lastRefreshEl.textContent = lastRefreshTime ? `Last: ${formatTimeAgo(Date.now() - lastRefreshTime)}` : 'No refresh yet';
    statusRow.appendChild(lastRefreshEl);
    
    // Session duration
    const sessionDurationEl = document.createElement('div');
    sessionDurationEl.style.fontSize = '11px';
    sessionDurationEl.style.opacity = '0.7';
    sessionDurationEl.style.marginTop = '2px';
    sessionDurationEl.textContent = `Session: ${formatSessionDuration(Date.now() - sessionStartTime)}`;
    statusRow.appendChild(sessionDurationEl);
    
    // Manual refresh button
    const refreshNowBtn = document.createElement('button');
    refreshNowBtn.textContent = '🔄 Refresh Now';
    refreshNowBtn.style.width = '100%';
    refreshNowBtn.style.padding = '10px';
    refreshNowBtn.style.marginBottom = '8px';
    refreshNowBtn.style.border = 'none';
    refreshNowBtn.style.borderRadius = '8px';
    refreshNowBtn.style.background = '#3b82f6';
    refreshNowBtn.style.color = 'white';
    refreshNowBtn.style.cursor = 'pointer';
    refreshNowBtn.style.fontWeight = '600';
    refreshNowBtn.style.fontSize = '14px';
    refreshNowBtn.style.transition = 'all 0.2s ease';
    refreshNowBtn.addEventListener('mouseenter', () => {
      refreshNowBtn.style.background = '#2563eb';
      refreshNowBtn.style.transform = 'translateY(-1px)';
    });
    refreshNowBtn.addEventListener('mouseleave', () => {
      refreshNowBtn.style.background = '#3b82f6';
      refreshNowBtn.style.transform = 'translateY(0)';
    });
    refreshNowBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sessionRefreshCount++;
      lastRefreshTime = Date.now();
      localStorage.setItem(STORAGE_KEY_COUNT, String(sessionRefreshCount));
      localStorage.setItem(STORAGE_KEY_LAST_REFRESH, String(lastRefreshTime));
      window.location.reload();
    });
    
    // Toggle button
    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = enabled ? '⏸ Disable Auto-refresh' : '▶ Enable Auto-refresh';
    toggleBtn.style.width = '100%';
    toggleBtn.style.padding = '10px';
    toggleBtn.style.marginBottom = '12px';
    toggleBtn.style.border = 'none';
    toggleBtn.style.borderRadius = '8px';
    toggleBtn.style.background = enabled ? '#ef4444' : '#22c55e';
    toggleBtn.style.color = 'white';
    toggleBtn.style.cursor = 'pointer';
    toggleBtn.style.fontWeight = '600';
    toggleBtn.style.fontSize = '14px';
    toggleBtn.style.transition = 'all 0.2s ease';
    toggleBtn.addEventListener('mouseenter', () => {
      toggleBtn.style.transform = 'translateY(-1px)';
      toggleBtn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    });
    toggleBtn.addEventListener('mouseleave', () => {
      toggleBtn.style.transform = 'translateY(0)';
      toggleBtn.style.boxShadow = 'none';
    });
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      enabled = !enabled;
      localStorage.setItem(STORAGE_KEY_ENABLED, String(enabled));
      if (enabled) scheduleNext();
      else nextRefreshAt = null;
      toggleBtn.textContent = enabled ? '⏸ Disable Auto-refresh' : '▶ Enable Auto-refresh';
      toggleBtn.style.background = enabled ? '#ef4444' : '#22c55e';
      updateUI();
    });
    
    // Interval selector
    const intervalRow = document.createElement('div');
    intervalRow.style.display = 'flex';
    intervalRow.style.alignItems = 'center';
    intervalRow.style.gap = '8px';
    intervalRow.style.marginBottom = '8px';
    
    const intervalLabel = document.createElement('label');
    intervalLabel.textContent = 'Interval:';
    intervalLabel.style.fontSize = '13px';
    intervalLabel.style.fontWeight = '500';
    intervalLabel.style.minWidth = '60px';
    
    const intervalSelect = document.createElement('select');
    intervalSelect.style.flex = '1';
    intervalSelect.style.padding = '6px 8px';
    intervalSelect.style.border = '1px solid rgba(255,255,255,0.2)';
    intervalSelect.style.borderRadius = '6px';
    intervalSelect.style.background = '#334155';
    intervalSelect.style.color = '#f8fafc';
    intervalSelect.style.fontSize = '13px';
    intervalSelect.style.cursor = 'pointer';
    
    const populateOptions = (selectedValue) => {
      intervalSelect.innerHTML = '';
      let hasMatch = false;
      INTERVAL_OPTIONS.forEach(opt => {
        const optionEl = document.createElement('option');
        optionEl.text = opt.label;
        optionEl.value = String(opt.value);
        if (opt.value === selectedValue) {
          optionEl.selected = true;
          hasMatch = true;
        }
        intervalSelect.add(optionEl);
      });
      if (!hasMatch && selectedValue) {
        const customOption = document.createElement('option');
        customOption.text = `Custom (${formatDuration(selectedValue)})`;
        customOption.value = String(selectedValue);
        customOption.selected = true;
        intervalSelect.add(customOption);
      }
    };
    
    populateOptions(refreshIntervalMs);
    
    intervalSelect.addEventListener('change', (e) => {
      e.stopPropagation();
      const val = parseInt(intervalSelect.value, 10);
      if (Number.isFinite(val)) {
        refreshIntervalMs = Math.max(MIN_REFRESH_MS, Math.min(MAX_REFRESH_MS, val));
        localStorage.setItem(STORAGE_KEY_INTERVAL, String(refreshIntervalMs));
        populateOptions(refreshIntervalMs);
        if (enabled) scheduleNext(refreshIntervalMs);
        updateUI();
      }
    });
    
    intervalRow.appendChild(intervalLabel);
    intervalRow.appendChild(intervalSelect);
    
    // Assemble the UI
    refreshContainer.appendChild(header);
    refreshContainer.appendChild(statusRow);
    refreshContainer.appendChild(refreshNowBtn);
    refreshContainer.appendChild(toggleBtn);
    refreshContainer.appendChild(intervalRow);
    
    // Store references for updates
    window.__ccRefreshSessionCounter = sessionCounterEl;
    window.__ccRefreshLastTimestamp = lastRefreshEl;
    window.__ccRefreshSessionDuration = sessionDurationEl;
    
    // Add drag functionality
    header.addEventListener('mousedown', startDragging);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', stopDragging);
    
    // Prevent text selection while dragging
    refreshContainer.addEventListener('dragstart', (e) => e.preventDefault());
    
    // Add to page
    document.body.appendChild(refreshContainer);
    
    console.log('[Jamf Auto-Refresh] Floating window created');
  }

  function tick() {
    if (!refreshContainer) {
      clearInterval(tickTimer);
      return;
    }

    if (!enabled) {
      statusMessage = null;
      updateUI();
      return;
    }

    if (!nextRefreshAt) {
      scheduleNext();
    }

    const now = Date.now();
    const remaining = nextRefreshAt - now;

    // Update last refresh timestamp display if it exists
    if (window.__ccRefreshLastTimestamp && lastRefreshTime) {
      window.__ccRefreshLastTimestamp.textContent = `Last: ${formatTimeAgo(now - lastRefreshTime)}`;
    }
    
    // Update session duration display if it exists
    if (window.__ccRefreshSessionDuration) {
      window.__ccRefreshSessionDuration.textContent = `Session: ${formatSessionDuration(now - sessionStartTime)}`;
    }

    if (remaining <= 0) {
      if (isUserTyping()) {
        // Delay refresh slightly to avoid interrupting text entry
        scheduleNext(DELAY_WHILE_TYPING_MS);
        statusMessage = 'Refresh delayed while typing…';
      } else {
        statusMessage = null;
        updateUI();
        sessionRefreshCount++;
        lastRefreshTime = Date.now();
        // Save to localStorage before refresh
        localStorage.setItem(STORAGE_KEY_COUNT, String(sessionRefreshCount));
        localStorage.setItem(STORAGE_KEY_LAST_REFRESH, String(lastRefreshTime));
        // Update session counter and last refresh if elements exist
        if (window.__ccRefreshSessionCounter) {
          window.__ccRefreshSessionCounter.textContent = `Refreshed ${sessionRefreshCount} times this session`;
        }
        if (window.__ccRefreshLastTimestamp) {
          window.__ccRefreshLastTimestamp.textContent = `Last: just now`;
        }
        window.location.reload();
        return; // In case reload is blocked for some reason
      }
    } else {
      statusMessage = null;
    }

    updateUI();
  }

  function init() {
    createUI();
    updateUI();
    tickTimer = setInterval(tick, 1000);

    // Handle AngularJS navigation and SPA changes
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

    // Watch for Angular route changes if available
    if (window.angular) {
      try {
        const rootScope = window.angular.element(document).scope().$root;
        if (rootScope) {
          rootScope.$on('$routeChangeSuccess', handleUrlChange);
          rootScope.$on('$stateChangeSuccess', handleUrlChange);
        }
      } catch (e) {
        // Ignore Angular integration errors
      }
    }

    // Run tick immediately to set initial countdown
    tick();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
