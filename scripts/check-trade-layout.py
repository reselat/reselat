from pathlib import Path
import pdfplumber
for file in [Path('artifacts/pdf')/(name+'.pdf') for name in ['trade-PI','trade-PO','trade-CI','trade-PL','trade-long']]:
    with pdfplumber.open(file) as pdf:
        for page in pdf.pages:
            bad=[c for c in page.chars if c['x0']<30 or c['x1']>page.width-30]
            assert not bad,(file.name,page.page_number,'text exceeds paper margin',[(c['text'],round(c['x1'])) for c in bad[:5]])
        print(file.name,len(pdf.pages),'pages: text stays inside paper margins')
