#!/usr/bin/env python3
"""Generate Edge Add-ons store assets for AI Ad Blocker (all locales)."""

from pathlib import Path
import runpy
import sys

sys.argv = [str(Path(__file__).with_name("generate-store-i18n.py")), "edge"]
runpy.run_path(sys.argv[0], run_name="__main__")
