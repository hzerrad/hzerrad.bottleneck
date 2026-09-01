"use strict"
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { loadQmlJs } = require("./load.js")

const Proc = loadQmlJs("lib/Proc.js")
const fixture = n => fs.readFileSync(path.join(__dirname, "fixtures", n), "utf8")

test("classifyCores splits this machine's 12 P / 8 E threads", () => {
  const freqs = []
  for (let i = 0; i < 12; i++) freqs.push({ cpu: i, khz: 5300000 })
  for (let i = 12; i < 20; i++) freqs.push({ cpu: i, khz: 4000000 })
  const out = Proc.classifyCores(freqs)
  assert.equal(out.p.length, 12)
  assert.equal(out.e.length, 8)
  assert.equal(out.e[0], 12)
})

test("classifyCores treats a non-hybrid CPU as all P", () => {
  const freqs = [0, 1, 2, 3].map(cpu => ({ cpu, khz: 4200000 }))
  const out = Proc.classifyCores(freqs)
  assert.equal(out.p.length, 4)
  assert.equal(out.e.length, 0)
})

test("parseStat reads per-core busy and total", () => {
  const s = Proc.parseStat(fixture("proc-stat-idle.txt"))
  assert.ok(s.cpus[0].total > 0)
  assert.ok(s.cpus[0].busy < s.cpus[0].total)
  assert.equal(Object.keys(s.cpus).length, 20)
})

// Pinned P-cores must read 100, not the ~60 from averaging 20 threads.
test("cpuBusyPct reports P and E independently", () => {
  const prev = Proc.parseStat(fixture("proc-stat-idle.txt"))
  const curr = Proc.parseStat(fixture("proc-stat-pbusy.txt"))
  const p = []; for (let i = 0; i < 12; i++) p.push(i)
  const e = []; for (let i = 12; i < 20; i++) e.push(i)
  assert.equal(Math.round(Proc.cpuBusyPct(prev, curr, p)), 100)
  assert.equal(Math.round(Proc.cpuBusyPct(prev, curr, e)), 0)
})

test("cpuBusyPct returns 0 when nothing changed", () => {
  const s = Proc.parseStat(fixture("proc-stat-idle.txt"))
  assert.equal(Proc.cpuBusyPct(s, s, [0, 1]), 0)
})
