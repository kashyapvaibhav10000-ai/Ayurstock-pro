import * as fs from 'fs';
import * as path from 'path';

const envPath = path.join(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
let apiKey = '';
for (const line of envContent.split('\n')) {
  if (line.startsWith('OPENROUTER_API_KEY=')) {
    apiKey = line.split('=')[1].replace(/"/g, '').trim();
  }
}

const OPENROUTER_COMPLETIONS = 'https://openrouter.ai/api/v1/chat/completions';

async function main() {
  const models = [
    'google/gemini-2.0-flash-lite-preview-02-05:free',
    'meta-llama/llama-3.1-8b-instruct:free',
    'openrouter/free',
    'deepseek/deepseek-chat:free'
  ];

  for (const model of models) {
    console.log(`\nTesting ${model} speed...`);
    const start = Date.now();
    try {
      const cResp = await fetch(OPENROUTER_COMPLETIONS, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Generate a JSON array of 10 fake users with name, email, and age.' }],
          max_tokens: 500,
        }),
      });
      
      const cData = await cResp.json();
      if (cData.error) {
        console.error(`❌ Error: ${cData.error.message}`);
      } else {
        const time = Date.now() - start;
        console.log(`✅ Success in ${time}ms`);
      }
    } catch (err: any) {
      console.error(`❌ Fetch Error: ${err.message}`);
    }
  }
}

main();
