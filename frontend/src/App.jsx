import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './services/store.jsx';
import Layout from './components/Layout.jsx';
import Overview from './pages/Overview.jsx';
import Assistant from './pages/Assistant.jsx';
import Tasks from './pages/Tasks.jsx';
import Calendar from './pages/Calendar.jsx';
import Email from './pages/Email.jsx';
import Weather from './pages/Weather.jsx';
import Insights from './pages/Insights.jsx';
import System from './pages/System.jsx';
import GitHub from './pages/GitHub.jsx';
import AlexaLab from './pages/AlexaLab.jsx';
import Settings from './pages/Settings.jsx';
import PrivacyPolicy from './pages/PrivacyPolicy.jsx';
import TermsOfService from './pages/TermsOfService.jsx';
import { Loading } from './components/ui.jsx';

function Shell() {
  const { boot, toasts } = useApp();
  const location = useLocation();
  const isPublicPage = location.pathname === '/privacy-policy' || 
                       location.pathname === '/terms-of-service' || 
                       location.pathname === '/terms';

  if (!isPublicPage) {
    if (boot.loading) return <div className="page"><Loading /></div>;
    if (boot.error) return <div className="page"><div className="notice bad" role="alert">{boot.error}</div></div>;
  }

  return <>
    <Routes>
      <Route path="/privacy-policy" element={<PrivacyPolicy standalone />} />
      <Route path="/terms-of-service" element={<TermsOfService standalone />} />
      <Route path="/terms" element={<TermsOfService standalone />} />
      <Route element={<Layout />}>
        <Route index element={<Overview />} />
        <Route path="assistant" element={<Assistant />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="email" element={<Email />} />
        <Route path="weather" element={<Weather />} />
        <Route path="insights" element={<Insights />} />
        <Route path="system" element={<System />} />
        <Route path="github" element={<GitHub />} />
        <Route path="alexa" element={<AlexaLab />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Overview />} />
      </Route>
    </Routes>
    <div className="toast-wrap" role="status" aria-live="polite">{toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.message}</div>)}</div>
  </>;
}
export default function App() { return <BrowserRouter><AppProvider><Shell /></AppProvider></BrowserRouter>; }
