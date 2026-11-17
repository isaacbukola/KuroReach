export type WorkspaceTab =
  | 'overview'
  | 'scraper'
  | 'sequences'
  | 'campaigns'
  | 'accounts'
  | 'extension'
  | 'guide';

export type ScrapeSourceMode = 'search' | 'url' | 'dom';

export interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  role: string;
  company: string;
  domain: string;
  website: string;
  linkedinUrl?: string;
  phone?: string;
  location?: string;
  source: string;
  sourceMode: ScrapeSourceMode | 'extension';
  icebreaker: string;
  painPoint: string;
  fitScore: number;
  mxValid: boolean | null;
  status: 'new' | 'queued' | 'contacted' | 'replied' | 'bounced';
  createdAt: string;
}

export interface EmailIdea {
  id: string;
  angleName: string;
  psychologicalTrigger: string;
  subjectA: string;
  subjectB: string;
  body: string;
  followUp1: string;
  followUp2: string;
  predictedReplyLift: string;
}

export interface SequenceStep {
  id: string;
  stepNumber: number;
  delayHours: number;
  condition: 'always' | 'if_unopened' | 'if_no_reply';
  subject: string;
  subjectVariantB: string;
  body: string;
}

export interface EmailSequence {
  id: string;
  name: string;
  offerContext: string;
  targetPersona: string;
  steps: SequenceStep[];
  aiOptimizationNotes?: string;
  updatedAt: string;
}

export interface GmailAccountSlot {
  slotIndex: 0 | 1 | 2;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  connected: boolean;
  needsReconnect: boolean;
  authMethod?: 'oauth' | 'smtp';
  dailyLimit: number;
  sentToday: number;
  warmupEnabled: boolean;
  accountType: 'workspace' | 'gmail';
  lastSyncedAt?: string;
  paused?: boolean;
  pauseReason?: string;
  pausedAt?: string;
  spamAlertsCount?: number;
  bounceCount?: number;
  healthStatus?: 'healthy' | 'warning' | 'paused';
}

export interface DeliverabilityReport {
  domain: string;
  checkedAt: string;
  mx: {
    valid: boolean;
    records: string[];
    provider: string;
  };
  spf: {
    valid: boolean;
    record: string | null;
  };
  dmarc: {
    valid: boolean;
    policy: string | null;
    record: string | null;
  };
  dkim: {
    valid: boolean;
    selectorFound: string | null;
  };
  score: number;
  grade: 'Ready for High Volume' | 'Warmup Recommended' | 'DNS Action Required';
  recommendations: string[];
}

export interface TrackedEmail {
  id: string;
  trackingId: string;
  gmailMessageId?: string;
  gmailThreadId?: string;
  senderEmail: string;
  senderSlot: number;
  recipientEmail: string;
  recipientName: string;
  company: string;
  subject: string;
  bodyPreview: string;
  sequenceName: string;
  stepNumber: number;
  variant: 'A' | 'B';
  status: 'sent' | 'opened' | 'clicked' | 'replied' | 'bounced' | 'spam';
  openCount: number;
  clickCount: number;
  sentAt: string;
  lastOpenedAt?: string;
  repliedAt?: string;
  bounceReason?: string;
}

export interface DeliverabilityAlert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  type: 'spam_detected' | 'send_blocked' | 'daily_limit' | 'bounce_spike' | 'campaign_paused';
  slotIndex?: 0 | 1 | 2;
  senderEmail?: string;
  recipientEmail?: string;
  title: string;
  message: string;
  actionTaken: string;
  createdAt: string;
  acknowledged: boolean;
}

export interface SequenceChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  deliverabilityScore?: number;
  conversionScore?: number;
  spamRiskFlags?: string[];
  proposedIdea?: EmailIdea;
  proposedSteps?: SequenceStep[];
  followUpPrompts?: string[];
}

export interface ScrapeResponse {
  leads: Lead[];
  groundingSources: { title: string; uri: string }[];
  summary: string;
}

export interface ScrapeJob {
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

export interface FreelancerProfile {
  specialty: string;
  serviceOffer: string;
  portfolioUrl: string;
  senderName: string;
  bookingUrl?: string;
  caseStudyNotes?: string;
}

export interface ExtensionOutreachJob {
  id: string;
  createdAt: string;
  consumed: boolean;
  slotIndex: number;
  freelancerService: string;
  sequenceName: string;
  subject: string;
  subjectVariantB: string;
  body: string;
  followUp1: string;
  followUp2: string;
  recipients: Array<{
    email: string;
    name?: string;
    company?: string;
    website?: string;
    icebreaker?: string;
    painPoint?: string;
  }>;
}

export interface PendingSendConfirmation {
  mode: 'single' | 'batch';
  senderEmails: string[];
  recipients: { email: string; name: string; company: string }[];
  subject: string;
  sequenceName: string;
  estimatedDurationLabel: string;
  onConfirm: () => Promise<void>;
}
