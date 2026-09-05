/**
 * Spanish twins for the changelog, keyed by ChangeEntry.id (see changelog.ts).
 *
 * Every id in CHANGELOG must appear here, and nothing else may — asserted in
 * BOTH directions by __tests__/lib/changelog.test.ts. The repo's other en/es
 * guard (__tests__/lib/i18n.test.ts) checks en ⊆ es only, which would let an
 * orphan for a renamed id sit here forever with CI green.
 *
 * A missing key does NOT fall back through the dictionary — this is a plain
 * Record, not a TranslationDict. The page falls back to the English entry
 * explicitly; the parity test is what keeps that path unused.
 */

export interface ChangeEntryEs {
  title: string;
  body: string;
}

export const CHANGELOG_ES: Record<string, ChangeEntryEs> = {
  "2026-09-04-fleet-that-exists": {
    title: "Las p\u00e1ginas de dispositivos ahora describen las m\u00e1quinas que Amazon Braket tiene de verdad",
    body: "Las tablas de dispositivos, el estimador de costos y el selector de backend para trabajos h\u00edbridos se hab\u00edan alejado de la flota real. Varias m\u00e1quinas que AWS ya retir\u00f3 segu\u00edan apareciendo como si pudieras enviarles trabajo, y cuatro que s\u00ed est\u00e1n activas \u2014 la Forte Enterprise de IonQ, la Emerald de IQM, la IBEX Q1 de AQT y la Cepheus de Rigetti \u2014 no ten\u00edan ninguna entrada. Cada dispositivo lleva ahora su estado verdadero, uno retirado lo dice con claridad en lugar de desaparecer sin m\u00e1s, y el estimador solo pone precio a lo que existe. La lecci\u00f3n de hardware, el glosario y los cuadernos afectados se corrigieron para coincidir, y una comprobaci\u00f3n nocturna compara ahora las tablas con Amazon Braket para que no vuelvan a desviarse sin que nadie lo note.",
  },
  "2026-09-04-privacy-lists-every-total": {
    title: "La pol\u00edtica de privacidad ahora enumera cada total diario que guardamos",
    body: "Nuestros servidores guardan un peque\u00f1o recuento diario de c\u00f3mo se usa el sitio, calculado despu\u00e9s a partir de los registros de acceso ordinarios del alojamiento web, sin direcciones, sin identificadores y sin nada que enlace un d\u00eda con otro. Hemos empezado a contar m\u00e1s que antes: junto a cu\u00e1ntas personas llegaron y cu\u00e1ntas iniciaron sesi\u00f3n, el recuento ahora tambi\u00e9n registra cu\u00e1ntas abrieron cada cuaderno de lecci\u00f3n, cu\u00e1ntas abrieron cada secci\u00f3n del curso, a cu\u00e1ntas secciones lleg\u00f3 la gente ese d\u00eda y hasta qu\u00e9 secci\u00f3n llegaron m\u00e1s lejos. Queremos saber si el temario se lee de verdad hasta el final. No se a\u00f1adi\u00f3 nada a la p\u00e1gina para lograrlo \u2014 ning\u00fan script, ninguna cookie, ning\u00fan identificador \u2014 y la pol\u00edtica nombra cada uno de estos totales antes de guardar el primero.",
  },
  "2026-09-03-google-sign-in-stall": {
    title: "Iniciar sesión con Google ya no se atasca ni dice que falló cuando funcionó",
    body: "Iniciar sesión con Google podía quedarse en \"Iniciando sesión…\" durante quince segundos, mostrar \"El inicio de sesión con Google no se completó\" y aun así dejarte entrar un momento después. Un rastro de cualquier intento anterior con Google que no terminaste — un botón atrás, una pestaña cerrada, un reinicio del navegador a mitad del proceso — bloqueaba la comprobación que confirma quién eres, y el error era en realidad la página rindiéndose de esperar. Ese rastro ahora se borra antes de que algo lo espere. Dos arreglos relacionados: la página solo dice que el inicio de sesión falló cuando de verdad falló, y si llegaste desde una lección, Google te devuelve a esa lección en lugar de al espacio de trabajo.",
  },
  "2026-09-03-notebooks-that-teach": {
    title: "Los cuadernos de las lecciones ahora se explican solos",
    body: "Cada cuaderno del plan de estudios se ha reescrito para ense\u00f1ar, no solo para etiquetar. Cada secci\u00f3n dice ahora qu\u00e9 va a mostrar el c\u00f3digo, en qu\u00e9 fijarse en el resultado y el error que te est\u00e1 evitando, con las salvedades honestas incluidas, para que aprendas d\u00f3nde deja de funcionar cada idea y no solo d\u00f3nde empieza. Los ejercicios, las pistas y las autocomprobaciones no cambian.",
  },
  "2026-09-02-pricing-page-reads-right": {
    title: "La página de precios se lee bien en español, y dice solo lo que es cierto",
    body: "Cada cifra de créditos de la página de precios en español se escribe ahora a la española, con la palabra en español y el separador de miles español, y las viñetas de cada plan toman sus números de la misma tabla que los precios, así que ya no pueden contradecirse. La descripción que los buscadores muestran de la página ya no hace una afirmación sobre precios que el monedero no implementa. Para quienes usan lector de pantalla o teclado: los botones de valores predefinidos anuncian cuál está seleccionado, las dos tablas de tarifas tienen nombre, la tabla de hardware se desplaza con el teclado, y la etiqueta del plan destacado se lee bien en el tema oscuro.",
  },
  "2026-08-31-learner-quantumenv-dev": {
    title: "Quantum Learner se une a la plataforma Quantum Env",
    body: "La dirección del sitio ahora es learner.quantumenv.dev, junto a las demás aplicaciones de Quantum Env. La dirección anterior, quantumlearner.dev, redirige aquí automáticamente, y todos los marcadores y enlaces compartidos siguen funcionando. El inicio de sesión no cambia, incluido Google.",
  },
  "2026-08-30-black-and-gold": {
    title: "Negro y dorado",
    body: "El verde desapareció: Quantum Learner ahora descansa sobre un fondo negro verdadero, con el acento dorado haciendo el mismo trabajo discreto de siempre. El tema claro se aclaró a un blanco cálido con tinta casi negra. Nada se movió y nada cambió de significado — cada página, gráfico e icono simplemente estrena el nuevo traje, en ambos temas.",
  },
  "2026-08-29-canonical-domain": {
    title: "Quantum Learner ahora vive en quantumlearner.dev",
    body: "La dirección del sitio ahora es quantumlearner.dev. La dirección anterior, quantum.altivum.ai, redirige aquí automáticamente, y todos los marcadores y enlaces compartidos siguen funcionando. Si iniciabas sesión con correo y contraseña, se te pedirá restablecer la contraseña una vez; el inicio de sesión con Google no cambia.",
  },
  "2026-08-28-hardware-lesson-copy": {
    title: "La lección de hardware ahora dice claramente qué está disponible hoy",
    body: "La guía de 02-hardware y el README del proyecto aún describían un beneficio de hardware gratuito que ya había sido retirado. Ambos ahora lo dicen claro: todo lo de la lección funciona gratis en tu navegador con el simulador, y usar un QPU real hoy requiere una cuenta de AWS propia, facturada directamente por AWS.",
  },
  "2026-08-24-after-dark-redesign": {
    title: "Una nueva imagen, y un currículo que puedes pilotar",
    body: "Quantum Learner se ha redibujado: un fondo verde-negro profundo, un acento dorado reservado para lo que vale la pena notar, y una nueva marca |Q⟩. El currículo de la página de inicio es ahora un dial: elige el número de cualquier sección y la aguja se mueve hasta ella con una breve descripción, para que puedas sopesar un módulo antes de abrirlo. Todo se lee igual en ambos temas.",
  },
  "2026-08-20-example-scripts-correctness": {
    title:
      "Los ejemplos de Grover y VQE ya no dan respuestas silenciosamente incorrectas",
    body: "El ejemplo de búsqueda de Grover devolvía una distribución uniforme en lugar de encontrar el elemento marcado en circuitos de cuatro o más cúbits, y el ejemplo de VQE podía etiquetar mal los resultados de medición cuando un circuito omitía un cúbit. Ambos calculan ahora la respuesta correcta en cualquier tamaño — o se detienen con un error claro en vez de reportar un número equivocado.",
  },
  "2026-08-20-kernel-explorer-convention": {
    title:
      "El explorador de kernels ahora prepara los mismos estados que la biblioteca del curso",
    body: "El widget interactivo de kernels codificaba los datos con una convención de mapa de características distinta de la que enseña el curso, así que las mismas entradas producían estados cuánticos diferentes en el widget y en tu propio código. Ahora coinciden exactamente, y el deslizador de escala llega más lejos para que veas dónde empieza realmente la sobrecodificación.",
  },
  "2026-08-20-changelog-page": {
    title: "Un registro público de lo que cambia aquí",
    body: "Esta página enumera lo nuevo, lo que mejoró y lo que se corrigió, de lo más reciente a lo más antiguo, en inglés y en español. Está abierta a cualquiera: no hace falta una cuenta. El registro comienza con esta entrada; nada anterior aparece en la lista.",
  },
};

