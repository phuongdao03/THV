from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi.testclient import TestClient

from app.main import create_application
from app.modules.auth.dependencies import (
    get_csrf_protected_principal,
    get_current_principal,
)
from app.modules.auth.session_service import AuthPrincipal
from app.modules.historical_nominations.dependencies import (
    get_historical_nomination_service,
)
from app.modules.historical_nominations.models import (
    HistoricalArchiveStatus,
    HistoricalNomination,
    HistoricalNominationPublicationStatus,
    HistoricalNominationStatus,
    HistoricalRelatedPerson,
    HistoricalRelatedPersonRole,
    HistoricalSourceKind,
    HistoricalSubjectType,
)
from app.modules.historical_nominations.schemas import (
    HistoricalAccountLinkWrite,
    HistoricalLinkableAccountData,
    HistoricalLinkedRecordData,
)


class StubHistoricalNominationService:
    def __init__(self) -> None:
        now = datetime.now(UTC)
        self.record = HistoricalNomination(
            id=uuid4(),
            code=f"THV-LS-{now.year}-0000000000000001",
            subject_type=HistoricalSubjectType.PERSON,
            subject_name=None,
            title="Hồ sơ chưa đặt tên",
            source_kind=HistoricalSourceKind.OTHER,
            verification_status=HistoricalNominationStatus.DRAFT,
            archive_status=HistoricalArchiveStatus.ACTIVE,
            publication_status=HistoricalNominationPublicationStatus.PRIVATE,
            missing_fields_json=[],
            created_at=now,
            updated_at=now,
            created_by_user_id=uuid4(),
        )
        self.creation_request_id: UUID | None = None
        self.deleted: tuple[UUID, datetime] | None = None
        self.linked: HistoricalAccountLinkWrite | None = None

    async def find_linkable_account(
        self, _principal: AuthPrincipal, email: str
    ) -> HistoricalLinkableAccountData:
        return HistoricalLinkableAccountData(
            id=self.record.created_by_user_id, email=email
        )

    async def list_linked_records(
        self, _principal: AuthPrincipal, *, page: int, page_size: int
    ) -> tuple[list[HistoricalLinkedRecordData], int]:
        return [
            HistoricalLinkedRecordData(
                id=self.record.id,
                code=self.record.code,
                title=self.record.title,
                subject_name=None,
                nomination_year=None,
                awards=[],
            )
        ], 1

    async def link_account(
        self,
        _principal: AuthPrincipal,
        record_id: UUID,
        person_id: UUID,
        payload: HistoricalAccountLinkWrite,
    ) -> tuple[HistoricalRelatedPerson, HistoricalRelatedPersonRole]:
        self.linked = payload
        return HistoricalRelatedPerson(
            id=person_id,
            display_name="Người nhận",
            linked_user_id=payload.user_id,
            created_by_user_id=self.record.created_by_user_id,
        ), HistoricalRelatedPersonRole.NOMINEE

    async def create_record(
        self,
        _principal: AuthPrincipal,
        _payload: object,
        *,
        creation_request_id: UUID | None = None,
    ) -> HistoricalNomination:
        self.creation_request_id = creation_request_id
        return self.record

    async def delete_draft(
        self,
        _principal: AuthPrincipal,
        record_id: UUID,
        *,
        expected_updated_at: datetime,
    ) -> None:
        self.deleted = (record_id, expected_updated_at)


def _principal() -> AuthPrincipal:
    return AuthPrincipal(
        user_id=uuid4(),
        session_id=uuid4(),
        email="data-manager@example.test",
        roles=("DATA_MANAGER",),
    )


def test_data_manager_create_idempotency_header_and_draft_delete_api() -> None:
    service = StubHistoricalNominationService()
    app = create_application()
    app.dependency_overrides[get_historical_nomination_service] = lambda: service
    app.dependency_overrides[get_csrf_protected_principal] = _principal
    try:
        with TestClient(app) as client:
            creation_key = uuid4()
            created = client.post(
                "/api/v1/historical-nominations",
                headers={"Idempotency-Key": str(creation_key)},
                json={},
            )
            assert created.status_code == 201
            assert created.json()["data"]["code"].startswith("THV-LS-")
            assert service.creation_request_id == creation_key

            saved_at = service.record.updated_at
            deleted = client.request(
                "DELETE",
                f"/api/v1/historical-nominations/{service.record.id}",
                json={"expectedUpdatedAt": saved_at.isoformat()},
            )
            assert deleted.status_code == 200
            assert deleted.json()["data"] == {"deleted": True}
            assert service.deleted == (service.record.id, saved_at)
    finally:
        app.dependency_overrides.clear()


def test_staff_account_link_and_recipient_projection_api_contract() -> None:
    service = StubHistoricalNominationService()
    app = create_application()
    app.dependency_overrides[get_historical_nomination_service] = lambda: service
    app.dependency_overrides[get_current_principal] = _principal
    app.dependency_overrides[get_csrf_protected_principal] = _principal
    try:
        with TestClient(app) as client:
            account = client.get(
                "/api/v1/historical-nominations/linkable-account",
                params={"email": "recipient@example.test"},
            )
            assert account.status_code == 200
            assert set(account.json()["data"]) == {"id", "email"}
            url = (
                f"/api/v1/historical-nominations/{service.record.id}"
                f"/people/{uuid4()}/account"
            )
            user_id = str(service.record.created_by_user_id)
            invalid = client.put(url, json={"userId": user_id, "reason": " " * 20})
            assert invalid.status_code == 422 and service.linked is None
            linked = client.put(
                url, json={"userId": user_id, "reason": "Đã đối chiếu người nhận"}
            )
            assert linked.status_code == 200
            assert linked.json()["data"]["linkedUserId"] == user_id
            mine = client.get("/api/v1/historical-nominations/mine")
            assert mine.status_code == 200
            assert mine.json()["meta"]["total"] == 1
            assert set(mine.json()["data"][0]) == {
                "id",
                "code",
                "title",
                "subjectName",
                "nominationYear",
                "awards",
            }
    finally:
        app.dependency_overrides.clear()
