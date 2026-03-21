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
  console.log('Fetching active free models...');
  const modelsResp = await fetch('https://openrouter.ai/api/v1/models');
  const modelsData = await modelsResp.json();
  const freeModels = modelsData.data
    .filter((m: any) => m.pricing && m.pricing.prompt === "0" && m.pricing.completion === "0")
    .map((m: any) => m.id);

  const model = freeModels.find((m: string) => m.includes('gemini')) || 'openrouter/free';
  console.log(`\nTesting burst rate limit on active model: ${model}...`);
  
  const tasks = Array(15).fill(0).map((_, i) => async () => {
    try {
      const resp = await fetch(OPENROUTER_COMPLETIONS, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Say hello.' }],
          max_tokens: 10,
        }),
      });
      
      const status = resp.status;
      const data = await resp.json().catch(() => null);
      if (status === 200) {
        console.log(`✅ Req ${i+1}: Success`);
      } else {
        console.log(`❌ Req ${i+1}: Failed with status ${status} - ${data?.error?.message || 'unknown'}`);
      }
    } catch (e: any) {
      console.log(`❌ Req ${i+1}: Err - ${e.message}`);
    }
  });

  // Fire 15 requests immediately in parallel
  await Promise.all(tasks.map(t => t()));
}

main();
