from datetime import date
from io import BytesIO

import pytest
from openpyxl import Workbook

from app.modules.historical_nominations.import_parser import (
    HistoricalImportParseError,
    ParsedImportTable,
    parse_import_file,
)


def test_parse_csv_preserves_unicode_and_pads_trailing_empty_cells() -> None:
    parsed = parse_import_file(
        filename="archive.csv",
        content=(
            "Tên hồ sơ,Năm,Kết quả\nBảo tồn tranh,2020,Được ghi nhận\nChưa rõ,2021\n"
        ).encode(),
    )

    assert parsed == ParsedImportTable(
        headers=("Tên hồ sơ", "Năm", "Kết quả"),
        rows=(
            ("Bảo tồn tranh", "2020", "Được ghi nhận"),
            ("Chưa rõ", "2021", ""),
        ),
    )


@pytest.mark.parametrize(
    ("filename", "content", "expected_code"),
    [
        ("archive.exe", b"bad", "unsupported_file_type"),
        ("archive.csv", b"\xff\xfe", "invalid_encoding"),
        ("archive.csv", b"name,name\nA,B\n", "duplicate_header"),
        ("archive.csv", b"name,,year\nA,B,2020\n", "empty_header"),
        ("archive.csv", b'name,year\n=HYPERLINK("bad"),2020\n', "formula_cell"),
        ("archive.csv", b"name,year\nA,2020,extra\n", "row_width_mismatch"),
    ],
)
def test_parse_csv_rejects_unsafe_or_ambiguous_input(
    filename: str,
    content: bytes,
    expected_code: str,
) -> None:
    with pytest.raises(HistoricalImportParseError) as exc_info:
        parse_import_file(filename=filename, content=content)

    assert exc_info.value.code == expected_code


def test_parse_csv_rejects_files_over_the_size_limit() -> None:
    with pytest.raises(HistoricalImportParseError) as exc_info:
        parse_import_file(filename="archive.csv", content=b"x" * (20 * 1024 * 1024 + 1))

    assert exc_info.value.code == "file_too_large"


def test_parse_xlsx_reads_values_without_evaluating_formulas() -> None:
    workbook = Workbook()
    worksheet = workbook.active
    assert worksheet is not None
    worksheet.append(["Tên hồ sơ", "Năm", "Ngày tiếp nhận"])
    worksheet.append(["Số hóa tư liệu", 2024, date(2024, 4, 20)])
    stream = BytesIO()
    workbook.save(stream)

    parsed = parse_import_file(filename="archive.xlsx", content=stream.getvalue())

    assert parsed == ParsedImportTable(
        headers=("Tên hồ sơ", "Năm", "Ngày tiếp nhận"),
        rows=(("Số hóa tư liệu", "2024", "2024-04-20"),),
    )


def test_parse_xlsx_rejects_formula_cells() -> None:
    workbook = Workbook()
    worksheet = workbook.active
    assert worksheet is not None
    worksheet.append(["Tên hồ sơ", "Kết quả"])
    worksheet.append(["Hồ sơ cũ", '=HYPERLINK("bad")'])
    stream = BytesIO()
    workbook.save(stream)

    with pytest.raises(HistoricalImportParseError) as exc_info:
        parse_import_file(filename="archive.xlsx", content=stream.getvalue())

    assert exc_info.value.code == "formula_cell"
