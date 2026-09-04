import QtQuick
import qs.Commons
import "../lib/Theme.js" as Theme
import "../lib/Verdict.js" as Verdict
import "../lib/Format.js" as Format

// The compact overview: a verdict, the constraint's history, and as many rows
// as there is something to say about. Full details stays in Panel.qml.
Column {
  id: root

  property var svc: null
  property double nowMs: Date.now()

  spacing: Style.space(10)

  readonly property var constraint: svc ? svc.constraint : null
  readonly property var anomalies: svc ? svc.anomalies : []
  readonly property var alarm: anomalies.length > 0 ? anomalies[0] : null

  // Calm is Color.muted here; the bar cell dims its own foreground instead,
  // because it draws over the wallpaper where muted is not reliably legible.
  readonly property var fallbacks: ({
    calm: Color.muted, mid: Color.accent, alarm: Color.urgent
  })

  function bandOf(r) { return svc ? svc.bandOf(r) : "calm" }
  function hueOf(band) {
    return Theme.hueFor(band, svc ? svc.themePalette : ({}), root.fallbacks)
  }
  function toneOf(r) { return hueOf(bandOf(r)) }

  readonly property string constraintBand: constraint ? bandOf(constraint) : "calm"

  readonly property var contended: {
    if (!svc || !svc.resources) return []
    var out = svc.resources.filter(function (r) { return r.ranks !== false })
    out.sort(function (a, b) { return b.pressure - a.pressure })
    return out
  }

  readonly property var conditions: {
    if (!svc || !svc.resources) return []
    return svc.resources.filter(function (r) { return r.ranks === false })
  }

  // Rows may be added while the panel is open, never removed: a value
  // oscillating across the threshold would otherwise make the list flicker.
  property var stickyKeys: ({})
  function resetSticky() { stickyKeys = ({}) }

  Connections {
    target: root.svc
    function onResourcesChanged() {
      var next = {}
      var grew = false
      var k
      for (k in root.stickyKeys) next[k] = true
      for (var i = 0; i < root.contended.length; i++) {
        var r = root.contended[i]
        if (Theme.inSummary(root.bandOf(r)) && !next[r.key]) { next[r.key] = true; grew = true }
      }
      for (var j = 0; j < root.conditions.length; j++) {
        var c = root.conditions[j]
        if (root.svc.isAnomalous(c.key) && !next[c.key]) { next[c.key] = true; grew = true }
      }
      if (grew) root.stickyKeys = next
    }
  }

  readonly property var summaryRows: {
    var out = []
    var i
    for (i = 0; i < contended.length; i++) {
      if (stickyKeys[contended[i].key]) out.push(contended[i])
    }
    for (i = 0; i < conditions.length; i++) {
      if (stickyKeys[conditions[i].key]) out.push(conditions[i])
    }
    return out
  }

  readonly property bool expanded: svc && svc.overviewDensity === "all"
  readonly property var visibleRows: expanded ? contended : summaryRows

  readonly property var hiddenRows: {
    var shown = {}
    for (var i = 0; i < visibleRows.length; i++) shown[visibleRows[i].key] = true
    return contended.filter(function (r) { return !shown[r.key] })
  }

  readonly property var lines:
    Verdict.summaryLines(visibleRows.length, hiddenRows, contended.length)

  readonly property var head: {
    var key = constraint ? constraint.key : ""
    var hist = (svc && key && svc.history[key]) ? svc.history[key] : []
    return Verdict.headline({
      constraint: constraint,
      band: constraintBand,
      alarm: alarm,
      trend: Verdict.trendOf(hist),
      duration: (svc && svc.since > 0) ? Format.duration(nowMs - svc.since) : "",
      attribution: (svc && svc.attributionKey)
        ? Verdict.attribution(svc.attributionList, svc.attributionKey) : null
    })
  }

  readonly property color heroTone: alarm ? hueOf("alarm") : hueOf(constraintBand)

  // ------------------------------------------------------------------ hero
  Item {
    width: parent.width
    height: heroText.height

    Column {
      id: heroText
      anchors.left: parent.left
      anchors.right: heroValue.left
      anchors.rightMargin: Style.space(8)
      spacing: Style.space(2)

      Text {
        width: parent.width
        elide: Text.ElideRight
        text: root.head.verdict
        color: root.constraintBand === "calm" && !root.alarm ? Color.muted : Color.foreground
        font.family: Style.font.family
        font.pixelSize: Style.font.heading
      }

      Text {
        width: parent.width
        elide: Text.ElideRight
        visible: text !== ""
        text: root.head.evidence
        color: Color.muted
        font.family: Style.font.family
        font.pixelSize: Style.font.bodySmall
      }
    }

    Text {
      id: heroValue
      anchors.right: parent.right
      anchors.verticalCenter: heroText.verticalCenter
      text: root.constraint ? root.constraint.display : "—"
      color: root.heroTone
      font.family: Style.font.family
      font.pixelSize: Style.font.displayLarge
    }
  }

  // The constraint's own history: how we got here, in the one place it matters.
  Sparkline {
    width: parent.width
    height: Style.space(22)
    cells: 40
    trackAlpha: 0
    values: (root.svc && root.constraint && root.svc.history[root.constraint.key])
      ? root.svc.history[root.constraint.key] : []
    stroke: root.heroTone
  }

  Rectangle {
    width: parent.width
    height: 1
    color: Color.muted
    opacity: 0.26
  }

  // ------------------------------------------------------------------ rows
  Column {
    width: parent.width
    spacing: Style.space(5)
    visible: root.visibleRows.length > 0

    Repeater {
      model: root.visibleRows

      Item {
        width: root.width
        height: rowLabel.height

        Text {
          id: rowLabel
          anchors.left: parent.left
          anchors.verticalCenter: parent.verticalCenter
          width: Style.space(74)
          elide: Text.ElideRight
          text: modelData.label
          color: root.bandOf(modelData) === "calm" ? Color.muted : Color.foreground
          font.family: Style.font.family
          font.pixelSize: Style.font.body
        }

        PressureTrack {
          anchors.left: rowLabel.right
          anchors.leftMargin: Style.space(8)
          anchors.right: rowValue.left
          anchors.rightMargin: Style.space(10)
          anchors.verticalCenter: parent.verticalCenter
          fraction: modelData.pressure
          tone: root.toneOf(modelData)
        }

        Text {
          id: rowValue
          anchors.right: parent.right
          anchors.verticalCenter: parent.verticalCenter
          width: Style.space(46)
          horizontalAlignment: Text.AlignRight
          text: modelData.display
          color: root.toneOf(modelData)
          font.family: Style.font.family
          font.pixelSize: Style.font.body
        }
      }
    }
  }

  // ------------------------------------------------- collapsed sentences
  Column {
    width: parent.width
    spacing: Style.space(2)
    visible: !root.expanded && root.lines.first !== ""

    Text {
      width: parent.width
      wrapMode: Text.WordWrap
      text: root.lines.first
      color: Color.foreground
      font.family: Style.font.family
      font.pixelSize: Style.font.bodySmall
    }

    Text {
      width: parent.width
      wrapMode: Text.WordWrap
      visible: text !== ""
      text: root.lines.second
      color: Color.muted
      font.family: Style.font.family
      font.pixelSize: Style.font.bodySmall
    }
  }

  // ------------------------------------------------------ density control
  Item {
    width: parent.width
    height: densityLabel.implicitHeight + Style.space(6)
    visible: root.contended.length > root.summaryRows.length || root.expanded

    Text {
      id: densityLabel
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      text: root.expanded
        ? "⌃ Show less"
        : "Show all " + root.contended.length + " ⌄"
      color: densityHover.hovered ? Color.foreground : Color.muted
      font.family: Style.font.family
      font.pixelSize: Style.font.bodySmall
    }

    HoverHandler { id: densityHover }

    TapHandler {
      onTapped: if (root.svc)
        root.svc.overviewDensity = root.expanded ? "summary" : "all"
    }
  }
}
