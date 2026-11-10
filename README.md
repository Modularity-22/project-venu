# Project Venu • Apple Health & Fitness Dashboard for Garmin Venu 3

[![Deploy to GitHub Pages](https://github.com/Modularity-22/project-venu/actions/workflows/deploy.yml/badge.svg)](https://github.com/Modularity-22/project-venu/actions/workflows/deploy.yml)

A fully **reactive mobile-first web app** that pairs with your **Garmin Venu 3 via Web Bluetooth (BLE)** directly from your phone (or PC) and showcases your live vitals, 24/7 logs, and activity records in the iconic aesthetic of the **Apple Watch / Apple Health** and **Apple Fitness** apps.

---

## 📱 Using on Your Phone

1. Open the hosted web app link on your phone (e.g. Chrome on Android, or Bluefy / WebBLE on iOS).
2. Tap **"Connect Watch"**:
   - The app uses the **Web Bluetooth API** to scan for your Garmin Venu 3.
   - If previously paired, it automatically reconnects using persistent authorization (`navigator.bluetooth.getDevices()`).
3. **Live Streaming Telemetry:**
   - As your Garmin watch transmits heart rate packets over BLE GATT (`0x180D`), the dashboard pulses with your live heartbeat.
   - Heart rate graphs, active Move calories, and workout timers react in real-time.
4. **Offline & Client-Side FIT Decoder:**
   - Drop or import any `.FIT` activity or monitoring log directly in your browser. All decoding happens locally with zero server dependency.

---

## 🎨 Apple Health & Fitness Visual Architecture

* **Apple Activity Rings (Move, Exercise, Stand):** Pure SVG concentric arcs with neon gradients (`#FA114F`, `#A4FF00`, `#00F0FF`) on true OLED black.
* **Apple Health Heart Rate Monitor:** Large real-time BPM counter with beating pulse animation, resting HR, walking avg, range, and interactive area chart.
* **Apple Health Sleep Hypnogram:** 4-tier sleep stage breakdown (**Awake**, **REM**, **Core**, **Deep**) with sleep score and efficiency ratings.
* **Garmin Venu 3 Recovery Suite:** Body Battery (0-100) charge/drain meter, 4-zone stress distribution, SpO2, and respiratory rate.
* **Workouts Log:** Apple Fitness workout capsules displaying distance, duration, calories, and average heart rate.

---

## ⚡ Technical Highlights

* **Fine-Grained Reactive Store (`state.js`):** Lightweight ES6 Proxy store dispatches micro-updates without full DOM re-renders.
* **Standard Bluetooth SIG GATT Profiles:**
  * `0x180D` (Heart Rate Service) & `0x2A37` (Measurement & RR-Intervals / HRV)
  * `0x180F` (Battery Service) & `0x2A19` (Battery Level)
  * `0x180A` (Device Information)
* **Zero Backend Required:** 100% static client-side JavaScript ready for GitHub Pages hosting.
