import React, { useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ExternalLink,
  Loader2,
  LogOut,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import firebaseConfig from '../../firebase-applet-config.json';
import type { DeliverabilityAlert, DeliverabilityReport, GmailAccountSlot } from '../types';
import { safeFetchJson } from '../lib/safeFetch';

interface AccountsViewProps {
  slots: GmailAccountSlot[];
  activeSlotIndex: 0 | 1 | 2;
  onConnectSlot: (slotIndex: 0 | 1 | 2) => Promise<void>;
  onConnectSmtpSlot: (
    slotIndex: 0 | 1 | 2,
    params: { email: string; displayName?: string; appPassword: string; host?: string; port?: number }
  ) => Promise<void>;
  onDisconnectSlot: (slotIndex: 0 | 1 | 2) => void;
  onSwitchSlot: (slotIndex: 0 | 1 | 2) => void;
  onUpdateSlotConfig: (slotIndex: 0 | 1 | 2, patch: Partial<GmailAccountSlot>) => void;
  onToggleSlotPause: (slotIndex: 0 | 1 | 2, paused: boolean) => void;
  onRunGoogleHealthScan: () => Promise<void>;
  alerts: DeliverabilityAlert[];
  onAcknowledgeAlert: (id?: string) => void;
  deliverabilityReports: Record<string, DeliverabilityReport>;
  onSaveDeliverabilityReport: (report: DeliverabilityReport) => void;
}

export const AccountsView: React.FC<AccountsViewProps> = ({
  slots,
  activeSlotIndex,
  onConnectSlot,
  onConnectSmtpSlot,
  onDisconnectSlot,
  onSwitchSlot,
  onUpdateSlotConfig,
  onToggleSlotPause,
  onRunGoogleHealthScan,
  alerts,
  onAcknowledgeAlert,
  deliverabilityReports,
  onSaveDeliverabilityReport,
}) => {
  const [connectingSlot, setConnectingSlot] = useState<number | null>(null);
  const [isScanningHealth, setIsScanningHealth] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [slotModes, setSlotModes] = useState<Record<number, 'oauth' | 'smtp'>>({
    0: 'smtp',
    1: 'smtp',
    2: 'smtp',
  });
  const [smtpForms, setSmtpForms] = useState<
    Record<number, { email: string; displayName: string; appPassword: string; host: string; port: number }>
  >({
    0: { email: '', displayName: '', appPassword: '', host: 'smtp.gmail.com', port: 465 },
    1: { email: '', displayName: '', appPassword: '', host: 'smtp.gmail.com', port: 465 },
    2: { email: '', displayName: '', appPassword: '', host: 'smtp.gmail.com', port: 465 },
  });
  const [showAdvancedSmtp, setShowAdvancedSmtp] = useState<Record<number, boolean>>({});
  const [domainInput, setDomainInput] = useState('gmail.com');
  const [isCheckingDns, setIsCheckingDns] = useState(false);
  const [dnsError, setDnsError] = useState<string | null>(null);
  const [selectedReportDomain, setSelectedReportDomain] = useState<string | null>(null);

  const handleConnect = async (slotIndex: 0 | 1 | 2) => {
    setAuthError(null);
    setConnectingSlot(slotIndex);
    try {
      await onConnectSlot(slotIndex);
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : 'Google sign-in failed');
    } finally {
      setConnectingSlot(null);
    }
  };

  const handleSmtpConnect = async (e: React.FormEvent, slotIndex: 0 | 1 | 2) => {
    e.preventDefault();
    setAuthError(null);
    setConnectingSlot(slotIndex);
    const form = smtpForms[slotIndex];
    try {
      await onConnectSmtpSlot(slotIndex, {
        email: form.email,
        displayName: form.displayName,
        appPassword: form.appPassword,
        host: form.host,
        port: form.port,
      });
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : 'SMTP verification failed');
    } finally {
      setConnectingSlot(null);
    }
  };

  const runDnsDiagnostic = async (targetDomain: string) => {
    setDnsError(null);
    setIsCheckingDns(true);
    try {
      const data = await safeFetchJson<{ report?: DeliverabilityReport }>('/api/deliverability/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: targetDomain }),
      });
      if (!data.report) {
        throw new Error('Deliverability lookup failed');
      }
      onSaveDeliverabilityReport(data.report);
      setSelectedReportDomain(data.report.domain);
    } catch (err: unknown) {
      setDnsError(err instanceof Error ? err.message : 'Lookup failed');
    } finally {
      setIsCheckingDns(false);
    }
  };

  const activeReport =
    (selectedReportDomain && deliverabilityReports[selectedReportDomain]) ||
    Object.values(deliverabilityReports)[0] ||
    null;

  const audienceUrl = `https://console.cloud.google.com/auth/audience?project=${firebaseConfig.projectId}`;
  const isBlockedOrCancelled = authError?.startsWith('SIGNIN_CANCELLED_OR_BLOCKED:');
  const cleanAuthError = authError?.replace('SIGNIN_CANCELLED_OR_BLOCKED:', '').trim();

  return (
    <div className="space-y-8">
      {authError && (
        <div className="rounded-xl border border-amber-500/30 bg-[#121317] p-5 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="text-xs font-semibold text-white">
                  {isBlockedOrCancelled
                    ? 'Google OAuth Blocked in Testing Mode'
                    : 'Mailbox Connection Error'}
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed">{cleanAuthError}</p>
              </div>
            </div>
            {isBlockedOrCancelled && (
              <a
                href={audienceUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3.5 py-2 rounded-lg bg-white text-[#09090B] text-xs font-semibold hover:bg-zinc-200 transition-colors inline-flex items-center gap-1.5 shrink-0"
              >
                <span>Open Cloud OAuth Audience</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>
      )}

      {alerts.length > 0 && (
        <div className="rounded-xl border border-white/[0.1] bg-[#121317] p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Bell className="w-4 h-4 text-amber-400" />
              <div>
                <h3 className="text-xs font-semibold text-white">
                  Google Spam &amp; Delivery Guardrail Log
                </h3>
                <p className="text-[11px] text-zinc-400">
                  Real-time alerts when Google flags spam, hits sending quota, or auto-pauses a mailbox.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  setIsScanningHealth(true);
                  try {
                    await onRunGoogleHealthScan();
                  } finally {
                    setIsScanningHealth(false);
                  }
                }}
                disabled={isScanningHealth}
                className="px-3 py-1.5 rounded-lg border border-white/[0.12] text-xs text-zinc-200 hover:bg-white/[0.05] inline-flex items-center gap-1.5"
              >
                {isScanningHealth ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
                <span>Scan Gmail Spam Now</span>
              </button>
              {alerts.some((a) => !a.acknowledged) && (
                <button
                  type="button"
                  onClick={() => onAcknowledgeAlert()}
                  className="px-3 py-1.5 rounded-lg bg-white text-[#09090B] text-xs font-semibold hover:bg-zinc-200"
                >
                  Mark All Read
                </button>
              )}
            </div>
          </div>

          <div className="space-y-2 max-h-56 overflow-y-auto">
            {alerts.slice(0, 8).map((alert) => (
              <div
                key={alert.id}
                className={`rounded-lg border px-3.5 py-2.5 text-xs flex flex-wrap items-start justify-between gap-3 ${
                  alert.severity === 'critical'
                    ? 'border-red-500/30 bg-red-500/10 text-red-100'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-100'
                } ${alert.acknowledged ? 'opacity-65' : ''}`}
              >
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="font-semibold flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>{alert.title}</span>
                    {alert.senderEmail && (
                      <span className="font-mono text-[11px] opacity-80">({alert.senderEmail})</span>
                    )}
                  </div>
                  <p className="opacity-90 leading-relaxed">{alert.message}</p>
                  <div className="font-mono text-[11px] opacity-75">
                    Action: {alert.actionTaken} · {new Date(alert.createdAt).toLocaleString()}
                  </div>
                </div>
                {!alert.acknowledged && (
                  <button
                    type="button"
                    onClick={() => onAcknowledgeAlert(alert.id)}
                    className="px-2.5 py-1 rounded border border-white/20 text-[11px] hover:bg-white/10 shrink-0"
                  >
                    Dismiss
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3 Gmail Slots */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {slots.map((slot) => {
          const isActive = slot.slotIndex === activeSlotIndex;
          const isConnecting = connectingSlot === slot.slotIndex;
          const slotMode = slotModes[slot.slotIndex] ?? 'smtp';
          const form = smtpForms[slot.slotIndex];

          return (
            <div
              key={slot.slotIndex}
              className={`rounded-xl bg-[#121317] border p-6 flex flex-col justify-between gap-5 ${
                isActive ? 'border-white/40' : 'border-white/[0.08]'
              }`}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-zinc-400">
                    Mailbox Slot 0{slot.slotIndex + 1}
                  </span>
                  {slot.connected ? (
                    <span
                      className={`font-mono text-xs ${
                        slot.paused
                          ? 'text-amber-400'
                          : slot.needsReconnect
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      {slot.paused
                        ? 'Auto-Paused'
                        : slot.needsReconnect
                        ? 'Reconnect Required'
                        : `${slot.authMethod === 'smtp' ? 'SMTP' : 'Google OAuth'} · ${isActive ? 'Active' : 'Ready'}`}
                    </span>
                  ) : (
                    <div className="flex items-center gap-1 p-0.5 rounded-md bg-[#09090B] border border-white/[0.08]">
                      <button
                        type="button"
                        onClick={() =>
                          setSlotModes((prev) => ({ ...prev, [slot.slotIndex]: 'smtp' }))
                        }
                        className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                          slotMode === 'smtp'
                            ? 'bg-white text-[#09090B]'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        App Password
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setSlotModes((prev) => ({ ...prev, [slot.slotIndex]: 'oauth' }))
                        }
                        className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                          slotMode === 'oauth'
                            ? 'bg-white text-[#09090B]'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        Google OAuth
                      </button>
                    </div>
                  )}
                </div>

                {slot.email ? (
                  <div className="space-y-3">
                    <div>
                      <div className="font-display text-sm font-semibold text-white truncate">
                        {slot.displayName || 'Google Account'}
                      </div>
                      <div className="font-mono text-xs text-zinc-400 truncate mt-0.5">
                        {slot.email}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/[0.06] text-xs">
                      <div>
                        <span className="text-zinc-500 block">Daily Ceiling</span>
                        <select
                          value={slot.dailyLimit}
                          onChange={(e) =>
                            onUpdateSlotConfig(slot.slotIndex, {
                              dailyLimit: Number(e.target.value),
                            })
                          }
                          className="mt-1 w-full rounded bg-[#09090B] border border-white/[0.1] px-2 py-1 font-mono text-xs text-white"
                        >
                          <option value={500}>500 / day (Gmail)</option>
                          <option value={1000}>1,000 / day</option>
                          <option value={2000}>2,000 / day (Workspace)</option>
                        </select>
                      </div>
                      <div>
                        <span className="text-zinc-500 block">Sent Today</span>
                        <div className="mt-1.5 font-mono text-sm text-white tabular-nums">
                          {slot.sentToday} / {slot.dailyLimit}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 pt-1">
                      <span>Spam flags: {slot.spamAlertsCount ?? 0}</span>
                      <span>Bounces: {slot.bounceCount ?? 0}</span>
                    </div>

                    {slot.paused && (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-200 space-y-1">
                        <div className="font-semibold flex items-center gap-1.5">
                          <PauseCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>Sending Paused</span>
                        </div>
                        <p className="text-amber-200/90 leading-relaxed">
                          {slot.pauseReason || 'Mailbox paused by user or Google guardrail.'}
                        </p>
                      </div>
                    )}

                    <label className="flex items-center justify-between pt-2 text-xs text-zinc-300 cursor-pointer">
                      <span>Automated Pacing &amp; Warmup</span>
                      <input
                        type="checkbox"
                        checked={slot.warmupEnabled}
                        onChange={(e) =>
                          onUpdateSlotConfig(slot.slotIndex, {
                            warmupEnabled: e.target.checked,
                          })
                        }
                        className="accent-white w-4 h-4"
                      />
                    </label>
                  </div>
                ) : slotMode === 'smtp' ? (
                  <form
                    id={`smtp-form-${slot.slotIndex}`}
                    onSubmit={(e) => handleSmtpConnect(e, slot.slotIndex)}
                    className="space-y-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] text-zinc-400">Gmail / Workspace Email</label>
                        <a
                          href="https://myaccount.google.com/apppasswords"
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-zinc-300 hover:text-white underline underline-offset-2 inline-flex items-center gap-1"
                        >
                          <span>Get App Password</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                      <input
                        type="email"
                        required
                        value={form.email}
                        onChange={(e) =>
                          setSmtpForms((prev) => ({
                            ...prev,
                            [slot.slotIndex]: { ...form, email: e.target.value },
                          }))
                        }
                        placeholder="you@gmail.com"
                        className="w-full rounded-md bg-[#09090B] border border-white/[0.1] px-3 py-2 font-mono text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/40"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] text-zinc-400 block">
                        16-Character App Password
                      </label>
                      <input
                        type="password"
                        required
                        value={form.appPassword}
                        onChange={(e) =>
                          setSmtpForms((prev) => ({
                            ...prev,
                            [slot.slotIndex]: { ...form, appPassword: e.target.value },
                          }))
                        }
                        placeholder="abcd efgh ijkl mnop"
                        className="w-full rounded-md bg-[#09090B] border border-white/[0.1] px-3 py-2 font-mono text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/40"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <input
                        type="text"
                        value={form.displayName}
                        onChange={(e) =>
                          setSmtpForms((prev) => ({
                            ...prev,
                            [slot.slotIndex]: { ...form, displayName: e.target.value },
                          }))
                        }
                        placeholder="Sender Name (optional)"
                        className="flex-1 rounded-md bg-[#09090B] border border-white/[0.1] px-3 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/40"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowAdvancedSmtp((prev) => ({
                            ...prev,
                            [slot.slotIndex]: !prev[slot.slotIndex],
                          }))
                        }
                        className="text-[11px] text-zinc-500 hover:text-zinc-300 whitespace-nowrap"
                      >
                        {showAdvancedSmtp[slot.slotIndex] ? 'Hide SMTP' : 'Custom SMTP'}
                      </button>
                    </div>

                    {showAdvancedSmtp[slot.slotIndex] && (
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          type="text"
                          value={form.host}
                          onChange={(e) =>
                            setSmtpForms((prev) => ({
                              ...prev,
                              [slot.slotIndex]: { ...form, host: e.target.value },
                            }))
                          }
                          placeholder="smtp.gmail.com"
                          className="col-span-2 rounded-md bg-[#09090B] border border-white/[0.1] px-2.5 py-1.5 font-mono text-[11px] text-white"
                        />
                        <input
                          type="number"
                          value={form.port}
                          onChange={(e) =>
                            setSmtpForms((prev) => ({
                              ...prev,
                              [slot.slotIndex]: { ...form, port: Number(e.target.value) },
                            }))
                          }
                          placeholder="465"
                          className="rounded-md bg-[#09090B] border border-white/[0.1] px-2.5 py-1.5 font-mono text-[11px] text-white"
                        />
                      </div>
                    )}
                  </form>
                ) : (
                  <div className="py-4 space-y-2">
                    <p className="text-sm text-zinc-200 font-medium">
                      One-Click Google OAuth Sign-In
                    </p>
                    <p className="text-xs text-zinc-500 leading-relaxed">
                      Requires your email to be listed under Test Users until you publish the OAuth app in Google Cloud Console.
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2.5 pt-2 border-t border-white/[0.06]">
                {!slot.email || slot.needsReconnect ? (
                  slotMode === 'smtp' && !slot.needsReconnect ? (
                    <button
                      type="submit"
                      form={`smtp-form-${slot.slotIndex}`}
                      disabled={isConnecting}
                      className="w-full py-2.5 px-4 rounded-lg bg-white text-[#09090B] text-xs font-semibold hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isConnecting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <span>{isConnecting ? 'Verifying SMTP...' : 'Connect & Verify Mailbox'}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleConnect(slot.slotIndex)}
                      disabled={isConnecting}
                      className="gsi-material-button w-full"
                    >
                      <div className="gsi-material-button-state" />
                      <div className="gsi-material-button-content-wrapper">
                        <div className="gsi-material-button-icon">
                          <svg
                            version="1.1"
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 48 48"
                            style={{ display: 'block' }}
                          >
                            <path
                              fill="#EA4335"
                              d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                            />
                            <path
                              fill="#4285F4"
                              d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                            />
                            <path
                              fill="#FBBC05"
                              d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                            />
                            <path
                              fill="#34A853"
                              d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                            />
                            <path fill="none" d="M0 0h48v48H0z" />
                          </svg>
                        </div>
                        <span className="gsi-material-button-contents">
                          {isConnecting
                            ? 'Connecting...'
                            : slot.needsReconnect
                            ? 'Reconnect with Google'
                            : 'Sign in with Google'}
                        </span>
                      </div>
                    </button>
                  )
                ) : (
                  <div className="flex items-center gap-2">
                    {slot.paused ? (
                      <button
                        type="button"
                        onClick={() => onToggleSlotPause(slot.slotIndex, false)}
                        className="flex-1 py-2 px-3 rounded-lg bg-amber-400 text-[#09090B] text-xs font-semibold hover:bg-amber-300 transition-colors inline-flex items-center justify-center gap-1.5"
                      >
                        <PlayCircle className="w-3.5 h-3.5" />
                        <span>Resume Sending</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSwitchSlot(slot.slotIndex)}
                        className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-colors ${
                          isActive
                            ? 'bg-white text-[#09090B]'
                            : 'border border-white/[0.12] text-zinc-200 hover:bg-white/[0.05]'
                        }`}
                      >
                        {isActive ? 'Active Sender' : 'Set Active'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onToggleSlotPause(slot.slotIndex, !slot.paused)}
                      className="py-2 px-2.5 rounded-lg border border-white/[0.12] text-xs text-zinc-300 hover:text-white hover:bg-white/[0.05]"
                      title={slot.paused ? 'Resume Mailbox' : 'Pause Mailbox'}
                    >
                      {slot.paused ? <PlayCircle className="w-3.5 h-3.5" /> : <PauseCircle className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const dom = slot.email?.split('@')[1] || '';
                        if (dom) {
                          setDomainInput(dom);
                          runDnsDiagnostic(dom);
                        }
                      }}
                      className="py-2 px-3 rounded-lg border border-white/[0.12] text-xs text-zinc-300 hover:text-white hover:bg-white/[0.05]"
                      title="Inspect Domain DNS Deliverability"
                    >
                      DNS
                    </button>
                    <button
                      type="button"
                      onClick={() => onDisconnectSlot(slot.slotIndex)}
                      className="p-2 rounded-lg border border-white/[0.1] text-zinc-500 hover:text-red-400"
                      title="Disconnect Slot"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Public Distribution Note */}
      <div className="rounded-xl bg-[#121317] border border-white/[0.08] p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs font-semibold text-white">
            Public Access Options for External Users
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed max-w-3xl">
            Any external user can connect up to 3 Gmail or Google Workspace mailboxes immediately via <span className="text-zinc-200">App Password</span> with zero Cloud Console setup. To enable 1-click public <span className="text-zinc-200">Sign in with Google</span> for arbitrary Gmail users (like ChatGPT), publish your OAuth app to Production and complete Google&apos;s Gmail scope verification in Google Cloud Console.
          </p>
        </div>
        <a
          href={audienceUrl}
          target="_blank"
          rel="noreferrer"
          className="px-3.5 py-2 rounded-lg border border-white/[0.14] text-xs font-medium text-zinc-200 hover:bg-white/[0.05] inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap"
        >
          <span>Publish OAuth App</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* Real DNS Deliverability Diagnostic Console */}
      <div className="rounded-xl bg-[#121317] border border-white/[0.08] p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-white">
              Deliverability & DNS Authentication Inspector
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Live DNS resolver verifying MX routing, SPF alignment, DKIM keys, and DMARC enforcement for high-volume Gmail sending.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={domainInput}
              onChange={(e) => setDomainInput(e.target.value)}
              placeholder="yourdomain.com or email"
              className="rounded-lg bg-[#09090B] border border-white/[0.1] px-3.5 py-2 font-mono text-xs text-white focus:outline-none focus:border-white/40 w-56"
            />
            <button
              type="button"
              onClick={() => runDnsDiagnostic(domainInput)}
              disabled={isCheckingDns}
              className="px-4 py-2 rounded-lg bg-white text-[#09090B] text-xs font-semibold hover:bg-zinc-200 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {isCheckingDns ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              <span>Run DNS Check</span>
            </button>
          </div>
        </div>

        {dnsError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs text-red-300">
            {dnsError}
          </div>
        )}

        {activeReport ? (
          <div className="space-y-5 pt-2 border-t border-white/[0.08]">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {activeReport.score >= 90 ? (
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                ) : (
                  <ShieldAlert className="w-5 h-5 text-amber-400" />
                )}
                <div>
                  <div className="font-mono text-sm font-semibold text-white">
                    {activeReport.domain} · {activeReport.grade}
                  </div>
                  <div className="text-xs text-zinc-500">
                    Mail Exchanger: {activeReport.mx.provider}
                  </div>
                </div>
              </div>
              <div className="font-mono text-2xl font-semibold text-white tabular-nums">
                {activeReport.score}/100
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-lg bg-[#09090B] border border-white/[0.08] p-4 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">MX Routing</span>
                  <span className={activeReport.mx.valid ? 'text-emerald-400 font-mono' : 'text-red-400 font-mono'}>
                    {activeReport.mx.valid ? 'PASS' : 'MISSING'}
                  </span>
                </div>
                <div className="font-mono text-[11px] text-zinc-500 truncate">
                  {activeReport.mx.records[0] || 'No MX records'}
                </div>
              </div>

              <div className="rounded-lg bg-[#09090B] border border-white/[0.08] p-4 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">SPF Record</span>
                  <span className={activeReport.spf.valid ? 'text-emerald-400 font-mono' : 'text-red-400 font-mono'}>
                    {activeReport.spf.valid ? 'PASS' : 'MISSING'}
                  </span>
                </div>
                <div className="font-mono text-[11px] text-zinc-500 truncate">
                  {activeReport.spf.record || 'No v=spf1 TXT record'}
                </div>
              </div>

              <div className="rounded-lg bg-[#09090B] border border-white/[0.08] p-4 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">DKIM Signing</span>
                  <span className={activeReport.dkim.valid ? 'text-emerald-400 font-mono' : 'text-amber-400 font-mono'}>
                    {activeReport.dkim.valid ? 'PASS' : 'UNVERIFIED'}
                  </span>
                </div>
                <div className="font-mono text-[11px] text-zinc-500 truncate">
                  {activeReport.dkim.selectorFound
                    ? `Selector: ${activeReport.dkim.selectorFound}`
                    : 'No standard selector'}
                </div>
              </div>

              <div className="rounded-lg bg-[#09090B] border border-white/[0.08] p-4 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">DMARC Policy</span>
                  <span className={activeReport.dmarc.valid ? 'text-emerald-400 font-mono' : 'text-red-400 font-mono'}>
                    {activeReport.dmarc.valid ? `p=${activeReport.dmarc.policy || 'none'}` : 'MISSING'}
                  </span>
                </div>
                <div className="font-mono text-[11px] text-zinc-500 truncate">
                  {activeReport.dmarc.record || 'No _dmarc TXT record'}
                </div>
              </div>
            </div>

            <div className="rounded-lg bg-[#09090B] border border-white/[0.08] p-4 space-y-2">
              <div className="text-xs font-medium text-zinc-300">Diagnostic Recommendations</div>
              <ul className="space-y-1.5 text-xs text-zinc-400">
                {activeReport.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <div className="py-6 text-xs text-zinc-500 border-t border-white/[0.08]">
            Enter any sender domain (or click Check DNS on a connected slot) to inspect live MX, SPF, DKIM, and DMARC records.
          </div>
        )}
      </div>
    </div>
  );
};
