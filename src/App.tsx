import React, { useCallback, useEffect, useRef, useState } from 'react';
import type {
  DeliverabilityAlert,
  DeliverabilityReport,
  EmailSequence,
  ExtensionOutreachJob,
  FreelancerProfile,
  GmailAccountSlot,
  Lead,
  PendingSendConfirmation,
  TrackedEmail,
  WorkspaceTab,
} from './types';
import {
  classifySendFailure,
  clearAllSlotTokens,
  clearSlotAccessToken,
  connectGmailSlot,
  connectSmtpSlot,
  GmailSendError,
  initAuthListener,
  sendTrackedGmailMessage,
  syncSlotRepliesAndBounces,
} from './lib/firebaseAuth';
import { downloadChromeExtensionZip } from './lib/extensionBuilder';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { OverviewView } from './components/OverviewView';
import { LeadScraperView } from './components/LeadScraperView';
import { SequencesView } from './components/SequencesView';
import { CampaignsView } from './components/CampaignsView';
import { AccountsView } from './components/AccountsView';
import { ExtensionView } from './components/ExtensionView';
import { EmailGuideView } from './components/EmailGuideView';
import { ConfirmSendModal } from './components/ConfirmSendModal';

const INITIAL_SLOTS: GmailAccountSlot[] = [
  {
    slotIndex: 0,
    email: null,
    displayName: null,
    photoURL: null,
    connected: false,
    needsReconnect: false,
    dailyLimit: 2000,
    sentToday: 0,
    warmupEnabled: true,
    accountType: 'workspace',
    paused: false,
    spamAlertsCount: 0,
    bounceCount: 0,
    healthStatus: 'healthy',
  },
  {
    slotIndex: 1,
    email: null,
    displayName: null,
    photoURL: null,
    connected: false,
    needsReconnect: false,
    dailyLimit: 2000,
    sentToday: 0,
    warmupEnabled: true,
    accountType: 'workspace',
    paused: false,
    spamAlertsCount: 0,
    bounceCount: 0,
    healthStatus: 'healthy',
  },
  {
    slotIndex: 2,
    email: null,
    displayName: null,
    photoURL: null,
    connected: false,
    needsReconnect: false,
    dailyLimit: 2000,
    sentToday: 0,
    warmupEnabled: true,
    accountType: 'workspace',
    paused: false,
    spamAlertsCount: 0,
    bounceCount: 0,
    healthStatus: 'healthy',
  },
];

const DEFAULT_SEQUENCE: EmailSequence = {
  id: 'seq_default',
  name: 'High-Intent Executive Brief',
  offerContext: 'Automated high-deliverability outbound pipeline & AI cold email infrastructure',
  targetPersona: 'Founders, VPs of Growth & Revenue Ops',
  updatedAt: new Date().toISOString(),
  steps: [
    {
      id: 'step_1',
      stepNumber: 1,
      delayHours: 0,
      condition: 'always',
      subject: '{{company}} outbound pipeline',
      subjectVariantB: 'quick question, {{firstName}}',
      body: `Hi {{firstName}},\n\n{{icebreaker}}\n\nTeams scaling past 1,500+ outbound touches/day usually hit a wall with {{painPoint}}.\n\nWe built a lightweight multi-inbox rotation + AI sequence engine that keeps inbox placement above 96% without manual follow-ups.\n\nOpen to seeing a 2-minute breakdown for {{company}}?`,
    },
    {
      id: 'step_2',
      stepNumber: 2,
      delayHours: 48,
      condition: 'if_unopened',
      subject: 'Re: {{company}} outbound pipeline',
      subjectVariantB: 'bumping this up, {{firstName}}',
      body: `Hi {{firstName}},\n\nSharing a quick follow-up in case my earlier note buried itself.\n\nWould it help if I sent over the 3-step sequence template we use to double reply rates on cold domains?`,
    },
    {
      id: 'step_3',
      stepNumber: 3,
      delayHours: 96,
      condition: 'if_no_reply',
      subject: 'closing the loop — {{company}}',
      subjectVariantB: 'timing off?',
      body: `Hi {{firstName}},\n\nLooks like outbound infrastructure isn't a top priority for {{company}} right now—I'll close the loop here.\n\nHappy to reconnect whenever you're scaling outreach volume.`,
    },
  ],
};

function interpolateTemplate(template: string, lead: Partial<Lead>): string {
  return template
    .replace(/\{\{firstName\}\}/g, lead.firstName || 'there')
    .replace(/\{\{lastName\}\}/g, lead.lastName || '')
    .replace(/\{\{company\}\}/g, lead.company || 'your team')
    .replace(/\{\{icebreaker\}\}/g, lead.icebreaker || 'Following your recent growth.')
    .replace(/\{\{painPoint\}\}/g, lead.painPoint || 'manual outbound bottlenecks');
}

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');
  const [slots, setSlots] = useState<GmailAccountSlot[]>(INITIAL_SLOTS);
  const [activeSlotIndex, setActiveSlotIndex] = useState<0 | 1 | 2>(0);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [sequence, setSequence] = useState<EmailSequence>(DEFAULT_SEQUENCE);
  const [freelancerProfile, setFreelancerProfile] = useState<FreelancerProfile>({
    specialty: 'Web Design & Development',
    serviceOffer: 'High-converting website redesigns & mobile speed optimization',
    portfolioUrl: '',
    senderName: '',
    bookingUrl: '',
    caseStudyNotes: '',
  });
  const [pendingExtensionJobs, setPendingExtensionJobs] = useState<ExtensionOutreachJob[]>([]);
  const [trackedEmails, setTrackedEmails] = useState<TrackedEmail[]>([]);
  const [alerts, setAlerts] = useState<DeliverabilityAlert[]>([]);
  const [autoPauseOnSpam, setAutoPauseOnSpam] = useState(true);
  const [batchStatus, setBatchStatus] = useState<'idle' | 'sending' | 'paused'>('idle');
  const [batchProgressLabel, setBatchProgressLabel] = useState<string | null>(null);
  const [desktopNotifyEnabled, setDesktopNotifyEnabled] = useState(false);
  const [deliverabilityReports, setDeliverabilityReports] = useState<
    Record<string, DeliverabilityReport>
  >({});
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingSendConfirmation | null>(
    null
  );
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const batchPauseRef = useRef(false);
  const seenGoogleSignalsRef = useRef<Set<string>>(new Set());

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 5500);
  }, []);

  const notifyDesktop = useCallback(
    (title: string, body: string) => {
      if (
        desktopNotifyEnabled &&
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'granted'
      ) {
        try {
          new Notification(title, { body });
        } catch {
          // Ignore notification restrictions inside iframes
        }
      }
    },
    [desktopNotifyEnabled]
  );

  const handleToggleDesktopNotify = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      showToast('Browser notifications are unavailable in this environment; in-app alerts remain active.');
      return;
    }
    if (desktopNotifyEnabled) {
      setDesktopNotifyEnabled(false);
      showToast('Browser desktop notifications disabled.');
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      setDesktopNotifyEnabled(true);
      showToast('Desktop alerts enabled for Spam & Auto-Pause events.');
    } else {
      showToast('Browser notification permission denied; in-app guardrail banners remain active.');
    }
  };

  const fetchLeads = useCallback(async () => {
    try {
      const res = await fetch('/api/leads');
      if (res.ok) {
        const data = (await res.json()) as { leads: Lead[] };
        setLeads(data.leads ?? []);
      }
    } catch {
      // Ignore transient error on initial load
    }
  }, []);

  const fetchTracking = useCallback(async () => {
    try {
      const res = await fetch('/api/tracking');
      if (res.ok) {
        const data = (await res.json()) as { trackedEmails: TrackedEmail[] };
        setTrackedEmails(data.trackedEmails ?? []);
      }
    } catch {
      // Ignore transient error
    }
  }, []);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/alerts');
      if (res.ok) {
        const data = (await res.json()) as { alerts: DeliverabilityAlert[] };
        setAlerts(data.alerts ?? []);
      }
    } catch {
      // Ignore transient error
    }
  }, []);

  const fetchPendingExtensionJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/extension/outreach-queue');
      if (res.ok) {
        const data = (await res.json()) as { pendingJobs: ExtensionOutreachJob[] };
        setPendingExtensionJobs(data.pendingJobs ?? []);
      }
    } catch {
      // Ignore transient error
    }
  }, []);

  const handleAcknowledgeAlert = useCallback(async (id?: string) => {
    setAlerts((prev) => prev.map((a) => (!id || a.id === id ? { ...a, acknowledged: true } : a)));
    try {
      await fetch('/api/alerts/acknowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
    } catch {
      // Ignore persistence hiccup
    }
  }, []);

  const raiseGuardrailAlert = useCallback(
    async (params: {
      severity: DeliverabilityAlert['severity'];
      type: DeliverabilityAlert['type'];
      slotIndex?: 0 | 1 | 2;
      senderEmail?: string;
      recipientEmail?: string;
      title: string;
      message: string;
      actionTaken: string;
      pauseReason?: string;
      incrementSpam?: boolean;
      incrementBounce?: boolean;
    }) => {
      if (params.slotIndex !== undefined) {
        const idx = params.slotIndex;
        const shouldPauseSlot = autoPauseOnSpam || params.type === 'daily_limit' || params.type === 'campaign_paused';
        setSlots((prev) =>
          prev.map((s) =>
            s.slotIndex === idx
              ? {
                  ...s,
                  paused: shouldPauseSlot ? true : s.paused,
                  pauseReason: shouldPauseSlot ? params.pauseReason || params.message : s.pauseReason,
                  pausedAt: shouldPauseSlot ? new Date().toISOString() : s.pausedAt,
                  spamAlertsCount: (s.spamAlertsCount ?? 0) + (params.incrementSpam ? 1 : 0),
                  bounceCount: (s.bounceCount ?? 0) + (params.incrementBounce ? 1 : 0),
                  healthStatus: shouldPauseSlot ? 'paused' : 'warning',
                }
              : s
          )
        );
      }

      const newAlert: DeliverabilityAlert = {
        id: `alrt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        severity: params.severity,
        type: params.type,
        slotIndex: params.slotIndex,
        senderEmail: params.senderEmail,
        recipientEmail: params.recipientEmail,
        title: params.title,
        message: params.message,
        actionTaken: params.actionTaken,
        createdAt: new Date().toISOString(),
        acknowledged: false,
      };

      setAlerts((prev) => [newAlert, ...prev].slice(0, 50));
      showToast(`${params.title}: ${params.actionTaken}`);
      notifyDesktop(`KuroReach Alert: ${params.title}`, params.message);

      try {
        await fetch('/api/alerts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newAlert),
        });
      } catch {
        // Ignore persistence error
      }
    },
    [autoPauseOnSpam, notifyDesktop, showToast]
  );

  useEffect(() => {
    fetchLeads();
    fetchTracking();
    fetchAlerts();
    fetchPendingExtensionJobs();
    const unsub = initAuthListener(() => {
      setSlots((prev) =>
        prev.map((s) =>
          s.connected && s.authMethod !== 'smtp' ? { ...s, needsReconnect: true } : s
        )
      );
    });
    return () => unsub();
  }, [fetchAlerts, fetchLeads, fetchPendingExtensionJobs, fetchTracking]);

  useEffect(() => {
    const timer = setInterval(() => {
      void fetchPendingExtensionJobs();
    }, 15000);
    return () => clearInterval(timer);
  }, [fetchPendingExtensionJobs]);

  useEffect(() => {
    if (activeTab === 'campaigns' || activeTab === 'extension') {
      void fetchPendingExtensionJobs();
      void fetchLeads();
    }
  }, [activeTab, fetchLeads, fetchPendingExtensionJobs]);

  const handleConnectSlot = async (slotIndex: 0 | 1 | 2) => {
    const profile = await connectGmailSlot(slotIndex);
    const isFreeGmail = profile.email.toLowerCase().endsWith('@gmail.com');

    setSlots((prev) =>
      prev.map((s) =>
        s.slotIndex === slotIndex
          ? {
              ...s,
              email: profile.email,
              displayName: profile.displayName,
              photoURL: profile.photoURL,
              connected: true,
              needsReconnect: false,
              paused: false,
              pauseReason: undefined,
              healthStatus: 'healthy',
              authMethod: 'oauth',
              accountType: isFreeGmail ? 'gmail' : 'workspace',
              dailyLimit: isFreeGmail ? 500 : 2000,
              lastSyncedAt: new Date().toISOString(),
            }
          : s
      )
    );
    setActiveSlotIndex(slotIndex);
    showToast(`Connected ${profile.email} to Mailbox Slot 0${slotIndex + 1} with Gmail Spam Guard active.`);
  };

  const handleConnectSmtpSlot = async (
    slotIndex: 0 | 1 | 2,
    params: { email: string; displayName?: string; appPassword: string; host?: string; port?: number }
  ) => {
    const profile = await connectSmtpSlot(slotIndex, params);
    const isFreeGmail = profile.email.toLowerCase().endsWith('@gmail.com');

    setSlots((prev) =>
      prev.map((s) =>
        s.slotIndex === slotIndex
          ? {
              ...s,
              email: profile.email,
              displayName: profile.displayName,
              photoURL: null,
              connected: true,
              needsReconnect: false,
              paused: false,
              pauseReason: undefined,
              healthStatus: 'healthy',
              authMethod: 'smtp',
              accountType: isFreeGmail ? 'gmail' : 'workspace',
              dailyLimit: isFreeGmail ? 500 : 2000,
              lastSyncedAt: new Date().toISOString(),
            }
          : s
      )
    );
    setActiveSlotIndex(slotIndex);
    showToast(`Verified & connected ${profile.email} via App Password on Slot 0${slotIndex + 1}`);
  };

  const handleDisconnectSlot = (slotIndex: 0 | 1 | 2) => {
    clearSlotAccessToken(slotIndex);
    const updated = slots.map((s) =>
      s.slotIndex === slotIndex ? { ...INITIAL_SLOTS[slotIndex] } : s
    );
    setSlots(updated);
    if (updated.every((s) => !s.connected)) {
      void clearAllSlotTokens();
    }
    showToast(`Disconnected Mailbox Slot 0${slotIndex + 1}`);
  };

  const handleUpdateSlotConfig = (
    slotIndex: 0 | 1 | 2,
    patch: Partial<GmailAccountSlot>
  ) => {
    setSlots((prev) =>
      prev.map((s) => (s.slotIndex === slotIndex ? { ...s, ...patch } : s))
    );
  };

  const handleToggleSlotPause = (slotIndex: 0 | 1 | 2, paused: boolean) => {
    setSlots((prev) =>
      prev.map((s) =>
        s.slotIndex === slotIndex
          ? {
              ...s,
              paused,
              pauseReason: paused ? 'Manually paused by user' : undefined,
              pausedAt: paused ? new Date().toISOString() : undefined,
              healthStatus: paused ? 'paused' : 'healthy',
            }
          : s
      )
    );
    showToast(
      paused
        ? `Paused Mailbox Slot 0${slotIndex + 1}`
        : `Resumed Mailbox Slot 0${slotIndex + 1} for outbound dispatch`
    );
  };

  const handleLeadsAdded = (newLeads: Lead[]) => {
    const leadKey = (l: Lead) =>
      l.email && l.email.includes('@')
        ? l.email.toLowerCase()
        : `${l.company.toLowerCase()}::${(l.phone || l.website || l.id).toLowerCase()}`;
    setLeads((prev) => {
      const existing = new Set(prev.map(leadKey));
      const unique = newLeads.filter((l) => !existing.has(leadKey(l)));
      return [...unique, ...prev];
    });
    showToast(`Added ${newLeads.length} leads to pipeline.`);
  };

  const handleUpdateLeadStatus = async (id: string, status: Lead['status']) => {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
    await fetch(`/api/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
  };

  const handleDeleteLead = async (id: string) => {
    setLeads((prev) => prev.filter((l) => l.id !== id));
    await fetch(`/api/leads/${id}`, { method: 'DELETE' });
  };

  const handleExecuteSingleSend = async (params: {
    toEmail: string;
    toName: string;
    company: string;
    subject: string;
    body: string;
  }) => {
    const readySlots = slots.filter(
      (s) => s.connected && !s.needsReconnect && !s.paused && Boolean(s.email)
    );
    const preferred = slots[activeSlotIndex];
    const chosen =
      preferred.connected && !preferred.needsReconnect && !preferred.paused
        ? preferred
        : readySlots[0];

    if (!chosen || !chosen.email) {
      throw new Error('No active, unpaused Gmail slot available.');
    }

    if (chosen.sentToday >= chosen.dailyLimit) {
      await raiseGuardrailAlert({
        severity: 'critical',
        type: 'daily_limit',
        slotIndex: chosen.slotIndex,
        senderEmail: chosen.email,
        title: 'Daily Sending Ceiling Reached',
        message: `${chosen.email} reached ${chosen.sentToday}/${chosen.dailyLimit} sends today.`,
        actionTaken: 'Mailbox auto-paused to protect sender reputation',
      });
      throw new Error(`${chosen.email} reached its daily send limit and was paused.`);
    }

    const trackingId = `trk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

    let sent: { id: string; threadId: string };
    try {
      sent = await sendTrackedGmailMessage({
        slotIndex: chosen.slotIndex,
        fromEmail: chosen.email,
        fromName: chosen.displayName || chosen.email,
        toEmail: params.toEmail,
        subject: params.subject,
        bodyText: params.body,
        trackingId,
        trackingOrigin: window.location.origin,
      });
    } catch (err: unknown) {
      const classification =
        err instanceof GmailSendError
          ? err.classification
          : classifySendFailure(err instanceof Error ? err.message : 'Send failed');

      if (classification.fatalSlotIssue) {
        await raiseGuardrailAlert({
          severity: 'critical',
          type: classification.alertType,
          slotIndex: chosen.slotIndex,
          senderEmail: chosen.email,
          recipientEmail: params.toEmail,
          title:
            classification.alertType === 'spam_detected'
              ? 'Spam Rejection Detected'
              : classification.alertType === 'daily_limit'
              ? 'Google Quota Reached'
              : 'Sending Blocked by Google',
          message: classification.pauseReason,
          actionTaken: `Paused ${chosen.email} immediately`,
          pauseReason: classification.pauseReason,
          incrementSpam: classification.alertType === 'spam_detected',
        });
      }
      throw err;
    }

    const trackedRecord: TrackedEmail = {
      id: `msg_${trackingId}`,
      trackingId,
      gmailMessageId: sent.id,
      gmailThreadId: sent.threadId,
      senderEmail: chosen.email,
      senderSlot: chosen.slotIndex,
      recipientEmail: params.toEmail,
      recipientName: params.toName,
      company: params.company,
      subject: params.subject,
      bodyPreview: params.body.slice(0, 120),
      sequenceName: 'Direct 1:1',
      stepNumber: 1,
      variant: 'A',
      status: 'sent',
      openCount: 0,
      clickCount: 0,
      sentAt: new Date().toISOString(),
    };

    const trackRes = await fetch('/api/tracking/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(trackedRecord),
    });
    if (trackRes.ok) {
      const data = (await trackRes.json()) as { trackedEmails: TrackedEmail[] };
      setTrackedEmails(data.trackedEmails);
    }

    handleUpdateSlotConfig(chosen.slotIndex, { sentToday: chosen.sentToday + 1 });
    setPendingConfirmation(null);
    showToast(`Dispatched tracked email to ${params.toEmail} via ${chosen.email}`);
  };

  const handleExecuteBatchDispatch = async (params: {
    recipients: Lead[];
    rotationMode: 'active' | 'round-robin';
    delayMs: number;
  }) => {
    const workingSlots = slots.map((s) => ({ ...s }));
    const getHealthySlots = () =>
      workingSlots.filter(
        (s) =>
          s.connected &&
          !s.needsReconnect &&
          !s.paused &&
          Boolean(s.email) &&
          s.sentToday < s.dailyLimit
      );

    if (getHealthySlots().length === 0) {
      throw new Error('Connect or resume at least one healthy Gmail slot first.');
    }

    batchPauseRef.current = false;
    setBatchStatus('sending');
    setBatchProgressLabel(`Starting batch of ${params.recipients.length} leads...`);
    setPendingConfirmation(null);

    const step1 = sequence.steps[0];
    let sentCount = 0;
    let pausedByGuardrail = false;

    for (let i = 0; i < params.recipients.length; i++) {
      if (batchPauseRef.current) {
        setBatchStatus('paused');
        setBatchProgressLabel(
          `Paused manually after ${sentCount} sends. ${params.recipients.length - i} leads remain queued.`
        );
        showToast(`Campaign paused cleanly — ${sentCount} sent, ${params.recipients.length - i} still queued.`);
        await fetchTracking();
        return;
      }

      const healthyPool = getHealthySlots();
      if (healthyPool.length === 0) {
        pausedByGuardrail = true;
        break;
      }

      const preferred = workingSlots[activeSlotIndex];
      const chosen =
        params.rotationMode === 'round-robin'
          ? healthyPool[i % healthyPool.length]
          : preferred.connected && !preferred.needsReconnect && !preferred.paused && preferred.sentToday < preferred.dailyLimit
          ? preferred
          : healthyPool[0];

      if (!chosen || !chosen.email) {
        pausedByGuardrail = true;
        break;
      }

      const lead = params.recipients[i];
      const variant: 'A' | 'B' = i % 2 === 0 ? 'A' : 'B';
      const rawSubject = variant === 'A' ? step1.subject : step1.subjectVariantB || step1.subject;
      const finalSubject = interpolateTemplate(rawSubject, lead);
      const finalBody = interpolateTemplate(step1.body, lead);
      const trackingId = `trk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

      setBatchProgressLabel(
        `Sending ${i + 1}/${params.recipients.length} via ${chosen.email} (${lead.email})...`
      );

      try {
        const sent = await sendTrackedGmailMessage({
          slotIndex: chosen.slotIndex,
          fromEmail: chosen.email,
          fromName: chosen.displayName || chosen.email,
          toEmail: lead.email,
          subject: finalSubject,
          bodyText: finalBody,
          trackingId,
          trackingOrigin: window.location.origin,
        });

        const record: TrackedEmail = {
          id: `msg_${trackingId}`,
          trackingId,
          gmailMessageId: sent.id,
          gmailThreadId: sent.threadId,
          senderEmail: chosen.email,
          senderSlot: chosen.slotIndex,
          recipientEmail: lead.email,
          recipientName: lead.fullName,
          company: lead.company,
          subject: finalSubject,
          bodyPreview: finalBody.slice(0, 120),
          sequenceName: sequence.name,
          stepNumber: 1,
          variant,
          status: 'sent',
          openCount: 0,
          clickCount: 0,
          sentAt: new Date().toISOString(),
        };

        await fetch('/api/tracking/record', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(record),
        });
        await handleUpdateLeadStatus(lead.id, 'contacted');
        sentCount++;
        chosen.sentToday += 1;

        setSlots((prev) =>
          prev.map((s) =>
            s.slotIndex === chosen.slotIndex ? { ...s, sentToday: chosen.sentToday } : s
          )
        );

        // If slot just hit daily ceiling, proactively pause that slot
        if (chosen.sentToday >= chosen.dailyLimit) {
          chosen.paused = true;
          await raiseGuardrailAlert({
            severity: 'warning',
            type: 'daily_limit',
            slotIndex: chosen.slotIndex,
            senderEmail: chosen.email,
            title: 'Slot Daily Ceiling Reached',
            message: `${chosen.email} reached ${chosen.dailyLimit} sends for today.`,
            actionTaken:
              getHealthySlots().length > 0
                ? 'Paused slot & rotated remaining queue to healthy slots'
                : 'Paused batch dispatch — no healthy slots remaining',
            pauseReason: `Daily limit (${chosen.dailyLimit}) reached.`,
          });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Send failed';
        const classification =
          err instanceof GmailSendError ? err.classification : classifySendFailure(msg);

        if (classification.fatalSlotIssue) {
          if (autoPauseOnSpam || classification.alertType === 'daily_limit') {
            chosen.paused = true;
          }
          await raiseGuardrailAlert({
            severity: 'critical',
            type: classification.alertType,
            slotIndex: chosen.slotIndex,
            senderEmail: chosen.email,
            recipientEmail: lead.email,
            title:
              classification.alertType === 'spam_detected'
                ? 'Google Flagged Outbound as Spam'
                : classification.alertType === 'daily_limit'
                ? 'Google Daily Quota Reached'
                : 'Google Blocked Further Sending',
            message: classification.pauseReason,
            actionTaken:
              getHealthySlots().length > 0 && params.rotationMode === 'round-robin'
                ? `Auto-paused ${chosen.email} & rotated remaining queue`
                : `Auto-paused ${chosen.email} & halted campaign dispatch`,
            pauseReason: classification.pauseReason,
            incrementSpam: classification.alertType === 'spam_detected',
          });

          if (getHealthySlots().length === 0 || params.rotationMode === 'active') {
            pausedByGuardrail = true;
            break;
          }
        } else {
          console.error(`Send failed for ${lead.email}:`, err);
        }
      }

      if (i < params.recipients.length - 1 && params.delayMs > 0) {
        await new Promise((r) => setTimeout(r, Math.min(params.delayMs, 3000)));
      }
    }

    await fetchTracking();

    if (pausedByGuardrail) {
      setBatchStatus('paused');
      const remaining = Math.max(0, params.recipients.length - sentCount);
      setBatchProgressLabel(
        `Campaign auto-paused by Google Guardrail after ${sentCount} sends (${remaining} leads kept queued).`
      );
      await raiseGuardrailAlert({
        severity: 'critical',
        type: 'campaign_paused',
        title: 'Campaign Auto-Paused',
        message: `All eligible mailboxes hit Google send limits or spam blocks after ${sentCount} sends. ${remaining} leads remain safely queued.`,
        actionTaken: 'Review Alerts & DNS in Mailboxes before resuming',
      });
    } else {
      setBatchStatus('idle');
      setBatchProgressLabel(null);
      showToast(`Batch dispatch complete: ${sentCount} tracked emails sent via Gmail.`);
    }
  };

  const handleQuickSendLead = (lead: Lead) => {
    if (!lead.email || !lead.email.includes('@')) {
      showToast(
        `No email address on file for ${lead.company}. ${
          lead.phone ? `Call ${lead.phone}` : 'Visit their website to pull a contact email.'
        }`
      );
      return;
    }

    const readySlots = slots.filter(
      (s) => s.connected && !s.needsReconnect && !s.paused && Boolean(s.email)
    );
    if (readySlots.length === 0) {
      setActiveTab('accounts');
      showToast('Connect or resume an active Gmail account in Mailboxes & DNS first.');
      return;
    }

    const preferred = slots[activeSlotIndex];
    const chosen =
      preferred.connected && !preferred.needsReconnect && !preferred.paused
        ? preferred
        : readySlots[0];
    const step1 = sequence.steps[0];
    const subject = interpolateTemplate(step1.subject, lead);
    const body = interpolateTemplate(step1.body, lead);

    setPendingConfirmation({
      mode: 'single',
      senderEmails: [chosen.email as string],
      recipients: [{ email: lead.email, name: lead.fullName, company: lead.company }],
      subject,
      sequenceName: sequence.name,
      estimatedDurationLabel: 'Immediate',
      onConfirm: async () => {
        await handleExecuteSingleSend({
          toEmail: lead.email,
          toName: lead.fullName,
          company: lead.company,
          subject,
          body,
        });
        await handleUpdateLeadStatus(lead.id, 'contacted');
      },
    });
  };

  const handleSyncReplies = useCallback(
    async (silent = false) => {
      const oauthSlots = slots.filter(
        (s) => s.connected && !s.needsReconnect && s.authMethod !== 'smtp' && Boolean(s.email)
      );
      if (oauthSlots.length === 0) {
        if (!silent) {
          showToast(
            'Checked local tracking. Connect via Google OAuth to enable live Gmail Spam folder & thread scanning.'
          );
        }
        return;
      }

      const allUpdates: Array<{
        trackingId: string;
        status: TrackedEmail['status'];
        repliedAt?: string;
        bounceReason?: string;
      }> = [];

      for (const slot of oauthSlots) {
        const res = await syncSlotRepliesAndBounces(
          slot.slotIndex,
          slot.email as string,
          trackedEmails
        );
        allUpdates.push(...res.updates);

        if (res.authInvalid) {
          setSlots((prev) =>
            prev.map((s) =>
              s.slotIndex === slot.slotIndex ? { ...s, needsReconnect: true, paused: true } : s
            )
          );
          await raiseGuardrailAlert({
            severity: 'critical',
            type: 'send_blocked',
            slotIndex: slot.slotIndex,
            senderEmail: slot.email ?? undefined,
            title: 'Google Token Expired',
            message: `Google rejected read credentials for ${slot.email}.`,
            actionTaken: 'Paused slot until reconnected',
            pauseReason: 'Google session expired — reconnect mailbox',
          });
        }

        if (res.limitReached) {
          const signalKey = `limit_${slot.slotIndex}_${new Date().toISOString().slice(0, 13)}`;
          if (!seenGoogleSignalsRef.current.has(signalKey)) {
            seenGoogleSignalsRef.current.add(signalKey);
            await raiseGuardrailAlert({
              severity: 'critical',
              type: 'daily_limit',
              slotIndex: slot.slotIndex,
              senderEmail: slot.email ?? undefined,
              title: 'Google Daily Sending Quota Notice',
              message: `Gmail reported a daily sending limit notification on ${slot.email}.`,
              actionTaken: 'Auto-paused slot until quota resets',
              pauseReason: 'Google reported daily sending quota exceeded',
            });
          }
        }

        for (const sig of res.spamSignals) {
          const signalKey = `spam_${slot.slotIndex}_${sig.messageId}`;
          if (seenGoogleSignalsRef.current.has(signalKey)) continue;
          seenGoogleSignalsRef.current.add(signalKey);

          await raiseGuardrailAlert({
            severity: sig.severity,
            type: 'spam_detected',
            slotIndex: slot.slotIndex,
            senderEmail: slot.email ?? undefined,
            recipientEmail: sig.recipientEmail,
            title: 'Mail Flagged in Spam / Rejected',
            message: `${sig.subject}: ${sig.reason}`,
            actionTaken: autoPauseOnSpam
              ? `Auto-paused ${slot.email} & paused active dispatches`
              : `Logged spam warning for ${slot.email}`,
            pauseReason: `Spam flag detected: ${sig.reason}`,
            incrementSpam: true,
          });
          if (autoPauseOnSpam && batchStatus === 'sending') {
            batchPauseRef.current = true;
          }
        }
      }

      if (allUpdates.length > 0) {
        await fetch('/api/tracking/update-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ updates: allUpdates }),
        });
        await fetchTracking();
        if (!silent) {
          const spamHits = allUpdates.filter((u) => u.status === 'spam').length;
          showToast(
            spamHits > 0
              ? `Synced Gmail: ${spamHits} spam flag(s) detected and mailbox auto-paused!`
              : `Synced ${allUpdates.length} reply/bounce updates from Gmail.`
          );
        }
      } else if (!silent) {
        showToast('Checked Gmail Inbox, Threads & Spam — everything looks clean.');
      }
    },
    [autoPauseOnSpam, batchStatus, fetchTracking, raiseGuardrailAlert, showToast, slots, trackedEmails]
  );

  // Automatic Google Spam & Health Watchdog every 45s for OAuth-connected mailboxes
  useEffect(() => {
    const hasOauth = slots.some((s) => s.connected && !s.needsReconnect && s.authMethod !== 'smtp');
    if (!hasOauth) return;
    const timer = setInterval(() => {
      void handleSyncReplies(true);
    }, 45000);
    return () => clearInterval(timer);
  }, [handleSyncReplies, slots]);

  const handleLoadExtensionJob = async (job: ExtensionOutreachJob) => {
    setSequence((prev) => ({
      ...prev,
      id: `seq_${job.id}`,
      name: job.sequenceName || 'Freelancer Extension Campaign',
      offerContext: job.freelancerService || prev.offerContext,
      targetPersona: 'Scraped Prospective Clients',
      updatedAt: new Date().toISOString(),
      steps: [
        {
          id: 'step_1',
          stepNumber: 1,
          delayHours: 0,
          condition: 'always',
          subject: job.subject,
          subjectVariantB: job.subjectVariantB || job.subject,
          body: job.body,
        },
        {
          id: 'step_2',
          stepNumber: 2,
          delayHours: 48,
          condition: 'if_unopened',
          subject: `Re: ${job.subject}`,
          subjectVariantB: 'quick follow up, {{firstName}}',
          body:
            job.followUp1 ||
            prev.steps[1]?.body ||
            'Hi {{firstName}},\n\nBumping this up briefly — happy to share a quick breakdown for {{company}} anytime.',
        },
        {
          id: 'step_3',
          stepNumber: 3,
          delayHours: 96,
          condition: 'if_no_reply',
          subject: `closing the loop — {{company}}`,
          subjectVariantB: 'timing off?',
          body:
            job.followUp2 ||
            prev.steps[2]?.body ||
            "Hi {{firstName}},\n\nAssume timing is off for {{company}} right now, so I'll close the loop here.",
        },
      ],
    }));

    if (job.slotIndex === 0 || job.slotIndex === 1 || job.slotIndex === 2) {
      const targetSlot = slots[job.slotIndex];
      if (targetSlot?.connected && !targetSlot.paused && !targetSlot.needsReconnect) {
        setActiveSlotIndex(job.slotIndex);
      }
    }

    await fetchLeads();
    try {
      await fetch('/api/extension/outreach-queue/consume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id }),
      });
    } catch {
      // Ignore non-fatal consume failure
    }
    setPendingExtensionJobs((prev) => prev.filter((j) => j.id !== job.id));
    setActiveTab('campaigns');
    showToast(
      `Loaded ${job.recipients.length} client email(s) and "${job.sequenceName}" pitch into Dispatch Queue.`
    );
  };

  const handleDownloadExtension = async () => {
    const connectedEmails = slots.filter((s) => s.email).map((s) => s.email as string);
    await downloadChromeExtensionZip(window.location.origin, connectedEmails, freelancerProfile);
    showToast('Downloaded kuroreach-freelancer-extension-mv3.zip');
  };

  const unreadAlerts = alerts.filter((a) => !a.acknowledged);

  return (
    <div className="min-h-screen bg-[#09090B] text-[#F4F4F5] flex">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        slots={slots}
        leadCount={leads.length}
        sentCount={trackedEmails.length}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          activeTab={activeTab}
          slots={slots}
          activeSlotIndex={activeSlotIndex}
          unreadAlertCount={unreadAlerts.length}
          onSwitchSlot={setActiveSlotIndex}
          onConnectSlotRedirect={() => setActiveTab('accounts')}
          onReviewAlerts={() => setActiveTab('accounts')}
          onDownloadExtension={handleDownloadExtension}
        />

        <main className="flex-1 p-6 lg:p-8 max-w-[1360px] w-full mx-auto space-y-6">
          {unreadAlerts.length > 0 && activeTab !== 'accounts' && activeTab !== 'campaigns' && (
            <div className="rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-red-100">
              <div className="min-w-0">
                <span className="font-semibold text-red-200">{unreadAlerts[0].title}:</span>{' '}
                <span>{unreadAlerts[0].message}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveTab('accounts')}
                  className="px-3 py-1 rounded-md bg-white text-[#09090B] font-semibold"
                >
                  Inspect Mailboxes
                </button>
                <button
                  type="button"
                  onClick={() => handleAcknowledgeAlert(unreadAlerts[0].id)}
                  className="px-2.5 py-1 rounded-md border border-red-400/30 text-red-200 hover:bg-red-500/20"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {activeTab === 'overview' && (
            <OverviewView
              slots={slots}
              leads={leads}
              trackedEmails={trackedEmails}
              deliverabilityReports={deliverabilityReports}
              onNavigate={setActiveTab}
            />
          )}

          {activeTab === 'scraper' && (
            <LeadScraperView
              leads={leads}
              onLeadsAdded={handleLeadsAdded}
              onUpdateLeadStatus={handleUpdateLeadStatus}
              onDeleteLead={handleDeleteLead}
              onQuickSendLead={handleQuickSendLead}
            />
          )}

          {activeTab === 'sequences' && (
            <SequencesView
              sequence={sequence}
              onUpdateSequence={setSequence}
              leads={leads}
              trackedEmails={trackedEmails}
              deliverabilityReports={deliverabilityReports}
              onNavigateToCampaigns={() => setActiveTab('campaigns')}
            />
          )}

          {activeTab === 'campaigns' && (
            <CampaignsView
              slots={slots}
              activeSlotIndex={activeSlotIndex}
              leads={leads}
              sequence={sequence}
              trackedEmails={trackedEmails}
              alerts={alerts}
              autoPauseOnSpam={autoPauseOnSpam}
              onToggleAutoPause={setAutoPauseOnSpam}
              batchStatus={batchStatus}
              batchProgressLabel={batchProgressLabel}
              onPauseBatch={() => {
                batchPauseRef.current = true;
              }}
              desktopNotifyEnabled={desktopNotifyEnabled}
              onToggleDesktopNotify={handleToggleDesktopNotify}
              onAcknowledgeAlert={handleAcknowledgeAlert}
              onRequestConfirmation={setPendingConfirmation}
              onExecuteBatchDispatch={handleExecuteBatchDispatch}
              onExecuteSingleSend={handleExecuteSingleSend}
              onSyncReplies={() => handleSyncReplies(false)}
              onRefreshTracking={fetchTracking}
              onGoToAccounts={() => setActiveTab('accounts')}
              pendingExtensionJobs={pendingExtensionJobs}
              onLoadExtensionJob={handleLoadExtensionJob}
            />
          )}

          {activeTab === 'accounts' && (
            <AccountsView
              slots={slots}
              activeSlotIndex={activeSlotIndex}
              onConnectSlot={handleConnectSlot}
              onConnectSmtpSlot={handleConnectSmtpSlot}
              onDisconnectSlot={handleDisconnectSlot}
              onSwitchSlot={setActiveSlotIndex}
              onUpdateSlotConfig={handleUpdateSlotConfig}
              onToggleSlotPause={handleToggleSlotPause}
              onRunGoogleHealthScan={() => handleSyncReplies(false)}
              alerts={alerts}
              onAcknowledgeAlert={handleAcknowledgeAlert}
              deliverabilityReports={deliverabilityReports}
              onSaveDeliverabilityReport={(report) =>
                setDeliverabilityReports((prev) => ({
                  ...prev,
                  [report.domain]: report,
                }))
              }
            />
          )}

          {activeTab === 'extension' && (
            <ExtensionView
              slots={slots}
              freelancerProfile={freelancerProfile}
              onUpdateFreelancerProfile={setFreelancerProfile}
              pendingJobsCount={pendingExtensionJobs.length}
              onLeadsIngested={handleLeadsAdded}
              onExtensionOutreachQueued={async () => {
                await fetchLeads();
                await fetchPendingExtensionJobs();
                showToast('Queued multi-recipient freelancer outreach into Tracking & Send.');
              }}
              onGoToCampaigns={() => setActiveTab('campaigns')}
            />
          )}

          {activeTab === 'guide' && (
            <EmailGuideView
              slots={slots}
              onGoToMailboxes={() => setActiveTab('accounts')}
            />
          )}
        </main>
      </div>

      <ConfirmSendModal
        confirmation={pendingConfirmation}
        onCancel={() => setPendingConfirmation(null)}
      />

      {toastMessage && (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-40 rounded-lg bg-[#121317] border border-white/[0.16] px-4 py-2.5 text-xs text-white shadow-2xl max-w-md"
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}
