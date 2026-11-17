import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Send,
  ShieldCheck,
  Sparkles,
  User,
  Wand2,
} from 'lucide-react';
import type {
  DeliverabilityReport,
  EmailIdea,
  EmailSequence,
  Lead,
  SequenceChatMessage,
  SequenceStep,
  TrackedEmail,
} from '../types';
import { safeFetchJson } from '../lib/safeFetch';

interface SequencesViewProps {
  sequence: EmailSequence;
  onUpdateSequence: (seq: EmailSequence) => void;
  leads: Lead[];
  trackedEmails: TrackedEmail[];
  deliverabilityReports?: Record<string, DeliverabilityReport>;
  onNavigateToCampaigns?: () => void;
}

const SPAM_PHRASES = [
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
  'winner',
  'exclusive deal',
  'congratulations',
];

function quickSpamCheck(subject: string, body: string): { score: number; warnings: string[] } {
  const warnings: string[] = [];
  const lower = `${subject} ${body}`.toLowerCase();
  for (const phrase of SPAM_PHRASES) {
    if (lower.includes(phrase)) warnings.push(`"${phrase}"`);
  }
  const exclamations = (subject + body).match(/!/g)?.length ?? 0;
  if (exclamations > 1) warnings.push(`${exclamations} "!" marks`);
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  if (words > 115) warnings.push(`${words}w (long)`);
  const score = Math.max(20, 100 - warnings.length * 15);
  return { score, warnings };
}

export const SequencesView: React.FC<SequencesViewProps> = ({
  sequence,
  onUpdateSequence,
  leads,
  trackedEmails,
  deliverabilityReports = {},
  onNavigateToCampaigns,
}) => {
  const [studioMode, setStudioMode] = useState<'chat' | 'matrix'>('chat');
  const [offer, setOffer] = useState(sequence.offerContext);
  const [persona, setPersona] = useState(sequence.targetPersona);
  const [tone, setTone] = useState('Direct, peer-to-peer executive brevity');

  // Chat Strategist State
  const [messages, setMessages] = useState<SequenceChatMessage[]>([
    {
      id: 'welcome_msg',
      role: 'assistant',
      createdAt: new Date().toISOString(),
      content:
        'I am your KuroReach Conversion & Deliverability Strategist. Tell me what you are selling, who your leads are, or paste a draft — I will engineer high-reply, spam-safe cold email angles and build complete 3-step sequences you can apply in one click.',
      deliverabilityScore: 96,
      conversionScore: 91,
      spamRiskFlags: [],
      followUpPrompts: [
        'Build a high-converting 3-step sequence for my scraped leads',
        'Audit my current sequence for Google Spam triggers & tighten copy',
        'Give me a bold pattern-interrupt idea under 60 words',
      ],
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const [appliedMessageIds, setAppliedMessageIds] = useState<Record<string, boolean>>({});
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // 4-Angle Matrix State
  const [ideas, setIdeas] = useState<EmailIdea[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optimizationBanner, setOptimizationBanner] = useState<string | null>(
    sequence.aiOptimizationNotes ?? null
  );

  const totalSent = trackedEmails.length;
  const openRate =
    totalSent > 0
      ? Math.round(
          (trackedEmails.filter((t) => t.openCount > 0 || t.status === 'opened' || t.status === 'replied')
            .length /
            totalSent) *
            100
        )
      : 0;
  const replyRate =
    totalSent > 0
      ? Math.round(
          (trackedEmails.filter((t) => t.status === 'replied').length / totalSent) * 100
        )
      : 0;
  const bounceRate =
    totalSent > 0
      ? Math.round(
          (trackedEmails.filter((t) => t.status === 'bounced').length / totalSent) * 100
        )
      : 0;
  const spamCount = trackedEmails.filter((t) => t.status === 'spam').length;

  const deliverabilitySummary = useMemo(() => {
    const reports = Object.values(deliverabilityReports);
    if (reports.length === 0) return 'Not DNS-checked yet';
    return reports.map((r) => `${r.domain}: ${r.score}/100 (${r.grade})`).join(', ');
  }, [deliverabilityReports]);

  const sendChatPrompt = async (promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed || isChatting) return;

    setError(null);
    const userMsg: SequenceChatMessage = {
      id: `usr_${Date.now()}`,
      role: 'user',
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setChatInput('');
    setIsChatting(true);

    setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 60);

    try {
      const data = await safeFetchJson<{
        reply: string;
        deliverabilityScore?: number;
        conversionScore?: number;
        spamRiskFlags?: string[];
        followUpPrompts?: string[];
        proposedIdea?: EmailIdea;
        proposedSteps?: SequenceStep[];
      }>('/api/ai/sequence-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history: nextHistory.slice(-10).map((m) => ({ role: m.role, content: m.content })),
          offerContext: offer,
          targetPersona: persona,
          tone,
          currentSequence: { name: sequence.name, steps: sequence.steps },
          leadsSummary: {
            total: leads.length,
            sampleLeads: leads.slice(0, 5),
          },
          metrics: {
            sent: totalSent,
            openRate,
            replyRate,
            bounceRate,
            spamCount,
          },
          deliverabilitySummary,
        }),
      });

      const assistantMsg: SequenceChatMessage = {
        id: `ast_${Date.now()}`,
        role: 'assistant',
        content: data.reply,
        createdAt: new Date().toISOString(),
        deliverabilityScore: data.deliverabilityScore,
        conversionScore: data.conversionScore,
        spamRiskFlags: data.spamRiskFlags ?? [],
        proposedIdea: data.proposedIdea,
        proposedSteps: data.proposedSteps,
        followUpPrompts: data.followUpPrompts ?? [],
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 80);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'AI chat request failed');
    } finally {
      setIsChatting(false);
    }
  };

  const handleApplyChatProposal = (msg: SequenceChatMessage) => {
    if (!msg.proposedSteps || msg.proposedSteps.length === 0) return;
    onUpdateSequence({
      ...sequence,
      name: msg.proposedIdea?.angleName || sequence.name,
      offerContext: offer,
      targetPersona: persona,
      steps: msg.proposedSteps,
      aiOptimizationNotes: `Applied AI Strategist sequence "${msg.proposedIdea?.angleName || 'Custom Blueprint'}" (Safety ${msg.deliverabilityScore ?? 95}/100 · Conversion ${msg.conversionScore ?? 90}/100).`,
      updatedAt: new Date().toISOString(),
    });
    setAppliedMessageIds((prev) => ({ ...prev, [msg.id]: true }));
    setOptimizationBanner(
      `Applied "${msg.proposedIdea?.angleName || 'AI Blueprint'}" to your active 3-step sequence.`
    );
  };

  const handleGenerateIdeas = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsGenerating(true);
    try {
      const data = await safeFetchJson<{ ideas?: EmailIdea[] }>('/api/ai/generate-ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offer,
          targetPersona: persona,
          tone,
          sampleLead: leads[0],
        }),
      });
      setIdeas(data.ideas ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleLoadIdeaIntoSequence = (idea: EmailIdea) => {
    onUpdateSequence({
      ...sequence,
      name: idea.angleName,
      offerContext: offer,
      targetPersona: persona,
      updatedAt: new Date().toISOString(),
      steps: [
        {
          id: 'step_1',
          stepNumber: 1,
          delayHours: 0,
          condition: 'always',
          subject: idea.subjectA,
          subjectVariantB: idea.subjectB,
          body: idea.body,
        },
        {
          id: 'step_2',
          stepNumber: 2,
          delayHours: 48,
          condition: 'if_unopened',
          subject: `Re: ${idea.subjectA}`,
          subjectVariantB: `quick thought, {{firstName}}`,
          body: idea.followUp1,
        },
        {
          id: 'step_3',
          stepNumber: 3,
          delayHours: 96,
          condition: 'if_no_reply',
          subject: `closing the loop — {{company}}`,
          subjectVariantB: `worth a quick look?`,
          body: idea.followUp2,
        },
      ],
    });
    setOptimizationBanner(`Loaded "${idea.angleName}" into the active 3-step sequence.`);
  };

  const handleOptimizeSequence = async () => {
    setError(null);
    setIsOptimizing(true);
    try {
      const data = await safeFetchJson<{
        optimizationSummary?: string;
        optimizedSteps?: EmailSequence['steps'];
      }>('/api/ai/optimize-sequence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          steps: sequence.steps,
          offerContext: offer,
          targetPersona: persona,
          metrics: {
            sent: totalSent,
            openRate,
            replyRate,
            bounceRate,
            spamCount,
          },
        }),
      });

      if (data.optimizedSteps && data.optimizedSteps.length > 0) {
        onUpdateSequence({
          ...sequence,
          steps: data.optimizedSteps,
          aiOptimizationNotes: data.optimizationSummary,
          updatedAt: new Date().toISOString(),
        });
        setOptimizationBanner(data.optimizationSummary || 'Sequence optimized for open & reply lift.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Optimization failed');
    } finally {
      setIsOptimizing(false);
    }
  };

  const step1Audit = quickSpamCheck(sequence.steps[0]?.subject || '', sequence.steps[0]?.body || '');

  return (
    <div className="space-y-6">
      {/* Studio Header & Context Inputs */}
      <div className="rounded-xl bg-[#121317] border border-white/[0.08] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-white">
              Conversion AI Sequence Studio
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Chat directly with the conversion-trained AI strategist or generate 4 cold email angles engineered to convert &amp; avoid Gmail Spam.
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#09090B] border border-white/[0.08]">
            <button
              type="button"
              onClick={() => setStudioMode('chat')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
                studioMode === 'chat'
                  ? 'bg-white text-[#09090B]'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>AI Chat Strategist</span>
            </button>
            <button
              type="button"
              onClick={() => setStudioMode('matrix')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
                studioMode === 'matrix'
                  ? 'bg-white text-[#09090B]'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>4-Angle Matrix</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
          <div className="space-y-1">
            <label htmlFor="seq-offer" className="block text-[11px] text-zinc-400">
              Offer / Value Proposition
            </label>
            <input
              id="seq-offer"
              type="text"
              value={offer}
              onChange={(e) => setOffer(e.target.value)}
              className="w-full rounded-lg bg-[#09090B] border border-white/[0.1] px-3 py-2 text-xs text-white focus:outline-none focus:border-white/40"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="seq-persona" className="block text-[11px] text-zinc-400">
              Target Persona
            </label>
            <input
              id="seq-persona"
              type="text"
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              className="w-full rounded-lg bg-[#09090B] border border-white/[0.1] px-3 py-2 text-xs text-white focus:outline-none focus:border-white/40"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="seq-tone" className="block text-[11px] text-zinc-400">
              Writing Style
            </label>
            <input
              id="seq-tone"
              type="text"
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="w-full rounded-lg bg-[#09090B] border border-white/[0.1] px-3 py-2 text-xs text-white focus:outline-none focus:border-white/40"
            />
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs text-red-300">
            {error}
          </div>
        )}
      </div>

      {/* Main Workbench: Chat-able AI Strategist + Active Sequence */}
      {studioMode === 'chat' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Chat-able & Promptable AI Strategist */}
          <div className="lg:col-span-7 rounded-xl bg-[#121317] border border-white/[0.08] flex flex-col h-[680px]">
            <div className="px-5 py-3.5 border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-white text-[#09090B] flex items-center justify-center">
                  <Bot className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-white">KuroReach Conversion AI</div>
                  <div className="text-[11px] font-mono text-zinc-500">
                    Grounded on {leads.length} leads · {openRate}% open · {replyRate}% reply
                    {spamCount > 0 ? ` · ${spamCount} spam` : ''}
                  </div>
                </div>
              </div>
              <span className="font-mono text-[11px] text-emerald-400">
                Google Spam Guard Active
              </span>
            </div>

            {/* Messages Thread */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-6 h-6 rounded-md bg-white/[0.08] border border-white/[0.1] flex items-center justify-center shrink-0 mt-0.5">
                      <Bot className="w-3.5 h-3.5 text-zinc-200" />
                    </div>
                  )}

                  <div
                    className={`max-w-[88%] space-y-3 ${
                      msg.role === 'user'
                        ? 'rounded-xl bg-white text-[#09090B] px-4 py-2.5 text-xs font-medium'
                        : 'rounded-xl bg-[#09090B] border border-white/[0.08] p-4 text-xs text-zinc-200'
                    }`}
                  >
                    <p className="whitespace-pre-line leading-relaxed">{msg.content}</p>

                    {msg.role === 'assistant' &&
                      (msg.deliverabilityScore !== undefined || msg.conversionScore !== undefined) && (
                        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-white/[0.06] font-mono text-[11px]">
                          <span className="text-emerald-400 inline-flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3" />
                            Inbox Safety {msg.deliverabilityScore ?? 95}/100
                          </span>
                          <span className="text-zinc-300">
                            Conversion Score {msg.conversionScore ?? 88}/100
                          </span>
                        </div>
                      )}

                    {msg.spamRiskFlags && msg.spamRiskFlags.length > 0 && (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 space-y-1 text-[11px] text-amber-200">
                        <div className="font-semibold flex items-center gap-1.5">
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                          <span>Deliverability Flags Detected:</span>
                        </div>
                        <ul className="list-disc list-inside space-y-0.5 text-amber-200/90">
                          {msg.spamRiskFlags.map((flag, i) => (
                            <li key={i}>{flag}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {msg.proposedSteps && msg.proposedSteps.length > 0 && (
                      <div className="rounded-lg bg-[#121317] border border-white/[0.1] p-3.5 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="text-xs font-semibold text-white">
                              {msg.proposedIdea?.angleName || 'Proposed 3-Step Sequence'}
                            </div>
                            <div className="text-[11px] text-zinc-400">
                              {msg.proposedIdea?.psychologicalTrigger || 'Conversion Strategy'} ·{' '}
                              {msg.proposedIdea?.predictedReplyLift || 'Optimized for replies'}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleApplyChatProposal(msg)}
                            className={`px-3 py-1.5 rounded-md text-[11px] font-semibold transition-colors inline-flex items-center gap-1.5 ${
                              appliedMessageIds[msg.id]
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-white text-[#09090B] hover:bg-zinc-200'
                            }`}
                          >
                            {appliedMessageIds[msg.id] ? (
                              <>
                                <Check className="w-3 h-3" />
                                <span>Applied to Sequence</span>
                              </>
                            ) : (
                              <>
                                <span>Apply Sequence</span>
                                <ArrowRight className="w-3 h-3" />
                              </>
                            )}
                          </button>
                        </div>

                        <div className="space-y-1.5 text-[11px] font-mono text-zinc-400 border-t border-white/[0.06] pt-2">
                          <div>
                            Subject A:{' '}
                            <span className="text-zinc-100">{msg.proposedSteps[0].subject}</span>
                          </div>
                          <div>
                            Subject B:{' '}
                            <span className="text-zinc-100">
                              {msg.proposedSteps[0].subjectVariantB}
                            </span>
                          </div>
                        </div>

                        <div className="text-xs text-zinc-300 whitespace-pre-line leading-relaxed border-t border-white/[0.06] pt-2">
                          {msg.proposedSteps[0].body}
                        </div>

                        {msg.proposedSteps.length > 1 && (
                          <div className="text-[11px] text-zinc-500 font-mono">
                            + {msg.proposedSteps.length - 1} automated follow-up steps included
                          </div>
                        )}
                      </div>
                    )}

                    {msg.followUpPrompts && msg.followUpPrompts.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {msg.followUpPrompts.map((chip, idx) => (
                          <button
                            key={idx}
                            type="button"
                            disabled={isChatting}
                            onClick={() => sendChatPrompt(chip)}
                            className="px-2.5 py-1 rounded-md border border-white/[0.1] bg-[#121317] text-[11px] text-zinc-300 hover:text-white hover:border-white/30 transition-colors text-left"
                          >
                            {chip}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {msg.role === 'user' && (
                    <div className="w-6 h-6 rounded-md bg-white/[0.08] border border-white/[0.1] flex items-center justify-center shrink-0 mt-0.5">
                      <User className="w-3.5 h-3.5 text-zinc-300" />
                    </div>
                  )}
                </div>
              ))}

              {isChatting && (
                <div className="flex items-center gap-2.5 text-xs text-zinc-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Engineering high-conversion copy &amp; checking Google spam safety...</span>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Prompt Input Box */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendChatPrompt(chatInput);
              }}
              className="p-4 border-t border-white/[0.08] space-y-2.5 shrink-0"
            >
              <div className="flex gap-2">
                <textarea
                  rows={2}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendChatPrompt(chatInput);
                    }
                  }}
                  placeholder="Prompt the AI strategist (e.g., 'Write a killer pitch for UK law firms', 'Make Step 1 sound like a human founder', 'Fix my spam score')..."
                  className="flex-1 rounded-lg bg-[#09090B] border border-white/[0.12] px-3.5 py-2.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/40 resize-none"
                />
                <button
                  type="submit"
                  disabled={isChatting || !chatInput.trim()}
                  className="px-4 rounded-lg bg-white text-[#09090B] text-xs font-semibold hover:bg-zinc-200 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40 shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send</span>
                </button>
              </div>
            </form>
          </div>

          {/* Right Column: Active Sequence Blueprint & Live Spam Linter */}
          <div className="lg:col-span-5 rounded-xl bg-[#121317] border border-white/[0.08] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-3.5">
              <div>
                <h3 className="font-display text-sm font-semibold text-white truncate max-w-[230px]">
                  {sequence.name}
                </h3>
                <div className="text-[11px] font-mono text-zinc-400 mt-0.5">
                  Inbox Score: {step1Audit.score}/100
                  {step1Audit.warnings.length > 0
                    ? ` · Risks: ${step1Audit.warnings.join(', ')}`
                    : ' · Clean'}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    sendChatPrompt(
                      'Audit my current active sequence for conversion power and Google spam safety, then give me an upgraded 3-step rewrite.'
                    )
                  }
                  disabled={isChatting}
                  className="px-2.5 py-1.5 rounded-md border border-white/[0.12] text-[11px] text-zinc-200 hover:bg-white/[0.06] transition-colors"
                >
                  Audit in Chat
                </button>
                <button
                  type="button"
                  onClick={handleOptimizeSequence}
                  disabled={isOptimizing}
                  className="px-2.5 py-1.5 rounded-md bg-white text-[#09090B] text-[11px] font-semibold hover:bg-zinc-200 transition-colors inline-flex items-center gap-1 disabled:opacity-50"
                >
                  {isOptimizing ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Wand2 className="w-3 h-3" />
                  )}
                  <span>Auto-Optimize</span>
                </button>
              </div>
            </div>

            {optimizationBanner && (
              <div className="rounded-lg bg-[#09090B] border border-white/[0.1] px-3 py-2 text-[11px] text-zinc-300 flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>{optimizationBanner}</span>
              </div>
            )}

            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              {sequence.steps.map((step, idx) => {
                const audit = quickSpamCheck(step.subject, step.body);
                const wordCount = step.body.trim().split(/\s+/).filter(Boolean).length;
                return (
                  <div
                    key={step.id}
                    className="rounded-lg bg-[#09090B] border border-white/[0.08] p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-white">
                          Step 0{step.stepNumber}
                        </span>
                        <span className="text-zinc-500">·</span>
                        <select
                          value={step.condition}
                          onChange={(e) => {
                            const next = [...sequence.steps];
                            next[idx] = {
                              ...step,
                              condition: e.target.value as EmailSequence['steps'][number]['condition'],
                            };
                            onUpdateSequence({ ...sequence, steps: next });
                          }}
                          className="bg-[#121317] border border-white/[0.1] rounded px-1.5 py-0.5 text-[11px] text-zinc-200"
                        >
                          <option value="always">Send Always</option>
                          <option value="if_unopened">If Unopened</option>
                          <option value="if_no_reply">If No Reply</option>
                        </select>
                      </div>
                      <span
                        className={`font-mono ${
                          audit.warnings.length > 0 ? 'text-amber-400' : 'text-zinc-500'
                        }`}
                      >
                        {wordCount}w · {audit.score}/100 safe
                      </span>
                    </div>

                    <div className="space-y-2">
                      <input
                        type="text"
                        value={step.subject}
                        aria-label={`Step ${step.stepNumber} Subject A`}
                        onChange={(e) => {
                          const next = [...sequence.steps];
                          next[idx] = { ...step, subject: e.target.value };
                          onUpdateSequence({ ...sequence, steps: next });
                        }}
                        className="w-full rounded bg-[#121317] border border-white/[0.08] px-2.5 py-1.5 font-mono text-[11px] text-white focus:outline-none focus:border-white/30"
                        placeholder="Subject Variant A"
                      />
                      <input
                        type="text"
                        value={step.subjectVariantB}
                        aria-label={`Step ${step.stepNumber} Subject B`}
                        onChange={(e) => {
                          const next = [...sequence.steps];
                          next[idx] = { ...step, subjectVariantB: e.target.value };
                          onUpdateSequence({ ...sequence, steps: next });
                        }}
                        className="w-full rounded bg-[#121317] border border-white/[0.08] px-2.5 py-1.5 font-mono text-[11px] text-zinc-300 focus:outline-none focus:border-white/30"
                        placeholder="Subject Variant B"
                      />
                      <textarea
                        rows={4}
                        value={step.body}
                        onChange={(e) => {
                          const next = [...sequence.steps];
                          next[idx] = { ...step, body: e.target.value };
                          onUpdateSequence({ ...sequence, steps: next });
                        }}
                        className="w-full rounded bg-[#121317] border border-white/[0.08] px-2.5 py-2 text-xs text-zinc-200 leading-relaxed focus:outline-none focus:border-white/30"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {onNavigateToCampaigns && (
              <button
                type="button"
                onClick={onNavigateToCampaigns}
                className="w-full py-2.5 px-4 rounded-lg border border-white/[0.14] text-xs font-medium text-white hover:bg-white/[0.06] transition-colors flex items-center justify-center gap-2"
              >
                <span>Open Tracking &amp; Send Queue</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      ) : (
        /* 4-Angle Batch Generator Mode */
        <div className="space-y-6">
          <form
            onSubmit={handleGenerateIdeas}
            className="rounded-xl bg-[#121317] border border-white/[0.08] p-5 flex flex-wrap items-center justify-between gap-4"
          >
            <div>
              <h3 className="font-display text-sm font-semibold text-white">
                Multi-Angle Cold Email Generator
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Generates 4 distinct psychological frameworks at once using your Offer &amp; Persona above.
              </p>
            </div>
            <button
              type="submit"
              disabled={isGenerating}
              className="px-4 py-2 rounded-lg bg-white text-[#09090B] text-xs font-semibold hover:bg-zinc-200 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Generating 4 Angles...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Generate 4 Email Ideas</span>
                </>
              )}
            </button>
          </form>

          {ideas.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {ideas.map((idea) => (
                <div
                  key={idea.id}
                  className="rounded-xl bg-[#121317] border border-white/[0.08] p-5 flex flex-col justify-between gap-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-display text-sm font-semibold text-white">
                          {idea.angleName}
                        </h3>
                        <div className="text-xs text-zinc-400 mt-0.5">
                          {idea.psychologicalTrigger} · {idea.predictedReplyLift}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setStudioMode('chat');
                            sendChatPrompt(
                              `Refine this angle ("${idea.angleName}") so it converts even higher and stays 100% safe from Gmail Spam:\nSubject: ${idea.subjectA}\nBody:\n${idea.body}`
                            );
                          }}
                          className="px-2.5 py-1.5 rounded-lg border border-white/[0.12] text-xs text-zinc-300 hover:text-white hover:bg-white/[0.05] transition-colors"
                        >
                          Refine in Chat
                        </button>
                        <button
                          type="button"
                          onClick={() => handleLoadIdeaIntoSequence(idea)}
                          className="px-3 py-1.5 rounded-lg bg-white text-[#09090B] text-xs font-semibold hover:bg-zinc-200 transition-colors flex items-center gap-1.5"
                        >
                          <span>Load Sequence</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    <div className="rounded-lg bg-[#09090B] border border-white/[0.06] p-3 space-y-1 text-xs">
                      <div className="text-zinc-400">
                        Subject A: <span className="text-zinc-100 font-mono">{idea.subjectA}</span>
                      </div>
                      <div className="text-zinc-400">
                        Subject B: <span className="text-zinc-100 font-mono">{idea.subjectB}</span>
                      </div>
                    </div>

                    <p className="text-xs text-zinc-300 whitespace-pre-line leading-relaxed">
                      {idea.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
