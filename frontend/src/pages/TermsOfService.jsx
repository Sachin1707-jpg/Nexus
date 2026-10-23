import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { 
  FileText, 
  ShieldCheck, 
  Key, 
  Mail, 
  Calendar, 
  CheckSquare, 
  Cpu, 
  AlertTriangle, 
  ExternalLink, 
  ArrowLeft, 
  Sun, 
  Moon, 
  RefreshCw,
  HelpCircle,
  Lock,
  UserCheck
} from 'lucide-react';

export default function TermsOfService({ standalone = false }) {
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
            <FileText size={14} /> Legal Terms
          </div>
          <h1>Terms of Service for Nexus Workspace</h1>
          <div className="privacy-meta-row">
            <span><strong>Application URL:</strong> <a href="https://nexus-1-f8zl.onrender.com/" target="_blank" rel="noopener noreferrer">https://nexus-1-f8zl.onrender.com/</a></span>
            <span>&bull;</span>
            <span><strong>Effective Date:</strong> October 23, 2026</span>
            <span>&bull;</span>
            <span><strong>Last Updated:</strong> October 23, 2026</span>
          </div>
        </div>

        {/* Table of Contents */}
        <nav className="privacy-toc-card" aria-label="Terms of Service Table of Contents">
          <h3>Table of Contents</h3>
          <ul className="privacy-toc-grid">
            <li><a href="#acceptance">1. Acceptance of Terms</a></li>
            <li><a href="#services">2. Description of Services</a></li>
            <li><a href="#accounts">3. User Accounts & Google Auth</a></li>
            <li><a href="#google-permissions">4. Gmail, Calendar & Tasks Access</a></li>
            <li><a href="#responsibilities">5. User Responsibilities</a></li>
            <li><a href="#ai-limitations">6. AI-Generated Content & Limits</a></li>
            <li><a href="#privacy">7. Privacy & Data Protection</a></li>
            <li><a href="#third-party">8. Third-Party Google Services</a></li>
            <li><a href="#availability">9. Service Availability & Changes</a></li>
            <li><a href="#liability">10. Limitation of Liability</a></li>
            <li><a href="#changes">11. Changes to Terms</a></li>
            <li><a href="#contact">12. Contact Information</a></li>
          </ul>
        </nav>

        {/* Section 1: Acceptance of Terms */}
        <section id="acceptance" className="privacy-section">
          <h2>1. Acceptance of Terms</h2>
          <p>
            Welcome to <strong>Nexus Workspace</strong> (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;the Application&rdquo;), accessible online at{' '}
            <a href="https://nexus-1-f8zl.onrender.com/" target="_blank" rel="noopener noreferrer">
              https://nexus-1-f8zl.onrender.com/
            </a>.
          </p>
          <p>
            By accessing, browsing, signing in through Google, or utilizing any functionality within Nexus Workspace, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service (&ldquo;Terms&rdquo;) and our companion{' '}
            <NavLink to="/privacy-policy" style={{ textDecoration: 'underline' }}>Privacy Policy</NavLink>.
          </p>
          <p>
            If you do not agree to these Terms or the Privacy Policy, you must refrain from accessing Nexus Workspace, connecting your Google Account, or utilizing any of its features.
          </p>
          <p>
            You must be at least 13 years of age (or 16 years of age in applicable jurisdictions such as the European Economic Area) to access or use this service. By using Nexus Workspace, you represent and warrant that you meet this minimum age requirement.
          </p>
        </section>

        {/* Section 2: Description of Services */}
        <section id="services" className="privacy-section">
          <h2>2. Description of Services</h2>
          <p>
            Nexus Workspace is an AI-powered personal workspace assistant built to assist individuals in organizing personal productivity, managing schedules, reviewing emails, and streamlining task execution through natural language interaction.
          </p>
          <p>The core capabilities provided by Nexus Workspace include:</p>
          <ul>
            <li>
              <strong>Conversational Workspace Assistant:</strong> A natural language interface capable of understanding requests, recalling user-specified memories, and orchestrating workspace tools using cloud AI (Groq API) or local AI inference (Ollama).
            </li>
            <li>
              <strong>Gmail Integration:</strong> Allowing users to search, inspect, and summarize inbox messages, as well as draft and dispatch email communications upon direct confirmation.
            </li>
            <li>
              <strong>Google Calendar Integration:</strong> Providing daily agenda briefings, retrieving schedule commitments, and creating or modifying calendar events at the user&apos;s request.
            </li>
            <li>
              <strong>Google Tasks Integration:</strong> Inspecting, creating, updating, and completing to-do tasks across personal Google Task lists.
            </li>
            <li>
              <strong>Productivity Utilities:</strong> Real-time weather forecasts, news headlines, and customizable personal preferences.
            </li>
          </ul>
        </section>

        {/* Section 3: User Accounts and Google Authentication */}
        <section id="accounts" className="privacy-section">
          <h2>3. User Accounts and Google Authentication</h2>
          <p>
            To utilize personalized workspace features, Nexus Workspace relies on <strong>Google OAuth 2.0</strong> for identity verification and authorization:
          </p>
          <ul>
            <li>
              <strong>Authentication via Google:</strong> You sign in using your existing Google account credentials. Nexus Workspace does not create, maintain, or store passwords for your Google account.
            </li>
            <li>
              <strong>Account Security:</strong> You are solely responsible for maintaining the confidentiality and security of your Google account credentials. Any activity conducted under your authenticated session is your responsibility.
            </li>
            <li>
              <strong>Suspicious Activity:</strong> If you suspect unauthorized access to your Google account or your Nexus Workspace session, you should immediately disconnect your account in Settings and revoke permissions in your Google Account security center.
            </li>
          </ul>
        </section>

        {/* Section 4: Gmail, Calendar and Tasks Permissions */}
        <section id="google-permissions" className="privacy-section">
          <h2>4. Gmail, Calendar, and Tasks Permissions & Authorizations</h2>
          <p>
            When you connect your Google Account, you explicitly authorize Nexus Workspace to interact with Google APIs on your behalf within the boundaries of the following approved permissions:
          </p>

          <table className="scope-table" aria-label="Google Permissions Granted">
            <thead>
              <tr>
                <th style={{ width: '38%' }}>Google Integration</th>
                <th style={{ width: '22%' }}>OAuth Scope</th>
                <th>Authorized Functionality</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Google Identity</strong></td>
                <td><span className="scope-code">userinfo.email</span></td>
                <td>Authenticate your identity and display your connected Google email address.</td>
              </tr>
              <tr>
                <td><strong>Gmail (Read)</strong></td>
                <td><span className="scope-code">gmail.readonly</span></td>
                <td>Read, search, and summarize your inbox messages upon your prompt.</td>
              </tr>
              <tr>
                <td><strong>Gmail (Send/Draft)</strong></td>
                <td><span className="scope-code">gmail.compose</span></td>
                <td>Create drafts and send emails solely upon your explicit instruction and confirmation.</td>
              </tr>
              <tr>
                <td><strong>Google Calendar</strong></td>
                <td><span className="scope-code">calendar.readonly</span> / <span className="scope-code">calendar.events</span></td>
                <td>View upcoming events, provide daily agendas, and schedule or update calendar appointments.</td>
              </tr>
              <tr>
                <td><strong>Google Tasks</strong></td>
                <td><span className="scope-code">tasks</span></td>
                <td>View, create, update, and check off tasks in your task lists.</td>
              </tr>
            </tbody>
          </table>

          <div className="privacy-callout highlight" style={{ marginTop: 14 }}>
            <p style={{ fontWeight: 600, fontSize: 14 }}>
              How to Revoke Google Access at Any Time:
            </p>
            <p style={{ margin: 0, fontSize: 13.5 }}>
              You maintain full sovereignty over your Google Account authorizations. You can disconnect or revoke access at any time through either of the following methods:
            </p>
            <ul style={{ margin: '8px 0 0 16px', padding: 0 }}>
              <li>
                <strong>Within Nexus Workspace:</strong> Navigate to <strong>Settings &rarr; Connections &rarr; Google</strong> and click <strong>Disconnect</strong>. This immediately performs a hard deletion of your encrypted access and refresh tokens from our database.
              </li>
              <li>
                <strong>Directly via Google Security Settings:</strong> You can manage or revoke permissions granted to third-party applications at any time by visiting{' '}
                <a 
                  href="https://myaccount.google.com/permissions" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: 600 }}
                >
                  Google Account Third-party Permissions <ExternalLink size={13} />
                </a>.
              </li>
            </ul>
          </div>

          <p style={{ marginTop: 12 }}>
            <strong>Google Limited Use Compliance:</strong> Nexus Workspace adheres strictly to the{' '}
            <a 
              href="https://developers.google.com/terms/api-services-user-data-policy" 
              target="_blank" 
              rel="noopener noreferrer"
              style={{ textDecoration: 'underline' }}
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements. Your Google user data is never transferred to data brokers, never used for advertising, and is <strong>never used to train artificial intelligence or machine learning models</strong>.
          </p>
        </section>

        {/* Section 5: User Responsibilities */}
        <section id="responsibilities" className="privacy-section">
          <h2>5. User Responsibilities & Acceptable Use</h2>
          <p>
            You agree to use Nexus Workspace in good faith, in compliance with all applicable local, national, and international laws, and in accordance with these Terms.
          </p>
          <p>You expressly agree NOT to:</p>
          <ul>
            <li>Use the Gmail integration to send unsolicited bulk communications, spam, phishing messages, malware, or fraudulent correspondence.</li>
            <li>Use the assistant to generate, store, or transmit content that is unlawful, defamatory, harassing, threatening, hateful, or infringing on intellectual property rights.</li>
            <li>Interfere with, disrupt, or compromise the integrity, security, or performance of the application or its underlying servers.</li>
            <li>Attempt to probe, scan, or reverse engineer any part of the service, or bypass authentication and authorization controls.</li>
            <li>Use automated scripts, bots, or scrapers to access the service in a manner that exceeds normal usage or disrupts availability for others.</li>
            <li>Confirm the dispatch of emails or calendar modifications without reviewing their contents for accuracy.</li>
          </ul>
        </section>

        {/* Section 6: AI-Generated Content and Limitations */}
        <section id="ai-limitations" className="privacy-section">
          <h2>6. AI-Generated Content and Limitations</h2>
          <p>
            Nexus Workspace utilizes cutting-edge Large Language Models (LLMs) to understand instructions and generate drafts, summaries, and recommendations. You acknowledge and understand the following characteristics of generative AI:
          </p>

          <div className="privacy-callout warning">
            <strong>Inherent Limitations of Generative AI:</strong> AI models generate responses based on probabilistic patterns. Outputs may occasionally be inaccurate, incomplete, misleading, or out of context (&ldquo;hallucinations&rdquo;). Nexus Workspace does not guarantee the factual accuracy, completeness, or reliability of any AI-generated response.
          </div>

          <ul>
            <li>
              <strong>Human-In-The-Loop (HITL) Safeguard:</strong> Nexus Workspace incorporates interactive confirmation gates for state-changing actions (such as sending emails or deleting calendar events). You must inspect and verify the content of drafts before approving their execution.
            </li>
            <li>
              <strong>User Responsibility for Dispatched Content:</strong> You retain sole editorial responsibility for all emails sent and calendar items created through your account. Nexus Workspace cannot be held liable for miscommunications resulting from uninspected AI drafts.
            </li>
            <li>
              <strong>No Professional Advice:</strong> Information provided by the assistant is for organizational and general informational purposes only and does not constitute legal, medical, financial, or other licensed professional counsel.
            </li>
          </ul>
        </section>

        {/* Section 7: Privacy and Data Protection */}
        <section id="privacy" className="privacy-section">
          <h2>7. Privacy and Data Protection</h2>
          <p>
            Your privacy and data security are paramount. Our data handling procedures are detailed comprehensively in our{' '}
            <NavLink to="/privacy-policy" style={{ textDecoration: 'underline' }}>Privacy Policy</NavLink>, which is incorporated into these Terms by reference.
          </p>
          <ul>
            <li>
              <strong>Token Security:</strong> All Google OAuth tokens are encrypted at rest using industry-standard <strong>AES-256-GCM</strong> encryption.
            </li>
            <li>
              <strong>Transit Protection:</strong> All communication between your browser, our application, and Google or AI APIs is protected by TLS 1.3 encryption.
            </li>
            <li>
              <strong>User Data Sovereignty:</strong> You can configure history retention periods and permanently delete conversations and memories at any time directly through <strong>Settings &rarr; Privacy and memory</strong>.
            </li>
            <li>
              <strong>No Commercial Exploitation:</strong> We do not sell, rent, or monetize your personal information or Google user data.
            </li>
          </ul>
        </section>

        {/* Section 8: Third-Party Google Services */}
        <section id="third-party" className="privacy-section">
          <h2>8. Third-Party Google Services & Independent Status</h2>
          <p>
            Nexus Workspace is an independent software application developed and maintained by Sachin Verma.
          </p>
          <ul>
            <li>
              <strong>No Official Endorsement:</strong> Nexus Workspace is not affiliated with, sponsored by, endorsed by, or certified by Google LLC.
            </li>
            <li>
              <strong>Trademarks:</strong> Google, Gmail, Google Calendar, and Google Tasks are registered trademarks of Google LLC.
            </li>
            <li>
              <strong>Third-Party Dependencies:</strong> The operation of integrations depends on Google&apos;s API availability, service uptime, quotas, and terms. Nexus Workspace is not responsible for service interruptions, changes, or deprecations instituted by Google LLC.
            </li>
            <li>
              <strong>Compliance with Google Terms:</strong> Your use of Google services remains subject to{' '}
              <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer">
                Google&apos;s Terms of Service
              </a>{' '}
              and{' '}
              <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
                Google&apos;s Privacy Policy
              </a>.
            </li>
          </ul>
        </section>

        {/* Section 9: Service Availability */}
        <section id="availability" className="privacy-section">
          <h2>9. Service Availability, Modifications, and Termination</h2>
          <p>
            Nexus Workspace is provided on an <strong>&ldquo;as-is&rdquo;</strong> and <strong>&ldquo;as-available&rdquo;</strong> basis.
          </p>
          <ul>
            <li>
              <strong>Service Continuity:</strong> While we endeavor to keep the service accessible and operational, we do not warrant that the application will be uninterrupted, error-free, completely secure, or free from latency.
            </li>
            <li>
              <strong>Feature Evolution:</strong> We reserve the right to modify, refine, update, or discontinue features or experimental capabilities at any time.
            </li>
            <li>
              <strong>Termination by You:</strong> You may discontinue using Nexus Workspace at any time by disconnecting your Google account in Settings and ceasing use of the application.
            </li>
            <li>
              <strong>Termination by Us:</strong> We reserve the right to suspend or revoke access to the application if you violate these Terms, engage in abusive conduct, or place an undue burden on our infrastructure.
            </li>
          </ul>
        </section>

        {/* Section 10: Limitation of Liability */}
        <section id="liability" className="privacy-section">
          <h2>10. Limitation of Liability & Warranty Disclaimer</h2>
          <div className="privacy-callout security" style={{ background: 'var(--surface-2)', border: '1px solid var(--line-2)' }}>
            <p style={{ margin: 0, textTransform: 'uppercase', fontSize: 12.5, letterSpacing: '0.04em', fontWeight: 650 }}>
              Disclaimer of Warranties
            </p>
            <p style={{ margin: '4px 0 0 0', fontSize: 13.5 }}>
              TO THE MAXIMUM EXTENT PERMITTED UNDER APPLICABLE LAW, NEXUS WORKSPACE AND ITS DEVELOPERS DISCLAIM ALL WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE, INCLUDING WITHOUT LIMITATION WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
            </p>
          </div>

          <p style={{ marginTop: 12 }}>
            TO THE FULLEST EXTENT PERMITTED BY LAW, IN NO EVENT SHALL THE DEVELOPER, MAINTAINERS, OR AFFILIATES OF NEXUS WORKSPACE BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES WHATSOEVER, INCLUDING BUT NOT LIMITED TO:
          </p>
          <ul>
            <li>Loss of profits, revenue, business opportunities, or goodwill;</li>
            <li>Loss, alteration, corruption, or unavailability of data, emails, or calendar records;</li>
            <li>Delays or failures in delivering or drafting email communications;</li>
            <li>Errors, omissions, or inaccuracies in AI-generated responses; or</li>
            <li>Any unauthorized access to or alteration of your transmissions or data resulting from third-party actions or browser security compromises.</li>
          </ul>
        </section>

        {/* Section 11: Changes to Terms */}
        <section id="changes" className="privacy-section">
          <h2>11. Changes to Terms</h2>
          <p>
            We may revise, amend, or update these Terms of Service periodically to reflect changes in our service offerings, technical architecture, or legal requirements.
          </p>
          <p>
            When changes are posted, the &ldquo;Last Updated&rdquo; date at the top of this document will be revised accordingly. Your continued use of Nexus Workspace after such changes are published constitutes your acceptance of the revised Terms. If you disagree with the updated Terms, you must stop using the application and disconnect your integrations.
          </p>
        </section>

        {/* Section 12: Contact Information */}
        <section id="contact" className="privacy-section">
          <h2>12. Contact Information</h2>
          <p>
            If you have questions, inquiries, or feedback regarding these Terms of Service or Nexus Workspace, please feel free to reach out directly to the maintainer:
          </p>

          <div className="card" style={{ marginTop: 12, background: 'var(--surface-2)', padding: 18 }}>
            <h3 style={{ fontSize: 15, marginBottom: 8 }}>Developer & Maintainer Details</h3>
            <ul style={{ listStyle: 'none', paddingLeft: 0, fontSize: 13.5, display: 'grid', gap: 6, margin: 0 }}>
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
          <NavLink to="/privacy-policy">Privacy Policy</NavLink>
          <NavLink to="/terms-of-service" style={{ color: 'var(--text)', fontWeight: 550 }}>Terms of Service</NavLink>
          <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
            Google User Data Policy
          </a>
        </nav>
      </footer>
    </div>
  );
}
