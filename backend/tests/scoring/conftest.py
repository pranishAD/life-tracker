"""Make backend/ importable so tests can `import scoring...`, the same way
app code does (`from scoring import ...`) and the same root the Docker
container uses (/app == backend/). Works regardless of the cwd pytest is
invoked from, without relying on any project-wide pytest config.
"""

import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))
