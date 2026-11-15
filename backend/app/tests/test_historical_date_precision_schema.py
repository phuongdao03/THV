from app.modules.historical_nominations.schemas import (
    HistoricalAwardWrite,
    HistoricalNominationWrite,
)


def test_historical_records_can_keep_unknown_days_empty() -> None:
    nomination = HistoricalNominationWrite(nomination_year=2020)
    award = HistoricalAwardWrite(award_name="Bằng xác lập cũ")

    assert nomination.nomination_year == 2020
    assert nomination.nominated_at is None
    assert award.issued_at is None
