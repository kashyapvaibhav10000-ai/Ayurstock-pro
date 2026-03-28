# Universal Pharma Invoice Parser Prompt

Use this prompt with any advanced LLM (like Gemini 1.5 Pro, Claude 3.5 Sonnet, or GPT-4o) when providing an image or OCR text of a pharmacy invoice.

---

**Prompt:**

Act as a specialized Pharmacy Data Extraction Assistant. Your task is to extract structured medicine data from the provided image/text of a **Tax Invoice** or **Purchase Bill**.

**Extract the following fields for EVERY medicine entry (row):**
1.  **Medicine Name**: Full name in UPPER CASE (e.g., NATURALLY CHURNA).
2.  **Packing**: Size/quantity per unit (e.g., 100 GM, 40 TAB, 100 TAB).
3.  **HSN Code**: Usually a 4-8 digit number (e.g., 30049011).
4.  **Company (Mfg By)**: The manufacturer name (e.g., AYUKALP).
5.  **Batch Number**: Unique batch ID (e.g., CHM007).
6.  **Expiry Date**: MM-YY or Month-YY format (e.g., Jan-28).
7.  **MRP**: Maximum Retail Price (e.g., 112.50).
8.  **Purchase Rate (PTS)**: The rate at which it was purchased.
9.  **Quantity (Qty)**: The number of units purchased (e.g., 72, 144).

**Rules for Extraction:**
- **Entry Selection**: Identify and extract ALL rows listed in the "Description of Goods" or "Product" column. (For this specific invoice, expect 7 entries).
- **Column Mapping**:
    - "Description of Goods" -> Medicine Name
    - "PTS" -> Purchase Rate
    - "Expiry Date" / "Exp Dt" -> Expiry Date
    - "Batch" / "Batch No" -> Batch Number
- **Duplicates**: If a medicine name is repeated (e.g., Line 1 and Line 2), extract BOTH as separate entries with their respective quantities and batches.
- **Normalization**: Return the name in UPPER CASE. Remove any extra symbols or serial numbers.
- **Output Format**: Provide ONLY a valid JSON array of objects.

**Example JSON Output:**
```json
[
  {
    "name": "NATURALLY CHURNA",
    "packing": "100 GM",
    "hsn": "30049011",
    "company": "AYUKALP",
    "batchNo": "CHM007",
    "expiryDate": "Jan-28",
    "mrp": 112.5,
    "purchaseRate": 112.5,
    "quantity": 72
  }
]
```
---
