import QtQuick
import Quickshell
import qs.Commons
import qs.Ui
import "components"

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

  function switchPanel(direction) {
    if (root.bar && typeof root.bar.switchPanelFrom === "function")
      return root.bar.switchPanelFrom(root.barIdentity, direction)
    return false
  }

  onOpenedChanged: {
    if (!opened) showDetails = false
    if (!opened && details) { details.resetSort(); details.resetCoreDetail() }
    // Rows accumulate while open and start fresh on each opening, so a panel
    // left open for hours does not reopen showing yesterday's spike.
    if (opened && overview) overview.resetSticky()
    if (svc) svc.panelOpen = opened
  }
  onShowDetailsChanged: if (svc) svc.panelOpen = root.opened

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

        Details {
          id: details
          width: parent.width
          visible: root.showDetails
          svc: root.svc
          nowMs: root.nowMs
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
