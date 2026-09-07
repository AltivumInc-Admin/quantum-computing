# Álgebra lineal: la matemática detrás de la computación cuántica

El álgebra lineal es el idioma en el que está escrita la computación cuántica, y este módulo
lo construye desde el álgebra de secundaria en cuatro notebooks de NumPy puro. Todo aquí es
aritmética sobre cuadrículas de números: ecuaciones lineales, suma de matrices,
multiplicación de matrices y la transpuesta, sin cálculo, sin números complejos, sin
mecánica cuántica y sin ninguna cuenta de AWS en ninguna parte. Al terminar estarás listo
para [00-prereqs](../00-prereqs/GUIDE.md), donde estos mismos objetos reciben sus nombres
cuánticos.

## Objetivos de aprendizaje

Al completar este módulo, serás capaz de:

- Resolver un sistema de dos ecuaciones lineales por eliminación, y verificar la respuesta en NumPy
- Decir cuál de los tres desenlaces tiene un sistema: una solución, ninguna o infinitas
- Reescribir un sistema de ecuaciones como la única ecuación matricial $Ax = b$
- Sumar, restar y escalar matrices, y enunciar exactamente cuándo está definida cada operación
- Multiplicar matrices con la regla de filas por columnas, y explicar por qué importa el orden
- Aplicar una matriz a un vector columna y leer el resultado como una transformación de ese vector
- Transponer, verificar numéricamente las cuatro identidades de la transpuesta y construir una matriz simétrica
- Extraer una submatriz de una matriz mayor seleccionando las filas y columnas que quieras

## Prerrequisitos

- Álgebra de secundaria: puedes despejar $y$ en $2x + 3y = 8$ y sustituirlo en otro lado
- Comodidad al ejecutar Python (no necesitas ser experto)
- Una laptop que pueda ejecutar `pip install numpy jupyterlab`

**NO necesitas:** credenciales de AWS, una cuenta de AWS, cálculo, números complejos ni
formación cuántica alguna. Nada en este módulo menciona un cúbit.

## Quién debería saltarse este módulo

Ve directo a [00-prereqs](../00-prereqs/GUIDE.md) si estas cinco cosas ya te resultan
rutinarias:

- Puedes multiplicar una matriz 2 por 2 por un vector columna 2 por 1 sin consultar la regla
- Sabes por qué `A @ B` y `A * B` son operaciones distintas en NumPy
- Puedes decir al instante si dos matrices de forma `(3, 4)` y `(4, 3)` se pueden sumar, multiplicar o ninguna de las dos
- Sabes que $(AB)^T = B^T A^T$ y que la inversión del orden no es una errata
- Puedes definir una matriz simétrica en una oración

Si dos o más te hicieron dudar, dedica primero los cuatro notebooks de aquí. Todo lo que hay
en `00-prereqs` — productos internos, matrices unitarias, productos tensoriales — está
construido con las operaciones de esta página, y avanza rápido porque las da por sabidas.

## Configuración (90 segundos, sin AWS)

Desde la raíz del repositorio:

```bash
python -m venv .venv
source .venv/bin/activate    # on Windows: .venv\Scripts\activate
pip install numpy jupyterlab
jupyter lab 00-linear-algebra/notebooks
```

Esa es toda la configuración. Una sola dependencia hace la matemática; JupyterLab solo la
muestra. Sin `make setup`, sin credenciales de AWS, sin roles de IAM, sin SDK cuántico.

---

## Conceptos

Este módulo cubre cuatro temas bien delimitados. Cada uno corresponde a un notebook.

### 1. Ecuaciones lineales, y qué significa "resolver"

Una ecuación es **lineal** cuando cada incógnita aparece sola, elevada a la primera
potencia, multiplicada por un número y sumada a las demás. Así que $2x + 3y = 8$ es lineal.
$xy = 8$ no lo es (las incógnitas se multiplican entre sí), y $x^2 = 8$ tampoco (la potencia
es dos). Esa única restricción es lo que vuelve tratable a toda la materia — y, más
adelante, lo que hace computable a la mecánica cuántica.

Dos ecuaciones lineales con dos incógnitas dibujan dos rectas en el plano, y *resolver* el
sistema significa encontrar el punto donde se cruzan:

$$
2x + 3y = 8, \qquad x - y = -1
$$

Hay exactamente tres cosas que pueden hacer dos rectas, así que hay exactamente tres
respuestas posibles para un sistema. Se cruzan en un punto (**una solución**), corren
paralelas y nunca se encuentran (**ninguna solución**), o son en secreto la misma recta
(**infinitas soluciones**). Nada más es posible, y ese hecho sobrevive hasta dimensiones
mucho más altas.

```qcard
{"id":"linalg-linear-equation-shape","prompt":"¿Qué hace que una ecuación sea lineal? Clasifica estas tres: `2*x + 3*y = 8`, `x*y = 8`, `x**2 = 8`.","answer":"Lineal significa que cada incógnita aparece sola, a la primera potencia, escalada por un número y sumada. `2*x + 3*y = 8` es lineal. `x*y = 8` no lo es, porque las incógnitas se multiplican entre sí. `x**2 = 8` tampoco, porque la potencia es dos."}
```

```qcard
{"id":"linalg-solution-count-2x2","prompt":"Un sistema de dos ecuaciones lineales con dos incógnitas, ¿cuántas soluciones puede tener? Nombra cada caso y el dibujo que le corresponde.","answer":"Exactamente tres casos. Una solución (las dos rectas se cruzan en un punto), ninguna solución (las rectas son paralelas y nunca se encuentran), o infinitas (las dos ecuaciones describen la misma recta). No existe un sistema con exactamente dos soluciones."}
```

El método que escala es la **eliminación**: escala una ecuación para que los coeficientes de
una variable coincidan, suma o resta para hacer desaparecer esa variable, despeja lo que
queda y luego sustituye hacia atrás. Hacerlo a mano una vez vale más que leer sobre ello
diez veces, así que el notebook lo recorre paso a paso. Aquí está el mismo sistema entregado
a NumPy, con la respuesta devuelta a las ecuaciones originales como verificación:

```runnable
import numpy as np

# The system:  2x + 3y = 8
#               x -  y = -1
A = np.array([[2, 3], [1, -1]], dtype=float)
b = np.array([8, -1], dtype=float)

solution = np.linalg.solve(A, b)
print("x, y =", solution)

# Never trust a solver you have not checked. Put the answer back in.
print("A @ solution =", A @ solution)
print("matches b:", np.allclose(A @ solution, b))
```

Mira de cerca lo que hizo ese código. Nunca escribió las ecuaciones como ecuaciones. Guardó
los **coeficientes** en una cuadrícula `A`, los **lados derechos** en una lista `b`, y dejó
que la forma del problema cargara con el significado. Ese reempaquetado — de un párrafo de
ecuaciones a la única afirmación $Ax = b$ — es la primera idea genuinamente nueva del
álgebra lineal, y toda idea posterior es una consecuencia suya.

```qcard
{"id":"linalg-system-as-matrix-equation","prompt":"Reescribe el sistema `2x + 3y = 8` y `x - y = -1` en la forma `A @ x = b`. ¿Qué va en `A`, qué va en `b` y qué contiene `x`?","answer":"`A = [[2, 3], [1, -1]]` contiene los coeficientes, una ecuación por fila. `b = [8, -1]` contiene los lados derechos. `x = [x, y]` es la columna de incógnitas que estás despejando."}
```

### 2. Matrices: sumar, restar, escalar

Una **matriz** es una cuadrícula rectangular de números, descrita por su **forma**: primero
las filas, después las columnas. `[[1, 2], [3, 4]]` es 2 por 2; `[[1, 2, 3]]` es 1 por 3. En
NumPy la forma está siempre a un atributo de distancia, y la consultarás constantemente,
porque casi todo error de este módulo es un error de forma disfrazado.

La suma y la resta son las operaciones fáciles, y lo son del modo más literal posible:
trabajan entrada por entrada, en su sitio. La entrada de la fila 1, columna 2 de $A + B$ es
la entrada de la fila 1, columna 2 de $A$ más la entrada de la fila 1, columna 2 de $B$.
Escalar por un número hace lo mismo con la multiplicación: cada entrada se multiplica, nada
se mueve.

Esa definición entrada por entrada trae consigo un requisito duro. Si las entradas no se
emparejan una a una, la operación no es meramente incómoda: está indefinida — **dos matrices
solo se pueden sumar cuando sus formas son idénticas**. No compatibles, no parecidas:
idénticas.

```qcard
{"id":"linalg-addition-shape-rule","prompt":"¿Cuándo se pueden sumar dos matrices? ¿Puedes sumar una matriz de forma `(2, 2)` con una de forma `(2, 3)`?","answer":"Solo cuando sus formas son idénticas, porque la suma trabaja entrada por entrada y cada entrada necesita una pareja en la misma posición. Una `(2, 2)` y una `(2, 3)` no se pueden sumar en absoluto."}
```

```qcard
{"id":"linalg-scalar-multiplication","prompt":"¿Qué le hace `3 * A` a una matriz `A`, y qué forma tiene el resultado?","answer":"Multiplica por 3 cada una de las entradas de `A` y deja intacta la disposición, así que el resultado tiene exactamente la misma forma que `A`. Escalar nunca mueve una entrada a una posición nueva."}
```

Ejecuta las operaciones, y luego ejecuta el fallo. El `try`/`except` del final no es
programación defensiva por sí misma — ver la excepción exacta que lanza NumPy es como la
regla de las formas deja de ser una frase que leíste y se convierte en algo que esperas:

```runnable
import numpy as np

A = np.array([[1, 2], [3, 4]])
B = np.array([[10, 20], [30, 40]])

print("A + B =\n", A + B)
print("B - A =\n", B - A)
print("3 * A =\n", 3 * A)
print("shape is preserved:", A.shape, "->", (3 * A).shape)

# Same shape is not a convention. It is a requirement.
C = np.array([[1, 2, 3]])
print("A.shape =", A.shape, " C.shape =", C.shape)
try:
    A + C
except ValueError as err:
    print("refused, as it should be:", err)
```

La suma de matrices se comporta exactamente como la suma de números corrientes: el orden no
importa, la agrupación no importa, y la matriz de ceros de la misma forma deja sin cambio
todo aquello a lo que se suma. Quédate con esa palabra *exactamente*, porque en la siguiente
sección deja de ser cierta.

### 3. Multiplicación de matrices

La multiplicación es donde las matrices se ganan el sueldo, y es la única regla de este
módulo que vale la pena memorizar de plano. La entrada de la **fila $i$, columna $j$** del
producto $AB$ es la fila $i$ de $A$ recorrida contra la columna $j$ de $B$: multiplica los
pares y suma los resultados.

La regla de las formas sale directamente de esa descripción. Para recorrer una fila de $A$
contra una columna de $B$ ambas tienen que tener la misma longitud, así que **el número de
columnas de $A$ debe ser igual al número de filas de $B$**. Alinea las formas y el par
compatible se cancela en el medio, dejando la forma de la respuesta en los extremos:

$$
(m \times n) \cdot (n \times p) \longrightarrow (m \times p)
$$

```qcard
{"id":"linalg-multiplication-shape-rule","prompt":"¿Qué formas se pueden multiplicar, y qué forma sale? Resuélvelo para una `(2, 3)` por una `(3, 4)`.","answer":"Las columnas de la matriz izquierda deben ser iguales a las filas de la derecha. Una `(2, 3)` por una `(3, 4)` es legal porque los 3 interiores coinciden, y el resultado tiene forma `(2, 4)` — los dos números exteriores. Al revés, `(3, 4)` por `(2, 3)`, está indefinido."}
```

NumPy hará por ti tanto un producto matricial como un producto entrada por entrada, y usa
dos operadores distintos para mantenerlos separados. `@` es el producto de filas por
columnas que acabas de aprender. `*` es el producto entrada por entrada, que empareja
posiciones igual que la suma y no tiene nada que ver con el álgebra lineal. Confundirlos es
el error de NumPy más común de todo este currículo, y es silencioso: para matrices
cuadradas ambos operadores devuelven una respuesta y, salvo en unos pocos casos especiales
como la identidad, no es la misma.

```qcard
{"id":"linalg-at-versus-star","prompt":"En NumPy, ¿cuál es la diferencia entre `A @ B` y `A * B`?","answer":"`@` es multiplicación matricial: la fila `i` de `A` recorrida contra la columna `j` de `B`, sumada. `*` es multiplicación elemento a elemento, que empareja entradas por posición. Para matrices cuadradas ambos corren sin error y por lo general devuelven resultados distintos, y por eso el error es tan fácil de pasar por alto."}
```

```runnable
import numpy as np

A = np.array([[1, 2], [3, 4]])
B = np.array([[0, 1], [1, 0]])

print("A @ B  (rows against columns):\n", A @ B)
print("A * B  (entry against entry):\n", A * B)
print("same answer?", np.array_equal(A @ B, A * B))

# And the property that separates matrices from ordinary numbers.
print("B @ A:\n", B @ A)
print("A @ B equals B @ A ?", np.array_equal(A @ B, B @ A))
print("A * B equals B * A ?", np.array_equal(A * B, B * A))
```

Ese último par de líneas es el remate de la sección. La multiplicación entrada por entrada
conmuta, porque la multiplicación de números corrientes conmuta. La multiplicación de
matrices **no**: $AB$ y $BA$ suelen ser matrices distintas, y para formas no cuadradas puede
que una de las dos ni siquiera exista. Ahora el orden es información. Cada secuencia de
puertas que escribas en `01-foundations` depende de esto, y por eso "aplica $H$ y luego $X$"
y "aplica $X$ y luego $H$" son dos circuitos distintos.

```qcard
{"id":"linalg-multiplication-not-commutative","prompt":"¿Es conmutativa la multiplicación de matrices? ¿Qué significa `A @ B` frente a `B @ A` para una secuencia de operaciones?","answer":"No. `A @ B` y `B @ A` suelen ser matrices distintas, y para formas no cuadradas puede que solo una esté definida. El orden carga significado: aplicar B y luego A es una operación distinta de aplicar A y luego B."}
```

El caso particular más útil de la regla es una matriz por un **vector columna**, es decir
una matriz $n$ por 1. Las formas encajan como $(m \times n) \cdot (n \times 1) \to (m \times 1)$,
así que una matriz recibe un vector columna y devuelve un vector columna. Esa es la imagen
completa: una matriz es una máquina que transforma vectores, y multiplicar por ella es poner
la máquina a funcionar.

```qcard
{"id":"linalg-matrix-times-vector","prompt":"¿Qué forma sale de una matriz `(2, 2)` por un vector columna `(2, 1)`, y qué está haciendo la operación?","answer":"Un vector columna `(2, 1)`: los 2 interiores se cancelan y quedan los números exteriores. Léelo como una transformación: la matriz recibe un vector y devuelve un vector transformado, y por eso las matrices describen operaciones y no solo datos."}
```

```runnable
import numpy as np

# A matrix that stretches the first coordinate by 2 and the second by 3.
M = np.array([[2, 0], [0, 3]])
v = np.array([[1], [1]])          # a 2-by-1 column vector

print("v =\n", v)
print("M @ v =\n", M @ v)

# The same product, one entry at a time: a row of M walked against the column.
by_hand = [sum(M[i, k] * v[k, 0] for k in range(2)) for i in range(2)]
print("by hand:", by_hand)

# Shapes: (2, 2) @ (2, 1) -> (2, 1). The inner 2s cancel.
print("shapes:", M.shape, "@", v.shape, "->", (M @ v).shape)
```

### 4. Transpuesta, submatrices y las propiedades que se cumplen

La **transpuesta** de una matriz, escrita $A^T$, la voltea sobre su diagonal principal: la
fila 1 se vuelve la columna 1, la fila 2 se vuelve la columna 2, y la forma se invierte de
$(m \times n)$ a $(n \times m)$. En NumPy cuesta tres caracteres, `A.T`, y es el signo de
puntuación más común del código cuántico — el bra de `00-prereqs` es una transpuesta con una
conjugación encima.

Cinco hechos cubren toda la transposición. Tres son los aburridos que habrías adivinado, y
la resta sigue la regla de la suma por el mismo motivo:

$$
(A^T)^T = A, \quad (cA)^T = cA^T, \quad (A + B)^T = A^T + B^T
$$

El cuarto es el que atrapa a la gente, siempre:

$$
(AB)^T = B^T A^T
$$

El orden **se invierte**. No es una errata ni una convención que alguien eligió; la fuerza
la regla de las formas, porque $(m \times n)(n \times p)$ se transpone a $(p \times m)$ y
solo $B^T A^T$ tiene esa forma.

El quinto hecho es una definición, no una identidad. Una matriz cuadrada que es igual a su
propia transpuesta, $A^T = A$, se llama **simétrica**. Verifica las cuatro identidades de una
vez en lugar de creerle a nadie:

```runnable
import numpy as np

A = np.array([[1, 2], [3, 4]])
B = np.array([[5, 6], [7, 8]])
c = 3

checks = {
    "(A.T).T == A": np.array_equal(A.T.T, A),
    "(c * A).T == c * A.T": np.array_equal((c * A).T, c * A.T),
    "(A + B).T == A.T + B.T": np.array_equal((A + B).T, A.T + B.T),
    "(A @ B).T == B.T @ A.T": np.array_equal((A @ B).T, B.T @ A.T),
}

for name, holds in checks.items():
    print("PASS" if holds else "FAIL", name)

print("all four identities hold:", all(checks.values()))
print("and subtraction follows the sum rule:", np.array_equal((A - B).T, A.T - B.T))

# The fifth is the one people get wrong. Here is the wrong version, for contrast.
print("(A @ B).T:\n", (A @ B).T)
print("A.T @ B.T  (not the same matrix):\n", A.T @ B.T)
```

```qcard
{"id":"linalg-transpose-shape","prompt":"¿Qué le hace la transpuesta a una matriz de forma `(2, 5)`, y cómo se escribe en NumPy?","answer":"La voltea sobre su diagonal principal, convirtiendo filas en columnas, así que la forma se invierte a `(5, 2)`. En NumPy es `A.T`."}
```

```qcard
{"id":"linalg-transpose-of-product","prompt":"Desarrolla `(A @ B).T`. ¿Por qué se invierte el orden?","answer":"`(A @ B).T` es igual a `B.T @ A.T`. El orden se invierte porque lo fuerzan las formas: un producto `(m, n)` por `(n, p)` tiene forma `(m, p)`, cuya transpuesta es `(p, m)` — y solo `B.T @ A.T` produce esa forma. Escribir `A.T @ B.T` es el error clásico."}
```

Una matriz que es su propia transpuesta, $A = A^T$, se llama **simétrica**. Las matrices
simétricas son las bien portadas, y aparecen por todas partes más adelante: matrices de
covarianza en aprendizaje automático, hamiltonianos en química, y las primas de valor real
de las matrices hermíticas que introduce `00-prereqs`. No tienes que salir a cazar una:
cualquier matriz cuadrada contiene una matriz simétrica, extraíble en una sola línea.

```qcard
{"id":"linalg-symmetric-definition","prompt":"¿Qué hace que una matriz sea simétrica, y cómo construyes una a partir de cualquier matriz cuadrada `M`?","answer":"Una matriz es simétrica cuando es igual a su propia transpuesta: `A == A.T`, de modo que la entrada de la fila i columna j coincide con la de la fila j columna i. A partir de cualquier `M` cuadrada, tanto `M + M.T` como `M @ M.T` son siempre simétricas."}
```

```runnable
import numpy as np

M = np.array([[4, 1, 7], [2, 9, 0], [5, 3, 6]])

# Two constructions turn ANY square matrix into a symmetric one, both in integers.
S = M + M.T
P = M @ M.T

print("M + M.T:\n", S)
print("it equals its own transpose:", np.array_equal(S, S.T))
print("M @ M.T:\n", P)
print("so does this one:", np.array_equal(P, P.T))

# Halving the first keeps the symmetry and the original scale, at the cost of
# leaving the integers behind.
averaged = (M + M.T) / 2
print("the averaged version is symmetric too:", np.allclose(averaged, averaged.T))

# A submatrix: keep rows 0 and 2, and columns 0 and 2, discarding the middle.
sub = M[np.ix_([0, 2], [0, 2])]
print("submatrix:\n", sub)
print("its shape:", sub.shape)
```

Las dos últimas líneas introducen la **submatriz**: elige un conjunto de filas y un conjunto
de columnas, quédate con las entradas donde se cruzan y descarta el resto. Es una operación
humilde con un gran futuro. Seleccionar un bloque de una matriz es la forma en que miras dos cúbits
dentro de un registro de cuatro, como un hamiltoniano se parte en piezas lo bastante
pequeñas para ejecutarse, y como cualquier problema grande se corta en problemas que caben.

Eso es todo el módulo. Sabes resolver un sistema, sumar y escalar una cuadrícula de números,
multiplicar dos matrices en el orden correcto, voltear una y extraerle un pedazo.
[00-prereqs](../00-prereqs/GUIDE.md) toma exactamente estas cinco operaciones y les da
nombres cuánticos: un vector columna se vuelve un estado, una matriz cuadrada se vuelve una
puerta, la transpuesta gana una conjugación y se vuelve la daga, y el producto $Ax$ se
vuelve "aplicar la puerta". No hay que aprender nada nuevo sobre la aritmética. Solo cambia
el vocabulario.

---

## Ejercicios prácticos

Completa estos notebooks en orden. Cada uno toma 20-40 minutos.

1. **`notebooks/01-linear-equations.ipynb`** — Qué hace lineal a una ecuación, resolver un
   sistema de dos ecuaciones por eliminación y por sustitución, la tricotomía
   una/ninguna/infinitas, y empaquetar un sistema como `A @ x = b` para `np.linalg.solve`.

2. **`notebooks/02-matrices-add-subtract.ipynb`** — La forma como lo primero que revisas.
   Suma y resta entrada por entrada, multiplicación por un escalar, la matriz de ceros, y
   los errores de forma que NumPy lanza cuando se rompe la regla.

3. **`notebooks/03-matrix-multiplication.ipynb`** — La regla de filas por columnas a mano, y
   después `@`. Compatibilidad de formas, `@` frente a `*`, la matriz identidad, la no
   conmutatividad, y una matriz aplicada a un vector columna leída como transformación.

4. **`notebooks/04-transpose-submatrix-properties.ipynb`** — La transpuesta y sus cinco
   identidades verificadas numéricamente, por qué `(A @ B).T` invierte el orden, las matrices
   simétricas y las dos construcciones que siempre producen una, y cómo sacar submatrices de
   una cuadrícula mayor borrando una fila y una columna o rebanando un bloque.

---

## Autoevaluación

Cuando termines, deberías poder responder las cinco preguntas de **Compruébate** al final de
esta GUIDE sin consultar nada. Si dos o más te dan problemas, repasa el notebook
correspondiente antes de empezar `00-prereqs`.

Una lista corta de cómo se ve "estar listo":

- Vas por `.shape` antes de ir por un operador
- Puedes multiplicar en papel una matriz 2 por 2 y un vector columna 2 por 1, bien, al primer intento
- Nunca escribes `*` cuando quieres decir `@`, y sabes decir qué habría calculado el operador equivocado
- Puedes enunciar la regla de formas de la multiplicación sin titubear
- Escribes `(A @ B).T` como `B.T @ A.T` de forma automática, y sabes por qué se invierte el orden
- Puedes construir una matriz simétrica a partir de cualquier matriz cuadrada en una línea

Si eso se siente rutinario, avanza a [00-prereqs](../00-prereqs/GUIDE.md).

---

## Referencias

### Visual e intuición primero

- [3Blue1Brown — Essence of Linear Algebra](https://www.youtube.com/playlist?list=PLZHQObOWTQDPD3MizzM2xVFitgF8hE_ab) — Quince episodios cortos que hacen sentir a las matrices como transformaciones en vez de cuadrículas. Los episodios 1-4 acompañan a los notebooks 01 y 03.
- [Immersive Linear Algebra](https://immersivemath.com/ila/index.html) — Un libro gratuito cuyas figuras puedes arrastrar. Los capítulos 1-4 cubren el terreno de este módulo.

### Práctica y ejercitación

- [Khan Academy — Systems of Equations](https://www.khanacademy.org/math/algebra/x2f8bb11595b61c86:systems-of-equations) — Eliminación y sustitución, con práctica generada sin límite.
- [Khan Academy — Matrices](https://www.khanacademy.org/math/precalculus/x9e81a4f98389efdf:matrices) — Suma, multiplicación y las reglas de formas, al ritmo de una primera pasada.

### Referencia

- [MIT 18.06 Linear Algebra](https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/) — Las clases de Gilbert Strang. Las lecciones 1-3 van bastante más allá de este módulo; trátalas como el siguiente paso, no como un prerrequisito.
- [NumPy: the absolute basics for beginners](https://numpy.org/doc/stable/user/absolute_beginners.html) — El recorrido oficial por arreglos, formas y broadcasting.

---

## Compruébate

Cinco preguntas que amarran el módulo. Intenta cada una antes de revelar la pista o la
respuesta. Después de revelar, califica qué tan bien la recordaste (Otra vez / Difícil /
Bien / Fácil); esas calificaciones entran en tu programa de repetición espaciada para que la
habilidad regrese cuando estés a punto de olvidarla.

```quiz
{
  "questions": [
    {
      "id": "linalg-quiz-solution-count",
      "q": "Dos ecuaciones lineales con dos incógnitas. ¿Cuántas soluciones puede tener el sistema, y cómo se ve cada caso como dibujo?",
      "hint": "Cada ecuación es una recta en el plano, y una solución es un punto por el que pasan ambas rectas. Enumera lo que dos rectas pueden hacer entre sí: hay menos posibilidades de las que imaginas, y 'exactamente dos cruces' no es una de ellas.",
      "a": "Solo tres casos. Una solución cuando las rectas se cruzan en un único punto, ninguna solución cuando son paralelas y nunca se encuentran, e infinitas cuando las dos ecuaciones describen la misma recta."
    },
    {
      "id": "linalg-quiz-shape-rules",
      "q": "Dadas `A` de forma `(2, 3)` y `B` de forma `(3, 2)`: ¿puedes calcular `A + B`? ¿Puedes calcular `A @ B`? ¿Qué forma produce la operación legal?",
      "hint": "Las dos operaciones tienen reglas completamente distintas. La suma trabaja entrada por entrada, así que pregunta si cada entrada tiene una pareja en la misma posición. La multiplicación recorre filas contra columnas, así que solo pregunta si las dimensiones interiores coinciden.",
      "a": "La suma `A + B` está indefinida: la suma exige formas idénticas, y `(2, 3)` no es `(3, 2)`. `A @ B` es legal porque los 3 interiores coinciden, y produce forma `(2, 2)`."
    },
    {
      "id": "linalg-quiz-matmul-vs-star",
      "q": "En NumPy, ¿qué calcula cada uno de `A @ B` y `A * B`, y por qué confundirlos es un error tan peligroso?",
      "hint": "Uno sigue la regla de filas por columnas del álgebra lineal; el otro empareja entradas posición por posición. Ahora pregúntate qué pasa cuando ambas matrices son cuadradas y, por tanto, ambas operaciones son legales.",
      "a": "`@` es multiplicación matricial (la fila i de A recorrida contra la columna j de B, sumada); `*` es multiplicación elemento a elemento. Para matrices cuadradas ambas tienen éxito y por lo general devuelven números distintos, así que el error produce respuestas equivocadas en silencio en vez de lanzar una excepción."
    },
    {
      "id": "linalg-quiz-transpose-of-product",
      "q": "Desarrolla `(A @ B).T` en términos de `A.T` y `B.T`, y explica por qué la respuesta no es `A.T @ B.T`.",
      "hint": "Sigue las formas. Si A es `(m, n)` y B es `(n, p)`, entonces `A @ B` es `(m, p)` y su transpuesta es `(p, m)`. Ahora revisa cuál de los dos productos candidatos tiene realmente forma `(p, m)`.",
      "a": "`(A @ B).T == B.T @ A.T` — el orden se invierte. Lo fuerzan las formas: `A.T` es `(n, m)` y `B.T` es `(p, n)`, así que `A.T @ B.T` ni siquiera encaja, mientras que `B.T @ A.T` es `(p, n)` por `(n, m)`, lo que da la forma requerida `(p, m)`."
    },
    {
      "id": "linalg-quiz-symmetric-construction",
      "q": "¿Qué hace que una matriz sea simétrica, y cómo producirías una a partir de la matriz cuadrada arbitraria `M = [[4, 1, 7], [2, 9, 0], [5, 3, 6]]`?",
      "hint": "La definición es una ecuación que relaciona la matriz con su propia transpuesta. Para la construcción, piensa en lo que le hace promediar una matriz con su transpuesta a la entrada de la fila i columna j frente a la de la fila j columna i.",
      "a": "Una matriz es simétrica cuando `A == A.T`, de modo que la entrada (i, j) siempre es igual a la entrada (j, i). Promediar cualquier matriz cuadrada con su transpuesta produce una: `S = (M + M.T) / 2` cumple `S == S.T` para toda `M` cuadrada."
    }
  ]
}
```
