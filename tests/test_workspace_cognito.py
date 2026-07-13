"""The workspace Cognito template must keep federated sign-in spend-capable.

lambda/qpu/qpu-core.mjs authorizes real-hardware spend only when the ID token
carries email_verified=true. Cognito leaves mapped email addresses UNVERIFIED by
default, and a federated user has no in-Cognito verification flow to run - the
verification status must be mapped from the IdP's own claim (Google and most
OIDC providers send email_verified). An identity provider without that mapping
strands its users behind "Verify your email before running on real hardware"
with no way to act on it, so this test fails CI if any IdP in the template
drops the mapping.

Like test_qpu_devices.py, this asserts on the template source directly (the
test environment carries no YAML parser); the tiny indentation-aware scan below
is deliberately strict and fails loudly if the template's shape changes.
"""

import re
from pathlib import Path

TEMPLATE = Path(__file__).resolve().parent.parent / "infra" / "workspace" / "cognito.yaml"

IDP_TYPE = "AWS::Cognito::UserPoolIdentityProvider"


def _resource_blocks(text: str) -> dict[str, str]:
    """Map each logical resource name under the top-level Resources: section to
    its (still-indented) body text."""
    lines = text.splitlines()
    starts = [i for i, line in enumerate(lines) if line.rstrip() == "Resources:"]
    assert len(starts) == 1, "expected exactly one top-level Resources: section"
    blocks: dict[str, list[str]] = {}
    name = None
    for line in lines[starts[0] + 1 :]:
        if line.strip() and not line.startswith(" "):
            break  # next top-level section (e.g. Outputs:)
        m = re.match(r"^  (\w+):\s*$", line)
        if m:
            name = m.group(1)
            blocks[name] = []
        elif name is not None:
            blocks[name].append(line)
    return {k: "\n".join(v) for k, v in blocks.items()}


def _attribute_mapping(block: str) -> dict[str, str] | None:
    """The AttributeMapping of a resource block as {pool_attribute: idp_claim},
    or None when the resource declares no AttributeMapping."""
    mapping: dict[str, str] = {}
    map_indent = None
    found = False
    for line in block.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        indent = len(line) - len(line.lstrip())
        if stripped == "AttributeMapping:":
            found = True
            map_indent = indent
            continue
        if map_indent is not None:
            if indent <= map_indent:
                map_indent = None  # dedent: the mapping block ended
                continue
            m = re.match(r"^(\w+):\s*(\S+)$", stripped)
            if m:
                mapping[m.group(1)] = m.group(2)
    return mapping if found else None


def _identity_providers() -> dict[str, str]:
    blocks = _resource_blocks(TEMPLATE.read_text())
    return {name: b for name, b in blocks.items() if f"Type: {IDP_TYPE}" in b}


def test_template_declares_the_google_idp():
    assert "GoogleIdP" in _identity_providers(), "cognito.yaml lost its Google identity provider"


def test_every_idp_attribute_mapping_maps_email_verified():
    """Every IdP must map email_verified: the pool feeds an email_verified authz
    gate (the QPU spend entitlement), and an unmapped IdP leaves the claim
    forever false for its users."""
    idps = _identity_providers()
    assert idps, "expected at least one identity provider in cognito.yaml"
    for name, block in idps.items():
        mapping = _attribute_mapping(block)
        assert mapping, f"{name} has no AttributeMapping"
        assert "email_verified" in mapping, (
            f"{name} does not map email_verified - its users can never pass the "
            "qpu-core.mjs email_verified spend gate"
        )


def test_google_idp_maps_email_and_email_verified_from_googles_claims():
    mapping = _attribute_mapping(_identity_providers()["GoogleIdP"])
    assert mapping is not None
    # AttributeMapping keys are user-pool attributes, values the IdP's claims.
    assert mapping["email"] == "email"
    assert mapping["email_verified"] == "email_verified"
