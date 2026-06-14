import { createHash } from 'crypto';
import { hostname } from 'os';
import { userInfo, cpus } from 'os';

const h = hostname() || 'unknown-host';
const p = process.platform;
const a = process.arch;
const cpuModel = cpus()?.[0]?.model || 'unknown-cpu';
const u = userInfo().username || 'unknown-user';

const seed = `${h}|${p}|${a}|${cpuModel}|${u}`;
const fp = createHash('sha256').update(seed).digest('hex');

console.log('=== Fingerprint Test ===');
console.log('Seed:', seed);
console.log('Fingerprint:', fp);
console.log('Length:', fp.length);

const BOOTSTRAP_URL = 'https://api.xiaomimimo.com/api/free-ai/bootstrap';

async function testBootstrap() {
  console.log('\n=== Bootstrap Test ===');
  try {
    const resp = await fetch(BOOTSTRAP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client: fp }),
      signal: AbortSignal.timeout(15000),
    });

    console.log('Status:', resp.status);
    const data = await resp.json();
    console.log('Has JWT:', !!data.jwt);
    console.log('JWT length:', data.jwt?.length);

    if (data.jwt) {
      const parts = data.jwt.split('.');
      if (parts.length >= 2) {
        let payload = parts[1];
        const pad = payload.length % 4;
        if (pad) payload += '='.repeat(4 - pad);
        const decoded = Buffer.from(payload, 'base64').toString('utf8');
        const claims = JSON.parse(decoded);
        console.log('JWT exp:', claims.exp, '→', new Date(claims.exp * 1000).toISOString());
        console.log('JWT iat:', claims.iat, '→', new Date(claims.iat * 1000).toISOString());
        console.log('TTL:', Math.floor((claims.exp * 1000 - Date.now()) / 1000), 'seconds');
      }
      return data.jwt;
    }
  } catch (e) {
    console.error('Bootstrap failed:', e.message);
  }
  return null;
}

async function testChat(jwt, stream = true) {
  console.log(`\n=== Chat Test (stream=${stream}) ===`);
  const CHAT_URL = 'https://api.xiaomimimo.com/api/free-ai/openai/chat';

  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let sessionId = 'ses_';
  for (let i = 0; i < 24; i++) sessionId += chars[Math.floor(Math.random() * chars.length)];

  try {
    const resp = await fetch(CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt}`,
        'X-Mimo-Source': 'mimocode-cli-free',
        'x-session-affinity': sessionId,
        'Accept': stream ? 'text/event-stream' : 'application/json',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
      body: JSON.stringify({
        model: 'mimo-auto',
        messages: [
          { role: 'system', content: 'You are MiMoCode, an interactive CLI tool that helps users with software engineering tasks.' },
          { role: 'user', content: '你好，请用一句话介绍你自己' },
        ],
        stream,
      }),
      signal: AbortSignal.timeout(60000),
    });

    console.log('Status:', resp.status);
    console.log('Content-Type:', resp.headers.get('content-type'));

    if (stream) {
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let chunks = 0;
      let fullText = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        chunks++;
        if (chunks <= 5) process.stdout.write(text);
        fullText += text;
      }
      if (chunks > 5) console.log('\n... (total chunks:', chunks, ')');
      console.log('\nStream test: PASS');
    } else {
      const text = await resp.text();
      let body = text.trim();
      if (body.startsWith('data: ')) body = body.substring(6);
      console.log('Response:', body.substring(0, 300));
      console.log('\nNon-stream test: PASS');
    }
  } catch (e) {
    console.error('Chat failed:', e.message);
  }
}

const jwt = await testBootstrap();
if (jwt) {
  await testChat(jwt, true);
  await testChat(jwt, false);
}
