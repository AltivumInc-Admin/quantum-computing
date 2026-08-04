import type { TranslationDict } from "../types";

/**
 * English dictionary — canonical source of truth for Phase 1 UI strings.
 * Every key here must exist in es.ts (completeness test).
 */
export const en: TranslationDict = {
  nav: {
    brand: "Quantum Learner",
    playground: "Playground",
    runbook: "Runbook",
    credentials: "Credentials",
    pricing: "Pricing",
    review: "Review",
    reviewDue: {
      one: "Review, {{count}} card due",
      other: "Review, {{count}} cards due",
    },
    glossary: "Glossary",
    privacy: "Privacy",
    github: "GitHub",
    skipToContent: "Skip to content",
    signIn: "Sign in",
    language: "Language",
    languageMenu: "Choose language",
  },
  footer: {
    tagline: "{{site}} — learn quantum computing with Amazon Braket.",
    builtWith: "Altivum Inc. — built with Amazon Braket.",
    ariaLabel: "Footer",
  },
  foundingTen: {
    label: "Founding Ten",
    ariaLabel: "The Founding Ten — {{claimed}} of {{total}} places claimed",
  },
  lang: {
    en: "English",
    es: "Español",
  },
  schedule: {
    tomorrow: "tomorrow",
    inDays: {
      one: "in {{count}} day",
      other: "in {{count}} days",
    },
  },
  review: {
    eyebrow: "Spaced repetition",
    heading: "Review",
    body:
      "Cards you have studied resurface here exactly when you are about to forget them. A few minutes now keeps the whole curriculum fresh.",
    dueCount: {
      one: "{{count}} due now",
      other: "{{count}} due now",
    },
    trackedCount: {
      one: "{{count}} card tracked",
      other: "{{count}} cards tracked",
    },
    sessionCompleteTitle: "Session complete — every due card reviewed.",
    sessionCompleteSub: "New reviews will appear here as their schedules come due.",
    emptyNoCards: "No cards yet",
    emptyUpToDate: "Nothing due — you're caught up",
    emptyNoCardsHint:
      "Work through a lesson and grade its recall cards to start building a review schedule.",
    emptyUpToDateHint:
      "Come back when more cards come due, or keep reading new lessons.",
    dueLabel: "Due",
    reviewedLabel: "Reviewed",
    itemSr: "Review item {{i}} of {{n}} — {{kind}}{{done}}",
    itemReviewedSuffix: ", reviewed",
    recallKind: "Recall",
    stuckSummary: "Stuck? Show a correct answer",
    kindLabels: {
      challenge: "Circuit challenge",
      predict: "Prediction",
      bloch: "Bloch target",
      cost: "Cost estimate",
      debug: "Fix the circuit",
      expect: "Expectation value",
      unknown: "Other",
    },
  },
  reviewCard: {
    eyebrow: "Recall",
    inARow: {
      one: "{{count}} in a row",
      other: "{{count}} in a row",
    },
    showAnswer: "Show answer",
    answerLabel: "Answer",
    howWell: "How well did you recall it?",
    again: "Again",
    hard: "Hard",
    good: "Good",
    easy: "Easy",
    outcomeNoop:
      "Schedule unchanged — this card was already reviewed and isn't due again yet.",
    outcomeScheduled: "Next review {{phrase}}.",
  },
  quiz: {
    eyebrow: "Self-check",
    showAll: "Show all answers",
    hideAll: "Hide all answers",
    hint: "Hint",
    hideHint: "Hide hint",
    showAnswer: "Show answer",
    hideAnswer: "Hide answer",
    answerLabel: "Answer",
    hintLabel: "Hint",
    howWell: "How well did you recall it?",
    again: "Again",
    hard: "Hard",
    good: "Good",
    easy: "Easy",
    outcomeNoop:
      "Schedule unchanged — this card was already reviewed and isn't due again yet.",
    outcomeScheduled: "Next review {{phrase}}.",
    parseError: "quiz parse error",
  },
  workspace: {
    valveDueNow: "Due now",
    valveDueReps: {
      one: "{{count}} Rep due today",
      other: "{{count}} Reps due today",
    },
    valveRetainedOne: {
      one: "{{count}} is a retained skill",
      other: "{{count}} are retained skills",
    },
    valveRetainedWarning:
      "— an \"Again\" resets {{them}} to a 1-day interval.",
    valveThemOne: "it",
    valveThemOther: "them",
    ctaReview: {
      one: "Review {{count}} card",
      other: "Review {{count}} cards",
    },
    ctaStart: "Start Prerequisites",
    ctaContinue: "Continue {{title}}",
    ctaLab: "Open the lab",
    headlineNoTracked: "You have not graded a Rep yet.",
    headlineNothingDue: "Nothing is due right now.",
    headlineNextDue: {
      one: "Nothing is due. Next Rep in {{count}} day.",
      other: "Nothing is due. Next Rep in {{count}} days.",
    },
  },
  home: {
    eyebrow: "Learn quantum computing, hands-on",
    headlineLead: "Master quantum computing",
    headlineDim: "from first principles",
    subtitle:
      "From circuit fundamentals to production hybrid workloads — a live playground, real quantum hardware, and an AI tutor in the margin. Free, right in your browser.",
    signUpFree: "Sign up free",
    signIn: "Sign in",
    signUpSoon: "Sign-up coming soon",
    exploreCurriculum: "Explore the curriculum",
    poweredBy: "Powered by",
    scrollToCurriculum: "Scroll to the curriculum",
    scrollDown: "Scroll down",
    quantumHorizons: "Quantum horizons",
    statSections: "curriculum sections",
    statNotebooks: "hands-on notebooks",
    statGates: "gates in the live playground",
    notebooksCount: {
      one: "{{count}} notebook",
      other: "{{count}} notebooks",
    },
    nodeFoundations: "Foundations",
    nodeHardware: "Hardware",
    nodeAlgorithms: "Algorithms",
    nodeChemistry: "Chemistry",
    featuresHeading: "One place to learn, build, and run",
    bandPlaygroundKicker: "Playground",
    bandPlaygroundTitle: "Sketch circuits, see the quantum state instantly",
    bandPlaygroundBody:
      "Compose gates in a live editor and watch amplitudes, probabilities, and a publication-style circuit diagram redraw on every keystroke. Save circuits locally, share them by URL, and export standard OpenQASM whenever you want to leave.",
    bandPlaygroundCta: "Open the playground",
    bandHardwareKicker: "Real hardware",
    bandHardwareTitle: "Graduate from simulator to real QPUs",
    bandHardwareBody:
      "When an algorithm is ready, hand it off to real quantum processors through Amazon Braket. Every run shows a transparent cost estimate before you commit, and budget guardrails keep spending honest.",
    bandHardwareCta: "Read the hardware runbook",
    bandCurriculumKicker: "Curriculum",
    bandCurriculumTitle: "Learn by running real notebooks",
    bandCurriculumBody:
      "{{notebooks}} hands-on notebooks across {{sections}} sections take you from your first qubit to production hybrid quantum-classical jobs. Most run directly in your browser — no installation, no setup, just a free account.",
    bandCurriculumCta: "Browse the learning path",
    bandTutorKicker: "AI tutor",
    bandTutorTitle: "An AI tutor that knows exactly where you are",
    bandTutorBody:
      "Every lesson carries Ask the margin: press Cmd-K or Ctrl-K, ask what confuses you, and a Claude-powered tutor streams an answer grounded in the exact page you are reading — no tab-switching, no pasting context. Included free for every learner.",
    bandTutorCta: "Meet it inside any lesson",
    toolChallengesTitle: "Challenges that grade themselves",
    toolChallengesBody:
      "Lessons end with hands-on checks — predict a measurement, debug a circuit, estimate a QPU bill — graded instantly in your browser, so you know an idea stuck before you build on it.",
    toolReviewTitle: "Spaced-repetition review",
    toolReviewBody:
      "Key ideas become review cards automatically. A daily queue resurfaces each one right before you would forget it.",
    toolGlossaryTitle: "A glossary that teaches",
    toolGlossaryBody:
      "{{count}} terms with precise definitions, rendered math, and links back to the lessons where each idea is built.",
    accountEyebrow: "Your workspace",
    accountHeading: "Create a free account, keep everything in sync",
    accountBody:
      "One account carries your lesson progress, review cards, and saved circuits across devices — and opens the on-ramp to real quantum hardware when you are ready for it.",
    accountReassurance:
      "Email or Google. No credit card — the entire curriculum and simulator are free.",
    learningPath: "Learning Path",
    sectionsCount: {
      one: "{{count}} section",
      other: "{{count}} sections",
    },
    summaryFallback: "Hands-on lessons and exercises.",
    exploreSection: "Explore section",
    notebookCount: {
      one: "{{count}} notebook",
      other: "{{count}} notebooks",
    },
    glossaryEyebrow: "Reference",
    glossaryTitle: "Glossary",
    glossaryBody:
      "Look up any quantum term, A to Z — each linked to the lesson that teaches it.",
    glossaryCta: "Browse terms",
    glossaryAria: "Glossary, an A to Z reference of quantum terms",
    playgroundMockTitle: "Live editor",
    playgroundMockProbs: "Measurement probabilities",
    tutorMockTitle: "Ask the margin",
    tutorMockReading: "Reading: 03 — Quantum Algorithms",
    tutorMockQuestion: "Why does Grover's search only need about √N queries?",
    tutorMockAnswer:
      "Each Grover iteration rotates the state a fixed angle toward the marked item, so its amplitude — not just its probability — grows with every step. Amplitudes square into probabilities, which is where the quadratic speedup lives: about π/4·√N iterations instead of N/2 checks.",
  },
  // Card display titles + short blurbs for the welcome curriculum grid.
  // Full GUIDE.md prose stays English until Phase 2 content translation.
  sections: {
    "00-prereqs": {
      title: "Prerequisites: From Zero to Ready-for-Quantum",
      summary:
        "This is the on-ramp module. If you have no quantum background, start here. By the end of this module you will have the math, code, and intuition to read the rest of the curriculum.",
    },
    "01-foundations": {
      title: "Quantum Computing Foundations",
      summary:
        "Qubits, superposition, entanglement, and measurement — taught by running circuits, not by staring at equations alone.",
    },
    "02-hardware": {
      title: "Quantum Hardware on Amazon Braket",
      summary:
        "What a qubit physically is, how each machine trades speed against fidelity, and what QPU time actually costs before you spend a cent.",
    },
    "03-algorithms": {
      title: "Quantum Algorithms",
      summary:
        "The canon, hands-on: Deutsch-Jozsa, Grover, the quantum Fourier transform, and phase estimation — built gate by gate.",
    },
    "04-quantum-ml": {
      title: "Quantum Machine Learning",
      summary:
        "Variational circuits as models: encode data, train parameterized gates, and judge when a quantum model earns its keep.",
    },
    "05-quantum-chemistry": {
      title: "Quantum Chemistry & Biochemistry",
      summary:
        "Map molecular Hamiltonians onto qubits, run VQE for ground-state energies, and simulate real molecules with OpenFermion.",
    },
    "06-hybrid-jobs": {
      title: "Production Hybrid Quantum-Classical Jobs",
      summary:
        "From notebook to production: Braket Hybrid Jobs with priority QPU access, checkpointing, and cost controls.",
    },
  },
  // Per-section gate pitches (why make an account) — richer than card summaries.
  pitches: {
    "00-prereqs":
      "Every piece of math the curriculum uses, built from zero: complex numbers, vectors and matrices, probability, and the Python you need to drive it all. No physics degree assumed — finish this section and nothing later will feel like a leap.",
    "01-foundations":
      "Qubits, superposition, entanglement, and measurement — taught by running circuits, not by staring at equations. You will build your first Bell state in the browser and understand exactly why it cannot be explained classically.",
    "02-hardware":
      "What a qubit physically is: superconducting circuits, trapped ions, and neutral atoms, and how each trades speed against fidelity. You will explore Braket's real device catalog, see how noise shapes what each machine can run, and learn what QPU time actually costs before you ever spend a cent.",
    "03-algorithms":
      "The canon, hands-on: Deutsch-Jozsa, Grover search, the quantum Fourier transform, and phase estimation. Each notebook builds the algorithm gate by gate so you see where the quantum advantage comes from — and where it does not.",
    "04-quantum-ml":
      "Variational circuits as machine-learning models: encode data into quantum states, train parameterized gates with PennyLane, and judge honestly when a quantum model earns its keep against a classical baseline.",
    "05-quantum-chemistry":
      "The application quantum computers were invented for. Map molecular Hamiltonians onto qubits, run VQE to find ground-state energies, and simulate real molecules with OpenFermion — the largest section in the curriculum.",
    "06-hybrid-jobs":
      "From notebook to production: package quantum-classical workloads as Braket Hybrid Jobs with priority QPU access, checkpointing, and cost controls. This is how research code becomes something you can ship and re-run.",
  },
  common: {
    copy: "Copy",
    copied: "Copied",
    copyFailed: "Copy failed",
    close: "Close",
    closeDialog: "Close dialog",
    or: "or",
    loading: "Loading…",
    search: "Search",
    previous: "Previous",
    next: "Next",
    open: "Open",
    delete: "Delete",
    confirm: "Confirm?",
    save: "Save",
    cancel: "Cancel",
    signedIn: "Signed in",
    notFound: "Not Found",
  },
  theme: {
    switchToLight: "Switch to light theme",
    switchToDark: "Switch to dark theme",
  },
  sidebar: {
    learningPath: "Learning Path",
    toggleNav: "Toggle navigation",
    ofComplete: "{{completed}} of {{total}} complete",
    progressLabel: "Learning path progress",
    completed: "completed",
    navLabel: "Learning path",
    drawerLabel: "Learning path navigation",
  },
  lesson: {
    notebooks: "Notebooks",
    markComplete: "Mark as complete",
    onThisPage: "On this page",
    completionSaved:
      "Completion is saved on this device and counts toward your path progress.",
    runInBrowser: "Run in browser",
    runAria: "Run {{label}} in browser",
    viewOnGithub: "View {{label}} on GitHub",
    copyNotebookPath: "Copy notebook path",
    unavailableTitle:
      "Not available in the browser runtime — run this one locally with the full Python environment",
    unavailableSr:
      " — unavailable in the browser runtime; run it locally with the full Python environment",
    pyodide: "Pyodide",
  },
  gate: {
    sectionPreview: "Section preview",
    continueToSection: "Continue to section",
    createFreeAccount: "Create a free account",
    signIn: "Sign in",
    notebookLine: {
      one: "{{count}} hands-on notebook — {{runNote}}",
      other: "{{count}} hands-on notebooks — {{runNote}}",
    },
    runAllOne: "it runs right in your browser",
    runAllMany: "all run right in your browser",
    runSome: {
      one: "{{count}} runs right in your browser",
      other: "{{count}} run right in your browser",
    },
    runNone: "built to run in your own Braket environment",
  },
  auth: {
    signIn: "Sign in",
    signUp: "Create your account",
    confirmEmail: "Confirm your email",
    confirmBtn: "Confirm",
    forgotPassword: "Reset your password",
    resetPassword: "Set a new password",
    email: "Email",
    password: "Password",
    confirmPassword: "Confirm password",
    newPassword: "New password",
    confirmNewPassword: "Confirm new password",
    confirmationCode: "Confirmation code",
    resetCode: "Reset code",
    signingIn: "Signing in…",
    creating: "Creating…",
    confirming: "Confirming…",
    sending: "Sending…",
    saving: "Saving…",
    createAccount: "Create account",
    forgotLink: "Forgot password?",
    alreadyHaveAccount: "Already have an account? Sign in",
    enterCode: "Enter the 6-digit code we emailed to {{email}}.",
    yourAddress: "your address",
    resendCode: "Resend code",
    resendCodeCooldown: "Resend code ({{seconds}}s)",
    codeOnWay: "A new code is on its way.",
    sendResetCode: "Send reset code",
    backToSignIn: "Back to sign in",
    setNewPassword: "Set new password",
    continueWithGoogle: "Continue with Google",
    googleFailed: "Google sign-in didn't complete. Please try again.",
    checkingAccess: "Checking your access…",
    accountMenu: "Account",
    workspace: "Workspace",
    signOut: "Sign out",
    passwordsMatch: "Passwords match",
    passwordMeetsAll: "Password meets all requirements.",
    criterionMet: "met",
    criterionNotMet: "not met",
    pwLength: "At least 8 characters",
    pwUpper: "An uppercase letter",
    pwLower: "A lowercase letter",
    pwNumber: "A number",
    errors: {
      incorrectCredentials: "Incorrect email or password.",
      confirmEmailFirst:
        "Please confirm your email first — we just sent you a new code.",
      emailExists: "An account with that email already exists.",
      codeMismatch: "That code doesn't match. Check it and try again.",
      codeExpired: "That code has expired. Request a new one.",
      invalidPassword:
        "Password must be at least 8 characters with upper, lower, and a number.",
      tooManyAttempts: "Too many attempts. Please wait a moment and try again.",
      resetRequired:
        "You need to set a new password before signing in — request a reset code.",
      googleSessionActive:
        "You're already signed in with Google. Reload this page to continue.",
      generic: "Something went wrong. Please try again.",
    },
  },
  deleteAccount: {
    ariaLabel: "Delete account",
    title: "Delete account",
    intro: "This permanently removes:",
    itemProgress: "your synced progress on the server (including your email address)",
    itemPrefs: "your email reminder preference",
    itemAccount: "your account and sign-in",
    itemLocal: "this device's local copy of your progress",
    confirmLabel: "Type the word below to confirm:",
    noUndo: "There is no undo and no recovery period.",
    blurb: "Permanently removes your account and all data. Asks for confirmation first.",
    deleting: "Deleting…",
    submit: "Delete my account",
    partialPrefs:
      "Your synced progress was deleted, but your email preference could not be.",
    prefsFailed: "Your email preference could not be deleted.",
    partialAccount:
      "Your server data was deleted, but the account itself could not be deleted.",
    accountFailed: "The account could not be deleted.",
    tryAgain: " Try again.",
  },
  tutor: {
    ask: "Ask",
    asking: "Asking…",
    thinking: "Thinking…",
    answerReady: "Answer ready",
    title: "Ask the margin",
    ariaAsk: "Ask about this lesson",
    ariaDialog: "Lesson tutor",
    ariaClose: "Close tutor",
    groundedIn: "Grounded in:",
    emptyHint:
      "Ask anything about this lesson. I answer only from the lesson text and will nudge you with a question before handing over the full answer.",
    questionLabel: "Your question",
    placeholder: "e.g. why does the Z-string only act on the lower modes?",
    enterHint: "Enter to send, Shift+Enter for a new line",
    rateLimited: "Too many questions in a short window — give it a minute and try again.",
    unavailable: "The tutor is unavailable right now — please try again shortly.",
    couldNotAnswer: "The tutor could not answer that request — please try again.",
    hitError: "The tutor hit an error. Please try again.",
    noAnswer: "The tutor did not send an answer — please try again.",
    stopped: "The tutor stopped responding — please try again.",
    unreachable: "Could not reach the tutor — check your connection.",
    modelLabel: "Tutor model",
    // "included" rather than "0 credits": a zero beside a currency-ish noun
    // reads as a billing fault, when in fact it is the free tier working.
    costCredits: "{{credits}} credits",
    costIncluded: "included",
  },
  glossaryUi: {
    searchLabel: "Search glossary terms",
    searchPlaceholder: "Search terms...",
    jumpToLetter: "Jump to letter",
    jumpTo: "Jump to {{letter}}",
    termCount: {
      one: "{{count}} term",
      other: "{{count}} terms",
    },
    noMatch: "No terms match \"{{query}}\".",
    copyLink: "Copy link",
    copyLinkAria: "Copy link to this term",
    seeAlso: "See also",
    short: {
      "00-prereqs": "Prerequisites",
      "01-foundations": "Foundations",
      "02-hardware": "Hardware",
      "03-algorithms": "Algorithms",
      "04-quantum-ml": "Quantum ML",
      "05-quantum-chemistry": "Chemistry",
      "06-hybrid-jobs": "Hybrid Jobs",
    },
    pageTitle: "Glossary",
    pageBody:
      "An A–Z reference of quantum computing terms, from qubits and gates to VQE and QAOA, each linked to the lesson that teaches it.",
    workspaceCta: "Open your workspace",
    allTerms: "All terms",
    moreIn: "More in {{section}}",
  },
  workspaceUi: {
    title: "Workspace",
    loading: "Loading your workspace",
    localOnly: "This device only — progress is stored locally",
    syncFailed: "Sync failed",
    notYetSynced: "Not yet synced",
    curriculum: "Curriculum",
    theLab: "The lab",
    sectionGroup: "Curriculum section",
    skillsRetention: "Skills in proven retention",
    skillsRetentionSub: "the mastery you can't cram",
    skillsRetentionSr: "skills in proven retention",
    keptSharp: "kept sharp this week",
    withinReach: "Within reach",
    mastery: "Mastery",
    consistency: "Consistency",
    hardware: "Hardware",
    allCredentials: "All {{group}} credentials earned.",
    allCredentialsLink: "All {{n}} credentials →",
    rungProgress: "{{current}} of {{target}} {{unit}}",
    // Plural PAIRS even though English does not inflect here ("1 to go" / "3 to go").
    // resolveLeaf() picks a form per dictionary independently, so a plain string on
    // this side would still render — but es.ts's verb DOES inflect ("falta 1" /
    // "faltan 3"), and these two keys shipped as plain strings in BOTH dictionaries,
    // which is how "faltan 1" reached every track (mastery 4→5, consistency 3→4,
    // hardware 2→3 runs all pass through distance === 1). Matching the shape is what
    // stops the next editor copying an uninflected English leaf into a locale that
    // needs the branch. Same deliberate idiom as credentialsUi.consistencyEvidence.
    distanceToGo: {
      one: "{{distance}} to go",
      other: "{{distance}} to go",
    },
    distanceUnitToGo: {
      one: "{{distance}} {{unit}} to go",
      other: "{{distance}} {{unit}} to go",
    },
    // Unit nouns for the Within-reach readouts. Plural pairs, because each render
    // site agrees the noun with a DIFFERENT number (the target in the progress
    // readout, the distance in the "to go" line) — one baked English suffix could
    // not serve both, and Spanish agreement makes the difference visible.
    unitInRetention: "in retention",
    unitRun: {
      one: "run",
      other: "runs",
    },
    unitShot: {
      one: "shot",
      other: "shots",
    },
    checkingHardware: "Checking your hardware record…",
    hardwareUnavailable: "Hardware record unavailable.",
    allHardware: "All hardware credentials earned.",
    fits: "fits",
    outOfAllowance: "out of allowance",
    interval: "Interval",
    skills: "Skills",
    state: "State",
    maturing: "maturing",
    retained: "retained",
  },
  playgroundUi: {
    title: "Playground",
    compose: "Compose",
    state: "State",
    hardware: "Hardware",
    sampling: "Sampling",
    saved: "Saved circuits",
    circuitName: "Circuit name",
    copyShare: "Copy share link",
    copyQasm: "Copy OpenQASM",
    openQasm: "OpenQASM 3.0",
  },
  runbookUi: {
    title: "Runbook",
    body:
      "Your mastery ledger: skills carried into proven spaced-repetition retention, your weekly streak, and a contribution graph of every day you practiced.",
    longestStreak: "Longest streak",
    week: {
      one: "week",
      other: "weeks",
    },
    activeThisWeek: "Active this week",
    modulesComplete: "Modules complete",
    dueToReview: "Due to review",
    inactive: "Inactive",
    active: "Active",
    skillsRetention: "Skills in proven retention",
    emptyTitle: "Your Runbook is empty — for now.",
    emptyBody:
      "Grade your first Rep on a lesson and it lands here. Every day you practice marks the graph; every skill you keep sharp raises the count above it.",
    startLesson: "Start a lesson",
    goToReview: "Go to review",
  },
  credentialsUi: {
    title: "Credentials",
    pageTitle: "Your credentials",
    pageBody:
      "Each medal is earned, not awarded — struck from work you can point to. Mastery medals reflect what you hold in retention right now, so they mean exactly what they say.",
    // The earned count carries its own emphasis span, so it stays OUTSIDE this
    // template. Both locales lead with the number, so no word order is lost —
    // a locale that put the count last would need the whole sentence in the key.
    earnedOfTotal: "of {{total}} earned",
    completion: "Completion",
    mastery: "Mastery",
    consistency: "Consistency",
    hardware: "Hardware",
    completionBlurb: "Modules carried to the end.",
    masteryBlurb: "Skills held in proven, spaced-repetition retention.",
    consistencyBlurb: "Weeks of showing up, unbroken.",
    hardwareBlurb:
      "Circuits run on a real quantum computer. The platform pays Amazon Braket for every one of these runs.",
    // The four medal states. Each is the medal's own chip WORD, so every one of
    // them reaches a screen reader — translating three and leaving one English
    // would break exactly that guarantee.
    earned: "Earned",
    locked: "Locked",
    outOfReach: "Out of reach",
    unverified: "Unverified",
    outOfReachDetail: "{{requirement}} — out of reach on your remaining sponsored budget.",
    // The lab record. The two counts keep their emphasis spans, so the line is
    // assembled from a label, two plural clauses, and the device tail — the same
    // order in both locales.
    recordLabel: "Your record:",
    recordRuns: {
      one: "{{n}} completed run",
      other: "{{n}} completed runs",
    },
    recordShots: {
      one: "{{n}} shot",
      other: "{{n}} shots",
    },
    recordDevice: "on IQM Garnet.",
    allowanceLead: "All three fit inside the sponsored allowance:",
    allowancePlan: "{{runs}} runs totalling {{shots}} shots — {{cost}}",
    allowanceTail:
      "The allowance is one-time and does not refill, so how you spend it decides which of these you can still earn.",
    runOnGarnet: "Run on IQM Garnet",
    unverifiedNote:
      "Couldn't verify your hardware record — these medals show as unverified, not locked. Reload to retry.",
    // The SAME medal state (unverified — the record is genuinely unknown, so nothing
    // may be shown as earned or as locked), with the one explanation a throttle
    // licenses. The generic note above ends "Reload to retry", which under a rate
    // limit is advice that makes the situation worse: an immediate reload is another
    // blocked request. This is also the sentence that stops one throttle reading as
    // three different diagnoses on /workspace — it agrees with qpuUi.rateLimitedService.
    unverifiedThrottledNote:
      "Too many requests in a short window, so your hardware record couldn't be checked — these medals show as unverified, not locked. This is a rate limit, not an outage; wait a minute before reloading.",
    // Tier DISPLAY titles, keyed by group (and metric) + threshold. The tier
    // constants in lib/credentials.ts keep their English `title` as stable
    // identity — HARDWARE_TIERS is deep-equal locked to the cross-package fixture
    // lambda/qpu/__fixtures__/hardware-ladder.json — so a `titleKey` field on the
    // tier objects would break that lock. The key is derived from the tier instead.
    tiers: {
      mastery: {
        "1": "First retention",
        "5": "Practiced",
        "15": "Fluent",
        "30": "Deep",
        "50": "Command",
      },
      consistency: {
        "4": "Consistent",
        "12": "Committed",
        "26": "Relentless",
      },
      hardware: {
        runs: {
          "1": "Ran on real hardware",
          "3": "Run series",
        },
        shots: {
          "1000": "Deep sample",
        },
      },
    },
    completionRequirement: "Complete the {{title}} module",
    completionEvidence: "Completed the {{title}} module",
    masteryRequirement: {
      one: "Hold {{n}} skill in proven retention",
      other: "Hold {{n}} skills in proven retention",
    },
    masteryEvidence: {
      one: "{{n}} skill in proven retention",
      other: "{{n}} skills in proven retention",
    },
    consistencyRequirement: {
      one: "Practice {{n}} week in a row",
      other: "Practice {{n}} weeks in a row",
    },
    consistencyEvidence: {
      // English does not inflect here; Spanish does ("semana"/"semanas"), and the
      // plural pair is what carries that across.
      one: "A {{n}}-week streak",
      other: "A {{n}}-week streak",
    },
    // The hardware requirement grammar BRANCHES on the tier's metric: a shots tier
    // rendered through the runs template would read "Complete 1000 runs on real
    // hardware". Two separate keys keep that structural guarantee inside the
    // dictionary too — no locale can collapse them back into one sentence.
    hardwareRunsRequirement: {
      one: "Complete {{n}} run on real hardware",
      other: "Complete {{n}} runs on real hardware",
    },
    hardwareShotsRequirement: {
      one: "Run {{n}} total shot on real hardware",
      other: "Run {{n}} total shots on real hardware",
    },
    hardwareRunsEvidence: {
      one: "{{n}} completed run on IQM Garnet",
      other: "{{n}} completed runs on IQM Garnet",
    },
    hardwareShotsEvidence: {
      one: "{{n}} shot across {{runs}}",
      other: "{{n}} shots across {{runs}}",
    },
  },
  // The real-hardware surface. Only the sentences some branch actually renders live
  // here: the rest of qpu-submit-panel.tsx is still English prose (see the panel's own
  // note), and adding keys nothing reads would be dead dictionary.
  qpuUi: {
    // Two sentences, not one, because the two failures license different claims.
    // A blocked SUBMIT provably spent nothing (the edge rejects before the Lambda
    // reserves), so it says so; a blocked BUDGET READ spent nothing either but has
    // no run to talk about, and its only job is to not read as an outage.
    rateLimitedSubmit:
      "Too many requests in a short window — no budget was spent. Wait a minute and submit again.",
    rateLimitedService:
      "Too many requests in a short window. This is a rate limit, not an outage — wait a minute and try again.",
    // The ladder's own null-record branch (LadderProgress). It sat in the panel as an
    // English module constant while Within-reach — the panel NEXT TO IT on /workspace —
    // said the same thing from workspaceUi.hardwareUnavailable, so a Spanish learner
    // read one fact in two languages side by side. Not a reuse of that key: this is the
    // money surface, and the two clauses the short line drops (the completed runs are
    // safe, and the retry) are exactly what a learner needs where medals are spent.
    recordUnavailable:
      "Your hardware record is unavailable right now, so medal progress can't be shown. Your completed runs are unaffected — reload to retry.",
    // Credit metering (wallet-funded runs beyond the sponsored allowance).
    // "no credits were taken" is deliberate: the reservation was refused before
    // any debit, and the panel's copy contract bans unqualified "charged".
    walletBalance: "Wallet: {{credits}} credits",
    insufficientCredits:
      "This run needs {{credits}} credits and your wallet doesn't cover it. Nothing was submitted and no credits were taken — top up on the Pricing page to run on hardware.",
  },
  pricingUi: {
    title: "Pricing",
    eyebrow: "Pricing",
    headlineBefore: "The learning is",
    headlineFree: "free",
    // FUTURE TENSE ON PURPOSE. Nothing is metered yet: the tutor answers free and
    // curriculum hardware runs are platform-sponsored (lambda/qpu LIFETIME_CAP_MICROS).
    // This said "is metered" through five rounds of copy audit — the largest text on
    // the page asserting the one thing the page was being corrected for, invisible
    // because the suite pinned the exact string. Flip back to "is metered" in the same
    // commit that lands wallet billing, not before.
    headlineAfter: ". The metal will be metered.",
    heroBody:
      "The entire curriculum, simulator, and playground are free with a free account — forever. One credit wallet will meter what actually costs real money: AI tutoring and paid cloud compute — real quantum hardware and the managed simulators in the rate table below. None of it is metered yet: today the tutor is free to try and curriculum hardware runs are platform-sponsored. One credit is one cent, always.",
    creditPeg: "1 credit = $0.01",
    topUpFrom: "Top up from {{amount}}",
    principleLearning: "Learning is the product",
    principleLearningBody:
      "Lessons, notebooks, and the circuit simulator run in your browser, so we can keep them free for everyone, forever. The curriculum never moves behind the wallet.",
    principleWallet: "One wallet, pegged to the dollar",
    principleWalletBody:
      "One credit is one cent — always. Plans include credits monthly, and subscribers can top up from {{min}}; purchased credits never expire, and nothing debits them yet.",
    principleLine: "A clear line",
    // The line has to match the rate table on the same page: SIMULATOR_RATES publishes
    // SV1 and DM1 at credits per minute, so a two-item list closed by an absolute
    // "nothing else will ever cost credits" is a free promise this page's own table
    // contradicts. Name all three metered things, and keep the free side concrete.
    principleLineBody:
      "Credits will meter paid compute and paid tutoring: questions to the AI tutor, runs on real quantum hardware, and minutes on the managed cloud simulators — every rate published below. The curriculum, the browser simulator, and the playground stay free. Today none of the three is metered yet.",
    tiersHeading: "Three ways to fund the wallet",
    tiersIntro:
      "Plus and Pro include a fixed number of credits every month — never an all-you-can-eat plan, so the deal stays honest in both directions. Run out early and you can top up any whole-dollar amount at the same one-cent peg. Top-ups extend a plan rather than replace one.",
    bestForRegulars: "Best for regulars",
    forever: "forever",
    perMonth: "/ month",
    creditsEveryMonth: "{{credits}} every month",
    getTier: "Get {{name}}",
    startFreeWhileWait: "Start free while you wait",
    launchingSoon: "Launching soon",
    signUpFree: "Sign up free",
    signUpSoon: "Sign-up coming soon",
    launchPricing: "Before you buy:",
    launchPricingBody:
      " wallets are live, but nothing draws them down yet. The in-lesson tutor is free to try and curriculum hardware runs stay platform-sponsored, so a balance you buy today buys nothing today. Credits never expire and start metering when tutor and hardware billing ship.",
    earlyAccess: "Early access:",
    earlyAccessBody:
      " billing has not launched yet — these are launch prices. Today the tutor is free to try, and hardware runs inside the curriculum are sponsored. When wallets go live, you fund your own from a top-up or a plan.",
    estimatorHeading: "Know the number before you run",
    estimatorIntro:
      "No quantum platform should surprise you with a bill. Price any published backend and any tutor habit here. Before a real hardware run, the workspace shows you its cost and makes you approve it.",
    ratesHeading: "Every rate, published",
    ratesAsOf: "{{date}} rates",
    ratesIntro:
      "The full price list — no enterprise-sales veil. These are the rates metering will charge: QPU runs add a flat {{fee}}-credit task fee, and managed simulators bill by the minute. The browser simulator is free and always will be.",
    aiTutor: "AI tutor",
    tutorTypical:
      "Typical credits per question once tutor metering ships. Today every question is answered free by Claude Haiku, and the model is not selectable.",
    quantumHardware: "Quantum hardware",
    hardwarePerShotPlusFee: "Credits per shot, plus the {{fee}}-credit task fee.",
    shotRun: "{{n}}-shot run",
    creditsPerMinute: "{{n}} credits / minute",
    model: "Model",
    credits: "Credits",
    backend: "Backend",
    perShot: "Per shot",
    faqHeading: "Fair questions",
    faqLearningQ: "Is learning really free forever?",
    faqLearningA:
      "Yes. The full curriculum, the browser simulator, the playground, the glossary, and spaced-repetition review are free with a free account — email or Google, no credit card. That is the product, not a trial.",
    faqCreditsQ: "What do credits buy?",
    faqCreditsA:
      "Nothing yet — that is the honest answer. No part of the platform debits your wallet today: the AI tutor is free to try and curriculum hardware runs are platform-sponsored. When metering ships, credits will buy exactly two things: AI tutor questions and real quantum compute (QPU runs and managed cloud simulators). One credit equals one cent. Hardware runs already show you the exact cost and make you approve it before anything executes.",
    faqExpireQ: "Do credits expire?",
    faqExpireA:
      "Purchased credits never expire. Monthly Plus and Pro credits roll over for as long as the subscription is active.",
    faqBackendsQ: "Why do backends cost such different amounts?",
    faqBackendsA:
      "Because the machines really do. A trapped-ion shot on IonQ lists at roughly 180 times a superconducting shot on Rigetti. We publish every backend's rate so the price of the physics is never a mystery. Today the curriculum's sponsored runs all go to IQM Garnet; choosing your own backend arrives with wallet metering. Before one of those sponsored runs executes, the workspace quotes it in AWS dollars from its own table and waits for your approval.",
    faqProviderQ: "What happens when a provider changes its prices?",
    faqProviderA:
      "Hardware rates track the providers' published price sheets (currently the {{date}} revision). Nothing on this page is fetched from a provider: these credit rates are compiled into the site, and the pre-flight check before a hardware run reads its own separate table of AWS dollar rates, also compiled in. A reprice reaches either table only through a new release — which is what the revision date on the rate table records.",
    faqBuyQ: "How do I buy credits?",
    faqBuyA:
      "Right on this page: pick a plan, or top up any whole-dollar amount from $5 to $500 — checkout is a hosted Stripe page, and credits land in your wallet the moment payment completes. Purchased credits never expire — and nothing draws them down yet, so a balance today is a balance waiting for metering to ship.",
    faqWhenQ: "When can I buy credits?",
    faqWhenA:
      "Billing is launching soon; the prices on this page are launch pricing. Until then, the tutor is free to try and hardware runs inside the curriculum are sponsored — create your free account now so you are ready the moment wallets go live.",
    ctaHeading: "Start learning today. The wallet can wait.",
    ctaBody:
      "Everything you need to learn quantum computing is already free — just a free account. Email or Google, no credit card.",
    free: "Free",
    plan: "plan",
    buyCredits: "Buy credits",
    buyCreditsAmount: "Buy {{amount}}",
    starting: "Starting…",
    thisRun: "This run",
    perMonthLabel: "Per month",
    perMoSuffix: " / mo",
    tutorModel: "Tutor model to price",
    modelToPrice: "Model to price",
    // Renders directly above the model chips: the chips are a forecasting control,
    // not an entitlement you can buy. The tutor takes no model parameter today.
    modelNotSelectableYet:
      "Not selectable yet — every question today is answered free by Claude Haiku. Price any model here to see what metering would cost.",
    presets: "Presets",
    priceHardware: "Price a hardware run",
    // A forecast, and only a forecast. This pane prices eight backends in credits;
    // exactly one of them (IQM Garnet) accepts a submission today, and its pre-flight
    // quotes AWS dollars from a different table, so it does NOT show this number.
    // Claiming "the same estimate appears before every real submission" was false twice
    // over. The approval gate is real and stays.
    priceHardwareBody:
      "A forecast of metered pricing, not a charge. Only IQM Garnet accepts submissions today, and its pre-flight quotes that sponsored run in dollars at the AWS list rate — not the credit figure shown here. Nothing runs until you approve the number you are shown there.",
    shots: "Shots",
    shotsValue: "{{n}} shots",
    priceTutorMonth: "Price a month of tutoring",
    priceTutorBody:
      "Typical questions — long derivations cost proportionally more. This is a forecast of metered pricing; tutoring is not charged today.",
    questionsPerMonth: "Questions per month",
    questionsValue: "{{n}} questions per month",
    perShotPlusTask:
      "{{perShot}} credits per shot + {{fee}} credits per task.",
    aboutCreditsPerQ: {
      one: "{{model}} would cost about {{count}} credit per question once metering ships. {{note}}",
      other: "{{model}} would cost about {{count}} credits per question once metering ships. {{note}}",
    },
    topUpTitle: "Top up any amount",
    topUpBody:
      "{{credits}} per dollar — the $0.01 peg, always. Whole dollars from ${{min}} to ${{max}}, for subscribers who run out mid-month.",
    amountPresets: "Amount presets",
    customAmount: "Custom amount (USD)",
    invalidAmount: "Enter a whole dollar amount from ${{min}} to ${{max}}.",
    topUpFootnote:
      "Top-ups require an active plan. Purchased credits never expire, and you will see the exact amount on the Stripe checkout page before paying.",
    checkoutFailed: "Could not start checkout. Please try again.",
    // Tier marketing (names Free/Plus/Pro stay English product names). Every bullet
    // here must be true of the deployed system TODAY — the tier cards are the point of
    // sale, so a roadmap item a buyer could read as included belongs nowhere in them.
    // The not-yet-metered status is carried by launchPricingBody/earlyAccessBody, which
    // render directly ABOVE the cards in both billing states — a buyer meets it on the
    // way to every purchase control, not after all three of them.
    freeTagline: "The entire learning platform. No card, no clock.",
    freeFootnote: "Free forever. Learning never moves behind the wallet.",
    freeF0: "Full curriculum — every section, every notebook",
    freeF1: "Unlimited browser simulation — circuits run on your machine",
    freeF2: "Playground, glossary, spaced-repetition review",
    freeF3: "Progress and saved circuits synced across devices",
    freeF4: "The AI tutor is free to try, and curriculum hardware runs are platform-sponsored",
    plusTagline: "Monthly credits, included with your subscription.",
    plusFootnote: "Cancel anytime. Purchased credits never expire.",
    plusF0: "Everything in Free",
    // No "bonus over pay-as-you-go" claim: under the 2026-08 pricing the monthly grant is
    // deliberately worth less than the sticker price, so that framing is false. State the
    // grant plainly and let the tier's model access carry the value.
    plusF1: "1,900 credits every month",
    plusF2: "Credits roll over while you are subscribed",
    proTagline: "The largest monthly credit bundle.",
    proFootnote: "For the heaviest users. Cancel anytime; credits never expire.",
    proF0: "Everything in Plus",
    proF1: "6,500 credits every month — a 10% bonus over pay-as-you-go",
    // Hardware technology descriptors for rate table
    techSuperconducting108: "Superconducting, 108 qubits",
    techSuperconducting: "Superconducting",
    techNeutralAtom: "Neutral-atom analog",
    techTrappedIon: "Trapped-ion",
    simSv1: "State-vector simulator, up to 34 qubits",
    simDm1: "Density-matrix (noise) simulator, up to 17 qubits",
    tutorNoteHaiku: "Fast and sharp — the everyday tutor.",
    tutorNoteSonnet: "Deeper reasoning for tougher derivations.",
    tutorNoteOpus: "Full-strength reasoning, circuit review.",
    tutorNoteFable: "The frontier model, for the hardest questions.",
  },
  privacyUi: {
    title: "Privacy",
    eyebrow: "Policy",
    lead:
      "The short version: your learning progress lives in your browser. If you create an account, we store your email address and a copy of that progress so it can follow you across devices — and you can delete all of it, permanently, yourself.",
    whatWeStore: "What we store",
    storeLocal:
      "Without an account, everything — lesson progress, review cards, widget state — is stored only in your browser's local storage. Nothing identifies you and nothing leaves your device except the requests that fetch the site itself.",
    storeCircuits:
      "Circuits you save in the playground follow the same rule: they live in your browser's local storage and, if you sign in, are included in the synced progress snapshot described below.",
    storeServerIntro:
      "If you create an account and use sync, we store on our servers (AWS, us-east-2 region):",
    storeEmail:
      "your email address and sign-in credentials, in Amazon Cognito (passwords are handled entirely by Cognito; we never see them)",
    storeProgress:
      "a snapshot of your learning progress (sections completed, review-card scheduling state), in Amazon DynamoDB, keyed to your account",
    storePrefs:
      "your review-reminder email preference — off unless you turn it on — and, if you do, the date we last emailed you",
    storeHardware:
      "if you run a circuit on real quantum hardware, a record of that run (device, shot count, cost, and a hash of the circuit) to enforce the sponsored hardware budget",
    storeTutor:
      "If you ask the lesson tutor a question, the question and the surrounding lesson context are sent to our tutor service (AWS Bedrock, us-east-2) to generate the answer.",
    whatWeDont: "What we don't collect",
    noAnalytics:
      "No analytics or tracking scripts — none exist anywhere on this site.",
    noAds: "No advertising, and no data is sold or shared for advertising.",
    noCookies:
      "No tracking cookies. Sign-in tokens are kept in your browser's per-tab session storage.",
    noThirdParty:
      "No third-party fonts, CDNs, or beacons — the site and its in-browser Python runtime are served from our own origin. (One exception: if our copy of the Python runtime fails to load, the browser falls back to fetching it from the public jsDelivr CDN.)",
    emails: "Emails",
    emailsBody:
      "Review-reminder emails are strictly opt-in: the default is off, and nothing is sent unless you enable them in your workspace. When enabled, you get at most one email every 7 days, and only when you actually have review cards due. Every email contains a one-click unsubscribe, and you can turn reminders off in your workspace at any time.",
    retention: "Retention and deletion",
    retentionDelete:
      "Server-side data is kept until you delete it. Your workspace has a \"Delete account\" control that permanently removes your synced progress, your email preference, your account itself, and this device's local copy — in that order, and it stops and tells you if any step fails. There is no undo and no recovery period.",
    retentionLogs:
      "Operational service logs (used for debugging and abuse prevention) are retained in AWS CloudWatch for 30 days and then deleted automatically.",
    contact: "Contact",
    contactBody: "Questions about this policy or your data:",
    lastUpdated: "Last updated {{date}}.",
  },
};
