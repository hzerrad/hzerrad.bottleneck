"use strict"
const test = require("node:test")
const assert = require("node:assert/strict")
const { loadQmlJs } = require("./load.js")

const Proc = loadQmlJs("lib/Proc.js")

test("parsePsList reads pid, name and both percentages", () => {
  const p = Proc.parsePsList(" 157350 ghostty  2.8  1.0\n 72474 spotify  1.9  1.3\n")
  assert.equal(p.length, 2)
  assert.deepEqual(p[0], { pid: 157350, name: "ghostty", cpuPct: 2.8, memPct: 1.0 })
})

// nvidia-smi pmon pads idle columns with "-", which must read as 0, not NaN.
test("parsePmon skips headers and treats dashes as zero", () => {
  const text = [
    "# gpu         pid   type     sm    mem    enc    dec    jpg    ofa    command",
    "# Idx           #    C/G      %      %      %      %      %      %    name",
    "    0       1446     G     12     10      -      -      -      -    Hyprland",
    "    0       1529     G      -      -      -      -      -      -    Xwayland"
  ].join("\n")
  const g = Proc.parsePmon(text)
  assert.equal(g.length, 2)
  assert.deepEqual(g[0], { pid: 1446, smPct: 12, memPct: 10, name: "Hyprland" })
  assert.equal(g[1].smPct, 0)
})

// A browser's dozen helpers read as one costly app, not twelve cheap ones.
test("aggregateByName folds an app's processes together", () => {
  const list = [
    { pid: 1, name: "brave", cpuPct: 4, memPct: 1 },
    { pid: 2, name: "brave", cpuPct: 4, memPct: 1 },
    { pid: 3, name: "brave", cpuPct: 3, memPct: 1 },
    { pid: 4, name: "quickshell", cpuPct: 8, memPct: 2 }
  ]
  const agg = Proc.aggregateByName(list, "cpuPct")
  assert.equal(agg.length, 2)
  assert.equal(agg[0].name, "brave", "11% of brave outranks 8% of quickshell")
  assert.equal(agg[0].cpuPct, 11)
  assert.equal(agg[0].count, 3)
})
