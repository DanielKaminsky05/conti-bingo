import Link from "next/link"
import { ArrowLeftIcon } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export const metadata = {
  title: "Terms of Service · Contibingo",
}

const LAST_UPDATED = "September 30, 2026"

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link
        href="/signup"
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2 mb-4 w-fit")}
      >
        <ArrowLeftIcon />
        Back
      </Link>

      <h1 className="font-heading text-2xl font-semibold">Terms of Service</h1>
      <p className="mt-1 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>

      <div className="mt-6 space-y-6 text-sm leading-relaxed text-foreground/90">
        <section className="space-y-2">
          <h2 className="font-heading text-base font-semibold">1. Acceptance</h2>
          <p>
            By creating an account or using Contibingo (the &ldquo;Service&rdquo;), you agree to
            these Terms of Service. If you don&rsquo;t agree, don&rsquo;t use the Service.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading text-base font-semibold">2. What Contibingo is</h2>
          <p>
            Contibingo is an unofficial, student-run game for business-school sections. Groups
            create bingo cards of light-hearted classroom challenges and players (or a whole
            class) mark squares as they go. It&rsquo;s meant for fun.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading text-base font-semibold">3. Not affiliated with your school</h2>
          <p>
            Contibingo is not created, endorsed, or sponsored by Ivey Business School, Western
            University, or any institution. It is an independent, unofficial project. Nothing here
            is an official school activity.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading text-base font-semibold">4. Eligibility &amp; your account</h2>
          <p>
            You must be able to form a binding agreement to use the Service. You&rsquo;re
            responsible for your account and for keeping your password secure. Provide accurate
            information and don&rsquo;t impersonate anyone.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading text-base font-semibold">5. Acceptable use</h2>
          <p>You agree not to:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>harass, bully, threaten, or target any person, including instructors or classmates;</li>
            <li>post content that is hateful, discriminatory, defamatory, obscene, or illegal;</li>
            <li>create challenges that encourage dishonesty, disruption of class, or anything that
              violates your school&rsquo;s code of conduct or academic-integrity rules;</li>
            <li>upload content you don&rsquo;t have the right to share, or that infringes others&rsquo;
              rights;</li>
            <li>attempt to break, overload, scrape, or gain unauthorized access to the Service.</li>
          </ul>
          <p>
            Play responsibly and respectfully. You are solely responsible for how you behave in
            your real classroom.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading text-base font-semibold">6. Your content</h2>
          <p>
            You keep ownership of the cards, challenges, images, and other content you submit. You
            grant us a limited licence to store and display that content to operate the Service for
            your group. You&rsquo;re responsible for what you post, and group hosts are responsible
            for the cards they publish.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading text-base font-semibold">7. Data &amp; privacy</h2>
          <p>
            To run the Service we store your account details (name, email, username, optional
            avatar) and your gameplay data (group membership, cards, and marks). Data is held with
            our infrastructure provider (Supabase). We don&rsquo;t sell your data. You can edit your
            profile or ask us to delete your account at any time.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading text-base font-semibold">8. No warranty</h2>
          <p>
            The Service is provided &ldquo;as is&rdquo; and &ldquo;as available,&rdquo; without
            warranties of any kind. We don&rsquo;t promise it will be uninterrupted, error-free, or
            secure, and we may change or discontinue it at any time.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading text-base font-semibold">9. Limitation of liability</h2>
          <p>
            To the maximum extent permitted by law, the Service and its creators are not liable for
            any indirect, incidental, or consequential damages, or for any academic, disciplinary,
            or other consequences arising from your use of the Service. You use it at your own risk.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading text-base font-semibold">10. Termination</h2>
          <p>
            We may suspend or remove accounts or content that violate these Terms. You can stop
            using the Service and delete your account at any time.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading text-base font-semibold">11. Changes</h2>
          <p>
            We may update these Terms from time to time. Continuing to use the Service after a
            change means you accept the updated Terms.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading text-base font-semibold">12. Contact</h2>
          <p>
            Questions about these Terms? Reach out to the group host or the person who runs your
            section&rsquo;s Contibingo.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading text-base font-semibold">13. Dels</h2>
          <p>
            You are now legally obligated to buy Daniel Kaminsky a drink of your choice at Delilahs every Thursday.
          </p>
        </section>
      </div>
    </main>
  )
}
