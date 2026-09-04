# Hardware cuántico en Amazon Braket

En los dos módulos anteriores construiste circuitos impecables en un simulador ideal: compuertas
perfectas, mediciones perfectas, paciencia infinita y sin factura. Las computadoras cuánticas reales
no son nada de eso. Son **ruidosas**, **escasamente interconectadas**, **lentas** y **medidas por
consumo**. Este módulo trata de enfrentar esa realidad: qué son realmente las máquinas de hoy, cómo
sus imperfecciones afectan tus circuitos y cómo elegir (y pagar) la adecuada.

Todo aquí se ejecuta en vivo en tu navegador: el ruido, el enrutamiento y el costo se simulan o
calculan de forma local. Nada envía una tarea ni gasta un centavo.

> **Al terminar podrás** distinguir máquinas de iones atrapados, superconductoras y de átomos
> neutros, leer la conectividad y la fidelidad de un dispositivo, razonar sobre el ruido, subir la
> escalera de simuladores y estimar el costo antes de tocar un QPU. **Necesitas primero:**
> `01-foundations` (circuitos, compuertas, medición). Para ejecutar los notebooks en hardware real
> también necesitarás credenciales de AWS (`make setup`) — pero esta página no las requiere.

Por ahora la plataforma no ofrece ejecuciones en hardware. Todo lo de esta página — el
descubrimiento de dispositivos, el modelo de ruido, la escalera de costos, el estimador — se
ejecuta gratis en tu navegador contra el simulador. Para ejecutar hoy en un QPU real necesitas tu
propia cuenta de AWS, y Braket le cobra directamente a esa cuenta: calcula el costo primero y
luego decide.

---

## Por qué no existe una sola "mejor" computadora cuántica

Si un enfoque de hardware fuera estrictamente superior, solo existiría uno. En cambio, cada
implementación física intercambia una virtud por otra, y Amazon Braket te ofrece varias de ellas
detrás de una sola API para que elijas por problema. Los ejes que realmente deciden el destino de un
circuito:

- **Conectividad** — qué cúbits pueden interactuar de forma directa. Todo-a-todo significa que
  cualquier par se entrelaza directamente; una red 2D significa que los cúbits distantes deben
  acercarse primero.
- **Fidelidad de compuerta** — con cuánta precisión se ejecuta cada compuerta. Los errores se
  acumulan, así que un circuito largo en una máquina con 98 % por compuerta puede ser mayormente
  ruido al final.
- **Tiempo de coherencia** — cuánto tiempo un cúbit mantiene su estado antes de decaer. Todo tu
  circuito debe terminar bien dentro de ese tiempo.
- **Velocidad de reloj** — qué tan rápido corren las compuertas (nanosegundos vs microsegundos).
- **Cantidad de cúbits** — qué tan grande puede ser el problema que siquiera puedes expresar.

Ten presentes estos cinco. Cada dispositivo de abajo es solo un punto distinto en este espacio de
compromisos — y las siguientes dos secciones muestran los dos intercambios que más duelen.

## Ruido — la realidad definitoria de NISQ

Vivimos en la era **NISQ**: Noisy Intermediate-Scale Quantum (cuántica de escala intermedia y
ruidosa). "Ruidosa" es la palabra operativa. Las compuertas reales se equivocan un poco, los cúbits
filtran lentamente su estado al entorno (**decoherencia**), y la medición misma puede leer mal. El
resultado: los picos de probabilidad limpios que tu circuito *debería* producir se difuminan hacia
ruido aleatorio, más aún cuanto más profundo es el circuito.

Dos modelos canónicos de error capturan la mayor parte. El ruido **despolarizante** empuja un cúbit
hacia el estado maximamente mixto — una moneda que olvida hacia dónde se inclinaba. El **amortiguamiento
de amplitud** modela la pérdida de energía — un $\ket{1}$ excitado que se relaja hacia $\ket{0}$,
como decae un cúbit real. La **fidelidad** mide qué tan cerca se mantiene el resultado ruidoso del
ideal.

Míralo ocurrir. Abajo está el par de Bell que construiste en fundamentos. Con tasa de error 0, los
dos picos ($\ket{00}$ y $\ket{11}$) son nítidos y la fidelidad es 100 %. Mueve el control y observa
cómo la distribución se pudre hacia ruido plano — luego cambia el canal de despolarizante a
amortiguamiento de amplitud y ve cuán distinto corrompen:

```qnoise
qubits 2
H 0
CNOT 0 1
```

Esta es *la* razón por la que la computación cuántica es difícil, y por la que tanta parte del
campo se dedica a la mitigación de errores y, eventualmente, a la corrección de errores. Cada
circuito que ejecutas en hardware real es una carrera contra este decaimiento.

```qcard
{"id":"hw-nisq-noise-1","prompt":"En la era NISQ, ¿qué les ocurre a los picos de probabilidad ideales de un circuito a medida que el circuito se hace más profundo, y por qué?","answer":"Se difuminan hacia ruido aleatorio plano. Las compuertas reales se equivocan un poco, los cúbits filtran su estado al entorno (decoherencia) y la medición puede leer mal, de modo que los errores se acumulan y empeoran cuanto más profundo corre el circuito."}
```

El decaimiento necesita un patrón de medida, y el par de Bell de arriba es el clásico: su
correlación de dos cúbits tiene un valor ideal exacto, y cuánto se queda corto un dispositivo es uno
de los testigos más simples de fidelidad perdida. Calcula el número que el hardware persigue:

```qexpect
{
  "id": "hw-readout-zz-1",
  "prompt": "Un dispositivo ideal ejecuta el circuito de Bell (H 0, CNOT 0 1) muchas veces y promedia el producto de las dos lecturas ±1. ¿Cuál es la correlación ideal ⟨Z₀Z₁⟩ que reporta?",
  "program": "H 0\nCNOT 0 1",
  "observable": "Z 0 Z 1",
  "qubits": 2,
  "hint": "Cada disparo ideal lee 00 o 11 — nunca un desacuerdo. El producto de las dos lecturas ±1 es (+1)(+1) o (−1)(−1), que es +1 en ambos casos, así que el promedio de disparos es exactamente +1. El ruido es lo que arrastra el número de un dispositivo real por debajo de ese techo."
}
```

## Conectividad — la restricción de cableado

El segundo impuesto es geométrico. Una compuerta de dos cúbits necesita que los dos cúbits estén
físicamente adyacentes. Si tu hardware solo cablea vecinos más cercanos y tu algoritmo quiere que el
cúbit 0 hable con el cúbit 8, el compilador debe primero **SWAP** los estados a lo largo de una
cadena de cúbits intermedios para juntarlos — y cada SWAP son tres compuertas de dos cúbits más,
añadiendo profundidad y, según la sección anterior, más ruido.

Elige los dos extremos en los menús Qubit A / Qubit B de abajo en una cuadrícula 3×3 (red de vecinos
más cercanos estilo IQM) y observa la cadena de SWAP que el enrutador debe insertar. Luego imagina la
misma compuerta en una máquina de iones atrapados, donde cada cúbit ya está conectado con todos los
demás: **cero** SWAPs.

```qcard
{"id":"hw-swap-tax-1","prompt":"En un dispositivo de vecinos más cercanos (red), ¿qué debe hacer el compilador para ejecutar una compuerta de dos cúbits entre cúbits no adyacentes, y cuánto cuesta?","answer":"Inserta una cadena de compuertas `SWAP` a lo largo del camino más corto para juntar los dos cúbits. Cada `SWAP` cuesta aproximadamente tres compuertas de dos cúbits más, añadiendo profundidad de circuito y ruido. En una máquina todo-a-todo este costo es cero."}
```

```qtopo
{"topology": "grid", "qubits": 9, "gate": [0, 8]}
```

La conectividad es por qué un algoritmo que en el papel parece poco profundo puede inflarse en
profundidad en hardware real — y por qué las máquinas todo-a-todo se valoran para problemas densamente
conectados.

El enrutamiento tiene un filo más agudo: un CNOT no es simétrico. Control y objetivo son roles
distintos, y una compuerta cableada al revés corre sin quejarse — solo calcula la cosa incorrecta.
Aquí está ese fallo en una cadena como la de arriba; corrige el cableado para que coincida con la
intención:

```qdebug
{
  "id": "hw-debug-chain-cnot-1",
  "prompt": "En una cadena de vecinos más cercanos 0–1–2, este circuito debía entrelazar los extremos lejanos a través del cúbit del medio y producir el estado GHZ (|000⟩ + |111⟩)/√2. En cambio el cúbit 2 nunca se mueve — los disparos solo muestran 000 y 110. Un CNOT está cableado en contra de la intención. Arréglalo.",
  "qubits": 3,
  "broken": { "program": "H 0\nCNOT 0 1\nCNOT 2 1" },
  "target": { "program": "H 0\nCNOT 0 1\nCNOT 1 2" },
  "allowedGates": ["H", "CNOT"],
  "hint": "Lee cada CNOT como control primero, objetivo segundo. La última compuerta usa el cúbit 2 — aún |0⟩ — como su control, así que nunca se activa. El entrelazamiento tiene que saltar por la cadena 0 → 1 → 2: el cúbit del medio debe controlar al lejano."
}
```

## Las tres familias de hardware

Con esos dos compromisos en mano, los dispositivos en Braket se agrupan en tres familias físicas,
cada una en un punto distinto del espacio.

**IonQ — iones atrapados.** Átomos cargados individuales retenidos en campos electromagnéticos; los
cúbits se codifican en sus niveles de energía y las compuertas se impulsan con pulsos láser. Braket
lleva dos máquinas *Forte* de 36 cúbits: **Forte Enterprise 1** (Basilea), que está en línea, y
**Forte 1** (Maryland), que está fuera de línea por mantenimiento mientras se escribe esto. Su
predecesor *Aria* (25 cúbits) está retirado para siempre. Las compuertas nativas son GPi, GPi2 y el
entrelazador Mølmer–Sørensen (MS). Su superpoder es la **conectividad
todo-a-todo** (sin impuesto de SWAP) y alta fidelidad (un cúbit >99.5 %, dos cúbits >97 %) con
coherencia medida en *segundos*. El costo: compuertas lentas a escala de microsegundos y menos
cúbits. Ideal para circuitos donde la conectividad y la fidelidad importan más que la velocidad
cruda.

Un segundo proveedor de iones atrapados vive en la misma familia: **AQT** (Innsbruck) opera
*IBEX Q1*, 12 cúbits, compuertas nativas PRx, XX y RZ, totalmente conectado. Doce cúbits es poco,
pero es la misma física y la misma historia de cableado — y una máquina de 12 cúbits a la que
puedes entrar vale más que una de 36 que está en ventana de mantenimiento.

**IQM — superconductor.** Pequeños circuitos transmon enfriados a ~15 milikelvin, impulsados por
pulsos de microondas. *Garnet* (20 cúbits, red cuadrada, Espoo) y su hermana mayor *Emerald*
(54 cúbits, Múnich) están ambas en Braket con compuertas nativas CZ y
PRx. Las compuertas corren en *nanosegundos* — órdenes de magnitud más rápido — y la fabricación
aprovecha décadas de manufactura de semiconductores. El costo: **conectividad de vecinos más
cercanos** (el impuesto de SWAP de arriba) y ~100 microsegundos de coherencia. Ideal para circuitos
con estructura local donde gana la velocidad.

**Rigetti** construye sobre la misma física y volvió a Braket con *Cepheus-1-108Q* (California),
compuertas nativas RX, RZ y CZ sobre una red — la máquina de modelo de compuertas más grande de la
flota. Red más grande, impuesto de SWAP más grande: el costo de enrutamiento crece con la distancia
entre los cúbits que tu circuito quiere entrelazar, así que una red de cien cúbits no abarata un
problema de grafo denso. Lo que hace es agrandar un problema con estructura *local*.

**QuEra — átomos neutros (analógico).** Arreglos de átomos de rubidio retenidos en pinzas ópticas.
*Aquila* (256 átomos) es fundamentalmente distinto: **no** ejecuta circuitos de compuertas. En su
lugar colocas los átomos en una geometría, los impulsas con campos dependientes del tiempo
(frecuencia de Rabi, desintonización) y dejas que el sistema evolucione bajo el Hamiltoniano de
Rydberg — computación cuántica **analógica**. Su superpoder es la escala (256 cúbits) y un encaje
natural para problemas con estructura geométrica, como Maximum Independent Set. El costo: no es una
máquina general de modelo de compuertas.

La tabla interactiva hace concretos los compromisos — ordena por cantidad de cúbits o filtra a una
tecnología. Nota que Aquila es la única fila que no es de modelo de compuertas:

```qdevices
```

Una forma de sentir la diferencia: una cadena de entrelazamiento que salta de cúbit a cúbit. En la
red de Garnet cada enlace de abajo necesita cúbits adyacentes; en Forte las mismas compuertas aterrizan
en cualquier lugar gratis. De cualquier modo, la máquina se califica contra la misma salida ideal —
nómbrala:

```qpredict
{
  "id": "hw-predict-ghz-1",
  "prompt": "Una cadena de entrelazamiento de cuatro cúbits — H 0, luego CNOT 0 1, CNOT 1 2, CNOT 2 3 — se ejecuta en una máquina ideal. ¿Qué estados de la base aparecen con probabilidad no nula? (Estos son los picos que un dispositivo ruidoso solo aproxima.)",
  "program": "H 0\nCNOT 0 1\nCNOT 1 2\nCNOT 2 3",
  "mode": "nonzero-states",
  "hint": "Cada CNOT pasa el valor del cúbit líder un eslabón más abajo en la cadena, así que los cuatro bits siempre coinciden. Solo los dos estados unánimes llevan probabilidad — los otros catorce son exactamente cero, y cualquier conteo que veas ahí en hardware real es puro error."
}
```

### La flota cambia bajo tus pies

Cada especificación de arriba es una instantánea. Las máquinas entran en línea, salen de línea para
recalibrarse y se retiran del todo; la flota que obtienes es la que Braket le expone a tu cuenta y
región el día que preguntas. Esta es la instantánea al 2026-09-04:

| Dispositivo | Proveedor | Familia | Cúbits | Cableado | Región | Estado |
| --- | --- | --- | ---: | --- | --- | --- |
| Forte Enterprise 1 | IonQ | Iones atrapados | 36 | todo-a-todo | `us-east-1` | ONLINE |
| Forte 1 | IonQ | Iones atrapados | 36 | todo-a-todo | `us-east-1` | OFFLINE |
| IBEX Q1 | AQT | Iones atrapados | 12 | todo-a-todo | `eu-north-1` | ONLINE |
| Garnet | IQM | Superconductor | 20 | red | `eu-north-1` | ONLINE |
| Emerald | IQM | Superconductor | 54 | red | `eu-north-1` | ONLINE |
| Cepheus-1-108Q | Rigetti | Superconductor | 107 | red | `us-west-1` | ONLINE |
| Aquila | QuEra | Átomos neutros (analógico) | 256 | geométrico | `us-east-1` | ONLINE |
| SV1 | AWS | Simulador (vector de estado) | 34 | — | cuatro regiones | ONLINE |
| DM1 | AWS | Simulador (matriz de densidad) | 17 | — | cuatro regiones | ONLINE |
| TN1 | AWS | Simulador (red de tensores) | 50 | — | — | **RETIRADO** |

Tres filas de esa tabla cargan toda la lección.

**`OFFLINE` es temporal; `RETIRED` es permanente.** Forte 1 está fuera de línea — una ventana de
mantenimiento o recalibración, y volverá. TN1 y el Aria de IonQ están retirados: sus ARN todavía se
parsean, las máquinas ya no existen, y una tarea enviada a cualquiera de las dos simplemente falla.
Nada en la cadena del ARN te dice en cuál de los dos casos estás. Solo `status` lo dice, y solo en
el momento en que preguntas.

**El nombre no es la especificación.** El *Cepheus-1-108Q* de Rigetti reporta `qubitCount = 107`.
Lee el número del dispositivo, no de la etiqueta.

**Así que resuelve los dispositivos; no los vuelvas a teclear.** Cada tabla de esta GUÍA — incluida
la de arriba — es material didáctico con fecha. El código que trabaja de verdad le pregunta al
servicio: `AwsDevice.get_devices()` devuelve la flota viva con el `status` de cada máquina, y
`python 02-hardware/scripts/device_status.py` imprime exactamente eso. Dentro de este repositorio la
identidad de los dispositivos vive en un solo archivo, `lib/hardware/devices.py`, para que haya un
solo lugar que corregir cuando una máquina se retira, en vez de una docena de copias tecleadas a
mano que hay que ir cazando. El retiro de TN1 es la razón por la que esa regla existe y no es una
mera preferencia de estilo: era un peldaño de la escalera de simuladores de abajo, enseñado en un
notebook y citado en tres archivos, y ninguno se enteró por el ARN.

## La escalera de simuladores — tu defensa

Dado todo lo anterior, casi nunca empiezas en un QPU. Subes una escalera de simuladores clásicos,
cada uno una defensa contra desperdiciar tiempo y dinero en hardware real:

- **Simulador local** (gratis, instantáneo) — corre en tu laptop, vector de estado exacto hasta ~25
  cúbits (cada cúbit duplica la memoria: $2^n$ amplitudes). Tu predeterminado para desarrollo y
  depuración.
- **SV1** (vector de estado, hasta 34 cúbits, $0.075/min) — exacto, administrado, para validar
  algoritmos a una escala que tu laptop no puede sostener.
- **DM1** (matriz de densidad, hasta 17 cúbits, $0.075/min) — el único simulador que modela
  **ruido**. Aquí estudias el decaimiento que viste arriba antes de pagarle a una máquina real para
  que te lo muestre.
- **TN1** (red de tensores, hasta ~50 cúbits, $0.275/min) — **RETIRADO por AWS; ya no puedes
  enviarle nada.** Sigue en esta escalera porque su razonamiento es la parte más transferible: el
  costo de un simulador de red de tensores sigue cuánto **entrelaza** un circuito, no cuántos cúbits
  tiene, y por eso "¿qué tan grande es mi circuito?" es la pregunta equivocada sobre simulabilidad
  clásica. En la práctica, sin embargo, la escalera administrada ahora se detiene en los 34 cúbits
  de SV1. Por encima de eso vas con tu propio software de redes de tensores o con hardware.

```qcard
{"id":"hw-dm1-noise-sim-1","prompt":"¿Qué simulador administrado de Braket puede modelar ruido, y por qué puede hacerlo cuando SV1 no?","answer":"`DM1`, el simulador de matriz de densidad. Una matriz de densidad puede representar estados mixtos (ruidosos), así que DM1 puede aplicar canales de ruido como despolarizante y amortiguamiento de amplitud. `SV1` es un simulador de vector de estado exacto y sin ruido."}
```

La escalera solo funciona si conoces la respuesta limpia antes de que el ruido la toque — eso es lo
que el peldaño local te da gratis. Demuéstralo en un circuito sesgado: predice el histograma ideal
que DM1 luego te mostraría decayendo:

```qpredict
{
  "id": "hw-predict-biased-1",
  "prompt": "Ejecutado de forma ideal, este circuito produce un histograma sesgado; un QPU ruidoso solo lo aproxima. ¿Qué único resultado queda arriba?",
  "program": "X 0\nRY 1 1.0472",
  "mode": "top-outcome",
  "hint": "X fija el cúbit 0 — el bit de la izquierda — en 1. RY(π/3) inclina el cúbit 1 solo a medias: se queda en |0⟩ con probabilidad cos²(π/6) = 3/4. Así que tres de cada cuatro disparos leen 10. El ruido aplana ese pico hacia los demás, pero no lo mueve."
}
```

El par de Bell que depuras localmente no cuesta nada y regresa al instante:

```qsim
qubits 2
H 0
CNOT 0 1
```

La disciplina, en orden: **desarrolla en Local → valida a escala en SV1 → estudia el ruido en DM1 →
ejecuta en un QPU solo cuando el algoritmo esté probado.** Saltar peldaños es cómo quemas un
presupuesto.

## Costo — la disciplina

Ese último peldaño se mide por consumo, y el modelo tiene dos formas. Los QPU cobran **por tarea**
(una tarifa fija cada vez que envías un circuito, $0.30) más **por disparo** (cada repetición; p. ej.
$0.08 en IonQ). Los simuladores administrados cobran **por minuto** de cómputo. El simulador local es
gratis.

```qcard
{"id":"hw-cost-model-1","prompt":"¿Cómo cobran los QPU por ejecutar un circuito en Amazon Braket, frente a los simuladores administrados?","answer":"Los QPU cobran por tarea (una tarifa fija cada vez que envías un circuito, p. ej. $0.30) más por disparo (cada repetición, p. ej. $0.08 en IonQ). Los simuladores administrados, en cambio, cobran por minuto de cómputo."}
```

La aritmética importa: 1,000 disparos en IonQ (Forte) son \$0.30 + 1,000 × \$0.08 = \$80.30 — por
tarea. Envía un barrido de parámetros de 100 puntos y son más de ocho mil dólares. Estima antes de
ejecutar:

```qcost
```

Exactamente por esto existe el flujo de trabajo de arriba, y por eso la regla del proyecto es
*simulador local primero, QPU solo cuando esté validado, siempre con una estimación de costo.*

Ahora haz la disciplina misma: cotiza una ejecución en tu cabeza y comprométete antes de que se
revele el desglose. Recuerda para qué son los disparos — cada uno es una muestra, y el error
estadístico de tu histograma se reduce como $1/\sqrt{N}$ (la historia del ruido de disparos de
Foundations) — así que cada dígito extra de precisión se compra con dólares reales:

```qcostestimate
{
  "id": "hw-cost-estimate-1",
  "prompt": "Envías una tarea de 2,000 disparos a IonQ. ¿Cuánto cuesta?",
  "provider": "IonQ",
  "shots": 2000,
  "tasks": 1,
  "hint": "Dos medidores corren a la vez: un {perTask} fijo en el momento en que envías la tarea, más {perShot} por cada uno de los {shots} disparos dentro de ella."
}
```

Ten claro qué compran esos disparos: no certeza, un promedio. Cada disparo devuelve ±1, y la media
de disparos converge al valor esperado que el dispositivo está estimando. Para la superposición más
simple, calcula dónde aterriza ese promedio:

```qexpect
{
  "id": "hw-readout-plus-1",
  "prompt": "Una ejecución de 1,000 disparos del circuito de una sola compuerta H 0 promedia las lecturas ±1 de Z₀. ¿A qué valor ideal ⟨Z₀⟩ converge ese promedio de disparos?",
  "program": "H 0",
  "observable": "Z 0",
  "hint": "H|0⟩ da 0 y 1 con igual probabilidad, así que las lecturas +1 y −1 se cancelan a la larga: la expectativa es 0, aunque ningún disparo individual lea nunca 0. Tu promedio de disparos finitos solo se dispersa a su alrededor, reduciéndose como 1/√N — esa dispersión es lo que más disparos (y más dólares) compran a la baja."
}
```

Ahora cambia de proveedor. La tarifa de tarea es universal, pero el medidor de disparos no — y
asumir que todo QPU factura como IonQ es cómo se equivocan las estimaciones:

```qcostestimate
{
  "id": "hw-cost-iqm-1",
  "prompt": "Envías una tarea de 1,000 disparos a IQM Garnet. ¿Cuánto cuesta?",
  "provider": "IQM",
  "shots": 1000,
  "tasks": 1,
  "hint": "La tarifa por disparo es específica del proveedor: IQM cobra {perShot} por disparo, aproximadamente 1/55 de la tarifa de Forte de IonQ. Un {perTask} fijo por la tarea, más {shots} × {perShot}."
}
```

Y el barrido de parámetros de arriba — la forma en que realmente se queman los presupuestos. Cada
punto de un barrido es su propia tarea, y la tarifa fija viaja cada sola vez:

```qcostestimate
{
  "id": "hw-cost-ionq-sweep-1",
  "prompt": "Un barrido de parámetros de 20 puntos en IonQ: 20 tareas separadas de 100 disparos cada una. ¿Cuánto cuesta todo el barrido?",
  "provider": "IonQ",
  "shots": 100,
  "tasks": 20,
  "hint": "El {perTask} fijo se cobra por tarea, no por experimento — veinte envíos lo pagan veinte veces. Cada punto cuesta {perTask} + {shots} × {perShot}; el barrido son veinte de esos."
}
```

## Elegir un dispositivo

Juntándolo todo, un flujo de decisión rápido:

1. **¿Desarrollando o depurando?** Simulador local. Siempre.
2. **¿Validando un circuito de compuertas a escala, sin ruido?** SV1.
3. **¿Estudiando cómo el ruido afecta los resultados?** DM1.
4. **¿Circuito grande pero ligeramente entrelazado?** Ya no hay peldaño administrado para esto —
   TN1 está retirado. Córrelo en tu propio simulador de redes de tensores, o pasa a hardware.
5. **¿Listo para hardware real, problema densamente conectado (p. ej. QAOA en grafo denso)?** IonQ —
   conectividad todo-a-todo, alta fidelidad.
6. **¿Hardware real, estructura local, la velocidad importa?** IQM.
7. **¿Optimización o simulación con estructura geométrica (p. ej. Maximum Independent Set)?** QuEra
   Aquila (analógico).

Los pasos 5–7 terminan todos en una máquina medida por consumo, así que cierra el ciclo con dos
cotizaciones más que puedes hacer en frío. Primero IQM — donde *cómo agrupa los disparos* cambia la
factura:

```qcostestimate
{
  "id": "hw-cost-iqm-batch-1",
  "prompt": "Divides una ejecución en IQM en 5 tareas de 2,000 disparos cada una. ¿Cuánto cuestan las 5 tareas en total?",
  "provider": "IQM",
  "shots": 2000,
  "tasks": 5,
  "hint": "Solo el {perTask} fijo se preocupa por cómo divides la ejecución — cinco tareas lo pagan cinco veces, mientras el medidor de disparos ({shots} × {perShot} por tarea) rastrea el total de disparos. Los mismos 10,000 disparos en una sola tarea ahorrarían cuatro tarifas de tarea: $1.20."
}
```

Y QuEra — analógico, sin circuitos de compuertas, pero el medidor no lo sabe ni le importa:

```qcostestimate
{
  "id": "hw-cost-quera-1",
  "prompt": "Una tarea de 400 disparos en QuEra Aquila (una ejecución analógica). ¿Cuánto cuesta?",
  "provider": "QuEra",
  "shots": 400,
  "tasks": 1,
  "hint": "Analógico es un modelo de cómputo distinto, no un modelo de facturación distinto: Aquila mide exactamente como los QPU de compuertas — un {perTask} fijo al enviar, más {perShot} por cada uno de los {shots} disparos."
}
```

Compruébate:

```quiz
{
  "questions": [
    {
      "id": "hard-device-topology-dense-qaoa",
      "q": "Tu algoritmo es QAOA en un grafo denso donde casi cada cúbit debe interactuar con todos los demás. ¿Qué familia de hardware encaja mejor, y por qué?",
      "hint": "Interacción densa significa muchas compuertas de dos cúbits entre pares arbitrarios. ¿Qué conectividad evita insertar cadenas de `SWAP` para pares distantes?",
      "a": "Una máquina de iones atrapados (IonQ Forte). Su conectividad todo-a-todo significa que cualquier par se entrelaza de forma directa — sin sobrecarga de `SWAP` — que un grafo de interacción denso de otro modo impondría fuertemente en un dispositivo de red."
    },
    {
      "id": "hard-local-sim-first",
      "q": "¿Por qué desarrollar y depurar en el simulador Local antes que en cualquier otra cosa?",
      "hint": "Piensa en las tres cosas que el hardware real es y un simulador de laptop no: medido por consumo, en cola y lento para iterar.",
      "a": "Es gratis, instantáneo y no tiene cola, así que puedes iterar con rapidez a costo cero. Reservas los simuladores administrados y los QPU para circuitos que ya validaste localmente."
    },
    {
      "id": "hard-dm1-vs-sv1",
      "q": "¿Qué te da DM1 que SV1 no?",
      "hint": "Los nombres son la pista: vector de estado vs matriz de densidad. Una de esas representaciones puede expresar estados mixtos (ruidosos).",
      "a": "Modelado de ruido. DM1 es un simulador de matriz de densidad, así que puede aplicar canales de ruido (despolarizante, amortiguamiento de amplitud, etc.) y mostrar cómo degradan los resultados. SV1 es un simulador de vector de estado exacto y sin ruido."
    },
    {
      "id": "hard-swap-routing-cnot",
      "q": "Quieres un `CNOT` entre dos cúbits en esquinas opuestas de un dispositivo de red cuadrada. ¿Cuánto cuesta eso comparado con la misma compuerta en una máquina todo-a-todo?",
      "hint": "En una red los dos cúbits no son adyacentes, así que el enrutador debe juntarlos primero. ¿Qué operación hace eso, y cuál es su sobrecarga?",
      "a": "En la red el compilador inserta una cadena de compuertas `SWAP` (cada una ~3 compuertas de dos cúbits) a lo largo del camino más corto para hacer los cúbits adyacentes, añadiendo profundidad y error. En una máquina todo-a-todo el costo es cero — ya están conectados."
    }
  ]
}
```

---

## Ejercicios prácticos

1. **`notebooks/01-device-discovery.ipynb`** — Usa `AwsDevice.get_devices()` para listar todo el hardware disponible. Inspecciona propiedades del dispositivo: cantidad de cúbits, compuertas nativas, conectividad, estado, profundidad de cola.

2. **`notebooks/02-ionq-exploration.ipynb`** — Envía un circuito simple a IonQ (o simúlalo localmente). Examina la descomposición en compuertas nativas. Compara resultados a lo largo de distintos conteos de disparos. (Advertencia de costo incluida en el notebook.)

3. **`notebooks/03-iqm-exploration.ipynb`** — Construye circuitos respetando la topología de vecinos más cercanos. Observa cómo el transpilador añade compuertas SWAP para interacciones no adyacentes. Compara la profundidad del circuito antes/después de la transpilación.

4. **`notebooks/04-quera-analog.ipynb`** — Define arreglos de átomos con `AnalogHamiltonianSimulation`. Configura campos de impulso (frecuencia de Rabi, desintonización). Resuelve un problema pequeño de Maximum Independent Set.

5. **`notebooks/05-simulator-comparison.ipynb`** — Ejecuta el mismo circuito en el simulador local y compáralo contra SV1 y DM1 (con ruido), más el peldaño retirado TN1. Compara resultados, tiempo de ejecución y costo. Entiende cuándo cada uno es apropiado — y qué quita un retiro.

6. **`notebooks/06-noise-and-errors.ipynb`** — Añade canales de ruido (despolarizante, amortiguamiento de amplitud) a circuitos en DM1. Compara resultados ruidosos vs. ideales. Introducción a la mitigación de errores (concepto de extrapolación a ruido cero).

**Scripts:**
- `scripts/device_status.py` — Ejecuta desde la terminal: `python 02-hardware/scripts/device_status.py` para consultar la disponibilidad actual de dispositivos sin abrir un notebook
- `scripts/cost_estimator.py` — Estima costos: `python 02-hardware/scripts/cost_estimator.py --device IonQ --shots 1000`. `--device` toma un nombre de **proveedor** de la tabla de precios (`IonQ`, `IQM`, `IQM_Emerald`, `AQT`, `QuEra`, `Rigetti`, `SV1`, `DM1`, `TN1`, `LocalSimulator`) — estos van con mayúscula, a diferencia de los nombres cortos de dispositivo en minúsculas (`ionq_forte`, `iqm_garnet`) que toma `run_circuit`. `TN1` sigue en la tabla de precios para que el peldaño retirado se pueda seguir costeando con fines didácticos; no es enviable. Ejecútalo con `--help` para ver los valores aceptados.

## Hacia dónde va esto

Ya sabes qué son las máquinas reales y cómo elegir una. El siguiente módulo, **`03-algorithms`**,
las pone a trabajar: Deutsch–Jozsa, la búsqueda de Grover, la transformada cuántica de Fourier y
QAOA — los circuitos que hacen que todo este hardware valga la pena construirse. Los desarrollarás
en la escalera de simuladores que acabas de aprender, exactamente como prescribe el flujo de trabajo.

---

## Referencias

### Documentación de AWS
- [Amazon Braket supported devices](https://docs.aws.amazon.com/braket/latest/developerguide/braket-devices.html) — Lista completa de hardware disponible y regiones
- [Amazon Braket pricing](https://aws.amazon.com/braket/pricing/) — Precios actuales por disparo y por tarea para todos los dispositivos
- [Testing with simulators](https://docs.aws.amazon.com/braket/latest/developerguide/braket-test.html) — Capacidades y límites de SV1 y DM1
- [IonQ device properties](https://docs.aws.amazon.com/braket/latest/developerguide/braket-devices-ionq.html) — Compuertas nativas, conectividad, especificaciones
- [IQM device properties](https://docs.aws.amazon.com/braket/latest/developerguide/braket-devices-iqm.html) — Topología, compuertas nativas, compilación
- [QuEra Aquila documentation](https://docs.aws.amazon.com/braket/latest/developerguide/braket-devices-quera.html) — Configuración de simulación hamiltoniana analógica

### Recursos en video
- [Trapped-Ion Quantum Computing Explained — IonQ](https://www.youtube.com/watch?v=F8OU-XtqkKs) — Chris Monroe, cofundador de IonQ, 45 min, cómo funciona el hardware de iones atrapados desde la física
- [Superconducting Quantum Computing — IBM Research](https://www.youtube.com/watch?v=OGPyyDlHwCY) — Jay Gambetta, 40 min, física de transmon y desafíos de ingeniería
- [Neutral Atom Quantum Computing — QuEra](https://www.youtube.com/watch?v=tnYkR3fTTW8) — Alex Keesling, 35 min, átomos de Rydberg y simulación analógica
- [Amazon Braket Hardware Overview — AWS re:Invent 2023](https://www.youtube.com/watch?v=d0cNmPHKPcY) — Richard Moulds, 45 min, comparación de hardware en Braket con demos en vivo
- [Quantum Error Correction Explained](https://www.youtube.com/watch?v=1WHJCOotCkI) — Veritasium, 25 min, intro accesible a por qué importa el ruido
- [How a Quantum Computer Works — Kurzgesagt](https://www.youtube.com/watch?v=-UlxHPIEVqA) — 10 min, excelente panorama visual de tipos de hardware

### Artículos y lectura adicional
- [Quantum Computing: An Applied Approach (Hidary)](https://link.springer.com/book/10.1007/978-3-030-83274-2) — El capítulo 15 cubre las plataformas de hardware en detalle
- [IonQ Aria Architecture Paper](https://arxiv.org/abs/2312.10847) — Detalles técnicos del sistema Aria
- [Neutral atom quantum computing review (Henriet et al.)](https://arxiv.org/abs/2006.12326) — Revisión exhaustiva de enfoques de átomos neutros
- [Quantum Computing in the NISQ era and beyond (Preskill)](https://arxiv.org/abs/1801.00862) — Artículo fundacional sobre lo posible con hardware ruidoso
