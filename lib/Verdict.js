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

// The verb belongs to the resource, not to the sentence that uses it.
var VERBS = {
  pcore: "pinning", ecore: "pinning", ram: "holding",
  gpu: "driving", vram: "filling"
}

// "P-cores are", "RAM is". Only the core labels are plural.
var PLURAL = { pcore: true, ecore: true }

// What the attribution share is a share *of*, said in the user's terms.
var METRIC_LABEL = {
  pcore: "the CPU in use", ecore: "the CPU in use", ram: "what's in use",
  gpu: "GPU time", vram: "the VRAM in use"
}

// An alarm is a different sentence from a constraint: it says what is wrong,
// not what is tightest.
var ALARM = {
  ram: "Memory is nearly exhausted",
  swap: "Swap is filling",
  diskio: "Disk I/O is saturated",
  diskspace: "Your disk is nearly full",
  cputemp: "Your CPU is running hot",
  gputemp: "Your GPU is running hot",
  vram: "VRAM is nearly full"
}

function beVerb(key) { return PLURAL[key] ? "are" : "is" }

function capitalize(s) {
  var t = String(s || "")
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// The share does not deserve more precision than this.
function roundTo5(n) { return Math.round(n / 5) * 5 }

// o = { constraint, band, alarm, attribution, trend, duration }
function headline(o) {
  // o.duration is svc.since's age: how long the *constraint* has held its
  // position, not how long the alarm has been active. Appending it here
  // would put a fabricated number beside the alarm sentence.
  if (o.alarm) {
    return {
      verdict: ALARM[o.alarm.key] || (o.alarm.label + " needs attention"),
      evidence: "at " + o.alarm.display
    }
  }

  var since = o.duration ? " for " + o.duration : ""

  if (!o.constraint) {
    return { verdict: "Nothing is holding you back", evidence: "" }
  }

  var c = o.constraint

  if (o.band === "calm") {
    return {
      verdict: "Nothing is holding you back",
      evidence: "Closest is " + c.label + ", at " + c.display
    }
  }

  var tail = (o.trend || "steady") + since
  var a = o.attribution

  if (a && a.confident && VERBS[c.key]) {
    return {
      verdict: capitalize(a.name) + " is " + VERBS[c.key] + " your " + c.label,
      evidence: "about " + roundTo5(a.share * 100) + "% of " + METRIC_LABEL[c.key] + ", " + tail
    }
  }

  if (a && !a.confident) {
    return {
      verdict: c.label + " " + beVerb(c.key) + " busy across " + a.count + " processes",
      evidence: "no single cause, " + tail
    }
  }

  // Swap and disk I/O have no per-process attribution available, so they land
  // here by construction rather than by failure.
  return {
    verdict: c.label + " " + beVerb(c.key) + " your tightest resource",
    evidence: tail
  }
}

// The sentences that stand in for the rows the summary is not showing.
// `hidden` is ordered by descending pressure, so hidden[0] is the next one up.
function summaryLines(shownCount, hidden, totalContended) {
  if (!hidden || hidden.length === 0) return { first: "", second: "" }
  if (shownCount === 0) {
    return { first: "All " + totalContended + " resources have room.", second: "" }
  }
  if (hidden.length === 1) {
    return { first: hidden[0].label + " is the only other one, at " + hidden[0].display + ".", second: "" }
  }
  return {
    first: "Everything else has room.",
    second: hidden[0].label + " is next at " + hidden[0].display + "."
  }
}
