# Overview Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Bottleneck's ranked-percentage overview with a verdict-led panel that names what is limiting the machine, says what is doing it when that can be evidenced, and collapses to two sentences when nothing competes.

**Architecture:** All new logic lands in pure-JS modules under `lib/` (`Theme.js`, `Verdict.js`) that are unit-tested with `node --test`, matching the existing `lib/` convention. `Service.qml` gains a watched `FileView` on the theme's `colors.toml` and a process sample taken for the constraint's own dimension. The compact overview moves out of `Panel.qml` into `components/Overview.qml`, which consumes the two new libraries. Sampling, ranking and anomaly detection are untouched.

**Tech Stack:** QML (Quickshell), plain ES5-style JavaScript in `lib/`, `node:test` + `node:assert/strict` for tests.

**Spec:** `docs/superpowers/specs/2026-09-04-overview-redesign-design.md`

## Global Constraints

- `lib/*.js` must contain **no Qt or QML types** — they are loaded by `test/load.js`, which executes the source in a bare `Function` sandbox and harvests top-level `function` declarations. Only top-level `function name(...)` declarations are exported.
- Write ES5-style JavaScript in `lib/` (`var`, no arrow functions, no template literals, no `const`/`let`) to match the existing modules and the QML JS engine.
- Tests use `"use strict"`, `require("node:test")`, `require("node:assert/strict")`, and `loadQmlJs()` from `./load.js`.
- `calmThreshold` (default 40) governs **both** colour and summary inclusion. Never introduce a second threshold.
- Bands: `calm` (under `calmThreshold`), `loaded` (`calmThreshold`–79), `strained` (80+), `alarm` (anomalous).
- Resources with `ranks === false` (conditions: `cputemp`, `gputemp`, `diskspace`) are never banded by pressure — they reach `alarm` only via `detectAnomalies`, and are otherwise `calm`.
- Only `yellow` and `orange` are read from `colors.toml`. `Color.urgent` is already the theme's `red`; `Color.muted` is calm; `Color.accent` is the mid fallback.
- Copy rules: sentence case, active voice, no middle-dot meta strings (`A · B · C`), no trailing arrows, no ALL-CAPS labels.
- Attribution names a process only at `share >= 0.5`, computed **within a single metric's sample**.
- Out of scope: the Full details section of `Panel.qml` (spikes, top processes, CPU cores, memory, storage). Do not modify it.
- Run the full suite with `node --test test/` before every commit.

## File Structure

**Create**

| File | Responsibility |
|---|---|
| `lib/Theme.js` | Parse `colors.toml`; map pressure→band; map band→hue with per-band fallback |
| `lib/Verdict.js` | Trend word, attribution confidence, headline sentences, summary sentences |
| `components/PressureTrack.qml` | Proportional band-coloured fill track |
| `components/Overview.qml` | Hero, densities, inline control |
| `test/theme.test.js`, `test/verdict.test.js` | Coverage for the two libraries |
| `test/fixtures/colors-full.toml`, `test/fixtures/colors-nohues.toml` | Theme parsing fixtures |

**Modify**

| File | Change |
|---|---|
| `Service.qml` | `themePalette` via watched `FileView`; `isAnomalous`/`bandOf` helpers; constraint-dimension `ps` sample; `overviewDensity` |
| `Panel.qml` | Compact section replaced by `Overview`; Full details untouched |
| `BarWidget.qml` | `tone` derived from band |
| `manifest.json` | `overviewDensity` default + schema entry |
| `README.md` | Bar states, settings table, theme-colour note |

---

### Task 1: Theme parsing and banding

**Files:**
- Create: `lib/Theme.js`
- Create: `test/theme.test.js`
- Create: `test/fixtures/colors-full.toml`
- Create: `test/fixtures/colors-nohues.toml`

**Interfaces:**
- Consumes: nothing.
- Produces: `parsePalette(raw) -> {key: "#rrggbb"}`, `bandFor(pressurePct, calmThreshold, anomalous, ranks) -> "calm"|"loaded"|"strained"|"alarm"`, `hueFor(band, palette, fallback) -> "#rrggbb"` where `fallback` is `{calm, mid, alarm}`, `inSummary(band) -> bool`.

- [ ] **Step 1: Write the fixtures**

`test/fixtures/colors-full.toml`:

```toml
# Dunan — a Suikoden II theme for Omarchy
mode = "dark"

accent    = "#d8a548"
muted     = "#55648a"

background = "#141c33"
foreground = "#e6dabc"

red     = "#c85a52"
yellow  = "#d8a548"
orange  = "#cb7f43"
green   = "#7f9c5f"

hyprland_active_border = "rgba(d8a548ee) rgba(9ed6e2ee) 45deg"
```

`test/fixtures/colors-nohues.toml`:

```toml
mode = "dark"
accent     = "#cacccc"
background = "#101315"
foreground = "#cacccc"
```

- [ ] **Step 2: Write the failing test**

`test/theme.test.js`:

```js
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test test/theme.test.js`
Expected: FAIL — `Error: ENOENT ... lib/Theme.js` from `loadQmlJs`.

- [ ] **Step 4: Write the implementation**

`lib/Theme.js`:

```js
// Maps pressure to a colour band, and a band to a hex from the active theme.
//
// The shell's Color singleton keeps five tokens, which is not enough for a
// four-step ramp — and on the stock theme `accent` and `foreground` are the
// same value. Color.loadColors already assigns the theme's `red` to
// Color.urgent, so `yellow` and `orange` are the only hues it drops and the
// only ones read here.

// Deliberately not a TOML parser: colors.toml is flat key = "#rrggbb" pairs
// with no tables or arrays. Anything that is not a plain hex string is skipped
// rather than guessed at, so `mode = "dark"` and a gradient border cannot
// become colours.
function parsePalette(raw) {
  var out = {}
  var lines = String(raw || "").split("\n")
  for (var i = 0; i < lines.length; i++) {
    var m = lines[i].match(/^\s*([a-z_]+)\s*=\s*"(#[0-9a-fA-F]{6})"\s*$/)
    if (m) out[m[1]] = m[2]
  }
  return out
}

// Conditions (temps, disk space) are never measured against calmThreshold — a
// 45C chip is 0.45 pressure and entirely unremarkable — so they reach a
// coloured band only by being anomalous.
function bandFor(pressurePct, calmThreshold, anomalous, ranks) {
  if (anomalous) return "alarm"
  if (ranks === false) return "calm"
  if (pressurePct >= 80) return "strained"
  if (pressurePct >= calmThreshold) return "loaded"
  return "calm"
}

// Fallback is per band, not all-or-nothing: a theme with `yellow` but no
// `orange` keeps its own yellow and falls back only for strained.
function hueFor(band, palette, fallback) {
  if (band === "alarm") return fallback.alarm
  if (band === "calm") return fallback.calm
  var key = band === "strained" ? "orange" : "yellow"
  var v = palette ? palette[key] : null
  return v ? v : fallback.mid
}

// The colour rule and the collapse rule are the same rule.
function inSummary(band) {
  return band !== "calm"
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test test/theme.test.js`
Expected: PASS, 8 tests.

- [ ] **Step 6: Run the full suite**

Run: `node --test test/`
Expected: PASS, no regressions in the existing suites.

- [ ] **Step 7: Commit**

```bash
git add lib/Theme.js test/theme.test.js test/fixtures/colors-full.toml test/fixtures/colors-nohues.toml
git commit -m "feat: map pressure to a theme-derived colour band"
```

---

### Task 2: Trend and attribution

**Files:**
- Create: `lib/Verdict.js`
- Create: `test/verdict.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `trendOf(history) -> "climbing"|"steady"|"easing"` where `history` is an array of 0–1 pressure fractions; `attribution(list, metricKey) -> {name, share, confident, count}|null` where `list` is the output of `Proc.aggregateByName` (objects carrying `name`, `cpuPct`, `memPct`) or `Proc.parsePmon` (carrying `name`, `smPct`, `memPct`).

- [ ] **Step 1: Write the failing test**

`test/verdict.test.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/verdict.test.js`
Expected: FAIL — `Error: ENOENT ... lib/Verdict.js`.

- [ ] **Step 3: Write the implementation**

`lib/Verdict.js`:

```js
// Turns a ranked sample into a sentence. The panel's hero is the only place
// this plugin claims a cause, so the claim has to be earned.

// A word, not a graph. The deadband matters: without it the word flips on
// every sample and the sentence becomes the noisiest thing on screen.
var TREND_WINDOW = 30
var TREND_DEADBAND = 3

// history holds pressure fractions (0-1); the deadband is percentage points.
function trendOf(history) {
  if (!history || history.length < TREND_WINDOW) return "steady"
  var w = history.slice(history.length - TREND_WINDOW)
  var half = TREND_WINDOW / 2
  var older = 0
  var newer = 0
  var i
  for (i = 0; i < half; i++) older += w[i]
  for (i = half; i < TREND_WINDOW; i++) newer += w[i]
  var delta = ((newer - older) / half) * 100
  if (delta > TREND_DEADBAND) return "climbing"
  if (delta < -TREND_DEADBAND) return "easing"
  return "steady"
}

// ps %cpu is a lifetime average scaled to one core, so a share measured
// against system-wide busy percent would mix two incompatible numbers. This
// ratio stays inside one metric, which is sound whatever that metric's quirks.
var NAME_SHARE = 0.5

function attribution(list, metricKey) {
  if (!list || !list.length) return null
  var total = 0
  var top = null
  for (var i = 0; i < list.length; i++) {
    var v = list[i][metricKey] || 0
    total += v
    if (!top || v > (top[metricKey] || 0)) top = list[i]
  }
  if (total <= 0) return null
  var share = (top[metricKey] || 0) / total
  return {
    name: top.name,
    share: share,
    confident: share >= NAME_SHARE,
    count: list.length
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/verdict.test.js`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/Verdict.js test/verdict.test.js
git commit -m "feat: measure trend direction and attribution confidence"
```

---

### Task 3: Verdict and summary sentences

**Files:**
- Modify: `lib/Verdict.js` (append)
- Modify: `test/verdict.test.js` (append)

**Interfaces:**
- Consumes: `attribution()` and `trendOf()` from Task 2.
- Produces: `headline(o) -> {verdict, evidence}` where `o` is `{constraint, band, alarm, attribution, trend, duration}`; `summaryLines(shownCount, hidden, totalContended) -> {first, second}`.

Resource objects are those built by `lib/Pressure.js`: `{key, label, glyph, pressure, display, ranks}`.

- [ ] **Step 1: Write the failing test**

Append to `test/verdict.test.js`:

```js
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

test("headline leads with the alarm over the constraint", () => {
  const h = V.headline({
    constraint: PCORE, band: "loaded", trend: "steady", duration: "2m10s",
    alarm: { key: "cputemp", label: "CPU temp", display: "91°C", ranks: false },
    attribution: { name: "chrome", share: 0.9, confident: true, count: 4 }
  })
  assert.equal(h.verdict, "Your CPU is running hot")
  assert.equal(h.evidence, "at 91°C for 2m10s")
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/verdict.test.js`
Expected: FAIL — `TypeError: V.headline is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `lib/Verdict.js`:

```js
// The verb belongs to the resource, not to the sentence that uses it.
var VERBS = {
  pcore: "pinning", ecore: "pinning", ram: "holding",
  gpu: "driving", vram: "filling"
}

// "P-cores are", "RAM is". Only the core labels are plural.
var PLURAL = { pcore: true, ecore: true }

// What the attribution share is a share *of*, said in the user's terms.
var METRIC_LABEL = {
  pcore: "the CPU in use", ecore: "the CPU in use", ram: "what's in use",
  gpu: "GPU time", vram: "the VRAM in use"
}

// An alarm is a different sentence from a constraint: it says what is wrong,
// not what is tightest.
var ALARM = {
  ram: "Memory is nearly exhausted",
  swap: "Swap is filling",
  diskio: "Disk I/O is saturated",
  diskspace: "Your disk is nearly full",
  cputemp: "Your CPU is running hot",
  gputemp: "Your GPU is running hot",
  vram: "VRAM is nearly full"
}

function beVerb(key) { return PLURAL[key] ? "are" : "is" }

function capitalize(s) {
  var t = String(s || "")
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// The share does not deserve more precision than this.
function roundTo5(n) { return Math.round(n / 5) * 5 }

// o = { constraint, band, alarm, attribution, trend, duration }
function headline(o) {
  var since = o.duration ? " for " + o.duration : ""

  if (o.alarm) {
    return {
      verdict: ALARM[o.alarm.key] || (o.alarm.label + " needs attention"),
      evidence: "at " + o.alarm.display + since
    }
  }

  if (!o.constraint) {
    return { verdict: "Nothing is holding you back", evidence: "" }
  }

  var c = o.constraint

  if (o.band === "calm") {
    return {
      verdict: "Nothing is holding you back",
      evidence: "Closest is " + c.label + ", at " + c.display
    }
  }

  var tail = (o.trend || "steady") + since
  var a = o.attribution

  if (a && a.confident && VERBS[c.key]) {
    return {
      verdict: capitalize(a.name) + " is " + VERBS[c.key] + " your " + c.label,
      evidence: "about " + roundTo5(a.share * 100) + "% of " + METRIC_LABEL[c.key] + ", " + tail
    }
  }

  if (a && !a.confident) {
    return {
      verdict: c.label + " " + beVerb(c.key) + " busy across " + a.count + " processes",
      evidence: "no single cause, " + tail
    }
  }

  // Swap and disk I/O have no per-process attribution available, so they land
  // here by construction rather than by failure.
  return {
    verdict: c.label + " " + beVerb(c.key) + " your tightest resource",
    evidence: tail
  }
}

// The sentences that stand in for the rows the summary is not showing.
// `hidden` is ordered by descending pressure, so hidden[0] is the next one up.
function summaryLines(shownCount, hidden, totalContended) {
  if (!hidden || hidden.length === 0) return { first: "", second: "" }
  if (shownCount === 0) {
    return { first: "All " + totalContended + " resources have room.", second: "" }
  }
  if (hidden.length === 1) {
    return { first: hidden[0].label + " is the only other one, at " + hidden[0].display + ".", second: "" }
  }
  return {
    first: "Everything else has room.",
    second: hidden[0].label + " is next at " + hidden[0].display + "."
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/verdict.test.js`
Expected: PASS, 20 tests.

- [ ] **Step 5: Run the full suite**

Run: `node --test test/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/Verdict.js test/verdict.test.js
git commit -m "feat: compose the verdict and summary sentences"
```

---

### Task 4: Theme palette in the service

**Files:**
- Modify: `Service.qml`

**Interfaces:**
- Consumes: `Theme.parsePalette`, `Theme.bandFor` from Task 1.
- Produces: on the service — `themePalette` (object), `isAnomalous(key) -> bool`, `bandOf(resource) -> band string`.

There is no QML unit harness in this repo. This task is verified by running the shell.

- [ ] **Step 1: Add the import**

In `Service.qml`, after the existing `import "lib/Pressure.js" as Pressure` line:

```qml
import "lib/Theme.js" as Theme
```

- [ ] **Step 2: Add the palette property and watched file**

After the `property var notifiedKeys: ({})` line, add:

```qml
  property var themePalette: ({})
  readonly property string themePath:
    Quickshell.env("HOME") + "/.local/state/omarchy/current/theme/colors.toml"
```

Then, next to the other `FileView` declarations, add:

```qml
  // The shell's own Color.colorsFile sets watchChanges: false and depends on a
  // theme switch pushing its payload over shell IPC, which plugins never
  // receive. Watching the file is what makes a theme switch recolour us live.
  FileView {
    id: themeFile
    path: root.themePath
    watchChanges: true
    printErrors: false
    // text() is stale inside the change signal, so both paths route through
    // reload() -> onLoaded and always parse fresh content.
    onFileChanged: reload()
    onLoaded: root.themePalette = Theme.parsePalette(text())
    onLoadFailed: root.themePalette = ({})
  }
```

- [ ] **Step 3: Move `isAnomalous` onto the service and add `bandOf`**

Both surfaces need the same answer, so it belongs here rather than in `Panel.qml`. Add near the other functions:

```qml
  function isAnomalous(key) {
    for (var i = 0; i < anomalies.length; i++) if (anomalies[i].key === key) return true
    return false
  }

  // One rule, two jobs: the band decides both colour and summary inclusion.
  function bandOf(resource) {
    if (!resource) return "calm"
    return Theme.bandFor(resource.pressure * 100, calmThreshold,
                         isAnomalous(resource.key), resource.ranks)
  }
```

- [ ] **Step 4: Verify in the running shell**

```bash
omarchy-restart-shell
```

Open the panel, then confirm the palette parsed:

```bash
omarchy plugin list --json | grep -i bottleneck
```

Expected: the widget still renders exactly as before (nothing consumes `bandOf` yet) and the shell logs no QML errors. Check for errors with:

```bash
journalctl --user -u omarchy-shell -n 50 --no-pager | grep -i "bottleneck\|error" || echo "clean"
```

- [ ] **Step 5: Commit**

```bash
git add Service.qml
git commit -m "feat: read the theme palette and band resources in the service"
```

---

### Task 5: Constraint-dimension sampling and density state

**Files:**
- Modify: `Service.qml`

**Interfaces:**
- Consumes: `Proc.parsePsList`, `Proc.aggregateByName` (existing).
- Produces: on the service — `overviewDensity` (`"summary"`|`"all"`), `constraintMetric` (`""`|`"cpu"`|`"mem"`|`"gpusm"`|`"gpumem"`), `attributionList` (array), `attributionKey` (`""`|`"cpuPct"`|`"memPct"`|`"smPct"`).

- [ ] **Step 1: Add the density property**

Next to `property string procSort: "cpu"`, add:

```qml
  // Held here rather than on the panel because the service is keepLoaded, so
  // the choice survives the panel closing and reopening. Never written to disk.
  property string overviewDensity: "summary"   // summary | all
```

- [ ] **Step 2: Add the constraint metric mapping and its process**

After the `procProc` declaration, add:

```qml
  // The verdict needs the process list for the constraint's own dimension,
  // which is not necessarily the tab the Full details list is showing.
  readonly property string constraintMetric: {
    if (!constraint) return ""
    switch (constraint.key) {
      case "pcore": case "ecore": return "cpu"
      case "ram":                 return "mem"
      case "gpu":                 return "gpusm"
      case "vram":                return "gpumem"
      // Swap and disk I/O have no per-process source here.
      default:                    return ""
    }
  }

  property var constraintProcs: []

  Process {
    id: constraintProcProc
    command: ["sh", "-c",
      "ps -eo pid,comm,pcpu,pmem --sort=-" +
      (root.constraintMetric === "mem" ? "pmem" : "pcpu") +
      " --no-headers | head -40"]
    stdout: StdioCollector {
      onStreamFinished: {
        root.constraintProcs = Proc.aggregateByName(Proc.parsePsList(text),
          root.constraintMetric === "mem" ? "memPct" : "cpuPct")
      }
    }
  }

  readonly property var attributionList:
    (constraintMetric === "gpusm" || constraintMetric === "gpumem")
      ? gpuProcs : constraintProcs

  readonly property string attributionKey: {
    switch (constraintMetric) {
      case "cpu":    return "cpuPct"
      case "mem":    return "memPct"
      case "gpusm":  return "smPct"
      case "gpumem": return "memPct"
      default:       return ""
    }
  }
```

- [ ] **Step 3: Drive it from the existing detail tick**

In the `detailTick` Timer's `onTriggered` block, after the existing `procProc.running = true` line, add:

```qml
      if (root.constraintMetric === "cpu" || root.constraintMetric === "mem")
        constraintProcProc.running = true
```

Idle cost is unchanged: `detailTick` still runs only while `panelOpen` is true.

- [ ] **Step 4: Verify in the running shell**

```bash
omarchy-restart-shell
```

Open the panel and confirm no new errors:

```bash
journalctl --user -u omarchy-shell -n 50 --no-pager | grep -i "bottleneck\|error" || echo "clean"
```

Expected: clean. The panel is unchanged; the new properties have no consumer yet.

- [ ] **Step 5: Commit**

```bash
git add Service.qml
git commit -m "feat: sample processes for the constraint's own dimension"
```

---

### Task 6: The pressure track

**Files:**
- Create: `components/PressureTrack.qml`

**Interfaces:**
- Consumes: nothing.
- Produces: a component with `fraction` (real, 0–1), `tone` (color), `trackAlpha` (real, default 0.22).

- [ ] **Step 1: Write the component**

`components/PressureTrack.qml`:

```qml
import QtQuick
import qs.Commons

// How close a resource is to its own limit. A sparkline answers "is this
// moving"; this answers "how much room is left", which is the question the
// plugin is named after.
Item {
  id: root

  property real fraction: 0
  property color tone: Color.muted
  property real trackAlpha: 0.22

  implicitHeight: Math.max(2, Style.space(4))

  Rectangle {
    anchors.fill: parent
    radius: height / 2
    color: Qt.rgba(Color.muted.r, Color.muted.g, Color.muted.b, root.trackAlpha)
  }

  Rectangle {
    anchors.left: parent.left
    anchors.top: parent.top
    anchors.bottom: parent.bottom
    // A one-pixel sliver reads as a dot rather than as "nearly empty", so an
    // idle resource is drawn as genuinely empty.
    width: {
      var w = root.width * Math.max(0, Math.min(1, root.fraction))
      return w < 2 ? 0 : w
    }
    visible: width > 0
    radius: root.height / 2
    color: root.tone

    Behavior on width {
      NumberAnimation { duration: 180; easing.type: Easing.OutQuad }
    }
  }
}
```

The `Behavior` is the one piece of motion in the design: it answers a change in the data, showing what moved, rather than decorating the panel on load.

- [ ] **Step 2: Verify it loads**

```bash
omarchy plugin validate .
```

Expected: passes the manifest schema check with no QML syntax errors reported.

- [ ] **Step 3: Commit**

```bash
git add components/PressureTrack.qml
git commit -m "feat: add a proportional pressure track"
```

---

### Task 7: The overview component

**Files:**
- Create: `components/Overview.qml`

**Interfaces:**
- Consumes: `Theme.hueFor`, `Theme.inSummary` (Task 1); `Verdict.trendOf`, `Verdict.attribution`, `Verdict.headline`, `Verdict.summaryLines` (Tasks 2–3); `PressureTrack` (Task 6); service properties from Tasks 4–5.
- Produces: a `Column` with `svc` and `nowMs` properties, and a `resetSticky()` function the panel calls when it opens.

- [ ] **Step 1: Write the component**

`components/Overview.qml`:

```qml
import QtQuick
import qs.Commons
import "../lib/Theme.js" as Theme
import "../lib/Verdict.js" as Verdict
import "../lib/Format.js" as Format

// The compact overview: a verdict, the constraint's history, and as many rows
// as there is something to say about. Full details stays in Panel.qml.
Column {
  id: root

  property var svc: null
  property double nowMs: Date.now()

  spacing: Style.space(10)

  readonly property var constraint: svc ? svc.constraint : null
  readonly property var anomalies: svc ? svc.anomalies : []
  readonly property var alarm: anomalies.length > 0 ? anomalies[0] : null

  // Calm is Color.muted here; the bar cell dims its own foreground instead,
  // because it draws over the wallpaper where muted is not reliably legible.
  readonly property var fallbacks: ({
    calm: Color.muted, mid: Color.accent, alarm: Color.urgent
  })

  function bandOf(r) { return svc ? svc.bandOf(r) : "calm" }
  function hueOf(band) {
    return Theme.hueFor(band, svc ? svc.themePalette : ({}), root.fallbacks)
  }
  function toneOf(r) { return hueOf(bandOf(r)) }

  readonly property string constraintBand: constraint ? bandOf(constraint) : "calm"

  readonly property var contended: {
    if (!svc || !svc.resources) return []
    var out = svc.resources.filter(function (r) { return r.ranks !== false })
    out.sort(function (a, b) { return b.pressure - a.pressure })
    return out
  }

  readonly property var conditions: {
    if (!svc || !svc.resources) return []
    return svc.resources.filter(function (r) { return r.ranks === false })
  }

  // Rows may be added while the panel is open, never removed: a value
  // oscillating across the threshold would otherwise make the list flicker.
  property var stickyKeys: ({})
  function resetSticky() { stickyKeys = ({}) }

  Connections {
    target: root.svc
    function onResourcesChanged() {
      var next = {}
      var grew = false
      var k
      for (k in root.stickyKeys) next[k] = true
      for (var i = 0; i < root.contended.length; i++) {
        var r = root.contended[i]
        if (Theme.inSummary(root.bandOf(r)) && !next[r.key]) { next[r.key] = true; grew = true }
      }
      for (var j = 0; j < root.conditions.length; j++) {
        var c = root.conditions[j]
        if (root.svc.isAnomalous(c.key) && !next[c.key]) { next[c.key] = true; grew = true }
      }
      if (grew) root.stickyKeys = next
    }
  }

  readonly property var summaryRows: {
    var out = []
    var i
    for (i = 0; i < contended.length; i++) {
      if (stickyKeys[contended[i].key]) out.push(contended[i])
    }
    for (i = 0; i < conditions.length; i++) {
      if (stickyKeys[conditions[i].key]) out.push(conditions[i])
    }
    return out
  }

  readonly property bool expanded: svc && svc.overviewDensity === "all"
  readonly property var visibleRows: expanded ? contended : summaryRows

  readonly property var hiddenRows: {
    var shown = {}
    for (var i = 0; i < visibleRows.length; i++) shown[visibleRows[i].key] = true
    return contended.filter(function (r) { return !shown[r.key] })
  }

  readonly property var lines:
    Verdict.summaryLines(visibleRows.length, hiddenRows, contended.length)

  readonly property var head: {
    var key = constraint ? constraint.key : ""
    var hist = (svc && key && svc.history[key]) ? svc.history[key] : []
    return Verdict.headline({
      constraint: constraint,
      band: constraintBand,
      alarm: alarm,
      trend: Verdict.trendOf(hist),
      duration: (svc && svc.since > 0) ? Format.duration(nowMs - svc.since) : "",
      attribution: (svc && svc.attributionKey)
        ? Verdict.attribution(svc.attributionList, svc.attributionKey) : null
    })
  }

  readonly property color heroTone: alarm ? hueOf("alarm") : hueOf(constraintBand)

  // ------------------------------------------------------------------ hero
  Item {
    width: parent.width
    height: heroText.height

    Column {
      id: heroText
      anchors.left: parent.left
      anchors.right: heroValue.left
      anchors.rightMargin: Style.space(8)
      spacing: Style.space(2)

      Text {
        width: parent.width
        elide: Text.ElideRight
        text: root.head.verdict
        color: root.constraintBand === "calm" && !root.alarm ? Color.muted : Color.foreground
        font.family: Style.font.family
        font.pixelSize: Style.font.heading
      }

      Text {
        width: parent.width
        elide: Text.ElideRight
        visible: text !== ""
        text: root.head.evidence
        color: Color.muted
        font.family: Style.font.family
        font.pixelSize: Style.font.bodySmall
      }
    }

    Text {
      id: heroValue
      anchors.right: parent.right
      anchors.verticalCenter: heroText.verticalCenter
      text: root.constraint ? root.constraint.display : "—"
      color: root.heroTone
      font.family: Style.font.family
      font.pixelSize: Style.font.displayLarge
    }
  }

  // The constraint's own history: how we got here, in the one place it matters.
  Sparkline {
    width: parent.width
    height: Style.space(22)
    cells: 40
    trackAlpha: 0
    values: (root.svc && root.constraint && root.svc.history[root.constraint.key])
      ? root.svc.history[root.constraint.key] : []
    stroke: root.heroTone
  }

  Rectangle {
    width: parent.width
    height: 1
    color: Color.muted
    opacity: 0.26
  }

  // ------------------------------------------------------------------ rows
  Column {
    width: parent.width
    spacing: Style.space(5)
    visible: root.visibleRows.length > 0

    Repeater {
      model: root.visibleRows

      Item {
        width: root.width
        height: rowLabel.height

        Text {
          id: rowLabel
          anchors.left: parent.left
          anchors.verticalCenter: parent.verticalCenter
          width: Style.space(74)
          elide: Text.ElideRight
          text: modelData.label
          color: root.bandOf(modelData) === "calm" ? Color.muted : Color.foreground
          font.family: Style.font.family
          font.pixelSize: Style.font.body
        }

        PressureTrack {
          anchors.left: rowLabel.right
          anchors.leftMargin: Style.space(8)
          anchors.right: rowValue.left
          anchors.rightMargin: Style.space(10)
          anchors.verticalCenter: parent.verticalCenter
          fraction: modelData.pressure
          tone: root.toneOf(modelData)
        }

        Text {
          id: rowValue
          anchors.right: parent.right
          anchors.verticalCenter: parent.verticalCenter
          width: Style.space(46)
          horizontalAlignment: Text.AlignRight
          text: modelData.display
          color: root.toneOf(modelData)
          font.family: Style.font.family
          font.pixelSize: Style.font.body
        }
      }
    }
  }

  // ------------------------------------------------- collapsed sentences
  Column {
    width: parent.width
    spacing: Style.space(2)
    visible: !root.expanded && root.lines.first !== ""

    Text {
      width: parent.width
      wrapMode: Text.WordWrap
      text: root.lines.first
      color: Color.foreground
      font.family: Style.font.family
      font.pixelSize: Style.font.bodySmall
    }

    Text {
      width: parent.width
      wrapMode: Text.WordWrap
      visible: text !== ""
      text: root.lines.second
      color: Color.muted
      font.family: Style.font.family
      font.pixelSize: Style.font.bodySmall
    }
  }

  // ------------------------------------------------------ density control
  Item {
    width: parent.width
    height: densityLabel.implicitHeight + Style.space(6)
    visible: root.contended.length > root.summaryRows.length || root.expanded

    Text {
      id: densityLabel
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      text: root.expanded
        ? "⌃ Show less"
        : "Show all " + root.contended.length + " ⌄"
      color: densityHover.hovered ? Color.foreground : Color.muted
      font.family: Style.font.family
      font.pixelSize: Style.font.bodySmall
    }

    HoverHandler { id: densityHover }

    TapHandler {
      onTapped: if (root.svc)
        root.svc.overviewDensity = root.expanded ? "summary" : "all"
    }
  }
}
```

- [ ] **Step 2: Verify it parses**

```bash
omarchy plugin validate .
```

Expected: passes. The component is not yet referenced by `Panel.qml`, so nothing renders differently.

- [ ] **Step 3: Commit**

```bash
git add components/Overview.qml
git commit -m "feat: add the verdict-led overview component"
```

---

### Task 8: Wire the overview into the panel

**Files:**
- Modify: `Panel.qml` (replace lines 42–56 and 120–246; leave 248 onward untouched)

**Interfaces:**
- Consumes: `Overview` (Task 7), service properties (Tasks 4–5).
- Produces: nothing new.

- [ ] **Step 1: Remove the properties that moved to the service**

Delete these blocks from `Panel.qml`. `contended`, `conditions` and `visibleRows` now live in `Overview.qml`; `isAnomalous` now lives on the service.

```qml
  // Compact shows only what competes to be the constraint; conditions live
  // under details unless one is in alarm.
  readonly property var contended: all.filter(function (r) { return r.ranks !== false })
  readonly property var conditions: all.filter(function (r) { return r.ranks === false })
  readonly property var visibleRows: showDetails ? contended.concat(conditions) : contended

  function isAnomalous(key) {
    for (var i = 0; i < anomalies.length; i++) if (anomalies[i].key === key) return true
    return false
  }
```

- [ ] **Step 2: Repoint `toneFor` at the service**

`toneFor` is still used by the Full details section, which is out of scope for restyling but must keep working. Replace it with:

```qml
  function toneFor(key) {
    return (svc && svc.isAnomalous(key)) ? Color.urgent : Color.foreground
  }
```

- [ ] **Step 3: Replace the hero and ranked-rows blocks with the component**

Delete the whole `// Hero: what is limiting the machine, and for how long` `Item { ... }` block and the `// Ranked resources` `Column { ... }` block that follows it. In their place, as the first child of `Column { id: column }`:

```qml
        Overview {
          id: overview
          width: parent.width
          svc: root.svc
          nowMs: root.nowMs
        }
```

- [ ] **Step 4: Reset the sticky rows when the panel opens**

Replace the existing `onOpenedChanged` handler with:

```qml
  onOpenedChanged: {
    if (!opened) showDetails = false
    // Rows accumulate while open and start fresh on each opening, so a panel
    // left open for hours does not reopen showing yesterday's spike.
    if (opened && overview) overview.resetSticky()
    if (svc) svc.panelOpen = opened
  }
```

- [ ] **Step 5: Widen the panel for the expanded density**

The `contentWidth` binding currently switches on `showDetails` only. Replace it with:

```qml
    contentWidth: panel.fittedContentWidth(root.showDetails ? Style.space(560) : Style.space(420))
```

- [ ] **Step 6: Verify in the running shell**

```bash
omarchy-restart-shell
```

Click the widget. Confirm each of these by eye:

1. The hero shows a sentence, not a bare resource name.
2. With one resource above `calmThreshold`, no rows appear — only the two collapsed sentences.
3. `Show all N` expands to every contended resource; `⌃ Show less` collapses it.
4. Closing and reopening the panel keeps the chosen density.
5. Full details still opens and renders as before.

Then check for errors:

```bash
journalctl --user -u omarchy-shell -n 80 --no-pager | grep -i "bottleneck\|error" || echo "clean"
```

- [ ] **Step 7: Force each band to verify colour**

```bash
omarchy bar set hzerrad.bottleneck calmThreshold 5
```

Expected: nearly every resource enters the summary and takes the loaded hue. Then:

```bash
omarchy bar set hzerrad.bottleneck alertTemp 30
```

Expected: CPU temp becomes an anomaly, the hero switches to the alarm sentence and the urgent hue. Restore afterwards:

```bash
omarchy bar set hzerrad.bottleneck calmThreshold 40
omarchy bar set hzerrad.bottleneck alertTemp 88
```

- [ ] **Step 8: Commit**

```bash
git add Panel.qml
git commit -m "feat: lead the panel with the verdict overview"
```

---

### Task 9: Band the bar cell

**Files:**
- Modify: `BarWidget.qml`

**Interfaces:**
- Consumes: `Theme.hueFor` (Task 1), `svc.bandOf` and `svc.themePalette` (Task 4).
- Produces: nothing new.

- [ ] **Step 1: Add the import**

After `import "lib/Format.js" as Format`:

```qml
import "lib/Theme.js" as Theme
```

- [ ] **Step 2: Replace the tone binding**

Replace this block:

```qml
  readonly property color tone: widgetState === "anomaly" ? urgentTone
    : widgetState === "strained" ? baseTone
    : Qt.rgba(baseTone.r, baseTone.g, baseTone.b, 0.55)
```

with:

```qml
  readonly property string band: svc && constraint ? svc.bandOf(constraint) : "calm"

  // Calm dims the bar's own foreground rather than using Color.muted: the bar
  // draws over the user's wallpaper, where muted is not reliably legible.
  readonly property color tone: Theme.hueFor(band, svc ? svc.themePalette : ({}), {
    calm: Qt.rgba(baseTone.r, baseTone.g, baseTone.b, 0.55),
    mid: bar ? bar.accent : Color.accent,
    alarm: urgentTone
  })
```

`bar.accent` may be undefined outside a bar, which is why the `Color.accent` fallback stays.

- [ ] **Step 3: Verify in the running shell**

```bash
omarchy-restart-shell
```

Confirm: an idle bar cell shows a dim sparkline only; under load the sparkline, glyph and percentage all take the loaded hue together; an anomaly turns them urgent. Switch themes to confirm live recolouring:

```bash
omarchy theme next
```

Expected: the bar cell's hues follow the new theme without a shell restart. Return with `omarchy theme next` until back, or `omarchy theme set <name>`.

- [ ] **Step 4: Commit**

```bash
git add BarWidget.qml
git commit -m "feat: colour the bar cell by pressure band"
```

---

### Task 10: Setting and documentation

**Files:**
- Modify: `manifest.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: `overviewDensity` on the service (Task 5).
- Produces: nothing.

- [ ] **Step 1: Add the default**

In `manifest.json`, inside `barWidget.defaults`, after `"calmThreshold": 40,`:

```json
      "overviewDensity": "summary",
```

- [ ] **Step 2: Add the schema entry**

In `barWidget.schema`, after the `calmThreshold` entry:

```json
      { "key": "overviewDensity", "type": "string", "label": "Overview starts", "defaultValue": "summary", "description": "Whether the panel opens showing only what is under pressure, or every resource. Either way you can switch it while the panel is open." },
```

- [ ] **Step 3: Push the setting down from the widget**

In `BarWidget.qml`'s `pushConfig()`, after the `svc.calmThreshold` line:

```qml
    svc.overviewDensity = setting("overviewDensity", "summary")
```

- [ ] **Step 4: Update the README**

Replace the "Bar states" table with:

```markdown
## Bar states

| State | When | Colour |
|---|---|---|
| calm | constraint under `calmThreshold` | dimmed, sparkline only |
| loaded | constraint at or above `calmThreshold`, under 80% | theme `yellow` |
| strained | constraint at or above 80% | theme `orange` |
| anomaly | a resource crossed its alert threshold | theme `red` |

Left-click opens the panel. Right-click runs `detailCommand`.
```

Add a row to the settings table, after `calmThreshold`:

```markdown
| `overviewDensity` | `"summary"` | Whether the panel opens collapsed or showing every resource |
```

Add this section after "GPU support":

```markdown
## Colours

The band colours come from the active theme's `colors.toml` — `yellow` for
loaded, `orange` for strained — so switching themes recolours both surfaces
without restarting the shell. Alarm uses the shell's own `urgent`, which
Omarchy already sources from the theme's `red`, so an alarm here is the same
red the rest of the shell uses.

A theme that defines neither hue falls back to `accent`, and the ramp degrades
to three steps rather than four. Nothing is hardcoded.

The panel shows a resource only when it is coloured: one threshold decides both.
```

- [ ] **Step 5: Verify the manifest still validates**

```bash
omarchy plugin validate .
```

Expected: passes.

- [ ] **Step 6: Run the full suite**

Run: `node --test test/`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add manifest.json README.md BarWidget.qml
git commit -m "feat: expose the overview density as a setting"
```

---

## Self-review

**Spec coverage**

| Spec section | Task |
|---|---|
| The one rule (bands + inclusion) | 1 |
| Conditions are exempt | 1, 7 |
| Colour source, per-key fallback, live watch | 1, 4 |
| Summary density and adaptive rows | 7 |
| All density | 7 |
| Density state, session-held, `overviewDensity` | 5, 10 |
| Sticky rows | 7 |
| Marks (bar sparkline, hero sparkline, row tracks) | 6, 7, 9 |
| Verdict shape, trend, duration | 2, 3, 7 |
| Attribution test and metric table | 2, 5 |
| Copy tables | 3 |
| Collapsed sentences | 3, 7 |
| Bar cell banding, calm difference | 9 |
| Degradation table | 1, 3, 5 |
| Testing | 1, 2, 3 |

**Type consistency**

`bandFor(pressurePct, calmThreshold, anomalous, ranks)` is called only through
`svc.bandOf(resource)` (Task 4), which supplies all four arguments from the
resource. `hueFor(band, palette, fallback)` takes `{calm, mid, alarm}` in Tasks
7 and 9, both of which construct that shape inline. `headline(o)` reads
`constraint`, `band`, `alarm`, `attribution`, `trend`, `duration` — all six are
supplied in Task 7's `head` binding. `summaryLines(shownCount, hidden,
totalContended)` matches its Task 7 call site. `attributionKey` returns exactly
the metric names `attribution()` indexes with (`cpuPct`, `memPct`, `smPct`).

**Note for the implementer**

`Sparkline.qml` gains no new property in this plan — Task 7 sets `trackAlpha:
0` to suppress its baseline in the hero, using the property it already has.
