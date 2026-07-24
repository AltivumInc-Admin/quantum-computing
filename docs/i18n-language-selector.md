# i18n Language Selector — Design & Implementation Spec
## Quantum Learner · Spanish (es) Phase 1

**Status:** Draft · July 2026  
**Scope:** Platform-wide learner-selected locale, starting with Spanish (es)  
**Philosophy:** True localization, not translation theatre. A Spanish-speaking learner should experience the product as if it were built for them — including Dirac notation conventions, error messages, grading feedback, tutor system prompts, spaced-repetition schedules, and GUIDE prose — not just a UI with translated button labels.

---

## 1. Problem Statement

The platform is English-only. Spanish speakers represent the second-largest technical workforce in Latin America and a growing share of STEM interest globally. Adding Spanish is not a marketing exercise — it is a genuine accessibility decision: a learner thinking in Spanish who must also translate technical explanations loses cognitive bandwidth that should be on the physics.

The key constraint this spec must honor: the platform is a **statically exported Next.js site** (`output: "export"`). There is no server at runtime. Every decision must be consistent with that architecture. Next.js 13+ App Router has built-in i18n routing for server-rendered apps (via `i18n` config), but that feature is **incompatible with static export**. This spec therefore takes a different path.



---

## 2. Scope of Content

Before any architecture decision, we must classify every content surface. Each class has different translation characteristics and different production cost.

### 2.1 Surface Classification

| Surface | Class | Description | Spanish difficulty |
|---|---|---|---|
| UI chrome (nav, footer, buttons, labels) | **UI strings** | ~200 short strings, static | Low |
| Grading feedback ("Not quite — 90.0° off") | **Templated UI strings** | Dynamic values embedded in translated templates | Medium |
| Workspace / Runbook / Review dashboards | **UI strings + numeric templates** | Tabular-nums, pluralization (1 card / 2 cards) | Medium |
| Ask the Tutor (AI responses) | **AI-generated** | System prompt language controls output language | Low (prompt change) |
| GUIDE.md prose (7 modules × ~5,000 words each) | **Long-form technical content** | Physics prose, KaTeX math, code blocks, exercises | Very high |
| Glossary definitions (100+ terms) | **Technical reference** | Dense formal definitions with inline math | High |
| section-pitch.ts / ACCOUNT_REASSURANCE | **Marketing copy** | ~7 short paragraphs | Medium |
| Rep prompts (challenge/predict/etc) | **Exercise text** | Embedded in content-manifest, graded exercises | High |
| Notebook content (45 .ipynb files) | **Curriculum notebooks** | Python + Markdown cells, not served by the portal | Out of scope (Phase 1) |
| Error messages (graders, storage, network) | **Error strings** | ~50 strings, some templated | Low |
| SEO metadata (title, description, og:*) | **Metadata strings** | Per-page, built at compile time | Medium |
| Date/time formatting (review schedules, sync timestamps) | **Locale formatting** | `toLocaleDateString`, `toLocaleTimeString` | Low (API change) |
| Pluralization rules | **Locale grammar** | Spanish pluralization is simpler than English | Low |

### 2.2 Phase 1 Scope Decision

Phase 1 ships everything **except** GUIDE.md prose, Rep prompts, and the 45 notebooks. The reasoning:

- UI strings, grading feedback, and error messages are the learner's **moment-to-moment experience**. A translated UI with English lesson prose is still a significant improvement over a fully English product — the learner reads the prose once; they encounter the UI on every interaction.
- GUIDE.md prose is ~35,000 words of dense technical content with KaTeX math, code blocks, and carefully designed pedagogy. A rushed translation introduces pedagogical errors worse than English. Phase 2 delivers translated GUIDEs with a professional technical translator and a physics reviewer.
- The AI tutor changes language with a single system prompt line. That ships in Phase 1.



---

## 3. Architecture

### 3.1 Core Constraint: Static Export

`next.config.ts` is `output: "export"`. This produces a flat `web/out/` directory of HTML, CSS, and JS. There is no runtime server to handle URL-based locale routing (`/es/learn/01-foundations`). The options are:

| Option | How it works | Works with static export? | Verdict |
|---|---|---|---|
| Next.js built-in i18n routing | URL prefix per locale, server redirects | **No** — requires server | Rejected |
| Subdirectory static builds (`/es/` prefix) | Build twice, output to `out/` and `out/es/` | Technically yes, doubles build time | Deferred to Phase 2 |
| Client-side locale stored in `localStorage` | Single build, JS reads locale and renders translations | **Yes** | **Selected for Phase 1** |
| `<html lang>` + client switching | As above, with `lang` attribute update | Yes | Included in Phase 1 |

### 3.2 Chosen Architecture: Client-Side Locale Store

The locale is treated as a learner preference — like theme (dark/light) — stored in `localStorage` under `qc:locale`. A single React context (`LocaleProvider`) reads this preference on the client, provides it to the whole tree, and triggers re-renders when it changes. All translated strings are looked up via a lightweight `t()` function against a locale dictionary.

```
qc:locale = "en" | "es"            (localStorage key)
LocaleProvider                      (React context, mirrors ThemeProvider)
useLocale() → { locale, setLocale } (the only hook consumers need)
t(key, values?) → string            (translation lookup with template interpolation)
```

This is deliberately NOT a full i18n library (no `i18next`, no `react-intl`). The platform has ~200 UI strings and a clear set of locales. A thin, owned implementation avoids a dependency whose entire feature surface (RTL, message format ICU, plural categories) we would never use, and whose bundle contribution is ~30 KB.

### 3.3 Translation Dictionary Structure

```
web/src/i18n/
├── index.ts          ← re-exports LocaleProvider, useLocale, t
├── context.tsx       ← LocaleProvider + useLocale hook
├── types.ts          ← Locale type, TranslationDict type
├── pluralize.ts      ← English + Spanish plural rules
├── locales/
│   ├── en.ts         ← English (source of truth, always complete)
│   └── es.ts         ← Spanish translations
└── __tests__/
    └── completeness.test.ts  ← CI guard: every en key exists in es
```

The English dictionary is the **canonical source of truth**. The CI completeness test fails if any key present in `en.ts` is absent from `es.ts`. This is the contract that ensures no Spanish learner ever sees a missing string — the build cannot succeed with an incomplete translation.

### 3.4 Key Namespace Design

Keys are namespaced by surface to prevent collision and to make the translation file readable by a non-developer translator:

```typescript
// Example structure (not exhaustive — see Section 6 for full inventory)
{
  nav: {
    playground: "Playground",
    runbook: "Registro",
    credentials: "Credenciales",
    pricing: "Precios",
    review: "Repasar",
    skipToContent: "Saltar al contenido",
  },
  review: {
    heading: "Repasar",
    eyebrow: "Repetición espaciada",
    dueNow: "{{count}} pendiente ahora",  // "1 pendiente ahora" / "3 pendientes ahora"
    tracked: "{{count}} tarjeta seguida",
    sessionComplete: "Sesión completa — todas las tarjetas repasadas.",
    noCards: "Sin tarjetas aún",
    nothingDue: "Al día — nada pendiente",
    // ...
  },
  // ...
}
```

Template values use `{{key}}` mustache-style tokens, resolved by the `t()` interpolation engine.



---

## 4. The Language Selector Component

### 4.1 Placement

The language selector lives in the **nav bar**, right-aligned beside the ThemeToggle and AccountMenu. On mobile (below `md`), it appears in the pill row — same position. It is always visible regardless of whether the learner is authenticated.

Accessibility rationale: the selector must be reachable before any content is read, not buried in a settings page. A Spanish-speaking visitor who lands on the English site and cannot find the switch because it is inside a footer or an account menu has already failed.

### 4.2 Visual Design

The selector is a **compact icon button** (globe icon + current locale abbreviation, `EN` / `ES`) that opens a **dropdown menu** on click. It does not use a `<select>` element — the platform's design language is custom dropdowns with `rounded-chip`, `border-(--bd)`, and `bg-(--glass)`.

```
[globe icon]  EN ▾
```

On activation it opens a small panel (2 options, Phase 1):

```
┌──────────────────┐
│ ✓  English       │
│    Español       │
└──────────────────┘
```

- Checkmark marks the current locale
- Uses `role="menu"` / `role="menuitem"` ARIA pattern (not `listbox` — this is an action menu, not a form field)
- Closes on Escape, on blur, and on selection
- Focus returns to the trigger on close
- The trigger text (`EN` / `ES`) is a visible, compact locale signal — no tooltip required

### 4.3 State and Persistence

```typescript
// The selector's contract — mirrors ThemeToggle's relationship to ThemeProvider
function LanguageSelector() {
  const { locale, setLocale } = useLocale();
  // render dropdown, call setLocale("es") on selection
}
```

`setLocale` writes `qc:locale` to localStorage and triggers a React context update. All consumers re-render synchronously via the context. There is no page navigation, no route change, no reload.

### 4.4 The `<html lang>` Attribute

The root layout currently hardcodes `lang="en"`. When the locale changes, the `LocaleProvider` must update `document.documentElement.lang` to match. This is a direct DOM write — not a React state — because the `<html>` element is outside React's tree in a static export. It mirrors how `next-themes` sets `class="dark"` on `<html>`.

```typescript
useEffect(() => {
  document.documentElement.lang = locale;
}, [locale]);
```

The static export prenders with `lang="en"`. On hydration, the effect fires and corrects to `lang="es"` if that is the stored preference. This is acceptable — the same one-render flicker that `next-themes` has on dark mode. The fix for Phase 2 (subdirectory builds) would prerender each locale into its own static file with the correct `lang` attribute baked in.



---

## 5. Pluralization

Spanish pluralization is: singular for 1, plural for everything else. This matches English. However, the plural **suffix** differs.

```typescript
// English: "1 card" / "3 cards"
// Spanish: "1 tarjeta" / "3 tarjetas"
```

The `pluralize.ts` module provides a locale-aware helper:

```typescript
type PluralRule = (n: number) => "one" | "other";

const PLURAL_RULES: Record<Locale, PluralRule> = {
  en: (n) => (n === 1 ? "one" : "other"),
  es: (n) => (n === 1 ? "one" : "other"),   // same rule, different words
};
```

Translation keys that involve counts carry both forms:

```typescript
// en.ts
review: {
  cardCount: { one: "{{count}} card tracked", other: "{{count}} cards tracked" },
  dueCount: { one: "{{count}} due now", other: "{{count}} due now" },
}

// es.ts
review: {
  cardCount: { one: "{{count}} tarjeta seguida", other: "{{count}} tarjetas seguidas" },
  dueCount: { one: "{{count}} pendiente ahora", other: "{{count}} pendientes ahora" },
}
```

The `t()` function accepts an optional `count` parameter that selects the correct plural form before interpolating `{{count}}`.

**Important Spanish grammar note:** Spanish adjectives must agree in gender and number with nouns. The translation file captures this correctly per-string; the `t()` function does not need to know about gender — the translator encodes it into the translated string itself. The spec must flag this explicitly so automated translation tooling is never used for pluralized strings without human review.

---

## 6. Full String Inventory

This is the complete inventory of strings that must be translated for Phase 1. It is organized by file/surface so a translator can work surface by surface.

### 6.1 Navigation & Layout

From `nav.tsx`, `layout.tsx`, `footer.tsx`:

| Key | English | Notes |
|---|---|---|
| `nav.playground` | Playground | Proper noun — do not translate |
| `nav.runbook` | Runbook | Translate: "Registro" |
| `nav.credentials` | Credentials | "Credenciales" |
| `nav.pricing` | Pricing | "Precios" |
| `nav.review` | Review | "Repasar" (verb, as in "to review") |
| `nav.brand` | Quantum Learner | Proper noun — do not translate |
| `nav.skipToContent` | Skip to content | "Saltar al contenido" |
| `nav.askAboutLesson` | Ask about this lesson | "Preguntar sobre esta lección" |
| `footer.tagline` | learn quantum computing with Amazon Braket | "aprender computación cuántica con Amazon Braket" |
| `footer.builtWith` | Altivum Inc. — built with Amazon Braket. | "Altivum Inc. — construido con Amazon Braket." |

### 6.2 Home Page

From `page.tsx`, `section-pitch.ts`, `welcome/`:

| Key | English | Notes |
|---|---|---|
| `home.eyebrow` | Learn quantum computing, hands-on | "Aprende computación cuántica, de forma práctica" |
| `home.headlineLead` | Master quantum computing | "Domina la computación cuántica" |
| `home.headlineDim` | from first principles | "desde los fundamentos" |
| `home.subtitle` | From circuit fundamentals to production hybrid workloads… | Long string — professional translation required |
| `home.exploreBtn` | Explore the curriculum | "Explorar el currículo" |
| `home.signUpBtn` | Sign up free | "Regístrate gratis" |
| `home.signInBtn` | Sign in | "Iniciar sesión" |
| `home.signUpSoon` | Sign-up coming soon | "Registro próximamente" |
| `home.poweredBy` | Powered by | "Impulsado por" |
| `home.sectionCount` | {{n}} sections | "{{n}} secciones" |
| `home.notebookCount` | {{n}} hands-on notebooks | "{{n}} cuadernos prácticos" |
| `home.gatesCount` | {{n}} gates in the live playground | "{{n}} puertas en el playground en vivo" |
| `home.sectionUnit` | curriculum sections | "secciones del currículo" |
| `home.curriculum.heading` | Learning Path | "Ruta de Aprendizaje" |
| `home.account.eyebrow` | Your workspace | "Tu espacio de trabajo" |
| `home.account.heading` | Create a free account, keep everything in sync | "Crea una cuenta gratuita, mantén todo sincronizado" |
| `home.account.body` | One account carries your lesson progress… | Long string — professional translation |
| `home.account.reassurance` | Email or Google. No credit card — the entire curriculum and simulator are free. | "Correo electrónico o Google. Sin tarjeta de crédito — todo el currículo y el simulador son gratuitos." |
| `home.onePlace.heading` | One place to learn, build, and run | "Un lugar para aprender, construir y ejecutar" |
| `home.challenges.title` | Challenges that grade themselves | "Retos que se califican solos" |
| `home.challenges.body` | Lessons end with hands-on checks… | Medium string |
| `home.review.title` | Spaced-repetition review | "Repaso de repetición espaciada" |
| `home.review.body` | Key ideas become review cards automatically… | Medium string |
| `home.glossary.title` | A glossary that teaches | "Un glosario que enseña" |
| `home.glossary.body` | {{n}} terms with precise definitions… | Medium string |

### 6.3 Lesson Page

From `learn/[section]/page.tsx`, `section-progress.tsx`, `prev-next.tsx`, `notebook-link.tsx`:

| Key | English | Notes |
|---|---|---|
| `lesson.notebooks.heading` | Notebooks | "Cuadernos" |
| `lesson.progress.markComplete` | Mark as complete | "Marcar como completado" |
| `lesson.progress.markIncomplete` | Mark as incomplete | "Marcar como incompleto" |
| `lesson.progress.savedNote` | Completion is saved on this device and counts toward your path progress. | "La finalización se guarda en este dispositivo y cuenta para el progreso de tu ruta." |
| `lesson.notebook.runInBrowser` | Run in browser | "Ejecutar en el navegador" |
| `lesson.notebook.openInLab` | Open in lab | "Abrir en el laboratorio" |
| `lesson.prevNext.previous` | Previous | "Anterior" |
| `lesson.prevNext.next` | Next | "Siguiente" |
| `lesson.toc.heading` | On this page | "En esta página" |
| `lesson.readProgress` | (aria-label) Reading progress | "Progreso de lectura" |



### 6.4 Review Dashboard

From `review-dashboard.tsx`, `review-card.tsx`, `review-store.ts`:

| Key | English | Notes |
|---|---|---|
| `review.eyebrow` | Spaced repetition | "Repetición espaciada" |
| `review.heading` | Review | "Repasar" |
| `review.body` | Cards you have studied resurface here exactly when you are about to forget them… | "Las tarjetas que has estudiado reaparecen aquí exactamente cuando estás a punto de olvidarlas…" |
| `review.dueCount` | `{one: "{{count}} due now", other: "{{count}} due now"}` | "{{count}} pendiente ahora" / "{{count}} pendientes ahora" |
| `review.trackedCount` | `{one: "{{count}} card tracked", other: "{{count}} cards tracked"}` | "{{count}} tarjeta seguida" / "{{count}} tarjetas seguidas" |
| `review.sessionComplete.title` | Session complete — every due card reviewed. | "Sesión completa — todas las tarjetas pendientes repasadas." |
| `review.sessionComplete.sub` | New reviews will appear here as their schedules come due. | "Las nuevas reseñas aparecerán aquí a medida que sus horarios venzan." |
| `review.empty.noCards` | No cards yet | "Sin tarjetas aún" |
| `review.empty.upToDate` | Nothing due — you're caught up | "Nada pendiente — estás al día" |
| `review.empty.noCards.hint` | Work through a lesson and grade its recall cards to start building a review schedule. | Medium string |
| `review.empty.upToDate.hint` | Come back when more cards come due, or keep reading new lessons. | "Regresa cuando haya más tarjetas pendientes, o continúa leyendo nuevas lecciones." |
| `review.item.stuckLabel` | Stuck? Show a correct answer | "¿Atascado? Muestra una respuesta correcta" |
| `review.item.dueLabel` | Due | "Pendiente" |
| `review.item.reviewedLabel` | Reviewed | "Repasado" |
| `review.item.srLabel` | Review item {{i}} of {{n}} — {{kind}}{{done, …, reviewed}} | Accessible description — requires care |
| `review.kindLabels.challenge` | Circuit challenge | "Reto de circuito" |
| `review.kindLabels.predict` | Prediction | "Predicción" |
| `review.kindLabels.bloch` | Bloch target | "Objetivo Bloch" |
| `review.kindLabels.cost` | Cost estimate | "Estimación de costo" |
| `review.kindLabels.debug` | Fix the circuit | "Corregir el circuito" |
| `review.kindLabels.expect` | Expectation value | "Valor esperado" |

### 6.5 Review Card (Recall)

From `review-card.tsx`:

| Key | English | Notes |
|---|---|---|
| `reviewCard.eyebrow` | Recall | "Recordar" |
| `reviewCard.inARow` | {{n}} in a row | "{{n}} seguidas" |
| `reviewCard.showAnswer` | Show answer | "Mostrar respuesta" |
| `reviewCard.answerLabel` | Answer | "Respuesta" |
| `reviewCard.howWell` | How well did you recall it? | "¿Qué tan bien lo recordaste?" |
| `reviewCard.ratings.again` | Again | "De nuevo" |
| `reviewCard.ratings.hard` | Hard | "Difícil" |
| `reviewCard.ratings.good` | Good | "Bien" |
| `reviewCard.ratings.easy` | Easy | "Fácil" |
| `reviewCard.outcome.noop` | Schedule unchanged — this card was already reviewed and isn't due again yet. | "Horario sin cambios — esta tarjeta ya fue repasada y aún no está pendiente." |
| `reviewCard.outcome.scheduled` | Next review {{phrase}}. | "Próximo repaso {{phrase}}." |
| `reviewCard.schedule.tomorrow` | tomorrow | "mañana" |
| `reviewCard.schedule.inDays` | in {{n}} days | "en {{n}} días" |

### 6.6 Workspace Dashboard

From `workspace/masthead.tsx`, `workspace/valve.tsx`, `workspace/panel.tsx`, `workspace/instrument.tsx`, and `workspace.ts` string outputs:

| Key | English | Notes |
|---|---|---|
| `workspace.heading` | Workspace | "Espacio de trabajo" |
| `workspace.sync.localOnly` | This device only — progress is stored locally | "Solo este dispositivo — el progreso se almacena localmente" |
| `workspace.sync.syncing` | Syncing… | "Sincronizando…" |
| `workspace.sync.synced` | Synced {{time}} | "Sincronizado {{time}}" |
| `workspace.sync.notSynced` | Not yet synced | "Aún no sincronizado" |
| `workspace.sync.failed` | Sync failed | "Falló la sincronización" |
| `workspace.sync.sessionExpired` | Session expired — sign in to resume sync | "Sesión expirada — inicia sesión para reanudar la sincronización" |
| `workspace.sync.paused` | Sync paused — retrying | "Sincronización pausada — reintentando" |
| `workspace.sync.now` | Sync now | "Sincronizar ahora" |
| `workspace.sync.mismatch.body` | This device holds progress synced by a different account. | "Este dispositivo tiene progreso sincronizado por una cuenta diferente." |
| `workspace.sync.mismatch.merge` | Merge this device | "Combinar este dispositivo" |
| `workspace.sync.mismatch.reset` | Use account data only | "Usar solo los datos de la cuenta" |
| `workspace.valve.dueNow.panel` | Due now | "Pendiente ahora" |
| `workspace.valve.dueReps` | {{count}} Reps due today | sr-only label |
| `workspace.valve.retained.one` | {{count}} is a retained skill | "{{count}} es una habilidad retenida" |
| `workspace.valve.retained.other` | {{count}} are retained skills | "{{count}} son habilidades retenidas" |
| `workspace.valve.retained.warning` | — an "Again" resets {{pronoun}} to a 1-day interval. | "— un "De nuevo" lo restablece a un intervalo de 1 día." |
| `workspace.valve.cta.review` | Review {{n}} card(s) | "Repasar {{n}} tarjeta(s)" |
| `workspace.valve.cta.start` | Start Prerequisites | "Comenzar Prerrequisitos" |
| `workspace.valve.cta.continue` | Continue {{title}} | "Continuar {{title}}" |
| `workspace.valve.cta.lab` | Open the lab | "Abrir el laboratorio" |
| `workspace.valve.headline.noTracked` | You have not graded a Rep yet. | "Aún no has calificado un Ejercicio." |
| `workspace.valve.headline.nothingDue` | Nothing is due right now. | "Nada está pendiente ahora mismo." |
| `workspace.valve.headline.nextDue` | Nothing is due. Next Rep in {{n}} day(s). | "Nada pendiente. Próximo ejercicio en {{n}} día(s)." |



### 6.7 Runbook Dashboard

From `runbook-dashboard.tsx`:

| Key | English | Notes |
|---|---|---|
| `runbook.eyebrow` | Mastery | "Dominio" |
| `runbook.heading` | Runbook | "Registro" |
| `runbook.body` | The record of what you have actually made durable… | "El registro de lo que realmente has vuelto duradero…" |
| `runbook.empty.heading` | Your Runbook is empty — for now. | "Tu Registro está vacío — por ahora." |
| `runbook.empty.body` | Grade your first Rep on a lesson and it lands here… | Medium string |
| `runbook.empty.startLesson` | Start a lesson | "Comenzar una lección" |
| `runbook.empty.goReview` | Go to review | "Ir a repasar" |
| `runbook.skills.label` | Skills in proven retention | "Habilidades en retención comprobada" |
| `runbook.skills.keptSharp` | {{n}} kept sharp this week | "{{n}} mantenida(s) esta semana" |
| `runbook.skills.description` | Cards whose spacing interval has grown past {{n}} days… | Template string |
| `runbook.streak.label` | Week streak | "Racha semanal" |
| `runbook.streak.week.one` | week | "semana" |
| `runbook.streak.week.other` | weeks | "semanas" |
| `runbook.streak.freeze.holding` | a freeze is holding a missed week | "un congelamiento está compensando una semana perdida" |
| `runbook.streak.freeze.reserve.one` | {{n}} freeze earned, in reserve | "{{n}} congelamiento ganado, en reserva" |
| `runbook.streak.freeze.reserve.other` | {{n}} freezes earned, in reserve | "{{n}} congelamientos ganados, en reserva" |
| `runbook.streak.freeze.earn` | earn a freeze every 10 skills retained | "gana un congelamiento cada 10 habilidades retenidas" |
| `runbook.stats.longestStreak` | Longest streak | "Racha más larga" |
| `runbook.stats.activeWeek` | Active this week | "Activo esta semana" |
| `runbook.stats.modulesComplete` | Modules complete | "Módulos completados" |
| `runbook.stats.dueReview` | Due to review | "Pendiente de repasar" |
| `runbook.stats.ofN` | of {{n}} | "de {{n}}" |
| `runbook.stats.day.one` | day | "día" |
| `runbook.stats.day.other` | days | "días" |
| `runbook.stats.card.one` | card | "tarjeta" |
| `runbook.stats.card.other` | cards | "tarjetas" |
| `runbook.activity.heading` | Last {{n}} weeks | "Últimas {{n}} semanas" |
| `runbook.activity.active` | active {{n}} of the last {{total}} days | "activo {{n}} de los últimos {{total}} días" |
| `runbook.activity.noActivity` | no activity yet | "sin actividad aún" |
| `runbook.activity.legend.inactive` | Inactive | "Inactivo" |
| `runbook.activity.legend.active` | Active | "Activo" |
| `runbook.activity.viewDays` | View active days | "Ver días activos" |
| `runbook.activity.heatmap` | Activity heatmap for the last {{n}} weeks: active on {{active}} of {{total}} days. | Aria label — requires care |

### 6.8 Graded Rep Widgets

These are the grading feedback strings inside the challenge, predict, bloch-target, cost-estimate, debug-circuit, and expectation widgets. This is the most translation-sensitive surface because the strings carry precise numeric feedback and must remain honest.

| Key | English | Notes |
|---|---|---|
| `widgets.eyebrow.yourTurn` | Your turn | "Tu turno" |
| `widgets.badge.solved` | Solved | "Resuelto" |
| `widgets.badge.fixed` | Fixed | "Corregido" |
| `widgets.check` | Check | "Verificar" |
| `widgets.hint.label` | Hint | "Pista" |
| `widgets.allowedGates` | Allowed gates: {{gates}} | "Puertas permitidas: {{gates}}" |
| `widgets.tier.py` | graded with real qcsim in your browser | "calificado con qcsim real en tu navegador" |
| `widgets.booting` | Booting Python (first run takes a few seconds)… | "Iniciando Python (la primera ejecución tarda unos segundos)…" |
| `widgets.schedule.added` | Added to your review — back {{phrase}}. | "Añadido a tu repaso — regresa {{phrase}}." |
| `widgets.schedule.reviewed` | Reviewed — next review {{phrase}}. | "Repasado — próximo repaso {{phrase}}." |
| `widgets.bestGates.solved` | Solved in {{n}} gate(s) — your best. | "Resuelto en {{n}} puerta(s) — tu mejor resultado." |
| `widgets.bestGates.canMatch` | Solved in {{n}} gate(s) — your best is {{best}}. Can you match it? | Template — requires professional translation |
| `widgets.bestGates.fixed` | Fixed in {{n}} gate(s) — your best. | "Corregido en {{n}} puerta(s) — tu mejor resultado." |
| `widgets.challenge.correct` | Correct — state matches the target. | "Correcto — el estado coincide con el objetivo." |
| `widgets.challenge.wrong` | Not quite. {{detail}} | "No del todo. {{detail}}" |
| `widgets.predict.correct` | Correct — {{detail}} | Template |
| `widgets.predict.wrong` | Not quite — {{detail}} | Template |
| `widgets.bloch.correct` | Correct — {{angle}}° off, within {{tol}}° tolerance. | Template with numeric values |
| `widgets.bloch.wrong` | Not quite — {{angle}}° off. | "No del todo — {{angle}}° de diferencia." |
| `widgets.cost.correct` | Correct — within {{pct}}%. | Template |
| `widgets.cost.wrong` | Not quite — you estimated {{est}}, actual is {{actual}} (off by {{pct}}%). | Template with multiple values |
| `widgets.debug.intro` | There's a bug in this circuit. Find and fix it. | "Hay un error en este circuito. Encuéntralo y corrígelo." |
| `widgets.expect.intro` | What is the expectation value of this observable? | "¿Cuál es el valor esperado de este observable?" |

**Critical translation note:** Numeric feedback strings like "Off by 12.3°" and "you estimated $0.45, actual is $0.30 (off by 50%)" must preserve the tabular-nums precision and exact number formatting. The translator must not paraphrase the number or change its unit. Template placeholders (`{{angle}}`, `{{pct}}`) are substituted after translation.



### 6.9 Ask the Tutor

From `ask-tutor.tsx` and `lambda/tutor/`:

| Key | English | Notes |
|---|---|---|
| `tutor.dialogLabel` | Lesson tutor | "Tutor de lección" |
| `tutor.heading` | Ask the margin | "Pregunta al margen" |
| `tutor.groundedIn` | Grounded in: | "Basado en:" |
| `tutor.close` | Close tutor | "Cerrar tutor" |
| `tutor.placeholder` | e.g. why does the Z-string only act on the lower modes? | "p. ej. ¿por qué la cadena Z solo actúa en los modos inferiores?" |
| `tutor.enterHint` | Enter to send, Shift+Enter for a new line | "Enter para enviar, Shift+Enter para nueva línea" |
| `tutor.ask` | Ask | "Preguntar" |
| `tutor.asking` | Asking… | "Preguntando…" |
| `tutor.thinking` | Thinking… | "Pensando…" |
| `tutor.answerReady` | Answer ready | "Respuesta lista" (sr-only) |
| `tutor.idle` | Ask anything about this lesson. I answer only from the lesson text… | Long string |
| `tutor.tooMany` | Too many questions in a short window — give it a minute and try again. | "Demasiadas preguntas en poco tiempo — espera un momento e intenta de nuevo." |
| `tutor.unavailable` | The tutor is unavailable right now — please try again shortly. | "El tutor no está disponible ahora — inténtalo de nuevo pronto." |
| `tutor.connectionError` | Could not reach the tutor — check your connection. | "No se pudo comunicar con el tutor — verifica tu conexión." |
| `tutor.timeout` | The tutor stopped responding — please try again. | "El tutor dejó de responder — inténtalo de nuevo." |
| `tutor.noAnswer` | The tutor did not send an answer — please try again. | "El tutor no envió una respuesta — inténtalo de nuevo." |

**Tutor system prompt:** When `locale === "es"`, the Lambda's system prompt must instruct Claude to answer in Spanish. The current `buildSystemPrompt()` in `lambda/tutor/` should be extended to include: `"Respond in Spanish (Español). Your entire response must be in Spanish."` This is a one-line Lambda change with significant learner impact — a Spanish-speaking learner asking a question should receive a Spanish answer.

### 6.10 Auth, Account, and Error Surfaces

From `auth/`, `credentials-wall.tsx`, `section-gate-modal.tsx`:

| Key | English | Notes |
|---|---|---|
| `auth.signIn.heading` | Sign in | "Iniciar sesión" |
| `auth.signUp.heading` | Create your account | "Crea tu cuenta" |
| `auth.email.label` | Email address | "Correo electrónico" |
| `auth.password.label` | Password | "Contraseña" |
| `auth.forgotPassword` | Forgot password? | "¿Olvidaste tu contraseña?" |
| `auth.continueWith` | Continue with {{provider}} | "Continuar con {{provider}}" |
| `auth.orSeparator` | or | "o" |
| `auth.noAccount` | Don't have an account? | "¿No tienes una cuenta?" |
| `auth.haveAccount` | Already have an account? | "¿Ya tienes una cuenta?" |
| `auth.verifyEmail.heading` | Check your email | "Revisa tu correo" |
| `auth.verifyEmail.body` | We sent a verification code to {{email}} | "Enviamos un código de verificación a {{email}}" |
| `auth.gateModal.pitch.heading` | {{title}} | section title — not translated here |
| `auth.gateModal.cta` | Create a free account | "Crear una cuenta gratuita" |
| `auth.gateModal.close` | Close | "Cerrar" |

### 6.11 Glossary

From `glossary.ts`, `app/glossary/`:

| Key | English | Notes |
|---|---|---|
| `glossary.heading` | Glossary | "Glosario" |
| `glossary.body` | {{n}} defined terms from the curriculum… | Template |
| `glossary.searchPlaceholder` | Search terms | "Buscar términos" |
| `glossary.seeAlso` | See also | "Ver también" |
| `glossary.section.label` | From: {{section}} | "De: {{section}}" |
| `glossary.noResults` | No terms match "{{query}}" | "Ningún término coincide con "{{query}}"" |
| Section short labels | Prerequisites, Foundations, Hardware, Algorithms, Quantum ML, Chemistry, Hybrid Jobs | All 7 translated |

**Glossary term translations (Phase 2):** The actual term definitions (~100 entries of formal physics prose with KaTeX math) are Phase 2 content, aligned with the GUIDE.md translations. In Phase 1, glossary definitions remain in English with translated UI chrome around them. This is clearly preferable to machine-translated physics definitions.

### 6.12 Playground and Pricing

From `app/playground/`, `app/pricing/`, `playground/palette.ts`:

| Key | English | Notes |
|---|---|---|
| `playground.heading` | Playground | "Playground" (kept as-is, technical proper noun) |
| `playground.compose.heading` | Compose | "Componer" |
| `playground.state.heading` | State | "Estado" |
| `playground.export.qasm` | Copy as OpenQASM | "Copiar como OpenQASM" |
| `playground.share` | Share | "Compartir" |
| `playground.circuit.empty` | Add gates to see the quantum state | "Agrega puertas para ver el estado cuántico" |
| `pricing.heading` | Pricing | "Precios" |
| `pricing.sponsored` | Sponsored — the platform pays for your QPU runs | "Patrocinado — la plataforma paga por tus ejecuciones en QPU" |

### 6.13 Date and Time Formatting

Every call to `toLocaleDateString` and `toLocaleTimeString` currently hardcodes `"en-US"`. These must become locale-aware:

```typescript
// Before
new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })

// After
new Date(ts).toLocaleDateString(locale === "es" ? "es-MX" : "en-US", { ... })
```

The Spanish locale variant to use is `es-MX` (Mexico) as the primary target market, not `es-ES` (Spain). This affects date order (day/month/year vs month/day/year) and number formatting. A locale utility function `localeCode(locale: Locale): string` should centralize this mapping so every call site stays consistent.

Affected files: `runbook-dashboard.tsx` (activity graph dates), `workspace/masthead.tsx` (sync timestamp), any future date display.



---

## 7. The `t()` Function

The translation lookup function is the lowest-level primitive. It must be:

- **Pure** — same inputs always return the same output (testable)
- **Fast** — called on every render; no async, no network
- **Safe** — a missing key returns the English fallback and logs a warning in dev; it never returns undefined or throws

```typescript
// Simplified signature
function t(key: string, values?: Record<string, string | number>, count?: number): string

// Examples
t("review.heading")                              // → "Repasar"
t("review.dueCount", { count: 3 }, 3)           // → "3 pendientes ahora"
t("review.dueCount", { count: 1 }, 1)           // → "1 pendiente ahora"
t("tutor.groundedIn")                            // → "Basado en:"
t("widgets.cost.wrong", {                        // templated
  est: "$0.45", actual: "$0.30", pct: "50"
})                                               // → "No del todo — estimaste $0.45, el costo real es $0.30 (diferencia de 50%)."
```

### 7.1 Fallback Strategy

```
locale dictionary → English dictionary → key itself (dev warning)
```

If a key is missing from `es.ts` (which the CI completeness test prevents) and somehow makes it to production, the function falls back to `en.ts`. The learner sees English rather than a raw key string like `"review.heading"`. This is the correct graceful degradation.

### 7.2 The `useLocale` Hook and `t()` Integration

Two usage patterns:

```typescript
// Pattern A: component that uses useLocale directly
function ReviewDashboard() {
  const { t } = useLocale();
  return <h1>{t("review.heading")}</h1>;
}

// Pattern B: utility function that needs to format a string
// (e.g. workspace.ts's resolveValve, which builds valve.headline)
// These functions must be REFACTORED to accept locale as a parameter
// rather than baking strings directly, since they currently run outside React.
function resolveValve(input: { ..., locale: Locale }): ValveAction { ... }
```

Pattern B — strings built outside React in pure TypeScript functions — requires the most architectural care. `resolveValve()` in `workspace.ts` and `dueByKind()` / `KIND_LABELS` in `review-store.ts` currently return hardcoded English strings. These must be refactored to either:

1. Return keys instead of strings (preferred: the component translates at render time), or  
2. Accept `locale` as a parameter (acceptable when the structure is complex enough that key-returning would require a parallel type)

The `KIND_LABELS` record in `review-store.ts` is exported and consumed by `review-dashboard.tsx` and `workspace.ts`. It should become a `kindLabel(kind: CardKind, t: TFunction): string` helper function, or alternatively the `dueKinds` array in `WorkspaceModel` should carry kind keys rather than pre-resolved strings.

---

## 8. SEO and Metadata

`generateMetadata()` in each page is a server-side (build-time) function in the static export. It runs **once at build time** in English. For Phase 1, this is acceptable — the pages are not indexed anyway (`robots: { index: false }` on lesson pages), and the static export produces a single set of HTML files.

For Phase 2 (subdirectory builds), each locale would have its own build output and its own metadata in the correct language, with `<link rel="alternate" hreflang="es" href="..." />` tags. This is a Phase 2 concern.

The `<html lang>` attribute is the Phase 1 SEO signal — it correctly communicates the document language to search engines for the learner's active session, even though it is set by JavaScript after hydration.

---

## 9. Integration with the Sync Lambda

The `lambda/sync/` backend stores and restores the learner's `qc:*` keys verbatim. The locale preference is stored as `qc:locale`. Because sync is a generic key-value store, it already handles this correctly — no Lambda change is needed. The locale will sync across devices automatically.

Edge case: a learner who has `es` set on their phone and `en` set on their laptop, then syncs. The sync stores whichever device wrote last. This is the correct behavior — locale is a preference, not progress data. A later PR could add a `qc:locale` conflict resolution policy if this becomes a support issue, but the initial implementation should not over-engineer it.

---

## 10. Implementation Tasks

Ordered by dependency. No task should begin before its predecessors are complete.

### Task 1 — Core i18n infrastructure (no visible change)
- Create `web/src/i18n/` directory with `types.ts`, `pluralize.ts`, `context.tsx`, `index.ts`
- Implement `t()` function with template interpolation and plural support
- Implement `LocaleProvider` and `useLocale` hook (mirrors `ThemeProvider` pattern)
- Add `qc:locale` localStorage read/write with `"en"` default
- Add `html lang` update effect in `LocaleProvider`
- Write completeness test (`i18n/__tests__/completeness.test.ts`)
- Write unit tests for `t()`: plain key, template, plurals, missing key fallback, unknown locale fallback

### Task 2 — English translation dictionary
- Create `web/src/i18n/locales/en.ts` with ALL keys from Section 6
- Every string must match exactly what currently renders (this is the source of truth extraction, not translation)
- Run completeness test — must pass with `en.ts` as its own reference

### Task 3 — Wire `LocaleProvider` into the app
- Wrap the root layout's ThemeProvider in LocaleProvider (or add it as a sibling — either works)
- Update `<html lang>` in `layout.tsx` to read from the locale context (or accept the hydration correction from the effect)

### Task 4 — Refactor `KIND_LABELS` and `resolveValve` to be locale-aware
- Change `KIND_LABELS` from a static record to a `getKindLabels(t)` function
- Change `dueKinds` in `WorkspaceModel` to carry kind keys, or pass `t` through `readWorkspace`
- Change `resolveValve`'s string outputs (`cta`, `headline`) to use `t()` or return keys
- Update all consumers
- Tests must remain green throughout

### Task 5 — Replace all hardcoded strings in components
Working surface by surface, using the key inventory in Section 6:
- 5a: `nav.tsx`, `footer.tsx`, `layout.tsx` (skip-to-content)
- 5b: `review-dashboard.tsx`, `review-card.tsx`
- 5c: `runbook-dashboard.tsx`
- 5d: `workspace/masthead.tsx`, `workspace/valve.tsx`, all workspace panels
- 5e: `ask-tutor.tsx`
- 5f: Graded Rep widgets (challenge, predict, bloch-target, cost-estimate, debug-circuit, expectation, review-card)
- 5g: `home/page.tsx`, welcome components, section-pitch.ts
- 5h: `learn/[section]/page.tsx`, `notebook-link.tsx`, `section-progress.tsx`, `prev-next.tsx`
- 5i: `app/glossary/`, `app/credentials/`, `app/playground/`, `app/pricing/`
- 5j: Auth components
- 5k: Date/time formatting (introduce `localeCode()` utility, replace all `"en-US"` hardcodes)

Each sub-task: replace strings → run `npm test` → all tests pass before moving to next surface.

### Task 6 — Build the LanguageSelector component
- Create `web/src/components/language-selector.tsx`
- Globe icon + locale abbreviation trigger button
- Dropdown with two options (en, es), check on current
- `role="menu"` / `role="menuitem"` ARIA pattern
- Keyboard: Escape closes, arrow keys navigate, Enter selects
- Focus returns to trigger on close
- Uses `useLocale()` from the i18n context
- Tests: renders current locale, selects new locale, closes on Escape, focus management

### Task 7 — Wire LanguageSelector into the nav
- Add `<LanguageSelector />` to `nav.tsx` beside `<ThemeToggle />`
- Confirm visual placement on desktop and mobile pill row
- Confirm no layout shift in both screen widths

### Task 8 — Spanish translation dictionary
- Create `web/src/i18n/locales/es.ts`
- Professional translation pass for all ~200 strings (not automated)
- Special care required for: grading feedback templates, pluralization, date/time phrases, accessibility (sr-only) strings
- Physics terms (Bloch sphere, qubit, ket, bra, Hamiltonian) are kept as Spanish technical terms, not anglicized
- Completeness test must pass

### Task 9 — Tutor Lambda locale support
- Extend `buildSystemPrompt()` in `lambda/tutor/` to accept a `locale` parameter
- The portal passes `locale` alongside `slug` and `question` in the POST body
- When `locale === "es"`, append the Spanish instruction to the system prompt
- Update Lambda tests to cover both locale branches
- Deploy updated Lambda

### Task 10 — E2E and accessibility testing
- Add Playwright test: switch to Spanish, verify nav labels, verify review dashboard strings, verify grading feedback on a challenge
- Run contrast guard tests in Spanish locale (no new color tokens are introduced, so these should pass automatically)
- Run the WCAG focus management tests: language selector dropdown must be fully keyboard operable

### Task 11 — Content freeze and CI guard
- The completeness test (`i18n/completeness.test.ts`) runs in the `web` CI job
- Any PR that adds a new hardcoded English string without a corresponding key in both `en.ts` and `es.ts` must fail CI
- This requires a secondary lint rule or a test that scans component files for string literals that should be keys — this is a stretch goal; the completeness test (which checks `en.ts` ↔ `es.ts` parity) is the minimum



---

## 11. Physics and Notation Conventions in Spanish

This section is for the translator and technical reviewer. It defines how specific quantum computing concepts should be handled in Spanish. These decisions must be consistent across all translated surfaces.

### 11.1 Terms That Are Kept in English

These are proper nouns, international technical standards, or brand names. They should not be translated:

- **Amazon Braket**, **PennyLane**, **OpenFermion**, **JupyterLite**, **Pyodide** — brand names
- **Playground** — used as a product name in the nav; kept as-is (translated in body copy as "campo de práctica" where needed)
- **Runbook** — a genre term used as a product name; kept as-is (translated as "Registro" in the heading, "Runbook" in the nav for brand consistency)
- **FSRS**, **SM-2** — algorithm names
- **Rep** — used as a product-specific term for a graded exercise; can be translated as "Ejercicio" in body text, but the system logs/storage keys are always English

### 11.2 Terms With Established Spanish Equivalents

These have well-established Spanish technical translations used in university physics courses:

| English | Spanish |
|---|---|
| Qubit | cúbit (or qubit — both used; prefer "cúbit" for formal prose, "qubit" for code context) |
| Superposition | superposición |
| Entanglement | entrelazamiento |
| Measurement | medición |
| Gate | puerta |
| Circuit | circuito |
| Hamiltonian | Hamiltoniano |
| Eigenvalue | valor propio |
| Eigenvector | vector propio |
| Ground state | estado base |
| Coherence time | tiempo de coherencia |
| Decoherence | decoherencia |
| Fidelity | fidelidad |
| Shots | disparos (technical usage) |

### 11.3 Dirac Notation

Dirac notation (kets `|ψ⟩`, bras `⟨ψ|`, brackets `⟨a|b⟩`) is a universal mathematical notation. It does not change across languages. The Dirac readout in the state readout component (`|ψ⟩ = α|0⟩ + β|1⟩`) requires no translation. The label "Estado cuántico" replaces "Quantum state" where needed.

### 11.4 Code Blocks and Gate DSL

Code is never translated. A challenge widget's `starter` program (`H 0\nCNOT 0 1`) is code, not prose. Gate names (`H`, `CNOT`, `RY`) are international standard identifiers. Only the surrounding UI text (the prompt, hint, grading feedback) is translated.

### 11.5 Mathematical Expressions

KaTeX renders Unicode math that is language-neutral. A formula like `$|\Phi^+\rangle = (|00\rangle+|11\rangle)/\sqrt{2}$` requires no translation. The surrounding prose that explains it is translated. Never attempt to translate a LaTeX expression.

---

## 12. What Is Deliberately Out of Scope for Phase 1

| Item | Reason | Phase |
|---|---|---|
| GUIDE.md prose translation | ~35,000 words requiring technical physicist reviewer | Phase 2 |
| Glossary definitions | Formal physics prose, tied to GUIDE.md translation | Phase 2 |
| Rep prompts and answers | Tied to curriculum content | Phase 2 |
| Subdirectory routing (`/es/...`) | Requires significant build pipeline changes | Phase 2 |
| SEO-correct metadata in Spanish | Requires subdirectory routing | Phase 2 |
| Additional languages (French, Portuguese, Chinese, etc.) | Dictionary structure established in Phase 1 makes Phase 3 additive | Phase 3+ |
| Notebook content (`.ipynb` files) | Python curriculum; separate editorial process | Post-Phase 2 |
| Right-to-left (RTL) layout | No current target locale requires RTL | Not planned |
| Machine translation quality assurance | All Phase 1 strings require human review | Ongoing |

---

## 13. Testing Requirements

### 13.1 Unit Tests (Jest)

All in `web/src/i18n/__tests__/`:

- `t.test.ts` — plain key lookup, template interpolation, pluralization (1 vs. other), missing key fallback to English, unknown locale fallback, nested key resolution
- `completeness.test.ts` — every key in `en.ts` must exist in `es.ts` with a non-empty string value; runs in CI
- `pluralize.test.ts` — plural rules for English (n=0,1,2,100) and Spanish (same rules, confirms symmetry)
- `localeCode.test.ts` — `localeCode("en")` → `"en-US"`, `localeCode("es")` → `"es-MX"`

### 13.2 Component Tests (Testing Library)

- `language-selector.test.tsx` — renders current locale, opens dropdown, selects alternative, closes on Escape, focus returns to trigger, `html lang` attribute updates
- `review-dashboard.test.tsx` — in Spanish locale, heading renders "Repasar", kind labels render correctly
- `runbook-dashboard.test.tsx` — in Spanish locale, streak badge renders "semanas"
- `challenge.test.tsx` — grading feedback renders in Spanish when locale is "es"

### 13.3 E2E Tests (Playwright)

- `language-selector.e2e.ts` — switch from English to Spanish, verify nav labels change, switch back, verify persistence across navigation
- The existing contrast guard tests must pass with no changes (no new color tokens are introduced)

### 13.4 CI Integration

The `completeness.test.ts` runs inside the existing `web` CI job. No new CI job is needed. The test is fast (pure object comparison) and adds negligible time to the pipeline.

---

## 14. Open Questions for Product Decisions

These are decisions that require founder input before implementation begins:

1. **Nav label for "Runbook"**: Should it display "Runbook" (brand name, untranslated) or "Registro" (the Spanish heading) in the nav pill? Recommendation: "Runbook" in the nav (brand consistency), "Registro" as the page `h1`. Confirm.

2. **Default locale for new visitors**: Should the selector default to the browser's `navigator.language`? If a Spanish-speaking browser visits the site for the first time, should they see Spanish automatically? The spec currently defaults to `"en"` (matching the existing experience) and requires the learner to opt in. An auto-detect default is more sophisticated but may surprise learners who prefer English. Confirm.

3. **Locale selector position on mobile**: The nav pill has 4 items and limited width. Adding a 5th (language) may require a redesign. Two options: (a) add the globe icon button to the right-side actions area alongside ThemeToggle (consistent with desktop), or (b) move it to a settings/account menu. Recommendation: (a) — always visible, no buried menu. Confirm.

4. **Section pitches in the sign-up gate modal**: The `section-pitch.ts` strings are ~7 paragraphs of marketing copy about why to create an account for each section. These are the most marketing-register text in the platform and benefit most from professional copywriting in Spanish rather than translation. Flag this for a bilingual Spanish copywriter review, not just a translator pass.

5. **Spanish tutor quality**: The AI tutor (Bedrock/Claude) will answer in Spanish when instructed. The quality should be evaluated against a set of quantum computing questions in Spanish before shipping. Who owns that evaluation?



---

## 15. Sophistication Criteria and Anti-Patterns

This section defines what "true sophistication" means for this feature, and what it explicitly rejects.

### What This Is

A first-class product experience for Spanish-speaking learners. A Spanish speaker should be able to use every part of the platform — including getting graded, reviewing cards, reading workspace data, asking the AI tutor a question, and understanding error feedback — entirely in Spanish, with no degraded experience. The physics is the same; the language is their own.

### What This Rejects

- **Machine-translated GUIDE prose shipped in Phase 1.** A mistranslated physics concept is worse than English. Phase 1 does not ship translated lesson content.
- **Partial translation.** A UI where the nav is translated but the grading feedback is in English is not sophisticated — it is half-finished. Phase 1 ships all UI strings, all grading feedback, all error messages, and the AI tutor. Every moment-to-moment interaction is Spanish.
- **A locale picker buried in settings.** The selector is in the persistent nav, visible to every visitor before they know anything about the platform.
- **Automated translation without human review.** Every Spanish string in `es.ts` must be reviewed by a bilingual speaker with technical domain knowledge. The spec provides the inventory; the translation quality is a human gate.
- **`navigator.language` auto-switching without a visible control.** Auto-detection that cannot be easily overridden is aggressive. The selector is always visible.
- **Translating mathematical notation or code.** Dirac notation, KaTeX formulas, and code are universal. They are never touched.
- **Different "brand register" in Spanish.** The platform's brand voice — precise, professional, honest — must be preserved in Spanish. The Spanish translation should feel like a professional physicist translated it, not like a tourist phrasebook.

---

## Appendix: File Map

| New file | Purpose |
|---|---|
| `web/src/i18n/types.ts` | `Locale`, `TranslationDict`, `TFunction` types |
| `web/src/i18n/pluralize.ts` | Plural rules per locale |
| `web/src/i18n/context.tsx` | `LocaleProvider`, `useLocale` hook |
| `web/src/i18n/index.ts` | Re-exports |
| `web/src/i18n/locales/en.ts` | English dictionary (source of truth) |
| `web/src/i18n/locales/es.ts` | Spanish translations |
| `web/src/i18n/__tests__/completeness.test.ts` | CI parity guard |
| `web/src/i18n/__tests__/t.test.ts` | Unit tests for `t()` |
| `web/src/i18n/__tests__/pluralize.test.ts` | Plural rule tests |
| `web/src/components/language-selector.tsx` | The selector component |

| Modified file | Change |
|---|---|
| `web/src/app/layout.tsx` | Wrap in `LocaleProvider` |
| `web/src/components/nav.tsx` | Add `<LanguageSelector />` |
| `web/src/lib/review-store.ts` | `KIND_LABELS` → `getKindLabels(t)` |
| `web/src/lib/workspace.ts` | `resolveValve` returns keys or accepts `t` |
| `web/src/components/ask-tutor.tsx` | All string literals → `t()` calls; pass `locale` in POST body |
| `lambda/tutor/index.mjs` | Accept `locale` in request body; pass to `buildSystemPrompt` |
| Every component in Section 10 Task 5 | Replace hardcoded strings with `t()` calls |
| `web/src/components/quantum/review-card.tsx` | Rating labels, outcome strings via `t()` |
| All 6 graded Rep widgets | Grading feedback, schedule notes via `t()` |
