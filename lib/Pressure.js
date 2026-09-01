// Ranks a sample's resources by pressure (0-1, proximity to each one's limit).
// The highest-pressure ranking resource is the constraint.

function res(key, label, glyph, pressure, display) {
  return { key: key, label: label, glyph: glyph, pressure: pressure, display: display }
}

function has(v) { return v !== null && v !== undefined && !isNaN(v) }

function buildResources(s) {
  var out = []
  if (has(s.pPct)) out.push(res("pcore", "P-cores", "", s.pPct / 100, Math.round(s.pPct) + "%"))
  if (has(s.ePct)) out.push(res("ecore", "E-cores", "", s.ePct / 100, Math.round(s.ePct) + "%"))

  if (s.gpu) {
    out.push(res("gpu", "GPU", "󰎢", s.gpu.utilPct / 100, Math.round(s.gpu.utilPct) + "%"))
    if (s.gpu.vramTotalMiB > 0) {
      var vf = s.gpu.vramUsedMiB / s.gpu.vramTotalMiB
      out.push(res("vram", "VRAM", "󰍛", vf, Math.round(vf * 100) + "%"))
    }
  }

  if (has(s.memPct)) out.push(res("ram", "RAM", "󰍛", s.memPct / 100, Math.round(s.memPct) + "%"))
  if (has(s.swapPct) && s.swapPct > 0) out.push(res("swap", "Swap", "󰼚", s.swapPct / 100, Math.round(s.swapPct) + "%"))

  if (s.diskIo && s.diskIo.length) {
    var worst = s.diskIo[0]
    for (var i = 1; i < s.diskIo.length; i++) if (s.diskIo[i].utilPct > worst.utilPct) worst = s.diskIo[i]
    out.push(res("diskio", "Disk I/O", "", worst.utilPct / 100, Math.round(worst.utilPct) + "%"))
  }

  if (s.filesystems && s.filesystems.length) {
    var full = s.filesystems[0]
    for (var j = 1; j < s.filesystems.length; j++) if (s.filesystems[j].usedPct > full.usedPct) full = s.filesystems[j]
    var d = res("diskspace", "Disk " + full.mount, "", full.usedPct / 100, full.usedPct + "%")
    d.mount = full.mount
    out.push(d)
  }

  // Temperatures rank against their alert ceiling, so a hot chip climbs the
  // list as it approaches the throttle point rather than at some fixed number.
  if (has(s.cpuTempC)) out.push(res("cputemp", "CPU temp", "󱐎", s.cpuTempC / 100, Math.round(s.cpuTempC) + "°C"))
  if (has(s.gpuTempC)) out.push(res("gputemp", "GPU temp", "󱐎", s.gpuTempC / 100, Math.round(s.gpuTempC) + "°C"))

  return out
}

function rankConstraint(resources) {
  if (!resources || !resources.length) return null
  var best = resources[0]
  for (var i = 1; i < resources.length; i++) if (resources[i].pressure > best.pressure) best = resources[i]
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
