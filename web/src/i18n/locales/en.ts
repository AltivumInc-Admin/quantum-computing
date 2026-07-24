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
    tutorMockTitle: "Ask the margin",
    tutorMockReading: "Reading: 03 — Quantum Algorithms",
    tutorMockQuestion: "Why does Grover's search only need about √N queries?",
    tutorMockAnswer:
      "Each Grover iteration rotates the state a fixed angle toward the marked item, so its amplitude — not just its probability — grows with every step. Amplitudes square into probabilities, which is where the quadratic speedup lives: about π/4·√N iterations instead of N/2 checks.",
  },
};
