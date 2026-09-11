"""Contrato de migraciones Alembic.

`alembic_version.version_num` es `varchar(32)`: un `revision` más largo hace
fallar `alembic upgrade head` con StringDataRightTruncation. Este test lo evita.
"""

from __future__ import annotations

import re
from pathlib import Path

VERSIONS_DIR = Path(__file__).resolve().parents[1] / "alembic" / "versions"
MAX_REVISION_LEN = 32

_REVISION_RE = re.compile(r'^revision:\s*str\s*=\s*"([^"]+)"', re.MULTILINE)
_DOWN_REVISION_RE = re.compile(
    r"^down_revision:\s*Union\[str,\s*None\]\s*=\s*(.+)$", re.MULTILINE
)


def _revision_ids() -> dict[str, str | None]:
    rows: dict[str, str | None] = {}
    for path in sorted(VERSIONS_DIR.glob("*.py")):
        text = path.read_text(encoding="utf-8")
        match = _REVISION_RE.search(text)
        assert match, f"Sin 'revision' en {path.name}"
        down_match = _DOWN_REVISION_RE.search(text)
        down_raw = down_match.group(1).strip() if down_match else "None"
        down = None if down_raw == "None" else down_raw.strip('"')
        rows[match.group(1)] = down
    return rows


def test_revision_ids_fit_alembic_version_column():
    rows = _revision_ids()
    too_long = {rev: len(rev) for rev in rows if len(rev) > MAX_REVISION_LEN}
    assert not too_long, (
        f"revision ids > {MAX_REVISION_LEN} caracteres (columna alembic_version): {too_long}"
    )


def test_revision_chain_references_exist():
    rows = _revision_ids()
    missing = {
        rev: down for rev, down in rows.items() if down is not None and down not in rows
    }
    assert not missing, f"down_revision apunta a migraciones inexistentes: {missing}"


def test_single_head():
    rows = _revision_ids()
    referenced = {down for down in rows.values() if down is not None}
    heads = [rev for rev in rows if rev not in referenced]
    assert len(heads) == 1, f"Se esperaba una sola cabeza, hay: {heads}"
