import type { TranslationDict } from "../types";

/**
 * Spanish (es) dictionary — Phase 1 UI strings.
 * Completeness test requires every en.ts key to exist here.
 */
export const es: TranslationDict = {
  nav: {
    brand: "Quantum Learner",
    playground: "Playground",
    runbook: "Runbook",
    credentials: "Credenciales",
    pricing: "Precios",
    review: "Repasar",
    reviewDue: {
      one: "Repasar, {{count}} tarjeta pendiente",
      other: "Repasar, {{count}} tarjetas pendientes",
    },
    glossary: "Glosario",
    privacy: "Privacidad",
    github: "GitHub",
    skipToContent: "Saltar al contenido",
    signIn: "Iniciar sesión",
    language: "Idioma",
    languageMenu: "Elegir idioma",
  },
  footer: {
    tagline: "{{site}} — aprender computación cuántica con Amazon Braket.",
    builtWith: "Altivum Inc. — construido con Amazon Braket.",
    ariaLabel: "Pie de página",
  },
  lang: {
    en: "English",
    es: "Español",
  },
  schedule: {
    tomorrow: "mañana",
    inDays: {
      one: "en {{count}} día",
      other: "en {{count}} días",
    },
  },
  review: {
    eyebrow: "Repetición espaciada",
    heading: "Repasar",
    body:
      "Las tarjetas que has estudiado reaparecen aquí exactamente cuando estás a punto de olvidarlas. Unos minutos ahora mantienen fresco todo el currículo.",
    dueCount: {
      one: "{{count}} pendiente ahora",
      other: "{{count}} pendientes ahora",
    },
    trackedCount: {
      one: "{{count}} tarjeta seguida",
      other: "{{count}} tarjetas seguidas",
    },
    sessionCompleteTitle: "Sesión completa — todas las tarjetas pendientes repasadas.",
    sessionCompleteSub:
      "Las nuevas reseñas aparecerán aquí a medida que sus horarios venzan.",
    emptyNoCards: "Sin tarjetas aún",
    emptyUpToDate: "Nada pendiente — estás al día",
    emptyNoCardsHint:
      "Trabaja una lección y califica sus tarjetas de recuerdo para empezar a armar un horario de repaso.",
    emptyUpToDateHint:
      "Vuelve cuando haya más tarjetas pendientes, o sigue leyendo nuevas lecciones.",
    dueLabel: "Pendiente",
    reviewedLabel: "Repasado",
    itemSr: "Elemento de repaso {{i}} de {{n}} — {{kind}}{{done}}",
    itemReviewedSuffix: ", repasado",
    recallKind: "Recordar",
    stuckSummary: "¿Atascado? Muestra una respuesta correcta",
    kindLabels: {
      challenge: "Reto de circuito",
      predict: "Predicción",
      bloch: "Objetivo Bloch",
      cost: "Estimación de costo",
      debug: "Corregir el circuito",
      expect: "Valor esperado",
      unknown: "Otro",
    },
  },
  reviewCard: {
    eyebrow: "Recordar",
    inARow: {
      one: "{{count}} seguida",
      other: "{{count}} seguidas",
    },
    showAnswer: "Mostrar respuesta",
    answerLabel: "Respuesta",
    howWell: "¿Qué tan bien lo recordaste?",
    again: "De nuevo",
    hard: "Difícil",
    good: "Bien",
    easy: "Fácil",
    outcomeNoop:
      "Horario sin cambios — esta tarjeta ya fue repasada y aún no está pendiente.",
    outcomeScheduled: "Próximo repaso {{phrase}}.",
  },
  quiz: {
    eyebrow: "Autoevaluación",
    showAll: "Mostrar todas las respuestas",
    hideAll: "Ocultar todas las respuestas",
    hint: "Pista",
    hideHint: "Ocultar pista",
    showAnswer: "Mostrar respuesta",
    hideAnswer: "Ocultar respuesta",
    answerLabel: "Respuesta",
    hintLabel: "Pista",
    howWell: "¿Qué tan bien lo recordaste?",
    again: "De nuevo",
    hard: "Difícil",
    good: "Bien",
    easy: "Fácil",
    outcomeNoop:
      "Horario sin cambios — esta tarjeta ya fue repasada y aún no está pendiente.",
    outcomeScheduled: "Próximo repaso {{phrase}}.",
    parseError: "error al analizar el cuestionario",
  },
  workspace: {
    valveDueNow: "Pendiente ahora",
    valveDueReps: {
      one: "{{count}} ejercicio pendiente hoy",
      other: "{{count}} ejercicios pendientes hoy",
    },
    valveRetainedOne: {
      one: "{{count}} es una habilidad retenida",
      other: "{{count}} son habilidades retenidas",
    },
    valveRetainedWarning:
      "— un \"De nuevo\" restablece {{them}} a un intervalo de 1 día.",
    valveThemOne: "lo",
    valveThemOther: "los",
    ctaReview: {
      one: "Repasar {{count}} tarjeta",
      other: "Repasar {{count}} tarjetas",
    },
    ctaStart: "Comenzar Prerrequisitos",
    ctaContinue: "Continuar {{title}}",
    ctaLab: "Abrir el laboratorio",
    headlineNoTracked: "Aún no has calificado un ejercicio.",
    headlineNothingDue: "Nada está pendiente ahora mismo.",
    headlineNextDue: {
      one: "Nada pendiente. Próximo ejercicio en {{count}} día.",
      other: "Nada pendiente. Próximo ejercicio en {{count}} días.",
    },
  },
};
