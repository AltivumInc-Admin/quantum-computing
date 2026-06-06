"""Classical optimizer wrappers for variational quantum algorithms."""

import numpy as np
from scipy.optimize import minimize


def optimize_cobyla(
    cost_fn, initial_params: np.ndarray, maxiter: int = 200, rhobeg: float = 0.5, callback=None
) -> dict:
    """Optimize using COBYLA (gradient-free).

    Args:
        cost_fn: Function mapping params -> scalar cost.
        initial_params: Starting parameter values.
        maxiter: Maximum iterations.
        rhobeg: Initial step size.
        callback: Optional function called each iteration with (params, cost).

    Returns:
        Dict with keys: optimal_params, optimal_cost, n_evals, history.
    """
    history = []

    def tracked_cost(params):
        cost = cost_fn(params)
        history.append({"params": params.copy(), "cost": cost})
        if callback:
            callback(params, cost)
        return cost

    result = minimize(
        tracked_cost,
        initial_params,
        method="COBYLA",
        options={"maxiter": maxiter, "rhobeg": rhobeg},
    )

    return {
        "optimal_params": result.x,
        "optimal_cost": result.fun,
        "n_evals": result.nfev,
        "history": history,
        "success": result.success,
    }


def optimize_spsa(
    cost_fn,
    initial_params: np.ndarray,
    maxiter: int = 200,
    a: float = 0.1,
    c: float = 0.1,
    callback=None,
) -> dict:
    """Optimize using SPSA (stochastic gradient approximation).

    Only 2 function evaluations per iteration regardless of parameter count.
    Good for noisy cost landscapes.

    Args:
        cost_fn: Function mapping params -> scalar cost.
        initial_params: Starting parameter values.
        maxiter: Maximum iterations.
        a: Step size parameter.
        c: Perturbation size parameter.
        callback: Optional function called each iteration.

    Returns:
        Dict with keys: optimal_params, optimal_cost, n_evals, history.
    """
    params = initial_params.copy()
    history = []
    n_evals = 0

    for k in range(1, maxiter + 1):
        ak = a / (k**0.602)
        ck = c / (k**0.101)

        delta = np.random.choice([-1, 1], size=len(params))
        params_plus = params + ck * delta
        params_minus = params - ck * delta

        cost_plus = cost_fn(params_plus)
        cost_minus = cost_fn(params_minus)
        n_evals += 2

        gradient_estimate = (cost_plus - cost_minus) / (2 * ck * delta)
        params = params - ak * gradient_estimate

        current_cost = (cost_plus + cost_minus) / 2
        history.append({"params": params.copy(), "cost": current_cost})
        if callback:
            callback(params, current_cost)

    final_cost = cost_fn(params)
    n_evals += 1

    return {
        "optimal_params": params,
        "optimal_cost": final_cost,
        "n_evals": n_evals,
        "history": history,
        "success": True,
    }
