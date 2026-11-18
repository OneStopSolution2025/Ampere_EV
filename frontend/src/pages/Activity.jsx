import { useEffect, useState } from 'react';
import { api } from '../api';
import { DataTable, Empty, Pager, SearchBox, useToast } from '../components/ui';
import { downloadCSV, fmtDateTime, titleCase } from '../utils';

const LIMIT = 50;
const ENTITIES = ['invoice', 'purchase', 'vehicle', 'item', 'jobcard', 'subdealer', 'supplier', 'user'];
const TONE = { cancel: 'red', delete: 'red', 'delete-payment': 'red', create: 'green', payment: 'blue', login: 'gray', update: 'amber' };

export default function Activity() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [entity, setEntity] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState({ total: 0, items: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api('/activity', { params: { q, entity, date_from: range.from, date_to: range.to, limit: LIMIT, offset } })
      .then(setData).catch((e) => toast(e.message, 'error')).finally(() => setLoading(false));
  }, [q, entity, range, offset, toast]);

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Activity log</h1><p>Every sign-in, bill, payment, cancellation and stock change, with who did it and when.</p></div>
        <button className="btn" onClick={() => downloadCSV('activity.csv', data.items)}>Export page</button>
      </div>
      <div className="between">
        <div className="row">
          <select className="input" style={{ width: 'auto' }} value={entity} onChange={(e) => { setEntity(e.target.value); setOffset(0); }} aria-label="Module">
            <option value="">All modules</option>{ENTITIES.map((x) => <option key={x} value={x}>{titleCase(x)}</option>)}
          </select>
          <input className="input date-input" style={{ width: 150 }} type="date" value={range.from} onChange={(e) => { setRange({ ...range, from: e.target.value }); setOffset(0); }} aria-label="From" />
          <input className="input date-input" style={{ width: 150 }} type="date" value={range.to} onChange={(e) => { setRange({ ...range, to: e.target.value }); setOffset(0); }} aria-label="To" />
        </div>
        <SearchBox value={q} onChange={(v) => { setQ(v); setOffset(0); }} placeholder="Search user or details" />
      </div>
      <div className="card">
        <DataTable loading={loading} rows={data.items} empty={<Empty icon="clock" title="No activity found" />} columns={[
          { key: 'created_at', label: 'When', primary: true, render: (r) => fmtDateTime(r.created_at) },
          { key: 'user_name', label: 'User' },
          { key: 'action', label: 'Action', render: (r) => <span className={`badge ${TONE[r.action] || 'gray'}`}>{titleCase(r.action.replace('-', ' '))}</span> },
          { key: 'entity', label: 'Module', render: (r) => titleCase(r.entity) },
          { key: 'detail', label: 'Details', render: (r) => <span className="small">{r.detail}</span> },
        ]} />
        <Pager total={data.total} offset={offset} limit={LIMIT} onChange={setOffset} />
      </div>
    </div>
  );
}
