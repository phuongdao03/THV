from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.modules.auth.session_service import AuthPrincipal
from app.modules.historical_nominations.errors import (
    HistoricalNominationForbiddenError,
    HistoricalNominationStateError,
)
from app.modules.historical_nominations.import_service import _require_manager
from app.modules.historical_nominations.service import (
    _assert_expected_version,
)
from app.modules.historical_nominations.service import (
    _require_manager as _require_record_manager,
)


def test_expected_version_accepts_equivalent_naive_utc_and_rejects_stale_time() -> None:
    updated_at = datetime(2026, 11, 14, 12, 30, tzinfo=UTC)
    record = SimpleNamespace(updated_at=updated_at)

    _assert_expected_version(record, updated_at.replace(tzinfo=None))

    with pytest.raises(HistoricalNominationStateError):
        _assert_expected_version(record, updated_at - timedelta(seconds=1))


def test_data_manager_can_manage_legacy_records_but_cannot_import() -> None:
    principal = AuthPrincipal(
        user_id=uuid4(),
        session_id=uuid4(),
        email="manager@example.test",
        roles=("DATA_MANAGER",),
    )

    with pytest.raises(HistoricalNominationForbiddenError):
        _require_record_manager(principal, "historical.records.read")
    with pytest.raises(HistoricalNominationForbiddenError):
        _require_manager(principal)

    authorized = AuthPrincipal(
        user_id=principal.user_id,
        session_id=principal.session_id,
        email=principal.email,
        roles=principal.roles,
        permissions=(
            "historical.records.read",
            "historical.records.manage",
            "historical.records.submit",
            "historical.documents.manage",
        ),
    )
    _require_record_manager(authorized, "historical.records.read")
    _require_record_manager(authorized, "historical.records.manage")
    _require_record_manager(authorized, "historical.records.submit")
    with pytest.raises(HistoricalNominationForbiddenError):
        _require_manager(authorized)

    permission_only = AuthPrincipal(
        user_id=principal.user_id,
        session_id=principal.session_id,
        email=principal.email,
        roles=("USER",),
        permissions=("historical.records.read",),
    )
    with pytest.raises(HistoricalNominationForbiddenError):
        _require_record_manager(permission_only, "historical.records.read")
