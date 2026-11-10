// Project Venu - Reactive State Store
// Powered by ES6 Proxy & Micro-Subscribers

class ReactiveStore {
  constructor(initialState) {
    this.subscribers = new Map();
    this.state = this._createProxy(initialState, "");
  }

  _createProxy(obj, path) {
    const self = this;
    return new Proxy(obj, {
      get(target, prop) {
        const val = target[prop];
        if (val !== null && typeof val === "object" && !(val instanceof ArrayBuffer)) {
          const subPath = path ? `${path}.${String(prop)}` : String(prop);
          return self._createProxy(val, subPath);
        }
        return val;
      },
      set(target, prop, value) {
        target[prop] = value;
        const currentPath = path ? `${path}.${String(prop)}` : String(prop);
        self._notify(currentPath, value);
        return true;
      }
    });
  }

  _notify(path, value) {
    // Exact path subscribers
    if (this.subscribers.has(path)) {
      this.subscribers.get(path).forEach(cb => cb(value, path));
    }
    // Prefix wildcards (e.g. 'heartRate' when 'heartRate.current' changes)
    const segments = path.split(".");
    for (let i = 1; i < segments.length; i++) {
      const parentPath = segments.slice(0, i).join(".");
      if (this.subscribers.has(parentPath)) {
        this.subscribers.get(parentPath).forEach(cb => cb(value, path));
      }
    }
    // Global '*' subscribers
    if (this.subscribers.has("*")) {
      this.subscribers.get("*").forEach(cb => cb(value, path));
    }
  }

  subscribe(path, callback) {
    if (!this.subscribers.has(path)) {
      this.subscribers.set(path, new Set());
    }
    this.subscribers.get(path).add(callback);
    return () => this.subscribers.get(path).delete(callback);
  }
}

// Initial application health & device state
const defaultState = {
  device: {
    connected: false,
    connecting: false,
    name: "Garmin Venu 3",
    battery: 84,
    liveHr: 72,
    sensorContact: true,
    lastBeat: Date.now(),
    connectionType: "none", // 'bluetooth', 'usb', 'simulated'
    statusMessage: "Tap Connect to pair via Bluetooth"
  },
  rings: {
    move: { current: 542, goal: 600, unit: "CAL", color: "#FA114F" },
    exercise: { current: 38, goal: 30, unit: "MIN", color: "#A4FF00" },
    stand: { current: 11, goal: 12, unit: "HRS", color: "#00F0FF" }
  },
  heartRate: {
    current: 72,
    resting: 58,
    walkingAvg: 92,
    min: 51,
    max: 164,
    liveHistory: [70, 71, 72, 73, 72, 71, 72, 74, 73, 72],
    dayCurve: [
      { time: "00:00", val: 54 }, { time: "02:00", val: 52 }, { time: "04:00", val: 51 },
      { time: "06:00", val: 56 }, { time: "07:15", val: 154 }, { time: "08:00", val: 82 },
      { time: "10:00", val: 74 }, { time: "12:00", val: 78 }, { time: "14:00", val: 71 },
      { time: "16:00", val: 76 }, { time: "18:00", val: 88 }, { time: "20:00", val: 68 },
      { time: "22:00", val: 62 }
    ]
  },
  sleep: {
    score: 86,
    scoreLabel: "Excellent",
    timeAsleep: "7 hr 18 min",
    timeInBed: "7 hr 45 min",
    efficiency: "94%",
    stages: [
      { stage: "Awake", pct: 5, duration: "24m", color: "#8E8E93" },
      { stage: "REM", pct: 23, duration: "1h 45m", color: "#BF5AF2" },
      { stage: "Core", pct: 53, duration: "4h 05m", color: "#0A84FF" },
      { stage: "Deep", pct: 19, duration: "1h 28m", color: "#0040DD" }
    ],
    timeline: [
      { stage: "Awake", duration: 10 },
      { stage: "Core", duration: 45 },
      { stage: "Deep", duration: 55 },
      { stage: "Core", duration: 40 },
      { stage: "REM", duration: 30 },
      { stage: "Core", duration: 55 },
      { stage: "Deep", duration: 33 },
      { stage: "REM", duration: 47 },
      { stage: "Awake", duration: 8 },
      { stage: "Core", duration: 62 },
      { stage: "REM", duration: 28 },
      { stage: "Core", duration: 46 }
    ]
  },
  bodyBattery: {
    current: 74,
    charged: 62,
    drained: 32,
    status: "Good Recovery"
  },
  stress: {
    score: 22,
    label: "Restful",
    rest: 70,
    low: 20,
    med: 8,
    high: 2
  },
  vitals: {
    spo2: { latest: "98%", avg: "97.8%" },
    respiration: { latest: "14", sleepAvg: "12.8" },
    hrv: { score: "68 ms", status: "Balanced" },
    skinTemp: { variation: "-0.1°C", baseline: "Consistent" }
  },
  workouts: [
    {
      id: 1,
      type: "Outdoor Run",
      time: "Today, 07:15 AM",
      calories: "412 kcal",
      duration: "34 mins",
      distance: "5.42 km",
      avgHr: "154 BPM"
    },
    {
      id: 2,
      type: "Functional Strength",
      time: "Today, 12:40 PM",
      calories: "130 kcal",
      duration: "22 mins",
      distance: "--",
      avgHr: "118 BPM"
    }
  ],
  ui: {
    tab: "summary", // 'summary' | 'live' | 'workouts'
    theme: "oled-black"
  }
};

window.AppStore = new ReactiveStore(defaultState);
