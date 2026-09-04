// Maps pressure to a colour band, and a band to a hex from the active theme.
//
// The shell's Color singleton keeps five tokens, which is not enough for a
// four-step ramp — and on the stock theme `accent` and `foreground` are the
// same value. Color.loadColors already assigns the theme's `red` to
// Color.urgent, so `yellow` and `orange` are the only hues it drops and the
// only ones read here.

// Deliberately not a TOML parser: colors.toml is flat key = "#rrggbb" pairs
// with no tables or arrays. Anything that is not a plain hex string is skipped
// rather than guessed at, so `mode = "dark"` and a gradient border cannot
// become colours. Trailing comments are tolerated; they appear on most real
// theme files but are irrelevant to the colour value.
function parsePalette(raw) {
  var out = {}
  var lines = String(raw || "").split("\n")
  for (var i = 0; i < lines.length; i++) {
    var m = lines[i].match(/^\s*([a-z_]+)\s*=\s*"(#[0-9a-fA-F]{6})"\s*(?:#.*)?$/)
    if (m) out[m[1]] = m[2]
  }
  return out
}

// Conditions (temps, disk space) are never measured against calmThreshold — a
// 45C chip is 0.45 pressure and entirely unremarkable — so they reach a
// coloured band only by being anomalous.
function bandFor(pressurePct, calmThreshold, anomalous, ranks) {
  if (anomalous) return "alarm"
  if (ranks === false) return "calm"
  if (pressurePct >= 80) return "strained"
  if (pressurePct >= calmThreshold) return "loaded"
  return "calm"
}

// Fallback is per band, not all-or-nothing: a theme with `yellow` but no
// `orange` keeps its own yellow and falls back only for strained.
function hueFor(band, palette, fallback) {
  if (band === "alarm") return fallback.alarm
  if (band === "calm") return fallback.calm
  var key = band === "strained" ? "orange" : "yellow"
  var v = palette ? palette[key] : null
  return v ? v : fallback.mid
}

// The colour rule and the collapse rule are the same rule.
function inSummary(band) {
  return band !== "calm"
}
