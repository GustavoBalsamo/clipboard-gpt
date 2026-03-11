import 'dotenv/config';
import clipboard from 'clipboardy';
import OpenAI from 'openai';

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const INTERVAL_MS = Number(process.env.INTERVAL_MS || 700);
const RAW_PROMPT = process.env.SYSTEM_PROMPT || 'Responda ao texto copiado.';
const SYSTEM_PROMPT = RAW_PROMPT.replaceAll('\\n', '\n');

if (!process.env.OPENAI_API_KEY) {
  console.error('Faltou OPENAI_API_KEY no .env');
  process.exit(1);
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

let lastSeen = '';
let processing = false;

function shouldProcess(text) {
  if (!text) return false;
  if (text === lastSeen) return false;
  if (text.startsWith('[[AI]]')) return false;

  const nonPrintable = text.match(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\uFFFF]/g);
  const nonPrintableRatio = nonPrintable ? nonPrintable.length / text.length : 0;
  if (nonPrintableRatio > 0.2) return false;

  if (text.trim().length < 2) return false;

  return true;
}

async function askOpenAI(userText) {
  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userText }
    ],
    temperature: 0.3
  });
  return (completion.choices?.[0]?.message?.content || '').trim();
}

async function tick() {
  if (processing) return;

  try {
    const current = await clipboard.read();
    if (!shouldProcess(current)) {
      lastSeen = current;
      return;
    }

    processing = true;
    const original = current;

    let answer = '';
    try {
      answer = await askOpenAI(original);
    } catch (apiErr) {
      console.error('Falha na chamada OpenAI:', apiErr?.message || apiErr);
      processing = false;
      return;
    }

    const marked = '[[AI]]' + answer;
    await clipboard.write(marked);
    lastSeen = marked;

    await clipboard.write(answer);
    lastSeen = answer;

    processing = false;
  } catch (err) {
    console.error('Erro no ciclo:', err?.message || err);
    processing = false;
  }
}

console.log('Clipboard-GPT rodando. Copie um texto (Ctrl+C) e depois cole (Ctrl+V).');
setInterval(tick, INTERVAL_MS);
