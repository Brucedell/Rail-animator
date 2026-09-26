"""Merge the per-Part PDFs (built by build.mjs) into one bookmarked volume.

    node build.mjs && python3 merge.py
"""
import glob
import os
import re

import pymupdf

HERE = os.path.dirname(os.path.abspath(__file__))
parts = sorted(glob.glob(os.path.join(HERE, "pdf", "part[0-9][0-9]-*.pdf")))

out = pymupdf.open()
toc = []
for path in parts:
    doc = pymupdf.open(path)
    start = out.page_count + 1
    # Part title = first <title> of the source HTML
    src = os.path.join(HERE, "src", os.path.basename(path)[:-4] + ".html")
    title = re.search(r"<title>(.*?)</title>", open(src, encoding="utf-8").read()).group(1)
    toc.append([1, title, start])
    # Section headings inside the part become level-2 bookmarks
    for pno in range(doc.page_count):
        for block in doc[pno].get_text("dict")["blocks"]:
            for line in block.get("lines", []):
                text = "".join(s["text"] for s in line["spans"]).strip()
                size = max((s["size"] for s in line["spans"]), default=0)
                if 14.5 <= size <= 16 and re.match(r"^\d+\.\d+\s", text):
                    toc.append([2, text, start + pno])
    out.insert_pdf(doc)

out.set_toc(toc)
target = os.path.join(HERE, "pdf", "Rail-Animator-Track-It-Concept-Guide.pdf")
out.save(target, garbage=3, deflate=True)
print("wrote", target, out.page_count, "pages,", len(toc), "bookmarks")
