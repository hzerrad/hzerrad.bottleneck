// Pure formatting helpers. No Qt/QML types.

function pct(fraction) {
  return Math.round(fraction * 100) + "%"
}

function mib(n) {
  if (n < 1024) return Math.round(n) + " MB"
  return (n / 1024).toFixed(1) + " GB"
}

function celsius(n) {
  return Math.round(n) + "°C"
}

function watts(n) {
  return Math.round(n) + "W"
}

function duration(ms) {
  var s = Math.floor(ms / 1000)
  if (s < 60) return s + "s"
  var m = Math.floor(s / 60)
  if (m < 60) return m + "m" + (s % 60) + "s"
  var h = Math.floor(m / 60)
  return h + "h" + (m % 60) + "m"
}
