// Project Venu - Garmin Venu 3 Real Hardware Bluetooth Controller
// Reads LIVE Vitals from Watch via Standard Bluetooth SIG GATT Services

class GarminBLEController {
  constructor() {
    this.device = null;
    this.server = null;
    this.hrCharacteristic = null;
    this.batteryCharacteristic = null;
    this.reconnectTimer = null;
  }

  isSupported() {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  // Automatic Background Detection & Reconnect
  async autoDetectAndConnect() {
    if (!this.isSupported()) {
      AppStore.state.device.statusMessage = "Web Bluetooth not supported in this browser (use Chrome or Bluefy on iOS).";
      return false;
    }

    // Check if browser has persistent permission for previously paired devices
    if (navigator.bluetooth.getDevices) {
      try {
        const devices = await navigator.bluetooth.getDevices();
        const savedId = localStorage.getItem('venu_device_id');
        const garmin = devices.find(d => 
          (d.id && d.id === savedId) || 
          (d.name && (d.name.includes('Garmin') || d.name.includes('Venu')))
        );

        if (garmin) {
          console.log("Auto-detected paired Garmin device:", garmin.name || garmin.id);
          AppStore.state.device.statusMessage = `Connecting to paired ${garmin.name || 'Garmin Watch'}...`;
          return await this.connectDevice(garmin);
        }
      } catch (e) {
        console.warn("Auto-detect getDevices failed:", e);
      }
    }

    AppStore.state.device.statusMessage = "Watch detected. Tap 'Connect Watch' to start live stream.";
    return false;
  }

  // User-Initiated Device Scan / Connect
  async requestConnection() {
    if (!this.isSupported()) {
      alert("Web Bluetooth is not supported in this browser. On iPhone/iOS, please open this link inside the free 'Bluefy' or 'WebBLE' browser from the App Store. On Android, use Chrome.");
      return;
    }

    AppStore.state.device.connecting = true;
    AppStore.state.device.statusMessage = "Opening Bluetooth selector... Select your Garmin Venu 3.";

    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: ['heart_rate'] },
          { namePrefix: 'Garmin' },
          { namePrefix: 'Venu' }
        ],
        optionalServices: [
          'battery_service',
          'device_information',
          0x180D, // Heart Rate
          0x180F, // Battery
          0x180A  // Device Information
        ]
      });

      localStorage.setItem('venu_device_id', device.id);
      await this.connectDevice(device);
    } catch (err) {
      AppStore.state.device.connecting = false;
      AppStore.state.device.statusMessage = "Pairing cancelled or watch not broadcasting. Ensure 'Broadcast Heart Rate' is ON.";
      console.warn("Bluetooth requestDevice error:", err);
    }
  }

  async connectDevice(device) {
    this.device = device;
    device.addEventListener('gattserverdisconnected', () => this.onDisconnected());

    AppStore.state.device.connecting = true;
    AppStore.state.device.name = device.name || "Garmin Venu 3";
    AppStore.state.device.statusMessage = "Connecting to watch GATT services...";

    try {
      this.server = await device.gatt.connect();

      // 1. Read Real Heart Rate Service
      try {
        const hrService = await this.server.getPrimaryService('heart_rate');
        this.hrCharacteristic = await hrService.getCharacteristic('heart_rate_measurement');
        await this.hrCharacteristic.startNotifications();
        this.hrCharacteristic.addEventListener('characteristicvaluechanged', (e) => this.handleHeartRate(e));
        console.log("Subscribed to Garmin Heart Rate notifications!");
      } catch (hrErr) {
        console.warn("Heart rate service subscription warning:", hrErr);
      }

      // 2. Read Real Battery Level
      try {
        const battService = await this.server.getPrimaryService('battery_service');
        this.batteryCharacteristic = await battService.getCharacteristic('battery_level');
        const bVal = await this.batteryCharacteristic.readValue();
        const bLevel = bVal.getUint8(0);
        AppStore.state.device.battery = bLevel;
        await this.batteryCharacteristic.startNotifications();
        this.batteryCharacteristic.addEventListener('characteristicvaluechanged', (e) => {
          AppStore.state.device.battery = e.target.value.getUint8(0);
        });
      } catch (bErr) {
        console.warn("Battery level read warning:", bErr);
      }

      // 3. Read Device Info
      try {
        const infoService = await this.server.getPrimaryService('device_information');
        const modelChar = await infoService.getCharacteristic('model_number_string');
        const modelVal = await modelChar.readValue();
        const decoder = new TextDecoder('utf-8');
        const modelStr = decoder.decode(modelVal).trim();
        if (modelStr) {
          AppStore.state.device.name = modelStr;
        }
      } catch (iErr) {
        // Optional
      }

      AppStore.state.device.connected = true;
      AppStore.state.device.connecting = false;
      AppStore.state.device.connectionType = "bluetooth";
      AppStore.state.device.statusMessage = `Connected to ${device.name || 'Garmin Venu 3'} • Live Data Active`;
      AppStore.state.ui.hasRealData = true;

      return true;
    } catch (err) {
      console.error("GATT connection failed:", err);
      AppStore.state.device.connected = false;
      AppStore.state.device.connecting = false;
      AppStore.state.device.statusMessage = "Connection failed. Please ensure watch is nearby with Broadcast Heart Rate ON.";
      return false;
    }
  }

  handleHeartRate(event) {
    const data = event.target.value;
    const flags = data.getUint8(0);

    let hr;
    let offset = 1;
    if ((flags & 0x01) === 0) {
      hr = data.getUint8(offset);
      offset += 1;
    } else {
      hr = data.getUint16(offset, true);
      offset += 2;
    }

    const contactDetected = (flags & 0x06) === 0x06;

    // Real Hardware Heart Rate Record
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    AppStore.state.device.liveHr = hr;
    AppStore.state.device.sensorContact = contactDetected;
    AppStore.state.device.lastBeat = Date.now();
    AppStore.state.heartRate.current = hr;

    // Real Min / Max tracking
    if (AppStore.state.heartRate.min === null || hr < AppStore.state.heartRate.min) {
      AppStore.state.heartRate.min = hr;
    }
    if (AppStore.state.heartRate.max === null || hr > AppStore.state.heartRate.max) {
      AppStore.state.heartRate.max = hr;
    }

    // Record Real Day Curve Point
    const curve = [...AppStore.state.heartRate.dayCurve];
    curve.push({ time: timeStr, val: hr });
    if (curve.length > 50) curve.shift(); // Keep last 50 real readings for responsive charting
    AppStore.state.heartRate.dayCurve = curve;

    // Real Live History Buffer
    const hist = [...AppStore.state.heartRate.liveHistory];
    hist.push(hr);
    if (hist.length > 20) hist.shift();
    AppStore.state.heartRate.liveHistory = hist;

    // Update Move Calories from real heart rate effort
    if (hr > 90) {
      AppStore.state.rings.move.current += 1;
    }

    // Haptic feedback on phone
    if (navigator.vibrate && hr > 150) {
      navigator.vibrate(20);
    }
  }

  onDisconnected() {
    console.warn("Garmin Venu 3 disconnected.");
    AppStore.state.device.connected = false;
    AppStore.state.device.connecting = false;
    AppStore.state.device.statusMessage = "Watch disconnected. Tap to reconnect.";
  }
}

window.BLEController = new GarminBLEController();
