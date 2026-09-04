// Pure parsers for /proc and /sys. No Qt/QML types, no I/O — callers pass text.

// /proc/stat has no notion of core class; max frequency is the cheap signal.
function classifyCores(freqs) {
  var max = 0
  for (var i = 0; i < freqs.length; i++) if (freqs[i].khz > max) max = freqs[i].khz
  var p = [], e = []
  for (var j = 0; j < freqs.length; j++) {
    if (freqs[j].khz === max) p.push(freqs[j].cpu)
    else e.push(freqs[j].cpu)
  }
  return { p: p, e: e }
}

function parseStat(text) {
  var cpus = {}
  var lines = String(text).split("\n")
  for (var i = 0; i < lines.length; i++) {
    var m = lines[i].match(/^cpu(\d+)\s+(.*)$/)
    if (!m) continue
    var n = parseInt(m[1], 10)
    var f = m[2].trim().split(/\s+/).map(Number)
    // user nice system idle iowait irq softirq steal guest guest_nice
    var total = 0
    for (var k = 0; k < f.length; k++) total += f[k]
    var idle = (f[3] || 0) + (f[4] || 0)
    cpus[n] = { busy: total - idle, total: total }
  }
  return { cpus: cpus }
}

function cpuBusyPct(prev, curr, coreIds) {
  var dBusy = 0, dTotal = 0
  for (var i = 0; i < coreIds.length; i++) {
    var id = coreIds[i]
    var a = prev.cpus[id], b = curr.cpus[id]
    if (!a || !b) continue
    dBusy += b.busy - a.busy
    dTotal += b.total - a.total
  }
  if (dTotal <= 0) return 0
  return (dBusy / dTotal) * 100
}

// /proc/diskstats columns: major minor name then 11 stat fields.
// Kernel field 10 (column 13) is "ms doing I/O" — io_ticks.
function parseDiskstats(text) {
  var out = {}
  var lines = String(text).split("\n")
  for (var i = 0; i < lines.length; i++) {
    var f = lines[i].trim().split(/\s+/)
    if (f.length < 13) continue
    var name = f[2]
    if (!/^(sd[a-z]+|nvme\d+n\d+|mmcblk\d+)$/.test(name)) continue
    out[name] = { ioTicks: parseInt(f[12], 10) }
  }
  return out
}

function diskUtilPct(prevTicks, currTicks, elapsedMs) {
  if (!elapsedMs || elapsedMs <= 0) return 0
  var d = currTicks - prevTicks
  if (d <= 0) return 0
  var pct = (d / elapsedMs) * 100
  return pct > 100 ? 100 : pct
}

// Subvolumes and bind mounts of one device report the same usage, so one row
// per device; the shortest mount path wins as its name.
function parseDf(text) {
  var out = []
  var seen = {}
  var skip = { tmpfs: 1, devtmpfs: 1, overlay: 1, squashfs: 1, efivarfs: 1 }
  var lines = String(text).split("\n")
  for (var i = 1; i < lines.length; i++) {
    var f = lines[i].trim().split(/\s+/)
    if (f.length < 7) continue
    if (skip[f[1]]) continue
    var pct = parseInt(String(f[5]).replace("%", ""), 10)
    if (isNaN(pct)) continue
    // 1024-blocks, Used and Available are already parsed past to reach
    // Capacity and Mounted on; keep them too rather than discarding the
    // numerator a capacity decision actually needs. usedKb + availKb is the
    // same denominator Capacity itself is computed from (used / (used +
    // available), excluding reserved blocks) — sizeKb includes those, so a
    // display built on sizeKb would silently disagree with usedPct for the
    // same mount. A df variant that reports these as "-" degrades to 0
    // rather than poisoning the display with NaN.
    var sizeKb = parseInt(f[2], 10)
    var usedKb = parseInt(f[3], 10)
    var availKb = parseInt(f[4], 10)
    if (isNaN(sizeKb)) sizeKb = 0
    if (isNaN(usedKb)) usedKb = 0
    if (isNaN(availKb)) availKb = 0
    var dev = f[0]
    if (seen[dev] !== undefined) {
      if (f[6].length < out[seen[dev]].mount.length) out[seen[dev]].mount = f[6]
      continue
    }
    seen[dev] = out.length
    out.push({ mount: f[6], usedPct: pct, sizeKb: sizeKb, usedKb: usedKb, availKb: availKb })
  }
  return out
}

function pickCoretempInput(labels) {
  var i
  for (i = 0; i < labels.length; i++) if (/^Package id/.test(labels[i].label)) return labels[i].input
  for (i = 0; i < labels.length; i++) if (/^Core /.test(labels[i].label)) return labels[i].input
  return null
}

function parseMilliC(text) {
  var n = parseInt(String(text).trim(), 10)
  if (isNaN(n)) return null
  return n / 1000
}

function parseMeminfo(text) {
  var out = { memTotal: 0, memAvailable: 0, swapTotal: 0, swapFree: 0 }
  var map = { MemTotal: "memTotal", MemAvailable: "memAvailable", SwapTotal: "swapTotal", SwapFree: "swapFree" }
  var lines = String(text).split("\n")
  for (var i = 0; i < lines.length; i++) {
    var m = lines[i].match(/^(\w+):\s+(\d+)\s*kB/)
    if (m && map[m[1]]) out[map[m[1]]] = parseInt(m[2], 10) * 1024
  }
  return out
}

function memUsedPct(mem) {
  if (!mem.memTotal) return 0
  return (1 - mem.memAvailable / mem.memTotal) * 100
}

function swapUsedPct(mem) {
  if (!mem.swapTotal) return 0
  return ((mem.swapTotal - mem.swapFree) / mem.swapTotal) * 100
}

function swapGrowing(history, n) {
  if (!history || history.length < n) return false
  var tail = history.slice(history.length - n)
  for (var i = 1; i < tail.length; i++) if (tail[i] <= tail[i - 1]) return false
  return true
}

// Detail views
// Everything below feeds the panel's expanded mode, sampled on demand.

function parsePsList(text) {
  var out = []
  var lines = String(text).trim().split("\n")
  for (var i = 0; i < lines.length; i++) {
    var f = lines[i].trim().split(/\s+/)
    if (f.length < 4) continue
    var pid = parseInt(f[0], 10)
    if (isNaN(pid)) continue
    out.push({ pid: pid, name: f[1], cpuPct: parseFloat(f[2]), memPct: parseFloat(f[3]) })
  }
  return out
}

// nvidia-smi pmon pads idle columns with "-"; must read as zero, not NaN.
function parsePmon(text) {
  var out = []
  var lines = String(text).split("\n")
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i].trim()
    if (!l || l.charAt(0) === "#") continue
    var f = l.split(/\s+/)
    if (f.length < 10) continue
    var pid = parseInt(f[1], 10)
    if (isNaN(pid)) continue
    var sm = parseFloat(f[3])
    var mem = parseFloat(f[4])
    out.push({
      pid: pid,
      smPct: isNaN(sm) ? 0 : sm,
      memPct: isNaN(mem) ? 0 : mem,
      name: f[f.length - 1]
    })
  }
  return out
}

// Aggregate by app, not pid: a browser's dozen helpers is one 11% row, not
// three rows of 4%.
function aggregateByName(list, valueKey) {
  var byName = {}
  var order = []
  for (var i = 0; i < list.length; i++) {
    var p = list[i]
    if (!byName[p.name]) {
      byName[p.name] = { name: p.name, pid: p.pid, count: 0, cpuPct: 0, memPct: 0 }
      order.push(p.name)
    }
    var a = byName[p.name]
    a.count += 1
    a.cpuPct += p.cpuPct || 0
    a.memPct += p.memPct || 0
  }
  var out = []
  for (var j = 0; j < order.length; j++) out.push(byName[order[j]])
  out.sort(function (x, y) { return (y[valueKey] || 0) - (x[valueKey] || 0) })
  return out
}
