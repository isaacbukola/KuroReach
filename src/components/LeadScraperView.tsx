import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  Globe,
  Loader2,
  Search,
  Send,
  Trash2,
} from 'lucide-react';
import type { Lead, ScrapeJob, ScrapeSourceMode } from '../types';
import { safeFetchJson } from '../lib/safeFetch';

interface LeadScraperViewProps {
  leads: Lead[];
  onLeadsAdded: (newLeads: Lead[]) => void;
  onUpdateLeadStatus: (id: string, status: Lead['status']) => void;
  onDeleteLead: (id: string) => void;
  onQuickSendLead: (lead: Lead) => void;
}

export const LeadScraperView: React.FC<LeadScraperViewProps> = ({
  leads,
  onLeadsAdded,
  onUpdateLeadStatus,
  onDeleteLead,
  onQuickSendLead,
}) => {
  const [mode, setMode] = useState<ScrapeSourceMode>('search');
  const [query, setQuery] = useState('B2B AI SaaS startups in San Francisco Series A Founders and VPs of Growth');
  const [urlsText, setUrlsText] = useState('');
  const [rawContent, setRawContent] = useState('');
  const [offerContext, setOfferContext] = useState(
    'Automated high-deliverability outbound pipeline & AI cold email infrastructure'
  );
  const [leadCount, setLeadCount] = useState(10);
  const [isScraping, setIsScraping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groundingSources, setGroundingSources] = useState<Array<{ title: string; uri: string }>>([]);
  const [lastSummary, setLastSummary] = useState<string | null>(null);
  const [scrapeProgress, setScrapeProgress] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Lead['status']>('all');

  const handleScrape = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLastSummary(null);
    setScrapeProgress(`Starting wave 1 (target ${leadCount} leads)...`);
    setIsScraping(true);
    setGroundingSources([]);

    try {
      const payload =
        mode === 'search'
          ? { mode, query, leadCount, offerContext }
          : mode === 'url'
          ? {
              mode,
              urls: urlsText
                .split('\n')
                .map((u) => u.trim())
                .filter(Boolean),
              leadCount,
              offerContext,
            }
          : { mode, rawContent, leadCount, offerContext };

      const startJob = await safeFetchJson<ScrapeJob>('/api/ai/scrape-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const pushedIds = new Set<string>();
      const pushNewLeads = (jobLeads: Lead[]) => {
        const fresh = jobLeads.filter((l) => !pushedIds.has(l.id));
        if (fresh.length > 0) {
          fresh.forEach((l) => pushedIds.add(l.id));
          onLeadsAdded(fresh);
        }
      };

      let latestJob = startJob;
      while (latestJob.status === 'running') {
        await new Promise((r) => setTimeout(r, 1800));
        latestJob = await safeFetchJson<ScrapeJob>(`/api/ai/scrape-jobs/${startJob.jobId}`);
        pushNewLeads(latestJob.leads);
        if (latestJob.groundingSources.length > 0) {
          setGroundingSources(latestJob.groundingSources);
        }
        setScrapeProgress(
          `Wave ${Math.min(latestJob.completedWaves + 1, latestJob.totalWaves)}/${latestJob.totalWaves} · ${latestJob.leads.length}/${latestJob.targetCount} leads extracted...`
        );
      }

      pushNewLeads(latestJob.leads);
      setGroundingSources(latestJob.groundingSources ?? []);

      if (latestJob.status === 'failed' && latestJob.leads.length === 0) {
        throw new Error(latestJob.error || 'Scrape failed');
      }

      setLastSummary(
        latestJob.summary || `Extracted ${latestJob.leads.length} MX-checked leads.`
      );
      if (latestJob.status === 'failed' && latestJob.leads.length > 0 && latestJob.error) {
        setError(`Partial batch completed (${latestJob.leads.length} leads saved): ${latestJob.error}`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to extract leads');
    } finally {
      setIsScraping(false);
      setScrapeProgress(null);
    }
  };

  const filteredLeads = useMemo(() => {
    const q = searchFilter.trim().toLowerCase();
    return leads.filter((lead) => {
      if (statusFilter !== 'all' && lead.status !== statusFilter) return false;
      if (!q) return true;
      return (
        lead.fullName.toLowerCase().includes(q) ||
        lead.email.toLowerCase().includes(q) ||
        lead.company.toLowerCase().includes(q) ||
        lead.role.toLowerCase().includes(q) ||
        (lead.phone ?? '').toLowerCase().includes(q) ||
        (lead.location ?? '').toLowerCase().includes(q)
      );
    });
  }, [leads, searchFilter, statusFilter]);

  const handleExportCsv = () => {
    const headers = [
      'Full Name',
      'Email',
      'Phone',
      'Role',
      'Company',
      'Website',
      'Location',
      'MX Valid',
      'Fit Score',
      'Icebreaker',
      'Source',
      'Status',
    ];
    const rows = filteredLeads.map((l) => [
      `"${l.fullName.replace(/"/g, '""')}"`,
      l.email,
      `"${(l.phone ?? '').replace(/"/g, '""')}"`,
      `"${l.role.replace(/"/g, '""')}"`,
      `"${l.company.replace(/"/g, '""')}"`,
      l.website ?? '',
      `"${(l.location ?? '').replace(/"/g, '""')}"`,
      l.mxValid === true ? 'true' : l.mxValid === false ? 'false' : 'unknown',
      String(l.fitScore),
      `"${l.icebreaker.replace(/"/g, '""')}"`,
      `"${l.source.replace(/"/g, '""')}"`,
      l.status,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kuroreach-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      {/* AI Lead Scraper Console */}
      <form
        onSubmit={handleScrape}
        className="rounded-xl bg-[#121317] border border-white/[0.08] p-6 space-y-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-white">
              Multi-Source AI Lead Scraper
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Source decision-makers via live Search Grounding, deep URL crawl, or raw page DOM extraction with automatic MX validation.
            </p>
          </div>

          <div
            className="flex items-center gap-1 p-1 rounded-lg bg-[#09090B] border border-white/[0.08]"
            role="group"
            aria-label="Scrape Source Mode"
          >
            {(
              [
                { id: 'search', label: 'Web Search' },
                { id: 'url', label: 'URL Crawl' },
                { id: 'dom', label: 'Raw DOM / Text' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMode(tab.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  mode === tab.id
                    ? 'bg-white text-[#09090B]'
                    : 'text-zinc-400 hover:text-zinc-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {mode === 'search' && (
          <div className="space-y-2">
            <label htmlFor="icp-query" className="block text-xs text-zinc-400">
              Ideal Customer Profile & Market Query
            </label>
            <input
              id="icp-query"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g., E-commerce skincare founders in Los Angeles using Shopify Plus"
              className="w-full rounded-lg bg-[#09090B] border border-white/[0.1] px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/40"
            />
          </div>
        )}

        {mode === 'url' && (
          <div className="space-y-2">
            <label htmlFor="crawl-urls" className="block text-xs text-zinc-400">
              Target URLs (one https:// URL per line — company team pages, directories, speaker lists)
            </label>
            <textarea
              id="crawl-urls"
              rows={4}
              value={urlsText}
              onChange={(e) => setUrlsText(e.target.value)}
              placeholder={'https://example.com/team\nhttps://example.com/contact'}
              className="w-full rounded-lg bg-[#09090B] border border-white/[0.1] px-4 py-2.5 font-mono text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/40"
            />
          </div>
        )}

        {mode === 'dom' && (
          <div className="space-y-2">
            <label htmlFor="raw-dom" className="block text-xs text-zinc-400">
              Paste Raw Webpage Text, HTML, CSV, or Directory Snippet
            </label>
            <textarea
              id="raw-dom"
              rows={5}
              value={rawContent}
              onChange={(e) => setRawContent(e.target.value)}
              placeholder="Paste any copied page content, LinkedIn search text, or raw HTML..."
              className="w-full rounded-lg bg-[#09090B] border border-white/[0.1] px-4 py-2.5 font-mono text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/40"
            />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          <div className="md:col-span-8 space-y-2">
            <label htmlFor="offer-context" className="block text-xs text-zinc-400">
              Your Offer Context (tailors AI icebreakers & pain points)
            </label>
            <input
              id="offer-context"
              type="text"
              value={offerContext}
              onChange={(e) => setOfferContext(e.target.value)}
              className="w-full rounded-lg bg-[#09090B] border border-white/[0.1] px-4 py-2 text-xs text-white focus:outline-none focus:border-white/40"
            />
          </div>

          <div className="md:col-span-2 space-y-2">
            <label htmlFor="lead-count" className="block text-xs text-zinc-400">
              Batch Size
            </label>
            <select
              id="lead-count"
              value={leadCount}
              onChange={(e) => setLeadCount(Number(e.target.value))}
              className="w-full rounded-lg bg-[#09090B] border border-white/[0.1] px-3 py-2 font-mono text-xs text-white focus:outline-none focus:border-white/40"
            >
              <option value={10}>10 Leads</option>
              <option value={25}>25 Leads</option>
              <option value={50}>50 Leads</option>
              <option value={100}>100 Leads</option>
              <option value={200}>200 Leads</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={isScraping}
              className="w-full py-2.5 px-4 rounded-lg bg-white text-[#09090B] text-xs font-semibold hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 whitespace-nowrap"
            >
              {isScraping ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Extracting...</span>
                </>
              ) : (
                <>
                  <Globe className="w-3.5 h-3.5" />
                  <span>Scrape Leads</span>
                </>
              )}
            </button>
          </div>
        </div>

        {scrapeProgress && (
          <div className="rounded-lg border border-white/[0.08] bg-[#09090B] px-4 py-2.5 text-xs text-zinc-300 flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400 shrink-0" />
            <span className="font-mono">{scrapeProgress}</span>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs text-red-300">
            {error}
          </div>
        )}

        {lastSummary && (
          <div className="rounded-lg border border-white/[0.08] bg-[#09090B] px-4 py-3 space-y-2">
            <div className="text-xs text-zinc-200 flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>{lastSummary}</span>
            </div>
            {groundingSources.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-500 pt-1">
                <span>Grounded Sources:</span>
                {groundingSources.slice(0, 6).map((src, idx) => (
                  <a
                    key={`${src.uri}-${idx}`}
                    href={src.uri}
                    target="_blank"
                    rel="noreferrer"
                    className="text-zinc-300 hover:text-white inline-flex items-center gap-1 underline underline-offset-2 max-w-[220px] truncate"
                  >
                    <span className="truncate">{src.title}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </form>

      {/* Lead Pipeline Table */}
      <div className="rounded-xl bg-[#121317] border border-white/[0.08] overflow-hidden">
        <div className="px-6 py-4 border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Filter by name, email, or company..."
                className="pl-8 pr-3 py-1.5 rounded-lg bg-[#09090B] border border-white/[0.1] text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/30 w-64"
              />
            </div>

            <div className="flex items-center gap-1 p-1 rounded-lg bg-[#09090B] border border-white/[0.08]">
              {(['all', 'new', 'queued', 'contacted', 'replied'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={`px-2.5 py-1 rounded-md text-xs capitalize transition-colors ${
                    statusFilter === status
                      ? 'bg-white text-[#09090B] font-medium'
                      : 'text-zinc-400 hover:text-zinc-100'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredLeads.length === 0}
            className="px-3.5 py-1.5 rounded-lg border border-white/[0.12] text-xs font-medium text-zinc-200 hover:bg-white/[0.05] transition-colors flex items-center gap-1.5 disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV ({filteredLeads.length})</span>
          </button>
        </div>

        {filteredLeads.length === 0 ? (
          <div className="px-6 py-12 text-center space-y-2">
            <p className="text-sm text-zinc-300">No leads match this filter.</p>
            <p className="text-xs text-zinc-500">
              Run the Multi-Source AI Scraper above or push leads directly from the KuroReach Chrome Extension.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-white/[0.08] text-zinc-500">
                  <th className="py-3 px-6 font-medium">Contact</th>
                  <th className="py-3 px-4 font-medium">Company & Role</th>
                  <th className="py-3 px-4 font-medium">AI Icebreaker</th>
                  <th className="py-3 px-4 font-medium">MX Check</th>
                  <th className="py-3 px-4 font-medium text-right">Fit</th>
                  <th className="py-3 px-4 font-medium">Stage</th>
                  <th className="py-3 px-6 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {filteredLeads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-white/[0.02] align-top">
                    <td className="py-3.5 px-6">
                      <div className="font-medium text-zinc-100">{lead.fullName}</div>
                      <div className="font-mono text-zinc-400 mt-0.5">
                        {lead.email || lead.phone || 'No direct email'}
                      </div>
                      {lead.email && lead.phone && (
                        <div className="font-mono text-[11px] text-zinc-500 mt-0.5">{lead.phone}</div>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="text-zinc-200">{lead.company}</div>
                      <div className="text-zinc-500 mt-0.5">
                        {[lead.role, lead.location].filter(Boolean).join(' · ')}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 max-w-xs">
                      <p className="text-zinc-300 leading-relaxed line-clamp-2">
                        {lead.icebreaker}
                      </p>
                      <div className="text-[11px] text-zinc-500 mt-1 truncate">
                        Source: {lead.source}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono whitespace-nowrap">
                      {lead.mxValid === true ? (
                        <span className="text-emerald-400">MX Valid</span>
                      ) : lead.mxValid === false ? (
                        <span className="text-red-400">No MX</span>
                      ) : (
                        <span className="text-zinc-500">N/A</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-zinc-200">
                      {lead.fitScore}
                    </td>
                    <td className="py-3.5 px-4">
                      <select
                        value={lead.status}
                        onChange={(e) =>
                          onUpdateLeadStatus(lead.id, e.target.value as Lead['status'])
                        }
                        aria-label={`Stage for ${lead.fullName}`}
                        className="rounded-md bg-[#09090B] border border-white/[0.1] px-2 py-1 text-xs text-zinc-200 capitalize focus:outline-none"
                      >
                        <option value="new">New</option>
                        <option value="queued">Queued</option>
                        <option value="contacted">Contacted</option>
                        <option value="replied">Replied</option>
                        <option value="bounced">Bounced</option>
                      </select>
                    </td>
                    <td className="py-3.5 px-6 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onQuickSendLead(lead)}
                          disabled={!lead.email.includes('@')}
                          className="p-1.5 rounded-md border border-white/[0.1] text-zinc-300 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          title={
                            lead.email.includes('@')
                              ? 'Send 1:1 Email via Gmail'
                              : 'No email address on file (phone/website lead)'
                          }
                        >
                          <Send className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteLead(lead.id)}
                          className="p-1.5 rounded-md border border-white/[0.1] text-zinc-500 hover:text-red-400 hover:border-red-400/30 transition-colors"
                          title="Remove Lead"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
