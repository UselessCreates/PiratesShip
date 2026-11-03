

export const GROUPS = {
  free: { id: 'free', label: 'Free / local (no key)' },
  cloud: { id: 'cloud', label: 'Cloud (bring your own key)' },
  custom: { id: 'custom', label: 'Custom endpoint' },
};

const oa = (o) => ({ kind: 'openai', group: 'cloud', ...o });

export const PROVIDERS = [

  oa({
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'o4-mini'],
    keyUrl: 'https://platform.openai.com/api-keys',
  }),
  {
    id: 'anthropic',
    name: 'Anthropic · Claude',
    kind: 'anthropic',
    group: 'cloud',
    baseUrl: 'https://api.anthropic.com/v1',
    models: ['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-3-5-haiku-latest'],
    keyUrl: 'https://console.anthropic.com/settings/keys',
    notes: 'Best at long, structured HTML/CSS builds.',
  },
  {
    id: 'google',
    name: 'Google · Gemini',
    kind: 'google',
    group: 'cloud',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
    keyUrl: 'https://aistudio.google.com/app/apikey',
    notes: 'Generous free tier on AI Studio keys.',
  },
  oa({ id: 'xai', name: 'xAI · Grok', baseUrl: 'https://api.x.ai/v1', models: ['grok-4', 'grok-3-mini'], keyUrl: 'https://console.x.ai' }),
  oa({ id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', models: ['deepseek-chat', 'deepseek-reasoner'], keyUrl: 'https://platform.deepseek.com/api_keys' }),
  oa({ id: 'mistral', name: 'Mistral', baseUrl: 'https://api.mistral.ai/v1', models: ['mistral-large-latest', 'codestral-latest', 'mistral-small-latest'], keyUrl: 'https://console.mistral.ai/api-keys' }),
  oa({ id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', models: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'qwen/qwen3-32b'], keyUrl: 'https://console.groq.com/keys', notes: 'Very fast, free tier.' }),
  oa({ id: 'together', name: 'Together AI', baseUrl: 'https://api.together.xyz/v1', models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'Qwen/Qwen2.5-Coder-32B-Instruct'], keyUrl: 'https://api.together.xyz/settings/api-keys' }),
  oa({ id: 'fireworks', name: 'Fireworks AI', baseUrl: 'https://api.fireworks.ai/inference/v1', models: ['accounts/fireworks/models/llama-v3p3-70b-instruct'], keyUrl: 'https://fireworks.ai/account/api-keys' }),
  oa({ id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', models: ['deepseek/deepseek-chat-v3.1:free', 'z-ai/glm-4.5-air:free', 'anthropic/claude-sonnet-4.5'], keyUrl: 'https://openrouter.ai/keys', notes: 'One key, hundreds of models, several :free.' }),
  oa({ id: 'perplexity', name: 'Perplexity', baseUrl: 'https://api.perplexity.ai', models: ['sonar-pro', 'sonar'], keyUrl: 'https://www.perplexity.ai/settings/api' }),
  oa({ id: 'cerebras', name: 'Cerebras', baseUrl: 'https://api.cerebras.ai/v1', models: ['llama3.1-8b', 'qwen-3-235b-a22b-instruct-2507'], keyUrl: 'https://cloud.cerebras.ai' }),
  oa({ id: 'sambanova', name: 'SambaNova', baseUrl: 'https://api.sambanova.ai/v1', models: ['Meta-Llama-3.3-70B-Instruct', 'DeepSeek-R1'], keyUrl: 'https://cloud.sambanova.ai/apis' }),
  oa({ id: 'hyperbolic', name: 'Hyperbolic', baseUrl: 'https://api.hyperbolic.xyz/v1', models: ['meta-llama/Llama-3.3-70B-Instruct'], keyUrl: 'https://app.hyperbolic.xyz/settings' }),
  oa({ id: 'deepinfra', name: 'DeepInfra', baseUrl: 'https://api.deepinfra.com/v1/openai', models: ['meta-llama/Llama-3.3-70B-Instruct', 'Qwen/Qwen2.5-Coder-32B-Instruct'], keyUrl: 'https://deepinfra.com/dash/api_keys' }),
  oa({ id: 'novita', name: 'Novita AI', baseUrl: 'https://api.novita.ai/v3/openai', models: ['deepseek/deepseek-v3', 'meta-llama/llama-3.3-70b-instruct'], keyUrl: 'https://novita.ai/settings/key-management' }),
  oa({ id: 'nvidia', name: 'NVIDIA NIM', baseUrl: 'https://integrate.api.nvidia.com/v1', models: ['meta/llama-3.3-70b-instruct', 'deepseek-ai/deepseek-r1'], keyUrl: 'https://build.nvidia.com' }),
  oa({ id: 'github', name: 'GitHub Models', baseUrl: 'https://models.github.ai/inference', models: ['openai/gpt-4.1', 'openai/gpt-4o-mini'], keyUrl: 'https://github.com/settings/tokens', notes: 'Free with a GitHub personal access token.' }),
  oa({ id: 'llama', name: 'Meta Llama API', baseUrl: 'https://api.llama.com/compat/v1', models: ['Llama-4-Maverick-17B-128E-Instruct-FP8'], keyUrl: 'https://llama.developer.meta.com' }),
  oa({ id: 'qwen', name: 'Alibaba · Qwen', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', models: ['qwen3-coder-plus', 'qwen-max'], keyUrl: 'https://bailian.console.alibabacloud.com' }),
  oa({ id: 'moonshot', name: 'Moonshot · Kimi', baseUrl: 'https://api.moonshot.ai/v1', models: ['kimi-k2-0905-preview', 'moonshot-v1-128k'], keyUrl: 'https://platform.moonshot.ai/console/api-keys' }),
  oa({ id: 'zhipu', name: 'Z.ai · GLM', baseUrl: 'https://api.z.ai/api/paas/v4', models: ['glm-4.6', 'glm-4.5-air'], keyUrl: 'https://z.ai/manage-apikey/apikey-list' }),
  oa({ id: 'minimax', name: 'MiniMax', baseUrl: 'https://api.minimax.io/v1', models: ['MiniMax-M2', 'MiniMax-Text-01'], keyUrl: 'https://platform.minimaxi.com' }),
  oa({ id: 'baidu', name: 'Baidu · Qianfan', baseUrl: 'https://qianfan.baidubce.com/v2', models: ['ernie-4.5-turbo-128k'], keyUrl: 'https://console.bce.baidu.com/iam/#/iam/apikey/list' }),
  oa({ id: 'upstage', name: 'Upstage · Solar', baseUrl: 'https://api.upstage.ai/v1', models: ['solar-pro2'], keyUrl: 'https://console.upstage.ai/api-keys' }),
  oa({ id: 'aimlapi', name: 'AI/ML API', baseUrl: 'https://api.aimlapi.com/v1', models: ['gpt-4o', 'claude-sonnet-4-20250514'], keyUrl: 'https://aimlapi.com/app/keys' }),
  oa({ id: 'requesty', name: 'Requesty Router', baseUrl: 'https://router.requesty.ai/v1', models: ['openai/gpt-4.1', 'anthropic/claude-sonnet-4.5'], keyUrl: 'https://app.requesty.ai/api-keys' }),
  oa({ id: 'chutes', name: 'Chutes', baseUrl: 'https://llm.chutes.ai/v1', models: ['deepseek-ai/DeepSeek-V3'], keyUrl: 'https://chutes.ai/app/api' }),
  oa({ id: 'kluster', name: 'Kluster AI', baseUrl: 'https://api.kluster.ai/v1', models: ['klusterai/Meta-Llama-3.3-70B-Instruct-Turbo'], keyUrl: 'https://platform.kluster.ai/apikeys' }),
  oa({ id: 'lambda', name: 'Lambda Inference', baseUrl: 'https://api.lambda.ai/v1', models: ['llama3.3-70b-instruct-fp8'], keyUrl: 'https://cloud.lambda.ai/api-keys' }),
  oa({ id: 'huggingface', name: 'Hugging Face Router', baseUrl: 'https://router.huggingface.co/v1', models: ['deepseek-ai/DeepSeek-V3-0324', 'Qwen/Qwen3-235B-A22B'], keyUrl: 'https://huggingface.co/settings/tokens', notes: 'Free monthly credits on the free tier.' }),
  {
    id: 'azure',
    name: 'Azure OpenAI',
    kind: 'openai',
    group: 'cloud',
    baseUrl: 'https://YOUR-RESOURCE.openai.azure.com/openai/v1',
    models: ['gpt-4.1'],
    keyUrl: 'https://portal.azure.com',
    notes: 'Put your resource endpoint in the base URL field.',
    baseUrlEditable: true,
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare Workers AI',
    kind: 'openai',
    group: 'cloud',
    baseUrl: 'https://api.cloudflare.com/client/v4/accounts/{account}/ai/v1',
    models: ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/qwen/qwen2.5-coder-32b-instruct'],
    keyUrl: 'https://dash.cloudflare.com/profile/api-tokens',
    baseUrlEditable: true,
    extraFields: [{ key: 'account', label: 'Account ID', placeholder: '32-char account id', required: true }],
    notes: 'Free daily allocation. Replace {account} automatically from Account ID.',
  },

  {
    id: 'pollinations',
    name: 'Pollinations · free, no key',
    kind: 'openai',
    group: 'free',
    baseUrl: 'https://text.pollinations.ai/openai',
    models: ['openai', 'mistral', 'qwen-coder'],
    keyRequired: false,
    notes: 'Completely free, no signup. Slow and rate-limited — good for testing the flow.',
  },
  {
    id: 'ollama',
    name: 'Ollama · local models',
    kind: 'ollama',
    group: 'free',
    baseUrl: 'http://127.0.0.1:11434',
    models: ['qwen2.5-coder:7b', 'llama3.2:3b', 'deepseek-coder-v2:16b'],
    keyRequired: false,
    local: true,
    notes: 'Runs on your GPU/CPU. Nothing leaves the machine.',
  },
  {
    id: 'lmstudio',
    name: 'LM Studio · local server',
    kind: 'openai',
    group: 'free',
    baseUrl: 'http://127.0.0.1:1234/v1',
    models: ['local-model'],
    keyRequired: false,
    local: true,
    notes: 'Start LM Studio → Developer → Start server.',
  },
  {
    id: 'llamacpp',
    name: 'llama.cpp server',
    kind: 'openai',
    group: 'free',
    baseUrl: 'http://127.0.0.1:8080/v1',
    models: ['local-model'],
    keyRequired: false,
    local: true,
  },
  {
    id: 'vllm',
    name: 'vLLM',
    kind: 'openai',
    group: 'free',
    baseUrl: 'http://127.0.0.1:8000/v1',
    models: ['local-model'],
    keyRequired: false,
    local: true,
  },
  {
    id: 'jan',
    name: 'Jan',
    kind: 'openai',
    group: 'free',
    baseUrl: 'http://127.0.0.1:1337/v1',
    models: ['local-model'],
    keyRequired: false,
    local: true,
  },
  {
    id: 'textgen',
    name: 'text-generation-webui',
    kind: 'openai',
    group: 'free',
    baseUrl: 'http://127.0.0.1:5000/v1',
    models: ['local-model'],
    keyRequired: false,
    local: true,
  },
  {
    id: 'none',
    name: 'No model · offline builder',
    kind: 'none',
    group: 'free',
    baseUrl: '',
    models: [],
    keyRequired: false,
    notes: 'Recon + a real scaffold built from the dossier, no AI calls at all. 100% free.',
  },

  {
    id: 'custom',
    name: 'Custom OpenAI-compatible',
    kind: 'openai',
    group: 'custom',
    baseUrl: '',
    models: [''],
    keyRequired: false,
    baseUrlEditable: true,
    notes: 'Any /chat/completions endpoint: LiteLLM, LocalAI, oMLX, your own proxy…',
  },
];

export function getProvider(id) {
  return PROVIDERS.find((p) => p.id === id) || PROVIDERS[PROVIDERS.length - 1];
}

export function publicProvider(p) {
  return {
    id: p.id,
    name: p.name,
    kind: p.kind,
    group: p.group,
    baseUrl: p.baseUrl,
    models: p.models,
    keyUrl: p.keyUrl || null,
    keyRequired: p.keyRequired !== false,
    local: !!p.local,
    notes: p.notes || '',
    baseUrlEditable: !!p.baseUrlEditable,
    extraFields: p.extraFields || [],
  };
}

function resolveBase(provider, baseUrlOverride, extra = {}) {
  let base = (baseUrlOverride || provider.baseUrl || '').trim().replace(/\/+$/, '');
  if (!base) throw new Error('This provider needs a base URL.');
  if (base.includes('{account}')) {
    const account = (extra.account || '').trim();
    if (!account) throw new Error('This provider needs your Account ID.');
    base = base.replace('{account}', encodeURIComponent(account));
  }
  return base;
}

function trimMessages(messages, limit = 60) {
  const keep = messages.filter((m) => m && m.content);
  if (keep.length <= limit) return keep;
  return [keep[0], ...keep.slice(keep.length - (limit - 1))];
}

const SYSTEM_PROVIDER_HINT =
  'You are the build engine inside PiratesShip, a desktop tool that recreates sites, apps and games from reconstruction research.';

export async function chat({
  providerId,
  apiKey,
  baseUrl,
  extra = {},
  model,
  messages,
  temperature = 0.4,
  maxTokens = 8192,
  timeoutMs = 240000,
  signal,
}) {
  const provider = getProvider(providerId);
  const msgs = trimMessages(messages);
  if (!msgs.length) throw new Error('Nothing to send.');
  const chosenModel = (model || provider.models[0] || '').trim();

  const timeout = AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined;
  const combined = signal && timeout && AbortSignal.any ? AbortSignal.any([signal, timeout]) : signal || timeout;

  const withSystem = msgs.some((m) => m.role === 'system')
    ? msgs
    : [{ role: 'system', content: SYSTEM_PROVIDER_HINT }, ...msgs];

  if (provider.kind === 'none') throw new Error('No model selected (offline builder).');

  if (provider.kind === 'anthropic') {
    if (!apiKey) throw new Error('Anthropic needs an API key.');
    const system = withSystem.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const body = {
      model: chosenModel || 'claude-sonnet-4-5',
      max_tokens: Math.min(maxTokens, 16000),
      temperature,
      system,
      messages: withSystem
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content) })),
    };
    const res = await fetch(`${resolveBase(provider, baseUrl)}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: combined,
    });
    const data = await readJsonSafe(res);
    if (!res.ok) throw providerError(provider, res, data);
    const text = (data.content || [])
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('')
      .trim();
    return { text, usage: data.usage, model: data.model };
  }

  if (provider.kind === 'google') {
    if (!apiKey) throw new Error('Gemini needs an API key.');
    const system = withSystem.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const body = {
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      contents: withSystem
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: String(m.content) }],
        })),
      generationConfig: { temperature, maxOutputTokens: Math.min(maxTokens, 32000) },
    };
    const url = `${resolveBase(provider, baseUrl)}/models/${encodeURIComponent(
      chosenModel || 'gemini-2.5-flash'
    )}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: combined,
    });
    const data = await readJsonSafe(res);
    if (!res.ok) throw providerError(provider, res, data);
    const text = (data.candidates?.[0]?.content?.parts || [])
      .map((p) => p.text || '')
      .join('')
      .trim();
    return { text, usage: data.usageMetadata, model: chosenModel };
  }

  if (provider.kind === 'ollama') {
    const body = {
      model: chosenModel || 'qwen2.5-coder:7b',
      messages: withSystem.map((m) => ({ role: m.role, content: String(m.content) })),
      stream: false,
      options: { temperature },
    };
    const res = await fetch(`${resolveBase(provider, baseUrl)}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: combined,
    });
    const data = await readJsonSafe(res);
    if (!res.ok) throw providerError(provider, res, data);
    return { text: (data.message?.content || '').trim(), model: data.model };
  }

  const base = resolveBase(provider, baseUrl, extra);
  const headers = { 'content-type': 'application/json' };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  if (providerId === 'openrouter') {
    headers['HTTP-Referer'] = 'https://piratesship.local';
    headers['X-Title'] = 'PiratesShip';
  }
  const body = {
    model: chosenModel,
    messages: withSystem.map((m) => ({ role: m.role, content: String(m.content) })),
    temperature,
    max_tokens: maxTokens,
    stream: false,
  };
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: combined,
  });
  const data = await readJsonSafe(res);
  if (!res.ok) throw providerError(provider, res, data);
  const choice = data.choices?.[0];
  const text = (choice?.message?.content ?? choice?.text ?? '').toString().trim();
  if (!text) throw new Error(`${provider.name} returned an empty completion.`);
  return { text, usage: data.usage, model: data.model };
}

export async function listModels({ providerId, apiKey, baseUrl, extra = {} }) {
  const provider = getProvider(providerId);
  const timeout = AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined;
  if (provider.kind === 'ollama') {
    const res = await fetch(`${resolveBase(provider, baseUrl)}/api/tags`, { signal: timeout });
    const data = await readJsonSafe(res);
    if (!res.ok) throw providerError(provider, res, data);
    return (data.models || []).map((m) => m.name);
  }
  if (provider.kind === 'google') {
    const res = await fetch(
      `${resolveBase(provider, baseUrl)}/models?key=${encodeURIComponent(apiKey || '')}`,
      { signal: timeout }
    );
    const data = await readJsonSafe(res);
    if (!res.ok) throw providerError(provider, res, data);
    return (data.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => String(m.name).replace(/^models\//, ''));
  }
  if (provider.kind === 'anthropic') {
    const res = await fetch(`${resolveBase(provider, baseUrl)}/models`, {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      signal: timeout,
    });
    const data = await readJsonSafe(res);
    if (!res.ok) throw providerError(provider, res, data);
    return (data.data || []).map((m) => m.id);
  }
  const headers = {};
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  const res = await fetch(`${resolveBase(provider, baseUrl, extra)}/models`, { headers, signal: timeout });
  const data = await readJsonSafe(res);
  if (!res.ok) throw providerError(provider, res, data);
  const list = data.data || data.models || [];
  return list.map((m) => m.id || m.name).filter(Boolean).sort();
}

async function readJsonSafe(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 800) };
  }
}

function providerError(provider, res, data) {
  const detail =
    data?.error?.message ||
    data?.error?.type ||
    data?.message ||
    (typeof data?.error === 'string' ? data.error : '') ||
    data?.raw ||
    '';
  const hint =
    res.status === 401 || res.status === 403
      ? ' — the key looks wrong or lacks access.'
      : res.status === 429
        ? ' — rate limited. Wait a moment or pick another model.'
        : res.status === 404
          ? ' — endpoint or model id not found.'
          : '';
  return new Error(`${provider.name}: HTTP ${res.status}${hint}${detail ? ` ${String(detail).slice(0, 300)}` : ''}`);
}

export async function testProvider(cfg) {
  const started = Date.now();
  const out = await chat({
    ...cfg,
    messages: [{ role: 'user', content: 'Reply with exactly: ok' }],
    maxTokens: 16,
    temperature: 0,
    timeoutMs: 45000,
  });
  return { ok: true, ms: Date.now() - started, text: (out.text || '').slice(0, 80) };
}
