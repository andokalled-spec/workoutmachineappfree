// app.js - Main application logic and UI management

const LB_PER_KG = 2.2046226218488;
const KG_PER_LB = 1 / LB_PER_KG;

class VitruvianApp {
  constructor() {
    this.device = new VitruvianDevice();
    this.chartManager = new ChartManager("loadGraph");
    this.maxPos = 1000; // Shared max for both cables (keeps bars comparable)
    this.weightUnit = "kg"; // Display unit for weights (default)
    this.stopAtTop = false; // Stop at top of final rep instead of bottom
    this.warmupReps = 0;
    this.workingReps = 0;
    this.warmupTarget = 3; // Default warmup target
    this.targetReps = 0; // Target working reps
    this.workoutHistory = []; // Track completed workouts
    this.currentWorkout = null; // Current workout info
    this.topPositionsA = []; // Rolling window of top positions for cable A
    this.bottomPositionsA = []; // Rolling window of bottom positions for cable A
    this.topPositionsB = []; // Rolling window of top positions for cable B
    this.bottomPositionsB = []; // Rolling window of bottom positions for cable B
    this.minRepPosA = null; // Discovered minimum position for cable A (rolling avg)
    this.maxRepPosA = null; // Discovered maximum position for cable A (rolling avg)
    this.minRepPosB = null; // Discovered minimum position for cable B (rolling avg)
    this.maxRepPosB = null; // Discovered maximum position for cable B (rolling avg)
    this.minRepPosARange = null; // Min/max uncertainty for cable A bottom
    this.maxRepPosARange = null; // Min/max uncertainty for cable A top
    this.minRepPosBRange = null; // Min/max uncertainty for cable B bottom
    this.maxRepPosBRange = null; // Min/max uncertainty for cable B top
    this.currentSample = null; // Latest monitor sample
    this.autoStopStartTime = null; // When we entered the auto-stop danger zone
    this.isJustLiftMode = false; // Flag for Just Lift mode with auto-stop
    this.lastTopCounter = undefined; // Track u16[1] for top detection
    this.setupLogging();
    this.setupChart();
    this.setupUnitControls();
    this.resetRepCountersToEmpty();
    this.updateStopButtonState();
	
    this.planItems = [];        // array of {type: 'exercise'|'echo', fields...}
    this.planActive = false;    // true when plan runner is active
    this.planCursor = { index: 0, set: 1 }; // current item & set counter
    this.planRestTimer = null;  // rest countdown handle
    this.planOnWorkoutComplete = null; // hook assigned while plan is running

    // initialize plan UI dropdown from storage
    setTimeout(() => {
      this.populatePlanSelect();
      this.renderPlanUI();
    }, 0);


  }

  setupLogging() {
    // Connect device logging to UI
    this.device.onLog = (message, type) => {
      this.addLogEntry(message, type);
    };
  }

  setupChart() {
    // Initialize chart and connect logging
    this.chartManager.init();
    this.chartManager.onLog = (message, type) => {
      this.addLogEntry(message, type);
    };
    this.applyUnitToChart();
  }

  setupUnitControls() {
    const unitSelector = document.getElementById("unitSelector");
    if (!unitSelector) {
      return;
    }

    const storedUnit = this.loadStoredWeightUnit();
    unitSelector.value = storedUnit;
    unitSelector.addEventListener("change", (event) => {
      this.setWeightUnit(event.target.value);
    });

    if (storedUnit !== this.weightUnit) {
      this.setWeightUnit(storedUnit, { previousUnit: this.weightUnit });
    } else {
      this.onUnitChanged();
    }
  }

  setWeightUnit(unit, options = {}) {
    if (unit !== "kg" && unit !== "lb") {
      return;
    }

    const previousUnit = options.previousUnit || this.weightUnit;

    if (unit === this.weightUnit && !options.force) {
      return;
    }

    const weightInput = document.getElementById("weight");
    const progressionInput = document.getElementById("progression");

    const currentWeight = weightInput ? parseFloat(weightInput.value) : NaN;
    const currentProgression = progressionInput
      ? parseFloat(progressionInput.value)
      : NaN;

    const weightKg = !isNaN(currentWeight)
      ? this.convertDisplayToKg(currentWeight, previousUnit)
      : null;
    const progressionKg = !isNaN(currentProgression)
      ? this.convertDisplayToKg(currentProgression, previousUnit)
      : null;

    this.weightUnit = unit;

    if (weightInput && weightKg !== null && !Number.isNaN(weightKg)) {
      weightInput.value = this.formatWeightValue(
        weightKg,
        this.getWeightInputDecimals(),
      );
    }

    if (
      progressionInput &&
      progressionKg !== null &&
      !Number.isNaN(progressionKg)
    ) {
      progressionInput.value = this.formatWeightValue(
        progressionKg,
        this.getProgressionInputDecimals(),
      );
    }

    this.onUnitChanged();
    this.saveWeightUnitPreference();
  }

  onUnitChanged() {
    const unitSelector = document.getElementById("unitSelector");
    if (unitSelector && unitSelector.value !== this.weightUnit) {
      unitSelector.value = this.weightUnit;
    }

    const weightLabel = document.getElementById("weightLabel");
    if (weightLabel) {
      weightLabel.textContent = `Weight per cable (${this.getUnitLabel()}):`;
    }

    const progressionLabel = document.getElementById("progressionLabel");
    if (progressionLabel) {
      progressionLabel.textContent = `Progression/Regression (${this.getUnitLabel()} per rep):`;
    }

    const progressionHint = document.getElementById("progressionHint");
    if (progressionHint) {
      progressionHint.textContent = this.getProgressionRangeText();
    }

    this.updateInputsForUnit();
    this.renderLoadDisplays(this.currentSample);
    this.updateHistoryDisplay();
    this.applyUnitToChart();
  }

  getUnitLabel() {
    return this.weightUnit === "lb" ? "lb" : "kg";
  }

  getLoadDisplayDecimals() {
    return this.weightUnit === "lb" ? 1 : 1;
  }

  getWeightInputDecimals() {
    return this.weightUnit === "lb" ? 1 : 1;
  }

  getProgressionInputDecimals() {
    return this.weightUnit === "lb" ? 1 : 1;
  }

  convertKgToDisplay(kg, unit = this.weightUnit) {
    if (kg === null || kg === undefined || isNaN(kg)) {
      return NaN;
    }

    if (unit === "lb") {
      return kg * LB_PER_KG;
    }

    return kg;
  }

  convertDisplayToKg(value, unit = this.weightUnit) {
    if (value === null || value === undefined || isNaN(value)) {
      return NaN;
    }

    if (unit === "lb") {
      return value * KG_PER_LB;
    }

    return value;
  }

  formatWeightValue(kg, decimals = this.getLoadDisplayDecimals()) {
    if (kg === null || kg === undefined || isNaN(kg)) {
      return "";
    }

    const displayValue = this.convertKgToDisplay(kg);
    return displayValue.toFixed(decimals);
  }

  formatWeightWithUnit(kg, decimals = this.getLoadDisplayDecimals()) {
    const value = this.formatWeightValue(kg, decimals);
    if (!value) {
      return value;
    }
    return `${value} ${this.getUnitLabel()}`;
  }

  updateInputsForUnit() {
    const weightInput = document.getElementById("weight");
    if (weightInput) {
      const minDisplay = this.convertKgToDisplay(0);
      const maxDisplay = this.convertKgToDisplay(100);
      weightInput.min = minDisplay.toFixed(this.getWeightInputDecimals());
      weightInput.max = maxDisplay.toFixed(this.getWeightInputDecimals());
      weightInput.step = this.weightUnit === "lb" ? 1 : 0.5;
    }

    const progressionInput = document.getElementById("progression");
    if (progressionInput) {
      const maxDisplay = this.convertKgToDisplay(3);
      progressionInput.min = (-maxDisplay).toFixed(
        this.getProgressionInputDecimals(),
      );
      progressionInput.max = maxDisplay.toFixed(
        this.getProgressionInputDecimals(),
      );
      progressionInput.step = this.weightUnit === "lb" ? 0.2 : 0.1;
    }
  }

  getWeightRangeText() {
    const min = this.convertKgToDisplay(0);
    const max = this.convertKgToDisplay(100);
    return `${min.toFixed(this.getWeightInputDecimals())}-${max.toFixed(this.getWeightInputDecimals())} ${this.getUnitLabel()}`;
  }

  getProgressionRangeText() {
    const maxDisplay = this.convertKgToDisplay(3);
    const decimals = this.getProgressionInputDecimals();
    const formatted = maxDisplay.toFixed(decimals);
    return `+${formatted} to -${formatted} ${this.getUnitLabel()}`;
  }

  loadStoredWeightUnit() {
    if (typeof window === "undefined" || !window.localStorage) {
      return "kg";
    }
    try {
      const stored = localStorage.getItem("vitruvian.weightUnit");
      if (stored === "lb") {
        return "lb";
      }
    } catch (error) {
      // Ignore storage errors and fall back to default.
    }
    return "kg";
  }

  saveWeightUnitPreference() {
    if (typeof window === "undefined" || !window.localStorage) {
      return;
    }
    try {
      localStorage.setItem("vitruvian.weightUnit", this.weightUnit);
    } catch (error) {
      // Ignore storage errors (e.g., private browsing).
    }
  }

  renderLoadDisplays(sample) {
    const decimals = this.getLoadDisplayDecimals();
    const unitLabel = this.getUnitLabel();

    const safeSample = sample || {
      loadA: 0,
      loadB: 0,
    };

    const formatLoad = (kg) => {
      if (kg === null || kg === undefined || isNaN(kg)) {
        return `- <span class="stat-unit">${unitLabel}</span>`;
      }
      const value = this.convertKgToDisplay(kg).toFixed(decimals);
      return `${value} <span class="stat-unit">${unitLabel}</span>`;
    };

    const loadAEl = document.getElementById("loadA");
    if (loadAEl) {
      loadAEl.innerHTML = formatLoad(safeSample.loadA);
    }

    const loadBEl = document.getElementById("loadB");
    if (loadBEl) {
      loadBEl.innerHTML = formatLoad(safeSample.loadB);
    }

    const totalEl = document.getElementById("totalLoad");
    if (totalEl) {
      const totalKg = (safeSample.loadA || 0) + (safeSample.loadB || 0);
      totalEl.innerHTML = formatLoad(totalKg);
    }
  }

  applyUnitToChart() {
    if (!this.chartManager) {
      return;
    }

    const unitLabel = this.getUnitLabel();
    const decimals = this.getLoadDisplayDecimals();

    this.chartManager.setLoadUnit({
      label: unitLabel,
      decimals: decimals,
      toDisplay: (kg) => this.convertKgToDisplay(kg),
    });
  }

  addLogEntry(message, type = "info") {
    const logDiv = document.getElementById("log");
    const entry = document.createElement("div");
    entry.className = `log-line log-${type}`;
    entry.textContent = message;
    logDiv.appendChild(entry);

    // Auto-scroll to bottom
    logDiv.scrollTop = logDiv.scrollHeight;

    // Limit log entries to prevent memory issues
    const maxEntries = 500;
    while (logDiv.children.length > maxEntries) {
      logDiv.removeChild(logDiv.firstChild);
    }
  }

  updateStopButtonState() {
    const stopBtn = document.getElementById("stopBtn");
    if (!stopBtn) return;

    // Check if device is connected and there's an active workout
    const isConnected = this.device && this.device.isConnected;
    const hasActiveWorkout = this.currentWorkout !== null;

    // Grey out if disconnected OR no active workout
    if (!isConnected || !hasActiveWorkout) {
      stopBtn.style.opacity = "0.5";

      // Set tooltip based on the specific issue
      let tooltip = "";
      if (!isConnected && !hasActiveWorkout) {
        tooltip = "Device disconnected and no workout active, but you can still send a stop request if you think this is not right";
      } else if (!isConnected) {
        tooltip = "Device disconnected, but you can still send a stop request if you think this is not right";
      } else {
        tooltip = "No workout active, but you can still send a stop request if you think this is not right";
      }
      stopBtn.title = tooltip;
    } else {
      stopBtn.style.opacity = "1";
      stopBtn.title = "Stop the current workout";
    }
  }

  updateConnectionStatus(connected) {
    const statusDiv = document.getElementById("status");
    const connectBtn = document.getElementById("connectBtn");
    const disconnectBtn = document.getElementById("disconnectBtn");
    const programSection = document.getElementById("programSection");
    const echoSection = document.getElementById("echoSection");
    const colorSection = document.getElementById("colorSection");

    if (connected) {
      statusDiv.textContent = "Connected";
      statusDiv.className = "status connected";
      connectBtn.disabled = true;
      disconnectBtn.disabled = false;
  //KEEP PROGRAM HIDDEN    programSection.classList.remove("hidden");
  //KEEP ECHO HIDDEN    echoSection.classList.remove("hidden");
      colorSection.classList.remove("hidden");
    } else {
      statusDiv.textContent = "Disconnected";
      statusDiv.className = "status disconnected";
      connectBtn.disabled = false;
      disconnectBtn.disabled = true;
      programSection.classList.add("hidden");
      echoSection.classList.add("hidden");
      colorSection.classList.add("hidden");
    }

    this.updateStopButtonState();
  }

  updateLiveStats(sample) {
    // Store current sample for auto-stop checking
    this.currentSample = sample;

    // Update numeric displays
    this.renderLoadDisplays(sample);
    document.getElementById("ticks").textContent = sample.ticks;

    // Update position values
    document.getElementById("posAValue").textContent = sample.posA;
    document.getElementById("posBValue").textContent = sample.posB;

    // Auto-adjust max position (shared for both cables to keep bars comparable)
    const currentMax = Math.max(sample.posA, sample.posB);
    if (currentMax > this.maxPos) {
      this.maxPos = currentMax + 100;
    }

    // Update position bars with dynamic scaling
    const heightA = Math.min((sample.posA / this.maxPos) * 100, 100);
    const heightB = Math.min((sample.posB / this.maxPos) * 100, 100);

    document.getElementById("barA").style.height = heightA + "%";
    document.getElementById("barB").style.height = heightB + "%";

    // Update range indicators
    this.updateRangeIndicators();

    // Check auto-stop condition for Just Lift mode
    if (this.isJustLiftMode) {
      this.checkAutoStop(sample);
    }

    // Add data to chart
    this.chartManager.addData(sample);
  }

  // Delegate chart methods to ChartManager
  setTimeRange(seconds) {
    this.chartManager.setTimeRange(seconds);
  }





  exportData() {
    this.chartManager.exportCSV();
  }

  // Mobile sidebar toggle
  toggleSidebar() {
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("overlay");

    sidebar.classList.toggle("open");
    overlay.classList.toggle("show");
  }

  closeSidebar() {
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("overlay");

    sidebar.classList.remove("open");
    overlay.classList.remove("show");
  }

  // Toggle Just Lift mode UI
  toggleJustLiftMode() {
    const justLiftCheckbox = document.getElementById("justLiftCheckbox");
    const repsInput = document.getElementById("reps");
    const modeLabel = document.getElementById("modeLabel");

    if (justLiftCheckbox.checked) {
      // Just Lift mode enabled - disable reps input
      repsInput.disabled = true;
      repsInput.style.opacity = "0.5";
      modeLabel.textContent = "Base Mode (for resistance profile):";
    } else {
      // Regular mode - enable reps input
      repsInput.disabled = false;
      repsInput.style.opacity = "1";
      modeLabel.textContent = "Workout Mode:";
    }
  }

  // Toggle stop at top setting
  toggleStopAtTop() {
    const checkbox = document.getElementById("stopAtTopCheckbox");
    this.stopAtTop = checkbox.checked;
    this.addLogEntry(
      `Stop at top of final rep: ${this.stopAtTop ? "enabled" : "disabled"}`,
      "info",
    );
  }

  // Toggle Just Lift mode UI for Echo mode
  toggleEchoJustLiftMode() {
    const echoJustLiftCheckbox = document.getElementById(
      "echoJustLiftCheckbox",
    );
    const targetRepsInput = document.getElementById("targetReps");

    if (echoJustLiftCheckbox.checked) {
      // Just Lift mode enabled - disable reps input
      targetRepsInput.disabled = true;
      targetRepsInput.style.opacity = "0.5";
    } else {
      // Regular mode - enable reps input
      targetRepsInput.disabled = false;
      targetRepsInput.style.opacity = "1";
    }
  }

  updateRepCounters() {
    // Update warmup counter
    const warmupEl = document.getElementById("warmupCounter");
    if (warmupEl) {
      if (this.currentWorkout) {
        warmupEl.textContent = `${this.warmupReps}/${this.warmupTarget}`;
      } else {
        warmupEl.textContent = `-/3`;
      }
    }

    // Update working reps counter
    const workingEl = document.getElementById("workingCounter");
    if (workingEl) {
      if (this.currentWorkout) {
        if (this.targetReps > 0) {
          workingEl.textContent = `${this.workingReps}/${this.targetReps}`;
        } else {
          workingEl.textContent = `${this.workingReps}`;
        }
      } else {
        workingEl.textContent = `-/-`;
      }
    }
  }

  updateRangeIndicators() {
    // Update range indicators for cable A
    const rangeMinA = document.getElementById("rangeMinA");
    const rangeMaxA = document.getElementById("rangeMaxA");
    const rangeMinB = document.getElementById("rangeMinB");
    const rangeMaxB = document.getElementById("rangeMaxB");
    const rangeBandMinA = document.getElementById("rangeBandMinA");
    const rangeBandMaxA = document.getElementById("rangeBandMaxA");
    const rangeBandMinB = document.getElementById("rangeBandMinB");
    const rangeBandMaxB = document.getElementById("rangeBandMaxB");

    // Cable A
    if (this.minRepPosA !== null && this.maxRepPosA !== null) {
      // Calculate positions as percentage from bottom
      const minPctA = Math.min((this.minRepPosA / this.maxPos) * 100, 100);
      const maxPctA = Math.min((this.maxRepPosA / this.maxPos) * 100, 100);

      rangeMinA.style.bottom = minPctA + "%";
      rangeMaxA.style.bottom = maxPctA + "%";
      rangeMinA.classList.add("visible");
      rangeMaxA.classList.add("visible");

      // Update uncertainty bands
      if (this.minRepPosARange) {
        const minRangeMinPct = Math.min(
          (this.minRepPosARange.min / this.maxPos) * 100,
          100,
        );
        const minRangeMaxPct = Math.min(
          (this.minRepPosARange.max / this.maxPos) * 100,
          100,
        );
        const bandHeight = minRangeMaxPct - minRangeMinPct;

        rangeBandMinA.style.bottom = minRangeMinPct + "%";
        rangeBandMinA.style.height = bandHeight + "%";
        rangeBandMinA.classList.add("visible");
      }

      if (this.maxRepPosARange) {
        const maxRangeMinPct = Math.min(
          (this.maxRepPosARange.min / this.maxPos) * 100,
          100,
        );
        const maxRangeMaxPct = Math.min(
          (this.maxRepPosARange.max / this.maxPos) * 100,
          100,
        );
        const bandHeight = maxRangeMaxPct - maxRangeMinPct;

        rangeBandMaxA.style.bottom = maxRangeMinPct + "%";
        rangeBandMaxA.style.height = bandHeight + "%";
        rangeBandMaxA.classList.add("visible");
      }
    } else {
      rangeMinA.classList.remove("visible");
      rangeMaxA.classList.remove("visible");
      rangeBandMinA.classList.remove("visible");
      rangeBandMaxA.classList.remove("visible");
    }

    // Cable B
    if (this.minRepPosB !== null && this.maxRepPosB !== null) {
      // Calculate positions as percentage from bottom
      const minPctB = Math.min((this.minRepPosB / this.maxPos) * 100, 100);
      const maxPctB = Math.min((this.maxRepPosB / this.maxPos) * 100, 100);

      rangeMinB.style.bottom = minPctB + "%";
      rangeMaxB.style.bottom = maxPctB + "%";
      rangeMinB.classList.add("visible");
      rangeMaxB.classList.add("visible");

      // Update uncertainty bands
      if (this.minRepPosBRange) {
        const minRangeMinPct = Math.min(
          (this.minRepPosBRange.min / this.maxPos) * 100,
          100,
        );
        const minRangeMaxPct = Math.min(
          (this.minRepPosBRange.max / this.maxPos) * 100,
          100,
        );
        const bandHeight = minRangeMaxPct - minRangeMinPct;

        rangeBandMinB.style.bottom = minRangeMinPct + "%";
        rangeBandMinB.style.height = bandHeight + "%";
        rangeBandMinB.classList.add("visible");
      }

      if (this.maxRepPosBRange) {
        const maxRangeMinPct = Math.min(
          (this.maxRepPosBRange.min / this.maxPos) * 100,
          100,
        );
        const maxRangeMaxPct = Math.min(
          (this.maxRepPosBRange.max / this.maxPos) * 100,
          100,
        );
        const bandHeight = maxRangeMaxPct - maxRangeMinPct;

        rangeBandMaxB.style.bottom = maxRangeMinPct + "%";
        rangeBandMaxB.style.height = bandHeight + "%";
        rangeBandMaxB.classList.add("visible");
      }
    } else {
      rangeMinB.classList.remove("visible");
      rangeMaxB.classList.remove("visible");
      rangeBandMinB.classList.remove("visible");
      rangeBandMaxB.classList.remove("visible");
    }
  }

  resetRepCountersToEmpty() {
    this.warmupReps = 0;
    this.workingReps = 0;
    this.currentWorkout = null;
    this.topPositionsA = [];
    this.bottomPositionsA = [];
    this.topPositionsB = [];
    this.bottomPositionsB = [];
    this.minRepPosA = null;
    this.maxRepPosA = null;
    this.minRepPosB = null;
    this.maxRepPosB = null;
    this.minRepPosARange = null;
    this.maxRepPosARange = null;
    this.minRepPosBRange = null;
    this.maxRepPosBRange = null;
    this.autoStopStartTime = null;
    this.isJustLiftMode = false;
    this.lastTopCounter = undefined;
    this.updateRepCounters();

    // Hide auto-stop timer
    const autoStopTimer = document.getElementById("autoStopTimer");
    if (autoStopTimer) {
      autoStopTimer.style.display = "none";
    }
    this.updateAutoStopUI(0);
    this.updateStopButtonState();
  }

  addToWorkoutHistory(workout) {
    this.workoutHistory.unshift(workout); // Add to beginning
    this.updateHistoryDisplay();
  }

  viewWorkoutOnGraph(index) {
    if (index < 0 || index >= this.workoutHistory.length) {
      this.addLogEntry("Invalid workout index", "error");
      return;
    }

    const workout = this.workoutHistory[index];
    this.chartManager.viewWorkout(workout);
  }

  updateHistoryDisplay() {
    const historyList = document.getElementById("historyList");
    if (!historyList) return;

    if (this.workoutHistory.length === 0) {
      historyList.innerHTML = `
        <div style="color: #6c757d; font-size: 0.9em; text-align: center; padding: 20px;">
          No workouts completed yet
        </div>
      `;
      return;
    }

    historyList.innerHTML = this.workoutHistory
      .map((workout, index) => {
        const weightStr =
          workout.weightKg > 0
            ? `${this.formatWeightWithUnit(workout.weightKg)}`
            : "Adaptive";
        const hasTimingData = workout.startTime && workout.endTime;
        const viewButtonHtml = hasTimingData
          ? `<button class="view-graph-btn" onclick="app.viewWorkoutOnGraph(${index})" title="View this workout on the graph">📊 View Graph</button>`
          : "";
return `
  <div class="history-item">
    <div class="history-item-title">
      ${workout.setName ? `${workout.setName}` : "Unnamed Set"}
      ${workout.mode ? ` — ${workout.mode}` : ""}
      ${workout.setNumber && workout.setTotal ? ` (Set ${workout.setNumber}/${workout.setTotal})` : ""}
    </div>
    <div class="history-item-details">
      ${weightStr} • ${workout.reps} reps
    </div>
    ${viewButtonHtml}
  </div>    `;
      })
      .join("");
  }

 completeWorkout() {

const setLabel = document.getElementById("currentSetName");
if (setLabel) setLabel.textContent = "";

  if (this.currentWorkout) {
    // stop polling to avoid queue buildup
    this.device.stopPropertyPolling();
    this.device.stopMonitorPolling();

    const endTime = new Date();
    this.currentWorkout.endTime = endTime;

    this.addToWorkoutHistory({
      mode: this.currentWorkout.mode,
      weightKg: this.currentWorkout.weightKg,
      reps: this.workingReps,
      timestamp: endTime,
      startTime: this.currentWorkout.startTime,
      warmupEndTime: this.currentWorkout.warmupEndTime,
      endTime,

  setName: this.currentWorkout.setName || null,
  setNumber: this.currentWorkout.setNumber ?? null,
  setTotal: this.currentWorkout.setTotal ?? null,
  itemType: this.currentWorkout.itemType || null,


    });

    this.resetRepCountersToEmpty();
    this.addLogEntry("Workout completed and saved to history", "success");
  }

  // 👉 hand control back to the plan runner so it can show the rest overlay
  try {
    if (this.planActive && typeof this.planOnWorkoutComplete === "function") {
      this.addLogEntry("Plan: completeWorkout() fired", "info");
      this.planOnWorkoutComplete();
    }
  } catch (e) {
    /* no-op */
  }
}


  // Get dynamic window size based on workout phase
  getWindowSize() {
    // During warmup: use last 2 samples
    // During working reps: use last 3 samples
    const totalReps = this.warmupReps + this.workingReps;
    return totalReps < this.warmupTarget ? 2 : 3;
  }

  // Record top position (when u16[0] increments)
  recordTopPosition(posA, posB) {
    // Add to rolling window
    this.topPositionsA.push(posA);
    this.topPositionsB.push(posB);

    // Keep only last N samples based on workout phase
    const windowSize = this.getWindowSize();
    if (this.topPositionsA.length > windowSize) {
      this.topPositionsA.shift();
    }
    if (this.topPositionsB.length > windowSize) {
      this.topPositionsB.shift();
    }

    // Update max positions using rolling average
    this.updateRepRanges();
  }

  // Record bottom position (when u16[2] increments - rep complete)
  recordBottomPosition(posA, posB) {
    // Add to rolling window
    this.bottomPositionsA.push(posA);
    this.bottomPositionsB.push(posB);

    // Keep only last N samples based on workout phase
    const windowSize = this.getWindowSize();
    if (this.bottomPositionsA.length > windowSize) {
      this.bottomPositionsA.shift();
    }
    if (this.bottomPositionsB.length > windowSize) {
      this.bottomPositionsB.shift();
    }

    // Update min positions using rolling average
    this.updateRepRanges();
  }

  // Calculate rolling average for an array
  calculateAverage(arr) {
    if (arr.length === 0) return null;
    const sum = arr.reduce((a, b) => a + b, 0);
    return Math.round(sum / arr.length);
  }

  // Calculate min/max range for uncertainty band
  calculateRange(arr) {
    if (arr.length === 0) return null;
    return {
      min: Math.min(...arr),
      max: Math.max(...arr),
    };
  }

  // Update min/max rep ranges from rolling averages
  updateRepRanges() {
    const oldMinA = this.minRepPosA;
    const oldMaxA = this.maxRepPosA;
    const oldMinB = this.minRepPosB;
    const oldMaxB = this.maxRepPosB;

    // Calculate averages for each position type
    this.maxRepPosA = this.calculateAverage(this.topPositionsA);
    this.minRepPosA = this.calculateAverage(this.bottomPositionsA);
    this.maxRepPosB = this.calculateAverage(this.topPositionsB);
    this.minRepPosB = this.calculateAverage(this.bottomPositionsB);

    // Calculate uncertainty ranges
    this.maxRepPosARange = this.calculateRange(this.topPositionsA);
    this.minRepPosARange = this.calculateRange(this.bottomPositionsA);
    this.maxRepPosBRange = this.calculateRange(this.topPositionsB);
    this.minRepPosBRange = this.calculateRange(this.bottomPositionsB);

    // Log if range changed significantly (> 5 units)
    const rangeChanged =
      (oldMinA !== null && Math.abs(this.minRepPosA - oldMinA) > 5) ||
      (oldMaxA !== null && Math.abs(this.maxRepPosA - oldMaxA) > 5) ||
      (oldMinB !== null && Math.abs(this.minRepPosB - oldMinB) > 5) ||
      (oldMaxB !== null && Math.abs(this.maxRepPosB - oldMaxB) > 5);

    if (rangeChanged || oldMinA === null) {
      const rangeA =
        this.maxRepPosA && this.minRepPosA
          ? this.maxRepPosA - this.minRepPosA
          : 0;
      const rangeB =
        this.maxRepPosB && this.minRepPosB
          ? this.maxRepPosB - this.minRepPosB
          : 0;

      this.addLogEntry(
        `Rep range updated: A[${this.minRepPosA || "?"}-${this.maxRepPosA || "?"}] (${rangeA}), B[${this.minRepPosB || "?"}-${this.maxRepPosB || "?"}] (${rangeB})`,
        "info",
      );
    }
  }

  // Check if we should auto-stop (for Just Lift mode)
  checkAutoStop(sample) {
    // Need at least one cable to have established a range
    if (!this.minRepPosA && !this.minRepPosB) {
      this.updateAutoStopUI(0);
      return;
    }

    const rangeA = this.maxRepPosA - this.minRepPosA;
    const rangeB = this.maxRepPosB - this.minRepPosB;

    // Only check cables that have a meaningful range (> 50 units of movement)
    const minRangeThreshold = 50;
    const checkCableA = rangeA > minRangeThreshold;
    const checkCableB = rangeB > minRangeThreshold;

    // If neither cable has moved significantly, can't auto-stop yet
    if (!checkCableA && !checkCableB) {
      this.updateAutoStopUI(0);
      return;
    }

    let inDangerZone = false;

    // Check cable A if it has meaningful range
    if (checkCableA) {
      const thresholdA = this.minRepPosA + rangeA * 0.05;
      if (sample.posA <= thresholdA) {
        inDangerZone = true;
      }
    }

    // Check cable B if it has meaningful range
    if (checkCableB) {
      const thresholdB = this.minRepPosB + rangeB * 0.05;
      if (sample.posB <= thresholdB) {
        inDangerZone = true;
      }
    }

    if (inDangerZone) {
      if (this.autoStopStartTime === null) {
        // Entered danger zone
        this.autoStopStartTime = Date.now();
        this.addLogEntry(
          "Near bottom of range, starting auto-stop timer (5s)...",
          "info",
        );
      }

      // Calculate elapsed time and update UI
      const elapsed = (Date.now() - this.autoStopStartTime) / 1000;
      const progress = Math.min(elapsed / 5.0, 1.0); // 0 to 1 over 5 seconds
      this.updateAutoStopUI(progress);

      if (elapsed >= 5.0) {
        this.addLogEntry(
          "Auto-stop triggered! Finishing workout...",
          "success",
        );
        this.stopWorkout();
      }
    } else {
      // Reset timer if we left the danger zone
      if (this.autoStopStartTime !== null) {
        this.addLogEntry("Moved out of danger zone, timer reset", "info");
        this.autoStopStartTime = null;
      }
      this.updateAutoStopUI(0);
    }
  }

  // Update the auto-stop timer UI
  updateAutoStopUI(progress) {
    const progressCircle = document.getElementById("autoStopProgress");
    const autoStopText = document.getElementById("autoStopText");

    if (!progressCircle || !autoStopText) return;

    // Circle circumference is ~220 (2 * PI * radius where radius = 35)
    const circumference = 220;
    const offset = circumference - progress * circumference;

    progressCircle.style.strokeDashoffset = offset;

    // Update text based on progress
    if (progress > 0) {
      const timeLeft = Math.ceil((1 - progress) * 5);
      autoStopText.textContent = `${timeLeft}s`;
      autoStopText.style.color = "#dc3545";
      autoStopText.style.fontSize = "1.5em";
    } else {
      autoStopText.textContent = "Auto-Stop";
      autoStopText.style.color = "#6c757d";
      autoStopText.style.fontSize = "0.75em";
    }
  }

  handleRepNotification(data) {
    // Parse rep notification
    if (data.length < 6) {
      return; // Not enough data
    }

    // Parse as u16 array
    const numU16 = data.length / 2;
    const u16Values = [];
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    for (let i = 0; i < numU16; i++) {
      u16Values.push(view.getUint16(i * 2, true));
    }

    if (u16Values.length < 3) {
      return; // Need at least u16[0], u16[1], u16[2]
    }

    const topCounter = u16Values[0]; // Reached top of range
    const completeCounter = u16Values[2]; // Rep complete (bottom)

    // Log counters for debugging
    this.addLogEntry(
      `Rep notification: top=${topCounter}, complete=${completeCounter}, pos=[${this.currentSample?.posA || "?"}, ${this.currentSample?.posB || "?"}]`,
      "info",
    );

    // Only process if we have a current sample and active workout
    if (!this.currentSample || !this.currentWorkout) {
      return;
    }

    // Track top of range (u16[1])
    if (this.lastTopCounter === undefined) {
      this.lastTopCounter = topCounter;
    } else {
      // Check if top counter incremented
      let topDelta = 0;
      if (topCounter >= this.lastTopCounter) {
        topDelta = topCounter - this.lastTopCounter;
      } else {
        // Handle wrap-around
        topDelta = 0xffff - this.lastTopCounter + topCounter + 1;
      }

      if (topDelta > 0) {
        // Reached top of range!
        this.addLogEntry(
          `TOP detected! Counter: ${this.lastTopCounter} -> ${topCounter}, pos=[${this.currentSample.posA}, ${this.currentSample.posB}]`,
          "success",
        );
        this.recordTopPosition(
          this.currentSample.posA,
          this.currentSample.posB,
        );
        this.lastTopCounter = topCounter;

        // Check if we should complete at top of final rep
        if (
          this.stopAtTop &&
          !this.isJustLiftMode &&
          this.targetReps > 0 &&
          this.workingReps === this.targetReps - 1
        ) {
          // We're at targetReps - 1, and just reached top
          // This is the top of the final rep, complete now
          this.addLogEntry(
            "Reached top of final rep! Auto-completing workout...",
            "success",
          );
          this.stopWorkout(); // Must be explicitly stopped as the machine thinks the set isn't finished until the bottom of the final rep.
        }
      }
    }

    // Track rep complete / bottom of range (u16[2])
    if (this.lastRepCounter === undefined) {
      this.lastRepCounter = completeCounter;
      return;
    }

    // Check if counter incremented
    let delta = 0;
    if (completeCounter >= this.lastRepCounter) {
      delta = completeCounter - this.lastRepCounter;
    } else {
      // Handle wrap-around
      delta = 0xffff - this.lastRepCounter + completeCounter + 1;
    }

    if (delta > 0) {
      // Rep completed! Record bottom position
      this.addLogEntry(
        `BOTTOM detected! Counter: ${this.lastRepCounter} -> ${completeCounter}, pos=[${this.currentSample.posA}, ${this.currentSample.posB}]`,
        "success",
      );
      this.recordBottomPosition(
        this.currentSample.posA,
        this.currentSample.posB,
      );

      const totalReps = this.warmupReps + this.workingReps + 1;

      if (totalReps <= this.warmupTarget) {
        // Still in warmup
        this.warmupReps++;
        this.addLogEntry(
          `Warmup rep ${this.warmupReps}/${this.warmupTarget} complete`,
          "success",
        );

        // Record when warmup ends (last warmup rep complete)
        if (this.warmupReps === this.warmupTarget && this.currentWorkout && !this.currentWorkout.warmupEndTime) {
          this.currentWorkout.warmupEndTime = new Date();
        }
      } else {
        // Working reps
        this.workingReps++;

        if (this.targetReps > 0) {
          this.addLogEntry(
            `Working rep ${this.workingReps}/${this.targetReps} complete`,
            "success",
          );
        } else {
          this.addLogEntry(
            `Working rep ${this.workingReps} complete`,
            "success",
          );
        }

        // Auto-complete workout when target reps are reached (but not for Just Lift)
        // Only applies when stopAtTop is disabled
        if (
          !this.stopAtTop &&
          !this.isJustLiftMode &&
          this.targetReps > 0 &&
          this.workingReps >= this.targetReps
        ) {
          // Complete immediately at bottom (default behavior)
          this.addLogEntry(
            "Target reps reached! Auto-completing workout...",
            "success",
          );
          this.completeWorkout();
        }
      }

      this.updateRepCounters();
    }

    this.lastRepCounter = completeCounter;
  }

  async connect() {
    try {
      // Check if Web Bluetooth is supported
      if (!navigator.bluetooth) {
        alert(
          "Web Bluetooth is not supported in this browser. Please use Chrome, Edge, or Opera.",
        );
        return;
      }

      await this.device.connect();
      this.updateConnectionStatus(true);

      // Send initialization sequence
      await this.device.sendInit();
    } catch (error) {
      console.error("Connection error:", error);
      this.addLogEntry(`Connection failed: ${error.message}`, "error");
      this.updateConnectionStatus(false);
    }
  }

  async disconnect() {
    try {
      await this.device.disconnect();
      this.updateConnectionStatus(false);
    } catch (error) {
      console.error("Disconnect error:", error);
      this.addLogEntry(`Disconnect failed: ${error.message}`, "error");
    }
  }

  async stopWorkout() {
    try {
      await this.device.sendStopCommand();
      this.addLogEntry("Workout stopped by user", "info");

      // Complete the workout and save to history
      this.completeWorkout();
    } catch (error) {
      console.error("Stop workout error:", error);
      this.addLogEntry(`Failed to stop workout: ${error.message}`, "error");
      alert(`Failed to stop workout: ${error.message}`);
    }
  }

  async startProgram() {
    try {
      const modeSelect = document.getElementById("mode");
      const weightInput = document.getElementById("weight");
      const repsInput = document.getElementById("reps");
      const justLiftCheckbox = document.getElementById("justLiftCheckbox");
      const progressionInput = document.getElementById("progression");

      const baseMode = parseInt(modeSelect.value);
      const perCableDisplay = parseFloat(weightInput.value);
      const isJustLift = justLiftCheckbox.checked;
      const reps = isJustLift ? 0 : parseInt(repsInput.value);
      const progressionDisplay = parseFloat(progressionInput.value);

      const perCableKg = this.convertDisplayToKg(perCableDisplay);
      const progressionKg = this.convertDisplayToKg(progressionDisplay);

      // Validate inputs
      if (
        isNaN(perCableDisplay) ||
        isNaN(perCableKg) ||
        perCableKg < 0 ||
        perCableKg > 100
      ) {
        alert(`Please enter a valid weight (${this.getWeightRangeText()})`);
        return;
      }

      if (!isJustLift && (isNaN(reps) || reps < 1 || reps > 100)) {
        alert("Please enter a valid number of reps (1-100)");
        return;
      }

      if (
        isNaN(progressionDisplay) ||
        isNaN(progressionKg) ||
        progressionKg < -3 ||
        progressionKg > 3
      ) {
        alert(
          `Please enter a valid progression (${this.getProgressionRangeText()})`,
        );
        return;
      }

      // Calculate effective weight (per_cable_kg + 10)
      const effectiveKg = perCableKg + 10.0;
      const effectiveDisplay = this.convertKgToDisplay(effectiveKg);

      const params = {
        mode: baseMode, // Not used directly, baseMode is used in protocol
        baseMode: baseMode,
        isJustLift: isJustLift,
        reps: reps,
        perCableKg: perCableKg,
        perCableDisplay: this.convertKgToDisplay(perCableKg),
        effectiveKg: effectiveKg,
        effectiveDisplay: effectiveDisplay,
        progressionKg: progressionKg,
        progressionDisplay: this.convertKgToDisplay(progressionKg),
        displayUnit: this.getUnitLabel(),
        sequenceID: 0x0b,
      };

      // Set rep targets before starting
      this.warmupTarget = 3; // Programs always use 3 warmup reps
      this.targetReps = reps;
      this.isJustLiftMode = isJustLift;
      this.lastRepCounter = undefined;
      this.lastTopCounter = undefined;

      // Reset workout state and set current workout info
      this.warmupReps = 0;
      this.workingReps = 0;
      const modeName = isJustLift
        ? `Just Lift (${ProgramModeNames[baseMode]})`
        : ProgramModeNames[baseMode];



const inPlan = this.planActive && this.planItems[this.planCursor.index];
const planItem = inPlan ? this.planItems[this.planCursor.index] : null;

      this.currentWorkout = {
        mode: modeName || "Program",
        weightKg: perCableKg,
        targetReps: reps,
        startTime: new Date(),
        warmupEndTime: null,
        endTime: null,

  // ⬇ NEW: plan metadata for history
  setName: planItem?.name || null,
  setNumber: inPlan ? this.planCursor.set : null,
  setTotal: planItem?.sets ?? null,
  itemType: planItem?.type || "exercise",

      };
      this.updateRepCounters();

      // Show auto-stop timer if Just Lift mode
      const autoStopTimer = document.getElementById("autoStopTimer");
      if (autoStopTimer) {
        autoStopTimer.style.display = isJustLift ? "block" : "none";
      }

      await this.device.startProgram(params);

      // Set up monitor listener
      this.device.addMonitorListener((sample) => {
        this.updateLiveStats(sample);
      });

      // Set up rep listener
      this.device.addRepListener((data) => {
        this.handleRepNotification(data);
      });

      // Update stop button state
      this.updateStopButtonState();

      // Close sidebar on mobile after starting
      this.closeSidebar();
} catch (error) {
      console.error("Start program error:", error);
      this.addLogEntry(`Failed to start program: ${error.message}`, "error");
      alert(`Failed to start program: ${error.message}`);
    }

// === Update current set name under "Live Workout Data" ===
const setLabel = document.getElementById("currentSetName");
if (setLabel) {
  // If a plan is active, show the current plan item's name; otherwise clear
  if (this.planActive && this.planItems[this.planCursor.index]) {
    const planItem = this.planItems[this.planCursor.index];
    setLabel.textContent = planItem.name || "Unnamed Set";
  } else {
    setLabel.textContent = "Live Set";
  }
}

  }

  async startEcho() {
    try {
      const levelSelect = document.getElementById("echoLevel");
      const eccentricInput = document.getElementById("eccentric");
      const targetInput = document.getElementById("targetReps");
      const echoJustLiftCheckbox = document.getElementById(
        "echoJustLiftCheckbox",
      );

      const level = parseInt(levelSelect.value) - 1; // Convert to 0-indexed
      const eccentricPct = parseInt(eccentricInput.value);
      const warmupReps = 3; // Hardcoded warmup reps for Echo mode
      const isJustLift = echoJustLiftCheckbox.checked;
      const targetReps = isJustLift ? 0 : parseInt(targetInput.value);

      // Validate inputs
      if (isNaN(eccentricPct) || eccentricPct < 0 || eccentricPct > 150) {
        alert("Please enter a valid eccentric percentage (0-150)");
        return;
      }

      if (
        !isJustLift &&
        (isNaN(targetReps) || targetReps < 0 || targetReps > 30)
      ) {
        alert("Please enter valid target reps (0-30)");
        return;
      }

      const params = {
        level: level,
        eccentricPct: eccentricPct,
        warmupReps: warmupReps,
        targetReps: targetReps,
        isJustLift: isJustLift,
        sequenceID: 0x01,
      };

      // Set rep targets before starting
      this.warmupTarget = 3; // Always 3 for Echo mode
      this.targetReps = targetReps;
      this.isJustLiftMode = isJustLift;
      this.lastRepCounter = undefined;
      this.lastTopCounter = undefined;

      // Reset workout state and set current workout info
      this.warmupReps = 0;
      this.workingReps = 0;
      const modeName = isJustLift
        ? `Just Lift Echo ${EchoLevelNames[level]}`
        : `Echo ${EchoLevelNames[level]}`;
      
const inPlan = this.planActive && this.planItems[this.planCursor.index];
const planItem = inPlan ? this.planItems[this.planCursor.index] : null;

this.currentWorkout = {
        mode: modeName,
        weightKg: 0, // Echo mode doesn't have fixed weight
        targetReps: targetReps,
        startTime: new Date(),
        warmupEndTime: null,
        endTime: null,

  setName: planItem?.name || null,
  setNumber: inPlan ? this.planCursor.set : null,
  setTotal: planItem?.sets ?? null,
  itemType: planItem?.type || "echo",

      };
      this.updateRepCounters();

      // Show auto-stop timer if Just Lift mode
      const autoStopTimer = document.getElementById("autoStopTimer");
      if (autoStopTimer) {
        autoStopTimer.style.display = isJustLift ? "block" : "none";
      }

      await this.device.startEcho(params);

      // Set up monitor listener
      this.device.addMonitorListener((sample) => {
        this.updateLiveStats(sample);
      });

      // Set up rep listener
      this.device.addRepListener((data) => {
        this.handleRepNotification(data);
      });

      // Update stop button state
      this.updateStopButtonState();

      // Close sidebar on mobile after starting
      this.closeSidebar();
    } catch (error) {
      console.error("Start Echo error:", error);
      this.addLogEntry(`Failed to start Echo mode: ${error.message}`, "error");
      alert(`Failed to start Echo mode: ${error.message}`);
    }

// === Update current set name under "Live Workout Data" ===
const setLabel = document.getElementById("currentSetName");
if (setLabel) {
  // If a plan is active, show the current plan item's name; otherwise clear
  if (this.planActive && this.planItems[this.planCursor.index]) {
    const planItem = this.planItems[this.planCursor.index];
    setLabel.textContent = planItem.name || "Unnamed Set";
  } else {
    setLabel.textContent = "Live Set";
  }
}

  }

  loadColorPreset() {
    const presetSelect = document.getElementById("colorPreset");
    const preset = presetSelect.value;

    if (!preset) {
      return; // Custom option selected
    }

    const scheme = PredefinedColorSchemes[preset];
    if (!scheme) {
      return;
    }

    // Update color pickers
    const colorToHex = (color) => {
      return (
        "#" +
        color.r.toString(16).padStart(2, "0") +
        color.g.toString(16).padStart(2, "0") +
        color.b.toString(16).padStart(2, "0")
      );
    };

    document.getElementById("color1").value = colorToHex(scheme.colors[0]);
    document.getElementById("color2").value = colorToHex(scheme.colors[1]);
    document.getElementById("color3").value = colorToHex(scheme.colors[2]);
  }


  /* =========================
     PLAN — DATA HELPERS
     ========================= */

  getUnitLabelShort() { return this.getUnitLabel(); } // alias for UI labels

  // Make an empty Exercise row
  makeExerciseRow() {
    return {
      type: "exercise",
      name: "Untitled Exercise",
      mode: ProgramMode.OLD_SCHOOL,        // numeric mode
      perCableKg: 10,                      // stored as kg
      reps: 10,
      sets: 3,
      restSec: 60,
      cables: 2,
      justLift: false,
      stopAtTop: false,
      progressionKg: 0,                    // reuse progression logic if desired
    };
  }

  // Make an empty Echo row
  makeEchoRow() {
    return {
      type: "echo",
      name: "Echo Block",
      level: EchoLevel.HARD,  // numeric 0..3
      eccentricPct: 100,
      targetReps: 2,
      sets: 3,
      restSec: 60,
      justLift: false,
      stopAtTop: false,
    };
  }



// --- Audio helpers (countdown / tiny beeps) ---
_initAudio() {
  if (this._audioCtx) return;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) {
    this.addLogEntry("WebAudio not supported; beeps disabled.", "warning");
    return;
  }
  this._audioCtx = new AudioCtx();
}

// frequency (Hz), duration (ms), volume (0..1)
_beep(f = 880, ms = 120, vol = 0.2) {
  if (!this._audioCtx) this._initAudio();
  if (!this._audioCtx) return;

  const ctx = this._audioCtx;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.value = f;
  gain.gain.setValueAtTime(vol, ctx.currentTime);

  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + ms / 1000);
}





// Apply a plan item to the visible sidebar UI (Program or Echo)
// Also sets the global Stop-at-Top checkbox to match the item's setting.
_applyItemToUI(item){
  if (!item) return;

  // Stop at Top (primary/global)
  const sat = document.getElementById("stopAtTopCheckbox");
  if (sat) {
    sat.checked = !!item.stopAtTop;
    this.stopAtTop = !!item.stopAtTop;           // keep runtime flag in sync
  }

  if (item.type === "exercise") {
    // Program Mode fields
    const modeSel   = document.getElementById("mode");
    const weightInp = document.getElementById("weight");
    const repsInp   = document.getElementById("reps");
    const progInp   = document.getElementById("progression");
    const jlChk     = document.getElementById("justLiftCheckbox");

    if (modeSel)   modeSel.value = String(item.mode);
    if (weightInp) weightInp.value = this.formatWeightValue(item.perCableKg, this.getWeightInputDecimals());
    if (repsInp)   repsInp.value = String(item.reps);
    if (progInp)   progInp.value = this.formatWeightValue(item.progressionKg, this.getProgressionInputDecimals());
    if (jlChk)     { jlChk.checked = !!item.justLift; this.toggleJustLiftMode(); }

  } else if (item.type === "echo") {
    // Echo Mode fields
    const levelSel  = document.getElementById("echoLevel");
    const eccInp    = document.getElementById("eccentric");
    const targInp   = document.getElementById("targetReps");
    const jlChkE    = document.getElementById("echoJustLiftCheckbox");

    // UI is 1..4 while internal is 0..3 in many builds—adjust if your UI expects 0..3, drop the +1
    if (levelSel) levelSel.value = String((item.level ?? 0) + 1);
    if (eccInp)   eccInp.value   = String(item.eccentricPct ?? 100);
    if (targInp)  targInp.value  = String(item.targetReps ?? 0);
    if (jlChkE)   { jlChkE.checked = !!item.justLift; this.toggleEchoJustLiftMode(); }
  }
}


  /* =========================
     PLAN — UI RENDER
     ========================= */

  renderPlanUI() {
    const container = document.getElementById("planItems");
    if (!container) return;

    const unit = this.getUnitLabelShort();

    const makeRow = (item, i) => {
      const card = document.createElement("div");
      card.style.background = "#f8f9fa";
      card.style.padding = "12px";
      card.style.borderRadius = "8px";
      card.style.borderLeft = "4px solid #667eea";

      const sectionTitle =
        item.type === "exercise"
          ? `Exercise`
          : `Echo Mode`;

      const title = document.createElement("div");
      title.style.display = "flex";
      title.style.justifyContent = "space-between";
      title.style.alignItems = "center";
      title.style.marginBottom = "10px";
      title.innerHTML = `
        <div style="font-weight:700; color:#212529">${sectionTitle}</div>
        <div style="display:flex; gap:8px;">
          <button class="secondary" style="width:auto; padding:6px 10px;" onclick="app.movePlanItem(${i}, -1)">Move Up</button>
          <button class="secondary" style="width:auto; padding:6px 10px;" onclick="app.movePlanItem(${i}, 1)">Move Down</button>
          <button class="secondary" style="width:auto; padding:6px 10px; background:#dc3545" onclick="app.removePlanItem(${i})">Delete</button>
        </div>
      `;
      card.appendChild(title);

      const grid = document.createElement("div");
      grid.style.display = "grid";
      grid.style.gridTemplateColumns = "1fr 1fr";
      grid.style.gap = "10px";

      // Common: Name, Sets, Rest, JL, StopAtTop
      const commonHtml = `
        <div class="form-group">
          <label>Name</label>
          <input type="text" value="${item.name || ""}" oninput="app.updatePlanField(${i}, 'name', this.value)" />
        </div>

        <div class="form-group">
          <label>Sets</label>
          <input type="number" min="1" max="99" value="${item.sets}" oninput="app.updatePlanField(${i}, 'sets', parseInt(this.value)||1)" />
        </div>

        <div class="form-group">
          <label>Rest (sec)</label>
          <input type="number" min="0" max="600" value="${item.restSec}" oninput="app.updatePlanField(${i}, 'restSec', parseInt(this.value)||0)" />
        </div>

        <div class="form-group" style="align-self:center">
          <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
            <input type="checkbox" ${item.justLift ? "checked" : ""} onchange="app.updatePlanField(${i}, 'justLift', this.checked)" style="width:auto;" />
            <span>Just lift mode</span>
          </label>
          <label style="display:flex; align-items:center; gap:8px; cursor:pointer; margin-top:6px;">
            <input type="checkbox" ${item.stopAtTop ? "checked" : ""} onchange="app.updatePlanField(${i}, 'stopAtTop', this.checked)" style="width:auto;" />
            <span>Stop at Top of final rep</span>
          </label>
        </div>
      `;

      if (item.type === "exercise") {
        const displayPerCable = this.formatWeightValue(item.perCableKg);
        const modeOptions = [
          [ProgramMode.OLD_SCHOOL, "Old School"],
          [ProgramMode.PUMP, "Pump"],
          [ProgramMode.TUT, "TUT"],
          [ProgramMode.TUT_BEAST, "TUT Beast"],
          [ProgramMode.ECCENTRIC_ONLY, "Eccentric Only"],
        ].map(([val, label]) => `<option value="${val}" ${item.mode===val?"selected":""}>${label}</option>`).join("");

        grid.innerHTML = `
          <div class="form-group">
            <label>Mode</label>
            <select onchange="app.updatePlanField(${i}, 'mode', parseInt(this.value))">
              ${modeOptions}
            </select>
          </div>

          <div class="form-group">
            <label>Weight per cable (${unit})</label>
            <input type="number" min="0" max="1000" step="${unit==='lb' ? 1 : 0.5}"
                   value="${this.convertKgToDisplay(item.perCableKg).toFixed(this.getWeightInputDecimals())}"
                   oninput="app.updatePlanPerCableDisplay(${i}, this.value)" />
          </div>

          <div class="form-group">
            <label>Reps</label>
            <input type="number" min="0" max="100" value="${item.reps}" oninput="app.updatePlanField(${i}, 'reps', parseInt(this.value)||0)" />
          </div>

          <div class="form-group">
            <label>Cables</label>
            <input type="number" min="1" max="2" value="${item.cables}" oninput="app.updatePlanField(${i}, 'cables', Math.min(2, Math.max(1, parseInt(this.value)||1)))" />
          </div>

          <div class="form-group">
            <label>Progression (${unit} per rep)</label>
            <input type="number"
                   step="${unit==='lb' ? 0.2 : 0.1}"
                   min="${this.convertKgToDisplay(-3)}"
                   max="${this.convertKgToDisplay(3)}"
                   value="${this.convertKgToDisplay(item.progressionKg).toFixed(this.getProgressionInputDecimals())}"
                   oninput="app.updatePlanProgressionDisplay(${i}, this.value)" />
          </div>

          ${commonHtml}
        `;
      } else {
        // echo
        const levelOptions = [
          [EchoLevel.HARD, "Hard"],
          [EchoLevel.HARDER, "Harder"],
          [EchoLevel.HARDEST, "Hardest"],
          [EchoLevel.EPIC, "Epic"],
        ].map(([val, label]) => `<option value="${val}" ${item.level===val?"selected":""}>${label}</option>`).join("");

        grid.innerHTML = `
          <div class="form-group">
            <label>Level</label>
            <select onchange="app.updatePlanField(${i}, 'level', parseInt(this.value))">
              ${levelOptions}
            </select>
          </div>

          <div class="form-group">
            <label>Eccentric %</label>
            <input type="number" min="0" max="150" step="5" value="${item.eccentricPct}" oninput="app.updatePlanField(${i}, 'eccentricPct', parseInt(this.value)||0)" />
          </div>

          <div class="form-group">
            <label>Target Reps</label>
            <input type="number" min="0" max="30" value="${item.targetReps}" oninput="app.updatePlanField(${i}, 'targetReps', parseInt(this.value)||0)" />
          </div>

          ${commonHtml}
        `;
      }

      card.appendChild(grid);
      return card;
    };

    container.innerHTML = "";
    if (this.planItems.length === 0) {
      const empty = document.createElement("div");
      empty.style.color = "#6c757d";
      empty.style.fontSize = "0.9em";
      empty.style.textAlign = "center";
      empty.style.padding = "10px";
      empty.textContent = "No items yet — add an Exercise or Echo Mode.";
      container.appendChild(empty);
    } else {
      this.planItems.forEach((it, idx) => container.appendChild(makeRow(it, idx)));
    }
  }

  /* =========================
     PLAN — UI ACTIONS
     ========================= */

  addPlanExercise() {
    this.planItems.push(this.makeExerciseRow());
    this.renderPlanUI();
  }

  addPlanEcho() {
    this.planItems.push(this.makeEchoRow());
    this.renderPlanUI();
  }

  resetPlanToDefaults() {
    this.planItems = [
      { ...this.makeExerciseRow(), name: "Back Squat", mode: ProgramMode.OLD_SCHOOL, perCableKg: 15, reps: 8, sets: 3, restSec: 90, stopAtTop: true },
      { ...this.makeEchoRow(),    name: "Echo Finishers", level: EchoLevel.HARDER, eccentricPct: 120, targetReps: 2, sets: 2, restSec: 60 },
    ];
    this.renderPlanUI();
  }

  removePlanItem(index) {
    this.planItems.splice(index, 1);
    this.renderPlanUI();
  }

  movePlanItem(index, delta) {
    const j = index + delta;
    if (j < 0 || j >= this.planItems.length) return;
    const [row] = this.planItems.splice(index, 1);
    this.planItems.splice(j, 0, row);
    this.renderPlanUI();
  }

  updatePlanField(index, key, value) {
    const it = this.planItems[index];
    if (!it) return;
    it[key] = value;
    // If user toggled stopAtTop on an item, nothing live to do yet; applied when running that item.
  }

  updatePlanPerCableDisplay(index, displayVal) {
    const kg = this.convertDisplayToKg(parseFloat(displayVal));
    if (isNaN(kg)) return;
    this.planItems[index].perCableKg = Math.max(0, kg);
  }

  updatePlanProgressionDisplay(index, displayVal) {
    const kg = this.convertDisplayToKg(parseFloat(displayVal));
    if (isNaN(kg)) return;
    this.planItems[index].progressionKg = Math.max(-3, Math.min(3, kg));
  }

startPlan(){
 
 // ✅ 1. Check device connection first
  if (!this.device || !this.device.isConnected) {
    // Add message in the console log panel
    this.addLogEntry("⚠️ Please connect your Vitruvian device before starting a plan.", "error");
    // Optional popup for visibility
    alert("Please connect your Vitruvian device before starting a plan.");
    return; // Stop execution
  }

 if (!this.planItems || this.planItems.length === 0){
    this.addLogEntry("No items in plan.", "warning");
    return;
  }

  this.planActive = true;
  this.planCursor = { index: 0, set: 1 };
  this.planOnWorkoutComplete = () => this._planAdvance();
  this.addLogEntry(`Starting plan with ${this.planItems.length} item(s)`, "success");

  // ⬇️ Prefill Program/Echo UI + Stop-at-Top & Just Lift for the first set
  this._applyItemToUI(this.planItems[0]);

  // If you auto-start, keep this; otherwise, remove the next line to let user review first:
  this._runCurrentPlanBlock();
}


// Run the currently selected plan block (exercise or echo)
// Uses the visible UI and calls startProgram()/startEcho() just like pressing the buttons.
async _runCurrentPlanBlock(){
  if (!this.planActive) return;

  const i = this.planCursor.index;
  const item = this.planItems[i];
  if (!item){ this._planFinish?.(); return; }

  // Prefill sidebar so startProgram/startEcho read the right values
  this._applyItemToUI?.(item);

  // Log what's about to run
  const label = item.type === "exercise" ? "exercise" : "echo";
  this.addLogEntry(`Plan item ${i+1}/${this.planItems.length}, set ${this.planCursor.set}/${item.sets}: ${item.name || "Untitled " + (label[0].toUpperCase()+label.slice(1))}`, "info");

  try {
    // Respect per-item Stop-at-Top for this run
    const prevStopAtTop = this.stopAtTop;
    this.stopAtTop = !!item.stopAtTop;

    if (item.type === "exercise") {
      // Starts using values we just injected into Program Mode UI
      this.addLogEntry("Starting exercise — set " + this.planCursor.set + "/" + item.sets, "info");
      await this.startProgram();
    } else {
      // Starts using values we just injected into Echo Mode UI
      this.addLogEntry("Starting echo — set " + this.planCursor.set + "/" + item.sets, "info");
      await this.startEcho();
    }

    // restore global flag after we’ve kicked off the set
    this.stopAtTop = prevStopAtTop;
  } catch (e) {
    this.addLogEntry(`Failed to start plan block: ${e.message}`, "error");
    // fail-safe: try finishing the plan so we don't get stuck
    this._planFinish?.();
  }
}

// Decide next step after a block finishes: next set of same item, or next item.
// Schedules rest and then calls _runCurrentPlanBlock() again.
_planAdvance(){
  if (!this.planActive) return;

  const curIndex = this.planCursor.index;
  const item = this.planItems[curIndex];
  if (!item){ this._planFinish?.(); return; }

  // If more sets remain for this item → rest, then same item next set
  if (this.planCursor.set < item.sets) {
    this.planCursor.set += 1;

    // Build "Up next" preview text
    const unit = this.getUnitLabel();
    let nextHtml = "";
    if (item.type === "exercise"){
      const w = this.convertKgToDisplay(item.perCableKg).toFixed(this.getWeightInputDecimals());
      const modeName = ProgramModeNames?.[item.mode] || "Mode";
      nextHtml = `${modeName} • ${w} ${unit}/cable × ${item.cables ?? 2} • ${item.reps} reps`;
    } else {
      const lvl = EchoLevelNames?.[item.level] || "Level";
      nextHtml = `${lvl} • ecc ${item.eccentricPct}% • target ${item.targetReps} reps`;
    }

    // Prefill the UI for the upcoming set so startProgram/startEcho will read correct values
    this._applyItemToUI?.(item);

    // Rest → then run the same item again
    this.addLogEntry(`Rest ${item.restSec}s → then next set/item (_runCurrentPlanBlock)`, "info");
    this._beginRest
      ? this._beginRest(item.restSec, () => this._runCurrentPlanBlock(), `Next set (${this.planCursor.set}/${item.sets})`, nextHtml, item)
      : setTimeout(() => this._runCurrentPlanBlock(), Math.max(0, (item.restSec|0))*1000);
    return;
  }

  // Otherwise advance to next item
  this.planCursor.index += 1;
  this.planCursor.set = 1;

  if (this.planCursor.index >= this.planItems.length){
    // No more items
    this._planFinish?.();
    return;
  }

  const nextItem = this.planItems[this.planCursor.index];

  // Build "Up next" preview text
  const unit = this.getUnitLabel();
  let nextHtml = "";
  if (nextItem.type === "exercise"){
    const w = this.convertKgToDisplay(nextItem.perCableKg).toFixed(this.getWeightInputDecimals());
    const modeName = ProgramModeNames?.[nextItem.mode] || "Mode";
    nextHtml = `${modeName} • ${w} ${unit}/cable × ${nextItem.cables ?? 2} • ${nextItem.reps} reps`;
  } else {
    const lvl = EchoLevelNames?.[nextItem.level] || "Level";
    nextHtml = `${lvl} • ecc ${nextItem.eccentricPct}% • target ${nextItem.targetReps} reps`;
  }

  // Prefill the UI for the next item so startProgram/startEcho will read correct values
  this._applyItemToUI?.(nextItem);

  // Use the *current* item's rest before the next item starts (common convention)
  this.addLogEntry(`Rest ${item.restSec}s → then next set/item (_runCurrentPlanBlock)`, "info");
  this._beginRest
    ? this._beginRest(item.restSec, () => this._runCurrentPlanBlock(), `Next: ${nextItem.name || (nextItem.type === "exercise" ? "Exercise" : "Echo Mode")}`, nextHtml, nextItem)
    : setTimeout(() => this._runCurrentPlanBlock(), Math.max(0, (item.restSec|0))*1000);
}


// Show a ring countdown, update “up next”, wire Skip/+30s, then call onDone()
_beginRest(totalSec, onDone, labelText = "Next set", nextHtml = "", nextItemOrName = null) {
  const overlay   = document.getElementById("restOverlay");
  const progress  = document.getElementById("restProgress");
  const timeText  = document.getElementById("restTimeText");
  const nextDiv   = document.getElementById("restNext");
  const addBtn    = document.getElementById("restAddBtn");
  const skipBtn   = document.getElementById("restSkipBtn");
  const pauseBtn  = document.getElementById("restPauseBtn");           // NEW
  const inlineHud = document.getElementById("planRestInline");
  const setNameEl = document.getElementById("restSetName");

  // Fallback: if overlay not present, just delay then continue
  if (!overlay || !progress || !timeText) {
    const ms = Math.max(0, (totalSec|0) * 1000);
    this.addLogEntry(`(No overlay found) Rest ${totalSec}s…`, "info");
    setTimeout(() => onDone && onDone(), ms);
    return;
  }

  // Setup UI
  overlay.classList.remove("hidden");
  if (nextDiv) nextDiv.innerHTML = nextHtml || "";
  if (inlineHud) inlineHud.textContent = `Rest: ${totalSec}s`;

  const nextName = (typeof nextItemOrName === "string")
    ? nextItemOrName
    : (nextItemOrName && nextItemOrName.name) || "";
  if (setNameEl) setNameEl.textContent = nextName;

  const CIRC = 2 * Math.PI * 45; // r=45 in index.html
  progress.setAttribute("stroke-dasharray", CIRC.toFixed(3));

  let remaining = Math.max(0, totalSec|0);
  let paused = false;
  let rafId = null;
  let endT = performance.now() + remaining * 1000;

  // NEW: track pause delta so clock truly freezes while paused
  let pauseStarted = 0;

  // NEW: countdown beep guard + skip flag
  let lastAnnounced = remaining;
  let skipped = false;

  const closeOverlay = () => {
    overlay.classList.add("hidden");
    if (inlineHud) inlineHud.textContent = "";
    if (setNameEl) setNameEl.textContent = "";
  };

  const tick = (t) => {
    if (paused) { rafId = requestAnimationFrame(tick); return; }

    const leftMs = Math.max(0, endT - t);
    const newRemaining = Math.ceil(leftMs / 1000);
    remaining = newRemaining;

    // ring
    const ratio = Math.min(1, Math.max(0, leftMs / (totalSec * 1000)));
    const dash  = ratio * CIRC;
    progress.setAttribute("stroke-dashoffset", String((CIRC - dash).toFixed(3)));

    // text
    timeText.textContent = String(remaining);
    if (inlineHud) inlineHud.textContent = `Rest: ${remaining}s`;

    // NEW: beep at 3, 2, 1 (only once per second)
    if (remaining !== lastAnnounced) {
      if (remaining === 3 || remaining === 2 || remaining === 1) {
        // slightly descending tone for fun
        const freq = remaining === 3 ? 880 : remaining === 2 ? 760 : 640;
        this._beep(freq, 120, 0.25);
      }
      lastAnnounced = remaining;
    }

    if (leftMs <= 0) {
      // done
      cancelAnimationFrame(rafId);
      closeOverlay();

      // NEW: tiny “time’s up” beep if NOT skipped
      if (!skipped) {
        this._beep(1200, 80, 0.18); // short + a tad higher
      }

      this.addLogEntry("Rest finished → starting next block", "success");
      onDone && onDone();
      return;
    }

    rafId = requestAnimationFrame(tick);
  };

  // Buttons
  const add30 = () => {
    const addMs = 30_000;
    endT += addMs;
    this.addLogEntry("+30s added to rest", "info");
  };

  const skip = () => {
    this.addLogEntry("Rest skipped", "info");
    skipped = true;                        // NEW
    cancelAnimationFrame(rafId);
    closeOverlay();
    onDone && onDone();
  };

  const togglePause = () => {              // NEW
    paused = !paused;
    if (paused) {
      pauseStarted = performance.now();
      if (pauseBtn) pauseBtn.textContent = "Resume";
      this.addLogEntry("Rest paused", "info");
    } else {
      // extend endT by the time we were paused
      const pausedMs = Math.max(0, performance.now() - pauseStarted);
      endT += pausedMs;
      if (pauseBtn) pauseBtn.textContent = "Pause";
      this.addLogEntry("Rest resumed", "info");
    }
  };

  addBtn.onclick = add30;
  skipBtn.onclick = skip;
  if (pauseBtn) pauseBtn.onclick = togglePause;  // NEW

  // start loop
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(tick);

  // NEW: prime AudioContext on user gesture (safe no-op if already running)
  this._initAudio();
}


  /* =========================
     PLAN — PERSISTENCE
     ========================= */

  plansKey() { return "vitruvian.plans.index"; }
  planKey(name) { return `vitruvian.plan.${name}`; }

  getAllPlanNames() {
    try {
      const raw = localStorage.getItem(this.plansKey());
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  setAllPlanNames(arr) {
    try { localStorage.setItem(this.plansKey(), JSON.stringify(arr)); } catch {}
  }

  populatePlanSelect() {
    const sel = document.getElementById("planSelect");
    if (!sel) return;
    const names = this.getAllPlanNames();
    sel.innerHTML = names.length ? names.map(n=>`<option value="${n}">${n}</option>`).join("") : `<option value="">(no saved plans)</option>`;
  }

  saveCurrentPlan() {
    const nameInput = document.getElementById("planNameInput");
    const name = (nameInput?.value || "").trim();
    if (!name) { alert("Enter a plan name first."); return; }
    try {
      localStorage.setItem(this.planKey(name), JSON.stringify(this.planItems));
      const names = new Set(this.getAllPlanNames());
      names.add(name);
      this.setAllPlanNames([...names]);
      this.populatePlanSelect();
      this.addLogEntry(`Saved plan "${name}" (${this.planItems.length} items)`, "success");
    } catch (e) {
      alert(`Could not save plan: ${e.message}`);
    }
  }

  loadSelectedPlan() {
    const sel = document.getElementById("planSelect");
    if (!sel || !sel.value) { alert("No saved plan selected."); return; }
    try {
      const raw = localStorage.getItem(this.planKey(sel.value));
      if (!raw) { alert("Saved plan not found."); return; }
      this.planItems = JSON.parse(raw) || [];
      this.renderPlanUI();
      this.addLogEntry(`Loaded plan "${sel.value}"`, "success");
    } catch (e) {
      alert(`Could not load plan: ${e.message}`);
    }
  }

  deleteSelectedPlan() {
    const sel = document.getElementById("planSelect");
    if (!sel || !sel.value) { alert("No saved plan selected."); return; }
    const name = sel.value;
    try {
      localStorage.removeItem(this.planKey(name));
      const remaining = this.getAllPlanNames().filter(n=>n!==name);
      this.setAllPlanNames(remaining);
      this.populatePlanSelect();
      this.addLogEntry(`Deleted plan "${name}"`, "info");
    } catch (e) {
      alert(`Could not delete plan: ${e.message}`);
    }
  }





  async setColorScheme() {
    try {
      const color1Input = document.getElementById("color1");
      const color2Input = document.getElementById("color2");
      const color3Input = document.getElementById("color3");

      // Use fixed brightness of 0.4 (adjusting brightness doesn't seem to work)
      const brightness = 0.4;

      // Parse colors from hex inputs
      const hexToRgb = (hex) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result
          ? {
              r: parseInt(result[1], 16),
              g: parseInt(result[2], 16),
              b: parseInt(result[3], 16),
            }
          : { r: 0, g: 0, b: 0 };
      };

      const colors = [
        hexToRgb(color1Input.value),
        hexToRgb(color2Input.value),
        hexToRgb(color3Input.value),
      ];

      await this.device.setColorScheme(brightness, colors);
    } catch (error) {
      console.error("Set color scheme error:", error);
      this.addLogEntry(`Failed to set color scheme: ${error.message}`, "error");
      alert(`Failed to set color scheme: ${error.message}`);
    }
  }
}

// Create global app instance
const app = new VitruvianApp();

// Log startup message
app.addLogEntry("Vitruvian Web Control Ready", "success");
app.addLogEntry('Click "Connect to Device" to begin', "info");
app.addLogEntry("", "info");
app.addLogEntry("Requirements:", "info");
app.addLogEntry("- Chrome, Edge, or Opera browser", "info");
app.addLogEntry("- HTTPS connection (or localhost)", "info");
app.addLogEntry("- Bluetooth enabled on your device", "info");
