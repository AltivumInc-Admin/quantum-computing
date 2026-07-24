/**
 * Spanish translations for the Quantum Learner glossary.
 *
 * GLOSSARY_ES: English term → Spanish definition (prose only; `code` and $math$ preserved)
 * GLOSSARY_TERM_ES: English term → preferred Spanish display form for the term itself
 *
 * Keys must match GLOSSARY[].term exactly (see glossary.ts).
 */

export const GLOSSARY_ES: Record<string, string> = {
  Amplitude:
    "Un número complejo asociado a un estado base en una superposición; su magnitud al cuadrado da la probabilidad de medir ese estado.",
  Ansatz:
    "Un circuito cuántico parametrizado cuyos ángulos de rotación ajusta un optimizador clásico; la forma de prueba sobre la que busca un algoritmo variacional.",
  "Bell pair":
    "Dos cúbits en un estado máximamente entrelazado como $\\ket{\\Phi^+} = (\\ket{00}+\\ket{11})/\\sqrt2$; medir uno fija el resultado del otro.",
  "Bloch sphere":
    "Una representación geométrica de un cúbit como un punto en una esfera unitaria: $\\ket{0}$ en el polo norte, $\\ket{1}$ en el polo sur, y superposiciones iguales en el ecuador.",
  "Born rule":
    "La regla según la cual la probabilidad de un resultado de medición es igual a la magnitud al cuadrado de su amplitud, $|\\alpha|^2$.",
  "CNOT gate":
    "Una compuerta de dos cúbits que invierte el cúbit objetivo cuando el control está en $\\ket{1}$; la compuerta entrelazadora estándar.",
  Entanglement:
    "Una correlación entre cúbits sin análogo clásico: el estado conjunto no se puede factorizar en estados independientes de un solo cúbit.",
  "Hadamard gate":
    "La compuerta que mapea $\\ket{0}$ a $(\\ket{0}+\\ket{1})/\\sqrt{2}$ y $\\ket{1}$ a $(\\ket{0}-\\ket{1})/\\sqrt{2}$; la herramienta principal para entrar en superposición.",
  Hamiltonian:
    "El operador que representa la energía total de un sistema; su autovalor más bajo es la energía del estado fundamental que algoritmos como VQE estiman.",
  Measurement:
    "Leer un cúbit, lo que colapsa su superposición a un estado base con una probabilidad dada por la regla de Born.",
  Qubit:
    "La unidad básica de información cuántica: un sistema de dos niveles cuyo estado es un vector unitario $\\alpha\\ket{0}+\\beta\\ket{1}$ en $\\mathbb{C}^2$.",
  Superposition:
    "Un estado de un cúbit que es una combinación lineal de estados base, sosteniendo $\\ket{0}$ y $\\ket{1}$ a la vez hasta que se mide.",
  "Unitary matrix":
    "Una matriz $U$ con $U^\\dagger U = I$; toda compuerta cuántica es unitaria porque tales matrices preservan la norma de un estado.",
  "Variational quantum eigensolver":
    "Un algoritmo híbrido que mide la energía de un Hamiltoniano en un dispositivo cuántico mientras un optimizador clásico la minimiza para estimar el estado fundamental.",

  "Hilbert space":
    "El espacio vectorial complejo en el que vive un estado cuántico; el de un solo cúbit es $\\mathbb{C}^2$ y $n$ cúbits comparten un espacio de dimensión $2^n$.",
  "Inner product":
    "Un número complejo $\\braket{a}{b}$ que mide el solapamiento entre dos estados; es cero cuando son ortogonales y se escribe `a.conj() @ b` en NumPy.",
  Norm:
    "La longitud de un vector de estado, $\\sqrt{\\braket{\\psi}{\\psi}}$; los estados cuánticos se normalizan a norma 1 para que sus probabilidades de medición sumen uno.",
  "Computational basis":
    "La base de medición por defecto $\\{\\ket{0}, \\ket{1}\\}$ de un cúbit (y $\\ket{00}, \\ket{01}, \\dots$ para varios); los estados en los que una medición reporta sus resultados.",
  "Tensor product":
    "La operación $\\otimes$ que combina estados de un solo cúbit en un estado multi-cúbit, escrita `np.kron` en NumPy; $n$ cúbits dan un espacio de dimensión $2^n$.",
  "Hermitian operator":
    "Un operador igual a su propia traspuesta conjugada, $A = A^\\dagger$; sus autovalores son reales, por eso los observables físicos como el Hamiltoniano son hermitianos.",
  Eigenvalue:
    "Un escalar $\\lambda$ para el cual $A\\ket{v} = \\lambda\\ket{v}$; para un Hamiltoniano los autovalores son las energías permitidas, la menor es la del estado fundamental.",
  Eigenvector:
    "Un vector no nulo $\\ket{v}$ que un operador solo reescala, $A\\ket{v} = \\lambda\\ket{v}$, dejando su dirección sin cambios.",
  "Dirac notation":
    "La notación cuántica estándar: un ket $\\ket{\\psi}$ es un vector columna (un estado), un bra $\\bra{\\psi}$ su fila traspuesta conjugada, y $\\braket{a}{b}$ su producto interior.",
  "Expectation value":
    "El promedio ponderado por probabilidad de los resultados de un observable, $\\expval{A} = \\bra{\\psi} A \\ket{\\psi}$; VQE funciona minimizando el valor esperado de un Hamiltoniano.",

  "Quantum gate":
    "Una operación unitaria que transforma estados de cúbits; en un solo cúbit toda compuerta es una rotación de la esfera de Bloch, y las compuertas son los verbos de un circuito.",
  "Pauli gates":
    "Las tres compuertas de un solo cúbit $X$, $Y$ y $Z$ — medios giros sobre los ejes de Bloch; $X$ intercambia $\\ket{0}\\leftrightarrow\\ket{1}$ y $Z$ invierte el signo de $\\ket{1}$.",
  "Phase gate":
    "Una compuerta que añade una fase a $\\ket{1}$ dejando $\\ket{0}$ fijo; la compuerta $S$ es un cuarto de giro sobre Z ($\\pi/2$) y la $T$ un octavo de giro ($\\pi/4$).",
  "Rotation gate":
    "Una compuerta parametrizada de un solo cúbit $R_x(\\theta)$, $R_y(\\theta)$ o $R_z(\\theta)$ que rota el vector de Bloch un ángulo $\\theta$ sobre un eje; el mando ajustable de los circuitos variacionales.",
  "Controlled gate":
    "Una compuerta de dos cúbits que aplica una operación al cúbit objetivo solo cuando el cúbit de control está en $\\ket{1}$; CNOT y CZ son los ejemplos habituales.",
  "Quantum circuit":
    "Una secuencia de compuertas aplicadas a cúbits inicializados en $\\ket{0}$ y leídos por medición; sus dos tamaños son profundidad (pasos de tiempo) y anchura (número de cúbits).",
  "Global phase":
    "Un factor global $e^{i\\gamma}$ que multiplica un estado entero; es físicamente inobservable porque la regla de Born solo depende de las magnitudes al cuadrado.",
  "Relative phase":
    "La diferencia de fase entre las partes $\\ket{0}$ y $\\ket{1}$ de una superposición; a diferencia de una fase global es física y se revela mediante interferencia.",
  Interference:
    "El refuerzo y la cancelación de amplitudes; los algoritmos cuánticos la organizan para que las respuestas incorrectas se cancelen y las correctas se sumen antes de la medición.",
  "No-cloning theorem":
    "El resultado de que ninguna operación puede copiar un estado cuántico arbitrario desconocido; subyace a la teleportación cuántica y a la criptografía cuántica.",
  Statevector:
    "La lista de $2^n$ amplitudes complejas que describe por completo un estado puro de $n$ cúbits; el simulador local la calcula exactamente.",
  Shots:
    "Repeticiones de preparar y medir un circuito; el histograma sobre muchos shots se aproxima a las probabilidades de la regla de Born, y las QPU cobran por shot.",

  "Amazon Braket":
    "El servicio gestionado de computación cuántica de AWS que expone un único SDK y API para ejecutar circuitos en simuladores y en QPUs de varios proveedores de hardware.",
  QPU:
    "Una Quantum Processing Unit — hardware cuántico real; en Braket son los dispositivos de IonQ, IQM y QuEra, facturados por tarea más por shot.",
  "Quantum simulator":
    "Software clásico que calcula el resultado de un circuito; Braket ofrece SV1 (vector de estado exacto), DM1 (matriz de densidad, modela ruido) y TN1 (red tensorial).",
  LocalSimulator:
    "El simulador gratuito e instantáneo de Braket que se ejecuta en tu propia máquina; el valor por defecto recomendado para desarrollar y depurar circuitos de hasta unos 25 cúbits.",
  "Qubit connectivity":
    "Qué cúbits de un dispositivo pueden interactuar directamente; la conectividad all-to-all entrelaza cualquier par, mientras que una red fuerza SWAPs para juntar cúbits distantes.",
  "Native gate set":
    "Las compuertas específicas que un dispositivo ejecuta en hardware; todo circuito se transpila primero a este conjunto, p. ej. GPi/GPi2/MS en IonQ o CZ/PRx en IQM.",
  Transpilation:
    "Reescribir un circuito en las compuertas nativas y la conectividad de un dispositivo, insertando SWAPs para juntar cúbits distantes; puede aumentar la profundidad del circuito y añadir ruido.",
  "Coherence time":
    "Cuánto tiempo un cúbit mantiene su estado cuántico antes de decaer; $T_1$ mide la relajación energética y $T_2$ el desfase, y un circuito debe terminar bien dentro de ese tiempo.",
  Decoherence:
    "La pérdida gradual de la información cuántica de un cúbit hacia su entorno, difuminando los picos de probabilidad ideales del circuito hacia ruido aleatorio; el problema definitorio de la era NISQ.",
  "Noise model":
    "Una descripción de cómo un dispositivo corrompe un circuito, como canales depolarizantes o de amortiguación de amplitud; el simulador DM1 de Braket los aplica para estudiar errores antes de pagar por hardware.",
  "Gate fidelity":
    "Con qué precisión una compuerta realiza su operación prevista, a menudo por encima del 99% por compuerta de un solo cúbit; como los errores se acumulan, una baja fidelidad de dos cúbits limita la profundidad del circuito.",
  "Readout error":
    "La probabilidad de que medir un cúbit reporte el valor incorrecto, p. ej. leer un $\\ket{0}$ como $\\ket{1}$; la mitad de medición del error SPAM (preparación-y-medición de estado), distinta del ruido de compuertas.",
  "Trapped-ion qubit":
    "Un cúbit codificado en los niveles de energía de un átomo cargado individual sujeto por campos electromagnéticos; el enfoque de IonQ, valorado por su conectividad all-to-all y larga coherencia.",
  "Superconducting qubit":
    "Un cúbit construido con un diminuto circuito superconductor (transmon) enfriado cerca del cero absoluto y controlado por microondas; el enfoque de IQM, con compuertas rápidas de nanosegundos pero conectividad en red.",
  "Neutral-atom qubit":
    "Un cúbit codificado en un átomo neutro sujetado por una pinza óptica; Aquila de QuEra usa arrays de ellos para simulación analógica de Hamiltonianos en lugar de un circuito de compuertas.",
  "Braket task":
    "Una sola solicitud de ejecución de circuito enviada a un dispositivo Braket con un número de shots elegido; las QPU cobran una tarifa fija por tarea más una tarifa por shot.",

  "Quantum algorithm":
    "Un procedimiento que usa superposición, entrelazamiento e interferencia para resolver ciertos problemas con menos operaciones que el mejor método clásico conocido.",
  Oracle:
    "Una compuerta reversible de caja negra $U_f$ que codifica la función de un problema; un oráculo de fase marca soluciones invirtiendo su signo, $\\ket{x} \\mapsto (-1)^{f(x)}\\ket{x}$.",
  "Deutsch–Jozsa algorithm":
    "Un algoritmo de oráculo que decide si una función es constante o balanceada con una sola consulta, donde los métodos clásicos pueden necesitar exponencialmente muchas; la demostración más clara de aceleración por interferencia.",
  "Bernstein–Vazirani algorithm":
    "Un algoritmo de oráculo que recupera una cadena de bits oculta $s$ de $f(x) = s\\cdot x$ con una sola consulta, frente a las $n$ consultas que necesita un método clásico.",
  "Grover's algorithm":
    "Un algoritmo de búsqueda que encuentra un elemento marcado entre $N$ en $O(\\sqrt{N})$ consultas — una aceleración cuadrática — amplificando repetidamente la amplitud marcada.",
  "Amplitude amplification":
    "La generalización del truco de Grover: cada iteración refleja el estado respecto a los elementos marcados y luego respecto a la media, rotando amplitud hacia la respuesta.",
  "Quantum Fourier transform":
    "El análogo cuántico de la transformada discreta de Fourier, construido con Hadamards y rotaciones de fase controladas en $O(n^2)$ compuertas; expone la periodicidad en un estado.",
  "Quantum phase estimation":
    "Un algoritmo que estima la autofase $\\phi$ de una unitaria con $U\\ket{u} = e^{2\\pi i\\phi}\\ket{u}$ usando una QFT inversa; el motor del algoritmo de Shor y de la estimación de energía.",
  "Quantum teleportation":
    "Un protocolo que transfiere un estado de cúbit desconocido usando un par de Bell compartido y dos bits clásicos, consumiendo el entrelazamiento; no mueve materia ni envía información más rápido que la luz.",
  "Superdense coding":
    "Un protocolo que envía dos bits clásicos transmitiendo un solo cúbit, usando un par de Bell precompartido; el dual conceptual de la teleportación.",
  "Quantum speedup":
    "La ventaja que un algoritmo cuántico tiene sobre el mejor clásico para una tarea, desde cuadrática (Grover) hasta exponencial (Shor) — y solo para problemas con la estructura adecuada.",

  "Quantum machine learning":
    "Aprendizaje automático en el que el modelo es un circuito cuántico: los datos clásicos se codifican en un estado, un circuito parametrizado lo transforma y una medición lee la predicción.",
  "Parameterized quantum circuit":
    "Un circuito cuyos ángulos de compuerta $\\theta$ son parámetros ajustables que definen una función $f(x;\\theta)$; el análogo cuántico de una red neuronal con pesos entrenables.",
  "Variational quantum circuit":
    "Un circuito parametrizado entrenado por un optimizador clásico para minimizar un coste, usado como clasificador o regresor cuántico; lo cuántico propone, lo clásico dispone, y se repite.",
  PennyLane:
    "Un framework de código abierto para programación cuántica diferenciable que ofrece gradientes por parameter-shift, optimizadores y cambio de dispositivo en una línea; se ejecuta en Braket mediante un plugin.",
  "Data encoding":
    "Cómo se cargan los datos clásicos en un estado cuántico; la elección (ángulo, amplitud, IQP) fija el espacio de características que el modelo puede ver, convirtiéndola en una decisión de modelado y no en una formalidad.",
  "Parameter-shift rule":
    "Una forma de obtener el gradiente exacto del valor esperado de un circuito respecto a un ángulo de compuerta a partir de dos evaluaciones, $\\tfrac{1}{2}[f(\\theta+\\tfrac{\\pi}{2}) - f(\\theta-\\tfrac{\\pi}{2})]$ — sin diferencias finitas.",
  "Cost function":
    "El escalar que minimiza un algoritmo variacional, calculado a partir de mediciones del circuito; usar un coste local (un cúbit) en lugar de uno global es la mitigación clave de las barren plateaus.",
  "Barren plateau":
    "Un paisaje de entrenamiento en el que el gradiente del coste se anula exponencialmente con el número de cúbits ($\\mathrm{Var} \\sim 2^{-n}$), de modo que el optimizador ve una superficie plana; se mitiga con costes locales y ansätze estructurados.",

  "Ground-state energy":
    "El autovalor más bajo del Hamiltoniano de una molécula — la energía de su configuración electrónica más estable; calcularlo predice estabilidad, enlaces y reacciones.",
  "Jordan–Wigner transformation":
    "Un mapeo de operadores fermiónicos de creación y aniquilación a operadores de cúbit (Pauli); adjunta una cadena de $Z$ para codificar la antisimetría de los electrones.",
  "Second quantization":
    "Una formulación que rastrea la ocupación orbital en lugar de las posiciones de los electrones, usando operadores de creación y aniquilación; concentra todo el Hamiltoniano de una molécula en un operador compacto.",
  "Fermionic operator":
    "Un operador de creación $a_p^\\dagger$ que añade un electrón al orbital $p$ o un operador de aniquilación $a_p$ que elimina uno; su anticonmutación codifica el principio de exclusión de Pauli.",
  "Pauli string":
    "Un producto tensorial de operadores de Pauli como $Z_0 X_1 I_2$ que actúa sobre varios cúbits; un Hamiltoniano de cúbits es una suma ponderada de cadenas de Pauli, cada una medida para estimar la energía.",
  Trotterization:
    "Aproximar la evolución temporal $e^{-iHt}$ de una suma de términos que no conmutan mediante un producto de evoluciones pequeñas de un solo término; la base de la simulación digital de Hamiltonianos.",
  "Potential energy surface":
    "La curva de la energía del estado fundamental de una molécula en función de su geometría; su mínimo da la longitud de enlace de equilibrio y su profundidad la fuerza del enlace.",
  OpenFermion:
    "Una biblioteca de código abierto para química cuántica que construye Hamiltonianos moleculares y mapea operadores fermiónicos a operadores de cúbit; se combina con PySCF para las integrales clásicas.",
  "Hartree–Fock":
    "Un método clásico de campo medio que trata cada electrón como moviéndose en el campo promedio de los demás; preciso cerca del equilibrio pero omite la energía de correlación al estirar los enlaces.",
  "Electronic structure":
    "La disposición y las energías de los electrones de una molécula; resolverla — encontrar el estado fundamental del Hamiltoniano electrónico — es el problema central de la química cuántica.",

  "Hybrid quantum-classical algorithm":
    "Un algoritmo que alterna entre un dispositivo cuántico y un ordenador clásico — la parte cuántica prepara y mide estados, la clásica optimiza parámetros; VQE y QAOA son los arquetipos.",
  "Amazon Braket Hybrid Jobs":
    "Un servicio gestionado de Braket que ejecuta tu bucle variacional en una instancia clásica con acceso prioritario a QPU, compilando una vez, haciendo checkpointing y transmitiendo métricas, y desmontándose al terminar.",
  "Classical optimizer":
    "La rutina clásica que actualiza los parámetros de un circuito variacional para minimizar el coste; opciones habituales son COBYLA, Nelder–Mead, SPSA y Adam.",
  QAOA:
    "Un algoritmo variacional para optimización combinatoria que alterna una unitaria del Hamiltoniano de coste con un mixer, ajustando los ángulos $(\\gamma, \\beta)$ con un optimizador clásico; MaxCut es el ejemplo canónico.",
  "Cost Hamiltonian":
    "En QAOA, el operador $C$ que codifica el problema de optimización; su unitaria $e^{-i\\gamma C}$ imprime el valor de cada solución candidata como una fase.",
  "Mixer Hamiltonian":
    "En QAOA, el operador $B$ (típicamente $\\sum_q X_q$) cuya unitaria $e^{-i\\beta B}$ reparte amplitud entre soluciones candidatas para que las buenas asignaciones puedan crecer.",
  "Optimization loop":
    "El ciclo repetitivo de un algoritmo variacional: preparar un estado parametrizado, medir el coste, dejar que el optimizador clásico elija nuevos parámetros, y repetir hasta la convergencia.",
  Checkpointing:
    "Guardar periódicamente el estado del optimizador de un job para que una ejecución larga que falle pueda reanudarse desde el último guardado en lugar de reiniciar; `save_job_checkpoint()` y `load_job_checkpoint()` en Braket.",
};

/** English term → preferred Spanish display form (learner-facing). */
export const GLOSSARY_TERM_ES: Record<string, string> = {
  Amplitude: "Amplitud",
  Ansatz: "Ansatz",
  "Bell pair": "Par de Bell",
  "Bloch sphere": "Esfera de Bloch",
  "Born rule": "Regla de Born",
  "CNOT gate": "Compuerta CNOT",
  Entanglement: "Entrelazamiento",
  "Hadamard gate": "Compuerta de Hadamard",
  Hamiltonian: "Hamiltoniano",
  Measurement: "Medición",
  Qubit: "Cúbit",
  Superposition: "Superposición",
  "Unitary matrix": "Matriz unitaria",
  "Variational quantum eigensolver": "Solucionador variacional de autovalores cuánticos",

  "Hilbert space": "Espacio de Hilbert",
  "Inner product": "Producto interior",
  Norm: "Norma",
  "Computational basis": "Base computacional",
  "Tensor product": "Producto tensorial",
  "Hermitian operator": "Operador hermitiano",
  Eigenvalue: "Autovalor",
  Eigenvector: "Autovector",
  "Dirac notation": "Notación de Dirac",
  "Expectation value": "Valor esperado",

  "Quantum gate": "Compuerta cuántica",
  "Pauli gates": "Compuertas de Pauli",
  "Phase gate": "Compuerta de fase",
  "Rotation gate": "Compuerta de rotación",
  "Controlled gate": "Compuerta controlada",
  "Quantum circuit": "Circuito cuántico",
  "Global phase": "Fase global",
  "Relative phase": "Fase relativa",
  Interference: "Interferencia",
  "No-cloning theorem": "Teorema de no clonación",
  Statevector: "Vector de estado",
  Shots: "Shots",

  "Amazon Braket": "Amazon Braket",
  QPU: "QPU",
  "Quantum simulator": "Simulador cuántico",
  LocalSimulator: "LocalSimulator",
  "Qubit connectivity": "Conectividad de cúbits",
  "Native gate set": "Conjunto de compuertas nativas",
  Transpilation: "Transpilación",
  "Coherence time": "Tiempo de coherencia",
  Decoherence: "Decoherencia",
  "Noise model": "Modelo de ruido",
  "Gate fidelity": "Fidelidad de compuerta",
  "Readout error": "Error de lectura",
  "Trapped-ion qubit": "Cúbit de ion atrapado",
  "Superconducting qubit": "Cúbit superconductor",
  "Neutral-atom qubit": "Cúbit de átomo neutro",
  "Braket task": "Tarea de Braket",

  "Quantum algorithm": "Algoritmo cuántico",
  Oracle: "Oráculo",
  "Deutsch–Jozsa algorithm": "Algoritmo de Deutsch–Jozsa",
  "Bernstein–Vazirani algorithm": "Algoritmo de Bernstein–Vazirani",
  "Grover's algorithm": "Algoritmo de Grover",
  "Amplitude amplification": "Amplificación de amplitud",
  "Quantum Fourier transform": "Transformada cuántica de Fourier",
  "Quantum phase estimation": "Estimación de fase cuántica",
  "Quantum teleportation": "Teleportación cuántica",
  "Superdense coding": "Codificación superdensa",
  "Quantum speedup": "Aceleración cuántica",

  "Quantum machine learning": "Aprendizaje automático cuántico",
  "Parameterized quantum circuit": "Circuito cuántico parametrizado",
  "Variational quantum circuit": "Circuito cuántico variacional",
  PennyLane: "PennyLane",
  "Data encoding": "Codificación de datos",
  "Parameter-shift rule": "Regla de parameter-shift",
  "Cost function": "Función de coste",
  "Barren plateau": "Meseta estéril",

  "Ground-state energy": "Energía del estado fundamental",
  "Jordan–Wigner transformation": "Transformación de Jordan–Wigner",
  "Second quantization": "Segunda cuantización",
  "Fermionic operator": "Operador fermiónico",
  "Pauli string": "Cadena de Pauli",
  Trotterization: "Trotterización",
  "Potential energy surface": "Superficie de energía potencial",
  OpenFermion: "OpenFermion",
  "Hartree–Fock": "Hartree–Fock",
  "Electronic structure": "Estructura electrónica",

  "Hybrid quantum-classical algorithm": "Algoritmo híbrido cuántico-clásico",
  "Amazon Braket Hybrid Jobs": "Amazon Braket Hybrid Jobs",
  "Classical optimizer": "Optimizador clásico",
  QAOA: "QAOA",
  "Cost Hamiltonian": "Hamiltoniano de coste",
  "Mixer Hamiltonian": "Hamiltoniano mezclador",
  "Optimization loop": "Bucle de optimización",
  Checkpointing: "Checkpointing",
};
