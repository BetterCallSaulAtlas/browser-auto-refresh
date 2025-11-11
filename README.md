# jamf-auto-refresh

A userscript that adds a draggable floating auto-refresh widget to Jamf Pro, with a user-selectable interval, countdown timer, and session tracking.

## Features

- 🖱️ **Draggable Floating Window** - Move the widget anywhere on screen
- 📍 **Position Memory** - Remembers window position across page reloads
- ⏱️ **Session Duration Tracking** - Shows total uptime since first page load
- 🔄 **Manual Refresh Button** - Instantly refresh the page without waiting for the timer
- 🕒 **Last Refresh Timestamp** - Shows when the page was last refreshed (e.g., "30 sec ago")
- 📊 **Session Counter** - Tracks how many times the page has refreshed (persists across reloads)
- ⏱️ **Customizable Intervals** - Choose from 15 seconds to 30 minutes
- 🎯 **Typing Detection** - Delays refresh when actively typing in forms
- 💾 **Persistent Statistics** - All stats (counter, timestamp, session duration) survive page refreshes
- 🔔 **Visual Countdown** - Shows remaining time before next refresh
- 🎨 **Modern Design** - Gradient background with clean, intuitive interface
- 🎯 **Always Accessible** - Floats above page content, never gets hidden

## Installation

1. Install a userscript manager for your browser:
   - **Chrome/Edge**: [Tampermonkey](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
   - **Firefox**: [Tampermonkey](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/) or [Greasemonkey](https://addons.mozilla.org/en-US/firefox/addon/greasemonkey/)
   - **Safari**: [Userscripts](https://apps.apple.com/app/userscripts/id1463298887)

2. Install the script:
   - **Direct Install** (Recommended): [Click here to install](https://raw.githubusercontent.com/BetterCallSaulAtlas/jamf-auto-refresh/main/jamf_auto_refresh.js)
   - Or [download from GitHub Releases](https://github.com/BetterCallSaulAtlas/jamf-auto-refresh/releases/latest)
   - Or copy the contents of `jamf_auto_refresh.js` and create a new script in your userscript manager

3. Navigate to your Jamf Pro instance (e.g., `https://pke.atlassian.com/*` or `https://atlassian.jamfcloud.com/*`)

4. The floating widget will appear in the bottom-left corner (you can drag it anywhere)

### Automatic Updates
The script automatically checks for updates daily. Your userscript manager will notify you when a new version is available.

To manually check for updates:
- **Tampermonkey**: Click the extension icon → Dashboard → Click the script name → Check for updates
- **Greasemonkey**: Click the extension icon → User Scripts → Click the script → Check for updates

## Usage

### Basic Controls
- **Drag Window**: Click and hold the header to move the window anywhere on screen
- **Manual Refresh**: Click the 🔄 Refresh Now button to refresh immediately
- **Toggle Auto-refresh**: Click the Enable/Disable button to turn auto-refresh on or off
- **Change Interval**: Use the dropdown to select refresh interval (15s to 30min)

### Display Information
The widget shows:
- **Next refresh**: Countdown to next automatic refresh
- **Refresh count**: Total number of refreshes (persists across page reloads)
- **Last refresh**: Time since last refresh (e.g., "30 sec ago")
- **Session duration**: Total uptime since first page load (e.g., "45m 20s")

### Keyboard Activity Detection
The script automatically delays refresh when you're typing in forms to prevent data loss.

## Version History

### v1.8.0 (Latest)
- 🎨 **Reverted to Floating Window Design** - Draggable floating window instead of sidebar integration
- ✨ **Session Duration Tracking** - Shows total uptime since first page load
- 💾 **Persistent Statistics** - Refresh counter, timestamp, and session duration survive page reloads
- 🖱️ **Drag & Drop** - Click and drag the header to reposition the window
- 📍 **Position Memory** - Window location saved to localStorage
- ✨ **Simplified UI** - All controls visible in one compact window (no dropdown)
- 🎨 **Modern Design** - Gradient background with improved visual hierarchy
- 🎯 **Better Icons** - Added emoji icons for visual feedback (🔄, ⏸, ▶)
- 🔧 **Code Cleanup** - Removed complex sidebar integration logic

### v1.7.1
- 🔧 **Fix URL Matching** - Added wildcard to match all pages, not just root
- ✨ Added support for `atlassian.jamfcloud.com` domain
- 🐛 Fixed issue where script wouldn't load on Jamf instances

### v1.7.0
- 🎯 **Perfect Native Integration** - Widget perfectly mimicked Jamf's native sidebar items
- ✨ Used exact styling from native items (padding: 8px, height: 28px, gap: 12px)
- ✨ Matched native icon styling with proper SVG refresh icon

### v1.6.0
- 🎨 **Major UI Overhaul** - Moved from top navigation to sidebar
- ✨ Added full-width sidebar widget with icon, label, and countdown badge

### v1.5.0
- ✨ Added "Refresh Now" button for manual page refresh
- ✨ Added last refresh timestamp with live updates
- ✨ Added session refresh counter
