"use strict"
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { loadQmlJs } = require("./load.js")

const Proc = loadQmlJs("lib/Proc.js")
const fixture = n => fs.readFileSync(path.join(__dirname, "fixtures", n), "utf8")

test("parseMeminfo converts kB to bytes", () => {
  const m = Proc.parseMeminfo(fixture("meminfo.txt"))
  assert.equal(m.memTotal, 32680372 * 1024)
  assert.equal(m.memAvailable, 23460612 * 1024)
  assert.equal(m.swapTotal, 65360308 * 1024)
})

test("memUsedPct uses MemAvailable, not MemFree", () => {
  const m = Proc.parseMeminfo(fixture("meminfo.txt"))
  assert.equal(Math.round(Proc.memUsedPct(m)), 28)
})

test("swapUsedPct is 0 on an untouched swap and safe with no swap", () => {
  const m = Proc.parseMeminfo(fixture("meminfo.txt"))
  assert.equal(Proc.swapUsedPct(m), 0)
  assert.equal(Proc.swapUsedPct({ swapTotal: 0, swapFree: 0 }), 0)
})

// Steady swap is cold pages; growing swap is active reclaim. Only the slope
// is an anomaly.
test("swapGrowing detects only strict growth over n samples", () => {
  assert.equal(Proc.swapGrowing([10, 20, 30], 3), true)
  assert.equal(Proc.swapGrowing([30, 30, 30], 3), false)
  assert.equal(Proc.swapGrowing([10, 30, 20], 3), false)
  assert.equal(Proc.swapGrowing([30], 3), false)
})
