# Linear Algebra: The Math Behind Quantum Computing

Linear algebra is the language quantum computing is written in, and this module builds it
from high-school algebra in four notebooks of pure NumPy. Everything here is arithmetic on
grids of numbers: linear equations, matrix addition, matrix multiplication, and the
transpose, with no calculus, no complex numbers, no quantum mechanics and no AWS account
anywhere in it. When you finish you are ready for [00-prereqs](../00-prereqs/GUIDE.md),
where these same objects pick up their quantum names.

## Learning Objectives

After completing this module, you will be able to:

- Solve a system of two linear equations by elimination, and check the answer in NumPy
- Say which of the three outcomes a system has — one solution, none, or infinitely many
- Rewrite a system of equations as the single matrix equation $Ax = b$
- Add, subtract and scale matrices, and state exactly when each operation is defined
- Multiply matrices by the rows-times-columns rule, and explain why the order matters
- Apply a matrix to a column vector and read the result as a transformation of that vector
- Take a transpose, verify the four transpose identities numerically, and build a symmetric matrix
- Pull a submatrix out of a larger matrix by selecting the rows and columns you want

## Prerequisites

- High-school algebra: you can solve $2x + 3y = 8$ for $y$ and substitute it somewhere else
- Comfort running Python (you do not need to be an expert)
- A laptop that can run `pip install numpy jupyterlab`

**You do NOT need:** AWS credentials, an AWS account, calculus, complex numbers, or any
quantum background whatsoever. Nothing in this module mentions a qubit.

## Who should skip this module

Skip straight to [00-prereqs](../00-prereqs/GUIDE.md) if all five of these are already
routine for you:

- You can multiply a 2-by-2 matrix by a 2-by-1 column vector without looking up the rule
- You know why `A @ B` and `A * B` are different operations in NumPy
- You can say instantly whether `(3, 4)` and `(4, 3)` shaped matrices can be added, multiplied, or neither
- You know that $(AB)^T = B^T A^T$ and that the order flip is not a typo
- You can define a symmetric matrix in one sentence

If two or more of those made you hesitate, spend the four notebooks here first. Everything
in `00-prereqs` — inner products, unitary matrices, tensor products — is built out of the
operations on this page, and it moves fast because it assumes them.

## Setup (90 seconds, no AWS)

From the repo root:

```bash
python -m venv .venv
source .venv/bin/activate    # on Windows: .venv\Scripts\activate
pip install numpy jupyterlab
jupyter lab 00-linear-algebra/notebooks
```

That is the whole setup. One dependency does the mathematics; JupyterLab just renders it.
No `make setup`, no AWS credentials, no IAM roles, no quantum SDK.

---

## Concepts

This module covers four tightly scoped topics. Each maps to one notebook.

### 1. Linear equations, and what "solving" means

An equation is **linear** when every unknown appears alone, to the first power, multiplied
by a number and added to the others. So $2x + 3y = 8$ is linear. $xy = 8$ is not (the
unknowns multiply each other), and $x^2 = 8$ is not (the power is two). That single
restriction is what makes the whole subject tractable — and, later, what makes quantum
mechanics computable.

Two linear equations in two unknowns draw two straight lines in the plane, and *solving*
the system means finding the point where they cross:

$$
2x + 3y = 8, \qquad x - y = -1
$$

There are exactly three things two lines can do, so there are exactly three answers a
system can have. They cross at one point (**one solution**), they run parallel and never
meet (**no solution**), or they are secretly the same line (**infinitely many
solutions**). Nothing else is possible, and that fact survives all the way up into
higher dimensions.

```qcard
{"id":"linalg-linear-equation-shape","prompt":"What makes an equation linear? Classify these three: `2*x + 3*y = 8`, `x*y = 8`, `x**2 = 8`.","answer":"Linear means every unknown appears alone, to the first power, scaled by a number and added. `2*x + 3*y = 8` is linear. `x*y = 8` is not, because the unknowns multiply each other. `x**2 = 8` is not, because the power is two."}
```

```qcard
{"id":"linalg-solution-count-2x2","prompt":"A system of two linear equations in two unknowns can have how many solutions? Name every case and the picture that goes with it.","answer":"Exactly three cases. One solution (the two lines cross at a point), no solution (the lines are parallel and never meet), or infinitely many (the two equations describe the same line). There is no system with exactly two solutions."}
```

The method that scales is **elimination**: scale one equation so a variable's coefficients
match, add or subtract to make that variable vanish, solve for what is left, then
back-substitute. Doing it by hand once is worth more than reading about it ten times, so
the notebook walks it step by step. Here is the same system handed to NumPy, with the
answer pushed back through the original equations as a check:

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

Look closely at what that code did. It never wrote the equations down as equations. It
stored the **coefficients** in a grid `A`, the **right-hand sides** in a list `b`, and let
the shape of the problem carry the meaning. That repackaging — from a paragraph of
equations to the single statement $Ax = b$ — is the first genuinely new idea in linear
algebra, and every later idea is a consequence of it.

```qcard
{"id":"linalg-system-as-matrix-equation","prompt":"Rewrite the system `2x + 3y = 8` and `x - y = -1` in the form `A @ x = b`. What goes in `A`, what goes in `b`, and what does `x` hold?","answer":"`A = [[2, 3], [1, -1]]` holds the coefficients, one equation per row. `b = [8, -1]` holds the right-hand sides. `x = [x, y]` is the column of unknowns you are solving for."}
```

### 2. Matrices: adding, subtracting, scaling

A **matrix** is a rectangular grid of numbers, described by its **shape**: rows first,
columns second. `[[1, 2], [3, 4]]` is 2-by-2; `[[1, 2, 3]]` is 1-by-3. In NumPy the shape
is always one attribute away, and you will check it constantly, because almost every error
in this module is a shape error wearing a disguise.

Addition and subtraction are the easy operations, and they are easy in the most literal
way: work entry by entry, in place. The entry in row 1, column 2 of $A + B$ is the entry in
row 1, column 2 of $A$ plus the entry in row 1, column 2 of $B$. Scaling by a number does
the same thing with multiplication: every entry gets multiplied, nothing moves.

That entrywise definition carries a hard requirement with it. If the entries do not pair
up one-for-one, the operation is not merely awkward, it is undefined — **two matrices can
be added only when their shapes are identical**. Not compatible, not close: identical.

```qcard
{"id":"linalg-addition-shape-rule","prompt":"When can two matrices be added? Can you add a matrix of shape `(2, 2)` to one of shape `(2, 3)`?","answer":"Only when their shapes are identical, because addition works entry by entry and every entry needs a partner in the same position. A `(2, 2)` and a `(2, 3)` cannot be added at all."}
```

```qcard
{"id":"linalg-scalar-multiplication","prompt":"What does `3 * A` do to a matrix `A`, and what shape does the result have?","answer":"It multiplies every single entry of `A` by 3 and leaves the layout alone, so the result has exactly the same shape as `A`. Scaling never moves an entry to a new position."}
```

Run the operations, then run the failure. The `try`/`except` at the bottom is not defensive
programming for its own sake — seeing the exact exception NumPy raises is how the shape rule
stops being a sentence you read and becomes a thing you expect:

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

Addition of matrices behaves exactly like addition of ordinary numbers: the order does not
matter, the grouping does not matter, and the all-zeros matrix of the same shape leaves
everything it is added to unchanged. Hold on to that word *exactly*, because in the next
section it stops being true.

### 3. Matrix multiplication

Multiplication is where matrices earn their keep, and it is the one rule in this module
worth memorizing outright. The entry in **row $i$, column $j$** of the product $AB$ is the
row $i$ of $A$ walked against the column $j$ of $B$: multiply the pairs, add the results.

The shape rule falls straight out of that description. To walk a row of $A$ against a
column of $B$ they have to be the same length, so **the number of columns of $A$ must equal
the number of rows of $B$**. Line the shapes up and the compatible pair cancels in the
middle, leaving the shape of the answer at the ends:

$$
(m \times n) \cdot (n \times p) \longrightarrow (m \times p)
$$

```qcard
{"id":"linalg-multiplication-shape-rule","prompt":"Which shapes can be multiplied, and what shape comes out? Work it for a `(2, 3)` times a `(3, 4)`.","answer":"The columns of the left matrix must equal the rows of the right one. A `(2, 3)` times a `(3, 4)` is legal because the inner 3s agree, and the result has shape `(2, 4)` — the two outer numbers. Reversing them, `(3, 4)` times `(2, 3)`, is undefined."}
```

NumPy will do both a matrix product and an entrywise product for you, and it uses two
different operators to keep them apart. `@` is the rows-times-columns product you just
learned. `*` is the entrywise product, which pairs up positions the way addition does and
has nothing to do with linear algebra. Confusing them is the single most common NumPy bug
in this entire curriculum, and it is a silent one: for square matrices both operators
return an answer, and outside a few special cases such as the identity it is not the same
answer.

```qcard
{"id":"linalg-at-versus-star","prompt":"In NumPy, what is the difference between `A @ B` and `A * B`?","answer":"`@` is matrix multiplication — row `i` of `A` walked against column `j` of `B`, summed. `*` is elementwise multiplication, pairing entries by position. For square matrices both run without error and generally return different results, which is why the bug is so easy to miss."}
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

That last pair of lines is the punchline of the section. Entrywise multiplication commutes,
because ordinary number multiplication commutes. Matrix multiplication does **not**: $AB$
and $BA$ are usually different matrices, and for non-square shapes one of them may not even
exist. Order is information now. Every gate sequence you will ever write in `01-foundations`
depends on this, which is why "apply $H$ then $X$" and "apply $X$ then $H$" are two
different circuits.

```qcard
{"id":"linalg-multiplication-not-commutative","prompt":"Is matrix multiplication commutative? What does `A @ B` versus `B @ A` mean for a sequence of operations?","answer":"No. `A @ B` and `B @ A` are usually different matrices, and for non-square shapes only one of them may be defined. Order carries meaning: applying B then A is a different operation from applying A then B."}
```

The most useful special case of the rule is a matrix times a **column vector** — an
$n$-by-1 matrix. The shapes work out as $(m \times n) \cdot (n \times 1) \to (m \times 1)$,
so a matrix takes a column vector in and hands a column vector back. That is the entire
picture: a matrix is a machine that transforms vectors, and multiplying by it is running
the machine.

```qcard
{"id":"linalg-matrix-times-vector","prompt":"What shape comes out of a `(2, 2)` matrix times a `(2, 1)` column vector, and what is the operation doing?","answer":"A `(2, 1)` column vector — the inner 2s cancel and the outer numbers remain. Read it as a transformation: the matrix takes a vector in and hands a transformed vector back, which is why matrices describe operations rather than just data."}
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

### 4. Transpose, submatrices, and the properties that hold

The **transpose** of a matrix, written $A^T$, flips it across its main diagonal: row 1
becomes column 1, row 2 becomes column 2, and the shape reverses from $(m \times n)$ to
$(n \times m)$. In NumPy it costs three characters, `A.T`, and it is the single most common
piece of punctuation in quantum code — the bra in `00-prereqs` is a transpose with a
conjugation stapled on.

Five facts cover the whole of transposition. Three are the boring ones you would guess,
and subtraction follows the sum rule for the same reason:

$$
(A^T)^T = A, \quad (cA)^T = cA^T, \quad (A + B)^T = A^T + B^T
$$

The fourth is the one that catches people, every time:

$$
(AB)^T = B^T A^T
$$

The order **flips**. It is not a typo and it is not a convention someone chose; it is forced
by the shape rule, since $(m \times n)(n \times p)$ transposes to $(p \times m)$ and only
$B^T A^T$ has that shape.

The fifth fact is a definition rather than an identity. A square matrix that equals its own
transpose, $A^T = A$, is called **symmetric**. Verify the four identities at once rather than
taking anyone's word for them:

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
{"id":"linalg-transpose-shape","prompt":"What does the transpose do to a matrix of shape `(2, 5)`, and how do you write it in NumPy?","answer":"It flips the matrix across its main diagonal, turning rows into columns, so the shape reverses to `(5, 2)`. In NumPy it is `A.T`."}
```

```qcard
{"id":"linalg-transpose-of-product","prompt":"Expand `(A @ B).T`. Why does the order flip?","answer":"`(A @ B).T` equals `B.T @ A.T`. The order flips because the shapes force it: an `(m, n)` times `(n, p)` product has shape `(m, p)`, whose transpose is `(p, m)` — and only `B.T @ A.T` produces that shape. Writing `A.T @ B.T` is the classic error."}
```

A matrix that is its own transpose, $A = A^T$, is called **symmetric**. Symmetric matrices
are the well-behaved ones, and they show up everywhere downstream: covariance matrices in
machine learning, Hamiltonians in chemistry, and the real-valued cousins of the Hermitian
matrices `00-prereqs` introduces. You do not have to hunt for one — any square matrix
contains a symmetric matrix, extractable in a single line.

```qcard
{"id":"linalg-symmetric-definition","prompt":"What makes a matrix symmetric, and how do you build one from any square matrix `M`?","answer":"A matrix is symmetric when it equals its own transpose: `A == A.T`, so the entry in row i column j matches the entry in row j column i. From any square `M`, both `M + M.T` and `M @ M.T` are always symmetric."}
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

The last two lines introduce the **submatrix**: pick a set of rows and a set of columns,
keep the entries where they cross, discard the rest. It is a humble operation with a large
future. Selecting a block of a matrix is how you look at two qubits inside a four-qubit
register, how a Hamiltonian gets carved into pieces small enough to run, and how any large
problem gets cut into ones that fit.

That is the whole module. You can solve a system, add and scale a grid of numbers, multiply
two matrices in the correct order, flip one over, and pull a piece out of it.
[00-prereqs](../00-prereqs/GUIDE.md) takes exactly these five operations and gives them
quantum names: a column vector becomes a state, a square matrix becomes a gate, the
transpose grows a conjugation and becomes the dagger, and the product $Ax$ becomes "apply
the gate." Nothing new has to be learned about the arithmetic. Only the vocabulary changes.

---

## Hands-On Exercises

Complete these notebooks in order. Each takes 20-40 minutes.

1. **`notebooks/01-linear-equations.ipynb`** — What makes an equation linear, solving a
   two-equation system by elimination and by substitution, the one/none/infinite trichotomy,
   and packaging a system as `A @ x = b` for `np.linalg.solve`.

2. **`notebooks/02-matrices-add-subtract.ipynb`** — Shape as the first thing you check.
   Entrywise addition and subtraction, scalar multiplication, the zero matrix, and the
   shape errors NumPy raises when the rule is broken.

3. **`notebooks/03-matrix-multiplication.ipynb`** — The rows-times-columns rule by hand,
   then `@`. Shape compatibility, `@` versus `*`, the identity matrix, non-commutativity,
   and a matrix applied to a column vector read as a transformation.

4. **`notebooks/04-transpose-submatrix-properties.ipynb`** — Transpose and its five
   identities verified numerically, why `(A @ B).T` flips the order, symmetric matrices and
   the two constructions that always produce one, and pulling submatrices out of a larger
   grid by deleting a row and a column or by slicing a block.

---

## Self-Assessment

When you finish, you should be able to answer all five questions in **Check yourself** at
the bottom of this GUIDE without looking anything up. If two or more give you trouble,
replay the matching notebook before starting `00-prereqs`.

A short list of what "ready" looks like:

- You reach for `.shape` before you reach for an operator
- You can multiply a 2-by-2 matrix and a 2-by-1 column vector on paper, correctly, first try
- You never type `*` when you mean `@`, and you can say what the wrong one would have computed
- You can state the shape rule for multiplication without hedging
- You write `(A @ B).T` as `B.T @ A.T` automatically, and you know why the order flips
- You can build a symmetric matrix from any square matrix in one line

If those feel routine, move on to [00-prereqs](../00-prereqs/GUIDE.md).

---

## References

### Visual and intuition-first

- [3Blue1Brown — Essence of Linear Algebra](https://www.youtube.com/playlist?list=PLZHQObOWTQDPD3MizzM2xVFitgF8hE_ab) — Fifteen short episodes that make matrices feel like transformations rather than grids. Episodes 1-4 pair with notebooks 01 and 03.
- [Immersive Linear Algebra](https://immersivemath.com/ila/index.html) — A free book whose figures you can drag. Chapters 1-4 cover this module's ground.

### Practice and drill

- [Khan Academy — Systems of Equations](https://www.khanacademy.org/math/algebra/x2f8bb11595b61c86:systems-of-equations) — Elimination and substitution, with unlimited generated practice.
- [Khan Academy — Matrices](https://www.khanacademy.org/math/precalculus/x9e81a4f98389efdf:matrices) — Addition, multiplication, and the shape rules, paced for a first pass.

### Reference

- [MIT 18.06 Linear Algebra](https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/) — Gilbert Strang's lectures. Lectures 1-3 go well beyond this module; treat them as the next step, not a prerequisite.
- [NumPy: the absolute basics for beginners](https://numpy.org/doc/stable/user/absolute_beginners.html) — The official tour of arrays, shapes, and broadcasting.

---

## Check yourself

Five questions that tie the module together. Try each before revealing the hint or the
answer. After you reveal, rate how well you recalled it (Again / Hard / Good / Easy); those
ratings enter your spaced-repetition schedule so the skill comes back when you are about to
forget it.

```quiz
{
  "questions": [
    {
      "id": "linalg-quiz-solution-count",
      "q": "Two linear equations in two unknowns. How many solutions can the system have, and what does each case look like as a picture?",
      "hint": "Each equation is a straight line in the plane, and a solution is a point both lines pass through. Enumerate what two lines can do to each other — there are fewer possibilities than you might expect, and 'exactly two crossings' is not one of them.",
      "a": "Three cases only. One solution when the lines cross at a single point, no solution when they are parallel and never meet, and infinitely many when the two equations describe the same line."
    },
    {
      "id": "linalg-quiz-shape-rules",
      "q": "Given `A` of shape `(2, 3)` and `B` of shape `(3, 2)`: can you compute `A + B`? Can you compute `A @ B`? What shape does the legal one produce?",
      "hint": "The two operations have completely different rules. Addition works entry by entry, so it asks whether every entry has a partner in the same position. Multiplication walks rows against columns, so it only asks whether the inner dimensions agree.",
      "a": "`A + B` is undefined — addition requires identical shapes, and `(2, 3)` is not `(3, 2)`. `A @ B` is legal because the inner 3s agree, and it produces shape `(2, 2)`."
    },
    {
      "id": "linalg-quiz-matmul-vs-star",
      "q": "In NumPy, what do `A @ B` and `A * B` each compute, and why is mistaking one for the other such a dangerous bug?",
      "hint": "One of these follows the rows-times-columns rule of linear algebra; the other pairs entries position by position. Now ask what happens when both matrices are square and both operations are therefore legal.",
      "a": "`@` is matrix multiplication (row i of A walked against column j of B, summed); `*` is elementwise multiplication. For square matrices both succeed and generally return different numbers, so the mistake produces wrong answers silently instead of raising an error."
    },
    {
      "id": "linalg-quiz-transpose-of-product",
      "q": "Expand `(A @ B).T` in terms of `A.T` and `B.T`, and explain why the answer is not `A.T @ B.T`.",
      "hint": "Track the shapes. If A is `(m, n)` and B is `(n, p)`, then `A @ B` is `(m, p)` and its transpose is `(p, m)`. Now check which of the two candidate products actually has shape `(p, m)`.",
      "a": "`(A @ B).T == B.T @ A.T` — the order flips. Shapes force it: `A.T` is `(n, m)` and `B.T` is `(p, n)`, so `A.T @ B.T` does not even line up, while `B.T @ A.T` is `(p, n)` times `(n, m)`, giving the required `(p, m)`."
    },
    {
      "id": "linalg-quiz-symmetric-construction",
      "q": "What makes a matrix symmetric, and how would you produce one from the arbitrary square matrix `M = [[4, 1, 7], [2, 9, 0], [5, 3, 6]]`?",
      "hint": "The definition is an equation relating the matrix to its own transpose. For the construction, think about what averaging a matrix with its transpose does to the entry in row i column j versus the entry in row j column i.",
      "a": "A matrix is symmetric when `A == A.T`, so entry (i, j) always equals entry (j, i). Averaging any square matrix with its transpose gives one: `S = (M + M.T) / 2` satisfies `S == S.T` for every square `M`."
    }
  ]
}
```
