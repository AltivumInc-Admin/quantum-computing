# Trabajos híbridos cuántico-clásicos en producción

Todo lo que has visto en este currículo hasta ahora se ha ejecutado desde un notebook en tu laptop: armar un circuito, enviarlo, esperar, leer el resultado. Así es exactamente como debes aprender — y exactamente como no debes ejecutar un algoritmo variacional real. Un VQE que barre las longitudes de enlace de una molécula envía miles de circuitos, cada uno esperando en una cola compartida del dispositivo, cada iteración bloqueada por la anterior. Si lo corres desde un notebook, te pasarás el fin de semana cuidándolo. Este módulo final trata de entregar ese bucle a AWS: empaquetar el VQE que construiste en el módulo 05 como un **Hybrid Job** administrado que obtiene acceso prioritario al hardware, compila una sola vez, hace checkpoint de sí mismo, transmite sus propias métricas y se desmonta cuando termina.

## Objetivos de aprendizaje

Al completar esta sección, podrás:
- Decidir cuándo usar Braket Hybrid Jobs frente a tareas cuánticas independientes
- Crear, enviar, monitorear y recuperar resultados de hybrid jobs
- Usar compilación paramétrica para acelerar algoritmos iterativos
- Implementar checkpointing para jobs de larga duración tolerantes a fallos
- Construir contenedores personalizados para entornos de job especializados
- Configurar controles de costo, monitoreo y manejo de errores de nivel producción

## Requisitos previos

- Completado: 00 a 05 (todas las secciones anteriores)
- Credenciales de AWS con permisos de Braket e IAM (ejecuta `make deploy-infra`)
- Comprensión de algoritmos variacionales (bucles de entrenamiento de VQE, QAOA, QML)

---

## Cuándo un job justifica su costo

La decisión no es «los hybrid jobs son mejores». Un solo circuito que depuras de forma interactiva no tiene por qué ir dentro de un job: el arranque del contenedor por sí solo es puro overhead. El punto de equilibrio gira en torno a la *iteración*. Una tarea independiente es fire-and-forget: la envías y se coloca al final de la cola general del dispositivo, detrás de todo el mundo. Para un circuito, está bien. Para una optimización de quinientas iteraciones donde cada paso depende del anterior, esa espera en cola se paga *quinientas veces*, y tu optimizador clásico se queda ocioso entre una y otra.

```qcard
{"id":"hybrid-break-even-iteration","prompt":"¿Cuál es el factor clave que determina si un Braket Hybrid Job supera a una tarea independiente en tiempo de reloj de pared?","answer":"La iteración. En una tarea independiente cada iteración vuelve al final de la cola general del dispositivo, así que un bucle de muchas iteraciones paga esa espera una vez por paso; un Hybrid Job da acceso prioritario para que las iteraciones corran una tras otra. Mucha espera en cola más muchas iteraciones favorece el job; pocas iteraciones rápidas favorecen la vía independiente."}
```

Un Hybrid Job cambia la economía. Braket levanta una instancia clásica administrada, ejecuta tu script ahí y — lo crucial — las tareas cuánticas que envía obtienen **acceso prioritario**: saltan al frente de la cola del dispositivo y corren una tras otra. Cambias un cargo por hora de instancia a cambio de eliminar toda esa espera repetida en cola. Mueve los controles de abajo para sentir el equilibrio: donde la espera en cola es real y el conteo de iteraciones es alto, el job gana en tiempo de reloj de pared de forma contundente; para un puñado de iteraciones rápidas, la vía independiente es más barata y sencilla.

```qjob
{ "iterations": 60, "shots": 1000, "provider": "IonQ", "instance": "ml.m5.large", "queueWaitSec": 45, "iterSec": 6 }
```

**Usa un Hybrid Job cuando** tu algoritmo itera entre pasos cuánticos y clásicos (VQE, QAOA, entrenamiento QML), necesita acceso prioritario, se beneficia de la compilación paramétrica, corre más de unos minutos, o quiere checkpointing y métricas. **Usa tareas independientes cuando** ejecutas un solo circuito, exploras de forma interactiva o genuinamente no necesitas prioridad.

Antes de seguir, cotiza un giro de ese bucle preparar-medir-actualizar tú mismo. Una iteración nunca es una sola tarea: un gradiente por parameter-shift necesita dos evaluaciones de circuito por parámetro, y cada evaluación es su propia tarea con su propia tarifa fija.

```qcostestimate
{"id":"hybrid-cost-iteration-1","prompt":"Tu ansatz de VQE tiene 4 parámetros y el optimizador da un paso de gradiente en IonQ. La regla de parameter-shift necesita 2 evaluaciones por parámetro, así que la iteración envía 4 × 2 = 8 tareas a 100 shots cada una. ¿Cuánto cuesta esa sola iteración en cargos cuánticos?","provider":"IonQ","shots":100,"tasks":8,"hint":"Cada una de las 8 evaluaciones de shift es su propia tarea: una tarifa fija {perTask} más {shots} shots × {perShot}. La trampa es cotizar una iteración como un solo envío — un solo paso de gradiente ya son 2 × P tareas, cada una pagando ambas tarifas."}
```

## Dentro de un Hybrid Job

Cuando llamas a `AwsQuantumJob.create(...)`, Braket arma un entorno de ejecución autocontenido alrededor de tu código:

```
+-------------------+        +-------------------+
|  Your Algorithm   | -----> | Quantum Device    |
|  (EC2 container)  | <----- | (QPU or Simulator)|
|                   |        +-------------------+
|  Classical logic  |
|  Optimization     |        +-------------------+
|  Data processing  | -----> | S3 Results Bucket |
+-------------------+        +-------------------+
        |
        v
+-------------------+
| CloudWatch Metrics|
+-------------------+
```

Tú aportas un script de algoritmo (el punto de entrada), hiperparámetros opcionales y datos de entrada. Braket aporta el contenedor, el SDK, el acceso prioritario a la QPU y el pipeline de métricas. Mientras corre tu script, las tareas cuánticas que envía llevan un token de job que las marca como trabajo prioritario — sin él, cada iteración podría esperar minutos u horas en la cola general; con él, las iteraciones se completan una tras otra. Cuando el script termina, los resultados aterrizan en S3, las métricas y logs en CloudWatch, y el contenedor se desmonta para que dejes de pagar por él.

```qcard
{"id":"hybrid-priority-job-token","prompt":"Dentro de un Hybrid Job, ¿qué otorga a las tareas cuánticas acceso prioritario al dispositivo en lugar de esperar en la cola general?","answer":"Un token de job. Mientras corre tu script, cada tarea cuántica que envía lleva un token de job que la marca como trabajo prioritario, de modo que las iteraciones saltan al frente de la cola del dispositivo y se completan una tras otra."}
```

Si quitas el contenedor y el token, cada tarea prioritaria sigue siendo solo un circuito y un conteo de shots. Lee una tarea a mitad del entrenamiento como lo hace el sampler del dispositivo: reporta qué estados de la base aparecen, nunca los signos de sus amplitudes:

```qpredict
{"id":"hybrid-predict-priority-task-1","prompt":"A mitad del entrenamiento, tu job envía esta tarea prioritaria: RY(1.5708) en el qubit 0, CNOT 0→1, luego RY(3.1416) en el qubit 1. ¿Qué estados de la base pueden devolver alguna vez los shots de la tarea?","program":"RY 0 1.5708\nCNOT 0 1\nRY 1 3.1416","mode":"nonzero-states","hint":"Las dos primeras compuertas construyen el par de Bell (|00⟩ + |11⟩)/√2. El RY(π) final en el qubit 1 envía |0⟩ → |1⟩ y |1⟩ → −|0⟩, convirtiendo el acuerdo perfecto en desacuerdo perfecto: (|01⟩ − |10⟩)/√2. El signo menos es invisible para el sampler — solo aparecen 01 y 10."}
```

## Compila una vez, ejecuta mil veces

Hay un segundo impuesto, más sutil, sobre los algoritmos variacionales. En hardware que debe transpilar a compuertas nativas — especialmente las QPU superconductoras — cada circuito que envías se compila antes de correr, y la compilación puede dominar el tiempo por iteración. Pero un bucle variacional envía la *misma estructura de circuito* en cada iteración; solo cambian los ángulos de rotación. Recompilarlo cada vez es trabajo desperdiciado.

La **compilación paramétrica** lo resuelve. Declaras los ángulos como parámetros libres, y Braket compila el circuito una vez y luego reutiliza el programa compilado entre iteraciones, sustituyendo los nuevos valores de los parámetros en cada ejecución:

```qcard
{"id":"hybrid-parametric-compilation","prompt":"¿Cómo acelera la compilación paramétrica un bucle variacional que envía la misma estructura de circuito en cada iteración?","answer":"Declaras los ángulos de rotación como parámetros libres (`FreeParameter`), de modo que Braket compila el circuito una vez y luego reutiliza el programa compilado entre iteraciones, sustituyendo los nuevos valores de los parámetros en cada ejecución. El costo de compilación se paga una sola vez en lugar de por iteración."}
```

```python
from braket.circuits import Circuit, FreeParameter

theta = FreeParameter("theta")
circuit = Circuit().rx(0, theta).cnot(0, 1)

# First run: compiles and executes
result1 = device.run(circuit, shots=1000, inputs={"theta": 0.5})

# Subsequent runs: skips compilation, only updates the parameter
result2 = device.run(circuit, shots=1000, inputs={"theta": 0.7})
```

El costo de compilación se paga una sola vez en lugar de por iteración — en una optimización larga, el ahorro se acumula de forma dramática. Sube el conteo de iteraciones y observa cómo se abre la brecha:

```qparam
{ "iterations": 50, "compileSec": 8, "runSec": 2 }
```

Este mismo circuito parametrizado es el bucle interno literal de cada hybrid job: una estructura fija, un $\theta$ fresco en cada paso elegido por el optimizador clásico. Asume el rol del optimizador: arrastra $\theta$ y recorre para ver cómo responde el estado variacional de dos qubits:

```qscrub
qubits 2
RY 0 theta
RY 1 theta
CNOT 0 1
```

Ahora congela ese bucle en un solo paso del optimizador. El programa compilado nunca ve un deslizador: cada ejecución recibe un ángulo concreto como entrada. Construye el estado del ansatz que el job prepararía cuando el optimizador le entrega $\theta = \pi/3$:

```qchallenge
{"id":"hybrid-challenge-frozen-ansatz-1","prompt":"Prepara el estado del ansatz de una capa en el ángulo fijo θ = 1.0472 (π/3): la capa de rotación RY(1.0472) en ambos qubits, luego el entrelazador del qubit 0 al qubit 1 — exactamente lo que el circuito compilado ejecuta cuando el optimizador suministra este θ.","qubits":2,"target":{"program":"RY 0 1.0472\nRY 1 1.0472\nCNOT 0 1"},"starter":"RY 0 1.0472\nRY 1 1.0472","allowedGates":["RY","CNOT"],"hint":"El starter es solo la capa de rotación — un estado producto plano. El entrelazador que falta es CNOT 0 1: redirige la amplitud de |10⟩ a |11⟩ y viceversa, atando el flip del qubit 1 al qubit 0. Sin él, ningún ajuste de los ángulos entrelaza nada."}
```

## El ciclo de vida del job y sus métricas

Un job recorre un ciclo de vida fijo: lo **creas**, **hace cola** por el dispositivo, el contenedor se levanta y **ejecuta** tu algoritmo con acceso cuántico prioritario, tu script **registra métricas** a medida que avanza, opcionalmente hace **checkpoint** de su estado, y al **completar** escribe resultados en S3 para su **recuperación**. Tres canales llevan información de entrada y salida. Los *hiperparámetros* son perillas clave-valor (tasa de aprendizaje, conteo de capas, conteo de shots) que se pasan a tu script. Los *datos de entrada* — conjuntos de entrenamiento, geometrías moleculares, grafos — se cargan desde S3 al contenedor al arrancar. Los *artefactos de salida y métricas* salen de regreso: archivos a S3, y métricas numéricas transmitidas en vivo a CloudWatch vía `log_metric`.

Ese flujo de métricas es lo que convierte un job de una caja negra en algo que puedes observar. Registrar la energía en cada iteración del VQE te da una curva de convergencia en vivo — el mismo descenso que manejaste a mano en el módulo 05, ahora reportándose desde dentro de un job en ejecución. Esto es exactamente lo que verías en CloudWatch mientras la optimización se acerca al estado fundamental; la línea punteada es la tolerancia de convergencia `tol` que tu script de algoritmo revisa en cada iteración para que el bucle pueda regresar antes cuando ya está lo bastante cerca:

```qmetrics
{ "R": 0.74, "threshold": -1.13 }
```

Cada punto de esa curva es un número calculado a partir de un estado cuántico: un valor esperado — el escalar que todo el job existe para minimizar. Calcula el valor que `log_metric` transmitiría para un paso concreto:

```qexpect
{"id":"hybrid-expect-logged-energy-1","prompt":"En esta iteración el ansatz es RY(1.0472) en un solo qubit y el costo que tu script registra en cada paso es el valor esperado ⟨Z₀⟩. ¿Qué valor llega a CloudWatch en esta iteración?","program":"RY 0 1.0472","observable":"Z 0","hint":"La métrica es el promedio a largo plazo ⟨Z₀⟩ = cos θ, no el autovalor ±1 de un solo shot. RY(θ) deja cos²(θ/2) de la probabilidad en |0⟩, así que ⟨Z₀⟩ = cos²(θ/2) − sin²(θ/2) = cos(1.0472) = 0.50. Elegir 0.75 significa que calculaste P(+1) = (1 + ⟨Z⟩)/2 en lugar del valor esperado en sí."}
```

## Sobrevivir a los fallos

Un job que corre durante horas es un job que puede fallar por razones equivalentes a horas de trabajo: una instancia spot reclamada, un error transitorio del dispositivo, un timeout. Sin protección, un fallo en la iteración 480 de 500 tira a la basura cada paso completado — reinicias desde cero. El **checkpointing** es la cura. Tu script llama periódicamente a `save_job_checkpoint()` para persistir el estado de su optimizador; al reiniciar, `load_job_checkpoint()` reanuda desde el último punto guardado, y solo se rehace el trabajo desde ese checkpoint. El trade-off es la granularidad: si haces checkpoint con demasiada poca frecuencia, un fallo aún te cuesta mucho; si haces checkpoint en cada paso, agregas overhead de I/O. Mueve el punto de fallo y el intervalo de checkpoint para ver cuánto cómputo salva cada estrategia:

```qcard
{"id":"hybrid-checkpointing","prompt":"¿Cómo protege el checkpointing a un Hybrid Job de larga duración de perder todo el progreso cuando falla a mitad de la ejecución?","answer":"El script llama periódicamente a `save_job_checkpoint()` para persistir el estado de su optimizador; al reiniciar, `load_job_checkpoint()` reanuda desde el último punto guardado, de modo que solo se rehace el trabajo hecho desde ese checkpoint y no toda la corrida."}
```

```qcheckpoint
{ "iterations": 40, "failAt": 27, "every": 10 }
```

La aritmética de lo salvado arriba tiene un signo de dólar pegado: cada iteración entre el último checkpoint y el fallo es trabajo cuántico que pagas dos veces. Cotiza la factura del rehacer para un fallo concreto:

```qcostestimate
{"id":"hybrid-cost-restart-tax-1","prompt":"Un job de QAOA en IonQ hace checkpoint cada 10 iteraciones y muere en la iteración 45, así que el reinicio reanuda desde el checkpoint de la iteración 40 y reejecuta 5 iteraciones. Cada iteración es un gradiente por parameter-shift sobre los 2 ángulos (γ, β) — 2 × 2 = 4 tareas — a 250 shots por tarea. ¿Cuánto cuestan las 5 iteraciones rehechas en cargos cuánticos?","provider":"IonQ","shots":250,"tasks":20,"hint":"La factura del rehacer es 5 iteraciones × 4 tareas = 20 tareas, cada una pagando la tarifa fija {perTask} más {shots} shots × {perShot}. Cotizar solo los shots olvida que cada evaluación de shift es su propia tarea; cotizar solo las tarifas de tarea olvida los shots. Un intervalo de checkpoint más apretado es exactamente lo que reduce este número."}
```

Reiniciar no es solo por dinero: es por corrección. El checkpoint almacena el $\theta$ del optimizador, y una corrida reanudada debe reconstruir el ansatz en ese ángulo y reproducir el mismo valor de costo que la corrida fallida registró por última vez. Verifica a mano la física de una reanudación:

```qexpect
{"id":"hybrid-expect-restart-readout-1","prompt":"Un fallo mata el job justo después de que el checkpoint guarda θ = 2.0944. Al reiniciar, load_job_checkpoint() restaura θ y el script reconstruye el ansatz — RY(2.0944) en el qubit 0, luego CNOT 0→1 — y vuelve a medir el costo ⟨Z₀⟩ antes de continuar. ¿Qué valor debe reproducir la corrida reanudada?","program":"RY 0 2.0944\nCNOT 0 1","observable":"Z 0","hint":"Una reanudación correcta reproduce el costo del estado guardado: ⟨Z₀⟩ = cos θ = cos(2.0944) = −0.50. El CNOT entrelaza el qubit 1 con el qubit 0 pero deja intactas las poblaciones del propio qubit 0 — y por tanto ⟨Z₀⟩. 0.25 es P(+1) para este estado, no el valor esperado que registra el flujo de métricas."}
```

## Trae tu propio entorno

El contenedor por defecto de Braket trae el SDK y paquetes comunes, pero las cargas de trabajo reales tienen dependencias reales: el stack de química del módulo 05 (OpenFermion, PySCF), un framework de ML pesado, una versión fija de una librería. Para eso construyes un **contenedor personalizado**: parte de la imagen base de Braket, agrega tus dependencias, construye y sube a Amazon ECR, y pasa el URI de la imagen a `AwsQuantumJob.create(image_uri=...)`. El directorio `containers/` de aquí tiene un `Dockerfile` funcional y un `build_and_push.sh` para hacer exactamente eso. Las tareas enviadas desde dentro de tu contenedor siguen llevando el token de job, así que conservan el acceso prioritario y la facturación a tarifa de job en lugar de cobrarse como tareas independientes.

## Mantener la factura bajo control

El costo de un Hybrid Job son dos flujos sumados: la **instancia** clásica (facturada por hora mientras el contenedor corre) y las tareas **cuánticas** (las mismas tarifas por tarea y por shot que en independientes — un job te da prioridad, no un descuento). La instancia es la nueva variable a administrar:

- `ml.m5.large` — la predeterminada, adecuada para la mayoría de los algoritmos variacionales
- `ml.m5.xlarge` — más memoria para problemas más grandes
- `ml.p3.2xlarge` / `ml.g4dn.xlarge` — GPU, para componentes clásicos de ML o simulación con CUDA-Q

El flujo cuántico merece la misma aritmética mental a escala de job. Cotizaste una iteración al inicio de este módulo; un job completo es esa aritmética multiplicada por el conteo de iteraciones:

```qcostestimate
{"id":"hybrid-cost-full-job-1","prompt":"Cotiza todo el flujo cuántico de un job: un VQE de 4 parámetros corre 50 iteraciones de parameter-shift en IQM — 4 × 2 = 8 tareas por iteración, 400 tareas en total, a 100 shots cada una. Ignorando la instancia clásica, ¿a cuánto llegan los cargos cuánticos?","provider":"IQM","shots":100,"tasks":400,"hint":"Un job compra prioridad, no un descuento: las 400 tareas pagan las tarifas independientes — {perTask} cada una, más {shots} shots × {perShot}. $120.00 son solo las tarifas de tarea y $58.00 son solo los shots; el job paga ambos flujos."}
```

Controla el gasto con `stopping_condition={"maxRuntimeInSeconds": N}` — la perilla de runtime de Braket, un tope duro de reloj de pared — más una revisión de convergencia `tol` dentro del script que regresa antes cuando la métrica deja de mejorar (la línea punteada que viste en el dashboard de arriba), alarmas de CloudWatch y alertas de AWS Budget (plantillas en `infra/`). Las dos se complementan, no se sustituyen: `tol` termina un job que tuvo éxito, `stopping_condition` termina uno que no. Como regla práctica, la instancia corre a **\$0.10–\$3.85/hora** según el tipo, y los cargos cuánticos no cambian respecto a independientes — así que el job más barato es el que converge rápido y se apaga de inmediato.

Una palanca más está fuera del job por completo: a qué QPU lo apuntas. La tarifa fija por tarea es la misma en todos lados, así que redirigir un job mueve solo el flujo por shot — a veces de forma dramática:

```qcostestimate
{"id":"hybrid-cost-provider-swap-1","prompt":"El mismo job de 300 tareas — 25 iteraciones de un ansatz de 6 parámetros, 200 shots por tarea — cuesta $4,890.00 en IonQ. Antes del envío lo rediriges a IQM: mismos circuitos, mismos shots, solo cambia la tarifa por shot. ¿Cuánto cuesta la corrida en IQM?","provider":"IQM","shots":200,"tasks":300,"hint":"La tarifa fija por tarea es idéntica en cada proveedor ({perTask} × 300 = $90.00); toda la diferencia es por shot: {shots} shots × {perShot} es $0.29 por tarea en IQM, así que el flujo de shots cae de $4,800.00 a $87.00. La elección de proveedor mueve la factura de shots, nunca la de tareas."}
```

## PennyLane y CUDA-Q

PennyLane se integra de lleno en un Hybrid Job: apunta su dispositivo a la QPU del job y deja que sus optimizadores conduzcan el bucle, registrando cada paso:

```python
import pennylane as qml
from braket.jobs import save_job_result
from braket.jobs.metrics import log_metric

dev = qml.device("braket.aws.qubit", device_arn=os.environ["AMZN_BRAKET_DEVICE_ARN"], ...)

@qml.qnode(dev)
def circuit(params):
    ...

optimizer = qml.AdamOptimizer(stepsize=0.1)
for step in range(100):
    params, cost = optimizer.step_and_cost(circuit, params)
    log_metric(metric_name="cost", value=cost, iteration_number=step)

save_job_result({"optimal_params": params.tolist(), "final_cost": float(cost)})
```

En algún punto a mitad de ese bucle, `optimizer.step_and_cost` entrega al dispositivo un ansatz con un $\theta$ específico y recibe de vuelta un histograma de shots. Juega el papel del dispositivo en un paso así:

```qpredict
{"id":"hybrid-predict-midtraining-sampler-1","prompt":"A mitad del entrenamiento, el optimizador ha llevado θ a 2.2143 y el job envía el ansatz RY(2.2143) en el qubit 0 seguido de CNOT 0→1. ¿Qué único resultado domina el histograma de shots que devuelve la tarea?","program":"RY 0 2.2143\nCNOT 0 1","mode":"top-outcome","hint":"RY(2.2143) pone sin²(θ/2) = 0.8 de la probabilidad en el |1⟩ del qubit 0, y el CNOT arrastra al qubit 1 para que coincida — así que el 80% de los shots leen 11, el 20% leen 00, y 01/10 nunca aparecen. Pasado θ = π/2 la rama pesada es |1⟩, no |0⟩."}
```

Y cuando el bucle se comporta mal, el flujo de métricas es tu primer testigo. Una curva de costo que se queda perfectamente plana mientras el optimizador barre $\theta$ suele significar que el ansatz está cableado de modo que el parámetro nunca llega al qubit que se mide. Diagnostica exactamente eso:

```qdebug
{"id":"hybrid-debug-reversed-entangler-1","prompt":"El costo de este job es ⟨Z₁⟩, pero la curva de CloudWatch está plana en +1.00 en cada iteración — el optimizador mueve θ y no pasa nada. El entrelazador está cableado al revés: su control está en el qubit que nunca sale de |0⟩, así que nunca se dispara y el qubit 1 nunca siente θ. Corrige la capa para que la rotación llegue al qubit de lectura.","qubits":2,"broken":{"program":"RY 0 1.0472\nCNOT 1 0"},"target":{"program":"RY 0 1.0472\nCNOT 0 1"},"allowedGates":["RY","CNOT"],"hint":"CNOT 1 0 hace del qubit 1 el control — y el qubit 1 sigue en |0⟩, así que la compuerta es una identidad y el costo se queda atascado en ⟨Z₁⟩ = +1 para todo θ: una meseta de la que el optimizador no puede bajar. Apunta el control al qubit rotado: CNOT 0 1 hace que ⟨Z₁⟩ siga cos θ, que sí es entrenable."}
```

Para circuitos de más de ~20 qubits en un simulador, **CUDA-Q** ofrece simulación de vector de estado y de redes tensoriales acelerada por GPU — dramáticamente más rápida en un `ml.p3.2xlarge` o `ml.g4dn.xlarge`, y disponible como imagen de contenedor proporcionada por Braket.

---

## Ejercicios prácticos

1. **`notebooks/01-first-hybrid-job.ipynb`** — Crea tu primer Hybrid Job: un circuito simple de estado de Bell repetido con distintos parámetros. Envía, monitorea el estado, recupera resultados desde S3.

2. **`notebooks/02-parametric-compilation.ipynb`** — Compara el tiempo de ejecución con y sin compilación paramétrica para un circuito variacional. Mide la aceleración en 50 actualizaciones de parámetros.

3. **`notebooks/03-monitoring-metrics.ipynb`** — Registra métricas personalizadas (energía, pérdida) durante un job de VQE. Visualízalas en CloudWatch. Configura alertas básicas.

4. **`notebooks/04-checkpointing.ipynb`** — Implementa checkpointing en una optimización QAOA de larga duración. Simula un fallo. Reinicia desde el checkpoint. Verifica la reanudación correcta.

5. **`notebooks/05-custom-containers.ipynb`** — Construye un contenedor personalizado con librerías extra de química. Súbelo a ECR. Ejecuta un job usando la imagen personalizada.

6. **`notebooks/06-pennylane-jobs.ipynb`** — Ejecuta un bucle completo de entrenamiento variacional de PennyLane como Hybrid Job. Usa optimizadores de PennyLane, registra curvas de entrenamiento, recupera los parámetros óptimos.

7. **`notebooks/07-production-patterns.ipynb`** — Patrones de nivel producción: manejo de errores, reintentos, configuración de timeout, estimación de costo antes del envío, validación de resultados después de completar.

**Algoritmos (scripts de producción):**
- `algorithms/qaoa_maxcut_job.py` — Solver QAOA de producción: acepta un grafo como entrada, produce la partición óptima
- `algorithms/vqe_chemistry_job.py` — VQE de producción: acepta geometría molecular, produce la energía del estado fundamental
- `algorithms/qml_training_job.py` — Entrenador QML de producción: acepta un dataset, produce los parámetros del modelo entrenado

**Contenedores:**
- `containers/Dockerfile` — Contenedor personalizado con OpenFermion, PySCF y herramientas adicionales de química
- `containers/build_and_push.sh` — Script para construir la imagen Docker y subirla a ECR

---

## Referencias

### Documentación de AWS
- [Working with Amazon Braket Hybrid Jobs](https://docs.aws.amazon.com/braket/latest/developerguide/braket-jobs.html) — Guía completa de Hybrid Jobs
- [Key concepts for Hybrid Jobs](https://docs.aws.amazon.com/braket/latest/developerguide/braket-jobs-concepts.html) — Entradas, salidas, métricas, checkpoints
- [Create a Hybrid Job](https://docs.aws.amazon.com/braket/latest/developerguide/braket-jobs-first.html) — Recorrido de creación paso a paso
- [Using parametric compilation to speed up Hybrid Jobs](https://docs.aws.amazon.com/braket/latest/developerguide/braket-jobs-parametric-compilation.html) — Compilar una vez y reutilizar para circuitos FreeParameter
- [Custom containers for Hybrid Jobs](https://docs.aws.amazon.com/braket/latest/developerguide/running-hybrid-jobs-in-own-container.html) — Construir y usar imágenes Docker personalizadas
- [Using PennyLane with Braket](https://docs.aws.amazon.com/braket/latest/developerguide/hybrid.html) — Guía de integración de PennyLane
- [Using CUDA-Q with Braket](https://docs.aws.amazon.com/braket/latest/developerguide/braket-using-cuda-q.html) — Configuración de simulación acelerada por GPU

### Recursos en video
- [Amazon Braket Hybrid Jobs Deep Dive — AWS re:Invent 2023](https://www.youtube.com/watch?v=uKrNWHxEIow) — Equipo de AWS Quantum, 45 min, arquitectura y mejores prácticas para hybrid jobs
- [Running Variational Algorithms at Scale — AWS Quantum Blog](https://www.youtube.com/watch?v=jYLeHwXX8QQ) — 30 min, VQE y QAOA como Hybrid Jobs con compilación paramétrica
- [PennyLane + Braket Hybrid Jobs Tutorial](https://www.youtube.com/watch?v=7cOEqPPk7JQ) — Xanadu + AWS, 25 min, bucle completo de entrenamiento de PennyLane como job
- [Containerized Quantum Workloads on AWS](https://www.youtube.com/watch?v=fD-3WBNlnHY) — Equipo de AWS Containers, 35 min, Docker + ECR + Braket
- [Quantum-Classical Hybrid Algorithms Explained](https://www.youtube.com/watch?v=A2ozpWB7c2A) — IBM Research, 40 min, teoría general de enfoques híbridos
- [Cost Optimization for Quantum Computing on AWS](https://www.youtube.com/watch?v=d9ks9FvyQhE) — AWS, 20 min, estrategias de presupuesto y gestión de costos

### Artículos y lectura adicional
- [Amazon Braket: Quantum Computing Made Accessible (AWS whitepaper)](https://d1.awsstatic.com/whitepapers/quantum-computing-with-amazon-braket.pdf) — Arquitectura y diseño del servicio
- [Optimizing parametric circuits for NISQ devices (Mitarai et al., 2018)](https://arxiv.org/abs/1803.00745) — Teoría detrás de los beneficios de la compilación paramétrica
- [Scalable Quantum Simulation of Molecular Energies (O'Malley et al., 2016)](https://arxiv.org/abs/1512.06860) — Demostración temprana de química híbrida cuántico-clásica
- [PennyLane: Automatic differentiation of hybrid quantum-classical computations](https://arxiv.org/abs/1811.04968) — Artículo del framework PennyLane

---

Has llegado al final del camino: de un solo qubit en `00-prereqs` a un VQE de producción, tolerante a fallos y con control de costos, corriendo solo en infraestructura administrada. Ya puedes construir un circuito, elegir el hardware correcto, ejecutar los algoritmos canónicos, entrenar modelos cuánticos, plegar una molécula sobre qubits y empaquetar todo como un job que escala. La frontera a partir de aquí ya no es aprender las herramientas: es apuntarlas a un problema que valga la pena resolver.
