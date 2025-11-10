// ==UserScript==
// @name         Jamf Auto Refresh (Sidebar Widget)
// @namespace    Charlie Chimp
// @version      1.7.0
// @author       BetterCallSaul <sherman@atlassian.com>
// @description  Automatically refreshes the current page at a user-selectable interval with native Jamf Pro sidebar integration and countdown timer.
// @match        https://pke.atlassian.com/
// @grant        none
// @run-at       document-idle
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
  let refreshContainer, refreshIcon, refreshDropdown, statusEl, dropdownStatusEl, navTimerBadge, dropdownTimerBadge, tickTimer;
  let isDropdownOpen = false;
  let statusMessage = null;
  let sessionRefreshCount = 0; // Track refreshes this session
  let lastRefreshTime = null; // Track last refresh timestamp

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
    if (!refreshContainer) return;

    // Update icon appearance based on enabled state
    refreshIcon.style.color = enabled ? '#22c55e' : 'rgba(255, 255, 255, 0.87)';
    if (refreshContainer) {
      refreshContainer.title = enabled 
        ? `Auto-refresh ON (${formatDuration(refreshIntervalMs)})` 
        : 'Auto-refresh OFF';
    }

    const timerTargets = [navTimerBadge, dropdownTimerBadge].filter(Boolean);

    if (!statusEl) return;

    const applyTimer = (text, visible) => {
      for (const badge of timerTargets) {
        badge.textContent = text;
        badge.style.display = visible ? 'inline-flex' : 'none';
      }
    };

    if (statusMessage) {
      statusEl.textContent = statusMessage;
      if (dropdownStatusEl) {
        dropdownStatusEl.textContent = statusMessage;
        dropdownStatusEl.style.display = 'block';
      }
      applyTimer('', false);
      return;
    }

    // Update dropdown status content
    if (!dropdownStatusEl) {
      applyTimer('', false);
    }

    // Update countdown content
    if (enabled) {
      const remaining = Math.max(0, nextRefreshAt ? nextRefreshAt - Date.now() : 0);
      const absolute = nextRefreshAt ? new Date(nextRefreshAt).toLocaleTimeString() : '—';
      const text = `Next: ${formatTime(remaining)} (${absolute})`;
      statusEl.textContent = text;
      if (dropdownStatusEl) {
        dropdownStatusEl.textContent = text;
        dropdownStatusEl.style.display = isDropdownOpen ? 'block' : 'none';
      }
      applyTimer(formatTime(remaining), true);
    } else {
      const text = 'Auto-refresh is OFF';
      statusEl.textContent = text;
      if (dropdownStatusEl) {
        dropdownStatusEl.textContent = text;
        dropdownStatusEl.style.display = isDropdownOpen ? 'block' : 'none';
      }
      applyTimer('', false);
    }
  }

  function findInShadowDOM(selector) {
    // Check regular DOM first
    let element = document.querySelector(selector);
    if (element) return element;

    // Search in shadow roots recursively
    function searchShadowRoots(root) {
      const elements = root.querySelectorAll('*');
      for (const el of elements) {
        if (el.shadowRoot) {
          const found = el.shadowRoot.querySelector(selector);
          if (found) return found;
          
          // Recursively search nested shadow roots
          const nestedFound = searchShadowRoots(el.shadowRoot);
          if (nestedFound) return nestedFound;
        }
      }
      return null;
    }

    return searchShadowRoots(document);
  }

  function waitForSidebar() {
    return new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 300; // ~30 seconds

      const checkSidebar = () => {
        // Look for jamf-nav-side-container (the actual Jamf sidebar element)
        const sidebarContainer = document.querySelector('jamf-nav-side-container');
        
        if (sidebarContainer) {
          console.log('[Jamf Auto-Refresh] Found jamf-nav-side-container');
          resolve(sidebarContainer);
          return;
        }

        attempts += 1;
        if (attempts >= maxAttempts) {
          console.error('[Jamf Auto-Refresh] Timed out waiting for sidebar, using body as fallback');
          resolve(null);
          return;
        }

        setTimeout(checkSidebar, 100);
      };
      checkSidebar();
    });
  }

  function toggleDropdown() {
    isDropdownOpen = !isDropdownOpen;
    refreshDropdown.style.display = isDropdownOpen ? 'block' : 'none';

    if (!isDropdownOpen) {
      dropdownStatusEl.textContent = statusMessage || '';
      dropdownStatusEl.style.display = statusMessage ? 'block' : 'none';
      return;
    }

    // Close dropdown when clicking outside
    const closeHandler = (e) => {
      if (!refreshContainer.contains(e.target)) {
        isDropdownOpen = false;
        refreshDropdown.style.display = 'none';
        dropdownStatusEl.textContent = statusMessage || '';
        dropdownStatusEl.style.display = statusMessage ? 'block' : 'none';
        document.removeEventListener('click', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 0);
  }

  async function createUI() {
    const sidebarContainer = await waitForSidebar();
    
    // Create a wrapper that mimics jamf-nav-single-item structure
    refreshContainer = document.createElement('div');
    refreshContainer.id = instanceId;
    refreshContainer.style.position = 'relative';
    refreshContainer.style.margin = '4px 0';
    refreshContainer.style.maxWidth = 'max-content';
    refreshContainer.style.maxWidth = 'unset';
    refreshContainer.style.zIndex = '5';
    
    // Create the inner button that mimics .single--item
    const innerButton = document.createElement('div');
    innerButton.className = 'cc-auto-refresh-item';
    innerButton.style.display = 'flex';
    innerButton.style.alignItems = 'center';
    innerButton.style.gap = '12px';
    innerButton.style.padding = '8px';
    innerButton.style.margin = '0';
    innerButton.style.background = enabled ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0)';
    innerButton.style.borderRadius = '8px';
    innerButton.style.height = '28px';
    innerButton.style.cursor = 'pointer';
    innerButton.style.transition = 'background 0.2s ease';
    innerButton.style.color = 'rgba(255, 255, 255, 0.87)';
    innerButton.style.fontSize = '16px';
    innerButton.tabIndex = 0;
    innerButton.role = 'button';
    
    // Create icon container (mimics link--icon)
    const iconContainer = document.createElement('div');
    iconContainer.style.display = 'block';
    iconContainer.style.width = '20px';
    iconContainer.style.height = '20px';
    iconContainer.style.flexShrink = '0';
    
    // Create the refresh icon using SVG to match native icons
    refreshIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    refreshIcon.setAttribute('class', 'svg-icon link--icon');
    refreshIcon.setAttribute('viewBox', '0 0 24 24');
    refreshIcon.setAttribute('fill', 'currentColor');
    refreshIcon.style.width = '20px';
    refreshIcon.style.height = 'auto';
    refreshIcon.style.display = 'block';
    refreshIcon.style.color = enabled ? '#22c55e' : 'rgba(255, 255, 255, 0.87)';
    refreshIcon.style.transition = 'color 0.2s ease';
    
    // SVG path for refresh icon
    const iconPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    iconPath.setAttribute('d', 'M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z');
    refreshIcon.appendChild(iconPath);
    iconContainer.appendChild(refreshIcon);
    
    // Create label (mimics link--slot)
    const labelEl = document.createElement('div');
    labelEl.style.display = 'flex';
    labelEl.style.flexDirection = 'row';
    labelEl.style.alignItems = 'center';
    labelEl.style.gap = '8px';
    labelEl.style.flex = '1';
    
    const labelText = document.createElement('span');
    labelText.textContent = 'Auto Refresh';
    labelText.style.fontSize = '14px';
    labelText.style.fontWeight = '400';
    
    const labelSubtext = document.createElement('span');
    labelSubtext.className = 'refresh-label-subtext';
    labelSubtext.style.fontSize = '12px';
    labelSubtext.style.opacity = '0.6';
    labelSubtext.textContent = enabled ? `(${formatDuration(refreshIntervalMs)})` : '(Disabled)';
    
    labelEl.appendChild(labelText);
    labelEl.appendChild(labelSubtext);
    
    innerButton.appendChild(iconContainer);
    innerButton.appendChild(labelEl);

    // Countdown badge (visible on the right)
    navTimerBadge = document.createElement('span');
    navTimerBadge.className = 'refresh-timer-badge refresh-timer-nav';
    navTimerBadge.style.padding = '2px 6px';
    navTimerBadge.style.borderRadius = '4px';
    navTimerBadge.style.background = 'rgba(34,197,94,0.2)';
    navTimerBadge.style.color = '#22c55e';
    navTimerBadge.style.fontSize = '11px';
    navTimerBadge.style.fontWeight = '600';
    navTimerBadge.style.fontVariantNumeric = 'tabular-nums';
    navTimerBadge.style.display = 'inline-flex';
    navTimerBadge.style.pointerEvents = 'none';
    navTimerBadge.style.flexShrink = '0';
    navTimerBadge.style.marginLeft = 'auto';
    navTimerBadge.textContent = '0:00';
    
    innerButton.appendChild(navTimerBadge);
    
    // Hover effect for inner button
    innerButton.addEventListener('mouseenter', () => {
      innerButton.style.background = 'rgba(255, 255, 255, 0.1)';
    });
    innerButton.addEventListener('mouseleave', () => {
      innerButton.style.background = enabled ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0)';
    });
    
    refreshContainer.appendChild(innerButton);
    
    // Create dropdown menu
    refreshDropdown = document.createElement('div');
    refreshDropdown.style.position = 'absolute';
    refreshDropdown.style.top = '0';
    refreshDropdown.style.left = '100%';
    refreshDropdown.style.marginLeft = '8px';
    refreshDropdown.style.width = '280px';
    refreshDropdown.style.background = '#1e293b';
    refreshDropdown.style.border = '1px solid rgba(255,255,255,0.15)';
    refreshDropdown.style.borderRadius = '8px';
    refreshDropdown.style.boxShadow = '0 8px 25px rgba(0,0,0,0.3)';
    refreshDropdown.style.padding = '12px';
    refreshDropdown.style.display = 'none';
    refreshDropdown.style.zIndex = '10000';
    refreshDropdown.style.fontFamily = 'system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
    refreshDropdown.style.fontSize = '14px';
    refreshDropdown.style.color = '#f8fafc';
    
    // Status display
    const statusRow = document.createElement('div');
    statusRow.style.marginBottom = '12px';
    statusRow.style.padding = '8px';
    statusRow.style.background = 'rgba(0,0,0,0.2)';
    statusRow.style.borderRadius = '6px';
    
    statusEl = document.createElement('span');
    statusEl.className = 'refresh-status';
    statusEl.style.fontSize = '12px';
    statusEl.style.opacity = '0.9';
    statusRow.appendChild(statusEl);

    // Session counter display
    const sessionCounterEl = document.createElement('div');
    sessionCounterEl.className = 'refresh-session-counter';
    sessionCounterEl.style.fontSize = '11px';
    sessionCounterEl.style.opacity = '0.7';
    sessionCounterEl.style.marginTop = '4px';
    sessionCounterEl.textContent = `Refreshed ${sessionRefreshCount} times this session`;
    statusRow.appendChild(sessionCounterEl);

    // Last refresh timestamp display
    const lastRefreshEl = document.createElement('div');
    lastRefreshEl.className = 'refresh-last-timestamp';
    lastRefreshEl.style.fontSize = '11px';
    lastRefreshEl.style.opacity = '0.7';
    lastRefreshEl.style.marginTop = '2px';
    lastRefreshEl.textContent = lastRefreshTime ? `Last refreshed: ${formatTimeAgo(Date.now() - lastRefreshTime)}` : 'No refresh yet';
    statusRow.appendChild(lastRefreshEl);

    dropdownTimerBadge = document.createElement('span');
    dropdownTimerBadge.className = 'refresh-timer-badge refresh-timer-dropdown';
    dropdownTimerBadge.style.marginLeft = '8px';
    dropdownTimerBadge.style.padding = '2px 6px';
    dropdownTimerBadge.style.borderRadius = '4px';
    dropdownTimerBadge.style.background = 'rgba(34,197,94,0.2)';
    dropdownTimerBadge.style.color = '#bbf7d0';
    dropdownTimerBadge.style.fontSize = '12px';
    dropdownTimerBadge.style.fontVariantNumeric = 'tabular-nums';
    dropdownTimerBadge.style.display = 'none';
    statusRow.appendChild(dropdownTimerBadge);

    dropdownStatusEl = document.createElement('div');
    dropdownStatusEl.className = 'refresh-dropdown-status';
    dropdownStatusEl.style.marginTop = '8px';
    dropdownStatusEl.style.fontSize = '12px';
    dropdownStatusEl.style.opacity = '0.9';
    dropdownStatusEl.style.display = 'none';
    statusRow.appendChild(dropdownStatusEl);

    // Manual refresh button
    const refreshNowBtn = document.createElement('button');
    refreshNowBtn.textContent = '🔄 Refresh Now';
    refreshNowBtn.style.width = '100%';
    refreshNowBtn.style.padding = '8px 12px';
    refreshNowBtn.style.marginBottom = '8px';
    refreshNowBtn.style.border = 'none';
    refreshNowBtn.style.borderRadius = '6px';
    refreshNowBtn.style.background = '#3b82f6';
    refreshNowBtn.style.color = 'white';
    refreshNowBtn.style.cursor = 'pointer';
    refreshNowBtn.style.fontWeight = '500';
    refreshNowBtn.style.transition = 'background 0.2s ease';
    refreshNowBtn.addEventListener('mouseenter', () => {
      refreshNowBtn.style.background = '#2563eb';
    });
    refreshNowBtn.addEventListener('mouseleave', () => {
      refreshNowBtn.style.background = '#3b82f6';
    });
    refreshNowBtn.addEventListener('click', () => {
      sessionRefreshCount++;
      lastRefreshTime = Date.now();
      window.location.reload();
    });

    // Toggle button
    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = enabled ? 'Disable Auto-refresh' : 'Enable Auto-refresh';
    toggleBtn.style.width = '100%';
    toggleBtn.style.padding = '8px 12px';
    toggleBtn.style.marginBottom = '12px';
    toggleBtn.style.border = 'none';
    toggleBtn.style.borderRadius = '6px';
    toggleBtn.style.background = enabled ? '#ef4444' : '#22c55e';
    toggleBtn.style.color = 'white';
    toggleBtn.style.cursor = 'pointer';
    toggleBtn.style.fontWeight = '500';
    toggleBtn.addEventListener('click', () => {
      enabled = !enabled;
      localStorage.setItem(STORAGE_KEY_ENABLED, String(enabled));
      if (enabled) scheduleNext();
      else nextRefreshAt = null;
      toggleBtn.textContent = enabled ? 'Disable Auto-refresh' : 'Enable Auto-refresh';
      toggleBtn.style.background = enabled ? '#ef4444' : '#22c55e';
      // Update label subtext and button background
      if (window.__ccRefreshLabelSubtext) {
        window.__ccRefreshLabelSubtext.textContent = enabled ? `(${formatDuration(refreshIntervalMs)})` : '(Disabled)';
      }
      if (window.__ccRefreshInnerButton) {
        window.__ccRefreshInnerButton.style.background = enabled ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0)';
      }
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
    intervalLabel.style.fontSize = '12px';
    intervalLabel.style.opacity = '0.9';
    intervalLabel.style.minWidth = '50px';
    
    const intervalSelect = document.createElement('select');
    intervalSelect.style.flex = '1';
    intervalSelect.style.padding = '4px 8px';
    intervalSelect.style.border = '1px solid rgba(255,255,255,0.2)';
    intervalSelect.style.borderRadius = '4px';
    intervalSelect.style.background = '#334155';
    intervalSelect.style.color = '#f8fafc';
    intervalSelect.style.fontSize = '12px';
    
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
    
    intervalSelect.addEventListener('change', () => {
      const val = parseInt(intervalSelect.value, 10);
      if (Number.isFinite(val)) {
        refreshIntervalMs = Math.max(MIN_REFRESH_MS, Math.min(MAX_REFRESH_MS, val));
        localStorage.setItem(STORAGE_KEY_INTERVAL, String(refreshIntervalMs));
        populateOptions(refreshIntervalMs);
        if (enabled) scheduleNext(refreshIntervalMs);
        // Update label subtext
        if (window.__ccRefreshLabelSubtext && enabled) {
          window.__ccRefreshLabelSubtext.textContent = `(${formatDuration(refreshIntervalMs)})`;
        }
        updateUI();
      }
    });
    
    intervalRow.appendChild(intervalLabel);
    intervalRow.appendChild(intervalSelect);
    
    // Assemble dropdown
    refreshDropdown.appendChild(statusRow);
    refreshDropdown.appendChild(refreshNowBtn);
    refreshDropdown.appendChild(toggleBtn);
    refreshDropdown.appendChild(intervalRow);

    // Store references for updates
    window.__ccRefreshSessionCounter = sessionCounterEl;
    window.__ccRefreshLastTimestamp = lastRefreshEl;
    window.__ccRefreshLabelSubtext = labelSubtext;
    window.__ccRefreshInnerButton = innerButton;
    
    // Click handler for inner button
    innerButton.addEventListener('click', toggleDropdown);
    
    // Assemble dropdown to container
    refreshContainer.appendChild(refreshDropdown);
    
    // Insert into sidebar
    console.log('[Jamf Auto-Refresh] Sidebar container:', sidebarContainer?.tagName || 'NOT FOUND');
    
    if (!sidebarContainer) {
      console.error('[Jamf Auto-Refresh] Could not find jamf-nav-side-container, falling back to fixed position');
      document.body.appendChild(refreshContainer);
      refreshContainer.style.position = 'fixed';
      refreshContainer.style.bottom = '20px';
      refreshContainer.style.left = '20px';
      refreshContainer.style.width = '280px';
      refreshContainer.style.background = '#1e293b';
      refreshContainer.style.border = '1px solid rgba(255,255,255,0.15)';
      refreshContainer.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
      refreshContainer.style.padding = '12px';
      refreshContainer.style.borderRadius = '8px';
      refreshContainer.style.zIndex = '9999';
      return;
    }
    
    // Insert as direct child of jamf-nav-side-container (like other nav items)
    // Try to insert at the bottom after existing nav items
    const lastNavItem = sidebarContainer.querySelector('jamf-nav-single-item:last-of-type, jamf-nav-multi-item:last-of-type');
    
    if (lastNavItem) {
      console.log('[Jamf Auto-Refresh] Inserting after last nav item');
      lastNavItem.parentNode.insertBefore(refreshContainer, lastNavItem.nextSibling);
    } else {
      console.log('[Jamf Auto-Refresh] Appending directly to sidebar container');
      sidebarContainer.appendChild(refreshContainer);
    }
    
    console.log('[Jamf Auto-Refresh] Widget successfully added to sidebar');
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
      window.__ccRefreshLastTimestamp.textContent = `Last refreshed: ${formatTimeAgo(now - lastRefreshTime)}`;
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
        // Update session counter and last refresh if elements exist
        if (window.__ccRefreshSessionCounter) {
          window.__ccRefreshSessionCounter.textContent = `Refreshed ${sessionRefreshCount} times this session`;
        }
        if (window.__ccRefreshLastTimestamp) {
          window.__ccRefreshLastTimestamp.textContent = `Last refreshed: just now`;
        }
        window.location.reload();
        return; // In case reload is blocked for some reason
      }
    } else {
      statusMessage = null;
    }

    updateUI();
  }

  async function init() {
    await createUI();
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
