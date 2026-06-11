import { request } from 'undici';
import { ProxyItem } from '../proxy-item';
import { BaseProxyProvider } from './base.provider';

/**
 * Port of `app/scraper/providers/groq_ai.py::GroqAIProvider`.
 * Uses the Groq LLM API to extract proxies from unstructured HTML pages.
 * The original implementation scrapes seed URLs (DuckDuckGo results) and
 * asks Groq to return JSON-formatted `ip:port` pairs.
 *
 * If `GROQ_API_KEY` is missing the provider becomes a no-op (returns []).
 * The list of seed URLs and the LLM prompt are kept identical to the
 * Python version so behaviour is comparable.
 */
const PROXY_RE = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):(\d{2,5})/g;

export class GroqAIProvider extends BaseProxyProvider {
  private readonly apiKey: string;
  private readonly model = 'llama-3.3-70b-versatile';
  private readonly seeds = [
    'https://www.sslproxies.org/',
    'https://free-proxy-list.net/',
    'https://www.socks-proxy.net/',
    'https://www.us-proxy.org/',
  ];

  constructor(apiKey: string) {
    super('GroqAI');
    this.apiKey = apiKey.trim();
  }

  async fetch(): Promise<ProxyItem[]> {
    if (!this.apiKey) {
      this.logger.warn('GROQ_API_KEY not set — provider disabled.');
      return [];
    }
    const out: ProxyItem[] = [];
    for (const seed of this.seeds) {
      try {
        const html = await this.fetchText(seed, 20_000);
        const extracted = await this.extractWithGroq(html);
        out.push(...extracted);
      } catch (e) {
        this.logger.debug(`Groq seed ${seed} failed: ${e}`);
      }
    }
    return out;
  }

  private async extractWithGroq(html: string): Promise<ProxyItem[]> {
    // Strip tags to keep prompt cheap
    const text = html
      .replace(/<script[\s\S]*?<\/script>/g, ' ')
      .replace(/<style[\s\S]*?<\/style>/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .slice(0, 15_000);

    const payload = {
      model: this.model,
      messages: [
        {
          role: 'system',
          content:
            'You are a proxy list extractor. Return only newline-separated ip:port pairs you find in the user message — no commentary.',
        },
        { role: 'user', content: text },
      ],
      temperature: 0,
    };

    const res = await request('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
      headersTimeout: 30_000,
      bodyTimeout: 30_000,
    });
    if (res.statusCode >= 400) return [];
    const json = (await res.body.json()) as any;
    const content = json?.choices?.[0]?.message?.content ?? '';
    const out: ProxyItem[] = [];
    let m: RegExpExecArray | null;
    PROXY_RE.lastIndex = 0;
    while ((m = PROXY_RE.exec(content)) !== null) {
      const port = parseInt(m[2], 10);
      if (port >= 1 && port <= 65535) {
        out.push({ ip: m[1], port, protocol: 'http', provider: this.name });
      }
    }
    return out;
  }
}
