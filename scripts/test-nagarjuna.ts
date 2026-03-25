import { parsePDFWithAI } from './lib/aiParser';
import * as dotenv from 'dotenv';
dotenv.config();

const testText = `
PRICE LIST
KAMPVATARI RAS
94 4001 A  10 Tab 208.00 260.00
4001 B  20 Tab 396.00 495.00
4001 C  50 Tab 964.00 1205.00
107 4025 PRAVAL PANCHAMRUT
4025 A 30 Tab 208.00 260.00
4025 B 60 Tab 408.00 510.00
`;

// wait, parsePDFWithAI takes a buffer. Let's just import the inner relay parse function
// Actually, it's easier to just mock the text. But the inner functions are not exported.
// I will just copy the split/parse logic to a test script.
