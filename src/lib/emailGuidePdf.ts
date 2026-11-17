import { jsPDF } from 'jspdf';

export function downloadEmailGuidePdf(): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 46;
  const contentWidth = pageWidth - margin * 2;
  let y = 52;

  const drawFooter = (pageNum: number, totalPages: number) => {
    doc.setDrawColor(225, 228, 232);
    doc.setLineWidth(0.75);
    doc.line(margin, pageHeight - 42, pageWidth - margin, pageHeight - 42);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(113, 113, 122);
    doc.text(
      'KuroReach — Cold Email Volume, Anti-Spam & Deliverability Playbook',
      margin,
      pageHeight - 26
    );
    doc.text(`Page ${pageNum} of ${totalPages}`, pageWidth - margin, pageHeight - 26, {
      align: 'right',
    });
  };

  const ensureSpace = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - 62) {
      doc.addPage();
      y = 52;
    }
  };

  const drawSectionHeading = (num: string, title: string) => {
    ensureSpace(46);
    y += 8;
    doc.setFillColor(18, 19, 23);
    doc.roundedRect(margin, y, 26, 20, 3, 3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(num, margin + 13, y + 13.5, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(9, 9, 11);
    doc.text(title, margin + 36, y + 14.5);
    y += 28;
    doc.setDrawColor(228, 228, 231);
    doc.setLineWidth(0.75);
    doc.line(margin, y, pageWidth - margin, y);
    y += 14;
  };

  const drawParagraph = (text: string, fontSize = 10, color: [number, number, number] = [63, 63, 70]) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(fontSize);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text, contentWidth) as string[];
    ensureSpace(lines.length * (fontSize * 1.45) + 6);
    doc.text(lines, margin, y);
    y += lines.length * (fontSize * 1.45) + 6;
  };

  const drawBullet = (label: string, detail: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    const fullText = `${label}: ${detail}`;
    const lines = doc.splitTextToSize(fullText, contentWidth - 18) as string[];
    ensureSpace(lines.length * 14.5 + 5);

    doc.setFillColor(9, 9, 11);
    doc.circle(margin + 5, y - 3, 2, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(39, 39, 42);
    doc.text(lines, margin + 16, y);
    y += lines.length * 14.5 + 5;
  };

  // Cover Header Banner
  doc.setFillColor(9, 9, 11);
  doc.roundedRect(margin, y, contentWidth, 92, 6, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(161, 161, 170);
  doc.text('KUROREACH DELIVERABILITY HANDBOOK', margin + 20, y + 24);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.setTextColor(255, 255, 255);
  doc.text('Cold Email Volume & Anti-Spam Guide', margin + 20, y + 48);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(212, 212, 216);
  doc.text(
    'Advisable daily sending limits, Google Workspace warmup schedules, spam-avoidance rules & recovery.',
    margin + 20,
    y + 70
  );
  y += 114;

  // Section 1: Advisable Daily Sending Volume
  drawSectionHeading('01', 'How Many Emails Should You Send Per Day?');
  drawParagraph(
    'Google evaluates sender reputation per mailbox and per domain. Exceeding safe daily volumes or sending cold emails too fast triggers 550 5.4.5 quota blocks or routes future emails straight into Promotions/Spam. Always scale volume gradually by mailbox age and spread volume across multiple connected mailboxes.'
  );

  // Volume Comparison Table
  const tableRows: Array<[string, string, string, string]> = [
    ['Account Type & Age', 'Safe Cold Emails/Day', 'Google Hard Cap', 'Recommended Interval'],
    ['New Free @gmail.com (Days 1-14)', '10 - 25 / day', '500 / day', '45 - 60 sec + manual warmup'],
    ['Aged Free @gmail.com (30+ days)', '50 - 120 / day', '500 / day', '30 - 45 sec between sends'],
    ['New Workspace Domain (Weeks 1-2)', '15 - 35 / day', '2,000 / day', '45 sec between sends'],
    ['Warmed Workspace (Weeks 3-6)', '60 - 120 / day', '2,000 / day', '25 - 45 sec between sends'],
    ['Mature 3-Slot Pool (3 Domains)', '300 - 450 / day total', '6,000 / day total', 'Round-Robin + 30s stagger'],
  ];

  ensureSpace(tableRows.length * 26 + 14);
  const colWidths = [165, 110, 95, contentWidth - 370];
  tableRows.forEach((row, rIdx) => {
    const isHeader = rIdx === 0;
    const rowH = 24;
    if (isHeader) {
      doc.setFillColor(24, 24, 27);
      doc.rect(margin, y, contentWidth, rowH, 'F');
    } else if (rIdx % 2 === 1) {
      doc.setFillColor(244, 244, 245);
      doc.rect(margin, y, contentWidth, rowH, 'F');
    }
    doc.setDrawColor(228, 228, 231);
    doc.rect(margin, y, contentWidth, rowH, 'S');

    let x = margin + 8;
    row.forEach((cell, cIdx) => {
      doc.setFont('helvetica', isHeader || cIdx === 1 ? 'bold' : 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(isHeader ? 255 : 24, isHeader ? 255 : 24, isHeader ? 255 : 27);
      doc.text(cell, x, y + 15.5);
      x += colWidths[cIdx];
    });
    y += rowH;
  });
  y += 18;

  // Section 2: 6-Week Warmup Schedule
  drawSectionHeading('02', 'Recommended 6-Week Mailbox Warmup Schedule');
  drawParagraph(
    'Never take a brand-new Gmail or custom domain and blast 150 cold prospects on Day 1. Follow this ramp schedule so Google trust signals establish naturally before scaling:'
  );
  drawBullet('Week 1 (Days 1 - 7)', 'Send 10 to 15 emails/day. Prioritize contacts likely to reply or mark important.');
  drawBullet('Week 2 (Days 8 - 14)', 'Increase to 25 to 35 emails/day. Keep bounce rate strictly under 2%.');
  drawBullet('Week 3 (Days 15 - 21)', 'Scale to 50 to 65 emails/day across staggered morning and afternoon windows.');
  drawBullet('Week 4 (Days 22 - 30)', 'Increase to 80 to 100 emails/day with A/B subject lines enabled.');
  drawBullet('Week 5 - 6+', 'Hold steady at 100 to 150 cold emails/day per inbox. Add extra Gmail slots instead of pushing one inbox past 200 cold touches/day.');
  y += 6;

  // Section 3: How to Avoid Google Spam Folders
  drawSectionHeading('03', '9 Rules to Stay Out of the Spam Folder');
  drawBullet('1. Authenticate DNS First', 'Verify MX, SPF (v=spf1 include:_spf.google.com ~all), 2048-bit DKIM, and DMARC in Mailboxes & DNS before launching any campaign.');
  drawBullet('2. Plain-Text First Copy', 'Send lightweight emails that look like 1-on-1 messages from a colleague. Skip heavy HTML banners, bright buttons, and embedded promotional flyers.');
  drawBullet('3. Limit Links on Email #1', 'Include 0 to 1 clean link maximum in your first touch. Multiple URLs or link shorteners (bit.ly, tinyurl) sharply raise spam scores.');
  drawBullet('4. Ban Spam Trigger Words', 'Never use: "free", "guarantee", "100%", "act now", "limited time", "urgent", "click here", "buy now", "discount", "double your revenue", or ALL CAPS.');
  drawBullet('5. Keep Pitches 45 - 85 Words', 'Emails under 90 words earn the highest reply rates and pass heuristic spam filters cleanly. Lead with {{icebreaker}} relevance.');
  drawBullet('6. Lowercase Curiosity Subjects', 'Use 2 to 4 word conversational subjects such as "{{company}} <> quick idea" or "quick question, {{firstName}}". Avoid exclamation marks.');
  drawBullet('7. Verify Emails & MX Records', 'Sending to dead or invalid addresses raises your bounce rate. Google penalizes domains above 3% bounce rate—always keep bounces < 2%.');
  drawBullet('8. Respect Pacing & Batch Bursts', 'Never send more than 20 - 30 emails per hour from one inbox. Use KuroReach 15s - 45s send stagger and Round-Robin slot rotation.');
  drawBullet('9. Make Opt-Out Effortless', 'Close with a polite, low-friction line ("Let me know if timing is off and I will close the loop") so uninterested prospects reply or decline instead of hitting Report Spam.');
  y += 6;

  // Section 4: High-Converting Freelancer & B2B Structure
  drawSectionHeading('04', 'High-Converting 3-Touch Sequence Blueprint');
  drawParagraph(
    'Most replies happen on Touch 2 or Touch 3, not Touch 1. Space follow-ups politely and stop immediately once someone replies:'
  );
  drawBullet('Step 1 (Day 0)', 'Specific observation ({{icebreaker}}) + 1 clear pain/opportunity + soft Yes/No CTA ("Worth sending a 60-second teardown for {{company}}?").');
  drawBullet('Step 2 (Day 3)', 'Reply in the same thread ("Re: {{subject}}"). Add one concrete proof point or angle without guilt-tripping.');
  drawBullet('Step 3 (Day 7)', 'Polite breakup note closing the loop gracefully. Often generates the highest honest reply rate.');
  y += 6;

  // Section 5: Emergency Auto-Pause & Recovery Protocol
  drawSectionHeading('05', 'What To Do If Google Flags Spam or Blocks Sending');
  drawParagraph(
    'If KuroReach Guardrail pauses a mailbox after detecting a Gmail Spam folder placement, 550 5.7.1 rejection, or 550 5.4.5 daily quota error, follow this recovery checklist before resuming:'
  );
  drawBullet('Pause & Rest 48 - 72 Hours', 'Leave the affected mailbox paused for at least 48 hours while shifting active queues to your healthy backup Gmail slots.');
  drawBullet('Run Live DNS Inspection', 'Check Mailboxes & DNS to verify SPF, DKIM, and DMARC records are green with no typos or missing includes.');
  drawBullet('Rewrite & Audit Copy', 'Run your email copy through Sequence Studio AI Spam Audit to strip risky phrases, cut links, and tighten below 75 words.');
  drawBullet('Warm With Real Replies', 'Have trusted colleagues or secondary inboxes reply to threads on that mailbox and move any flagged messages out of Spam ("Not Spam").');
  drawBullet('Restart at 25% Volume', 'When resuming, drop daily volume to 20 - 30/day with a 45s send interval for 5 days before scaling back up.');

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawFooter(p, totalPages);
  }

  doc.save('KuroReach-Email-Outreach-Deliverability-Guide.pdf');
}

export function downloadAppManualPdf(): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 46;
  const contentWidth = pageWidth - margin * 2;
  let y = 52;

  const drawFooter = (pageNum: number, totalPages: number) => {
    doc.setDrawColor(225, 228, 232);
    doc.setLineWidth(0.75);
    doc.line(margin, pageHeight - 42, pageWidth - margin, pageHeight - 42);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(113, 113, 122);
    doc.text(
      'KuroReach — Complete Platform User Manual & Freelancer Workflow',
      margin,
      pageHeight - 26
    );
    doc.text(`Page ${pageNum} of ${totalPages}`, pageWidth - margin, pageHeight - 26, {
      align: 'right',
    });
  };

  const ensureSpace = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - 62) {
      doc.addPage();
      y = 52;
    }
  };

  const drawSectionHeading = (num: string, title: string) => {
    ensureSpace(46);
    y += 8;
    doc.setFillColor(18, 19, 23);
    doc.roundedRect(margin, y, 28, 20, 3, 3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(num, margin + 14, y + 13.5, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13.5);
    doc.setTextColor(9, 9, 11);
    doc.text(title, margin + 38, y + 14.5);
    y += 28;
    doc.setDrawColor(228, 228, 231);
    doc.setLineWidth(0.75);
    doc.line(margin, y, pageWidth - margin, y);
    y += 14;
  };

  const drawParagraph = (text: string, fontSize = 10, color: [number, number, number] = [63, 63, 70]) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(fontSize);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text, contentWidth) as string[];
    ensureSpace(lines.length * (fontSize * 1.45) + 6);
    doc.text(lines, margin, y);
    y += lines.length * (fontSize * 1.45) + 6;
  };

  const drawBullet = (label: string, detail: string) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const fullText = `${label}: ${detail}`;
    const lines = doc.splitTextToSize(fullText, contentWidth - 18) as string[];
    ensureSpace(lines.length * 14.5 + 5);

    doc.setFillColor(9, 9, 11);
    doc.circle(margin + 5, y - 3, 2, 'F');

    doc.setTextColor(39, 39, 42);
    doc.text(lines, margin + 16, y);
    y += lines.length * 14.5 + 5;
  };

  // Cover Header
  doc.setFillColor(9, 9, 11);
  doc.roundedRect(margin, y, contentWidth, 94, 6, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(161, 161, 170);
  doc.text('KUROREACH PLATFORM MANUAL', margin + 20, y + 24);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.setTextColor(255, 255, 255);
  doc.text('How KuroReach Works: End-to-End Guide', margin + 20, y + 49);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(212, 212, 216);
  doc.text(
    'Step-by-step guide to lead scraping, AI email sequences, Gmail multi-send, Spam Guard & Chrome Extension.',
    margin + 20,
    y + 72
  );
  y += 116;

  // Step 1
  drawSectionHeading('01', 'Connect Mailboxes & Verify DNS (Mailboxes & DNS)');
  drawParagraph(
    'KuroReach lets you connect up to 3 Gmail or Google Workspace mailboxes across Slots 01-03 so you can scale daily volume safely without overloading a single inbox.'
  );
  drawBullet(
    'App Password / SMTP (Recommended for Everyone)',
    'Enable 2-Step Verification on your Google Account, generate a 16-character App Password, and enter it with your Gmail address. Works immediately for any user without OAuth tester restrictions.'
  );
  drawBullet(
    'Sign in with Google (OAuth)',
    'Authorizes gmail.send plus gmail.readonly so KuroReach can automatically scan your Sent threads, Bounces, and Spam folder.'
  );
  drawBullet(
    'Live DNS Inspector',
    'Run the DNS diagnostic on your domain to verify MX, SPF, DKIM, and DMARC records and receive a score out of 100 before sending campaigns.'
  );

  // Step 2
  drawSectionHeading('02', 'Find & Verify Prospects (AI Lead Scraper)');
  drawParagraph(
    'Source targeted commercial decision-makers and client emails in batches from 10 up to 200 leads per run, with automatic MX validation and AI personalization.'
  );
  drawBullet(
    'Web Search Mode',
    'Describe your Ideal Customer Profile (e.g., "UK Dental Clinics" or "Series A SaaS Founders") and your offer context. Leads stream into your table in real-time waves using Google Search Grounding.'
  );
  drawBullet(
    'URL Crawl Mode',
    'Paste company or directory URLs (one per line) to crawl pages and extract verified contacts, roles, and websites.'
  );
  drawBullet(
    'Raw DOM / Text Mode',
    'Paste raw webpage text, CSV rows, or Google Maps listings to turn unstructured snippets into clean, MX-checked leads with custom {{icebreaker}} and {{painPoint}} fields.'
  );

  // Step 3
  drawSectionHeading('03', 'Craft & Audit Copy (Sequence Studio)');
  drawParagraph(
    'Write spam-safe, high-converting 3-step email sequences using either the conversational AI Strategist or the manual Sequence Matrix.'
  );
  drawBullet(
    'Chat AI Strategist',
    'Prompt the AI in plain English (e.g., "Make it shorter for local clinics" or "Add a stronger CTA"). Every draft includes a Deliverability Score, Conversion Score, and live Spam-Risk Audit.'
  );
  drawBullet(
    '3-Step Cadence & A/B Subjects',
    'Configure Step 1 (Day 0 Initial Pitch), Step 2 (48h Follow-up if unopened), and Step 3 (96h Breakup note if no reply) with Subject Variant A & Variant B testing.'
  );
  drawBullet(
    'Dynamic Variables',
    'Include {{firstName}}, {{company}}, {{icebreaker}}, and {{painPoint}} so every lead receives a personalized 1-to-1 message automatically.'
  );

  // Step 4
  drawSectionHeading('04', 'Dispatch Safely with Google Guardrail (Tracking & Send)');
  drawParagraph(
    'Dispatch campaigns with explicit pre-send confirmation, open/reply tracking, smart slot rotation, and automatic protection against Gmail spam flags or quota blocks.'
  );
  drawBullet(
    'Round-Robin vs. Active Slot',
    'Use Round-Robin to distribute sends evenly across all healthy connected slots. If one slot hits a limit, KuroReach fails over remaining leads to healthy slots.'
  );
  drawBullet(
    'Send Interval Pacing',
    'Choose 1s, 2s, 15s, or 45s safe warm intervals between sends to mimic natural human behavior.'
  );
  drawBullet(
    'Google Auto-Pause & Watchdog',
    'If Google returns a spam block (550 5.7.1), daily limit (550 5.4.5), or places mail in Spam (checked every 45s on OAuth slots), KuroReach immediately pauses the slot, fires an alert banner/notification, and keeps remaining leads queued.'
  );

  // Step 5
  drawSectionHeading('05', 'Freelancer Chrome Extension (MV3 Multi-Outreach)');
  drawParagraph(
    'Configure your Freelance Niche Preset, Service Offer, and Sign-Off Name in the Chrome Extension tab, then click Download Freelancer Extension (.zip) and load it unpacked at chrome://extensions.'
  );
  drawBullet(
    'Tab 1 - Scrape Clients',
    'Visit Google Maps or any client site and click Scrape Clients. Detects emails, phones, websites, and Freelancer Need Signals (No Website Listed, Unsecured HTTP Website, Direct Email).'
  );
  drawBullet(
    'Tab 2 - Multi-Send',
    'Select scraped clients or paste up to 200 emails, click AI Draft Pitch, check the live Spam-Safety meter, and confirm either Queue in KuroReach Gmail (1-click sync to Tracking & Send) or Open Gmail Tabs.'
  );

  // Step 6 & 7
  drawSectionHeading('06', 'Command Overview & Email Deliverability Guide');
  drawBullet(
    'Command Overview',
    'Monitor Daily Pool Capacity, Open Rate, Reply Rate, MX-Verified Leads, 7-day send telemetry, and domain DNS health scores.'
  );
  drawBullet(
    'Email Guide',
    'Check safe daily email limits by mailbox age, follow the 6-week warmup schedule, review banned spam trigger words, and download printable PDF guides anytime.'
  );

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawFooter(p, totalPages);
  }

  doc.save('KuroReach-How-This-App-Works-Guide.pdf');
}
