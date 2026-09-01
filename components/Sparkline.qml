import QtQuick
import qs.Commons

// The ambient rung: what the machine is doing, as texture rather than digits.
Canvas {
  id: root

  property var values: []
  property color stroke: Color.muted
  property int cells: 12

  implicitWidth: Style.space(cells)
  implicitHeight: Style.space(3)

  onValuesChanged: requestPaint()
  onStrokeChanged: requestPaint()

  onPaint: {
    var ctx = getContext("2d")
    ctx.reset()
    if (!values || values.length === 0) return

    var n = Math.min(cells, values.length)
    var slice = values.slice(values.length - n)
    var w = width / cells
    ctx.fillStyle = stroke

    for (var i = 0; i < slice.length; i++) {
      var v = Math.max(0, Math.min(1, slice[i]))
      var h = Math.max(1, v * height)
      ctx.fillRect((cells - n + i) * w, height - h, Math.max(1, w - 1), h)
    }
  }
}
