// dropbox.js - Dropbox integration for user-owned cloud storage

class DropboxManager {
  constructor() {
    // IMPORTANT: Replace this with your actual Dropbox App Key
    // Create app at: https://www.dropbox.com/developers/apps
    this.clientId = "6omcza3uejr7cok"; // TODO: Replace with your app key
    this.redirectUri = window.location.origin + window.location.pathname;
    this.dbx = null;
    this.isConnected = false;
    this.onLog = null; // Callback for logging
    this.onConnectionChange = null; // Callback when connection state changes
  }

  log(message, type = "info") {
    console.log(`[Dropbox ${type}] ${message}`);
    if (this.onLog) {
      this.onLog(message, type);
    }
  }

  // Initialize - check if we have a stored token or if we're returning from OAuth
  async init() {
    // Check if we're returning from OAuth redirect
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");

    if (code) {
      // Complete OAuth flow
      await this.handleOAuthCallback(code);
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    // Check for existing token
    const token = this.getStoredToken();
    if (token) {
      try {
        this.dbx = new Dropbox.Dropbox({ accessToken: token, fetch: fetch });
        // Test token validity
        await this.dbx.usersGetCurrentAccount();
        this.isConnected = true;
        this.log("Restored Dropbox connection from stored token", "success");
        this.notifyConnectionChange();
      } catch (error) {
        this.log("Stored token is invalid, clearing", "error");
        this.clearStoredToken();
        this.isConnected = false;
        this.notifyConnectionChange();
      }
    }
  }

  // Start OAuth flow with PKCE
  async connect() {
    if (this.clientId === "YOUR_DROPBOX_APP_KEY") {
      alert(
        "Dropbox integration not configured. Please set your Dropbox App Key in dropbox.js\n\n" +
        "Steps:\n" +
        "1. Create app at https://www.dropbox.com/developers/apps\n" +
        "2. Choose 'Scoped access' and 'App folder' access\n" +
        "3. Copy App key and replace YOUR_DROPBOX_APP_KEY in dropbox.js"
      );
      return;
    }

    this.log("Starting Dropbox OAuth flow...", "info");

    // Generate PKCE code verifier and challenge
    const verifier = this.generateCodeVerifier();
    const challenge = await this.generateCodeChallenge(verifier);

    // Store verifier for later
    sessionStorage.setItem("pkce_verifier", verifier);

    // Build authorization URL
    const authUrl = new URL("https://www.dropbox.com/oauth2/authorize");
    authUrl.searchParams.append("client_id", this.clientId);
    authUrl.searchParams.append("response_type", "code");
    authUrl.searchParams.append("code_challenge", challenge);
    authUrl.searchParams.append("code_challenge_method", "S256");
    authUrl.searchParams.append("redirect_uri", this.redirectUri);
    authUrl.searchParams.append("token_access_type", "offline"); // Get refresh token

    // Redirect to Dropbox
    window.location.href = authUrl.toString();
  }

  // Handle OAuth callback with authorization code
  async handleOAuthCallback(code) {
    this.log("Handling OAuth callback...", "info");

    const verifier = sessionStorage.getItem("pkce_verifier");
    if (!verifier) {
      this.log("Missing PKCE verifier in session", "error");
      return;
    }

    try {
      // Exchange authorization code for access token
      const response = await fetch("https://api.dropbox.com/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          code: code,
          grant_type: "authorization_code",
          code_verifier: verifier,
          client_id: this.clientId,
          redirect_uri: this.redirectUri,
        }),
      });

      if (!response.ok) {
        throw new Error(`Token exchange failed: ${response.statusText}`);
      }

      const data = await response.json();
      const accessToken = data.access_token;

      // Store token
      this.storeToken(accessToken);

      // Initialize Dropbox SDK
      this.dbx = new Dropbox.Dropbox({ accessToken: accessToken, fetch: fetch });
      this.isConnected = true;

      // Get user info
      const account = await this.dbx.usersGetCurrentAccount();
      this.log(`Connected to Dropbox as ${account.result.name.display_name}`, "success");

      // Create app folder structure
      await this.initializeFolderStructure();

      this.notifyConnectionChange();

      // Clean up session storage
      sessionStorage.removeItem("pkce_verifier");
    } catch (error) {
      this.log(`OAuth callback failed: ${error.message}`, "error");
      throw error;
    }
  }

  // Disconnect from Dropbox
  disconnect() {
    this.clearStoredToken();
    this.dbx = null;
    this.isConnected = false;
    this.log("Disconnected from Dropbox", "info");
    this.notifyConnectionChange();
  }

  // Initialize folder structure in user's Dropbox
  async initializeFolderStructure() {
    try {
      // Create /workouts folder if it doesn't exist
      await this.dbx.filesCreateFolderV2({ path: "/workouts" });
      this.log("Created /workouts folder", "success");
    } catch (error) {
      if (error.error?.error[".tag"] === "path" && error.error.error.path[".tag"] === "conflict") {
        // Folder already exists, that's fine
        this.log("Workouts folder already exists", "info");
      } else {
        this.log(`Failed to create folder: ${error.message}`, "error");
      }
    }
  }

  // Save workout to Dropbox
  async saveWorkout(workout) {
    if (!this.isConnected) {
      throw new Error("Not connected to Dropbox");
    }

    try {
      // Generate filename with timestamp
      const timestamp = workout.timestamp || new Date();
      const filename = `workout_${timestamp.toISOString().replace(/[:.]/g, "-")}.json`;
      const path = `/workouts/${filename}`;

      // Convert workout to JSON
      const contents = JSON.stringify(workout, null, 2);

      // Upload to Dropbox
      await this.dbx.filesUpload({
        path: path,
        contents: contents,
        mode: { ".tag": "add" },
        autorename: true,
      });

      this.log(`Saved workout: ${filename}`, "success");
      return true;
    } catch (error) {
      this.log(`Failed to save workout: ${error.message}`, "error");
      throw error;
    }
  }

  // Load all workouts from Dropbox
  async loadWorkouts() {
    if (!this.isConnected) {
      throw new Error("Not connected to Dropbox");
    }

    try {
      this.log("Loading workouts from Dropbox...", "info");

      // List all files in /workouts folder
      const response = await this.dbx.filesListFolder({ path: "/workouts" });
      const files = response.result.entries.filter(
        (entry) => entry[".tag"] === "file" && entry.name.endsWith(".json")
      );

      this.log(`Found ${files.length} workout files`, "info");

      // Download and parse each workout
      const workouts = [];
      for (const file of files) {
        try {
          const downloadResponse = await this.dbx.filesDownload({ path: file.path_lower });
          const fileBlob = downloadResponse.result.fileBlob;
          const text = await fileBlob.text();
          const workout = JSON.parse(text);

          // Convert timestamp strings back to Date objects
          if (workout.timestamp) {
            workout.timestamp = new Date(workout.timestamp);
          }
          if (workout.startTime) {
            workout.startTime = new Date(workout.startTime);
          }
          if (workout.warmupEndTime) {
            workout.warmupEndTime = new Date(workout.warmupEndTime);
          }
          if (workout.endTime) {
            workout.endTime = new Date(workout.endTime);
          }

          workouts.push(workout);
        } catch (error) {
          this.log(`Failed to load ${file.name}: ${error.message}`, "error");
        }
      }

      // Sort by timestamp, newest first
      workouts.sort((a, b) => {
        const timeA = (a.timestamp || a.endTime || new Date(0)).getTime();
        const timeB = (b.timestamp || b.endTime || new Date(0)).getTime();
        return timeB - timeA;
      });

      this.log(`Loaded ${workouts.length} workouts`, "success");
      return workouts;
    } catch (error) {
      this.log(`Failed to load workouts: ${error.message}`, "error");
      throw error;
    }
  }

  // Delete a workout from Dropbox (by timestamp match)
  async deleteWorkout(workout) {
    if (!this.isConnected) {
      throw new Error("Not connected to Dropbox");
    }

    try {
      // Find the file with matching timestamp
      const response = await this.dbx.filesListFolder({ path: "/workouts" });
      const timestamp = workout.timestamp || workout.endTime;
      const timestampStr = timestamp.toISOString().replace(/[:.]/g, "-");

      const file = response.result.entries.find(
        (entry) => entry.name.includes(timestampStr)
      );

      if (file) {
        await this.dbx.filesDeleteV2({ path: file.path_lower });
        this.log(`Deleted workout: ${file.name}`, "success");
        return true;
      } else {
        this.log("Workout file not found in Dropbox", "error");
        return false;
      }
    } catch (error) {
      this.log(`Failed to delete workout: ${error.message}`, "error");
      throw error;
    }
  }

  // Export all workouts as a single CSV file
  async exportAllWorkoutsCSV(workouts, unitLabel = "kg") {
    if (!this.isConnected) {
      throw new Error("Not connected to Dropbox");
    }

    try {
      // Build CSV content
      let csv = `Workout Date,Mode,Weight (${unitLabel}),Reps,Set Name,Set Number,Duration (seconds)\n`;

      for (const workout of workouts) {
        const date = (workout.timestamp || workout.endTime || new Date()).toISOString();
        const mode = workout.mode || "Unknown";
        const weight = workout.weightKg || 0;
        const reps = workout.reps || 0;
        const setName = workout.setName || "";
        const setNumber = workout.setNumber ? `${workout.setNumber}/${workout.setTotal || "?"}` : "";

        // Calculate duration
        let duration = "";
        if (workout.startTime && workout.endTime) {
          const durationMs = new Date(workout.endTime).getTime() - new Date(workout.startTime).getTime();
          duration = Math.round(durationMs / 1000);
        }

        csv += `${date},"${mode}",${weight},${reps},"${setName}","${setNumber}",${duration}\n`;
      }

      // Upload to Dropbox
      const filename = `workout_history_${new Date().toISOString().split("T")[0]}.csv`;
      await this.dbx.filesUpload({
        path: `/${filename}`,
        contents: csv,
        mode: { ".tag": "overwrite" },
      });

      this.log(`Exported ${workouts.length} workouts to ${filename}`, "success");
      return true;
    } catch (error) {
      this.log(`Failed to export CSV: ${error.message}`, "error");
      throw error;
    }
  }

  // PKCE helper: Generate code verifier
  generateCodeVerifier() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return this.base64URLEncode(array);
  }

  // PKCE helper: Generate code challenge from verifier
  async generateCodeChallenge(verifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return this.base64URLEncode(new Uint8Array(hash));
  }

  // PKCE helper: Base64 URL encode
  base64URLEncode(buffer) {
    const base64 = btoa(String.fromCharCode(...buffer));
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }

  // Token storage helpers
  storeToken(token) {
    localStorage.setItem("vitruvian.dropbox.token", token);
  }

  getStoredToken() {
    return localStorage.getItem("vitruvian.dropbox.token");
  }

  clearStoredToken() {
    localStorage.removeItem("vitruvian.dropbox.token");
  }

  // Notify listeners of connection state change
  notifyConnectionChange() {
    if (this.onConnectionChange) {
      this.onConnectionChange(this.isConnected);
    }
  }

  // Get connection status
  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      hasToken: !!this.getStoredToken(),
    };
  }
}
