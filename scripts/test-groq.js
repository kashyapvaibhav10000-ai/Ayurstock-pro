import * as dotenv from 'dotenv';
dotenv.config();

const SYSTEM_PROMPT = `You are a pharmacy data parser for Ayurvedic/herbal medicine documents.
The text may come from OCR (scanned documents or images) — expect noise, typos, and formatting issues.
You handle TWO document types:

TYPE A — PRICE LIST: columns are medicine name, packing, trade price, MRP
TYPE B — PURCHASE INVOICE/BILL: columns include Description, Packing, HSN, Mfg By (company), Batch No, Expiry, Qty, MRP, PTS (purchase rate), PTR

EXAMPLE PRICE LIST OUTPUT:
[
  {"name": "ADULSA SYRUP", "packing": "200ML", "mrp": 130, "tradePrice": 104},
  {"name": "ADULSA SYRUP", "packing": "400ML", "mrp": 240, "tradePrice": 192}
]

EXAMPLE INVOICE OUTPUT:
[
  {"name": "TRIPHALA CHURNA", "packing": "100GM", "hsn": "2106", "company": "AYUKALP", "batchNo": "DH558", "expiryDate": "Feb-28", "mrp": 112.50, "tradePrice": 90, "purchaseRate": 90}
]

RULES:
1. Medicine names: normalize to UPPER CASE
2. Extract ALL packing + price combinations — one record per variant
3. IMPORTANT TRICK FOR PRICE LISTS: If a row lists a new packing and price but the medicine name is blank (empty), you MUST INHERIT the medicine name from the previous row! (e.g. if row 1 is 'ANU TAILAM 15ml', and row 2 just says '50ml', you must output 'ANU TAILAM' for row 2 as well).
4. packing format: "200ML", "60TAB", "100GM", "1KG", "40TAB", "50GM", etc
5. For price lists: mrp and tradePrice are required. If only one price column, use it for both. Map "T.P" column to tradePrice.
6. For invoices: extract batchNo, expiryDate (as printed e.g. "Feb-28"), hsn, company (Mfg By column), purchaseRate (PTS column), mrp. Set tradePrice = purchaseRate.
7. Return ONLY valid JSON array starting with '[' and ending with ']'. No markdown, no extra text.
8. Required fields always: name (string), packing (string), mrp (number), tradePrice (number)
9. Optional fields when available: company, hsn, batchNo, expiryDate, purchaseRate
10. Ignore headers, footers, page numbers, totals, tax lines, address lines, and non-medicine text
11. Extract ALL medicines — do not stop early or limit the count
12. NEVER extract disease names as medicine names (e.g. LEPROSY, ARTHRITIS, FEVER, PAIN are NOT medicines)
13. Medicine names are product brand names like 'TRIPHALA CHURNA', 'AROGYAVARDHINI VATI', 'ADULSA SYRUP'
14. IMPORTANT: Check meticulously for Company or Manufacturer names if present in the text structure.
15. Price sanity: MRP must be 1–100000. TradePrice must be <= MRP. Skip impossible prices.`;

async function testGroq() {
  const apiKey = process.env.GROQ_API_KEY;
  const chunk = `
PRICE LIST
Sr.No. Code No. Product Name Pack T.P M.R.P
94 4001 A KAMPVATARI RAS 10 Tab 208.00 260.00
4001 B  20 Tab 396.00 495.00
4001 C  50 Tab 964.00 1205.00
107 4025 PRAVAL PANCHAMRUT
4025 A 30 Tab 208.00 260.00
4025 B 60 Tab 408.00 510.00
`;

  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: \`Bearer \${apiKey}\` },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: \`Extract medicines from this text. Return ONLY JSON array:\n\n\${chunk}\` }
      ],
      temperature: 0,
      max_tokens: 4096
    })
  });
  
  const data = await resp.json();
  console.log(data?.choices?.[0]?.message?.content);
}

testGroq();
