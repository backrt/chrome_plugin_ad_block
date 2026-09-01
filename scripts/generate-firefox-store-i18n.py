#!/usr/bin/env python3
"""Generate Firefox Add-ons (AMO) store assets for AI Ad Blocker (all locales)."""

from pathlib import Path
import runpy
import sys

sys.argv = [str(Path(__file__).with_name("generate-store-i18n.py")), "firefox"]
runpy.run_path(sys.argv[0], run_name="__main__")
