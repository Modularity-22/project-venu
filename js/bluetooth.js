// Project Venu - Web Bluetooth & Garmin Venu 3 BLE Controller
// Standard Bluetooth SIG GATT: Heart Rate (0x180D), Battery (0x180F), Device Info (0x180A)

class GarminBLEController {
  constructor() {
    this.device = null;
    this.server = null;
    this.hrCharacteristic = null;
    this.batteryCharacteristic = null;
    this.isSimulating = false;
    this.simulationInterval = null;
  }

  isSupported() {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  // Check if device was previously paired and auto-reconnect
  async autoReconnect() {
    if (!this.isSupported() || !navigator.bluetooth.getDevices) {
      return false;
    }

    try {
      const devices = await navigator.bluetooth.getDevices();
      const garminDevice = devices.find(d => 
        (d.name && (d.name.includes('Garmin') || d.name.includes('Venu'))) ||
        (d.id && localStorage.getItem('venu_device_id') === d.id)
      );

      if (garminDevice) {
        console.log("Found previously paired Garmin device:", garminDevice.name);
        AppStore.state.device.statusMessage = `Reconnecting to ${garminDevice.name}...`;
        return await this.connectDevice(garminDevice);
      }
    } catch (err) {
      console.warn("Auto-reconnect check:", err);
    }
    return false;
  }

  // Request user authorization & scan for Garmin Bluetooth broadcast
  async requestConnection() {
    if (!this.isSupported()) {
      AppStore.state.device.statusMessage = "iOS Safari blocks BLE. Use 'Bluefy' app or enjoy the live stream!";
      if (window.startLiveTelemetry) {
        window.startLiveTelemetry();
      }
      return;
    }

    AppStore.state.device.connecting = true;
    AppStore.state.device.statusMessage = "Scanning for Garmin Venu 3...";

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
      AppStore.state.device.statusMessage = "Pairing cancelled or timed out.";
      console.error("Bluetooth pairing error:", err);
    }
  }

  async connectDevice(device) {
    this.device = device;
    device.addEventListener('gattserverdisconnected', () => this.onDisconnected());

    AppStore.state.device.connecting = true;
    AppStore.state.device.name = device.name || "Garmin Venu 3";
    AppStore.state.device.statusMessage = "Connecting to GATT services...";

    try {
      this.server = await device.gatt.connect();

      // 1. Heart Rate Service
      try {
        const hrService = await this.server.getPrimaryService('heart_rate');
        this.hrCharacteristic = await hrService.getCharacteristic('heart_rate_measurement');
        await this.hrCharacteristic.startNotifications();
        this.hrCharacteristic.addEventListener('characteristicvaluechanged', (e) => this.handleHeartRate(e));
      } catch (hrErr) {
        console.warn("Heart rate service error:", hrErr);
      }

      // 2. Battery Service
      try {
        const batteryService = await this.server.getPrimaryService('battery_service');
        this.batteryCharacteristic = await batteryService.getCharacteristic('battery_level');
        const bVal = await this.batteryCharacteristic.readValue();
        const bLevel = bVal.getUint8(0);
        AppStore.state.device.battery = bLevel;
        await this.batteryCharacteristic.startNotifications();
        this.batteryCharacteristic.addEventListener('characteristicvaluechanged', (e) => {
          AppStore.state.device.battery = e.target.value.getUint8(0);
        });
      } catch (bErr) {
        console.warn("Battery service skip:", bErr);
      }

      // 3. Device Info (Model Name)
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
        console.log("Device info read skip:", iErr);
      }

      AppStore.state.device.connected = true;
      AppStore.state.device.connecting = false;
      AppStore.state.device.connectionType = "bluetooth";
      AppStore.state.device.statusMessage = `Connected to ${device.name}`;

      return true;
    } catch (err) {
      console.error("GATT connection failed:", err);
      AppStore.state.device.connected = false;
      AppStore.state.device.connecting = false;
      AppStore.state.device.statusMessage = "Connection failed. Please ensure watch is nearby.";
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

    // Update Reactive App Store
    AppStore.state.device.liveHr = hr;
    AppStore.state.device.sensorContact = contactDetected;
    AppStore.state.device.lastBeat = Date.now();
    AppStore.state.heartRate.current = hr;

    if (hr < AppStore.state.heartRate.min && hr > 40) {
      AppStore.state.heartRate.min = hr;
    }
    if (hr > AppStore.state.heartRate.max) {
      AppStore.state.heartRate.max = hr;
    }

    if (hr > 100) {
      AppStore.state.rings.move.current += 1;
    }

    if (navigator.vibrate && hr > 145) {
      navigator.vibrate(20);
    }
  }

  onDisconnected() {
    console.warn("Garmin device disconnected.");
    AppStore.state.device.connected = false;
    AppStore.state.device.connecting = false;
    AppStore.state.device.statusMessage = "Watch disconnected. Tap to reconnect.";
  }
}

window.BLEController = new GarminBLEController();
