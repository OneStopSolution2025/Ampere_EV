import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import Icon from '../components/Icon';
import { CustomerForm } from '../components/Pickers';
import { DataTable, Empty, Pager, SearchBox, useToast } from '../components/ui';

const LIMIT = 25;

export default function Customers() {
  const nav = useNavigate();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState({ total: 0, items: [] });
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    setLoading(true);
    api('/customers', { params: { q, limit: LIMIT, offset } }).then(setData).catch((e) => toast(e.message, 'error')).finally(() => setLoading(false));
  }, [q, offset, toast]);

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Customers</h1><p>{data.total} customer{data.total === 1 ? '' : 's'} and their vehicles.</p></div>
        <div className="row">
          <SearchBox value={q} onChange={(v) => { setQ(v); setOffset(0); }} placeholder="Name, phone or vehicle number" />
          <button className="btn primary" onClick={() => setAdding(true)}><Icon name="plus" size={16} />New customer</button>
        </div>
      </div>
      <div className="card">
        <DataTable loading={loading} rows={data.items} onRowClick={(r) => nav(`/customers/${r.id}`)}
          empty={<Empty icon="users" title="No customers found" />}
          columns={[
            { key: 'name', label: 'Customer', primary: true, render: (r) => <b>{r.name}</b> },
            { key: 'phone', label: 'Phone' },
            { key: 'vehicles', label: 'Vehicles', render: (r) => r.vehicles.map((v) => v.reg_no).join(', ') || '—' },
            { key: 'state', label: 'State', hideSm: true },
            { key: 'gstin', label: 'GSTIN', hideSm: true },
          ]} />
        <Pager total={data.total} offset={offset} limit={LIMIT} onChange={setOffset} />
      </div>
      {adding && <CustomerForm onClose={() => setAdding(false)} onSaved={(c) => { setAdding(false); nav(`/customers/${c.id}`); }} />}
    </div>
  );
}
