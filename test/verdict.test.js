"use strict"
const test = require("node:test")
const assert = require("node:assert/strict")
const { loadQmlJs } = require("./load.js")

const V = loadQmlJs("lib/Verdict.js")

const flat = n => new Array(n).fill(0.4)
const rising = () => { const a = []; for (let i = 0; i < 30; i++) a.push(0.2 + i * 0.01); return a }
const falling = () => rising().slice().reverse()

test("trendOf will not commit without a full window", () => {
  assert.equal(V.trendOf([]), "steady")
  assert.equal(V.trendOf(null), "steady")
  assert.equal(V.trendOf(flat(29)), "steady")
})

test("trendOf reads direction across the window", () => {
  assert.equal(V.trendOf(rising()), "climbing")
  assert.equal(V.trendOf(falling()), "easing")
})

// Without the deadband the word flips every sample and the sentence becomes
// the noisiest thing on screen.
test("trendOf holds steady inside the deadband", () => {
  const jitter = flat(30).map((v, i) => v + (i % 2 ? 0.01 : -0.01))
  assert.equal(V.trendOf(jitter), "steady")
})

test("attribution names a process when one dominates its metric", () => {
  const dominant = [
    { name: "chrome", cpuPct: 180 },
    { name: "code", cpuPct: 12 },
    { name: "sh", cpuPct: 4 }
  ]
  const a = V.attribution(dominant, "cpuPct")
  assert.equal(a.name, "chrome")
  assert.equal(a.confident, true)
  assert.ok(a.share > 0.9)
})

test("attribution declines to guess when the load is diffuse", () => {
  const diffuse = []
  for (let i = 0; i < 20; i++) diffuse.push({ name: "p" + i, cpuPct: 6 })
  const a = V.attribution(diffuse, "cpuPct")
  assert.equal(a.confident, false)
  assert.equal(a.count, 20)
})

test("attribution is null when there is nothing to attribute", () => {
  assert.equal(V.attribution([], "cpuPct"), null)
  assert.equal(V.attribution(null, "cpuPct"), null)
  assert.equal(V.attribution([{ name: "x", cpuPct: 0 }], "cpuPct"), null)
})

test("attribution is confident at exactly half", () => {
  const even = [{ name: "a", memPct: 50 }, { name: "b", memPct: 50 }]
  assert.equal(V.attribution(even, "memPct").confident, true)
})

test("attribution reads whichever metric it is given", () => {
  const gpu = [{ name: "blender", smPct: 90, memPct: 10 }, { name: "Xorg", smPct: 5, memPct: 80 }]
  assert.equal(V.attribution(gpu, "smPct").name, "blender")
  assert.equal(V.attribution(gpu, "memPct").name, "Xorg")
})
