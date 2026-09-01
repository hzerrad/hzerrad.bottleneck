"use strict"
const test = require("node:test")
const assert = require("node:assert/strict")
const { loadQmlJs } = require("./load.js")

const P = loadQmlJs("lib/Pressure.js")
const TH = { alertTemp: 88, alertGpuTemp: 83, alertDisk: 90, alertVram: 95 }
const NOFLAGS = { swapGrowing: false, ramCritical: false, diskIoSaturated: false }
const r = (key, pressure, extra) => Object.assign({ key, pressure, label: key, glyph: "", display: "" }, extra || {})

// A GPU at 97% while gaming is the GPU doing its job, not an alarm.
test("busy is not broken", () => {
  assert.equal(P.classifyHealth(r("gpu", 0.97), TH, NOFLAGS), "ok")
  assert.equal(P.classifyHealth(r("pcore", 1.0), TH, NOFLAGS), "ok")
  assert.equal(P.classifyHealth(r("ecore", 1.0), TH, NOFLAGS), "ok")
})

test("thermal, disk and VRAM ceilings are anomalies", () => {
  assert.equal(P.classifyHealth(r("cputemp", 0.91), TH, NOFLAGS), "critical")
  assert.equal(P.classifyHealth(r("cputemp", 0.80), TH, NOFLAGS), "ok")
  assert.equal(P.classifyHealth(r("gputemp", 0.84), TH, NOFLAGS), "critical")
  assert.equal(P.classifyHealth(r("diskspace", 0.94), TH, NOFLAGS), "critical")
  assert.equal(P.classifyHealth(r("vram", 0.96), TH, NOFLAGS), "critical")
})

// High "used" is often cache; only critically low MemAvailable is an anomaly.
test("swap, RAM and disk I/O are anomalies only via their flags", () => {
  assert.equal(P.classifyHealth(r("swap", 0.02), TH, NOFLAGS), "ok")
  assert.equal(P.classifyHealth(r("swap", 0.02), TH, { ...NOFLAGS, swapGrowing: true }), "critical")
  assert.equal(P.classifyHealth(r("diskio", 0.99), TH, NOFLAGS), "ok")
  assert.equal(P.classifyHealth(r("diskio", 0.99), TH, { ...NOFLAGS, diskIoSaturated: true }), "critical")
  assert.equal(P.classifyHealth(r("ram", 0.92), TH, NOFLAGS), "ok")
  assert.equal(P.classifyHealth(r("ram", 0.92), TH, { ...NOFLAGS, ramCritical: true }), "critical")
})

test("detectAnomalies returns worst-first and is empty on a healthy box", () => {
  const rs = [r("gpu", 0.97), r("cputemp", 0.91), r("diskspace", 0.94)]
  const a = P.detectAnomalies(rs, TH, NOFLAGS)
  assert.deepEqual(a.map(x => x.key), ["diskspace", "cputemp"])
  assert.equal(P.detectAnomalies([r("gpu", 0.97)], TH, NOFLAGS).length, 0)
})

test("debounced requires a sustained streak", () => {
  assert.equal(P.debounced(2, 3), false)
  assert.equal(P.debounced(3, 3), true)
})

// Almost every hour of the day is calm: a bare pulse, no digits.
test("barState escalates with load and anomalies", () => {
  assert.equal(P.barState(r("pcore", 0.05), [], 40), "calm")
  assert.equal(P.barState(r("pcore", 0.61), [], 40), "loaded")
  assert.equal(P.barState(r("pcore", 0.96), [], 40), "strained")
  assert.equal(P.barState(r("pcore", 0.05), [r("cputemp", 0.91)], 40), "anomaly")
  assert.equal(P.barState(null, [], 40), "calm")
})

// Pinned at 90% for a minute is one spike, not thirty.
test("spikeOnsets fires on the crossing, not on every sample above it", () => {
  const hot = [r("pcore", 0.92), r("gpu", 0.30)]
  assert.deepEqual(P.spikeOnsets({}, hot, 70).map(x => x.key), ["pcore"])
  assert.deepEqual(P.spikeOnsets({ pcore: 0.92 }, hot, 70).map(x => x.key), [])
  assert.deepEqual(P.spikeOnsets({ pcore: 0.40 }, hot, 70).map(x => x.key), ["pcore"])
})

test("spikeOnsets ignores conditions", () => {
  const temp = Object.assign(r("cputemp", 0.95), { ranks: false })
  assert.deepEqual(P.spikeOnsets({}, [temp], 70), [])
})

test("pressureByKey snapshots the current pressures", () => {
  const m = P.pressureByKey([r("gpu", 0.5), r("ram", 0.25)])
  assert.equal(m.gpu, 0.5)
  assert.equal(m.ram, 0.25)
})
