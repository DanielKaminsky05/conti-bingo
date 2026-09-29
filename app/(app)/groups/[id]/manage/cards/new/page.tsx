import Link from "next/link"
import { ArrowLeftIcon } from "lucide-react"
import { CardEditor } from "@/components/cards/card-editor"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// Host gating is enforced by the manage/ layout.
export default async function NewCardPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const manageCards = `/groups/${id}/manage/cards`

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link
          href={manageCards}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2 w-fit")}
        >
          <ArrowLeftIcon />
          Cards
        </Link>
        <h3 className="font-heading text-base font-semibold">New card</h3>
      </div>
      <CardEditor groupId={id} mode="create" returnHref={manageCards} />
    </div>
  )
}
