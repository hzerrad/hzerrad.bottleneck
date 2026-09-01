import QtQuick
import qs.Commons

// A faint track sits behind the bars so a flat history reads as a gauge
// rather than an em-dash.
Canvas {
  id: root

  property var values: []
  property color stroke: Color.muted
  property int cells: 12
  property real cellSize: Style.space(3)
  property real trackAlpha: 0.14

  implicitWidth: cells * cellSize
  implicitHeight: Style.space(16)

  onValuesChanged: requestPaint()
  onStrokeChanged: requestPaint()
  onWidthChanged: requestPaint()
  onHeightChanged: requestPaint()

  onPaint: {
    var ctx = getContext("2d")
    ctx.reset()

    var w = width / cells
    var barW = Math.max(1, w - Math.max(1, w * 0.25))

    // A thin baseline — full-height track blocks swamp the data on top.
    var base = Math.max(1, Math.round(height * 0.08))
    ctx.fillStyle = Qt.rgba(stroke.r, stroke.g, stroke.b, trackAlpha)
    ctx.fillRect(0, height - base, width, base)

    if (!values || values.length === 0) return

    var n = Math.min(cells, values.length)
    var slice = values.slice(values.length - n)
    var offset = cells - n
    var step = width / cells

    // A filled area, not bars: at low percentages discrete bars are 2px tall
    // and read as dashes.
    function yFor(v) {
      var c = Math.max(0, Math.min(1, v))
      return height - Math.max(1, c * height)
    }

    var x0 = offset * step
    ctx.beginPath()
    ctx.moveTo(x0, height)
    for (var i = 0; i < slice.length; i++) {
      ctx.lineTo(x0 + i * step + step / 2, yFor(slice[i]))
    }
    ctx.lineTo(x0 + (slice.length - 1) * step + step / 2, height)
    ctx.closePath()
    ctx.fillStyle = Qt.rgba(stroke.r, stroke.g, stroke.b, 0.35)
    ctx.fill()

    ctx.beginPath()
    for (var j = 0; j < slice.length; j++) {
      var px = x0 + j * step + step / 2
      var py = yFor(slice[j])
      if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
    }
    ctx.strokeStyle = stroke
    ctx.lineWidth = Math.max(1, Math.round(height * 0.09))
    ctx.lineJoin = "round"
    ctx.stroke()
  }
}
