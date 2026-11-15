"""Parse untrusted legacy-import workbooks into bounded, inert cell values."""

from __future__ import annotations

import csv
from dataclasses import dataclass
from datetime import date, datetime, time
from importlib import import_module
from io import BytesIO, StringIO
from zipfile import BadZipFile, ZipFile

MAX_IMPORT_BYTES = 20 * 1024 * 1024
MAX_IMPORT_ROWS = 10_000
MAX_IMPORT_COLUMNS = 100
MAX_CELL_LENGTH = 10_000
MAX_IMPORT_UNCOMPRESSED_BYTES = 100 * 1024 * 1024
MAX_IMPORT_ARCHIVE_ENTRIES = 1_000


class HistoricalImportParseError(ValueError):
    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


@dataclass(frozen=True, slots=True)
class ParsedImportTable:
    headers: tuple[str, ...]
    rows: tuple[tuple[str, ...], ...]


def parse_import_file(*, filename: str, content: bytes) -> ParsedImportTable:
    if len(content) > MAX_IMPORT_BYTES:
        raise HistoricalImportParseError("file_too_large")
    if not content:
        raise HistoricalImportParseError("empty_file")
    if filename.casefold().endswith(".csv"):
        return _parse_csv(content)
    if filename.casefold().endswith(".xlsx"):
        return _parse_xlsx(content)
    raise HistoricalImportParseError("unsupported_file_type")


def _parse_csv(content: bytes) -> ParsedImportTable:
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HistoricalImportParseError("invalid_encoding") from exc

    reader = csv.reader(StringIO(text, newline=""), strict=True)
    try:
        raw_headers = next(reader)
    except StopIteration as exc:
        raise HistoricalImportParseError("missing_header") from exc
    except csv.Error as exc:
        raise HistoricalImportParseError("malformed_file") from exc

    headers = tuple(_validate_cell(value) for value in raw_headers)
    if not headers or not any(headers):
        raise HistoricalImportParseError("missing_header")
    if any(not header for header in headers):
        raise HistoricalImportParseError("empty_header")
    if len(headers) > MAX_IMPORT_COLUMNS:
        raise HistoricalImportParseError("too_many_columns")
    if len({header.casefold() for header in headers}) != len(headers):
        raise HistoricalImportParseError("duplicate_header")

    rows: list[tuple[str, ...]] = []
    try:
        for raw_row in reader:
            if not any(value.strip() for value in raw_row):
                continue
            if len(rows) >= MAX_IMPORT_ROWS:
                raise HistoricalImportParseError("too_many_rows")
            if len(raw_row) > len(headers) and any(
                value.strip() for value in raw_row[len(headers) :]
            ):
                raise HistoricalImportParseError("row_width_mismatch")
            if len(raw_row) > len(headers):
                raw_row = raw_row[: len(headers)]
            padded = raw_row + [""] * (len(headers) - len(raw_row))
            rows.append(tuple(_validate_cell(value) for value in padded))
    except csv.Error as exc:
        raise HistoricalImportParseError("malformed_file") from exc

    if not rows:
        raise HistoricalImportParseError("no_data_rows")
    return ParsedImportTable(headers=headers, rows=tuple(rows))


def _validate_cell(value: str) -> str:
    normalized = value.strip()
    if len(normalized) > MAX_CELL_LENGTH:
        raise HistoricalImportParseError("cell_too_large")
    if any(ord(character) < 32 and character not in "\t\r\n" for character in value):
        raise HistoricalImportParseError("control_character")
    formula_probe = normalized.lstrip("\t\r\n")
    if formula_probe.startswith(("=", "@")) or (
        formula_probe.startswith(("+", "-"))
        and len(formula_probe) > 1
        and not formula_probe[1].isdigit()
    ):
        raise HistoricalImportParseError("formula_cell")
    return normalized


def _parse_xlsx(content: bytes) -> ParsedImportTable:
    try:
        with ZipFile(BytesIO(content)) as archive:
            members = archive.infolist()
            if len(members) > MAX_IMPORT_ARCHIVE_ENTRIES:
                raise HistoricalImportParseError("archive_too_complex")
            if sum(member.file_size for member in members) > (
                MAX_IMPORT_UNCOMPRESSED_BYTES
            ):
                raise HistoricalImportParseError("archive_too_large")
            if any(
                member.file_size > max(member.compress_size, 1) * 200
                for member in members
            ):
                raise HistoricalImportParseError("archive_compression_ratio")
            names = {member.filename for member in members}
            if "[Content_Types].xml" not in names or "xl/workbook.xml" not in names:
                raise HistoricalImportParseError("invalid_xlsx")
            if any(
                name.startswith("xl/externalLinks/") or name == "xl/vbaProject.bin"
                for name in names
            ):
                raise HistoricalImportParseError("unsupported_xlsx_feature")
    except BadZipFile as exc:
        raise HistoricalImportParseError("invalid_xlsx") from exc

    try:
        load_workbook = import_module("openpyxl").__dict__["load_workbook"]
        workbook = load_workbook(
            BytesIO(content),
            read_only=True,
            data_only=False,
            keep_links=False,
        )
    except ImportError as exc:
        raise HistoricalImportParseError("xlsx_parser_unavailable") from exc
    except (OSError, ValueError, BadZipFile) as exc:
        raise HistoricalImportParseError("invalid_xlsx") from exc

    try:
        worksheet = workbook.active
        if worksheet is None or worksheet.sheet_state != "visible":
            raise HistoricalImportParseError("missing_visible_sheet")
        if worksheet.max_row is None or worksheet.max_column is None:
            raise HistoricalImportParseError("invalid_xlsx_dimensions")
        if worksheet.max_row > MAX_IMPORT_ROWS + 1:
            raise HistoricalImportParseError("too_many_rows")
        if worksheet.max_column > MAX_IMPORT_COLUMNS:
            raise HistoricalImportParseError("too_many_columns")

        rows = worksheet.iter_rows(
            min_row=1,
            max_row=worksheet.max_row,
            max_col=worksheet.max_column,
            values_only=False,
        )
        try:
            header_cells = next(rows)
        except StopIteration as exc:
            raise HistoricalImportParseError("missing_header") from exc
        headers = tuple(_xlsx_cell_to_text(cell) for cell in header_cells)
        if not any(headers):
            raise HistoricalImportParseError("missing_header")
        if any(not header for header in headers):
            raise HistoricalImportParseError("empty_header")
        if len({header.casefold() for header in headers}) != len(headers):
            raise HistoricalImportParseError("duplicate_header")

        parsed_rows: list[tuple[str, ...]] = []
        for row in rows:
            values = tuple(_xlsx_cell_to_text(cell) for cell in row)
            if not any(values):
                continue
            if len(parsed_rows) >= MAX_IMPORT_ROWS:
                raise HistoricalImportParseError("too_many_rows")
            if len(values) > len(headers) and any(values[len(headers) :]):
                raise HistoricalImportParseError("row_width_mismatch")
            parsed_rows.append(
                values[: len(headers)] + ("",) * max(0, len(headers) - len(values))
            )
        if not parsed_rows:
            raise HistoricalImportParseError("no_data_rows")
        return ParsedImportTable(headers=headers, rows=tuple(parsed_rows))
    finally:
        workbook.close()


def _xlsx_cell_to_text(cell: object) -> str:
    if getattr(cell, "data_type", None) == "f":
        raise HistoricalImportParseError("formula_cell")
    value = getattr(cell, "value", None)
    if value is None:
        return ""
    if isinstance(value, datetime):
        if value.time() == time.min:
            return _validate_cell(value.date().isoformat())
        return _validate_cell(value.isoformat())
    if isinstance(value, (date, time)):
        return _validate_cell(value.isoformat())
    if isinstance(value, bool):
        return "true" if value else "false"
    return _validate_cell(str(value))
