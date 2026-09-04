// What the machine is, as opposed to what it is doing. Identity is fixed for
// the boot, so it is read once at startup rather than sampled.

// /proc/cpuinfo repeats every field per logical CPU, so the first match wins.
// The value can contain its own colon, so the line is split at the first
// separator rather than by a naive split(":").
function parseCpuModel(text) {
  var lines = String(text || "").split("\n")
  for (var i = 0; i < lines.length; i++) {
    var idx = lines[i].indexOf(":")
    if (idx < 0) continue
    var key = lines[i].slice(0, idx).replace(/\s+$/, "")
    if (key !== "model name") continue
    var value = lines[i].slice(idx + 1).replace(/^\s+|\s+$/g, "")
    return value.length ? value : null
  }
  return null
}

// Only nvidia-smi hands back a marketing name. Deriving one for amdgpu or i915
// means parsing hwdata's pci.ids by tab depth against a file that may be
// absent — a parser and a new failure mode for a string. Those backends say
// what is knowable instead: which driver, and how much VRAM.
function gpuIdentity(backend, name, vramText) {
  if (!backend || backend === "none") return null
  if (name) return name
  if (vramText) return backend + ", " + vramText
  return backend
}
