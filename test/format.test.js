"use strict"
const test = require("node:test")
const assert = require("node:assert/strict")
const { loadQmlJs } = require("./load.js")

const F = loadQmlJs("lib/Format.js")

test("pct rounds to whole percent", () => {
  assert.equal(F.pct(0.97), "97%")
  assert.equal(F.pct(0.005), "1%")
})

test("mib renders GB above 1024 MiB", () => {
  assert.equal(F.mib(512), "512 MB")
  assert.equal(F.mib(12282), "12.0 GB")
  assert.equal(F.mib(11673), "11.4 GB")
})

test("celsius and watts are compact", () => {
  assert.equal(F.celsius(91.4), "91°C")
  assert.equal(F.watts(18.12), "18W")
})

test("duration reads as elapsed time", () => {
  assert.equal(F.duration(4000), "4s")
  assert.equal(F.duration(40000), "40s")
  assert.equal(F.duration(95000), "1m35s")
  assert.equal(F.duration(3700000), "1h1m")
})

test("bytes scales to GB", () => {
  assert.equal(F.bytes(512), "512 B")
  assert.equal(F.bytes(33464700928), "31.2 GB")
})

test("ago reads as event age", () => {
  assert.equal(F.ago(1000), "now")
  assert.equal(F.ago(45000), "45s ago")
  assert.equal(F.ago(120000), "2m ago")
})
