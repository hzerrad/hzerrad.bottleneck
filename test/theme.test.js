"use strict"
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { loadQmlJs } = require("./load.js")

const Theme = loadQmlJs("lib/Theme.js")
const fixture = n => fs.readFileSync(path.join(__dirname, "fixtures", n), "utf8")

test("parsePalette reads the named hues the Color singleton drops", () => {
  const p = Theme.parsePalette(fixture("colors-full.toml"))
  assert.equal(p.yellow, "#d8a548")
  assert.equal(p.orange, "#cb7f43")
})

// A gradient border and `mode = "dark"` are not colours.
test("parsePalette skips anything that is not a plain hex", () => {
  const p = Theme.parsePalette(fixture("colors-full.toml"))
  assert.equal(p.mode, undefined)
  assert.equal(p.hyprland_active_border, undefined)
})

test("parsePalette survives an absent or empty file", () => {
  assert.deepEqual(Theme.parsePalette(""), {})
  assert.deepEqual(Theme.parsePalette(null), {})
})

test("bandFor steps at calmThreshold and at 80", () => {
  assert.equal(Theme.bandFor(39, 40, false, true), "calm")
  assert.equal(Theme.bandFor(40, 40, false, true), "loaded")
  assert.equal(Theme.bandFor(79, 40, false, true), "loaded")
  assert.equal(Theme.bandFor(80, 40, false, true), "strained")
})

// Nothing is limited by a 45C chip, so conditions are never banded by pressure.
test("bandFor leaves healthy conditions calm whatever their pressure", () => {
  assert.equal(Theme.bandFor(45, 40, false, false), "calm")
  assert.equal(Theme.bandFor(92, 40, false, false), "calm")
  assert.equal(Theme.bandFor(92, 40, true, false), "alarm")
})

test("bandFor reports alarm ahead of any pressure band", () => {
  assert.equal(Theme.bandFor(10, 40, true, true), "alarm")
})

test("hueFor prefers the theme hue and falls back per band", () => {
  const full = Theme.parsePalette(fixture("colors-full.toml"))
  const bare = Theme.parsePalette(fixture("colors-nohues.toml"))
  const fb = { calm: "#707880", mid: "#cacccc", alarm: "#a55555" }
  assert.equal(Theme.hueFor("loaded", full, fb), "#d8a548")
  assert.equal(Theme.hueFor("strained", full, fb), "#cb7f43")
  assert.equal(Theme.hueFor("loaded", bare, fb), "#cacccc")
  assert.equal(Theme.hueFor("strained", bare, fb), "#cacccc")
  assert.equal(Theme.hueFor("alarm", full, fb), "#a55555")
  assert.equal(Theme.hueFor("calm", full, fb), "#707880")
})

// One threshold, two jobs: anything worth colouring is worth listing.
test("inSummary follows the colour rule exactly", () => {
  assert.equal(Theme.inSummary("calm"), false)
  assert.equal(Theme.inSummary("loaded"), true)
  assert.equal(Theme.inSummary("strained"), true)
  assert.equal(Theme.inSummary("alarm"), true)
})
