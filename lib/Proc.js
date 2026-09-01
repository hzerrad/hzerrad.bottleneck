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

function parseDf(text) {
  var out = []
  var skip = { tmpfs: 1, devtmpfs: 1, overlay: 1, squashfs: 1, efivarfs: 1 }
  var lines = String(text).split("\n")
  for (var i = 1; i < lines.length; i++) {
    var f = lines[i].trim().split(/\s+/)
    if (f.length < 7) continue
    if (skip[f[1]]) continue
    var pct = parseInt(String(f[5]).replace("%", ""), 10)
    if (isNaN(pct)) continue
    out.push({ mount: f[6], usedPct: pct })
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
