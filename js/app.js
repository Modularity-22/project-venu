// Project Venu - Real Data Application Controller
// Shows Strictly Real Hardware Readings from Garmin Venu 3

document.addEventListener("DOMContentLoaded", () => {
  initDate();
  initRingsGeometry();
  initNativeCharts();
  bindReactiveState();
  initInteractiveEvents();

  // Automatically detect and connect to paired Garmin watch
  if (window.BLEController) {
    window.BLEController.autoDetectAndConnect();
  }
});

function initDate() {
  const options = { weekday: 'long', month: 'long', day: 'numeric' };
  const d = new Date();
  document.getElementById("header-date").textContent = d.toLocaleDateString('en-US', options);
}

// Activity Rings Geometry Constants
const R_MOVE = 86;
const R_EXER = 63;
const R_STAND = 40;
const C_MOVE = 2 * Math.PI * R_MOVE;
const C_EXER = 2 * Math.PI * R_EXER;
const C_STAND = 2 * Math.PI * R_STAND;

function initRingsGeometry() {
  const m = document.getElementById("arc-move");
  const e = document.getElementById("arc-exercise");
  const s = document.getElementById("arc-stand");

  m.style.strokeDasharray = `${C_MOVE}`;
  e.style.strokeDasharray = `${C_EXER}`;
  s.style.strokeDasharray = `${C_STAND}`;

  // Start with 0 progress
  m.style.strokeDashoffset = `${C_MOVE}`;
  e.style.strokeDashoffset = `${C_EXER}`;
  s.style.strokeDashoffset = `${C_STAND}`;
}

// -------------------------------------------------------------
// Pure Native Canvas Heart Rate Graph (Real Hardware Points Only)
// -------------------------------------------------------------
class NativeHrChart {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext("2d");
    this.points = [];
    this.scrubbingIndex = null;

    this.setupRetina();
    this.bindTouchEvents();
  }

  setupRetina() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.width = rect.width - 20;
    this.height = 120;

    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;

    this.ctx.scale(dpr, dpr);
  }

  setPoints(points) {
    this.points = points;
    this.render();
  }

  render() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const pts = this.points;

    ctx.clearRect(0, 0, w, h);

    // If no real readings recorded yet
    if (!pts || pts.length === 0) {
      ctx.fillStyle = "#8E8E93";
      ctx.font = "600 13px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Waiting for Garmin Venu 3 readings...", w / 2, h / 2);
      return;
    }

    if (pts.length === 1) {
      ctx.fillStyle = "#FF2D55";
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "700 12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`${pts[0].val} BPM`, w / 2, h / 2 - 12);
      return;
    }

    const vals = pts.map(p => p.val);
    const minVal = Math.max(30, Math.min(...vals) - 5);
    const maxVal = Math.min(220, Math.max(...vals) + 10);
    const valRange = Math.max(20, maxVal - minVal);

    // Guidelines
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    [minVal, Math.round((minVal + maxVal) / 2), maxVal].forEach(bpm => {
      const y = h - ((bpm - minVal) / valRange) * (h - 20) - 10;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    });

    const coords = pts.map((p, i) => {
      const x = (i / (pts.length - 1)) * w;
      const y = h - ((p.val - minVal) / valRange) * (h - 24) - 12;
      return { x, y, val: p.val, time: p.time };
    });

    // Ruby Area Fill
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, "rgba(255, 45, 85, 0.45)");
    gradient.addColorStop(1, "rgba(255, 45, 85, 0.0)");

    ctx.beginPath();
    ctx.moveTo(coords[0].x, coords[0].y);
    for (let i = 0; i < coords.length - 1; i++) {
      const xc = (coords[i].x + coords[i + 1].x) / 2;
      const yc = (coords[i].y + coords[i + 1].y) / 2;
      ctx.quadraticCurveTo(coords[i].x, coords[i].y, xc, yc);
    }
    ctx.lineTo(coords[coords.length - 1].x, coords[coords.length - 1].y);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Line stroke
    ctx.beginPath();
    ctx.moveTo(coords[0].x, coords[0].y);
    for (let i = 0; i < coords.length - 1; i++) {
      const xc = (coords[i].x + coords[i + 1].x) / 2;
      const yc = (coords[i].y + coords[i + 1].y) / 2;
      ctx.quadraticCurveTo(coords[i].x, coords[i].y, xc, yc);
    }
    ctx.lineTo(coords[coords.length - 1].x, coords[coords.length - 1].y);
    ctx.strokeStyle = "#FF2D55";
    ctx.lineWidth = 2.4;
    ctx.stroke();

    // Touch Scrubbing Point
    if (this.scrubbingIndex !== null && coords[this.scrubbingIndex]) {
      const s = coords[this.scrubbingIndex];
      ctx.beginPath();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.moveTo(s.x, 0);
      ctx.lineTo(s.x, h);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(s.x, s.y, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = "#FFFFFF";
      ctx.fill();
      ctx.strokeStyle = "#FF2D55";
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
  }

  bindTouchEvents() {
    const handleMove = (clientX) => {
      if (!this.points || this.points.length === 0) return;
      const rect = this.canvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const pct = x / rect.width;
      const idx = Math.min(Math.floor(pct * this.points.length), this.points.length - 1);
      this.scrubbingIndex = idx;
      this.render();

      const item = this.points[idx];
      if (item) {
        document.getElementById("hr-scrub-time").textContent = item.time;
        document.getElementById("hr-display-bpm").textContent = item.val;
      }
    };

    const handleEnd = () => {
      this.scrubbingIndex = null;
      this.render();
      document.getElementById("hr-scrub-time").textContent = "Live";
      document.getElementById("hr-display-bpm").textContent = AppStore.state.heartRate.current !== null ? AppStore.state.heartRate.current : "--";
    };

    this.canvas.addEventListener("touchstart", (e) => handleMove(e.touches[0].clientX), { passive: true });
    this.canvas.addEventListener("touchmove", (e) => handleMove(e.touches[0].clientX), { passive: true });
    this.canvas.addEventListener("touchend", handleEnd);
  }
}

let nativeHrChart = null;

function initNativeCharts() {
  nativeHrChart = new NativeHrChart("hrNativeCanvas");
  nativeHrChart.render();

  window.addEventListener("resize", () => {
    if (nativeHrChart) {
      nativeHrChart.setupRetina();
      nativeHrChart.render();
    }
    renderSleepNativeCanvas(AppStore.state.sleep);
  });
}

function renderSleepNativeCanvas(sleep) {
  const canvas = document.getElementById("sleepNativeCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = rect.width - 20;
  const h = 85;

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  if (!sleep.timeline || sleep.timeline.length === 0) {
    ctx.fillStyle = "#8E8E93";
    ctx.font = "600 13px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Sync watch to view sleep stages", w / 2, h / 2);
    return;
  }

  const stageY = { "Awake": 12, "REM": 32, "Core": 52, "Deep": 72 };
  const stageColors = { "Awake": "#8E8E93", "REM": "#BF5AF2", "Core": "#0A84FF", "Deep": "#0040DD" };

  Object.values(stageY).forEach(y => {
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
    ctx.lineWidth = 1;
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  });

  const timeline = sleep.timeline || [];
  const total = timeline.reduce((s, it) => s + it.duration, 0) || 480;

  let currX = 0;
  let prevY = null;

  timeline.forEach(seg => {
    const segW = (seg.duration / total) * w;
    const y = stageY[seg.stage] || 52;
    const col = stageColors[seg.stage] || "#0A84FF";

    if (prevY !== null && prevY !== y) {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
      ctx.lineWidth = 1.5;
      ctx.moveTo(currX, prevY);
      ctx.lineTo(currX, y);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.fillStyle = col;
    if (ctx.roundRect) {
      ctx.roundRect(currX, y - 4, segW, 8, 4);
    } else {
      ctx.rect(currX, y - 4, segW, 8);
    }
    ctx.fill();

    currX += segW;
    prevY = y;
  });
}

// -------------------------------------------------------------
// Bind Reactive State (Displays Actual Device Data Only)
// -------------------------------------------------------------
function bindReactiveState() {
  const store = window.AppStore;

  // 1. Activity Rings
  store.subscribe("rings", (rings) => {
    const m = rings.move;
    const e = rings.exercise;
    const s = rings.stand;

    const mPct = m.goal > 0 ? m.current / m.goal : 0;
    const ePct = e.goal > 0 ? e.current / e.goal : 0;
    const sPct = s.goal > 0 ? s.current / s.goal : 0;

    document.getElementById("arc-move").style.strokeDashoffset = Math.max(0, C_MOVE * (1 - mPct));
    document.getElementById("arc-exercise").style.strokeDashoffset = Math.max(0, C_EXER * (1 - ePct));
    document.getElementById("arc-stand").style.strokeDashoffset = Math.max(0, C_STAND * (1 - sPct));

    document.getElementById("txt-move-cur").textContent = Math.round(m.current);
    document.getElementById("txt-move-goal").textContent = m.goal;
    document.getElementById("txt-move-pct").textContent = `${Math.round(mPct * 100)}%`;

    document.getElementById("txt-exer-cur").textContent = e.current;
    document.getElementById("txt-exer-goal").textContent = e.goal;
    document.getElementById("txt-exer-pct").textContent = `${Math.round(ePct * 100)}%`;

    document.getElementById("txt-stand-cur").textContent = s.current;
    document.getElementById("txt-stand-goal").textContent = s.goal;
    document.getElementById("txt-stand-pct").textContent = `${Math.round(sPct * 100)}%`;
  });

  // 2. Heart Rate
  store.subscribe("heartRate", (hr) => {
    const curVal = hr.current !== null ? hr.current : "--";
    document.getElementById("live-bpm-val").textContent = curVal;
    document.getElementById("hr-display-bpm").textContent = curVal;
    document.getElementById("hr-resting-txt").textContent = hr.resting !== null ? hr.resting : "--";
    document.getElementById("hr-walking-txt").textContent = hr.walkingAvg !== null ? hr.walkingAvg : "--";
    document.getElementById("hr-range-txt").textContent = (hr.min !== null && hr.max !== null) ? `${hr.min}–${hr.max}` : "--";

    if (hr.current !== null) {
      const heart = document.getElementById("heart-pulse-icon");
      heart.classList.remove("beat");
      void heart.offsetWidth;
      heart.classList.add("beat");
    }

    if (nativeHrChart) {
      nativeHrChart.setPoints(hr.dayCurve);
    }
  });

  // 3. Sleep
  store.subscribe("sleep", (sleep) => {
    document.getElementById("sleep-score-txt").textContent = sleep.score !== null ? sleep.score : "--";
    document.getElementById("sleep-label-txt").textContent = sleep.scoreLabel;
    document.getElementById("sleep-asleep-txt").textContent = sleep.timeAsleep;
    document.getElementById("sleep-inbed-txt").textContent = sleep.timeInBed;
    document.getElementById("sleep-eff-txt").textContent = sleep.efficiency;
    renderSleepNativeCanvas(sleep);
  });

  // 4. Body Battery & Stress
  store.subscribe("bodyBattery", (bb) => {
    document.getElementById("bb-val-txt").textContent = bb.current !== null ? bb.current : "--";
    document.getElementById("bb-meter-fill").style.width = bb.current !== null ? `${bb.current}%` : "0%";
    document.getElementById("bb-charge-txt").textContent = bb.charged;
    document.getElementById("bb-drain-txt").textContent = bb.drained;
    document.getElementById("bb-status-txt").textContent = bb.status;
  });

  store.subscribe("stress", (st) => {
    document.getElementById("stress-desc-txt").textContent = st.score !== null ? `${st.label} (${st.score})` : "--";
  });

  // 5. Workouts
  store.subscribe("workouts", (wList) => {
    renderWorkoutsMobile(wList);
  });

  // 6. Device BLE
  store.subscribe("device", (dev) => {
    const btn = document.getElementById("btn-connect-ble");
    const name = document.getElementById("ble-name");
    const batt = document.getElementById("ble-batt");
    const status = document.getElementById("ble-status");

    name.textContent = dev.name;
    batt.textContent = dev.battery !== null ? `${dev.battery}%` : "--";
    status.textContent = dev.statusMessage;

    if (dev.connected) {
      btn.textContent = "Connected";
      btn.classList.add("connected");
      document.getElementById("live-hr-badge").style.display = "flex";
    } else if (dev.connecting) {
      btn.textContent = "Connecting...";
      btn.classList.remove("connected");
      document.getElementById("live-hr-badge").style.display = "none";
    } else {
      btn.textContent = "Connect Watch";
      btn.classList.remove("connected");
      document.getElementById("live-hr-badge").style.display = "none";
    }
  });

  // 7. Live Running Speed & Cadence (0x1814)
  store.subscribe("rsc", (rsc) => {
    if (rsc.cadenceSpm !== null && AppStore.state.device.connected) {
      document.getElementById("ble-status").textContent = `Live • Cadence: ${rsc.cadenceSpm} spm • Speed: ${rsc.speedKmh} km/h`;
    }
  });

  // Initial trigger
  store._notify("rings", store.state.rings);
  store._notify("heartRate", store.state.heartRate);
  store._notify("sleep", store.state.sleep);
  store._notify("bodyBattery", store.state.bodyBattery);
  store._notify("stress", store.state.stress);
  store._notify("workouts", store.state.workouts);
  store._notify("device", store.state.device);
}

function renderWorkoutsMobile(wList) {
  const container = document.getElementById("workout-items-container");
  container.innerHTML = "";

  if (!wList || wList.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding: 20px; color:#8E8E93; font-size: 0.85rem;">
        No workout logs recorded yet. Sync your watch to see recorded activities.
      </div>
    `;
    document.getElementById("workouts-count-pill").textContent = "0 total";
    return;
  }

  document.getElementById("workouts-count-pill").textContent = `${wList.length} total`;

  wList.forEach(w => {
    const div = document.createElement("div");
    div.className = "workout-item-card";
    div.innerHTML = `
      <div class="w-item-left">
        <div class="w-badge">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#A4FF00">
            <path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.5 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7z"/>
          </svg>
        </div>
        <div>
          <div class="w-name">${w.type}</div>
          <div class="w-date">${w.time}</div>
        </div>
      </div>
      <div class="w-item-right">
        <div class="w-stat-col"><strong>${w.calories}</strong><span>ACTIVE CAL</span></div>
        <div class="w-stat-col"><strong>${w.duration}</strong><span>TIME</span></div>
        <div class="w-stat-col w-hr-col"><strong>${w.avgHr}</strong><span>AVG HR</span></div>
      </div>
    `;
    container.appendChild(div);
  });
}

// -------------------------------------------------------------
// Interactive Events
// -------------------------------------------------------------
function initInteractiveEvents() {
  const btnConnect = document.getElementById("btn-connect-ble");
  btnConnect.addEventListener("click", () => {
    if (window.BLEController) {
      if (window.BLEController.device && window.BLEController.device.gatt.connected) {
        window.BLEController.device.gatt.disconnect();
      } else {
        window.BLEController.requestConnection();
      }
    }
  });

  // Tab Navigation
  const tabButtons = document.querySelectorAll(".tab-item");
  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      tabButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const targetId = btn.getAttribute("data-target");
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });

  // Modal Dialog for .FIT import
  const modal = document.getElementById("import-modal");
  const openBtn = document.getElementById("btn-open-import");
  const closeBtn = document.getElementById("modal-close-btn");
  const dropzone = document.getElementById("modal-dropzone");
  const fileInput = document.getElementById("fit-file-input");

  openBtn.addEventListener("click", () => modal.classList.add("active"));
  closeBtn.addEventListener("click", () => modal.classList.remove("active"));
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.remove("active");
  });

  dropzone.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const res = BrowserFitParser.parseArrayBuffer(evt.target.result);
          BrowserFitParser.applyToStore(res, file.name);
          document.getElementById("modal-status").innerHTML = `<span style="color:#30D158">Successfully parsed ${file.name}</span>`;
          setTimeout(() => modal.classList.remove("active"), 1200);
        } catch (err) {
          document.getElementById("modal-status").innerHTML = `<span style="color:#FF453A">Error: ${err.message}</span>`;
        }
      };
      reader.readAsArrayBuffer(file);
    }
  });
}
