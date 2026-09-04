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

const PCORE = { key: "pcore", label: "P-cores", display: "50%", ranks: true }
const RAM = { key: "ram", label: "RAM", display: "88%", ranks: true }
const DISKIO = { key: "diskio", label: "Disk I/O", display: "97%", ranks: true }

test("headline names the process when one earns it", () => {
  const h = V.headline({
    constraint: PCORE, band: "loaded", trend: "climbing", duration: "16s",
    attribution: { name: "chrome", share: 0.9, confident: true, count: 12 }
  })
  assert.equal(h.verdict, "Chrome is pinning your P-cores")
  assert.equal(h.evidence, "about 90% of the CPU in use, climbing for 16s")
})

test("headline uses the resource's own verb", () => {
  const h = V.headline({
    constraint: RAM, band: "strained", trend: "steady", duration: "4m2s",
    attribution: { name: "code", share: 0.62, confident: true, count: 9 }
  })
  assert.equal(h.verdict, "Code is holding your RAM")
  assert.equal(h.evidence, "about 60% of what's in use, steady for 4m2s")
})

// The failure that would cost the plugin its credibility permanently.
test("headline refuses to name a process on a diffuse load", () => {
  const h = V.headline({
    constraint: PCORE, band: "loaded", trend: "climbing", duration: "16s",
    attribution: { name: "slack", share: 0.12, confident: false, count: 20 }
  })
  assert.equal(h.verdict, "P-cores are busy across 20 processes")
  assert.equal(h.evidence, "no single cause, climbing for 16s")
})

test("headline falls back to description when nothing can be attributed", () => {
  const h = V.headline({
    constraint: DISKIO, band: "strained", trend: "steady", duration: "2m10s",
    attribution: null
  })
  assert.equal(h.verdict, "Disk I/O is your tightest resource")
  assert.equal(h.evidence, "steady for 2m10s")
})

test("headline agrees in number with the resource", () => {
  const diffuse = { name: "x", share: 0.1, confident: false, count: 5 }
  assert.equal(
    V.headline({ constraint: RAM, band: "loaded", trend: "steady", duration: "1s", attribution: diffuse }).verdict,
    "RAM is busy across 5 processes")
  assert.equal(
    V.headline({ constraint: PCORE, band: "loaded", trend: "steady", duration: "1s", attribution: diffuse }).verdict,
    "P-cores are busy across 5 processes")
})

// duration is svc.since's age — how long the constraint has held its
// position — not how long the alarm has been active, so it must never
// appear beside the alarm's evidence even when a duration is supplied.
test("headline leads with the alarm over the constraint", () => {
  const h = V.headline({
    constraint: PCORE, band: "loaded", trend: "steady", duration: "2m10s",
    alarm: { key: "cputemp", label: "CPU temp", display: "91°C", ranks: false },
    attribution: { name: "chrome", share: 0.9, confident: true, count: 4 }
  })
  assert.equal(h.verdict, "Your CPU is running hot")
  assert.equal(h.evidence, "at 91°C")
})

test("headline is reassuring when the constraint is calm", () => {
  const h = V.headline({
    constraint: { key: "pcore", label: "P-cores", display: "12%", ranks: true },
    band: "calm", trend: "steady", duration: "5m"
  })
  assert.equal(h.verdict, "Nothing is holding you back")
  assert.equal(h.evidence, "Closest is P-cores, at 12%")
})

test("headline copes with no constraint at all", () => {
  const h = V.headline({ constraint: null, band: "calm" })
  assert.equal(h.verdict, "Nothing is holding you back")
  assert.equal(h.evidence, "")
})

test("summaryLines names the next resource when some are shown", () => {
  const hidden = [{ label: "RAM", display: "31%" }, { label: "GPU", display: "6%" }]
  const s = V.summaryLines(1, hidden, 7)
  assert.equal(s.first, "Everything else has room.")
  assert.equal(s.second, "RAM is next at 31%.")
})

test("summaryLines says so when nothing is above the threshold", () => {
  const hidden = [{ label: "RAM", display: "31%" }, { label: "GPU", display: "6%" }]
  const s = V.summaryLines(0, hidden, 7)
  assert.equal(s.first, "All 7 resources have room.")
  assert.equal(s.second, "")
})

test("summaryLines names the last one outright", () => {
  const s = V.summaryLines(6, [{ label: "Swap", display: "1%" }], 7)
  assert.equal(s.first, "Swap is the only other one, at 1%.")
  assert.equal(s.second, "")
})

test("summaryLines is silent when everything is already shown", () => {
  const s = V.summaryLines(7, [], 7)
  assert.equal(s.first, "")
  assert.equal(s.second, "")
})
