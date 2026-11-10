// Project Venu - Reactive State Store (Clean Real Data Only)
// No Mock or Fake Numbers - Shows Only Actual Watch Readings

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
    if (this.subscribers.has(path)) {
      this.subscribers.get(path).forEach(cb => cb(value, path));
    }
    const segments = path.split(".");
    for (let i = 1; i < segments.length; i++) {
      const parentPath = segments.slice(0, i).join(".");
      if (this.subscribers.has(parentPath)) {
        this.subscribers.get(parentPath).forEach(cb => cb(value, path));
      }
    }
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

// Initial state: Pure Zero / Awaiting Live Device Data
const defaultState = {
  device: {
    connected: false,
    connecting: false,
    name: "Garmin Venu 3",
    battery: null,
    liveHr: null,
    sensorContact: false,
    lastBeat: null,
    connectionType: "none",
    statusMessage: "Searching for paired Garmin Venu 3..."
  },
  rings: {
    move: { current: 0, goal: 600, unit: "CAL", color: "#FA114F" },
    exercise: { current: 0, goal: 30, unit: "MIN", color: "#A4FF00" },
    stand: { current: 0, goal: 12, unit: "HRS", color: "#00F0FF" }
  },
  heartRate: {
    current: null,
    resting: null,
    walkingAvg: null,
    min: null,
    max: null,
    liveHistory: [],
    dayCurve: [] // Only populated with real readings
  },
  sleep: {
    score: null,
    scoreLabel: "--",
    timeAsleep: "--",
    timeInBed: "--",
    efficiency: "--",
    stages: [],
    timeline: []
  },
  bodyBattery: {
    current: null,
    charged: 0,
    drained: 0,
    status: "Awaiting Watch Sync"
  },
  stress: {
    score: null,
    label: "--",
    rest: 0,
    low: 0,
    med: 0,
    high: 0
  },
  vitals: {
    spo2: { latest: "--", avg: "--" },
    respiration: { latest: "--", sleepAvg: "--" },
    hrv: { score: "--", status: "--" },
    skinTemp: { variation: "--", baseline: "--" }
  },
  workouts: [],
  ui: {
    tab: "summary",
    hasRealData: false
  }
};

window.AppStore = new ReactiveStore(defaultState);
