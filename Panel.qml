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
  moduleName: "hzerrad.bottleneck"
  ipcTarget: "hzerrad.bottleneck"

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

  readonly property var svc: bar && bar.shell ? bar.shell.serviceFor("hzerrad.bottleneck") : null
  readonly property var gpu: svc ? svc.gpuSample : null

  function switchPanel(direction) {
    if (root.bar && typeof root.bar.switchPanelFrom === "function")
      return root.bar.switchPanelFrom(root.barIdentity, direction)
    return false
  }

  onOpenedChanged: {
    if (!opened) showDetails = false
    // Rows accumulate while open and start fresh on each opening, so a panel
    // left open for hours does not reopen showing yesterday's spike.
    if (opened && overview) overview.resetSticky()
    if (svc) svc.panelOpen = opened
  }
  onShowDetailsChanged: if (svc) svc.panelOpen = root.opened

  readonly property string procSort: svc ? svc.procSort : "cpu"
  function setProcSort(mode) { if (svc) svc.procSort = mode }

  readonly property var procRows: {
    if (!svc) return []
    if (procSort === "gpu") {
      return (svc.gpuProcs || []).map(function (g) {
        return { pid: g.pid, name: g.name, value: g.smPct, unit: "%", sub: g.memPct + "% mem" }
      })
    }
    var list = (svc.procs || []).slice(0, 6)
    return list.map(function (pr) {
      var procs = pr.count > 1 ? pr.count + " procs" : ""
      return procSort === "mem"
        ? { pid: pr.pid, name: pr.name, value: pr.memPct, unit: "%",
            sub: Math.round(pr.cpuPct) + "% cpu" + (procs ? "  ·  " + procs : "") }
        : { pid: pr.pid, name: pr.name, value: pr.cpuPct, unit: "%",
            sub: Math.round(pr.memPct) + "% mem" + (procs ? "  ·  " + procs : "") }
    })
  }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(root.showDetails ? Style.space(560) : Style.space(420))
    contentHeight: panel.fittedContentHeight(column.implicitHeight)

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onCloseRequested: root.close()
      onTabRequested: function (direction) { root.switchPanel(direction) }

      Flickable {
        id: scroll
        anchors.fill: parent
        contentWidth: width
        contentHeight: column.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        interactive: contentHeight > height

      Column {
        id: column
        width: scroll.width
        spacing: Style.space(12)

        Overview {
          id: overview
          width: parent.width
          svc: root.svc
          nowMs: root.nowMs
        }

        // Details
        Column {
          width: parent.width
          spacing: Style.space(4)
          visible: root.showDetails

          // Spikes
          SectionHeader { width: parent.width; text: "Recent spikes" }

          Text {
            width: parent.width
            visible: !root.svc || root.svc.spikes.length === 0
            text: "Nothing has crossed " + (root.svc ? root.svc.spikeThreshold : 70) + "% yet"
            color: Color.muted
            font.family: Style.font.family
            font.pixelSize: Style.font.bodySmall
          }

          Repeater {
            model: root.svc ? root.svc.spikes : []

            Item {
              width: column.width
              height: spikeLine.height + Style.space(4)

              Text {
                id: spikeWhen
                anchors.left: parent.left
                anchors.top: spikeLine.top
                width: Style.space(70)
                text: Format.ago(root.nowMs - modelData.at)
                color: Color.muted
                font.family: Style.font.family
                font.pixelSize: Style.font.bodySmall
              }

              Column {
                id: spikeLine
                anchors.left: spikeWhen.right
                anchors.right: parent.right
                spacing: Style.space(1)

                Text {
                  text: modelData.glyph + "  " + modelData.label + "  " + modelData.display
                  color: Color.foreground
                  font.family: Style.font.family
                  font.pixelSize: Style.font.bodySmall
                }

                Text {
                  width: parent.width
                  elide: Text.ElideRight
                  visible: modelData.culprit !== ""
                  text: modelData.culprit
                  color: Color.muted
                  font.family: Style.font.family
                  font.pixelSize: Style.font.caption
                }
              }
            }
          }

          // Processes
          SectionHeader {
            width: parent.width
            text: "Top processes"

            Repeater {
              model: root.svc && root.svc.gpuBackend !== "none"
                ? ["cpu", "mem", "gpu"] : ["cpu", "mem"]

              Rectangle {
                width: modeLabel.implicitWidth + Style.space(12)
                height: modeLabel.implicitHeight + Style.space(6)
                radius: Style.cornerRadius
                color: Qt.rgba(Color.foreground.r, Color.foreground.g, Color.foreground.b,
                  root.procSort === modelData ? 0.16 : (modeHover.hovered ? 0.08 : 0.0))

                Text {
                  id: modeLabel
                  anchors.centerIn: parent
                  text: modelData.toUpperCase()
                  color: root.procSort === modelData ? Color.foreground : Color.muted
                  font.family: Style.font.family
                  font.pixelSize: Style.font.caption
                }

                HoverHandler { id: modeHover }
                TapHandler { onTapped: root.setProcSort(modelData) }
              }
            }
          }

          Text {
            width: parent.width
            visible: root.procRows.length === 0
            text: root.procSort === "gpu" ? "No processes using the GPU" : "Sampling…"
            color: Color.muted
            font.family: Style.font.family
            font.pixelSize: Style.font.bodySmall
          }

          Repeater {
            model: root.procRows

            Item {
              width: column.width
              height: procName.height + Style.space(4)

              Text {
                id: procName
                anchors.left: parent.left
                anchors.verticalCenter: parent.verticalCenter
                width: Style.space(150)
                elide: Text.ElideRight
                text: modelData.name
                color: Color.foreground
                font.family: Style.font.family
                font.pixelSize: Style.font.bodySmall
              }

              Text {
                anchors.left: procName.right
                anchors.leftMargin: Style.space(8)
                anchors.verticalCenter: parent.verticalCenter
                text: modelData.sub
                color: Color.muted
                font.family: Style.font.family
                font.pixelSize: Style.font.caption
              }

              Text {
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                width: Style.space(50)
                horizontalAlignment: Text.AlignRight
                text: Math.round(modelData.value) + modelData.unit
                color: Color.foreground
                font.family: Style.font.family
                font.pixelSize: Style.font.bodySmall
              }
            }
          }

          // CPU cores
          SectionHeader { width: parent.width; text: "CPU cores" }

          Grid {
            width: parent.width
            columns: 2
            columnSpacing: Style.space(16)
            rowSpacing: Style.space(4)

            Repeater {
              model: root.svc ? root.svc.coreStats : []

              Item {
                width: (column.width - Style.space(16)) / 2
                height: coreLabel.implicitHeight + Style.space(5)

                Text {
                  id: coreLabel
                  anchors.left: parent.left
                  anchors.verticalCenter: parent.verticalCenter
                  width: Style.space(34)
                  text: modelData.name
                  color: modelData.kind === "P" ? Color.foreground : Color.muted
                  font.family: Style.font.family
                  font.pixelSize: Style.font.caption
                }

                Rectangle {
                  id: coreTrack
                  anchors.left: coreLabel.right
                  anchors.leftMargin: Style.space(4)
                  anchors.right: corePct.left
                  anchors.rightMargin: Style.space(6)
                  anchors.verticalCenter: parent.verticalCenter
                  height: Math.max(2, Style.space(4))
                  radius: height / 2
                  color: Color.muted
                  opacity: 0.2

                  Rectangle {
                    anchors.left: parent.left
                    anchors.top: parent.top
                    anchors.bottom: parent.bottom
                    width: parent.width * Math.max(0, Math.min(1, modelData.busyPct / 100))
                    radius: parent.radius
                    color: Color.foreground
                    opacity: 1.0
                  }
                }

                Text {
                  id: corePct
                  anchors.right: coreTemp.left
                  anchors.rightMargin: Style.space(6)
                  anchors.verticalCenter: parent.verticalCenter
                  width: Style.space(34)
                  horizontalAlignment: Text.AlignRight
                  text: Math.round(modelData.busyPct) + "%"
                  color: Color.foreground
                  font.family: Style.font.family
                  font.pixelSize: Style.font.caption
                }

                Text {
                  id: coreTemp
                  anchors.right: parent.right
                  anchors.verticalCenter: parent.verticalCenter
                  width: Style.space(40)
                  horizontalAlignment: Text.AlignRight
                  text: modelData.tempC !== null ? Format.celsius(modelData.tempC) : "—"
                  color: Color.muted
                  font.family: Style.font.family
                  font.pixelSize: Style.font.caption
                }
              }
            }
          }

          // Memory
          SectionHeader { width: parent.width; text: "Memory" }

          Text {
            width: parent.width
            wrapMode: Text.WordWrap
            text: {
              if (!root.svc || !root.svc.memInfo || !root.svc.memInfo.memTotal) return ""
              var m = root.svc.memInfo
              var used = m.memTotal - m.memAvailable
              var line = Format.bytes(used) + " of " + Format.bytes(m.memTotal) + " RAM"
              if (m.swapTotal > 0) {
                line += "   ·   " + Format.bytes(m.swapTotal - m.swapFree)
                  + " of " + Format.bytes(m.swapTotal) + " swap"
              }
              return line
            }
            color: Color.foreground
            font.family: Style.font.family
            font.pixelSize: Style.font.bodySmall
          }

          Text {
            width: parent.width
            visible: root.gpu !== null
            wrapMode: Text.WordWrap
            text: root.gpu
              ? Format.mib(root.gpu.vramUsedMiB) + " of " + Format.mib(root.gpu.vramTotalMiB) + " VRAM"
                + "   ·   " + Format.celsius(root.gpu.tempC) + "   ·   " + Format.watts(root.gpu.watts)
              : ""
            color: Color.foreground
            font.family: Style.font.family
            font.pixelSize: Style.font.bodySmall
          }

          // Storage
          SectionHeader { width: parent.width; text: "Storage" }

          Repeater {
            model: root.svc ? root.svc.filesystems : []

            Item {
              width: column.width
              height: fsMount.implicitHeight + Style.space(4)

              Text {
                id: fsMount
                anchors.left: parent.left
                anchors.verticalCenter: parent.verticalCenter
                text: modelData.mount
                color: Color.foreground
                font.family: Style.font.family
                font.pixelSize: Style.font.bodySmall
              }

              Text {
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                text: modelData.usedPct + "% full"
                color: modelData.usedPct >= 90 ? Color.urgent : Color.muted
                font.family: Style.font.family
                font.pixelSize: Style.font.bodySmall
              }
            }
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
}
