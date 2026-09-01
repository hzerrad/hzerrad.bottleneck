"use strict"
const test = require("node:test")
const assert = require("node:assert/strict")
const { loadQmlJs } = require("./load.js")

const Proc = loadQmlJs("lib/Proc.js")

test("parseCoreTopology maps logical cpus to physical cores", () => {
  const t = Proc.parseCoreTopology("0 0\n1 0\n2 4\n12 24\n")
  assert.equal(t.length, 4)
  assert.deepEqual(t[0], { cpu: 0, coreId: 0 })
  assert.deepEqual(t[3], { cpu: 12, coreId: 24 })
})

// This machine: 6 P-cores with 2 threads each, 8 single-threaded E-cores.
test("groupPhysicalCores folds hyperthread pairs and tags P/E", () => {
  const topo = []
  for (let c = 0; c < 12; c++) topo.push({ cpu: c, coreId: Math.floor(c / 2) * 4 })
  for (let c = 12; c < 20; c++) topo.push({ cpu: c, coreId: 12 + c })
  const classes = { p: [...Array(12).keys()], e: [...Array(8).keys()].map(i => i + 12) }
  const cores = Proc.groupPhysicalCores(topo, classes)
  assert.equal(cores.length, 14)
  assert.equal(cores.filter(c => c.kind === "P").length, 6)
  assert.equal(cores.filter(c => c.kind === "E").length, 8)
  assert.deepEqual(cores[0].threads, [0, 1])
  assert.equal(cores[6].threads.length, 1)
})

// Intel core_ids are sparse (0,4,8… then 24-31); raw labels look like gaps.
test("groupPhysicalCores numbers cores sequentially within their class", () => {
  const topo = []
  for (let c = 0; c < 12; c++) topo.push({ cpu: c, coreId: Math.floor(c / 2) * 4 })
  for (let c = 12; c < 20; c++) topo.push({ cpu: c, coreId: 12 + c })
  const classes = { p: [...Array(12).keys()], e: [...Array(8).keys()].map(i => i + 12) }
  const cores = Proc.groupPhysicalCores(topo, classes)
  assert.deepEqual(cores.filter(c => c.kind === "P").map(c => c.name),
    ["P0", "P1", "P2", "P3", "P4", "P5"])
  assert.deepEqual(cores.filter(c => c.kind === "E").map(c => c.name),
    ["E0", "E1", "E2", "E3", "E4", "E5", "E6", "E7"])
})

test("parseCoretempMap keys sensor inputs by core id", () => {
  const m = Proc.parseCoretempMap([
    { input: "temp1_input", label: "Package id 0" },
    { input: "temp2_input", label: "Core 0" },
    { input: "temp26_input", label: "Core 24" }
  ])
  assert.equal(m[0], "temp2_input")
  assert.equal(m[24], "temp26_input")
  assert.equal(m["Package id 0"], undefined, "the package sensor is not a core")
})

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
