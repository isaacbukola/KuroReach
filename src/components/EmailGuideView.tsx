import React, { useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  MailCheck,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import type { GmailAccountSlot } from '../types';
import { downloadAppManualPdf, downloadEmailGuidePdf } from '../lib/emailGuidePdf';

interface EmailGuideViewProps {
  slots: GmailAccountSlot[];
  onGoToMailboxes: () => void;
}

const VOLUME_MATRIX = [
  {
    tier: 'New Free @gmail.com (Days 1–14)',
    advisableDaily: '10 – 25 emails / day',
    googleHardCap: '500 / day',
    interval: '45 – 60 sec interval',
    notes: 'Warm up with manual replies first; never blast cold lists immediately.',
  },
  {
    tier: 'Aged Free @gmail.com (30+ days)',
    advisableDaily: '50 – 120 emails / day',
    googleHardCap: '500 / day',
    interval: '30 – 45 sec interval',
    notes: 'Keep cold outreach well under 150/day so Google never throttles personal Gmail.',
  },
  {
    tier: 'New Google Workspace (Weeks 1–2)',
    advisableDaily: '15 – 35 emails / day',
    googleHardCap: '2,000 / day',
    interval: '45 sec interval',
    notes: 'Verify SPF, DKIM & DMARC before sending Email #1.',
  },
  {
    tier: 'Warmed Workspace (Weeks 3–6)',
    advisableDaily: '60 – 120 emails / day',
    googleHardCap: '2,000 / day',
    interval: '25 – 45 sec interval',
    notes: 'Best balance of volume and 96%+ primary inbox placement.',
  },
  {
    tier: 'Mature 3-Slot Pool (Multi-Inbox)',
    advisableDaily: '300 – 450 emails / day total',
    googleHardCap: '6,000 / day total',
    interval: 'Round-Robin + 30s',
    notes: 'Scale safely by rotating across 3 mailboxes instead of overloading 1 address.',
  },
];

const WARMUP_TIMELINE = [
  {
    week: 'Week 1',
    volume: '10 – 15 / day',
    focus: 'Real conversations & warm replies on your domain to build trust.',
  },
  {
    week: 'Week 2',
    volume: '25 – 35 / day',
    focus: 'Small hyper-targeted batches; confirm bounce rate stays < 2%.',
  },
  {
    week: 'Week 3',
    volume: '50 – 65 / day',
    focus: 'Stagger across morning & afternoon windows with 30s+ delays.',
  },
  {
    week: 'Week 4',
    volume: '80 – 100 / day',
    focus: 'Enable A/B subject testing and track open/reply ratios.',
  },
  {
    week: 'Week 5 – 6+',
    volume: '100 – 150 / inbox',
    focus: 'Hold steady per inbox; connect additional Gmail slots to scale further.',
  },
];

const SPAM_AVOIDANCE_RULES = [
  {
    title: 'Authenticate SPF, DKIM & DMARC First',
    detail:
      'Never launch cold outreach from a custom domain missing SPF, 2048-bit DKIM, or DMARC. Run the DNS Inspector in Mailboxes & DNS before batch sending.',
  },
  {
    title: 'Keep Initial Emails Between 45–85 Words',
    detail:
      'Short plain-text peer notes avoid automated promotional scoring and consistently double reply rates compared to long pitches.',
  },
  {
    title: 'Zero Heavy HTML, Banners, or Link Overload',
    detail:
      'Use 0–1 clean links max on Touch #1. Never paste bit.ly links, promotional flyers, colorful HTML buttons, or multiple attachments.',
  },
  {
    title: 'Eliminate Spam Trigger Phrases',
    detail:
      'Avoid words like "free", "guarantee", "100%", "act now", "limited time", "urgent", "discount", "buy now", ALL CAPS, and exclamation marks.',
  },
  {
    title: 'Use Lowercase Conversational Subjects (2–4 Words)',
    detail:
      'Subjects like "{{company}} <> quick idea" or "quick question, {{firstName}}" feel personal and land in Primary rather than Promotions.',
  },
  {
    title: 'Keep Bounce Rate Strictly Under 2%',
    detail:
      'Always verify MX records before dispatching. Hard bounces (550 5.1.1) signal scraped/stale lists to Google and sink domain reputation fast.',
  },
];

const BANNED_TRIGGERS = [
  '100% free',
  'guarantee / guaranteed',
  'act now',
  'limited time offer',
  'urgent action',
  'click here',
  'buy now',
  'discount / $$$',
  'double your revenue',
  'ALL CAPS SUBJECTS',
  'Multiple exclamation marks!!!',
  'bit.ly / shortened URLs',
];

export const EmailGuideView: React.FC<EmailGuideViewProps> = ({ slots, onGoToMailboxes }) => {
  const [downloadedLabel, setDownloadedLabel] = useState<string | null>(null);

  const connectedSlots = slots.filter((s) => s.connected && s.email);
  const freeGmailCount = connectedSlots.filter((s) => s.accountType === 'gmail').length;
  const workspaceCount = connectedSlots.filter((s) => s.accountType === 'workspace').length;
  const recommendedColdSafe = freeGmailCount * 80 + workspaceCount * 120;

  const handleDownloadPdf = () => {
    downloadEmailGuidePdf();
    setDownloadedLabel('KuroReach-Email-Outreach-Deliverability-Guide.pdf downloaded automatically.');
  };

  const handleDownloadAppManual = () => {
    downloadAppManualPdf();
    setDownloadedLabel('KuroReach-How-This-App-Works-Guide.pdf downloaded automatically.');
  };

  return (
    <div className="space-y-8">
      {/* Hero Banner with Automatic PDF Download */}
      <div className="rounded-xl border border-white/[0.1] bg-[#121317] p-6 lg:p-8 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        <div className="flex items-start gap-4 max-w-2xl">
          <div className="w-12 h-12 rounded-xl border border-white/[0.14] bg-[#09090B] flex items-center justify-center shrink-0">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div className="space-y-1.5">
            <div className="text-xs font-mono text-zinc-400">
              Deliverability Playbook · Safe Sending Limits · Anti-Spam Protocol
            </div>
            <h2 className="font-display text-2xl font-semibold tracking-tight text-white">
              Cold Email Outreach &amp; Anti-Spam Guide
            </h2>
            <p className="text-sm text-zinc-300 leading-relaxed">
              Learn exactly how many emails are safe to send per day by account type, how to warm up Gmail &amp; Workspace domains, and the rules to stay out of Google Spam folders.
            </p>
          </div>
        </div>

        <div className="flex flex-col items-stretch sm:items-end gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleDownloadAppManual}
              className="px-4 py-3 rounded-lg border border-white/[0.16] bg-[#09090B] text-white text-xs font-semibold hover:bg-white/[0.06] transition-colors flex items-center justify-center gap-2"
            >
              <FileText className="w-4 h-4" />
              <span>How App Works (PDF)</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="px-5 py-3 rounded-lg bg-white text-[#09090B] text-xs font-semibold hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2.5 shadow-lg"
            >
              <Download className="w-4 h-4" />
              <span>Download Email Guide (PDF)</span>
            </button>
          </div>
          <span className="font-mono text-[11px] text-zinc-500 text-center sm:text-right">
            {downloadedLabel || 'Instant multi-page PDF · Click either button to download automatically'}
          </span>
        </div>
      </div>

      {/* Live Pool Recommendation Callout */}
      <div className="rounded-xl bg-[#121317] border border-white/[0.08] p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <div className="font-semibold text-white">
              Your Connected Pool Safe Cold Outreach Target:{' '}
              <span className="font-mono text-emerald-300">
                {connectedSlots.length > 0
                  ? `${recommendedColdSafe} cold emails / day (${connectedSlots.length} connected slot${connectedSlots.length > 1 ? 's' : ''})`
                  : 'Connect 1–3 Gmail slots to unlock pool sizing'}
              </span>
            </div>
            <p className="text-zinc-400">
              {connectedSlots.length > 0
                ? `Based on ${workspaceCount} Workspace account(s) (~120 safe cold/day each) and ${freeGmailCount} free @gmail.com account(s) (~80 safe cold/day each when aged). Keep Round-Robin enabled in Tracking & Send.`
                : 'A single warmed Workspace inbox safely handles 60–120 cold outreach emails/day. Connecting all 3 slots scales your safe daily cold volume to 300–450/day.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onGoToMailboxes}
          className="px-3.5 py-2 rounded-lg border border-white/[0.12] text-xs font-medium text-zinc-200 hover:bg-white/[0.05] transition-colors shrink-0"
        >
          Inspect Mailboxes &amp; DNS
        </button>
      </div>

      {/* Section 1: Advisable Daily Sending Volumes */}
      <div className="rounded-xl bg-[#121317] border border-white/[0.08] overflow-hidden">
        <div className="px-6 py-4 border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <TrendingUp className="w-4 h-4 text-zinc-300" />
            <div>
              <h3 className="font-display text-sm font-semibold text-white">
                01. How Many Emails Is Advisable to Send Per Day?
              </h3>
              <p className="text-xs text-zinc-400">
                Safe cold outreach limits are much lower than Google&apos;s maximum technical cap. Staying inside the safe zone protects domain reputation.
              </p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/[0.08] text-zinc-500">
                <th className="py-3 px-6 font-medium">Account Type &amp; Age</th>
                <th className="py-3 px-4 font-medium">Advisable Cold Limit</th>
                <th className="py-3 px-4 font-medium">Google Hard Cap</th>
                <th className="py-3 px-4 font-medium">Send Pacing</th>
                <th className="py-3 px-6 font-medium">Deliverability Guidance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {VOLUME_MATRIX.map((row) => (
                <tr key={row.tier} className="hover:bg-white/[0.02]">
                  <td className="py-3.5 px-6 font-medium text-white whitespace-nowrap">
                    {row.tier}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-emerald-300 font-semibold whitespace-nowrap">
                    {row.advisableDaily}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-zinc-400 whitespace-nowrap">
                    {row.googleHardCap}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-zinc-300 whitespace-nowrap">
                    {row.interval}
                  </td>
                  <td className="py-3.5 px-6 text-zinc-400">{row.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 2: Warmup Ramp-Up + Spam Trigger Blacklist */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 rounded-xl bg-[#121317] border border-white/[0.08] p-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <Clock className="w-4 h-4 text-zinc-300" />
            <h3 className="font-display text-base font-semibold text-white">
              02. 6-Week Safe Warmup Ramp Schedule
            </h3>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Gradually stepping up volume prevents sudden spike flags on fresh Gmail and custom Google Workspace domains.
          </p>
          <div className="space-y-2.5">
            {WARMUP_TIMELINE.map((step) => (
              <div
                key={step.week}
                className="rounded-lg bg-[#09090B] border border-white/[0.08] px-4 py-3 flex items-start justify-between gap-4"
              >
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-white">{step.week}</div>
                  <div className="text-xs text-zinc-400">{step.focus}</div>
                </div>
                <span className="font-mono text-xs text-emerald-300 shrink-0 font-semibold">
                  {step.volume}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-6 rounded-xl bg-[#121317] border border-white/[0.08] p-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-4 h-4 text-amber-300" />
            <h3 className="font-display text-base font-semibold text-white">
              03. Words &amp; Patterns That Trigger Spam Filters
            </h3>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Google&apos;s classifier flags promotional hype and mass-blast formatting. Keep these strictly out of subject lines and pitches:
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {BANNED_TRIGGERS.map((word) => (
              <div
                key={word}
                className="rounded-md bg-[#09090B] border border-red-500/20 px-3 py-2 font-mono text-[11px] text-red-200"
              >
                {word}
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 space-y-1.5 text-xs">
            <div className="flex items-center gap-2 font-semibold text-amber-200">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>If Google Pauses or Flags Spam: Recovery Rule</span>
            </div>
            <p className="text-amber-100/85 leading-relaxed">
              Rest the flagged mailbox for 48–72 hours, verify SPF/DKIM/DMARC in Mailboxes &amp; DNS, cut email length under 75 words, exchange positive replies with known contacts, and resume at 25% daily volume with 45s pacing.
            </p>
          </div>
        </div>
      </div>

      {/* Section 4: Complete Anti-Spam Checklist */}
      <div className="rounded-xl bg-[#121317] border border-white/[0.08] p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <MailCheck className="w-4 h-4 text-zinc-300" />
            <h3 className="font-display text-base font-semibold text-white">
              04. Core Rules to Avoid Spam &amp; Maximize Replies
            </h3>
          </div>
          <button
            type="button"
            onClick={handleDownloadPdf}
            className="px-4 py-2 rounded-lg bg-white text-[#09090B] text-xs font-semibold hover:bg-zinc-200 transition-colors flex items-center gap-2"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Save Full Guide as PDF</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {SPAM_AVOIDANCE_RULES.map((rule) => (
            <div
              key={rule.title}
              className="rounded-lg bg-[#09090B] border border-white/[0.08] p-4 space-y-2"
            >
              <div className="flex items-start gap-2 text-xs font-semibold text-white">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>{rule.title}</span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">{rule.detail}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Section 5: How KuroReach Works (Full App Walkthrough + PDF) */}
      <div className="rounded-xl bg-[#121317] border border-white/[0.08] p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-4 h-4 text-zinc-300" />
            <div>
              <h3 className="font-display text-base font-semibold text-white">
                05. How KuroReach Works (6-Step Platform Manual)
              </h3>
              <p className="text-xs text-zinc-400">
                Complete workflow from connecting Gmail slots to AI scraping, pitching, Chrome Extension multi-send, and Google Spam Auto-Pause.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDownloadAppManual}
            className="px-4 py-2 rounded-lg bg-white text-[#09090B] text-xs font-semibold hover:bg-zinc-200 transition-colors flex items-center gap-2"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download App Guide (PDF)</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          {[
            {
              step: '01. Mailboxes & DNS',
              desc: 'Connect up to 3 Gmail/Workspace accounts via App Password SMTP or Google OAuth, then inspect MX, SPF, DKIM & DMARC health.',
            },
            {
              step: '02. AI Lead Scraper',
              desc: 'Extract 10 to 200 leads via Web Search, URL Crawl, or Raw DOM with automatic MX verification and personalized icebreakers.',
            },
            {
              step: '03. Sequence Studio',
              desc: 'Chat with the AI Conversion Strategist to draft & spam-audit 3-step pitches with A/B subject lines and {{variables}}.',
            },
            {
              step: '04. Tracking & Send',
              desc: 'Dispatch with Round-Robin rotation & pacing delays. Google Spam or daily quota blocks auto-pause the mailbox immediately.',
            },
            {
              step: '05. Chrome Extension',
              desc: 'Scrape Google Maps & sites with Freelancer Need Signals, paste/select up to 200 emails, AI-draft pitches, and multi-send safely.',
            },
            {
              step: '06. Overview & Guide',
              desc: 'Monitor open/reply telemetry, respect safe daily limits by mailbox age, and download offline PDF playbooks anytime.',
            },
          ].map((item) => (
            <div
              key={item.step}
              className="rounded-lg bg-[#09090B] border border-white/[0.08] p-4 space-y-1.5"
            >
              <div className="font-semibold text-white">{item.step}</div>
              <p className="text-zinc-400 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
