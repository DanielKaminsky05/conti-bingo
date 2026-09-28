import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeftIcon } from "lucide-react"
import { getMyRole, isHost } from "@/lib/queries/membership"
import { CardEditor } from "@/components/cards/card-editor"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export default async function NewCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  if (!isHost(await getMyRole(id))) notFound()

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link
          href={`/groups/${id}/cards`}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2 w-fit")}
        >
          <ArrowLeftIcon />
          Cards
        </Link>
        <h2 className="font-heading text-lg font-semibold">New card</h2>
      </div>
      <CardEditor groupId={id} mode="create" />
    </div>
  )
}
