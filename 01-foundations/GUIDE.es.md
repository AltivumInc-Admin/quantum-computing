# Fundamentos de computación cuántica

En los prerrequisitos aprendiste a **describir** un cúbit: a hacer girar la moneda, anotar hacia
dónde se inclina y leer las probabilidades de cara o cruz. Eso es un sustantivo. Este módulo trata de
los **verbos**: cómo *actuar* sobre un cúbit, *combinar* dos de ellos en algo sin sombra
clásica y *leer* la respuesta de vuelta.

Al final habrás construido, a mano, el estado de dos cúbits más importante de toda la
computación cuántica — y habrás visto, en pantalla, lo que Einstein llamó
«espeluznante». Todo aquí corre en vivo en tu navegador; sin instalación, sin cuenta de AWS, sin costo.

> **Saldrás capacitado para** ubicar cualquier estado de un solo cúbit en la esfera de Bloch, impulsarlo
> con puertas, razonar sobre la medición como muestreo, y preparar y verificar entrelazamiento con
> el SDK de Amazon Braket. **Necesitarás primero:** el módulo de prerrequisitos (notación de Dirac,
> vectores unitarios en $\mathbb{C}^2$, la regla de Born, NumPy básico). Si $\ket{\psi} = \alpha\ket{0} + \beta\ket{1}$
> se lee con claridad, estás listo.

---

## El cúbit, en un aliento

Un bit clásico se queda en 0 o en 1. Un cúbit vive en una superposición de ambos:

$$
\ket{\psi} = \alpha\ket{0} + \beta\ket{1}, \qquad |\alpha|^2 + |\beta|^2 = 1
$$

Los dos números complejos $\alpha$ y $\beta$ son **amplitudes** — la versión precisa de «hacia
dónde se inclina la moneda en giro». Como vector, $\ket{0} = \begin{bmatrix} 1 \\ 0 \end{bmatrix}$ y
$\ket{1} = \begin{bmatrix} 0 \\ 1 \end{bmatrix}$, de modo que un cúbit es simplemente un vector unitario en
$\mathbb{C}^2$.

Aquí la moneda en giro se vuelve literal. El cúbit 0 empieza plano en $\ket{0}$; un Hadamard ($H$) lo pone
a girar en la superposición perfectamente equilibrada $\ket{+}$. Lee las barras de amplitud y
el estado de Dirac abajo — este es todo el sustantivo en una sola puerta:

```qsim
qubits 1
H 0
```

Una sutileza en la que te apoyarás a cada rato: una **fase global** $e^{i\gamma}\ket{\psi}$
no cambia nada que puedas medir. Solo la fase *relativa* entre las partes $\ket{0}$ y $\ket{1}$
es física. Guarda esa idea — es por eso que funciona la esfera de Bloch.

```qcard
{"id":"found-global-phase-1","prompt":"¿Un estado y el mismo estado multiplicado por un factor de fase global producen alguna diferencia que se pueda medir?","answer":"No. Una fase global como `e^(iγ)` es físicamente invisible; solo la fase relativa entre las partes `|0>` y `|1>` es observable."}
```

## Medición — lo que cuesta «mirar»

Antes de actuar sobre un cúbit, hay que ser honestos sobre lo que ocurre cuando lo *miramos*,
porque mirar es destructivo. La medición en la base computacional es **probabilística e
irreversible**:

- La probabilidad del resultado $\ket{x}$ es $|\braket{x}{\psi}|^2$ — la **regla de Born**.
- El acto de medir **colapsa** el estado al resultado que obtuviste. Mide $\ket{+}$,
  ve «0», y el cúbit es ahora $\ket{0}$ — el resto de la superposición se fue para siempre.

Así que una sola medición casi no te dice nada. Para ver la *distribución* que codifica un estado,
lo preparas, mides y repites — cada ejecución es un **shot**. El histograma empírico se va acercando
a las probabilidades verdaderas de la regla de Born conforme crece el número de shots, y nunca llega del todo.
Esa convergencia es toda la razón por la que el hardware cuántico real se cobra por shot.

```qcard
{"id":"found-shots-1","prompt":"¿Por qué el histograma empírico de medición de un estado nunca coincide exactamente con las probabilidades de la regla de Born para un número finito de shots?","answer":"Cada shot es una muestra aleatoria, así que el histograma solo se acerca a las probabilidades verdaderas conforme crece el número de shots y nunca llega del todo; solo las alcanzarías en el límite de infinitos shots."}
```

Ejecútalo tú mismo. Esto es $\ket{+}$ de nuevo; dispara 1 shot, luego 10, 100, 1,000, 10,000 y observa
cómo las barras se asientan sobre la línea 50/50 que predice la regla de Born:

```qshots
qubits 1
H 0
```

Esa brecha entre «lo que muestra un shot» y «lo que el estado realmente es» es la textura de todos
los experimentos cuánticos. Tenlo presente: toda afirmación que hagamos sobre un estado es en realidad una afirmación
sobre un histograma.

## Puertas como rotaciones

Ahora los verbos. Una **puerta** cuántica es una matriz unitaria — una transformación que preserva la longitud
(así un vector unitario sigue siendo unitario). En un solo cúbit hay una imagen mucho más amigable
que las matrices: **cada puerta es una rotación de la esfera de Bloch.** El polo norte es $\ket{0}$,
el polo sur es $\ket{1}$, el ecuador es superposición máxima, y una puerta simplemente gira la
flecha.

Desplázate por una rotación y observa cómo ocurre — la flecha deja el polo norte, barre
el ecuador y aterriza en el polo sur:

```qscrolly
{"beats":[{"caption":"Empieza en el polo norte: el estado base, |0>. Toda la amplitud se asienta en |0>.","theta":0},{"caption":"Una rotación inclina la flecha hacia el ecuador — el cúbit es ahora una superposición igual de |0> y |1>.","theta":1.5707963267948966},{"caption":"Empuja la rotación más y la flecha rebasa el ecuador: |1> crece mientras |0> se desvanece.","theta":2.0943951023931953},{"caption":"En el polo sur el medio giro está completo — una sola puerta ha llevado |0> hasta |1>.","theta":3.141592653589793}]}
```

```qcard
{"id":"found-gate-rotation-1","prompt":"¿Cuál es la imagen geométrica de cualquier puerta cuántica de un solo cúbit actuando sobre la esfera de Bloch?","answer":"Toda puerta de un solo cúbit es una rotación de la esfera de Bloch; simplemente gira la flecha (una unitaria preserva la longitud, así un vector unitario sigue siendo unitario)."}
```

Construye un estado a mano y siéntelo. Arrastra $\theta$ (qué tan lejos del polo norte) y $\phi$ (qué tan
lejos alrededor) y observa las amplitudes, las probabilidades y la secuencia de puertas que produce
tu estado:

```qbloch
```

La parametrización que acabas de manejar es exactamente

$$
\ket{\psi} = \cos\tfrac{\theta}{2}\ket{0} + e^{i\phi}\sin\tfrac{\theta}{2}\ket{1},
$$

y las puertas de rotación son cómo llegas a cualquier punto de la esfera:

- $R_x(\theta)$, $R_y(\theta)$, $R_z(\theta)$ rotan un ángulo $\theta$ alrededor de los ejes X, Y, Z.

Observa una rotación continua puerta a puerta. $R_y(\theta)$ inclina la flecha fuera del polo norte;
arrastra la esfera para mirar alrededor, o pulsa play para barrer $\theta$ y ver cómo $R_y(\theta)\ket{0}$
traza el meridiano de $\ket{0}$ a $\ket{1}$:

```qscrub
qubits 1
RY 0 theta
```

Has visto rotaciones barrer la flecha; ahora coloca un estado tú mismo. Ajusta $\theta$ y
$\phi$ hasta que tu vector se asiente en el marcador objetivo, luego pulsa Check — tu colocación se califica
por cuántos grados de arco te separan de él, y un acierto limpio programa esta habilidad para
repaso espaciado:

```qblochtarget
{
  "id": "found-bloch-plus-1",
  "prompt": "Lleva el vector de Bloch a |+⟩ = (|0⟩ + |1⟩)/√2 — el estado que H prepara a partir de |0⟩.",
  "target": { "program": "H 0" },
  "toleranceDeg": 5,
  "hint": "θ inclina la flecha lejos de |0⟩ en el polo norte; φ la gira alrededor del ecuador. |+⟩ se asienta en el ecuador (θ = π/2) con φ = 0, apuntando a lo largo de +X."
}
```

No toda rotación es un medio giro limpio — detente a medias y *sesgas* la moneda en lugar de
voltearla. $R_y(2.2143)$ arrastra la flecha más allá del ecuador, la mayor parte pero no todo el camino hacia
$\ket{1}$. Comprométete con una predicción antes de que el simulador responda:

```qpredict
{
  "id": "found-ry-bias-1",
  "prompt": "RY(2.2143) inclina la flecha más allá del ecuador. ¿Cuál resultado de medición individual es el más probable para este estado? Compromete tu predicción y luego revela.",
  "program": "RY 0 2.2143",
  "mode": "top-outcome",
  "hint": "P(1) = sin²(θ/2), y aquí θ ≈ 2.2143 > π/2 — la flecha cruzó el ecuador, así que sin²(θ/2) = 0.8 y la mayoría de la amplitud se asienta en |1⟩. La trampa es pensar que cualquier cosa corta de un medio giro completo aún favorece |0⟩; el ecuador es el punto de inflexión, no el polo."
}
```

Con la geometría en la mano, las puertas con nombre son solo rotaciones especiales memorables. Aquí está la
tarjeta de referencia — pero ya sabes qué *hace* cada una antes de leer su matriz:

| Puerta | Efecto | Matriz |
|---|---|---|
| $X$ (NOT) | $\ket{0}\leftrightarrow\ket{1}$ — un medio giro alrededor de X | $\begin{bmatrix} 0 & 1 \\ 1 & 0 \end{bmatrix}$ |
| $Y$ | medio giro alrededor de Y | $\begin{bmatrix} 0 & -i \\ i & 0 \end{bmatrix}$ |
| $Z$ | volteo de fase en $\ket{1}$ — medio giro alrededor de Z | $\begin{bmatrix} 1 & 0 \\ 0 & -1 \end{bmatrix}$ |
| $H$ | intercambia los ejes Z y X; hace $\ket{0}\to\ket{+}$ | $\tfrac{1}{\sqrt{2}}\begin{bmatrix} 1 & 1 \\ 1 & -1 \end{bmatrix}$ |
| $S$ | cuarto de giro alrededor de Z (fase $\pi/2$ en $\ket{1}$) | $\begin{bmatrix} 1 & 0 \\ 0 & i \end{bmatrix}$ |
| $T$ | octavo de giro alrededor de Z (fase $\pi/4$ en $\ket{1}$) | $\begin{bmatrix} 1 & 0 \\ 0 & e^{i\pi/4} \end{bmatrix}$ |

El hecho profundo que se esconde aquí: toda puerta de un solo cúbit se factoriza como
$U = R_z(\alpha)\,R_y(\beta)\,R_z(\gamma)$ salvo fase global. Tres rotaciones llegan a cualquier punto
de la esfera — por eso bastan esas pocas puertas.

Las puertas de fase $S$ y $Z$ de esa tabla parecen inertes — aplica una y ninguna barra de probabilidad
se mueve. En la esfera son todo lo contrario: cada una gira la flecha alrededor del eje vertical.
Demuéstralo dos veces. Primero, alcanza $\ket{i} = (\ket{0} + i\ket{1})/\sqrt{2}$ — el estado que $S$ hace
a partir de $\ket{+}$, un cuarto del camino alrededor del ecuador:

```qblochtarget
{
  "id": "found-bloch-i-1",
  "prompt": "Lleva el vector de Bloch a |i⟩ = (|0⟩ + i|1⟩)/√2 — el estado que S hace a partir de |+⟩.",
  "target": { "program": "H 0\nS 0" },
  "toleranceDeg": 5,
  "hint": "Las probabilidades fijan solo θ: |i⟩ aún se parte 50/50, así que θ = π/2. La i es una fase relativa — gira φ a π/2, un cuarto de vuelta alrededor del ecuador."
}
```

Ahora de memoria — sin marcador que perseguir. $\ket{-} = (\ket{0} - \ket{1})/\sqrt{2}$ es lo que $Z$
hace de $\ket{+}$: la misma división 50/50, la fase relativa opuesta. Colócalo:

```qblochtarget
{
  "id": "found-bloch-minus-1",
  "prompt": "De memoria: coloca |−⟩ = (|0⟩ − |1⟩)/√2 — el estado que Z hace a partir de |+⟩.",
  "target": { "program": "H 0\nZ 0" },
  "toleranceDeg": 5,
  "blind": true,
  "hint": "Un signo menos en |1⟩ es una fase relativa de e^{iπ}: el ecuador de nuevo (θ = π/2), pero a mitad de camino alrededor — φ = π."
}
```

Hay una forma más afilada de decir «la base importa» que con dibujos: números. Puntúa cada shot $+1$
por el resultado 0 y $-1$ por el resultado 1, y el promedio a largo plazo de ese puntaje es el
**valor esperado** $\langle Z_0 \rangle$ — para $\ket{+}$, la división 50/50 promedia
exactamente 0. Pero un valor esperado es siempre *de algún observable*, y nada te obliga a preguntar
sobre Z. Pregúntale a $\ket{+}$ sobre el eje X en su lugar:

```qexpect
{
  "id": "found-expect-basis-1",
  "prompt": "Para |+⟩ = H|0⟩, el histograma en la base Z se parte 50/50, así que ⟨Z₀⟩ = 0. ¿Cuál es el valor esperado ⟨X₀⟩ para el mismo estado?",
  "program": "H 0",
  "observable": "X 0",
  "hint": "|+⟩ apunta a lo largo del eje +X de la esfera de Bloch — es el autoestado +1 de X, así que una medición de X devuelve +1 en cada shot y el promedio a largo plazo es exactamente +1. La trampa: un estado que se ve máximamente aleatorio en la base Z puede ser perfectamente cierto en otra base. El observable por el que preguntas importa tanto como el estado."
}
```

## El modelo de circuitos

Encadenadas, las puertas forman un **circuito**, y las reglas del juego se enuncian con
tres líneas:

1. Empieza cada cúbit en $\ket{0}$.
2. Aplica una secuencia de puertas.
3. Mide algunos o todos los cúbits.

Los circuitos se leen de izquierda a derecha en el tiempo. Las puertas que actúan sobre cúbits distintos en el mismo paso corren en
paralelo, lo que da dos tamaños independientes: **profundidad** (cuántos pasos, es decir, tiempo) y
**ancho** (cuántos cúbits). Todo el oficio de la programación cuántica es hacer más con menos de
ambos.

En código, esto es el SDK de Amazon Braket, y se lee casi exactamente como las tres reglas:

```python
from braket.circuits import Circuit
from braket.devices import LocalSimulator

# Build a circuit: a Hadamard on q0, then a CNOT controlled by q0.
circuit = Circuit().h(0).cnot(0, 1)

# Run it on the free local simulator.
device = LocalSimulator()
result = device.run(circuit, shots=1000).result()

# Collect measurement statistics.
counts = result.measurement_counts
```

Ejecuta ese circuito exacto en tu navegador — sin instalación. El vector impreso son las cuatro
amplitudes de $\ket{00}, \ket{01}, \ket{10}, \ket{11}$; deberías ver peso solo en
$\ket{00}$ y $\ket{11}$:

```runnable
from braket.circuits import Circuit

# Entangle two qubits: a Hadamard on q0, then a CNOT controlled by q0.
circuit = Circuit().h(0).cnot(0, 1)

# Inspect the resulting state vector (amplitudes of |00>, |01>, |10>, |11>).
print(circuit.state_vector())
```

Un aviso antes de pegar eso en un notebook local: que `circuit.state_vector()`
devuelva las amplitudes directamente es una comodidad del kernel del navegador. Contra
el SDK real de Braket la misma llamada en su lugar *registra un tipo de resultado* en el circuito
— en local, usa el helper portable que usan los notebooks del curso:
`from lib.utils.statevector import statevector`, luego `print(statevector(circuit))`.

Ese circuito de dos líneas es el clímax de todo este módulo. Vamos a merecerlo.

## Dos cúbits, y las puertas que los unen

Dos cúbits viven en un espacio de cuatro dimensiones con base $\ket{00}, \ket{01}, \ket{10},
\ket{11}$. Las puertas de un solo cúbit siguen actuando en un cable a la vez — pero las puertas interesantes
**condicionan un cúbit a otro.**

La bestia de carga es **CNOT** (controlled-NOT): voltea el cúbit objetivo si y solo si el
control es $\ket{1}$.

$$
\text{CNOT}\ket{00}=\ket{00},\quad \text{CNOT}\ket{01}=\ket{01},\quad \text{CNOT}\ket{10}=\ket{11},\quad \text{CNOT}\ket{11}=\ket{10}
$$

CNOT junto con las puertas de un solo cúbit es **universal** — ese par puede aproximar cualquier
computación cuántica. Unos primos redondean el kit:

- **CZ** aplica una $Z$ al objetivo cuando el control es $\ket{1}$; es simétrica, así que cualquiera de los
  cúbits puede llamarse el control.
- **SWAP** intercambia dos cúbits, y se descompone en tres CNOT.
- **Toffoli (CCNOT)** voltea su objetivo solo cuando *ambos* controles son $\ket{1}$ — suficiente para hacer
  cualquier lógica clásica de forma reversible.

Observa a CNOT hacer algo que un cable clásico no puede. Por sí sola, CNOT solo copia un bit definido —
pero aliméntala con un control que ya está en superposición y los dos cúbits se fusionan. Aquí está el
control después de un Hadamard, el momento antes del CNOT:

```qsim
qubits 2
H 0
```

El control es mitad $\ket{0}$ y mitad $\ket{1}$ a la vez. Así que cuando CNOT «voltea el objetivo si el
control es 1», hace ambas cosas a la vez — y de ahí nace el entrelazamiento.

## Entrelazamiento

Aplica ese CNOT. El resultado es el **estado de Bell**:

$$
\ket{\Phi^+} = \tfrac{1}{\sqrt{2}}\big(\ket{00} + \ket{11}\big).
$$

Recorre la construcción una puerta a la vez — $H$ en el cúbit 0, luego CNOT(0,1) — y observa
cómo las amplitudes de dos cúbits pasan de un solo pico a dos:

```qscrub
qubits 2
H 0
CNOT 0 1
```

Mira con atención $\ket{\Phi^+}$: **no hay forma** de escribirlo como (algo para el cúbit 0) $\otimes$
(algo para el cúbit 1). Los cúbits ya no tienen estados individuales — solo el par. Esa
es la definición de **entrelazamiento**: una correlación sin análogo clásico.

```qcard
{"id":"found-entanglement-1","prompt":"¿Qué hace que el estado de Bell `|Φ+⟩ = (|00⟩ + |11⟩)/√2` sea entrelazado en lugar de un producto de dos estados de un solo cúbit?","answer":"No hay forma de escribirlo como (algo para el cúbit 0) tensor (algo para el cúbit 1); los cúbits no tienen estados individuales, solo el par. Esa correlación sin análogo clásico es el entrelazamiento."}
```

Aquí está la parte espeluznante, hecha innegable. Mide el cúbit 0 de un par de Bell y al instante sabes
el cúbit 1, cada vez, sin importar lo lejos que estén. Mide los dos paneles de abajo muchas veces:
el circuito entrelazado solo produce `00` y `11` (correlación perfecta), mientras que un simple producto de
dos superposiciones — las mismas puertas, sin CNOT — se dispersa en los cuatro resultados (total
independencia):

```qcorr
{
  "prompt": "Mide ambos cúbits muchas veces. ¿En cuál circuito el resultado del cúbit 1 sigue al del cúbit 0, y en cuál es independiente?",
  "entangled": "H 0\nCNOT 0 1",
  "product": "H 0\nH 1"
}
```

Predice antes de ejecutar. Has visto la receta y la correlación — ahora comprométete con una respuesta *antes* de que el simulador la revele: ¿qué resultados de medición puede producir realmente el circuito entrelazador?

```qpredict
{
  "id": "found-bell-reachable-1",
  "prompt": "¿Qué estados de la base puede producir el circuito de Bell (H 0; CNOT 0 1) al medir? Compromete tu predicción y luego revela la simulación.",
  "program": "H 0\nCNOT 0 1",
  "mode": "nonzero-states",
  "hint": "El Hadamard superpone el cúbit 0; el CNOT ata el cúbit 1 a él — los dos cúbits siempre coinciden, así que los resultados de paridad impar nunca aparecen."
}
```

Los cuatro estados de dos cúbits máximamente entrelazados — la **base de Bell** — son
$\ket{\Phi^\pm} = \tfrac{1}{\sqrt{2}}(\ket{00}\pm\ket{11})$ y
$\ket{\Psi^\pm} = \tfrac{1}{\sqrt{2}}(\ket{01}\pm\ket{10})$. Son el combustible crudo de la
teleportación cuántica y la codificación superdensa. El patrón escala: el **estado GHZ** de $n$ cúbits
$\tfrac{1}{\sqrt{2}}(\ket{0\dots0} + \ket{1\dots1})$ está entrelazado de forma tan total que medir cualquier
cúbit colapsa a todos.

Ahora lo construyes tú. Escribe el circuito, pulsa Check, y tu estado se califica en el navegador
contra $\ket{\Phi^+}$ (salvo fase global). Ya viste la receta — superponer, luego
controlar un volteo:

```qchallenge
{
  "id": "c6omjbc",
  "prompt": "Prepara el estado de Bell |Φ+⟩ = (|00⟩ + |11⟩)/√2 en dos cúbits.",
  "qubits": 2,
  "target": { "program": "H 0\nCNOT 0 1" },
  "starter": "H 0",
  "allowedGates": ["H", "X", "CNOT"],
  "hint": "Pon el cúbit 0 en superposición con H, luego déjalo controlar un volteo del cúbit 1 con CNOT."
}
```

Construir un circuito desde cero es una habilidad; leer el de otro y detectar por qué
se comporta mal es otra — y es la que más usarás en código real. El circuito de abajo
*debía* preparar ese mismo estado de Bell, pero sus dos cúbits salen completamente
sin entrelazar. Encuentra el error y arréglalo:

```qdebug
{
  "id": "found-debug-bell-1",
  "prompt": "Este circuito debía preparar el estado de Bell |Φ+⟩ = (|00⟩ + |11⟩)/√2, pero al medirlo el cúbit 1 se queda en 0 mientras el cúbit 0 voltea libremente — los cúbits nunca se entrelazan. Corrige el circuito.",
  "qubits": 2,
  "broken": { "program": "H 0\nCNOT 1 0" },
  "target": { "program": "H 0\nCNOT 0 1" },
  "allowedGates": ["H", "X", "CNOT"],
  "hint": "Síguelo: H pone el cúbit 0 en superposición — pero ¿qué cúbit usa este CNOT como control? Un control que siempre es |0⟩ nunca se dispara."
}
```

La base de Bell tiene cuatro miembros, y hasta ahora has construido exactamente uno. $\ket{\Psi^+} =
\tfrac{1}{\sqrt{2}}(\ket{01} + \ket{10})$ es el primo de paridad impar — la misma correlación
perfecta, excepto que los cúbits siempre *discrepan*. Está a una puerta de la receta que
conoces: rompe la simetría primero, luego entrelaza:

```qchallenge
{
  "id": "found-bell-psi-plus-1",
  "prompt": "Prepara el estado de Bell |Ψ+⟩ = (|01⟩ + |10⟩)/√2 — un par entrelazado cuyos resultados de medición siempre discrepan.",
  "qubits": 2,
  "target": { "program": "X 1\nH 0\nCNOT 0 1" },
  "starter": "H 0",
  "allowedGates": ["H", "X", "CNOT"],
  "hint": "Voltea el cúbit 1 con X para que el par empiece en |01⟩, luego corre la receta de Bell: H en el cúbit 0, CNOT(0,1). El CNOT ahora ata el cúbit 0 a un objetivo que empezó opuesto, así que el peso cae en |01⟩ y |10⟩. Añadir la X después del CNOT funciona igual de bien."
}
```

Escalar el patrón al estado GHZ introduce un modo de fallo que el caso de dos cúbits nunca
muestra: la receta es una *cadena*, y una cadena tiene un orden. Cada CNOT pasa el entrelazamiento
un cúbit más abajo de la línea — así que un eslabón que se dispara antes de que su control esté vivo no pasa
nada. Diagnostica este por su síntoma:

```qdebug
{
  "id": "found-debug-ghz-order-1",
  "prompt": "Este circuito debía preparar el estado GHZ (|000⟩ + |111⟩)/√2, pero al medirlo solo produce 000 y 110 — el cúbit 2 nunca deja el 0. Corrige el circuito.",
  "qubits": 3,
  "broken": { "program": "H 0\nCNOT 1 2\nCNOT 0 1" },
  "target": { "program": "H 0\nCNOT 0 1\nCNOT 1 2" },
  "allowedGates": ["H", "CNOT"],
  "hint": "Lee las puertas en orden temporal: cuando corre CNOT(1,2), el cúbit 1 sigue en |0⟩ — un control que siempre es 0 nunca se dispara, así que nada llega al cúbit 2. Entrelaza primero el cúbit 1, luego deja que pase el volteo; la cadena debe bajar la línea en orden."
}
```

Diagnosticaste el error de orden — ahora construye la cadena correcta tú mismo, en Python real de Braket. Este
se califica *ejecutando tu código en el navegador*, en el mismo qcsim que trae el lab: escribe el
circuito como lo harías en un notebook y asígnalo a `circuit`.

```qchallenge
{
  "id": "found-ghz-py-1",
  "prompt": "Prepara el estado GHZ |GHZ⟩ = (|000⟩ + |111⟩)/√2 en tres cúbits, en Python real de Braket. Asigna tu circuito a `circuit`.",
  "qubits": 3,
  "target": { "program": "H 0\nCNOT 0 1\nCNOT 1 2" },
  "starter": "from braket.circuits import Circuit\ncircuit = Circuit()",
  "hint": "Abre con un Hadamard en el cúbit 0 para la superposición, luego encadena el entrelazamiento línea abajo: un CNOT del cúbit 0 al 1, luego uno del cúbit 1 al 2. El orden importa — cada control debe estar vivo antes de dispararse.",
  "tier": "py"
}
```

## Compruébate

Cinco preguntas que unen el módulo. Intenta cada una antes de revelar la pista o la respuesta.

```quiz
{
  "questions": [
    {
      "id": "found-plus-shot-stats",
      "q": "Preparas `|+>` y tomas 1,000 shots. ¿Aproximadamente cuántos resultados `0` esperas, y por qué nunca son exactamente 500?",
      "hint": "La regla de Born fija la probabilidad verdadera en 0.5; una muestra finita fluctúa alrededor de la media en una cantidad que crece como la raíz cuadrada del número de shots, no como el número mismo.",
      "a": "Unos 500, con un margen de ~16 — el ruido de shots escala como `sqrt(N*p*q)`, y `sqrt(250)` es unos 16. Solo alcanzas el 50/50 exacto en el límite de infinitos shots."
    },
    {
      "id": "found-ry-axis-and-state",
      "q": "¿Alrededor de qué eje rota `RY(theta)` el vector de Bloch, y qué estado es `RY(pi)|0>`?",
      "hint": "El nombre dice el eje. Una rotación de `pi` es un medio giro, que manda el polo norte al polo opuesto.",
      "a": "Alrededor del eje Y. `RY(pi)|0> = |1>` (salvo fase global) — un medio giro del polo norte al polo sur."
    },
    {
      "id": "found-global-phase-stats",
      "q": "¿Producen `|+>` y `e^(i*pi/4)|+>` estadísticas de medición distintas?",
      "hint": "Uno de estos difiere del otro solo por una fase global (overall). ¿La magnitud al cuadrado de la regla de Born recuerda una fase global?",
      "a": "No. Una fase global es físicamente invisible — `|e^(i*pi/4)|^2 = 1`, así que cada probabilidad de resultado es idéntica. Solo la fase relativa entre `|0>` y `|1>` es observable."
    },
    {
      "id": "found-bell-from-h-cnot",
      "q": "Partiendo de `|00>`, aplicas `H` al cúbit 0 y luego `CNOT(0,1)`. ¿Qué estado resulta, y está entrelazado?",
      "hint": "H hace del cúbit 0 una superposición 50/50; CNOT luego voltea el cúbit 1 en la mitad de la superposición donde el cúbit 0 es 1. Intenta factorizar el resultado en un producto tensorial de un estado del cúbit 0 y uno del cúbit 1.",
      "a": "`(|00> + |11>)/sqrt(2)`, el estado de Bell `|Phi+>`. Está entrelazado — no hay forma de escribirlo como producto de dos estados de un solo cúbit."
    },
    {
      "id": "found-bell-measurement-no-signaling",
      "q": "Compartes un par de Bell `|Phi+>` con un amigo al otro lado de la galaxia, mides tu cúbit y obtienes `1`. ¿Qué dará el cúbit de tu amigo?",
      "hint": "`|Phi+>` tiene peso solo en `|00>` y `|11>`. Dado tu resultado, ¿qué resultados conjuntos siguen siendo posibles?",
      "a": "`1`, con certeza. Los resultados están perfectamente correlacionados — aunque esto no transmite ningún mensaje usable más rápido que la luz, porque tu propio resultado fue aleatorio."
    }
  ]
}
```

---

## Ejercicios prácticos

Completa estos notebooks en orden:

1. **`notebooks/01-first-circuit.ipynb`** — Construye tu primer circuito cuántico, ejecútalo en el simulador local e interpreta la salida. Cubre: creación de Circuit, LocalSimulator, measurement_counts, graficado básico.

2. **`notebooks/02-single-qubit-gates.ipynb`** — Aplica cada puerta (X, Y, Z, H, S, T, Rx, Ry, Rz) y observa sus efectos en |0> y |1>. Visualiza transformaciones de estado en la esfera de Bloch.

3. **`notebooks/03-multi-qubit-gates.ipynb`** — Crea estados de Bell con CNOT. Verifica el entrelazamiento comprobando correlaciones de medición. Explora las puertas SWAP y Toffoli.

4. **`notebooks/04-measurement-statistics.ipynb`** — Ejecuta circuitos con distintos números de shots. Observa cómo la precisión estadística mejora con más shots. Explora efectos de medición parcial.

5. **`notebooks/05-circuit-composition.ipynb`** — Construye circuitos más grandes a partir de subcircuitos reutilizables. Usa el módulo `lib/circuits/common.py`. Crea circuitos paramétricos personalizados.

**Scripts para explorar:**
- `scripts/gate_library.py` — Referencia que muestra todas las matrices de puertas y sus efectos
- `scripts/state_visualization.py` — Utilidades usadas en los notebooks para visualización

## A dónde va esto después

Ya puedes describir un cúbit, impulsarlo con puertas, medirlo con honestidad y entrelazar un par —
el vocabulario completo del modelo de circuitos. Hasta ahora cada circuito ha corrido en un simulador perfecto.
El siguiente módulo, **`02-hardware`**, deja el mundo ideal: QPU reales en Amazon Braket, el
ruido que las corrompe, los simuladores gestionados que las sustituyen, y el costo de cada
shot. El par de Bell que acabas de construir es exactamente el circuito que los ingenieros de hardware corren primero para preguntarle a una
máquina real: *¿estás entrelazando en absoluto?*

---

## Referencias

### Documentación de AWS
- [What is Amazon Braket?](https://docs.aws.amazon.com/braket/latest/developerguide/what-is-braket.html) — Descripción general del servicio, capacidades y modelo de precios
- [Building quantum tasks](https://docs.aws.amazon.com/braket/latest/developerguide/braket-build.html) — Cómo construir y enviar circuitos vía el SDK
- [Getting started with Amazon Braket](https://docs.aws.amazon.com/braket/latest/developerguide/braket-get-started.html) — Guía de configuración y creación del primer notebook
- [Amazon Braket SDK GitHub](https://github.com/aws/amazon-braket-sdk-python) — Código fuente, ejemplos y referencia de API
- [Amazon Braket examples repository](https://github.com/amazon-braket/amazon-braket-examples) — Notebooks de ejemplo oficiales

### Recursos en video
- [Quantum Computing Fundamentals — AWS re:Invent 2023 (CMP301)](https://www.youtube.com/watch?v=8fmiOg2wTRs) — Dr. Simone Severini, 60 min, cubre cúbits hasta algoritmos variacionales con demos de Braket
- [Introduction to Quantum Computing — MIT OpenCourseWare](https://www.youtube.com/watch?v=lZ3bPUKo5zc) — Prof. Peter Shor, 80 min, fundamentos matemáticos rigurosos
- [Quantum Computing for Computer Scientists](https://www.youtube.com/watch?v=F_Riqjdh2oM) — Charla de Microsoft Research por Andrew Helwer, 65 min, excelente puente de CS a lo cuántico
- [Essence of Linear Algebra — 3Blue1Brown](https://www.youtube.com/playlist?list=PLZHQObOWTQDPD3MizzM2xVFitgF8hE_ab) — Fundamentos visuales de álgebra lineal (repaso de prerrequisitos)
- [Amazon Braket Getting Started Tutorial](https://www.youtube.com/watch?v=LxCMPcE_bXU) — Canal AWS Developer, 15 min, recorrido práctico del SDK
- [Bloch Sphere Visualization Explained](https://www.youtube.com/watch?v=vUVkS1XZVCg) — Looking Glass Universe, 12 min, explicación intuitiva de la esfera de Bloch

### Artículos y lectura adicional
- [Nielsen & Chuang "Quantum Computation and Quantum Information"](https://www.cambridge.org/highereducation/books/quantum-computation-and-quantum-information/01E10196D0A682A6AEFFEA52D53BE9AE) — El libro de texto definitivo; los capítulos 1-4 cubren el material de esta sección
- [Qiskit Textbook: Single Systems](https://learning.quantum.ibm.com/course/basics-of-quantum-information/single-systems) — Compañero interactivo que cubre los mismos conceptos con notación distinta
- [Amazon Braket Digital Learning Plan](https://skillbuilder.aws/learning-plan/EH35DWGU3R/amazon-braket--knowledge-badge-readiness-path-includes-labs) — Cursos de AWS Skill Builder con labs y una insignia digital
