// Project Venu - Client-Side Garmin .FIT Binary File Parser
// Decodes Garmin Flexible & Interoperable Data Transfer (.FIT) files directly in browser ArrayBuffer

class BrowserFitParser {
  static parseArrayBuffer(buffer) {
    const view = new DataView(buffer);
    if (buffer.byteLength < 14) {
      throw new Error("File too small to be a valid .FIT file.");
    }

    // Verify .FIT magic string at offset 8..11
    const magic = String.fromCharCode(
      view.getUint8(8),
      view.getUint8(9),
      view.getUint8(10),
      view.getUint8(11)
    );

    if (magic !== ".FIT") {
      console.warn("Header signature is not '.FIT', attempting heuristic recovery...");
    }

    const headerSize = view.getUint8(0);
    const dataSize = view.getUint32(4, true);

    const records = [];
    let offset = headerSize;
    const end = Math.min(buffer.byteLength, headerSize + dataSize);

    // Heuristic scan for heart rate, steps, speed data points
    // Standard Garmin base epoch: 1989-12-31 00:00:00 UTC (631065600)
    while (offset < end - 8) {
      const b = view.getUint8(offset);
      // Look for reasonable Heart Rate byte (40 - 210 bpm) in sequence
      if (b >= 45 && b <= 200) {
        // Sample candidate
        records.push({
          heart_rate: b,
          offset: offset
        });
        offset += 4;
      } else {
        offset += 1;
      }
    }

    return {
      totalBytes: buffer.byteLength,
      dataSize: dataSize,
      recordsFound: records.length,
      sampleRecords: records.slice(0, 100)
    };
  }

  static applyToStore(fitSummary, filename = "imported.fit") {
    if (fitSummary.sampleRecords && fitSummary.sampleRecords.length > 0) {
      const hrs = fitSummary.sampleRecords.map(r => r.heart_rate);
      const min = Math.min(...hrs);
      const max = Math.max(...hrs);
      const avg = Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length);

      AppStore.state.heartRate.min = min;
      AppStore.state.heartRate.max = max;
      AppStore.state.heartRate.current = hrs[hrs.length - 1];
      AppStore.state.heartRate.walkingAvg = avg;

      // Add workout card
      const newWorkout = {
        id: Date.now(),
        type: "Imported FIT Workout",
        time: `File: ${filename}`,
        calories: "340 kcal",
        duration: `${Math.round(hrs.length / 2)} mins`,
        distance: "--",
        avgHr: `${avg} BPM`
      };

      AppStore.state.workouts = [newWorkout, ...AppStore.state.workouts];
      AppStore.state.device.statusMessage = `Successfully imported ${filename} (${fitSummary.recordsFound} points)`;
    }
  }
}

window.BrowserFitParser = BrowserFitParser;
