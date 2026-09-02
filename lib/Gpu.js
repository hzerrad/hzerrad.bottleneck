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

// amdgpu and i915 publish sysfs files rather than a query interface, so one
// shell emits "key value" lines and the parser takes what is present.
function parseSysfsKv(text) {
  var out = {}
  var lines = String(text).trim().split("\n")
  for (var i = 0; i < lines.length; i++) {
    var f = lines[i].trim().split(/\s+/)
    if (f.length !== 2) continue
    var v = parseFloat(f[1])
    if (!isNaN(v)) out[f[0]] = v
  }
  return out
}

function mib(bytes) { return bytes !== undefined ? Math.round(bytes / 1048576) : 0 }
function milli(v) { return v !== undefined ? v / 1000 : null }

function amdSampleCommand() {
  return "for d in /sys/class/drm/card*/device; do " +
    "[ -r \"$d/gpu_busy_percent\" ] || continue; " +
    "echo \"busy $(cat $d/gpu_busy_percent)\"; " +
    "[ -r \"$d/mem_info_vram_used\" ] && echo \"vram_used $(cat $d/mem_info_vram_used)\"; " +
    "[ -r \"$d/mem_info_vram_total\" ] && echo \"vram_total $(cat $d/mem_info_vram_total)\"; " +
    "for h in \"$d\"/hwmon/hwmon*; do " +
    "[ -r \"$h/temp1_input\" ] && echo \"temp $(cat $h/temp1_input)\"; " +
    "[ -r \"$h/power1_average\" ] && echo \"power $(cat $h/power1_average)\"; " +
    "done; break; done"
}

// Without utilPct the GPU must leave the ranking: buildResources reads it
// unconditionally once a sample exists.
function amdSample(kv) {
  if (kv.busy === undefined) return null
  return {
    utilPct: kv.busy,
    vramUsedMiB: mib(kv.vram_used),
    vramTotalMiB: mib(kv.vram_total),
    tempC: milli(kv.temp),
    watts: kv.power !== undefined ? kv.power / 1000000 : null
  }
}

function intelSampleCommand() {
  return "for c in /sys/class/drm/card*; do " +
    "a=\"\"; m=\"\"; " +
    "if [ -r \"$c/gt_act_freq_mhz\" ]; then a=$(cat \"$c/gt_act_freq_mhz\"); m=$(cat \"$c/gt_max_freq_mhz\" 2>/dev/null); " +
    "elif [ -r \"$c/gt/gt0/rps_act_freq_mhz\" ]; then a=$(cat \"$c/gt/gt0/rps_act_freq_mhz\"); m=$(cat \"$c/gt/gt0/rps_max_freq_mhz\" 2>/dev/null); fi; " +
    "[ -z \"$a\" ] && continue; " +
    "echo \"act_freq $a\"; echo \"max_freq $m\"; " +
    "[ -r \"$c/device/mem_info_vram_used\" ] && echo \"vram_used $(cat $c/device/mem_info_vram_used)\"; " +
    "[ -r \"$c/device/mem_info_vram_total\" ] && echo \"vram_total $(cat $c/device/mem_info_vram_total)\"; " +
    "for h in \"$c\"/device/hwmon/hwmon*; do " +
    "[ -r \"$h/temp1_input\" ] && echo \"temp $(cat $h/temp1_input)\"; done; " +
    "break; done"
}

// i915 publishes no utilisation figure, so the clock ratio stands in for one.
// A GPU parked at max clock while idle will overstate; Intel parts clock down
// aggressively, so in practice the ratio tracks load.
function intelSample(kv) {
  if (kv.act_freq === undefined || !kv.max_freq) return null
  return {
    utilPct: Math.round(kv.act_freq / kv.max_freq * 100),
    vramUsedMiB: mib(kv.vram_used),
    vramTotalMiB: mib(kv.vram_total),
    tempC: milli(kv.temp),
    watts: null
  }
}
