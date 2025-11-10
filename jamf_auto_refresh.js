// ==UserScript==
// @name         Jamf Auto Refresh (Toggle + Timer, Draggable Top-Right)
// @namespace    Charlie Chimp
// @version      1.5.0
// @author       BetterCallSaul <sherman@atlassian.com>
// @description  Automatically refreshes the current page at a user-selectable interval with native Jamf Pro navigation integration and countdown timer.
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
  let isTabVisible = !document.hidden; // Track tab visibility
  let pausedAt = null; // Track when tab was hidden

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
    refreshIcon.style.color = enabled ? '#22c55e' : '#6b7280';
    refreshIcon.title = enabled 
      ? `Auto-refresh ON (${formatDuration(refreshIntervalMs)})` 
      : 'Auto-refresh OFF';

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

  function waitForNavigation() {
    return new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 300; // ~30 seconds

      const checkNav = () => {
        // Log shadow roots found
        if (attempts === 0) {
          const shadowRootCount = document.querySelectorAll('*').length;
          const hasShadowRoot = Array.from(document.querySelectorAll('*')).some(el => el.shadowRoot);
          console.log(`[Jamf Auto-Refresh] Attempt ${attempts}: Elements=${shadowRootCount}, HasShadowRoot=${hasShadowRoot}`);
          
          // Log what's in jp-skeleton shadow root
          const jpSkeleton = document.querySelector('jp-skeleton');
          if (jpSkeleton && jpSkeleton.shadowRoot) {
            const jamfNavTop = jpSkeleton.shadowRoot.querySelector('.jamf-nav-top-container');
            console.log('[Jamf Auto-Refresh] jp-skeleton shadowRoot has .jamf-nav-top-container:', !!jamfNavTop);
            if (jamfNavTop) {
              console.log('[Jamf Auto-Refresh] Found it! Class:', jamfNavTop.className);
            }
          }
        }

        // Look for jp-skeleton first, then search its shadow root
        const jpSkeleton = document.querySelector('jp-skeleton');
        if (jpSkeleton && jpSkeleton.shadowRoot) {
          const jamfNavTop = jpSkeleton.shadowRoot.querySelector('.jamf-nav-top-container');
          if (jamfNavTop) {
            console.log('[Jamf Auto-Refresh] Found .jamf-nav-top-container in jp-skeleton shadow root');
            resolve(jamfNavTop);
            return;
          }
        }

        // Fallback: Look for Jamf's top navigation container (checking shadow DOM)
        let jamfNavTop = findInShadowDOM('.jamf-nav-top-container');
        
        if (!jamfNavTop) {
          jamfNavTop = findInShadowDOM('[class*="jamf-nav-top"]') ||
                       findInShadowDOM('.nav--items') ||
                       findInShadowDOM('[class*="nav"][class*="items"]') ||
                       document.querySelector('header nav') ||
                       document.querySelector('header');
        }

        if (jamfNavTop) {
          console.log('[Jamf Auto-Refresh] Found navigation element:', jamfNavTop.className || jamfNavTop.id || jamfNavTop.tagName);
          resolve(jamfNavTop);
          return;
        }

        attempts += 1;
        if (attempts >= maxAttempts) {
          console.error('[Jamf Auto-Refresh] Timed out waiting for navigation');
          resolve(document.body);
          return;
        }

        setTimeout(checkNav, 100);
      };
      checkNav();
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
    const navContainer = await waitForNavigation();
    
    // Create the refresh icon container
    refreshContainer = document.createElement('div');
    refreshContainer.id = instanceId;
    refreshContainer.style.position = 'relative';
    refreshContainer.style.display = 'inline-flex';
    refreshContainer.style.alignItems = 'center';
    refreshContainer.style.marginRight = '8px';
    refreshContainer.style.cursor = 'pointer';
    
    // Create the refresh icon (matches Jamf's other nav icons)
    refreshIcon = document.createElement('div');
    refreshIcon.innerHTML = '⟳'; // Refresh symbol
    refreshIcon.style.fontSize = '18px';
    refreshIcon.style.color = enabled ? '#22c55e' : '#6b7280';
    refreshIcon.style.padding = '8px';
    refreshIcon.style.borderRadius = '4px';
    refreshIcon.style.transition = 'all 0.2s ease';
    refreshIcon.title = enabled 
      ? `Auto-refresh ON (${formatDuration(refreshIntervalMs)})` 
      : 'Auto-refresh OFF';
    
    // Hover effect
    refreshIcon.addEventListener('mouseenter', () => {
      refreshIcon.style.backgroundColor = 'rgba(255,255,255,0.1)';
    });
    refreshIcon.addEventListener('mouseleave', () => {
      refreshIcon.style.backgroundColor = 'transparent';
    });

    // Countdown badge (visible near icon)
    navTimerBadge = document.createElement('span');
    navTimerBadge.className = 'refresh-timer-badge refresh-timer-nav';
    navTimerBadge.style.position = 'absolute';
    navTimerBadge.style.top = '0';
    navTimerBadge.style.right = '0';
    navTimerBadge.style.transform = 'translate(35%, -35%)';
    navTimerBadge.style.padding = '2px 6px';
    navTimerBadge.style.borderRadius = '9999px';
    navTimerBadge.style.background = 'rgba(34,197,94,0.9)';
    navTimerBadge.style.color = '#022c22';
    navTimerBadge.style.fontSize = '11px';
    navTimerBadge.style.fontWeight = '600';
    navTimerBadge.style.fontVariantNumeric = 'tabular-nums';
    navTimerBadge.style.boxShadow = '0 2px 6px rgba(0,0,0,0.25)';
    navTimerBadge.style.display = 'inline-flex';
    navTimerBadge.style.pointerEvents = 'none';
    navTimerBadge.textContent = '0:00';
    refreshContainer.appendChild(navTimerBadge);
    
    // Create dropdown menu
    refreshDropdown = document.createElement('div');
    refreshDropdown.style.position = 'absolute';
    refreshDropdown.style.top = '100%';
    refreshDropdown.style.right = '0';
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

    // Store reference to session counter for updates
    window.__ccRefreshSessionCounter = sessionCounterEl;
    
    // Click handler for icon
    refreshIcon.addEventListener('click', toggleDropdown);
    
    // Assemble container
    refreshContainer.appendChild(refreshIcon);
    refreshContainer.appendChild(refreshDropdown);
    
    // Find and insert into Jamf's top navigation (in shadow DOM)
    const jamfNavTop = findInShadowDOM('.jamf-nav-top-container');
    
    console.log('[Jamf Auto-Refresh] jamfNavTop:', jamfNavTop?.className || 'NOT FOUND');
    
    if (!jamfNavTop) {
      console.error('[Jamf Auto-Refresh] Could not find .jamf-nav-top-container');
      return;
    }
    
    // Look for nav--items or top-items containers
    const navItems = jamfNavTop.querySelector('.nav--items') ||
                     jamfNavTop.querySelector('[class*="top-items"]') ||
                     jamfNavTop.querySelector('#desktop-top-nav');
    
    console.log('[Jamf Auto-Refresh] navItems:', navItems?.className || navItems?.id || 'NOT FOUND');
    
    if (navItems) {
      const insertBeforeElement = navItems.querySelector('[class*="notification"]') || 
                                 navItems.querySelector('[class*="bell"]') ||
                                 navItems.querySelector('[class*="alert"]');
      
      console.log('[Jamf Auto-Refresh] insertBeforeElement:', insertBeforeElement?.className || 'NONE');
      
      if (insertBeforeElement) {
        navItems.insertBefore(refreshContainer, insertBeforeElement);
        console.log('[Jamf Auto-Refresh] Inserted before notification element');
      } else {
        navItems.appendChild(refreshContainer);
        console.log('[Jamf Auto-Refresh] Appended to end of navItems');
      }
    } else {
      // No .nav--items found, append directly to jamf-nav-top-container
      jamfNavTop.appendChild(refreshContainer);
      console.log('[Jamf Auto-Refresh] Appended directly to jamf-nav-top-container');
    }
    
    console.log('[Jamf Auto-Refresh] Final parent:', refreshContainer.parentElement?.className || refreshContainer.parentElement?.id);
    console.log('[Jamf Auto-Refresh] navTimerBadge display:', navTimerBadge.style.display);
    console.log('[Jamf Auto-Refresh] navTimerBadge text:', navTimerBadge.textContent);
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

    // Check if tab is hidden - pause countdown
    if (document.hidden) {
      if (isTabVisible) {
        // Tab just became hidden
        isTabVisible = false;
        pausedAt = Date.now();
        statusMessage = '⏸️ Paused (tab hidden)';
        updateUI();
      }
      return;
    } else if (!isTabVisible) {
      // Tab just became visible again
      isTabVisible = true;
      if (pausedAt && nextRefreshAt) {
        // Extend the timer by the duration tab was hidden
        const pauseDuration = Date.now() - pausedAt;
        nextRefreshAt += pauseDuration;
      }
      pausedAt = null;
      statusMessage = null;
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
        statusMessage = 'Refresh delayed while typing…';
      } else {
        statusMessage = null;
        updateUI();
        sessionRefreshCount++;
        // Update session counter if element exists
        if (window.__ccRefreshSessionCounter) {
          window.__ccRefreshSessionCounter.textContent = `Refreshed ${sessionRefreshCount} times this session`;
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
