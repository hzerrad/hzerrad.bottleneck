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
