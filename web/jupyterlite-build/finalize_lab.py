"""Finalize the emitted JupyterLite output: lock it same-origin, and brand it.

Two jobs, both post-processing what ``jupyter lite build`` just wrote into
``../public/lab``, and both ASSERTED at the end so a jupyterlite (or Pyodide)
bump cannot silently revert them.

1. Same-origin lock
   PyodideAddon — driven by the well-known ``static/pyodide`` staged in build.sh
   step 1c — should have rewritten the kernel's ``pyodideUrl`` to
   ``./static/pyodide/pyodide.js``. Assert that (no jsdelivr left), then set
   ``disablePyPIFallback`` so piplite never reaches pypi.org: comm and every boot
   package now resolve from the same-origin index/distribution.

2. Branding + theme ground
   The lab is the platform's headline surface and shipped with none of the
   site's identity: the tab read "JupyterLite", carried JupyterLite's own
   favicon, and painted ``#fff`` before the kernel booted — so a learner on the
   site's dark default clicked "Run in browser" and got a full-screen white
   flash from a tab they could not identify by icon. We set ``appName`` and
   ``faviconUrl`` on every emitted config, stage the site's own favicon beside
   them, and rewrite the pre-boot ``<title>``/body ground in the emitted app
   HTML so the dark ground is painted on the FIRST frame rather than after
   JupyterLab's theme manager runs.

   The theme itself is set by ``overrides.json`` (jupyterlite-core's
   SettingsAddon copies it into the output and merges it into
   ``jupyter-lite.json`` as ``settingsOverrides``); this module only asserts it
   landed, since a settings override that silently stops applying looks exactly
   like a working build.

   Honest scoping note: JupyterLab has no hook for following ANOTHER app's
   theme. Its ``adaptive-theme`` follows the OS, which is not what the site does
   (next-themes with ``defaultTheme="dark"`` renders dark regardless of OS), and
   true sync would mean shipping a custom theme extension — new scope. So the
   lab takes a fixed dark default matching the site's ground, and a learner who
   prefers light can still switch it in Settings, which persists.

Usage::

    python finalize_lab.py [<lab-output-dir>]
"""

from __future__ import annotations

import json
import re
import shutil
import sys
from pathlib import Path

KERNEL_PLUGIN = "@jupyterlite/pyodide-kernel-extension:kernel"
THEMES_PLUGIN = "@jupyterlab/apputils-extension:themes"

DEFAULT_OUT = Path("../public/lab")
SITE_TS = Path("../src/lib/site.ts")
SITE_FAVICON = Path("../src/app/favicon.ico")

#: Staged beside the emitted configs. An ABSOLUTE url is required: config-utils.js
#: resolves a "./"-prefixed *Url against the config's OWN directory, and the per-app
#: configs (edit/, consoles/, notebooks/) live at different depths.
BRAND_FAVICON_NAME = "brand-favicon.ico"
BRAND_FAVICON_URL = "/lab/brand-favicon.ico"

#: Must match overrides.json. JupyterLab Dark is the built-in theme; the site's
#: ground is dark by default (web/src/app/layout.tsx ThemeProvider defaultTheme).
EXPECTED_THEME = "JupyterLab Dark"

#: The pre-boot ground the emitted app HTML paints before JupyterLab's theme
#: manager adds jp-mod-dark. #111 is what JupyterLab Dark itself settles on, so
#: there is no second flash when the theme lands.
BOOT_BG = "#111"
BOOT_FG = "#fff"

_LIGHT_BODY_RE = re.compile(r"(body\s*\{\s*)background-color:\s*#fff;(\s*)color:\s*#000;(\s*\})")
_TITLE_RE = re.compile(r"<title>JupyterLite</title>")
_BODY_TAG_RE = re.compile(r'(<body class="jp-ThemedContainer)(")')


def site_name(site_ts: Path = SITE_TS) -> str:
    """Read SITE_NAME from web/src/lib/site.ts so the lab cannot drift from the site.

    Same idiom build.sh uses for PYODIDE_VERSION: parse the one declaration
    rather than keeping a second copy of the string here.
    """
    match = re.search(r'SITE_NAME\s*=\s*"([^"]+)"', site_ts.read_text(encoding="utf-8"))
    if not match:
        raise SystemExit(f"  ERROR: could not parse SITE_NAME from {site_ts}")
    return match.group(1)


def lite_configs(out: Path) -> list[Path]:
    return sorted(out.rglob("jupyter-lite.json"))


def _settings(data: dict) -> dict:
    return data.get("jupyter-config-data", data)


def lock_and_brand_configs(out: Path, app_name: str) -> int:
    """Assert same-origin pyodideUrl, set disablePyPIFallback, and brand every config.

    Returns the number of configs that carried the pyodide kernel settings.
    """
    kernel_configs = 0
    for cfg in lite_configs(out):
        data = json.loads(cfg.read_text(encoding="utf-8"))
        settings = _settings(data)

        kernel = settings.get("litePluginSettings", {}).get(KERNEL_PLUGIN)
        if isinstance(kernel, dict):
            url = kernel.get("pyodideUrl", "")
            if "jsdelivr" in url or not url.startswith("./") or "pyodide.js" not in url:
                raise SystemExit(f"  ERROR: {cfg} pyodideUrl is not same-origin: {url!r}")
            kernel_configs += 1
            kernel["disablePyPIFallback"] = True
            print(f"  {cfg.relative_to(out)}: pyodideUrl={url} disablePyPIFallback=True")

        settings["appName"] = app_name
        settings["faviconUrl"] = BRAND_FAVICON_URL
        cfg.write_text(json.dumps(data, indent=1) + "\n", encoding="utf-8")
    return kernel_configs


def stage_brand_favicon(out: Path, source: Path = SITE_FAVICON) -> Path:
    """Copy the site's own favicon into the lab output (the tab-identity fix)."""
    if not source.exists():
        raise SystemExit(f"  ERROR: site favicon missing at {source}")
    dest = out / BRAND_FAVICON_NAME
    shutil.copyfile(source, dest)
    return dest


def brand_app_html(out: Path, title: str) -> int:
    """Rewrite the pre-boot title and light ground in every emitted app index.html.

    Returns the number of files changed. These are the frames a learner sees
    while 31 MB of Pyodide loads, long before any JupyterLab setting applies.
    """
    changed = 0
    for html_path in sorted(out.glob("*/index.html")):
        original = html_path.read_text(encoding="utf-8")
        patched = _TITLE_RE.sub(f"<title>{title}</title>", original)
        patched = _LIGHT_BODY_RE.sub(
            rf"\1background-color: {BOOT_BG};\2color: {BOOT_FG};\3", patched
        )
        patched = _BODY_TAG_RE.sub(r"\1 jp-mod-dark\2", patched)
        if patched != original:
            html_path.write_text(patched, encoding="utf-8")
            changed += 1
    return changed


def assert_branding(out: Path, app_name: str, title: str) -> None:
    """Fail the build if any piece of the branding/theme wiring did not land."""
    if not (out / BRAND_FAVICON_NAME).is_file():
        raise SystemExit(f"  ERROR: {BRAND_FAVICON_NAME} was not staged into {out}")

    for cfg in lite_configs(out):
        settings = _settings(json.loads(cfg.read_text(encoding="utf-8")))
        if settings.get("appName") != app_name:
            raise SystemExit(f"  ERROR: {cfg} appName is {settings.get('appName')!r}")
        if settings.get("faviconUrl") != BRAND_FAVICON_URL:
            raise SystemExit(f"  ERROR: {cfg} faviconUrl is {settings.get('faviconUrl')!r}")

    # The theme arrives via overrides.json -> SettingsAddon -> settingsOverrides on
    # the ROOT config; config-utils.js merges it down into every app.
    root = _settings(json.loads((out / "jupyter-lite.json").read_text(encoding="utf-8")))
    theme = root.get("settingsOverrides", {}).get(THEMES_PLUGIN, {}).get("theme")
    if theme != EXPECTED_THEME:
        raise SystemExit(
            f"  ERROR: settingsOverrides[{THEMES_PLUGIN}].theme is {theme!r}, "
            f"expected {EXPECTED_THEME!r} — is overrides.json still being applied?"
        )

    lab_html = (out / "lab" / "index.html").read_text(encoding="utf-8")
    if f"<title>{title}</title>" not in lab_html:
        raise SystemExit("  ERROR: lab/index.html still carries the stock <title>")
    if "background-color: #fff;" in lab_html:
        raise SystemExit("  ERROR: lab/index.html still paints a white pre-boot ground")


def main(argv: list[str]) -> int:
    out = Path(argv[0]) if argv else DEFAULT_OUT
    app_name = f"{site_name()} Lab"

    kernel_configs = lock_and_brand_configs(out, app_name)
    if not kernel_configs:
        raise SystemExit(
            "  ERROR: no emitted jupyter-lite.json carried the pyodide kernel "
            "settings — the self-hosted Pyodide was not wired in"
        )
    print(f"  locked {kernel_configs} lab config(s) to same-origin")

    stage_brand_favicon(out)
    changed = brand_app_html(out, app_name)
    print(f"  branded as {app_name!r} ({changed} app page(s), favicon, {EXPECTED_THEME})")

    assert_branding(out, app_name, app_name)
    print("  OK: branding + theme override verified in the emitted output")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
