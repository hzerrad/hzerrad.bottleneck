import QtQuick
import qs.Commons

// Separates detail blocks so every section is spaced and coloured alike.
Item {
  id: root

  property string text: ""
  default property alias rightItem: slot.data

  implicitHeight: label.implicitHeight + Style.space(10)

  Text {
    id: label
    anchors.left: parent.left
    anchors.bottom: parent.bottom
    text: root.text
    color: Color.muted
    font.family: Style.font.family
    font.pixelSize: Style.font.caption
  }

  Row {
    id: slot
    anchors.right: parent.right
    anchors.verticalCenter: label.verticalCenter
    spacing: Style.space(4)
  }

  Rectangle {
    anchors.left: label.right
    anchors.leftMargin: Style.space(8)
    anchors.right: slot.left
    anchors.rightMargin: Style.space(8)
    anchors.verticalCenter: label.verticalCenter
    height: 1
    color: Color.muted
    opacity: 0.18
  }
}
