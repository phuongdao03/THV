from app.core.errors import DomainError


class CertificateArchiveForbiddenError(DomainError):
    def __init__(self) -> None:
        super().__init__(
            code="CERTIFICATE_ARCHIVE_FORBIDDEN",
            message="Certificate archive management is forbidden.",
            status_code=403,
        )


class CertificateArchiveNotFoundError(DomainError):
    def __init__(self) -> None:
        super().__init__(
            code="CERTIFICATE_ARCHIVE_NOT_FOUND",
            message="Certificate archive was not found.",
            status_code=404,
        )


class CertificateArchiveConflictError(DomainError):
    def __init__(self, message: str = "Certificate archive has changed.") -> None:
        super().__init__(
            code="CERTIFICATE_ARCHIVE_CONFLICT",
            message=message,
            status_code=409,
        )


class CertificateArchiveValidationError(DomainError):
    def __init__(self, message: str) -> None:
        super().__init__(
            code="CERTIFICATE_ARCHIVE_INVALID",
            message=message,
            status_code=422,
        )
