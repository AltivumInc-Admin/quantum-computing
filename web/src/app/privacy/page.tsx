import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: `Privacy — ${SITE_NAME}`,
  description:
    `What ${SITE_NAME} stores (your email and learning progress), where it lives, what it never collects, and how to delete all of it.`,
};

const LAST_UPDATED = "2026-07-12";

/**
 * A plain-English, verifiable privacy page. Every claim below is checked
 * against the codebase: there is no analytics or tracking script anywhere in
 * web/src, progress is localStorage-first, and the only server-side stores are
 * the Cognito user pool and the DynamoDB tables named here (all us-east-2).
 */
export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-24 sm:px-6 lg:px-8">
      <header>
        <p className="mb-4 text-sm font-medium tracking-widest uppercase text-accent-dark dark:text-accent-light">
          Policy
        </p>
        <h1 className="font-display text-display-2xl tracking-tight text-(--ink)">
          Privacy
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-gray-600 dark:text-gray-400">
          The short version: your learning progress lives in your browser. If you create
          an account, we store your email address and a copy of that progress so it can
          follow you across devices — and you can delete all of it, permanently, yourself.
        </p>
      </header>

      <div className="mt-10 space-y-10">
        <Section title="What we store">
          <p>
            Without an account, everything — lesson progress, review cards, widget
            state — is stored only in your browser&apos;s local storage. Nothing
            identifies you and nothing leaves your device except the requests that
            fetch the site itself.
          </p>
          <p>
            Circuits you save in the playground follow the same rule: they live in your
            browser&apos;s local storage and, if you sign in, are included in the synced
            progress snapshot described below.
          </p>
          <p>
            If you create an account and use sync, we store on our servers (AWS,
            us-east-2 region):
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              your email address and sign-in credentials, in Amazon Cognito (passwords
              are handled entirely by Cognito; we never see them)
            </li>
            <li>
              a snapshot of your learning progress (sections completed, review-card
              scheduling state), in Amazon DynamoDB, keyed to your account
            </li>
            <li>
              your review-reminder email preference — off unless you turn it on — and,
              if you do, the date we last emailed you
            </li>
            <li>
              if you run a circuit on real quantum hardware, a record of that run
              (device, shot count, cost, and a hash of the circuit) to enforce the
              sponsored hardware budget
            </li>
          </ul>
          <p>
            If you ask the lesson tutor a question, the question and the surrounding
            lesson context are sent to our tutor service (AWS Bedrock, us-east-2) to
            generate the answer.
          </p>
        </Section>

        <Section title="What we don't collect">
          <ul className="list-disc space-y-1 pl-5">
            <li>No analytics or tracking scripts — none exist anywhere on this site.</li>
            <li>No advertising, and no data is sold or shared for advertising.</li>
            <li>No tracking cookies. Sign-in tokens are kept in your browser&apos;s
              per-tab session storage.</li>
            <li>No third-party fonts, CDNs, or beacons — the site and its in-browser
              Python runtime are served from our own origin. (One exception: if our
              copy of the Python runtime fails to load, the browser falls back to
              fetching it from the public jsDelivr CDN.)</li>
          </ul>
        </Section>

        <Section title="Emails">
          <p>
            Review-reminder emails are strictly opt-in: the default is off, and nothing
            is sent unless you enable them in your workspace. When enabled, you get at
            most one email every 7 days, and only when you actually have review cards
            due. Every email contains a one-click unsubscribe, and you can turn
            reminders off in your workspace at any time.
          </p>
        </Section>

        <Section title="Retention and deletion">
          <p>
            Server-side data is kept until you delete it. Your workspace has a
            &quot;Delete account&quot; control that permanently removes your synced
            progress, your email preference, your account itself, and this
            device&apos;s local copy — in that order, and it stops and tells you if any
            step fails. There is no undo and no recovery period.
          </p>
          <p>
            Operational service logs (used for debugging and abuse prevention) are
            retained in AWS CloudWatch for 30 days and then deleted automatically.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about this policy or your data:{" "}
            <a
              href="mailto:christian.perez@altivum.io"
              className="text-accent-dark dark:text-accent-light underline underline-offset-2 focus-ring rounded"
            >
              christian.perez@altivum.io
            </a>
            .
          </p>
        </Section>
      </div>

      <p className="mt-12 text-xs text-caption">Last updated {LAST_UPDATED}.</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-semibold text-(--ink)">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
        {children}
      </div>
    </section>
  );
}
