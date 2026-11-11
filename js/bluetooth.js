// Project Venu - Garmin Venu 3 Real Hardware Bluetooth Controller
// Verified against live Garmin Venu 3 BLE GATT (0x180D Heart Rate + 0x1814 RSC)

class GarminBLEController {
  constructor() {
    this.device = null;
    this.server = null;
    this.hrCharacteristic = null;
    this.rscCharacteristic = null;
    this.hrSamples = [];
    this.sessionStartTime = null;
    this.activeSeconds = 0;
    this.lastPacketTime = null;
  }

  isSupported() {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  // Automatic Background Detection & Reconnect for previously permitted devices
  async autoDetectAndConnect() {
    if (!this.isSupported()) {
      AppStore.state.device.statusMessage = "Web Bluetooth requires Chrome (Android/PC) or Bluefy (iOS).";
      return false;
    }

    if (navigator.bluetooth.getDevices) {
      try {
        const devices = await navigator.bluetooth.getDevices();
        const savedId = localStorage.getItem('venu_device_id');
        const garmin = devices.find(d =>
          (d.id && d.id === savedId) ||
          (d.name && (d.name.includes('Venu') || d.name.includes('Garmin')))
        );

        if (garmin) {
          AppStore.state.device.statusMessage = `Found paired ${garmin.name || 'Venu 3'}. Connecting...`;
          const ok = await this.connectDevice(garmin);
          if (ok) return true;

          // Fallback: watch for advertisement if GATT connect needed wake-up
          if (garmin.watchAdvertisements) {
            AppStore.state.device.statusMessage = `Listening for ${garmin.name || 'Venu 3'} broadcast...`;
            garmin.addEventListener('advertisementreceived', () => {
              this.connectDevice(garmin);
            }, { once: true });
            await garmin.watchAdvertisements();
            return true;
          }
        }
      } catch (e) {
        console.warn("Auto-detect check:", e);
      }
    }

    AppStore.state.device.statusMessage = "Ready. Tap 'Connect Watch' to pair Venu 3.";
    return false;
  }

  // User-Initiated Device Scan / Connect
  async requestConnection() {
    if (!this.isSupported()) {
      AppStore.state.device.statusMessage = "Web Bluetooth not supported here. Use Chrome on Android/PC or Bluefy on iOS.";
      return;
    }

    AppStore.state.device.connecting = true;
    AppStore.state.device.statusMessage = "Scanning for Venu 3 HR broadcast...";

    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: ['heart_rate'] },
          { namePrefix: 'Venu' },
          { namePrefix: 'Garmin' }
        ],
        optionalServices: [
          'heart_rate',
          'running_speed_and_cadence',
          'battery_service',
          'device_information',
          0x180D,
          0x1814,
          0x180F,
          0x180A
        ]
      });

      localStorage.setItem('venu_device_id', device.id);
      await this.connectDevice(device);
    } catch (err) {
      AppStore.state.device.connecting = false;
      AppStore.state.device.statusMessage = err.name === 'NotFoundError'
        ? "Cancelled. Ensure 'Broadcast Heart Rate' is ON on Venu 3."
        : `BLE Error: ${err.message}`;
      console.warn("Bluetooth requestDevice error:", err);
    }
  }

  async connectDevice(device) {
    this.device = device;
    device.removeEventListener('gattserverdisconnected', this._onDiscBound);
    this._onDiscBound = () => this.onDisconnected();
    device.addEventListener('gattserverdisconnected', this._onDiscBound);

    AppStore.state.device.connecting = true;
    AppStore.state.device.name = device.name || "Venu 3";
    AppStore.state.device.statusMessage = "Connecting to GATT services...";

    try {
      this.server = await device.gatt.connect();
      this.sessionStartTime = Date.now();
      this.lastPacketTime = Date.now();

      // 1. Subscribe to Heart Rate Service (0x180D -> 0x2A37)
      const hrService = await this.server.getPrimaryService('heart_rate');
      this.hrCharacteristic = await hrService.getCharacteristic('heart_rate_measurement');
      await this.hrCharacteristic.startNotifications();
      this.hrCharacteristic.addEventListener('characteristicvaluechanged', (e) => this.handleHeartRate(e));

      // 2. Subscribe to Running Speed & Cadence (0x1814 -> 0x2A53) if exposed
      try {
        const rscService = await this.server.getPrimaryService('running_speed_and_cadence');
        this.rscCharacteristic = await rscService.getCharacteristic('rsc_measurement');
        await this.rscCharacteristic.startNotifications();
        this.rscCharacteristic.addEventListener('characteristicvaluechanged', (e) => this.handleRsc(e));
      } catch (_) {
        // Optional when stationary
      }

      // 3. Optional Battery Service (0x180F)
      try {
        const battService = await this.server.getPrimaryService('battery_service');
        const battChar = await battService.getCharacteristic('battery_level');
        const bVal = await battChar.readValue();
        AppStore.state.device.battery = bVal.getUint8(0);
      } catch (_) {
        // Venu 3 HR broadcast does not expose 0x180F by default
      }

      AppStore.state.device.connected = true;
      AppStore.state.device.connecting = false;
      AppStore.state.device.connectionType = "bluetooth";
      AppStore.state.device.statusMessage = `Live Stream Active • ${device.name || 'Venu 3'}`;
      AppStore.state.ui.hasRealData = true;

      return true;
    } catch (err) {
      console.error("GATT connection failed:", err);
      AppStore.state.device.connected = false;
      AppStore.state.device.connecting = false;
      AppStore.state.device.statusMessage = `Connection failed: ${err.message}`;
      return false;
    }
  }

  handleHeartRate(event) {
    const data = event.target.value;
    if (!data || data.byteLength < 2) return;

    const flags = data.getUint8(0);
    let offset = 1;
    let hr = 0;

    if ((flags & 0x01) === 0) {
      hr = data.getUint8(offset);
      offset += 1;
    } else {
      hr = data.getUint16(offset, true);
      offset += 2;
    }

    const contactDetected = (flags & 0x06) === 0x06;

    // Optional Energy Expended (bit 3)
    if (flags & 0x08 && data.byteLength >= offset + 2) {
      offset += 2;
    }

    // Optional RR-Interval for live HRV (bit 4)
    let rrMs = null;
    if (flags & 0x10 && data.byteLength >= offset + 2) {
      const rrRaw = data.getUint16(offset, true);
      rrMs = Math.round((rrRaw / 1024) * 1000);
    }

    const now = Date.now();
    const dtSec = this.lastPacketTime ? Math.min(5, (now - this.lastPacketTime) / 1000) : 1;
    this.lastPacketTime = now;

    const timeStr = new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Record real sample
    this.hrSamples.push(hr);
    if (this.hrSamples.length > 300) this.hrSamples.shift();

    const minHr = Math.min(...this.hrSamples);
    const maxHr = Math.max(...this.hrSamples);
    const avgHr = Math.round(this.hrSamples.reduce((a, b) => a + b, 0) / this.hrSamples.length);

    // Update Device & Heart Rate State
    AppStore.state.device.liveHr = hr;
    AppStore.state.device.sensorContact = contactDetected;
    AppStore.state.device.lastBeat = now;

    AppStore.state.heartRate.current = hr;
    AppStore.state.heartRate.min = minHr;
    AppStore.state.heartRate.max = maxHr;
    AppStore.state.heartRate.walkingAvg = avgHr;
    AppStore.state.heartRate.resting = minHr;
    if (rrMs) {
      AppStore.state.heartRate.rrMs = rrMs;
      AppStore.state.vitals.hrv.score = `${rrMs} ms`;
    }

    // Append real data point to chart
    const curve = [...AppStore.state.heartRate.dayCurve, { time: timeStr, val: hr }];
    if (curve.length > 60) curve.shift();
    AppStore.state.heartRate.dayCurve = curve;

    // Calculate real Move calories & Exercise minutes from HR effort
    if (hr >= 95) {
      this.activeSeconds += dtSec;
      const kcalPerSec = Math.max(0.05, (hr - 60) * 0.0022);
      AppStore.state.rings.move.current = Math.round((AppStore.state.rings.move.current + kcalPerSec * dtSec) * 10) / 10;
      AppStore.state.rings.exercise.current = Math.floor(this.activeSeconds / 60);
    }

    if (navigator.vibrate && hr > 155) {
      navigator.vibrate(20);
    }
  }

  handleRsc(event) {
    const data = event.target.value;
    if (!data || data.byteLength < 4) return;
    const flags = data.getUint8(0);
    const speedRaw = data.getUint16(1, true); // 1/256 m/s
    const cadence = data.getUint8(3); // steps/min
    const isRunning = (flags & 0x04) !== 0;

    AppStore.state.rsc.speedKmh = ((speedRaw / 256) * 3.6).toFixed(1);
    AppStore.state.rsc.cadenceSpm = cadence;
    AppStore.state.rsc.isRunning = isRunning;
  }

  onDisconnected() {
    console.warn("Garmin Venu 3 disconnected.");
    AppStore.state.device.connected = false;
    AppStore.state.device.connecting = false;
    AppStore.state.device.statusMessage = "Watch disconnected. Tap 'Connect Watch' to reconnect.";
  }
}

window.BLEController = new GarminBLEController();
