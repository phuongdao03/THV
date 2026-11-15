from app.modules.historical_nominations.models import HistoricalNomination
from app.modules.historical_nominations.schemas import HistoricalNominationWrite


def test_historical_draft_can_start_without_business_fields() -> None:
    draft = HistoricalNominationWrite()

    assert draft.subject_name is None
    assert draft.title is None
    assert draft.category_id is None
    assert draft.nomination_year is None


def test_legacy_subject_name_is_optional_in_storage() -> None:
    assert HistoricalNomination.__table__.c.subject_name.nullable
