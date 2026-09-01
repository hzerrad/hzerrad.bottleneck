import QtQuick
import Quickshell
import qs.Commons
import qs.Ui
import "components"
import "lib/Format.js" as Format

// qs.Ui's Panel is lifecycle only and draws nothing; the visible surface is
// the KeyboardPanel below, bound to `open: root.opened`.
Panel {
  id: root
  moduleName: "hzerrad.vitals"
  ipcTarget: "hzerrad.vitals"

  // The bar identifies a panel by its slot widget, so hand over the host.
  property var anchorItem: null
  property var hostWidget: null
  readonly property var barIdentity: hostWidget || root

  property bool showDetails: false

  // A QML binding re-evaluates only when a dependency changes, so "limiting
  // for Ns" needs a ticking property or it reads "0s" forever.
  property double nowMs: Date.now()

  Timer {
    interval: 1000
    repeat: true
    running: root.opened
    onTriggered: root.nowMs = Date.now()
  }

  readonly property var svc: bar && bar.shell ? bar.shell.serviceFor("hzerrad.vitals") : null
  readonly property var constraint: svc ? svc.constraint : null
  readonly property var anomalies: svc ? svc.anomalies : []
  readonly property var gpu: svc ? svc.gpuSample : null

  readonly property var all: svc && svc.resources
    ? svc.resources.slice().sort(function (a, b) { return b.pressure - a.pressure })
    : []

  // Compact shows only what competes to be the constraint; conditions live
  // under details unless one is in alarm.
  readonly property var contended: all.filter(function (r) { return r.ranks !== false })
  readonly property var conditions: all.filter(function (r) { return r.ranks === false })
  readonly property var visibleRows: showDetails ? contended.concat(conditions) : contended

  function isAnomalous(key) {
    for (var i = 0; i < anomalies.length; i++) if (anomalies[i].key === key) return true
    return false
  }

  function toneFor(key) {
    return isAnomalous(key) ? Color.urgent : Color.foreground
  }

  function switchPanel(direction) {
    if (root.bar && typeof root.bar.switchPanelFrom === "function")
      return root.bar.switchPanelFrom(root.barIdentity, direction)
    return false
  }

  onOpenedChanged: if (!opened) showDetails = false

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(400))
    contentHeight: panel.fittedContentHeight(column.implicitHeight)

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onCloseRequested: root.close()
      onTabRequested: function (direction) { root.switchPanel(direction) }

      Column {
        id: column
        width: parent.width
        spacing: Style.space(12)

        // Hero: what is limiting the machine, and for how long
        Item {
          width: parent.width
          height: heroText.height

          Column {
            id: heroText
            anchors.left: parent.left
            anchors.right: heroValue.left
            anchors.rightMargin: Style.space(8)
            spacing: Style.space(2)

            Row {
              spacing: Style.space(6)

              Text {
                anchors.verticalCenter: parent.verticalCenter
                text: root.constraint ? root.constraint.glyph : "\u{F04C5}"
                color: root.constraint ? root.toneFor(root.constraint.key) : Color.muted
                font.family: Style.font.family
                font.pixelSize: Style.font.heading
              }

              Text {
                anchors.verticalCenter: parent.verticalCenter
                text: root.constraint ? root.constraint.label : "Idle"
                color: Color.foreground
                font.family: Style.font.family
                font.pixelSize: Style.font.heading
              }
            }

            Text {
              width: parent.width
              elide: Text.ElideRight
              text: {
                if (!root.constraint) return "Nothing is under pressure"
                if (root.anomalies.length > 0) {
                  return root.anomalies.length === 1
                    ? root.anomalies[0].label + " needs attention"
                    : root.anomalies.length + " resources need attention"
                }
                return (root.svc && root.svc.since > 0)
                  ? "limiting for " + Format.duration(root.nowMs - root.svc.since)
                  : "tightest resource"
              }
              color: root.anomalies.length > 0 ? Color.urgent : Color.muted
              font.family: Style.font.family
              font.pixelSize: Style.font.bodySmall
            }
          }

          Text {
            id: heroValue
            anchors.right: parent.right
            anchors.verticalCenter: heroText.verticalCenter
            text: root.constraint ? root.constraint.display : "—"
            color: root.constraint ? root.toneFor(root.constraint.key) : Color.muted
            font.family: Style.font.family
            font.pixelSize: Style.font.displayLarge
          }
        }

        // Ranked resources
        Column {
          width: parent.width
          spacing: Style.space(5)

          Repeater {
            model: root.visibleRows

            Item {
              width: column.width
              height: Math.max(rowLabel.height, rowSpark.height)

              // Fixed icon slot keeps labels aligned regardless of glyph width.
              Text {
                id: rowIcon
                anchors.left: parent.left
                anchors.verticalCenter: parent.verticalCenter
                width: Style.space(18)
                horizontalAlignment: Text.AlignHCenter
                text: modelData.glyph
                color: root.isAnomalous(modelData.key) ? Color.urgent : Color.muted
                font.family: Style.font.family
                font.pixelSize: Style.font.body
              }

              Text {
                id: rowLabel
                anchors.left: rowIcon.right
                anchors.leftMargin: Style.space(6)
                anchors.verticalCenter: parent.verticalCenter
                width: Style.space(96)
                elide: Text.ElideRight
                text: modelData.label
                color: root.toneFor(modelData.key)
                font.family: Style.font.family
                font.pixelSize: Style.font.body
              }

              Sparkline {
                id: rowSpark
                anchors.left: rowLabel.right
                anchors.leftMargin: Style.space(8)
                anchors.right: rowValue.left
                anchors.rightMargin: Style.space(10)
                anchors.verticalCenter: parent.verticalCenter
                cells: 20
                values: (root.svc && root.svc.history[modelData.key]) || []
                stroke: root.isAnomalous(modelData.key) ? Color.urgent : Color.foreground
              }

              Text {
                id: rowValue
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                width: Style.space(46)
                horizontalAlignment: Text.AlignRight
                text: modelData.display
                color: root.toneFor(modelData.key)
                font.family: Style.font.family
                font.pixelSize: Style.font.body
              }
            }
          }
        }

        // Details: hardware readouts that are not resources
        Column {
          width: parent.width
          spacing: Style.space(6)
          visible: root.showDetails

          Rectangle {
            width: parent.width
            height: Math.max(1, Style.space(1))
            color: Color.muted
            opacity: 0.25
          }

          Text {
            text: "Graphics"
            visible: root.gpu !== null
            color: Color.muted
            font.family: Style.font.family
            font.pixelSize: Style.font.caption
          }

          Text {
            width: parent.width
            visible: root.gpu !== null
            wrapMode: Text.WordWrap
            text: root.gpu
              ? Format.mib(root.gpu.vramUsedMiB) + " of " + Format.mib(root.gpu.vramTotalMiB) + " VRAM"
                + "   ·   " + Format.celsius(root.gpu.tempC)
                + "   ·   " + Format.watts(root.gpu.watts)
              : ""
            color: Color.foreground
            font.family: Style.font.family
            font.pixelSize: Style.font.bodySmall
          }

          Text {
            text: "Sampling"
            color: Color.muted
            font.family: Style.font.family
            font.pixelSize: Style.font.caption
          }

          Text {
            width: parent.width
            wrapMode: Text.WordWrap
            text: {
              if (!root.svc) return ""
              var p = root.svc.coreClasses ? root.svc.coreClasses.p.length : 0
              var e = root.svc.coreClasses ? root.svc.coreClasses.e.length : 0
              return p + "P / " + e + "E threads   ·   " + (root.svc.interval / 1000)
                + "s   ·   " + root.svc.gpuBackend
            }
            color: Color.foreground
            font.family: Style.font.family
            font.pixelSize: Style.font.bodySmall
          }
        }

        // Toggle
        Item {
          width: parent.width
          height: toggleLabel.height + Style.space(8)

          Rectangle {
            anchors.fill: parent
            radius: Style.cornerRadius
            color: Color.foreground
            opacity: toggleHover.hovered ? 0.08 : 0.0
          }

          Text {
            id: toggleLabel
            anchors.centerIn: parent
            text: root.showDetails ? "\u{F0143}  Hide details" : "\u{F0140}  Full details"
            color: Color.muted
            font.family: Style.font.family
            font.pixelSize: Style.font.bodySmall
          }

          HoverHandler { id: toggleHover }

          TapHandler {
            onTapped: root.showDetails = !root.showDetails
          }
        }
      }
    }
  }
}
