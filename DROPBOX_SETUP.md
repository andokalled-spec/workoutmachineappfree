# Dropbox Integration Setup Guide

This guide will help you set up Dropbox cloud backup for your Vitruvian workout app.

## Privacy Overview

**Your users' data is stored in THEIR Dropbox accounts, not yours.**

- Each user connects their own personal Dropbox account
- Workout data is saved to `/Apps/VitruvianWorkouts/workouts/` in the user's Dropbox
- **You have ZERO access to user data** - it's truly user-owned storage
- Users can view, download, or delete their workout files directly in Dropbox

---

## Setup Steps

### 1. Create a Dropbox App

1. Go to [Dropbox App Console](https://www.dropbox.com/developers/apps)
2. Click **"Create app"**
3. Choose the following settings:
   - **API**: Scoped access
   - **Access type**: App folder (this creates `/Apps/VitruvianWorkouts/` in user's Dropbox)
   - **App name**: `VitruvianWorkouts` (or your preferred name)

4. Click **"Create app"**

### 2. Configure App Settings

On your new app's settings page:

#### Permissions Tab
Make sure these permissions are enabled:
- ✅ `files.metadata.write` - Create folders
- ✅ `files.metadata.read` - List files
- ✅ `files.content.write` - Upload workouts
- ✅ `files.content.read` - Download workouts

Click **"Submit"** to save permissions.

#### Settings Tab

1. **OAuth 2 Redirect URIs:**
   - Add your GitHub Pages URL (e.g., `https://yourusername.github.io/workoutmachineappfree/`)
   - For local testing, also add: `http://localhost:8000/` or your local server URL
   - Click **"Add"** for each URI

2. **App Key:**
   - Copy the **"App key"** shown at the top of the settings page
   - You'll need this in the next step

### 3. Add Your App Key to the Code

1. Open `dropbox.js`
2. Find this line (near the top):
   ```javascript
   this.clientId = "YOUR_DROPBOX_APP_KEY"; // TODO: Replace with your app key
   ```
3. Replace `YOUR_DROPBOX_APP_KEY` with your actual App key from step 2
4. Save the file

**Example:**
```javascript
this.clientId = "abc123def456ghi789"; // Your real app key
```

### 4. Test Locally (Optional)

Before deploying to GitHub Pages, test locally:

1. Start a local web server:
   ```bash
   # Using Python
   python -m http.server 8000

   # OR using Node.js
   npx http-server -p 8000
   ```

2. Open `http://localhost:8000/` in Chrome, Edge, or Opera

3. Navigate to **Configuration** → **Cloud Backup**

4. Click **"Connect Dropbox"** and authorize

5. Complete a test workout and verify it appears in your Dropbox at:
   `/Apps/VitruvianWorkouts/workouts/`

### 5. Deploy to GitHub Pages

1. Commit your changes:
   ```bash
   git add dropbox.js index.html app.js
   git commit -m "Add Dropbox cloud backup integration"
   git push origin main
   ```

2. Your GitHub Pages site will automatically update

3. Test the Dropbox connection on your live site

---

## How It Works

### OAuth 2.0 with PKCE

The integration uses **OAuth 2.0 with PKCE** (Proof Key for Code Exchange):

- **PKCE** is designed for public clients (like web apps) without client secrets
- Your Dropbox App Key can be public - it's just an identifier
- No secrets are embedded in the code or exposed to users
- Each user authorizes YOUR app to access THEIR Dropbox

### Authentication Flow

1. User clicks "Connect Dropbox"
2. Redirected to Dropbox login/authorization page
3. User grants permission (only needs to do this once)
4. Dropbox redirects back with authorization code
5. App exchanges code for access token using PKCE
6. Token stored in browser's localStorage (stays on user's device)
7. Future workouts auto-save to user's Dropbox

### Data Storage

Workouts are saved as individual JSON files:
```
/Apps/VitruvianWorkouts/
  └── workouts/
      ├── workout_2024-01-15T10-30-45-123Z.json
      ├── workout_2024-01-15T11-15-22-456Z.json
      └── ...
```

Each file contains:
```json
{
  "mode": "Old School",
  "weightKg": 15,
  "reps": 10,
  "timestamp": "2024-01-15T10:30:45.123Z",
  "startTime": "2024-01-15T10:30:30.000Z",
  "endTime": "2024-01-15T10:30:45.123Z",
  "setName": "Back Squat",
  "setNumber": 1,
  "setTotal": 3
}
```

---

## User Features

Once connected, users can:

### Automatic Backup
- Every completed workout is automatically saved to their Dropbox
- No manual action required

### Manual Sync
- Click **"Sync from Dropbox"** to pull workouts from Dropbox
- Merges cloud workouts with local history (no duplicates)
- Useful when switching devices or browsers

### CSV Export
- Click **"Export All as CSV to Dropbox"**
- Creates a single CSV file with all workout history
- Saved to root of app folder: `/Apps/VitruvianWorkouts/workout_history_YYYY-MM-DD.csv`

### Disconnect
- Users can disconnect anytime
- Workouts remain in their Dropbox (not deleted)
- Just stops auto-backup for new workouts

---

## Troubleshooting

### "Dropbox integration not configured" alert

**Problem:** App key not set in code

**Solution:** Follow Step 3 above to add your App key

### OAuth redirect error: "redirect_uri_mismatch"

**Problem:** Your site URL isn't registered in Dropbox app settings

**Solution:**
1. Go to Dropbox App Console → Your App → Settings
2. Add your exact site URL to "OAuth 2 Redirect URIs"
3. Make sure there are no trailing slashes if your URL doesn't have one

### "Invalid token" or connection fails after some time

**Problem:** Dropbox access tokens can expire

**Solution:** User should disconnect and reconnect Dropbox
- This is rare with `token_access_type: offline` (refresh tokens)
- If it happens frequently, check Dropbox app settings

### CORS errors when testing locally

**Problem:** Dropbox API doesn't allow `file://` protocol

**Solution:** Always use a local web server (see Step 4)
- Don't open `index.html` directly in browser
- Use Python's http.server or similar

---

## Security Notes

### What's Safe to Make Public

✅ **Dropbox App Key** - It's an identifier, not a secret
✅ **Your code** - OAuth PKCE is designed for public clients
✅ **Redirect URIs** - These are public anyway

### What's Private (Stays on User's Device)

🔒 **Access tokens** - Stored in user's localStorage, never sent to you
🔒 **Workout data** - Stored in user's Dropbox, you can't access it
🔒 **User credentials** - Users log in to Dropbox, not your app

### Best Practices

- ✅ Never log access tokens to console in production
- ✅ Use HTTPS for your GitHub Pages site (automatic)
- ✅ Keep Dropbox SDK up to date
- ✅ Tell users they can revoke access anytime via [Dropbox settings](https://www.dropbox.com/account/connected_apps)

---

## Support

If users have issues:

1. Check browser console for errors
2. Verify they're using Chrome, Edge, or Opera (Web Bluetooth requirement)
3. Make sure they've granted Dropbox permissions
4. Try disconnecting and reconnecting
5. Check if files appear in `/Apps/VitruvianWorkouts/workouts/` in their Dropbox

---

## Next Steps

### Optional Enhancements

Consider adding:
- **Auto-sync on page load** - Load workouts from Dropbox when app starts
- **Workout deletion** - Allow users to delete workouts from Dropbox via UI
- **Export individual workouts** - Download single workout as JSON/CSV
- **Import workouts** - Upload workout files from device

### Alternative Storage Providers

The same privacy-first approach can be used with:
- **Google Drive** - Similar OAuth flow with Drive API
- **OneDrive** - Microsoft's cloud storage
- **Solid Pods** - Decentralized personal data stores

---

## Need Help?

- **Dropbox API Docs**: https://www.dropbox.com/developers/documentation
- **OAuth 2.0 PKCE**: https://www.dropbox.com/developers/documentation/http/documentation#auth-flow
- **GitHub Pages**: https://docs.github.com/en/pages

Enjoy your privacy-first cloud backup! 🔒☁️
