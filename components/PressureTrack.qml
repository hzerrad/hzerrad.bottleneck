import QtQuick
import qs.Commons

// How close a resource is to its own limit. A sparkline answers "is this
// moving"; this answers "how much room is left", which is the question the
// plugin is named after.
Item {
  id: root

  property real fraction: 0
  property color tone: Color.muted
  property real trackAlpha: 0.22

  implicitHeight: Math.max(2, Style.space(4))

  Rectangle {
    anchors.fill: parent
    radius: height / 2
    color: Qt.rgba(Color.muted.r, Color.muted.g, Color.muted.b, root.trackAlpha)
  }

  Rectangle {
    anchors.left: parent.left
    anchors.top: parent.top
    anchors.bottom: parent.bottom
    // A one-pixel sliver reads as a dot rather than as "nearly empty", so an
    // idle resource is drawn as genuinely empty.
    width: {
      var w = root.width * Math.max(0, Math.min(1, root.fraction))
      return w < 2 ? 0 : w
    }
    visible: width > 0
    radius: root.height / 2
    color: root.tone

    Behavior on width {
      NumberAnimation { duration: 180; easing.type: Easing.OutQuad }
    }
  }
}
