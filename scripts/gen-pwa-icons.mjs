// Generate PWA icons from the source favicon artwork (app/favicon.ico, which is
// actually a high-res square JPEG). Run: `node scripts/gen-pwa-icons.mjs`.
// sharp sniffs content type, so the .ico extension is fine.
import sharp from "sharp"

const SRC = "app/favicon.ico"
const BRAND = "#6aaa64" // marked-tile green, used as maskable padding bg

async function main() {
  // Standard (purpose: any) icons — full-bleed artwork.
  await sharp(SRC).resize(192, 192).png().toFile("public/icon-192.png")
  await sharp(SRC).resize(512, 512).png().toFile("public/icon-512.png")

  // Apple touch icon (Next serves app/apple-icon.png as <link rel=apple-touch-icon>).
  await sharp(SRC).resize(180, 180).png().toFile("app/apple-icon.png")

  // Maskable icon — inset the artwork ~10% into a brand-green field so Android's
  // circular/rounded mask never clips it (safe zone = inner 80%).
  await sharp(SRC)
    .resize(410, 410)
    .extend({ top: 51, bottom: 51, left: 51, right: 51, background: BRAND })
    .resize(512, 512)
    .png()
    .toFile("public/icon-maskable-512.png")

  console.log("PWA icons written: public/icon-192.png, icon-512.png, icon-maskable-512.png, app/apple-icon.png")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
