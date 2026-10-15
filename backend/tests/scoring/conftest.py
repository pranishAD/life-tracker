"""Make the repo root importable so tests can `import backend.scoring...`
regardless of how/where pytest is invoked from, without relying on any
project-wide pytest config (backend/ and backend/scoring/ use Python 3.12
implicit namespace packages, so no __init__.py is required there either).
"""

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
