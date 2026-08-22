import importlib.util
import sys
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "check_release.py"
SPEC = importlib.util.spec_from_file_location("open_niulai_release", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def test_release_structure_and_links_are_valid():
    assert MODULE.check() == []
