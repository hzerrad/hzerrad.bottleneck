import QtQuick
import qs.Commons
import "../lib/Hardware.js" as Hardware
import "../lib/Format.js" as Format

// Where you stand, who is using it, and whether this has happened before —
// three zones in the order a person asks those questions. The verdict and the
// summary rows live in Overview.qml above this.
Column {
  id: root

  property var svc: null
  property double nowMs: Date.now()

  spacing: Style.space(12)

  readonly property var gpu: svc ? svc.gpuSample : null
  readonly property var mem: (svc && svc.memInfo) ? svc.memInfo : ({})
  readonly property string sort: svc ? svc.effectiveProcSort : "cpu"

  function resetSort() { if (svc) svc.procSortOverride = "" }

  function cycleSort() {
    if (!svc) return
    var order = svc.gpuBackend !== "none" ? ["cpu", "mem", "gpu"] : ["cpu", "mem"]
    var idx = order.indexOf(root.sort)
    svc.procSortOverride = order[(idx + 1) % order.length]
  }

  readonly property string gpuName:
    Hardware.gpuIdentity(svc ? svc.gpuBackend : "none",
      gpu ? gpu.name : null,
      (gpu && gpu.vramTotalMiB > 0) ? Format.mib(gpu.vramTotalMiB) : "")

  // The fullest filesystem, not every mount: naming the one closest to full is
  // the same editorial judgement the ranking makes upstairs.
  readonly property var fullestFs: {
    if (!svc || !svc.filesystems || !svc.filesystems.length) return null
    var best = svc.filesystems[0]
    for (var i = 1; i < svc.filesystems.length; i++) {
      if (svc.filesystems[i].usedPct > best.usedPct) best = svc.filesystems[i]
    }
    return best
  }

  readonly property int otherFsCount:
    (svc && svc.filesystems) ? Math.max(0, svc.filesystems.length - 1) : 0

  readonly property var procRows: {
    if (!svc) return []
    if (sort === "gpu") {
      return (svc.gpuProcs || []).slice(0, 6).map(function (g) {
        return { name: g.name,
                 lead: Math.round(g.smPct) + "% gpu",
                 sub: Math.round(g.memPct) + "% mem" }
      })
    }
    return (svc.procs || []).slice(0, 6).map(function (p) {
      return root.sort === "mem"
        ? { name: p.name, lead: Math.round(p.memPct) + "% mem",
            sub: Math.round(p.cpuPct) + "% cpu" }
        : { name: p.name, lead: Math.round(p.cpuPct) + "% cpu",
            sub: Math.round(p.memPct) + "% mem" }
    })
  }

  readonly property var spikeRows: (svc && svc.spikes) ? svc.spikes.slice(0, 6) : []

  // ---------------------------------------------------------------- Now
  Column {
    width: parent.width
    spacing: Style.space(4)

    Text {
      text: "Now"
      color: Color.muted
      font.family: Style.font.family
      font.pixelSize: Style.font.caption
    }

    // CPU
    Item {
      width: parent.width
      height: cpuName.implicitHeight

      Text {
        id: cpuName
        anchors.left: parent.left
        text: root.svc && root.svc.cpuModel !== "" ? root.svc.cpuModel : "CPU"
        color: Color.foreground
        font.family: Style.font.family
        font.pixelSize: Style.font.bodySmall
      }

      Text {
        anchors.right: parent.right
        visible: text !== ""
        text: {
          if (!root.svc) return ""
          for (var i = 0; i < root.svc.resources.length; i++) {
            if (root.svc.resources[i].key === "cputemp") return root.svc.resources[i].display
          }
          return ""
        }
        color: Color.muted
        font.family: Style.font.family
        font.pixelSize: Style.font.bodySmall
      }
    }

    Text {
      width: parent.width
      text: {
        if (!root.svc) return ""
        var p = null
        var e = null
        for (var i = 0; i < root.svc.resources.length; i++) {
          if (root.svc.resources[i].key === "pcore") p = root.svc.resources[i]
          if (root.svc.resources[i].key === "ecore") e = root.svc.resources[i]
        }
        var out = p ? "P-cores " + p.display : ""
        if (e) out += (out ? "    " : "") + "E-cores " + e.display
        return out
      }
      color: Color.muted
      font.family: Style.font.family
      font.pixelSize: Style.font.caption
    }

    // GPU
    Item {
      width: parent.width
      height: gpuName.implicitHeight
      visible: root.gpuName !== null

      Text {
        id: gpuName
        anchors.left: parent.left
        text: root.gpuName ? root.gpuName : ""
        color: Color.foreground
        font.family: Style.font.family
        font.pixelSize: Style.font.bodySmall
      }

      Text {
        anchors.right: parent.right
        visible: root.gpu !== null && root.gpu.watts !== undefined
        text: root.gpu ? Format.watts(root.gpu.watts) : ""
        color: Color.muted
        font.family: Style.font.family
        font.pixelSize: Style.font.bodySmall
      }
    }

    Item {
      width: parent.width
      height: vramText.implicitHeight
      visible: root.gpu !== null && root.gpu.vramTotalMiB > 0

      Text {
        id: vramText
        anchors.left: parent.left
        text: root.gpu
          ? "VRAM " + Format.mib(root.gpu.vramUsedMiB) + " of " + Format.mib(root.gpu.vramTotalMiB)
          : ""
        color: Color.muted
        font.family: Style.font.family
        font.pixelSize: Style.font.caption
      }

      Text {
        anchors.right: parent.right
        visible: root.gpu !== null && root.gpu.tempC !== null
        text: root.gpu && root.gpu.tempC !== null ? Format.celsius(root.gpu.tempC) : ""
        color: Color.muted
        font.family: Style.font.family
        font.pixelSize: Style.font.caption
      }
    }

    // Memory
    Item {
      width: parent.width
      height: ramText.implicitHeight
      visible: root.mem.memTotal > 0

      Text {
        id: ramText
        anchors.left: parent.left
        text: root.mem.memTotal
          ? Format.bytes(root.mem.memTotal - root.mem.memAvailable) + " of "
            + Format.bytes(root.mem.memTotal)
          : ""
        color: Color.foreground
        font.family: Style.font.family
        font.pixelSize: Style.font.bodySmall
      }

      Text {
        anchors.right: parent.right
        visible: root.mem.swapTotal > 0
        text: root.mem.swapTotal
          ? "swap " + Format.bytes(root.mem.swapTotal - root.mem.swapFree) + " of "
            + Format.bytes(root.mem.swapTotal)
          : ""
        color: Color.muted
        font.family: Style.font.family
        font.pixelSize: Style.font.bodySmall
      }
    }

    // Storage
    Item {
      width: parent.width
      height: diskText.implicitHeight
      visible: root.fullestFs !== null

      Text {
        id: diskText
        anchors.left: parent.left
        text: root.fullestFs
          ? root.fullestFs.usedPct + "% full on " + root.fullestFs.mount
          : ""
        color: Color.foreground
        font.family: Style.font.family
        font.pixelSize: Style.font.bodySmall
      }

      Text {
        anchors.right: parent.right
        visible: root.otherFsCount > 0
        text: root.otherFsCount === 1
          ? "1 other filesystem" : root.otherFsCount + " other filesystems"
        color: Color.muted
        font.family: Style.font.family
        font.pixelSize: Style.font.bodySmall
      }
    }
  }

  // ------------------------------------------------------- Using it now
  Column {
    width: parent.width
    spacing: Style.space(4)

    Item {
      width: parent.width
      height: usingLabel.implicitHeight

      Text {
        id: usingLabel
        anchors.left: parent.left
        text: "Using it now, "
        color: Color.muted
        font.family: Style.font.family
        font.pixelSize: Style.font.caption
      }

      // A heading is a weak affordance, so this half of it is styled as a
      // control: tinted, underlined on hover, with a pointing cursor. It has
      // to look clickable without costing the panel a row of pills.
      Text {
        id: sortToken
        anchors.left: usingLabel.right
        text: "by " + root.sort
        color: Color.accent
        font.family: Style.font.family
        font.pixelSize: Style.font.caption
        font.underline: sortHover.hovered
      }

      HoverHandler {
        id: sortHover
        cursorShape: Qt.PointingHandCursor
      }

      TapHandler { onTapped: root.cycleSort() }
    }

    Text {
      width: parent.width
      visible: root.procRows.length === 0
      text: root.sort === "gpu" ? "No processes are using the GPU." : "Sampling…"
      color: Color.muted
      font.family: Style.font.family
      font.pixelSize: Style.font.bodySmall
    }

    Repeater {
      model: root.procRows

      Item {
        width: root.width
        height: procName.implicitHeight + Style.space(2)

        Text {
          id: procName
          anchors.left: parent.left
          width: Style.space(130)
          elide: Text.ElideRight
          text: modelData.name
          color: Color.foreground
          font.family: Style.font.family
          font.pixelSize: Style.font.bodySmall
        }

        Text {
          anchors.left: procName.right
          anchors.leftMargin: Style.space(8)
          text: modelData.lead
          color: Color.foreground
          font.family: Style.font.family
          font.pixelSize: Style.font.bodySmall
        }

        Text {
          anchors.right: parent.right
          text: modelData.sub
          color: Color.muted
          font.family: Style.font.family
          font.pixelSize: Style.font.bodySmall
        }
      }
    }
  }

  // ----------------------------------------------------------- Recently
  Column {
    width: parent.width
    spacing: Style.space(4)

    Text {
      text: "Recently"
      color: Color.muted
      font.family: Style.font.family
      font.pixelSize: Style.font.caption
    }

    Text {
      width: parent.width
      visible: root.spikeRows.length === 0
      text: "Nothing has crossed " + (root.svc ? root.svc.spikeThreshold : 70) + "% yet."
      color: Color.muted
      font.family: Style.font.family
      font.pixelSize: Style.font.bodySmall
    }

    Repeater {
      model: root.spikeRows

      Item {
        width: root.width
        height: spikeBody.implicitHeight + Style.space(3)

        Text {
          id: spikeWhen
          anchors.left: parent.left
          anchors.top: spikeBody.top
          width: Style.space(64)
          text: Format.ago(root.nowMs - modelData.at)
          color: Color.muted
          font.family: Style.font.family
          font.pixelSize: Style.font.bodySmall
        }

        Column {
          id: spikeBody
          anchors.left: spikeWhen.right
          anchors.right: parent.right
          spacing: Style.space(1)

          Text {
            text: modelData.label + " hit " + modelData.display
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
  }
}
