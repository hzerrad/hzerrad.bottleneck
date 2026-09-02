"use strict"
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { loadQmlJs } = require("./load.js")

const Gpu = loadQmlJs("lib/Gpu.js")
const fixture = n => fs.readFileSync(path.join(__dirname, "fixtures", n), "utf8")

test("detectBackend prefers nvidia, then amd, then intel", () => {
  assert.equal(Gpu.detectBackend({ hasNvidiaSmi: true, amdBusyPaths: [], intelFreqPaths: [] }), "nvidia")
  assert.equal(Gpu.detectBackend({ hasNvidiaSmi: false, amdBusyPaths: ["/sys/x"], intelFreqPaths: [] }), "amd")
  assert.equal(Gpu.detectBackend({ hasNvidiaSmi: false, amdBusyPaths: [], intelFreqPaths: ["/sys/y"] }), "intel")
})

// absent != zero: an unmeasurable GPU leaves the ranking, not enters at 0%.
test("detectBackend reports none when nothing is measurable", () => {
  assert.equal(Gpu.detectBackend({ hasNvidiaSmi: false, amdBusyPaths: [], intelFreqPaths: [] }), "none")
})

test("nvidiaQueryArgs streams rather than spawning per sample", () => {
  const args = Gpu.nvidiaQueryArgs(2000)
  assert.ok(args.includes("--loop-ms=2000"))
  assert.ok(args.some(a => a.indexOf("utilization.gpu") !== -1))
  assert.ok(args.some(a => a.indexOf("noheader") !== -1 && a.indexOf("nounits") !== -1))
})

test("parseNvidiaCsv reads a real line from this machine", () => {
  const g = Gpu.parseNvidiaCsv(fixture("nvidia-smi.csv").trim())
  assert.equal(g.vramTotalMiB, 12282)
  assert.ok(g.utilPct >= 0 && g.utilPct <= 100)
  assert.ok(g.tempC > 0)
})

test("parseNvidiaCsv returns null on junk instead of guessing", () => {
  assert.equal(Gpu.parseNvidiaCsv(""), null)
  assert.equal(Gpu.parseNvidiaCsv("[N/A], [N/A]"), null)
  assert.equal(Gpu.parseNvidiaCsv("17, 1892"), null)
})

// amdgpu and i915 publish sysfs files, not a query interface, so the shell
// emits "key value" lines and the parser takes whatever is present.
test("parseSysfsKv reads key/value lines and ignores junk", () => {
  const kv = Gpu.parseSysfsKv("busy 42\nvram_used 1048576\nragged\n\ntemp 54000")
  assert.equal(kv.busy, 42)
  assert.equal(kv.vram_used, 1048576)
  assert.equal(kv.temp, 54000)
  assert.equal(kv.ragged, undefined)
})

test("amdSample fills the whole shape, converting units", () => {
  const g = Gpu.amdSample(Gpu.parseSysfsKv(fixture("amd-sysfs.txt")))
  assert.equal(g.utilPct, 42)
  assert.equal(g.vramUsedMiB, 2160)
  assert.equal(g.vramTotalMiB, 8176)
  assert.equal(g.tempC, 54)
  assert.equal(g.watts, 45)
})

// Without a utilisation figure the GPU must leave the ranking entirely --
// buildResources reads utilPct unconditionally once a sample exists.
test("amdSample returns null when busy is unreadable", () => {
  assert.equal(Gpu.amdSample({ temp: 54000 }), null)
  assert.equal(Gpu.amdSample({}), null)
})

test("amdSample omits vram and watts it cannot read", () => {
  const g = Gpu.amdSample({ busy: 7 })
  assert.equal(g.utilPct, 7)
  assert.equal(g.vramTotalMiB, 0)
  assert.equal(g.watts, null)
})

// i915 exposes no utilisation, so the clock ratio stands in for one.
test("intelSample derives utilPct from the clock ratio", () => {
  const g = Gpu.intelSample(Gpu.parseSysfsKv(fixture("intel-sysfs.txt")))
  assert.equal(g.utilPct, 75)
  assert.equal(g.tempC, 52)
})

test("intelSample reports no vram, which is shared system memory", () => {
  const g = Gpu.intelSample({ act_freq: 700, max_freq: 1400 })
  assert.equal(g.vramTotalMiB, 0)
})

test("intelSample returns null without a usable clock pair", () => {
  assert.equal(Gpu.intelSample({ temp: 52000 }), null)
  assert.equal(Gpu.intelSample({ act_freq: 700, max_freq: 0 }), null)
})

test("sample commands read the documented sysfs attributes", () => {
  assert.ok(Gpu.amdSampleCommand().indexOf("gpu_busy_percent") !== -1)
  assert.ok(Gpu.amdSampleCommand().indexOf("mem_info_vram_total") !== -1)
  assert.ok(Gpu.intelSampleCommand().indexOf("act_freq_mhz") !== -1)
})
