from pathlib import Path
import pdfplumber
for name in ['pi-1','pi-100']:
    with pdfplumber.open(Path('artifacts/pdf')/(name+'.pdf')) as pdf:
        for page in pdf.pages:
            lines=page.extract_text_lines()
            disclaimer=next(line for line in lines if '不得作为正式凭证' in line['text'])
            table_rect=next(rect for rect in page.rects if 100<rect['top']<180 and rect['width']>400)
            assert disclaimer['bottom']+4 <= table_rect['top'], (name,page.page_number,'header overlaps table',disclaimer['bottom'],table_rect['top'])
        text='\n'.join(page.extract_text() for page in pdf.pages)
        expected=1 if name=='pi-1' else 100
        assert text.count('通用工业连接件')==expected
        assert ('125.00' if expected==1 else '12500.00') in text
        print(name, len(pdf.pages), 'pages; header separation, all lines and total checked')
