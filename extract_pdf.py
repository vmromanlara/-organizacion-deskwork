import sys
from pathlib import Path
sys.path.insert(0, str(Path(sys.executable).parent.parent.parent))
from daimon_runtime.pdf import extract_text
text = extract_text(r"C:\Users\cargi\OneDrive\Desktop\DeskWork - Propuesta Mesa De Ayuda TI.pdf")
print(text)
