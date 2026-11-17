import React from 'react';
import { ArrowUpRight, MailCheck, ShieldCheck, Users } from 'lucide-react';
import type {
  DeliverabilityReport,
  GmailAccountSlot,
  Lead,
  TrackedEmail,
  WorkspaceTab,
} from '../types';

interface OverviewViewProps {
  slots: GmailAccountSlot[];
  leads: Lead[];
  trackedEmails: TrackedEmail[];
  deliverabilityReports: Record<string, DeliverabilityReport>;
  onNavigate: (tab: WorkspaceTab) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  slots,
  leads,
  trackedEmails,
  deliverabilityReports,
  onNavigate,
}) => {
  const connectedSlots = slots.filter((s) => s.connected);
  const dailyPoolLimit = connectedSlots.reduce((sum, s) => sum + s.dailyLimit, 0);
  const sentToday = connectedSlots.reduce((sum, s) => sum + s.sentToday, 0);

  const totalSent = trackedEmails.length;
  const openedCount = trackedEmails.filter((t) => t.openCount > 0 || t.status === 'opened' || t.status === 'clicked' || t.status === 'replied').length;
  const repliedCount = trackedEmails.filter((t) => t.status === 'replied').length;
  const bouncedCount = trackedEmails.filter((t) => t.status === 'bounced').length;

  const openRate = totalSent > 0 ? Math.round((openedCount / totalSent) * 100) : 0;
  const replyRate = totalSent > 0 ? Math.round((repliedCount / totalSent) * 100) : 0;

  const mxVerifiedLeads = leads.filter((l) => l.mxValid === true).length;

  const reportList = Object.values(deliverabilityReports);
  const avgDeliverability =
    reportList.length > 0
      ? Math.round(reportList.reduce((acc, r) => acc + r.score, 0) / reportList.length)
      : null;

  // Build 7-day telemetry bars from real trackedEmails
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86400000);
    const label = d.toLocaleDateString('en-US', { weekday: 'short' });
    const dayKey = d.toISOString().slice(0, 10);
    const daySent = trackedEmails.filter((t) => t.sentAt.slice(0, 10) === dayKey);
    const dayOpened = daySent.filter((t) => t.openCount > 0 || t.status === 'opened' || t.status === 'replied');
    return {
      label,
      sent: daySent.length,
      opened: dayOpened.length,
    };
  });
  const maxDayVal = Math.max(10, ...days.map((d) => d.sent));

  return (
    <div className="space-y-8">
      {/* 4-Column KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl bg-[#121317] border border-white/[0.08] p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Daily Pool Capacity</span>
            <MailCheck className="w-4 h-4 text-zinc-500" />
          </div>
          <div className="font-mono text-2xl font-semibold text-white tabular-nums">
            {sentToday.toLocaleString()} / {Math.max(dailyPoolLimit, 0).toLocaleString()}
          </div>
          <div className="text-xs text-zinc-500">
            {connectedSlots.length} of 3 Gmail slots active · target 2,000/day
          </div>
        </div>

        <div className="rounded-xl bg-[#121317] border border-white/[0.08] p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Tracked Open Rate</span>
            <ArrowUpRight className="w-4 h-4 text-zinc-500" />
          </div>
          <div className="font-mono text-2xl font-semibold text-white tabular-nums">
            {openRate}%
          </div>
          <div className="text-xs text-zinc-500 tabular-nums">
            {openedCount} opens · {repliedCount} replies ({replyRate}%) across {totalSent} sent
          </div>
        </div>

        <div className="rounded-xl bg-[#121317] border border-white/[0.08] p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Verified Leads</span>
            <Users className="w-4 h-4 text-zinc-500" />
          </div>
          <div className="font-mono text-2xl font-semibold text-white tabular-nums">
            {leads.length}
          </div>
          <div className="text-xs text-zinc-500 tabular-nums">
            {mxVerifiedLeads} MX-verified · ready for sequence queue
          </div>
        </div>

        <div className="rounded-xl bg-[#121317] border border-white/[0.08] p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Deliverability Health</span>
            <ShieldCheck className="w-4 h-4 text-zinc-500" />
          </div>
          <div className="font-mono text-2xl font-semibold text-white tabular-nums">
            {avgDeliverability !== null ? `${avgDeliverability}/100` : 'Pending'}
          </div>
          <div className="text-xs text-zinc-500 tabular-nums">
            {bouncedCount} bounces logged · SPF / DKIM / DMARC
          </div>
        </div>
      </div>

      {/* Main Split: Telemetry Chart + 3-Slot Mailbox Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-7 rounded-xl bg-[#121317] border border-white/[0.08] p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="font-display text-base font-semibold text-white">
                7-Day Dispatch & Open Velocity
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Real-time tracking pixel opens vs total Gmail outbound dispatches
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-zinc-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-zinc-700 inline-block" />
                Sent
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-white inline-block" />
                Opened
              </span>
            </div>
          </div>

          <div className="h-48 flex items-end justify-between gap-3 pt-4 border-t border-white/[0.06]">
            {days.map((d) => {
              const sentHeight = Math.max(4, Math.round((d.sent / maxDayVal) * 140));
              const openedHeight = d.opened > 0 ? Math.max(4, Math.round((d.opened / maxDayVal) * 140)) : 0;
              return (
                <div key={d.label} className="flex-1 flex flex-col items-center gap-2">
                  <div className="w-full h-36 flex items-end justify-center gap-1.5">
                    <div
                      className="w-3.5 rounded-t-sm bg-zinc-700 transition-all duration-300"
                      style={{ height: `${sentHeight}px` }}
                      title={`${d.sent} sent`}
                    />
                    <div
                      className="w-3.5 rounded-t-sm bg-white transition-all duration-300"
                      style={{ height: `${openedHeight}px` }}
                      title={`${d.opened} opened`}
                    />
                  </div>
                  <span className="font-mono text-[11px] text-zinc-500">{d.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-5 rounded-xl bg-[#121317] border border-white/[0.08] p-6 flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold text-white">
                Connected Sender Rotation
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Switch or balance up to 3 Gmail accounts
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('accounts')}
              className="text-xs text-zinc-300 hover:text-white underline underline-offset-4"
            >
              Configure
            </button>
          </div>

          <div className="divide-y divide-white/[0.06] border-t border-b border-white/[0.06]">
            {slots.map((slot) => (
              <div key={slot.slotIndex} className="py-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs text-zinc-500">Slot 0{slot.slotIndex + 1}</div>
                  <div className="font-mono text-sm text-zinc-100 truncate mt-0.5">
                    {slot.email ?? 'Unassigned Gmail Slot'}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {slot.connected ? (
                    <>
                      <div
                        className={`font-mono text-xs ${
                          slot.paused
                            ? 'text-amber-400'
                            : slot.needsReconnect
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        {slot.paused ? 'Paused' : slot.needsReconnect ? 'Reconnect Needed' : 'Ready'}
                      </div>
                      <div className="font-mono text-xs text-zinc-500 tabular-nums mt-0.5">
                        {slot.sentToday} / {slot.dailyLimit}
                      </div>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onNavigate('accounts')}
                      className="text-xs text-zinc-300 hover:text-white border border-white/[0.12] px-2.5 py-1 rounded-md"
                    >
                      Connect
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={() => onNavigate('scraper')}
              className="flex-1 py-2.5 px-4 rounded-lg bg-white text-[#09090B] text-xs font-semibold hover:bg-zinc-200 transition-colors"
            >
              Run AI Lead Scraper
            </button>
            <button
              type="button"
              onClick={() => onNavigate('campaigns')}
              className="flex-1 py-2.5 px-4 rounded-lg border border-white/[0.12] text-xs font-medium text-zinc-200 hover:bg-white/[0.05] transition-colors"
            >
              Open Send Queue
            </button>
          </div>
        </div>
      </div>

      {/* Recent Tracked Dispatches */}
      <div className="rounded-xl bg-[#121317] border border-white/[0.08] overflow-hidden">
        <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold text-white">
            Recent Tracked Outreach
          </h2>
          <button
            type="button"
            onClick={() => onNavigate('campaigns')}
            className="text-xs text-zinc-400 hover:text-white transition-colors"
          >
            View All Activity
          </button>
        </div>

        {trackedEmails.length === 0 ? (
          <div className="px-6 py-10 text-center space-y-2">
            <p className="text-sm text-zinc-300">No tracked emails dispatched yet.</p>
            <p className="text-xs text-zinc-500">
              Connect a Gmail slot, scrape or queue leads, and launch a tracked campaign to monitor live open and reply rates.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-white/[0.08] text-zinc-500">
                  <th className="py-3 px-6 font-medium">Recipient</th>
                  <th className="py-3 px-4 font-medium">Sender</th>
                  <th className="py-3 px-4 font-medium">Subject</th>
                  <th className="py-3 px-4 font-medium text-right">Opens</th>
                  <th className="py-3 px-6 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {trackedEmails.slice(0, 6).map((item) => (
                  <tr key={item.id} className="hover:bg-white/[0.02]">
                    <td className="py-3 px-6">
                      <div className="text-zinc-100 font-medium">{item.recipientName}</div>
                      <div className="font-mono text-zinc-500">{item.recipientEmail}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-zinc-400">{item.senderEmail}</td>
                    <td className="py-3 px-4 text-zinc-300 max-w-xs truncate">{item.subject}</td>
                    <td className="py-3 px-4 font-mono text-right tabular-nums text-zinc-200">
                      {item.openCount}
                    </td>
                    <td className="py-3 px-6 text-right font-mono capitalize">
                      <span
                        className={
                          item.status === 'replied'
                            ? 'text-emerald-400'
                            : item.status === 'spam'
                            ? 'text-amber-400'
                            : item.status === 'bounced'
                            ? 'text-red-400'
                            : item.status === 'opened' || item.status === 'clicked'
                            ? 'text-white'
                            : 'text-zinc-400'
                        }
                      >
                        {item.status === 'spam' ? 'Spam Flagged' : item.status}
                      </span>
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
