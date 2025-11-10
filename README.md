# jamf-auto-refresh

A userscript that adds an auto-refresh widget to the Jamf Pro sidebar, with a user-selectable interval and countdown timer.

## Features

- 📍 **Sidebar Integration** - Seamlessly integrates into the Jamf Pro sidebar navigation
- 🔄 **Manual Refresh Button** - Instantly refresh the page without waiting for the timer
- 🕒 **Last Refresh Timestamp** - Shows when the page was last refreshed (e.g., "2 min ago")
- 📊 **Session Counter** - Tracks how many times the page has refreshed in the current session
- ⏱️ **Customizable Intervals** - Choose from 15 seconds to 30 minutes
- 🎯 **Typing Detection** - Delays refresh when actively typing in forms
- 💾 **Persistent Settings** - Remembers your preferences per hostname
- 🔔 **Visual Countdown** - Shows remaining time before next refresh in a badge
- 🎨 **Native Look & Feel** - Styled to match Jamf Pro's sidebar design

## Version History

### v1.7.0 (Latest)
- 🎯 **Perfect Native Integration** - Widget now perfectly mimics Jamf's native sidebar items
- ✨ Uses exact styling from native items (padding: 8px, height: 28px, gap: 12px)
- ✨ Matches native icon styling with proper SVG refresh icon
- ✨ Inserts as direct child of `jamf-nav-side-container` like native items
- ✨ Proper hover effects matching native behavior
- 🔧 Removed shadow DOM detection (not needed - Jamf uses regular DOM)
- 🔧 Simplified sidebar detection to target `jamf-nav-side-container` directly

### v1.6.0
- 🎨 **Major UI Overhaul** - Moved from top navigation to sidebar for better integration
- ✨ Added full-width sidebar widget with icon, label, and countdown badge
- ✨ Dropdown now appears to the right of the widget (sidebar-friendly)
- ✨ Live status updates on the sidebar label (shows interval or "Disabled")
- 🔧 Improved fallback positioning if sidebar not found

### v1.5.0
- ✨ Added "Refresh Now" button for manual page refresh
- ✨ Added last refresh timestamp with live updates (e.g., "Last refreshed: 2 min ago")
- ✨ Added session refresh counter to track automatic refreshes
- 🔧 Improved status display with better formatting

### v1.4.0
- Previous stable release
