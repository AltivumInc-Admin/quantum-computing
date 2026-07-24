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
  home: {
    eyebrow: "Aprende computación cuántica, de forma práctica",
    headlineLead: "Domina la computación cuántica",
    headlineDim: "desde los fundamentos",
    subtitle:
      "Desde los fundamentos de circuitos hasta cargas híbridas de producción — un playground en vivo, hardware cuántico real y un tutor de IA al margen. Gratis, en tu navegador.",
    signUpFree: "Regístrate gratis",
    signIn: "Iniciar sesión",
    signUpSoon: "Registro próximamente",
    exploreCurriculum: "Explorar el currículo",
    poweredBy: "Impulsado por",
    scrollToCurriculum: "Ir al currículo",
    scrollDown: "Desplazarse hacia abajo",
    quantumHorizons: "Horizontes cuánticos",
    statSections: "secciones del currículo",
    statNotebooks: "cuadernos prácticos",
    statGates: "puertas en el playground en vivo",
    notebooksCount: {
      one: "{{count}} cuaderno",
      other: "{{count}} cuadernos",
    },
    nodeFoundations: "Fundamentos",
    nodeHardware: "Hardware",
    nodeAlgorithms: "Algoritmos",
    nodeChemistry: "Química",
    featuresHeading: "Un lugar para aprender, construir y ejecutar",
    bandPlaygroundKicker: "Playground",
    bandPlaygroundTitle: "Diseña circuitos y ve el estado cuántico al instante",
    bandPlaygroundBody:
      "Compón puertas en un editor en vivo y observa cómo se redibujan amplitudes, probabilidades y un diagrama de circuito estilo publicación en cada tecla. Guarda circuitos localmente, compártelos por URL y exporta OpenQASM estándar cuando quieras salir.",
    bandPlaygroundCta: "Abrir el playground",
    bandHardwareKicker: "Hardware real",
    bandHardwareTitle: "Pasa del simulador a QPUs reales",
    bandHardwareBody:
      "Cuando un algoritmo esté listo, envíalo a procesadores cuánticos reales a través de Amazon Braket. Cada ejecución muestra una estimación de costo transparente antes de confirmar, y los límites de presupuesto mantienen el gasto honesto.",
    bandHardwareCta: "Leer el runbook de hardware",
    bandCurriculumKicker: "Currículo",
    bandCurriculumTitle: "Aprende ejecutando cuadernos reales",
    bandCurriculumBody:
      "{{notebooks}} cuadernos prácticos en {{sections}} secciones te llevan desde tu primer cúbit hasta trabajos híbridos cuántico-clásicos de producción. La mayoría se ejecuta en el navegador — sin instalación, sin configuración, solo una cuenta gratuita.",
    bandCurriculumCta: "Explorar la ruta de aprendizaje",
    bandTutorKicker: "Tutor de IA",
    bandTutorTitle: "Un tutor de IA que sabe exactamente dónde estás",
    bandTutorBody:
      "Cada lección incluye Pregunta al margen: pulsa Cmd-K o Ctrl-K, pregunta lo que te confunde y un tutor con Claude transmite una respuesta anclada a la página exacta que lees — sin cambiar de pestaña ni pegar contexto. Incluido gratis para cada aprendiz.",
    bandTutorCta: "Conócelo dentro de cualquier lección",
    toolChallengesTitle: "Retos que se califican solos",
    toolChallengesBody:
      "Las lecciones terminan con comprobaciones prácticas — predice una medición, depura un circuito, estima una factura de QPU — calificadas al instante en tu navegador, para que sepas que una idea se quedó antes de construir sobre ella.",
    toolReviewTitle: "Repaso de repetición espaciada",
    toolReviewBody:
      "Las ideas clave se convierten automáticamente en tarjetas de repaso. Una cola diaria las reaparece justo antes de que las olvides.",
    toolGlossaryTitle: "Un glosario que enseña",
    toolGlossaryBody:
      "{{count}} términos con definiciones precisas, matemáticas renderizadas y enlaces a las lecciones donde se construye cada idea.",
    accountEyebrow: "Tu espacio de trabajo",
    accountHeading: "Crea una cuenta gratuita y mantén todo sincronizado",
    accountBody:
      "Una cuenta lleva tu progreso de lecciones, tarjetas de repaso y circuitos guardados entre dispositivos — y abre el camino al hardware cuántico real cuando estés listo.",
    accountReassurance:
      "Correo o Google. Sin tarjeta de crédito — todo el currículo y el simulador son gratuitos.",
    learningPath: "Ruta de aprendizaje",
    sectionsCount: {
      one: "{{count}} sección",
      other: "{{count}} secciones",
    },
    summaryFallback: "Lecciones y ejercicios prácticos.",
    exploreSection: "Explorar sección",
    notebookCount: {
      one: "{{count}} cuaderno",
      other: "{{count}} cuadernos",
    },
    glossaryEyebrow: "Referencia",
    glossaryTitle: "Glosario",
    glossaryBody:
      "Consulta cualquier término cuántico, de la A a la Z — cada uno enlazado a la lección que lo enseña.",
    glossaryCta: "Explorar términos",
    glossaryAria: "Glosario, una referencia de la A a la Z de términos cuánticos",
    tutorMockTitle: "Pregunta al margen",
    tutorMockReading: "Leyendo: 03 — Algoritmos cuánticos",
    tutorMockQuestion: "¿Por qué la búsqueda de Grover solo necesita unas √N consultas?",
    tutorMockAnswer:
      "Cada iteración de Grover rota el estado un ángulo fijo hacia el elemento marcado, de modo que su amplitud — no solo su probabilidad — crece en cada paso. Las amplitudes se elevan al cuadrado y se convierten en probabilidades: ahí vive la aceleración cuadrática, unas π/4·√N iteraciones en lugar de N/2 comprobaciones.",
  },
  sections: {
    "00-prereqs": {
      title: "Prerrequisitos: de cero a listo para lo cuántico",
      summary:
        "El módulo de entrada. Si no tienes base en cuántica, empieza aquí. Al terminar tendrás la matemática, el código y la intuición para leer el resto del currículo.",
    },
    "01-foundations": {
      title: "Fundamentos de computación cuántica",
      summary:
        "Cúbits, superposición, entrelazamiento y medición — enseñados ejecutando circuitos, no solo mirando ecuaciones.",
    },
    "02-hardware": {
      title: "Hardware cuántico en Amazon Braket",
      summary:
        "Qué es físicamente un cúbit, cómo cada máquina equilibra velocidad y fidelidad, y cuánto cuesta el tiempo de QPU antes de gastar un centavo.",
    },
    "03-algorithms": {
      title: "Algoritmos cuánticos",
      summary:
        "El canon, con las manos: Deutsch-Jozsa, Grover, la transformada de Fourier cuántica y estimación de fase — construidos puerta a puerta.",
    },
    "04-quantum-ml": {
      title: "Aprendizaje automático cuántico",
      summary:
        "Circuitos variacionales como modelos: codifica datos, entrena puertas parametrizadas y juzga cuándo un modelo cuántico vale la pena.",
    },
    "05-quantum-chemistry": {
      title: "Química cuántica y bioquímica",
      summary:
        "Mapea hamiltonianos moleculares a cúbits, ejecuta VQE para energías del estado base y simula moléculas reales con OpenFermion.",
    },
    "06-hybrid-jobs": {
      title: "Trabajos híbridos cuántico-clásicos de producción",
      summary:
        "Del cuaderno a producción: Hybrid Jobs de Braket con acceso prioritario a QPU, puntos de control y control de costos.",
    },
  },
};
