"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangleIcon,
  SaveIcon,
  SendIcon,
  PlusIcon,
  ImageIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"
import { createCard, updateCard, publishCard, uploadChallengeImage } from "@/lib/actions/cards"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SubmitButton } from "@/components/common/submit-button"
import { ViewToggle, useViewMode } from "@/components/common/view-toggle"
import { TileMedia } from "@/components/bingo/tile-media"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { Enums } from "@/lib/supabase/database.types"

type GridSize = 4 | 5 | 6
type LayoutMode = Enums<"card_layout_mode">
type WinCondition = Enums<"card_win_condition">
type GameMode = Enums<"card_game_mode">

type ChallengeDraft = { text: string; points: string; imagePath?: string }

export type CardEditorInitial = {
  cardId: string
  title: string
  description: string | null
  gridSize: number
  layoutMode: LayoutMode
  freeSpace: boolean
  winCondition: WinCondition
  gameMode: GameMode
  startsAt: string | null
  endsAt: string | null
  challenges: { text: string | null; points: number; imagePath?: string | null }[]
}

const GRID_COLS: Record<number, string> = {
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
}

function emptyChallenge(): ChallengeDraft {
  return { text: "", points: "1" }
}

/** Resize a challenge list to `len`, preserving existing entries by index. */
function resize(list: ChallengeDraft[], len: number): ChallengeDraft[] {
  if (list.length === len) return list
  if (list.length < len) {
    return [...list, ...Array.from({ length: len - list.length }, emptyChallenge)]
  }
  return list.slice(0, len)
}

function isoToLocalInput(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`
}

function localInputToIso(value: string): string | undefined {
  if (!value) return undefined
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

export function CardEditor({
  groupId,
  mode,
  initial,
  showPublish = false,
  returnHref,
}: {
  groupId: string
  mode: "create" | "edit"
  initial?: CardEditorInitial
  showPublish?: boolean
  /** Where to navigate after a successful save/publish. Defaults to the group's
      card management page. */
  returnHref?: string
}) {
  const router = useRouter()
  const doneHref = returnHref ?? `/groups/${groupId}/manage/cards`
  const [pending, start] = useTransition()

  const [title, setTitle] = useState(initial?.title ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [gridSize, setGridSize] = useState<GridSize>((initial?.gridSize as GridSize) ?? 5)
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(initial?.layoutMode ?? "shuffled")
  const [freeSpace, setFreeSpace] = useState<boolean>(initial?.freeSpace ?? false)
  const [winCondition, setWinCondition] = useState<WinCondition>(initial?.winCondition ?? "line")
  const [gameMode, setGameMode] = useState<GameMode>(initial?.gameMode ?? "individual")
  const coop = gameMode === "coop"
  const [startsAt, setStartsAt] = useState<string>(isoToLocalInput(initial?.startsAt ?? null))
  const [endsAt, setEndsAt] = useState<string>(isoToLocalInput(initial?.endsAt ?? null))
  const [challenges, setChallenges] = useState<ChallengeDraft[]>(
    initial?.challenges?.length
      ? initial.challenges.map((c) => ({
          text: c.text ?? "",
          points: String(c.points),
          imagePath: c.imagePath ?? undefined,
        }))
      : []
  )
  const [uploading, setUploading] = useState(false)
  const [editing, setEditing] = useState<number | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [view, setView] = useViewMode("card-editor-view", "grid")

  // D6 — free space only valid on odd grids.
  const evenGrid = gridSize % 2 === 0
  const effectiveFreeSpace = freeSpace && !evenGrid
  const required = gridSize * gridSize - (effectiveFreeSpace ? 1 : 0)
  const freePos = effectiveFreeSpace ? (gridSize * gridSize - 1) / 2 : -1

  // Keep the challenge list sized to exactly one entry per non-free tile.
  useEffect(() => {
    setChallenges((prev) => resize(prev, required))
  }, [required])

  const filledCount = challenges.filter(
    (c) => c.text.trim().length > 0 || !!c.imagePath
  ).length
  const structuralWarning = mode === "edit"
  const gridSizes: GridSize[] = useMemo(() => [4, 5, 6], [])

  function setGrid(size: GridSize) {
    setGridSize(size)
    if (size % 2 === 0 && freeSpace) setFreeSpace(false)
  }

  function updateChallenge(index: number, patch: Partial<ChallengeDraft>) {
    setChallenges((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)))
  }

  async function onPickTileImage(index: number, file: File | null) {
    if (!file) return
    if (!file.type.startsWith("image/")) {
      toast.error("File must be an image.")
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be 5 MB or smaller.")
      return
    }
    setUploading(true)
    const fd = new FormData()
    fd.append("groupId", groupId)
    fd.append("file", file)
    const res = await uploadChallengeImage(fd)
    setUploading(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    updateChallenge(index, { imagePath: res.data.path })
    toast.success("Image added.")
  }

  type PayloadChallenge = { text?: string; points: number; imagePath?: string }

  function validate(): { ok: true; payloadChallenges: PayloadChallenge[] } | { ok: false } {
    const next: Record<string, string> = {}
    if (!title.trim()) next.title = "Title is required."
    else if (title.trim().length > 120) next.title = "Title is too long."
    if (description.trim().length > 2000) next.description = "Description is too long."

    const payloadChallenges: PayloadChallenge[] = []
    let emptyTiles = 0
    let badPoints = false
    for (const c of challenges) {
      const text = c.text.trim()
      const hasImage = !!c.imagePath
      // A tile needs text or an image (D-square-images).
      if (!text && !hasImage) {
        emptyTiles++
        continue
      }
      const points = Number(c.points)
      if (!Number.isInteger(points) || points <= 0) {
        badPoints = true
        break
      }
      payloadChallenges.push({
        text: text || undefined,
        imagePath: c.imagePath || undefined,
        points,
      })
    }
    if (badPoints) next.challenges = "Points must be a whole number greater than zero."
    else if (emptyTiles > 0)
      next.challenges = `Fill in every tile — ${emptyTiles} still empty (add text or an image).`

    const startIso = localInputToIso(startsAt)
    const endIso = localInputToIso(endsAt)
    if (startIso && endIso && new Date(endIso) <= new Date(startIso)) {
      next.endsAt = "End time must be after the start time."
    }

    setErrors(next)
    if (Object.keys(next).length > 0) return { ok: false }
    return { ok: true, payloadChallenges }
  }

  function buildBasePayload(payloadChallenges: PayloadChallenge[]) {
    return {
      title: title.trim(),
      description: description.trim() || undefined,
      gridSize,
      // Co-op is always an identical layout won by blackout (single shared board).
      layoutMode: coop ? ("identical" as LayoutMode) : layoutMode,
      freeSpace: effectiveFreeSpace,
      winCondition: coop ? ("blackout" as WinCondition) : winCondition,
      gameMode,
      startsAt: localInputToIso(startsAt),
      endsAt: localInputToIso(endsAt),
      challenges: payloadChallenges,
    }
  }

  function submit(publish: boolean) {
    const result = validate()
    if (!result.ok) {
      toast.error("Please fix the highlighted fields.")
      return
    }
    const base = buildBasePayload(result.payloadChallenges)

    start(async () => {
      if (mode === "edit" && initial) {
        const res = await updateCard({ cardId: initial.cardId, ...base })
        if (!res.ok) return void toast.error(res.error)
        if (publish) {
          const pub = await publishCard({ cardId: initial.cardId })
          if (!pub.ok) {
            toast.error(pub.error)
            router.refresh()
            return
          }
          toast.success("Card published.")
        } else {
          toast.success("Card updated.")
        }
        router.push(doneHref)
        router.refresh()
        return
      }

      const res = await createCard({ groupId, ...base })
      if (!res.ok) return void toast.error(res.error)
      if (publish) {
        const pub = await publishCard({ cardId: res.data.cardId })
        if (!pub.ok) {
          toast.error(pub.error)
          router.push(doneHref)
          router.refresh()
          return
        }
        toast.success("Card published.")
      } else {
        toast.success("Draft saved.")
      }
      router.push(doneHref)
      router.refresh()
    })
  }

  const counterOk = filledCount >= required
  const current = editing !== null ? challenges[editing] : null

  // Build the visual grid: one cell per position, mapping non-free positions to
  // challenge entries in order.
  let ci = -1
  const tiles = Array.from({ length: gridSize * gridSize }, (_, pos) => {
    if (pos === freePos) return { pos, free: true as const, index: -1 }
    ci += 1
    return { pos, free: false as const, index: ci }
  })

  return (
    <div className="space-y-6">
      {structuralWarning && (
        <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-gold" />
          <p className="text-muted-foreground">
            Changing the grid size, layout, free space, or the set of challenges will rebuild every
            player&apos;s card and reset their marks.
          </p>
        </div>
      )}

      {/* Basics */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="card-title">Title</Label>
          <Input
            id="card-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="Week 1 Contibingo"
            aria-invalid={!!errors.title}
          />
          {errors.title && <p className="text-sm text-destructive">{errors.title}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="card-description">Description (optional)</Label>
          <Input
            id="card-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            placeholder="What's this card about?"
            aria-invalid={!!errors.description}
          />
          {errors.description && <p className="text-sm text-destructive">{errors.description}</p>}
        </div>
      </div>

      {/* Game mode */}
      <div className="space-y-2">
        <Label>Game mode</Label>
        <Tabs value={gameMode} onValueChange={(v) => setGameMode(v as GameMode)}>
          <TabsList>
            <TabsTrigger value="individual">Individual</TabsTrigger>
            <TabsTrigger value="coop">Group co-op</TabsTrigger>
          </TabsList>
        </Tabs>
        <p className="text-xs text-muted-foreground">
          {coop
            ? "The whole group shares ONE board and fills every square together (blackout). Only hosts (owner/admins) can mark squares; everyone sees the shared progress live."
            : "Every player gets their own card and competes on the leaderboard."}
        </p>
      </div>

      {/* Grid size */}
      <div className="space-y-2">
        <Label>Grid size</Label>
        <Tabs value={String(gridSize)} onValueChange={(v) => setGrid(Number(v) as GridSize)}>
          <TabsList>
            {gridSizes.map((s) => (
              <TabsTrigger key={s} value={String(s)}>
                {s}×{s}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Layout mode — n/a for co-op (one shared board). */}
      {!coop && (
        <div className="space-y-2">
          <Label>Layout</Label>
          <Tabs value={layoutMode} onValueChange={(v) => setLayoutMode(v as LayoutMode)}>
            <TabsList>
              <TabsTrigger value="shuffled">Shuffled</TabsTrigger>
              <TabsTrigger value="identical">Identical</TabsTrigger>
            </TabsList>
          </Tabs>
          <p className="text-xs text-muted-foreground">
            {layoutMode === "shuffled"
              ? "Every player gets challenges in a different order."
              : "Every player gets the same board layout."}
          </p>
        </div>
      )}

      {/* Free space */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <div className="min-w-0">
            <Label htmlFor="free-space" className="cursor-pointer">
              Free space
            </Label>
            <p className="text-xs text-muted-foreground">
              {evenGrid ? "Only available on odd grids (5×5)." : "Marks the center tile as free."}
            </p>
          </div>
          <input
            id="free-space"
            type="checkbox"
            className="size-5 accent-primary disabled:opacity-50"
            checked={effectiveFreeSpace}
            disabled={evenGrid}
            onChange={(e) => setFreeSpace(e.target.checked)}
          />
        </div>
      </div>

      {/* Win condition — n/a for co-op (always blackout). */}
      {!coop && (
        <div className="space-y-2">
          <Label>Win condition</Label>
          <Tabs value={winCondition} onValueChange={(v) => setWinCondition(v as WinCondition)}>
            <TabsList>
              <TabsTrigger value="line">Line</TabsTrigger>
              <TabsTrigger value="blackout">Blackout</TabsTrigger>
            </TabsList>
          </Tabs>
          <p className="text-xs text-muted-foreground">
            {winCondition === "line"
              ? "Win by completing any full row, column, or diagonal."
              : "Win by marking every tile on the card."}
          </p>
        </div>
      )}

      {/* Schedule */}
      <div className="space-y-2">
        <Label>Schedule (optional)</Label>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="starts-at" className="text-xs text-muted-foreground">
              Starts
            </Label>
            <Input id="starts-at" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ends-at" className="text-xs text-muted-foreground">
              Ends
            </Label>
            <Input
              id="ends-at"
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              aria-invalid={!!errors.endsAt}
            />
          </div>
        </div>
        {errors.endsAt && <p className="text-sm text-destructive">{errors.endsAt}</p>}
      </div>

      {/* Challenges — as the bingo board or a list */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label>The card</Label>
          <div className="flex items-center gap-3">
            <span className={cn("text-xs font-medium", counterOk ? "text-primary" : "text-muted-foreground")}>
              {filledCount}/{required} tiles filled
            </span>
            <ViewToggle value={view} onChange={setView} size="sm" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {view === "grid"
            ? "Tap a tile to write its challenge."
            : "Fill in each challenge and its point value."}
        </p>

        {view === "grid" ? (
          <div className={cn("grid gap-1.5 sm:gap-2", GRID_COLS[gridSize] ?? "grid-cols-5")}>
            {tiles.map((tile) => {
              if (tile.free) {
                return (
                  <div
                    key={tile.pos}
                    className="flex aspect-square items-center justify-center rounded-xl bg-free text-free-foreground text-lg"
                    aria-label="Free space"
                  >
                    ★
                  </div>
                )
              }
              const c = challenges[tile.index]
              const text = c?.text.trim() ?? ""
              const hasImage = !!c?.imagePath
              const filled = text || hasImage
              const points = Number(c?.points ?? "1")
              return (
                <button
                  key={tile.pos}
                  type="button"
                  onClick={() => setEditing(tile.index)}
                  className={cn(
                    "relative flex aspect-square items-center justify-center overflow-hidden rounded-xl p-1.5 text-center text-[11px] font-bold leading-tight break-words transition-all sm:text-xs",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                    filled
                      ? "bg-card border border-tile-border text-foreground hover:border-muted-foreground/50"
                      : "border-2 border-dashed border-tile-border text-muted-foreground hover:border-muted-foreground/60"
                  )}
                >
                  <TileMedia imagePath={c?.imagePath} hasText={!!text} />
                  {text ? (
                    <span
                      className={cn(
                        "line-clamp-4",
                        hasImage && "relative z-[1] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
                      )}
                    >
                      {text}
                    </span>
                  ) : hasImage ? (
                    <ImageIcon className="relative z-[1] size-4 text-white/90 drop-shadow" />
                  ) : (
                    <PlusIcon className="size-4 opacity-60" />
                  )}
                  {filled && points > 1 && (
                    <span className="absolute right-1 top-1 z-[1] rounded bg-gold/20 px-1 text-[9px] text-gold">
                      {points}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ) : (
          <ol className="space-y-2">
            {challenges.map((c, index) => (
              <li
                key={index}
                className="flex items-start gap-2 rounded-xl border border-border bg-card px-3 py-2.5"
              >
                <span className="mt-2 grid size-6 shrink-0 place-items-center rounded-md bg-muted text-xs font-medium text-muted-foreground">
                  {index + 1}
                </span>
                <textarea
                  rows={2}
                  maxLength={300}
                  value={c.text}
                  onChange={(e) => updateChallenge(index, { text: e.target.value })}
                  placeholder="e.g. Thank the prof for picking me"
                  className={cn(
                    "min-w-0 flex-1 resize-none rounded-lg border border-input bg-transparent px-3 py-1.5 text-base outline-none md:text-sm",
                    "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                  )}
                />
                <div className="flex shrink-0 flex-col items-center gap-1">
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    aria-label={`Tile ${index + 1} points`}
                    value={c.points}
                    onChange={(e) => updateChallenge(index, { points: e.target.value })}
                    className="w-16 text-center"
                  />
                  <span className="text-[10px] text-muted-foreground">pts</span>
                </div>
              </li>
            ))}
          </ol>
        )}

        {errors.challenges && <p className="text-sm text-destructive">{errors.challenges}</p>}
      </div>

      {/* Tile editor dialog */}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing !== null ? `Tile ${editing + 1}` : "Tile"}</DialogTitle>
          </DialogHeader>
          {current && editing !== null && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="tile-text">Challenge (optional if an image is set)</Label>
                <textarea
                  id="tile-text"
                  autoFocus
                  rows={3}
                  maxLength={300}
                  value={current.text}
                  onChange={(e) => updateChallenge(editing, { text: e.target.value })}
                  placeholder="e.g. Thank the prof for picking me"
                  className={cn(
                    "w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-base outline-none md:text-sm",
                    "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                  )}
                />
              </div>

              {/* Background image (optional) — text overlays it when both are set. */}
              <div className="space-y-2">
                <Label>Image (optional)</Label>
                {current.imagePath ? (
                  <div className="flex items-center gap-3">
                    <span className="relative size-16 shrink-0 overflow-hidden rounded-lg border border-tile-border">
                      <TileMedia imagePath={current.imagePath} hasText={false} />
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={uploading}
                      onClick={() => updateChallenge(editing, { imagePath: undefined })}
                    >
                      <Trash2Icon />
                      Remove image
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <ImageIcon className="size-5 shrink-0 text-muted-foreground" />
                    <Input
                      type="file"
                      accept="image/*"
                      disabled={uploading}
                      onChange={(e) => onPickTileImage(editing, e.target.files?.[0] ?? null)}
                    />
                  </div>
                )}
                {uploading && (
                  <p className="text-xs text-muted-foreground">Uploading image…</p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Label htmlFor="tile-points" className="text-sm">
                  Points
                </Label>
                <Input
                  id="tile-points"
                  type="number"
                  min={1}
                  step={1}
                  value={current.points}
                  onChange={(e) => updateChallenge(editing, { points: e.target.value })}
                  className="w-20 text-center"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <DialogClose render={<Button>Done</Button>} />
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        {mode === "edit" ? (
          <>
            <SubmitButton pending={pending} variant={showPublish ? "outline" : "default"} onClick={() => submit(false)}>
              <SaveIcon />
              Save changes
            </SubmitButton>
            {showPublish && (
              <SubmitButton pending={pending} onClick={() => submit(true)}>
                <SendIcon />
                Save &amp; publish
              </SubmitButton>
            )}
          </>
        ) : (
          <>
            <SubmitButton pending={pending} variant="outline" onClick={() => submit(false)}>
              <SaveIcon />
              Save draft
            </SubmitButton>
            <SubmitButton pending={pending} onClick={() => submit(true)}>
              <SendIcon />
              Save &amp; publish
            </SubmitButton>
          </>
        )}
      </div>
    </div>
  )
}
