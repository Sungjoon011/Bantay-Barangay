import { api } from '../api';
import { useApi, Table, Form } from '../ui.jsx';

export default function Residents() {
  const list = useApi('/residents');
  const rows = (list.data || []).map((r) => ({
    ...r,
    roles: (r.userRoles || []).map((u) => u.role?.name ?? u.role?.roleName ?? u.roleId).join(', '),
  }));

  return (
    <>
      <Form
        submit="Register resident"
        fields={[
          { name: 'fullName', label: 'Full name' },
          { name: 'email', label: 'Email', type: 'email' },
          { name: 'contactNo', label: 'Mobile number', required: false },
          { name: 'address', label: 'Address', required: false },
          { name: 'isVoter', label: 'Registered voter', type: 'checkbox' },
        ]}
        onSubmit={(v) => api('/residents', { method: 'POST', body: v })}
        onDone={list.reload}
      />
      <Form
        submit="Assign role"
        fields={[
          { name: 'residentId', label: 'Resident', type: 'select',
            options: (list.data || []).map((r) => ({ value: r.id, label: `${r.id}: ${r.fullName}` })) },
          { name: 'roleId', label: 'Role ID (number from your roles table)', type: 'number' },
        ]}
        onSubmit={(v) => api(`/residents/${v.residentId}/roles`, { method: 'POST', body: { roleId: v.roleId } })}
        onDone={list.reload}
      />
      {list.error && <p className="error">{list.error}</p>}
      <Table
        rows={list.data ? rows : null}
        cols={[['id', 'ID'], ['fullName', 'Name'], ['email', 'Email'], ['contactNo', 'Mobile'], ['address', 'Address'], ['isVoter', 'Voter'], ['roles', 'Roles']]}
      />
    </>
  );
}
