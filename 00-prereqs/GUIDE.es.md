# Prerrequisitos: De cero a listo para quantum

Este es el módulo de entrada. Si **no tienes formación en computación cuántica**, empieza aquí. Al final de este módulo tendrás la matemática, el código y la intuición que necesitas para comenzar [01-foundations](../01-foundations/GUIDE.md) sin perderte en la notación.

Si ya te sientes cómodo con números complejos, vectores, matrices, NumPy, probabilidad básica y la idea de un cúbit como un vector unitario en C^2, puedes saltar a [01-foundations](../01-foundations/GUIDE.md). El cuestionario de ubicación al final de esta GUIDE te lo confirmará.

## Objetivos de aprendizaje

Al completar esta sección, serás capaz de:

- Usar Python y NumPy para manipular vectores, matrices y números complejos con fluidez
- Leer y escribir notación de Dirac (bra-ket) y traducirla a código NumPy de inmediato
- Explicar en lenguaje sencillo qué es un cúbit, qué es la superposición y qué hace la medición
- Calcular productos internos, productos tensoriales y decidir si una matriz es unitaria
- Razonar sobre probabilidades, muestreo y la regla de Born antes de introducir cualquier formalismo cuántico
- Visualizar estados de un solo cúbit en la esfera de Bloch y predecir resultados de medición

## Prerrequisitos de este módulo de prerrequisitos

- Álgebra de secundaria
- Comodidad al ejecutar Python (no necesitas ser experto)
- Una laptop que pueda ejecutar `pip install numpy matplotlib jupyterlab`

**NO necesitas:** credenciales de AWS, una cuenta de AWS, Docker ni ningún SDK cuántico para completar este módulo. Todo corre de forma local en NumPy.

## Cómo se diferencia este módulo del resto del currículo

El resto del repositorio asume que puedes leer `|psi> = alpha|0> + beta|1>` y que sabes qué significa "unitaria". Este módulo asume que no, y enseña ambas cosas. Cada símbolo formal se introduce primero en lenguaje sencillo, luego se traduce a código NumPy y solo después se escribe en notación matemática.

Cada notebook sigue la misma forma:

1. **Lenguaje sencillo** — la idea, sin matemática
2. **Código primero** — la idea en NumPy
3. **Notación** — los símbolos formales, mapeados uno a uno de vuelta al código
4. **Autoverificación** — tres ejercicios cortos con respuestas en las celdas de solución compañeras

---

## Configuración (90 segundos, sin AWS)

Desde la raíz del repositorio:

```bash
python -m venv .venv
source .venv/bin/activate    # on Windows: .venv\Scripts\activate
pip install numpy matplotlib jupyterlab ipywidgets
jupyter lab 00-prereqs/notebooks
```

Eso es toda la configuración. Sin `make setup`, sin credenciales de AWS, sin roles de IAM. Esos llegan más adelante en `02-hardware`.

---

## Conceptos

Este módulo cubre seis temas bien delimitados. Cada uno corresponde a un notebook.

### 1. Calentamiento de Python y NumPy

Toda la pila cuántica se construye sobre álgebra lineal, y toda la pila de álgebra lineal en este repositorio se construye sobre NumPy. Antes de tocar un solo cúbit necesitas poder:

- Crear vectores y matrices con `np.array`
- Multiplicarlos con `@`
- Calcular productos punto, normas, conjugados y transpuestas
- Construir matrices por bloques y productos tensoriales (Kronecker) con `np.kron`
- Trabajar con números complejos usando el `1j` integrado de Python

Si esos nombres ya te resultan rutinarios, revisa a vuelo de pájaro el primer notebook y sigue adelante.

### 2. Álgebra lineal para quantum

Necesitas memoria de trabajo de cinco cosas:

- **Vectores** — listas ordenadas de números complejos. Un estado de cúbit es un 2-vector. Un estado de n cúbits es un 2^n-vector.
- **Producto interno** `<a|b>` — mide el solapamiento entre dos estados. Cero significa ortogonales.
- **Norma** — la longitud de un vector. Los estados cuánticos siempre tienen norma 1.
- **Matriz unitaria** — una matriz `U` tal que `U† U = I`. Las matrices unitarias preservan la norma, que es por lo que cada puerta cuántica es unitaria.
- **Producto tensorial** `⊗` — cómo construyes estados de varios cúbits a partir de estados de un solo cúbit.

```qcard
{"id":"prereq-unitary-1","prompt":"¿Qué condición debe satisfacer una matriz `U` para ser unitaria, y por qué cada puerta cuántica tiene que serlo?","answer":"Debe satisfacer `U† U = I` (la transpuesta conjugada por la matriz es igual a la identidad). Las matrices unitarias preservan la norma, y como los estados cuánticos siempre tienen norma 1, cada puerta debe ser unitaria para mantener eso verdadero."}
```

NO necesitas valores propios, determinantes ni rango para este módulo. Aparecen más adelante en `03-algorithms` y los introduciremos ahí.

### 3. Probabilidad y medición (aún sin quantum)

La medición cuántica es probabilística. Antes de poder entender la regla de Born necesitas fluidez en probabilidad clásica:

- Una distribución de probabilidad asigna números no negativos que suman 1 a través de los resultados
- "Muestrear" significa extraer un resultado aleatorio de acuerdo con esa distribución
- La distribución empírica de N muestras converge a la distribución verdadera a medida que N crece
- Un **valor esperado** es un promedio ponderado sobre una distribución

Simularemos monedas sesgadas en NumPy hasta que esto se sienta obvio. Luego, en el siguiente notebook, reinterpretaremos la medición cuántica como nada más que muestrear de una distribución calculada a partir de un vector de estado.

Aquí va esa reinterpretación en miniatura, una sección antes. El observable `Z` es solo una regla de puntuación: el resultado `0` puntúa `+1`, el resultado `1` puntúa `-1`, y el valor esperado es el promedio ponderado de esas puntuaciones. Un cúbit que nadie ha tocado da el resultado `0` todas las veces — así que este promedio no requiere ningún cálculo. Comprométete con ello:

```qexpect
{
  "id": "prereq-expect-certain-1",
  "prompt": "Un cúbit fresco empieza en |0⟩ y nadie lo toca (el circuito aplica solo la identidad). El observable Z puntúa el resultado 0 como +1 y el resultado 1 como −1. ¿Cuál es el valor esperado ⟨Z⟩?",
  "program": "I 0",
  "observable": "Z 0",
  "hint": "Un valor esperado es un promedio ponderado: (+1)·P(0) + (−1)·P(1). Aquí la distribución es cierta — P(0) = 1, P(1) = 0 — así que el promedio es igual a la única puntuación que se produce. La certeza es el único caso en el que el promedio a largo plazo y una sola muestra coinciden."
}
```

### 4. Qué es un cúbit, en palabras

La mayoría de las introducciones saltan directo a `|psi> = alpha|0> + beta|1>` y pierden a la gente. Nosotros no. La progresión es:

1. Un bit clásico es una moneda que yace plana: cara o cruz.
2. Un cúbit es una moneda que ha sido **girada**: tiene una dirección hacia la que se inclina, pero solo ves cara o cruz cuando la detienes (mides).
3. La "dirección hacia la que se inclina" se captura con dos números complejos `(alpha, beta)`.
4. La probabilidad de ver cara cuando detienes el giro es `|alpha|^2`.

```qcard
{"id":"prereq-born-rule-1","prompt":"Para un estado de cúbit con amplitudes `(alpha, beta)`, ¿cuál es la probabilidad de medir cara (el resultado `|0>`)?","answer":"Es `|alpha|^2`, la magnitud al cuadrado de la primera amplitud."}
```

Eso es todo. El resto del módulo construye la maquinaria matemática para hacer esto preciso. La intuición se mantiene igual hasta el final del currículo.

Un movimiento está disponible antes de cualquier giro, y la intuición clásica ya lo cubre: la puerta `X` voltea la moneda sin girarla — cara hacia arriba se vuelve cruz hacia arriba, `|0>` se vuelve `|1>`. Predice qué lee detener la moneda:

```qpredict
{
  "id": "prereq-predict-flip-1",
  "prompt": "Un cúbit empieza como la moneda que yace con cara hacia arriba: |0⟩. La puerta X la voltea sin girarla. ¿Qué resultado lee la medición?",
  "program": "X 0",
  "mode": "top-outcome",
  "hint": "X intercambia las dos amplitudes: (1, 0) se convierte en (0, 1). Toda la probabilidad ahora está en el resultado |1⟩ — no hay aleatoriedad, porque una moneda volteada sigue siendo una moneda definida."
}
```

Leer el volteo de alguien más es una cosa; escribirlo es otra. Este es tu primer circuito — una puerta, una línea:

```qchallenge
{
  "id": "prereq-challenge-flip-1",
  "prompt": "Prepara |1⟩ — la moneda que yace con cruz hacia arriba — partiendo de |0⟩.",
  "qubits": 1,
  "target": { "program": "X 0" },
  "allowedGates": ["X"],
  "hint": "Solo tienes el volteo. Una sola X convierte las amplitudes (1, 0) en (0, 1), que es exactamente |1⟩ — una línea basta."
}
```

Observa el giro en acción. Abajo, el cúbit 0 empieza como la moneda que yace plana — `|0>`, cara hacia arriba con certeza. Aplica un Hadamard (`H`) y se convierte en el giro perfectamente equilibrado `|+>`: deténlo ahora y las barras dicen cara o cruz con las mismas probabilidades. Esta es toda la historia de la sección 4 en una sola puerta — lee las probabilidades tú mismo.

```qsim
qubits 1
H 0
```

El simulador acaba de entregarte las barras. Ahora haz tuya la afirmación — comprométete con una predicción calificada de en qué caras puede aterrizar realmente una moneda girada:

```qpredict
{
  "id": "prereq-predict-spun-coin-1",
  "prompt": "Gira la moneda: aplica H a un cúbit que empieza en |0⟩. ¿Qué resultados de medición tienen probabilidad distinta de cero?",
  "program": "H 0",
  "mode": "nonzero-states",
  "hint": "H convierte las amplitudes (1, 0) en (1/√2, 1/√2). Ambas amplitudes son distintas de cero, así que ambos resultados pueden ocurrir — cada uno con probabilidad |1/√2|² = 1/2. Una moneda girada puede aterrizar de cualquier lado."
}
```

### 5. Notación de Dirac, decodificada

La notación de Dirac es solo NumPy compacto. Construiremos una tabla de traducción uno a uno:

| Dirac | NumPy | Lenguaje sencillo |
|---|---|---|
| `|0>` | `np.array([1, 0])` | El estado "cero" |
| `|1>` | `np.array([0, 1])` | El estado "uno" |
| `<psi|` | `psi.conj()` (como fila) | El "bra" — la transpuesta conjugada de un ket |
| `<a|b>` | `a.conj() @ b` | Producto interno (un número complejo) |
| `|a><b|` | `np.outer(a, b.conj())` | Producto externo (una matriz) |
| `|a> ⊗ |b>` | `np.kron(a, b)` | Producto tensorial (un vector más largo) |
| `U|psi>` | `U @ psi` | Aplicar una puerta |

```qcard
{"id":"prereq-inner-product-1","prompt":"En la traducción de Dirac a NumPy, ¿cómo escribes el producto interno `<a|b>`, y qué tipo de objeto produce?","answer":"Escríbelo como `a.conj() @ b`, que produce un solo número complejo."}
```

Un sándwich construido a partir de esa tabla merece mención especial: `<psi|Z|psi>` — bra, matriz, ket — es cómo se escribe cada valor esperado en mecánica cuántica, y no es más que `psi.conj() @ Z @ psi`. Evalúalo para la moneda volteada:

```qexpect
{
  "id": "prereq-expect-sandwich-1",
  "prompt": "Evalúa el sándwich ⟨ψ|Z|ψ⟩ para |ψ⟩ = |1⟩, preparado aplicando X a |0⟩. Z puntúa el resultado 0 como +1 y el resultado 1 como −1. ¿Cuál es el valor esperado?",
  "program": "X 0",
  "observable": "Z 0",
  "hint": "En NumPy esto es psi.conj() @ Z @ psi con psi = [0, 1]. Z invierte el signo de la amplitud |1⟩, así que Z|ψ⟩ = −|ψ⟩ y el producto interno da −1 — la imagen espejo de ⟨0|Z|0⟩ = +1. Ambos son certezas, en extremos opuestos de la escala."
}
```

Al final de este notebook leerás `<0|H|+>` y de inmediato irás por `zero.conj() @ H @ plus` sin pensarlo.

Esa expresión merece una predicción propia. `<0|H|+> = 1` dice que aplicar `H` a `|+>` aterriza exactamente en `|0>` — solapamiento uno, certeza. Ejecuta la secuencia de dos puertas en tu cabeza y luego comprométete:

```qpredict
{
  "id": "prereq-predict-double-h-1",
  "prompt": "Aplica H dos veces seguidas a un cúbit que empieza en |0⟩. ¿Qué único resultado lee la medición?",
  "program": "H 0\nH 0",
  "mode": "top-outcome",
  "hint": "El primer H produce |+⟩ = (|0⟩ + |1⟩)/√2; el segundo envía |+⟩ de regreso a |0⟩ — eso es exactamente lo que dice ⟨0|H|+⟩ = 1. H es su propia inversa, así que se obtiene el resultado 0 con certeza, no un segundo giro 50/50."
}
```

### 6. Patio de juegos de la esfera de Bloch

La esfera de Bloch es el modelo mental estándar para un solo cúbit. La haremos interactiva: arrastra los deslizadores de `theta` y `phi`, observa cómo se actualiza el estado, observa cómo se actualizan las probabilidades de medición predichas y ejecuta un experimento virtual para confirmar.

Este notebook es donde se consolida la intuición. Si te vas creyendo que

- el polo norte es `|0>`
- el polo sur es `|1>`
- el ecuador es "superposición máxima"
- las rotaciones en la esfera son exactamente lo que hacen las puertas

```qcard
{"id":"prereq-bloch-poles-1","prompt":"En la esfera de Bloch, ¿qué estados de un solo cúbit se sitúan en el polo norte, el polo sur y el ecuador?","answer":"El polo norte es `|0>`, el polo sur es `|1>`, y el ecuador representa superposición máxima."}
```

Demuéstrate el segundo de esos polos. En la esfera, la puerta de volteo `X` es un medio giro que lleva el polo norte al polo sur. Lleva el vector hasta allá y verifica tu colocación:

```qblochtarget
{
  "id": "prereq-bloch-south-1",
  "prompt": "Lleva el vector de Bloch al polo sur — |1⟩, el estado que X prepara a partir de |0⟩.",
  "target": { "program": "X 0" },
  "toleranceDeg": 5,
  "hint": "El ángulo polar θ mide cuánto se ha inclinado la flecha lejos de |0⟩ en el polo norte. El polo sur está del todo abajo: θ = π — y φ no importa, porque todos los meridianos se encuentran en un polo."
}
```

Arrastra $\theta$ abajo y observa cómo el vector de Bloch se balancea desde el polo norte ($\ket{0}$) hacia el ecuador — esto es exactamente lo que hace $R_y(\theta)$. Arrastra la esfera misma para rotar tu vista, o presiona play para barrer la rotación:

```qscrub
qubits 1
RY 0 theta
```

Detén ese barrido en $\theta = \pi/2$ y la flecha descansa en el ecuador — el estado exacto que produjo el Hadamard en la sección 4. Aterriza en él con precisión:

```qblochtarget
{
  "id": "prereq-bloch-equator-1",
  "prompt": "Lleva el vector de Bloch a |+⟩ = (|0⟩ + |1⟩)/√2 — el punto del ecuador donde vive la moneda girada de la sección 4.",
  "target": { "program": "H 0" },
  "toleranceDeg": 5,
  "hint": "Superposición máxima significa probabilidades iguales, lo que fija la flecha en el ecuador: θ = π/2. El signo más elige el meridiano: φ = 0, apuntando a lo largo del eje +X."
}
```

Las puertas no tienen que ir hasta un polo o el ecuador — cualquier inclinación de la flecha es un estado válido. Ajusta una rotación parcial:

```qblochtarget
{
  "id": "prereq-bloch-angle-1",
  "prompt": "Coloca el estado que RY(π/3) prepara a partir de |0⟩: un tercio del camino hacia el polo sur, donde P(0) = 3/4.",
  "target": { "program": "RY 0 1.0472" },
  "toleranceDeg": 5,
  "hint": "RY(θ) inclina la flecha θ radianes lejos del polo norte en el plano φ = 0, así que fija θ = π/3 y deja φ = 0. Cuidado con la trampa de la mitad: P(0) = cos²(θ/2) = cos²(π/6) = 3/4, no cos²(π/3)."
}
```

…entonces estás listo para `01-foundations`.

Aquí está el traspaso. Todo en este módulo te enseñó a **describir** un cúbit: a escribir su estado, leer sus probabilidades y encontrarlo en la esfera. `01-foundations` te entrega los **verbos** — cómo *actuar* sobre ese estado con puertas, *combinar* dos cúbits en un todo inseparable y *leer* la respuesta de vuelta como una medición. La misma moneda girada que conociste aquí, ahora puesta en movimiento.

Un cierre capstone antes de irte. El Cuestionario de ubicación de abajo pregunta por qué `|+>` y `|->` miden de forma idéntica; aquí construyes la mitad `|->` de ese par. El starter gira la moneda de la forma sencilla y aterriza en `|+>` — tu trabajo es incorporar el signo menos:

```qchallenge
{
  "id": "prereq-challenge-minus-1",
  "prompt": "Prepara |−⟩ = (|0⟩ − |1⟩)/√2 — la moneda girada cuyo signo menos la medición sola no puede ver. El starter aterriza en |+⟩; arréglalo.",
  "qubits": 1,
  "target": { "program": "X 0\nH 0" },
  "starter": "H 0",
  "allowedGates": ["X", "H"],
  "hint": "El orden importa: agregar X después de H no te lleva a ninguna parte, porque X deja |+⟩ sin cambio. Voltea primero, luego gira — H aplicada a |1⟩ pone el signo menos en la amplitud |1⟩: (|0⟩ − |1⟩)/√2."
}
```

---

## Ejercicios prácticos

Completa estos notebooks en orden. Cada uno toma 20-40 minutos.

1. **`notebooks/01-python-numpy-warmup.ipynb`** — Vectores, matrices, números complejos,
   `np.dot`, `np.kron`, `@`. Todo en NumPy, aún sin quantum.

2. **`notebooks/02-linear-algebra-for-quantum.ipynb`** — Productos internos, normas,
   transpuesta conjugada, verificación de unitariedad, productos tensoriales. Verifica propiedades numéricamente.

3. **`notebooks/03-probability-and-measurement.ipynb`** — Distribuciones de probabilidad,
   muestreo, valores esperados, ley de los grandes números. La regla de Born se insinúa al final.

4. **`notebooks/04-what-is-a-qubit.ipynb`** — La metáfora de la moneda que gira, luego la
   definición formal. Construye `|0>`, `|1>`, `|+>`, `|->` como arreglos de NumPy. Calcula sus
   probabilidades de medición a mano.

5. **`notebooks/05-dirac-notation-decoded.ipynb`** — La tabla completa de traducción Dirac-a-NumPy,
   con cada línea de notación validada de forma cruzada por código. Incluye una tarjeta de referencia
   "piedra de Rosetta" al final.

6. **`notebooks/06-bloch-sphere-playground.ipynb`** — Esfera de Bloch interactiva. Deslizadores
   para `theta` y `phi`, barras de probabilidad en vivo, simulador de experimento virtual.

**Scripts:**

- `scripts/check_prereqs.py` — Ejecuta desde la terminal: `python 00-prereqs/scripts/check_prereqs.py`
  para verificar que tu entorno tiene NumPy, Matplotlib, JupyterLab e ipywidgets instalados,
  y que estás en Python 3.10 o más reciente.

---

## Autoevaluación

Cuando termines, deberías poder responder las diez preguntas del
**Cuestionario de ubicación** al final de esta GUIDE sin consultar nada. Si tres o
más te dan problemas, repasa los notebooks correspondientes antes de empezar
`01-foundations`.

Una lista corta de cómo se ve "estar listo":

- Puedes escribir una matriz unitaria 2x2 en NumPy y verificar `U† U = I` en dos líneas
- Puedes calcular de memoria la probabilidad de medir `|0>` a partir de un vector de estado
  (es `|alpha|^2` donde `alpha` es la primera amplitud)
- Puedes traducir `<0|H|+>` a NumPy sin pausar
- Puedes explicar en una oración por qué la medición es probabilística
- Puedes dibujar `|+>` en una esfera de Bloch

Si eso se siente rutinario, avanza a [01-foundations](../01-foundations/GUIDE.md).

---

## Referencias

### Visual e intuición primero

- [Quantum Country](https://quantum.country/qcvc) — El ensayo de repetición espaciada de Andy Matuschak y Michael Nielsen.
  El mejor recurso web de cero a quantum.
- [3Blue1Brown — Essence of Linear Algebra](https://www.youtube.com/playlist?list=PLZHQObOWTQDPD3MizzM2xVFitgF8hE_ab) — Álgebra lineal visual. Mira los episodios 1-9 antes del notebook 02.
- [Bloch Sphere Visualization](https://www.youtube.com/watch?v=vUVkS1XZVCg) — Looking Glass Universe, 12 min, explicación intuitiva de la esfera de Bloch.

### Fundamentos matemáticos

- [Khan Academy — Linear Algebra](https://www.khanacademy.org/math/linear-algebra) — Gratis, con ritmo propio y problemas de práctica. Las secciones de vectores y matrices bastan.
- [Khan Academy — Probability](https://www.khanacademy.org/math/statistics-probability/probability-library) — Distribuciones, valor esperado, muestreo.

### Ir más lejos (después de este módulo)

- [Qiskit Textbook: Linear Algebra](https://learning.quantum.ibm.com/course/basics-of-quantum-information/single-systems) — Compañero interactivo, cubre el mismo material con marco cuántico.
- [Nielsen & Chuang, Chapter 2](https://www.cambridge.org/highereducation/books/quantum-computation-and-quantum-information/01E10196D0A682A6AEFFEA52D53BE9AE) — La referencia canónica. Léelo después de este módulo, no antes.

---

## Cuestionario de ubicación

Diez preguntas cortas. Si puedes responder al menos siete sin consultar nada, estás
listo para `01-foundations`. ¿Atascado en una? Revela una pista. ¿Quieres verificarte?
Muestra la respuesta bajo cada pregunta — pero intenta primero. Después de revelar, califica
qué tan bien la recordaste (Otra vez / Difícil / Bien / Fácil); esas calificaciones entran
en tu programa de repetición espaciada para que la habilidad regrese cuando estés a punto de olvidarla.

```quiz
{
  "questions": [
    {
      "id": "prereq-numpy-matmul-vs-elementwise",
      "q": "En NumPy, ¿cuál es la diferencia entre `M @ v` y `M * v`?",
      "hint": "Piensa en las formas. Uno sigue la regla filas-por-columnas del álgebra lineal y lanza un error cuando las dimensiones no coinciden; el otro solo empareja entradas posición por posición y hace broadcast. ¿Cuál es cuál?",
      "a": "`@` es multiplicación matricial; `*` es multiplicación elemento a elemento."
    },
    {
      "id": "prereq-conj-transpose",
      "q": "Escribe la expresión de NumPy para la transpuesta conjugada de una matriz compleja `M`.",
      "hint": "Son dos operaciones unidas. Un método invierte el signo de las partes imaginarias; un atributo intercambia filas y columnas. Encadénalos.",
      "a": "`M.conj().T`."
    },
    {
      "id": "prereq-unitary-property",
      "q": "¿Qué propiedad debe satisfacer una matriz `U` para llamarse unitaria?",
      "hint": "Una puerta cuántica nunca debe cambiar la longitud de un vector de estado. Escribe la ecuación que dice exactamente eso, usando la transpuesta conjugada (la daga) y la matriz identidad.",
      "a": "`U.conj().T @ U == I`, es decir `U†U = I`."
    },
    {
      "id": "prereq-born-rule-complex-amplitudes",
      "q": "Dado `psi = [1/sqrt(2), 1j/sqrt(2)]`, ¿cuáles son `P(0)` y `P(1)`?",
      "hint": "Regla de Born: una probabilidad es la magnitud al cuadrado de una amplitud. La magnitud de un número complejo no le importa si es real o imaginario — `|1j/sqrt(2)|` es simplemente `1/sqrt(2)`. Eleva al cuadrado la magnitud de cada amplitud.",
      "a": "Ambas `0.5`. La unidad imaginaria en la segunda amplitud tiene magnitud 1, así que `|1j/sqrt(2)|^2 = 1/2`."
    },
    {
      "id": "prereq-dirac-to-numpy-inner-product",
      "q": "Traduce `<0|H|+>` a una expresión de NumPy de una línea.",
      "hint": "Recorre los símbolos de izquierda a derecha y sustituye cada uno usando la tabla Dirac-a-NumPy de la sección 5: un bra se vuelve un vector fila conjugado, una puerta se queda como matriz en el medio, un ket es su vector columna, y la adyacencia se vuelve `@`. Recuerda que `|+>` es la superposición igual de `|0>` y `|1>`.",
      "a": "`np.array([1,0]).conj() @ H @ ((np.array([1,0]) + np.array([0,1]))/np.sqrt(2))` — y es igual a `1`."
    },
    {
      "id": "prereq-kronecker-two-qubit",
      "q": "¿Qué es `np.kron([1, 0], [0, 1])` numéricamente, y qué estado de dos cúbits representa?",
      "hint": "El producto de Kronecker de dos kets de un solo cúbit construye un vector de cuatro entradas para el sistema de dos cúbits. Escribe las cuatro amplitudes, encuentra qué posición tiene el único `1`, y lee la etiqueta de la base usando el orden `|q0 q1>`.",
      "a": "`[0, 1, 0, 0]` — el estado `|01>`."
    },
    {
      "id": "prereq-bloch-plus-minus",
      "q": "En la esfera de Bloch, ¿dónde vive `|+>`? ¿Dónde vive `|->`?",
      "hint": "Ambos son superposiciones iguales, así que se sitúan en el ecuador, no en los polos (los polos son `|0>` y `|1>`). Son antipodales entre sí a lo largo del eje horizontal que carga el signo más/menos.",
      "a": "`|+>` está en el eje X positivo del ecuador; `|->` está en el eje X negativo."
    },
    {
      "id": "prereq-bloch-polar-p0",
      "q": "Si un cúbit tiene ángulo polar de Bloch `theta = pi/3`, ¿cuál es `P(0)`?",
      "hint": "Para un estado de Bloch, `P(0) = cos^2(theta/2)`. Primero divide el ángulo a la mitad, así que `theta/2 = pi/6`, y luego evalúa el coseno que ya conoces.",
      "a": "`cos^2(pi/6) = 3/4`."
    },
    {
      "id": "prereq-plus-minus-same-z-stats",
      "q": "¿Por qué `|+>` y `|->` dan la misma distribución de medición en la base computacional?",
      "hint": "Escríbelos ambos como `(|0> ± |1>)/sqrt(2)`; la única diferencia es el signo en la amplitud `|1>`. Ahora aplica la regla de Born — ¿elevar al cuadrado una magnitud recuerda ese signo menos?",
      "a": "La regla de Born solo ve `|alpha|^2` y `|beta|^2`. El signo de `beta` no sobrevive al elevar al cuadrado. Para distinguirlos tienes que aplicar una puerta (p. ej. `H`) antes de medir."
    },
    {
      "id": "prereq-born-rule-sentence",
      "q": "Enuncia la regla de Born en una oración.",
      "hint": "Es la regla que convierte amplitudes en probabilidades. Para `|psi> = alpha|0> + beta|1>`, da la probabilidad de cada resultado — y di si depende de la amplitud misma o de su magnitud al cuadrado.",
      "a": "Medir `|psi> = alpha|0> + beta|1>` en la base computacional produce el resultado `0` con probabilidad `|alpha|^2` y el resultado `1` con probabilidad `|beta|^2`."
    }
  ]
}
```
