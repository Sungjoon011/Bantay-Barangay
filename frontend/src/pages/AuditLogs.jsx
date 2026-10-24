import { useApi, Table } from '../ui.jsx';

// Shows whatever columns the audit table has, so it works with your schema as is.
export default function AuditLogs() {
  const list = useApi('/audit-logs');
  if (list.error) return <p className="error">{list.error}</p>;
  const first = list.data && list.data[0];
  const cols = first ? Object.keys(first).filter((k) => typeof first[k] !== 'object' || first[k] === null).map((k) => [k, k]) : [];
  return (
    <>
      <p className="muted">Written automatically by database triggers. Newest first, last 100.</p>
      <Table rows={list.data} cols={cols} />
    </>
  );
}
