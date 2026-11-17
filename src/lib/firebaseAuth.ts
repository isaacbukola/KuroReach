import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import type { DeliverabilityAlert, TrackedEmail } from '../types';
import { safeFetchJson } from './safeFetch';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);

export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

// Strictly in-memory credential caches keyed by slot index (0, 1, 2)
// Never persisted to localStorage or sessionStorage.
const slotTokenCache = new Map<number, string>();
const slotSmtpCache = new Map<
  number,
  { email: string; displayName: string; appPassword: string; host: string; port: number }
>();
let isSigningIn = false;

export interface SendFailureClassification {
  fatalSlotIssue: boolean;
  alertType: DeliverabilityAlert['type'];
  pauseReason: string;
  isAuthError: boolean;
}

export class GmailSendError extends Error {
  classification: SendFailureClassification;

  constructor(message: string, classification: SendFailureClassification) {
    super(message);
    this.name = 'GmailSendError';
    this.classification = classification;
  }
}

export function classifySendFailure(errMsg: string, statusCode?: number): SendFailureClassification {
  const lower = errMsg.toLowerCase();

  if (
    lower.includes('5.4.5') ||
    lower.includes('dailylimitexceeded') ||
    lower.includes('daily sending quota') ||
    lower.includes('daily user sending limit') ||
    lower.includes('user sending limit exceeded')
  ) {
    return {
      fatalSlotIssue: true,
      alertType: 'daily_limit',
      pauseReason: 'Google daily sending quota reached (550 5.4.5 / dailyLimitExceeded). Mailbox auto-paused until tomorrow.',
      isAuthError: false,
    };
  }

  if (
    lower.includes('5.7.1') ||
    lower.includes('554') ||
    lower.includes('spam') ||
    lower.includes('unsolicited') ||
    lower.includes('message rejected') ||
    lower.includes('policy violation') ||
    lower.includes('message blocked')
  ) {
    return {
      fatalSlotIssue: true,
      alertType: 'spam_detected',
      pauseReason: 'Google or recipient mail server flagged/blocked message as spam. Mailbox auto-paused to protect sender reputation.',
      isAuthError: false,
    };
  }

  if (
    statusCode === 429 ||
    lower.includes('429') ||
    lower.includes('ratelimitexceeded') ||
    lower.includes('userratelimitexceeded') ||
    lower.includes('too many requests') ||
    lower.includes('421 4.7.') ||
    lower.includes('try again later')
  ) {
    return {
      fatalSlotIssue: true,
      alertType: 'send_blocked',
      pauseReason: 'Google temporarily throttled outbound rate (429 / 421). Mailbox auto-paused to prevent suspension.',
      isAuthError: false,
    };
  }

  if (
    statusCode === 401 ||
    lower.includes('invalid credentials') ||
    lower.includes('535') ||
    lower.includes('invalid_grant') ||
    lower.includes('token expired') ||
    lower.includes('unauthorized')
  ) {
    return {
      fatalSlotIssue: true,
      alertType: 'send_blocked',
      pauseReason: 'Google authentication expired or was revoked. Reconnect this mailbox to continue sending.',
      isAuthError: true,
    };
  }

  if (statusCode === 403 && (lower.includes('insufficient') || lower.includes('permission') || lower.includes('blocked'))) {
    return {
      fatalSlotIssue: true,
      alertType: 'send_blocked',
      pauseReason: 'Google blocked send permission (403). Mailbox auto-paused — verify account standing and permissions.',
      isAuthError: true,
    };
  }

  return {
    fatalSlotIssue: false,
    alertType: 'send_blocked',
    pauseReason: errMsg,
    isAuthError: false,
  };
}

export const initAuthListener = (onSignedOut: () => void) => {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (!user && !isSigningIn) {
      slotTokenCache.clear();
      onSignedOut();
    }
  });
};

export const getSlotAccessToken = (slotIndex: number): string | null => {
  return slotTokenCache.get(slotIndex) ?? null;
};

export const clearSlotAccessToken = (slotIndex: number): void => {
  slotTokenCache.delete(slotIndex);
  slotSmtpCache.delete(slotIndex);
};

export const clearAllSlotTokens = async (): Promise<void> => {
  slotTokenCache.clear();
  slotSmtpCache.clear();
  await auth.signOut();
};

export async function connectSmtpSlot(
  slotIndex: 0 | 1 | 2,
  params: {
    email: string;
    displayName?: string;
    appPassword: string;
    host?: string;
    port?: number;
  }
): Promise<{
  email: string;
  displayName: string;
}> {
  const email = params.email.trim();
  const host = (params.host || 'smtp.gmail.com').trim();
  const port = Number(params.port) || 465;

  const data = await safeFetchJson<{ ok?: boolean }>('/api/smtp/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      appPassword: params.appPassword,
      host,
      port,
    }),
  });
  if (!data.ok) {
    throw new Error('Could not verify Gmail App Password');
  }

  const displayName = params.displayName?.trim() || email.split('@')[0] || 'Sender';
  slotTokenCache.delete(slotIndex);
  slotSmtpCache.set(slotIndex, {
    email,
    displayName,
    appPassword: params.appPassword,
    host,
    port,
  });

  return { email, displayName };
}

export async function connectGmailSlot(slotIndex: 0 | 1 | 2): Promise<{
  email: string;
  displayName: string;
  photoURL: string | null;
  accessToken: string;
}> {
  const provider = new GoogleAuthProvider();
  for (const scope of GMAIL_SCOPES) {
    provider.addScope(scope);
  }
  provider.setCustomParameters({
    prompt: 'select_account',
  });

  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Google OAuth access token was not returned. Please grant Gmail permissions.');
    }

    const accessToken = credential.accessToken;
    slotSmtpCache.delete(slotIndex);
    slotTokenCache.set(slotIndex, accessToken);

    let email = result.user.email || '';
    try {
      const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (profileRes.ok) {
        const profileData = (await profileRes.json()) as { emailAddress?: string };
        if (profileData.emailAddress) {
          email = profileData.emailAddress;
        }
      }
    } catch {
      // Fallback to Firebase user email
    }

    return {
      email,
      displayName: result.user.displayName || email.split('@')[0] || 'Connected Mailbox',
      photoURL: result.user.photoURL,
      accessToken,
    };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code ?? '';
    const rawMsg = err instanceof Error ? err.message : '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      throw new Error(
        'SIGNIN_CANCELLED_OR_BLOCKED: Sign-in window closed before completing. Use the App Password tab to connect any Gmail account immediately, or add Test Users / Publish your app in Google Cloud Console.'
      );
    }
    if (code === 'auth/popup-blocked') {
      throw new Error('Browser blocked the Google sign-in popup. Please allow popups for this site and try again.');
    }
    if (rawMsg.includes('access_denied') || rawMsg.includes('403')) {
      throw new Error(
        'SIGNIN_CANCELLED_OR_BLOCKED: Google blocked OAuth because this Cloud project is in Testing mode. Switch to the App Password tab for instant connection, or publish the OAuth app in Google Cloud Console.'
      );
    }
    throw err;
  } finally {
    isSigningIn = false;
  }
}

function toBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function sendTrackedGmailMessage(params: {
  slotIndex: 0 | 1 | 2;
  fromEmail: string;
  fromName: string;
  toEmail: string;
  subject: string;
  bodyText: string;
  trackingId: string;
  trackingOrigin: string;
}): Promise<{ id: string; threadId: string }> {
  const smtpCreds = slotSmtpCache.get(params.slotIndex);
  if (smtpCreds) {
    try {
      const data = await safeFetchJson<{ id?: string; threadId?: string }>('/api/smtp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: smtpCreds.email,
          displayName: params.fromName || smtpCreds.displayName,
          appPassword: smtpCreds.appPassword,
          host: smtpCreds.host,
          port: smtpCreds.port,
          toEmail: params.toEmail,
          subject: params.subject,
          bodyText: params.bodyText,
          trackingId: params.trackingId,
          trackingOrigin: params.trackingOrigin,
        }),
      });
      return { id: data.id || '', threadId: data.threadId || '' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'SMTP send failed';
      throw new GmailSendError(msg, classifySendFailure(msg));
    }
  }

  const accessToken = getSlotAccessToken(params.slotIndex);
  if (!accessToken) {
    throw new GmailSendError(
      `Mailbox slot ${params.slotIndex + 1} requires reconnection before sending.`,
      classifySendFailure('unauthorized', 401)
    );
  }

  const pixelUrl = `${params.trackingOrigin}/api/track/open/${params.trackingId}.png`;
  const htmlParagraphs = escapeHtml(params.bodyText)
    .split('\n')
    .map((line) => (line.trim() ? `<p style="margin:0 0 12px 0;line-height:1.55;">${line}</p>` : '<br/>'))
    .join('');

  const htmlBody = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#111827;">${htmlParagraphs}<img src="${pixelUrl}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;opacity:0;" /></body></html>`;

  const mimeMessage = [
    `From: "${params.fromName.replace(/"/g, '')}" <${params.fromEmail}>`,
    `To: ${params.toEmail}`,
    `Subject: ${params.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    htmlBody,
  ].join('\r\n');

  const raw = toBase64Url(mimeMessage);

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    const message = `Gmail API send failed (${response.status}): ${errBody}`;
    throw new GmailSendError(message, classifySendFailure(errBody, response.status));
  }

  return (await response.json()) as { id: string; threadId: string };
}

export interface GoogleHealthSyncResult {
  updates: Array<{
    trackingId: string;
    status: TrackedEmail['status'];
    repliedAt?: string;
    bounceReason?: string;
  }>;
  spamSignals: Array<{
    messageId: string;
    subject: string;
    recipientEmail?: string;
    reason: string;
    severity: 'critical' | 'warning';
    shouldPauseSlot: boolean;
  }>;
  limitReached: boolean;
  authInvalid: boolean;
  spamLabelCount: number;
}

export async function syncSlotRepliesAndBounces(
  slotIndex: 0 | 1 | 2,
  senderEmail: string,
  tracked: TrackedEmail[]
): Promise<GoogleHealthSyncResult> {
  const accessToken = getSlotAccessToken(slotIndex);
  if (!accessToken) {
    return {
      updates: [],
      spamSignals: [],
      limitReached: false,
      authInvalid: false,
      spamLabelCount: 0,
    };
  }

  const slotMessages = tracked.filter((t) => t.senderEmail.toLowerCase() === senderEmail.toLowerCase());
  const updates: GoogleHealthSyncResult['updates'] = [];
  const spamSignals: GoogleHealthSyncResult['spamSignals'] = [];
  let limitReached = false;
  let authInvalid = false;
  let spamLabelCount = 0;

  // 1. Check Gmail SPAM folder & Delivery Status Notification messages via gmail.readonly
  try {
    const query = encodeURIComponent(
      '(in:spam OR from:mailer-daemon OR from:postmaster OR "Delivery Status Notification" OR "Message blocked" OR "detected as spam" OR "daily sending quota") newer_than:7d'
    );
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?includeSpamTrash=true&maxResults=20&q=${query}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (listRes.status === 401) {
      authInvalid = true;
    } else if (listRes.ok) {
      const listData = (await listRes.json()) as { messages?: Array<{ id: string }> };
      const msgRefs = listData.messages ?? [];

      for (const ref of msgRefs.slice(0, 12)) {
        try {
          const msgRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${ref.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=X-Failed-Recipients`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (!msgRes.ok) continue;
          const msgData = (await msgRes.json()) as {
            id: string;
            labelIds?: string[];
            snippet?: string;
            payload?: { headers?: Array<{ name: string; value: string }> };
          };

          const headers = msgData.payload?.headers ?? [];
          const getHeader = (name: string) =>
            headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
          const fromVal = getHeader('From');
          const subjectVal = getHeader('Subject');
          const failedRecipient = getHeader('X-Failed-Recipients').trim().toLowerCase();
          const snippet = msgData.snippet ?? '';
          const combined = `${fromVal} ${subjectVal} ${snippet}`.toLowerCase();
          const inSpam = (msgData.labelIds ?? []).includes('SPAM');
          if (inSpam) spamLabelCount++;

          const matchedTracked = slotMessages.find(
            (t) =>
              (failedRecipient && t.recipientEmail.toLowerCase() === failedRecipient) ||
              combined.includes(t.recipientEmail.toLowerCase()) ||
              (subjectVal && t.subject && subjectVal.toLowerCase().includes(t.subject.toLowerCase()))
          );

          const isQuotaNotice =
            combined.includes('5.4.5') ||
            combined.includes('daily sending quota') ||
            combined.includes('daily limit') ||
            combined.includes('reached a limit for sending mail');
          const isSpamReject =
            combined.includes('5.7.1') ||
            combined.includes('554') ||
            combined.includes('detected as spam') ||
            combined.includes('message blocked') ||
            combined.includes('unsolicited') ||
            combined.includes('spam filter') ||
            (inSpam && Boolean(matchedTracked));

          if (isQuotaNotice) {
            limitReached = true;
            spamSignals.push({
              messageId: msgData.id,
              subject: subjectVal || 'Google Sending Limit Reached',
              recipientEmail: matchedTracked?.recipientEmail || failedRecipient || undefined,
              reason: snippet || 'Google reported daily sending quota exceeded (550 5.4.5).',
              severity: 'critical',
              shouldPauseSlot: true,
            });
          } else if (isSpamReject) {
            spamSignals.push({
              messageId: msgData.id,
              subject: subjectVal || 'Mail Flagged as Spam',
              recipientEmail: matchedTracked?.recipientEmail || failedRecipient || undefined,
              reason: snippet || 'Message detected in Gmail Spam or rejected by recipient spam filters.',
              severity: 'critical',
              shouldPauseSlot: true,
            });
            if (matchedTracked && matchedTracked.status !== 'spam') {
              updates.push({
                trackingId: matchedTracked.trackingId,
                status: 'spam',
                bounceReason: snippet || 'Flagged in Gmail Spam / rejected as spam',
              });
            }
          } else if (matchedTracked && (fromVal.toLowerCase().includes('mailer-daemon') || failedRecipient)) {
            if (matchedTracked.status !== 'bounced' && matchedTracked.status !== 'spam') {
              updates.push({
                trackingId: matchedTracked.trackingId,
                status: 'bounced',
                bounceReason: snippet || 'Delivery status failure received from Gmail',
              });
            }
          }
        } catch {
          // Ignore single message fetch errors
        }
      }
    }
  } catch {
    // Ignore search errors and continue to thread checks
  }

  // 2. Check tracked threads directly for replies, SPAM label, and daemon bounces
  for (const item of slotMessages.slice(0, 25)) {
    if (!item.gmailThreadId) continue;
    try {
      const threadRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/threads/${item.gmailThreadId}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (threadRes.status === 401) {
        authInvalid = true;
        break;
      }
      if (!threadRes.ok) continue;
      const threadData = (await threadRes.json()) as {
        messages?: Array<{
          id?: string;
          labelIds?: string[];
          payload?: { headers?: Array<{ name: string; value: string }> };
          snippet?: string;
        }>;
      };
      const msgs = threadData.messages ?? [];
      const hasSpamLabel = msgs.some((m) => (m.labelIds ?? []).includes('SPAM'));
      if (hasSpamLabel && item.status !== 'spam') {
        updates.push({
          trackingId: item.trackingId,
          status: 'spam',
          bounceReason: 'Thread labeled SPAM in Gmail mailbox',
        });
        spamSignals.push({
          messageId: msgs[0]?.id || item.trackingId,
          subject: item.subject,
          recipientEmail: item.recipientEmail,
          reason: `Thread to ${item.recipientEmail} was moved/flagged in Gmail SPAM.`,
          severity: 'critical',
          shouldPauseSlot: true,
        });
        continue;
      }

      if (msgs.length > 1) {
        const latest = msgs[msgs.length - 1];
        const fromHeader =
          latest.payload?.headers?.find((h) => h.name.toLowerCase() === 'from')?.value ?? '';
        const lowerSnippet = (latest.snippet ?? '').toLowerCase();

        if (fromHeader.toLowerCase().includes('mailer-daemon') || fromHeader.toLowerCase().includes('postmaster')) {
          const isSpamBounce =
            lowerSnippet.includes('spam') ||
            lowerSnippet.includes('5.7.1') ||
            lowerSnippet.includes('blocked') ||
            lowerSnippet.includes('unsolicited');
          updates.push({
            trackingId: item.trackingId,
            status: isSpamBounce ? 'spam' : 'bounced',
            bounceReason: latest.snippet || 'Delivery failure notification received',
          });
          if (isSpamBounce) {
            spamSignals.push({
              messageId: latest.id || item.trackingId,
              subject: item.subject,
              recipientEmail: item.recipientEmail,
              reason: latest.snippet || `Message to ${item.recipientEmail} rejected as spam.`,
              severity: 'critical',
              shouldPauseSlot: true,
            });
          }
        } else if (!fromHeader.toLowerCase().includes(senderEmail.toLowerCase()) && item.status !== 'replied') {
          updates.push({
            trackingId: item.trackingId,
            status: 'replied',
            repliedAt: new Date().toISOString(),
          });
        }
      }
    } catch {
      // Ignore individual thread lookup failure
    }
  }

  return {
    updates,
    spamSignals,
    limitReached,
    authInvalid,
    spamLabelCount,
  };
}
