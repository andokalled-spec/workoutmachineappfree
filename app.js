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

// PLAN state
this.planItems = [];
this.planActive = false;
this.planCursor = { index: 0, set: 1 };
this.planRestTimer = null;
this.planOnWorkoutComplete = null;

// REST overlay state
this.restActive = false;
this.restDuration = 0;
this.restEndTs = 0;
this.restPaused = false;
this.restRemaining = 0;
this.restRAF = null;
this.restOnDone = null;

// Beep / audio
this.audioCtx = null;
this.beeped = {1:false,2:false,3:false};

// Initialize plan UI + overlay buttons once DOM is ready
setTimeout(() => {
  this.populatePlanSelect?.();
  this.renderPlanUI?.();
  const skip  = document.getElementById("restSkipBtn");
  const add   = document.getElementById("restAddBtn");
  const pause = document.getElementById("restPauseBtn");
  skip  && (skip.onclick  = () => this._restSkip());
  add   && (add.onclick   = () => this._restAdd(30));
  pause && (pause.onclick = () => this._restTogglePause());
}, 0);

  }


	getProgramModeLabel(v) {
  const map = {
    [ProgramMode.OLD_SCHOOL]: "Old School",
    [ProgramMode.PUMP]: "Pump",
    [ProgramMode.TUT]: "TUT",
    [ProgramMode.TUT_BEAST]: "TUT Beast",
    [ProgramMode.ECCENTRIC_ONLY]: "Eccentric Only",
  };
  return map[v] ?? `Mode ${v}`;
}
getEchoLevelLabel(v) {
  const map = {
    [EchoLevel.HARD]: "Hard",
    [EchoLevel.HARDER]: "Harder",
    [EchoLevel.HARDEST]: "Hardest",
    [EchoLevel.EPIC]: "Epic",
  };
  return map[v] ?? `Level ${v}`;
}
getUnitLabelShort() { return this.getUnitLabel(); }
_fmtSec(s) {
  s = Math.max(0, Math.ceil(s));
  const m = Math.floor(s/60), ss = String(s%60).padStart(2, "0");
  return m ? `${m}:${ss}` : `${ss}s`;
}
async _beep(freq=880, durMs=120, gain=0.08) {
  try {
    if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.audioCtx.state === "suspended") await this.audioCtx.resume();
    const ctx = this.audioCtx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.value = freq; g.gain.value = gain;
    o.connect(g); g.connect(ctx.destination);
    const now = ctx.currentTime; o.start(now); o.stop(now + durMs/1000);
  } catch {}
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
  
try { this.renderPlanUI && this.renderPlanUI(); } catch {}
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
      programSection.classList.remove("hidden");
      echoSection.classList.remove("hidden");
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


makeExerciseRow() {
  return {
    type: "exercise",
    title: "",  
    name: "Untitled Exercise",
    mode: ProgramMode.OLD_SCHOOL,
    perCableKg: 10,
    reps: 10,
    sets: 3,
    restSec: 60,
    cables: 2,
    justLift: false,
    stopAtTop: false,
    progressionKg: 0,
  };
}
makeEchoRow() {
  return {
    type: "echo",
    title: "",  
    name: "Echo Block",
    level: EchoLevel.HARD,
    eccentricPct: 100,
    targetReps: 2,
    sets: 3,
    restSec: 60,
    justLift: false,
    stopAtTop: false,
  };
}

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

    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";
    header.style.marginBottom = "10px";
    header.innerHTML = `
      <div style="font-weight:700; color:#212529">
    ${item.title && item.title.trim() !== "" 
       ? item.title 
       : (item.type === "exercise" ? "Exercise" : "Echo Mode")}
  </div>
      <div style="display:flex; gap:8px;">
        <button class="secondary" style="width:auto; padding:6px 10px;" onclick="app.movePlanItem(${i}, -1)">Move Up</button>
        <button class="secondary" style="width:auto; padding:6px 10px;" onclick="app.movePlanItem(${i}, 1)">Move Down</button>
        <button class="secondary" style="width:auto; padding:6px 10px; background:#dc3545" onclick="app.removePlanItem(${i})">Delete</button>
      </div>`;
    card.appendChild(header);

    const grid = document.createElement("div");
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "1fr 1fr";
    grid.style.gap = "10px";

const commonHtml = `
  <div class="form-group">
    <label>Title</label>
    <input type="text" placeholder="Exercise title (e.g. Bench Press)" 
           value="${item.title || ""}" 
           oninput="app.updatePlanField(${i}, 'title', this.value)" />
  </div>

  <div class="form-group">
    <label>Name</label>
    <input type="text" placeholder="Short name (e.g. Warmup 1)" 
           value="${item.name || ""}" 
           oninput="app.updatePlanField(${i}, 'name', this.value)" />
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
      </div>`;

    if (item.type === "exercise") {
      const modeOptions = [
        [ProgramMode.OLD_SCHOOL, "Old School"],
        [ProgramMode.PUMP, "Pump"],
        [ProgramMode.TUT, "TUT"],
        [ProgramMode.TUT_BEAST, "TUT Beast"],
        [ProgramMode.ECCENTRIC_ONLY, "Eccentric Only"],
      ].map(([v, l]) => `<option value="${v}" ${item.mode===v?"selected":""}>${l}</option>`).join("");

      grid.innerHTML = `
        <div class="form-group">
          <label>Mode</label>
          <select onchange="app.updatePlanField(${i}, 'mode', parseInt(this.value))">${modeOptions}</select>
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
        ${commonHtml}`;
    } else {
      const levelOptions = [
        [EchoLevel.HARD, "Hard"],
        [EchoLevel.HARDER, "Harder"],
        [EchoLevel.HARDEST, "Hardest"],
        [EchoLevel.EPIC, "Epic"],
      ].map(([v, l]) => `<option value="${v}" ${item.level===v?"selected":""}>${l}</option>`).join("");

      grid.innerHTML = `
        <div class="form-group">
          <label>Level</label>
          <select onchange="app.updatePlanField(${i}, 'level', parseInt(this.value))">${levelOptions}</select>
        </div>
        <div class="form-group">
          <label>Eccentric %</label>
          <input type="number" min="0" max="150" step="5" value="${item.eccentricPct}" oninput="app.updatePlanField(${i}, 'eccentricPct', parseInt(this.value)||0)" />
        </div>
        <div class="form-group">
          <label>Target Reps</label>
          <input type="number" min="0" max="30" value="${item.targetReps}" oninput="app.updatePlanField(${i}, 'targetReps', parseInt(this.value)||0)" />
        </div>
        ${commonHtml}`;
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

// UI actions + persistence
addPlanExercise(){ this.planItems.push(this.makeExerciseRow()); this.renderPlanUI(); }
addPlanEcho(){ this.planItems.push(this.makeEchoRow()); this.renderPlanUI(); }
resetPlanToDefaults(){
  this.planItems = [
    { ...this.makeExerciseRow(), name: "Back Squat", mode: ProgramMode.OLD_SCHOOL, perCableKg: 15, reps: 8, sets: 3, restSec: 90, stopAtTop: true },
    { ...this.makeEchoRow(),    name: "Echo Finishers", level: EchoLevel.HARDER, eccentricPct: 120, targetReps: 2, sets: 2, restSec: 60 },
  ];
  this.renderPlanUI();
}
removePlanItem(i){ this.planItems.splice(i,1); this.renderPlanUI(); }
movePlanItem(i, d){
  const j = i + d; if (j < 0 || j >= this.planItems.length) return;
  const [row] = this.planItems.splice(i,1); this.planItems.splice(j,0,row); this.renderPlanUI();
}
updatePlanField(i, k, v){ const it = this.planItems[i]; if (!it) return; it[k]=v; }
updatePlanPerCableDisplay(i, disp){
  const kg = this.convertDisplayToKg(parseFloat(disp)); if (isNaN(kg)) return;
  this.planItems[i].perCableKg = Math.max(0, kg);
}
updatePlanProgressionDisplay(i, disp){
  const kg = this.convertDisplayToKg(parseFloat(disp)); if (isNaN(kg)) return;
  this.planItems[i].progressionKg = Math.max(-3, Math.min(3, kg));
}
plansKey(){ return "vitruvian.plans.index"; }
planKey(name){ return `vitruvian.plan.${name}`; }
getAllPlanNames(){ try{ const raw = localStorage.getItem(this.plansKey()); return raw ? JSON.parse(raw):[]; } catch { return []; } }
setAllPlanNames(arr){ try{ localStorage.setItem(this.plansKey(), JSON.stringify(arr)); } catch{} }
populatePlanSelect(){
  const sel = document.getElementById("planSelect"); if (!sel) return;
  const names = this.getAllPlanNames();
  sel.innerHTML = names.length ? names.map(n=>`<option value="${n}">${n}</option>`).join("") : `<option value="">(no saved plans)</option>`;
}
saveCurrentPlan(){
  const nameInput = document.getElementById("planNameInput");
  const name = (nameInput?.value || "").trim(); if (!name){ alert("Enter a plan name first."); return; }
  try{
    localStorage.setItem(this.planKey(name), JSON.stringify(this.planItems));
    const names = new Set(this.getAllPlanNames()); names.add(name); this.setAllPlanNames([...names]);
    this.populatePlanSelect(); this.addLogEntry(`Saved plan "${name}" (${this.planItems.length} items)`, "success");
  }catch(e){ alert(`Could not save plan: ${e.message}`); }
}
loadSelectedPlan(){
  const sel = document.getElementById("planSelect"); if (!sel || !sel.value){ alert("No saved plan selected."); return; }
  try{
    const raw = localStorage.getItem(this.planKey(sel.value)); if (!raw){ alert("Saved plan not found."); return; }
    this.planItems = JSON.parse(raw)||[]; this.renderPlanUI(); this.addLogEntry(`Loaded plan "${sel.value}"`, "success");
  }catch(e){ alert(`Could not load plan: ${e.message}`); }
}
deleteSelectedPlan(){
  const sel = document.getElementById("planSelect"); if (!sel || !sel.value){ alert("No saved plan selected."); return; }
  const name = sel.value;
  try{
    localStorage.removeItem(this.planKey(name));
    this.setAllPlanNames(this.getAllPlanNames().filter(n=>n!==name));
    this.populatePlanSelect(); this.addLogEntry(`Deleted plan "${name}"`, "info");
  }catch(e){ alert(`Could not delete plan: ${e.message}`); }
}



startPlan(){
  if (!this.device?.isConnected){ alert("Connect to the device before starting a plan."); return; }
  if (!this.planItems.length){ alert("Add at least one item to your plan."); return; }
  this.planActive = true; this.planCursor = { index:0, set:1 };
  this.addLogEntry(`Starting plan with ${this.planItems.length} item(s)`, "success");
  // When a Program/Echo block completes, continue
  this.planOnWorkoutComplete = () => this._planAdvance();
  this._runCurrentPlanBlock();
}

_runCurrentPlanBlock(){

const current = this.planItems[this.planCursor.index];
this.addLogEntry(
  `Starting ${current?.type ?? "block"} — set ${this.planCursor.set}/${current?.sets ?? "?"}`,
  "info"
);
  const { index, set } = this.planCursor;
  const item = this.planItems[index];
  if (!item){ this._planFinish(); return; }

  this.addLogEntry(`Plan item ${index+1}/${this.planItems.length}, set ${set}/${item.sets}: ${item.name}`, "info");

  // Apply per-item Stop-at-top without permanently changing global
  const originalStopAtTop = this.stopAtTop;
  this.stopAtTop = !!item.stopAtTop;
  const stopAtTopCheckbox = document.getElementById("stopAtTopCheckbox");
  if (stopAtTopCheckbox) stopAtTopCheckbox.checked = this.stopAtTop;

  if (item.type === "exercise"){
    // hydrate Program UI then start
    const modeSelect = document.getElementById("mode");
    const weightInput = document.getElementById("weight");
    const repsInput = document.getElementById("reps");
    const progInput = document.getElementById("progression");
    const jl = document.getElementById("justLiftCheckbox");
    if (modeSelect) modeSelect.value = String(item.mode);
    if (weightInput) weightInput.value = this.formatWeightValue(item.perCableKg);
    if (repsInput) repsInput.value = String(item.reps);
    if (progInput) progInput.value = this.formatWeightValue(item.progressionKg, this.getProgressionInputDecimals());
    if (jl) { jl.checked = !!item.justLift; this.toggleJustLiftMode(); }
    this.startProgram().finally(()=>{ this.stopAtTop = originalStopAtTop; });
  } else {
    // hydrate Echo UI then start
    const levelSelect = document.getElementById("echoLevel");
    const ecc = document.getElementById("eccentric");
    const target = document.getElementById("targetReps");
    const jl = document.getElementById("echoJustLiftCheckbox");
    if (levelSelect) levelSelect.value = String(item.level + 1); // UI 1..4
    if (ecc) ecc.value = String(item.eccentricPct);
    if (target) target.value = String(item.targetReps);
    if (jl) { jl.checked = !!item.justLift; this.toggleEchoJustLiftMode(); }
    this.startEcho();
  }
}

_planAdvance(){
this.addLogEntry(
  `Plan advancing → item ${this.planCursor.index + 1}, set ${this.planCursor.set}`,
  "info"
);
 if (!this.planActive) return;
  const item = this.planItems[this.planCursor.index];
  if (!item){ this._planFinish(); return; }

  // More sets for the same item
  if (this.planCursor.set < item.sets){
    this.planCursor.set += 1;
    const unit = this.getUnitLabel();
    let nextHtml = "";
    if (item.type === "exercise"){
      const w = this.convertKgToDisplay(item.perCableKg).toFixed(this.getWeightInputDecimals());
      const mode = this.getProgramModeLabel(item.mode);
      nextHtml = `${mode} • ${w} ${unit}/cable × ${item.cables} • ${item.reps} reps`;
    } else {
      const lvl = this.getEchoLevelLabel(item.level);
      nextHtml = `${lvl} • ecc ${item.eccentricPct}% • target ${item.targetReps} reps`;
    }
this.addLogEntry(
  `Rest ${item.restSec}s → then next set/item (_runCurrentPlanBlock)`,
  "info"
);
this._beginRest(item.restSec, () => this._runCurrentPlanBlock(), `Next set (${this.planCursor.set}/${item.sets})`, nextHtml);
    return;
  }

  // Next item
  this.planCursor.index += 1;
  this.planCursor.set = 1;

  if (this.planCursor.index >= this.planItems.length){
    this._planFinish();
  } else {
    const nextItem = this.planItems[this.planCursor.index];
    const unit = this.getUnitLabel();
    let nextHtml = "";
    if (nextItem?.type === "exercise"){
      const w = this.convertKgToDisplay(nextItem.perCableKg).toFixed(this.getWeightInputDecimals());
      const mode = this.getProgramModeLabel(nextItem.mode);
      nextHtml = `${mode} • ${w} ${unit}/cable × ${nextItem.cables} • ${nextItem.reps} reps`;
    } else if (nextItem){
      const lvl = this.getEchoLevelLabel(nextItem.level);
      nextHtml = `${lvl} • ecc ${nextItem.eccentricPct}% • target ${nextItem.targetReps} reps`;
    }
this.addLogEntry(
  `Rest ${item.restSec}s → then next set/item (_runCurrentPlanBlock)`,
  "info"
);  
 this._beginRest(item.restSec, () => this._runCurrentPlanBlock(), `Next: ${nextItem?.name ?? "Item"}`, nextHtml);
  }
}

_planFinish(){
  this.planActive = false;
  this.planOnWorkoutComplete = null;
  clearTimeout(this.planRestTimer);
  const inline = document.getElementById("planRestInline");
  inline && (inline.textContent = "");
  this.addLogEntry("Workout plan complete ✅", "success");
}


_restOpen(seconds, label = "Next set starts", nextHtml = ""){
  const overlay = document.getElementById("restOverlay");
  const ring = document.getElementById("restRing");
  const remain = document.getElementById("restRemain");
  const sub = document.getElementById("restSub");
  const next = document.getElementById("restNext");
  const inline = document.getElementById("planRestInline");
  if (!overlay || !ring || !remain || !sub || !next) return;

  this.restActive = true;
  this.restPaused = false;
  this.restDuration = Math.max(0, seconds|0);
  this.restRemaining = this.restDuration;
  this.restEndTs = performance.now() + this.restDuration * 1000;
  this.restOnDone = null;
  this.beeped = {1:false,2:false,3:false};

  overlay.style.display = "grid";
  sub.textContent = label;
  remain.textContent = `${Math.ceil(this.restRemaining)}`;
  next.innerHTML = nextHtml || "";
  inline && (inline.textContent = `Rest: ${this._fmtSec(this.restRemaining)}`);

  const C = 339.292;
  ring.style.strokeDasharray = `${C}`;
  ring.style.strokeDashoffset = "0";

  cancelAnimationFrame(this.restRAF);
  const tick = (now) => {
    if (!this.restActive) return;

    if (!this.restPaused) {
      this.restRemaining = Math.max(0, (this.restEndTs - now) / 1000);
    }

    inline && (inline.textContent = `Rest: ${this._fmtSec(this.restRemaining)}`);

    const r = Math.ceil(this.restRemaining);
    if (r === 3 && !this.beeped[3]) { this.beeped[3] = true; this._beep(660, 120); }
    if (r === 2 && !this.beeped[2]) { this.beeped[2] = true; this._beep(740, 120); }
    if (r === 1 && !this.beeped[1]) { this.beeped[1] = true; this._beep(880, 140); }

    remain.textContent = `${Math.ceil(this.restRemaining)}`;
    const p = this.restDuration > 0 ? (1 - this.restRemaining / this.restDuration) : 1;
    ring.style.strokeDashoffset = `${C * p}`;

    if (this.restRemaining <= 0.05) {
      this._restClose();
      const cb = this.restOnDone; this.restOnDone = null;
      cb && cb();
      return;
    }
    this.restRAF = requestAnimationFrame(tick);
  };
  this.restRAF = requestAnimationFrame(tick);
}
_restClose(){
  const overlay = document.getElementById("restOverlay");
  const inline = document.getElementById("planRestInline");
  overlay && (overlay.style.display = "none");
  inline && (inline.textContent = "");
  cancelAnimationFrame(this.restRAF);
  this.restActive = false;
}
_restSkip(){
  if (!this.restActive) return;
  this._restClose();
  const cb = this.restOnDone; this.restOnDone = null; cb && cb();
}
_restAdd(extraSeconds){
  if (!this.restActive) return;
  if (this.restPaused) this.restRemaining += extraSeconds;
  else this.restEndTs += extraSeconds * 1000;
  this.restDuration += extraSeconds;
}
_restTogglePause(){
  const btn = document.getElementById("restPauseBtn");
  if (!this.restActive || !btn) return;
  if (!this.restPaused){
    this.restPaused = true;
    this.restRemaining = Math.max(0, (this.restEndTs - performance.now()) / 1000);
    btn.textContent = "Resume";
  } else {
    this.restPaused = false;
    this.restEndTs = performance.now() + this.restRemaining * 1000;
    btn.textContent = "Pause";
  }
}
_beginRest(seconds, onDone, label, nextHtml){
  seconds = Math.max(0, (seconds|0));
  if (seconds === 0){ onDone && onDone(); return; }
  this.restOnDone = onDone;
  this._restOpen(seconds, label, nextHtml);
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
        <div class="history-item-title">${workout.mode}</div>
        <div class="history-item-details">${weightStr} • ${workout.reps} reps</div>
        ${viewButtonHtml}
      </div>
    `;
      })
      .join("");
  }

  completeWorkout() {

this.addLogEntry("Plan: completeWorkout() fired", "info");
    if (this.currentWorkout) {
      // Set end time
      const endTime = new Date();
      this.currentWorkout.endTime = endTime;

      // Add to history
      this.addToWorkoutHistory({
        mode: this.currentWorkout.mode,
        weightKg: this.currentWorkout.weightKg,
        reps: this.workingReps, // Actual reps completed
        timestamp: endTime,
        startTime: this.currentWorkout.startTime,
        warmupEndTime: this.currentWorkout.warmupEndTime,
        endTime: endTime,
      });

      // Reset to empty state
      this.resetRepCountersToEmpty();
      this.addLogEntry("Workout completed and saved to history", "success");
    }
 

try { this.planOnWorkoutComplete && this.planOnWorkoutComplete(); } catch {}
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
          
  // Important: stop the device before completing so the next set/item can start
  this.stopWorkout(); // stopWorkout() will call completeWorkout() for us
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
      this.currentWorkout = {
        mode: modeName || "Program",
        weightKg: perCableKg,
        targetReps: reps,
        startTime: new Date(),
        warmupEndTime: null,
        endTime: null,
      };
      this.updateRepCounters();

      // Show auto-stop timer if Just Lift mode
      const autoStopTimer = document.getElementById("autoStopTimer");
      if (autoStopTimer) {
        autoStopTimer.style.display = isJustLift ? "block" : "none";
      }

// Safety: ensure previous sequence is stopped
try { await this.device.sendStopCommand(); } catch {}


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
      this.currentWorkout = {
        mode: modeName,
        weightKg: 0, // Echo mode doesn't have fixed weight
        targetReps: targetReps,
        startTime: new Date(),
        warmupEndTime: null,
        endTime: null,
      };
      this.updateRepCounters();

      // Show auto-stop timer if Just Lift mode
      const autoStopTimer = document.getElementById("autoStopTimer");
      if (autoStopTimer) {
        autoStopTimer.style.display = isJustLift ? "block" : "none";
      }



// Safety: ensure previous sequence is stopped
try { await this.device.sendStopCommand(); } catch {}

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
