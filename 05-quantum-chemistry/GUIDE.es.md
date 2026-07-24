# Química cuántica y bioquímica

Todo fármaco que funciona, todo catalizador que acelera una reacción, toda batería que retiene una carga se reduce a un cálculo que ninguna computadora clásica puede hacer de forma exacta: ¿adónde van los electrones? Resuélvelo y puedes predecir la química antes de tocar un vaso de precipitados. Esta es la aplicación a la que apunta la gente cuando dice que las computadoras cuánticas cambiarán el mundo — y es el único lugar donde una molécula real, el hidrógeno, se colapsa de forma limpia en un solo qubit en el que puedes observar cómo encuentra su propio estado fundamental.

## Objetivos de aprendizaje

Al completar esta sección, serás capaz de:
- Construir Hamiltonianos moleculares usando segunda cuantización
- Mapear operadores fermiónicos a operadores de qubits (Jordan-Wigner, Bravyi-Kitaev)
- Implementar el Variational Quantum Eigensolver (VQE, solucionador variacional de autovalores) para estimar el estado fundamental
- Diseñar y comparar circuitos de ansatz (UCCSD, hardware-efficient)
- Seleccionar espacios activos para reducir el número de qubits en moléculas más grandes
- Comprender aplicaciones al descubrimiento de fármacos y a la ciencia de materiales

## Prerrequisitos

- Completado: 01-foundations, 02-hardware, 03-algorithms (especialmente las secciones de QPE y variacionales)
- Química básica: orbitales atómicos, enlaces moleculares, configuración electrónica
- Álgebra lineal: problemas de autovalores, operadores hermitianos

---

## El problema de la molécula

Fija los núcleos de una molécula en su lugar y una pregunta decide todo lo que sigue: ¿cuál es la energía más baja en la que pueden acomodarse los electrones, y cómo se ve ese estado? Esa energía del estado fundamental es la estabilidad de la molécula. Sigue cómo cambia al estirar un enlace y tienes una reacción. Compárala entre un fármaco y su diana y tienes la afinidad de unión. Toda la química es, en el fondo, una búsqueda del fondo de un pozo de energía.

El problema es que los electrones se resisten a tratarse de uno en uno. Se repelen entre sí, de modo que la posición de cada electrón depende de la de todos los demás — y la descripción honesta de esa danza es una función de onda que vive en un espacio de dimensión $2^n$ para $n$ espín-orbitales. Veinte orbitales ya son un vector de un millón de dimensiones; cien son más números de los que hay átomos en la Tierra.

La química clásica sobrevive aproximando. La teoría del funcional de la densidad y el coupled cluster son ingeniería extraordinaria, y para la mayoría de las moléculas bastan. Pero se apoyan en el supuesto de que los electrones solo están débilmente correlacionados — y ese supuesto se quiebra exactamente donde vive la química interesante: estados de transición de ruptura de enlaces, catalizadores de metales de transición, los enlaces estirados de una enzima a mitad de reacción. Estos son *fuertemente correlacionados*, y ahí las aproximaciones fallan en silencio.

Una computadora cuántica ofrece un trato distinto. Un registro de $n$ qubits *es* un estado de dimensión $2^n$ — el espacio exponencial no es algo que tenga que almacenar, es algo que es de forma nativa. Codifica una función de onda de $n$ espín-orbitales en $n$ qubits y el costo de representación deja de ser el problema. Lo que queda es una pregunta mucho más acotada: ¿cómo escribimos una molécula como algo que una computadora cuántica pueda sostener, y cómo la guiamos hacia su estado fundamental?

```qcard
{"id":"chem-qubit-native-space","prompt":"¿Por qué representar una función de onda molecular es más barato en una computadora cuántica que en una clásica?","answer":"Un registro de `n` qubits *es* un estado de dimensión `2^n`, de modo que el espacio exponencialmente grande es algo que el dispositivo es de forma nativa, no algo que tenga que almacenar. Codificar `n` espín-orbitales en `n` qubits elimina el problema del costo de representación."}
```

## De electrones a operadores

Seguir electrones por posición es imposible y, peor aún, redundante: los electrones son idénticos, así que etiquetar «electrón 1 aquí, electrón 2 allá» cuenta dos veces la realidad. La segunda cuantización descarta las etiquetas y en su lugar sigue la *ocupación*: para cada espín-orbital, ¿hay un electrón o no?

```qcard
{"id":"chem-second-quantization-occupation","prompt":"¿Qué rastrea la segunda cuantización en lugar de las posiciones de los electrones, y por qué?","answer":"Rastrea la *ocupación* — para cada espín-orbital, si hay un electrón o no. Se abandonan las posiciones porque los electrones son idénticos, así que etiquetarlos cuenta dos veces la realidad."}
```

La contabilidad la hacen dos operadores por orbital $p$: un operador de creación $a_p^\dagger$ que deposita un electrón en el orbital $p$, y un operador de aniquilación $a_p$ que quita uno:

- $a_p^\dagger\ket{0} = \ket{1_p}$ — crear un electrón en el orbital $p$
- $a_p\ket{1_p} = \ket{0}$ — quitarlo
- $\{a_p, a_q^\dagger\} = \delta_{pq}$ — la relación de anticonmutación que codifica el principio de exclusión de Pauli

En este lenguaje, el Hamiltonian molecular completo — energía cinética, atracción electrón-núcleo, repulsión electrón-electrón — se pliega en una expresión compacta:

$$
H = \sum_{pq} h_{pq}\, a_p^\dagger a_q + \frac{1}{2} \sum_{pqrs} h_{pqrs}\, a_p^\dagger a_q^\dagger a_s a_r
$$

Los números $h_{pq}$ (integrales de un electrón) y $h_{pqrs}$ (integrales de dos electrones) son pura geometría y conjunto de base: una computadora clásica los calcula una sola vez a partir de las posiciones nucleares. Lo que queda es un operador construido enteramente a partir de $a^\dagger$ y $a$. Lo único que se interpone entre esto y un circuito cuántico es que los qubits no hablan fermión.

## Los fermiones se convierten en qubits

Qubits y fermiones discrepan en un punto crucial. Intercambia dos electrones y la función de onda debe cambiar de signo: esa antisimetría es lo que impide que dos electrones ocupen el mismo estado. Los qubits no tienen esa regla; voltear el qubit 3 es un acto puramente local que ignora los qubits 0 al 2. Un mapeo fermión-a-qubit existe para reintroducir de contrabando los signos menos que faltan.

La **transformación de Jordan-Wigner** es la más directa. La ocupación del orbital $p$ se convierte en el estado del qubit $p$: $\ket{0}$ vacío, $\ket{1}$ ocupado. Pero un operador de creación no puede ser un volteo local desnudo: tiene que llevar una *cadena de Z* que se arrastra por cada qubit de índice menor:

$$
a_p^\dagger = \frac{X_p - i Y_p}{2}\; Z_{p-1} Z_{p-2} \cdots Z_0
$$

Esa cadena de operadores $Z$ es la antisimetría hecha concreta: lee la paridad de cada orbital por debajo de $p$ y estampa el signo correcto en la operación. Alterna la ocupación de abajo y observa cómo se enciende la cadena:

```qcard
{"id":"chem-jw-z-string","prompt":"En la transformación de Jordan-Wigner, ¿cuál es el papel de la cadena de Z que sigue a un operador de creación?","answer":"La cadena de operadores `Z` es la antisimetría fermiónica hecha concreta: lee la paridad de cada orbital por debajo de `p` y estampa el signo correcto en la operación. Su costo es que un operador ahora toca cada qubit debajo de él, de modo que el peso de Pauli crece con el sistema."}
```

```qjw
{ "modes": 4, "electrons": 2, "mode": 0, "dagger": true }
```

La otra mitad del diccionario son los estados mismos — y es más simple que los operadores. Una referencia Hartree-Fock es un patrón de ocupación definido, así que prepararla no requiere más que compuertas $X$ en los orbitales ocupados (las cadenas de Z solo aportan una fase global en un estado de base). Construye la más pequeña:

```qchallenge
{
  "id": "chem-hf-reference-1",
  "prompt": "Un electrón en dos espín-orbitales: prepara la referencia Hartree-Fock |10⟩ — orbital 0 ocupado, orbital 1 vacío — usando solo compuertas X.",
  "qubits": 2,
  "target": { "program": "X 0" },
  "allowedGates": ["X"],
  "hint": "Bajo Jordan-Wigner, ocupado significa volteado: el qubit p sostiene el orbital p, así que ocupar el orbital 0 es una sola X en el qubit 0. La trampa es voltear el qubit 1 porque el hábito little-endian pone el qubit 0 a la derecha de |10⟩, entregando el 1 de la izquierda al qubit 1 — lee la cadena de izquierda a derecha, orbital 0 primero."
}
```

El mapeo es exacto, pero tiene un costo: un operador en el orbital $p$ ahora toca cada qubit debajo de él, de modo que su peso de Pauli crece con el sistema. La **transformación de Bravyi-Kitaev** es un libro de contabilidad más ingenioso que almacena ocupación y paridad juntas, intercambiando la cadena lineal de $Z$ por operadores de peso $O(\log n)$ — menos intuitivo, pero más barato para moléculas grandes. El **mapeo de paridad** almacena la paridad acumulada directamente y, como hace explícitas dos simetrías (número total de electrones y espín), permite eliminar dos qubits de plano. Para las moléculas pequeñas de esta sección, Jordan-Wigner es el punto de partida natural; los demás son optimizaciones a las que acudes cuando el conteo de qubits aprieta.

Sea cual sea el libro de contabilidad, leerlo de vuelta es una medición. Bajo Jordan-Wigner el operador de número es $n_p = (I - Z_p)/2$, lo que hace de $Z_p$ el medidor de ocupación mismo: $+1$ en un orbital vacío, $-1$ en uno ocupado. Crea un electrón y toma la lectura:

```qexpect
{
  "id": "chem-jw-number-occupied-1",
  "prompt": "X en el qubit 0 crea un electrón en el orbital 0 — el estado ocupado JW |1⟩. ¿Cuál es ⟨Z₀⟩, la expectativa a partir de la cual se construye el operador de número n₀ = (I − Z₀)/2?",
  "program": "X 0",
  "observable": "Z 0",
  "hint": "Un orbital ocupado es el autoestado |1⟩ de Z con autovalor −1, así que cada disparo lee −1 y el promedio a largo plazo es exactamente −1 — dando n₀ = (1 − (−1))/2 = 1 electrón. La trampa es +1, que es la lectura del orbital vacío, o 0, que significaría una superposición medio-ocupada en lugar de una ocupación definida."
}
```

## La molécula como una matriz

Pasa el hidrógeno por este pipeline en la base mínima STO-3G y cae algo concreto: dos átomos de H, cuatro espín-orbitales, cuatro qubits, y un Hamiltonian que es una suma ponderada de quince cadenas de Pauli. No se ha hecho ninguna aproximación: este es el problema exacto de estructura electrónica para H2, reescrito como algo que un dispositivo de cuatro qubits podría medir. Los coeficientes son física: estira el enlace y se desplazan.

```qham
{ "R": 0.75, "tapered": false }
```

Cada una de esas quince cadenas se estima del mismo modo: prepara un estado, mide la cadena, promedia sobre disparos. Los términos $ZZ$ son medidores de paridad de ocupación: preguntan si dos orbitales coinciden. Pon un solo electrón en un par de dos orbitales y comprométete con la lectura:

```qexpect
{
  "id": "chem-zz-parity-1",
  "prompt": "X 1 pone un electrón en el orbital 1, preparando la configuración de dos orbitales |01⟩. Los términos ZZ del Hamiltonian leen la paridad de ocupación: ¿cuál es ⟨Z₀Z₁⟩ en este estado?",
  "program": "X 1",
  "observable": "Z 0 Z 1",
  "hint": "Multiplica los dos medidores de ocupación: el orbital 0 está vacío (Z₀ lee +1) y el orbital 1 está ocupado (Z₁ lee −1), así que cada disparo de Z₀Z₁ lee (+1)(−1) = −1. Ocupaciones en desacuerdo significan paridad impar, −1; la trampa es +1, que diría que los orbitales coinciden — ambos vacíos o ambos ocupados."
}
```

Ahora el pago. Esos cuatro qubits cargan redundancia: las simetrías que el mapeo de paridad expone significan que el problema real es mucho más pequeño de lo que parece. Al adelgazar (tapering) las cantidades conservadas, el operador de cuatro qubits y quince términos se colapsa a un **solo qubit** con apenas tres términos:

$$
H_{\text{H}_2} \approx -0.34\, I + 0.78\, Z + 0.18\, X
$$

Ese es todo el problema del estado fundamental de una molécula de hidrógeno, viviendo en un qubit. Activa el interruptor de taper de arriba y observa cómo quince términos se pliegan en tres. La lección se generaliza: el conteo ingenuo de qubits casi nunca es el real, y elegir las simetrías y orbitales activos correctos es la diferencia entre un cálculo que cabe en el hardware de hoy y uno que no.

Ninguno de esos términos se puede medir hasta que el registro sostenga el estado que pretenden sondear — y para H2 la referencia queda fija por conteo: dos electrones llenan los dos espín-orbitales más bajos, $\ket{1100}$. El circuito de abajo debía preparar exactamente eso y volteó el orbital equivocado. Diagnostícalo a partir del estado que realmente produjo:

```qdebug
{
  "id": "chem-hf-debug-1",
  "prompt": "Este circuito debía preparar la referencia Hartree-Fock de H2 |1100⟩ — electrones en los dos espín-orbitales más bajos — pero produjo |1010⟩, una configuración con un electrón promovido demasiado alto. Arréglalo.",
  "qubits": 4,
  "broken": { "program": "X 0\nX 2" },
  "target": { "program": "X 0\nX 1" },
  "allowedGates": ["X"],
  "hint": "Hartree-Fock llena desde abajo: orbitales 0 y 1 ocupados, 2 y 3 vacíos. La X 2 errante crea su electrón un orbital demasiado alto, produciendo una configuración monoexcitada en lugar de la referencia. Mueve esa X hacia abajo al qubit 1."
}
```

## Minimizando la energía

Tenemos la molécula como un operador. Encontrar su estado fundamental significa encontrar el autovalor más bajo de $H$ — y para cualquier cosa mayor que un juguete, diagonalizar $H$ es exactamente el muro exponencial que intentábamos evitar. El **Variational Quantum Eigensolver** (VQE) lo elude con una sola idea profunda de la física: el principio variacional. Para *cualquier* estado de prueba $\ket{\psi(\theta)}$,

$$
\expval{\psi(\theta)|H|\psi(\theta)} \ge E_{\text{ground}}
$$

La energía esperada de cualquier estado que puedas preparar es una cota superior de la verdadera energía del estado fundamental. Nunca puedes medir por debajo del piso: solo puedes acercarte a él. Así que VQE convierte la búsqueda del estado fundamental en optimización: prepara un estado parametrizado en la computadora cuántica, mide $\expval{H}$, entrega el número a un optimizador clásico, ajusta $\theta$, repite. El dispositivo cuántico hace la parte en la que es bueno (sostener y medir un estado exponencial); el optimizador clásico hace la parte en la que es bueno (empujar unos pocos botones cuesta abajo).

```qcard
{"id":"chem-vqe-variational-bound","prompt":"¿Qué hecho del principio variacional permite a VQE convertir la búsqueda del estado fundamental en un problema de minimización?","answer":"Para cualquier estado de prueba, la energía esperada `<psi|H|psi>` es una cota superior de la verdadera energía del estado fundamental `E_ground` — nunca puedes medir por debajo del piso, solo acercarte. Así que VQE prepara un estado parametrizado, mide `<H>` y deja que un optimizador clásico baje esa cota."}
```

«Medir $\expval{H}$» esconde una factura. Un Hamiltonian es una suma de cadenas de Pauli; la cadena identidad es una constante clásica que no cuesta nada, y el protocolo ingenuo mide cada una de las otras 14 como su propia tarea de hardware (agrupar cadenas que conmutan puede reducir eso a unas cinco configuraciones — pero primero calcula el precio de la corrida ingenua):

```qcostestimate
{
  "id": "chem-vqe-cost-1",
  "prompt": "Una evaluación de energía VQE para H2 de cuatro qubits mide de forma ingenua cada una de las 14 cadenas de Pauli no identidad del Hamiltonian como su propia tarea IonQ de 1,000 disparos. ¿Cuánto cuesta esa única evaluación de ⟨H⟩?",
  "provider": "IonQ",
  "shots": 1000,
  "tasks": 14,
  "hint": "Catorce medidores corren a la vez: 14 tareas a {perTask} cada una, más {perShot} por cada uno de los {shots} disparos dentro de cada tarea. El desliz clásico es cotizar una tarea y olvidar el ×14 — y recuerda, esto compra un solo punto en el paisaje de energía; el optimizador pedirá cientos."
}
```

Para H2 adelgazado (tapered), todo el paisaje cabe en una sola imagen. El ansatz es una sola rotación $R_Y(\theta)\ket{0}$, la energía es $E(\theta) = c_0 + c_z\cos\theta + c_x\sin\theta$, y el piso variacional se asienta exactamente en el mínimo de esa curva. Arrastra $\theta$ e intenta empujar la energía por debajo de la línea: no puedes. Luego deja que el optimizador encuentre el fondo:

```qvqe
{ "R": 0.74 }
```

Hay algo especial en este caso que vale la pena decir con claridad: como el ansatz de un solo qubit puede alcanzar *todos* los estados de ese qubit, VQE aquí no es aproximado — aterriza exactamente en la verdadera energía del estado fundamental, $-1.137$ Hartree. Para moléculas más grandes el ansatz solo puede cubrir parte del espacio, y la brecha entre el piso y lo que tu circuito puede alcanzar se convierte en el desafío central del campo.

## Dibujando un enlace químico

Una geometría da una energía. Barre la geometría y obtienes química. Separa los dos átomos de hidrógeno, resuelve de nuevo en cada separación, y la cadena de energías del estado fundamental traza la **superficie de energía potencial** de la molécula — la curva cuyo mínimo es la longitud de enlace de equilibrio y cuya profundidad es la energía que mantiene unida a la molécula.

```qpes
{ "mark": 0.74 }
```

El mínimo se asienta cerca de $0.74$ ángstrom a $-1.137$ Hartree, y el pozo tiene unos $0.20$ Hartree de profundidad: ese es el enlace. Pero la característica más instructiva es la brecha entre las dos curvas. Hartree-Fock, el método de campo medio de caballo de batalla, se pega a la curva exacta cerca del equilibrio donde los electrones están débilmente correlacionados. Estira el enlace y se despega, subiendo muy por encima de la verdad: el Hartree-Fock restringido simplemente no puede describir dos átomos que derivan hacia radicales independientes. Esa brecha que se ensancha es la **energía de correlación**, y es el enunciado cuantitativo preciso de por qué la química fuertemente correlacionada necesita más que el campo medio — el régimen exacto donde se supone que las computadoras cuánticas ganan su sueldo.

Hay una imagen a nivel de circuito de lo que comparten esos dos átomos estirados. En lenguaje de ocupación, un enlace covalente es un electrón repartido entre dos orbitales — la superposición $(\ket{01} + \ket{10})/\sqrt{2}$ — y bajo Jordan-Wigner el término de hopping $a_0^\dagger a_1 + a_1^\dagger a_0$ que los une se convierte en $(X_0 X_1 + Y_0 Y_1)/2$. Mide su primera mitad en el estado del electrón compartido:

```qexpect
{
  "id": "chem-hopping-xx-1",
  "prompt": "H 0, CNOT 0 1, X 1 prepara (|01⟩ + |10⟩)/√2 — un electrón compartido entre dos orbitales. ¿Cuál es ⟨X₀X₁⟩, la expectativa del término de hopping, en este estado?",
  "program": "H 0\nCNOT 0 1\nX 1",
  "observable": "X 0 X 1",
  "hint": "X₀X₁ intercambia las dos configuraciones, |01⟩ ↔ |10⟩, y este estado es su combinación simétrica — el intercambio lo devuelve sin cambios, así que es un autoestado +1 y ⟨X₀X₁⟩ = +1. La trampa es 0: cada qubit solo se lee como un lanzamiento de moneda, pero la lectura conjunta es perfectamente definida — exactamente la correlación de la que está hecho un enlace."
}
```

## Diseñando el ansatz

VQE solo es tan bueno como los estados que su ansatz puede alcanzar. El circuito de prueba $U(\theta)$ es todo el juego, y hay dos filosofías para construirlo.

Ambas parten del mismo lugar: la referencia Hartree-Fock, la ocupación de campo medio que el ansatz luego viste con correlación. Constrúyela una vez tú mismo, en Python real de Braket — calificado ejecutando tu código en el navegador:

```qchallenge
{
  "id": "chem-hf-ref-py-1",
  "prompt": "Prepara la referencia Hartree-Fock para H₂ en el cuadro mínimo de dos orbitales, en Python real de Braket: el estado de ocupación |11⟩, ambos espín-orbitales llenos. Asigna tu circuito a `circuit`.",
  "qubits": 2,
  "target": { "program": "X 0\nX 1" },
  "starter": "from braket.circuits import Circuit\ncircuit = Circuit()",
  "hint": "La referencia Hartree-Fock es un solo estado de ocupación — sin superposición, sin entrelazamiento. Ocupado significa |1⟩, así que voltea ambos qubits desde |0⟩ con una X en cada uno para aterrizar en |11⟩.",
  "tier": "py"
}
```

**Unitary Coupled Cluster (UCC)** toma prestada la estructura del coupled cluster clásico, el estándar de oro de la química cuántica. UCCSD construye excitaciones sobre el estado Hartree-Fock:

$$U(\theta) = e^{T - T^\dagger}, \quad T = T_1 + T_2$$

donde $T_1$ promueve un electrón a la vez (singles) y $T_2$ promueve pares (doubles). Está motivado químicamente: cada parámetro corresponde a una excitación física, así que converge a la respuesta correcta. El costo es la profundidad: cada excitación es una cadena de CNOTs, y en hardware ruidoso esa profundidad es cara.

Lo que una excitación doble le hace de verdad al registro vale la pena verlo una vez en estados de base: actuando sobre la referencia de H2, $T_2$ mueve el *par* — ambos electrones dejan los orbitales 0, 1 y aterrizan juntos en los orbitales 2, 3, dejando una superposición coherente de las dos configuraciones. Sigue este circuito estilo doubles y comprométete:

```qpredict
{
  "id": "chem-ucc-double-support-1",
  "prompt": "Este circuito aplica una excitación estilo doubles a cuatro espín-orbitales, superponiendo la referencia de H2 con la configuración en la que ambos electrones se movieron hacia arriba juntos. ¿Qué estados de base aparecen con probabilidad distinta de cero?",
  "program": "H 0\nCNOT 0 1\nX 2\nCNOT 0 2\nX 3\nCNOT 0 3",
  "mode": "nonzero-states",
  "hint": "Sigue las dos ramas del qubit 0. En su rama 0 no se dispara ningún CNOT, así que las compuertas X llenan los orbitales 2 y 3: |0011⟩. En su rama 1, CNOT 0 1 llena el orbital 1 y los CNOTs posteriores deshacen ambos llenados con X: |1100⟩. El par se mueve como uno — no sobrevive ninguna configuración con un par dividido."
}
```

**Hardware-Efficient Ansatz (HEA)** abandona el significado químico por la poca profundidad: solo capas de rotaciones de un qubit y las compuertas entrelazadoras que tu dispositivo soporte. Una sola capa es una rotación seguida de un entrelazador. Arrastra $\theta$ para barrer el parámetro y desplázate para ver evolucionar el estado de dos qubits — este es el motivo elemental que busca el optimizador de VQE:

```qscrub
qubits 2
RY 0 theta
CNOT 0 1
```

HEA corre en cualquier topología y se mantiene poco profundo, pero lo paga: puede vagar a regiones sin relevancia química, y apilar capas invita a las barren plateaus del módulo anterior. **ADAPT-VQE** parte la diferencia: crece el ansatz un operador a la vez, cada ronda añadiendo la excitación con el gradiente de energía más empinado. Gasta más mediciones durante la optimización pero termina con un circuito compacto y específico del problema. La elección entre ellos es el trade-off recurrente de NISQ: exactitud contra profundidad contra entrenabilidad.

«Sin relevancia química» tiene un rostro concreto. Una molécula tiene un conteo fijo de electrones, pero nada en una capa hardware-efficient lo sabe: un Hadamard desnudo en un qubit de orbital superpone felizmente *números distintos de electrones*. Predice dónde pone su amplitud este fragmento estilo HEA:

```qpredict
{
  "id": "chem-hea-number-leak-1",
  "prompt": "Un fragmento estilo HEA: X ocupa el orbital 0, luego H actúa sobre el orbital 1. ¿Qué estados de base de dos orbitales aparecen con probabilidad distinta de cero?",
  "program": "X 0\nH 1",
  "mode": "nonzero-states",
  "hint": "X fija el orbital 0 como ocupado; H reparte el orbital 1 de forma pareja entre vacío y ocupado. El soporte es |10⟩ y |11⟩ — una rama tiene un electrón, la otra dos. Una molécula no puede superponer números de electrones, y esto es exactamente cómo un ansatz sin restricciones se aleja de la química."
}
```

## Escalando: conjuntos de base y espacio activo

Dos perillas deciden qué tan grande se vuelve el problema. El **conjunto de base** es qué tan fino aproximas cada orbital atómico con funciones gaussianas: STO-3G es mínimo y rápido pero tosco (es lo que produjo la curva de H2 de arriba, y por qué esa curva es cualitativamente correcta pero cuantitativamente floja); 6-31G divide la capa de valencia; cc-pVDZ y cc-pVTZ suben una escalera sistemática hacia el límite del conjunto de base. Una base más rica significa más orbitales — y más orbitales significa más qubits.

El **espacio activo** es cómo te las arreglas cuando el conteo completo es desesperado. No puedes poner los ochenta espín-orbitales de una molécula mediana en una computadora cuántica, pero no tienes que hacerlo. Corre un Hartree-Fock clásico barato para obtener los orbitales moleculares, quédate solo con el puñado cerca del nivel de Fermi donde está la acción, congela el resto en un fondo promediado, y entrega solo esa ventana activa a VQE. Una molécula con 20 electrones en 40 orbitales nominalmente necesita 80 qubits; un espacio activo de 4 electrones en 4 orbitales necesita 8 — tratable hoy. Es el mismo movimiento que el tapering de simetría que redujo H2 a un qubit, aplicado con juicio químico: gasta tus escasos qubits solo donde la correlación realmente importa.

Congelar un orbital es seguro precisamente porque sus mediciones son conclusiones anticipadas: un orbital que nunca recibe un electrón lee el mismo valor en cada disparo, así que cada término del Hamiltonian que toca solo orbitales congelados se colapsa a una constante que sumas clásicamente. Confirma la entrada del libro para un virtual congelado:

```qexpect
{
  "id": "chem-frozen-empty-z-1",
  "prompt": "Un orbital virtual congelado nunca recibe un electrón — el circuito lo deja intacto (identidad). ¿Cuál es ⟨Z₀⟩ para este orbital permanentemente vacío?",
  "program": "I 0",
  "observable": "Z 0",
  "hint": "Vacío significa |0⟩, el autoestado +1 de Z: cada disparo lee +1 y el promedio es exactamente +1, así que n₀ = (1 − ⟨Z₀⟩)/2 = 0 electrones. Como esa lectura nunca puede cambiar, un orbital congelado solo aporta una constante clásica — por eso congelarlo no cuesta nada más que un desplazamiento de energía. La trampa es −1, la lectura del orbital ocupado."
}
```

## Dónde importa esto

Las moléculas que las computadoras cuánticas pueden tratar con exactitud hoy — H2, LiH, BeH2, agua — son pequeñas. El valor no está en esas respuestas, que los métodos clásicos ya clavan, sino en validar métodos que escalarán conforme crezca el hardware:

- **Unión de fármacos.** Qué tan fuerte se aferra una molécula candidata a un bolsillo proteico es una diferencia de energías grandes, y la interfaz de unión a menudo está fuertemente correlacionada — exactamente donde errores de campo medio de unos pocos kcal/mol deciden si un fármaco funciona.
- **Mecanismos de reacción.** Mapear la energía a lo largo de una coordenada de reacción significa resolver estados de transición, que cargan un fuerte carácter multirreferencial. Equivócate en la altura de la barrera y predecirás mal la tasa por órdenes de magnitud.
- **Materiales por diseño.** Catalizadores, electrolitos de batería y candidatos a superconductores son problemas de electrones correlacionados donde la exactitud de primeros principios reemplazaría décadas de prueba y error.

Esa última viñeta tiene un juguete de dos qubits que ya puedes construir. La superconductividad corre sobre el emparejamiento de electrones — configuraciones donde dos orbitales se vacían *juntos* o se llenan *juntos*, superpuestas. Un estado producto de campo medio no puede sostener esa correlación; tu registro sí:

```qchallenge
{
  "id": "chem-pairing-state-1",
  "prompt": "Prepara el estado de emparejamiento juguete (|00⟩ + |11⟩)/√2 — dos orbitales que siempre están vacíos juntos u ocupados juntos, en superposición.",
  "qubits": 2,
  "starter": "H 0\nH 1",
  "target": { "program": "H 0\nCNOT 0 1" },
  "allowedGates": ["H", "CNOT"],
  "hint": "Dos Hadamards independientes dan a cada configuración el mismo peso — incluyendo los estados de par roto |01⟩ y |10⟩. El emparejamiento es una correlación, así que necesita una compuerta de dos qubits: superpone el orbital 0 con H, luego deja que CNOT copie su ocupación al orbital 1 para que el par se llene o se vacíe como uno."
}
```

El hilo conductor de todo este módulo es el único movimiento que hicimos con el hidrógeno: una molécula es un operador, el operador es una matriz, y la matriz tiene un autovalor más bajo que puedes perseguir minimizando un valor esperado. Todo lo demás — mejores mapeos, mejores ansatze, espacios activos — es ingeniería al servicio de empujar esa sola idea hacia moléculas que importan.

---

## Ejercicios prácticos

1. **`notebooks/01-molecular-hamiltonians.ipynb`** — Usa OpenFermion + PySCF para calcular el Hamiltonian de H2 y LiH. Examina las integrales de uno y dos electrones. Convierte a operadores de qubits y cuenta términos.

2. **`notebooks/02-fermion-qubit-mapping.ipynb`** — Aplica Jordan-Wigner y Bravyi-Kitaev al mismo Hamiltonian. Compara el peso del operador de qubits (número de términos de Pauli, localidad máxima). Discute los trade-offs.

3. **`notebooks/03-vqe-h2.ipynb`** — Flujo completo de VQE para H2: construye el ansatz UCCSD, mide términos del Hamiltonian, optimiza con COBYLA. Grafica energía vs. longitud de enlace (superficie de energía potencial). Compara con diagonalización exacta.

4. **`notebooks/04-vqe-lih.ipynb`** — Escala a LiH (más qubits). Usa selección de espacio activo. Compara ansatz hardware-efficient vs. UCCSD. Analiza convergencia y exactitud.

5. **`notebooks/05-ansatz-design.ipynb`** — Compara enfoques UCCSD, hardware-efficient y ADAPT-VQE en H2O (en espacio activo). Mide profundidad del circuito, conteo de CNOT y exactitud de energía para cada uno.

6. **`notebooks/06-active-space.ipynb`** — Demuestra la selección de espacio activo: el espacio completo de H2O necesitaría 14 qubits; el espacio activo reduce a 4-8. Usa PySCF CASCI para validar la elección del espacio activo.

7. **`notebooks/07-excited-states.ipynb`** — Implementa SSVQE (Subspace-Search VQE) para encontrar el primer estado excitado de H2. Compara con la energía exacta del estado excitado.

8. **`notebooks/08-hybrid-chemistry-job.ipynb`** — Empaqueta VQE como un Braket Hybrid Job. Escanea longitudes de enlace en paralelo. Usa checkpointing para barridos grandes de parámetros. Flujo de química en producción.

**Scripts:**
- `scripts/hamiltonians.py` — Pipeline de construcción de Hamiltonianos moleculares (geometría -> integrales -> operador de qubits)
- `scripts/ansatz.py` — Constructores de circuitos de ansatz parametrizados (UCCSD, HEA, personalizado)
- `scripts/vqe_runner.py` — Ejecutor VQE de extremo a extremo con barrido de energía vs. geometría

---

## Referencias

### Documentación de AWS
- [VQE Chemistry example on Braket](https://github.com/amazon-braket/amazon-braket-examples/blob/main/examples/hybrid_quantum_algorithms/VQE_Chemistry/VQE_chemistry_braket.ipynb) — Notebook oficial de VQE
- [Hybrid Jobs for chemistry](https://docs.aws.amazon.com/braket/latest/developerguide/braket-jobs.html) — Ejecutar VQE como un job gestionado con prioridad de QPU
- [PennyLane quantum chemistry](https://pennylane.ai/qml/demos/tutorial_quantum_chemistry/) — Documentación del módulo de química de PennyLane

### Recursos en video
- [Quantum Chemistry with VQE — IBM Qiskit](https://www.youtube.com/watch?v=Z-A6G0WVI9w) — Antonio Mezzacapo, 60 min, teoría e implementación completa de VQE para química
- [Simulating Molecules using Quantum Computers — Google AI](https://www.youtube.com/watch?v=w7398u8G588) — Ryan Babbush, 45 min, frontera de la simulación de química cuántica
- [Electronic Structure Problem — Qiskit Summer School](https://www.youtube.com/watch?v=fACEhn55XRA) — 90 min, de la ecuación de Schrödinger a Hamiltonianos de qubits
- [OpenFermion Tutorial](https://www.youtube.com/watch?v=fHBZ6JVoP7M) — Google Quantum AI, 40 min, uso de OpenFermion para simulación molecular
- [Active Space Methods — Quantum Computing for Chemistry](https://www.youtube.com/watch?v=Rf8h3pKXgio) — 35 min, cómo seleccionar qué orbitales poner en la computadora cuántica
- [Drug Discovery and Quantum Computing](https://www.youtube.com/watch?v=jTjz9PReryo) — Zapata Computing, 30 min, perspectiva de la industria sobre química cuántica para farma

### Artículos y lectura adicional
- [Quantum computational chemistry (McArdle et al., 2020)](https://arxiv.org/abs/1808.10402) — Revisión exhaustiva de algoritmos cuánticos para química
- [Hardware-efficient VQE (Kandala et al., 2017)](https://arxiv.org/abs/1704.05018) — Primer VQE en hardware real (IBM)
- [ADAPT-VQE (Grimsley et al., 2019)](https://arxiv.org/abs/1812.11173) — Construcción adaptativa de ansatz
- [Quantum chemistry in the age of quantum computing (Cao et al., 2019)](https://arxiv.org/abs/1812.09976) — Revisión amplia que conecta la química con algoritmos cuánticos
- [OpenFermion: The Electronic Structure Package for Quantum Computers](https://arxiv.org/abs/1710.07629) — Artículo y tutorial de OpenFermion
- [Molecular Simulations with Quantum Computers: A book by Szabo and Ostlund](https://store.doverpublications.com/0486691861.html) — Referencia clásica para el trasfondo de química cuántica

---

El siguiente módulo, **`06-hybrid-jobs`**, toma el flujo de VQE que acabas de construir — preparar, medir, optimizar, repetir — y lo empaqueta como un job híbrido cuántico-clásico gestionado de grado producción que escanea geometrías en paralelo y hace checkpoint de barridos largos.
