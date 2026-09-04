// Rows may be added to the summary while the panel is open but never removed:
// a value oscillating across the threshold would otherwise make the list
// flicker while the user is reading it.

function mergeSticky(previous, eligibleKeys) {
  var next = {}
  var k
  for (k in previous) next[k] = true
  var grew = false
  for (var i = 0; i < eligibleKeys.length; i++) {
    if (!next[eligibleKeys[i]]) {
      next[eligibleKeys[i]] = true
      grew = true
    }
  }
  return { keys: next, grew: grew }
}
