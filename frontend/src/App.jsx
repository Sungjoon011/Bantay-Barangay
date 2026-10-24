import { useState, useEffect } from 'react';
import { api } from './api';
import { Tabs } from './ui.jsx';
import Incidents from './pages/Incidents.jsx';
import Blotters from './pages/Blotters.jsx';
import Residents from './pages/Residents.jsx';
import AuditLogs from './pages/AuditLogs.jsx';

export default function App() {
  const [tab, setTab] = useState('Incidents');
  const [online, setOnline] = useState(null);

  useEffect(() => {
    api('/health').then(() => setOnline(true)).catch(() => setOnline(false));
  }, []);

  return (
    <>
      <header>
        <strong>BantayBarangay</strong>
        <span className="muted">Barangay information and service management</span>
        <span>{online === null ? 'Checking backend...' : online ? 'Backend online' : 'Backend offline'}</span>
      </header>
      <main>
        {online === false && (
          <p className="error">
            The backend is not answering. Start it first (it should say "running on http://localhost:5000"), then refresh this page.
          </p>
        )}
        <Tabs tabs={['Incidents', 'Blotters', 'Residents', 'Audit logs']} tab={tab} setTab={setTab} />
        {tab === 'Incidents' && <Incidents />}
        {tab === 'Blotters' && <Blotters />}
        {tab === 'Residents' && <Residents />}
        {tab === 'Audit logs' && <AuditLogs />}
      </main>
    </>
  );
}
