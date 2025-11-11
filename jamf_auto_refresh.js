// ==UserScript==
// @name         Jamf Auto Refresh (Floating Window)
// @namespace    Charlie Chimp
// @version      2.0.0
// @author       BetterCallSaul <sherman@atlassian.com>
// @description  Automatically refreshes the current page at a user-selectable interval with draggable floating window and countdown timer.
// @match        *://*/*
// @updateURL    https://raw.githubusercontent.com/BetterCallSaulAtlas/jamf-auto-refresh/main/jamf_auto_refresh.js
// @downloadURL  https://raw.githubusercontent.com/BetterCallSaulAtlas/jamf-auto-refresh/main/jamf_auto_refresh.js
// @supportURL   https://github.com/BetterCallSaulAtlas/jamf-auto-refresh/issues
// @homepageURL  https://github.com/BetterCallSaulAtlas/jamf-auto-refresh
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  // ============================================================================
  // USER CONFIGURATION
  // ============================================================================
  // Default configuration if nothing exists in localStorage.
  // You can still edit this array, or use the visual Settings UI.
  //
  // Simple format (backward compatible):
  //   '*.jamfcloud.com'
  //
  // Advanced format (new in v2.1.0):
  //   {
  //     domain: '*.jamfcloud.com',
  //     interval: 60000,           // Custom refresh interval (ms), null = use global
  //     paths: {
  //       include: ['*'],          // Glob or regex patterns
  //       exclude: []              // Exclude patterns (takes priority)
  //     },
  //     enabled: true
  //   }
  //
  // Path pattern examples:
  //   - '*' or ['*']                           All paths (default)
  //   - '/computers.html'                      Exact path
  //   - '/computers*'                          Starts with /computers
  //   - '*/devices/*'                          Contains /devices/ anywhere
  //   - 'regex:^/computers/.*\\.html$'         Regex pattern

  const DEFAULT_DOMAIN_CONFIG = [
    '*.jamfcloud.com'
  ];

  // ============================================================================
  // END USER CONFIGURATION
  // ============================================================================

  // Storage keys
  const STORAGE_KEY_DOMAINS = 'cc_auto_refresh_domains:' + location.host;

  // Normalize config entry to advanced format
  function normalizeConfigEntry(entry) {
    if (typeof entry === 'string') {
      // Simple string format - convert to object
      return {
        domain: entry,
        interval: null,
        paths: { include: ['*'], exclude: [] },
        enabled: true
      };
    }
    // Already an object - ensure it has all properties
    return {
      domain: entry.domain || '',
      interval: entry.interval || null,
      paths: entry.paths || { include: ['*'], exclude: [] },
      enabled: entry.enabled !== false
    };
  }

  // Load domain configuration from localStorage or use defaults
  function loadDomainConfig() {
    const stored = localStorage.getItem(STORAGE_KEY_DOMAINS);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map(normalizeConfigEntry);
        }
      } catch (e) {
        console.warn('[Jamf Auto-Refresh] Failed to parse stored domains, using defaults');
      }
    }
    return DEFAULT_DOMAIN_CONFIG.map(normalizeConfigEntry);
  }

  // Save domain configuration to localStorage
  function saveDomainConfig(configs) {
    localStorage.setItem(STORAGE_KEY_DOMAINS, JSON.stringify(configs));
  }

  // Legacy support - load as simple domain array for backward compat with v2.0.0 code
  function loadEnabledDomains() {
    return loadDomainConfig().map(config => config.domain);
  }

  // Legacy support - save as config objects
  function saveEnabledDomains(domains) {
    const configs = domains.map(domain => 
      typeof domain === 'string' ? normalizeConfigEntry(domain) : domain
    );
    saveDomainConfig(configs);
  }

  // Check if a hostname matches a domain pattern
  function matchesDomainPattern(hostname, pattern) {
    const cleanPattern = pattern.replace(/\*/g, '');
    if (pattern.startsWith('*')) {
      return hostname.includes(cleanPattern) || hostname.endsWith(cleanPattern);
    }
    return hostname === cleanPattern || hostname.endsWith('.' + cleanPattern);
  }

  // Check if a path matches a pattern (glob or regex)
  function matchesPathPattern(currentPath, pattern) {
    // Regex pattern (starts with "regex:")
    if (pattern.startsWith('regex:')) {
      try {
        const regexStr = pattern.substring(6);
        const regex = new RegExp(regexStr);
        return regex.test(currentPath);
      } catch (e) {
        console.warn('[Jamf Auto-Refresh] Invalid regex pattern:', pattern, e);
        return false;
      }
    }
    
    // Glob pattern
    // Convert glob to regex: * = [^/]*, ** = .*, ? = .
    const regexPattern = pattern
      .replace(/\*\*/g, '<!DOUBLESTAR!>')  // Temporarily replace **
      .replace(/\*/g, '[^/]*')              // * matches anything except /
      .replace(/<!DOUBLESTAR!>/g, '.*')     // ** matches anything including /
      .replace(/\?/g, '.')                  // ? matches single char
      .replace(/\./g, '\\.');               // Escape literal dots
    
    try {
      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(currentPath);
    } catch (e) {
      console.warn('[Jamf Auto-Refresh] Invalid glob pattern:', pattern, e);
      return false;
    }
  }

  // Check if current path matches the path configuration
  function matchesPathConfig(currentPath, pathConfig) {
    if (!pathConfig) {
      return true; // No path config = match all
    }
    
    const include = pathConfig.include || ['*'];
    const exclude = pathConfig.exclude || [];
    
    // Check exclude patterns first (they take priority)
    for (const pattern of exclude) {
      if (matchesPathPattern(currentPath, pattern)) {
        return false;
      }
    }
    
    // Check include patterns
    for (const pattern of include) {
      if (matchesPathPattern(currentPath, pattern)) {
        return true;
      }
    }
    
    return false;
  }

  // Find the first matching config for current URL
  function findMatchingConfig(hostname, pathname, configs) {
    for (const config of configs) {
      if (!config.enabled) continue;
      
      // Check domain
      if (!matchesDomainPattern(hostname, config.domain)) continue;
      
      // Check paths
      if (!matchesPathConfig(pathname, config.paths)) continue;
      
      // Match found
      return config;
    }
    
    return null;
  }

  // Check if current URL matches any configuration
  const currentHostname = window.location.hostname;
  const currentPath = window.location.pathname;
  let domainConfigs = loadDomainConfig();
  let enabledDomains = domainConfigs.map(c => c.domain); // For legacy compatibility
  
  const matchedConfig = findMatchingConfig(currentHostname, currentPath, domainConfigs);

  // Exit early if no matching configuration
  if (!matchedConfig) {
    console.log('[Jamf Auto-Refresh] No matching configuration for:', currentHostname + currentPath);
    console.log('[Jamf Auto-Refresh] Available configs:', domainConfigs.length);
    return;
  }

  console.log('[Jamf Auto-Refresh] Matched configuration:', {
    domain: matchedConfig.domain,
    interval: matchedConfig.interval ? `${matchedConfig.interval}ms` : 'global',
    paths: matchedConfig.paths
  });

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

  // Load refresh interval - use matched config's interval or global default
  let refreshIntervalMs = (() => {
    // Check if matched config has custom interval
    if (matchedConfig.interval && Number.isFinite(matchedConfig.interval)) {
      console.log('[Jamf Auto-Refresh] Using domain-specific interval:', matchedConfig.interval);
      return Math.max(MIN_REFRESH_MS, Math.min(MAX_REFRESH_MS, matchedConfig.interval));
    }
    
    // Fall back to global interval
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
  function openDomainManager() {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.background = 'rgba(0,0,0,0.7)';
    overlay.style.zIndex = '999999';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.backdropFilter = 'blur(4px)';
    
    // Create modal
    const modal = document.createElement('div');
    modal.style.background = 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)';
    modal.style.border = '1px solid rgba(255,255,255,0.2)';
    modal.style.borderRadius = '16px';
    modal.style.boxShadow = '0 20px 60px rgba(0,0,0,0.5)';
    modal.style.padding = '24px';
    modal.style.width = '90%';
    modal.style.maxWidth = '500px';
    modal.style.maxHeight = '80vh';
    modal.style.overflow = 'auto';
    modal.style.fontFamily = 'system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
    modal.style.color = '#f8fafc';
    
    // Modal header
    const modalHeader = document.createElement('div');
    modalHeader.style.display = 'flex';
    modalHeader.style.justifyContent = 'space-between';
    modalHeader.style.alignItems = 'center';
    modalHeader.style.marginBottom = '20px';
    modalHeader.style.paddingBottom = '16px';
    modalHeader.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
    
    const modalTitle = document.createElement('h2');
    modalTitle.textContent = '⚙️ Domain Settings';
    modalTitle.style.margin = '0';
    modalTitle.style.fontSize = '20px';
    modalTitle.style.fontWeight = '600';
    modalTitle.style.color = '#22c55e';
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.background = 'transparent';
    closeBtn.style.border = 'none';
    closeBtn.style.color = 'rgba(255,255,255,0.6)';
    closeBtn.style.fontSize = '24px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.padding = '0';
    closeBtn.style.width = '32px';
    closeBtn.style.height = '32px';
    closeBtn.style.borderRadius = '6px';
    closeBtn.style.transition = 'all 0.2s ease';
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.background = 'rgba(255,255,255,0.1)';
      closeBtn.style.color = '#fff';
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.background = 'transparent';
      closeBtn.style.color = 'rgba(255,255,255,0.6)';
    });
    closeBtn.addEventListener('click', () => document.body.removeChild(overlay));
    
    modalHeader.appendChild(modalTitle);
    modalHeader.appendChild(closeBtn);
    
    // Current domain indicator
    const currentDomainInfo = document.createElement('div');
    currentDomainInfo.style.padding = '12px';
    currentDomainInfo.style.background = 'rgba(34,197,94,0.1)';
    currentDomainInfo.style.border = '1px solid rgba(34,197,94,0.3)';
    currentDomainInfo.style.borderRadius = '8px';
    currentDomainInfo.style.marginBottom = '20px';
    currentDomainInfo.style.fontSize = '13px';
    currentDomainInfo.innerHTML = `<strong>Current domain:</strong> ${currentHostname}`;
    
    // Domain list label
    const listLabel = document.createElement('div');
    listLabel.textContent = 'Enabled Domains:';
    listLabel.style.fontSize = '14px';
    listLabel.style.fontWeight = '600';
    listLabel.style.marginBottom = '12px';
    listLabel.style.color = '#cbd5e1';
    
    // Domain list container
    const domainList = document.createElement('div');
    domainList.style.marginBottom = '16px';
    
    function renderDomainList() {
      domainList.innerHTML = '';
      const domains = loadEnabledDomains();
      
      if (domains.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.textContent = 'No domains configured. Add one below.';
        emptyMsg.style.padding = '12px';
        emptyMsg.style.color = 'rgba(255,255,255,0.5)';
        emptyMsg.style.fontStyle = 'italic';
        emptyMsg.style.fontSize = '13px';
        domainList.appendChild(emptyMsg);
        return;
      }
      
      domains.forEach((domain, index) => {
        const domainItem = document.createElement('div');
        domainItem.style.display = 'flex';
        domainItem.style.alignItems = 'center';
        domainItem.style.justifyContent = 'space-between';
        domainItem.style.padding = '10px 12px';
        domainItem.style.background = 'rgba(255,255,255,0.05)';
        domainItem.style.border = '1px solid rgba(255,255,255,0.1)';
        domainItem.style.borderRadius = '6px';
        domainItem.style.marginBottom = '8px';
        domainItem.style.fontSize = '13px';
        
        const domainText = document.createElement('span');
        domainText.textContent = domain;
        domainText.style.fontFamily = 'monospace';
        domainText.style.color = matchesDomainPattern(currentHostname, domain) ? '#22c55e' : '#f8fafc';
        domainText.style.flex = '1';
        
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '🗑️';
        deleteBtn.style.background = 'transparent';
        deleteBtn.style.border = 'none';
        deleteBtn.style.color = '#ef4444';
        deleteBtn.style.cursor = 'pointer';
        deleteBtn.style.padding = '4px 8px';
        deleteBtn.style.borderRadius = '4px';
        deleteBtn.style.fontSize = '16px';
        deleteBtn.style.transition = 'all 0.2s ease';
        deleteBtn.addEventListener('mouseenter', () => {
          deleteBtn.style.background = 'rgba(239,68,68,0.2)';
        });
        deleteBtn.addEventListener('mouseleave', () => {
          deleteBtn.style.background = 'transparent';
        });
        deleteBtn.addEventListener('click', () => {
          const updatedDomains = domains.filter((_, i) => i !== index);
          saveEnabledDomains(updatedDomains);
          enabledDomains = updatedDomains;
          renderDomainList();
        });
        
        domainItem.appendChild(domainText);
        domainItem.appendChild(deleteBtn);
        domainList.appendChild(domainItem);
      });
    }
    
    renderDomainList();
    
    // Add domain section
    const addSection = document.createElement('div');
    addSection.style.marginTop = '20px';
    addSection.style.padding = '16px';
    addSection.style.background = 'rgba(0,0,0,0.2)';
    addSection.style.borderRadius = '8px';
    addSection.style.border = '1px solid rgba(255,255,255,0.1)';
    
    const addLabel = document.createElement('div');
    addLabel.textContent = 'Add Domain:';
    addLabel.style.fontSize = '14px';
    addLabel.style.fontWeight = '600';
    addLabel.style.marginBottom = '8px';
    addLabel.style.color = '#cbd5e1';
    
    const addInput = document.createElement('input');
    addInput.type = 'text';
    addInput.placeholder = 'e.g., *.jamfcloud.com or yourcompany.com';
    addInput.style.width = '100%';
    addInput.style.padding = '10px';
    addInput.style.border = '1px solid rgba(255,255,255,0.2)';
    addInput.style.borderRadius = '6px';
    addInput.style.background = '#334155';
    addInput.style.color = '#f8fafc';
    addInput.style.fontSize = '13px';
    addInput.style.fontFamily = 'monospace';
    addInput.style.marginBottom = '8px';
    addInput.style.boxSizing = 'border-box';
    
    const addHint = document.createElement('div');
    addHint.style.fontSize = '11px';
    addHint.style.color = 'rgba(255,255,255,0.5)';
    addHint.style.marginBottom = '12px';
    addHint.innerHTML = 'Use <code>*</code> for wildcards. Examples: <code>*.jamfcloud.com</code>, <code>jamf.company.com</code>';
    
    const addBtnRow = document.createElement('div');
    addBtnRow.style.display = 'flex';
    addBtnRow.style.gap = '8px';
    
    const addBtn = document.createElement('button');
    addBtn.textContent = '✚ Add Domain';
    addBtn.style.flex = '1';
    addBtn.style.padding = '10px';
    addBtn.style.border = 'none';
    addBtn.style.borderRadius = '6px';
    addBtn.style.background = '#22c55e';
    addBtn.style.color = 'white';
    addBtn.style.cursor = 'pointer';
    addBtn.style.fontWeight = '600';
    addBtn.style.fontSize = '13px';
    addBtn.style.transition = 'all 0.2s ease';
    addBtn.addEventListener('mouseenter', () => {
      addBtn.style.background = '#16a34a';
    });
    addBtn.addEventListener('mouseleave', () => {
      addBtn.style.background = '#22c55e';
    });
    
    const testBtn = document.createElement('button');
    testBtn.textContent = '🧪 Test';
    testBtn.style.padding = '10px 16px';
    testBtn.style.border = 'none';
    testBtn.style.borderRadius = '6px';
    testBtn.style.background = '#3b82f6';
    testBtn.style.color = 'white';
    testBtn.style.cursor = 'pointer';
    testBtn.style.fontWeight = '600';
    testBtn.style.fontSize = '13px';
    testBtn.style.transition = 'all 0.2s ease';
    testBtn.addEventListener('mouseenter', () => {
      testBtn.style.background = '#2563eb';
    });
    testBtn.addEventListener('mouseleave', () => {
      testBtn.style.background = '#3b82f6';
    });
    
    const feedbackMsg = document.createElement('div');
    feedbackMsg.style.marginTop = '8px';
    feedbackMsg.style.fontSize = '12px';
    feedbackMsg.style.padding = '8px';
    feedbackMsg.style.borderRadius = '6px';
    feedbackMsg.style.display = 'none';
    
    addBtn.addEventListener('click', () => {
      const domain = addInput.value.trim();
      if (!domain) {
        feedbackMsg.textContent = '⚠️ Please enter a domain pattern';
        feedbackMsg.style.background = 'rgba(239,68,68,0.2)';
        feedbackMsg.style.color = '#fca5a5';
        feedbackMsg.style.display = 'block';
        return;
      }
      
      const domains = loadEnabledDomains();
      if (domains.includes(domain)) {
        feedbackMsg.textContent = '⚠️ This domain is already in the list';
        feedbackMsg.style.background = 'rgba(251,146,60,0.2)';
        feedbackMsg.style.color = '#fdba74';
        feedbackMsg.style.display = 'block';
        return;
      }
      
      domains.push(domain);
      saveEnabledDomains(domains);
      enabledDomains = domains;
      addInput.value = '';
      feedbackMsg.textContent = '✅ Domain added successfully!';
      feedbackMsg.style.background = 'rgba(34,197,94,0.2)';
      feedbackMsg.style.color = '#86efac';
      feedbackMsg.style.display = 'block';
      renderDomainList();
      
      setTimeout(() => {
        feedbackMsg.style.display = 'none';
      }, 3000);
    });
    
    testBtn.addEventListener('click', () => {
      const domain = addInput.value.trim();
      if (!domain) {
        feedbackMsg.textContent = '⚠️ Please enter a domain pattern to test';
        feedbackMsg.style.background = 'rgba(239,68,68,0.2)';
        feedbackMsg.style.color = '#fca5a5';
        feedbackMsg.style.display = 'block';
        return;
      }
      
      const matches = matchesDomainPattern(currentHostname, domain);
      if (matches) {
        feedbackMsg.textContent = `✅ Pattern "${domain}" matches current domain "${currentHostname}"`;
        feedbackMsg.style.background = 'rgba(34,197,94,0.2)';
        feedbackMsg.style.color = '#86efac';
      } else {
        feedbackMsg.textContent = `❌ Pattern "${domain}" does NOT match current domain "${currentHostname}"`;
        feedbackMsg.style.background = 'rgba(239,68,68,0.2)';
        feedbackMsg.style.color = '#fca5a5';
      }
      feedbackMsg.style.display = 'block';
    });
    
    // Allow Enter key to add domain
    addInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        addBtn.click();
      }
    });
    
    addBtnRow.appendChild(addBtn);
    addBtnRow.appendChild(testBtn);
    
    addSection.appendChild(addLabel);
    addSection.appendChild(addInput);
    addSection.appendChild(addHint);
    addSection.appendChild(addBtnRow);
    addSection.appendChild(feedbackMsg);
    
    // Assemble modal
    modal.appendChild(modalHeader);
    modal.appendChild(currentDomainInfo);
    modal.appendChild(listLabel);
    modal.appendChild(domainList);
    modal.appendChild(addSection);
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        document.body.removeChild(overlay);
      }
    });
    
    // Focus input
    setTimeout(() => addInput.focus(), 100);
  }
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
    
    // Settings button
    const settingsBtn = document.createElement('button');
    settingsBtn.textContent = '⚙️ Domain Settings';
    settingsBtn.style.width = '100%';
    settingsBtn.style.padding = '10px';
    settingsBtn.style.marginTop = '8px';
    settingsBtn.style.border = 'none';
    settingsBtn.style.borderRadius = '8px';
    settingsBtn.style.background = '#64748b';
    settingsBtn.style.color = 'white';
    settingsBtn.style.cursor = 'pointer';
    settingsBtn.style.fontWeight = '600';
    settingsBtn.style.fontSize = '14px';
    settingsBtn.style.transition = 'all 0.2s ease';
    settingsBtn.addEventListener('mouseenter', () => {
      settingsBtn.style.background = '#475569';
      settingsBtn.style.transform = 'translateY(-1px)';
    });
    settingsBtn.addEventListener('mouseleave', () => {
      settingsBtn.style.background = '#64748b';
      settingsBtn.style.transform = 'translateY(0)';
    });
    settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openDomainManager();
    });
    
    // Assemble the UI
    refreshContainer.appendChild(header);
    refreshContainer.appendChild(statusRow);
    refreshContainer.appendChild(refreshNowBtn);
    refreshContainer.appendChild(toggleBtn);
    refreshContainer.appendChild(intervalRow);
    refreshContainer.appendChild(settingsBtn);
    
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
