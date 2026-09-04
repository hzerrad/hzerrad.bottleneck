import QtQuick
import Quickshell
import qs.Commons
import qs.Ui
import "components"
import "lib/Format.js" as Format
import "lib/Theme.js" as Theme

// Footprint grows with what there is to say; at rest, a bare texture strip.
BarWidget {
  id: root
  moduleName: "hzerrad.bottleneck"

  // No QML singleton — the shell hands the service out by id, so null-guard.
  readonly property var svc: bar && bar.shell ? bar.shell.serviceFor("hzerrad.bottleneck") : null

  readonly property string detailCommand: setting("detailCommand", "btop")

  // `widgetState`, not `state` — shadowing Item.state breaks QML states.
  readonly property string widgetState: svc ? svc.barStateName : "calm"
  readonly property var constraint: svc ? svc.constraint : null
  readonly property bool showReadout: widgetState !== "calm"

  // The bar injects theme colours; Color.* is the outside-a-bar fallback.
  readonly property color baseTone: bar ? bar.barForeground : Color.foreground
  readonly property color urgentTone: bar ? bar.urgent : Color.urgent
  // barState and bandFor are the same rule at different scopes — same
  // thresholds, anomaly first in both — so the bar's colour and its
  // readout cannot disagree if they read from one source.
  readonly property string band: widgetState === "anomaly" ? "alarm" : widgetState

  // Calm dims the bar's own foreground rather than using Color.muted: the bar
  // draws over the user's wallpaper, where muted is not reliably legible.
  readonly property color tone: Theme.hueFor(band, svc ? svc.themePalette : ({}), {
    calm: Qt.rgba(baseTone.r, baseTone.g, baseTone.b, 0.55),
    mid: Color.accent,
    alarm: urgentTone
  })

  readonly property var pulseValues: (svc && constraint && svc.history[constraint.key])
    ? svc.history[constraint.key] : []

  readonly property string tooltipLine: {
    if (!constraint) return "Bottleneck — nothing under pressure"
    var parts = [constraint.label + " " + constraint.display]
    if (constraint.key === "vram" && svc && svc.gpuSample) {
      parts.push(Format.mib(svc.gpuSample.vramUsedMiB) + " / " + Format.mib(svc.gpuSample.vramTotalMiB))
    }
    if (svc && svc.since > 0) parts.push("limiting " + Format.duration(Date.now() - svc.since))
    return parts.join(" · ")
  }

  // Loaded by this widget, not a manifest entry point.
  function injectPanel() {
    var target = panelLoader.item
    if (!target) return
    if ("bar" in target) target.bar = root.bar
    if ("settings" in target) target.settings = root.settings
    if ("anchorItem" in target) target.anchorItem = root
    if ("hostWidget" in target) target.hostWidget = root
  }

  function togglePanel() { if (panelLoader.item && panelLoader.item.toggle) panelLoader.item.toggle() }
  function open() { if (panelLoader.item && panelLoader.item.open) panelLoader.item.open() }
  function close() { if (panelLoader.item && panelLoader.item.close) panelLoader.item.close() }
  readonly property bool opened: panelLoader.item ? panelLoader.item.opened === true : false

  // ensureService() injects only omarchyPath, never settings, so the widget
  // pushes config down. Without this every key but detailCommand is inert.
  function pushConfig() {
    if (!svc) return
    svc.interval = setting("interval", 2000)
    svc.calmThreshold = setting("calmThreshold", 40)
    svc.overviewDensity = setting("overviewDensity", "summary")
    svc.spikeThreshold = setting("spikeThreshold", 70)
    svc.notifications = setting("notifications", false)
    svc.thresholds = {
      alertTemp: setting("alertTemp", 88),
      alertGpuTemp: setting("alertGpuTemp", 83),
      alertDisk: setting("alertDisk", 90),
      alertVram: setting("alertVram", 95)
    }
  }

  onBarChanged: { injectPanel(); pushConfig() }
  onSettingsChanged: { injectPanel(); pushConfig() }
  onSvcChanged: pushConfig()
  Component.onCompleted: pushConfig()

  implicitWidth: root.vertical ? barSize : content.implicitWidth + Style.space(4)
  implicitHeight: root.vertical ? content.implicitHeight + Style.space(4) : barSize

  Loader {
    id: panelLoader
    active: true
    source: Qt.resolvedUrl("Panel.qml")
    visible: false
    onLoaded: {
      root.injectPanel()
      Qt.callLater(root.injectPanel)
    }
  }

  // One Grid: vertical stacks pulse/glyph/number, horizontal lays them out.
  Grid {
    id: content
    anchors.centerIn: parent
    rows: root.vertical ? 3 : 1
    columns: root.vertical ? 1 : 3
    spacing: Style.space(5)
    horizontalItemAlignment: Grid.AlignHCenter
    verticalItemAlignment: Grid.AlignVCenter

    Sparkline {
      values: root.pulseValues
      stroke: root.tone
    }

    Text {
      visible: root.showReadout
      text: root.constraint ? root.constraint.glyph : ""
      color: root.tone
      font.family: Style.font.family
      font.pixelSize: Style.bar.iconFont
    }

    Text {
      visible: root.showReadout
      text: root.constraint ? root.constraint.display : ""
      color: root.tone
      font.family: Style.font.family
      font.pixelSize: Style.font.body
    }
  }

  MouseArea {
    anchors.fill: parent
    acceptedButtons: Qt.LeftButton | Qt.RightButton
    hoverEnabled: true
    onEntered: if (root.bar) root.bar.showTooltip(root, root.tooltipLine)
    onExited: if (root.bar) root.bar.hideTooltip(root)
    onClicked: function (mouse) {
      if (root.bar) root.bar.hideTooltip(root)
      if (mouse.button === Qt.RightButton) {
        if (root.bar && root.bar.run) root.bar.run(root.detailCommand)
      } else {
        root.togglePanel()
      }
    }
  }
}
