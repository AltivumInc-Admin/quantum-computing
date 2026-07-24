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
};
