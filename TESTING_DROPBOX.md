# Dropbox Testing Guide

This guide will help you test all Dropbox cloud backup features.

---

## Prerequisites

✅ You've already completed:
- Created Dropbox app
- Added App Key (`6omcza3uejr7cok`) to `dropbox.js`
- Added redirect URI to Dropbox app settings

---

## Testing Checklist

### 1. Test Local Development (Optional but Recommended)

Before deploying to GitHub Pages, test locally:

```bash
# Start local server
python -m http.server 8000

# OR with Node.js
npx http-server -p 8000
```

**Important:** Add `http://localhost:8000/` to your Dropbox app's OAuth Redirect URIs!

Open: `http://localhost:8000/`

---

### 2. Test Connection Flow

#### Step 2.1: Check Initial State
1. Open the app in Chrome, Edge, or Opera (Web Bluetooth requirement)
2. Navigate to sidebar → **Configuration** section
3. Find **Cloud Backup** section
4. You should see:
   - ✅ Header shows "Cloud Backup" with gray "Not Connected" badge
   - ✅ "Connect your personal Dropbox account..." message
   - ✅ Blue "Connect Dropbox" button
   - ✅ Privacy notice at bottom

#### Step 2.2: Connect to Dropbox
1. Click **"Connect Dropbox"** button
2. You should be:
   - ✅ Redirected to `dropbox.com` login/authorization page
   - ✅ If already logged into Dropbox, you'll see permission request
   - ✅ App name shows "VitruvianWorkouts" (or whatever you named it)

3. Click **"Allow"** or **"Grant access"**

4. You should be:
   - ✅ Redirected back to your app
   - ✅ URL cleaned up (no `?code=...` parameter visible)
   - ✅ Console log shows "Connected to Dropbox as [Your Name]"

#### Step 2.3: Verify Connection State
After connecting, check the UI:

1. **Status Badge:**
   - ✅ Header now shows green "Connected" badge

2. **Connected Section Visible:**
   - ✅ "Connected to Dropbox" green status pill
   - ✅ Path shown: `/Apps/VitruvianWorkouts/workouts/`
   - ✅ Last backup message: "No backups yet. Complete a workout..."
   - ✅ Three buttons: "Sync from Dropbox", "Export All as CSV", "Disconnect"

3. **Console Log:**
   - ✅ Look for green success messages about Dropbox connection

---

### 3. Test Automatic Backup

Now test that workouts are automatically saved to Dropbox.

#### Option A: Test Without Hardware (Mock Workout)

If you don't have the Vitruvian device, open browser console and run:

```javascript
// Simulate a completed workout
const mockWorkout = {
  mode: "Test Mode",
  weightKg: 20,
  reps: 10,
  timestamp: new Date(),
  startTime: new Date(Date.now() - 60000), // 1 min ago
  warmupEndTime: new Date(Date.now() - 45000),
  endTime: new Date(),
  setName: "Test Exercise",
  setNumber: 1,
  setTotal: 3,
  itemType: "exercise"
};

// Add to history
app.addToWorkoutHistory(mockWorkout);

// Manually trigger backup
if (app.dropboxManager.isConnected) {
  app.dropboxManager.saveWorkout(mockWorkout)
    .then(() => {
      localStorage.setItem("vitruvian.dropbox.lastBackup", new Date().toISOString());
      app.updateLastBackupDisplay();
      console.log("✅ Test backup successful!");
    })
    .catch(err => console.error("❌ Backup failed:", err));
}
```

#### Option B: Test With Hardware (Real Workout)

If you have the device:

1. Connect to the Vitruvian device
2. Start a simple workout:
   - Mode: Old School
   - Weight: 10 kg
   - Reps: 3 (keep it short for testing)
3. Complete the workout
4. Check console log for:
   - ✅ "Workout completed and saved to history"
   - ✅ "Workout backed up to Dropbox"

#### Step 3.1: Verify Backup Occurred

After completing/simulating a workout:

1. **Check UI:**
   - ✅ Last backup display updates: "Last backup: just now"
   - ✅ Console shows "[Dropbox] Saved workout: workout_2024-..."

2. **Check Your Dropbox:**
   - Go to [dropbox.com](https://www.dropbox.com)
   - Navigate to **Apps** → **VitruvianWorkouts** → **workouts**
   - ✅ You should see a JSON file: `workout_2024-XX-XXTXX-XX-XX-XXXZ.json`
   - ✅ Click it to preview - should show your workout data

3. **Test Automatic Updates:**
   - Wait 1 minute
   - Last backup should update to "1 min ago"
   - Refresh page - should still show "Connected" (connection persists)

---

### 4. Test Manual Sync

Test syncing workouts FROM Dropbox TO the app.

#### Step 4.1: Clear Local History

Open browser console:
```javascript
// Clear local workout history
app.workoutHistory = [];
app.updateHistoryDisplay();
console.log("Local history cleared");
```

#### Step 4.2: Sync from Dropbox

1. Click **"Sync from Dropbox"** button
2. Wait a few seconds
3. Check results:
   - ✅ Status message: "Synced X new workout(s) from Dropbox"
   - ✅ Console shows "[Dropbox] Loading workouts from Dropbox..."
   - ✅ Console shows "[Dropbox] Found X workout files"
   - ✅ Console shows "[Dropbox] Loaded X workouts"
   - ✅ Workout History section now shows your workouts

#### Step 4.3: Test Duplicate Prevention

1. Click **"Sync from Dropbox"** again
2. Check results:
   - ✅ Status message: "No new workouts found in Dropbox"
   - ✅ No duplicate workouts in history
   - ✅ Console confirms duplicate detection worked

---

### 5. Test CSV Export

#### Step 5.1: Export to Dropbox

1. Make sure you have at least one workout in history
2. Click **"Export All as CSV to Dropbox"** button
3. Wait a few seconds
4. Check results:
   - ✅ Status message: "Export complete!"
   - ✅ Console shows "[Dropbox] Exported X workouts to CSV..."

#### Step 5.2: Verify CSV File

1. Go to [dropbox.com](https://www.dropbox.com)
2. Navigate to **Apps** → **VitruvianWorkouts**
3. ✅ You should see: `workout_history_2024-XX-XX.csv`
4. ✅ Download and open in Excel/Google Sheets
5. ✅ Should have columns: Workout Date, Mode, Weight, Reps, Set Name, etc.
6. ✅ Should have one row per workout

---

### 6. Test Disconnect

#### Step 6.1: Disconnect Dropbox

1. Click **"Disconnect Dropbox"** button (red button at bottom)
2. Confirm the alert
3. Check results:
   - ✅ Status badge turns gray: "Not Connected"
   - ✅ UI switches back to "Connect Dropbox" view
   - ✅ Console shows "Disconnected from Dropbox"

#### Step 6.2: Verify Files Remain

1. Go to [dropbox.com](https://www.dropbox.com)
2. Check **Apps** → **VitruvianWorkouts** → **workouts**
3. ✅ All your workout files should still be there
4. ✅ Files are NOT deleted when disconnecting

#### Step 6.3: Test Reconnection

1. Click **"Connect Dropbox"** again
2. ✅ Should reconnect without re-authorizing (uses existing permission)
3. ✅ Status badge turns green again
4. ✅ Can sync workouts again

---

### 7. Test Persistence Across Page Reloads

#### Step 7.1: Reload While Connected

1. Make sure you're connected to Dropbox
2. Refresh the page (F5 or Cmd+R)
3. Check results:
   - ✅ Status badge still shows "Connected"
   - ✅ No need to reconnect
   - ✅ Console shows "Restored Dropbox connection from stored token"
   - ✅ Last backup timestamp still displayed

#### Step 7.2: Test Token Persistence

1. Close the browser completely
2. Open browser again
3. Navigate back to your app
4. ✅ Should still be connected
5. ✅ Token stored in localStorage persists across sessions

---

### 8. Test Error Handling

#### Step 8.1: Test with Invalid Token

Open console and run:
```javascript
// Corrupt the token to test error handling
localStorage.setItem("vitruvian.dropbox.token", "invalid_token");
location.reload();
```

Expected:
- ✅ App detects invalid token
- ✅ Clears corrupted token
- ✅ Shows "Not Connected" status
- ✅ Console shows error but app doesn't crash

#### Step 8.2: Test Network Failure

1. Turn off WiFi/disconnect network
2. Try to connect to Dropbox
3. Expected:
   - ✅ Error message in console
   - ✅ Alert shown to user
   - ✅ App remains functional

---

## Visual Checklist

Use this quick checklist when showing features to users:

### Connection Indicators
- [ ] Gray "Not Connected" badge when disconnected
- [ ] Green "Connected" badge when connected
- [ ] Status badge visible in Cloud Backup section header
- [ ] Green "Connected to Dropbox" pill in connected view
- [ ] Last backup timestamp displayed
- [ ] "X min ago" / "just now" format works

### Console Log Messages
- [ ] OAuth flow messages are clear
- [ ] Success messages show green "[Dropbox success]"
- [ ] Error messages show red "[Dropbox error]"
- [ ] File operations logged (saves, loads, exports)

### Dropbox Files
- [ ] JSON files appear in `/Apps/VitruvianWorkouts/workouts/`
- [ ] Filenames have ISO timestamp format
- [ ] JSON files contain all workout data
- [ ] CSV export appears in `/Apps/VitruvianWorkouts/`

---

## Common Issues & Solutions

### "Redirect URI mismatch" error

**Cause:** Your GitHub Pages URL not added to Dropbox app settings

**Fix:**
1. Go to Dropbox App Console
2. Settings → OAuth 2 Redirect URIs
3. Add exact URL (including trailing slash if your site has one)

### Token expired or invalid

**Cause:** Rare token expiration or corruption

**Fix:** User should disconnect and reconnect Dropbox

### "Operation already in progress" error

**Cause:** Rare GATT operation queue issue

**Fix:** This shouldn't happen with Dropbox (different from BLE), but if it does, check browser console for details

### CSV export opens as text file

**Cause:** Browser doesn't recognize .csv extension

**Fix:** Right-click → Open with → Excel/Sheets, or just rename to .csv after download

---

## Advanced Testing

### Test Multiple Devices

1. Connect Dropbox on Device A
2. Complete a workout on Device A
3. Open app on Device B (different browser/computer)
4. Connect same Dropbox account
5. Click "Sync from Dropbox"
6. ✅ Workout from Device A appears on Device B

### Test Cross-Browser

Test on:
- [ ] Chrome (desktop)
- [ ] Edge (desktop)
- [ ] Opera (desktop)
- [ ] Chrome (mobile)
- [ ] Safari (won't work - no Web Bluetooth, but Dropbox should)

---

## Production Deployment Checklist

Before going live on GitHub Pages:

- [ ] App Key is correct in `dropbox.js`
- [ ] GitHub Pages URL added to Dropbox OAuth Redirect URIs
- [ ] Tested full connection flow
- [ ] Tested automatic backup
- [ ] Tested manual sync
- [ ] Tested CSV export
- [ ] Tested disconnect/reconnect
- [ ] Tested page reload persistence
- [ ] Verified files appear in user's Dropbox
- [ ] Console shows no errors during normal operation

---

## Support & Troubleshooting

If something isn't working:

1. **Check browser console** - errors will show there
2. **Check Dropbox app settings** - verify redirect URIs
3. **Check localStorage** - look for `vitruvian.dropbox.token`
4. **Check Dropbox files** - verify files are being created
5. **Try disconnect/reconnect** - often fixes token issues

---

## Success! 🎉

If all the above tests pass, your Dropbox integration is working perfectly!

Your users will enjoy:
- ✅ Automatic cloud backup of every workout
- ✅ Cross-device sync
- ✅ CSV export for analysis
- ✅ Complete data privacy (their Dropbox, not yours)
- ✅ Persistent connection (no repeated logins)

Happy testing! 💪📊☁️
