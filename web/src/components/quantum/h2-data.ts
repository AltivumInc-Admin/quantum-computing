import raw from "./__fixtures__/h2_dissociation.json";
import { loadH2Curve, type H2Curve } from "./chemistry";

/**
 * Single parsed instance of the committed H2 dissociation fixture (real PennyLane
 * differentiable Hartree-Fock data, STO-3G). The qham/qvqe/qpes widgets all import
 * this so they read identical numbers and can never disagree. See
 * scripts/gen_h2_fixture.py for provenance.
 */
export const H2: H2Curve = loadH2Curve(raw);

/**
 * The fixture's bond-length domain and sampling pitch, derived once at module
 * load. Every widget in the cluster was re-deriving these from `H2.points` —
 * qham twice, plus a `useMemo` spent on a value computed purely from module
 * constants — so a new fixture-driven widget had to rediscover them again.
 * R_PITCH is the committed grid spacing: a slider stepping by it lands on real
 * samples instead of on interpolated points dressed up as data.
 */
export const R_MIN = H2.points[0].R;
export const R_MAX = H2.points[H2.points.length - 1].R;
export const R_PITCH =
  H2.points.length < 2
    ? 0.05
    : Math.round((H2.points[1].R - H2.points[0].R) * 1000) / 1000;
