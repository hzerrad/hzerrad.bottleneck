"use strict"
const test = require("node:test")
const assert = require("node:assert/strict")
const { loadQmlJs } = require("./load.js")

const Pressure = loadQmlJs("lib/Pressure.js")
const Theme = loadQmlJs("lib/Theme.js")

const r = pressure => ({ key: "pcore", label: "P-cores", glyph: "", pressure, display: "" })

// lib/Pressure.js's barState (bar cell) and lib/Theme.js's bandFor (panel
// rows) independently encode the same four-band ladder, including a
// duplicated hard-coded 80. BarWidget.qml carries a comment asserting the two
// agree; nothing enforced it before this test. Sweeping every integer
// percentage catches a boundary drifting out of step in either file.
test("barState and bandFor agree at every pressure, calm through strained", () => {
  for (let pct = 0; pct <= 100; pct++) {
    const state = Pressure.barState(r(pct / 100), [], 40)
    const band = Theme.bandFor(pct, 40, false, true)
    assert.equal(state, band, "disagreement at " + pct + "%")
  }
})

// The one place the two functions use different words for the same thing:
// barState calls it "anomaly", bandFor calls it "alarm". Confirm that
// renaming is the only difference and that it wins over the pressure band at
// every pressure, not just at the boundaries above.
test("barState's anomaly and bandFor's alarm agree once renamed", () => {
  for (let pct = 0; pct <= 100; pct += 5) {
    const state = Pressure.barState(r(pct / 100), [r(0.91)], 40)
    const band = Theme.bandFor(pct, 40, true, true)
    assert.equal(state, "anomaly")
    assert.equal(band, "alarm")
  }
})
