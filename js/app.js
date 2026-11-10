// Project Venu - Main Reactive Application Controller
// Reactive Apple Health & Fitness Experience with Live Garmin Venu 3 BLE

document.addEventListener("DOMContentLoaded", () => {
  setupDate();
  setupRings();
  bindReactiveUI();
  setupEventListeners();

  // Try auto-reconnect if already paired
  if (window.BLEController) {
    window.BLEController.autoReconnect();
  }
});

function setupDate() {
  const options = { weekday: 'long', month: 'long', day: 'numeric' };
  const d = new Date();
  document.getElementById("header-date").textContent = d.toLocaleDateString('en-US', options);
}

// Activity Rings Geometry Constants
const R_MOVE = 95;
const R_EXERCISE = 70;
const R_STAND = 45;
const C_MOVE = 2 * Math.PI * R_MOVE;
const C_EXER = 2 * Math.PI * R_EXERCISE;
const C_STAND = 2 * Math.PI * R_STAND;

function setupRings() {
  const moveArc = document.getElementById("ring-move-arc");
  const exerArc = document.getElementById("ring-exercise-arc");
  const standArc = document.getElementById("ring-stand-arc");

  moveArc.style.strokeDasharray = `${C_MOVE}`;
  exerArc.style.strokeDasharray = `${C_EXER}`;
  standArc.style.strokeDasharray = `${C_STAND}`;
}

let hrChart = null;

// Bind DOM to Reactive Store
function bindReactiveUI() {
  const store = window.AppStore;

  // 1. Device & Bluetooth State
  store.subscribe("device", (dev) => {
    const pill = document.getElementById("device-status-pill");
    const dot = document.getElementById("status-dot");
    const nameEl = document.getElementById("device-name");
    const subMsg = document.getElementById("device-status-msg");
    const battEl = document.getElementById("device-battery-pct");
    const liveHrPill = document.getElementById("live-hr-indicator");

    nameEl.textContent = dev.name;
    subMsg.textContent = dev.statusMessage;

    if (dev.connected) {
      dot.className = "status-dot connected";
      pill.classList.add("active");
      document.getElementById("btn-connect-ble").textContent = "Connected";
      document.getElementById("btn-connect-ble").classList.add("btn-connected");
      battEl.textContent = `${dev.battery}%`;
      liveHrPill.style.display = "inline-flex";
      document.getElementById("pill-live-bpm").textContent = dev.liveHr;
    } else if (dev.connecting) {
      dot.className = "status-dot connecting";
      document.getElementById("btn-connect-ble").textContent = "Connecting...";
      liveHrPill.style.display = "none";
    } else {
      dot.className = "status-dot disconnected";
      pill.classList.remove("active");
      document.getElementById("btn-connect-ble").textContent = "Connect Watch";
      document.getElementById("btn-connect-ble").classList.remove("btn-connected");
      liveHrPill.style.display = "none";
    }
  });

  // 2. Rings State
  store.subscribe("rings", (rings) => {
    const m = rings.move;
    const e = rings.exercise;
    const s = rings.stand;

    const mPct = m.current / m.goal;
    const ePct = e.current / e.goal;
    const sPct = s.current / s.goal;

    document.getElementById("ring-move-arc").style.strokeDashoffset = Math.max(0, C_MOVE * (1 - mPct));
    document.getElementById("ring-exercise-arc").style.strokeDashoffset = Math.max(0, C_EXER * (1 - ePct));
    document.getElementById("ring-stand-arc").style.strokeDashoffset = Math.max(0, C_STAND * (1 - sPct));

    document.getElementById("move-cur").textContent = m.current;
    document.getElementById("move-goal").textContent = m.goal;
    document.getElementById("move-pct").textContent = `${Math.round(mPct * 100)}%`;

    document.getElementById("exercise-cur").textContent = e.current;
    document.getElementById("exercise-goal").textContent = e.goal;
    document.getElementById("exercise-pct").textContent = `${Math.round(ePct * 100)}%`;

    document.getElementById("stand-cur").textContent = s.current;
    document.getElementById("stand-goal").textContent = s.goal;
    document.getElementById("stand-pct").textContent = `${Math.round(sPct * 100)}%`;
  });

  // 3. Heart Rate State
  store.subscribe("heartRate", (hr) => {
    document.getElementById("hr-current-val").textContent = hr.current;
    document.getElementById("hr-resting-val").textContent = hr.resting;
    document.getElementById("hr-walking-val").textContent = hr.walkingAvg;
    document.getElementById("hr-range-val").textContent = `${hr.min}–${hr.max}`;

    // Pulse animation
    const heartIcon = document.getElementById("live-heart-icon");
    heartIcon.classList.remove("beating");
    void heartIcon.offsetWidth; // trigger reflow
    heartIcon.classList.add("beating");

    renderHrChart(hr.dayCurve, hr.liveHistory);
  });

  // 4. Sleep State
  store.subscribe("sleep", (sleep) => {
    document.getElementById("sleep-score-val").textContent = sleep.score;
    document.getElementById("sleep-score-desc").textContent = sleep.scoreLabel;
    document.getElementById("sleep-asleep-val").textContent = sleep.timeAsleep;
    document.getElementById("sleep-inbed-val").textContent = sleep.timeInBed;
    document.getElementById("sleep-eff-val").textContent = sleep.efficiency;
    renderSleepCanvas(sleep);
  });

  // 5. Body Battery & Stress
  store.subscribe("bodyBattery", (bb) => {
    document.getElementById("bb-score").textContent = bb.current;
    document.getElementById("bb-fill").style.width = `${bb.current}%`;
    document.getElementById("bb-charge").textContent = bb.charged;
    document.getElementById("bb-drain").textContent = bb.drained;
    document.getElementById("bb-status-txt").textContent = bb.status;
  });

  store.subscribe("stress", (st) => {
    document.getElementById("stress-score-desc").textContent = `${st.label} (${st.score})`;
    document.getElementById("stress-rest-pct").textContent = `${st.rest}%`;
    document.getElementById("stress-low-pct").textContent = `${st.low}%`;
    document.getElementById("stress-med-pct").textContent = `${st.med}%`;
    document.getElementById("stress-high-pct").textContent = `${st.high}%`;
  });

  // 6. Workouts
  store.subscribe("workouts", (wList) => {
    renderWorkoutsList(wList);
  });

  // Trigger initial reactive updates
  store._notify("rings", store.state.rings);
  store._notify("heartRate", store.state.heartRate);
  store._notify("sleep", store.state.sleep);
  store._notify("bodyBattery", store.state.bodyBattery);
  store._notify("stress", store.state.stress);
  store._notify("workouts", store.state.workouts);
  store._notify("device", store.state.device);
}

// Render Heart Rate Chart
function renderHrChart(dayCurve, liveHistory) {
  const ctx = document.getElementById("hrChartCanvas").getContext("2d");

  const labels = dayCurve.map(d => d.time);
  const values = dayCurve.map(d => d.val);

  if (hrChart) {
    hrChart.data.labels = labels;
    hrChart.data.datasets[0].data = values;
    hrChart.update("none");
    return;
  }

  const gradient = ctx.createLinearGradient(0, 0, 0, 140);
  gradient.addColorStop(0, "rgba(255, 45, 85, 0.45)");
  gradient.addColorStop(1, "rgba(255, 45, 85, 0.0)");

  hrChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [{
        label: "BPM",
        data: values,
        borderColor: "#FF2D55",
        borderWidth: 2.2,
        tension: 0.38,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: "#FFFFFF",
        pointHoverBorderColor: "#FF2D55",
        fill: true,
        backgroundColor: gradient
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(28, 28, 30, 0.95)",
          borderColor: "rgba(255, 255, 255, 0.12)",
          borderWidth: 1,
          padding: 8,
          displayColors: false,
          callbacks: {
            label: (ctx) => `${ctx.parsed.y} BPM`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: "#636366", font: { size: 10 }, maxTicksLimit: 6 }
        },
        y: {
          grid: { color: "rgba(255, 255, 255, 0.06)", drawBorder: false },
          ticks: { color: "#636366", font: { size: 10 } },
          suggestedMin: 45,
          suggestedMax: 170
        }
      }
    }
  });
}

// Render Apple Health Sleep Hypnogram Canvas
function renderSleepCanvas(sleep) {
  const canvas = document.getElementById("sleepCanvas");
  const ctx = canvas.getContext("2d");
  const w = canvas.parentElement.clientWidth - 20;
  canvas.width = w;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  const stageY = { "Awake": 12, "REM": 32, "Core": 52, "Deep": 72 };
  const stageColors = { "Awake": "#8E8E93", "REM": "#BF5AF2", "Core": "#0A84FF", "Deep": "#0040DD" };

  // Subtle gridlines
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
    ctx.roundRect(currX, y - 4, segW, 8, 4);
    ctx.fill();

    currX += segW;
    prevY = y;
  });
}

// Render Workouts List
function renderWorkoutsList(wList) {
  const container = document.getElementById("workouts-container");
  container.innerHTML = "";

  document.getElementById("workout-badge-count").textContent = `${wList.length} total`;

  wList.forEach(w => {
    const item = document.createElement("div");
    item.className = "workout-row";
    item.innerHTML = `
      <div class="w-left">
        <div class="w-icon-badge">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#A4FF00">
            <path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.5 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7z"/>
          </svg>
        </div>
        <div>
          <div class="w-title">${w.type}</div>
          <div class="w-time-sub">${w.time}</div>
        </div>
      </div>
      <div class="w-right">
        <div class="w-col"><span class="w-num">${w.calories}</span><span class="w-sub">CAL</span></div>
        <div class="w-col"><span class="w-num">${w.duration}</span><span class="w-sub">TIME</span></div>
        ${w.distance !== "--" ? `<div class="w-col"><span class="w-num">${w.distance}</span><span class="w-sub">DIST</span></div>` : ''}
        <div class="w-col"><span class="w-num hr-num">${w.avgHr}</span><span class="w-sub">AVG HR</span></div>
      </div>
    `;
    container.appendChild(item);
  });
}

// Setup Event Listeners
function setupEventListeners() {
  const btnConnect = document.getElementById("btn-connect-ble");
  btnConnect.addEventListener("click", () => {
    if (window.BLEController.device && window.BLEController.device.gatt.connected) {
      window.BLEController.device.gatt.disconnect();
    } else {
      window.BLEController.requestConnection();
    }
  });

  const btnSim = document.getElementById("btn-toggle-sim");
  btnSim.addEventListener("click", () => {
    if (window.BLEController.isSimulating) {
      window.BLEController.stopSimulation();
      btnSim.classList.remove("active");
    } else {
      window.BLEController.startSimulation();
      btnSim.classList.add("active");
    }
  });

  // Modal Import File Handling
  const btnModal = document.getElementById("btn-open-import");
  const modal = document.getElementById("import-modal");
  const closeBtn = document.getElementById("modal-close-btn");
  const dropzone = document.getElementById("modal-dropzone");
  const fileInput = document.getElementById("fit-file-input");

  btnModal.addEventListener("click", () => modal.classList.add("active"));
  closeBtn.addEventListener("click", () => modal.classList.remove("active"));
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.remove("active");
  });

  dropzone.addEventListener("click", () => fileInput.click());

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });

  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleClientFitFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleClientFitFile(e.target.files[0]);
    }
  });

  // Window resize re-renders canvas
  window.addEventListener("resize", () => {
    renderSleepCanvas(AppStore.state.sleep);
  });
}

function handleClientFitFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const buffer = e.target.result;
      const res = BrowserFitParser.parseArrayBuffer(buffer);
      BrowserFitParser.applyToStore(res, file.name);
      document.getElementById("modal-status").innerHTML = `<span style="color:#30D158">Decoded ${res.recordsFound} points from ${file.name}</span>`;
      setTimeout(() => {
        document.getElementById("import-modal").classList.remove("active");
      }, 1500);
    } catch (err) {
      document.getElementById("modal-status").innerHTML = `<span style="color:#FF453A">Error parsing .FIT: ${err.message}</span>`;
    }
  };
  reader.readAsArrayBuffer(file);
}
