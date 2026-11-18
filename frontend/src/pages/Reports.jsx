import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import Icon from '../components/Icon';
import { Badge, DataTable, Empty, Stat, Tabs, useToast } from '../components/ui';
import { downloadCSV, fmtDate, modeLabel, monthStart, money, money0, n2, titleCase, today } from '../utils';

function Range({ range, setRange }) {
  const preset = (days) => { const d = new Date(); d.setDate(d.getDate() - days); setRange({ from: d.toLocaleDateString('en-CA'), to: today() }); };
  return (
    <div className="row">
      <input className="input date-input" style={{ width: 150 }} type="date" value={range.from} aria-label="From" onChange={(e) => setRange({ ...range, from: e.target.value })} />
      <input className="input date-input" style={{ width: 150 }} type="date" value={range.to} aria-label="To" onChange={(e) => setRange({ ...range, to: e.target.value })} />
      <button className="btn sm" onClick={() => setRange({ from: monthStart(), to: today() })}>This month</button>
      <button className="btn sm" onClick={() => preset(29)}>30 days</button>
    </div>
  );
}

function Sales({ range }) {
  const [d, setD] = useState(null);
  const [category, setCategory] = useState('');
  const toast = useToast();
  useEffect(() => { api('/reports/sales', { params: { date_from: range.from, date_to: range.to, category } }).then(setD).catch((e) => toast(e.message, 'error')); }, [range, category, toast]);
  if (!d) return <div className="empty">Loading…</div>;
  const t = d.totals;
  return (
    <div className="stack">
      <Tabs value={category} onChange={setCategory} options={[{ value: '', label: 'All sales' }, { value: 'vehicle', label: `Vehicles · ${money0(d.by_category.vehicle)}` }, { value: 'spare', label: `Spares · ${money0(d.by_category.spare)}` }, { value: 'service', label: `Service · ${money0(d.by_category.service)}` }]} />
      <div className="grid g4">
        <Stat label="Invoices" value={t.count} />
        <Stat label="Net sales" value={money0(t.total)} hint={`Taxable ${money0(t.taxable)}`} />
        <Stat label="GST collected" value={money0(t.tax)} hint={t.discount ? `Discounts ${money0(t.discount)}` : ''} />
        <Stat label="Outstanding" value={money0(t.outstanding)} hint={`Collected ${money0(t.paid)}`} />
      </div>
      <div className="card card-pad">
        <h2 style={{ marginBottom: 12 }}>Collections by mode</h2>
        <div className="row" style={{ gap: 24 }}>
          {Object.keys(d.payment_modes).length ? Object.entries(d.payment_modes).map(([m, a]) => (
            <div key={m}><div className="small muted">{modeLabel(m)}</div><b className="mono">{money(a)}</b></div>
          )) : <span className="muted">No payments in this period.</span>}
        </div>
      </div>
      <div className="card">
        <div className="card-head"><h2>Invoice register</h2>
          <button className="btn sm" onClick={() => downloadCSV(`sales-${d.from}-to-${d.to}.csv`, d.invoices.map(({ id, ...r }) => r))}><Icon name="download" size={14} />CSV</button></div>
        <DataTable rows={d.invoices} empty={<Empty icon="receipt" title="No invoices in this period" />} columns={[
          { key: 'number', label: 'Invoice', primary: true, render: (r) => <Link to={`/billing/${r.id}`}>{r.number}</Link> },
          { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
          { key: 'customer', label: 'Billed to' },
          { key: 'category', label: 'Type', hideSm: true, render: (r) => titleCase(r.category) },
          { key: 'taxable', label: 'Taxable', num: true, render: (r) => n2(r.taxable) },
          { key: 'tax', label: 'GST', num: true, hideSm: true, render: (r) => n2(r.cgst + r.sgst + r.igst) },
          { key: 'total', label: 'Total', num: true, render: (r) => money(r.total) },
          { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
        ]} />
      </div>
    </div>
  );
}

function Gst({ range }) {
  const [d, setD] = useState(null);
  const toast = useToast();
  useEffect(() => { api('/reports/gst', { params: { date_from: range.from, date_to: range.to } }).then(setD).catch((e) => toast(e.message, 'error')); }, [range, toast]);
  if (!d) return <div className="empty">Loading…</div>;
  const sum = (k) => d.by_rate.reduce((a, r) => a + r[k], 0);
  return (
    <div className="stack">
      <div className="grid g4">
        <Stat label="Taxable value" value={money0(sum('taxable'))} />
        <Stat label="CGST + SGST" value={money0(sum('cgst') + sum('sgst'))} />
        <Stat label="IGST" value={money0(sum('igst'))} />
        <Stat label="B2B / B2C" value={`${money0(d.b2b_total)}`} hint={`B2C ${money0(d.b2c_total)}`} />
      </div>
      <div className="card">
        <div className="card-head"><h2>Rate-wise summary</h2><button className="btn sm" onClick={() => downloadCSV(`gst-rate-${d.from}-to-${d.to}.csv`, d.by_rate)}><Icon name="download" size={14} />CSV</button></div>
        <DataTable rows={d.by_rate.map((r) => ({ ...r, id: r.rate }))} empty={<Empty title="No taxable sales in this period" />} columns={[
          { key: 'rate', label: 'GST rate', primary: true, render: (r) => `${r.rate}%` },
          { key: 'taxable', label: 'Taxable', num: true, render: (r) => n2(r.taxable) },
          { key: 'cgst', label: 'CGST', num: true, render: (r) => n2(r.cgst) },
          { key: 'sgst', label: 'SGST', num: true, render: (r) => n2(r.sgst) },
          { key: 'igst', label: 'IGST', num: true, render: (r) => n2(r.igst) },
        ]} />
      </div>
      <div className="card">
        <div className="card-head"><h2>HSN / SAC summary</h2><button className="btn sm" onClick={() => downloadCSV(`hsn-${d.from}-to-${d.to}.csv`, d.by_hsn)}><Icon name="download" size={14} />CSV</button></div>
        <DataTable rows={d.by_hsn.map((r, i) => ({ ...r, id: i }))} empty={<Empty title="No data" />} columns={[
          { key: 'hsn_sac', label: 'HSN / SAC', primary: true },
          { key: 'rate', label: 'Rate', render: (r) => `${r.rate}%` },
          { key: 'qty', label: 'Qty', num: true, render: (r) => n2(r.qty) },
          { key: 'taxable', label: 'Taxable', num: true, render: (r) => n2(r.taxable) },
          { key: 'tax', label: 'Tax', num: true, render: (r) => n2(r.tax) },
        ]} />
      </div>
    </div>
  );
}

function Receivables() {
  const [d, setD] = useState(null);
  const toast = useToast();
  useEffect(() => { api('/reports/receivables').then(setD).catch((e) => toast(e.message, 'error')); }, [toast]);
  if (!d) return <div className="empty">Loading…</div>;
  return (
    <div className="stack">
      <div className="grid g4">{Object.entries(d.buckets).map(([k, v]) => <Stat key={k} label={`${k} days`} value={money0(v)} />)}</div>
      <div className="card">
        <div className="card-head"><h2>Unpaid invoices · {money(d.total)}</h2><button className="btn sm" onClick={() => downloadCSV('receivables.csv', d.invoices.map(({ id, ...r }) => r))}><Icon name="download" size={14} />CSV</button></div>
        <DataTable rows={d.invoices} empty={<Empty icon="check" title="Nothing outstanding" />} columns={[
          { key: 'customer', label: 'Party', primary: true, render: (r) => <Link to={`/billing/${r.id}`}>{r.customer}</Link> },
          { key: 'type', label: 'Type', hideSm: true },
          { key: 'number', label: 'Invoice' },
          { key: 'phone', label: 'Phone', hideSm: true },
          { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
          { key: 'age', label: 'Age', num: true, render: (r) => `${r.age} d` },
          { key: 'balance', label: 'Balance', num: true, render: (r) => <b>{money(r.balance)}</b> },
        ]} />
      </div>
    </div>
  );
}

function Stock() {
  const [d, setD] = useState(null);
  const toast = useToast();
  useEffect(() => { api('/reports/stock').then(setD).catch((e) => toast(e.message, 'error')); }, [toast]);
  if (!d) return <div className="empty">Loading…</div>;
  return (
    <div className="stack">
      <div className="grid g3">
        <Stat label="Stock value (at cost)" value={money0(d.total_value)} />
        <Stat label="Active parts" value={d.items.length} />
        <Stat label="Below reorder level" value={d.low_count} />
      </div>
      <div className="card">
        <div className="card-head"><h2>Stock valuation</h2><button className="btn sm" onClick={() => downloadCSV('stock.csv', d.items.map(({ id, ...r }) => r))}><Icon name="download" size={14} />CSV</button></div>
        <DataTable rows={d.items} empty={<Empty icon="box" title="No parts" />} columns={[
          { key: 'name', label: 'Part', primary: true },
          { key: 'sku', label: 'SKU', hideSm: true },
          { key: 'stock', label: 'Stock', num: true, render: (r) => (r.low ? <Badge tone="red">{n2(r.stock)}</Badge> : n2(r.stock)) },
          { key: 'cost_price', label: 'Cost', num: true, render: (r) => n2(r.cost_price) },
          { key: 'value', label: 'Value', num: true, render: (r) => money(r.value) },
        ]} />
      </div>
    </div>
  );
}

function Technicians({ range }) {
  const [rows, setRows] = useState(null);
  const toast = useToast();
  useEffect(() => { api('/reports/technicians', { params: { date_from: range.from, date_to: range.to } }).then(setRows).catch((e) => toast(e.message, 'error')); }, [range, toast]);
  if (!rows) return <div className="empty">Loading…</div>;
  return (
    <div className="card">
      <div className="card-head"><h2>Technician productivity</h2></div>
      <DataTable rows={rows.map((r) => ({ ...r, id: r.name }))} empty={<Empty icon="users" title="No job cards in this period" />} columns={[
        { key: 'name', label: 'Technician', primary: true },
        { key: 'assigned', label: 'Assigned', num: true },
        { key: 'completed', label: 'Completed', num: true },
        { key: 'rate', label: 'Completion', num: true, render: (r) => `${Math.round((r.completed / (r.assigned || 1)) * 100)}%` },
      ]} />
    </div>
  );
}

function Purchases({ range }) {
  const [d, setD] = useState(null);
  const toast = useToast();
  useEffect(() => { api('/reports/purchases', { params: { date_from: range.from, date_to: range.to } }).then(setD).catch((e) => toast(e.message, 'error')); }, [range, toast]);
  if (!d) return <div className="empty">Loading…</div>;
  const t = d.totals;
  return (
    <div className="stack">
      <div className="grid g4">
        <Stat label="Purchase bills" value={t.count} />
        <Stat label="Purchases" value={money0(t.total)} hint={`Taxable ${money0(t.taxable)}`} />
        <Stat label="Input tax (ITC)" value={money0(t.tax)} />
        <Stat label="Payable" value={money0(t.payable)} hint={`Paid ${money0(t.paid)}`} />
      </div>
      <div className="card">
        <div className="card-head"><h2>Input tax by rate</h2></div>
        <DataTable rows={d.input_tax.map((r) => ({ ...r, id: r.rate }))} empty={<Empty title="No purchases in this period" />} columns={[
          { key: 'rate', label: 'Rate', primary: true, render: (r) => `${r.rate}%` },
          { key: 'taxable', label: 'Taxable', num: true, render: (r) => n2(r.taxable) },
          { key: 'tax', label: 'GST', num: true, render: (r) => n2(r.tax) },
        ]} />
      </div>
      <div className="card">
        <div className="card-head"><h2>Purchase register</h2><button className="btn sm" onClick={() => downloadCSV(`purchases-${d.from}-to-${d.to}.csv`, d.purchases.map(({ id, ...r }) => r))}><Icon name="download" size={14} />CSV</button></div>
        <DataTable rows={d.purchases} empty={<Empty icon="truck" title="No purchases in this period" />} columns={[
          { key: 'number', label: 'Number', primary: true, render: (r) => <Link to={`/purchases/${r.id}`}>{r.number}</Link> },
          { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
          { key: 'supplier', label: 'Supplier' },
          { key: 'supplier_invoice_no', label: 'Bill no.', hideSm: true },
          { key: 'taxable', label: 'Taxable', num: true, render: (r) => n2(r.taxable) },
          { key: 'total', label: 'Total', num: true, render: (r) => money(r.total) },
          { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
        ]} />
      </div>
    </div>
  );
}

function VehicleSales({ range }) {
  const [d, setD] = useState(null);
  const toast = useToast();
  useEffect(() => { api('/reports/vehicle-sales', { params: { date_from: range.from, date_to: range.to } }).then(setD).catch((e) => toast(e.message, 'error')); }, [range, toast]);
  if (!d) return <div className="empty">Loading…</div>;
  const t = d.totals;
  return (
    <div className="stack">
      <div className="grid g4">
        <Stat label="Vehicles sold" value={t.units} hint={`Retail ${t.retail} · Sub-dealer ${t.subdealer}`} />
        <Stat label="Sale value (excl. GST)" value={money0(t.sale_value)} />
        <Stat label="Gross margin" value={money0(t.margin)} hint={t.sale_value ? `${((t.margin / t.sale_value) * 100).toFixed(1)}% of sales` : ''} />
        <Stat label="Avg. margin / vehicle" value={money0(t.units ? t.margin / t.units : 0)} />
      </div>
      <div className="card">
        <div className="card-head"><h2>By model</h2></div>
        <DataTable rows={d.by_model.map((r) => ({ ...r, id: r.model }))} empty={<Empty icon="scooter" title="No vehicle sales in this period" />} columns={[
          { key: 'model', label: 'Model', primary: true },
          { key: 'units', label: 'Units', num: true },
          { key: 'sale_value', label: 'Sale value', num: true, render: (r) => money(r.sale_value) },
          { key: 'margin', label: 'Margin', num: true, render: (r) => money(r.margin) },
        ]} />
      </div>
      <div className="card">
        <div className="card-head"><h2>Chassis-wise register</h2><button className="btn sm" onClick={() => downloadCSV(`vehicle-sales-${d.from}-to-${d.to}.csv`, d.units.map(({ invoice_id, ...r }) => r))}><Icon name="download" size={14} />CSV</button></div>
        <DataTable rows={d.units.map((r) => ({ ...r, id: r.chassis_no }))} empty={<Empty title="No data" />} columns={[
          { key: 'chassis_no', label: 'Chassis', primary: true, render: (r) => <span className="mono">{r.chassis_no}</span> },
          { key: 'model', label: 'Model' },
          { key: 'party', label: 'Sold to', render: (r) => <Link to={`/billing/${r.invoice_id}`}>{r.party}</Link> },
          { key: 'channel', label: 'Channel', hideSm: true },
          { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
          { key: 'sale_value', label: 'Sale', num: true, render: (r) => n2(r.sale_value) },
          { key: 'margin', label: 'Margin', num: true, render: (r) => n2(r.margin) },
        ]} />
      </div>
    </div>
  );
}

export default function Reports() {
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') || 'sales');
  const [range, setRange] = useState({ from: monthStart(), to: today() });
  const dated = ['sales', 'gst', 'technicians', 'purchases', 'vehicles'].includes(tab);
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Reports</h1><p>Sales by business line, purchases, GST, receivables and stock. Export any table to CSV.</p></div></div>
      <div className="between">
        <Tabs value={tab} onChange={setTab} options={[
          { value: 'sales', label: 'Sales' }, { value: 'vehicles', label: 'Vehicle sales' }, { value: 'purchases', label: 'Purchases' },
          { value: 'gst', label: 'GST' }, { value: 'receivables', label: 'Receivables' },
          { value: 'stock', label: 'Spares stock' }, { value: 'technicians', label: 'Technicians' },
        ]} />
        {dated && <Range range={range} setRange={setRange} />}
      </div>
      {tab === 'sales' && <Sales range={range} />}
      {tab === 'gst' && <Gst range={range} />}
      {tab === 'purchases' && <Purchases range={range} />}
      {tab === 'vehicles' && <VehicleSales range={range} />}
      {tab === 'receivables' && <Receivables />}
      {tab === 'stock' && <Stock />}
      {tab === 'technicians' && <Technicians range={range} />}
    </div>
  );
}
