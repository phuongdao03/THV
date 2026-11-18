from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import bindparam, text
from sqlalchemy.ext.asyncio import AsyncConnection

_MEDIA_REFERENCES_SQL = text(
    """
    SELECT source_namespace.nspname AS schema_name,
           source_table.relname AS table_name,
           source_column.attname AS column_name
    FROM pg_constraint AS foreign_key
    JOIN pg_class AS source_table
      ON source_table.oid = foreign_key.conrelid
    JOIN pg_namespace AS source_namespace
      ON source_namespace.oid = source_table.relnamespace
    JOIN pg_attribute AS source_column
      ON source_column.attrelid = foreign_key.conrelid
     AND source_column.attnum = foreign_key.conkey[1]
    JOIN pg_attribute AS target_column
      ON target_column.attrelid = foreign_key.confrelid
     AND target_column.attnum = foreign_key.confkey[1]
    WHERE foreign_key.contype = 'f'
      AND foreign_key.confrelid = 'public.media_assets'::regclass
      AND array_length(foreign_key.conkey, 1) = 1
      AND array_length(foreign_key.confkey, 1) = 1
      AND target_column.attname = 'id'
    """
)


@dataclass(frozen=True, slots=True)
class MediaReference:
    schema_name: str
    table_name: str
    column_name: str


async def reference_columns(connection: AsyncConnection) -> tuple[MediaReference, ...]:
    rows = (await connection.execute(_MEDIA_REFERENCES_SQL)).all()
    return tuple(MediaReference(str(row[0]), str(row[1]), str(row[2])) for row in rows)


async def referenced_media_ids(
    connection: AsyncConnection,
    media_ids: tuple[UUID, ...],
    references: tuple[MediaReference, ...],
) -> set[UUID]:
    if not media_ids:
        return set()

    preparer = connection.dialect.identifier_preparer
    referenced: set[UUID] = set()
    for reference in references:
        table_name = ".".join(
            preparer.quote(name)
            for name in (reference.schema_name, reference.table_name)
        )
        column_name = preparer.quote(reference.column_name)
        statement = text(
            f"SELECT DISTINCT {column_name} FROM {table_name} "
            f"WHERE {column_name} IN :media_ids"
        ).bindparams(bindparam("media_ids", expanding=True))
        rows = await connection.execute(statement, {"media_ids": media_ids})
        referenced.update(row[0] for row in rows if row[0] is not None)
    return referenced
