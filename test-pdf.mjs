import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';
import path from 'path';

const pdfPath = './medec/ASHTANG HARBAL (NEW PRICE LIST 2025)-5.pdf';

async function testPDF() {
  try {
    console.log('📄 Testing PDF:', pdfPath);
    
    const buffer = fs.readFileSync(pdfPath);
    const uint8Array = new Uint8Array(buffer);
    console.log('✅ PDF loaded, size:', buffer.length, 'bytes');
    
    const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
    const pdf = await loadingTask.promise;
    
    console.log('✅ PDF parsed, total pages:', pdf.numPages);
    
    let fullText = '';
    
    for (let i = 1; i <= Math.min(pdf.numPages, 5); i++) {
      console.log(`\n📖 Extracting page ${i}...`);
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      const pageText = textContent.items
        .map((item) => item.str)
        .join(' ');
      
      console.log(`   Text length: ${pageText.length} chars`);
      console.log(`   First 200 chars: ${pageText.substring(0, 200)}`);
      
      fullText += pageText + '\n';
    }
    
    console.log('\n📊 Total extracted text:', fullText.length, 'chars');
    console.log('\n🔍 Sample text (first 500 chars):');
    console.log(fullText.substring(0, 500));
    
    // Check for medicine-like patterns
    const lines = fullText.split('\n');
    const medicineLines = lines.filter(line => {
      const trimmed = line.trim();
      return trimmed && trimmed === trimmed.toUpperCase() && trimmed.length > 3;
    });
    
    console.log('\n💊 Found', medicineLines.length, 'potential medicine names');
    console.log('First 10 candidates:');
    medicineLines.slice(0, 10).forEach(line => {
      console.log('  -', line.trim());
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testPDF();
