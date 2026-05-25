"""Quantum Machine Learning utilities — classifiers, feature maps, and training."""

from lib.ml.classifiers import (
    build_vqc_circuit as build_vqc_circuit,
    quantum_kernel as quantum_kernel,
    vqc_qnode as vqc_qnode,
)
from lib.ml.feature_maps import (
    angle_encoding as angle_encoding,
    amplitude_encoding as amplitude_encoding,
    iqp_encoding as iqp_encoding,
)
from lib.ml.training import train_vqc as train_vqc
