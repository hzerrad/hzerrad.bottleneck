// Turns a ranked sample into a sentence. The panel's hero is the only place
// this plugin claims a cause, so the claim has to be earned.

// A word, not a graph. The deadband matters: without it the word flips on
// every sample and the sentence becomes the noisiest thing on screen.
var TREND_WINDOW = 30
var TREND_DEADBAND = 3

// history holds pressure fractions (0-1); the deadband is percentage points.
function trendOf(history) {
  if (!history || history.length < TREND_WINDOW) return "steady"
  var w = history.slice(history.length - TREND_WINDOW)
  var half = TREND_WINDOW / 2
  var older = 0
  var newer = 0
  var i
  for (i = 0; i < half; i++) older += w[i]
  for (i = half; i < TREND_WINDOW; i++) newer += w[i]
  var delta = ((newer - older) / half) * 100
  if (delta > TREND_DEADBAND) return "climbing"
  if (delta < -TREND_DEADBAND) return "easing"
  return "steady"
}

// ps %cpu is a lifetime average scaled to one core, so a share measured
// against system-wide busy percent would mix two incompatible numbers. This
// ratio stays inside one metric, which is sound whatever that metric's quirks.
var NAME_SHARE = 0.5

function attribution(list, metricKey) {
  if (!list || !list.length) return null
  var total = 0
  var top = null
  for (var i = 0; i < list.length; i++) {
    var v = list[i][metricKey] || 0
    total += v
    if (!top || v > (top[metricKey] || 0)) top = list[i]
  }
  if (total <= 0) return null
  var share = (top[metricKey] || 0) / total
  return {
    name: top.name,
    share: share,
    confident: share >= NAME_SHARE,
    count: list.length
  }
}
