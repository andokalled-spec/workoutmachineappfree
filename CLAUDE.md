# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a **Web Bluetooth interface** for controlling Vitruvian workout machines. It's a single-page web application that communicates with fitness equipment over BLE (Bluetooth Low Energy) using the Nordic UART Service (NUS) protocol.

**Key Features:**
- Real-time workout control via Web Bluetooth API
- Live data visualization with position and load tracking
- Workout planning with exercise/echo mode sequencing
- Configurable rest timers and progression/regression
- Unit conversion (kg ↔ lb)
- CSV data export

## Architecture

### File Structure & Responsibilities

**index.html** (main UI file, ~1300 lines)
- Complete single-page layout with inline CSS
- Sidebar controls for connection, program modes, echo modes, workout plans, and configuration
- Main content area with live stats, position bars, load graph, and workout history
- Rest overlay for workout plan sequences

**app.js** (main application logic, ~2100 lines)
- `VitruvianApp` class: orchestrates all UI/device interactions
- Manages device connection state, workout state, and rep counting
- Implements workout planning system with rest timers
- Handles unit conversions (kg/lb) for weights
- Auto-stop detection for "Just Lift" mode
- Workout history tracking with graph markers

**device.js** (BLE communication, ~570 lines)
- `VitruvianDevice` class: manages BLE connection and GATT operations
- GATT operation queue to prevent concurrent access errors
- Property polling (0x003f handle, 500ms interval)
- Monitor polling (0x0039 handle, 100ms interval for position/load data)
- Rep notification handling (0x0036 handle)
- Parses 16-byte monitor frames: ticks, positions, loads

**protocol.js** (binary protocol builders, ~206 lines)
- `buildInitCommand()`: 4-byte initialization
- `buildInitPreset()`: 34-byte preset with coefficient table
- `buildProgramParams()`: 96-byte program frame (modes, reps, weights, progression)
- `buildEchoControl()`: 32-byte echo mode frame
- `buildColorScheme()`: 34-byte LED color control
- All use little-endian byte order

**modes.js** (workout mode definitions, ~237 lines)
- Program modes: Old School, Pump, TUT, TUT Beast, Eccentric Only
- Echo levels: Hard, Harder, Hardest, Epic
- `getModeProfile()`: generates 32-byte mode profile blocks
- `getEchoParams()`: calculates echo parameters (gain, cap, smoothing, etc.)
- Predefined color schemes for LED control

**chart.js** (data visualization, ~565 lines)
- `ChartManager` class: uses uPlot library for real-time charting
- Dual Y-axes: load (left) and position (right)
- 2-hour rolling data buffer (72,000 points max)
- Time range filters: 10s, 30s, 1m, 2m, All
- Event markers for workout start/warmup end/stop
- CSV export with unit conversion

**dropbox.js** (cloud storage integration, ~400 lines)
- `DropboxManager` class: user-owned cloud backup
- OAuth 2.0 with PKCE flow (no client secrets needed)
- Automatic workout backup after completion
- Manual sync from Dropbox with duplicate detection
- CSV export directly to user's Dropbox
- Privacy-first: each user's data in THEIR Dropbox account

## Critical Implementation Details

### BLE Protocol Specifics

**Service UUIDs:**
- NUS Service: `6e400001-b5a3-f393-e0a9-e50e24dcca9e`
- RX (write): `6e400002-b5a3-f393-e0a9-e50e24dcca9e`
- Monitor (read): `90e991a6-c548-44ed-969b-eb541014eae3`
- Property (read): `5fa538ec-d041-42f6-bbd6-c30d475387b7`
- Rep notify: `8308f2a6-0875-4a94-a86f-5c5c5e1b068a`

**Initialization Sequence:**
1. Send 4-byte init command: `[0x0a, 0x00, 0x00, 0x00]`
2. Wait 50ms
3. Send 34-byte init preset (includes coefficient table)
4. Enable notifications on all notify characteristics

**Monitor Data Format (16 bytes):**
- u16[0-1]: Tick counter (32-bit, little-endian)
- u16[2]: Right cable position (posA)
- u16[4]: Right cable load (kg × 100)
- u16[5]: Left cable position (posB)
- u16[7]: Left cable load (kg × 100)
- Position values > 50000 are filtered as spikes

**Rep Notification Format:**
- u16[0]: Top counter (increments when reaching top of range)
- u16[2]: Complete counter (increments when rep finishes at bottom)
- Used for automatic rep counting during workouts

### Workout State Machine

**Phases:**
1. **Warmup**: First 3 reps (configurable via `warmupTarget`)
2. **Working reps**: Main workout after warmup
3. **Auto-stop** (Just Lift mode only): 5-second timer when near bottom position

**Rep Detection:**
- Monitors notification counters u16[0] (top) and u16[2] (bottom)
- Records position at each counter increment
- Maintains rolling window (2-3 samples) for range detection
- Calculates average positions with min/max uncertainty bands
- Displays red (min) and green (max) range indicators on position bars

**Stop-at-Top Feature:**
- When enabled, workout completes at top of final rep instead of bottom
- Useful for exercises like squats where finishing standing is preferred
- Only applies when target reps are set (not Just Lift mode)

### Workout Planning System

**Plan Structure:**
- Array of items, each is either "exercise" or "echo" type
- Exercise items: mode, perCableKg, reps, sets, restSec, cables, justLift, stopAtTop, progressionKg, name
- Echo items: level, eccentricPct, targetReps, sets, restSec, justLift, stopAtTop, name
- Stored in localStorage with key prefix `vitruvian.plan.`

**Plan Execution Flow:**
1. User clicks "Start Plan" → `startPlan()` validates connection
2. `_runCurrentPlanBlock()` applies item to UI, then calls `startProgram()` or `startEcho()`
3. When workout completes, `completeWorkout()` fires `planOnWorkoutComplete` hook
4. `_planAdvance()` checks if more sets remain for current item
   - If yes: show rest overlay, increment set counter, repeat item
   - If no: advance to next item, show rest overlay
5. Rest overlay displays countdown with skip/+30s buttons
6. After rest, `_runCurrentPlanBlock()` starts next block

**Rest Overlay:**
- Shows circular countdown timer with set name
- Displays preview of next block (mode, weight, reps)
- Skip button to immediately start next block
- +30s button to extend rest period

### Unit Conversion System

**Storage vs Display:**
- All weights stored internally in **kilograms**
- Display unit (kg or lb) stored in `localStorage.vitruvian.weightUnit`
- Conversion: 1 kg = 2.2046226218 lb
- Device always receives kg values regardless of display unit

**Conversion Points:**
- Input fields: convert display → kg when sending to device
- Load displays: convert kg → display for live stats
- Chart: convert all loads to display unit before rendering
- CSV export: uses display unit with appropriate decimals

**Weight Semantics:**
- `perCableKg`: weight set per cable (what user configures)
- `effectiveKg`: perCableKg + 10.0 (internal device calculation)
- Progression: kg added/subtracted per rep (-3 to +3 kg range)

## Common Development Tasks

### Adding a New Workout Mode

1. Add mode constant to `ProgramMode` enum in `modes.js`
2. Add display name to `ProgramModeNames` object
3. Implement mode profile in `getModeProfile()` switch statement (32 bytes of timing/resistance parameters)
4. Add `<option>` element to mode selector in `index.html` (line ~598)
5. Update plan UI rendering in `app.js` `renderPlanUI()` method

### Modifying BLE Protocol

**Important:** Protocol changes require understanding the device firmware. The current implementation is reverse-engineered from packet captures.

- All multi-byte values use **little-endian** byte order
- GATT operations are queued to prevent "operation already in progress" errors
- Use `writeWithResponse()` for commands requiring acknowledgment
- Monitor/property reads happen on intervals, not on-demand

### Debugging BLE Issues

1. Check console log panel in UI for detailed packet traces
2. All writes are logged with hex dumps via `bytesToHex()`
3. Monitor data parsing happens in `parseMonitorData()` - add breakpoints there
4. Rep counting logic in `handleRepNotification()` - watch counter deltas
5. GATT queue status visible via `gattBusy` flag in device object

### Testing Without Hardware

- Most UI can be tested by loading `index.html` in Chrome/Edge
- Mock the `navigator.bluetooth` API to simulate device responses
- Chart and unit conversion work without BLE connection
- Workout planning UI is fully functional offline

## Browser Requirements

- **Chrome, Edge, or Opera** (Web Bluetooth API support required)
- HTTPS connection (or localhost for development)
- Bluetooth hardware enabled on host device
- Device name filter: `namePrefix: "Vee"`

## State Persistence

**localStorage keys:**
- `vitruvian.weightUnit`: "kg" or "lb"
- `vitruvian.plans.index`: JSON array of saved plan names
- `vitruvian.plan.{name}`: JSON array of plan items
- `vitruvian.dropbox.token`: Dropbox OAuth access token (if connected)

**No persistence for:**
- Workout history (resets on page reload, but can sync from Dropbox)
- Load chart data (2-hour rolling buffer in memory)
- Connection state (must reconnect after refresh)

## Dropbox Cloud Backup

### Privacy Architecture

**User-owned storage model:**
- Each user connects their personal Dropbox account via OAuth 2.0
- Workouts saved to `/Apps/VitruvianWorkouts/workouts/` in USER's Dropbox
- Developer has ZERO access to user data
- No server-side component required

### OAuth 2.0 with PKCE

**Why PKCE:**
- Designed for public clients (browser apps without secrets)
- Dropbox App Key can be public (it's just an identifier)
- Code verifier/challenge prevents authorization code interception
- No client secret to protect

**Flow:**
1. Generate random code verifier (32 bytes)
2. Create SHA-256 challenge from verifier
3. Redirect to Dropbox with challenge
4. Dropbox returns authorization code
5. Exchange code + verifier for access token
6. Store token in localStorage

**Implementation details:**
- Code verifier stored in sessionStorage (temporary)
- Access token stored in localStorage (persistent)
- Token includes refresh capability (`token_access_type: offline`)
- GATT operation queue pattern used for API calls

### Automatic Backup

**Trigger:** `completeWorkout()` method in app.js:910-914
- After workout added to history
- Non-blocking (uses .catch() to prevent UI errors)
- Only saves if `dropboxManager.isConnected === true`

**File format:**
```javascript
{
  mode: "Old School",
  weightKg: 15,
  reps: 10,
  timestamp: "2024-01-15T10:30:45.123Z",
  startTime: "2024-01-15T10:30:30.000Z",
  warmupEndTime: "2024-01-15T10:30:35.000Z",
  endTime: "2024-01-15T10:30:45.123Z",
  setName: "Back Squat",
  setNumber: 1,
  setTotal: 3,
  itemType: "exercise"
}
```

**Filename convention:** `workout_YYYY-MM-DDTHH-mm-ss-SSSZ.json`
- ISO timestamp with colons replaced by hyphens (Dropbox path-safe)
- Example: `workout_2024-01-15T10-30-45-123Z.json`

### Sync Logic

**Duplicate detection:**
- Compares timestamp.getTime() values
- Uses Set for O(1) lookup performance
- Merges cloud + local, sorts by newest first

**Edge cases handled:**
- Missing timestamps (fallback to endTime)
- Invalid JSON files (logged but skipped)
- Folder doesn't exist (auto-created on first save)

### Setup Requirements

**Developer must:**
1. Create Dropbox app at https://www.dropbox.com/developers/apps
2. Choose "Scoped access" and "App folder" access type
3. Enable permissions: files.metadata.write, files.metadata.read, files.content.write, files.content.read
4. Add OAuth redirect URI (GitHub Pages URL)
5. Replace `YOUR_DROPBOX_APP_KEY` in dropbox.js:10 with actual App key

**See DROPBOX_SETUP.md for complete setup instructions.**

## Code Style Notes

- Vanilla JavaScript (ES6+), no build system
- Single global `app` instance created at bottom of `app.js`
- Event handlers called via `onclick="app.methodName()"` in HTML
- Async/await used throughout for BLE operations
- Error handling via try/catch with user alerts for critical failures
