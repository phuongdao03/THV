DATA_MANAGER_ROLE_CODE = "DATA_MANAGER"
DATA_MANAGER_PERMISSION_CODES = frozenset(
    {
        "historical.records.read",
        "historical.records.manage",
        "historical.documents.manage",
        "public_content.works.manage",
        "certificate_content.edit",
        "certificate_archives.manage",
    }
)

SYSTEM_ROLE_CODES = frozenset(
    {
        "VIEWER",
        "USER",
        "MODERATOR",
        "SUPER_ADMIN",
        DATA_MANAGER_ROLE_CODE,
    }
)
VIEWER_REGISTRATION_ROLE = "VIEWER"
USER_REGISTRATION_ROLE = "USER"
