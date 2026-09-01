// GPU backend selection and parsing. Pure — the QML side owns the process.

function detectBackend(env) {
  if (env.hasNvidiaSmi) return "nvidia"
  if (env.amdBusyPaths && env.amdBusyPaths.length) return "amd"
  if (env.intelFreqPaths && env.intelFreqPaths.length) return "intel"
  return "none"
}

// One long-lived process; streams line-buffered through a pipe.
function nvidiaQueryArgs(intervalMs) {
  return [
    "--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw",
    "--format=csv,noheader,nounits",
    "--loop-ms=" + intervalMs
  ]
}

function parseNvidiaCsv(line) {
  var parts = String(line).trim().split(",")
  if (parts.length < 5) return null
  var n = []
  for (var i = 0; i < 5; i++) {
    var v = parseFloat(String(parts[i]).trim())
    if (isNaN(v)) return null
    n.push(v)
  }
  return { utilPct: n[0], vramUsedMiB: n[1], vramTotalMiB: n[2], tempC: n[3], watts: n[4] }
}
