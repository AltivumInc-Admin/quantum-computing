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
    changelog: "Novedades",
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
  foundingTen: {
    label: "Los Diez Fundadores",
    ariaLabel: "Los Diez Fundadores: {{claimed}} de {{total}} plazas ocupadas",
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
    headlineDimPre: "de",
    headlineDimPost: "a producción",
    subtitle:
      "Desde los fundamentos de circuitos hasta cargas híbridas de producción — un playground en vivo, hardware cuántico real y un tutor de IA al margen. Gratis, en tu navegador.",
    signUpFree: "Regístrate gratis",
    signIn: "Iniciar sesión",
    signUpSoon: "Registro próximamente",
    exploreCurriculum: "Explorar el currículo",
    poweredBy: "Impulsado por",
    startHere: "Empieza aquí",
    dialLabel: "Secciones del currículo en el dial",
    hudLive: "Simulador en vivo · en el navegador",
    hudCounts: "{{sections}} secciones · {{notebooks}} cuadernos",
    badgeFree: "Gratis",
    badgeInBrowser: "En el navegador",
    badgeNoInstall: "Sin instalación",
    dialOpenSection: "Abrir la sección",
    dialClose: "Cerrar",
    notebooksCount: {
      one: "{{count}} cuaderno",
      other: "{{count}} cuadernos",
    },
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
    playgroundMockTitle: "Editor en vivo",
    playgroundMockProbs: "Probabilidades de medición",
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
  pitches: {
    "00-prereqs":
      "Toda la matemática que usa el currículo, construida desde cero: números complejos, vectores y matrices, probabilidad y el Python que necesitas para manejarlo. Sin título en física — termina esta sección y nada de lo que sigue se sentirá como un salto.",
    "01-foundations":
      "Cúbits, superposición, entrelazamiento y medición — enseñados ejecutando circuitos, no solo mirando ecuaciones. Construirás tu primer estado de Bell en el navegador y entenderás por qué no se puede explicar clásicamente.",
    "02-hardware":
      "Qué es físicamente un cúbit: circuitos superconductores, iones atrapados y átomos neutros, y cómo cada máquina equilibra velocidad y fidelidad. Explorarás el catálogo real de Braket, verás cómo el ruido limita cada máquina y cuánto cuesta el tiempo de QPU antes de gastar un centavo.",
    "03-algorithms":
      "El canon, con las manos: Deutsch-Jozsa, búsqueda de Grover, la transformada de Fourier cuántica y estimación de fase. Cada cuaderno construye el algoritmo puerta a puerta para que veas de dónde viene la ventaja cuántica — y dónde no.",
    "04-quantum-ml":
      "Circuitos variacionales como modelos de aprendizaje automático: codifica datos en estados cuánticos, entrena puertas parametrizadas con PennyLane y juzga con honestidad cuándo un modelo cuántico vale la pena frente a una base clásica.",
    "05-quantum-chemistry":
      "La aplicación para la que se inventaron las computadoras cuánticas. Mapea hamiltonianos moleculares a cúbits, ejecuta VQE para energías del estado base y simula moléculas reales con OpenFermion — la sección más grande del currículo.",
    "06-hybrid-jobs":
      "Del cuaderno a producción: empaqueta cargas cuántico-clásicas como Hybrid Jobs de Braket con acceso prioritario a QPU, puntos de control y control de costos. Así el código de investigación se convierte en algo que puedes enviar y volver a ejecutar.",
  },
  common: {
    copy: "Copiar",
    copied: "Copiado",
    copyFailed: "Error al copiar",
    close: "Cerrar",
    closeDialog: "Cerrar diálogo",
    or: "o",
    loading: "Cargando…",
    search: "Buscar",
    previous: "Anterior",
    next: "Siguiente",
    open: "Abrir",
    delete: "Eliminar",
    confirm: "¿Confirmar?",
    save: "Guardar",
    cancel: "Cancelar",
    signedIn: "Sesión iniciada",
    notFound: "No encontrado",
  },
  theme: {
    switchToLight: "Cambiar a tema claro",
    switchToDark: "Cambiar a tema oscuro",
  },
  sidebar: {
    learningPath: "Ruta de aprendizaje",
    toggleNav: "Alternar navegación",
    ofComplete: "{{completed}} de {{total}} completadas",
    progressLabel: "Progreso de la ruta de aprendizaje",
    completed: "completada",
    navLabel: "Ruta de aprendizaje",
    drawerLabel: "Navegación de la ruta de aprendizaje",
  },
  lesson: {
    notebooks: "Cuadernos",
    markComplete: "Marcar como completa",
    onThisPage: "En esta página",
    completionSaved:
      "La finalización se guarda en este dispositivo y cuenta para el progreso de tu ruta.",
    runInBrowser: "Ejecutar en el navegador",
    runAria: "Ejecutar {{label}} en el navegador",
    viewOnGithub: "Ver {{label}} en GitHub",
    copyNotebookPath: "Copiar ruta del cuaderno",
    unavailableTitle:
      "No disponible en el entorno del navegador — ejecútalo localmente con el entorno completo de Python",
    unavailableSr:
      " — no disponible en el entorno del navegador; ejecútalo localmente con el entorno completo de Python",
    pyodide: "Pyodide",
  },
  gate: {
    sectionPreview: "Vista previa de la sección",
    continueToSection: "Continuar a la sección",
    createFreeAccount: "Crear una cuenta gratuita",
    signIn: "Iniciar sesión",
    notebookLine: {
      one: "{{count}} cuaderno práctico — {{runNote}}",
      other: "{{count}} cuadernos prácticos — {{runNote}}",
    },
    runAllOne: "se ejecuta en tu navegador",
    runAllMany: "todos se ejecutan en tu navegador",
    runSome: {
      one: "{{count}} se ejecuta en tu navegador",
      other: "{{count}} se ejecutan en tu navegador",
    },
    runNone: "hechos para ejecutarse en tu propio entorno de Braket",
  },
  auth: {
    signIn: "Iniciar sesión",
    signUp: "Crea tu cuenta",
    confirmEmail: "Confirma tu correo",
    confirmBtn: "Confirmar",
    forgotPassword: "Restablece tu contraseña",
    resetPassword: "Establece una nueva contraseña",
    email: "Correo electrónico",
    password: "Contraseña",
    confirmPassword: "Confirmar contraseña",
    newPassword: "Nueva contraseña",
    confirmNewPassword: "Confirmar nueva contraseña",
    confirmationCode: "Código de confirmación",
    resetCode: "Código de restablecimiento",
    signingIn: "Iniciando sesión…",
    creating: "Creando…",
    confirming: "Confirmando…",
    sending: "Enviando…",
    saving: "Guardando…",
    createAccount: "Crear cuenta",
    forgotLink: "¿Olvidaste tu contraseña?",
    alreadyHaveAccount: "¿Ya tienes una cuenta? Inicia sesión",
    enterCode: "Ingresa el código de 6 dígitos que enviamos a {{email}}.",
    yourAddress: "tu dirección",
    resendCode: "Reenviar código",
    resendCodeCooldown: "Reenviar código ({{seconds}}s)",
    codeOnWay: "Un nuevo código está en camino.",
    sendResetCode: "Enviar código de restablecimiento",
    backToSignIn: "Volver a iniciar sesión",
    setNewPassword: "Establecer nueva contraseña",
    continueWithGoogle: "Continuar con Google",
    googleFailed: "El inicio de sesión con Google no se completó. Inténtalo de nuevo.",
    checkingAccess: "Comprobando tu acceso…",
    accountMenu: "Cuenta",
    workspace: "Espacio de trabajo",
    signOut: "Cerrar sesión",
    passwordsMatch: "Las contraseñas coinciden",
    passwordMeetsAll: "La contraseña cumple todos los requisitos.",
    criterionMet: "cumplido",
    criterionNotMet: "no cumplido",
    pwLength: "Al menos 8 caracteres",
    pwUpper: "Una letra mayúscula",
    pwLower: "Una letra minúscula",
    pwNumber: "Un número",
    errors: {
      incorrectCredentials: "Correo o contraseña incorrectos.",
      confirmEmailFirst:
        "Primero confirma tu correo — acabamos de enviarte un código nuevo.",
      emailExists: "Ya existe una cuenta con ese correo.",
      codeMismatch: "Ese código no coincide. Revísalo e inténtalo de nuevo.",
      codeExpired: "Ese código ha expirado. Solicita uno nuevo.",
      invalidPassword:
        "La contraseña debe tener al menos 8 caracteres con mayúscula, minúscula y un número.",
      tooManyAttempts: "Demasiados intentos. Espera un momento e inténtalo de nuevo.",
      resetRequired:
        "Debes establecer una contraseña nueva antes de iniciar sesión: solicita un código de restablecimiento.",
      googleSessionActive:
        "Ya has iniciado sesión con Google. Recarga esta página para continuar.",
      generic: "Algo salió mal. Inténtalo de nuevo.",
    },
  },
  deleteAccount: {
    ariaLabel: "Eliminar cuenta",
    title: "Eliminar cuenta",
    intro: "Esto elimina permanentemente:",
    itemProgress: "tu progreso sincronizado en el servidor (incluido tu correo)",
    itemPrefs: "tu preferencia de recordatorios por correo",
    itemAccount: "tu cuenta e inicio de sesión",
    itemLocal: "la copia local de tu progreso en este dispositivo",
    confirmLabel: "Escribe la palabra de abajo para confirmar:",
    noUndo: "No hay deshacer ni periodo de recuperación.",
    blurb: "Elimina permanentemente tu cuenta y todos los datos. Pide confirmación primero.",
    deleting: "Eliminando…",
    submit: "Eliminar mi cuenta",
    partialPrefs:
      "Se eliminó tu progreso sincronizado, pero no se pudo eliminar tu preferencia de correo.",
    prefsFailed: "No se pudo eliminar tu preferencia de correo.",
    partialAccount:
      "Se eliminaron tus datos del servidor, pero no se pudo eliminar la cuenta.",
    accountFailed: "No se pudo eliminar la cuenta.",
    tryAgain: " Inténtalo de nuevo.",
  },
  tutor: {
    ask: "Preguntar",
    asking: "Preguntando…",
    thinking: "Pensando…",
    answerReady: "Respuesta lista",
    title: "Pregunta al margen",
    ariaAsk: "Preguntar sobre esta lección",
    ariaDialog: "Tutor de la lección",
    ariaClose: "Cerrar tutor",
    groundedIn: "Basado en:",
    emptyHint:
      "Pregunta lo que quieras sobre esta lección. Respondo solo con el texto de la lección y te haré una pregunta antes de darte la respuesta completa.",
    questionLabel: "Tu pregunta",
    placeholder: "p. ej. ¿por qué la cadena Z solo actúa en los modos inferiores?",
    enterHint: "Enter para enviar, Mayús+Enter para una línea nueva",
    rateLimited: "Demasiadas preguntas en poco tiempo — espera un minuto e inténtalo de nuevo.",
    unavailable: "El tutor no está disponible ahora — inténtalo de nuevo en breve.",
    couldNotAnswer: "El tutor no pudo responder esa solicitud — inténtalo de nuevo.",
    hitError: "El tutor encontró un error. Inténtalo de nuevo.",
    noAnswer: "El tutor no envió una respuesta — inténtalo de nuevo.",
    stopped: "El tutor dejó de responder — inténtalo de nuevo.",
    unreachable: "No se pudo contactar al tutor — revisa tu conexión.",
    modelLabel: "Modelo del tutor",
    costCredits: "{{credits}} créditos",
    costIncluded: "incluido",
  },
  glossaryUi: {
    searchLabel: "Buscar términos del glosario",
    searchPlaceholder: "Buscar términos…",
    jumpToLetter: "Ir a la letra",
    jumpTo: "Ir a {{letter}}",
    termCount: {
      one: "{{count}} término",
      other: "{{count}} términos",
    },
    noMatch: "Ningún término coincide con \"{{query}}\".",
    copyLink: "Copiar enlace",
    copyLinkAria: "Copiar enlace a este término",
    seeAlso: "Véase también",
    short: {
      "00-prereqs": "Prerrequisitos",
      "01-foundations": "Fundamentos",
      "02-hardware": "Hardware",
      "03-algorithms": "Algoritmos",
      "04-quantum-ml": "ML cuántico",
      "05-quantum-chemistry": "Química",
      "06-hybrid-jobs": "Trabajos híbridos",
    },
    pageTitle: "Glosario",
    pageBody:
      "Una referencia de la A a la Z de términos de computación cuántica, desde cúbits y puertas hasta VQE y QAOA, cada uno enlazado a la lección que lo enseña.",
    workspaceCta: "Abrir tu espacio de trabajo",
    allTerms: "Todos los términos",
    moreIn: "Más en {{section}}",
  },
  workspaceUi: {
    title: "Espacio de trabajo",
    loading: "Cargando tu espacio de trabajo",
    localOnly: "Solo en este dispositivo — el progreso se guarda localmente",
    syncFailed: "Error de sincronización",
    notYetSynced: "Aún no sincronizado",
    curriculum: "Currículo",
    theLab: "El laboratorio",
    sectionGroup: "Sección del currículo",
    skillsRetention: "Habilidades en retención comprobada",
    skillsRetentionSub: "el dominio que no se improvisa",
    skillsRetentionSr: "habilidades en retención comprobada",
    keptSharp: "mantenidas esta semana",
    withinReach: "Al alcance",
    mastery: "Dominio",
    consistency: "Constancia",
    hardware: "Hardware",
    allCredentials: "Todas las credenciales de {{group}} obtenidas.",
    allCredentialsLink: "Todas las {{n}} credenciales →",
    rungProgress: "{{current}} de {{target}} {{unit}}",
    // The verb agrees with the count: "falta 1" / "faltan 3". Both keys shipped as
    // plain strings, so every track rendered "faltan 1" at its last step — and
    // distance === 1 is reachable on all three (mastery 4→5, consistency 3→4,
    // hardware 2→3 runs).
    distanceToGo: {
      one: "falta {{distance}}",
      other: "faltan {{distance}}",
    },
    distanceUnitToGo: {
      one: "falta {{distance}} {{unit}}",
      other: "faltan {{distance}} {{unit}}",
    },
    unitInRetention: "en retención",
    unitRun: {
      one: "ejecución",
      other: "ejecuciones",
    },
    unitShot: {
      one: "disparo",
      other: "disparos",
    },
    checkingHardware: "Revisando tu registro de hardware…",
    hardwareUnavailable: "Registro de hardware no disponible.",
    allHardware: "Todas las credenciales de hardware obtenidas.",
    fits: "cabe",
    outOfAllowance: "fuera del presupuesto",
    interval: "Intervalo",
    skills: "Habilidades",
    state: "Estado",
    maturing: "madurando",
    retained: "retenidas",
  },
  playgroundUi: {
    title: "Playground",
    compose: "Componer",
    state: "Estado",
    hardware: "Hardware",
    sampling: "Muestreo",
    saved: "Circuitos guardados",
    circuitName: "Nombre del circuito",
    copyShare: "Copiar enlace para compartir",
    copyQasm: "Copiar OpenQASM",
    openQasm: "OpenQASM 3.0",
  },
  runbookUi: {
    title: "Runbook",
    body:
      "Tu registro de dominio: habilidades llevadas a retención comprobada por repetición espaciada, tu racha semanal y un gráfico de cada día que practicaste.",
    longestStreak: "Racha más larga",
    week: {
      one: "semana",
      other: "semanas",
    },
    activeThisWeek: "Activo esta semana",
    modulesComplete: "Módulos completados",
    dueToReview: "Pendiente de repaso",
    inactive: "Inactivo",
    active: "Activo",
    skillsRetention: "Habilidades en retención comprobada",
    emptyTitle: "Tu Runbook está vacío — por ahora.",
    emptyBody:
      "Califica tu primer ejercicio en una lección y aparecerá aquí. Cada día que practicas marca el gráfico; cada habilidad que mantienes afilada sube el conteo de arriba.",
    startLesson: "Empezar una lección",
    goToReview: "Ir a repasar",
  },
  credentialsUi: {
    title: "Credenciales",
    pageTitle: "Tus credenciales",
    pageBody:
      "Cada medalla se gana, no se otorga — se acuña con trabajo que puedes señalar. Las medallas de dominio reflejan lo que mantienes en retención ahora mismo, así que significan exactamente lo que dicen.",
    earnedOfTotal: "de {{total}} obtenidas",
    completion: "Finalización",
    mastery: "Dominio",
    consistency: "Constancia",
    hardware: "Hardware",
    completionBlurb: "Módulos llevados hasta el final.",
    masteryBlurb: "Habilidades mantenidas en retención comprobada por repetición espaciada.",
    consistencyBlurb: "Semanas de constancia, sin interrupciones.",
    hardwareBlurb:
      "Circuitos ejecutados en una computadora cuántica real, a través de Amazon Braket.",
    earned: "Obtenida",
    locked: "Bloqueada",
    outOfReach: "Fuera de alcance",
    unverified: "Sin verificar",
    outOfReachDetail:
      "{{requirement}} — fuera de alcance con el presupuesto patrocinado que te queda.",
    recordLabel: "Tu registro:",
    recordRuns: {
      one: "{{n}} ejecución completada",
      other: "{{n}} ejecuciones completadas",
    },
    recordShots: {
      one: "{{n}} disparo",
      other: "{{n}} disparos",
    },
    recordDevice: "en IQM Garnet.",
    allowanceLead: "Obtener las tres requiere:",
    allowancePlan: "{{runs}} ejecuciones con un total de {{shots}} disparos — {{cost}}",
    allowanceTail:
      "Si tu cuenta tiene un presupuesto de hardware, es único y no se recarga — cómo lo gastas decide cuáles de estas puedes obtener todavía.",
    runOnGarnet: "Ejecutar en IQM Garnet",
    unverifiedNote:
      "No se pudo verificar tu registro de hardware — estas medallas aparecen como sin verificar, no bloqueadas. Recarga para reintentar.",
    unverifiedThrottledNote:
      "Demasiadas solicitudes en poco tiempo, así que no se pudo revisar tu registro de hardware — estas medallas aparecen como sin verificar, no bloqueadas. Es un límite de solicitudes, no una interrupción del servicio; espera un minuto antes de recargar.",
    tiers: {
      mastery: {
        "1": "Primera retención",
        "5": "Con práctica",
        "15": "Con fluidez",
        "30": "Profundo",
        "50": "Maestría",
      },
      consistency: {
        "4": "Constante",
        "12": "Comprometido",
        "26": "Implacable",
      },
      hardware: {
        runs: {
          "1": "Ejecutado en hardware real",
          "3": "Serie de ejecuciones",
        },
        shots: {
          "1000": "Muestra profunda",
        },
      },
    },
    completionRequirement: "Completa el módulo {{title}}",
    completionEvidence: "Módulo {{title}} completado",
    masteryRequirement: {
      one: "Mantén {{n}} habilidad en retención comprobada",
      other: "Mantén {{n}} habilidades en retención comprobada",
    },
    masteryEvidence: {
      one: "{{n}} habilidad en retención comprobada",
      other: "{{n}} habilidades en retención comprobada",
    },
    consistencyRequirement: {
      one: "Practica {{n}} semana seguida",
      other: "Practica {{n}} semanas seguidas",
    },
    consistencyEvidence: {
      one: "Una racha de {{n}} semana",
      other: "Una racha de {{n}} semanas",
    },
    // "Ejecuta … disparos", never "ejecuciones": the shots tier must not demand
    // runs in Spanish either. The verb shares a root with the runs noun but not
    // the noun itself, which is what the regression test pins.
    hardwareRunsRequirement: {
      one: "Completa {{n}} ejecución en hardware real",
      other: "Completa {{n}} ejecuciones en hardware real",
    },
    hardwareShotsRequirement: {
      one: "Ejecuta {{n}} disparo en total en hardware real",
      other: "Ejecuta {{n}} disparos en total en hardware real",
    },
    hardwareRunsEvidence: {
      one: "{{n}} ejecución completada en IQM Garnet",
      other: "{{n}} ejecuciones completadas en IQM Garnet",
    },
    hardwareShotsEvidence: {
      one: "{{n}} disparo repartido en {{runs}}",
      other: "{{n}} disparos repartidos en {{runs}}",
    },
  },
  qpuUi: {
    rateLimitedSubmit:
      "Demasiadas solicitudes en poco tiempo — no se gastó nada del presupuesto. Espera un minuto y envía de nuevo.",
    rateLimitedService:
      "Demasiadas solicitudes en poco tiempo. Es un límite de solicitudes, no una interrupción del servicio — espera un minuto e inténtalo de nuevo.",
    recordUnavailable:
      "Tu registro de hardware no está disponible en este momento, así que no se puede mostrar el avance de las medallas. Tus ejecuciones completadas no se ven afectadas — recarga para reintentar.",
    walletBalance: "Cartera: {{credits}} créditos",
    insufficientCredits:
      "Esta ejecución necesita {{credits}} créditos y tu cartera no los cubre. No se envió nada y no se tomaron créditos — recarga en la página de Precios para ejecutar en hardware.",
  },
  pricingUi: {
    title: "Precios",
    eyebrow: "Precios",
    headlineBefore: "Aprender es",
    headlineFree: "gratis",
    // Futuro a propósito — ver la nota en en.ts headlineAfter. Nada se mide todavía.
    headlineAfter: ". El metal se medirá.",
    heroBody:
      "Todo el currículo, el simulador y el playground son gratuitos con una cuenta gratis — para siempre. Una billetera de créditos medirá lo que de verdad cuesta dinero: la tutoría de IA y el cómputo en la nube de pago — hardware cuántico real y los simuladores gestionados de la tabla de tarifas. Nada de eso se mide todavía: hoy el tutor es gratis para probar, y las ejecuciones de hardware no están disponibles por ahora. Un crédito es un centavo, siempre.",
    creditPeg: "1 crédito = $0.01",
    topUpFrom: "Recarga desde {{amount}}",
    principleLearning: "Aprender es el producto",
    principleLearningBody:
      "Las lecciones, los cuadernos y el simulador de circuitos se ejecutan en tu navegador, así que podemos mantenerlos gratis para todos, para siempre. El currículo nunca pasa detrás de la billetera.",
    principleWallet: "Una billetera, anclada al dólar",
    principleWalletBody:
      "Un crédito es un centavo — siempre. Los planes incluyen créditos cada mes, y quienes están suscritos pueden recargar desde {{min}}; los créditos comprados no expiran, y todavía nada los descuenta.",
    principleLine: "Una línea clara",
    // Ver el comentario en en.ts: la tabla de tarifas de esta misma página publica SV1 y
    // DM1 por minuto, así que la promesa absoluta de que nada más costará créditos
    // contradice la tabla. Se nombran las tres cosas medidas.
    principleLineBody:
      "Los créditos medirán el cómputo de pago y la tutoría de pago: preguntas al tutor de IA, ejecuciones en hardware cuántico real y minutos en los simuladores gestionados en la nube — cada tarifa está publicada abajo. El currículo, el simulador del navegador y el playground siguen gratis. Hoy todavía no se mide ninguna de las tres.",
    tiersHeading: "Tres formas de fondear la billetera",
    tiersIntro:
      "Plus y Pro incluyen una cantidad fija de créditos cada mes — nunca un plan todo-incluido, para que el trato sea honesto en ambas direcciones. Si se te acaban antes de tiempo, puedes recargar cualquier monto en dólares enteros al mismo peg de un centavo. Las recargas extienden un plan, no lo reemplazan.",
    bestForRegulars: "Ideal para uso regular",
    forever: "para siempre",
    perMonth: "/ mes",
    // Ver la nota en en.ts: la unidad de crédito vive aquí, no en el formateador.
    creditsCount: {
      one: "{{n}} crédito",
      other: "{{n}} créditos",
    },
    creditsEveryMonth: "{{credits}} cada mes",
    getTier: "Obtener {{name}}",
    startFreeWhileWait: "Empieza gratis mientras esperas",
    launchingSoon: "Próximamente",
    signUpFree: "Regístrate gratis",
    signUpSoon: "Registro próximamente",
    launchPricing: "Antes de comprar:",
    launchPricingBody:
      " las billeteras ya están activas, pero todavía nada las descuenta. El tutor en la lección es gratis para probar y las ejecuciones de hardware no están disponibles por ahora, así que un saldo que compres hoy no compra nada hoy. Los créditos no expiran y empiezan a medirse cuando se lance la facturación del tutor y del hardware.",
    earlyAccess: "Acceso anticipado:",
    earlyAccessBody:
      " la facturación aún no se ha lanzado — estos son precios de lanzamiento. Hoy el tutor es gratis para probar, y las ejecuciones de hardware no están disponibles por ahora. Cuando las billeteras estén activas, las financiarás tú con una recarga o un plan.",
    estimatorHeading: "Conoce el número antes de ejecutar",
    estimatorIntro:
      "Ninguna plataforma cuántica debería sorprenderte con una factura. Calcula aquí cualquier backend publicado y cualquier hábito de tutor. Antes de una ejecución real de hardware, el espacio de trabajo te muestra su costo y te hace aprobarlo.",
    ratesHeading: "Todas las tarifas, publicadas",
    ratesAsOf: "Tarifas de {{date}}",
    ratesIntro:
      "La lista completa de precios — sin velo de ventas empresariales. Estas son las tarifas que cobrará la medición: las ejecuciones en QPU suman una tarifa fija de {{fee}} créditos por tarea, y los simuladores gestionados se facturan por minuto. El simulador del navegador es gratis y lo será siempre.",
    aiTutor: "Tutor de IA",
    tutorTypical:
      "Créditos típicos por pregunta cuando se lance la medición del tutor. Hoy cada pregunta la responde gratis Claude Haiku, y el modelo no se puede elegir.",
    quantumHardware: "Hardware cuántico",
    hardwarePerShotPlusFee: "Créditos por disparo, más la tarifa de {{fee}} créditos por tarea.",
    shotRun: "Ejecución de {{n}} disparos",
    creditsPerMinute: "{{n}} créditos / minuto",
    model: "Modelo",
    credits: "Créditos",
    backend: "Backend",
    perShot: "Por disparo",
    faqHeading: "Preguntas justas",
    faqLearningQ: "¿Aprender es realmente gratis para siempre?",
    faqLearningA:
      "Sí. El currículo completo, el simulador del navegador, el playground, el glosario y el repaso de repetición espaciada son gratis con una cuenta gratuita — correo o Google, sin tarjeta de crédito. Ese es el producto, no una prueba.",
    faqCreditsQ: "¿Qué compran los créditos?",
    faqCreditsA:
      "Nada todavía — esa es la respuesta honesta. Hoy ninguna parte de la plataforma descuenta tu billetera: el tutor de IA es gratis para probar, y las ejecuciones de hardware no están disponibles por ahora. Cuando se lance la medición, los créditos comprarán exactamente dos cosas: preguntas al tutor de IA y cómputo cuántico real (ejecuciones en QPU y simuladores en la nube gestionados). Un crédito equivale a un centavo. El espacio de trabajo te muestra el costo exacto de cualquier ejecución de hardware y te hace aprobarlo antes de que algo se ejecute.",
    faqExpireQ: "¿Expiran los créditos?",
    faqExpireA:
      "Los créditos comprados no expiran. Los créditos mensuales de Plus y Pro se acumulan mientras la suscripción esté activa.",
    faqBackendsQ: "¿Por qué los backends cuestan tan distinto?",
    faqBackendsA:
      "Porque las máquinas realmente cuestan distinto. Un disparo de iones atrapados en IonQ lista aproximadamente 180 veces un disparo superconductor en Rigetti. Publicamos la tarifa de cada backend para que el precio de la física nunca sea un misterio. Hoy solo IQM Garnet está conectado, y las ejecuciones de hardware no están disponibles por ahora; elegir tu propio backend llega con la medición de la billetera. Antes de que se ejecute cualquier corrida de hardware, el espacio de trabajo la cotiza en dólares de AWS desde su propia tabla y espera tu aprobación.",
    faqProviderQ: "¿Qué pasa cuando un proveedor cambia sus precios?",
    faqProviderA:
      "Las tarifas de hardware siguen las hojas de precios publicadas de los proveedores (actualmente la revisión de {{date}}). Nada en esta página se consulta al proveedor: estas tarifas en créditos están compiladas en el sitio, y la comprobación previa a una ejecución de hardware lee su propia tabla aparte de tarifas en dólares de AWS, también compilada. Un cambio de precio llega a cualquiera de las dos tablas solo con una nueva versión — que es lo que registra la fecha de revisión de la tabla de tarifas.",
    faqBuyQ: "¿Cómo compro créditos?",
    faqBuyA:
      "Justo en esta página: elige un plan, o recarga cualquier monto en dólares enteros de ${{min}} a ${{max}} — el checkout es una página hospedada de Stripe, y los créditos llegan a tu billetera en cuanto se completa el pago. Los créditos comprados no expiran — y todavía nada los descuenta, así que un saldo de hoy es un saldo que espera a que se lance la medición.",
    faqWhenQ: "¿Cuándo puedo comprar créditos?",
    faqWhenA:
      "La facturación se lanza pronto; los precios de esta página son de lanzamiento. Hasta entonces, el tutor es gratis para probar y las ejecuciones de hardware no están disponibles por ahora — crea tu cuenta gratis ahora para estar listo en cuanto las billeteras se activen.",
    ctaHeading: "Empieza a aprender hoy. La billetera puede esperar.",
    ctaBody:
      "Todo lo que necesitas para aprender computación cuántica ya es gratis — solo una cuenta gratuita. Correo o Google, sin tarjeta de crédito.",
    free: "Gratis",
    plan: "plan",
    // Ver la nota en en.ts: mientras haya deuda, ningún gasto se permite.
    spendPaused: "Gasto en pausa",
    spendPausedDetail:
      "Un reembolso o una disputa dejó {{owed}} pendientes en esta billetera. El gasto está en pausa hasta que se salde, sin importar lo que muestre el saldo.",
    buyCredits: "Comprar créditos",
    buyCreditsAmount: "Comprar {{amount}}",
    starting: "Iniciando…",
    thisRun: "Esta ejecución",
    perMonthLabel: "Por mes",
    perMoSuffix: " / mes",
    tutorModel: "Modelo del tutor a calcular",
    modelToPrice: "Modelo a calcular",
    modelNotSelectableYet:
      "Todavía no se puede elegir — hoy cada pregunta la responde gratis Claude Haiku. Calcula aquí cualquier modelo para ver cuánto costaría con la medición.",
    // Ver la nota en en.ts: los dos grupos necesitan nombres distintos.
    shotPresets: "Preajustes de disparos",
    questionPresets: "Preajustes de preguntas",
    priceHardware: "Precio de una ejecución de hardware",
    priceHardwareBody:
      "Una proyección de la tarifa medida, no un cobro. Las ejecuciones de hardware no están disponibles por ahora; antes de que cualquier ejecución se lleve a cabo, la comprobación previa del espacio de trabajo la cotiza en dólares a la tarifa de lista de AWS — no la cifra en créditos que se muestra aquí — y nada se ejecuta hasta que apruebes ese número.",
    shots: "Disparos",
    shotsValue: "{{n}} disparos",
    priceTutorMonth: "Precio de un mes de tutoría",
    priceTutorBody:
      "Preguntas típicas — las derivaciones largas cuestan proporcionalmente más. Esto es una proyección de la tarifa medida; hoy la tutoría no se cobra.",
    questionsPerMonth: "Preguntas por mes",
    questionsValue: "{{n}} preguntas por mes",
    perShotPlusTask:
      "{{perShot}} créditos por disparo + {{fee}} créditos por tarea.",
    aboutCreditsPerQ: {
      one: "{{model}} costaría unos {{count}} crédito por pregunta cuando se lance la medición. {{note}}",
      other: "{{model}} costaría unos {{count}} créditos por pregunta cuando se lance la medición. {{note}}",
    },
    topUpTitle: "Recarga cualquier monto",
    topUpBody:
      "{{credits}} por dólar — el anclaje de $0.01, siempre. Dólares enteros de ${{min}} a ${{max}}, para quienes están suscritos y se quedan sin créditos a mitad de mes.",
    amountPresets: "Montos predefinidos",
    customAmount: "Monto personalizado (USD)",
    invalidAmount: "Ingresa un monto en dólares enteros de ${{min}} a ${{max}}.",
    topUpFootnote:
      "Las recargas requieren un plan activo. Los créditos comprados no expiran, y verás el monto exacto en la página de checkout de Stripe antes de pagar.",
    checkoutFailed: "No se pudo iniciar el checkout. Inténtalo de nuevo.",
    // Ver la nota en en.ts: el 403 del servidor, dicho con claridad.
    topUpNeedsPlan:
      "Las recargas requieren un plan activo, y esta cuenta todavía no tiene uno. Elige un plan arriba y vuelve para recargar.",
    freeTagline: "Toda la plataforma de aprendizaje. Sin tarjeta, sin reloj.",
    freeFootnote: "Gratis para siempre. Aprender nunca pasa detrás de la billetera.",
    freeF0: "Currículo completo — cada sección, cada cuaderno",
    freeF1: "Simulación ilimitada en el navegador — los circuitos corren en tu máquina",
    freeF2: "Playground, glosario, repaso de repetición espaciada",
    freeF3: "Progreso y circuitos guardados sincronizados entre dispositivos",
    freeF4: "El tutor de IA es gratis para probar",
    plusTagline: "Créditos mensuales, incluidos en tu suscripción.",
    plusFootnote: "Cancela cuando quieras. Los créditos comprados no expiran.",
    plusF0: "Todo lo de Gratis",
    // Ver la nota en en.ts: la cifra viene de TIERS, nunca del diccionario.
    plusF1: "{{credits}} cada mes",
    plusF2: "Los créditos se acumulan mientras estés suscrito",
    proTagline: "El paquete mensual de créditos más grande.",
    proFootnote:
      "Para quienes más lo usan. Cancela cuando quieras; los créditos no expiran.",
    proF0: "Todo lo de Plus",
    proF1: "{{credits}} cada mes — un {{bonus}}% de bonificación sobre pago por uso",
    techSuperconducting108: "Superconductor, 108 cúbits",
    techSuperconducting: "Superconductor",
    techNeutralAtom: "Analógico de átomos neutros",
    techTrappedIon: "Iones atrapados",
    simSv1: "Simulador de vector de estado, hasta 34 cúbits",
    simDm1: "Simulador de matriz de densidad (ruido), hasta 17 cúbits",
    tutorNoteHaiku: "Rápido y preciso — el tutor de todos los días.",
    tutorNoteSonnet: "Razonamiento más profundo para derivaciones difíciles.",
    tutorNoteOpus: "Razonamiento a plena potencia, revisión de circuitos.",
    tutorNoteFable: "El modelo de frontera, para las preguntas más duras.",
  },
  privacyUi: {
    title: "Privacidad",
    eyebrow: "Política",
    lead:
      "La versión corta: tu progreso de aprendizaje vive en tu navegador. Si creas una cuenta, guardamos tu correo y una copia de ese progreso para que te siga entre dispositivos — y puedes borrar todo, de forma permanente, tú mismo.",
    whatWeStore: "Qué almacenamos",
    storeLocal:
      "Sin una cuenta, todo — progreso de lecciones, tarjetas de repaso, estado de widgets — se guarda solo en el almacenamiento local de tu navegador. Nada te identifica y nada sale de tu dispositivo excepto las solicitudes que cargan el sitio.",
    storeCircuits:
      "Los circuitos que guardas en el playground siguen la misma regla: viven en el almacenamiento local de tu navegador y, si inicias sesión, se incluyen en la instantánea de progreso sincronizado descrita abajo.",
    storeServerIntro:
      "Si creas una cuenta y usas la sincronización, almacenamos en nuestros servidores (AWS, región us-east-2):",
    storeEmail:
      "tu correo y credenciales de inicio de sesión, en Amazon Cognito (las contraseñas las maneja por completo Cognito; nunca las vemos)",
    storeProgress:
      "una instantánea de tu progreso de aprendizaje (secciones completadas, estado de programación de tarjetas de repaso), en Amazon DynamoDB, asociada a tu cuenta",
    storePrefs:
      "tu preferencia de recordatorios por correo — desactivada salvo que la enciendas — y, si la activas, la fecha del último correo que te enviamos",
    storeHardware:
      "si ejecutas un circuito en hardware cuántico real, un registro de esa ejecución (dispositivo, número de disparos, costo y un hash del circuito) para aplicar los límites de gasto de hardware",
    storeTutor:
      "Si le haces una pregunta al tutor de la lección, la pregunta y el contexto de la lección se envían a nuestro servicio de tutor (AWS, us-east-2), que los reenvía a Anthropic, el proveedor de IA, para generar la respuesta.",
    whatWeDont: "Qué no recopilamos",
    noAnalytics:
      "Sin analítica ni scripts de seguimiento — no existen en ningún lugar de este sitio.",
    noAds: "Sin publicidad, y no se vende ni se comparte datos con fines publicitarios.",
    noCookies:
      "Sin cookies de seguimiento. Los tokens de inicio de sesión se guardan en el almacenamiento de sesión por pestaña de tu navegador.",
    noThirdParty:
      "Sin fuentes, CDN ni balizas de terceros — el sitio y su entorno Python en el navegador se sirven desde nuestro propio origen. (Una excepción: si nuestra copia del entorno Python no carga, el navegador puede recurrir a la CDN pública jsDelivr.)",
    emails: "Correos",
    emailsBody:
      "Los recordatorios de repaso son estrictamente opt-in: el valor predeterminado es desactivado, y no se envía nada a menos que los actives en tu espacio de trabajo. Cuando están activos, recibes como máximo un correo cada 7 días, y solo cuando realmente tienes tarjetas de repaso pendientes. Cada correo incluye cancelación en un clic, y puedes desactivar los recordatorios en tu espacio de trabajo en cualquier momento.",
    retention: "Retención y eliminación",
    retentionDelete:
      "Los datos del servidor se conservan hasta que los elimines. Tu espacio de trabajo tiene un control \"Eliminar cuenta\" que borra de forma permanente tu progreso sincronizado, tu preferencia de correo, la cuenta misma y la copia local de este dispositivo — en ese orden, y se detiene y te avisa si algún paso falla. No hay deshacer ni periodo de recuperación.",
    retentionLogs:
      "Los registros operativos del servicio (para depuración y prevención de abusos) se conservan en AWS CloudWatch durante 30 días y luego se eliminan automáticamente.",
    contact: "Contacto",
    contactBody: "Preguntas sobre esta política o tus datos:",
    lastUpdated: "Última actualización {{date}}.",
  },
  changelogUi: {
    eyebrow: "Novedades",
    title: "Registro de cambios",
    lead: "Cada cambio que un estudiante puede ver, del más reciente al más antiguo. El registro empieza aquí: el trabajo anterior no aparece, y nada se anuncia antes de estar en línea.",
    kindNew: "Nuevo",
    kindImproved: "Mejorado",
    kindFixed: "Corregido",
    seeIt: "Ir a verlo",
    empty: "Nada se ha publicado desde que empezó esta página. Vuelve pronto.",
  },
};
