from typing import Annotated

from fastapi import Depends

from app.modules.auth.dependencies import SessionDependency
from app.modules.historical_nominations.import_service import HistoricalImportService
from app.modules.historical_nominations.service import HistoricalNominationService


def get_historical_nomination_service(
    session: SessionDependency,
) -> HistoricalNominationService:
    return HistoricalNominationService(session)


def get_historical_import_service(
    session: SessionDependency,
) -> HistoricalImportService:
    return HistoricalImportService(session)


HistoricalNominationServiceDependency = Annotated[
    HistoricalNominationService,
    Depends(get_historical_nomination_service),
]
HistoricalImportServiceDependency = Annotated[
    HistoricalImportService,
    Depends(get_historical_import_service),
]
