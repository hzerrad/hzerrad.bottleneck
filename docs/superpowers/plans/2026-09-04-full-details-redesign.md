# Full Details Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Bottleneck's five-section Full details stack with three zones — where you stand now, who is using it, and whether this has happened before — and remove the sampling chain the deleted per-core grid orphans.

**Architecture:** One new pure-JS module (`lib/Hardware.js`) supplies hardware identity; `lib/Gpu.js` gains one free field from a query it already runs. `Service.qml` gains two properties and loses a whole per-core sampling chain. The section itself is extracted into `components/Details.qml`, mirroring `components/Overview.qml`, leaving `Panel.qml` a shell that hosts two components and a toggle.

**Tech Stack:** QML (Quickshell), ES5-style JavaScript in `lib/`, `node:test` + `node:assert/strict`.

**Spec:** `docs/superpowers/specs/2026-09-04-full-details-redesign-design.md`

## Global Constraints

- `lib/*.js` must contain **no Qt or QML types** — `test/load.js` executes them in a bare `Function` sandbox and harvests only top-level `function name(...)` declarations. A top-level `var` is module-private by design.
- Write **ES5-style JavaScript** in `lib/` and in QML JavaScript blocks: `var`, no arrow functions, no template literals, no `const`/`let`. Test files are Node and use modern syntax.
- Tests use `"use strict"`, `require("node:test")`, `require("node:assert/strict")`, and `loadQmlJs()` from `./load.js`.
- **Copy rules:** sentence case, active voice, **no middle-dot meta strings** (`A · B · C`), no ALL-CAPS labels, no trailing arrows. Comments explain *why*, never *what*.
- Sizing uses `Style.space(n)` tokens, not raw pixel literals.
- **No new animations.** `PressureTrack`'s `Behavior on width` remains the only motion in the plugin.
- Do not touch the compact overview (`components/Overview.qml`), the bar cell, ranking, or anomaly detection.
- **Keep `coreClasses`.** It looks like part of the per-core chain and is not — `sample()` reads `coreClasses.p` and `coreClasses.e` to compute the P-core and E-core percentages the entire ranking depends on (`Service.qml:447-448`).
- `qmllint -I /usr/share/omarchy/shell <files>` is **syntax-only** here — it cannot see `qs.Commons`/`qs.Ui` types and exits 0 on a nonexistent property. A clean lint proves parsing, nothing more.
- **Do not run `omarchy-restart-shell`.** The installed plugin is a symlink to this repo and the user has it running on a live desktop; the controller runs the live check.
- Baseline before Task 1: **98 tests passing**.

## File Structure

**Create**

| File | Responsibility |
|---|---|
| `lib/Hardware.js` | Parse the CPU model; compose the GPU identity string |
| `test/hardware.test.js` | Coverage for both |
| `test/fixtures/cpuinfo.txt` | A realistic multi-processor `/proc/cpuinfo` excerpt |
| `components/Details.qml` | The three zones |

**Modify**

| File | Change |
|---|---|
| `lib/Gpu.js` | `name` appended to the nvidia query; `parseNvidiaCsv` reads it |
| `test/gpu.test.js`, `test/fixtures/nvidia-smi.csv` | Cover the new field; existing assertions unchanged |
| `Service.qml` | Add `cpuModel`, `procSortOverride`, `effectiveProcSort`; delete `procSort` and the orphaned per-core chain |
| `lib/Proc.js` | Delete `parseCoreTopology`, `groupPhysicalCores`, `parseCoretempMap` |
| `test/proc-detail.test.js` | Drop the four cases covering those; keep the other three |
| `Panel.qml` | Details block replaced by `Details {}`; `procSort`/`procRows` deleted |
| `README.md` | Full details description; process tabs removed |

---

### Task 1: Hardware identity

**Files:**
- Create: `lib/Hardware.js`
- Create: `test/hardware.test.js`
- Create: `test/fixtures/cpuinfo.txt`

**Interfaces:**
- Consumes: nothing.
- Produces: `parseCpuModel(text) -> string | null`; `gpuIdentity(backend, name, vramText) -> string | null`.

- [ ] **Step 1: Write the fixture**

`test/fixtures/cpuinfo.txt` — a realistic excerpt. `/proc/cpuinfo` repeats every field per logical CPU, so the fixture must contain more than one processor block to prove the parser takes the **first** match:

```
processor	: 0
vendor_id	: GenuineIntel
cpu family	: 6
model		: 183
model name	: Intel(R) Core(TM) i5-14600KF
stepping	: 1
cpu MHz		: 3494.000
cache size	: 24576 KB

processor	: 1
vendor_id	: GenuineIntel
cpu family	: 6
model		: 183
model name	: Intel(R) Core(TM) i5-14600KF
stepping	: 1
cpu MHz		: 5300.000
cache size	: 24576 KB
```

- [ ] **Step 2: Write the failing test**

`test/hardware.test.js`:

```js
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test test/hardware.test.js`
Expected: FAIL — `Error: ENOENT ... lib/Hardware.js` from `loadQmlJs`.

- [ ] **Step 4: Write the implementation**

`lib/Hardware.js`:

```js
// What the machine is, as opposed to what it is doing. Identity is fixed for
// the boot, so it is read once at startup rather than sampled.

// /proc/cpuinfo repeats every field per logical CPU, so the first match wins.
// The value can contain its own colon, so the line is split at the first
// separator rather than by a naive split(":").
function parseCpuModel(text) {
  var lines = String(text || "").split("\n")
  for (var i = 0; i < lines.length; i++) {
    var idx = lines[i].indexOf(":")
    if (idx < 0) continue
    var key = lines[i].slice(0, idx).replace(/\s+$/, "")
    if (key !== "model name") continue
    var value = lines[i].slice(idx + 1).replace(/^\s+|\s+$/g, "")
    return value.length ? value : null
  }
  return null
}

// Only nvidia-smi hands back a marketing name. Deriving one for amdgpu or i915
// means parsing hwdata's pci.ids by tab depth against a file that may be
// absent — a parser and a new failure mode for a string. Those backends say
// what is knowable instead: which driver, and how much VRAM.
function gpuIdentity(backend, name, vramText) {
  if (!backend || backend === "none") return null
  if (name) return name
  if (vramText) return backend + ", " + vramText
  return backend
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test test/hardware.test.js`
Expected: PASS, 8 tests.

- [ ] **Step 6: Run the full suite**

Run: `node --test test/`
Expected: PASS, 106 tests (98 + 8).

- [ ] **Step 7: Commit**

```bash
git add lib/Hardware.js test/hardware.test.js test/fixtures/cpuinfo.txt
git commit -m "feat: read hardware identity"
```

---

### Task 2: The GPU name, from a query already running

**Files:**
- Modify: `lib/Gpu.js:11-29`
- Modify: `test/gpu.test.js`
- Modify: `test/fixtures/nvidia-smi.csv`

**Interfaces:**
- Consumes: nothing.
- Produces: `parseNvidiaCsv(line)` now returns an object additionally carrying `name` (string, or `null` when the field is absent). All five existing numeric fields keep their names and positions.

`nvidia-smi` already accepts `name` in the query this module builds. Appending it **after** the existing fields leaves indices 0–4 untouched, so the numeric loop is unchanged and the name is read only when present. This matters: an older driver that omits the field must still parse.

- [ ] **Step 1: Update the fixture**

`test/fixtures/nvidia-smi.csv` currently reads:

```
44, 2155, 12282, 41, 25.02
```

Replace with:

```
44, 2155, 12282, 41, 25.02, NVIDIA GeForce RTX 3060
```

- [ ] **Step 2: Write the failing tests**

Append to `test/gpu.test.js`:

```js
test("nvidiaQueryArgs asks for the card's name", () => {
  const args = Gpu.nvidiaQueryArgs(2000)
  assert.ok(args.some(a => a.indexOf("name") !== -1))
})

test("parseNvidiaCsv reads the name without disturbing the numbers", () => {
  const g = Gpu.parseNvidiaCsv(fixture("nvidia-smi.csv"))
  assert.equal(g.name, "NVIDIA GeForce RTX 3060")
  assert.equal(g.utilPct, 44)
  assert.equal(g.vramUsedMiB, 2155)
  assert.equal(g.vramTotalMiB, 12282)
  assert.equal(g.tempC, 41)
  assert.equal(g.watts, 25.02)
})

// A driver that does not report the field must still parse.
test("parseNvidiaCsv survives a line with no name", () => {
  const g = Gpu.parseNvidiaCsv("44, 2155, 12282, 41, 25.02")
  assert.equal(g.name, null)
  assert.equal(g.utilPct, 44)
})

// Card names have contained commas; the field is last, so take the remainder.
test("parseNvidiaCsv keeps a name containing a comma", () => {
  const g = Gpu.parseNvidiaCsv("44, 2155, 12282, 41, 25.02, Some Card, Special Edition")
  assert.equal(g.name, "Some Card, Special Edition")
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test test/gpu.test.js`
Expected: FAIL — the name assertions fail because `parseNvidiaCsv` returns no `name` key and `nvidiaQueryArgs` does not request one.

- [ ] **Step 4: Write the implementation**

In `lib/Gpu.js`, change `nvidiaQueryArgs` to request the name last:

```js
function nvidiaQueryArgs(intervalMs) {
  return [
    "--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,name",
    "--format=csv,noheader,nounits",
    "--loop-ms=" + intervalMs
  ]
}
```

Then change `parseNvidiaCsv` to read it. The numeric loop is untouched; only the return statement grows:

```js
function parseNvidiaCsv(line) {
  var parts = String(line).trim().split(",")
  if (parts.length < 5) return null
  var n = []
  for (var i = 0; i < 5; i++) {
    var v = parseFloat(String(parts[i]).trim())
    if (isNaN(v)) return null
    n.push(v)
  }
  // The name is queried last, so anything after the fifth field belongs to it
  // — card names have contained commas, and rejoining is cheaper than quoting.
  var name = null
  if (parts.length > 5) {
    var rest = parts.slice(5).join(",").replace(/^\s+|\s+$/g, "")
    if (rest.length) name = rest
  }
  return {
    utilPct: n[0], vramUsedMiB: n[1], vramTotalMiB: n[2],
    tempC: n[3], watts: n[4], name: name
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test test/gpu.test.js`
Expected: PASS. Every pre-existing assertion in this file must still pass unchanged — if one fails, the field order was disturbed.

- [ ] **Step 6: Run the full suite**

Run: `node --test test/`
Expected: PASS, 110 tests.

- [ ] **Step 7: Commit**

```bash
git add lib/Gpu.js test/gpu.test.js test/fixtures/nvidia-smi.csv
git commit -m "feat: read the GPU name from the query already running"
```

---

### Task 3: Service additions

**Files:**
- Modify: `Service.qml`

**Interfaces:**
- Consumes: `Hardware.parseCpuModel` (Task 1).
- Produces: on the service — `cpuModel` (string, `""` when unknown); `procSortOverride` (string, `""` means follow the constraint); `effectiveProcSort` (`"cpu"` | `"mem"` | `"gpu"`).

This task is additive plus one rename. The per-core chain removal is Task 6 — do not touch it here, because `Panel.qml` still renders the grid until Task 5.

There is no QML unit harness. Verify with `qmllint` and the existing suite.

- [ ] **Step 1: Add the import**

After `import "lib/Theme.js" as Theme`:

```qml
import "lib/Hardware.js" as Hardware
```

- [ ] **Step 2: Add the cpuModel property and its one-shot read**

Next to the other identity-ish properties (near `gpuBackend`), add:

```qml
  property string cpuModel: ""
```

Then, next to the other `Process` declarations, add:

```qml
  // Identity is fixed for the boot, so this runs once rather than on the tick.
  // 4 KB covers the first processor block on any machine; /proc/cpuinfo repeats
  // every field per logical CPU and there are twenty of them on a mid-range
  // desktop.
  Process {
    id: cpuModelProc
    running: true
    command: ["sh", "-c", "head -c 4096 /proc/cpuinfo"]
    stdout: StdioCollector {
      onStreamFinished: {
        var m = Hardware.parseCpuModel(text)
        root.cpuModel = m ? m : ""
      }
    }
  }
```

- [ ] **Step 3: Replace `procSort` with the override**

Delete this line (`Service.qml:44`):

```qml
  property string procSort: "cpu"         // cpu | mem | gpu
```

Add in its place:

```qml
  // "" means follow the constraint. The panel's heading control sets it, and
  // clears it when the panel closes, so following the constraint is the state
  // you return to — the override is for the investigation you are in the
  // middle of, not a preference.
  property string procSortOverride: ""

  readonly property string effectiveProcSort: {
    if (procSortOverride !== "") return procSortOverride
    switch (constraintMetric) {
      case "mem":    return "mem"
      case "gpusm":
      case "gpumem": return "gpu"
      // Swap and disk I/O have no per-process source, so CPU is the useful
      // default rather than an empty list.
      default:       return "cpu"
    }
  }
```

- [ ] **Step 4: Repoint the two `procSort` readers**

`procProc` currently reads `root.procSort` at `Service.qml:318` and `:323`. Change both to `root.effectiveProcSort`, so the command becomes:

```qml
    command: ["sh", "-c",
      "ps -eo pid,comm,pcpu,pmem --sort=-" +
      (root.effectiveProcSort === "mem" ? "pmem" : "pcpu") +
      " --no-headers | head -40"]
    stdout: StdioCollector {
      onStreamFinished: {
        root.procs = Proc.aggregateByName(Proc.parsePsList(text),
          root.effectiveProcSort === "mem" ? "memPct" : "cpuPct")
      }
    }
```

- [ ] **Step 5: Verify**

```bash
grep -n "procSort" Service.qml
```

Expected: only `procSortOverride` and `effectiveProcSort` appear — no bare `procSort` property remains. `Panel.qml` still references `svc.procSort` at this point and is fixed in Task 5; that is expected and does not break the build, since QML resolves properties at runtime.

```bash
qmllint -I /usr/share/omarchy/shell Service.qml
node --test test/
```

Expected: lint clean, 110 tests passing.

- [ ] **Step 6: Commit**

```bash
git add Service.qml
git commit -m "feat: read the CPU model and let the process sort follow the constraint"
```

---

### Task 4: The three zones

**Files:**
- Create: `components/Details.qml`

**Interfaces:**
- Consumes: `Hardware.gpuIdentity` (Task 1); `Format.mib`, `Format.bytes`, `Format.celsius`, `Format.watts`, `Format.ago` (existing); `svc.cpuModel`, `svc.effectiveProcSort`, `svc.procSortOverride` (Task 3); `svc.gpuSample` now carrying `name` (Task 2).
- Produces: a `Column` with `svc` and `nowMs` properties, and `resetSort()` for the panel to call on close.

Read `components/Overview.qml` first — it is the sibling this must match in voice and structure. Section headings here are plain sentence-case text, **not** the `SectionHeader` rule-and-label component; the panel already has enough horizontal lines.

- [ ] **Step 1: Write the component**

`components/Details.qml`:

```qml
import QtQuick
import qs.Commons
import "../lib/Hardware.js" as Hardware
import "../lib/Format.js" as Format

// Where you stand, who is using it, and whether this has happened before —
// three zones in the order a person asks those questions. The verdict and the
// summary rows live in Overview.qml above this.
Column {
  id: root

  property var svc: null
  property double nowMs: Date.now()

  spacing: Style.space(12)

  readonly property var gpu: svc ? svc.gpuSample : null
  readonly property var mem: (svc && svc.memInfo) ? svc.memInfo : ({})
  readonly property string sort: svc ? svc.effectiveProcSort : "cpu"

  function resetSort() { if (svc) svc.procSortOverride = "" }

  function cycleSort() {
    if (!svc) return
    var order = svc.gpuBackend !== "none" ? ["cpu", "mem", "gpu"] : ["cpu", "mem"]
    var idx = order.indexOf(root.sort)
    svc.procSortOverride = order[(idx + 1) % order.length]
  }

  readonly property string gpuName:
    Hardware.gpuIdentity(svc ? svc.gpuBackend : "none",
      gpu ? gpu.name : null,
      (gpu && gpu.vramTotalMiB > 0) ? Format.mib(gpu.vramTotalMiB) : "")

  // The fullest filesystem, not every mount: naming the one closest to full is
  // the same editorial judgement the ranking makes upstairs.
  readonly property var fullestFs: {
    if (!svc || !svc.filesystems || !svc.filesystems.length) return null
    var best = svc.filesystems[0]
    for (var i = 1; i < svc.filesystems.length; i++) {
      if (svc.filesystems[i].usedPct > best.usedPct) best = svc.filesystems[i]
    }
    return best
  }

  readonly property int otherFsCount:
    (svc && svc.filesystems) ? Math.max(0, svc.filesystems.length - 1) : 0

  readonly property var procRows: {
    if (!svc) return []
    if (sort === "gpu") {
      return (svc.gpuProcs || []).slice(0, 6).map(function (g) {
        return { name: g.name,
                 lead: Math.round(g.smPct) + "% gpu",
                 sub: Math.round(g.memPct) + "% mem" }
      })
    }
    return (svc.procs || []).slice(0, 6).map(function (p) {
      return root.sort === "mem"
        ? { name: p.name, lead: Math.round(p.memPct) + "% mem",
            sub: Math.round(p.cpuPct) + "% cpu" }
        : { name: p.name, lead: Math.round(p.cpuPct) + "% cpu",
            sub: Math.round(p.memPct) + "% mem" }
    })
  }

  readonly property var spikeRows: (svc && svc.spikes) ? svc.spikes.slice(0, 6) : []

  // ---------------------------------------------------------------- Now
  Column {
    width: parent.width
    spacing: Style.space(4)

    Text {
      text: "Now"
      color: Color.muted
      font.family: Style.font.family
      font.pixelSize: Style.font.caption
    }

    // CPU
    Item {
      width: parent.width
      height: cpuName.implicitHeight

      Text {
        id: cpuName
        anchors.left: parent.left
        text: root.svc && root.svc.cpuModel !== "" ? root.svc.cpuModel : "CPU"
        color: Color.foreground
        font.family: Style.font.family
        font.pixelSize: Style.font.bodySmall
      }

      Text {
        anchors.right: parent.right
        visible: text !== ""
        text: {
          if (!root.svc) return ""
          for (var i = 0; i < root.svc.resources.length; i++) {
            if (root.svc.resources[i].key === "cputemp") return root.svc.resources[i].display
          }
          return ""
        }
        color: Color.muted
        font.family: Style.font.family
        font.pixelSize: Style.font.bodySmall
      }
    }

    Text {
      width: parent.width
      text: {
        if (!root.svc) return ""
        var p = null
        var e = null
        for (var i = 0; i < root.svc.resources.length; i++) {
          if (root.svc.resources[i].key === "pcore") p = root.svc.resources[i]
          if (root.svc.resources[i].key === "ecore") e = root.svc.resources[i]
        }
        var out = p ? "P-cores " + p.display : ""
        if (e) out += (out ? "    " : "") + "E-cores " + e.display
        return out
      }
      color: Color.muted
      font.family: Style.font.family
      font.pixelSize: Style.font.caption
    }

    // GPU
    Item {
      width: parent.width
      height: gpuName.implicitHeight
      visible: root.gpuName !== null

      Text {
        id: gpuName
        anchors.left: parent.left
        text: root.gpuName ? root.gpuName : ""
        color: Color.foreground
        font.family: Style.font.family
        font.pixelSize: Style.font.bodySmall
      }

      Text {
        anchors.right: parent.right
        visible: root.gpu !== null && root.gpu.watts !== undefined
        text: root.gpu ? Format.watts(root.gpu.watts) : ""
        color: Color.muted
        font.family: Style.font.family
        font.pixelSize: Style.font.bodySmall
      }
    }

    Item {
      width: parent.width
      height: vramText.implicitHeight
      visible: root.gpu !== null && root.gpu.vramTotalMiB > 0

      Text {
        id: vramText
        anchors.left: parent.left
        text: root.gpu
          ? "VRAM " + Format.mib(root.gpu.vramUsedMiB) + " of " + Format.mib(root.gpu.vramTotalMiB)
          : ""
        color: Color.muted
        font.family: Style.font.family
        font.pixelSize: Style.font.caption
      }

      Text {
        anchors.right: parent.right
        visible: root.gpu !== null && root.gpu.tempC !== null
        text: root.gpu && root.gpu.tempC !== null ? Format.celsius(root.gpu.tempC) : ""
        color: Color.muted
        font.family: Style.font.family
        font.pixelSize: Style.font.caption
      }
    }

    // Memory
    Item {
      width: parent.width
      height: ramText.implicitHeight
      visible: root.mem.memTotal > 0

      Text {
        id: ramText
        anchors.left: parent.left
        text: root.mem.memTotal
          ? Format.bytes(root.mem.memTotal - root.mem.memAvailable) + " of "
            + Format.bytes(root.mem.memTotal)
          : ""
        color: Color.foreground
        font.family: Style.font.family
        font.pixelSize: Style.font.bodySmall
      }

      Text {
        anchors.right: parent.right
        visible: root.mem.swapTotal > 0
        text: root.mem.swapTotal
          ? "swap " + Format.bytes(root.mem.swapTotal - root.mem.swapFree) + " of "
            + Format.bytes(root.mem.swapTotal)
          : ""
        color: Color.muted
        font.family: Style.font.family
        font.pixelSize: Style.font.bodySmall
      }
    }

    // Storage
    Item {
      width: parent.width
      height: diskText.implicitHeight
      visible: root.fullestFs !== null

      Text {
        id: diskText
        anchors.left: parent.left
        text: root.fullestFs
          ? root.fullestFs.usedPct + "% full on " + root.fullestFs.mount
          : ""
        color: Color.foreground
        font.family: Style.font.family
        font.pixelSize: Style.font.bodySmall
      }

      Text {
        anchors.right: parent.right
        visible: root.otherFsCount > 0
        text: root.otherFsCount === 1
          ? "1 other filesystem" : root.otherFsCount + " other filesystems"
        color: Color.muted
        font.family: Style.font.family
        font.pixelSize: Style.font.bodySmall
      }
    }
  }

  // ------------------------------------------------------- Using it now
  Column {
    width: parent.width
    spacing: Style.space(4)

    Item {
      width: parent.width
      height: usingLabel.implicitHeight

      Text {
        id: usingLabel
        anchors.left: parent.left
        text: "Using it now, "
        color: Color.muted
        font.family: Style.font.family
        font.pixelSize: Style.font.caption
      }

      // A heading is a weak affordance, so this half of it is styled as a
      // control: tinted, underlined on hover, with a pointing cursor. It has
      // to look clickable without costing the panel a row of pills.
      Text {
        id: sortToken
        anchors.left: usingLabel.right
        text: "by " + root.sort
        color: Color.accent
        font.family: Style.font.family
        font.pixelSize: Style.font.caption
        font.underline: sortHover.hovered
      }

      HoverHandler {
        id: sortHover
        cursorShape: Qt.PointingHandCursor
      }

      TapHandler { onTapped: root.cycleSort() }
    }

    Text {
      width: parent.width
      visible: root.procRows.length === 0
      text: root.sort === "gpu" ? "No processes are using the GPU." : "Sampling…"
      color: Color.muted
      font.family: Style.font.family
      font.pixelSize: Style.font.bodySmall
    }

    Repeater {
      model: root.procRows

      Item {
        width: root.width
        height: procName.implicitHeight + Style.space(2)

        Text {
          id: procName
          anchors.left: parent.left
          width: Style.space(130)
          elide: Text.ElideRight
          text: modelData.name
          color: Color.foreground
          font.family: Style.font.family
          font.pixelSize: Style.font.bodySmall
        }

        Text {
          anchors.left: procName.right
          anchors.leftMargin: Style.space(8)
          text: modelData.lead
          color: Color.foreground
          font.family: Style.font.family
          font.pixelSize: Style.font.bodySmall
        }

        Text {
          anchors.right: parent.right
          text: modelData.sub
          color: Color.muted
          font.family: Style.font.family
          font.pixelSize: Style.font.bodySmall
        }
      }
    }
  }

  // ----------------------------------------------------------- Recently
  Column {
    width: parent.width
    spacing: Style.space(4)

    Text {
      text: "Recently"
      color: Color.muted
      font.family: Style.font.family
      font.pixelSize: Style.font.caption
    }

    Text {
      width: parent.width
      visible: root.spikeRows.length === 0
      text: "Nothing has crossed " + (root.svc ? root.svc.spikeThreshold : 70) + "% yet."
      color: Color.muted
      font.family: Style.font.family
      font.pixelSize: Style.font.bodySmall
    }

    Repeater {
      model: root.spikeRows

      Item {
        width: root.width
        height: spikeBody.implicitHeight + Style.space(3)

        Text {
          id: spikeWhen
          anchors.left: parent.left
          anchors.top: spikeBody.top
          width: Style.space(64)
          text: Format.ago(root.nowMs - modelData.at)
          color: Color.muted
          font.family: Style.font.family
          font.pixelSize: Style.font.bodySmall
        }

        Column {
          id: spikeBody
          anchors.left: spikeWhen.right
          anchors.right: parent.right
          spacing: Style.space(1)

          Text {
            text: modelData.label + " hit " + modelData.display
            color: Color.foreground
            font.family: Style.font.family
            font.pixelSize: Style.font.bodySmall
          }

          Text {
            width: parent.width
            elide: Text.ElideRight
            visible: modelData.culprit !== ""
            text: modelData.culprit
            color: Color.muted
            font.family: Style.font.family
            font.pixelSize: Style.font.caption
          }
        }
      }
    }
  }
}
```

- [ ] **Step 2: Verify it parses**

```bash
qmllint -I /usr/share/omarchy/shell components/Details.qml
omarchy plugin validate .
node --test test/
```

Expected: lint clean, validate exit 0, 110 tests. The component is not referenced by `Panel.qml` yet, so nothing renders differently.

- [ ] **Step 3: Commit**

```bash
git add components/Details.qml
git commit -m "feat: add the three-zone details component"
```

---

### Task 5: Wire it into the panel

**Files:**
- Modify: `Panel.qml`

**Interfaces:**
- Consumes: `Details` (Task 4).
- Produces: nothing new.

`Panel.qml` becomes a shell hosting two components and a toggle. Read the whole file before editing.

- [ ] **Step 1: Delete the process plumbing that moved into the component**

Remove these from `Panel.qml` — `procRows` now lives in `Details.qml`, and `procSort` no longer exists on the service:

```qml
  readonly property string procSort: svc ? svc.procSort : "cpu"
  function setProcSort(mode) { if (svc) svc.procSort = mode }

  readonly property var procRows: {
    ...
  }
```

Delete the whole `procRows` binding, not just its first line.

- [ ] **Step 2: Replace the details block with the component**

Delete the entire `Column` that begins with the `// Details` comment and carries `visible: root.showDetails` — everything from that comment through the end of the Storage `Repeater`, up to but **not** including the `// Toggle` block.

In its place:

```qml
        Details {
          id: details
          width: parent.width
          visible: root.showDetails
          svc: root.svc
          nowMs: root.nowMs
        }
```

- [ ] **Step 3: Reset the sort when the panel closes**

In `onOpenedChanged`, alongside the existing resets, add the sort reset so following the constraint is the state you return to:

```qml
  onOpenedChanged: {
    if (!opened) showDetails = false
    if (!opened && details) details.resetSort()
    // Rows accumulate while open and start fresh on each opening, so a panel
    // left open for hours does not reopen showing yesterday's spike.
    if (opened && overview) overview.resetSticky()
    if (svc) svc.panelOpen = opened
  }
```

- [ ] **Step 4: Verify the deletions**

```bash
grep -n "procSort\|procRows\|SectionHeader\|coreStats" Panel.qml
```

Expected: no output. All four belong to the deleted block.

```bash
grep -c "" Panel.qml
```

Expected: roughly 120 lines, down from 430.

```bash
qmllint -I /usr/share/omarchy/shell Panel.qml
omarchy plugin validate .
node --test test/
```

Expected: lint clean, validate exit 0, 110 tests.

- [ ] **Step 5: Commit**

```bash
git add Panel.qml
git commit -m "feat: host the details component instead of five stacked sections"
```

---

### Task 6: Remove the orphaned per-core chain

**Files:**
- Modify: `Service.qml`
- Modify: `lib/Proc.js`
- Modify: `test/proc-detail.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. This task only removes code.

The per-core grid was `coreStats`'s only consumer in the repo. With Task 5 done, the entire chain that produces it is unreachable — and it spawns a subprocess on every detail tick to fill a property nobody reads.

**Before deleting anything, confirm the chain is actually dead:**

```bash
grep -rn "coreStats\|physicalCores\|coreTemps\|coreTempMap\|coreTempDir" --include="*.qml" . | grep -v "^./Service.qml"
```

Expected: no output. If anything appears, stop and report — a consumer exists that this plan did not account for.

- [ ] **Step 1: Delete the properties**

From `Service.qml`, remove:

```qml
  property var physicalCores: []          // [{coreId, kind, threads}]
  property var coreStats: []              // [{coreId, kind, busyPct, tempC}]
  property var coreTempMap: ({})          // coreId -> hwmon input filename
  property string coreTempDir: ""
```

and, further down:

```qml
  property var coreTemps: ({})
  readonly property string coreTempCommand: {
    ...
  }
```

Delete the whole `coreTempCommand` binding.

- [ ] **Step 2: Delete the two processes and the function**

Remove the `topoProc` `Process` declaration in full, the `coreTempProc` `Process` declaration in full, and the `refreshCoreStats(prev, curr)` function in full.

- [ ] **Step 3: Delete the three call sites**

- In `discoverProc`'s handler, remove the line `topoProc.running = true`. Leave `root.coreClasses = Proc.classifyCores(freqs)` and `tick.start()` — **`coreClasses` must survive**; `sample()` reads `coreClasses.p` and `coreClasses.e` to compute the P-core and E-core percentages the whole ranking depends on.
- In `tempDetect`'s handler, remove the two assignments `root.coreTempDir = dir` and `root.coreTempMap = Proc.parseCoretempMap(labels)`. Keep everything else — this process also resolves `tempFile.path`, which is the CPU temperature the Now zone shows.
- In `detailTick`'s `onTriggered`, remove `if (root.coreTempDir !== "") coreTempProc.running = true`.
- In `sample()`, remove `if (panelOpen) refreshCoreStats(prevStat, stat)`.

- [ ] **Step 4: Delete the three orphaned lib helpers**

From `lib/Proc.js`, delete `parseCoreTopology`, `groupPhysicalCores`, and `parseCoretempMap` in full, including their comments.

**Keep** `pickCoretempInput` — `tempDetect` still calls it to find the package sensor.

- [ ] **Step 5: Drop the four tests covering them**

From `test/proc-detail.test.js`, delete these four cases:

- `"parseCoreTopology maps logical cpus to physical cores"`
- `"groupPhysicalCores folds hyperthread pairs and tags P/E"`
- `"groupPhysicalCores numbers cores sequentially within their class"`
- `"parseCoretempMap keys sensor inputs by core id"`

**Keep** the file's other three — `parsePsList`, `parsePmon`, `aggregateByName` — they are the process-attribution core that both the verdict and the Using-it-now zone depend on.

- [ ] **Step 6: Verify nothing dangles**

```bash
grep -n "coreStats\|physicalCores\|coreTemps\|coreTempMap\|coreTempDir\|coreTempCommand\|refreshCoreStats\|topoProc\|coreTempProc" Service.qml
grep -n "parseCoreTopology\|groupPhysicalCores\|parseCoretempMap" lib/Proc.js test/proc-detail.test.js
```

Expected: no output from either.

```bash
grep -n "coreClasses\|pickCoretempInput" Service.qml lib/Proc.js | head
```

Expected: both still present — `coreClasses` in `Service.qml` and `pickCoretempInput` in both.

```bash
qmllint -I /usr/share/omarchy/shell Service.qml
node --test test/
```

Expected: lint clean, 106 tests passing (110 minus the four deleted).

- [ ] **Step 7: Commit**

```bash
git add Service.qml lib/Proc.js test/proc-detail.test.js
git commit -m "refactor: drop the per-core sampling the grid left behind"
```

---

### Task 7: Documentation

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Describe what Full details now shows**

Find the section describing the panel and replace any description of the old five-section layout with:

```markdown
## Full details

Left-click the widget, then **Full details**, for three zones:

- **Now** — what each resource actually is and where it stands, in real units:
  the CPU and GPU by name, memory and disk as used-of-total rather than a
  percentage. A percentage is a ratio; deciding whether another VM fits needs
  the numerator.
- **Using it now** — the processes responsible, ranked by whatever is currently
  constraining the machine. Click `by cpu` in the heading to rank by memory or
  GPU time instead; it returns to following the constraint when the panel
  closes.
- **Recently** — what has crossed `spikeThreshold` lately, and which processes
  were running at that moment. This is recorded whether or not the panel is
  open, so it catches what you missed.

The GPU is named only where the driver reports it, which today means NVIDIA.
AMD and Intel show the driver and VRAM size instead — deriving a marketing name
means parsing a hardware database that may not be installed, for a string.
```

- [ ] **Step 2: Remove stale claims**

```bash
grep -n "per-core\|CPU cores\|tabs\|MEM\b" README.md
```

Review each hit and remove or correct any that describes the deleted per-core grid or the deleted process tabs.

- [ ] **Step 3: Verify**

```bash
omarchy plugin validate .
node --test test/
```

Expected: validate exit 0, 106 tests.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: describe the three details zones"
```

---

## Self-review

**Spec coverage**

| Spec section | Task |
|---|---|
| Three zones, order and headings | 4 |
| Now — per-resource rows, real units | 4 |
| Now — fullest filesystem only | 4 |
| Using it now — follows the constraint | 3, 4 |
| Using it now — heading token override, styled as a control | 4 |
| Override resets on panel close | 3, 5 |
| Recently — spike log promoted, six entries | 4 |
| Deleted: core grid, sensor list, pills, middle-dots, two headings | 5 |
| Orphaned sampling chain removed; `coreClasses` kept | 6 |
| CPU model sampling | 1, 3 |
| GPU name where free | 1, 2 |
| `Details.qml` extraction, `Panel.qml` shrinks | 4, 5 |
| Degradation table | 1, 4 |
| Testing | 1, 2, 6 |
| README | 7 |

**Type consistency**

`parseCpuModel(text)` returns `string | null`; `Service.qml` (Task 3) coerces the null to `""` so `cpuModel` is always a string, and Task 4 tests `!== ""`. `gpuIdentity(backend, name, vramText)` takes three strings and returns `string | null`; Task 4's `gpuName` binding supplies all three and gates the GPU rows on `!== null`. `effectiveProcSort` returns exactly `"cpu"`, `"mem"` or `"gpu"`, which is what Task 4's `sort` property and `cycleSort()`'s `order` arrays expect. `parseNvidiaCsv`'s new `name` field is read only via `gpu.name` in Task 4, and is `null` rather than absent when unreported.

**Test count trail**

98 baseline → 106 after Task 1 → 110 after Task 2 → 106 after Task 6 removes four. A task reporting a different total has diverged.
