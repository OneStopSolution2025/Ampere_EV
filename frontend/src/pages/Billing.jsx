import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import Icon from '../components/Icon';
import { Badge, DataTable, Empty, Pager, SearchBox, Stat, Tabs, useToast } from '../components/ui';
import { CATEGORY } from '../permissions';
import { fmtDate, money, money0 } from '../utils';

const LIMIT = 25;

const INTRO = {
  vehicle: 'Retail and sub-dealer vehicle invoices, billed by chassis number.',
  spare: 'Counter sales of spare parts and accessories.',
  service: 'Workshop bills raised from job cards or directly.',
};

export default function Billing({ category }) {
  const nav = useNavigate();
  const toast = useToast();
  const cfg = CATEGORY[category];
  const [params, setParams] = useSearchParams();
  const docType = params.get('type') || 'invoice';
  const status = params.get('status') || '';
  const [q, setQ] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState({ total: 0, items: [] });
  const [sum, setSum] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { setOffset(0); setQ(''); }, [category]);
  useEffect(() => { api('/invoices/summary', { params: { category } }).then(setSum).catch(() => {}); }, [category]);
  useEffect(() => {
    setLoading(true);
    api('/invoices', { params: { doc_type: docType, category, status, q, date_from: range.from, date_to: range.to, limit: LIMIT, offset } })
      .then(setData).catch((e) => toast(e.message, 'error')).finally(() => setLoading(false));
  }, [category, docType, status, q, range, offset, toast]);

  const setParam = (k, v) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); if (k === 'type') p.delete('status'); setParams(p); setOffset(0); };
  const statusTabs = docType === 'invoice'
    ? [{ value: '', label: 'All' }, { value: 'due', label: 'Due' }, { value: 'paid', label: 'Paid' }, { value: 'cancelled', label: 'Cancelled' }]
    : [{ value: '', label: 'All' }, { value: 'open', label: 'Open' }, { value: 'converted', label: 'Converted' }];

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>{cfg.label}</h1><p>{INTRO[category]}</p></div>
        <div className="row">
          {category === 'service' && <Link to="/jobcards" className="btn"><Icon name="clipboard" size={16} />Job cards</Link>}
          <Link to={`/billing/new?category=${category}&type=estimate`} className="btn"><Icon name="file" size={16} />{category === 'vehicle' ? 'Quotation' : 'Estimate'}</Link>
          <Link to={`/billing/new?category=${category}`} className="btn primary"><Icon name="plus" size={16} />New {cfg.single.toLowerCase()}</Link>
        </div>
      </div>

      {sum && (
        <div className="grid g4">
          <Stat label="Today" value={money0(sum.today_total)} hint={`${sum.today_count} bill${sum.today_count === 1 ? '' : 's'}`} />
          <Stat label="This month" value={money0(sum.month_total)} hint={`${sum.month_count} bills`} />
          <Stat label="Payment due" value={money0(sum.due_total)} hint={`${sum.due_count} bills`} />
          <Stat label={category === 'vehicle' ? 'Open quotations' : 'Open estimates'} value={sum.open_estimates} />
        </div>
      )}

      <div className="between">
        <div className="row">
          <Tabs value={docType} onChange={(v) => setParam('type', v)} options={[{ value: 'invoice', label: 'Invoices' }, { value: 'estimate', label: category === 'vehicle' ? 'Quotations' : 'Estimates' }]} />
          <Tabs value={status} onChange={(v) => setParam('status', v)} options={statusTabs} />
        </div>
        <div className="row grow" style={{ justifyContent: 'flex-end' }}>
          <input className="input date-input hide-sm" style={{ width: 150 }} type="date" value={range.from} aria-label="From date" onChange={(e) => { setRange({ ...range, from: e.target.value }); setOffset(0); }} />
          <input className="input date-input hide-sm" style={{ width: 150 }} type="date" value={range.to} aria-label="To date" onChange={(e) => { setRange({ ...range, to: e.target.value }); setOffset(0); }} />
          <SearchBox value={q} onChange={(v) => { setQ(v); setOffset(0); }} placeholder="Number, party, phone, vehicle" />
        </div>
      </div>
      <div className="card">
        <DataTable loading={loading} rows={data.items} onRowClick={(r) => nav(`/billing/${r.id}`)}
          empty={<Empty icon="receipt" title="No bills found" />}
          columns={[
            { key: 'customer_name', label: 'Billed to', primary: true, render: (r) => <><b>{r.customer_name}</b>{r.is_subdealer && <span className="badge amber" style={{ marginLeft: 6 }}>Sub-dealer</span>}{r.vehicle_reg && <span className="muted small"> · {r.vehicle_reg}</span>}</> },
            { key: 'number', label: 'Number' },
            { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
            { key: 'total', label: 'Total', num: true, render: (r) => money(r.total) },
            ...(docType === 'invoice' ? [{ key: 'balance', label: 'Balance', num: true, render: (r) => (r.balance > 0 ? <b>{money(r.balance)}</b> : '—') }] : []),
            { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
          ]} />
        <Pager total={data.total} offset={offset} limit={LIMIT} onChange={setOffset} />
      </div>
    </div>
  );
}
