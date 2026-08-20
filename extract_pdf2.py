from pypdf import PdfReader
r = PdfReader(r"C:\Users\cargi\OneDrive\Desktop\DeskWork - Propuesta Mesa De Ayuda TI.pdf")
for i, p in enumerate(r.pages):
    txt = p.extract_text()
    if txt:
        print(f"--- PAGE {i+1} ---")
        print(txt)
