"use strict"
const test = require("node:test")
const assert = require("node:assert/strict")
const { loadQmlJs } = require("./load.js")

const Proc = loadQmlJs("lib/Proc.js")

test("pickCoretempInput prefers the package sensor", () => {
  const labels = [
    { input: "temp2_input", label: "Core 0" },
    { input: "temp1_input", label: "Package id 0" },
    { input: "temp3_input", label: "Core 8" }
  ]
  assert.equal(Proc.pickCoretempInput(labels), "temp1_input")
})

test("pickCoretempInput falls back to a core, then to null", () => {
  assert.equal(Proc.pickCoretempInput([{ input: "temp5_input", label: "Core 4" }]), "temp5_input")
  assert.equal(Proc.pickCoretempInput([{ input: "temp9_input", label: "SYSTIN" }]), null)
  assert.equal(Proc.pickCoretempInput([]), null)
})

test("parseMilliC converts millidegrees and rejects junk", () => {
  assert.equal(Proc.parseMilliC("38000"), 38)
  assert.equal(Proc.parseMilliC("91500"), 91.5)
  assert.equal(Proc.parseMilliC(""), null)
  assert.equal(Proc.parseMilliC("n/a"), null)
})
