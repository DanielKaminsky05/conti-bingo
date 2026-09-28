"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  PlusIcon,
  Trash2Icon,
  ArrowUpIcon,
  ArrowDownIcon,
  AlertTriangleIcon,
  SaveIcon,
  SendIcon,
} from "lucide-react"
import { toast } from "sonner"
import { createCard, updateCard, publishCard } from "@/lib/actions/cards"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SubmitButton } from "@/components/common/submit-button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import type { Enums } from "@/lib/supabase/database.types"

type GridSize = 4 | 5 | 6
type LayoutMode = Enums<"card_layout_mode">
type WinCondition = Enums<"card_win_condition">

type ChallengeDraft = {
  key: string
  text: string
  points: string
}

export type CardEditorInitial = {
  cardId: string
  title: string
  description: string | null
  gridSize: number
  layoutMode: LayoutMode
  freeSpace: boolean
  winCondition: WinCondition
  startsAt: string | null
  endsAt: string | null
  challenges: { text: string; points: number }[]
}

let keySeq = 0
function nextKey() {
  keySeq += 1
  return `c${keySeq}`
}

function emptyChallenge(): ChallengeDraft {
  return { key: nextKey(), text: "", points: "1" }
}

/** Convert an ISO timestamp to a value for <input type="datetime-local"> (local time). */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`
}

/** Convert a datetime-local value back to an ISO string, or undefined when empty. */
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
}: {
  groupId: string
  mode: "create" | "edit"
  initial?: CardEditorInitial
  /** In edit mode (drafts), also offer a "Save & publish" action. */
  showPublish?: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()

  const [title, setTitle] = useState(initial?.title ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [gridSize, setGridSize] = useState<GridSize>(
    (initial?.gridSize as GridSize) ?? 5
  )
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(initial?.layoutMode ?? "shuffled")
  const [freeSpace, setFreeSpace] = useState<boolean>(initial?.freeSpace ?? false)
  const [winCondition, setWinCondition] = useState<WinCondition>(initial?.winCondition ?? "line")
  const [startsAt, setStartsAt] = useState<string>(isoToLocalInput(initial?.startsAt ?? null))
  const [endsAt, setEndsAt] = useState<string>(isoToLocalInput(initial?.endsAt ?? null))
  const [challenges, setChallenges] = useState<ChallengeDraft[]>(
    initial?.challenges?.length
      ? initial.challenges.map((c) => ({ key: nextKey(), text: c.text, points: String(c.points) }))
      : [emptyChallenge()]
  )
  const [errors, setErrors] = useState<Record<string, string>>({})

  // D6 — free space only valid on odd grids; auto-disable on even grid sizes.
  const evenGrid = gridSize % 2 === 0
  const effectiveFreeSpace = freeSpace && !evenGrid
  const required = gridSize * gridSize - (effectiveFreeSpace ? 1 : 0)
  const filledCount = challenges.filter((c) => c.text.trim().length > 0).length

  const structuralWarning = mode === "edit"

  function setGrid(size: GridSize) {
    setGridSize(size)
    // Auto-disable free space when moving to an even grid (D6).
    if (size % 2 === 0 && freeSpace) setFreeSpace(false)
  }

  function addChallenge() {
    setChallenges((prev) => [...prev, emptyChallenge()])
  }

  function removeChallenge(key: string) {
    setChallenges((prev) => (prev.length <= 1 ? prev : prev.filter((c) => c.key !== key)))
  }

  function updateChallenge(key: string, patch: Partial<ChallengeDraft>) {
    setChallenges((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)))
  }

  function move(index: number, dir: -1 | 1) {
    setChallenges((prev) => {
      const next = index + dir
      if (next < 0 || next >= prev.length) return prev
      const copy = [...prev]
      const [item] = copy.splice(index, 1)
      copy.splice(next, 0, item)
      return copy
    })
  }

  /** Mirror the Zod rules client-side; returns the built challenge payload on success. */
  function validate():
    | { ok: true; payloadChallenges: { text: string; points: number }[] }
    | { ok: false } {
    const next: Record<string, string> = {}

    if (!title.trim()) next.title = "Title is required."
    else if (title.trim().length > 120) next.title = "Title is too long."

    if (description.trim().length > 2000) next.description = "Description is too long."

    const payloadChallenges: { text: string; points: number }[] = []
    for (const c of challenges) {
      const text = c.text.trim()
      if (!text) continue
      const points = Number(c.points)
      if (!Number.isInteger(points) || points <= 0) {
        next.challenges = "Points must be a whole number greater than zero."
        break
      }
      payloadChallenges.push({ text, points })
    }

    if (!next.challenges) {
      if (payloadChallenges.length === 0) {
        next.challenges = "Add at least one challenge."
      } else if (payloadChallenges.length < required) {
        next.challenges = `Need at least ${required} challenges for a ${gridSize}×${gridSize} grid${
          effectiveFreeSpace ? " with a free space" : ""
        }.`
      }
    }

    const startIso = localInputToIso(startsAt)
    const endIso = localInputToIso(endsAt)
    if (startIso && endIso && new Date(endIso) <= new Date(startIso)) {
      next.endsAt = "End time must be after the start time."
    }

    setErrors(next)
    if (Object.keys(next).length > 0) return { ok: false }
    return { ok: true, payloadChallenges }
  }

  function buildBasePayload(payloadChallenges: { text: string; points: number }[]) {
    return {
      title: title.trim(),
      description: description.trim() || undefined,
      gridSize,
      layoutMode,
      freeSpace: effectiveFreeSpace,
      winCondition,
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
        if (!res.ok) {
          toast.error(res.error)
          return
        }
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
        router.push(`/groups/${groupId}/cards`)
        router.refresh()
        return
      }

      const res = await createCard({ groupId, ...base })
      if (!res.ok) {
        toast.error(res.error)
        return
      }

      if (publish) {
        const pub = await publishCard({ cardId: res.data.cardId })
        if (!pub.ok) {
          toast.error(pub.error)
          // The draft was still created; send them to the list to publish manually.
          router.push(`/groups/${groupId}/cards`)
          router.refresh()
          return
        }
        toast.success("Card published.")
      } else {
        toast.success("Draft saved.")
      }
      router.push(`/groups/${groupId}/cards`)
      router.refresh()
    })
  }

  const counterOk = filledCount >= required
  const gridSizes: GridSize[] = useMemo(() => [4, 5, 6], [])

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
            placeholder="Movie Night Bingo"
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

      {/* Grid size */}
      <div className="space-y-2">
        <Label>Grid size</Label>
        <Tabs
          value={String(gridSize)}
          onValueChange={(v) => setGrid(Number(v) as GridSize)}
        >
          <TabsList>
            {gridSizes.map((s) => (
              <TabsTrigger key={s} value={String(s)}>
                {s}×{s}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Layout mode */}
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

      {/* Free space */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <div className="min-w-0">
            <Label htmlFor="free-space" className="cursor-pointer">
              Free space
            </Label>
            <p className="text-xs text-muted-foreground">
              {evenGrid
                ? "Only available on odd grids (5×5)."
                : "Marks the center tile as free."}
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

      {/* Win condition */}
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

      {/* Schedule */}
      <div className="space-y-2">
        <Label>Schedule (optional)</Label>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="starts-at" className="text-xs text-muted-foreground">
              Starts
            </Label>
            <Input
              id="starts-at"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
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

      {/* Challenges */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Label>Challenges</Label>
          <span
            className={cn(
              "text-xs font-medium",
              counterOk ? "text-primary" : "text-muted-foreground"
            )}
          >
            Need {required} challenges (have {filledCount})
          </span>
        </div>

        <div className="space-y-2">
          {challenges.map((c, index) => (
            <div
              key={c.key}
              className="flex items-start gap-2 rounded-xl border border-border bg-card p-2"
            >
              <div className="flex flex-col gap-1 pt-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Move up"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUpIcon />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Move down"
                  disabled={index === challenges.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDownIcon />
                </Button>
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <Input
                  value={c.text}
                  onChange={(e) => updateChallenge(c.key, { text: e.target.value })}
                  maxLength={300}
                  placeholder={`Challenge ${index + 1}`}
                />
              </div>
              <div className="w-16 shrink-0 space-y-1">
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={c.points}
                  onChange={(e) => updateChallenge(c.key, { points: e.target.value })}
                  aria-label="Points"
                  className="text-center"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Remove challenge"
                disabled={challenges.length <= 1}
                onClick={() => removeChallenge(c.key)}
              >
                <Trash2Icon />
              </Button>
            </div>
          ))}
        </div>

        {errors.challenges && <p className="text-sm text-destructive">{errors.challenges}</p>}

        <Button type="button" variant="outline" size="sm" onClick={addChallenge}>
          <PlusIcon />
          Add challenge
        </Button>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        {mode === "edit" ? (
          <>
            <SubmitButton
              pending={pending}
              variant={showPublish ? "outline" : "default"}
              onClick={() => submit(false)}
            >
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
            <SubmitButton
              pending={pending}
              variant="outline"
              onClick={() => submit(false)}
            >
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
