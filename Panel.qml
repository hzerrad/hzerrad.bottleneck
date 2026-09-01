import QtQuick
import QtQuick.Layouts
import Quickshell
import qs.Commons
import qs.Ui
import "components"
import "lib/Format.js" as Format

Panel {
  id: root
  moduleName: "hzerrad.vitals"

  // Same accessor as the bar widget — the shell hands the service out by id.
  readonly property var svc: bar && bar.shell ? bar.shell.serviceFor("hzerrad.vitals") : null
  readonly property var constraint: svc ? svc.constraint : null
  readonly property var resources: svc ? svc.resources : []
  readonly property var anomalies: svc ? svc.anomalies : []

  ColumnLayout {
    spacing: Style.space(3)

    // 1. Now — what is limiting, for how long.
    ColumnLayout {
      spacing: Style.space(1)
      Text {
        text: root.constraint ? root.constraint.label : "Idle"
        color: Color.foreground
        font.family: Style.font.family
        font.pixelSize: Style.font.display
      }
      Text {
        text: root.constraint && root.svc && root.svc.since > 0
          ? root.constraint.display + " · limiting " + Format.duration(Date.now() - root.svc.since)
          : "Nothing is under pressure"
        color: Color.muted
        font.family: Style.font.family
        font.pixelSize: Style.font.bodySmall
      }
    }

    // 2. Resources — ranked, so the answer is always the top row. This is the
    // piece the old fixed-section layout structurally could not do.
    ColumnLayout {
      spacing: Style.space(1)
      Repeater {
        model: root.resources.slice().sort(function (a, b) { return b.pressure - a.pressure })
        delegate: RowLayout {
          spacing: Style.space(2)
          Text {
            text: modelData.glyph + "  " + modelData.label
            color: Color.foreground
            font.family: Style.font.family
            font.pixelSize: Style.font.body
            Layout.preferredWidth: Style.space(20)
          }
          Sparkline {
            values: (root.svc && root.svc.history[modelData.key]) || []
            stroke: Color.muted
          }
          Text {
            text: modelData.display
            color: root.anomalies.some(function (a) { return a.key === modelData.key })
              ? Color.urgent : Color.foreground
            font.family: Style.font.family
            font.pixelSize: Style.font.body
          }
        }
      }
    }

    // 3. Thermals and power.
    RowLayout {
      spacing: Style.space(3)
      Text {
        visible: root.svc !== null && root.svc.gpuSample !== null
        text: (root.svc && root.svc.gpuSample)
          ? "GPU " + Format.celsius(root.svc.gpuSample.tempC) + " · " + Format.watts(root.svc.gpuSample.watts)
          : ""
        color: Color.muted
        font.family: Style.font.family
        font.pixelSize: Style.font.caption
      }
    }
  }
}
