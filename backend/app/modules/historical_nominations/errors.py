from app.core.errors import DomainError


class HistoricalNominationNotFoundError(DomainError):
    def __init__(self) -> None:
        super().__init__(
            code="HISTORICAL_NOMINATION_NOT_FOUND",
            message="Historical nomination was not found.",
            status_code=404,
        )


class HistoricalNominationForbiddenError(DomainError):
    def __init__(self) -> None:
        super().__init__(
            code="HISTORICAL_NOMINATION_FORBIDDEN",
            message="Historical nomination access is forbidden.",
            status_code=403,
        )


class HistoricalNominationStateError(DomainError):
    def __init__(
        self, message: str = "Historical nomination state is invalid."
    ) -> None:
        super().__init__(
            code="HISTORICAL_NOMINATION_STATE_INVALID",
            message=message,
            status_code=409,
        )


class HistoricalNominationValidationError(DomainError):
    def __init__(self, message: str) -> None:
        super().__init__(
            code="HISTORICAL_NOMINATION_VALIDATION_ERROR",
            message=message,
            status_code=422,
        )
