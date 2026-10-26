"""Make cv-service modules importable (they use top-level imports like `api.*`)."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


class FakeSupabase:
    """In-memory stand-in for api.push_results.SupabaseRest."""

    def __init__(self, tables=None, fail=False):
        self.tables = {k: [dict(r) for r in v] for k, v in (tables or {}).items()}
        self.fail = fail
        self.inserts = []
        self.updates = []
        self.selects = []
        self._next = 1

    def _maybe_fail(self):
        if self.fail:
            from api.push_results import SupabaseError
            raise SupabaseError("HTTP 400: invalid input syntax for type uuid")

    def select(self, table, query):
        self.selects.append((table, query))
        self._maybe_fail()
        rows = self.tables.get(table, [])
        # honour simple eq.<value> filters so lookups behave like PostgREST
        for part in query.split("&"):
            if "=eq." in part:
                col, val = part.split("=eq.", 1)
                rows = [r for r in rows if str(r.get(col)) == val]
        return [dict(r) for r in rows]

    def insert(self, table, rows):
        self._maybe_fail()
        for row in rows if isinstance(rows, list) else [rows]:
            stored = {"id": f"id-{self._next}", "created_at": f"2026-01-01T00:00:{self._next:02d}Z", **row}
            self._next += 1
            self.tables.setdefault(table, []).append(stored)
            self.inserts.append((table, row))

    def update(self, table, query, values):
        self._maybe_fail()
        rid = query.split("id=eq.", 1)[1]
        for r in self.tables.get(table, []):
            if r["id"] == rid:
                r.update(values)
        self.updates.append((table, rid, values))
