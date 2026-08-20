from docx import Document
doc = Document(r"C:\Users\cargi\OneDrive\Desktop\DeskWork_Documento_Maestro.docx")
for p in doc.paragraphs:
    if p.text.strip():
        print(p.text)
