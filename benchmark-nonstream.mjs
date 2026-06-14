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

async function chatNonStream(jwt, messages, sessionAffinity, ua) {
  const start = Date.now();
  const resp = await fetch(CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jwt}`,
      'X-Mimo-Source': 'mimocode-cli-free',
      'x-session-affinity': sessionAffinity,
      'Accept': 'application/json',
      'User-Agent': ua,
    },
    body: JSON.stringify({ model: 'mimo-auto', messages, stream: false }),
    signal: AbortSignal.timeout(120000),
  });

  const ttfb = Date.now() - start;

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    return { status: resp.status, ttfb, error: errText, content: '', reasoning: '', totalTime: Date.now() - start };
  }

  let body = await resp.text();
  let cleaned = false;
  if (body.trim().startsWith('data: ')) {
    body = body.trim().substring(6);
    cleaned = true;
  }

  let content = '';
  let reasoning = '';
  try {
    const obj = JSON.parse(body);
    const msg = obj.choices?.[0]?.message;
    content = msg?.content || '';
    reasoning = msg?.reasoning_content || '';
  } catch {
    content = body.substring(0, 200);
  }

  return { status: resp.status, ttfb, content, reasoning, cleaned, totalTime: Date.now() - start };
}

async function runVersionTest(version, fingerprint, sessionGen, uaList, jwt) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  Testing: ${version} (NON-STREAM)`);
  console.log(`${'='.repeat(70)}`);

  const results = [];

  for (const prompt of TEST_PROMPTS) {
    const session = sessionGen();
    const ua = getRandomUA(uaList);

    process.stdout.write(`  [${prompt.name}] `);

    try {
      const result = await chatNonStream(jwt, prompt.messages, session, ua);
      const r = {
        name: prompt.name,
        status: result.status,
        ttfb: result.ttfb,
        totalTime: result.totalTime,
        contentLen: result.content.length,
        reasoningLen: result.reasoning.length,
        cleaned: result.cleaned || false,
        error: result.error || null,
        content: result.content,
        reasoning: result.reasoning,
      };
      results.push(r);

      if (result.error) {
        console.log(`FAIL (HTTP ${result.status}): ${result.error.substring(0, 80)}`);
      } else {
        const cleanTag = result.cleaned ? ' [data: stripped]' : '';
        console.log(`OK | Total: ${result.totalTime}ms | Content: ${result.content.length}ch | Reasoning: ${result.reasoning.length}ch${cleanTag}`);
      }
    } catch (e) {
      results.push({ name: prompt.name, error: e.message, status: 0, ttfb: 0, totalTime: 0, contentLen: 0, reasoningLen: 0, cleaned: false, content: '', reasoning: '' });
      console.log(`ERROR: ${e.message}`);
    }

    await new Promise(r => setTimeout(r, 2000));
  }

  return results;
}

console.log('=== MiMoCode Auth Plugin v1 vs v2 NON-STREAM Benchmark ===');
console.log(`Time: ${new Date().toISOString()}`);

console.log('\n--- Phase 1: Bootstrap ---');

const v1Fp = generateV1Fingerprint();
const v2Fp = generateV2Fingerprint();

let v1Jwt, v2Jwt;
try {
  const t1 = Date.now();
  v1Jwt = await bootstrap(v1Fp);
  console.log(`v1 bootstrap: OK (${Date.now() - t1}ms)`);
} catch (e) {
  console.log(`v1 bootstrap: FAIL - ${e.message}`);
}

try {
  const t2 = Date.now();
  v2Jwt = await bootstrap(v2Fp);
  console.log(`v2 bootstrap: OK (${Date.now() - t2}ms)`);
} catch (e) {
  console.log(`v2 bootstrap: FAIL - ${e.message}`);
}

if (!v1Jwt || !v2Jwt) {
  console.log('\nBootstrap failed, aborting.');
  process.exit(1);
}

console.log('\n--- Phase 2: Non-Stream Benchmark ---');

const v1Results = await runVersionTest('v1 (UUID fingerprint, ses-{UUID})', v1Fp, generateV1Session, UAS.v1, v1Jwt);
const v2Results = await runVersionTest('v2 (SHA256 fingerprint, ses_<24ch>)', v2Fp, generateV2Session, UAS.v2, v2Jwt);

console.log('\n' + '='.repeat(70));
console.log('  NON-STREAM COMPARISON SUMMARY');
console.log('='.repeat(70));

console.log('\n| Test | v1 Total | v2 Total | v1 Content | v2 Content | v1 Reason | v2 Reason | v1 data:strip | v2 data:strip |');
console.log('|------|----------|----------|------------|------------|-----------|-----------|---------------|---------------|');

for (let i = 0; i < TEST_PROMPTS.length; i++) {
  const v1 = v1Results[i];
  const v2 = v2Results[i];
  console.log(`| ${v1.name.padEnd(6)} | ${String(v1.totalTime).padStart(8)}ms | ${String(v2.totalTime).padStart(8)}ms | ${String(v1.contentLen).padStart(10)} | ${String(v2.contentLen).padStart(10)} | ${String(v1.reasoningLen).padStart(9)} | ${String(v2.reasoningLen).padStart(9)} | ${String(v1.cleaned).padStart(13)} | ${String(v2.cleaned).padStart(13)} |`);
}

console.log('\n--- Quality Samples (first 300 chars) ---');
for (let i = 0; i < TEST_PROMPTS.length; i++) {
  console.log(`\n[${TEST_PROMPTS[i].name}]`);
  console.log(`  v1: ${(v1Results[i].content || 'ERROR').substring(0, 300)}`);
  console.log(`  v2: ${(v2Results[i].content || 'ERROR').substring(0, 300)}`);
  if (v1Results[i].reasoning || v2Results[i].reasoning) {
    console.log(`  v1 reasoning: ${(v1Results[i].reasoning || '').substring(0, 150)}`);
    console.log(`  v2 reasoning: ${(v2Results[i].reasoning || '').substring(0, 150)}`);
  }
}

const v1AvgTotal = v1Results.filter(r => !r.error).reduce((s, r) => s + r.totalTime, 0) / v1Results.filter(r => !r.error).length;
const v2AvgTotal = v2Results.filter(r => !r.error).reduce((s, r) => s + r.totalTime, 0) / v2Results.filter(r => !r.error).length;

console.log('\n--- Averages ---');
console.log(`  v1 Avg Total: ${Math.round(v1AvgTotal)}ms`);
console.log(`  v2 Avg Total: ${Math.round(v2AvgTotal)}ms`);
console.log(`  Diff: ${v2AvgTotal > v1AvgTotal ? '+' : ''}${Math.round(v2AvgTotal - v1AvgTotal)}ms (${((v2AvgTotal / v1AvgTotal - 1) * 100).toFixed(1)}%)`);
