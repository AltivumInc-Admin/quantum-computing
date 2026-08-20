# Algoritmos cuánticos

Tres módulos después, ya sabes armar circuitos, sabes cuánto cuesta el hardware real y puedes leer una
medición. Ahora viene la recompensa: **¿dónde la cuántica realmente supera a lo clásico, y por qué?** La
respuesta, siempre, es la **interferencia**. Un algoritmo cuántico es interferencia coreografiada: tú
arreglas las amplitudes para que las respuestas incorrectas se cancelen y las correctas se sumen, y luego mides lo que
queda. Este módulo recorre esa idea desde su demostración más simple hasta la más práctica, ejecutando
cada algoritmo en vivo en tu navegador.

```qcard
{"id":"algo-interference-core","prompt":"Según este módulo, ¿qué único mecanismo explica cada caso en el que un algoritmo cuántico supera a uno clásico?","answer":"Interferencia: un algoritmo cuántico arregla las amplitudes para que las respuestas incorrectas se cancelen y las correctas se sumen, y luego mide lo que queda."}
```

> **Al terminar podrás** explicar la aceleración cuántica de los algoritmos con oráculo (Deutsch–Jozsa,
> Grover), construir y leer la transformada cuántica de Fourier, entender la estimación de fase y ejecutar
> QAOA para optimización. **Primero necesitas:** `01-foundations` (puertas, entrelazamiento,
> medición) y un poco de álgebra lineal (valores propios, unitarias, productos tensoriales). Todo
> aquí es una simulación autocontenida: no se necesita AWS para la página.

---

## El truco compartido: oráculos y retroceso de fase

La mayoría de los algoritmos cuánticos consultan una caja negra — un **oráculo** — que codifica el problema como una
puerta reversible $U_f$. El truco que los hace rápidos: prepara una superposición sobre *todas* las entradas
con Hadamards, consulta el oráculo *una sola vez* sobre esa superposición y deja que la respuesta regrese como una
**fase**. Un oráculo de fase invierte el signo de las amplitudes donde $f(x)=1$:

$$
\ket{x} \;\longmapsto\; (-1)^{f(x)}\ket{x}.
$$

Los signos son invisibles para una sola medición — hasta que vuelves a aplicar los Hadamards y los signos
**interfieren**, concentrando la probabilidad en la respuesta. Ese patrón superponer → consultar → interferir
es todo el juego. Empiézalo tú mismo: pon ambos cúbits en la superposición equitativa con la que
abre todo algoritmo con oráculo.

```qcard
{"id":"algo-phase-kickback-pattern","prompt":"¿Cuál es el patrón de tres pasos compartido por los algoritmos con oráculo, y qué le hace el oráculo de fase a una entrada?","answer":"Superponer sobre todas las entradas con Hadamards, consultar el oráculo una vez y luego interferir aplicando de nuevo los Hadamards. Un oráculo de fase mapea `|x>` a `(-1)^f(x)|x>`, invirtiendo el signo donde `f(x)=1`."}
```

```qchallenge
{
  "id": "c1hegrk5",
  "prompt": "Pon dos cúbits en una superposición equitativa sobre los cuatro estados de la base (el paso H-en-todos-los-cúbits con el que abre Deutsch–Jozsa).",
  "qubits": 2,
  "target": { "program": "H 0\nH 1" },
  "starter": "H 0",
  "allowedGates": ["H"],
  "hint": "Un Hadamard en cada cúbit crea una superposición equitativa de |00⟩, |01⟩, |10⟩ y |11⟩."
}
```

La misma apertura, escrita por alguien con prisa — y en silencio no hace *nada*. El error
gira en torno al hecho mismo que Deutsch–Jozsa explota más abajo: $H$ es su propia inversa, así que el segundo
$H^{\otimes n}$ deshace el primero a menos que el oráculo intervenga. Encuéntralo y corrígelo:

```qdebug
{
  "id": "algo-debug-hh-1",
  "prompt": "Este circuito debía repartir dos cúbits sobre los cuatro estados de la base, pero cada medición devuelve 00 — como si no se hubiera aplicado ninguna puerta. Corrige el circuito.",
  "qubits": 2,
  "broken": { "program": "H 0\nH 0" },
  "target": { "program": "H 0\nH 1" },
  "allowedGates": ["H"],
  "hint": "Cuenta a qué cúbit toca cada H. Dos Hadamards en el MISMO cúbit se cancelan (H² = I): el segundo deshace el primero, exactamente el truco de interferencia que DJ usa a propósito."
}
```

Corregido. Ahora construye la otra mitad de la historia del oráculo: un estado que realmente *porte* una marca. El
oráculo de fase más pequeño actúa sobre un cúbit e invierte el signo de la rama $\ket{1}$ (eso es $f(x)=x$
escrito como fase pura): estadísticas idénticas 50/50, signo opuesto — y ese signo es todo lo que
los algoritmos de abajo negocian.

```qchallenge
{
  "id": "algo-phase-mark-1",
  "prompt": "Prepara la superposición marcada en fase |−⟩ = (|0⟩ − |1⟩)/√2: pon el cúbit en superposición equitativa y luego invierte el signo de su rama |1⟩.",
  "qubits": 1,
  "target": { "program": "H 0\nZ 0" },
  "starter": "H 0",
  "allowedGates": ["H", "Z"],
  "hint": "H solo da |+⟩ = (|0⟩ + |1⟩)/√2 — aún no hay marca. Z deja |0⟩ intacto y multiplica |1⟩ por −1, así que H y luego Z aterrizan en (|0⟩ − |1⟩)/√2. Las probabilidades de medición no se mueven; solo cambia el signo relativo — que es exactamente por qué los oráculos escriben sus respuestas ahí."
}
```

Ahora arma toda la apertura como lo harías en hardware — en Python real de Braket, calificado al
ejecutar tu código en el navegador: el cúbit de consulta en superposición y una ancilla de retroceso de fase
sentada en |−⟩ para que el signo del oráculo tenga dónde aterrizar.

```qchallenge
{
  "id": "algo-oracle-input-py-1",
  "prompt": "Arma el registro de entrada del oráculo en Python real de Braket: pon el cúbit de consulta 0 en superposición equitativa y prepara la ancilla de retroceso de fase, cúbit 1, en |−⟩ = (|0⟩ − |1⟩)/√2. Asigna tu circuito a `circuit`.",
  "qubits": 2,
  "target": { "program": "H 0\nX 1\nH 1" },
  "starter": "from braket.circuits import Circuit\ncircuit = Circuit()",
  "hint": "El cúbit 0 necesita un solo Hadamard. Para la ancilla, lleva |0⟩ a |1⟩ con una X primero; luego un Hadamard convierte |1⟩ en |−⟩ — el signo menos sobre el que el oráculo empuja su respuesta. Si omites la X, la ancilla queda en |+⟩, que no porta ninguna marca.",
  "tier": "py"
}
```

## Deutsch–Jozsa: una consulta basta

La prueba más limpia de que la interferencia compra aceleración. Te entregan $f:\{0,1\}^n\to\{0,1\}$ con la promesa
de que es **constante** (misma salida en todas partes) o **balanceada** (0 en la mitad de las entradas, 1 en
la otra mitad). Clásicamente, podrías necesitar $2^{n-1}+1$ consultas para estar seguro. Cuánticamente:
**exactamente una.**

El motor abre como todo algoritmo con oráculo: Hadamards a lo largo de todo el registro de entrada.
Coloca la apertura de tres cúbits que usará la demo de abajo:

```qchallenge
{
  "id": "algo-dj-register-1",
  "prompt": "Prepara el registro de entrada de Deutsch–Jozsa en tres cúbits: una superposición equitativa sobre los ocho estados de la base, lista para consultar el oráculo una vez.",
  "qubits": 3,
  "target": { "program": "H 0\nH 1\nH 2" },
  "starter": "H 0\nH 1",
  "allowedGates": ["H"],
  "hint": "Un Hadamard por línea: H⊗H⊗H reparte |000⟩ de forma uniforme sobre los ocho estados de la base. El starter se detiene en dos líneas, así que el cúbit 2 nunca sale de |0⟩ y la mitad del espacio de entrada nunca se consulta."
}
```

Aplica $H^{\otimes n}$, el oráculo de fase y luego $H^{\otimes n}$ otra vez. La amplitud que regresa
a $\ket{0\dots0}$ es $\frac{1}{N}\sum_x (-1)^{f(x)}$ — que es $\pm 1$ para una función constante
(todos los términos coinciden) y exactamente $0$ para una balanceada (los términos $+$ y $-$ se cancelan). Así: medir
todo ceros ⇒ constante; medir cualquier otra cosa ⇒ balanceada. Elige un oráculo y observa cómo la interferencia
decide:

```qdj
{"qubits": 3}
```

Antes de confiar en el widget, corre la instancia más pequeña en tu cabeza. En dos cúbits el oráculo
constante $f(x)=0$ es una capa *vacía*, así que todo el algoritmo se reduce a Hadamards seguidos
inmediatamente de Hadamards — y ya sabes qué hace $H$ dos veces:

```qpredict
{
  "id": "algo-dj-constant-1",
  "prompt": "Deutsch–Jozsa en dos cúbits con el oráculo constante f(x) = 0: la capa del oráculo está vacía, dejando H 0, H 1, H 0, H 1. ¿Cuál es el resultado de medición más probable?",
  "program": "H 0\nH 1\nH 0\nH 1",
  "mode": "top-outcome",
  "hint": "H es su propia inversa, así que sin nada entre ellos el segundo par de Hadamards deshace por completo el primero. Toda amplitud interfiere de regreso en |00⟩ — la lectura de todo ceros es el algoritmo anunciando 'constante'."
}
```

(Bernstein–Vazirani es el mismo truco apuntado a una cadena de bits oculta $s$ donde $f(x)=s\cdot x$: una
consulta recupera los $n$ bits de $s$ que un atacante clásico necesitaría $n$ consultas para encontrar.)

En nuestro conjunto de puertas ese oráculo no es nada exótico: $(-1)^{s\cdot x}$ es solo una $Z$ en cada línea donde
$s_i = 1$. El circuito de abajo esconde una cadena de tres bits en sus $Z$ — una consulta, léela:

```qpredict
{
  "id": "algo-bv-readout-1",
  "prompt": "Una instancia de Bernstein–Vazirani: Hadamards en los tres cúbits, un oráculo de fase construido con puertas Z y luego Hadamards otra vez. ¿Cuál es el resultado de medición más probable? (Deletrea la cadena oculta s.)",
  "program": "H 0\nH 1\nH 2\nZ 0\nZ 2\nH 0\nH 1\nH 2",
  "mode": "top-outcome",
  "hint": "Trabaja línea por línea. Un cúbit con una Z entre sus Hadamards siente HZH = X y se voltea a |1⟩; un cúbit sin ella siente HH = I y regresa a |0⟩. Las Z están en los cúbits 0 y 2, así que el registro lee directamente la cadena oculta — los n bits de una sola consulta."
}
```

## Búsqueda de Grover: amplificación de amplitud

Deutsch–Jozsa termina de un solo golpe. La búsqueda de Grover muestra qué pasa cuando hay que *repetir*
la interferencia. Dado un oráculo que marca un elemento de $N=2^n$, la búsqueda clásica necesita
$O(N)$ comprobaciones; Grover necesita $O(\sqrt N)$ — una aceleración cuadrática que subyace a incontables otros
algoritmos.

Cada **iteración de Grover** son dos reflexiones: el oráculo invierte el signo del estado marcado y luego
el operador de **difusión** refleja cada amplitud respecto de su media. Geométricamente es una pequeña
rotación de todo el estado hacia el elemento marcado — así la amplitud marcada sube, paso a paso.
Recórrelo: la barra marcada crece, la probabilidad de éxito alcanza un máximo cerca de $\frac{\pi}{4}\sqrt N$
iteraciones y — crucialmente — si sigues, **sobre-rota** y cae de nuevo. Saber cuándo
detenerse es parte del algoritmo.

```qcard
{"id":"algo-grover-rotation","prompt":"Geométricamente, ¿qué hace una iteración de Grover y qué ocurre si ejecutas demasiadas iteraciones?","answer":"Compone dos reflexiones (oráculo y luego difusión) en una pequeña rotación del estado hacia el elemento marcado. La probabilidad de éxito alcanza un máximo cerca de `(pi/4)*sqrt(N)` iteraciones; más allá sobre-rota y cae, así que saber cuándo detenerse importa."}
```

Un matiz antes de manejarlo: el instante después de que el oráculo dispara, una medición en la base
computacional no muestra *nada* — cada probabilidad es exactamente la de antes; solo se movió un signo. La
marca es físicamente real de todos modos. Convéncete en la versión de un cúbit, donde el
volteo del oráculo convierte $\ket{+}$ en $\ket{-}$:

```qexpect
{
  "id": "algo-expect-mark-x-1",
  "prompt": "El circuito H 0, Z 0 prepara el estado marcado en fase |−⟩ = (|0⟩ − |1⟩)/√2, que una medición en la base computacional no puede distinguir de |+⟩. ¿Cuál es el valor esperado ⟨X⟩ para este estado?",
  "program": "H 0\nZ 0",
  "observable": "X 0",
  "hint": "En la base Z, |+⟩ y |−⟩ leen ambos 50/50 — la marca es invisible ahí. Pero |−⟩ es un estado propio de X con valor propio −1 (X|−⟩ = −|−⟩), así que ⟨X⟩ = −1 exactamente. Una marca de fase solo se vuelve visible con una medición de tipo interferencia (base X) — que es precisamente el trabajo del paso de difusión."
}
```

```qgrover
{"qubits": 3, "marked": 5}
```

El oráculo dentro de ese widget tiene un solo trabajo: invertir el signo de un único estado de la base y no tocar nada
más. En dos cúbits eso es una $Z$ controlada — y sin un CZ nativo construyes uno envolviendo
el target de un CNOT entre Hadamards. El intento de abajo perdió la mitad del sándwich: el CNOT reordena
estados de la base, la superposición uniforme se encoge de hombros y la marca nunca aterriza. Repáralo:

```qdebug
{
  "id": "algo-debug-oracle-cz-1",
  "prompt": "Este circuito debía preparar el estado que el oráculo de Grover entrega al paso de difusión: la superposición uniforme de dos cúbits con el signo de |11⟩ invertido, (|00⟩ + |01⟩ + |10⟩ − |11⟩)/2. En cambio produce la superposición uniforme simple — sin marca en ninguna parte. Corrige el circuito.",
  "qubits": 2,
  "broken": { "program": "H 0\nH 1\nCNOT 0 1" },
  "target": { "program": "H 0\nCNOT 0 1\nH 1" },
  "allowedGates": ["H", "CNOT"],
  "hint": "Un CNOT desnudo solo permuta estados de la base, y la superposición uniforme no cambia con ninguna permutación — por eso la marca nunca aterriza. Envuelve el target del CNOT entre Hadamards para convertir su volteo de bit en un volteo de signo (eso construye una Z controlada). Luego simplifica: el primer H del sándwich cancela el H de preparación en esa línea (H·H = I), dejando H 0, CNOT 0 1, H 1."
}
```

Ahora encadena toda la iteración: preparación, el oráculo (reparado) y luego la difusión — el mismo truco del
sándwich envuelto en $X$s y $H$s para que invierta el signo de $\ket{00}$ en su lugar. Con $N=4$, una iteración de
Grover no es aproximadamente correcta: es *exacta*. Anuncia el resultado antes de ejecutarlo:

```qpredict
{
  "id": "algo-grover-one-iter-1",
  "prompt": "Una iteración completa de Grover en dos cúbits con |11⟩ marcado: preparación (H en ambos), el oráculo de fase (CZ como sándwich H–CNOT–H) y luego el operador de difusión. ¿Cuál es el resultado de medición más probable?",
  "program": "H 0\nH 1\nH 1\nCNOT 0 1\nH 1\nH 0\nH 1\nX 0\nX 1\nH 1\nCNOT 0 1\nH 1\nX 0\nX 1\nH 0\nH 1",
  "mode": "top-outcome",
  "hint": "Sigue las amplitudes: después del oráculo, |11⟩ queda en −1/2 y los otros tres en +1/2, así que la media es +1/4. La difusión refleja cada amplitud respecto de esa media, enviando los tres estados no marcados a 0 y el marcado a magnitud 1. Con N = 4, una sola iteración alcanza el estado marcado con probabilidad 1 — el único caso en el que Grover es exacto, no solo amplificado."
}
```

## La transformada cuántica de Fourier: la interferencia lee periodicidad

La QFT es la transformada discreta de Fourier cuántica, y es cómo las computadoras cuánticas *ven estructura*
en un estado. Mapea un estado de la base a un reparto uniforme de fases,

$$
\text{QFT}\ket{j} = \frac{1}{\sqrt{N}} \sum_{k=0}^{N-1} e^{2\pi i jk/N}\ket{k},
$$

construida con Hadamards y rotaciones de fase controladas en solo $O(n^2)$ puertas — exponencialmente menos
que el FFT clásico de $O(n\,2^n)$ sobre el vector de amplitudes. Su superpoder es leer
**periodicidad**: aliméntala con un estado que se repite con periodo $r$ y la interferencia constructiva
produce picos agudos en múltiplos de $N/r$. El periodo sale solo. Observa un peine periódico
convertirse en un peine de frecuencias:

```qft
{"qubits": 4, "input": "period:2"}
```

## Estimación de fase cuántica: leer una fase propia

QPE es la QFT apuntada a otra pregunta: dada una unitaria $U$ con vector propio $\ket{u}$ y
$U\ket{u}=e^{2\pi i\phi}\ket{u}$, estima la fase $\phi$. Pones $n$ cúbits ancilla en
superposición, aplicas $U^{2^k}$ controladas para que cada ancilla recoja una potencia distinta de la fase
y luego ejecutas la **QFT inversa** para interferir esas fases en una lectura binaria de $\phi$.

La comprobación clásica: estima la fase de una puerta $T$ (que añade una fase de $e^{i\pi/4}$, es decir
$\phi=1/8$) y las ancillas leen $0.001_2 = 1/8$. QPE es el motor del algoritmo de factorización de Shor
(encontrar el periodo de la exponenciación modular) y de la química cuántica (medir valores propios de
energía molecular) — exactamente hacia donde se dirigen `04-quantum-ml` y `05-quantum-chemistry`.

## Algoritmos variacionales y QAOA

Todo lo anterior asume circuitos profundos y exactos. En el hardware ruidoso de hoy (recuerda `02-hardware`),
el caballo de batalla práctico es **variacional**: un circuito parametrizado superficial cuyos botones un
optimizador *clásico* ajusta para minimizar un costo. Lo cuántico propone; lo clásico dispone; se repite.

**QAOA** (Quantum Approximate Optimization Algorithm) es el enfoque variacional a la optimización
combinatoria como **MaxCut** (partir los vértices de un grafo en dos conjuntos para cortar el mayor número de aristas). Una
capa alterna una unitaria de **costo** $e^{-i\gamma C}$ — que imprime el problema como fases — con un
**mezclador** $e^{-i\beta\sum_q X_q}$ — que reparte amplitud para que las buenas asignaciones puedan crecer. Los dos
ángulos $(\gamma,\beta)$ son lo que el optimizador clásico busca. Muévelos tú mismo sobre un
triángulo y observa cómo el corte esperado se desplaza por el paisaje hacia el óptimo:

```qcard
{"id":"algo-qaoa-angles","prompt":"En una capa de QAOA, ¿qué hacen la unitaria de costo y el mezclador cada uno, y qué parte es clásica?","answer":"La unitaria de costo `e^(-i*gamma*C)` imprime el problema como fases; el mezclador `e^(-i*beta*sum X_q)` reparte amplitud para que las buenas asignaciones puedan crecer. Un optimizador clásico busca sobre los ángulos `(gamma, beta)`."}
```

```qoptim
{"edges": [[0, 1], [1, 2], [2, 0]]}
```

Todo lo que ese bucle exterior "ve" viene de mediciones del observable de costo. Para una arista
$(i,j)$ el término es $\langle Z_i Z_j\rangle$: $+1$ cuando los extremos coinciden (arista no cortada), $-1$
cuando discrepan (arista cortada). Toma un estado que anticorrelaciona dos vértices a la perfección y lee
su término de arista:

```qexpect
{
  "id": "algo-expect-cut-zz-1",
  "prompt": "El circuito H 0, CNOT 0 1, X 1 prepara (|01⟩ + |10⟩)/√2 — dos vértices forzados a particiones opuestas en cada disparo. ¿Cuál es el valor esperado ⟨Z₀Z₁⟩?",
  "program": "H 0\nCNOT 0 1\nX 1",
  "observable": "Z 0 Z 1",
  "hint": "El estado solo tiene soporte en |01⟩ y |10⟩, y en ambos los cúbits discrepan, así que cada disparo devuelve el valor propio de Z₀Z₁ igual a −1 y la esperanza es exactamente −1. En términos de MaxCut, ⟨ZᵢZⱼ⟩ = −1 significa que la arista está cortada — el observable de costo de QAOA es una suma de precisamente estos términos de arista."
}
```

Optimizadores habituales para ese bucle exterior: **COBYLA** y **Nelder–Mead** (sin gradiente, robustos al
ruido), **SPSA** (dos evaluaciones por paso) y **Adam** (basado en gradiente vía la regla de
desplazamiento de parámetros).

## Estimación de amplitud, y un control

La **estimación de amplitud** generaliza Grover: en lugar de encontrar un elemento marcado, *estima la
probabilidad* de un resultado "bueno", convirtiendo la aceleración cuadrática de Grover en una aceleración cuadrática sobre
Monte Carlo clásico ($O(1/\epsilon)$ consultas frente a $O(1/\epsilon^2)$ muestras para precisión
$\epsilon$). Es la base de enfoques cuánticos a la valuación de opciones y el análisis de riesgo.

```quiz
{
  "questions": [
    {
      "id": "algo-dj-one-query",
      "q": "¿Por qué Deutsch–Jozsa necesita solo UNA consulta al oráculo donde un algoritmo clásico puede necesitar `2^(n-1) + 1` consultas?",
      "hint": "Piensa en sobre qué se consulta el oráculo y qué hace la capa final de Hadamards a los signos resultantes.",
      "a": "El oráculo se consulta una vez sobre una superposición de las `2^n` entradas a la vez. Los Hadamards finales hacen que las amplitudes con retroceso de fase interfieran: la amplitud de todo ceros es `(1/N) * sum_x (-1)^f(x)`, que es `±1` para `f` constante y exactamente `0` para `f` balanceada. Una consulta más interferencia lo decide."
    },
    {
      "id": "algo-grover-geometry",
      "q": "¿Qué le hace una sola iteración de Grover al estado, geométricamente?",
      "hint": "Son dos reflexiones seguidas. Dos reflexiones se componen en qué tipo de transformación?",
      "a": "Rota el vector de estado un ángulo fijo hacia el estado marcado: el oráculo refleja respecto del estado marcado, luego la difusión refleja respecto de la superposición uniforme, y dos reflexiones forman una rotación. La amplitud marcada crece durante unas `(pi/4)*sqrt(N)` iteraciones y luego sobre-rota."
    },
    {
      "id": "algo-qft-period",
      "q": "¿Cómo expone la QFT un periodo oculto `r` en un estado?",
      "hint": "Una entrada periódica solo tiene amplitud en un peine de índices. ¿Dónde interfieren constructivamente esos términos en la salida?",
      "a": "La QFT de un peine de periodo `r` interfiere constructivamente solo en los índices de salida que son múltiplos de `N/r`, produciendo picos agudos ahí y cancelación en el resto. Leer el espaciado de los picos recupera el periodo — el núcleo de la estimación de fase y del algoritmo de Shor."
    },
    {
      "id": "algo-qaoa-gamma-beta",
      "q": "En QAOA, ¿qué controlan los dos ángulos `gamma` y `beta`?",
      "hint": "Un ángulo pertenece a la unitaria de costo; el otro, al mezclador.",
      "a": "`gamma` escala la unitaria de costo `e^(-i*gamma*C)`, que imprime el problema de optimización como fases; `beta` escala el mezclador `RX(2*beta)` en cada cúbit, que reparte amplitud entre asignaciones. Un optimizador clásico ajusta `(gamma, beta)` para maximizar el corte esperado."
    }
  ]
}
```

---

## Ejercicios prácticos

1. **`notebooks/01-deutsch-jozsa.ipynb`** — Implementa el algoritmo Deutsch-Jozsa para n=3 cúbits. Construye oráculos constantes y balanceados. Verifica la determinación con una sola consulta. Compara con la complejidad de consulta clásica.

2. **`notebooks/02-grovers-search.ipynb`** — Implementa el algoritmo de Grover para n=3 (espacio de búsqueda de 8). Construye oráculos personalizados. Grafica la probabilidad de éxito frente al número de iteraciones. Observa el número óptimo de iteraciones.

3. **`notebooks/03-qft.ipynb`** — Construye el circuito de la QFT desde cero (Hadamards + rotaciones controladas + swaps). Verifica que transforma correctamente los estados de la base computacional. Compara la salida con el FFT de numpy.

4. **`notebooks/04-qpe.ipynb`** — Implementa QPE para estimar la fase de una puerta T (debe dar phi = 1/8). Explora la precisión frente al número de cúbits ancilla. Conecta con la estimación de valores propios.

5. **`notebooks/05-qaoa-maxcut.ipynb`** — Define un problema MaxCut en un grafo pequeño. Construye el circuito QAOA (p=1 y p=2). Optimiza gamma y beta con COBYLA. Visualiza el paisaje de energía.

6. **`notebooks/06-amplitude-estimation.ipynb`** — Implementa estimación de amplitud básica. Compara la tasa de convergencia con Monte Carlo clásico. Aplícala a un ejemplo toy de valuación financiera.

**Scripts:**
- `scripts/oracles.py` — Funciones reutilizables para construir circuitos de oráculo (constante, balanceado, de marcado)
- `scripts/variational_utils.py` — Envoltorios de optimizadores clásicos (COBYLA, SPSA) con historial por iteración y callbacks

## A dónde va esto después

Ya tienes el kit algorítmico: oráculos y amplificación de amplitud, la transformada de Fourier
y la estimación de fase, y el bucle variacional. Los dos módulos siguientes lo especializan. **`04-quantum-ml`**
convierte circuitos variacionales en modelos de aprendizaje automático — codificaciones, kernels cuánticos y
clasificadores variacionales — y **`05-quantum-chemistry`** apunta la estimación de fase y el método
variacional a moléculas, calculando energías del estado base con VQE.

---

## Referencias

### Documentación de AWS
- [Amazon Braket algorithm examples](https://github.com/amazon-braket/amazon-braket-examples/tree/main/examples/quantum_algorithms) — Ejemplos oficiales en notebooks para Grover, QFT, QPE
- [Running circuits with OpenQASM 3.0](https://docs.aws.amazon.com/braket/latest/developerguide/braket-openqasm.html) — Formato alternativo de especificación de circuitos
- [Hybrid quantum algorithms on Braket](https://docs.aws.amazon.com/braket/latest/developerguide/braket-jobs.html) — Ejecutar QAOA/VQE como trabajos híbridos

### Recursos en video
- [Quantum Algorithms — IBM Qiskit Summer School 2020](https://www.youtube.com/watch?v=VPfQMh4uxEM) — Abe Asfaw, 90 min, cubre Deutsch-Jozsa hasta Grover con demostraciones
- [Grover's Algorithm Visualized](https://www.youtube.com/watch?v=ePr2MgQkqL0) — Visualización al estilo 3Blue1Brown, 20 min, intuición geométrica de la amplificación de amplitud
- [Quantum Fourier Transform — Qiskit](https://www.youtube.com/watch?v=lOKq3rTrTjM) — Julien Gacon, 30 min, construcción paso a paso de la QFT
- [QAOA Explained — Musty Thoughts](https://www.youtube.com/watch?v=AOKM9BkweVU) — Michal Stechly, 25 min, explicación intuitiva de QAOA con MaxCut
- [Variational Quantum Algorithms — AWS re:Invent 2022](https://www.youtube.com/watch?v=3KVqpRQjr5o) — Equipo de AWS Braket, 45 min, VQE y QAOA en Braket con código
- [Quantum Phase Estimation — Minutephysics](https://www.youtube.com/watch?v=5kcoaanYyZw) — 12 min, recorrido visual claro del circuito de QPE

### Artículos y lectura adicional
- [A fast quantum mechanical algorithm for database search (Grover, 1996)](https://arxiv.org/abs/quant-ph/9605043) — El artículo original de Grover
- [Quantum Approximate Optimization Algorithm (Farhi et al., 2014)](https://arxiv.org/abs/1411.4028) — Artículo original de QAOA
- [Quantum Computation by Adiabatic Evolution (Farhi et al., 2000)](https://arxiv.org/abs/quant-ph/0001106) — Fundamento teórico que conecta con QAOA
- [Variational Quantum Eigensolver review (Tilly et al., 2022)](https://arxiv.org/abs/2111.05176) — Revisión exhaustiva de enfoques variacionales
