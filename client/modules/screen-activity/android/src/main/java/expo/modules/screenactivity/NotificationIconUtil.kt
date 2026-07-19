package expo.modules.screenactivity

import android.graphics.Bitmap

/**
 * Shared helpers for preparing notification icons in the screen-activity module.
 */
object NotificationIconUtil {

  /**
   * Crops the transparent border around the visible artwork so it fills more of the frame.
   * The branded logo PNG has heavy transparent padding (needed for the splash screen), which
   * makes it look tiny inside a notification's circular icon chip. This scans for the bounding
   * box of non-transparent pixels, then returns a square crop (with a small margin) centered on
   * that box. Falls back to the original bitmap if anything is off.
   */
  fun cropTransparentBorder(src: Bitmap): Bitmap {
    val w = src.width
    val h = src.height
    if (w == 0 || h == 0) return src

    var minX = w
    var minY = h
    var maxX = -1
    var maxY = -1
    val alphaThreshold = 16 // ignore near-transparent antialiasing pixels

    val row = IntArray(w)
    for (y in 0 until h) {
      src.getPixels(row, 0, w, 0, y, w, 1)
      for (x in 0 until w) {
        val alpha = (row[x] ushr 24) and 0xFF
        if (alpha > alphaThreshold) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }

    // Nothing visible found — return original untouched.
    if (maxX < minX || maxY < minY) return src

    val contentW = maxX - minX + 1
    val contentH = maxY - minY + 1
    // Small margin (~12% of the larger content dimension) so the logo isn't edge-to-edge.
    val margin = (maxOf(contentW, contentH) * 0.12f).toInt()
    // Make it square so the notification circle mask crops evenly.
    val side = maxOf(contentW, contentH) + margin * 2
    val cx = minX + contentW / 2
    val cy = minY + contentH / 2
    var left = cx - side / 2
    var top = cy - side / 2
    if (left < 0) left = 0
    if (top < 0) top = 0
    val cropSide = minOf(side, w - left, h - top)
    if (cropSide <= 0) return src

    return Bitmap.createBitmap(src, left, top, cropSide, cropSide)
  }
}
