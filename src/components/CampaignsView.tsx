import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Eye,
  Loader2,
  MailCheck,
  PauseCircle,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import type {
  DeliverabilityAlert,
  EmailSequence,
  ExtensionOutreachJob,
  GmailAccountSlot,
  Lead,
  PendingSendConfirmation,
  TrackedEmail,
} from '../types';

interface CampaignsViewProps {
  slots: GmailAccountSlot[];
  activeSlotIndex: 0 | 1 | 2;
  leads: Lead[];
  sequence: EmailSequence;
  trackedEmails: TrackedEmail[];
  alerts: DeliverabilityAlert[];
  autoPauseOnSpam: boolean;
  onToggleAutoPause: (enabled: boolean) => void;
  batchStatus: 'idle' | 'sending' | 'paused';
  batchProgressLabel: string | null;
  onPauseBatch: () => void;
  desktopNotifyEnabled: boolean;
  onToggleDesktopNotify: () => Promise<void>;
  onAcknowledgeAlert: (id?: string) => void;
  onRequestConfirmation: (req: PendingSendConfirmation) => void;
  onExecuteBatchDispatch: (params: {
    recipients: Lead[];
    rotationMode: 'active' | 'round-robin';
    delayMs: number;
  }) => Promise<void>;
  onExecuteSingleSend: (params: {
    toEmail: string;
    toName: string;
    company: string;
    subject: string;
    body: string;
  }) => Promise<void>;
  onSyncReplies: () => Promise<void>;
  onRefreshTracking: () => Promise<void>;
  onGoToAccounts: () => void;
  pendingExtensionJobs: ExtensionOutreachJob[];
  onLoadExtensionJob: (job: ExtensionOutreachJob) => Promise<void>;
}

export const CampaignsView: React.FC<CampaignsViewProps> = ({
  slots,
  activeSlotIndex,
  leads,
  sequence,
  trackedEmails,
  alerts,
  autoPauseOnSpam,
  onToggleAutoPause,
  batchStatus,
  batchProgressLabel,
  onPauseBatch,
  desktopNotifyEnabled,
  onToggleDesktopNotify,
  onAcknowledgeAlert,
  onRequestConfirmation,
  onExecuteBatchDispatch,
  onExecuteSingleSend,
  onSyncReplies,
  onRefreshTracking,
  onGoToAccounts,
  pendingExtensionJobs,
  onLoadExtensionJob,
}) => {
  const [rotationMode, setRotationMode] = useState<'active' | 'round-robin'>('round-robin');
  const [staggerSeconds, setStaggerSeconds] = useState(2);
  const [composeOpen, setComposeOpen] = useState(false);
  const [singleTo, setSingleTo] = useState('');
  const [singleName, setSingleName] = useState('');
  const [singleSubject, setSingleSubject] = useState(sequence.steps[0]?.subject ?? 'Quick question');
  const [singleBody, setSingleBody] = useState(sequence.steps[0]?.body ?? '');
  const [isSyncing, setIsSyncing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | TrackedEmail['status']>('all');

  const readySlots = slots.filter(
    (s) => s.connected && !s.needsReconnect && !s.paused && Boolean(s.email)
  );
  const pausedSlots = slots.filter((s) => s.connected && s.paused);
  const activeSlot = slots[activeSlotIndex];
  const queuedLeads = leads.filter(
    (l) => (l.status === 'queued' || l.status === 'new') && Boolean(l.email && l.email.includes('@'))
  );

  const filteredTracked = useMemo(() => {
    if (statusFilter === 'all') return trackedEmails;
    return trackedEmails.filter((t) => t.status === statusFilter);
  }, [trackedEmails, statusFilter]);

  const unacknowledgedAlerts = alerts.filter((a) => !a.acknowledged);

  const handleLaunchBatch = () => {
    if (readySlots.length === 0 || queuedLeads.length === 0) return;

    const senderEmails =
      rotationMode === 'round-robin'
        ? readySlots.map((s) => s.email as string)
        : activeSlot.email && !activeSlot.needsReconnect
        ? [activeSlot.email]
        : [readySlots[0].email as string];

    const step1 = sequence.steps[0];
    onRequestConfirmation({
      mode: 'batch',
      senderEmails,
      recipients: queuedLeads.map((l) => ({
        email: l.email,
        name: l.fullName,
        company: l.company,
      })),
      subject: step1?.subject || 'Outreach Sequence',
      sequenceName: sequence.name,
      estimatedDurationLabel: `${queuedLeads.length * staggerSeconds}s (${rotationMode})`,
      onConfirm: () =>
        onExecuteBatchDispatch({
          recipients: queuedLeads,
          rotationMode,
          delayMs: staggerSeconds * 1000,
        }),
    });
  };

  const handleSingleComposeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!singleTo.trim() || readySlots.length === 0) return;
    const sender =
      activeSlot.connected && !activeSlot.needsReconnect && activeSlot.email
        ? activeSlot.email
        : (readySlots[0].email as string);

    onRequestConfirmation({
      mode: 'single',
      senderEmails: [sender],
      recipients: [
        {
          email: singleTo.trim(),
          name: singleName.trim() || singleTo.trim(),
          company: singleTo.split('@')[1] || 'Direct',
        },
      ],
      subject: singleSubject,
      sequenceName: 'Direct 1:1 Tracked Send',
      estimatedDurationLabel: 'Immediate',
      onConfirm: async () => {
        await onExecuteSingleSend({
          toEmail: singleTo.trim(),
          toName: singleName.trim() || singleTo.trim(),
          company: singleTo.split('@')[1] || 'Direct',
          subject: singleSubject,
          body: singleBody,
        });
        setComposeOpen(false);
        setSingleTo('');
        setSingleName('');
      },
    });
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await onSyncReplies();
      await onRefreshTracking();
    } finally {
      setIsSyncing(false);
    }
  };

  const totalSent = trackedEmails.length;
  const totalOpened = trackedEmails.filter((t) => t.openCount > 0 || t.status === 'opened' || t.status === 'replied').length;
  const totalReplied = trackedEmails.filter((t) => t.status === 'replied').length;
  const totalBounced = trackedEmails.filter((t) => t.status === 'bounced').length;
  const totalSpam = trackedEmails.filter((t) => t.status === 'spam').length;

  return (
    <div className="space-y-8">
      {/* Unacknowledged Google Spam / Auto-Pause Alerts */}
      {unacknowledgedAlerts.length > 0 && (
        <div className="rounded-xl border border-red-500/35 bg-red-500/10 p-4 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-red-200">
              <AlertTriangle className="w-4 h-4 text-red-300 shrink-0" />
              <span>
                Google Guardrail Alert ({unacknowledgedAlerts.length} active notice
                {unacknowledgedAlerts.length > 1 ? 's' : ''})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onGoToAccounts}
                className="px-3 py-1 rounded-md bg-white text-[#09090B] text-[11px] font-semibold"
              >
                Manage Paused Mailboxes
              </button>
              <button
                type="button"
                onClick={() => onAcknowledgeAlert()}
                className="px-2.5 py-1 rounded-md border border-red-400/30 text-[11px] text-red-200 hover:bg-red-500/20"
              >
                Dismiss All
              </button>
            </div>
          </div>
          {unacknowledgedAlerts.slice(0, 3).map((al) => (
            <div key={al.id} className="text-xs text-red-100/90 border-t border-red-500/20 pt-2">
              <span className="font-semibold">{al.title}:</span> {al.message}{' '}
              <span className="font-mono text-[11px] text-red-200/80">[{al.actionTaken}]</span>
            </div>
          ))}
        </div>
      )}

      {/* Pending Chrome Extension Multi-Send Queue */}
      {pendingExtensionJobs.length > 0 && (
        <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-emerald-200">
                Chrome Extension Multi-Send Batch Ready ({pendingExtensionJobs.length})
              </div>
              <p className="text-[11px] text-emerald-100/80 mt-0.5">
                Load your scraped client emails and freelancer pitch straight into the active sequence for tracked Gmail dispatch.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {pendingExtensionJobs.map((job) => (
              <div
                key={job.id}
                className="rounded-lg bg-[#09090B]/80 border border-white/[0.1] px-4 py-3 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="text-xs font-medium text-white truncate">
                    {job.sequenceName} · {job.recipients.length} client email
                    {job.recipients.length === 1 ? '' : 's'}
                  </div>
                  <div className="font-mono text-[11px] text-zinc-400 truncate">
                    Subject: {job.subject} ·{' '}
                    {job.recipients
                      .slice(0, 3)
                      .map((r) => r.email)
                      .join(', ')}
                    {job.recipients.length > 3 ? ` +${job.recipients.length - 3} more` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onLoadExtensionJob(job)}
                  className="px-3.5 py-1.5 rounded-md bg-white text-[#09090B] text-xs font-semibold hover:bg-zinc-200 transition-colors shrink-0"
                >
                  Load Pitch &amp; Queue Batch
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Batch Orchestrator Control Panel */}
      <div className="rounded-xl bg-[#121317] border border-white/[0.08] p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-white">
              Outreach Queue &amp; Google Auto-Pause Guardrail
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Rotates across connected Gmail slots, monitors Google Spam &amp; quota responses live, and auto-pauses immediately if sending cannot continue.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {batchStatus === 'sending' && (
              <button
                type="button"
                onClick={onPauseBatch}
                className="px-3.5 py-2 rounded-lg border border-amber-400/40 bg-amber-500/15 text-amber-200 text-xs font-semibold hover:bg-amber-500/25 transition-colors flex items-center gap-1.5"
              >
                <PauseCircle className="w-3.5 h-3.5" />
                <span>Pause Dispatch</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setComposeOpen((v) => !v)}
              className="px-3.5 py-2 rounded-lg border border-white/[0.12] text-xs font-medium text-zinc-200 hover:bg-white/[0.05] transition-colors"
            >
              {composeOpen ? 'Hide 1:1 Composer' : 'Compose 1:1 Email'}
            </button>
            <button
              type="button"
              onClick={handleLaunchBatch}
              disabled={readySlots.length === 0 || queuedLeads.length === 0 || batchStatus === 'sending'}
              className="px-4 py-2 rounded-lg bg-white text-[#09090B] text-xs font-semibold hover:bg-zinc-200 transition-colors flex items-center gap-2 disabled:opacity-40"
            >
              {batchStatus === 'sending' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              <span>
                {batchStatus === 'sending'
                  ? 'Sending Batch...'
                  : `Dispatch Queue (${queuedLeads.length} Leads)`}
              </span>
            </button>
          </div>
        </div>

        {(batchProgressLabel || batchStatus === 'paused') && (
          <div className="rounded-lg border border-white/[0.1] bg-[#09090B] px-4 py-2.5 text-xs text-zinc-200 flex items-center justify-between gap-3">
            <span className="font-mono">
              {batchProgressLabel || 'Batch dispatch paused. Remaining leads stay queued.'}
            </span>
            {batchStatus === 'paused' && (
              <span className="font-mono text-[11px] text-amber-300">PAUSED</span>
            )}
          </div>
        )}

        {/* Guardrail Controls Row */}
        <div className="rounded-lg bg-[#09090B] border border-white/[0.08] px-4 py-3 flex flex-wrap items-center justify-between gap-4 text-xs">
          <label className="flex items-center gap-2.5 text-zinc-200 cursor-pointer">
            <input
              type="checkbox"
              checked={autoPauseOnSpam}
              onChange={(e) => onToggleAutoPause(e.target.checked)}
              className="accent-white w-4 h-4"
            />
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              Auto-pause mailbox &amp; notify immediately if mail hits Spam or Google blocks sending
            </span>
          </label>

          <button
            type="button"
            onClick={onToggleDesktopNotify}
            className={`px-3 py-1.5 rounded-md border text-[11px] font-medium inline-flex items-center gap-1.5 transition-colors ${
              desktopNotifyEnabled
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
                : 'border-white/[0.12] text-zinc-300 hover:bg-white/[0.05]'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            <span>{desktopNotifyEnabled ? 'Browser Notifications On' : 'Enable Browser Alerts'}</span>
          </button>
        </div>

        {readySlots.length === 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-200">
            <span className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              {pausedSlots.length > 0
                ? `${pausedSlots.length} mailbox slot(s) currently paused by guardrail. Resume or connect another Gmail account in Mailboxes & DNS.`
                : 'Connect at least one Gmail account in Mailboxes & DNS before dispatching campaigns.'}
            </span>
            <button
              type="button"
              onClick={onGoToAccounts}
              className="px-3 py-1 rounded bg-white text-[#09090B] font-semibold"
            >
              {pausedSlots.length > 0 ? 'Review Mailboxes' : 'Connect Gmail'}
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-white/[0.06] text-xs">
          <div className="space-y-1.5">
            <span className="text-zinc-400 block">Sender Rotation</span>
            <div className="flex items-center gap-1 p-1 rounded-lg bg-[#09090B] border border-white/[0.08]">
              <button
                type="button"
                onClick={() => setRotationMode('round-robin')}
                className={`flex-1 py-1.5 rounded-md font-medium transition-colors ${
                  rotationMode === 'round-robin'
                    ? 'bg-white text-[#09090B]'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Round-Robin ({readySlots.length})
              </button>
              <button
                type="button"
                onClick={() => setRotationMode('active')}
                className={`flex-1 py-1.5 rounded-md font-medium transition-colors ${
                  rotationMode === 'active'
                    ? 'bg-white text-[#09090B]'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Active Slot Only
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="stagger-select" className="text-zinc-400 block">
              Send Interval Pacing
            </label>
            <select
              id="stagger-select"
              value={staggerSeconds}
              onChange={(e) => setStaggerSeconds(Number(e.target.value))}
              className="w-full rounded-lg bg-[#09090B] border border-white/[0.1] px-3 py-2 font-mono text-xs text-white"
            >
              <option value={1}>1s interval (Test burst)</option>
              <option value={2}>2s interval (Standard)</option>
              <option value={15}>15s interval (Safe warm)</option>
              <option value={45}>45s interval (2,000/day max safety)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <span className="text-zinc-400 block">Sequence Step Loaded</span>
            <div className="rounded-lg bg-[#09090B] border border-white/[0.08] px-3 py-2 font-mono text-zinc-200 truncate">
              {sequence.name} · Step 1
            </div>
          </div>
        </div>

        {composeOpen && (
          <form
            onSubmit={handleSingleComposeSubmit}
            className="rounded-lg bg-[#09090B] border border-white/[0.1] p-5 space-y-4 mt-2"
          >
            <div className="text-xs font-semibold text-white">Direct 1:1 Tracked Email</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                type="email"
                required
                value={singleTo}
                onChange={(e) => setSingleTo(e.target.value)}
                placeholder="recipient@company.com"
                className="rounded-md bg-[#121317] border border-white/[0.1] px-3 py-2 font-mono text-xs text-white focus:outline-none focus:border-white/40"
              />
              <input
                type="text"
                value={singleName}
                onChange={(e) => setSingleName(e.target.value)}
                placeholder="Recipient Name (optional)"
                className="rounded-md bg-[#121317] border border-white/[0.1] px-3 py-2 text-xs text-white focus:outline-none focus:border-white/40"
              />
            </div>
            <input
              type="text"
              required
              value={singleSubject}
              onChange={(e) => setSingleSubject(e.target.value)}
              placeholder="Email Subject"
              className="w-full rounded-md bg-[#121317] border border-white/[0.1] px-3 py-2 text-xs text-white focus:outline-none focus:border-white/40"
            />
            <textarea
              rows={4}
              required
              value={singleBody}
              onChange={(e) => setSingleBody(e.target.value)}
              placeholder="Write your personalized email message..."
              className="w-full rounded-md bg-[#121317] border border-white/[0.1] px-3 py-2 text-xs text-white leading-relaxed focus:outline-none focus:border-white/40"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={readySlots.length === 0}
                className="px-4 py-2 rounded-lg bg-white text-[#09090B] text-xs font-semibold hover:bg-zinc-200 transition-colors disabled:opacity-40"
              >
                Review &amp; Send
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Live Tracking Evaluation Ledger */}
      <div className="rounded-xl bg-[#121317] border border-white/[0.08] overflow-hidden">
        <div className="px-6 py-4 border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-0.5">
            <h2 className="font-display text-sm font-semibold text-white">
              Sent Email Tracking &amp; Evaluation
            </h2>
            <div className="text-xs text-zinc-400 tabular-nums font-mono">
              {totalSent} Sent · {totalOpened} Opened · {totalReplied} Replied · {totalBounced} Bounced
              {totalSpam > 0 ? ` · ${totalSpam} Spam` : ''}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 p-1 rounded-lg bg-[#09090B] border border-white/[0.08]">
              {(['all', 'sent', 'opened', 'replied', 'bounced', 'spam'] as const).map((status) => (
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

            <button
              type="button"
              onClick={handleSync}
              disabled={isSyncing}
              className="px-3.5 py-1.5 rounded-lg border border-white/[0.12] text-xs font-medium text-zinc-200 hover:bg-white/[0.05] transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSyncing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              <span>Sync Gmail Spam &amp; Replies</span>
            </button>
          </div>
        </div>

        {filteredTracked.length === 0 ? (
          <div className="px-6 py-12 text-center space-y-2">
            <MailCheck className="w-6 h-6 text-zinc-600 mx-auto" />
            <p className="text-sm text-zinc-300">No sent emails tracked in this view.</p>
            <p className="text-xs text-zinc-500">
              Every email sent through KuroReach embeds a unique tracking pixel and thread ID to evaluate opens, replies, and bounces automatically.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-white/[0.08] text-zinc-500">
                  <th className="py-3 px-6 font-medium">Recipient</th>
                  <th className="py-3 px-4 font-medium">Sender Slot</th>
                  <th className="py-3 px-4 font-medium">Subject &amp; Variant</th>
                  <th className="py-3 px-4 font-medium text-right">Opens</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-6 font-medium text-right">Sent Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {filteredTracked.map((item) => (
                  <tr key={item.id} className="hover:bg-white/[0.02]">
                    <td className="py-3.5 px-6">
                      <div className="text-zinc-100 font-medium">{item.recipientName}</div>
                      <div className="font-mono text-zinc-500">{item.recipientEmail}</div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-zinc-400">
                      Slot 0{item.senderSlot + 1} · {item.senderEmail}
                    </td>
                    <td className="py-3.5 px-4 max-w-xs">
                      <div className="text-zinc-200 truncate">{item.subject}</div>
                      <div className="font-mono text-[11px] text-zinc-500">
                        Variant {item.variant} · Step {item.stepNumber}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-zinc-200">
                      <span className="inline-flex items-center gap-1 justify-end">
                        <Eye className="w-3 h-3 text-zinc-500" />
                        {item.openCount}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono capitalize">
                      {item.status === 'replied' ? (
                        <span className="text-emerald-400 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Replied
                        </span>
                      ) : item.status === 'spam' ? (
                        <span className="text-amber-400 inline-flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" /> Spam Flagged
                        </span>
                      ) : item.status === 'bounced' ? (
                        <span className="text-red-400">Bounced</span>
                      ) : item.status === 'opened' || item.status === 'clicked' ? (
                        <span className="text-white">{item.status}</span>
                      ) : (
                        <span className="text-zinc-400">Sent</span>
                      )}
                    </td>
                    <td className="py-3.5 px-6 text-right font-mono text-zinc-500 tabular-nums whitespace-nowrap">
                      {new Date(item.sentAt).toLocaleString()}
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
