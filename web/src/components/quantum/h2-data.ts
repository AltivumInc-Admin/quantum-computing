import raw from "./__fixtures__/h2_dissociation.json";
import { loadH2Curve, type H2Curve } from "./chemistry";

/**
 * Single parsed instance of the committed H2 dissociation fixture (real PennyLane
 * differentiable Hartree-Fock data, STO-3G). The qham/qvqe/qpes widgets all import
 * this so they read identical numbers and can never disagree. See
 * scripts/gen_h2_fixture.py for provenance.
 */
export const H2: H2Curve = loadH2Curve(raw);
