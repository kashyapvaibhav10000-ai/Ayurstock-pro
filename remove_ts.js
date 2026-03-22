const fs = require('fs');
const path = require('path');

const files = [
  'lib/aiParser.ts',
  'app/api/settings/import-csv/route.ts',
  'app/api/returns/export/route.ts',
  'app/api/settings/rack-locations/[id]/route.ts'
];

files.forEach(f => {
  const fullPath = path.join(process.cwd(), f);
  if (!fs.existsSync(fullPath)) return;
  
  const lines = fs.readFileSync(fullPath, 'utf8').split('\n');
  const newLines = lines.filter(l => !l.includes('@ts-ignore') && !l.includes('@ts-expect-error'));
  let content = newLines.join('\n');
  
  if (f === 'lib/aiParser.ts') {
     content = content.replace(
       "const pdfParse = require('pdf-parse');",
       "const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<{ text: string; numpages: number }>;"
     );
  }
  fs.writeFileSync(fullPath, content);
});

console.log('Successfully stripped all TS ignore tags.');
