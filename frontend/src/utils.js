const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const inr0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

export const money = (v) => inr.format(Number(v || 0));
export const money0 = (v) => inr0.format(Number(v || 0));
export const n2 = (v) => num.format(Number(v || 0));
const fixed = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const amt = (v) => fixed.format(Number(v || 0));
export const modeLabel = (m) => ({ cash: 'Cash', upi: 'UPI', card: 'Card', bank: 'Bank Transfer', cheque: 'Cheque' }[m] || m);
export const r2 = (v) => Math.round((Number(v || 0) + Number.EPSILON) * 100) / 100;

export const today = () => new Date().toLocaleDateString('en-CA');
export const monthStart = () => { const d = new Date(); d.setDate(1); return d.toLocaleDateString('en-CA'); };

export function fmtDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtDateTime(iso) {
  if (!iso) return '-';
  return new Date(iso + (iso.endsWith('Z') ? '' : 'Z')).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export const titleCase = (s = '') => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
export const STATUS_LABEL = { in_stock: 'In showroom', with_subdealer: 'With sub-dealer', sold: 'Sold', unpaid: 'Unpaid', partial: 'Part paid' };

/** Mirrors the server's GST calculation for live totals in forms. */
export function computeTotals(lines, interstate) {
  let subtotal = 0, discount = 0, taxable = 0, tax = 0;
  for (const l of lines) {
    const gross = r2((+l.qty || 0) * (+l.unit_price || 0));
    const d = r2(Math.min(+l.discount || 0, gross));
    const t = r2(gross - d);
    subtotal += gross; discount += d; taxable += t; tax += r2((t * (+l.gst_rate || 0)) / 100);
  }
  tax = r2(tax);
  const cgst = interstate ? 0 : r2(tax / 2);
  const sgst = interstate ? 0 : r2(tax - cgst);
  const igst = interstate ? tax : 0;
  const grand = r2(taxable + tax);
  const total = Math.round(grand);
  return { subtotal: r2(subtotal), discount: r2(discount), taxable: r2(taxable), cgst, sgst, igst, round_off: r2(total - grand), total };
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const two = (n) => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : ''));
const three = (n) => {
  const h = Math.floor(n / 100), r = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', r ? two(r) : ''].filter(Boolean).join(' ');
};

/** Indian numbering system: 1,25,430.50 → One Lakh Twenty Five Thousand Four Hundred Thirty Rupees and Fifty Paise Only */
export function amountInWords(amount) {
  const value = Math.abs(Number(amount || 0));
  let n = Math.floor(value);
  const paise = Math.round((value - n) * 100);
  if (n === 0 && paise === 0) return 'Zero Rupees Only';
  const parts = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thousand = Math.floor(n / 1e3); n %= 1e3;
  if (crore) parts.push(`${three(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (n) parts.push(three(n));
  let words = parts.length ? `${parts.join(' ')} Rupees` : '';
  if (paise) words += `${words ? ' and ' : ''}${two(paise)} Paise`;
  return `${words} Only`;
}

export function downloadCSV(filename, rows) {
  if (!rows?.length) return;
  const headers = Object.keys(rows[0]);
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

export const STATUS_TONE = {
  paid: 'green', partial: 'amber', unpaid: 'red', cancelled: 'gray', open: 'blue', converted: 'green',
  in_progress: 'amber', completed: 'green', invoiced: 'violet',
  in_stock: 'blue', with_subdealer: 'amber', sold: 'green',
};

export const GST_RATES = [0, 5, 12, 18, 28];
export const PAYMENT_MODES = [
  { value: 'cash', label: 'Cash' }, { value: 'upi', label: 'UPI' }, { value: 'card', label: 'Card' },
  { value: 'bank', label: 'Bank Transfer' }, { value: 'cheque', label: 'Cheque' },
];
export const INDIAN_STATES = ['Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry'];
