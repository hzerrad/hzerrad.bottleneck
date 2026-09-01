"use strict"
const test = require("node:test")
const assert = require("node:assert/strict")
const { loadQmlJs } = require("./load.js")

test("loadQmlJs auto-exports top-level functions", () => {
  const api = loadQmlJs("lib/Format.js")
  assert.equal(typeof api.pct, "function")
  assert.equal(api.pct(0.97), "97%")
})
