import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth/current-user'
import { buildIdenticalLayout } from '@/lib/bingo/layout'
import { pdfFileName, type PrintCell, type PrintChallenge } from '@/lib/bingo/print-layout'
import { publicStorageUrl } from '@/lib/storage-url'
import type { CardWithChallenges } from '@/lib/queries/cards'

/** Everything the "Download PDF" button needs to render a card. */
export type PrintSource = {
  cardId: string
  gridSize: number
  /**
   * Positions to print. `null` = the viewer's own (shuffled) card hasn't been
   * created yet — the button creates it via `getOrCreatePlayerCard` first.
   */
  cells: PrintCell[] | null
  challenges: Record<string, PrintChallenge>
  freeImageUrl: string | null
  fileName: string
}

/**
 * Which version of a card the viewer downloads:
 *  - hosts get the MASTER card (authoring order);
 *  - everyone else gets THEIR OWN player card (their shuffle).
 * Identical-layout and co-op cards are the same for everyone, so they print the
 * master directly. A member who never opened a past (non-active) card gets the
 * master rather than a new player card. Returns null when the card can't be
 * printed yet (a draft without enough squares).
 */
export async function getPrintSource(
  card: CardWithChallenges,
  host: boolean
): Promise<PrintSource | null> {
  const challenges: Record<string, PrintChallenge> = {}
  for (const c of card.challenges ?? []) {
    challenges[c.id] = { text: c.text, imageUrl: publicStorageUrl('group-images', c.image_path) }
  }

  const base = {
    cardId: card.id,
    gridSize: card.grid_size,
    challenges,
    freeImageUrl: publicStorageUrl('group-images', card.free_space_image_path),
    fileName: pdfFileName(card.title),
  }

  const master = (): PrintSource | null => {
    try {
      const layout = buildIdenticalLayout(
        (card.challenges ?? []).map((c) => c.id), // already sorted by sort_index
        card.grid_size,
        card.free_space
      )
      return { ...base, cells: layout.map((l) => ({ position: l.position, challengeId: l.challengeId })) }
    } catch {
      return null // not enough challenges for the grid yet
    }
  }

  if (host || card.game_mode === 'coop' || card.layout_mode === 'identical') return master()

  const user = await getCurrentUser()
  if (!user) return master()

  const supabase = await createClient()
  const { data: playerCard } = await supabase
    .from('player_cards')
    .select('id, cells:player_card_cells(position, challenge_id)')
    .eq('card_id', card.id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (playerCard?.cells?.length) {
    return {
      ...base,
      cells: playerCard.cells.map((c) => ({ position: c.position, challengeId: c.challenge_id })),
    }
  }
  return card.status === 'active' ? { ...base, cells: null } : master()
}
