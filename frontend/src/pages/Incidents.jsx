import { useState } from 'react';
import { api } from '../api';
import { useApi, Table, Form, Msg } from '../ui.jsx';

// Change these to match the statuses your update_incident_status procedure accepts.
const STATUSES = ['REPORTED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

export default function Incidents() {
  const [filter, setFilter] = useState('');
  const [msg, setMsg] = useState({});
  const list = useApi(`/incidents${filter ? `?status=${filter}` : ''}`);
  const people = useApi('/residents');
  const options = (people.data || []).map((r) => ({ value: r.id, label: `${r.id}: ${r.fullName}` }));

  const rows = (list.data || []).map((i) => ({
    ...i,
    reporterName: i.reporter?.fullName,
    responderNames: (i.responders || []).map((x) => `${x.resident?.fullName} (${x.roleAssigned})`).join(', '),
  }));

  async function setStatus(i, status) {
    setMsg({});
    try {
      await api(`/incidents/${i.id}/status`, { method: 'PATCH', body: { status } });
      list.reload();
    } catch (e) {
      setMsg({ error: e.message });
    }
  }

  return (
    <>
      <Form
        submit="Report incident"
        fields={[
          { name: 'reporterId', label: 'Reporter', type: 'select', options },
          { name: 'title', label: 'Title' },
          { name: 'category', label: 'Category (optional)', required: false },
          { name: 'location', label: 'Location' },
          { name: 'description', label: 'Description', type: 'textarea' },
        ]}
        onSubmit={(v) => api('/incidents', { method: 'POST', body: v })}
        onDone={list.reload}
      />
      <Form
        submit="Assign responder"
        fields={[
          { name: 'incidentId', label: 'Incident ID', type: 'number' },
          { name: 'residentId', label: 'Responder', type: 'select', options },
          { name: 'roleAssigned', label: 'Role (optional, default OFFICER)', required: false },
        ]}
        onSubmit={(v) => api(`/incidents/${v.incidentId}/responders`, { method: 'POST', body: v })}
        onDone={list.reload}
      />
      <label>Filter by status
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All</option>
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </label>
      <Msg error={list.error || msg.error} />
      <Table
        rows={list.data ? rows : null}
        cols={[['id', 'ID'], ['title', 'Title'], ['category', 'Category'], ['location', 'Location'], ['reporterName', 'Reporter'], ['responderNames', 'Responders'], ['reportedAt', 'Reported']]}
        actions={(i) => (
          <select value={i.status} onChange={(e) => setStatus(i, e.target.value)}>
            {[...new Set([i.status, ...STATUSES])].map((s) => <option key={s}>{s}</option>)}
          </select>
        )}
      />
    </>
  );
}
