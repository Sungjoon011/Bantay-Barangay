import { useState, useEffect, useCallback } from 'react';
import { api } from './api';

// Loads a GET endpoint and lets you reload it after a change.
export function useApi(path) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setError('');
    api(path).then(setData).catch((e) => setError(e.message));
  }, [path]);
  useEffect(() => {
    load();
  }, [load]);
  return { data, error, reload: load };
}

export function fmt(v) {
  if (v === null || v === undefined || v === '') return '-';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleString();
  return String(v);
}

export function Msg({ error, ok }) {
  if (error) return <p className="error">{error}</p>;
  if (ok) return <p className="ok">{ok}</p>;
  return null;
}

// cols: [[key, label], ...]   actions: row => node
export function Table({ rows, cols, actions }) {
  if (!rows) return <p className="muted">Loading...</p>;
  if (!rows.length) return <p className="muted">Nothing here yet.</p>;
  return (
    <div className="scroll">
      <table>
        <thead>
          <tr>
            {cols.map(([, label]) => <th key={label}>{label}</th>)}
            {actions && <th></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {cols.map(([k]) => <td key={k}>{fmt(r[k])}</td>)}
              {actions && <td className="actions">{actions(r)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// fields: [{name, label, type, options, required}]  onSubmit: async values => any
export function Form({ fields, onSubmit, submit = 'Save', onDone }) {
  const init = Object.fromEntries(fields.map((f) => [f.name, f.type === 'checkbox' ? false : f.default ?? '']));
  const [v, setV] = useState(init);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  async function go(e) {
    e.preventDefault();
    setErr('');
    setOk('');
    try {
      const r = await onSubmit(v);
      setOk('Saved');
      setV(init);
      if (onDone) onDone(r);
    } catch (x) {
      setErr(x.message);
    }
  }

  return (
    <form onSubmit={go} className="card">
      <div className="grid">
        {fields.map((f) => (
          <label key={f.name}>
            {f.label}
            {f.type === 'select' ? (
              <select value={v[f.name]} required onChange={(e) => setV({ ...v, [f.name]: e.target.value })}>
                <option value="">Choose...</option>
                {(f.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : f.type === 'textarea' ? (
              <textarea value={v[f.name]} required onChange={(e) => setV({ ...v, [f.name]: e.target.value })} />
            ) : f.type === 'checkbox' ? (
              <input type="checkbox" checked={v[f.name]} onChange={(e) => setV({ ...v, [f.name]: e.target.checked })} />
            ) : (
              <input type={f.type || 'text'} value={v[f.name]} required={f.required !== false}
                     onChange={(e) => setV({ ...v, [f.name]: e.target.value })} />
            )}
          </label>
        ))}
      </div>
      <button type="submit">{submit}</button>
      <Msg error={err} ok={ok} />
    </form>
  );
}

export function Tabs({ tabs, tab, setTab }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button key={t} className={t === tab ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>
      ))}
    </div>
  );
}
