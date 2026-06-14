import { createHash } from 'crypto';
import { hostname } from 'os';
import { userInfo, cpus } from 'os';
import { randomUUID } from 'crypto';

const BOOTSTRAP_URL = 'https://api.xiaomimimo.com/api/free-ai/bootstrap';
const CHAT_URL = 'https://api.xiaomimimo.com/api/free-ai/openai/chat';

const UAS = {
  v1: [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  ],
  v2: [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
  ],
};

const SYSTEM_MARKER = "You are MiMoCode, an interactive CLI tool that helps users with software engineering tasks.";

const TEST_PROMPTS = [
  {
    name: "简单问答",
    messages: [
      { role: 'system', content: SYSTEM_MARKER },
      { role: 'user', content: '用一句话解释什么是递归' },
    ],
  },
  {
    name: "代码生成",
    messages: [
      { role: 'system', content: SYSTEM_MARKER },
      { role: 'user', content: '写一个 Python 快速排序函数，要求有注释' },
    ],
  },
  {
    name: "推理问题",
    messages: [
      { role: 'system', content: SYSTEM_MARKER },
      { role: 'user', content: '一个房间里有3个开关，对应隔壁房间的3盏灯。你只能去隔壁房间一次。如何确定每个开关对应哪盏灯？' },
    ],
  },
  {
    name: "Debug 分析",
    messages: [
      { role: 'system', content: SYSTEM_MARKER },
      { role: 'user', content: '这段代码为什么死循环？\n```python\ndef find_item(lst, target):\n    i = 0\n    while i < len(lst):\n        if lst[i] == target:\n            return i\n    return -1\n```' },
    ],
  },
];

function generateV1Fingerprint() {
  return `mimocode-auth-${randomUUID()}`;
}

function generateV2Fingerprint() {
  const h = hostname() || 'unknown-host';
  const p = process.platform;
  const a = process.arch;
  const cpuModel = cpus()?.[0]?.model || 'unknown-cpu';
  const u = userInfo().username || 'unknown-user';
  const seed = `${h}|${p}|${a}|${cpuModel}|${u}`;
  return createHash('sha256').update(seed).digest('hex');
}

function generateV1Session() {
  return `ses-${randomUUID()}`;
}

function generateV2Session() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'ses_';
  for (let i = 0; i < 24; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

function getRandomUA(list) {
  return list[Math.floor(Math.random() * list.length)];
}

async function bootstrap(fingerprint) {
  const resp = await fetch(BOOTSTRAP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client: fingerprint }),
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) throw new Error(`Bootstrap ${resp.status}`);
  const data = await resp.json();
  return data.jwt;
}

async function chatRequest(jwt, messages, sessionAffinity, ua, stream = true) {
  const start = Date.now();
  const resp = await fetch(CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jwt}`,
      'X-Mimo-Source': 'mimocode-cli-free',
      'x-session-affinity': sessionAffinity,
      'Accept': stream ? 'text/event-stream' : 'application/json',
      'User-Agent': ua,
    },
    body: JSON.stringify({ model: 'mimo-auto', messages, stream }),
    signal: AbortSignal.timeout(120000),
  });

  const ttfb = Date.now() - start;

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    return { status: resp.status, ttfb, error: errText, content: '', reasoning: '', totalTime: Date.now() - start };
  }

  if (stream) {
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let content = '';
    let reasoning = '';
    let chunks = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      for (const line of text.split('\n')) {
        if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
        try {
          const obj = JSON.parse(line.substring(6));
          const delta = obj.choices?.[0]?.delta;
          if (delta?.content) content += delta.content;
          if (delta?.reasoning_content) reasoning += delta.reasoning_content;
          chunks++;
        } catch {}
      }
    }
    return { status: resp.status, ttfb, content, reasoning, chunks, totalTime: Date.now() - start };
  } else {
    let body = await resp.text();
    if (body.trim().startsWith('data: ')) body = body.trim().substring(6);
    const obj = JSON.parse(body);
    const msg = obj.choices?.[0]?.message;
    return { status: resp.status, ttfb, content: msg?.content || '', reasoning: msg?.reasoning_content || '', totalTime: Date.now() - start };
  }
}

async function runVersionTest(version, fingerprint, sessionGen, uaList, jwt) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  Testing: ${version}`);
  console.log(`  Fingerprint: ${fingerprint.substring(0, 20)}...`);
  console.log(`${'='.repeat(70)}`);

  const results = [];

  for (const prompt of TEST_PROMPTS) {
    const session = sessionGen();
    const ua = getRandomUA(uaList);

    process.stdout.write(`  [${prompt.name}] `);

    try {
      const result = await chatRequest(jwt, prompt.messages, session, ua, true);
      const r = {
        name: prompt.name,
        status: result.status,
        ttfb: result.ttfb,
        totalTime: result.totalTime,
        contentLen: result.content.length,
        reasoningLen: result.reasoning.length,
        chunks: result.chunks || 0,
        error: result.error || null,
        content: result.content,
        reasoning: result.reasoning,
      };
      results.push(r);

      if (result.error) {
        console.log(`FAIL (HTTP ${result.status}): ${result.error.substring(0, 80)}`);
      } else {
        console.log(`OK | TTFB: ${result.ttfb}ms | Total: ${result.totalTime}ms | Content: ${result.content.length}ch | Reasoning: ${result.reasoning.length}ch | Chunks: ${result.chunks}`);
      }
    } catch (e) {
      results.push({ name: prompt.name, error: e.message, status: 0, ttfb: 0, totalTime: 0, contentLen: 0, reasoningLen: 0, chunks: 0, content: '', reasoning: '' });
      console.log(`ERROR: ${e.message}`);
    }

    await new Promise(r => setTimeout(r, 2000));
  }

  return results;
}

console.log('=== MiMoCode Auth Plugin v1 vs v2 Benchmark ===');
console.log(`Time: ${new Date().toISOString()}`);

console.log('\n--- Phase 1: Bootstrap ---');

const v1Fp = generateV1Fingerprint();
const v2Fp = generateV2Fingerprint();

console.log(`v1 fingerprint: ${v1Fp.substring(0, 20)}... (UUID-based)`);
console.log(`v2 fingerprint: ${v2Fp.substring(0, 20)}... (SHA256-based)`);

let v1Jwt, v2Jwt;
try {
  const t1 = Date.now();
  v1Jwt = await bootstrap(v1Fp);
  console.log(`v1 bootstrap: OK (${Date.now() - t1}ms, JWT ${v1Jwt.length}ch)`);
} catch (e) {
  console.log(`v1 bootstrap: FAIL - ${e.message}`);
}

try {
  const t2 = Date.now();
  v2Jwt = await bootstrap(v2Fp);
  console.log(`v2 bootstrap: OK (${Date.now() - t2}ms, JWT ${v2Jwt.length}ch)`);
} catch (e) {
  console.log(`v2 bootstrap: FAIL - ${e.message}`);
}

if (!v1Jwt || !v2Jwt) {
  console.log('\nBootstrap failed for one or both versions, aborting.');
  process.exit(1);
}

console.log('\n--- Phase 2: Chat Benchmark (streaming) ---');

const v1Results = await runVersionTest('v1 (UUID fingerprint, ses-{UUID})', v1Fp, generateV1Session, UAS.v1, v1Jwt);
const v2Results = await runVersionTest('v2 (SHA256 fingerprint, ses_<24ch>)', v2Fp, generateV2Session, UAS.v2, v2Jwt);

console.log('\n' + '='.repeat(70));
console.log('  COMPARISON SUMMARY');
console.log('='.repeat(70));

console.log('\n| Test | v1 TTFB | v1 Total | v2 TTFB | v2 Total | v1 Content | v2 Content | v1 Reason | v2 Reason |');
console.log('|------|---------|----------|---------|----------|------------|------------|-----------|-----------|');

for (let i = 0; i < TEST_PROMPTS.length; i++) {
  const v1 = v1Results[i];
  const v2 = v2Results[i];
  const v1Status = v1.error ? 'ERR' : `${v1.ttfb}ms`;
  const v2Status = v2.error ? 'ERR' : `${v2.ttfb}ms`;
  console.log(`| ${v1.name.padEnd(6)} | ${v1Status.padStart(7)} | ${String(v1.totalTime).padStart(8)}ms | ${v2Status.padStart(7)} | ${String(v2.totalTime).padStart(8)}ms | ${String(v1.contentLen).padStart(10)} | ${String(v2.contentLen).padStart(10)} | ${String(v1.reasoningLen).padStart(9)} | ${String(v2.reasoningLen).padStart(9)} |`);
}

console.log('\n--- Quality Samples (first 200 chars of each response) ---');
for (let i = 0; i < TEST_PROMPTS.length; i++) {
  console.log(`\n[${TEST_PROMPTS[i].name}]`);
  console.log(`  v1: ${(v1Results[i].content || 'ERROR').substring(0, 200)}`);
  console.log(`  v2: ${(v2Results[i].content || 'ERROR').substring(0, 200)}`);
}

const v1AvgTtfb = v1Results.filter(r => !r.error).reduce((s, r) => s + r.ttfb, 0) / v1Results.filter(r => !r.error).length;
const v2AvgTtfb = v2Results.filter(r => !r.error).reduce((s, r) => s + r.ttfb, 0) / v2Results.filter(r => !r.error).length;
const v1AvgTotal = v1Results.filter(r => !r.error).reduce((s, r) => s + r.totalTime, 0) / v1Results.filter(r => !r.error).length;
const v2AvgTotal = v2Results.filter(r => !r.error).reduce((s, r) => s + r.totalTime, 0) / v2Results.filter(r => !r.error).length;

console.log('\n--- Averages ---');
console.log(`  v1 Avg TTFB: ${Math.round(v1AvgTtfb)}ms | Avg Total: ${Math.round(v1AvgTotal)}ms`);
console.log(`  v2 Avg TTFB: ${Math.round(v2AvgTtfb)}ms | Avg Total: ${Math.round(v2AvgTotal)}ms`);
console.log(`  TTFB diff: ${v2AvgTtfb > v1AvgTtfb ? '+' : ''}${Math.round(v2AvgTtfb - v1AvgTtfb)}ms (${((v2AvgTtfb / v1AvgTtfb - 1) * 100).toFixed(1)}%)`);
console.log(`  Total diff: ${v2AvgTotal > v1AvgTotal ? '+' : ''}${Math.round(v2AvgTotal - v1AvgTotal)}ms (${((v2AvgTotal / v1AvgTotal - 1) * 100).toFixed(1)}%)`);
