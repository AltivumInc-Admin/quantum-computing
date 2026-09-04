/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import PrivacyPage, { metadata } from "@/app/privacy/page";
import { LocaleProvider } from "@/i18n";

function renderPrivacy(locale: "en" | "es" = "en") {
  localStorage.setItem("qc:locale", locale);
  return render(
    <LocaleProvider>
      <PrivacyPage />
    </LocaleProvider>,
  );
}

afterEach(() => {
  localStorage.clear();
});

describe("PrivacyPage", () => {
  it("has honest page metadata", () => {
    expect(metadata.title).toMatch(/privacy/i);
  });

  it("states what is stored, where, and the opt-in email terms", () => {
    renderPrivacy();
    expect(screen.getByRole("heading", { name: "Privacy" })).toBeInTheDocument();
    expect(screen.getByText(/what we store/i)).toBeInTheDocument();
    expect(screen.getAllByText(/us-east-2/).length).toBeGreaterThan(0);
    expect(screen.getByText(/what we don't collect/i)).toBeInTheDocument();
    expect(screen.getAllByText(/no analytics or tracking scripts/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/strictly opt-in/i)).toBeInTheDocument();
    expect(screen.getAllByText(/daily count of how the site is used/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/at most one email every 7 days/i)).toBeInTheDocument();
  });

  it.each(["en", "es"] as const)(
    "names the tutor's real processor in %s: Anthropic, not Amazon Bedrock",
    (locale) => {
      // The tutor moved off Bedrock to Anthropic's first-party API (2026-08-17). A
      // privacy page is exactly the surface that must name where a question actually
      // goes, so the old wording is barred, not just the new one asserted — and it is
      // barred PER LOCALE: an en-only lock recreates the exact gap that let the
      // sponsorship copy outlive its withdrawal (the es half shipped unpinned).
      renderPrivacy(locale);
      expect(screen.getAllByText(/Anthropic/).length).toBeGreaterThan(0);
      expect(screen.queryByText(/Bedrock/)).not.toBeInTheDocument();
      // The hardware-run bullet's justification is spend limits, not a "sponsored
      // budget" nobody holds (qpu-core.mjs LIFETIME_CAP_MICROS = 0).
      expect(screen.queryByText(/sponsor\w*|patrocin\w*/i)).not.toBeInTheDocument();
    },
  );

  it.each(["en", "es"] as const)(
    "in %s: discloses the server-side daily counts, and no longer claims none exist",
    (locale) => {
      // RETARGETED, not deleted, on 2026-09-04. The page used to say "No analytics
      // or tracking scripts — none exist anywhere on this site", and on that day
      // lambda/analytics began counting per-notebook opens and section reach from
      // the web host's access logs. Nothing was added to the browser, so the
      // in-your-browser half is still true and is still asserted; the unqualified
      // "none exist anywhere" half became false and is now BARRED, per locale, in
      // exactly the shape that let the sponsorship copy outlive its withdrawal.
      renderPrivacy(locale);
      expect(screen.queryAllByText(/none exist anywhere/i)).toHaveLength(0);
      expect(screen.queryAllByText(/no existen en ningún lugar/i)).toHaveLength(0);

      // The true half, kept: nothing is added to the page.
      expect(
        screen.getAllByText(locale === "en" ? /tracking scripts in your browser/i : /scripts de seguimiento en tu navegador/i).length,
      ).toBeGreaterThan(0);
      expect(
        screen.getAllByText(locale === "en" ? /no beacon/i : /ninguna baliza/i).length,
      ).toBeGreaterThan(0);

      // The disclosure that makes the code and the copy agree. Both locales must
      // make the SAME claims: daily totals, computed from the host's access logs,
      // grouped by address only while counting and then discarded, keeping
      // nothing that links one day to another.
      //
      // EVERY AGGREGATE THE ROW WRITES IS NAMED HERE. This list was the weaker
      // half of the guard on 2026-09-04: it asserted that a claim the policy makes
      // is one the code honours, but not the converse — that every attribute the
      // daily row expresses is a thing the policy discloses. Two were being stored
      // and not disclosed (which section a day's readers got furthest into, and how
      // many people opened each individual section), plus the daily sign-in count.
      // For a privacy policy the converse is the direction that matters, so the
      // claims below now cover all four curriculum maps in lambda/analytics — per
      // notebook, per section, sections-per-reader, furthest-section — and
      // googleSignIns. If a new attribute joins that row, add its sentence to the
      // policy in BOTH locales and its regex here, in the same change.
      const claims =
        locale === "en"
          ? [
              /daily count of how the site is used/i,
              /how many people signed in/i,
              /opened each lesson notebook/i,
              /opened each course section/i,
              /how many course sections a day's visitors reached/i,
              /which section a day's readers got furthest into/i,
              /access logs/i,
              /grouped by network address/i,
              /discarded, never written down/i,
              /nothing that connects one day to another/i,
            ]
          : [
              /conteo diario de cómo se usa el sitio/i,
              /cuántas iniciaron sesión/i,
              /abrieron cada cuaderno de lección/i,
              /abrieron cada sección del curso/i,
              /a cuántas secciones del curso llegaron las visitas de ese día/i,
              /hasta qué sección llegaron más lejos/i,
              /registros de acceso/i,
              /agrupan por dirección de red/i,
              /se descartan, nunca se anotan/i,
              /nada que enlace un día con otro/i,
            ];
      for (const claim of claims) {
        expect(screen.getAllByText(claim).length).toBeGreaterThan(0);
      }
    },
  );

  it("points at the real deletion control and gives a contact", () => {
    renderPrivacy();
    expect(screen.getByText(/delete account/i)).toBeInTheDocument();
    const mail = screen.getByRole("link", { name: /christian\.perez@altivum\.io/ });
    expect(mail).toHaveAttribute("href", "mailto:christian.perez@altivum.io");
  });

  it("carries its last-updated date", () => {
    renderPrivacy();
    // Moves with the claims. Amended 2026-09-04 to disclose the aggregate
    // telemetry; a policy change nobody can date is one nobody can audit.
    expect(screen.getByText(/last updated 2026-09-04/i)).toBeInTheDocument();
  });
});
