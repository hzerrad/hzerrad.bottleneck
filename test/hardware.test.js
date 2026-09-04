"use strict"
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { loadQmlJs } = require("./load.js")

const H = loadQmlJs("lib/Hardware.js")
const fixture = n => fs.readFileSync(path.join(__dirname, "fixtures", n), "utf8")

test("parseCpuModel reads the model name", () => {
  assert.equal(H.parseCpuModel(fixture("cpuinfo.txt")), "Intel(R) Core(TM) i5-14600KF")
})

// /proc/cpuinfo repeats every field per logical CPU — 20 times on the author's
// machine. Taking the last match would work by accident; taking the first is
// the rule.
test("parseCpuModel takes the first match, not the last", () => {
  const two = "model name\t: First CPU\n\nprocessor\t: 1\nmodel name\t: Second CPU\n"
  assert.equal(H.parseCpuModel(two), "First CPU")
})

// Some ARM and older Xeon strings carry their own colon.
test("parseCpuModel splits on the first separator only", () => {
  assert.equal(H.parseCpuModel("model name\t: Thing: with a colon\n"), "Thing: with a colon")
})

test("parseCpuModel returns null when there is nothing to read", () => {
  assert.equal(H.parseCpuModel(""), null)
  assert.equal(H.parseCpuModel(null), null)
  assert.equal(H.parseCpuModel("processor\t: 0\ncpu MHz\t\t: 3494.000\n"), null)
  assert.equal(H.parseCpuModel("model name\t:   \n"), null)
})

test("gpuIdentity prefers a real name when the backend supplies one", () => {
  assert.equal(H.gpuIdentity("nvidia", "NVIDIA GeForce RTX 3060", "12.0 GB"),
    "NVIDIA GeForce RTX 3060")
})

// AMD and Intel publish no marketing name without a pci.ids parser, so they
// say what is actually knowable rather than nothing.
test("gpuIdentity falls back to backend and VRAM size", () => {
  assert.equal(H.gpuIdentity("amd", null, "16.0 GB"), "amd, 16.0 GB")
  assert.equal(H.gpuIdentity("intel", "", "2.0 GB"), "intel, 2.0 GB")
})

test("gpuIdentity degrades to the backend alone when VRAM is unknown", () => {
  assert.equal(H.gpuIdentity("intel", null, ""), "intel")
})

test("gpuIdentity is null when there is no GPU", () => {
  assert.equal(H.gpuIdentity("none", null, ""), null)
  assert.equal(H.gpuIdentity("", null, ""), null)
  assert.equal(H.gpuIdentity(null, null, ""), null)
})
