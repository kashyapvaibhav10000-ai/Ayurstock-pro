#!/usr/bin/env python3
"""OCR-based medicine price list parser.

This script is designed for scanned distributor price lists in a table format.
It uses PDF→images → deskew → cleanup → OCR → text parsing.

Usage:
  python ocr_price_list.py /path/to/price_list.pdf

Output: JSON array (stdout), one object per medicine:
  {"code":"91006 K","name":"ACINORM CAPSULE","packing":"30 Cap","mrp":95.0,"tradePrice":83.5}

Dependencies (Python):
  pip install opencv-python numpy pillow pdf2image pytesseract

You must also install Tesseract OCR on the system (e.g. apt install tesseract-ocr).
"""

import json
import os
import re
import sys

try:
    import pdf2image
    pdf2image.poppler_path = r'C:\poppler-25.12.0\Library\bin'
except ImportError:
    print('ERROR: missing dependency pdf2image', file=sys.stderr)
    sys.exit(1)

try:
    import cv2
    import numpy as np
except ImportError:
    print('ERROR: missing dependency opencv-python or numpy', file=sys.stderr)
    sys.exit(1)

try:
    from paddleocr import PaddleOCR
    ocr = PaddleOCR(use_textline_orientation=True, lang='en')
except ImportError:
    ocr = None

try:
    import pytesseract
except ImportError:
    pytesseract = None

try:
    from PIL import Image
except ImportError:
    Image = None


def deskew(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    gray = cv2.bitwise_not(gray)
    thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)[1]
    coords = np.column_stack(np.where(thresh > 0))
    if coords.shape[0] < 10:
        return image
    angle = cv2.minAreaRect(coords)[-1]
    if angle < -45:
        angle = -(90 + angle)
    else:
        angle = -angle
    (h, w) = image.shape[:2]
    M = cv2.getRotationMatrix2D((w // 2, h // 2), angle, 1.0)
    return cv2.warpAffine(image, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)


def preprocess(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    thresh = cv2.adaptiveThreshold(
        blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
    )
    return thresh


def ocr_image(image) -> str:
    # Prefer PaddleOCR if available.
    if ocr is not None:
        try:
            return _paddle_ocr_text(image)
        except Exception as e:
            print(f"DEBUG: PaddleOCR failed: {e}", file=sys.stderr)

    # Fallback to pytesseract if available.
    if pytesseract is not None:
        try:
            pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
            # Use a page segmentation mode suitable for blocks of text.
            config = "--psm 6"
            return pytesseract.image_to_string(image, config=config)
        except Exception as e:
            print(f"DEBUG: pytesseract failed: {e}", file=sys.stderr)

    return ""


def _paddle_ocr_text(image) -> str:
    # paddleocr returns complex nested structures; we need to normalize it.
    # PaddleOCR can accept a file path; use a temp file for numpy arrays.
    temp_path = None
    if isinstance(image, np.ndarray):
        import tempfile

        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp:
            temp_path = tmp.name
            cv2.imwrite(temp_path, image)
        ocr_input = temp_path
    else:
        ocr_input = image

    ocr_results = ocr.predict(ocr_input)

    # Clean up temp file if used
    if temp_path:
        try:
            os.remove(temp_path)
        except Exception:
            pass

    # Print a small preview for debugging (can be removed later)
    if ocr_results:
        print(f"DEBUG: PaddleOCR output sample: {repr(ocr_results[0])[:400]}", file=sys.stderr)

    lines = []
    for item in ocr_results:
        # Each item can be a list/tuple like: [bbox, (text, confidence)] or [bbox, [ (text, score), ... ]]
        text = None
        if isinstance(item, (list, tuple)) and len(item) >= 2:
            out = item[1]
            if isinstance(out, (list, tuple)) and len(out) >= 1:
                candidate = out[0]
                if isinstance(candidate, (list, tuple)) and len(candidate) >= 1:
                    text = candidate[0]
                else:
                    text = str(candidate)
            else:
                text = str(out)
        if text:
            lines.append(str(text))

    return "\n".join(lines)

    # Debug: print first few OCR result entries (structure may vary by paddleocr version)
    try:
        if len(ocr_results) > 0:
            print(
                f"DEBUG: OCR results len={len(ocr_results)} first_item={repr(ocr_results[0])[:400]}",
                file=sys.stderr,
            )
        else:
            print("DEBUG: OCR results empty", file=sys.stderr)
    except Exception as e:
        print(f"DEBUG: Could not preview OCR results: {e}", file=sys.stderr)

    lines = []
    for line_info in ocr_results:
        try:
            # PaddleOCR output is often: [ [[x1,y1],...], ('text', confidence) ]
            if isinstance(line_info, (list, tuple)) and len(line_info) >= 2:
                text_part = line_info[1]
                if isinstance(text_part, (list, tuple)) and len(text_part) >= 1:
                    # text_part may be (text, confidence) or list of them
                    candidate = text_part[0]
                    if isinstance(candidate, (list, tuple)) and len(candidate) >= 1:
                        text = candidate[0]
                    else:
                        text = str(candidate)
                else:
                    text = str(text_part)
            else:
                text = str(line_info)
        except Exception as e:
            print(f"DEBUG: Error parsing line_info: {e} (line_info={repr(line_info)})", file=sys.stderr)
            text = ''

        if text:
            lines.append(text)

    return "\n".join(lines)


PRICE_PATTERN = re.compile(r"(\d{1,6}(?:[.,]\d{1,2})?)\s+(\d{1,6}(?:[.,]\d{1,2})?)\s*$")
PACKING_PATTERN = re.compile(r"(\d+\s*(?:cap|caps|capsule|tablet|tab|tabs|ml|gm|gms|kg|ltr|strip|bottle|pack|pouch|tube|box|jar|sachet))", re.I)
CODE_PATTERN = re.compile(r"^\s*(\d{3,8}\s*[A-Z]?)\b")


def clean_line(line: str) -> str:
    return re.sub(r"[^\x20-\x7E]+", " ", line).strip()


def parse_block(text: str):
    """Parse a single row block into fields."""
    text = clean_line(text)
    if not text:
        return None

    # Find prices at end
    price_match = PRICE_PATTERN.search(text)
    if not price_match:
        return None

    def to_float(value: str) -> float:
        return float(value.replace(',', '.'))

    mrp = to_float(price_match.group(1))
    trade = to_float(price_match.group(2))

    before = text[: price_match.start()].strip()

    code = ''
    m = CODE_PATTERN.match(before)
    if m:
        code = m.group(1).strip()
        before = before[m.end():].strip()

    packing = ''
    m = PACKING_PATTERN.search(before)
    if m:
        packing = m.group(1).strip()
        before = before[: m.start()].strip() + ' ' + before[m.end():].strip()
        before = before.strip()

    name = before.strip()
    if not name:
        return None

    return {
        'code': code,
        'name': name,
        'packing': packing,
        'mrp': mrp,
        'tradePrice': trade,
    }


def parse_text(text: str):
    lines = [clean_line(l) for l in text.split('\n') if clean_line(l)]
    medicines = []

    for line in lines:
        # Skip header lines
        if any(word in line.lower() for word in ['code', 'name', 'product', 'packing', 'price', 'retail', 'trade']):
            continue
        if len(line) < 10:
            continue

        # If line contains |, split into columns
        if '|' in line:
            parts = [p.strip() for p in line.split('|')]
            if len(parts) >= 3:
                code = parts[0]
                name = parts[1]
                if len(parts) >= 4:
                    packing = parts[2]
                    price_part = ' '.join(parts[3:])
                else:
                    packing = ''
                    price_part = parts[2]
                prices = re.findall(r"(\d{1,6}(?:[.,]\d{1,3})?)", price_part)
                if len(prices) >= 2:
                    mrp_str = prices[0]
                    trade_str = prices[1]
                elif len(prices) == 1:
                    mrp_str = prices[0]
                    trade_str = mrp_str
                else:
                    continue
            else:
                continue
        else:
            # Fallback to old parsing
            # Normalize separators
            clean = re.sub(r'[|\[\]"\'{}<>_]', ' ', line)
            clean = re.sub(r"\s+", " ", clean).strip()

            # Find a possible code (must include digits)
            code_match = re.search(r"\b([A-Za-z]*\d{2,8}[A-Za-z]*)\b", clean)
            if not code_match:
                continue
            code = code_match.group(1).strip()

            # Find numeric groups for prices (allow 0-3 decimals, allow commas)
            price_candidates = re.findall(r"(\d{1,6}(?:[.,]\d{1,3})?)", clean)
            if len(price_candidates) < 1:
                continue

            # Use last numeric group as MRP, second last as trade if available
            mrp_raw = price_candidates[-1]
            trade_raw = price_candidates[-2] if len(price_candidates) > 1 else mrp_raw

            try:
                mrp_str = str(float(mrp_raw.replace(',', '.')))
                trade_str = str(float(trade_raw.replace(',', '.')))
            except Exception:
                continue

            # Remove price substrings so the name extraction isn't polluted
            clean_no_price = clean
            for p in [mrp_raw, trade_raw]:
                clean_no_price = clean_no_price.replace(p, ' ')

            # Extract packing if present
            packing = ''
            packing_match = PACKING_PATTERN.search(clean_no_price)
            if packing_match:
                packing = packing_match.group(1).strip()
                clean_no_price = clean_no_price.replace(packing_match.group(0), ' ')

            # Name is whatever remains after code (excluding packing)
            rest = clean_no_price[code_match.end():].strip()
            name = clean_medicine_name(rest)
            if not name:
                continue

        # Now, clean the fields
        code = re.sub(r'[^\w]', '', code)  # Keep only word chars
        name = clean_medicine_name(name)
        packing = packing.strip()
        try:
            mrp = float(mrp_str.replace(',', '.'))
            trade = float(trade_str.replace(',', '.'))
        except:
            continue

        if not name:
            continue

        medicines.append({
            'code': code,
            'name': name,
            'packing': packing,
            'mrp': mrp,
            'tradePrice': trade,
        })

    return medicines


def parse_block_from_record(rec):
    name = rec.get('name', '').strip()
    if not name:
        return None

    # Clean name: remove Hindi, descriptions
    name = clean_medicine_name(name)

    packing = rec.get('packing', '').strip()
    mrp = rec.get('mrp')
    trade = rec.get('tradePrice')

    if not mrp or not trade:
        return None

    return {
        'code': rec.get('code', ''),
        'name': name,
        'packing': packing,
        'mrp': mrp,
        'tradePrice': trade,
    }


def clean_medicine_name(name: str) -> str:
    # Remove Hindi text in parentheses or after
    name = re.sub(r'\s*\([^)]*\)\s*', ' ', name)  # Remove parentheses
    name = re.sub(r'[^\x00-\x7F]+', ' ', name)  # Remove non-ASCII
    name = re.sub(r'\s+', ' ', name).strip()

    # Remove common description words
    remove_words = [
        'capsule', 'tablet', 'syrup', 'gold', 'kalp', 'yog', 'makardwaj',
        'rheuma', 'sobex', 'stocrush', 'plasmo', 'calciost', 'jambruwin',
        'livodin', 'navaranta', 'rheumarx', 'kafamukta'
    ]
    for word in remove_words:
        name = re.sub(r'\b' + word + r'\b', '', name, flags=re.I)

    name = re.sub(r'\s+', ' ', name).strip()

    # Take first 2-3 words
    words = name.split()
    if len(words) > 3:
        name = ' '.join(words[:3])

    return name


def detect_column(header: str) -> str:
    h = header.lower().strip()
    if any(k in h for k in ["code", "item", "no", "s.no"]):
        return "code"
    if any(k in h for k in ["product", "medicine", "item", "name", "description"]):
        return "name"
    if any(k in h for k in ["pack", "packing", "size", "unit", "qty"]):
        return "packing"
    if any(k in h for k in ["mrp", "retail", "price"]):
        return "mrp"
    if any(k in h for k in ["trade", "dealer", "rate", "purchase"]):
        return "trade_price"
    return "unknown"


def main():
    print("DEBUG: Starting Python OCR parser", file=sys.stderr)
    if len(sys.argv) < 2:
        print('Usage: python ocr_price_list.py <file.pdf> [max_pages]', file=sys.stderr)
        sys.exit(1)

    path = sys.argv[1]
    max_pages = int(sys.argv[2]) if len(sys.argv) > 2 else None
    if not os.path.exists(path):
        print('File not found: ' + path, file=sys.stderr)
        sys.exit(1)

    pages = pdf2image.convert_from_path(path, dpi=200, poppler_path=r"C:\poppler-25.12.0\Library\bin")
    if max_pages:
        pages = pages[:max_pages]
    print(f"DEBUG: Processing {len(pages)} pages", file=sys.stderr)
    print(f"Total pages detected: {len(pages)}", file=sys.stderr)
    medicines = []
    raw_texts = []

    for i, page in enumerate(pages):
        try:
            img = cv2.cvtColor(np.array(page), cv2.COLOR_RGB2BGR)
            img = deskew(img)
            img = preprocess(img)
            ocr_text = ocr_image(img)
            raw_texts.append(ocr_text)
            print(f"DEBUG: OCR Text for page {i + 1}:\n{ocr_text}\n", file=sys.stderr)
            page_medicines = parse_text(ocr_text)
            print(f"DEBUG: Parsed {len(page_medicines)} medicines from page {i + 1}", file=sys.stderr)
            medicines.extend(page_medicines)
        except Exception as e:
            print(f"DEBUG: Error processing page {i + 1}: {e}", file=sys.stderr)

    # Deduplicate by (name, packing, mrp)
    print(f"DEBUG: Total medicines before dedup: {len(medicines)}", file=sys.stderr)
    total_lines = sum(len(text.split('\n')) for text in raw_texts)
    print(f"Total lines extracted: {total_lines}", file=sys.stderr)
    unique = {}
    for m in medicines:
        key = (m.get('name', '').lower(), m.get('packing', '').lower(), m.get('mrp'))
        if key not in unique:
            unique[key] = m

    out = list(unique.values())
    print(f"DEBUG: Total medicines after dedup: {len(out)}", file=sys.stderr)

    raw_text = "\n".join(raw_texts)
    sys.stdout.write(json.dumps({"rawText": raw_text, "medicines": out}, ensure_ascii=False))


if __name__ == '__main__':
    main()
