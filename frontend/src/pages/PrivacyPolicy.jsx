import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { 
  ShieldCheck, 
  Lock, 
  Mail, 
  Calendar, 
  CheckSquare, 
  Cpu, 
  Trash2, 
  ExternalLink, 
  ArrowLeft, 
  Sun, 
  Moon, 
  AlertCircle, 
  Database,
  Key
} from 'lucide-react';

export default function PrivacyPolicy({ standalone = false }) {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'dark');

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('nx-theme', next); } catch { /* ignore */ }
  };

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="privacy-page-wrap">
      {/* Top Navigation Bar */}
      <header className="privacy-header">
        <div className="privacy-header-left">
          <div className="brand-mark" aria-hidden />
          <span style={{ fontWeight: 650, fontSize: 16 }}>Nexus Workspace</span>
        </div>
        <div className="privacy-header-right">
          <NavLink to="/" className="btn sm ghost" style={{ textDecoration: 'none' }}>
            <ArrowLeft size={14} />
            <span>Back to Workspace</span>
          </NavLink>
          <button 
            className="btn icon-btn sm" 
            onClick={toggleTheme} 
            aria-label="Toggle visual theme"
            title="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="privacy-container">
        {/* Hero Section */}
        <div className="privacy-hero">
          <div className="badge accent" style={{ width: 'fit-content' }}>
            <ShieldCheck size={14} /> Official Policy
          </div>
          <h1>Privacy Policy for Nexus Workspace</h1>
          <div className="privacy-meta-row">
            <span><strong>Application URL:</strong> <a href="https://nexus-1-f8zl.onrender.com/" target="_blank" rel="noopener noreferrer">https://nexus-1-f8zl.onrender.com/</a></span>
            <span>&bull;</span>
            <span><strong>Effective Date:</strong> October 23, 2026</span>
            <span>&bull;</span>
            <span><strong>Last Updated:</strong> October 23, 2026</span>
          </div>
        </div>

        {/* Table of Contents */}
        <nav className="privacy-toc-card" aria-label="Privacy Policy Table of Contents">
          <h3>Table of Contents</h3>
          <ul className="privacy-toc-grid">
            <li><a href="#overview">1. Overview & Identity</a></li>
            <li><a href="#data-collection">2. Data We Collect & Access</a></li>
            <li><a href="#google-scopes">3. Google API Permissions & Scopes</a></li>
            <li><a href="#limited-use">4. Google Limited Use Disclosure</a></li>
            <li><a href="#ai-processing">5. AI Model Providers & Processing</a></li>
            <li><a href="#storage-security">6. Data Storage & Security</a></li>
            <li><a href="#retention">7. Data Retention & Lifecycle</a></li>
            <li><a href="#disconnection-deletion">8. Disconnection & Data Deletion</a></li>
            <li><a href="#third-parties">9. Third-Party Sharing</a></li>
            <li><a href="#user-rights">10. User Rights & Consent</a></li>
            <li><a href="#children">11. Children's Privacy</a></li>
            <li><a href="#changes-contact">12. Changes & Contact Info</a></li>
          </ul>
        </nav>

        {/* Section 1: Overview */}
        <section id="overview" className="privacy-section">
          <h2>1. Overview & Application Identity</h2>
          <p>
            Welcome to <strong>Nexus Workspace</strong> (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;the Application&rdquo;), hosted at{' '}
            <a href="https://nexus-1-f8zl.onrender.com/" target="_blank" rel="noopener noreferrer">
              https://nexus-1-f8zl.onrender.com/
            </a>.
          </p>
          <p>
            Nexus Workspace is an AI-powered personal productivity assistant designed to help individual users organize daily tasks, inspect calendar commitments, review and compose emails, and manage workflows through an intuitive, conversational interface.
          </p>
          <p>
            We take your personal data privacy seriously. This Privacy Policy details how Nexus Workspace accesses, uses, stores, protects, and handles information, with specific disclosures regarding our integration with <strong>Google APIs</strong> and <strong>Artificial Intelligence (AI) model providers</strong>.
          </p>
        </section>

        {/* Section 2: Data We Collect */}
        <section id="data-collection" className="privacy-section">
          <h2>2. Data We Collect & Access</h2>
          <p>Nexus Workspace only collects and accesses data strictly necessary to fulfill features you explicitly interact with:</p>
          
          <ul>
            <li>
              <strong>Google Account Profile:</strong> Your primary Google account email address to authenticate your session and display your connected identity in settings.
            </li>
            <li>
              <strong>Gmail Data:</strong> Email metadata (sender, recipient, date, subject line) and email bodies when you request the assistant to search, summarize, or view your inbox. When composing or sending an email, we process the draft text you provide.
            </li>
            <li>
              <strong>Google Calendar Data:</strong> Event titles, descriptions, start/end dates and times, locations, and attendee information to provide scheduling summaries and create/modify calendar appointments at your command.
            </li>
            <li>
              <strong>Google Tasks Data:</strong> Task list titles, task items, due dates, notes, and completion statuses to help you track and update to-do items.
            </li>
            <li>
              <strong>Assistant Conversations & Memories:</strong> User-submitted chat messages, interaction history, and custom facts you explicitly tell the assistant to remember (e.g., &ldquo;remember my home airport is DEL&rdquo;).
            </li>
            <li>
              <strong>Local Preferences:</strong> Interface preferences such as visual theme (dark/light), default weather location, timezone, and transcript review preferences.
            </li>
            <li>
              <strong>Session Cookies:</strong> A randomized session cookie (<code>nexus_sid</code>) and cryptographic CSRF tokens to maintain authenticated state and prevent cross-site request forgery attacks.
            </li>
          </ul>

          <div className="privacy-callout warning">
            <strong>What We Never Collect:</strong> Nexus Workspace does not collect payment cards, bank account details, government-issued identification numbers, precise GPS background location, or biometric identifiers.
          </div>
        </section>

        {/* Section 3: Google API Permissions */}
        <section id="google-scopes" className="privacy-section">
          <h2>3. Google API Permissions & OAuth Scopes</h2>
          <p>
            When you choose to connect your Google Account in Nexus Workspace, the application requests access to specific Google OAuth scopes. Below is a comprehensive, granular breakdown of each scope and its purpose:
          </p>

          <table className="scope-table" aria-label="Google OAuth Scopes Requested">
            <thead>
              <tr>
                <th style={{ width: '38%' }}>OAuth Scope</th>
                <th style={{ width: '22%' }}>Classification</th>
                <th>Exact Purpose in Nexus Workspace</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><span className="scope-code">.../auth/userinfo.email</span></td>
                <td><span className="badge ok">Basic Identity</span></td>
                <td>To display your connected Google account in the topbar and settings.</td>
              </tr>
              <tr>
                <td><span className="scope-code">.../auth/gmail.readonly</span></td>
                <td><span className="badge bad">Restricted</span></td>
                <td>To fetch, search, and summarize your email inbox when you ask the assistant (e.g., &ldquo;what are my recent unread emails?&rdquo;).</td>
              </tr>
              <tr>
                <td><span className="scope-code">.../auth/gmail.compose</span></td>
                <td><span className="badge bad">Restricted</span></td>
                <td>To create drafts and send outbound emails solely upon your explicit instruction and interactive confirmation.</td>
              </tr>
              <tr>
                <td><span className="scope-code">.../auth/calendar.readonly</span></td>
                <td><span className="badge warn">Sensitive</span></td>
                <td>To read upcoming calendar appointments and provide schedule briefings and daily agendas.</td>
              </tr>
              <tr>
                <td><span className="scope-code">.../auth/calendar.events</span></td>
                <td><span className="badge warn">Sensitive</span></td>
                <td>To schedule, edit, or delete calendar events at your direct request.</td>
              </tr>
              <tr>
                <td><span className="scope-code">.../auth/tasks</span></td>
                <td><span className="badge warn">Sensitive</span></td>
                <td>To view, create, update, and complete tasks in your Google Tasks lists.</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Section 4: Limited Use Policy */}
        <section id="limited-use" className="privacy-section">
          <h2>4. Google API Services User Data Policy & Limited Use Disclosure</h2>
          
          <div className="privacy-callout highlight">
            <p style={{ fontSize: '14.5px', fontWeight: 600 }}>
              Nexus Workspace&apos;s use and transfer to any other app of information received from Google APIs will adhere to the{' '}
              <a 
                href="https://developers.google.com/terms/api-services-user-data-policy" 
                target="_blank" 
                rel="noopener noreferrer"
                style={{ textDecoration: 'underline' }}
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements.
            </p>
          </div>

          <p>In compliance with the Google Limited Use requirements, we explicitly confirm:</p>
          <ol>
            <li>
              <strong>No AI Model Training:</strong> Google user data obtained via Google APIs (including email contents, contacts, calendar events, and tasks) is <strong>never</strong> used to train, develop, or fine-tune generalized artificial intelligence (AI), machine learning (ML), or large language models (LLMs).
            </li>
            <li>
              <strong>Strict Feature Limitation:</strong> We only use access to Google user data to provide or improve user-facing features that are prominent in the Nexus Workspace user interface.
            </li>
            <li>
              <strong>No Data Transfers to Third Parties:</strong> Google user data is not transferred to external third parties, except as strictly necessary to fulfill user-requested features (such as sending prompts to the configured AI inference API solely to answer the user&apos;s direct query), to comply with applicable law, or as part of a merger or acquisition with prior user notification.
            </li>
            <li>
              <strong>No Advertising or Monetization:</strong> Google user data is never used for serving advertisements, retargeted advertising, personalized marketing, or sold to data brokers or advertising exchanges.
            </li>
            <li>
              <strong>No Unauthorized Human Reading:</strong> No human is permitted to read your private Google user data unless:
              <ul style={{ marginTop: 6 }}>
                <li>You have given explicit, affirmative permission for specific messages or items during technical support;</li>
                <li>It is necessary for security purposes (such as investigating abuse or diagnosing system failure);</li>
                <li>It is required to comply with applicable law or legal process; or</li>
                <li>The data is aggregated and anonymized for internal technical operations.</li>
              </ul>
            </li>
          </ol>
        </section>

        {/* Section 5: AI Providers */}
        <section id="ai-processing" className="privacy-section">
          <h2>5. AI Model Providers & Data Processing</h2>
          <p>
            Nexus Workspace operates as an intelligent assistant using advanced Language Models to understand natural language prompts and assist you. Here is full transparency regarding how AI inference works:
          </p>

          <ul>
            <li>
              <strong>Cloud AI Inference (Groq Cloud API):</strong> When using cloud processing, Nexus Workspace utilizes the Groq Cloud API (e.g., <code>qwen/qwen3.8-27b</code> model). When you prompt the assistant with a request that involves your Google data (e.g., &ldquo;summarize my emails from today&rdquo; or &ldquo;add a meeting with Rahul on Friday&rdquo;), the minimum necessary contextual snippets are transmitted over TLS-encrypted connections to Groq strictly to generate the text completion. Groq processes API requests in accordance with their enterprise API terms, which explicitly state that API data is not retained or used to train foundation models.
            </li>
            <li>
              <strong>Local AI Inference (Ollama):</strong> When configured to run locally via Ollama (e.g., <code>qwen3:4b</code>), all AI processing executes completely on the local host machine. In this mode, no prompt text, personal data, or Google data ever leaves your computer for AI reasoning.
            </li>
          </ul>

          <p>
            <strong>On-Demand Processing:</strong> Data is never pushed to AI models in bulk. Context is passed to the AI inference engine solely when triggered by a direct user instruction or scheduled insight check initiated by your settings.
          </p>
        </section>

        {/* Section 6: Storage and Security */}
        <section id="storage-security" className="privacy-section">
          <h2>6. Data Storage & Technical Security Safeguards</h2>
          <p>We implement multi-layered architectural safeguards to protect your personal information:</p>

          <div className="privacy-callout security">
            <strong>Token Encryption at Rest (AES-256-GCM):</strong> All OAuth access and refresh tokens received from Google are encrypted at rest using industry-standard <strong>AES-256-GCM</strong> (Galois/Counter Mode) encryption before being saved to our secure SQLite database (<code>nexus.db</code>).
          </div>

          <ul>
            <li>
              <strong>Encryption in Transit:</strong> All communications between your web browser, our application server, Google APIs, and external AI providers utilize Transport Layer Security (HTTPS / TLS 1.3).
            </li>
            <li>
              <strong>Human-In-The-Loop (HITL) Action Guard:</strong> Sensitive or state-changing actions (such as sending an email or deleting an event) are staged in a pending state and require your explicit, interactive confirmation in the user interface before execution.
            </li>
            <li>
              <strong>Session Protection & CSRF Defenses:</strong> Session identifiers are stored in secure <code>HttpOnly</code>, <code>SameSite=Lax</code> cookies. State-changing requests are guarded by HMAC SHA-256 CSRF verification and strict origin checks.
            </li>
            <li>
              <strong>Certification Notice:</strong> While we employ industry-standard encryption algorithms and secure coding practices, Nexus Workspace does not hold formal third-party compliance certifications (such as SOC-2, ISO-27001, or HIPAA).
            </li>
          </ul>
        </section>

        {/* Section 7: Retention */}
        <section id="retention" className="privacy-section">
          <h2>7. Data Retention & Automatic Purging</h2>
          <p>You have direct, configurable control over how long your interaction data is retained:</p>
          <ul>
            <li>
              <strong>Configurable Retention Periods:</strong> In <strong>Settings &rarr; Privacy and memory</strong>, you can set conversation history retention to <em>Never expire (0)</em>, <em>30 days</em>, <em>90 days</em>, or <em>365 days</em>. Chats older than your selected threshold are automatically purged on server startup.
            </li>
            <li>
              <strong>Ephemeral History Mode:</strong> If you disable the &ldquo;Save conversation history&rdquo; toggle, conversations and message logs are treated as ephemeral and automatically deleted upon server restart.
            </li>
            <li>
              <strong>Token Retention:</strong> Google OAuth tokens are retained only while your account remains actively connected. Disconnecting Google immediately purges the tokens from storage.
            </li>
          </ul>
        </section>

        {/* Section 8: Disconnection & Deletion */}
        <section id="disconnection-deletion" className="privacy-section">
          <h2>8. Account Disconnection & Permanent Data Deletion</h2>
          <p>Nexus Workspace provides frictionless methods to disconnect services and permanently delete your data at any time:</p>
          
          <div className="grid-2" style={{ marginTop: 8 }}>
            <div className="card" style={{ padding: 16 }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, marginBottom: 8 }}>
                <Key size={16} /> Disconnecting Google
              </h3>
              <p style={{ fontSize: 13 }}>
                Navigate to <strong>Settings &rarr; Connections &rarr; Google</strong> and click <strong>Disconnect</strong>. This immediately invokes a hard delete of your Google OAuth tokens from the database.
              </p>
            </div>
            <div className="card" style={{ padding: 16 }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, marginBottom: 8 }}>
                <Trash2 size={16} /> Deleting All Conversations
              </h3>
              <p style={{ fontSize: 13 }}>
                Navigate to <strong>Settings &rarr; Privacy and memory</strong> and click <strong>Delete all conversations</strong>. This permanently removes every conversation, message, and stored memory.
              </p>
            </div>
          </div>

          <p style={{ marginTop: 12 }}>
            <strong>Revoking Access Directly in Google:</strong> You can independently revoke Nexus Workspace&apos;s access to your Google Account at any time through Google&apos;s central security settings:{' '}
            <a 
              href="https://myaccount.google.com/permissions" 
              target="_blank" 
              rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              Google Account Third-party Permissions <ExternalLink size={13} />
            </a>.
          </p>
        </section>

        {/* Section 9: Third Parties */}
        <section id="third-parties" className="privacy-section">
          <h2>9. Third-Party Services & Subprocessors</h2>
          <p>We work with trusted third-party providers solely to host the application and enable requested features:</p>
          <ul>
            <li><strong>Google LLC:</strong> Identity authentication, Gmail API, Google Calendar API, Google Tasks API.</li>
            <li><strong>Groq Inc.:</strong> High-speed cloud AI model inference for chat completions (when cloud AI mode is active).</li>
            <li><strong>Render Services Inc.:</strong> Cloud infrastructure provider hosting the web application deployment.</li>
            <li><strong>Open-Meteo:</strong> Weather forecasts requested by geographic location name (no personal user identity is shared).</li>
            <li><strong>NewsAPI:</strong> General public news headlines (no personal user identity is shared).</li>
          </ul>
          <p>
            We do <strong>not</strong> sell, lease, or monetize your personal information to any third party for commercial gain.
          </p>
        </section>

        {/* Section 10: User Rights */}
        <section id="user-rights" className="privacy-section">
          <h2>10. User Rights & Consent</h2>
          <p>Depending on your jurisdiction, you have fundamental rights regarding your personal information, including:</p>
          <ul>
            <li>The right to access and inspect data held about you;</li>
            <li>The right to correct or update inaccurate personal information;</li>
            <li>The right to withdraw consent and disconnect integrated services at any time; and</li>
            <li>The right to request complete deletion of all personal data held by the application.</li>
          </ul>
        </section>

        {/* Section 11: Children's Privacy */}
        <section id="children" className="privacy-section">
          <h2>11. Children&apos;s Privacy</h2>
          <p>
            Nexus Workspace is not intended for or directed toward individuals under the age of 13 (or under 16 in the European Union). We do not knowingly collect or solicit personal information from children. If you become aware that a child has provided us with personal information without parental consent, please contact us immediately to remove the data.
          </p>
        </section>

        {/* Section 12: Changes & Contact */}
        <section id="changes-contact" className="privacy-section">
          <h2>12. Policy Changes & Contact Information</h2>
          <p>
            We may update this Privacy Policy from time to time to reflect operational, legal, or regulatory modifications. When updates are published, the &ldquo;Last Updated&rdquo; date at the top of this document will be revised accordingly. We encourage you to review this policy periodically.
          </p>
          
          <div className="card" style={{ marginTop: 12, background: 'var(--surface-2)', padding: 18 }}>
            <h3 style={{ fontSize: 15, marginBottom: 8 }}>Contact Data Controller / Developer</h3>
            <p style={{ fontSize: 13.5, marginBottom: 6 }}>
              For any questions, concerns, feedback, or requests regarding this Privacy Policy or your personal data, please contact:
            </p>
            <ul style={{ listStyle: 'none', paddingLeft: 0, fontSize: 13.5, display: 'grid', gap: 6 }}>
              <li><strong>Developer / Maintainer:</strong> Sachin Verma</li>
              <li><strong>Contact Email:</strong> <a href="mailto:sachinverma964839@gmail.com">sachinverma964839@gmail.com</a></li>
              <li><strong>Application Domain:</strong> <a href="https://nexus-1-f8zl.onrender.com/" target="_blank" rel="noopener noreferrer">https://nexus-1-f8zl.onrender.com/</a></li>
            </ul>
          </div>
        </section>
      </main>

      {/* Website Footer */}
      <footer className="app-footer">
        <div>
          &copy; {new Date().getFullYear()} Nexus Workspace. All rights reserved.
        </div>
        <nav className="footer-nav" aria-label="Footer links">
          <NavLink to="/">Workspace Home</NavLink>
          <NavLink to="/privacy-policy" style={{ color: 'var(--text)', fontWeight: 550 }}>Privacy Policy</NavLink>
          <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
            Google User Data Policy
          </a>
        </nav>
      </footer>
    </div>
  );
}
