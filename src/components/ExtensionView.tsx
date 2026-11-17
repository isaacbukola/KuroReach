import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Briefcase,
  CheckCircle2,
  Chrome,
  Clock,
  Download,
  Loader2,
  Play,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Terminal,
} from 'lucide-react';
import type { FreelancerProfile, GmailAccountSlot, Lead } from '../types';
import { downloadChromeExtensionZip } from '../lib/extensionBuilder';
import { safeFetchJson } from '../lib/safeFetch';
import { BrandMark } from './BrandMark';

interface ExtensionViewProps {
  slots: GmailAccountSlot[];
  freelancerProfile: FreelancerProfile;
  onUpdateFreelancerProfile: (profile: FreelancerProfile) => void;
  pendingJobsCount: number;
  onLeadsIngested: (newLeads: Lead[]) => void;
  onExtensionOutreachQueued: () => Promise<void> | void;
  onGoToCampaigns: () => void;
}

interface EnrichedSiteResult {
  company: string;
  website: string;
  emails: string[];
  socials: string[];
  auditFindings: string[];
  opportunityScore: number;
  needSignal: string;
  suggestedIcebreaker: string;
}

interface FollowUpDueItem {
  id: string;
  recipientEmail: string;
  recipientName: string;
  company: string;
  subject: string;
  daysAgo: number;
  status: string;
}

const FREELANCE_PRESETS: Array<{
  specialty: string;
  defaultOffer: string;
}> = [
  {
    specialty: 'Web Design & Development',
    defaultOffer: 'High-converting website redesigns & mobile speed optimization',
  },
  {
    specialty: 'SEO & Google Maps Growth',
    defaultOffer: 'Local pack ranking sprints & high-intent organic lead generation',
  },
  {
    specialty: 'AI Automation & Chatbots',
    defaultOffer: '24/7 AI lead qualification agents & CRM workflow automation',
  },
  {
    specialty: 'Paid Ads & Funnel Growth',
    defaultOffer: 'ROI-tracked Meta/Google ad funnels that lower client CPA',
  },
  {
    specialty: 'Video Editing & Short-Form',
    defaultOffer: 'High-retention Reels/Shorts editing that turns viewers into booked calls',
  },
  {
    specialty: 'Copywriting & Email Retention',
    defaultOffer: 'Lifecycle email flows & landing page copy that lifts conversions',
  },
  {
    specialty: 'UI/UX & Product Design',
    defaultOffer: 'SaaS onboarding UX audits & clean Figma-to-React design systems',
  },
];

const SAMPLE_DIR_HTML = `Google Maps & Local Business Directory Capture:
1. BrightSmile Dental Studio (hello@brightsmiledental.co) — Manchester UK — http://brightsmiledental.co — 4.9 stars (142 reviews)
2. Oakridge Roofing & Solar (estimates@oakridgeroofing.com) — Austin, TX — No website listed
3. Example Studio Co — London — https://example.com`;

const SPAM_WORDS = [
  'free',
  'guarantee',
  '100%',
  'act now',
  'limited time',
  'urgent',
  'click here',
  'buy now',
  'discount',
];

export const ExtensionView: React.FC<ExtensionViewProps> = ({
  slots,
  freelancerProfile,
  onUpdateFreelancerProfile,
  pendingJobsCount,
  onLeadsIngested,
  onExtensionOutreachQueued,
  onGoToCampaigns,
}) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [simTab, setSimTab] = useState<'scrape' | 'send' | 'followups'>('scrape');
  const [simUrl, setSimUrl] = useState('https://www.google.com/maps/search/local+businesses');
  const [simText, setSimText] = useState(SAMPLE_DIR_HTML);
  const [simMailboxIdx, setSimMailboxIdx] = useState(0);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isEnrichingSites, setIsEnrichingSites] = useState(false);
  const [enrichedSites, setEnrichedSites] = useState<EnrichedSiteResult[]>([]);
  const [simProgress, setSimProgress] = useState<{
    pass: number;
    maxPasses: number;
    count: number;
    rate: string;
    active: boolean;
  } | null>(null);
  const [simResult, setSimResult] = useState<string | null>(null);

  // Tab 2 Simulator (Multi-Send Pitch) state
  const [simRecipients, setSimRecipients] = useState(
    'hello@brightsmiledental.co, estimates@oakridgeroofing.com, studio@atelierkora.design'
  );
  const [simSubject, setSimSubject] = useState('{{company}} <> quick idea');
  const [simBody, setSimBody] = useState(
    `Hi {{firstName}},\n\n{{icebreaker}}\n\nI help businesses like {{company}} fix {{painPoint}} without bloated agency retainers.\n\nOpen to a quick 2-minute teardown for {{company}}?`
  );
  const [simFollowUp1, setSimFollowUp1] = useState('');
  const [simFollowUp2, setSimFollowUp2] = useState('');
  const [isDraftingPitch, setIsDraftingPitch] = useState(false);
  const [isQueueingBatch, setIsQueueingBatch] = useState(false);
  const [confirmQueueOpen, setConfirmQueueOpen] = useState(false);
  const [simSendResult, setSimSendResult] = useState<string | null>(null);

  // Tab 3 Simulator (Follow-Ups & Duplicate Shield) state
  const [contactedStats, setContactedStats] = useState<{
    emails: string[];
    domains: string[];
    followUpsDue: FollowUpDueItem[];
  }>({ emails: [], domains: [], followUpsDue: [] });
  const [isLoadingIndex, setIsLoadingIndex] = useState(false);
  const [copiedFollowUpId, setCopiedFollowUpId] = useState<string | null>(null);

  const [iconLoadFailed, setIconLoadFailed] = useState(false);
  const [backdropLoadFailed, setBackdropLoadFailed] = useState(false);

  const connectedEmails = slots.filter((s) => s.email).map((s) => s.email as string);

  const fetchContactedIndex = async () => {
    setIsLoadingIndex(true);
    try {
      const res = await safeFetchJson<{
        contactedEmails?: string[];
        contactedDomains?: string[];
        followUpsDue?: FollowUpDueItem[];
      }>('/api/extension/contacted-index');
      setContactedStats({
        emails: res.contactedEmails ?? [],
        domains: res.contactedDomains ?? [],
        followUpsDue: res.followUpsDue ?? [],
      });
    } catch {
      // Keep previous cached index on transient errors
    } finally {
      setIsLoadingIndex(false);
    }
  };

  useEffect(() => {
    void fetchContactedIndex();
  }, []);

  const parsedEmails = useMemo(() => {
    const tokens = simRecipients
      .split(/[\s,;\n]+/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
    return Array.from(new Set(tokens)).slice(0, 200);
  }, [simRecipients]);

  const shieldedOverlapCount = useMemo(() => {
    const emailSet = new Set(contactedStats.emails);
    const domainSet = new Set(contactedStats.domains);
    return parsedEmails.filter((em) => {
      const dom = em.split('@')[1] || '';
      return emailSet.has(em) || (dom && domainSet.has(dom));
    }).length;
  }, [contactedStats.domains, contactedStats.emails, parsedEmails]);

  const pitchLint = useMemo(() => {
    const combined = `${simSubject} ${simBody}`.toLowerCase();
    const hits = SPAM_WORDS.filter((w) => combined.includes(w));
    const words = simBody.trim().split(/\s+/).filter(Boolean).length;
    return { hits, words };
  }, [simSubject, simBody]);

  const handlePresetSelect = (specialty: string) => {
    const preset = FREELANCE_PRESETS.find((p) => p.specialty === specialty);
    onUpdateFreelancerProfile({
      ...freelancerProfile,
      specialty,
      serviceOffer: preset?.defaultOffer || freelancerProfile.serviceOffer,
    });
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await downloadChromeExtensionZip(window.location.origin, connectedEmails, freelancerProfile);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleSimulateExtensionScrape = async (loadIntoMultiSend = false) => {
    setIsSimulating(true);
    setSimResult(null);
    try {
      const emailMatches = simText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [];
      if (loadIntoMultiSend) {
        const enrichedEmails = enrichedSites.flatMap((s) => s.emails);
        const merged = Array.from(
          new Set([
            ...emailMatches.map((e) => e.toLowerCase()),
            ...enrichedEmails.map((e) => e.toLowerCase()),
            ...parsedEmails,
          ])
        ).slice(0, 200);
        setSimRecipients(merged.join(', '));
        setSimTab('send');
        setSimSendResult(
          `Loaded ${merged.length} client email(s) from captured tab. Draft with AI or queue multi-send below.`
        );
        return;
      }

      const maxPasses = 4;
      for (let p = 1; p <= maxPasses; p++) {
        setSimProgress({
          pass: p,
          maxPasses,
          count: Math.min(emailMatches.length || 3, Math.ceil(((emailMatches.length || 3) * p) / maxPasses)),
          rate: (4.2 * p).toFixed(1),
          active: true,
        });
        await new Promise((r) => setTimeout(r, 260));
      }

      const data = await safeFetchJson<{ ingested?: number; leads?: Lead[] }>('/api/extension/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageUrl: simUrl,
          pageTitle: 'Chrome Active Tab Capture',
          rawEmails: emailMatches,
          rawText: simText,
          targetCount: 200,
        }),
      });
      if (data.leads && data.leads.length > 0) {
        onLeadsIngested(data.leads);
      }
      if (emailMatches.length > 0) {
        const merged = Array.from(
          new Set([...emailMatches.map((e) => e.toLowerCase()), ...parsedEmails])
        ).slice(0, 200);
        setSimRecipients(merged.join(', '));
      }
      setSimProgress({
        pass: maxPasses,
        maxPasses,
        count: data.ingested ?? emailMatches.length,
        rate: '14.8',
        active: false,
      });
      setSimResult(
        `Scan complete — Ingested ${data.ingested ?? 0} verified leads & synced ${emailMatches.length} client emails into Multi-Send.`
      );
      void fetchContactedIndex();
    } catch (err: unknown) {
      setSimProgress(null);
      setSimResult(`Error: ${err instanceof Error ? err.message : 'Ingest failed'}`);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleSimulateHuntAndAudit = async () => {
    setIsEnrichingSites(true);
    setSimResult(null);
    try {
      const urlMatches = Array.from(
        new Set(simText.match(/https?:\/\/[^\s),;>]+/gi) ?? [])
      ).slice(0, 8);
      const emailDomains = Array.from(
        new Set(
          (simText.match(/[a-zA-Z0-9._%+-]+@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g) ?? []).map((e) =>
            `https://${e.split('@')[1]}`
          )
        )
      ).slice(0, 4);

      const candidateUrls = urlMatches.length > 0 ? urlMatches : emailDomains;
      if (candidateUrls.length === 0) {
        setSimResult('No public website URLs detected in captured text to audit.');
        return;
      }

      const targets = candidateUrls.map((website) => {
        let host = website;
        try {
          host = new URL(website).hostname.replace(/^www\./, '');
        } catch {
          // keep raw
        }
        return {
          company: host.split('.')[0] || 'Prospect',
          website,
        };
      });

      const res = await safeFetchJson<{ enriched?: EnrichedSiteResult[] }>('/api/extension/enrich-sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targets }),
      });

      const list = res.enriched ?? [];
      setEnrichedSites(list);
      const huntedEmails = Array.from(new Set(list.flatMap((item) => item.emails)));
      if (huntedEmails.length > 0) {
        setSimRecipients((prev) =>
          Array.from(new Set([...parsedEmails, ...huntedEmails])).slice(0, 200).join(', ') || prev
        );
      }
      setSimResult(
        `Audited ${list.length} site(s) — discovered ${huntedEmails.length} website email(s) & generated personalized audit icebreakers.`
      );
    } catch (err: unknown) {
      setSimResult(`Audit Error: ${err instanceof Error ? err.message : 'Site enrichment failed'}`);
    } finally {
      setIsEnrichingSites(false);
    }
  };

  const handleInsertBookingLink = () => {
    const link = freelancerProfile.bookingUrl?.trim();
    if (!link) {
      setSimSendResult('Add your Booking Link in the Identity & Proof Vault above first.');
      return;
    }
    if (simBody.includes(link)) return;
    setSimBody((prev) => `${prev.trim()}\n\nHappy to hop on a quick 10-min chat here: ${link}`);
    setSimSendResult('Inserted booking link into pitch body.');
  };

  const handleInsertProofSnippet = () => {
    const proof = freelancerProfile.caseStudyNotes?.trim() || freelancerProfile.portfolioUrl?.trim();
    if (!proof) {
      setSimSendResult('Add a Proof / Case Study snippet in the Vault above first.');
      return;
    }
    if (simBody.includes(proof)) return;
    setSimBody((prev) => `${prev.trim()}\n\nRecent client result: ${proof}`);
    setSimSendResult('Inserted proof / case study line into pitch body.');
  };

  const handleSimAiDraft = async () => {
    setIsDraftingPitch(true);
    setSimSendResult(null);
    try {
      const sampleCompanies =
        enrichedSites.length > 0
          ? enrichedSites.slice(0, 4).map((s) => ({
              company: s.company,
              website: s.website,
              needSignal: s.needSignal,
            }))
          : parsedEmails.slice(0, 4).map((em) => {
              const dom = em.split('@')[1] || '';
              return {
                company: dom.split('.')[0] || 'Client',
                website: dom ? `https://${dom}` : '',
                needSignal: 'Potential freelance outreach client',
              };
            });

      const data = await safeFetchJson<{
        angleName?: string;
        subjectA?: string;
        body?: string;
        followUp1?: string;
        followUp2?: string;
      }>('/api/extension/freelancer-pitch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          specialty: freelancerProfile.specialty,
          serviceOffer: freelancerProfile.serviceOffer,
          portfolioUrl: freelancerProfile.portfolioUrl,
          senderName: freelancerProfile.senderName,
          sampleCompanies,
          pageContext: simUrl,
        }),
      });
      if (data.subjectA) setSimSubject(data.subjectA);
      if (data.body) setSimBody(data.body);
      if (data.followUp1) setSimFollowUp1(data.followUp1);
      if (data.followUp2) setSimFollowUp2(data.followUp2);
      setSimSendResult(`AI generated "${data.angleName || freelancerProfile.specialty}" pitch.`);
    } catch (err: unknown) {
      setSimSendResult(`AI Draft Error: ${err instanceof Error ? err.message : 'Failed'}`);
    } finally {
      setIsDraftingPitch(false);
    }
  };

  const handleConfirmQueueBatch = async () => {
    if (parsedEmails.length === 0) return;
    setConfirmQueueOpen(false);
    setIsQueueingBatch(true);
    setSimSendResult(null);
    try {
      const recipients = parsedEmails.map((email) => {
        const dom = email.split('@')[1] || '';
        const local = email.split('@')[0] || 'there';
        const company = dom ? dom.split('.')[0] : 'Client';
        const matchedAudit = enrichedSites.find(
          (s) => s.emails.includes(email) || s.website.includes(dom)
        );
        return {
          email,
          name: local.split(/[._-]/)[0] || 'there',
          company: company.charAt(0).toUpperCase() + company.slice(1),
          website: matchedAudit?.website || (dom ? `https://${dom}` : ''),
          icebreaker:
            matchedAudit?.suggestedIcebreaker ||
            `Noticed ${company} while researching teams that could benefit from ${freelancerProfile.specialty.toLowerCase()}.`,
          painPoint:
            matchedAudit?.needSignal || freelancerProfile.serviceOffer || freelancerProfile.specialty,
        };
      });

      const res = await safeFetchJson<{ queuedCount: number }>('/api/extension/outreach-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients,
          sequenceName: `Freelancer: ${freelancerProfile.specialty}`,
          freelancerService: freelancerProfile.serviceOffer,
          subject: simSubject.trim(),
          subjectVariantB: simSubject.trim(),
          body: simBody.trim(),
          followUp1: simFollowUp1,
          followUp2: simFollowUp2,
          slotIndex: simMailboxIdx,
        }),
      });
      await onExtensionOutreachQueued();
      void fetchContactedIndex();
      setSimSendResult(
        `Queued ${res.queuedCount} client emails into Tracking & Send with Google Spam Guard active.`
      );
    } catch (err: unknown) {
      setSimSendResult(`Queue Error: ${err instanceof Error ? err.message : 'Failed'}`);
    } finally {
      setIsQueueingBatch(false);
    }
  };

  const handleLoadFollowUpIntoMultiSend = (item: FollowUpDueItem) => {
    setSimRecipients(item.recipientEmail);
    setSimSubject(`Re: ${item.subject}`);
    setSimBody(
      `Hi ${item.recipientName || 'there'},\n\nQuick follow-up on my note from ${item.daysAgo} days ago regarding ${item.company || 'your team'}. Happy to send over a 60-second teardown whenever convenient.${
        freelancerProfile.bookingUrl ? `\n\nOr pick a quick slot here: ${freelancerProfile.bookingUrl}` : ''
      }`
    );
    setCopiedFollowUpId(item.id);
    setTimeout(() => setCopiedFollowUpId(null), 2000);
    setSimTab('send');
  };

  return (
    <div className="space-y-8">
      {/* Cinematic Monochrome Extension Hero */}
      <div className="relative rounded-xl border border-white/[0.1] bg-[#121317] overflow-hidden">
        {!backdropLoadFailed && (
          <img
            src="/src/assets/images/obsidian_telemetry_backdrop_1794670122801.jpg"
            alt="KuroReach Monochrome Obsidian Architecture"
            referrerPolicy="no-referrer"
            onError={() => setBackdropLoadFailed(true)}
            className="absolute inset-0 w-full h-full object-cover opacity-30 pointer-events-none"
          />
        )}
        <div className="relative z-10 p-8 bg-gradient-to-r from-[#09090B]/95 via-[#09090B]/85 to-[#09090B]/60 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
          <div className="flex items-start gap-5 max-w-2xl">
            <div className="w-16 h-16 rounded-xl border border-white/[0.16] bg-[#09090B] overflow-hidden shrink-0 flex items-center justify-center">
              {!iconLoadFailed ? (
                <img
                  src="/src/assets/images/kuroreach_icon_1794670122095.jpg"
                  alt="KuroReach Black and White Chrome Extension Icon"
                  referrerPolicy="no-referrer"
                  onError={() => setIconLoadFailed(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <BrandMark size={52} />
              )}
            </div>

            <div className="space-y-2">
              <div className="text-xs font-mono text-zinc-400">
                Manifest V3 · v2.0.0 · Alt+K Copilot, Email Hunter, Site Audit &amp; Gmail Compose Bar
              </div>
              <h2 className="font-display text-2xl font-semibold tracking-tight text-white">
                KuroReach Freelancer Copilot v2.0
              </h2>
              <p className="text-sm text-zinc-300 leading-relaxed">
                Press <span className="font-mono text-white">Alt+K</span> on any page for a persistent slide-over drawer. Auto-scroll directories, hunt hidden emails &amp; audit client websites, shield duplicate pitches, track 48h+ follow-ups, and draft pitches directly inside Gmail Compose.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            {pendingJobsCount > 0 && (
              <button
                type="button"
                onClick={onGoToCampaigns}
                className="px-4 py-3 rounded-lg border border-emerald-500/40 bg-emerald-500/15 text-emerald-200 text-xs font-semibold hover:bg-emerald-500/25 transition-colors flex items-center gap-2"
              >
                <span>{pendingJobsCount} Pending Batch Ready</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={handleDownload}
              disabled={isDownloading}
              className="px-5 py-3 rounded-lg bg-white text-[#09090B] text-xs font-semibold hover:bg-zinc-200 transition-colors flex items-center gap-2.5 disabled:opacity-50"
            >
              {isDownloading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>Download Copilot v2.0 (.zip)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Freelancer Profile & Proof Vault Bundled Into Extension */}
      <div className="rounded-xl bg-[#121317] border border-white/[0.08] p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Briefcase className="w-4 h-4 text-zinc-300" />
            <div>
              <h3 className="font-display text-sm font-semibold text-white">
                Freelancer Identity, Proof Vault &amp; Niche Presets (Bundled into Extension ZIP)
              </h3>
              <p className="text-xs text-zinc-400">
                Pre-loads your freelance offer, booking link, and case study snippet for 1-click insertion inside both the Extension Copilot and Gmail Compose Bar.
              </p>
            </div>
          </div>
          <span className="font-mono text-[11px] text-zinc-500">
            {connectedEmails.length}/3 Gmail slots bundled
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {FREELANCE_PRESETS.map((preset) => (
            <button
              key={preset.specialty}
              type="button"
              onClick={() => handlePresetSelect(preset.specialty)}
              className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${
                freelancerProfile.specialty === preset.specialty
                  ? 'bg-white text-[#09090B] border-white font-semibold'
                  : 'bg-[#09090B] text-zinc-400 border-white/[0.08] hover:text-white'
              }`}
            >
              {preset.specialty}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          <div className="space-y-1">
            <label htmlFor="fl-offer" className="text-[11px] text-zinc-400 block">
              Your Core Freelance Offer
            </label>
            <input
              id="fl-offer"
              type="text"
              value={freelancerProfile.serviceOffer}
              onChange={(e) =>
                onUpdateFreelancerProfile({ ...freelancerProfile, serviceOffer: e.target.value })
              }
              placeholder="e.g. Fast Next.js landing pages that double bookings"
              className="w-full rounded-lg bg-[#09090B] border border-white/[0.1] px-3 py-2 text-xs text-white focus:outline-none focus:border-white/40"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="fl-name" className="text-[11px] text-zinc-400 block">
              Your Name / Sign-Off
            </label>
            <input
              id="fl-name"
              type="text"
              value={freelancerProfile.senderName}
              onChange={(e) =>
                onUpdateFreelancerProfile({ ...freelancerProfile, senderName: e.target.value })
              }
              placeholder="e.g. Isaac"
              className="w-full rounded-lg bg-[#09090B] border border-white/[0.1] px-3 py-2 text-xs text-white focus:outline-none focus:border-white/40"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="fl-portfolio" className="text-[11px] text-zinc-400 block">
              Portfolio URL (Optional)
            </label>
            <input
              id="fl-portfolio"
              type="url"
              value={freelancerProfile.portfolioUrl}
              onChange={(e) =>
                onUpdateFreelancerProfile({ ...freelancerProfile, portfolioUrl: e.target.value })
              }
              placeholder="https://yourportfolio.com"
              className="w-full rounded-lg bg-[#09090B] border border-white/[0.1] px-3 py-2 font-mono text-xs text-white focus:outline-none focus:border-white/40"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label htmlFor="fl-booking" className="text-[11px] text-zinc-400 block">
              Booking Link — Cal.com / Calendly (+ Booking Shortcut)
            </label>
            <input
              id="fl-booking"
              type="url"
              value={freelancerProfile.bookingUrl || ''}
              onChange={(e) =>
                onUpdateFreelancerProfile({ ...freelancerProfile, bookingUrl: e.target.value })
              }
              placeholder="https://cal.com/yourname/15min"
              className="w-full rounded-lg bg-[#09090B] border border-white/[0.1] px-3 py-2 font-mono text-xs text-white focus:outline-none focus:border-white/40"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="fl-proof" className="text-[11px] text-zinc-400 block">
              Case Study / Proof Snippet (+ Proof Shortcut)
            </label>
            <input
              id="fl-proof"
              type="text"
              value={freelancerProfile.caseStudyNotes || ''}
              onChange={(e) =>
                onUpdateFreelancerProfile({ ...freelancerProfile, caseStudyNotes: e.target.value })
              }
              placeholder="e.g. Helped BrightSmile Dental increase booked calls by 38% in 21 days"
              className="w-full rounded-lg bg-[#09090B] border border-white/[0.1] px-3 py-2 text-xs text-white focus:outline-none focus:border-white/40"
            />
          </div>
        </div>
      </div>

      {/* Split: Load Unpacked Guide + Live Interactive Extension Popup Simulator */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-5 rounded-xl bg-[#121317] border border-white/[0.08] p-6 space-y-5">
          <div className="flex items-center gap-2.5">
            <Chrome className="w-4 h-4 text-zinc-300" />
            <h3 className="font-display text-base font-semibold text-white">
              What&apos;s Included in Extension v2.0
            </h3>
          </div>

          <ol className="space-y-3.5 text-xs text-zinc-300">
            <li className="flex items-start gap-3">
              <span className="font-mono text-zinc-500 pt-0.5">01.</span>
              <div>
                <div className="font-medium text-white">Auto-Scroll HUD &amp; Website Email Hunter</div>
                <p className="text-zinc-400 mt-0.5">
                  Rapidly auto-scrolls Maps &amp; directories with a live Shadow-DOM HUD, then visits scraped domains&apos; <span className="font-mono text-zinc-200">/contact</span> pages to uncover hidden emails + run SSL, mobile viewport, SEO, and booking-widget audits.
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="font-mono text-zinc-500 pt-0.5">02.</span>
              <div>
                <div className="font-medium text-white">Alt+K Slide-Over Copilot &amp; Duplicate Shield</div>
                <p className="text-zinc-400 mt-0.5">
                  Press <span className="font-mono text-zinc-200">Alt+K</span> on any site for a persistent right-edge drawer. Already-contacted leads get badged <span className="font-mono text-zinc-200">PITCHED</span> and unchecked automatically so you never double-pitch.
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="font-mono text-zinc-500 pt-0.5">03.</span>
              <div>
                <div className="font-medium text-white">Native Gmail Compose Copilot &amp; Proof Vault</div>
                <p className="text-zinc-400 mt-0.5">
                  On <span className="font-mono text-zinc-200">mail.google.com</span>, an inline toolbar lets you drop in an AI Pitch, Follow-Up Nudge, Budget Reply, or your Cal.com Booking Link in one click.
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="font-mono text-zinc-500 pt-0.5">04.</span>
              <div>
                <div className="font-medium text-white">48h+ Follow-Ups Due &amp; Multi-Send Guard</div>
                <p className="text-zinc-400 mt-0.5">
                  Tab 3 surfaces unreplied prospects after 48h for instant Gmail nudges. Batch sends dispatch safely through your connected Gmail slots with Google Spam Auto-Pause.
                </p>
              </div>
            </li>
          </ol>

          <div className="pt-2 border-t border-white/[0.08] text-[11px] text-zinc-400">
            Install via <span className="font-mono text-zinc-200">chrome://extensions</span> → Developer mode → <span className="text-white">Load unpacked</span> on the extracted folder.
          </div>
        </div>

        {/* Live Extension Popup Simulator */}
        <div className="lg:col-span-7 rounded-xl bg-[#121317] border border-white/[0.08] p-6 space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <Terminal className="w-4 h-4 text-zinc-300" />
              <h3 className="font-display text-base font-semibold text-white">
                Live Freelancer Extension v2.0 Simulator
              </h3>
            </div>
            <span className="font-mono text-[11px] text-zinc-500">
              Duplicate Shield: {contactedStats.emails.length} emails · {contactedStats.domains.length} domains
            </span>
          </div>

          {/* Authentic Chrome Popup Frame */}
          <div className="rounded-xl bg-[#09090B] border border-white/[0.14] p-4 space-y-3.5 max-w-[440px] mx-auto">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-2.5">
                <BrandMark size={24} />
                <div>
                  <div className="text-xs font-semibold text-white">
                    KuroReach <span className="font-mono text-[10px] text-zinc-400">v2.0</span>
                  </div>
                  <div className="text-[10px] text-zinc-500">Freelancer Copilot &amp; Multi-Send</div>
                </div>
              </div>
              <select
                value={simMailboxIdx}
                onChange={(e) => setSimMailboxIdx(Number(e.target.value))}
                aria-label="Simulator Active Gmail Slot"
                className="rounded bg-[#121317] border border-white/[0.12] px-2 py-1 font-mono text-[11px] text-zinc-200 max-w-[165px]"
              >
                {(connectedEmails.length > 0
                  ? connectedEmails
                  : ['Slot 1 (Connect in Dashboard)', 'Slot 2', 'Slot 3']
                ).map((em, i) => (
                  <option key={i} value={i}>
                    {em}
                  </option>
                ))}
              </select>
            </div>

            {/* 3-Tab Switcher matching real popup.html v2.0 */}
            <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-[#121317] border border-white/[0.08]">
              <button
                type="button"
                onClick={() => setSimTab('scrape')}
                className={`py-1.5 rounded-md text-[11px] font-semibold transition-colors ${
                  simTab === 'scrape' ? 'bg-white text-[#09090B]' : 'text-zinc-400 hover:text-white'
                }`}
              >
                1. Scrape
              </button>
              <button
                type="button"
                onClick={() => setSimTab('send')}
                className={`py-1.5 rounded-md text-[11px] font-semibold transition-colors ${
                  simTab === 'send' ? 'bg-white text-[#09090B]' : 'text-zinc-400 hover:text-white'
                }`}
              >
                2. Multi-Send ({parsedEmails.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setSimTab('followups');
                  void fetchContactedIndex();
                }}
                className={`py-1.5 rounded-md text-[11px] font-semibold transition-colors ${
                  simTab === 'followups' ? 'bg-white text-[#09090B]' : 'text-zinc-400 hover:text-white'
                }`}
              >
                3. Follow-Ups ({contactedStats.followUpsDue.length})
              </button>
            </div>

            {simTab === 'scrape' && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-500 block">Simulated Active Tab URL</label>
                  <input
                    type="url"
                    value={simUrl}
                    onChange={(e) => setSimUrl(e.target.value)}
                    className="w-full rounded bg-[#121317] border border-white/[0.08] px-2.5 py-1.5 font-mono text-[11px] text-zinc-200"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-500 block">
                    Target Page DOM / Directory Text
                  </label>
                  <textarea
                    rows={4}
                    value={simText}
                    onChange={(e) => setSimText(e.target.value)}
                    className="w-full rounded bg-[#121317] border border-white/[0.08] px-2.5 py-1.5 font-mono text-[11px] text-zinc-300 leading-relaxed"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleSimulateExtensionScrape(false)}
                    disabled={isSimulating || isEnrichingSites}
                    className="py-2 px-3 rounded-md bg-white text-[#09090B] text-[11px] font-semibold hover:bg-zinc-200 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {isSimulating ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                    <span>{isSimulating ? 'Scrolling Tab...' : 'Auto-Scroll & Scrape'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSimulateHuntAndAudit}
                    disabled={isSimulating || isEnrichingSites}
                    className="py-2 px-3 rounded-md border border-white/[0.14] bg-[#121317] text-zinc-100 text-[11px] font-medium hover:bg-white/[0.06] transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {isEnrichingSites ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Search className="w-3.5 h-3.5" />
                    )}
                    <span>{isEnrichingSites ? 'Auditing Sites...' : 'Hunt & Audit Sites'}</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => handleSimulateExtensionScrape(true)}
                  disabled={isSimulating}
                  className="w-full py-1.5 px-3 rounded-md border border-white/[0.1] bg-[#09090B] text-zinc-300 text-[11px] font-medium hover:bg-white/[0.05] transition-colors flex items-center justify-center gap-1.5"
                >
                  <span>Load Captured Emails into Multi-Send</span>
                  <ArrowRight className="w-3 h-3" />
                </button>

                {simProgress && (
                  <div className="rounded-md bg-[#121317] border border-white/[0.12] p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between font-mono text-[10px]">
                      <span className="text-white font-semibold">
                        {simProgress.active ? 'SCROLLING & SCRAPING' : 'SCAN COMPLETE'}
                      </span>
                      <span className="text-zinc-400">
                        Pass {simProgress.pass}/{simProgress.maxPasses} · {simProgress.count} leads · {simProgress.rate}/s
                      </span>
                    </div>
                    <div className="h-1 w-full rounded-full bg-white/[0.08] overflow-hidden">
                      <div
                        className="h-full bg-white transition-all duration-200"
                        style={{ width: `${Math.round((simProgress.pass / simProgress.maxPasses) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {enrichedSites.length > 0 && (
                  <div className="rounded-md bg-[#121317] border border-white/[0.1] p-2.5 space-y-2 max-h-40 overflow-y-auto">
                    <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                      Live Site Audit &amp; Email Hunter Results
                    </div>
                    {enrichedSites.map((site, idx) => (
                      <div key={idx} className="border-t border-white/[0.06] pt-2 first:border-t-0 first:pt-0 space-y-1">
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="font-semibold text-white truncate">{site.website}</span>
                          <span className="font-mono text-emerald-400 shrink-0">
                            Opp {site.opportunityScore}/99
                          </span>
                        </div>
                        <div className="text-[10px] text-zinc-400">{site.needSignal}</div>
                        {site.emails.length > 0 && (
                          <div className="font-mono text-[10px] text-zinc-200">
                            Emails found: {site.emails.join(', ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {simResult && (
                  <div className="rounded-md bg-[#121317] border border-white/[0.08] px-3 py-2 text-[11px] text-zinc-200 flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>{simResult}</span>
                  </div>
                )}
              </div>
            )}

            {simTab === 'send' && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <label className="text-zinc-400">Client Emails (comma or newline, max 200)</label>
                    <span className="font-mono text-zinc-500">
                      {parsedEmails.length} valid
                      {shieldedOverlapCount > 0 ? ` · ${shieldedOverlapCount} already pitched` : ''}
                    </span>
                  </div>
                  <textarea
                    rows={2}
                    value={simRecipients}
                    onChange={(e) => setSimRecipients(e.target.value)}
                    placeholder="client1@company.com, founder@studio.co"
                    className="w-full rounded bg-[#121317] border border-white/[0.08] px-2.5 py-1.5 font-mono text-[11px] text-zinc-200"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-[11px] text-zinc-400">Subject &amp; Pitch Body</label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={handleInsertBookingLink}
                        className="px-2 py-1 rounded border border-white/[0.14] text-zinc-200 text-[10px] hover:bg-white/[0.06]"
                      >
                        + Booking
                      </button>
                      <button
                        type="button"
                        onClick={handleInsertProofSnippet}
                        className="px-2 py-1 rounded border border-white/[0.14] text-zinc-200 text-[10px] hover:bg-white/[0.06]"
                      >
                        + Proof
                      </button>
                      <button
                        type="button"
                        onClick={handleSimAiDraft}
                        disabled={isDraftingPitch}
                        className="px-2 py-1 rounded bg-white text-[#09090B] text-[10px] font-semibold hover:bg-zinc-200 inline-flex items-center gap-1 disabled:opacity-50"
                      >
                        {isDraftingPitch ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Sparkles className="w-3 h-3" />
                        )}
                        <span>AI Draft</span>
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={simSubject}
                    onChange={(e) => setSimSubject(e.target.value)}
                    className="w-full rounded bg-[#121317] border border-white/[0.08] px-2.5 py-1.5 text-[11px] text-white"
                  />
                  <textarea
                    rows={4}
                    value={simBody}
                    onChange={(e) => setSimBody(e.target.value)}
                    className="w-full rounded bg-[#121317] border border-white/[0.08] px-2.5 py-1.5 text-[11px] text-zinc-200 leading-relaxed"
                  />
                  <div
                    className={`font-mono text-[10px] flex items-center gap-1.5 ${
                      pitchLint.hits.length > 0 || pitchLint.words > 110
                        ? 'text-amber-300'
                        : 'text-zinc-500'
                    }`}
                  >
                    <ShieldCheck className="w-3 h-3 shrink-0" />
                    <span>
                      {pitchLint.hits.length > 0
                        ? `Spam Risk (${pitchLint.words}w): Remove "${pitchLint.hits.join('", "')}"`
                        : pitchLint.words > 110
                        ? `Length ${pitchLint.words}w (keep <= 90w for highest client reply rate)`
                        : `Inbox Safety Clean · ${pitchLint.words} words`}
                    </span>
                  </div>
                </div>

                {confirmQueueOpen ? (
                  <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 p-3 space-y-2.5 text-[11px] text-amber-100">
                    <p>
                      Queue <strong>{parsedEmails.length} client email(s)</strong> into KuroReach Gmail Dispatch with subject &ldquo;{simSubject}&rdquo;?
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmQueueOpen(false)}
                        className="py-1.5 rounded border border-white/[0.15] text-zinc-200 hover:bg-white/[0.06]"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmQueueBatch}
                        className="py-1.5 rounded bg-white text-[#09090B] font-semibold hover:bg-zinc-200"
                      >
                        Confirm Queue
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmQueueOpen(true)}
                    disabled={parsedEmails.length === 0 || isQueueingBatch}
                    className="w-full py-2 px-3 rounded-md bg-white text-[#09090B] text-[11px] font-semibold hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2 disabled:opacity-45"
                  >
                    {isQueueingBatch ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    <span>Queue {parsedEmails.length} Emails in KuroReach Gmail</span>
                  </button>
                )}

                {simSendResult && (
                  <div className="rounded-md bg-[#121317] border border-white/[0.08] px-3 py-2 text-[11px] text-zinc-200 flex items-center justify-between gap-2">
                    <span>{simSendResult}</span>
                    {simSendResult.startsWith('Queued') && (
                      <button
                        type="button"
                        onClick={onGoToCampaigns}
                        className="px-2 py-1 rounded bg-white text-[#09090B] font-semibold shrink-0"
                      >
                        Open Dispatch
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {simTab === 'followups' && (
              <div className="space-y-3">
                <div className="rounded-md bg-[#121317] border border-white/[0.08] p-2.5 flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-2 text-zinc-300">
                    <Clock className="w-3.5 h-3.5 text-zinc-400" />
                    <span>48h+ Unreplied Pitches Due</span>
                  </div>
                  <button
                    type="button"
                    onClick={fetchContactedIndex}
                    disabled={isLoadingIndex}
                    className="font-mono text-[10px] text-zinc-300 hover:text-white underline"
                  >
                    {isLoadingIndex ? 'Syncing...' : 'Refresh Index'}
                  </button>
                </div>

                {contactedStats.followUpsDue.length === 0 ? (
                  <div className="rounded-md bg-[#121317] border border-white/[0.08] p-4 text-center space-y-1">
                    <div className="text-xs font-medium text-white">Inbox Caught Up</div>
                    <p className="text-[11px] text-zinc-400">
                      No sent pitches older than 48 hours are waiting on a reply yet.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {contactedStats.followUpsDue.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-md bg-[#121317] border border-white/[0.08] p-2.5 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="text-[11px] font-semibold text-white truncate">
                            {item.company || item.recipientEmail}
                          </div>
                          <div className="font-mono text-[10px] text-zinc-400 truncate">
                            {item.recipientEmail} · {item.daysAgo}d ago ({item.status})
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleLoadFollowUpIntoMultiSend(item)}
                          className="px-2 py-1 rounded bg-white text-[#09090B] text-[10px] font-semibold hover:bg-zinc-200 shrink-0"
                        >
                          {copiedFollowUpId === item.id ? 'Loaded' : 'Nudge'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
