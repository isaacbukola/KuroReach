import JSZip from 'jszip';
import type { FreelancerProfile } from '../types';

async function renderMonochromeIconPng(size: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  const radius = Math.round(size * 0.22);
  ctx.fillStyle = '#09090B';
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(size - radius, 0);
  ctx.quadraticCurveTo(size, 0, size, radius);
  ctx.lineTo(size, size - radius);
  ctx.quadraticCurveTo(size, size, size - radius, size);
  ctx.lineTo(radius, size);
  ctx.quadraticCurveTo(0, size, 0, size - radius);
  ctx.lineTo(0, radius);
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = Math.max(1, size * 0.03);
  ctx.stroke();

  const cx = size / 2;
  const cy = size * 0.56;
  const w = size * 0.28;
  const h = size * 0.3;

  ctx.strokeStyle = '#FFFFFF';
  ctx.fillStyle = '#FFFFFF';
  ctx.lineWidth = Math.max(1.5, size * 0.06);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(cx, cy - h * 0.65);
  ctx.lineTo(cx + w, cy + h * 0.35);
  ctx.lineTo(cx, cy + h * 0.72);
  ctx.lineTo(cx - w, cy + h * 0.35);
  ctx.closePath();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx, cy - h * 0.65);
  ctx.lineTo(cx, cy + h * 0.72);
  ctx.stroke();

  for (let i = 1; i <= 2; i++) {
    ctx.beginPath();
    ctx.arc(cx, cy - h * 0.72, size * (0.1 + i * 0.085), -Math.PI * 0.78, -Math.PI * 0.22);
    ctx.stroke();
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to encode icon PNG'));
    }, 'image/png');
  });
}

export async function downloadChromeExtensionZip(
  appOrigin: string,
  connectedEmails: string[],
  freelancerProfile?: FreelancerProfile
) {
  const zip = new JSZip();

  const defaultProfile: FreelancerProfile = freelancerProfile ?? {
    specialty: 'Web Design & Development',
    serviceOffer: 'High-converting website redesigns & mobile speed optimization',
    portfolioUrl: '',
    senderName: '',
    bookingUrl: '',
    caseStudyNotes: '',
  };

  const manifest = {
    manifest_version: 3,
    name: 'KuroReach — Freelancer Copilot, Scraper & Multi-Email Outreach',
    version: '2.0.0',
    description:
      'Active auto-scroll scraper, website email hunter, live site audit, Alt+K slide-over copilot, Gmail compose assistant & multi-email outreach.',
    permissions: ['activeTab', 'scripting', 'storage'],
    host_permissions: ['<all_urls>'],
    commands: {
      'toggle-copilot': {
        suggested_key: {
          default: 'Alt+K',
        },
        description: 'Open or close the KuroReach Slide-Over Copilot drawer',
      },
    },
    action: {
      default_popup: 'popup.html',
      default_icon: {
        '16': 'icons/icon16.png',
        '48': 'icons/icon48.png',
        '128': 'icons/icon128.png',
      },
    },
    icons: {
      '16': 'icons/icon16.png',
      '48': 'icons/icon48.png',
      '128': 'icons/icon128.png',
    },
    background: {
      service_worker: 'background.js',
    },
    content_scripts: [
      {
        matches: ['<all_urls>'],
        js: ['content.js'],
        run_at: 'document_idle',
      },
    ],
  };

  const popupHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>KuroReach Freelancer Copilot v2.0</title>
  <link rel="stylesheet" href="popup.css" />
</head>
<body>
  <div class="shell">
    <header class="header">
      <div class="brand">
        <img src="icons/icon48.png" alt="KuroReach" class="logo" />
        <div>
          <div class="title">KuroReach <span class="ver">v2.0</span></div>
          <div class="subtitle">Freelancer Copilot &amp; Multi-Send</div>
        </div>
      </div>
      <div class="head-right">
        <button id="pinCopilotBtn" class="btn-mini-outline" type="button" title="Toggle On-Page Slide-Over Drawer (Alt+K)">Alt+K Drawer</button>
        <select id="mailboxSelect" class="mailbox-select" title="Target Gmail Sender"></select>
      </div>
    </header>

    <div class="tabs-3">
      <button id="tabScrape" class="tab-btn active" type="button">1. Scrape</button>
      <button id="tabSend" class="tab-btn" type="button">2. Multi-Send (<span id="queueBadge">0</span>)</button>
      <button id="tabFollowups" class="tab-btn" type="button">3. Follow-Ups (<span id="followupBadge">0</span>)</button>
    </div>

    <section id="viewScrape" class="tab-view">
      <section class="panel">
        <div class="label-row">
          <label class="label" for="endpointInput">Workspace Endpoint</label>
          <span id="shieldIndicator" class="hint ok-text">Duplicate Shield Active</span>
        </div>
        <input id="endpointInput" type="url" class="input" value="${appOrigin}" />
      </section>

      <div class="actions">
        <button id="scrapeBtn" class="btn-primary" type="button">⚡ Auto-Scroll &amp; Scrape</button>
        <button id="stopScrapeBtn" class="btn-danger hidden" type="button">■ Stop Scan</button>
        <button id="enrichBtn" class="btn-secondary" type="button" disabled>🔍 Hunt Emails &amp; Audit</button>
      </div>

      <div class="sub-actions-4">
        <button id="toMultiSendBtn" class="btn-ghost" type="button" disabled>→ Multi-Send</button>
        <button id="syncBtn" class="btn-ghost" type="button" disabled>Push Leads</button>
        <button id="csvBtn" class="btn-ghost" type="button" disabled>Export CSV</button>
        <button id="copyBtn" class="btn-ghost" type="button" disabled>Copy Raw</button>
      </div>

      <div id="liveProgressBox" class="progress-box hidden">
        <div class="progress-meta">
          <span id="livePhaseText" class="phase-badge">SCANNING TAB</span>
          <span id="liveMetricsText" class="hint mono">Pass 1 · 0 leads · 0/s</span>
        </div>
        <div class="progress-track">
          <div id="liveProgressFill" class="progress-fill"></div>
        </div>
      </div>

      <div id="scrapeStatus" class="status">Auto-scroll pages, hunt hidden website emails &amp; audit client sites.</div>
      <div id="selectControls" class="select-bar hidden">
        <label class="check-label"><input type="checkbox" id="selectAllEmails" checked /> Select Unpitched Emails</label>
        <span id="capturedMeta" class="hint">0 captured</span>
      </div>
      <section class="results" id="resultsContainer"></section>
    </section>

    <section id="viewSend" class="tab-view hidden">
      <div class="grid-2">
        <div class="panel">
          <label class="label" for="specialtySelect">Freelance Niche</label>
          <select id="specialtySelect" class="input">
            <option value="Web Design & Development">Web Design &amp; Dev</option>
            <option value="SEO & Google Maps Growth">SEO &amp; Maps Growth</option>
            <option value="AI Automation & Chatbots">AI Automation</option>
            <option value="Paid Ads & Funnel Growth">Paid Ads &amp; Funnels</option>
            <option value="Video Editing & Short-Form">Video &amp; Short-Form</option>
            <option value="Copywriting & Email Retention">Copywriting &amp; Email</option>
            <option value="UI/UX & Product Design">UI/UX Design</option>
          </select>
        </div>
        <div class="panel">
          <label class="label" for="senderNameInput">Your Name</label>
          <input id="senderNameInput" type="text" class="input" placeholder="e.g. Isaac" />
        </div>
      </div>

      <div class="panel">
        <label class="label" for="offerInput">Your Freelance Offer</label>
        <input id="offerInput" type="text" class="input" placeholder="What result do you deliver for clients?" />
      </div>

      <div class="grid-2">
        <div class="panel">
          <label class="label" for="bookingInput">Booking Link (Cal.com / Calendly)</label>
          <input id="bookingInput" type="url" class="input mono" placeholder="https://cal.com/you/15min" />
        </div>
        <div class="panel">
          <label class="label" for="caseStudyInput">Proof / Case Study Snippet</label>
          <input id="caseStudyInput" type="text" class="input" placeholder="e.g. Lifted clinic bookings 38%" />
        </div>
      </div>

      <div class="panel">
        <div class="label-row">
          <label class="label" for="recipientsInput">Recipient Emails (Already-Pitched Filtered)</label>
          <span id="recipientCountLabel" class="hint">0 valid emails</span>
        </div>
        <textarea id="recipientsInput" rows="2" class="textarea mono" placeholder="client1@company.com, founder@studio.co"></textarea>
      </div>

      <div class="panel">
        <div class="label-row">
          <label class="label" for="pitchSubject">Email Subject &amp; Pitch</label>
          <div class="mini-tools">
            <button id="insertBookingBtn" class="btn-mini-outline" type="button">+ Booking</button>
            <button id="insertProofBtn" class="btn-mini-outline" type="button">+ Proof</button>
            <button id="aiDraftBtn" class="btn-mini" type="button">✨ AI Draft</button>
          </div>
        </div>
        <input id="pitchSubject" type="text" class="input" placeholder="{{company}} <> quick idea" />
        <textarea id="pitchBody" rows="4" class="textarea" placeholder="Hi {{firstName}},&#10;&#10;{{icebreaker}}&#10;&#10;Open to seeing a 2-minute breakdown for {{company}}?"></textarea>
        <div id="spamLintBar" class="lint-line">Inbox Safety: Ready · Variables: {{firstName}}, {{company}}</div>
      </div>

      <div id="confirmBox" class="confirm-box hidden">
        <div id="confirmText" class="confirm-text"></div>
        <div class="actions">
          <button id="cancelConfirmBtn" class="btn-ghost" type="button">Cancel</button>
          <button id="executeConfirmBtn" class="btn-primary" type="button">Confirm Send</button>
        </div>
      </div>

      <div class="actions">
        <button id="queueMultiBtn" class="btn-primary" type="button">Queue in KuroReach Gmail</button>
        <button id="gmailTabsBtn" class="btn-secondary" type="button">Open Gmail Tabs</button>
      </div>

      <div id="sendStatus" class="status">Select scraped clients or paste multiple emails to pitch at once.</div>
      <button id="openDashboardBtn" class="btn-ghost hidden" type="button">Open KuroReach Tracking &amp; Send →</button>
    </section>

    <section id="viewFollowups" class="tab-view hidden">
      <div class="label-row">
        <span class="label">Unreplied Outreach Due for Follow-Up (48h+)</span>
        <button id="refreshFollowupsBtn" class="btn-mini-outline" type="button">Refresh</button>
      </div>
      <div id="followupStatus" class="status">Checking KuroReach &amp; local send history for non-responders...</div>
      <section class="results" id="followupsContainer"></section>
    </section>
  </div>
  <script src="popup.js"></script>
</body>
</html>`;

  const popupCss = `* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  width: 428px;
  min-height: 540px;
  background: #09090b;
  color: #f4f4f5;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 12px;
}
.shell { padding: 13px; display: flex; flex-direction: column; gap: 9px; }
.header { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-bottom: 9px; border-bottom: 1px solid rgba(255,255,255,0.08); }
.brand { display: flex; align-items: center; gap: 8px; }
.logo { width: 24px; height: 24px; border-radius: 6px; }
.title { font-weight: 600; font-size: 13px; letter-spacing: -0.01em; display: flex; align-items: center; gap: 5px; }
.ver { font-family: ui-monospace, monospace; font-size: 9.5px; color: #a1a1aa; border: 1px solid rgba(255,255,255,0.14); padding: 1px 4px; border-radius: 4px; }
.subtitle { font-size: 10px; color: #a1a1aa; }
.head-right { display: flex; align-items: center; gap: 5px; }
.mailbox-select {
  background: #121317;
  color: #f4f4f5;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 6px;
  padding: 4px 6px;
  font-size: 10.5px;
  max-width: 118px;
}
.tabs-3 { display: grid; grid-template-columns: 1fr 1.15fr 1.1fr; gap: 4px; background: #121317; padding: 3px; border-radius: 7px; border: 1px solid rgba(255,255,255,0.08); }
.tab-btn {
  background: transparent;
  color: #a1a1aa;
  border: none;
  border-radius: 5px;
  padding: 6px 5px;
  font-size: 10.5px;
  font-weight: 600;
  cursor: pointer;
}
.tab-btn.active { background: #ffffff; color: #09090b; }
.tab-view { display: flex; flex-direction: column; gap: 8px; }
.hidden { display: none !important; }
.grid-2 { display: grid; grid-template-columns: 1.15fr 1fr; gap: 8px; }
.panel { display: flex; flex-direction: column; gap: 4px; }
.label-row { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.label { font-size: 10px; color: #a1a1aa; font-weight: 500; }
.hint { font-size: 10px; color: #71717a; }
.ok-text { color: #6ee7b7; }
.input, .textarea {
  width: 100%;
  background: #121317;
  color: #f4f4f5;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 11px;
  font-family: inherit;
}
.input.mono, .textarea.mono { font-family: ui-monospace, monospace; font-size: 10.5px; }
.textarea { resize: vertical; line-height: 1.4; }
.actions { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
.sub-actions-4 { display: grid; grid-template-columns: 1.15fr 1fr 1fr 0.9fr; gap: 5px; }
.mini-tools { display: flex; align-items: center; gap: 4px; }
.btn-primary {
  background: #ffffff;
  color: #09090b;
  border: none;
  border-radius: 6px;
  padding: 7px 9px;
  font-weight: 600;
  font-size: 11px;
  cursor: pointer;
}
.btn-primary:hover:not(:disabled) { background: #e4e4e7; }
.btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }
.btn-secondary {
  background: #121317;
  color: #f4f4f5;
  border: 1px solid rgba(255,255,255,0.16);
  border-radius: 6px;
  padding: 7px 9px;
  font-weight: 500;
  font-size: 11px;
  cursor: pointer;
}
.btn-secondary:hover:not(:disabled) { background: rgba(255,255,255,0.06); }
.btn-secondary:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-ghost {
  background: transparent;
  color: #d4d4d8;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 6px;
  padding: 5px 6px;
  font-size: 10px;
  font-weight: 500;
  cursor: pointer;
}
.btn-ghost:hover:not(:disabled) { background: rgba(255,255,255,0.05); color: #ffffff; }
.btn-ghost:disabled { opacity: 0.35; cursor: not-allowed; }
.btn-mini {
  background: #ffffff;
  color: #09090b;
  border: none;
  border-radius: 4px;
  padding: 3px 7px;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
}
.btn-mini-outline {
  background: #121317;
  color: #e4e4e7;
  border: 1px solid rgba(255,255,255,0.16);
  border-radius: 4px;
  padding: 3px 6px;
  font-size: 9.5px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
.btn-mini-outline:hover { background: rgba(255,255,255,0.08); }
.status {
  font-size: 10.5px;
  line-height: 1.4;
  color: #a1a1aa;
  padding: 6px 8px;
  background: #121317;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 6px;
}
.status.warn { color: #fcd34d; border-color: rgba(245,158,11,0.3); background: rgba(245,158,11,0.08); }
.status.ok { color: #6ee7b7; border-color: rgba(16,185,129,0.3); background: rgba(16,185,129,0.08); }
.lint-line { font-size: 10px; color: #71717a; font-family: ui-monospace, monospace; }
.lint-line.warn { color: #fcd34d; }
.select-bar { display: flex; align-items: center; justify-content: space-between; font-size: 10.5px; color: #a1a1aa; padding: 2px 2px; }
.check-label { display: flex; align-items: center; gap: 6px; cursor: pointer; }
.results { display: flex; flex-direction: column; gap: 6px; max-height: 215px; overflow-y: auto; }
.lead-card {
  padding: 7px 9px;
  background: #121317;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 6px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.lead-card.pitched { opacity: 0.65; border-color: rgba(245,158,11,0.25); }
.lead-check { margin-top: 2px; accent-color: #ffffff; }
.lead-info { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 2px; }
.lead-head { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.lead-title { font-weight: 600; font-size: 11px; color: #ffffff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lead-badges { display: flex; align-items: center; gap: 4px; shrink: 0; }
.badge-score { font-family: ui-monospace, monospace; font-size: 9.5px; color: #e4e4e7; background: rgba(255,255,255,0.08); padding: 1px 5px; border-radius: 3px; }
.badge-pitched { font-family: ui-monospace, monospace; font-size: 9px; color: #fcd34d; background: rgba(245,158,11,0.15); border: 1px solid rgba(245,158,11,0.35); padding: 1px 4px; border-radius: 3px; }
.lead-email { font-family: ui-monospace, monospace; font-size: 10.5px; color: #e4e4e7; word-break: break-all; }
.lead-meta { font-size: 10px; color: #a1a1aa; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lead-signal { font-size: 10px; color: #fcd34d; }
.btn-danger {
  background: rgba(239,68,68,0.18);
  color: #fecaca;
  border: 1px solid rgba(239,68,68,0.45);
  border-radius: 6px;
  padding: 7px 9px;
  font-weight: 600;
  font-size: 11px;
  cursor: pointer;
}
.btn-danger:hover { background: rgba(239,68,68,0.28); }
.progress-box {
  background: #121317;
  border: 1px solid rgba(255,255,255,0.14);
  border-radius: 6px;
  padding: 7px 9px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.progress-meta { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.phase-badge { font-family: ui-monospace, monospace; font-size: 10px; font-weight: 700; color: #ffffff; letter-spacing: 0.04em; }
.mono { font-family: ui-monospace, monospace; }
.progress-track { width: 100%; height: 4px; background: rgba(255,255,255,0.08); border-radius: 99px; overflow: hidden; }
.progress-fill { width: 8%; height: 100%; background: #ffffff; transition: width 0.22s ease; }
.confirm-box {
  background: rgba(245,158,11,0.08);
  border: 1px solid rgba(245,158,11,0.35);
  border-radius: 6px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.confirm-text { font-size: 10.5px; color: #fde68a; line-height: 1.4; }`;

  const extractorFunctionString = `function extractPageIntelligence() {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/g;
    const text = (document.body?.innerText || '').slice(0, 60000);

    const mailtoLinks = Array.from(document.querySelectorAll('a[href^="mailto:"]'))
      .map((a) => (a.getAttribute('href') || '').replace(/^mailto:/i, '').split('?')[0].trim());
    const textMatches = text.match(emailRegex) || [];
    const uniqueEmails = Array.from(new Set([...mailtoLinks, ...textMatches]))
      .map((e) => e.toLowerCase())
      .filter((e) => !e.endsWith('.png') && !e.endsWith('.jpg') && !e.endsWith('.svg') && !e.includes('sentry') && !e.includes('example.'));

    const telLinks = Array.from(document.querySelectorAll('a[href^="tel:"]'))
      .map((a) => (a.getAttribute('href') || '').replace(/^tel:/i, '').trim());
    const rawPhoneMatches = (text.match(/\\+?\\d[\\d\\s\\-()]{7,16}\\d/g) || []).map((p) => p.trim());
    const uniquePhones = Array.from(new Set([...telLinks, ...rawPhoneMatches]))
      .filter((p) => p.replace(/\\D/g, '').length >= 7 && p.replace(/\\D/g, '').length <= 15)
      .slice(0, 200);

    const structuredItems = [];
    const seenCompanies = new Set();

    const isGoogleMaps = window.location.hostname.includes('google.') && window.location.pathname.includes('/maps');
    if (isGoogleMaps) {
      const cardAnchors = Array.from(document.querySelectorAll('a.hfpxzc'));
      cardAnchors.forEach((anchor) => {
        const company = (anchor.getAttribute('aria-label') || '').trim();
        if (!company || seenCompanies.has(company.toLowerCase())) return;
        const container = anchor.closest('div[jsaction]')?.parentElement || anchor.parentElement?.parentElement || anchor.parentElement;
        const cardText = (container?.innerText || '').trim();
        const lines = cardText.split('\\n').map((l) => l.trim()).filter(Boolean);
        const phoneMatch = cardText.match(/\\+?\\d[\\d\\s\\-()]{7,16}\\d/);
        const cardEmails = cardText.match(emailRegex) || [];
        const links = Array.from(container?.querySelectorAll('a[href^="http"]') || [])
          .map((a) => a.getAttribute('href') || '')
          .filter((href) => href && !href.includes('google.com/maps') && !href.includes('accounts.google'));
        const website = links[0] || '';
        const addressLine = lines.find((l) => l.includes('·') || /\\d+\\s+[A-Za-z]/.test(l)) || '';
        let needSignal = '';
        let opportunityScore = 76;
        if (!website) {
          needSignal = 'No Website Listed (High Web/SEO Opportunity)';
          opportunityScore = 94;
        } else if (website.startsWith('http://')) {
          needSignal = 'Unsecured HTTP Website (Redesign Opportunity)';
          opportunityScore = 90;
        }

        seenCompanies.add(company.toLowerCase());
        structuredItems.push({
          company,
          fullName: company,
          role: 'Prospective Client',
          email: (cardEmails[0] || '').toLowerCase(),
          phone: phoneMatch ? phoneMatch[0].trim() : '',
          website,
          location: addressLine.slice(0, 120),
          needSignal,
          opportunityScore,
          sourceSnippet: lines.slice(0, 5).join(' · ').slice(0, 220),
        });
      });

      const detailHeading = document.querySelector('h1.DUwDvf')?.textContent?.trim();
      if (detailHeading && !seenCompanies.has(detailHeading.toLowerCase())) {
        const detailPhone = document.querySelector('button[data-item-id^="phone:"]')?.textContent?.trim() || '';
        const detailAddress = document.querySelector('button[data-item-id="address"]')?.textContent?.trim() || '';
        const detailWebsite = document.querySelector('a[data-item-id="authority"]')?.getAttribute('href') || '';
        seenCompanies.add(detailHeading.toLowerCase());
        structuredItems.unshift({
          company: detailHeading,
          fullName: detailHeading,
          role: 'Prospective Client',
          email: '',
          phone: detailPhone.replace(/^[^+\\d]*/, ''),
          website: detailWebsite,
          location: detailAddress,
          needSignal: !detailWebsite ? 'No Website Listed' : '',
          opportunityScore: !detailWebsite ? 94 : 80,
          sourceSnippet: [detailHeading, detailAddress, detailPhone].filter(Boolean).join(' · '),
        });
      }
    }

    // Live On-Page Audit when viewing a client website directly
    let currentSiteAudit = null;
    if (!isGoogleMaps && !window.location.hostname.includes('google.')) {
      const htmlLower = (document.documentElement?.innerHTML || '').toLowerCase();
      const gaps = [];
      let score = 64;
      if (window.location.protocol === 'http:') { gaps.push('Unsecured HTTP (No SSL)'); score += 14; }
      if (!document.querySelector('meta[name="viewport"]')) { gaps.push('Missing Mobile Viewport'); score += 12; }
      if (!document.querySelector('meta[name="description"]')) { gaps.push('Missing SEO Meta Tag'); score += 8; }
      if (!htmlLower.includes('calendly') && !htmlLower.includes('acuity') && !htmlLower.includes('book now')) {
        gaps.push('No Online Booking Flow');
        score += 8;
      }
      currentSiteAudit = {
        score: Math.min(98, score),
        gaps,
        needSignal: gaps.slice(0, 2).join(' · ') || 'Active Business Website',
      };
    }

    if (structuredItems.length === 0 && uniqueEmails.length > 0) {
      uniqueEmails.slice(0, 200).forEach((email) => {
        const domain = email.split('@')[1] || '';
        const local = email.split('@')[0] || 'Contact';
        const firstName = local.split(/[._-]/)[0] || 'Team';
        const isGeneric = ['info', 'hello', 'contact', 'support', 'sales', 'admin'].includes(local);
        structuredItems.push({
          company: domain ? domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1) : 'Client Lead',
          fullName: isGeneric ? 'Team' : firstName.charAt(0).toUpperCase() + firstName.slice(1),
          role: isGeneric ? 'Company Inbox' : 'Decision Maker',
          email,
          phone: '',
          website: domain ? 'https://' + domain : '',
          location: '',
          needSignal: currentSiteAudit?.needSignal || 'Direct Client Email Found',
          opportunityScore: currentSiteAudit?.score || 84,
          auditFindings: currentSiteAudit?.gaps || [],
          sourceSnippet: document.title || window.location.hostname,
        });
      });
    }

    return {
      pageUrl: window.location.href,
      pageTitle: document.title,
      rawEmails: uniqueEmails.slice(0, 200),
      rawPhones: uniquePhones,
      structuredItems: structuredItems.slice(0, 200),
      currentSiteAudit,
      rawText: text,
      targetCount: 200,
    };
  }`;

  const contentJs = `(() => {
  if (window.__kuroreachContentLoaded) return;
  window.__kuroreachContentLoaded = true;

  const DEFAULT_APP_ORIGIN = ${JSON.stringify(appOrigin)};
  const DEFAULT_FREELANCER = ${JSON.stringify(defaultProfile)};

  ${extractorFunctionString}

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let scrapeAbort = false;
  let hudHost = null;
  let hudShadow = null;
  let beamEl = null;
  let copilotHost = null;
  let copilotShadow = null;
  let copilotOpen = false;
  let contactedEmailSet = new Set();
  let contactedDomainSet = new Set();

  function refreshContactedSetsFromStorage() {
    chrome.storage?.local.get(['kuroContactedIndex', 'kuroLocalSentEmails'], (res) => {
      const nextEmails = new Set((res?.kuroContactedIndex?.contactedEmails || []).map((e) => String(e).toLowerCase()));
      (res?.kuroLocalSentEmails || []).forEach((e) => nextEmails.add(String(e).toLowerCase()));
      contactedEmailSet = nextEmails;
      contactedDomainSet = new Set((res?.kuroContactedIndex?.contactedDomains || []).map((d) => String(d).toLowerCase()));
    });
  }
  refreshContactedSetsFromStorage();

  function isAlreadyContacted(item) {
    if (item?.email && contactedEmailSet.has(item.email.toLowerCase())) return true;
    const site = item?.website || '';
    if (site) {
      try {
        const host = new URL(site.startsWith('http') ? site : 'https://' + site).hostname.replace(/^www\\./, '').toLowerCase();
        if (host && contactedDomainSet.has(host)) return true;
      } catch {}
    }
    return false;
  }

  function findScrollableContainer() {
    const isGoogleMaps = window.location.hostname.includes('google.') && window.location.pathname.includes('/maps');
    if (isGoogleMaps) {
      const feed = document.querySelector('div[role="feed"]');
      if (feed && feed.scrollHeight > feed.clientHeight + 40) return feed;
      const firstCard = document.querySelector('a.hfpxzc');
      let p = firstCard ? firstCard.parentElement : null;
      while (p && p !== document.body) {
        const style = window.getComputedStyle(p);
        if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && p.scrollHeight > p.clientHeight + 40) {
          return p;
        }
        p = p.parentElement;
      }
    }
    const candidates = Array.from(document.querySelectorAll('div, main, section')).filter((el) => {
      if (el.id === 'kuroreach-hud-host' || el.id === 'kuroreach-copilot-host') return false;
      const style = window.getComputedStyle(el);
      return (
        (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
        el.scrollHeight > el.clientHeight + 180 &&
        el.clientHeight > 260 &&
        el.clientWidth > 260
      );
    });
    if (candidates.length > 0) {
      candidates.sort((a, b) => b.scrollHeight - a.scrollHeight);
      return candidates[0];
    }
    return document.scrollingElement || document.documentElement;
  }

  function highlightVisibleTargets() {
    const cards = document.querySelectorAll('a.hfpxzc, a[href^="mailto:"]');
    cards.forEach((node) => {
      const target = node.matches('a.hfpxzc') ? (node.closest('div[jsaction]')?.parentElement || node) : node;
      if (!target || target.getAttribute('data-kuro-tagged') === '1') return;
      target.setAttribute('data-kuro-tagged', '1');
      target.style.outline = '1.5px solid rgba(255,255,255,0.85)';
      target.style.outlineOffset = '-2px';
      target.style.transition = 'outline-color 0.35s ease';
      setTimeout(() => {
        if (target.style) target.style.outlineColor = 'rgba(255,255,255,0.22)';
      }, 650);
    });
  }

  function ensureHudOverlay() {
    if (beamEl && document.documentElement.contains(beamEl)) {
      beamEl.style.display = 'block';
    } else {
      beamEl = document.createElement('div');
      beamEl.id = 'kuroreach-scan-beam';
      beamEl.style.cssText = 'position:fixed;top:0;left:0;right:0;height:3px;z-index:2147483646;background:linear-gradient(90deg,#09090b 0%,#ffffff 50%,#09090b 100%);background-size:200% 100%;animation:kuroBeam 1.1s linear infinite;pointer-events:none;box-shadow:0 0 12px rgba(255,255,255,0.65);';
      if (!document.getElementById('kuroreach-beam-style')) {
        const st = document.createElement('style');
        st.id = 'kuroreach-beam-style';
        st.textContent = '@keyframes kuroBeam{0%{background-position:200% 0}100%{background-position:-200% 0}}';
        document.head.appendChild(st);
      }
      document.documentElement.appendChild(beamEl);
    }

    if (hudHost && document.documentElement.contains(hudHost)) return;
    hudHost = document.createElement('div');
    hudHost.id = 'kuroreach-hud-host';
    hudHost.style.cssText = 'position:fixed;bottom:18px;right:18px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;';
    hudShadow = hudHost.attachShadow({ mode: 'open' });
    hudShadow.innerHTML =
      '<style>' +
        '*{box-sizing:border-box;margin:0;padding:0}' +
        '.hud{width:348px;background:rgba(9,9,11,0.96);color:#f4f4f5;border:1px solid rgba(255,255,255,0.22);border-radius:10px;padding:12px 13px;box-shadow:0 20px 50px rgba(0,0,0,0.75);backdrop-filter:blur(10px)}' +
        '.top{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.1)}' +
        '.brand{display:flex;align-items:center;gap:7px;font-weight:700;font-size:12px;letter-spacing:-0.01em}' +
        '.dot{width:8px;height:8px;border-radius:99px;background:#ffffff;box-shadow:0 0 8px #fff;animation:pulse 0.8s infinite alternate}' +
        '.dot.done{background:#34d399;box-shadow:0 0 8px #34d399;animation:none}' +
        '@keyframes pulse{from{opacity:0.4}to{opacity:1}}' +
        '.btns{display:flex;gap:5px}' +
        '.btn{background:#121317;color:#f4f4f5;border:1px solid rgba(255,255,255,0.16);border-radius:5px;padding:4px 8px;font-size:10px;font-weight:600;cursor:pointer}' +
        '.btn.stop{background:rgba(239,68,68,0.2);color:#fecaca;border-color:rgba(239,68,68,0.45)}' +
        '.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:9px 0}' +
        '.stat{background:#121317;border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:6px 8px}' +
        '.stat-k{font-size:9.5px;color:#a1a1aa;text-transform:uppercase;letter-spacing:0.04em}' +
        '.stat-v{font-family:ui-monospace,monospace;font-size:13px;font-weight:700;color:#ffffff;margin-top:2px}' +
        '.track{width:100%;height:4px;background:rgba(255,255,255,0.08);border-radius:99px;overflow:hidden;margin-bottom:8px}' +
        '.fill{height:100%;width:10%;background:#ffffff;transition:width 0.2s ease}' +
        '.status{font-size:10.5px;color:#d4d4d8;font-family:ui-monospace,monospace;margin-bottom:7px}' +
        '.feed{display:flex;flex-direction:column;gap:4px;max-height:112px;overflow:hidden}' +
        '.row{font-size:10.5px;background:#121317;border:1px solid rgba(255,255,255,0.07);border-radius:5px;padding:4px 7px;display:flex;justify-content:space-between;gap:8px;white-space:nowrap}' +
        '.row-name{color:#ffffff;font-weight:600;overflow:hidden;text-overflow:ellipsis;max-width:165px}' +
        '.row-sub{color:#a1a1aa;font-family:ui-monospace,monospace;font-size:10px;overflow:hidden;text-overflow:ellipsis;max-width:140px}' +
      '</style>' +
      '<div class="hud">' +
        '<div class="top">' +
          '<div class="brand"><span id="hudDot" class="dot"></span><span>KuroReach Active Scraper</span></div>' +
          '<div class="btns">' +
            '<button id="hudCopilotBtn" class="btn" type="button">Copilot</button>' +
            '<button id="hudStopBtn" class="btn stop" type="button">Stop</button>' +
            '<button id="hudCloseBtn" class="btn" type="button">×</button>' +
          '</div>' +
        '</div>' +
        '<div class="stats">' +
          '<div class="stat"><div class="stat-k">Leads</div><div id="hudLeads" class="stat-v">0</div></div>' +
          '<div class="stat"><div class="stat-k">Emails</div><div id="hudEmails" class="stat-v">0</div></div>' +
          '<div class="stat"><div class="stat-k">Pass</div><div id="hudPass" class="stat-v">0/24</div></div>' +
        '</div>' +
        '<div class="track"><div id="hudFill" class="fill"></div></div>' +
        '<div id="hudStatus" class="status">Taking over tab &amp; scrolling fast...</div>' +
        '<div id="hudFeed" class="feed"></div>' +
      '</div>';
    document.documentElement.appendChild(hudHost);

    hudShadow.getElementById('hudCopilotBtn').addEventListener('click', () => {
      toggleCopilotDrawer(true);
    });
    hudShadow.getElementById('hudStopBtn').addEventListener('click', () => {
      scrapeAbort = true;
    });
    hudShadow.getElementById('hudCloseBtn').addEventListener('click', () => {
      scrapeAbort = true;
      if (beamEl) beamEl.style.display = 'none';
      if (hudHost) hudHost.remove();
      hudHost = null;
    });
  }

  function updateHud(opts) {
    if (!hudShadow) return;
    hudShadow.getElementById('hudLeads').textContent = String(opts.leadsCount);
    hudShadow.getElementById('hudEmails').textContent = String(opts.emailsCount);
    hudShadow.getElementById('hudPass').textContent = opts.pass + '/' + opts.maxPasses;
    hudShadow.getElementById('hudFill').style.width = Math.min(100, Math.round((opts.pass / opts.maxPasses) * 100)) + '%';
    hudShadow.getElementById('hudStatus').textContent = opts.statusText;
    const dot = hudShadow.getElementById('hudDot');
    const stopBtn = hudShadow.getElementById('hudStopBtn');
    if (opts.done) {
      dot.classList.add('done');
      stopBtn.style.display = 'none';
      if (beamEl) beamEl.style.display = 'none';
    } else {
      dot.classList.remove('done');
      stopBtn.style.display = 'inline-block';
    }

    const feed = hudShadow.getElementById('hudFeed');
    feed.innerHTML = '';
    opts.recentItems.slice(0, 4).forEach((item) => {
      const row = document.createElement('div');
      row.className = 'row';
      const n = document.createElement('span');
      n.className = 'row-name';
      n.textContent = (item.alreadyPitched ? '[PITCHED] ' : '') + (item.company || item.fullName || 'Lead');
      const s = document.createElement('span');
      s.className = 'row-sub';
      s.textContent = item.email || item.phone || item.needSignal || 'Captured';
      row.appendChild(n);
      row.appendChild(s);
      feed.appendChild(row);
    });
  }

  async function runActiveTakeoverScrape(maxPasses = 24, targetCount = 200) {
    refreshContactedSetsFromStorage();
    scrapeAbort = false;
    ensureHudOverlay();
    const startMs = Date.now();

    const itemMap = new Map();
    const emailSet = new Set();
    const phoneSet = new Set();
    const textChunks = [];
    const seenTextHashes = new Set();

    const mergeSnapshot = (snap) => {
      let addedCount = 0;
      (snap.rawEmails || []).forEach((em) => emailSet.add(em));
      (snap.rawPhones || []).forEach((ph) => phoneSet.add(ph));
      (snap.structuredItems || []).forEach((it) => {
        const key = (it.email || (it.company || '') + '::' + (it.phone || it.website || '')).toLowerCase();
        if (!key) return;
        const flagged = { ...it, alreadyPitched: isAlreadyContacted(it) };
        const prev = itemMap.get(key);
        if (!prev) {
          itemMap.set(key, flagged);
          addedCount++;
        } else if (!prev.email && flagged.email) {
          itemMap.set(key, { ...prev, ...flagged });
        }
      });
      const snippet = (snap.rawText || '').slice(0, 8000);
      const hash = snippet.slice(0, 120) + ':' + snippet.length;
      if (snippet && !seenTextHashes.has(hash)) {
        seenTextHashes.add(hash);
        textChunks.push(snippet);
      }
      return addedCount;
    };

    const buildPayload = (pass, done, reason) => {
      const items = Array.from(itemMap.values()).slice(0, targetCount);
      const emails = Array.from(emailSet).slice(0, targetCount);
      const phones = Array.from(phoneSet).slice(0, targetCount);
      const elapsedSec = Math.max(0.2, (Date.now() - startMs) / 1000);
      const rate = (Math.max(items.length, emails.length) / elapsedSec).toFixed(1);
      return {
        pageUrl: window.location.href,
        pageTitle: document.title,
        rawEmails: emails,
        rawPhones: phones,
        structuredItems: items,
        rawText: textChunks.join('\\n---\\n').slice(0, 60000),
        targetCount,
        pass,
        maxPasses,
        ratePerSec: rate,
        done,
        reason,
      };
    };

    const scroller = findScrollableContainer();
    let stagnantPasses = 0;
    let lastScrollTop = scroller ? scroller.scrollTop : 0;
    let lastScrollHeight = scroller ? scroller.scrollHeight : 0;
    let finalReason = 'Scroll scan complete';

    for (let pass = 1; pass <= maxPasses; pass++) {
      if (scrapeAbort) {
        finalReason = 'Stopped by user';
        break;
      }

      const snap = extractPageIntelligence();
      mergeSnapshot(snap);
      highlightVisibleTargets();

      const payload = buildPayload(pass, false, 'Scanning');
      const totalFound = Math.max(payload.structuredItems.length, payload.rawEmails.length);

      updateHud({
        leadsCount: totalFound,
        emailsCount: payload.rawEmails.length,
        pass,
        maxPasses,
        statusText: 'Scrolling fast · ' + payload.ratePerSec + ' leads/sec · Pass ' + pass + '/' + maxPasses,
        done: false,
        recentItems: payload.structuredItems.slice(-4).reverse(),
      });

      chrome.storage?.local.set({ kuroLatestCapture: payload });
      chrome.runtime?.sendMessage({ type: 'KUROREACH_BADGE', count: totalFound });
      chrome.runtime?.sendMessage({ type: 'KUROREACH_SCRAPE_PROGRESS', payload });
      if (copilotOpen) renderCopilotFromCapture(payload);

      if (totalFound >= targetCount) {
        finalReason = 'Reached ' + targetCount + ' lead target';
        break;
      }

      const bodyText = document.body?.innerText || '';
      if (bodyText.includes("You've reached the end of the list")) {
        finalReason = 'Reached end of directory results';
        break;
      }

      if (scroller) {
        const step = Math.max(520, Math.round((scroller.clientHeight || 700) * 0.88));
        scroller.scrollBy({ top: step, behavior: 'auto' });
        await sleep(360);

        const nextTop = scroller.scrollTop;
        const nextHeight = scroller.scrollHeight;
        if (Math.abs(nextTop - lastScrollTop) < 8 && nextHeight === lastScrollHeight) {
          stagnantPasses++;
          if (stagnantPasses >= 3) {
            finalReason = 'Reached bottom of page';
            break;
          }
        } else {
          stagnantPasses = 0;
          lastScrollTop = nextTop;
          lastScrollHeight = nextHeight;
        }
      } else {
        break;
      }
    }

    const finalSnap = extractPageIntelligence();
    mergeSnapshot(finalSnap);
    highlightVisibleTargets();

    const finalPayload = buildPayload(maxPasses, true, finalReason);
    const finalTotal = Math.max(finalPayload.structuredItems.length, finalPayload.rawEmails.length);

    updateHud({
      leadsCount: finalTotal,
      emailsCount: finalPayload.rawEmails.length,
      pass: maxPasses,
      maxPasses,
      statusText: finalReason + ' · ' + finalTotal + ' captured (' + finalPayload.ratePerSec + '/s)',
      done: true,
      recentItems: finalPayload.structuredItems.slice(-4).reverse(),
    });

    chrome.storage?.local.set({ kuroLatestCapture: finalPayload });
    chrome.runtime?.sendMessage({ type: 'KUROREACH_BADGE', count: finalTotal });
    chrome.runtime?.sendMessage({ type: 'KUROREACH_SCRAPE_DONE', payload: finalPayload });
    if (copilotOpen) renderCopilotFromCapture(finalPayload);
    return finalPayload;
  }

  // ---------- Keyboard-Activated Slide-Over Copilot (Alt+K) ----------
  async function callCopilotApi(path, method, payload) {
    const stored = await new Promise((r) => chrome.storage?.local.get(['kuroEndpoint'], (res) => r(res || {})));
    const primary = (stored.kuroEndpoint || DEFAULT_APP_ORIGIN || '').replace(/\\/$/, '');
    const candidates = [primary];
    if (primary.includes('ais-dev-')) candidates.push(primary.replace('ais-dev-', 'ais-pre-'));
    let lastErr = null;
    for (const base of candidates) {
      if (!base) continue;
      try {
        const res = await fetch(base + path, {
          method,
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: method === 'POST' ? JSON.stringify(payload) : undefined,
        });
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        const txt = await res.text();
        if (txt.trim().startsWith('<') || !ct.includes('application/json')) throw new Error('AUTH_HTML_GATE');
        const json = JSON.parse(txt);
        if (!res.ok) throw new Error(json.error || 'Failed');
        return json;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error('Endpoint unreachable');
  }

  function renderCopilotFromCapture(cap) {
    if (!copilotShadow) return;
    const list = copilotShadow.getElementById('cpList');
    const meta = copilotShadow.getElementById('cpMeta');
    if (!list || !meta) return;
    const items = cap?.structuredItems || [];
    const emails = cap?.rawEmails || [];
    meta.textContent = items.length + ' leads · ' + emails.length + ' emails';
    list.innerHTML = '';
    items.slice(0, 12).forEach((it) => {
      const card = document.createElement('div');
      card.className = 'cp-card';
      const title = document.createElement('div');
      title.className = 'cp-title';
      title.textContent = (it.alreadyPitched ? '[PITCHED] ' : '') + (it.company || it.fullName || 'Client');
      const sub = document.createElement('div');
      sub.className = 'cp-sub';
      sub.textContent = it.email || it.website || it.phone || 'Captured';
      card.appendChild(title);
      card.appendChild(sub);
      if (it.needSignal) {
        const sig = document.createElement('div');
        sig.className = 'cp-sig';
        sig.textContent = (it.opportunityScore ? it.opportunityScore + '/100 · ' : '') + it.needSignal;
        card.appendChild(sig);
      }
      list.appendChild(card);
    });
  }

  function toggleCopilotDrawer(forceOpen) {
    copilotOpen = typeof forceOpen === 'boolean' ? forceOpen : !copilotOpen;
    if (!copilotOpen) {
      if (copilotHost) copilotHost.style.display = 'none';
      return;
    }
    if (!copilotHost || !document.documentElement.contains(copilotHost)) {
      copilotHost = document.createElement('div');
      copilotHost.id = 'kuroreach-copilot-host';
      copilotHost.style.cssText = 'position:fixed;top:14px;right:14px;bottom:14px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;';
      copilotShadow = copilotHost.attachShadow({ mode: 'open' });
      copilotShadow.innerHTML =
        '<style>' +
          '*{box-sizing:border-box;margin:0;padding:0}' +
          '.drawer{width:372px;height:100%;background:rgba(9,9,11,0.97);color:#f4f4f5;border:1px solid rgba(255,255,255,0.2);border-radius:12px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,0.8)}' +
          '.hd{padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:space-between}' +
          '.ttl{font-size:13px;font-weight:700;color:#fff}' +
          '.sub{font-size:10px;color:#a1a1aa}' +
          '.x{background:#121317;color:#fff;border:1px solid rgba(255,255,255,0.15);border-radius:5px;padding:4px 8px;font-size:11px;cursor:pointer}' +
          '.body{padding:12px 14px;display:flex;flex-direction:column;gap:9px;overflow-y:auto;flex:1}' +
          '.row2{display:grid;grid-template-columns:1fr 1fr;gap:7px}' +
          '.btnw{background:#fff;color:#09090b;border:none;border-radius:6px;padding:8px;font-size:11px;font-weight:700;cursor:pointer}' +
          '.btnd{background:#121317;color:#f4f4f5;border:1px solid rgba(255,255,255,0.16);border-radius:6px;padding:8px;font-size:11px;font-weight:600;cursor:pointer}' +
          '.st{background:#121317;border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:7px 9px;font-size:10.5px;color:#d4d4d8;font-family:ui-monospace,monospace}' +
          '.meta{font-size:10.5px;color:#a1a1aa;font-family:ui-monospace,monospace}' +
          '.list{display:flex;flex-direction:column;gap:6px}' +
          '.cp-card{background:#121317;border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:7px 9px;display:flex;flex-direction:column;gap:2px}' +
          '.cp-title{font-size:11px;font-weight:600;color:#fff}' +
          '.cp-sub{font-size:10px;color:#d4d4d8;font-family:ui-monospace,monospace;word-break:break-all}' +
          '.cp-sig{font-size:10px;color:#fcd34d}' +
        '</style>' +
        '<div class="drawer">' +
          '<div class="hd">' +
            '<div><div class="ttl">KuroReach Side Copilot</div><div class="sub">Pinned Workspace · Alt+K to toggle</div></div>' +
            '<button id="cpClose" class="x" type="button">Close</button>' +
          '</div>' +
          '<div class="body">' +
            '<div class="row2">' +
              '<button id="cpScrapeBtn" class="btnw" type="button">⚡ Auto-Scroll Scrape</button>' +
              '<button id="cpHuntBtn" class="btnd" type="button">🔍 Hunt Emails &amp; Audit</button>' +
            '</div>' +
            '<div class="row2">' +
              '<button id="cpAuditBtn" class="btnd" type="button">Audit Current Site</button>' +
              '<button id="cpComposeBtn" class="btnd" type="button">Open Gmail Pitch</button>' +
            '</div>' +
            '<div id="cpStatus" class="st">Ready on this tab. Press Alt+K anytime.</div>' +
            '<div id="cpMeta" class="meta">0 leads captured</div>' +
            '<div id="cpList" class="list"></div>' +
          '</div>' +
        '</div>';
      document.documentElement.appendChild(copilotHost);

      copilotShadow.getElementById('cpClose').addEventListener('click', () => toggleCopilotDrawer(false));
      copilotShadow.getElementById('cpScrapeBtn').addEventListener('click', async () => {
        copilotShadow.getElementById('cpStatus').textContent = 'Taking over tab & auto-scrolling...';
        const res = await runActiveTakeoverScrape(24, 200);
        copilotShadow.getElementById('cpStatus').textContent = 'Done: ' + (res.structuredItems?.length || 0) + ' leads captured.';
      });
      copilotShadow.getElementById('cpAuditBtn').addEventListener('click', () => {
        const snap = extractPageIntelligence();
        if (snap.currentSiteAudit) {
          copilotShadow.getElementById('cpStatus').textContent =
            'Site Opportunity: ' + snap.currentSiteAudit.score + '/100 · ' + snap.currentSiteAudit.needSignal;
        } else {
          copilotShadow.getElementById('cpStatus').textContent =
            'Captured ' + (snap.structuredItems?.length || 0) + ' listings & ' + (snap.rawEmails?.length || 0) + ' emails.';
        }
        renderCopilotFromCapture(snap);
      });
      copilotShadow.getElementById('cpHuntBtn').addEventListener('click', async () => {
        const st = copilotShadow.getElementById('cpStatus');
        st.textContent = 'Hunting hidden website emails & auditing sites...';
        const stored = await new Promise((r) => chrome.storage?.local.get(['kuroLatestCapture'], (x) => r(x || {})));
        const cap = stored.kuroLatestCapture || extractPageIntelligence();
        const targets = (cap.structuredItems || []).filter((it) => it.website || it.email).slice(0, 20);
        if (targets.length === 0) {
          st.textContent = 'Scrape websites first before hunting emails.';
          return;
        }
        try {
          const data = await callCopilotApi('/api/extension/enrich-sites', 'POST', { targets });
          let foundEmails = 0;
          const byComp = new Map((data.enriched || []).map((e) => [(e.company || '').toLowerCase(), e]));
          cap.structuredItems = (cap.structuredItems || []).map((it) => {
            const m = byComp.get((it.company || '').toLowerCase());
            if (!m) return it;
            const nextEmail = it.email || (m.emails && m.emails[0]) || '';
            if (nextEmail && !it.email) foundEmails++;
            return {
              ...it,
              email: nextEmail,
              needSignal: m.needSignal || it.needSignal,
              opportunityScore: m.opportunityScore || it.opportunityScore,
              suggestedIcebreaker: m.suggestedIcebreaker,
            };
          });
          cap.rawEmails = Array.from(new Set([...(cap.rawEmails || []), ...cap.structuredItems.map((i) => i.email).filter(Boolean)]));
          chrome.storage?.local.set({ kuroLatestCapture: cap });
          renderCopilotFromCapture(cap);
          st.textContent = 'Enriched! Found +' + foundEmails + ' hidden emails & live site audits.';
        } catch (e) {
          st.textContent = 'Enrich needs Shared Workspace URL in extension.';
        }
      });
      copilotShadow.getElementById('cpComposeBtn').addEventListener('click', () => {
        const snap = extractPageIntelligence();
        const to = (snap.rawEmails && snap.rawEmails[0]) || '';
        const host = window.location.hostname.replace(/^www\\./, '');
        const su = encodeURIComponent(host + ' <> quick idea');
        const gap = snap.currentSiteAudit?.needSignal || 'a quick conversion improvement';
        const body = encodeURIComponent(
          'Hi there,\\n\\nChecked ' + host + ' today and noticed ' + gap + '.\\n\\nI specialize in ' + (DEFAULT_FREELANCER.specialty || 'client growth') + ' and help businesses fix this cleanly.\\n\\nOpen to a 60-second teardown?'
        );
        window.open('https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(to) + '&su=' + su + '&body=' + body, '_blank');
      });
    }
    copilotHost.style.display = 'block';
    chrome.storage?.local.get(['kuroLatestCapture'], (res) => {
      if (res?.kuroLatestCapture) renderCopilotFromCapture(res.kuroLatestCapture);
    });
  }

  // ---------- Gmail Compose Copilot (mail.google.com) ----------
  function mountGmailComposeCopilot() {
    if (!window.location.hostname.includes('mail.google.com')) return;
    const injectToolbar = () => {
      const editors = document.querySelectorAll('div[g_editable="true"][contenteditable="true"]');
      editors.forEach((ed) => {
        const dialog = ed.closest('div[role="dialog"]') || ed.closest('table') || ed.parentElement;
        if (!dialog || dialog.querySelector('.kuro-gmail-bar')) return;
        const bar = document.createElement('div');
        bar.className = 'kuro-gmail-bar';
        bar.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:6px 8px;margin:4px 0;background:#09090b;border:1px solid #27272a;border-radius:6px;font-family:-apple-system,sans-serif;font-size:11px;color:#f4f4f5;';
        bar.innerHTML =
          '<span style="font-weight:700;color:#fff;margin-right:4px;">KuroReach</span>' +
          '<button type="button" data-kuro-act="pitch" style="background:#fff;color:#09090b;border:none;border-radius:4px;padding:3px 8px;font-weight:600;font-size:10.5px;cursor:pointer;">✨ Pitch Draft</button>' +
          '<button type="button" data-kuro-act="followup" style="background:#18181b;color:#f4f4f5;border:1px solid #3f3f46;border-radius:4px;padding:3px 8px;font-weight:500;font-size:10.5px;cursor:pointer;">Follow-Up Nudge</button>' +
          '<button type="button" data-kuro-act="objection" style="background:#18181b;color:#f4f4f5;border:1px solid #3f3f46;border-radius:4px;padding:3px 8px;font-weight:500;font-size:10.5px;cursor:pointer;">Budget Reply</button>' +
          '<button type="button" data-kuro-act="booking" style="background:#18181b;color:#f4f4f5;border:1px solid #3f3f46;border-radius:4px;padding:3px 8px;font-weight:500;font-size:10.5px;cursor:pointer;">+ Booking Link</button>';

        bar.addEventListener('click', (ev) => {
          const btn = ev.target.closest('button[data-kuro-act]');
          if (!btn) return;
          const act = btn.getAttribute('data-kuro-act');
          chrome.storage?.local.get(['kuroFreelancer'], (res) => {
            const fl = res?.kuroFreelancer || DEFAULT_FREELANCER;
            const offer = fl.offer || fl.serviceOffer || 'website conversion & speed upgrades';
            const sign = fl.senderName ? '\\n\\nBest,\\n' + fl.senderName : '';
            const booking = fl.bookingUrl || DEFAULT_FREELANCER.bookingUrl || '';
            let snippet = '';
            if (act === 'pitch') {
              snippet = 'Hi there,\\n\\nI noticed a quick opportunity on your site around ' + offer + '.\\n\\nI put together a 60-second breakdown showing two easy fixes to lift client inquiries. Worth sending over?' + sign;
            } else if (act === 'followup') {
              snippet = 'Hi there,\\n\\nBumping this up briefly in case my earlier note got buried—happy to share those specific notes on ' + offer + ' whenever helpful.' + sign;
            } else if (act === 'objection') {
              snippet = 'Totally fair—if a full sprint feels heavy right now, we can start with a lightweight fixed-scope quick win focused strictly on immediate ROI.' + (booking ? ' Happy to walk through options: ' + booking : '') + sign;
            } else if (act === 'booking') {
              snippet = booking ? 'Feel free to grab a quick 15-min slot here: ' + booking : 'Happy to jump on a quick 15-min call—what day works best for you?';
            }
            ed.focus();
            document.execCommand('insertText', false, snippet);
          });
        });

        ed.parentElement?.insertBefore(bar, ed);
      });
    };
    const obs = new MutationObserver(injectToolbar);
    obs.observe(document.body, { childList: true, subtree: true });
    injectToolbar();
  }
  if (document.body) mountGmailComposeCopilot();

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg) return false;
    if (msg.type === 'KUROREACH_SCRAPE_TAB') {
      sendResponse(extractPageIntelligence());
      return true;
    }
    if (msg.type === 'KUROREACH_START_ACTIVE_SCRAPE') {
      runActiveTakeoverScrape(msg.maxPasses || 24, msg.targetCount || 200).then((res) => {
        try {
          sendResponse(res);
        } catch {}
      });
      return true;
    }
    if (msg.type === 'KUROREACH_STOP_ACTIVE_SCRAPE') {
      scrapeAbort = true;
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === 'KUROREACH_TOGGLE_COPILOT') {
      toggleCopilotDrawer();
      sendResponse({ ok: true, open: copilotOpen });
      return true;
    }
    return false;
  });
})();`;

  const popupJs = `const DEFAULT_MAILBOXES = ${JSON.stringify(
    connectedEmails.length > 0 ? connectedEmails : ['Slot 1 (Connect in Dashboard)', 'Slot 2', 'Slot 3']
  )};
const DEFAULT_FREELANCER = ${JSON.stringify(defaultProfile)};

const mailboxSelect = document.getElementById('mailboxSelect');
const pinCopilotBtn = document.getElementById('pinCopilotBtn');
const tabScrape = document.getElementById('tabScrape');
const tabSend = document.getElementById('tabSend');
const tabFollowups = document.getElementById('tabFollowups');
const viewScrape = document.getElementById('viewScrape');
const viewSend = document.getElementById('viewSend');
const viewFollowups = document.getElementById('viewFollowups');
const queueBadge = document.getElementById('queueBadge');
const followupBadge = document.getElementById('followupBadge');

const endpointInput = document.getElementById('endpointInput');
const shieldIndicator = document.getElementById('shieldIndicator');
const scrapeBtn = document.getElementById('scrapeBtn');
const stopScrapeBtn = document.getElementById('stopScrapeBtn');
const enrichBtn = document.getElementById('enrichBtn');
const toMultiSendBtn = document.getElementById('toMultiSendBtn');
const syncBtn = document.getElementById('syncBtn');
const csvBtn = document.getElementById('csvBtn');
const copyBtn = document.getElementById('copyBtn');
const liveProgressBox = document.getElementById('liveProgressBox');
const livePhaseText = document.getElementById('livePhaseText');
const liveMetricsText = document.getElementById('liveMetricsText');
const liveProgressFill = document.getElementById('liveProgressFill');
const scrapeStatus = document.getElementById('scrapeStatus');
const selectControls = document.getElementById('selectControls');
const selectAllEmails = document.getElementById('selectAllEmails');
const capturedMeta = document.getElementById('capturedMeta');
const resultsContainer = document.getElementById('resultsContainer');

const specialtySelect = document.getElementById('specialtySelect');
const senderNameInput = document.getElementById('senderNameInput');
const offerInput = document.getElementById('offerInput');
const bookingInput = document.getElementById('bookingInput');
const caseStudyInput = document.getElementById('caseStudyInput');
const recipientsInput = document.getElementById('recipientsInput');
const recipientCountLabel = document.getElementById('recipientCountLabel');
const insertBookingBtn = document.getElementById('insertBookingBtn');
const insertProofBtn = document.getElementById('insertProofBtn');
const aiDraftBtn = document.getElementById('aiDraftBtn');
const pitchSubject = document.getElementById('pitchSubject');
const pitchBody = document.getElementById('pitchBody');
const spamLintBar = document.getElementById('spamLintBar');
const confirmBox = document.getElementById('confirmBox');
const confirmText = document.getElementById('confirmText');
const cancelConfirmBtn = document.getElementById('cancelConfirmBtn');
const executeConfirmBtn = document.getElementById('executeConfirmBtn');
const queueMultiBtn = document.getElementById('queueMultiBtn');
const gmailTabsBtn = document.getElementById('gmailTabsBtn');
const sendStatus = document.getElementById('sendStatus');
const openDashboardBtn = document.getElementById('openDashboardBtn');

const refreshFollowupsBtn = document.getElementById('refreshFollowupsBtn');
const followupStatus = document.getElementById('followupStatus');
const followupsContainer = document.getElementById('followupsContainer');

let latestCapture = null;
let selectedIndices = new Set();
let pendingConfirmAction = null;
let latestFollowUp1 = '';
let latestFollowUp2 = '';
let contactedEmails = new Set();
let contactedDomains = new Set();
let followUpsList = [];

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setStatus(el, text, tone) {
  el.className = 'status' + (tone ? ' ' + tone : '');
  el.textContent = text;
}

function switchTab(tab) {
  tabScrape.classList.toggle('active', tab === 'scrape');
  tabSend.classList.toggle('active', tab === 'send');
  tabFollowups.classList.toggle('active', tab === 'followups');
  viewScrape.classList.toggle('hidden', tab !== 'scrape');
  viewSend.classList.toggle('hidden', tab !== 'send');
  viewFollowups.classList.toggle('hidden', tab !== 'followups');
}

tabScrape.addEventListener('click', () => switchTab('scrape'));
tabSend.addEventListener('click', () => switchTab('send'));
tabFollowups.addEventListener('click', () => {
  switchTab('followups');
  syncContactedAndFollowups();
});

pinCopilotBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;
  chrome.tabs.sendMessage(tab.id, { type: 'KUROREACH_TOGGLE_COPILOT' }, async () => {
    if (chrome.runtime.lastError) {
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
        chrome.tabs.sendMessage(tab.id, { type: 'KUROREACH_TOGGLE_COPILOT' });
      } catch {}
    }
  });
});

DEFAULT_MAILBOXES.forEach((email, idx) => {
  const opt = document.createElement('option');
  opt.value = String(idx);
  opt.textContent = email;
  mailboxSelect.appendChild(opt);
});

specialtySelect.value = DEFAULT_FREELANCER.specialty || 'Web Design & Development';
offerInput.value = DEFAULT_FREELANCER.serviceOffer || 'High-converting website redesigns & growth sprints';
senderNameInput.value = DEFAULT_FREELANCER.senderName || '';
bookingInput.value = DEFAULT_FREELANCER.bookingUrl || '';
caseStudyInput.value = DEFAULT_FREELANCER.caseStudyNotes || '';
pitchSubject.value = '{{company}} <> quick idea';
pitchBody.value = 'Hi {{firstName}},\\n\\n{{icebreaker}}\\n\\nI help businesses like {{company}} solve {{painPoint}} without bloated agency retainers.\\n\\nOpen to a quick 2-minute teardown for {{company}}?';

chrome.storage?.local.get(['kuroEndpoint', 'kuroFreelancer', 'kuroPitch', 'kuroLatestCapture', 'kuroLocalSentEmails'], (res) => {
  if (res?.kuroEndpoint) endpointInput.value = res.kuroEndpoint;
  if (res?.kuroFreelancer) {
    if (res.kuroFreelancer.specialty) specialtySelect.value = res.kuroFreelancer.specialty;
    if (res.kuroFreelancer.offer) offerInput.value = res.kuroFreelancer.offer;
    if (res.kuroFreelancer.senderName) senderNameInput.value = res.kuroFreelancer.senderName;
    if (res.kuroFreelancer.bookingUrl !== undefined) bookingInput.value = res.kuroFreelancer.bookingUrl;
    if (res.kuroFreelancer.caseStudyNotes !== undefined) caseStudyInput.value = res.kuroFreelancer.caseStudyNotes;
  }
  if (res?.kuroPitch) {
    if (res.kuroPitch.subject) pitchSubject.value = res.kuroPitch.subject;
    if (res.kuroPitch.body) pitchBody.value = res.kuroPitch.body;
  }
  (res?.kuroLocalSentEmails || []).forEach((e) => contactedEmails.add(String(e).toLowerCase()));
  if (res?.kuroLatestCapture) {
    handleScrapeSuccess(res.kuroLatestCapture, false);
  }
  lintPitch();
  syncContactedAndFollowups();
});

function saveSettings() {
  chrome.storage?.local.set({
    kuroEndpoint: endpointInput.value.trim(),
    kuroFreelancer: {
      specialty: specialtySelect.value,
      offer: offerInput.value.trim(),
      senderName: senderNameInput.value.trim(),
      bookingUrl: bookingInput.value.trim(),
      caseStudyNotes: caseStudyInput.value.trim(),
    },
    kuroPitch: {
      subject: pitchSubject.value,
      body: pitchBody.value,
    },
  });
}

[endpointInput, specialtySelect, offerInput, senderNameInput, bookingInput, caseStudyInput, pitchSubject, pitchBody].forEach((el) => {
  el.addEventListener('change', saveSettings);
});

insertBookingBtn.addEventListener('click', () => {
  const link = bookingInput.value.trim();
  if (!link) {
    setStatus(sendStatus, 'Add your Cal.com or Calendly link above first.', 'warn');
    return;
  }
  pitchBody.value = pitchBody.value.trim() + '\\n\\nGrab 15 mins here if easier: ' + link;
  saveSettings();
  lintPitch();
});

insertProofBtn.addEventListener('click', () => {
  const proof = caseStudyInput.value.trim();
  if (!proof) {
    setStatus(sendStatus, 'Add a short case study or result snippet above first.', 'warn');
    return;
  }
  pitchBody.value = pitchBody.value.trim() + '\\n\\nRecent result: ' + proof;
  saveSettings();
  lintPitch();
});

function parseRecipientEmails() {
  const raw = recipientsInput.value || '';
  const tokens = raw.split(/[\\s,;\\n]+/).map((s) => s.trim().toLowerCase()).filter((s) => /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(s));
  return Array.from(new Set(tokens)).slice(0, 200);
}

function updateRecipientBadges() {
  const emails = parseRecipientEmails();
  recipientCountLabel.textContent = emails.length + ' valid email' + (emails.length === 1 ? '' : 's');
  queueBadge.textContent = String(emails.length);
}

recipientsInput.addEventListener('input', updateRecipientBadges);

const SPAM_WORDS = ['free', 'guarantee', '100%', 'act now', 'limited time', 'urgent', 'click here', 'buy now', 'discount'];
function lintPitch() {
  const combined = (pitchSubject.value + ' ' + pitchBody.value).toLowerCase();
  const hits = SPAM_WORDS.filter((w) => combined.includes(w));
  const words = pitchBody.value.trim().split(/\\s+/).filter(Boolean).length;
  if (hits.length > 0) {
    spamLintBar.className = 'lint-line warn';
    spamLintBar.textContent = 'Spam Risk (' + words + 'w): Avoid "' + hits.join('", "') + '"';
  } else if (words > 110) {
    spamLintBar.className = 'lint-line warn';
    spamLintBar.textContent = 'Length Alert: ' + words + ' words (keep under 90w for max replies)';
  } else {
    spamLintBar.className = 'lint-line';
    spamLintBar.textContent = 'Inbox Safety: Clean · ' + words + ' words · Spam-safe';
  }
}

pitchSubject.addEventListener('input', lintPitch);
pitchBody.addEventListener('input', lintPitch);

function isItemPitched(item) {
  if (item.alreadyPitched) return true;
  if (item.email && contactedEmails.has(item.email.toLowerCase())) return true;
  if (item.website) {
    try {
      const host = new URL(item.website.startsWith('http') ? item.website : 'https://' + item.website).hostname.replace(/^www\\./, '').toLowerCase();
      if (host && contactedDomains.has(host)) return true;
    } catch {}
  }
  return false;
}

function renderCaptureResults(response) {
  resultsContainer.innerHTML = '';
  selectedIndices = new Set();
  const items = response.structuredItems || [];

  if (items.length > 0) {
    selectControls.classList.remove('hidden');
    let emailCount = 0;
    let pitchedCount = 0;
    items.slice(0, 60).forEach((item, idx) => {
      const hasEmail = Boolean(item.email && item.email.includes('@'));
      const pitched = isItemPitched(item);
      if (pitched) pitchedCount++;
      const autoCheck = hasEmail && !pitched;
      if (autoCheck) selectedIndices.add(idx);
      if (hasEmail) emailCount++;

      const card = document.createElement('div');
      card.className = 'lead-card' + (pitched ? ' pitched' : '');
      const primaryContact = item.email || item.phone || item.website || 'Captured from DOM';
      const metaParts = [item.location, item.website].filter(Boolean);
      card.innerHTML =
        (hasEmail
          ? '<input type="checkbox" class="lead-check" data-idx="' + idx + '"' + (autoCheck ? ' checked' : '') + ' />'
          : '<input type="checkbox" class="lead-check" disabled title="Click Hunt Emails & Audit to find website email" />') +
        '<div class="lead-info">' +
          '<div class="lead-head">' +
            '<div class="lead-title">' + esc(item.company || item.fullName) + '</div>' +
            '<div class="lead-badges">' +
              (pitched ? '<span class="badge-pitched">PITCHED</span>' : '') +
              (item.opportunityScore ? '<span class="badge-score">' + item.opportunityScore + '/100</span>' : '') +
            '</div>' +
          '</div>' +
          '<div class="lead-email">' + esc(primaryContact) + '</div>' +
          (item.needSignal ? '<div class="lead-signal">' + esc(item.needSignal) + '</div>' : '') +
          '<div class="lead-meta">' + esc(metaParts.join(' · ') || response.pageTitle) + '</div>' +
        '</div>';
      resultsContainer.appendChild(card);
    });

    resultsContainer.querySelectorAll('.lead-check[data-idx]').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        const idx = Number(e.target.getAttribute('data-idx'));
        if (e.target.checked) selectedIndices.add(idx);
        else selectedIndices.delete(idx);
        toMultiSendBtn.disabled = selectedIndices.size === 0;
      });
    });

    capturedMeta.textContent = items.length + ' leads (' + emailCount + ' emails' + (pitchedCount ? ', ' + pitchedCount + ' pitched' : '') + ')';
    toMultiSendBtn.disabled = selectedIndices.size === 0 && (response.rawEmails || []).length === 0;
  } else {
    selectControls.classList.add('hidden');
    toMultiSendBtn.disabled = (response.rawEmails || []).length === 0;
    const card = document.createElement('div');
    card.className = 'lead-card';
    card.innerHTML =
      '<div class="lead-info">' +
        '<div class="lead-title">' + esc(response.pageTitle || 'Active Page') + '</div>' +
        '<div class="lead-meta">Captured ' + (response.rawText || '').length + ' chars &amp; ' + (response.rawEmails || []).length + ' emails.</div>' +
      '</div>';
    resultsContainer.appendChild(card);
  }
}

selectAllEmails.addEventListener('change', () => {
  const checked = selectAllEmails.checked;
  const items = latestCapture?.structuredItems || [];
  resultsContainer.querySelectorAll('.lead-check[data-idx]').forEach((cb) => {
    const idx = Number(cb.getAttribute('data-idx'));
    const shouldCheck = checked && !isItemPitched(items[idx] || {});
    cb.checked = shouldCheck;
    if (shouldCheck) selectedIndices.add(idx);
    else selectedIndices.delete(idx);
  });
  toMultiSendBtn.disabled = selectedIndices.size === 0 && !((latestCapture?.rawEmails || []).length);
});

function setScrapingUi(isScanning) {
  scrapeBtn.classList.toggle('hidden', isScanning);
  stopScrapeBtn.classList.toggle('hidden', !isScanning);
  liveProgressBox.classList.toggle('hidden', !isScanning && !latestCapture);
}

function updateLiveProgressBar(payload) {
  if (!payload) return;
  liveProgressBox.classList.remove('hidden');
  const pct = payload.done
    ? 100
    : Math.min(98, Math.max(8, Math.round(((payload.pass || 1) / (payload.maxPasses || 24)) * 100)));
  liveProgressFill.style.width = pct + '%';
  livePhaseText.textContent = payload.done ? 'COMPLETE' : 'SCROLLING & SCRAPING';
  const count = Math.max((payload.structuredItems || []).length, (payload.rawEmails || []).length);
  liveMetricsText.textContent =
    'Pass ' + (payload.pass || 1) + ' · ' + count + ' leads · ' + (payload.ratePerSec || '0') + '/s';
}

function handleScrapeSuccess(response, finalize = true) {
  latestCapture = response;
  renderCaptureResults(response);
  enrichBtn.disabled = !((response.structuredItems || []).some((it) => it.website || it.email));
  syncBtn.disabled = false;
  csvBtn.disabled = false;
  copyBtn.disabled = false;
  updateLiveProgressBar(response);

  const emailHits = (response.rawEmails || []).length;
  const totalItems = (response.structuredItems || []).length || emailHits;
  if (finalize) {
    setScrapingUi(false);
    if (totalItems > 0) {
      setStatus(
        scrapeStatus,
        (response.reason ? response.reason + ' — ' : '') +
          'Captured ' + totalItems + ' leads (' + emailHits + ' emails). Click Hunt Emails & Audit to uncover missing website emails.',
        'ok'
      );
    } else {
      setStatus(scrapeStatus, 'Captured ' + (response.rawText || '').length + ' chars. Push Leads for deep AI extraction.', '');
    }
  } else if (totalItems > 0) {
    setStatus(scrapeStatus, 'Streaming live: ' + totalItems + ' leads (' + emailHits + ' emails) captured...', '');
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || !msg.payload) return;
  if (msg.type === 'KUROREACH_SCRAPE_PROGRESS') {
    handleScrapeSuccess(msg.payload, false);
  } else if (msg.type === 'KUROREACH_SCRAPE_DONE') {
    handleScrapeSuccess(msg.payload, true);
  }
});

${extractorFunctionString}

scrapeBtn.addEventListener('click', async () => {
  setScrapingUi(true);
  liveProgressFill.style.width = '8%';
  livePhaseText.textContent = 'TAKING OVER TAB';
  liveMetricsText.textContent = 'Initializing...';
  setStatus(scrapeStatus, 'Taking over browser tab — fast auto-scrolling & streaming leads...', '');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    setScrapingUi(false);
    setStatus(scrapeStatus, 'No active browser tab detected.', 'warn');
    return;
  }

  const triggerActiveScrape = () =>
    new Promise((resolve) => {
      chrome.tabs.sendMessage(
        tab.id,
        { type: 'KUROREACH_START_ACTIVE_SCRAPE', maxPasses: 24, targetCount: 200 },
        (response) => {
          if (chrome.runtime.lastError || !response) resolve(null);
          else resolve(response);
        }
      );
    });

  let result = await triggerActiveScrape();
  if (!result) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      result = await triggerActiveScrape();
    } catch (_injectErr) {}
  }

  if (result) {
    handleScrapeSuccess(result, true);
    return;
  }

  try {
    const fallbackRes = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractPageIntelligence });
    if (fallbackRes && fallbackRes[0] && fallbackRes[0].result) {
      handleScrapeSuccess(fallbackRes[0].result, true);
      return;
    }
  } catch (_err) {}

  setScrapingUi(false);
  setStatus(scrapeStatus, 'Reload this webpage once (avoid chrome:// pages) and click Auto-Scroll & Scrape.', 'warn');
});

stopScrapeBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id) chrome.tabs.sendMessage(tab.id, { type: 'KUROREACH_STOP_ACTIVE_SCRAPE' });
  setScrapingUi(false);
  setStatus(scrapeStatus, 'Scan stopped. All captured leads remain ready below.', 'ok');
});

enrichBtn.addEventListener('click', async () => {
  if (!latestCapture) return;
  const targets = (latestCapture.structuredItems || []).filter((it) => it.website || it.email).slice(0, 40);
  if (targets.length === 0) return;

  enrichBtn.disabled = true;
  enrichBtn.textContent = 'Hunting...';
  setStatus(scrapeStatus, 'Crawling ' + targets.length + ' client websites (/contact, /about) & running SEO/SSL audits...', '');

  try {
    const res = await callWorkspaceApi('/api/extension/enrich-sites', 'POST', { targets });
    let newEmails = 0;
    const byCompany = new Map((res.enriched || []).map((e) => [(e.company || '').toLowerCase(), e]));
    latestCapture.structuredItems = (latestCapture.structuredItems || []).map((it) => {
      const match = byCompany.get((it.company || '').toLowerCase());
      if (!match) return it;
      const discovered = match.emails && match.emails[0];
      const nextEmail = it.email || discovered || '';
      if (!it.email && nextEmail) newEmails++;
      return {
        ...it,
        email: nextEmail,
        socials: match.socials,
        needSignal: match.needSignal || it.needSignal,
        opportunityScore: match.opportunityScore || it.opportunityScore,
        suggestedIcebreaker: match.suggestedIcebreaker,
      };
    });
    latestCapture.rawEmails = Array.from(
      new Set([...(latestCapture.rawEmails || []), ...latestCapture.structuredItems.map((i) => i.email).filter(Boolean)])
    );
    chrome.storage?.local.set({ kuroLatestCapture: latestCapture });
    renderCaptureResults(latestCapture);
    setStatus(scrapeStatus, 'Site Audit complete! Uncovered +' + newEmails + ' hidden client emails & live website gaps.', 'ok');
  } catch (err) {
    setStatus(
      scrapeStatus,
      err?.code === 'AUTH_HTML_GATE'
        ? 'Paste your Shared App URL in Endpoint to run Website Email Hunting.'
        : 'Enrich error: ' + err.message,
      'warn'
    );
  } finally {
    enrichBtn.disabled = false;
    enrichBtn.textContent = '🔍 Hunt Emails & Audit';
  }
});

toMultiSendBtn.addEventListener('click', () => {
  if (!latestCapture) return;
  const items = latestCapture.structuredItems || [];
  const chosenEmails = [];
  selectedIndices.forEach((idx) => {
    if (items[idx]?.email) chosenEmails.push(items[idx].email);
  });
  if (chosenEmails.length === 0 && latestCapture.rawEmails?.length) {
    chosenEmails.push(...latestCapture.rawEmails.filter((e) => !contactedEmails.has(e.toLowerCase())));
  }
  const existing = parseRecipientEmails();
  const merged = Array.from(new Set([...chosenEmails, ...existing])).slice(0, 200);
  recipientsInput.value = merged.join(', ');
  updateRecipientBadges();
  switchTab('send');
  setStatus(sendStatus, 'Loaded ' + merged.length + ' unpitched client emails. Draft with AI or send below.', 'ok');
});

async function callWorkspaceApi(path, method, payload) {
  const primaryUrl = endpointInput.value.trim().replace(/\\/$/, '');
  const candidates = [primaryUrl];
  if (primaryUrl.includes('ais-dev-')) {
    candidates.push(primaryUrl.replace('ais-dev-', 'ais-pre-'));
  }

  let lastErr = null;
  for (const baseUrl of candidates) {
    try {
      const res = await fetch(baseUrl + path, {
        method: method || 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: method === 'GET' ? undefined : JSON.stringify(payload),
      });
      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      const rawBody = await res.text();
      if (rawBody.trim().startsWith('<') || !contentType.includes('application/json')) {
        const err = new Error('AUTH_HTML_GATE');
        err.code = 'AUTH_HTML_GATE';
        throw err;
      }
      const data = JSON.parse(rawBody);
      if (!res.ok) throw new Error(data.error || 'Request failed (' + res.status + ')');
      if (baseUrl !== primaryUrl) {
        endpointInput.value = baseUrl;
        saveSettings();
      }
      return data;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Workspace endpoint unreachable');
}

async function syncContactedAndFollowups() {
  try {
    const data = await callWorkspaceApi('/api/extension/contacted-index', 'GET');
    (data.contactedEmails || []).forEach((e) => contactedEmails.add(String(e).toLowerCase()));
    (data.contactedDomains || []).forEach((d) => contactedDomains.add(String(d).toLowerCase()));
    followUpsList = data.followUpsDue || [];
    chrome.storage?.local.set({
      kuroContactedIndex: {
        contactedEmails: Array.from(contactedEmails),
        contactedDomains: Array.from(contactedDomains),
      },
    });
    shieldIndicator.textContent = 'Duplicate Shield (' + contactedEmails.size + ' protected)';
    followupBadge.textContent = String(followUpsList.length);
    if (followUpsList.length > 0) {
      chrome.runtime?.sendMessage({ type: 'KUROREACH_BADGE', count: followUpsList.length });
    }
    renderFollowupsTab();
    if (latestCapture) renderCaptureResults(latestCapture);
  } catch {
    renderFollowupsTab();
  }
}

function renderFollowupsTab() {
  followupsContainer.innerHTML = '';
  if (followUpsList.length === 0) {
    setStatus(followupStatus, 'No overdue 48h+ follow-ups right now. Keep pitching new clients!', 'ok');
    return;
  }
  setStatus(followupStatus, followUpsList.length + ' sent outreach thread(s) have no reply after 48h+. Send a quick nudge:', 'warn');
  followUpsList.slice(0, 30).forEach((item) => {
    const card = document.createElement('div');
    card.className = 'lead-card';
    card.innerHTML =
      '<div class="lead-info">' +
        '<div class="lead-head">' +
          '<div class="lead-title">' + esc(item.company || item.recipientName) + '</div>' +
          '<span class="badge-pitched">' + item.daysAgo + 'd ago</span>' +
        '</div>' +
        '<div class="lead-email">' + esc(item.recipientEmail) + '</div>' +
        '<div class="lead-meta">Re: ' + esc(item.subject) + '</div>' +
      '</div>' +
      '<button type="button" class="btn-mini">Nudge</button>';
    card.querySelector('button').addEventListener('click', () => {
      const su = encodeURIComponent('Re: ' + (item.subject || 'quick follow-up'));
      const body = encodeURIComponent(
        'Hi ' + ((item.recipientName || 'there').split(' ')[0]) + ',\\n\\nBumping this up briefly in case my earlier note got buried—open to taking a quick look for ' + (item.company || 'your team') + '?'
      );
      chrome.tabs.create({ url: 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(item.recipientEmail) + '&su=' + su + '&body=' + body });
    });
    followupsContainer.appendChild(card);
  });
}

refreshFollowupsBtn.addEventListener('click', syncContactedAndFollowups);

syncBtn.addEventListener('click', async () => {
  if (!latestCapture) return;
  syncBtn.disabled = true;
  setStatus(scrapeStatus, 'Syncing captured leads & running AI enrichment...', '');
  try {
    const syncedData = await callWorkspaceApi('/api/extension/ingest', 'POST', latestCapture);
    setStatus(scrapeStatus, 'Synced ' + syncedData.ingested + ' enriched leads to KuroReach.', 'ok');
    chrome.runtime.sendMessage({ type: 'KUROREACH_BADGE', count: syncedData.ingested });
  } catch (err) {
    setStatus(
      scrapeStatus,
      err?.code === 'AUTH_HTML_GATE'
        ? 'Private preview URL requires login. Paste your Shared URL or use Multi-Send > Open Gmail Tabs / Export CSV.'
        : 'Sync error: ' + err.message,
      'warn'
    );
  } finally {
    syncBtn.disabled = false;
  }
});

aiDraftBtn.addEventListener('click', async () => {
  aiDraftBtn.disabled = true;
  aiDraftBtn.textContent = 'Drafting...';
  setStatus(sendStatus, 'Crafting spam-safe freelance outreach pitch with AI...', '');
  try {
    const sampleCompanies = (latestCapture?.structuredItems || []).slice(0, 5).map((it) => ({
      company: it.company,
      website: it.website,
      needSignal: it.needSignal,
      location: it.location,
    }));
    const data = await callWorkspaceApi('/api/extension/freelancer-pitch', 'POST', {
      specialty: specialtySelect.value,
      serviceOffer: offerInput.value.trim(),
      portfolioUrl: bookingInput.value.trim() || DEFAULT_FREELANCER.portfolioUrl,
      senderName: senderNameInput.value.trim(),
      sampleCompanies,
      pageContext: latestCapture?.pageTitle || '',
    });
    pitchSubject.value = data.subjectA || pitchSubject.value;
    pitchBody.value = data.body || pitchBody.value;
    latestFollowUp1 = data.followUp1 || '';
    latestFollowUp2 = data.followUp2 || '';
    saveSettings();
    lintPitch();
    setStatus(sendStatus, 'AI Pitch ready (' + (data.angleName || 'Freelance Value Gap') + '). Review & send below.', 'ok');
  } catch (err) {
    setStatus(
      sendStatus,
      err?.code === 'AUTH_HTML_GATE'
        ? 'Set Shared URL in Tab 1 to use AI Drafting, or edit the template directly.'
        : 'AI Draft error: ' + err.message,
      'warn'
    );
  } finally {
    aiDraftBtn.disabled = false;
    aiDraftBtn.textContent = '✨ AI Draft';
  }
});

function showConfirm(message, onConfirm) {
  pendingConfirmAction = onConfirm;
  confirmText.textContent = message;
  confirmBox.classList.remove('hidden');
}

cancelConfirmBtn.addEventListener('click', () => {
  pendingConfirmAction = null;
  confirmBox.classList.add('hidden');
});

executeConfirmBtn.addEventListener('click', async () => {
  const fn = pendingConfirmAction;
  pendingConfirmAction = null;
  confirmBox.classList.add('hidden');
  if (fn) await fn();
});

function recordLocalSentEmails(emails) {
  emails.forEach((e) => contactedEmails.add(e.toLowerCase()));
  chrome.storage?.local.set({ kuroLocalSentEmails: Array.from(contactedEmails) });
}

queueMultiBtn.addEventListener('click', () => {
  const emails = parseRecipientEmails();
  if (emails.length === 0) {
    setStatus(sendStatus, 'Add or select at least 1 valid recipient email first.', 'warn');
    return;
  }
  showConfirm(
    'Confirm queuing ' + emails.length + ' client email(s) with subject "' + pitchSubject.value.trim() + '" into KuroReach Gmail Dispatch?',
    async () => {
      queueMultiBtn.disabled = true;
      setStatus(sendStatus, 'Queuing ' + emails.length + ' personalized client emails...', '');
      try {
        const itemsByEmail = new Map();
        (latestCapture?.structuredItems || []).forEach((it) => {
          if (it.email) itemsByEmail.set(it.email.toLowerCase(), it);
        });
        const recipients = emails.map((email) => {
          const item = itemsByEmail.get(email);
          const dom = email.split('@')[1] || '';
          const comp = item?.company || (dom ? dom.split('.')[0] : 'Client');
          return {
            email,
            name: item?.fullName || email.split('@')[0],
            company: comp,
            website: item?.website || (dom ? 'https://' + dom : ''),
            icebreaker:
              item?.suggestedIcebreaker ||
              (item?.needSignal
                ? 'Noticed ' + comp + ' (' + item.needSignal + ').'
                : 'Came across ' + comp + ' and wanted to share a quick note.'),
            painPoint: offerInput.value.trim() || specialtySelect.value,
          };
        });

        const res = await callWorkspaceApi('/api/extension/outreach-queue', 'POST', {
          recipients,
          sequenceName: 'Freelancer: ' + specialtySelect.value,
          freelancerService: offerInput.value.trim(),
          subject: pitchSubject.value.trim(),
          subjectVariantB: pitchSubject.value.trim(),
          body: pitchBody.value.trim(),
          followUp1: latestFollowUp1,
          followUp2: latestFollowUp2,
          slotIndex: Number(mailboxSelect.value) || 0,
        });

        recordLocalSentEmails(emails);
        setStatus(sendStatus, 'Queued ' + res.queuedCount + ' emails! Open KuroReach Dashboard to run tracked Gmail multi-send with Spam Guard.', 'ok');
        openDashboardBtn.classList.remove('hidden');
        chrome.runtime.sendMessage({ type: 'KUROREACH_BADGE', count: res.queuedCount });
      } catch (err) {
        setStatus(
          sendStatus,
          err?.code === 'AUTH_HTML_GATE'
            ? 'Paste your Shared URL in Tab 1 to sync directly, or click Open Gmail Tabs.'
            : 'Queue error: ' + err.message,
          'warn'
        );
      } finally {
        queueMultiBtn.disabled = false;
      }
    }
  );
});

gmailTabsBtn.addEventListener('click', () => {
  const emails = parseRecipientEmails();
  if (emails.length === 0) {
    setStatus(sendStatus, 'Add or select at least 1 valid recipient email first.', 'warn');
    return;
  }
  const batch = emails.slice(0, 10);
  showConfirm(
    'Open ' + batch.length + ' personalized Gmail compose tabs directly in Chrome?' + (emails.length > 10 ? ' (Capped at 10 tabs per click; use Queue in KuroReach Gmail for up to 200+ sends.)' : ''),
    async () => {
      const itemsByEmail = new Map();
      (latestCapture?.structuredItems || []).forEach((it) => {
        if (it.email) itemsByEmail.set(it.email.toLowerCase(), it);
      });
      batch.forEach((email, idx) => {
        const item = itemsByEmail.get(email);
        const dom = email.split('@')[1] || '';
        const company = item?.company || (dom ? dom.split('.')[0] : 'your team');
        const firstName = (item?.fullName || email.split('@')[0] || 'there').split(' ')[0];
        const icebreaker =
          item?.suggestedIcebreaker ||
          (item?.needSignal
            ? 'Noticed ' + company + ' (' + item.needSignal + ').'
            : 'Came across ' + company + ' while researching local leaders.');
        const painPoint = offerInput.value.trim() || specialtySelect.value;

        const interp = (txt) =>
          String(txt || '')
            .replace(/\\{\\{firstName\\}\\}/g, firstName)
            .replace(/\\{\\{company\\}\\}/g, company)
            .replace(/\\{\\{icebreaker\\}\\}/g, icebreaker)
            .replace(/\\{\\{painPoint\\}\\}/g, painPoint);

        const su = encodeURIComponent(interp(pitchSubject.value));
        const body = encodeURIComponent(interp(pitchBody.value));
        const url = 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(email) + '&su=' + su + '&body=' + body;
        setTimeout(() => {
          chrome.tabs.create({ url, active: idx === 0 });
        }, idx * 180);
      });
      recordLocalSentEmails(batch);
      setStatus(sendStatus, 'Launched ' + batch.length + ' personalized Gmail compose tabs & protected against duplicates.', 'ok');
    }
  );
});

openDashboardBtn.addEventListener('click', () => {
  const url = endpointInput.value.trim().replace(/\\/$/, '');
  if (url) chrome.tabs.create({ url });
});

csvBtn.addEventListener('click', () => {
  if (!latestCapture) return;
  const items = latestCapture.structuredItems || [];
  const rows = items.length
    ? items.map((it) => [it.company || it.fullName || '', it.email || '', it.phone || '', it.website || '', it.opportunityScore || '', it.needSignal || '', it.location || '', latestCapture.pageUrl || ''])
    : (latestCapture.rawEmails || []).map((em) => ['', em, '', '', '', '', '', latestCapture.pageUrl || '']);

  const csvEsc = (v) => '"' + String(v || '').replace(/"/g, '""') + '"';
  const headers = ['Company / Name', 'Email', 'Phone', 'Website', 'Opportunity Score', 'Freelance Need Signal', 'Location', 'Source URL'];
  const csv = [headers.map(csvEsc).join(','), ...rows.map((r) => r.map(csvEsc).join(','))].join('\\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'kuroreach-freelance-leads-' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setStatus(scrapeStatus, 'Exported ' + rows.length + ' audited client leads to CSV.', 'ok');
});

copyBtn.addEventListener('click', async () => {
  if (!latestCapture) return;
  const lines = [];
  if (latestCapture.structuredItems?.length) {
    latestCapture.structuredItems.forEach((it) => {
      lines.push([it.company, it.email, it.phone, it.website, it.needSignal, it.location].filter(Boolean).join(' | '));
    });
  } else {
    lines.push(latestCapture.rawText || '');
  }
  try {
    await navigator.clipboard.writeText(lines.join('\\n'));
    setStatus(scrapeStatus, 'Copied client leads to clipboard.', 'ok');
  } catch {
    setStatus(scrapeStatus, 'Clipboard permission denied in popup.', 'warn');
  }
});`;

  const backgroundJs = `chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'KUROREACH_BADGE') {
    chrome.action.setBadgeText({ text: msg.count ? String(msg.count) : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#09090B' });
  }
});

chrome.commands?.onCommand.addListener(async (command) => {
  if (command !== 'toggle-copilot') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;
  chrome.tabs.sendMessage(tab.id, { type: 'KUROREACH_TOGGLE_COPILOT' }, async () => {
    if (chrome.runtime.lastError) {
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
        chrome.tabs.sendMessage(tab.id, { type: 'KUROREACH_TOGGLE_COPILOT' });
      } catch {}
    }
  });
});`;

  const [icon16, icon48, icon128] = await Promise.all([
    renderMonochromeIconPng(16),
    renderMonochromeIconPng(48),
    renderMonochromeIconPng(128),
  ]);

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('popup.html', popupHtml);
  zip.file('popup.css', popupCss);
  zip.file('popup.js', popupJs);
  zip.file('content.js', contentJs);
  zip.file('background.js', backgroundJs);
  zip.file('icons/icon16.png', icon16);
  zip.file('icons/icon48.png', icon48);
  zip.file('icons/icon128.png', icon128);

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'kuroreach-freelancer-extension-mv3.zip';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
