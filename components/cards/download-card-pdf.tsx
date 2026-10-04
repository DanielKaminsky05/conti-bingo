"use client"

import { useTransition } from "react"
import { toast } from "sonner"
import { DownloadIcon, Loader2Icon } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { getOrCreatePlayerCard } from "@/lib/actions/play"
import { composeSquares, type PrintCell } from "@/lib/bingo/print-layout"
import type { PrintSource } from "@/lib/queries/print"
import { Button } from "@/components/ui/button"

/**
 * "Download PDF" — renders the card (master for hosts, the viewer's own card
 * otherwise; see `getPrintSource`) to a printable US Letter page in the browser.
 */
export function DownloadCardPdf({ source }: { source: PrintSource }) {
  const [pending, start] = useTransition()

  function onClick() {
    start(async () => {
      try {
        let cells: PrintCell[] | null = source.cells
        if (!cells) {
          // Viewer's shuffled card doesn't exist yet — create it (idempotent),
          // exactly as opening the Play tab would, then read its layout.
          const res = await getOrCreatePlayerCard({ cardId: source.cardId })
          if (!res.ok) {
            toast.error(res.error)
            return
          }
          const { data, error } = await createClient()
            .from("player_card_cells")
            .select("position, challenge_id")
            .eq("player_card_id", res.data.playerCardId)
          if (error || !data?.length) {
            toast.error("Couldn't load your card. Try again.")
            return
          }
          cells = data.map((c) => ({ position: c.position, challengeId: c.challenge_id }))
        }

        const { downloadCardPdf } = await import("@/lib/print/render-card-pdf")
        await downloadCardPdf({
          gridSize: source.gridSize,
          squares: composeSquares(source.gridSize, cells, source.challenges, source.freeImageUrl),
          fileName: source.fileName,
        })
      } catch {
        toast.error("Couldn't create the PDF. Try again.")
      }
    })
  }

  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={pending}>
      {pending ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />}
      PDF
    </Button>
  )
}
