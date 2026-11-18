import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import Icon from '../components/Icon';
import { Badge, DataTable, Empty, Pager, SearchBox, Tabs, useToast } from '../components/ui';
import { can } from '../permissions';
import { fmtDate, fmtDateTime, money } from '../utils';

const LIMIT = 25;

export default function JobCards() {
  const { user } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [status, setStatus] = useState('active');
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState({ total: 0, items: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api('/jobcards', { params: { status, q, limit: LIMIT, offset } })
      .then(setData).catch((e) => toast(e.message, 'error')).finally(() => setLoading(false));
  }, [status, q, offset, toast]);

  const tabs = [
    { value: 'active', label: 'Active' }, { value: 'completed', label: 'Ready to bill' },
    { value: 'invoiced', label: 'Billed' }, { value: 'cancelled', label: 'Cancelled' }, { value: '', label: 'All' },
  ];

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>{user.role === 'technician' ? 'My job cards' : 'Job cards'}</h1><p>Track every vehicle from check-in to delivery.</p></div>
        {can.createJob(user.role) && <Link to="/jobcards/new" className="btn primary"><Icon name="plus" size={16} />New job card</Link>}
      </div>
      <div className="between">
        <Tabs value={status} onChange={(v) => { setStatus(v); setOffset(0); }} options={tabs} />
        <SearchBox value={q} onChange={(v) => { setQ(v); setOffset(0); }} placeholder="Search number, customer, vehicle" />
      </div>
      <div className="card">
        <DataTable loading={loading} rows={data.items} onRowClick={(r) => nav(`/jobcards/${r.id}`)}
          empty={<Empty icon="wrench" title="No job cards found">Create a job card when a vehicle checks in.</Empty>}
          columns={[
            { key: 'vehicle_reg', label: 'Vehicle', primary: true, render: (r) => <><b>{r.vehicle_reg}</b> <span className="muted small">{r.vehicle_name}</span></> },
            { key: 'number', label: 'Job card' },
            { key: 'customer_name', label: 'Customer' },
            { key: 'technician_name', label: 'Technician', render: (r) => r.technician_name || <span className="muted">Unassigned</span> },
            { key: 'estimated_delivery', label: 'Delivery', hideSm: true, render: (r) => fmtDate(r.estimated_delivery) },
            { key: 'estimate_total', label: 'Estimate', num: true, render: (r) => money(r.estimate_total) },
            { key: 'updated_at', label: 'Updated', hideSm: true, render: (r) => fmtDateTime(r.updated_at) },
            { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
          ]} />
        <Pager total={data.total} offset={offset} limit={LIMIT} onChange={setOffset} />
      </div>
    </div>
  );
}
