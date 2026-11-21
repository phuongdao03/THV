from collections.abc import Mapping

from app.core.errors import DomainError
from app.modules.reviews.types import ReviewReadiness


class ReviewNotFoundError(DomainError):
    def __init__(self, message: str = "Review resource was not found.") -> None:
        super().__init__(
            code="REVIEW_NOT_FOUND",
            message=message,
            status_code=404,
        )


class ReviewForbiddenError(DomainError):
    def __init__(self) -> None:
        super().__init__(
            code="REVIEW_FORBIDDEN",
            message="Review access is forbidden.",
            status_code=403,
        )


class ReviewConflictError(DomainError):
    def __init__(
        self,
        message: str = "Review state conflicts with this action.",
    ) -> None:
        super().__init__(
            code="REVIEW_CONFLICT",
            message=message,
            status_code=409,
        )


class ReviewValidationError(DomainError):
    def __init__(
        self, message: str, *, details: Mapping[str, object] | None = None
    ) -> None:
        super().__init__(
            code="REVIEW_VALIDATION_ERROR",
            message=message,
            status_code=422,
            details=details,
        )


class ReviewIncompleteError(ReviewValidationError):
    def __init__(self, readiness: ReviewReadiness) -> None:
        self.readiness = readiness
        super().__init__(readiness.issues[0].message)
