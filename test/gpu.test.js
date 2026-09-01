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
