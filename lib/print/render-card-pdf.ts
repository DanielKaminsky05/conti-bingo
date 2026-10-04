import {
  FREE_LABEL,
  LINE_HEIGHT,
  containRect,
  fitText,
  pageGeometry,
  squareContent,
  squareRect,
  type PrintSquare,
  type Rect,
} from '@/lib/bingo/print-layout'

/**
 * Browser-only: render a card to a PDF and trigger a download. jsPDF is
 * imported on demand so it never lands in the main bundle.
 *
 * Images go through a <canvas> first: browsers apply EXIF orientation when
 * decoding (phone photos come out upright), any format the browser can decode
 * (WebP, GIF, PNG…) becomes JPEG, and large photos are downscaled so the PDF
 * stays small. A square whose image can't be loaded prints its text, or a
 * small "image unavailable" note if it has none.
 */

const MAX_IMAGE_PX = 900
const JPEG_QUALITY = 0.85
/** Give up on a single image after this long so the download never hangs. */
const IMAGE_TIMEOUT_MS = 15_000

type LoadedImage = { dataUrl: string; width: number; height: number }

async function loadImage(url: string): Promise<LoadedImage | null> {
  try {
    const img = new Image()
    img.crossOrigin = 'anonymous' // Storage serves Access-Control-Allow-Origin: *
    img.src = url
    await Promise.race([
      img.decode(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), IMAGE_TIMEOUT_MS)),
    ])
    const scale = Math.min(1, MAX_IMAGE_PX / Math.max(img.naturalWidth, img.naturalHeight))
    const width = Math.max(1, Math.round(img.naturalWidth * scale))
    const height = Math.max(1, Math.round(img.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#ffffff' // transparent PNGs would otherwise turn black as JPEG
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)
    return { dataUrl: canvas.toDataURL('image/jpeg', JPEG_QUALITY), width, height }
  } catch {
    return null
  }
}

type CardPdfInput = { gridSize: number; squares: PrintSquare[] }

/** Render and trigger the browser download. */
export async function downloadCardPdf({
  fileName,
  ...input
}: CardPdfInput & { fileName: string }): Promise<void> {
  const doc = await renderCardPdf(input)
  doc.save(fileName)
}

/** Render the card to an in-memory jsPDF document. */
export async function renderCardPdf({ gridSize, squares }: CardPdfInput) {
  const [{ jsPDF }, images] = await Promise.all([
    import('jspdf'),
    (async () => {
      const urls = [...new Set(squares.map((s) => s.imageUrl).filter((u): u is string => !!u))]
      const loaded = await Promise.all(urls.map(loadImage))
      return new Map(urls.map((u, i) => [u, loaded[i]]))
    })(),
  ])

  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(0, 0, 0)
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(1)

  const measure = (text: string, size: number) => {
    doc.setFontSize(size)
    return doc.getTextWidth(text)
  }

  const drawText = (text: string, box: Rect, max?: number) => {
    const { size, lines } = fitText(text, box.w, box.h, measure, max)
    doc.setFontSize(size)
    const lh = size * LINE_HEIGHT
    // Center the block vertically; first baseline sits ~0.8em below its line top.
    const y0 = box.y + box.h / 2 - (lines.length * lh) / 2 + size * 0.8
    lines.forEach((line, i) => {
      doc.text(line, box.x + box.w / 2, y0 + i * lh, { align: 'center' })
    })
  }

  const { title } = pageGeometry(gridSize)
  doc.setFontSize(title.size)
  doc.text(title.text, title.x, title.y, { align: 'center' })

  squares.forEach((square, position) => {
    const rect = squareRect(gridSize, position)
    doc.rect(rect.x, rect.y, rect.w, rect.h)

    const image = square.imageUrl ? images.get(square.imageUrl) ?? null : null
    // A free space whose image failed to load still says "Free!".
    const text = square.free && !image ? FREE_LABEL : square.text
    const imageMissing = !square.free && !!square.imageUrl && !image

    const content = squareContent(rect, !!image, !!text)
    if (image && content.image) {
      const r = containRect(content.image, image.width, image.height)
      // Alias = the URL, so an image reused across squares is embedded once.
      doc.addImage(image.dataUrl, 'JPEG', r.x, r.y, r.w, r.h, square.imageUrl!, 'FAST')
    }
    if (text && content.text) {
      // Free! matches the other squares' weight; challenge text caps at 18pt.
      drawText(text, content.text, square.free ? 22 : undefined)
    } else if (imageMissing) {
      doc.setTextColor(140, 140, 140)
      drawText('Image unavailable', squareContent(rect, false, true).text!, 9)
      doc.setTextColor(0, 0, 0)
    }
  })

  return doc
}
