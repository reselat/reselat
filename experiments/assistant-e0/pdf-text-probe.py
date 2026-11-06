"""Synthetic text-only fixture probe; no OCR and no enterprise documents."""
import json
import sys
from pathlib import Path
from pypdf import PdfReader, PdfWriter
from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject

out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
writer = PdfWriter()
page = writer.add_blank_page(width=900, height=400)
font = DictionaryObject({NameObject('/Type'): NameObject('/Font'), NameObject('/Subtype'): NameObject('/Type1'), NameObject('/BaseFont'): NameObject('/Helvetica')})
page[NameObject('/Resources')] = DictionaryObject({NameObject('/Font'): DictionaryObject({NameObject('/F1'): writer._add_object(font)})})
stream = DecodedStreamObject()
stream.set_data(b'BT /F1 10 Tf 20 360 Td (SYNTHETIC E0 - NOT A BUSINESS QUOTE) Tj 0 -30 Td (Synthetic Resin|Grade A|12.30|USD|kg|FOB TEST; valid 2026-12-01) Tj 0 -30 Td (Synthetic Sample|Size S|0.10|USD|pc|EXW TEST; valid 2026-12-01) Tj ET')
page[NameObject('/Contents')] = writer._add_object(stream)
pdf = out / 'synthetic-text.pdf'
with pdf.open('wb') as handle:
    writer.write(handle)
text = PdfReader(pdf).pages[0].extract_text()
rows = []
for line in text.splitlines():
    if '|' not in line:
        continue
    product, specification, price, currency, unit, conditions = line.split('|')
    rows.append(dict(product=product, specification=specification, unitPrice=price, currency=currency, unit=unit, page=1, conditions=conditions, sourceVersion='synthetic-v1'))
expected = json.loads((Path(__file__).resolve().parents[2] / 'tests/assistant-e0/fixtures/quote-expected.json').read_text())
assert rows == expected, (rows, expected)
(out / 'extracted.json').write_text(json.dumps(rows, indent=2))
print('PASS: 2 synthetic text rows, all 8 fields match reviewed JSON baseline; OCR unverified')
