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

const OPENROUTER_MODELS = 'https://openrouter.ai/api/v1/models';
const OPENROUTER_COMPLETIONS = 'https://openrouter.ai/api/v1/chat/completions';

async function main() {
  if (!apiKey) {
    console.error('OPENROUTER_API_KEY is not set');
    process.exit(1);
  }

  console.log('Fetching all OpenRouter models...');
  const resp = await fetch(OPENROUTER_MODELS);
  const data = await resp.json();
  
  const freeModels = data.data.filter((m: any) => 
    m.pricing && m.pricing.prompt === "0" && m.pricing.completion === "0"
  ).map((m: any) => m.id);

  console.log(`Found ${freeModels.length} free models. Testing the first 10...`);
  
  const toTest = freeModels.slice(0, 10);
  
  for (const model of toTest) {
    console.log(`\nTesting ${model}...`);
    try {
      const cResp = await fetch(OPENROUTER_COMPLETIONS, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Reply with the exact word "Working". Nothing else.' }],
          max_tokens: 10,
        }),
      });
      
      const cData = await cResp.json();
      if (cData.error) {
        console.error(`❌ Error: ${cData.error.message}`);
      } else {
        console.log(`✅ Success: ${cData.choices[0].message.content}`);
      }
    } catch (err: any) {
      console.error(`❌ Fetch Error: ${err.message}`);
    }
  }
}

main();
