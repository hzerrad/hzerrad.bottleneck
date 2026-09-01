"use strict"
const test = require("node:test")
const assert = require("node:assert/strict")
const { loadQmlJs } = require("./load.js")

const P = loadQmlJs("lib/Pressure.js")

const quiet = {
  pPct: 5, ePct: 2, memPct: 28, swapPct: 0,
  gpu: { utilPct: 3, vramUsedMiB: 500, vramTotalMiB: 12282, tempC: 40, watts: 12 },
  diskIo: [{ name: "nvme0n1", utilPct: 1 }],
  filesystems: [{ mount: "/", usedPct: 14 }],
  cpuTempC: 38, gpuTempC: 40
}
const keysOf = rs => rs.map(r => r.key)

test("buildResources emits every measurable resource", () => {
  const keys = keysOf(P.buildResources(quiet))
  for (const k of ["pcore", "ecore", "gpu", "vram", "ram", "diskio", "diskspace", "cputemp", "gputemp"]) {
    assert.ok(keys.includes(k), "missing " + k)
  }
})

test("an unmeasurable GPU leaves the ranking entirely", () => {
  const s = Object.assign({}, quiet, { gpu: null, gpuTempC: null })
  const keys = keysOf(P.buildResources(s))
  assert.equal(keys.includes("gpu"), false)
  assert.equal(keys.includes("vram"), false)
  assert.equal(keys.includes("gputemp"), false)
})

test("pressure is a 0-1 fraction", () => {
  const r = P.buildResources(quiet).find(x => x.key === "vram")
  assert.ok(Math.abs(r.pressure - 500 / 12282) < 0.001)
})

// Pinned P-cores must outrank idle E-cores, not be averaged with them.
test("rankConstraint picks pinned P-cores over idle E-cores", () => {
  const s = Object.assign({}, quiet, { pPct: 96, ePct: 3 })
  assert.equal(P.rankConstraint(P.buildResources(s)).key, "pcore")
})

test("rankConstraint picks the GPU when gaming", () => {
  const s = Object.assign({}, quiet, {
    pPct: 40,
    gpu: { utilPct: 97, vramUsedMiB: 6000, vramTotalMiB: 12282, tempC: 71, watts: 190 }
  })
  assert.equal(P.rankConstraint(P.buildResources(s)).key, "gpu")
})

test("rankConstraint returns null for an empty list", () => {
  assert.equal(P.rankConstraint([]), null)
})
