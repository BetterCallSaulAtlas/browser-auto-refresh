# Implementation Plan: Path-Based Matching & Per-Domain Intervals

## Overview
This document outlines the implementation plan for adding path-based URL matching and per-domain refresh interval configuration to the Jamf Auto Refresh script.

## New Configuration Structure

### Current (v2.0.0):
```javascript
const DEFAULT_ENABLED_DOMAINS = [
  '*.jamfcloud.com'
];
```

### New (v2.1.0):
```javascript
const DEFAULT_DOMAIN_CONFIG = [
  {
    domain: '*.jamfcloud.com',
    interval: null, // null = use global default
    paths: {
      include: ['*'], // '*' = all paths
      exclude: []
    },
    enabled: true
  }
];
```

## Backward Compatibility

Simple string domains will auto-migrate to new format:
```javascript
'*.jamfcloud.com' → {
  domain: '*.jamfcloud.com',
  interval: null,
  paths: { include: ['*'], exclude: [] },
  enabled: true
}
```

## Path Matching

### Glob Pattern Support
- `*` - matches any characters except `/`
- `**` - matches any characters including `/`
- `/computers.html` - exact match
- `/computers*` - starts with /computers
- `*/devices/*` - contains /devices/ anywhere

### Regex Pattern Support
- Patterns starting with `regex:` are treated as regex
- Example: `regex:^/computers/.*\\.html$`
- Allows complex matching logic

### Implementation:
```javascript
function matchesPathPattern(currentPath, pattern) {
  // Regex pattern
  if (pattern.startsWith('regex:')) {
    const regexStr = pattern.substring(6);
    const regex = new RegExp(regexStr);
    return regex.test(currentPath);
  }
  
  // Glob pattern
  const regexPattern = pattern
    .replace(/\*\*/g, '<!DOUBLESTAR!>')
    .replace(/\*/g, '[^/]*')
    .replace(/<!DOUBLESTAR!>/g, '.*')
    .replace(/\?/g, '.');
  
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(currentPath);
}

function matchesPathConfig(currentPath, pathConfig) {
  const { include = ['*'], exclude = [] } = pathConfig;
  
  // Check exclude first (takes priority)
  if (exclude.some(pattern => matchesPathPattern(currentPath, pattern))) {
    return false;
  }
  
  // Check include
  return include.some(pattern => matchesPathPattern(currentPath, pattern));
}
```

## URL Matching Logic

```javascript
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

// Use it
const currentHostname = window.location.hostname;
const currentPath = window.location.pathname;
const domainConfigs = loadDomainConfig();
const matchedConfig = findMatchingConfig(currentHostname, currentPath, domainConfigs);

if (!matchedConfig) {
  console.log('[Jamf Auto-Refresh] No matching configuration for:', currentHostname + currentPath);
  return;
}

// Use matched config
const refreshIntervalMs = matchedConfig.interval || getGlobalInterval();
```

## Per-Domain Intervals

### Load Interval Logic:
```javascript
function getActiveInterval() {
  const matchedConfig = findMatchingConfig(
    window.location.hostname,
    window.location.pathname,
    domainConfigs
  );
  
  if (matchedConfig && matchedConfig.interval) {
    return matchedConfig.interval;
  }
  
  // Fall back to global
  const stored = localStorage.getItem(STORAGE_KEY_INTERVAL);
  return stored ? parseInt(stored, 10) : REFRESH_INTERVAL_MS;
}
```

### UI Updates:
- Show "(Domain Default: 2 min)" in interval selector when domain has override
- Add badge/indicator showing active interval source
- Display interval next to domain in domain manager

## Visual Domain Manager Updates

### Enhanced Domain List Item:
```
[Domain Card]
  ├─ Domain: *.jamfcloud.com [✓ Matches current]
  ├─ Interval: 2 minutes (custom)
  ├─ Paths: All paths (*)
  └─ [Expand] [Edit] [Delete]
  
  [Expanded Advanced Settings]
    ├─ Custom Interval: [Dropdown: Use Global / 15s / 30s / 1min / ...]
    ├─ Include Paths:
    │   • /computers.html [Remove]
    │   • /mobileDevices* [Remove]
    │   [+ Add Path]
    ├─ Exclude Paths:
    │   • /settings/* [Remove]
    │   [+ Add Path]
    └─ [Test Patterns] [Save] [Cancel]
```

### Modal Sections:
1. **Basic Section** (always visible)
   - Domain pattern
   - Add/Remove buttons
   
2. **Advanced Section** (expandable per domain)
   - Custom interval selector
   - Path include patterns
   - Path exclude patterns
   - Pattern type toggle (glob/regex)
   - Test button

### Add Domain Flow:
```
Step 1: Enter domain pattern
  Input: *.jamfcloud.com
  [Advanced Settings ▼]

Step 2: (Optional) Configure advanced settings
  Custom Interval: [Use Global ▼]
  Include Paths: [* (all paths)]
  Exclude Paths: [empty]
  
Step 3: Add
  [✚ Add Domain] [🧪 Test]
```

## Storage Format

### localStorage structure:
```javascript
{
  "domainConfigs": [
    {
      "domain": "*.jamfcloud.com",
      "interval": 60000,
      "paths": {
        "include": ["/computers.html", "/devices*"],
        "exclude": ["/settings/*"]
      },
      "enabled": true
    },
    {
      "domain": "jamf.example.com",
      "interval": null,
      "paths": {
        "include": ["*"],
        "exclude": []
      },
      "enabled": true
    }
  ]
}
```

## Testing Scenarios

### Test Cases:
1. Simple domain match (backward compat)
2. Domain + path include
3. Domain + path exclude (takes priority)
4. Glob wildcard patterns
5. Regex patterns
6. Custom interval override
7. Multiple domains with different configs
8. Migration from v2.0.0 to v2.1.0

### Test UI:
```
[Test Configuration]
Test URL: https://example.jamfcloud.com/computers.html
Result: ✅ Matches config "*.jamfcloud.com"
  - Domain: ✅ Match
  - Path: ✅ Match (included by "/computers.html")
  - Interval: 2 minutes (custom)
```

## Implementation Order

1. ✅ Visual domain manager (v2.0.0) - DONE
2. 🔄 Configuration structure upgrade (v2.1.0) - NEXT
   - Define new config format
   - Add migration logic
   - Update storage functions
3. 🔄 Path matching implementation
   - Glob pattern matcher
   - Regex pattern matcher
   - URL checking logic
4. 🔄 UI enhancements
   - Expandable advanced settings
   - Path pattern inputs
   - Interval selector per domain
   - Test functionality
5. 🔄 Per-domain interval system
   - Active interval detection
   - UI updates
6. 🔄 Documentation
   - README updates
   - Screenshots
   - Examples

## Breaking Changes

**None** - Full backward compatibility maintained through auto-migration.

## Configuration Examples

### Example 1: Production vs Dev intervals
```javascript
[
  {
    domain: 'prod.jamfcloud.com',
    interval: 300000, // 5 minutes
    paths: { include: ['*'], exclude: [] }
  },
  {
    domain: 'dev.jamfcloud.com',
    interval: 15000, // 15 seconds
    paths: { include: ['*'], exclude: [] }
  }
]
```

### Example 2: Only refresh on specific pages
```javascript
[
  {
    domain: '*.jamfcloud.com',
    interval: 60000,
    paths: {
      include: ['/computers.html', '/mobileDevices.html', '/dashboard*'],
      exclude: ['/settings/*', '/admin/*']
    }
  }
]
```

### Example 3: Complex regex patterns
```javascript
[
  {
    domain: '*.jamfcloud.com',
    interval: null,
    paths: {
      include: ['regex:^/(computers|devices)/.*\\.html$'],
      exclude: ['regex:.*/edit/.*']
    }
  }
]
```

## Performance Considerations

- Path matching runs on every page load (minimal impact)
- Regex compilation cached where possible
- Config loaded once from localStorage
- No impact on refresh logic performance

## Next Steps

**Ready to implement Phase 2 (Configuration Structure Upgrade)**

Questions:
- Start with configuration structure upgrade?
- Implement all at once or incremental commits?
- Add feature flags for gradual rollout?
