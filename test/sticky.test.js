"use strict"
const test = require("node:test")
const assert = require("node:assert/strict")
const { loadQmlJs } = require("./load.js")

const Sticky = loadQmlJs("lib/Sticky.js")

test("mergeSticky seeds from empty previous with several eligible keys", () => {
  const r = Sticky.mergeSticky({}, ["ram", "gpu", "diskio"])
  assert.deepEqual(r.keys, { ram: true, gpu: true, diskio: true })
  assert.equal(r.grew, true)
})

test("mergeSticky does not report growth when nothing is new", () => {
  const r = Sticky.mergeSticky({ ram: true }, ["ram"])
  assert.deepEqual(r.keys, { ram: true })
  assert.equal(r.grew, false)
})

// The whole point of the module: rows already stuck stay stuck even once
// they drop out of the eligible set, so the list never flickers. This is
// also what "expanding must never show less" relies on in Overview.qml's
// expandedRows — a condition whose anomaly has since cleared is still
// shown there because it is still in stickyKeys, not because it is still
// anomalous.
test("mergeSticky keeps previously-sticky keys even when they drop out of eligible", () => {
  const r = Sticky.mergeSticky({ ram: true, swap: true }, ["ram"])
  assert.deepEqual(r.keys, { ram: true, swap: true })
  assert.equal(r.grew, false)
})

test("mergeSticky preserves previous unchanged when eligible is empty", () => {
  const r = Sticky.mergeSticky({ ram: true, cputemp: true }, [])
  assert.deepEqual(r.keys, { ram: true, cputemp: true })
  assert.equal(r.grew, false)
})

test("mergeSticky grows and preserves together", () => {
  const r = Sticky.mergeSticky({ ram: true }, ["ram", "gpu"])
  assert.deepEqual(r.keys, { ram: true, gpu: true })
  assert.equal(r.grew, true)
})
