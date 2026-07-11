from pathlib import Path
import pdfplumber

path = Path(r"C:\Users\pc\OneDrive\桌面\検品検针報告書SY26-000.pdf")
out_dir = Path("tmp/pdfs")
out_dir.mkdir(parents=True, exist_ok=True)

with pdfplumber.open(path) as pdf:
    print("pages", len(pdf.pages))
    for index, page in enumerate(pdf.pages):
        print("PAGE", index + 1, "size", page.width, page.height)
        words = page.extract_words(x_tolerance=1, y_tolerance=1, keep_blank_chars=False)
        for word in words[:300]:
            print(index + 1, round(word["x0"], 1), round(word["top"], 1), round(word["x1"], 1), round(word["bottom"], 1), repr(word["text"]))
        try:
            image = page.to_image(resolution=360)
            image_path = out_dir / f"qc-report-page-{index + 1}.png"
            image.save(str(image_path), format="PNG")
            print("RENDERED", image_path)
        except Exception as exc:
            print("RENDER_FAILED", type(exc).__name__, str(exc))
