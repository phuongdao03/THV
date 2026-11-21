import re

USERNAME_PATTERN = re.compile(r"[a-z0-9]+(?:_[a-z0-9]+)*")
GENERATED_USERNAME = re.compile(r"member-[0-9a-f]{32}")
RESERVED_USERNAMES = frozenset(
    {
        "admin",
        "administrator",
        "root",
        "system",
        "support",
        "moderator",
        "reviewer",
        "official",
        "staff",
        "tinhhoaviet",
        "banbientap",
        "help",
        "security",
        "me",
        "posts",
        "bookmarks",
        "followers",
        "following",
        "directory",
    }
)


def public_username(value: str) -> str | None:
    name = value.lower()
    if not value.isascii() or not 3 <= len(name) <= 24:
        return None
    if USERNAME_PATTERN.fullmatch(name) is None:
        return None
    if name == "me" or re.sub(r"[_0-9]", "", name) in RESERVED_USERNAMES - {"me"}:
        return None
    return name
