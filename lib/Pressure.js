// Ranks a sample's resources by pressure (0-1, proximity to each one's limit).
// The highest-pressure ranking resource is the constraint.

function res(key, label, glyph, pressure, display) {
  return {
    key: key, label: label, glyph: glyph, pressure: pressure, display: display,
    // Conditions (temps, disk space) do not compete to be the constraint.
    ranks: true
  }
}

function condition(key, label, glyph, pressure, display) {
  var r = res(key, label, glyph, pressure, display)
  r.ranks = false
  return r
}

function has(v) { return v !== null && v !== undefined && !isNaN(v) }

// Glyphs are Material Design codepoints present in JetBrainsMono Nerd Font.
function buildResources(s) {
  var out = []
  if (has(s.pPct)) out.push(res("pcore", "P-cores", "\u{F061A}", s.pPct / 100, Math.round(s.pPct) + "%"))
  if (has(s.ePct)) out.push(res("ecore", "E-cores", "\u{F0EE0}", s.ePct / 100, Math.round(s.ePct) + "%"))

  if (s.gpu) {
    out.push(res("gpu", "GPU", "\u{F08AE}", s.gpu.utilPct / 100, Math.round(s.gpu.utilPct) + "%"))
    if (s.gpu.vramTotalMiB > 0) {
      var vf = s.gpu.vramUsedMiB / s.gpu.vramTotalMiB
      out.push(res("vram", "VRAM", "\u{F035B}", vf, Math.round(vf * 100) + "%"))
    }
  }

  if (has(s.memPct)) out.push(res("ram", "RAM", "\u{F035B}", s.memPct / 100, Math.round(s.memPct) + "%"))
  if (has(s.swapPct) && s.swapPct > 0) out.push(res("swap", "Swap", "\u{F04E1}", s.swapPct / 100, Math.round(s.swapPct) + "%"))

  if (s.diskIo && s.diskIo.length) {
    var worst = s.diskIo[0]
    for (var i = 1; i < s.diskIo.length; i++) if (s.diskIo[i].utilPct > worst.utilPct) worst = s.diskIo[i]
    out.push(res("diskio", "Disk I/O", "\u{F04C5}", worst.utilPct / 100, Math.round(worst.utilPct) + "%"))
  }

  if (s.filesystems && s.filesystems.length) {
    var full = s.filesystems[0]
    for (var j = 1; j < s.filesystems.length; j++) if (s.filesystems[j].usedPct > full.usedPct) full = s.filesystems[j]
    // A disk 39% full limits nothing; free space only matters near its ceiling.
    var d = condition("diskspace", "Disk " + full.mount, "\u{F02CA}", full.usedPct / 100, full.usedPct + "%")
    d.mount = full.mount
    out.push(d)
  }

  // Nothing is "limited by" a 40C chip, so temps never compete to be the
  // constraint. Pressure is measured against the alert ceiling, not 100C.
  if (has(s.cpuTempC)) out.push(condition("cputemp", "CPU temp", "\u{F050F}", s.cpuTempC / 100, Math.round(s.cpuTempC) + "\u00B0C"))
  if (has(s.gpuTempC)) out.push(condition("gputemp", "GPU temp", "\u{F050F}", s.gpuTempC / 100, Math.round(s.gpuTempC) + "\u00B0C"))

  return out
}

function rankConstraint(resources) {
  if (!resources || !resources.length) return null
  var best = null
  for (var i = 0; i < resources.length; i++) {
    if (resources[i].ranks === false) continue
    if (!best || resources[i].pressure > best.pressure) best = resources[i]
  }
  return best
}

// High utilization is a resource working; only a crossed limit is an anomaly.
function classifyHealth(resource, thresholds, flags) {
  var p = resource.pressure * 100
  switch (resource.key) {
    case "pcore": case "ecore": case "gpu":
      return "ok"
    // MemAvailable critically low; high "used" alone is often just cache.
    case "ram":       return flags.ramCritical ? "critical" : "ok"
    case "cputemp":   return p >= thresholds.alertTemp ? "critical" : "ok"
    case "gputemp":   return p >= thresholds.alertGpuTemp ? "critical" : "ok"
    case "diskspace": return p >= thresholds.alertDisk ? "critical" : "ok"
    case "vram":      return p >= thresholds.alertVram ? "critical" : "ok"
    case "swap":      return flags.swapGrowing ? "critical" : "ok"
    case "diskio":    return flags.diskIoSaturated ? "critical" : "ok"
    default:          return "ok"
  }
}

function detectAnomalies(resources, thresholds, flags) {
  var out = []
  for (var i = 0; i < resources.length; i++) {
    if (classifyHealth(resources[i], thresholds, flags) !== "ok") out.push(resources[i])
  }
  out.sort(function (a, b) { return b.pressure - a.pressure })
  return out
}

function debounced(streak, n) { return streak >= n }

function barState(constraint, anomalies, calmThreshold) {
  if (anomalies && anomalies.length) return "anomaly"
  if (!constraint) return "calm"
  var p = constraint.pressure * 100
  if (p < calmThreshold) return "calm"
  if (p >= 80) return "strained"
  return "loaded"
}
