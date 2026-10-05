import Link from "next/link"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { AuthNotice } from "@/components/common/auth-notice"
import { LoginForm } from "./login-form"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>
}) {
  const { notice } = await searchParams
  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome back</CardTitle>
        <CardDescription>Sign in to keep playing.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <AuthNotice notice={notice} />
        <LoginForm />
        <p className="text-center text-sm text-muted-foreground">
          No account?{" "}
          <Link href="/signup" className="font-medium text-foreground underline underline-offset-4">
            Sign up
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
