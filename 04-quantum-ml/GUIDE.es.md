# Aprendizaje automático cuántico

El aprendizaje automático cuántico es una idea sencilla disfrazada de algo intimidante: **el modelo es un circuito cuántico.** Introduces datos clásicos, un circuito parametrizado los transforma y una medición devuelve una predicción — y entrenas los parámetros exactamente como en una red neuronal, usando la maquinaria variacional de `03-algorithms`. Este módulo recorre ese bucle de extremo a extremo: introducir los datos, construir el modelo, aprender (de dos maneras) y confrontar el muro contra el que choca todo el campo — las mesetas estériles (*barren plateaus*). Cada idea de abajo se ejecuta en vivo en tu navegador.

> **Al terminar podrás** codificar datos clásicos en estados cuánticos, construir y entrenar un clasificador cuántico variacional, usar kernels cuánticos y diagnosticar mesetas estériles (*barren plateaus*). **Conviene tener primero:** `03-algorithms` (el bucle variacional, gradientes por parameter-shift) y bases de ML clásico (pérdida, descenso por gradiente, SVMs). Todo en esta página es una simulación autocontenida — no se necesita AWS.

---

## Introducir los datos: codificación

Una computadora cuántica solo puede aprender de datos que hayas cargado en un estado cuántico, y **cómo los cargas fija el espacio de características que el modelo llega a ver.** Las estrategias principales:

```qcard
{"id":"qml-encoding-determines-feature-space-1","prompt":"En QML, ¿qué fija la elección de codificación de datos antes de que ocurra cualquier entrenamiento?","answer":"Fija el espacio de características (el mapa de características cuántico / la geometría) que el modelo llega a ver, de modo que un modelo solo puede separar lo que la codificación hace separable. La codificación es una decisión de modelado, no una formalidad."}
```

- **Codificación en base** — mapear un entero a `|x⟩`. Simple, pero un qubit por bit y sin características continuas.
- **Codificación angular** — mapear cada característica a una rotación: `|φ(x)⟩ = ⊗ᵢ RY(xᵢ)|0⟩`. Un qubit por característica, eficiente en hardware; el espacio de características es la superficie de `n` esferas de Bloch.
- **Codificación de amplitud** — empaquetar `N` características en las `log₂N` amplitudes de `⌈log₂N⌉` qubits. Exponencialmente compacta, pero `O(N)` puertas para prepararla. Nota: la rutina de Möttönen del workspace (`lib.ml.feature_maps.amplitude_encoding`) es el caso solo-Ry: necesita características **no negativas** y una longitud que sea **potencia exacta de 2**, y lanza error en caso contrario. El explorador de abajo muestra la construcción general con signo, así que renderiza sin problema entradas que el Python rechaza — para datos con signo en un notebook, usa codificación angular.
- **Codificación IQP / ZZ** — Hadamards, luego rotaciones de un qubit y ZZ impulsadas por *productos* de características. Construye un espacio de características exponencialmente grande y estructurado — la base de los kernels cuánticos con potencial ventaja.
- **Re-uploading** — codificar los datos *otra vez* en capas posteriores, multiplicando la expresividad sin añadir qubits.

Codifica tú mismo un punto de 2 características y observa el estado que produce — cambia entre angular, amplitud e IQP y mira qué tan distinto acomoda cada una los datos:

```qencode
{"x": [0.6, 0.9], "encoding": "angle"}
```

El widget acaba de acomodar ese punto por ti — ahora construye la misma codificación angular tú mismo, en Python real de Braket (calificado ejecutando tu código en el navegador):

```qchallenge
{
  "id": "qml-angle-encode-py-1",
  "prompt": "Codifica angularmente el punto de 2 características x = (0.6, 0.9) en Python real de Braket: aplica RY(0.6) al qubit 0 y RY(0.9) al qubit 1. Asigna tu circuito a `circuit`.",
  "qubits": 2,
  "target": { "program": "RY 0 0.6\nRY 1 0.9" },
  "starter": "from braket.circuits import Circuit\ncircuit = Circuit()",
  "hint": "La codificación angular mapea cada característica a una rotación en Y: un RY por qubit, llevando el valor de la característica en radianes. Introduce las características completas 0.6 y 0.9 — el ry de Braket toma el ángulo directamente, así que no las divides a la mitad en 0.3 y 0.45 tú mismo.",
  "tier": "py"
}
```

La vista de distribución de esa misma codificación vale la pena memorizar — codifica angularmente el punto exactamente como lo hizo el widget y predice qué devuelve con más frecuencia una medición:

```qpredict
{
  "id": "qml-predict-encoded-point-1",
  "prompt": "La codificación angular carga el punto x = (0.6, 0.9) como RY(0.6) en el qubit 0 y RY(0.9) en el qubit 1. ¿Qué estado de la base es el resultado de medición más probable?",
  "program": "RY 0 0.6\nRY 1 0.9",
  "mode": "top-outcome",
  "hint": "RY(x) deja P(1) = sin²(x/2) — el semiángulo es la trampa. sin²(0.3) ≈ 0.09 y sin²(0.45) ≈ 0.19, así que ambos qubits se quedan muy sesgados hacia |0⟩ y 00 domina con cerca del 74%. Características pequeñas apenas se alejan del polo norte — que es exactamente por qué la escala a la que codificas cambia el modelo."
}
```

Una sutileza que el widget hace visible: sobreescalar las características las enrolla alrededor de la esfera de Bloch y aliasa entradas distintas entre sí. La codificación es una decisión de modelado, no una formalidad.

Una segunda sutileza: las rotaciones de características de IQP son todas diagonales (RZ y ZZ), así que dentro de un solo bloque H-luego-diagonal escriben los datos en *fases* mientras cada estado de la base conserva la magnitud que le dieron los Hadamards. (El mapa completo del widget ejecuta ese bloque dos veces — la segunda capa H convierte las fases del primer bloque en las barras desiguales que viste.) Predice qué resultados siguen vivos después de un bloque:

```qpredict
{
  "id": "qml-predict-iqp-phases-1",
  "prompt": "Un mapa de características al estilo IQP codifica x = (0.6, 0.9): H en ambos qubits, luego RZ(0.6) en el qubit 0, RZ(0.9) en el qubit 1, y una interacción ZZ que lleva la característica producto 0.54. ¿Qué estados de la base tienen probabilidad no nula?",
  "program": "H 0\nH 1\nRZ 0 0.6\nRZ 1 0.9\nCNOT 0 1\nRZ 1 0.54\nCNOT 0 1",
  "mode": "nonzero-states",
  "hint": "Tras los Hadamards, toda operación restante es una escritura de fase (el sándwich CNOT–RZ–CNOT es una rotación ZZ): las fases cambian, las magnitudes nunca. Los cuatro estados se quedan en 25% — tras un solo bloque las características son invisibles a una lectura simple en base Z. Los mapas IQP se ganan su lugar por interferencia: capas H extra (el mapa del widget ejecuta dos bloques) o un mapa inverso de kernel convierten esas fases en diferencias medibles."
}
```

## El modelo: un PQC es una red neuronal

Un circuito cuántico parametrizado (PQC) con parámetros $\theta$ define una función
$f(x;\theta)$: codificar $x$, aplicar capas unitarias entrenables $U(\theta)$, medir un observable. La
analogía con una red neuronal es exacta —

- codificación de datos ↔ capa de entrada,
- unitarias parametrizadas ↔ capas ocultas,
- medición (p. ej. $\langle Z_0\rangle$) ↔ salida.

```qcard
{"id":"qml-pqc-is-neural-net-1","prompt":"En la analogía PQC-como-red-neuronal, ¿qué desempeña el papel de las capas ocultas?","answer":"Las capas unitarias parametrizadas (entrenables) `U(theta)`. La codificación de datos se mapea a la capa de entrada y la medición (p. ej. la esperanza de `Z_0`) se mapea a la salida."}
```

Las primeras dos capas de esa red son algo que ya puedes construir a mano — una capa de entrada que codifica una característica, y una sola puerta entrelazadora que la comparte con un segundo qubit:

```qchallenge
{
  "id": "qml-challenge-encoded-point-1",
  "prompt": "Construye las primeras dos capas de la red: codifica la característica x = 2π/3 con RY(2.0944) en el qubit 0, luego entrelázala al qubit 1 con un CNOT (control 0). Objetivo: 0.5|00⟩ + 0.866|11⟩.",
  "qubits": 2,
  "target": { "program": "RY 0 2.0944\nCNOT 0 1" },
  "allowedGates": ["RY", "CNOT"],
  "hint": "RY(θ) pone cos(θ/2) en |0⟩ y sin(θ/2) en |1⟩, así que la característica completa 2.0944 va en la puerta — la trampa es introducir el semiángulo 1.0472 tú mismo, lo que aterriza las amplitudes incorrectas. Luego un CNOT con control 0 copia la excitación: la rama |1⟩ invierte el qubit 1, apilando el peso en |00⟩ y |11⟩."
}
```

Los controles de diseño son del mismo tipo que ya conoces: profundidad (número de capas), el patrón de entrelazamiento (lineal / circular / todos-con-todos), las puertas de rotación y la medición. Y igual que en una red neuronal, obtienes gradientes — exactos, vía la **regla de parameter-shift**: para una puerta
$R(\theta)=e^{-i\theta P/2}$,
$$
\frac{\partial f}{\partial \theta} = \tfrac{1}{2}\big[f(\theta+\tfrac{\pi}{2}) - f(\theta-\tfrac{\pi}{2})\big],
$$
una derivada exacta a partir de dos evaluaciones del circuito — sin diferencias finitas.

```qcard
{"id":"qml-parameter-shift-rule-1","prompt":"¿Cuántas evaluaciones de circuito necesita la regla de parameter-shift para obtener el gradiente exacto de un ángulo de puerta?","answer":"Dos: evalúa `f(theta + pi/2)` y `f(theta - pi/2)`, toma la mitad de su diferencia y obtiene una derivada exacta sin error de diferencias finitas."}
```

La capa de salida de esta "red" no es más que un valor esperado — así que lee uno
tú mismo. El modelo de abajo ha codificado una entrada como una rotación concreta; comprométete con lo que lee su salida $\langle Z_0\rangle$ antes de la revelación:

```qexpect
{
  "id": "qml-expect-encoded-readout-1",
  "prompt": "Un modelo de un qubit codifica una entrada como RY(π/3) aplicada a |0⟩. La salida del modelo es la esperanza ⟨Z₀⟩. ¿Cuál es su valor?",
  "program": "RY 0 1.0472",
  "observable": "Z 0",
  "hint": "RY(θ) inclina el vector de Bloch θ lejos de +Z, así que ⟨Z⟩ = cos θ — y cos(π/3) = 1/2. La trampa del 0.75 es P(medir +1) = (1 + ⟨Z⟩)/2, no la esperanza en sí."
}
```

Y la lectura es un control de diseño por derecho propio. Mantén el estado exactamente como está y cambia el observable medido — el modelo reporta una *característica distinta* de la misma codificación:

```qexpect
{
  "id": "qml-expect-x-readout-1",
  "prompt": "El mismo estado codificado — RY(π/3) aplicada a |0⟩ — pero el modelo ahora lee ⟨X₀⟩ en lugar de ⟨Z₀⟩. ¿Cuál es el valor?",
  "program": "RY 0 1.0472",
  "observable": "X 0",
  "hint": "Tras RY(θ) el vector de Bloch es (sin θ, 0, cos θ): la lectura en Z dio cos(π/3) = 0.5, pero X lee la componente horizontal sin(π/3) = √3/2 ≈ 0.87. Mismo estado, distinto observable, distinta salida — la base de medición es una decisión de modelado, no un detalle posterior."
}
```

## Dos formas de aprender

Con los datos codificados y los gradientes en mano, hay dos rutas hacia un modelo entrenado.

**Kernels cuánticos.** No entrenes el circuito en absoluto — úsalo para *medir similitud*. Codifica cada punto con un mapa de características y calcula el kernel de fidelidad
$$
K(x_i, x_j) = |\langle \phi(x_i)|\phi(x_j)\rangle|^2,
$$
luego entrega la matriz kernel a un SVM clásico. El mapa de características cuántico puede tallar un límite en un espacio difícil de alcanzar clásicamente — convirtiendo un conjunto de datos linealmente inseparable en separable. Pruébalo: cambia el mapa de características y mueve el deslizador de escala para ver cómo la sobrecodificación *perjudica*.

```qkernel
{"dataset": "circles", "map": "iqp"}
```

**Entrenamiento variacional.** O entrena el circuito de extremo a extremo, como una red neuronal: codifica $x$, aplica el ansatz $U(\theta)$, mide $\langle Z_0\rangle$, calcula una pérdida y desciende el gradiente (parameter-shift). Presiona **Train** y observa cómo un clasificador minúsculo de 2 qubits talla su frontera de decisión mientras cae la pérdida:

```qvqc
{"dataset": "blobs"}
```

La frontera que acabas de ver la traza un signo: el entrenador etiqueta un punto $+1$ o $-1$ según el signo de $\langle Z_0\rangle$. Empuja una característica codificada más allá del ecuador y la lectura se vuelve negativa — verifica el lado $-1$ a mano:

```qexpect
{
  "id": "qml-expect-negative-class-1",
  "prompt": "Un clasificador variacional etiqueta puntos por el signo de ⟨Z₀⟩. Una entrada se codifica como RY(2π/3) aplicada a |0⟩. ¿Qué lee ⟨Z₀⟩ para este punto?",
  "program": "RY 0 2.0944",
  "observable": "Z 0",
  "hint": "⟨Z⟩ = cos θ, y 2π/3 queda pasado el ecuador: cos(2π/3) = −1/2. Las probabilidades nunca pueden ser negativas pero las esperanzas sí — la trampa del 0.75 es P(medir 1) = (1 − ⟨Z⟩)/2, no la lectura. Una salida con signo es exactamente lo que permite que un solo número actúe como etiqueta de clase."
}
```

Ese entrenador lee su predicción de $\langle Z_0\rangle$ sobre un estado de dos qubits *entrelazado* — y el entrelazamiento hace algo contraintuitivo a una lectura de un solo qubit. Comprométete antes de revelar:

```qexpect
{
  "id": "qml-expect-entangled-readout-1",
  "prompt": "Una capa entrelazadora prepara el estado de Bell (H luego CNOT). Tu modelo toma su salida de la esperanza de un solo qubit ⟨Z₀⟩. ¿Cuál es ese valor?",
  "program": "H 0\nCNOT 0 1",
  "observable": "Z 0",
  "hint": "Solo, un qubit entrelazado es un lanzamiento de moneda: la marginal de un solo qubit del estado de Bell está máximamente mezclada, así que ⟨Z₀⟩ = 0. La correlación vive en lecturas conjuntas como ⟨Z₀Z₁⟩ — una lección de diseño de lectura: entrelaza demasiado justo antes de medir un qubit y tu modelo emite ruido."
}
```

La corrección de esa pista vale la pena hacerla, no solo leerla: mueve la lectura al observable conjunto y la señal que perdió el qubit individual regresa —

```qexpect
{
  "id": "qml-expect-zz-correlation-1",
  "prompt": "El mismo modelo de estado de Bell (H luego CNOT), pero la lectura es ahora la característica de correlación ⟨Z₀Z₁⟩. ¿Cuál es su valor?",
  "program": "H 0\nCNOT 0 1",
  "observable": "Z 0 Z 1",
  "hint": "Cada qubit solo es un lanzamiento de moneda (⟨Z₀⟩ = ⟨Z₁⟩ = 0), pero el par siempre coincide: los únicos resultados son 00 y 11, y ambos son autoestados +1 de Z₀Z₁, así que la esperanza es exactamente +1. El entrelazamiento mueve la señal de las marginales a las correlaciones — un observable conjunto es cómo un modelo la lee de vuelta."
}
```

## Arquitecturas de QNN

El ansatz $U(\theta)$ es donde vive el arte. Familias comunes:

- **Eficiente en hardware** — alternar rotaciones de un qubit con CNOTs de vecinos cercanos. Superficial y amigable con el dispositivo, pero propensa a las mesetas estériles (*barren plateaus*) de abajo.
- **Fuertemente entrelazante** — entrelazamiento todos-con-todos entre capas. Más expresiva, más profunda.
- **QNN convolucional** — puertas locales en un patrón invariante por traslación, al estilo de las CNN; buena para datos con estructura espacial.

Cablear estos patrones de entrelazamiento es donde los circuitos reales fallan en silencio. La capa de abajo debía ejecutar una cadena lineal de CNOT, pero tal como está cableada ninguna puerta de dos qubits toca el qubit de lectura — se queda en un estado producto, y nada de lo que haga una capa posterior puede enrutar las otras características hacia $\langle Z_0\rangle$:

```qdebug
{
  "id": "qml-debug-decoupled-readout-1",
  "prompt": "Esta capa eficiente en hardware debería entrelazar el registro como una cadena lineal — CNOT(0,1) luego CNOT(1,2) — de modo que el qubit de lectura 0 quede entrelazado con el resto y las capas posteriores puedan dirigir cada característica hacia ⟨Z₀⟩. Tal como está cableada, los entrelazadores solo tocan los qubits 1 y 2, dejando el qubit 0 desacoplado. Recablea la capa de entrelazamiento.",
  "qubits": 3,
  "broken": { "program": "RY 0 0.7854\nRY 1 0.7854\nRY 2 0.7854\nCNOT 1 2\nCNOT 2 1" },
  "target": { "program": "RY 0 0.7854\nRY 1 0.7854\nRY 2 0.7854\nCNOT 0 1\nCNOT 1 2" },
  "allowedGates": ["RY", "CNOT"],
  "hint": "Rastrea qué qubits toca cada CNOT: ninguno involucra el qubit 0, así que el qubit de lectura se queda en un estado producto y ⟨Z₀⟩ queda fijado en cos(π/4) ≈ 0.71 sin importar lo que hagan las otras características. Mantén las tres rotaciones RY y reconstruye la cadena desde el qubit de lectura hacia abajo: CNOT(0,1), luego CNOT(1,2)."
}
```

Más expresivo no es automáticamente mejor — lo que la siguiente sección deja dolorosamente claro.

## El problema: mesetas estériles (*barren plateaus*)

Aquí está el muro. Para PQCs suficientemente aleatorios y expresivos, el gradiente de la función de costo
**se anula exponencialmente con el número de qubits**: $\mathrm{Var}(\partial C/\partial\theta) \sim 2^{-n}$.
El optimizador ve un paisaje plano, sin rasgos, y no progresa — y ninguna cantidad de pasos de entrenamiento ayuda, porque no hay pendiente que seguir.

Míralo ocurrir. La gráfica de abajo muestrea circuitos aleatorios y rastrea la varianza del gradiente frente al número de qubits. El costo **global** (medir todos los qubits) colapsa exponencialmente; el costo **local** (medir un qubit) se mantiene en una banda a profundidad baja — la mitigación más importante de todas.
Luego sube el deslizador de profundidad y observa cómo la banda local también empieza a inclinarse — la localidad compra entrenabilidad, no inmunidad, y Cerezo et al. muestran que el costo local también colapsa una vez que la profundidad crece bastante más allá del rango que ofrece este deslizador:

```qcard
{"id":"qml-barren-plateau-1","prompt":"En una meseta estéril (barren plateau), ¿cómo escala la varianza del gradiente del costo con el número de qubits, y cuál es la mitigación más importante?","answer":"Para PQCs aleatorios y expresivos la varianza del gradiente se anula exponencialmente, aproximadamente como `2^-n`, dejando un paisaje plano. La mitigación más importante es usar una función de costo local (medir un qubit en lugar de todos)."}
```

```qbarren
{"depth": 2, "samples": 400}
```

Las demás mitigaciones siguen la misma lógica: mantén las funciones de costo locales, mantén los ansätze estructurados (inspirados en el problema, no aleatorios), inicializa cerca de la identidad y entrena capa por capa. Las mesetas estériles (*barren plateaus*) son *la* razón por la que "simplemente hazlo más grande" falla en QML.

## El tooling: PennyLane + Braket

PennyLane es el framework que hace todo esto diferenciable en Braket — maneja gradientes por parameter-shift en hardware, backprop en simuladores, una biblioteca de optimizadores y cambio de dispositivo en una línea:

```python
import pennylane as qml

# Use Braket local simulator
dev = qml.device("braket.local.qubit", wires=4)

# Or use Braket managed simulator
dev = qml.device("braket.aws.qubit", device_arn="arn:aws:braket:::device/quantum-simulator/amazon/sv1",
                 s3_destination_folder=("bucket", "prefix"), wires=4, shots=1000)

@qml.qnode(dev)
def circuit(params, x):
    # Encode data
    for i in range(4):
        qml.RY(x[i], wires=i)
    # Trainable layer
    qml.StronglyEntanglingLayers(params, wires=range(4))
    return qml.expval(qml.PauliZ(0))
```

PennyLane maneja diferenciación automática (parameter-shift en QPU, backprop en simulador), una biblioteca de optimizadores (descenso por gradiente, Adam, QNG), cambio de dispositivo en una línea (local → SV1 → QPU) e integración con PyTorch, TensorFlow y JAX.

En el simulador local esos gradientes son gratis; un simulador gestionado (SV1) los mide por minuto. En una QPU, cada evaluación de parameter-shift es una tarea facturada — y un bucle de entrenamiento multiplica ese medidor rápido. Cotiza un solo paso de gradiente antes de creer que entrenar en hardware es casual:

```qcostestimate
{
  "id": "qml-cost-param-shift-step-1",
  "prompt": "Un paso de gradiente por parameter-shift para un modelo de 6 parámetros ejecuta 2 evaluaciones por parámetro — 12 tareas — a 100 shots cada una en IonQ. ¿Cuánto cuesta el paso individual?",
  "provider": "IonQ",
  "shots": 100,
  "tasks": 12,
  "hint": "Cada una de las 12 evaluaciones es su propia tarea: un cargo fijo {perTask} más {shots} × {perShot} en shots. La trampa es cotizar una tarea y olvidar que parameter-shift paga el medidor 2 × P veces por paso — y un entrenamiento repite esto en cada iteración."
}
```

## ¿Ayuda de verdad? — y un chequeo

La respuesta honesta: **a veces, y solo para los datos correctos.** Un modelo cuántico ayuda cuando los datos tienen estructura que un mapa de características cuántico captura y los modelos clásicos no pueden de forma eficiente — y los resultados de "power of data" (Huang et al.) muestran que para muchos problemas, el ML clásico con suficientes datos lo iguala o lo supera. QML es una herramienta afilada para estructura específica, no una aceleración universal. Compruébate:

```quiz
{
  "questions": [
    {
      "id": "qml-encoding-matters",
      "q": "¿Por qué importa tanto la elección de codificación de datos en QML?",
      "hint": "Piensa en lo que la codificación determina antes de que ocurra cualquier entrenamiento.",
      "a": "La codificación define el mapa de características cuántico — la geometría del espacio en el que opera el modelo. Un modelo solo puede separar lo que la codificación hace separable, así que la codificación es una decisión de modelado, no una formalidad. (Y sobreescalar características aliasa entradas distintas entre sí, dañando la precisión.)"
    },
    {
      "id": "qml-kernel-vs-vqc-tradeoff",
      "q": "¿Cuál es el trade-off entre kernels cuánticos y entrenamiento variacional?",
      "hint": "Uno usa un mapa de características fijo + un solver convexo clásico; el otro entrena el circuito en sí.",
      "a": "Los kernels cuánticos calculan una similitud de mapa de características fijo K y la entregan a un SVM clásico — convexo, sin mesetas estériles (barren plateaus), pero `O(n^2)` evaluaciones de kernel en el tamaño del dataset. El entrenamiento variacional ajusta el circuito de extremo a extremo — flexible y compacto, pero la optimización es no convexa y puede chocar con mesetas estériles (barren plateaus)."
    },
    {
      "id": "qml-barren-plateau",
      "q": "¿Qué es una meseta estéril (barren plateau), y nombra una mitigación?",
      "hint": "Se trata de cómo se comporta el gradiente al añadir qubits.",
      "a": "Para PQCs aleatorios/expresivos la varianza del gradiente del costo se anula exponencialmente en el número de qubits (cerca de `2^-n`), así que el paisaje es plano y el optimizador no puede progresar. Mitigaciones: usa un costo LOCAL, mantén el ansatz superficial/estructurado/inspirado en el problema, inicializa cerca de la identidad, o entrena capa por capa."
    },
    {
      "id": "qml-parameter-shift",
      "q": "¿Qué calcula la regla de parameter-shift, y cuántas ejecuciones de circuito necesita?",
      "hint": "Es un gradiente exacto, no una aproximación.",
      "a": "El gradiente exacto de un valor esperado respecto a un ángulo de puerta: `df/dtheta = (1/2)[f(theta + pi/2) - f(theta - pi/2)]` — solo dos evaluaciones de circuito, sin error de diferencias finitas."
    }
  ]
}
```

---

## Ejercicios prácticos

1. **`notebooks/01-data-encoding.ipynb`** — Implementa codificaciones angular, de amplitud e IQP para el dataset Iris. Visualiza los estados cuánticos que produce cada codificación. Compara requisitos de qubits y profundidad del circuito.

2. **`notebooks/02-quantum-kernels.ipynb`** — Construye un kernel cuántico usando codificación IQP. Calcula la matriz kernel para un problema de clasificación 2D. Entrena un SVM clásico con el kernel cuántico. Compara con un kernel RBF.

3. **`notebooks/03-variational-classifier.ipynb`** — Construye un VQC para clasificación binaria en un dataset de juguete (moons o circles). Entrena con gradientes por parameter-shift. Grafica la evolución de la frontera de decisión durante el entrenamiento.

4. **`notebooks/04-pennylane-braket.ipynb`** — Configura PennyLane con backends de Braket. Define QNodes con diferenciación automática. Cambia entre dispositivos local, SV1 y QPU. Usa optimizadores de PennyLane (Adam, QNG).

5. **`notebooks/05-qnn-architecture.ipynb`** — Compara arquitecturas eficientes en hardware vs. fuertemente entrelazantes. Mide expresibilidad y capacidad de entrelazamiento. Entrena ambas en el mismo dataset y compara la convergencia.

6. **`notebooks/06-barren-plateaus.ipynb`** — Demuestra mesetas estériles (*barren plateaus*): grafica la varianza del gradiente vs. número de qubits para circuitos aleatorios. Luego aplica mitigaciones: funciones de costo locales, inicialización en la identidad, entrenamiento capa por capa. Muestra entrenabilidad mejorada.

7. **`notebooks/07-hybrid-ml-job.ipynb`** — Empaqueta un bucle de entrenamiento QML como un Hybrid Job de Braket. Rastrea la pérdida de entrenamiento vía métricas de CloudWatch. Usa checkpointing para entrenamientos largos. Demuestra un flujo de trabajo QML de producción.

**Scripts:**
- `scripts/feature_maps.py` — Circuitos reutilizables de codificación de datos (angular, amplitud, IQP). El re-uploading no se entrega como encoder — lo construyes tú mismo en `04-pennylane-braket.ipynb` Ejercicio 1.
- `scripts/classifiers.py` — Implementaciones de clasificadores VQC y de kernel cuántico
- `scripts/training.py` — `train_vqc`: descenso por gradiente analítico de PennyLane que devuelve los parámetros óptimos más el historial de pérdida y precisión por época, con una línea de progreso cada diez épocas

## A dónde va esto después

Ya puedes codificar datos, construir y entrenar modelos cuánticos, y reconocer el muro de las mesetas estériles (*barren plateaus*). El siguiente módulo, **`05-quantum-chemistry`**, apunta la misma maquinaria variacional a moléculas: el Variational Quantum Eigensolver (VQE) encuentra energías del estado fundamental de Hamiltonianos moleculares — posiblemente la aplicación a corto plazo más prometedora de todo lo que has construido hasta ahora.

---

## Referencias

### Documentación de AWS
- [Quantum Machine Learning on Amazon Braket](https://github.com/amazon-braket/amazon-braket-examples/tree/main/examples/quantum_machine_learning) — Ejemplos oficiales de QML
- [PennyLane-Braket plugin](https://amazon-braket-pennylane-plugin-python.readthedocs.io/) — Documentación del plugin para usar PennyLane con dispositivos Braket
- [Hybrid Jobs for QML](https://github.com/amazon-braket/amazon-braket-examples/blob/main/examples/hybrid_jobs/1_Quantum_machine_learning_in_Amazon_Braket_Hybrid_Jobs/Quantum_machine_learning_in_Amazon_Braket_Hybrid_Jobs.ipynb) — Ejemplo oficial de hybrid job QML

### Recursos en video
- [Quantum Machine Learning — PennyLane Tutorial Series](https://www.youtube.com/playlist?list=PL-8F_hCufPN2r7dJkSUUbVQQ9CC7AV6rO) — Equipo Xanadu, curso completo de QML (10+ horas), cubre codificación hasta métodos de kernel
- [Variational Quantum Classifiers — Qiskit Summer School](https://www.youtube.com/watch?v=3kcoaanYyZw) — Amira Abbas, 90 min, teoría e implementación de VQC
- [Barren Plateaus in Quantum ML — Cerezo et al.](https://www.youtube.com/watch?v=gNUC2EhC2Xs) — Marco Cerezo, 45 min, explicación rigurosa del problema de mesetas estériles (*barren plateaus*)
- [Quantum Kernels for ML — AWS Quantum Computing Blog](https://www.youtube.com/watch?v=tMv-sA8pIYM) — 30 min, métodos de kernel cuántico en Braket
- [PennyLane + Amazon Braket Integration](https://www.youtube.com/watch?v=1eJmVTlxzB8) — Tutorial de AWS, 20 min, configuración y primer circuito QML
- [Data Encoding in Quantum Computing — Maria Schuld](https://www.youtube.com/watch?v=r-L9DjOMqWA) — Maria Schuld (Xanadu), 50 min, inmersión profunda en estrategias de codificación y sus implicaciones

### Papers y lectura adicional
- [Supervised learning with quantum-enhanced feature spaces (Havlicek et al., 2019)](https://arxiv.org/abs/1804.11326) — Paper fundacional sobre kernels cuánticos
- [Power of data in quantum machine learning (Huang et al., 2021)](https://arxiv.org/abs/2011.01938) — ¿Cuándo ayuda de verdad el ML cuántico? Análisis riguroso
- [Barren plateaus in quantum neural network training landscapes (McClean et al., 2018)](https://arxiv.org/abs/1803.11173) — El paper original de mesetas estériles (*barren plateaus*)
- [Expressibility and Entangling Capability of PQCs (Sim et al., 2019)](https://arxiv.org/abs/1905.10876) — Cuantificación de la expresividad de circuitos
- [Machine learning with quantum computers (Schuld & Petruccione)](https://link.springer.com/book/10.1007/978-3-030-83098-4) — Mejor libro de texto de QML, cubre todos los temas de esta sección
