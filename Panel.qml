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

  // The bar identifies a panel by the widget mounted in its slot, not by this
  // nested panel, so the popout coordinator has to be handed the host widget.
  property var anchorItem: null
  property var hostWidget: null
  readonly property var barIdentity: hostWidget || root

  readonly property var svc: bar && bar.shell ? bar.shell.serviceFor("hzerrad.vitals") : null
  readonly property var constraint: svc ? svc.constraint : null
  readonly property var anomalies: svc ? svc.anomalies : []

  // Ranked by pressure, so the answer is always the top row.
  readonly property var ranked: svc && svc.resources
    ? svc.resources.slice().sort(function (a, b) { return b.pressure - a.pressure })
    : []

  function isAnomalous(key) {
    for (var i = 0; i < anomalies.length; i++) if (anomalies[i].key === key) return true
    return false
  }

  function switchPanel(direction) {
    if (root.bar && typeof root.bar.switchPanelFrom === "function")
      return root.bar.switchPanelFrom(root.barIdentity, direction)
    return false
  }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(360))
    contentHeight: panel.fittedContentHeight(column.implicitHeight)

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onCloseRequested: root.close()
      onTabRequested: function (direction) { root.switchPanel(direction) }

      Column {
        id: column
        width: parent.width
        spacing: Style.space(14)

        // 1. Now — what is limiting, and for how long.
        Column {
          width: parent.width
          spacing: Style.space(2)

          Text {
            text: root.constraint ? root.constraint.label : "Idle"
            color: Color.foreground
            font.family: Style.font.family
            font.pixelSize: Style.font.display
          }

          Text {
            width: parent.width
            elide: Text.ElideRight
            text: root.constraint
              ? root.constraint.display
                + (root.svc && root.svc.since > 0
                    ? " · limiting " + Format.duration(Date.now() - root.svc.since)
                    : "")
              : "Nothing is under pressure"
            color: Color.muted
            font.family: Style.font.family
            font.pixelSize: Style.font.bodySmall
          }
        }

        // 2. Every resource, ranked by how close it is to its limit.
        Column {
          width: parent.width
          spacing: Style.space(4)

          Repeater {
            model: root.ranked

            Row {
              width: column.width
              spacing: Style.space(8)

              Text {
                width: Style.space(110)
                elide: Text.ElideRight
                anchors.verticalCenter: parent.verticalCenter
                text: modelData.glyph + "  " + modelData.label
                color: Color.foreground
                font.family: Style.font.family
                font.pixelSize: Style.font.body
              }

              Sparkline {
                anchors.verticalCenter: parent.verticalCenter
                values: (root.svc && root.svc.history[modelData.key]) || []
                stroke: root.isAnomalous(modelData.key) ? Color.urgent : Color.muted
              }

              Text {
                anchors.verticalCenter: parent.verticalCenter
                text: modelData.display
                color: root.isAnomalous(modelData.key) ? Color.urgent : Color.foreground
                font.family: Style.font.family
                font.pixelSize: Style.font.body
              }
            }
          }
        }

        // 3. Thermals and power.
        Text {
          width: parent.width
          visible: text !== ""
          text: (root.svc && root.svc.gpuSample)
            ? "GPU " + Format.celsius(root.svc.gpuSample.tempC)
              + " · " + Format.watts(root.svc.gpuSample.watts)
              + " · " + Format.mib(root.svc.gpuSample.vramUsedMiB)
              + " / " + Format.mib(root.svc.gpuSample.vramTotalMiB)
            : ""
          color: Color.muted
          font.family: Style.font.family
          font.pixelSize: Style.font.caption
        }
      }
    }
  }
}
