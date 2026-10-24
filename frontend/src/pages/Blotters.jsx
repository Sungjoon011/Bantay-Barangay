import { useState } from 'react';
import { api } from '../api';
import { useApi, Table, Form, Msg } from '../ui.jsx';

// Change these to match the values your database accepts.
const CASE_STATUSES = ['PENDING', 'ONGOING', 'SETTLED', 'ESCALATED', 'CLOSED'];
const PARTY_ROLES = ['COMPLAINANT', 'RESPONDENT', 'WITNESS'];

export default function Blotters() {
  const [msg, setMsg] = useState({});
  const list = useApi('/blotters');
  const people = useApi('/residents');
  const options = (people.data || []).map((r) => ({ value: r.id, label: `${r.id}: ${r.fullName}` }));

  const rows = (list.data || []).map((b) => ({
    ...b,
    partyList: (b.parties || []).map((p) => `${p.resident?.fullName} (${p.partyRole})`).join(', '),
  }));

  async function setStatus(b, caseStatus) {
    setMsg({});
    try {
      await api(`/blotters/${b.id}/status`, { method: 'PATCH', body: { caseStatus } });
      list.reload();
    } catch (e) {
      setMsg({ error: e.message });
    }
  }

  return (
    <>
      <Form
        submit="Create blotter case"
        fields={[
          { name: 'caseTitle', label: 'Case title' },
          { name: 'caseType', label: 'Case type' },
          { name: 'incidentId', label: 'Linked incident ID (optional)', type: 'number', required: false },
          { name: 'summary', label: 'Summary', type: 'textarea' },
        ]}
        onSubmit={(v) => api('/blotters', { method: 'POST', body: v })}
        onDone={list.reload}
      />
      <Form
        submit="Add party to case"
        fields={[
          { name: 'caseId', label: 'Case ID', type: 'number' },
          { name: 'residentId', label: 'Resident', type: 'select', options },
          { name: 'partyRole', label: 'Role', type: 'select', options: PARTY_ROLES.map((r) => ({ value: r, label: r })) },
          { name: 'statement', label: 'Statement', type: 'textarea' },
        ]}
        onSubmit={(v) => api(`/blotters/${v.caseId}/parties`, { method: 'POST', body: v })}
        onDone={list.reload}
      />
      <Msg error={list.error || msg.error} />
      <Table
        rows={list.data ? rows : null}
        cols={[['id', 'ID'], ['caseTitle', 'Title'], ['caseType', 'Type'], ['incidentId', 'Incident'], ['partyList', 'Parties'], ['createdAt', 'Created']]}
        actions={(b) => (
          <select value={b.caseStatus} onChange={(e) => setStatus(b, e.target.value)}>
            {[...new Set([b.caseStatus, ...CASE_STATUSES])].map((s) => <option key={s}>{s}</option>)}
          </select>
        )}
      />
    </>
  );
}
