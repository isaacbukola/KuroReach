import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import dns from 'dns/promises';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  DeliverabilityAlert,
  DeliverabilityReport,
  EmailIdea,
  ExtensionOutreachJob,
  Lead,
  SequenceStep,
  TrackedEmail,
} from './src/types.ts';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const STORE_PATH = path.resolve(process.cwd(), '.kuroreach-data.json');

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// 1x1 transparent PNG pixel
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

interface StoreData {
  leads: Lead[];
  trackedEmails: TrackedEmail[];
  deliverabilityCache: Record<string, DeliverabilityReport>;
  alerts: DeliverabilityAlert[];
  extensionOutreachJobs: ExtensionOutreachJob[];
}

const DEFAULT_LEADS: Lead[] = [
  {
    id: 'lead_seed_1',
    firstName: 'Elena',
    lastName: 'Vance',
    fullName: 'Elena Vance',
    email: 'elena@vergecloud.io',
    role: 'VP of Revenue Operations',
    company: 'VergeCloud Systems',
    domain: 'vergecloud.io',
    website: 'https://vergecloud.io',
    linkedinUrl: 'https://linkedin.com/in/elenavance',
    location: 'San Francisco, CA',
    source: 'Series B Cloud Infrastructure Index',
    sourceMode: 'search',
    icebreaker: 'Noticed VergeCloud expanded enterprise observability seats by 40% after your Q3 SOC2 announcement.',
    painPoint: 'Manual outbound SDR handoffs slowing enterprise pipeline velocity',
    fitScore: 94,
    mxValid: true,
    status: 'new',
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: 'lead_seed_2',
    firstName: 'Marcus',
    lastName: 'Chen',
    fullName: 'Marcus Chen',
    email: 'm.chen@atelierforma.co',
    role: 'Managing Partner',
    company: 'Atelier Forma',
    domain: 'atelierforma.co',
    website: 'https://atelierforma.co',
    linkedinUrl: 'https://linkedin.com/in/marcuschen',
    location: 'New York, NY',
    source: 'Architectural Design Partners Directory',
    sourceMode: 'url',
    icebreaker: 'Your recent adaptive reuse commission in Tribeca stood out for its zero-carbon facade detailing.',
    painPoint: 'Inconsistent inbound RFP flow from commercial real estate developers',
    fitScore: 89,
    mxValid: true,
    status: 'queued',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 'lead_seed_3',
    firstName: 'Priya',
    lastName: 'Natarajan',
    fullName: 'Priya Natarajan',
    email: 'priya@kinetixbio.com',
    role: 'Head of Commercial Partnerships',
    company: 'Kinetix Biometrics',
    domain: 'kinetixbio.com',
    website: 'https://kinetixbio.com',
    linkedinUrl: 'https://linkedin.com/in/priyanatarajan',
    location: 'Boston, MA',
    source: 'Extension DOM Capture',
    sourceMode: 'extension',
    icebreaker: 'Saw Kinetix presenting clinical wearable telemetry benchmarks at BioData East.',
    painPoint: 'Reaching hospital procurement directors without triggering spam filters',
    fitScore: 91,
    mxValid: true,
    status: 'new',
    createdAt: new Date(Date.now() - 43200000).toISOString(),
  },
];

function readStore(): StoreData {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<StoreData>;
      return {
        leads: Array.isArray(parsed.leads) ? parsed.leads : DEFAULT_LEADS,
        trackedEmails: Array.isArray(parsed.trackedEmails) ? parsed.trackedEmails : [],
        deliverabilityCache: parsed.deliverabilityCache ?? {},
        alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [],
        extensionOutreachJobs: Array.isArray(parsed.extensionOutreachJobs)
          ? parsed.extensionOutreachJobs
          : [],
      };
    }
  } catch {
    // Fallback to defaults
  }
  return {
    leads: DEFAULT_LEADS,
    trackedEmails: [],
    deliverabilityCache: {},
    alerts: [],
    extensionOutreachJobs: [],
  };
}

function writeStore(data: StoreData) {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to persist store:', err);
  }
}

async function checkDomainMx(domain: string): Promise<boolean> {
  if (!domain || !domain.includes('.')) return false;
  try {
    const records = await Promise.race([
      dns.resolveMx(domain),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500)),
    ]);
    return Array.isArray(records) && records.length > 0;
  } catch {
    return false;
  }
}

async function inspectDeliverability(domainInput: string): Promise<DeliverabilityReport> {
  const domain = domainInput.trim().toLowerCase().replace(/^.*@/, '').replace(/^https?:\/\//, '').split('/')[0];

  const withTimeout = <T,>(promise: Promise<T>, ms = 3500): Promise<T | null> =>
    Promise.race([promise, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]).catch(() => null);

  const [mxRecordsRaw, rootTxtRaw, dmarcTxtRaw] = await Promise.all([
    withTimeout(dns.resolveMx(domain)),
    withTimeout(dns.resolveTxt(domain)),
    withTimeout(dns.resolveTxt(`_dmarc.${domain}`)),
  ]);

  const mxRecords = (mxRecordsRaw ?? [])
    .sort((a, b) => a.priority - b.priority)
    .map((r) => `${r.exchange} (pri ${r.priority})`);
  const mxValid = mxRecords.length > 0;

  let provider = 'Custom / Unknown MX';
  const joinedMx = mxRecords.join(' ').toLowerCase();
  if (joinedMx.includes('google') || joinedMx.includes('gmail')) provider = 'Google Workspace / Gmail';
  else if (joinedMx.includes('outlook') || joinedMx.includes('protection.outlook')) provider = 'Microsoft 365';
  else if (joinedMx.includes('proton')) provider = 'Proton Mail';
  else if (joinedMx.includes('zoho')) provider = 'Zoho Mail';

  const rootTxtStrings = (rootTxtRaw ?? []).map((chunks) => chunks.join(''));
  const spfRecord = rootTxtStrings.find((txt) => txt.toLowerCase().startsWith('v=spf1')) ?? null;
  const spfValid = Boolean(spfRecord);

  const dmarcTxtStrings = (dmarcTxtRaw ?? []).map((chunks) => chunks.join(''));
  const dmarcRecord = dmarcTxtStrings.find((txt) => txt.toLowerCase().startsWith('v=dmarc1')) ?? null;
  const dmarcValid = Boolean(dmarcRecord);
  const policyMatch = dmarcRecord?.match(/p=([a-z]+)/i);
  const dmarcPolicy = policyMatch ? policyMatch[1].toLowerCase() : null;

  // Check common DKIM selectors
  const selectors = ['google', 'selector1', 'selector2', 'default', 'k1', 'dkim'];
  let selectorFound: string | null = null;
  const dkimChecks = await Promise.all(
    selectors.map(async (sel) => {
      const res = await withTimeout(dns.resolveTxt(`${sel}._domainkey.${domain}`), 2000);
      return { sel, found: Array.isArray(res) && res.length > 0 };
    })
  );
  for (const check of dkimChecks) {
    if (check.found) {
      selectorFound = check.sel;
      break;
    }
  }
  // gmail.com consumer accounts have Google-managed DKIM
  const dkimValid = Boolean(selectorFound) || domain === 'gmail.com';

  let score = 0;
  if (mxValid) score += 30;
  if (spfValid) score += 25;
  if (dmarcValid) score += 25;
  if (dkimValid) score += 20;

  const recommendations: string[] = [];
  if (!mxValid) {
    recommendations.push(`No MX records detected for ${domain}. Configure MX routing before sending.`);
  }
  if (!spfValid) {
    recommendations.push(`Publish an SPF TXT record on ${domain} (e.g., v=spf1 include:_spf.google.com ~all).`);
  }
  if (!dmarcValid) {
    recommendations.push(`Add a _dmarc.${domain} TXT record starting with p=none or p=quarantine to pass Gmail bulk sender requirements.`);
  } else if (dmarcPolicy === 'none') {
    recommendations.push(`DMARC policy on ${domain} is p=none. Gradually tighten to p=quarantine for higher inbox placement.`);
  }
  if (!dkimValid) {
    recommendations.push(`Enable DKIM signing in Google Workspace Admin and publish the google._domainkey TXT record.`);
  }
  if (domain === 'gmail.com') {
    recommendations.push('Free @gmail.com mailboxes are capped around 500 sends/day. For 2,000/day outreach, connect Google Workspace custom domain mailboxes across all 3 slots.');
  }
  if (recommendations.length === 0) {
    recommendations.push(`All authentication records (MX, SPF, DKIM, DMARC) pass on ${domain}. Rotate sends across 3 warmed slots with 25-45s jitter.`);
  }

  let grade: DeliverabilityReport['grade'] = 'DNS Action Required';
  if (score >= 90 && domain !== 'gmail.com') grade = 'Ready for High Volume';
  else if (score >= 70) grade = 'Warmup Recommended';

  return {
    domain,
    checkedAt: new Date().toISOString(),
    mx: { valid: mxValid, records: mxRecords, provider },
    spf: { valid: spfValid, record: spfRecord },
    dmarc: { valid: dmarcValid, policy: dmarcPolicy, record: dmarcRecord },
    dkim: { valid: dkimValid, selectorFound: domain === 'gmail.com' ? 'google-managed' : selectorFound },
    score,
    grade,
    recommendations,
  };
}

function safeParseJson<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1].trim()) as T;
      } catch {
        // continue
      }
    }
    const arrayMatch = raw.match(/\[[\s\S]*\]/);
    if (arrayMatch?.[0]) {
      try {
        return JSON.parse(arrayMatch[0]) as T;
      } catch {
        // continue
      }
    }
    const objMatch = raw.match(/\{[\s\S]*\}/);
    if (objMatch?.[0]) {
      try {
        return JSON.parse(objMatch[0]) as T;
      } catch {
        // continue
      }
    }
    return fallback;
  }
}

function isQuotaError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return msg.includes('429') || msg.includes('resource_exhausted') || msg.includes('quota');
}

function isRetryableAiError(err: unknown): boolean {
  if (isQuotaError(err)) return true;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('503') ||
    msg.includes('unavailable') ||
    msg.includes('high demand') ||
    msg.includes('overloaded') ||
    msg.includes('502') ||
    msg.includes('504') ||
    msg.includes('timeout')
  );
}

function formatAiError(err: unknown, fallback: string): { status: number; message: string } {
  if (isQuotaError(err)) {
    return {
      status: 429,
      message:
        'Gemini API quota limit reached (429). Wait a moment before retrying, or select a billing-enabled API key in Settings > Secrets for higher limits.',
    };
  }
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (msg.includes('503') || msg.includes('unavailable') || msg.includes('high demand')) {
    return {
      status: 503,
      message:
        'AI models are experiencing temporary high demand (503). Wait a few seconds and click Scrape Leads again.',
    };
  }
  return {
    status: 500,
    message: err instanceof Error ? err.message : fallback,
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function generateWithFallback(params: {
  contents: string;
  systemInstruction?: string;
  responseMimeType?: string;
  responseSchema?: unknown;
  useGoogleSearch?: boolean;
  thinkingLevel?: ThinkingLevel;
}) {
  const buildConfig = (model: 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite', allowSearch: boolean) => {
    const config: Record<string, unknown> = {
      thinkingConfig: {
        thinkingLevel:
          model === 'gemini-4-hydrogen'
            ? params.thinkingLevel ?? ThinkingLevel.LOW
            : ThinkingLevel.MINIMAL,
      },
    };
    if (params.systemInstruction) config.systemInstruction = params.systemInstruction;
    if (params.responseMimeType && !allowSearch) config.responseMimeType = params.responseMimeType;
    if (params.responseSchema && !allowSearch) config.responseSchema = params.responseSchema;
    if (allowSearch) config.tools = [{ googleSearch: {} }];
    return config;
  };

  const attempts: Array<{ model: 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite'; allowSearch: boolean; delayMs: number }> = [
    { model: 'gemini-4-hydrogen', allowSearch: Boolean(params.useGoogleSearch), delayMs: 0 },
    { model: 'gemini-3.1-flash-lite', allowSearch: Boolean(params.useGoogleSearch), delayMs: 1200 },
    { model: 'gemini-4-hydrogen', allowSearch: false, delayMs: 2200 },
    { model: 'gemini-3.1-flash-lite', allowSearch: false, delayMs: 3000 },
  ];

  let lastErr: unknown;
  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    if (attempt.delayMs > 0) await sleep(attempt.delayMs);
    try {
      return await ai.models.generateContent({
        model: attempt.model,
        contents: params.contents,
        config: buildConfig(attempt.model, attempt.allowSearch),
      });
    } catch (err) {
      lastErr = err;
      console.warn(`Gemini attempt ${i + 1} (${attempt.model}, search=${attempt.allowSearch}) failed:`, err instanceof Error ? err.message : err);
      if (!isRetryableAiError(err) && i === 0 && !attempt.allowSearch) {
        throw err;
      }
    }
  }
  throw lastErr;
}

async function fetchPageTextAndEmails(url: string): Promise<{ text: string; emails: string[] }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KuroReachBot/1.0)' },
    });
    const html = await res.text();
    const mailtos = Array.from(html.matchAll(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi)).map(
      (m) => m[1].toLowerCase()
    );
    const plainText = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const textEmails = (plainText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? []).map((e) =>
      e.toLowerCase()
    );
    const uniqueEmails = Array.from(new Set([...mailtos, ...textEmails])).filter(
      (e) => !e.endsWith('.png') && !e.endsWith('.jpg') && !e.includes('example.')
    );
    return { text: plainText.slice(0, 30000), emails: uniqueEmails.slice(0, 200) };
  } catch {
    return { text: '', emails: [] };
  } finally {
    clearTimeout(timeout);
  }
}

function extractFallbackRegexLeads(
  rawText: string,
  defaultSourceLabel: string,
  sourceMode: Lead['sourceMode'],
  structuredItems?: Array<Partial<Lead> & { sourceSnippet?: string }>,
  maxCount = 200
): Lead[] {
  const limit = Math.min(Math.max(maxCount, 1), 200);
  const fromStructured: Lead[] = (structuredItems ?? [])
    .filter((item) => item.email || item.company || item.phone || item.website)
    .slice(0, limit)
    .map((item) => {
      const email = (item.email || '').trim().toLowerCase();
      let domain = '';
      if (email.includes('@')) {
        domain = email.split('@')[1] || '';
      } else if (item.website) {
        try {
          domain = new URL(item.website).hostname.replace(/^www\./, '');
        } catch {
          domain = '';
        }
      }
      const company = (item.company || item.fullName || domain || 'Local Business').trim();
      return {
        id: `lead_${crypto.randomBytes(5).toString('hex')}`,
        firstName: (item.fullName || company).split(' ')[0] || 'Team',
        lastName: '',
        fullName: (item.fullName || company).trim(),
        email,
        role: item.role?.trim() || 'Business Contact',
        company,
        domain,
        website: item.website?.trim() || (domain ? `https://${domain}` : ''),
        phone: item.phone?.trim() || '',
        location: item.location?.trim() || '',
        source: defaultSourceLabel,
        sourceMode,
        icebreaker: item.sourceSnippet
          ? `Found ${company} listed via ${item.sourceSnippet.slice(0, 90)}.`
          : `Reaching out to ${company} regarding customer growth.`,
        painPoint: 'Automating B2B / wholesale partner acquisition',
        fitScore: 80,
        mxValid: null,
        status: 'new',
        createdAt: new Date().toISOString(),
      };
    });

  if (fromStructured.length > 0) return fromStructured;

  const matches = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [];
  const unique = Array.from(new Set(matches.map((e) => e.toLowerCase()))).slice(0, limit);
  return unique.map((email) => {
    const [local, dom] = email.split('@');
    const namePart = local.split(/[._-]/)[0] || 'Team';
    const firstName = namePart.charAt(0).toUpperCase() + namePart.slice(1);
    return {
      id: `lead_${crypto.randomBytes(5).toString('hex')}`,
      firstName,
      lastName: '',
      fullName: firstName,
      email,
      role: 'Contact',
      company: dom.split('.')[0].charAt(0).toUpperCase() + dom.split('.')[0].slice(1),
      domain: dom,
      website: `https://${dom}`,
      source: defaultSourceLabel,
      sourceMode,
      icebreaker: `Reaching out regarding ${dom}'s current initiatives.`,
      painPoint: 'Scaling qualified outbound acquisition',
      fitScore: 78,
      mxValid: null,
      status: 'new',
      createdAt: new Date().toISOString(),
    };
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // Allow Chrome Extension requests (including credentials from chrome-extension:// origins)
  app.use('/api/extension', (req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    next();
  });

  app.options('/api/extension/*', (_req, res) => {
    res.sendStatus(204);
  });

  // Health
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  // Leads CRUD
  app.get('/api/leads', (_req, res) => {
    const store = readStore();
    res.json({ leads: store.leads });
  });

  app.post('/api/leads', (req, res) => {
    const { leads } = req.body as { leads?: Lead[] };
    if (!Array.isArray(leads)) {
      res.status(400).json({ error: 'leads array required' });
      return;
    }
    const store = readStore();
    const leadKey = (l: Partial<Lead>) =>
      l.email && l.email.includes('@')
        ? l.email.toLowerCase()
        : `${(l.company || '').toLowerCase()}::${(l.phone || l.website || l.id || '').toLowerCase()}`;
    const existingKeys = new Set(store.leads.map((l) => leadKey(l)));
    const added: Lead[] = [];
    for (const item of leads) {
      if (!item.email && !item.company) continue;
      const key = leadKey(item);
      if (!existingKeys.has(key)) {
        existingKeys.add(key);
        added.push(item);
      }
    }
    store.leads = [...added, ...store.leads];
    writeStore(store);
    res.json({ addedCount: added.length, leads: store.leads });
  });

  app.patch('/api/leads/:id', (req, res) => {
    const { id } = req.params;
    const patch = req.body as Partial<Lead>;
    const store = readStore();
    store.leads = store.leads.map((l) => (l.id === id ? { ...l, ...patch } : l));
    writeStore(store);
    res.json({ leads: store.leads });
  });

  app.delete('/api/leads/:id', (req, res) => {
    const { id } = req.params;
    const store = readStore();
    store.leads = store.leads.filter((l) => l.id !== id);
    writeStore(store);
    res.json({ leads: store.leads });
  });

  const LEAD_SCHEMA = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        firstName: { type: Type.STRING },
        lastName: { type: Type.STRING },
        email: { type: Type.STRING },
        role: { type: Type.STRING },
        company: { type: Type.STRING },
        domain: { type: Type.STRING },
        website: { type: Type.STRING },
        linkedinUrl: { type: Type.STRING },
        phone: { type: Type.STRING },
        location: { type: Type.STRING },
        source: { type: Type.STRING },
        icebreaker: { type: Type.STRING },
        painPoint: { type: Type.STRING },
        fitScore: { type: Type.INTEGER },
      },
      required: ['firstName', 'email', 'role', 'company', 'domain', 'icebreaker', 'painPoint', 'fitScore'],
    },
  };

  async function finalizeLeads(
    rawParsed: Array<Partial<Lead>>,
    sourceMode: Lead['sourceMode'],
    defaultSourceLabel: string
  ): Promise<Lead[]> {
    const validatedLeads: Lead[] = [];
    const seen = new Set<string>();

    for (const item of rawParsed) {
      const rawEmail = (item.email ?? '').trim().toLowerCase();
      const email = rawEmail.includes('@') ? rawEmail : '';
      const companyName = (item.company ?? '').trim();
      const phone = (item.phone ?? '').trim();
      const website = (item.website ?? '').trim();

      // Keep if valid email OR if real business with phone/website (e.g., Google Maps)
      if (!email && !(companyName && (phone || website))) continue;

      let domain = (item.domain || (email ? email.split('@')[1] : '') || '').toLowerCase().trim();
      if (!domain && website) {
        try {
          domain = new URL(website.startsWith('http') ? website : `https://${website}`).hostname.replace(/^www\./, '');
        } catch {
          domain = '';
        }
      }

      const dedupKey = email || `${companyName.toLowerCase()}::${phone || domain}`;
      if (!dedupKey || seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      const firstName = (item.firstName || companyName || 'Team').trim();
      const lastName = (item.lastName ?? '').trim();
      validatedLeads.push({
        id: `lead_${crypto.randomBytes(5).toString('hex')}`,
        firstName,
        lastName,
        fullName: item.fullName?.trim() || `${firstName} ${lastName}`.trim(),
        email,
        role: item.role?.trim() || (email ? 'Decision Maker' : 'Business Listing'),
        company: companyName || domain,
        domain,
        website: website || (domain ? `https://${domain}` : ''),
        linkedinUrl: item.linkedinUrl?.trim() || '',
        phone,
        location: item.location?.trim() || '',
        source: item.source?.trim() || defaultSourceLabel,
        sourceMode,
        icebreaker: item.icebreaker?.trim() || `Following ${companyName || domain}'s recent growth.`,
        painPoint: item.painPoint?.trim() || 'Scaling high-intent outbound acquisition',
        fitScore: Math.min(99, Math.max(50, Number(item.fitScore) || 82)),
        mxValid: null,
        status: 'new',
        createdAt: new Date().toISOString(),
      });
    }

    const uniqueDomains = Array.from(new Set(validatedLeads.map((l) => l.domain).filter(Boolean))).slice(0, 200);
    const mxMap = new Map<string, boolean>();
    for (let i = 0; i < uniqueDomains.length; i += 25) {
      const chunk = uniqueDomains.slice(i, i + 25);
      await Promise.all(
        chunk.map(async (dom) => {
          mxMap.set(dom, await checkDomainMx(dom));
        })
      );
    }

    return validatedLeads.map((lead) => ({
      ...lead,
      mxValid: lead.domain ? mxMap.get(lead.domain) ?? false : null,
    }));
  }

  function getLeadDedupKey(l: Partial<Lead>): string {
    if (l.email && l.email.includes('@')) return l.email.toLowerCase();
    return `${(l.company || '').toLowerCase()}::${(l.phone || l.domain || l.website || l.id || '').toLowerCase()}`;
  }

  function mergeUniqueLeads(primary: Lead[], secondary: Lead[], maxCount: number): Lead[] {
    const seen = new Set<string>();
    const merged: Lead[] = [];
    for (const item of [...primary, ...secondary]) {
      const key = getLeadDedupKey(item);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
      if (merged.length >= maxCount) break;
    }
    return merged;
  }

  async function extractStructuredLeads(
    rawResearchOrDom: string,
    sourceMode: Lead['sourceMode'],
    defaultSourceLabel: string
  ): Promise<Lead[]> {
    const response = await generateWithFallback({
      contents: rawResearchOrDom,
      systemInstruction:
        'You are an elite B2B lead intelligence extractor. Return strict JSON array of verified leads. Extract first/last name, role, company, domain, website, phone, location, email (use explicitly discovered emails; if a verified business website domain is present without an email, you may leave email empty string "" or list contact@domain only when obvious; never fabricate fake personal emails), personalized 1-sentence outreach icebreaker grounded in real business facts, likely pain point, and fitScore 60-99.',
      responseMimeType: 'application/json',
      responseSchema: LEAD_SCHEMA,
    });

    const parsed = safeParseJson<Array<Partial<Lead>>>(response.text, []);
    return finalizeLeads(parsed, sourceMode, defaultSourceLabel);
  }

  // Extension direct lead ingest endpoint (up to 200 leads per push)
  app.post('/api/extension/ingest', async (req, res) => {
    try {
      const { pageUrl, pageTitle, rawEmails, rawPhones, structuredItems, rawText, targetCount } = req.body as {
        pageUrl?: string;
        pageTitle?: string;
        rawEmails?: string[];
        rawPhones?: string[];
        structuredItems?: Array<Partial<Lead> & { sourceSnippet?: string }>;
        rawText?: string;
        targetCount?: number;
      };

      const maxIngest = Math.min(Math.max(Number(targetCount) || 200, 1), 200);
      const snippet = (rawText ?? '').slice(0, 45000);
      const emailHints = (rawEmails ?? []).slice(0, 200).join(', ');
      const phoneHints = (rawPhones ?? []).slice(0, 200).join(', ');
      const structuredSlice = (structuredItems ?? []).slice(0, maxIngest);
      const structuredHint =
        structuredSlice.length > 0 ? JSON.stringify(structuredSlice.slice(0, 60), null, 2) : 'None';

      const prompt = `Extract and enrich B2B/commercial leads from this Chrome extension tab capture.
Page Title: ${pageTitle ?? 'Unknown'}
Page URL: ${pageUrl ?? 'Unknown'}
Detected Email Strings: ${emailHints || 'None explicitly matched'}
Detected Phone Numbers: ${phoneHints || 'None explicitly matched'}
Structured DOM Cards (e.g. Google Maps / Directory listings):
${structuredHint}

Visible Page Content:
${snippet}

Extract up to ${Math.min(maxIngest, 60)} legitimate, deduplicated leads from the priority data above. Keep phone numbers, websites, and locations when present (especially for Google Maps listings).`;

      const fallbackRaw = extractFallbackRegexLeads(
        `${emailHints}\n${snippet}`,
        pageUrl || 'Chrome Extension Tab',
        'extension',
        structuredSlice,
        maxIngest
      );

      let extracted: Lead[] = [];
      try {
        const aiLeads = await extractStructuredLeads(prompt, 'extension', pageUrl || 'Chrome Extension Tab');
        const finalizedFallback =
          structuredSlice.length > aiLeads.length || (rawEmails?.length ?? 0) > aiLeads.length
            ? await finalizeLeads(fallbackRaw, 'extension', pageUrl || 'Chrome Extension Tab')
            : [];
        extracted = mergeUniqueLeads(aiLeads, finalizedFallback, maxIngest);
      } catch (err) {
        if (!isRetryableAiError(err)) throw err;
        extracted = await finalizeLeads(fallbackRaw, 'extension', pageUrl || 'Chrome Extension Tab');
      }

      const store = readStore();
      const existing = new Set(store.leads.map(getLeadDedupKey));
      const newOnes = extracted.filter((l) => !existing.has(getLeadDedupKey(l)));
      store.leads = [...newOnes, ...store.leads];
      writeStore(store);

      res.json({
        ingested: newOnes.length,
        leads: newOnes,
      });
    } catch (err: unknown) {
      const formatted = formatAiError(err, 'Extension ingest failed');
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Freelancer Extension AI Pitch Generator (CORS enabled under /api/extension/*)
  app.post('/api/extension/freelancer-pitch', async (req, res) => {
    try {
      const {
        specialty,
        serviceOffer,
        portfolioUrl,
        senderName,
        sampleCompanies = [],
        pageContext,
      } = req.body as {
        specialty?: string;
        serviceOffer?: string;
        portfolioUrl?: string;
        senderName?: string;
        sampleCompanies?: Array<{ company?: string; website?: string; needSignal?: string; location?: string }>;
        pageContext?: string;
      };

      const offerSummary = serviceOffer?.trim() || specialty?.trim() || 'Freelance Web & Growth Consulting';
      const companyHints = sampleCompanies
        .slice(0, 5)
        .map((c) => `${c.company || 'Prospect'} (${c.needSignal || c.website || 'active business'})`)
        .join('; ');

      const fallbackPitch = {
        angleName: `${specialty || 'Freelance'} Client Value Gap`,
        subjectA: '{{company}} <> quick idea',
        subjectB: 'quick question, {{firstName}}',
        body: `Hi {{firstName}},\n\n{{icebreaker}}\n\nI specialize in ${specialty || 'client growth'} and help businesses like {{company}} resolve {{painPoint}} through ${offerSummary}—without bloated agency retainers.\n\nOpen to seeing a 60-second teardown tailored to {{company}}?${senderName ? `\n\nBest,\n${senderName}` : ''}`,
        followUp1: `Hi {{firstName}},\n\nQuick follow-up — put together a couple specific notes for {{company}} around ${offerSummary}. Worth sending that over?`,
        followUp2: `Hi {{firstName}},\n\nAssume timing is off for {{company}} right now, so I'll close the loop here. Happy to reconnect anytime.`,
        safetyNote: 'Clean conversational copy · Zero spam triggers',
      };

      try {
        const aiPromise = generateWithFallback({
          thinkingLevel: ThinkingLevel.LOW,
          systemInstruction: `You are an elite B2B Freelance Cold Email Strategist.
Write a short, authentic, peer-to-peer freelance outreach sequence that wins client replies without sounding automated or spammy.
RULES:
- NEVER use spam trigger words ("free", "guarantee", "100%", "act now", "discount", exclamation marks).
- Keep initial body 45-75 words MAX.
- Use personalization variables {{firstName}}, {{company}}, {{icebreaker}}, {{painPoint}}.
- Subject line: 2-4 words, lowercase conversational curiosity.
- End with a soft yes/no CTA (e.g., "Worth sending over a 60-second teardown for {{company}}?").
${portfolioUrl ? `- Mention portfolio/work cleanly only as subtle credibility (never paste raw spammy URLs if avoidable, or include ${portfolioUrl} concisely).` : ''}`,
          contents: `Freelancer Specialty: ${specialty || 'Independent Consultant'}
Service / Offer: ${offerSummary}
Sender Name: ${senderName || 'Alex'}
Sample Client Prospects: ${companyHints || pageContext || 'Local/B2B businesses needing growth'}

Return strict JSON with: angleName, subjectA, subjectB, body, followUp1, followUp2, safetyNote.`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              angleName: { type: Type.STRING },
              subjectA: { type: Type.STRING },
              subjectB: { type: Type.STRING },
              body: { type: Type.STRING },
              followUp1: { type: Type.STRING },
              followUp2: { type: Type.STRING },
              safetyNote: { type: Type.STRING },
            },
            required: ['angleName', 'subjectA', 'subjectB', 'body', 'followUp1', 'followUp2', 'safetyNote'],
          },
        });

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 12000)
        );
        const response = await Promise.race([aiPromise, timeoutPromise]);
        const parsed = safeParseJson<typeof fallbackPitch>(response.text, fallbackPitch);
        res.json(parsed);
      } catch (aiErr: unknown) {
        if (isRetryableAiError(aiErr)) {
          res.json({ ...fallbackPitch, safetyNote: 'Instant smart template (AI busy) · Zero spam triggers' });
          return;
        }
        throw aiErr;
      }
    } catch (err: unknown) {
      const formatted = formatAiError(err, 'Failed to generate freelancer pitch');
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Queue multi-recipient outreach batch from the Freelancer Chrome Extension
  app.post('/api/extension/outreach-queue', async (req, res) => {
    try {
      const {
        recipients = [],
        sequenceName,
        subject,
        subjectVariantB,
        body,
        followUp1,
        followUp2,
        freelancerService,
        slotIndex = 0,
      } = req.body as Partial<ExtensionOutreachJob>;

      const validRecipients = recipients
        .map((r) => ({
          ...r,
          email: (r.email || '').trim().toLowerCase(),
        }))
        .filter((r) => r.email.includes('@'))
        .slice(0, 200);

      if (validRecipients.length === 0) {
        res.status(400).json({ error: 'Provide at least one valid recipient email address.' });
        return;
      }
      if (!subject?.trim() || !body?.trim()) {
        res.status(400).json({ error: 'Subject and email body are required.' });
        return;
      }

      const finalized = await finalizeLeads(
        validRecipients.map((r) => {
          const dom = r.email.split('@')[1] || '';
          const local = r.email.split('@')[0] || 'Team';
          const fallbackName = local.split(/[._-]/)[0] || 'Team';
          return {
            firstName: (r.name || fallbackName).split(' ')[0],
            fullName: r.name || fallbackName,
            email: r.email,
            company: r.company || dom.split('.')[0] || 'Client',
            domain: dom,
            website: r.website || (dom ? `https://${dom}` : ''),
            icebreaker: r.icebreaker || `Reaching out regarding ${r.company || dom}.`,
            painPoint: r.painPoint || freelancerService || 'client acquisition & conversion',
            role: 'Prospective Client',
          };
        }),
        'extension',
        'Freelancer Extension Multi-Send'
      );

      const store = readStore();
      const leadMap = new Map(store.leads.map((l) => [getLeadDedupKey(l), l]));
      for (const fl of finalized) {
        const key = getLeadDedupKey(fl);
        const existing = leadMap.get(key);
        if (existing) {
          leadMap.set(key, { ...existing, status: 'queued' });
        } else {
          leadMap.set(key, { ...fl, status: 'queued' });
        }
      }
      store.leads = Array.from(leadMap.values());

      const job: ExtensionOutreachJob = {
        id: `extjob_${crypto.randomBytes(5).toString('hex')}`,
        createdAt: new Date().toISOString(),
        consumed: false,
        slotIndex: Number(slotIndex) || 0,
        freelancerService: freelancerService || 'Freelance Outreach',
        sequenceName: sequenceName || 'Freelancer Extension Campaign',
        subject: subject.trim(),
        subjectVariantB: (subjectVariantB || subject).trim(),
        body: body.trim(),
        followUp1: (followUp1 || '').trim(),
        followUp2: (followUp2 || '').trim(),
        recipients: validRecipients,
      };

      store.extensionOutreachJobs = [job, ...store.extensionOutreachJobs].slice(0, 20);
      writeStore(store);

      res.json({
        queuedCount: validRecipients.length,
        jobId: job.id,
        leads: store.leads,
        job,
      });
    } catch (err: unknown) {
      const formatted = formatAiError(err, 'Failed to queue extension outreach');
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.get('/api/extension/outreach-queue', (_req, res) => {
    const store = readStore();
    const pending = store.extensionOutreachJobs.filter((j) => !j.consumed);
    res.json({ pendingJobs: pending });
  });

  app.post('/api/extension/outreach-queue/consume', (req, res) => {
    const { jobId } = req.body as { jobId?: string };
    const store = readStore();
    store.extensionOutreachJobs = store.extensionOutreachJobs.map((j) =>
      !jobId || j.id === jobId ? { ...j, consumed: true } : j
    );
    writeStore(store);
    res.json({ ok: true });
  });

  function isSafePublicHttpUrl(raw: string): string | null {
    try {
      const normalized = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`;
      const u = new URL(normalized);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      const h = u.hostname.toLowerCase();
      if (
        !h ||
        h === 'localhost' ||
        h.endsWith('.local') ||
        h.startsWith('127.') ||
        h.startsWith('10.') ||
        h.startsWith('192.168.') ||
        h.startsWith('169.254.') ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(h)
      ) {
        return null;
      }
      return u.toString();
    } catch {
      return null;
    }
  }

  async function inspectWebsiteForFreelancer(rawUrl: string, companyName: string) {
    const targetUrl = isSafePublicHttpUrl(rawUrl);
    if (!targetUrl) {
      return {
        website: rawUrl,
        emails: [] as string[],
        socials: [] as string[],
        auditFindings: ['No valid public website URL'],
        opportunityScore: 92,
        needSignal: 'No Website Listed (High Web/SEO Opportunity)',
        suggestedIcebreaker: `Noticed ${companyName || 'your business'} has no website listed yet—easy win for capturing local search bookings.`,
      };
    }

    const fetchHtml = async (u: string): Promise<{ html: string; finalUrl: string }> => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4500);
      try {
        const resp = await fetch(u, {
          signal: ctrl.signal,
          redirect: 'follow',
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KuroReachAudit/2.0)' },
        });
        if (!resp.ok) return { html: '', finalUrl: u };
        const html = (await resp.text()).slice(0, 180000);
        return { html, finalUrl: resp.url || u };
      } catch {
        return { html: '', finalUrl: u };
      } finally {
        clearTimeout(timer);
      }
    };

    const emailRx = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const extractEmailsFromHtml = (html: string) => {
      const mailtos = Array.from(html.matchAll(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi)).map(
        (m) => m[1].toLowerCase()
      );
      const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
      const bodyHits = (text.match(emailRx) ?? []).map((e) => e.toLowerCase());
      return Array.from(new Set([...mailtos, ...bodyHits])).filter(
        (e) =>
          !e.endsWith('.png') &&
          !e.endsWith('.jpg') &&
          !e.endsWith('.jpeg') &&
          !e.endsWith('.svg') &&
          !e.endsWith('.webp') &&
          !e.includes('sentry') &&
          !e.includes('wixpress') &&
          !e.includes('example.') &&
          !e.includes('domain.')
      );
    };

    const home = await fetchHtml(targetUrl);
    let combinedHtml = home.html;
    let emails = extractEmailsFromHtml(combinedHtml);

    if (emails.length === 0 && home.html) {
      const base = new URL(home.finalUrl || targetUrl).origin;
      const contactPaths = ['/contact', '/contact-us', '/about'];
      for (const p of contactPaths) {
        const sub = await fetchHtml(`${base}${p}`);
        if (sub.html) {
          combinedHtml += '\n' + sub.html;
          const found = extractEmailsFromHtml(sub.html);
          if (found.length > 0) {
            emails = Array.from(new Set([...emails, ...found]));
            break;
          }
        }
      }
    }

    const socialMatches = Array.from(
      combinedHtml.matchAll(/https?:\/\/(?:www\.)?(?:instagram\.com|linkedin\.com\/(?:company|in)|facebook\.com)\/[a-zA-Z0-9._-]+/gi)
    ).map((m) => m[0]);
    const socials = Array.from(new Set(socialMatches)).slice(0, 4);

    const lowerHtml = combinedHtml.toLowerCase();
    const auditFindings: string[] = [];
    let score = 62;

    if ((home.finalUrl || targetUrl).startsWith('http://')) {
      auditFindings.push('Unsecured HTTP (No SSL)');
      score += 14;
    }
    if (!home.html) {
      auditFindings.push('Site unreachable or timed out');
      score += 16;
    } else {
      if (!/<meta[^>]+name=["']viewport["']/i.test(home.html)) {
        auditFindings.push('Missing Mobile Viewport');
        score += 12;
      }
      if (!/<meta[^>]+name=["']description["']/i.test(home.html)) {
        auditFindings.push('Missing SEO Meta Description');
        score += 8;
      }
      if (
        !lowerHtml.includes('calendly') &&
        !lowerHtml.includes('acuity') &&
        !lowerHtml.includes('book now') &&
        !lowerHtml.includes('schedule') &&
        !lowerHtml.includes('appointment')
      ) {
        auditFindings.push('No Online Booking / Calendar');
        score += 8;
      }
      if (
        !lowerHtml.includes('googletagmanager') &&
        !lowerHtml.includes('gtag(') &&
        !lowerHtml.includes('fbq(')
      ) {
        auditFindings.push('No Analytics / Ad Pixel');
        score += 6;
      }
    }

    const cappedScore = Math.min(98, Math.max(55, score));
    const topIssue = auditFindings[0] || 'Conversion & speed optimization opportunity';
    const cleanHost = new URL(home.finalUrl || targetUrl).hostname.replace(/^www\./, '');
    const suggestedIcebreaker =
      auditFindings.length > 0
        ? `Checked ${cleanHost} today and spotted ${auditFindings.slice(0, 2).join(' + ')} that could be costing ${companyName || cleanHost} inbound leads.`
        : `Checked ${cleanHost} today and spotted a quick conversion lift for ${companyName || cleanHost}.`;

    return {
      website: home.finalUrl || targetUrl,
      emails: emails.slice(0, 6),
      socials,
      auditFindings,
      opportunityScore: cappedScore,
      needSignal: auditFindings.slice(0, 2).join(' · ') || 'Active Website Ready for Pitch',
      suggestedIcebreaker,
    };
  }

  // Deep Email Hunter + Live Freelancer Site Audit endpoint
  app.post('/api/extension/enrich-sites', async (req, res) => {
    try {
      const { targets = [] } = req.body as {
        targets?: Array<{ company?: string; website?: string; email?: string }>;
      };
      const slice = targets.slice(0, 40);
      const results: Array<{
        company: string;
        website: string;
        emails: string[];
        socials: string[];
        auditFindings: string[];
        opportunityScore: number;
        needSignal: string;
        suggestedIcebreaker: string;
      }> = [];

      const batchSize = 5;
      for (let i = 0; i < slice.length; i += batchSize) {
        const chunk = slice.slice(i, i + batchSize);
        const settled = await Promise.all(
          chunk.map(async (item) => {
            const site = item.website || (item.email && item.email.includes('@') ? `https://${item.email.split('@')[1]}` : '');
            const audit = await inspectWebsiteForFreelancer(site, item.company || '');
            return {
              company: item.company || '',
              ...audit,
            };
          })
        );
        results.push(...settled);
      }

      res.json({ enriched: results });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Site enrichment failed' });
    }
  });

  // Contacted Shield + Follow-Ups Due index for Chrome Extension
  app.get('/api/extension/contacted-index', (_req, res) => {
    const store = readStore();
    const contactedEmails = new Set<string>();
    const contactedDomains = new Set<string>();

    for (const lead of store.leads) {
      if (lead.status === 'contacted' || lead.status === 'replied' || lead.status === 'bounced') {
        if (lead.email) contactedEmails.add(lead.email.toLowerCase());
        if (lead.domain) contactedDomains.add(lead.domain.toLowerCase());
      }
    }

    const nowMs = Date.now();
    const followUpsDue: Array<{
      id: string;
      recipientEmail: string;
      recipientName: string;
      company: string;
      subject: string;
      daysAgo: number;
      status: string;
    }> = [];

    for (const msg of store.trackedEmails) {
      if (msg.recipientEmail) contactedEmails.add(msg.recipientEmail.toLowerCase());
      const dom = msg.recipientEmail?.split('@')[1]?.toLowerCase();
      if (dom) contactedDomains.add(dom);

      if (msg.status === 'sent' || msg.status === 'opened' || msg.status === 'clicked') {
        const ageHours = (nowMs - new Date(msg.sentAt).getTime()) / 3600000;
        if (ageHours >= 48) {
          followUpsDue.push({
            id: msg.id,
            recipientEmail: msg.recipientEmail,
            recipientName: msg.recipientName,
            company: msg.company,
            subject: msg.subject,
            daysAgo: Math.max(2, Math.floor(ageHours / 24)),
            status: msg.status,
          });
        }
      }
    }

    res.json({
      contactedEmails: Array.from(contactedEmails),
      contactedDomains: Array.from(contactedDomains),
      followUpsDue: followUpsDue.slice(0, 50),
    });
  });

  interface ScrapeJobState {
    jobId: string;
    status: 'running' | 'completed' | 'failed';
    completedWaves: number;
    totalWaves: number;
    targetCount: number;
    leads: Lead[];
    groundingSources: { title: string; uri: string }[];
    summary: string;
    error?: string;
    createdAt: number;
  }

  const scrapeJobs = new Map<string, ScrapeJobState>();

  function persistNewLeads(newCandidates: Lead[]) {
    if (newCandidates.length === 0) return;
    const store = readStore();
    const existing = new Set(store.leads.map(getLeadDedupKey));
    const uniqueNew = newCandidates.filter((l) => !existing.has(getLeadDedupKey(l)));
    if (uniqueNew.length > 0) {
      store.leads = [...uniqueNew, ...store.leads];
      writeStore(store);
    }
  }

  async function runScrapePipeline(
    input: {
      mode: 'search' | 'url' | 'dom';
      query?: string;
      urls?: string[];
      rawContent?: string;
      leadCount?: number;
      offerContext?: string;
    },
    onProgress?: (update: {
      completedWaves: number;
      totalWaves: number;
      leads: Lead[];
      groundingSources: { title: string; uri: string }[];
    }) => void
  ): Promise<{ leads: Lead[]; groundingSources: { title: string; uri: string }[]; summary: string }> {
    const { mode, query, urls, rawContent, leadCount = 10, offerContext } = input;
    const targetCount = Math.min(Math.max(Number(leadCount) || 10, 3), 200);
    const sourceSeen = new Set<string>();
    const groundingSources: { title: string; uri: string }[] = [];
    const addGrounding = (items: Array<{ title: string; uri: string }>) => {
      for (const item of items) {
        if (item.uri && !sourceSeen.has(item.uri)) {
          sourceSeen.add(item.uri);
          groundingSources.push(item);
        }
      }
    };

    let leads: Lead[] = [];
    let sourceLabel = 'AI Web Intelligence';

    if (mode === 'search') {
      if (!query?.trim()) {
        throw new Error('Search query is required');
      }
      sourceLabel = `Web Search: ${query.trim()}`;

      const SEARCH_ANGLES = [
        '',
        'directory list managing partners founders executive emails',
        'top mid-market companies leadership team contact directory',
        'boutique specialist firms directors corporate email',
        'industry association members list decision makers',
        'regional offices fast growing companies leadership',
        'independent agencies consultancies partners directory',
        'B2B service providers executives contact information',
        'regional branches managing directors email contacts',
        'top rated firms senior leadership contact list',
      ];

      const waveSize = 35;
      const estimatedWaves = Math.min(8, Math.ceil(targetCount / 25));
      const maxAttempts = targetCount <= 35 ? 1 : Math.min(12, estimatedWaves + 4);
      let collected: Lead[] = [];
      let consecutiveIssues = 0;

      for (let wave = 0; wave < maxAttempts && collected.length < targetCount; wave++) {
        if (wave > 0) {
          await sleep(900);
        }
        const remaining = targetCount - collected.length;
        const batchTarget = Math.min(waveSize, remaining);
        const angle = SEARCH_ANGLES[wave % SEARCH_ANGLES.length];
        const focusedQuery = angle ? `${query.trim()} (${angle})` : query.trim();
        const excludeList = collected
          .slice(-140)
          .map((l) => l.domain || l.company)
          .filter(Boolean);

        try {
          const searchResp = await generateWithFallback({
            useGoogleSearch: true,
            contents: `Find ${batchTarget} DIFFERENT, real, active companies and key decision-makers matching this Ideal Customer Profile: "${focusedQuery}".
${offerContext ? `Outreach Offer Context: ${offerContext}` : ''}
${
  excludeList.length > 0
    ? `CRITICAL — Wave ${wave + 1}: Do NOT repeat any of these already-found domains/companies: ${excludeList.join(', ')}`
    : ''
}

Return ONLY a valid JSON array of ${batchTarget} unique entries (wrapped in \`\`\`json ... \`\`\`) where every object has:
"firstName", "lastName", "email" (corporate email or realistic role/name pattern like first@domain.com), "role", "company", "domain", "website", "linkedinUrl", "location", "source", "icebreaker" (1 concrete factual sentence about the company), "painPoint", "fitScore" (integer 70-99).`,
          });

          const chunks = searchResp.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
          addGrounding(
            chunks
              .map((c) => c.web)
              .filter((w): w is { uri: string; title?: string } => Boolean(w?.uri))
              .map((w) => ({ title: w.title || w.uri, uri: w.uri }))
          );

          const directParsed = safeParseJson<Array<Partial<Lead>>>(searchResp.text, []);
          let waveLeads: Lead[] = [];
          if (directParsed.length > 0) {
            waveLeads = await finalizeLeads(directParsed, 'search', sourceLabel);
          } else if (searchResp.text?.trim()) {
            waveLeads = await extractStructuredLeads(
              `Convert into max ${batchTarget} structured leads (excluding: ${excludeList.slice(-40).join(', ')}):\n\n${searchResp.text}`,
              'search',
              sourceLabel
            );
          }

          const prevLen = collected.length;
          collected = mergeUniqueLeads(collected, waveLeads, targetCount);
          const newlyAdded = collected.slice(prevLen);
          persistNewLeads(newlyAdded);

          onProgress?.({
            completedWaves: wave + 1,
            totalWaves: Math.max(estimatedWaves, wave + 1),
            leads: collected,
            groundingSources: [...groundingSources],
          });

          if (collected.length === prevLen) {
            consecutiveIssues++;
            if (consecutiveIssues >= 3) break;
          } else {
            consecutiveIssues = 0;
          }
        } catch (waveErr) {
          consecutiveIssues++;
          if (collected.length > 0 && isRetryableAiError(waveErr) && consecutiveIssues < 3) {
            await sleep(2500);
            continue;
          }
          if (collected.length > 0 && isRetryableAiError(waveErr)) {
            break;
          }
          throw waveErr;
        }
      }
      leads = collected;
    } else if (mode === 'url') {
      const cleanUrls = (urls ?? []).map((u) => u.trim()).filter((u) => u.startsWith('http'));
      if (cleanUrls.length === 0) {
        throw new Error('Provide at least one valid https:// URL');
      }
      sourceLabel = `URL Crawl (${cleanUrls.length} sources)`;
      addGrounding(cleanUrls.slice(0, 20).map((uri) => ({ title: uri, uri })));

      const fetchedPages = await Promise.all(
        cleanUrls.slice(0, 20).map(async (u) => ({ url: u, ...(await fetchPageTextAndEmails(u)) }))
      );
      const combinedText = fetchedPages
        .map((p) => `URL: ${p.url}\nEmails: ${p.emails.join(', ')}\nText: ${p.text}`)
        .join('\n\n');
      const directEmails = fetchedPages.flatMap((p) => p.emails);

      try {
        let collected: Lead[] = [];
        const chunkSize = targetCount > 45 ? 12000 : 24000;
        const totalSlices = Math.min(8, Math.max(1, Math.ceil(combinedText.length / chunkSize)));
        for (let i = 0; i < totalSlices && collected.length < targetCount; i++) {
          const sliceText = combinedText.slice(i * chunkSize, (i + 1) * chunkSize);
          if (!sliceText.trim()) continue;
          const waveLeads = await extractStructuredLeads(
            `Extract up to ${Math.min(50, targetCount - collected.length)} real decision-makers and verified emails from these crawled pages:\n${sliceText}`,
            'url',
            sourceLabel
          );
          const prevLen = collected.length;
          collected = mergeUniqueLeads(collected, waveLeads, targetCount);
          persistNewLeads(collected.slice(prevLen));
          onProgress?.({
            completedWaves: i + 1,
            totalWaves: totalSlices,
            leads: collected,
            groundingSources: [...groundingSources],
          });
        }

        if (directEmails.length > collected.length && collected.length < targetCount) {
          const regexLeads = await finalizeLeads(
            extractFallbackRegexLeads(directEmails.join('\n'), sourceLabel, 'url', undefined, targetCount),
            'url',
            sourceLabel
          );
          const prevLen = collected.length;
          collected = mergeUniqueLeads(collected, regexLeads, targetCount);
          persistNewLeads(collected.slice(prevLen));
        }
        leads = collected;
      } catch (err) {
        if (!isRetryableAiError(err)) throw err;
        leads = await finalizeLeads(
          extractFallbackRegexLeads(directEmails.join('\n'), sourceLabel, 'url', undefined, targetCount),
          'url',
          sourceLabel
        );
        persistNewLeads(leads);
      }
    } else {
      if (!rawContent?.trim()) {
        throw new Error('Paste HTML, CSV, directory text, or extension DOM snippet');
      }
      sourceLabel = 'Raw DOM / Text Extraction';
      const boundedInput = rawContent.slice(0, 120000);
      try {
        let collected: Lead[] = [];
        const chunkSize = targetCount > 45 ? 10000 : 24000;
        const totalSlices = Math.min(10, Math.max(1, Math.ceil(boundedInput.length / chunkSize)));
        for (let i = 0; i < totalSlices && collected.length < targetCount; i++) {
          const sliceText = boundedInput.slice(i * chunkSize, (i + 1) * chunkSize);
          if (!sliceText.trim()) continue;
          const waveLeads = await extractStructuredLeads(
            `Extract up to ${Math.min(50, targetCount - collected.length)} clean B2B leads from the following raw text/HTML/CSV dump.\n${
              offerContext ? `Outreach Offer Context: ${offerContext}\n` : ''
            }\nRAW INPUT:\n${sliceText}`,
            'dom',
            sourceLabel
          );
          const prevLen = collected.length;
          collected = mergeUniqueLeads(collected, waveLeads, targetCount);
          persistNewLeads(collected.slice(prevLen));
          onProgress?.({
            completedWaves: i + 1,
            totalWaves: totalSlices,
            leads: collected,
            groundingSources: [...groundingSources],
          });
        }

        if (collected.length < targetCount) {
          const regexLeads = await finalizeLeads(
            extractFallbackRegexLeads(boundedInput, sourceLabel, 'dom', undefined, targetCount),
            'dom',
            sourceLabel
          );
          const prevLen = collected.length;
          collected = mergeUniqueLeads(collected, regexLeads, targetCount);
          persistNewLeads(collected.slice(prevLen));
        }
        leads = collected;
      } catch (err) {
        if (!isRetryableAiError(err)) throw err;
        leads = await finalizeLeads(
          extractFallbackRegexLeads(boundedInput, sourceLabel, 'dom', undefined, targetCount),
          'dom',
          sourceLabel
        );
        persistNewLeads(leads);
      }
    }

    return {
      leads,
      groundingSources,
      summary: `Extracted ${leads.length}${targetCount > leads.length ? ` of ${targetCount} requested` : ''} MX-checked leads from ${sourceLabel}.`,
    };
  }

  // Non-blocking Async Scrape Job API (prevents reverse-proxy HTTP timeouts on 100-200 lead runs)
  app.post('/api/ai/scrape-jobs', (req, res) => {
    const body = req.body as {
      mode: 'search' | 'url' | 'dom';
      query?: string;
      urls?: string[];
      rawContent?: string;
      leadCount?: number;
      offerContext?: string;
    };

    if (body.mode === 'search' && !body.query?.trim()) {
      res.status(400).json({ error: 'Search query is required' });
      return;
    }
    if (body.mode === 'url') {
      const cleanUrls = (body.urls ?? []).map((u) => u.trim()).filter((u) => u.startsWith('http'));
      if (cleanUrls.length === 0) {
        res.status(400).json({ error: 'Provide at least one valid https:// URL' });
        return;
      }
    }
    if (body.mode === 'dom' && !body.rawContent?.trim()) {
      res.status(400).json({ error: 'Paste HTML, CSV, directory text, or extension DOM snippet' });
      return;
    }

    // Prune jobs older than 30 mins
    const cutoff = Date.now() - 30 * 60 * 1000;
    for (const [id, st] of scrapeJobs.entries()) {
      if (st.createdAt < cutoff) scrapeJobs.delete(id);
    }

    const targetCount = Math.min(Math.max(Number(body.leadCount) || 10, 3), 200);
    const totalWaves = body.mode === 'search' ? Math.min(8, Math.ceil(targetCount / 25)) : 1;
    const jobId = `job_${crypto.randomBytes(6).toString('hex')}`;

    const job: ScrapeJobState = {
      jobId,
      status: 'running',
      completedWaves: 0,
      totalWaves,
      targetCount,
      leads: [],
      groundingSources: [],
      summary: '',
      createdAt: Date.now(),
    };
    scrapeJobs.set(jobId, job);

    void runScrapePipeline(body, (update) => {
      job.completedWaves = update.completedWaves;
      job.totalWaves = update.totalWaves;
      job.leads = update.leads;
      job.groundingSources = update.groundingSources;
    })
      .then((result) => {
        job.leads = result.leads;
        job.groundingSources = result.groundingSources;
        job.summary = result.summary;
        job.status = 'completed';
        job.completedWaves = job.totalWaves;
      })
      .catch((err: unknown) => {
        console.error('Background scrape job error:', err);
        const formatted = formatAiError(err, 'Failed to scrape leads');
        job.error = formatted.message;
        job.status = 'failed';
      });

    res.status(202).json(job);
  });

  app.get('/api/ai/scrape-jobs/:jobId', (req, res) => {
    const job = scrapeJobs.get(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'Scrape job not found or expired' });
      return;
    }
    res.json(job);
  });

  // Synchronous Scrape Endpoint (kept for direct API compatibility)
  app.post('/api/ai/scrape-leads', async (req, res) => {
    try {
      const result = await runScrapePipeline(req.body);
      res.json(result);
    } catch (err: unknown) {
      console.error('Scrape error:', err);
      const formatted = formatAiError(err, 'Failed to scrape leads');
      const status = formatted.message.includes('required') || formatted.message.includes('Provide') || formatted.message.includes('Paste')
        ? 400
        : formatted.status;
      res.status(status).json({ error: formatted.message });
    }
  });

  const CONVERSION_DOCTRINE = `You are KuroReach Strategist — an elite B2B Cold Email Copywriter, Revenue Architect, and Google Workspace Deliverability Specialist trained on millions of winning outbound campaigns.

CORE CONVERSION & DELIVERABILITY DOCTRINE:
1. INBOX PLACEMENT FIRST (Google Bulk Sender Compliance):
   - Zero spam triggers: NEVER use "free", "guarantee", "act now", "limited time", "100%", "discount", "click here", "$$$", "urgent", "winner", "risk-free", or exclamation marks in subject lines.
   - Plain-text look: Short 1-2 sentence paragraphs, zero heavy HTML/links/images in cold Step 1, natural conversational voice.
2. HIGH-CONVERTING SUBJECT LINES:
   - 2 to 4 words max, lowercase or natural sentence case, sounds like an internal memo or peer note (e.g. "{{company}} <> quick question", "{{firstName}} — quick thought", "noticing {{company}}").
3. BODY ARCHITECTURE (50-85 WORDS MAX):
   - Line 1 (Relevance Hook): Front-load concrete context using {{icebreaker}} (never open with "Hope you're doing well" or "My name is...").
   - Line 2 (Value Gap / Pain): Connect {{company}}'s world directly to {{painPoint}} with a crisp, believable mechanism or outcome.
   - Line 3 (Proof / Risk Reversal): One grounded sentence showing how peers solved this without extra manual work.
   - Line 4 (Frictionless Micro-CTA): Soft yes/no interest check ("Worth a 2-minute loom for {{company}}?", "Open to seeing how this fits {{company}}?"). Never demand a 30-min calendar link in cold Step 1.
4. MULTI-STEP FOLLOW-UP PSYCHOLOGY:
   - Step 1 (always, 0h): Primary relevance hook + low-friction question.
   - Step 2 (if_unopened or if_no_reply, 48h): Fresh angle / micro-case study or visual asset — NEVER "just bumping this up".
   - Step 3 (if_no_reply, 96h): Crisp pattern-interrupt breakup / binary close ("Should I close your file for now?").
5. ALWAYS use template variables: {{firstName}}, {{company}}, {{icebreaker}}, {{painPoint}} so sequences personalize cleanly per scraped lead.`;

  const SPAM_TRIGGER_PHRASES = [
    'free',
    'guarantee',
    'guaranteed',
    'act now',
    'limited time',
    'urgent',
    'click here',
    'buy now',
    '100%',
    'risk free',
    'risk-free',
    'make money',
    'double your',
    'no obligation',
    'winner',
    'congratulations',
    'special promotion',
    'exclusive deal',
    'unsubscribe',
  ];

  function analyzeSpamSignals(subject: string, body: string): { score: number; flags: string[] } {
    const flags: string[] = [];
    const combined = `${subject} ${body}`.toLowerCase();
    for (const phrase of SPAM_TRIGGER_PHRASES) {
      if (combined.includes(phrase)) {
        flags.push(`Contains spam-trigger phrase "${phrase}"`);
      }
    }
    const exclamations = (subject + body).match(/!/g)?.length ?? 0;
    if (exclamations > 1) {
      flags.push(`Too many exclamation marks (${exclamations}) — triggers Gmail Promotions/Spam`);
    }
    const allCapsWords = `${subject} ${body}`.match(/\b[A-Z]{4,}\b/g) ?? [];
    if (allCapsWords.length > 1) {
      flags.push(`ALL-CAPS emphasis (${allCapsWords.slice(0, 3).join(', ')}) increases spam filter score`);
    }
    const urls = body.match(/https?:\/\/\S+/gi) ?? [];
    if (urls.length > 1) {
      flags.push(`Multiple links (${urls.length}) in cold outreach hurt primary inbox placement`);
    }
    const words = body.trim().split(/\s+/).filter(Boolean).length;
    if (words > 125) {
      flags.push(`Body is ${words} words — cold emails over 110 words see lower reply & higher spam rates`);
    }
    const penalty = Math.min(85, flags.length * 16);
    return { score: Math.max(15, 100 - penalty), flags };
  }

  // AI High-Conversion Email Ideas & Sequence Generator
  app.post('/api/ai/generate-ideas', async (req, res) => {
    try {
      const { offer, targetPersona, tone, sampleLead } = req.body as {
        offer: string;
        targetPersona: string;
        tone?: string;
        sampleLead?: Partial<Lead>;
      };

      if (!offer?.trim()) {
        res.status(400).json({ error: 'Offer description is required' });
        return;
      }

      const response = await generateWithFallback({
        systemInstruction: CONVERSION_DOCTRINE,
        thinkingLevel: ThinkingLevel.MEDIUM,
        contents: `Generate 4 distinctly different, ultra-high-converting cold email campaign concepts + follow-up sequences using different psychological frameworks (1. Observation + Value Gap, 2. Poke-the-Bear Question, 3. Micro-Proof / Contrast, 4. Anti-Pitch Pattern Interrupt).
Offer / Product: ${offer}
Target Buyer Persona: ${targetPersona || 'VP / Founder / Decision Maker'}
Tone: ${tone || 'Concise, peer-to-peer, sharp'}
${sampleLead ? `Sample Lead Context: ${sampleLead.fullName} (${sampleLead.role} at ${sampleLead.company}) - Hook: ${sampleLead.icebreaker} - Pain: ${sampleLead.painPoint}` : ''}

Use personalization variables {{firstName}}, {{company}}, {{icebreaker}}, {{painPoint}}.
Keep every initial email 50-85 words, zero fluff, zero spam trigger words, with low-friction interest-based CTAs.`,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              angleName: { type: Type.STRING },
              psychologicalTrigger: { type: Type.STRING },
              subjectA: { type: Type.STRING },
              subjectB: { type: Type.STRING },
              body: { type: Type.STRING },
              followUp1: { type: Type.STRING },
              followUp2: { type: Type.STRING },
              predictedReplyLift: { type: Type.STRING },
            },
            required: [
              'angleName',
              'psychologicalTrigger',
              'subjectA',
              'subjectB',
              'body',
              'followUp1',
              'followUp2',
              'predictedReplyLift',
            ],
          },
        },
      });

      const parsed = safeParseJson<Array<Omit<EmailIdea, 'id'>>>(response.text, []);
      const ideas: EmailIdea[] = parsed.map((item) => ({
        ...item,
        id: `idea_${crypto.randomBytes(4).toString('hex')}`,
      }));

      res.json({ ideas });
    } catch (err: unknown) {
      console.error('Generate ideas error:', err);
      const formatted = formatAiError(err, 'Failed to generate email ideas');
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Chat-able & Promptable AI Conversion Strategist
  app.post('/api/ai/sequence-chat', async (req, res) => {
    try {
      const {
        message,
        history = [],
        offerContext,
        targetPersona,
        tone,
        currentSequence,
        leadsSummary,
        metrics,
        deliverabilitySummary,
      } = req.body as {
        message?: string;
        history?: Array<{ role: 'user' | 'assistant'; content: string }>;
        offerContext?: string;
        targetPersona?: string;
        tone?: string;
        currentSequence?: { name: string; steps: SequenceStep[] };
        leadsSummary?: { total: number; sampleLeads: Array<Partial<Lead>> };
        metrics?: { sent: number; openRate: number; replyRate: number; bounceRate: number; spamCount?: number };
        deliverabilitySummary?: string;
      };

      if (!message?.trim()) {
        res.status(400).json({ error: 'Prompt message is required' });
        return;
      }

      const conversationHistory = history
        .slice(-10)
        .map((m) => `${m.role === 'user' ? 'USER' : 'STRATEGIST'}: ${m.content}`)
        .join('\n\n');

      const draftAudit = currentSequence?.steps?.[0]
        ? analyzeSpamSignals(currentSequence.steps[0].subject, currentSequence.steps[0].body)
        : { score: 95, flags: [] };

      const response = await generateWithFallback({
        systemInstruction: CONVERSION_DOCTRINE,
        thinkingLevel: ThinkingLevel.MEDIUM,
        contents: `You are chatting directly with the user inside KuroReach Sequence Studio.
Respond directly to their prompt, give brutally honest conversion & Google spam-safety coaching, and whenever they ask for an email idea, campaign angle, rewrite, sequence, or improvement, populate "hasSequenceProposal": true along with a complete 3-step sequence in "proposedSteps" and metadata in "proposedIdea".

LIVE WORKSPACE CONTEXT:
- Offer: ${offerContext || 'Not specified yet'}
- Target Persona: ${targetPersona || 'Decision Makers'}
- Desired Tone: ${tone || 'Concise executive'}
- Live Metrics: ${metrics ? `Sent=${metrics.sent}, OpenRate=${metrics.openRate}%, ReplyRate=${metrics.replyRate}%, BounceRate=${metrics.bounceRate}%, SpamAlerts=${metrics.spamCount ?? 0}` : 'No sends yet'}
- Sender DNS/Health: ${deliverabilitySummary || 'Standard Gmail/Workspace'}
- Scraped Pipeline (${leadsSummary?.total ?? 0} total leads): ${
          leadsSummary?.sampleLeads?.length
            ? leadsSummary.sampleLeads
                .slice(0, 4)
                .map((l) => `${l.fullName} (${l.role} at ${l.company}, hook: "${l.icebreaker}")`)
                .join(' | ')
            : 'None loaded yet'
        }
- Current Active Sequence ("${currentSequence?.name || 'Untitled'}"):
${JSON.stringify(currentSequence?.steps ?? [], null, 2)}
- Automated Spam Pre-Scan on Step 1: Score=${draftAudit.score}/100, Flags=${draftAudit.flags.join('; ') || 'None'}

RECENT CHAT HISTORY:
${conversationHistory || 'New conversation'}

USER PROMPT:
${message.trim()}

Return strict JSON matching the schema. Keep "reply" concise, specific, actionable, and conversational (2-4 short paragraphs max, referencing their actual offer/leads/metrics). Provide 3 smart clickable next prompts in "followUpPrompts". If proposing or revising copy, ensure proposedSteps has 3 complete steps with {{firstName}}, {{company}}, {{icebreaker}}, {{painPoint}} and zero spam trigger words.`,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            reply: { type: Type.STRING },
            deliverabilityScore: { type: Type.INTEGER },
            conversionScore: { type: Type.INTEGER },
            spamRiskFlags: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            followUpPrompts: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            hasSequenceProposal: { type: Type.BOOLEAN },
            proposedIdea: {
              type: Type.OBJECT,
              properties: {
                angleName: { type: Type.STRING },
                psychologicalTrigger: { type: Type.STRING },
                subjectA: { type: Type.STRING },
                subjectB: { type: Type.STRING },
                body: { type: Type.STRING },
                followUp1: { type: Type.STRING },
                followUp2: { type: Type.STRING },
                predictedReplyLift: { type: Type.STRING },
              },
            },
            proposedSteps: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  stepNumber: { type: Type.INTEGER },
                  delayHours: { type: Type.INTEGER },
                  condition: { type: Type.STRING },
                  subject: { type: Type.STRING },
                  subjectVariantB: { type: Type.STRING },
                  body: { type: Type.STRING },
                },
                required: ['stepNumber', 'delayHours', 'condition', 'subject', 'subjectVariantB', 'body'],
              },
            },
          },
          required: [
            'reply',
            'deliverabilityScore',
            'conversionScore',
            'spamRiskFlags',
            'followUpPrompts',
            'hasSequenceProposal',
          ],
        },
      });

      const parsed = safeParseJson<{
        reply: string;
        deliverabilityScore: number;
        conversionScore: number;
        spamRiskFlags: string[];
        followUpPrompts: string[];
        hasSequenceProposal: boolean;
        proposedIdea?: Omit<EmailIdea, 'id'>;
        proposedSteps?: Array<Omit<SequenceStep, 'id'>>;
      }>(response.text, {
        reply: 'I analyzed your sequence. Try narrowing your Step 1 ask to a single yes/no question under 75 words.',
        deliverabilityScore: draftAudit.score,
        conversionScore: 78,
        spamRiskFlags: draftAudit.flags,
        followUpPrompts: [
          'Rewrite Step 1 under 60 words with a softer CTA',
          'Audit this copy for Google spam triggers',
          'Create a bold pattern-interrupt angle for my leads',
        ],
        hasSequenceProposal: false,
      });

      const normalizedSteps: SequenceStep[] | undefined =
        parsed.hasSequenceProposal && Array.isArray(parsed.proposedSteps) && parsed.proposedSteps.length > 0
          ? parsed.proposedSteps.map((s, idx) => ({
              id: `step_${idx + 1}`,
              stepNumber: s.stepNumber || idx + 1,
              delayHours: Number.isFinite(Number(s.delayHours)) ? Number(s.delayHours) : idx * 48,
              condition:
                s.condition === 'if_unopened' || s.condition === 'if_no_reply' || s.condition === 'always'
                  ? s.condition
                  : idx === 0
                  ? 'always'
                  : 'if_no_reply',
              subject: s.subject,
              subjectVariantB: s.subjectVariantB || s.subject,
              body: s.body,
            }))
          : undefined;

      const proposedIdea: EmailIdea | undefined =
        parsed.hasSequenceProposal && parsed.proposedIdea?.angleName
          ? {
              ...parsed.proposedIdea,
              id: `idea_${crypto.randomBytes(4).toString('hex')}`,
              subjectA: parsed.proposedIdea.subjectA || normalizedSteps?.[0]?.subject || '',
              subjectB: parsed.proposedIdea.subjectB || normalizedSteps?.[0]?.subjectVariantB || '',
              body: parsed.proposedIdea.body || normalizedSteps?.[0]?.body || '',
              followUp1: parsed.proposedIdea.followUp1 || normalizedSteps?.[1]?.body || '',
              followUp2: parsed.proposedIdea.followUp2 || normalizedSteps?.[2]?.body || '',
              psychologicalTrigger: parsed.proposedIdea.psychologicalTrigger || 'Conversion Strategist',
              predictedReplyLift: parsed.proposedIdea.predictedReplyLift || 'High-Intent Conversion Focus',
            }
          : undefined;

      res.json({
        reply: parsed.reply,
        deliverabilityScore: Math.min(100, Math.max(0, Number(parsed.deliverabilityScore) || draftAudit.score)),
        conversionScore: Math.min(100, Math.max(0, Number(parsed.conversionScore) || 82)),
        spamRiskFlags: Array.isArray(parsed.spamRiskFlags) ? parsed.spamRiskFlags : draftAudit.flags,
        followUpPrompts: Array.isArray(parsed.followUpPrompts) ? parsed.followUpPrompts.slice(0, 3) : [],
        proposedIdea,
        proposedSteps: normalizedSteps,
      });
    } catch (err: unknown) {
      console.error('Sequence chat error:', err);
      const formatted = formatAiError(err, 'AI strategist could not respond');
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Pre-Send Spam & Deliverability Copy Audit
  app.post('/api/ai/spam-audit', (req, res) => {
    const { steps = [] } = req.body as { steps?: Array<{ subject?: string; body?: string }> };
    const results = steps.map((s, idx) => ({
      stepNumber: idx + 1,
      ...analyzeSpamSignals(s.subject || '', s.body || ''),
    }));
    const minScore = results.length > 0 ? Math.min(...results.map((r) => r.score)) : 100;
    const allFlags = results.flatMap((r) => r.flags.map((f) => `Step 0${r.stepNumber}: ${f}`));
    res.json({
      overallSafetyScore: minScore,
      safeToSend: minScore >= 75,
      flags: allFlags,
      perStep: results,
    });
  });

  // AI Follow-Up Sequence Optimizer (evaluates live open/reply/bounce/spam telemetry)
  app.post('/api/ai/optimize-sequence', async (req, res) => {
    try {
      const { steps, offerContext, targetPersona, metrics } = req.body as {
        steps: SequenceStep[];
        offerContext: string;
        targetPersona: string;
        metrics: {
          sent: number;
          openRate: number;
          replyRate: number;
          bounceRate: number;
          spamCount?: number;
        };
      };

      const response = await generateWithFallback({
        systemInstruction: CONVERSION_DOCTRINE,
        thinkingLevel: ThinkingLevel.MEDIUM,
        contents: `Analyze and optimize this outbound cold email sequence based on live campaign telemetry.
Offer: ${offerContext}
Target Persona: ${targetPersona}
Live Metrics: Sent=${metrics.sent}, OpenRate=${metrics.openRate}%, ReplyRate=${metrics.replyRate}%, BounceRate=${metrics.bounceRate}%, SpamFlags=${metrics.spamCount ?? 0}

Current Sequence Steps:
${JSON.stringify(steps, null, 2)}

Rules:
- If spamCount > 0, eliminate every spam trigger, shorten copy under 70 words, strip links, and normalize subjects to 2-3 lowercase words.
- If openRate < 45%, overhaul subject lines (shorter, 2-4 words, lowercase curiosity/relevance, eliminate spam triggers).
- If openRate >= 45% but replyRate < 4%, tighten body copy to <80 words, front-load {{icebreaker}}, and replace hard asks with a frictionless yes/no question.
- Optimize follow-up delays and conditional branches (if_unopened vs if_no_reply).
Return JSON with optimizationSummary and optimizedSteps matching the exact step count.`,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            optimizationSummary: { type: Type.STRING },
            optimizedSteps: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  stepNumber: { type: Type.INTEGER },
                  delayHours: { type: Type.INTEGER },
                  condition: { type: Type.STRING },
                  subject: { type: Type.STRING },
                  subjectVariantB: { type: Type.STRING },
                  body: { type: Type.STRING },
                },
                required: ['stepNumber', 'delayHours', 'condition', 'subject', 'subjectVariantB', 'body'],
              },
            },
          },
          required: ['optimizationSummary', 'optimizedSteps'],
        },
      });

      const parsed = safeParseJson<{
        optimizationSummary: string;
        optimizedSteps: Array<Omit<SequenceStep, 'id'>>;
      }>(response.text, { optimizationSummary: '', optimizedSteps: [] });

      const normalizedSteps: SequenceStep[] = parsed.optimizedSteps.map((s, idx) => ({
        id: steps[idx]?.id || `step_${idx + 1}`,
        stepNumber: s.stepNumber || idx + 1,
        delayHours: Number(s.delayHours) || idx * 48,
        condition:
          s.condition === 'if_unopened' || s.condition === 'if_no_reply' || s.condition === 'always'
            ? s.condition
            : idx === 0
            ? 'always'
            : 'if_unopened',
        subject: s.subject,
        subjectVariantB: s.subjectVariantB,
        body: s.body,
      }));

      res.json({
        optimizationSummary: parsed.optimizationSummary,
        optimizedSteps: normalizedSteps,
      });
    } catch (err: unknown) {
      console.error('Optimize sequence error:', err);
      const formatted = formatAiError(err, 'Failed to optimize sequence');
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Deliverability & Google Guardrail Alerts Persistence
  app.get('/api/alerts', (_req, res) => {
    const store = readStore();
    res.json({ alerts: store.alerts });
  });

  app.post('/api/alerts', (req, res) => {
    const alert = req.body as DeliverabilityAlert;
    if (!alert?.title || !alert?.message) {
      res.status(400).json({ error: 'Invalid alert payload' });
      return;
    }
    const store = readStore();
    const nextAlert: DeliverabilityAlert = {
      ...alert,
      id: alert.id || `alrt_${crypto.randomBytes(4).toString('hex')}`,
      createdAt: alert.createdAt || new Date().toISOString(),
      acknowledged: Boolean(alert.acknowledged),
    };
    store.alerts = [nextAlert, ...store.alerts].slice(0, 50);
    writeStore(store);
    res.json({ alerts: store.alerts });
  });

  app.post('/api/alerts/acknowledge', (req, res) => {
    const { id } = req.body as { id?: string };
    const store = readStore();
    store.alerts = store.alerts.map((a) =>
      !id || a.id === id ? { ...a, acknowledged: true } : a
    );
    writeStore(store);
    res.json({ alerts: store.alerts });
  });

  // Real DNS Deliverability Diagnostic
  app.post('/api/deliverability/check', async (req, res) => {
    try {
      const { domain } = req.body as { domain?: string };
      if (!domain?.trim()) {
        res.status(400).json({ error: 'Domain or email address is required' });
        return;
      }
      const report = await inspectDeliverability(domain);
      const store = readStore();
      store.deliverabilityCache[report.domain] = report;
      writeStore(store);
      res.json({ report });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Deliverability check failed';
      res.status(500).json({ error: msg });
    }
  });

  // Tracking Pixel Endpoint (1x1 transparent PNG)
  app.get('/api/track/open/:trackingId.png', (req, res) => {
    const { trackingId } = req.params;
    const store = readStore();
    let updated = false;
    store.trackedEmails = store.trackedEmails.map((item) => {
      if (item.trackingId === trackingId) {
        updated = true;
        return {
          ...item,
          openCount: item.openCount + 1,
          lastOpenedAt: new Date().toISOString(),
          status: item.status === 'sent' ? 'opened' : item.status,
        };
      }
      return item;
    });
    if (updated) {
      writeStore(store);
    }

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(TRANSPARENT_PNG);
  });

  // Tracked Link Redirect
  app.get('/api/track/click/:trackingId', (req, res) => {
    const { trackingId } = req.params;
    const targetUrl = typeof req.query.to === 'string' && req.query.to.startsWith('http') ? req.query.to : '/';
    const store = readStore();
    let updated = false;
    store.trackedEmails = store.trackedEmails.map((item) => {
      if (item.trackingId === trackingId) {
        updated = true;
        return {
          ...item,
          clickCount: item.clickCount + 1,
          status: item.status === 'sent' || item.status === 'opened' ? 'clicked' : item.status,
        };
      }
      return item;
    });
    if (updated) writeStore(store);
    res.redirect(targetUrl);
  });

  // Tracking Records CRUD
  app.get('/api/tracking', (_req, res) => {
    const store = readStore();
    res.json({ trackedEmails: store.trackedEmails });
  });

  app.post('/api/tracking/record', (req, res) => {
    const record = req.body as TrackedEmail;
    if (!record?.trackingId || !record?.recipientEmail) {
      res.status(400).json({ error: 'Invalid tracked email payload' });
      return;
    }
    const store = readStore();
    store.trackedEmails = [record, ...store.trackedEmails];
    writeStore(store);
    res.json({ trackedEmails: store.trackedEmails });
  });

  app.post('/api/tracking/update-status', (req, res) => {
    const { updates } = req.body as {
      updates?: Array<{
        trackingId: string;
        status: TrackedEmail['status'];
        repliedAt?: string;
        bounceReason?: string;
      }>;
    };
    if (!Array.isArray(updates)) {
      res.status(400).json({ error: 'updates array required' });
      return;
    }
    const updateMap = new Map(updates.map((u) => [u.trackingId, u]));
    const store = readStore();
    store.trackedEmails = store.trackedEmails.map((item) => {
      const u = updateMap.get(item.trackingId);
      if (!u) return item;
      return {
        ...item,
        status: u.status,
        repliedAt: u.repliedAt ?? item.repliedAt,
        bounceReason: u.bounceReason ?? item.bounceReason,
      };
    });
    writeStore(store);
    res.json({ trackedEmails: store.trackedEmails });
  });

  // Direct Gmail / Workspace SMTP App Password verification & dispatch
  app.post('/api/smtp/verify', async (req, res) => {
    try {
      const { email, appPassword, host = 'smtp.gmail.com', port = 465 } = req.body as {
        email?: string;
        appPassword?: string;
        host?: string;
        port?: number;
      };
      if (!email?.trim() || !appPassword?.trim()) {
        res.status(400).json({ error: 'Email address and App Password are required.' });
        return;
      }

      const cleanPass = appPassword.replace(/\s+/g, '');
      const numericPort = Number(port) || 465;
      const transporter = nodemailer.createTransport({
        host: host.trim() || 'smtp.gmail.com',
        port: numericPort,
        secure: numericPort === 465,
        auth: {
          user: email.trim(),
          pass: cleanPass,
        },
      });

      await transporter.verify();
      res.json({ ok: true, email: email.trim(), host: host.trim(), port: numericPort });
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : 'SMTP verification failed';
      const friendly = raw.includes('535') || raw.toLowerCase().includes('username and password')
        ? 'Authentication failed (535). Make sure 2-Step Verification is enabled on your Google account and you are using a 16-character App Password (not your regular Gmail password).'
        : raw;
      res.status(400).json({ error: friendly });
    }
  });

  app.post('/api/smtp/send', async (req, res) => {
    try {
      const {
        email,
        displayName,
        appPassword,
        host = 'smtp.gmail.com',
        port = 465,
        toEmail,
        subject,
        bodyText,
        trackingId,
        trackingOrigin,
      } = req.body as {
        email?: string;
        displayName?: string;
        appPassword?: string;
        host?: string;
        port?: number;
        toEmail?: string;
        subject?: string;
        bodyText?: string;
        trackingId?: string;
        trackingOrigin?: string;
      };

      if (!email || !appPassword || !toEmail || !subject || !bodyText) {
        res.status(400).json({ error: 'Missing required SMTP send fields.' });
        return;
      }

      const cleanPass = appPassword.replace(/\s+/g, '');
      const numericPort = Number(port) || 465;
      const transporter = nodemailer.createTransport({
        host: host.trim() || 'smtp.gmail.com',
        port: numericPort,
        secure: numericPort === 465,
        auth: {
          user: email.trim(),
          pass: cleanPass,
        },
      });

      const escapeHtml = (str: string) =>
        str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const htmlParagraphs = escapeHtml(bodyText)
        .split('\n')
        .map((line) => (line.trim() ? `<p style="margin:0 0 12px 0;line-height:1.55;">${line}</p>` : '<br/>'))
        .join('');
      const pixelHtml =
        trackingId && trackingOrigin
          ? `<img src="${trackingOrigin}/api/track/open/${trackingId}.png" width="1" height="1" alt="" style="display:block;width:1px;height:1px;opacity:0;" />`
          : '';
      const html = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#111827;">${htmlParagraphs}${pixelHtml}</body></html>`;

      const info = await transporter.sendMail({
        from: displayName ? `"${displayName.replace(/"/g, '')}" <${email.trim()}>` : email.trim(),
        to: toEmail.trim(),
        subject,
        text: bodyText,
        html,
      });

      res.json({ id: info.messageId, threadId: '' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'SMTP send failed';
      const lower = msg.toLowerCase();
      let friendly = msg;
      if (lower.includes('5.4.5') || lower.includes('daily user sending quota')) {
        friendly = `550 5.4.5 Daily user sending quota exceeded on Google SMTP: ${msg}`;
      } else if (lower.includes('5.7.1') || lower.includes('554') || lower.includes('spam')) {
        friendly = `550 5.7.1 Message rejected/flagged as spam: ${msg}`;
      } else if (lower.includes('535')) {
        friendly = `535 Authentication failed — verify Google App Password: ${msg}`;
      }
      res.status(500).json({ error: friendly });
    }
  });

  // Serve Vite or static dist
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`KuroReach server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
