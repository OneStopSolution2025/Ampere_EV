export const ROLE_LABELS = {
  admin: 'Administrator',
  manager: 'Manager',
  cashier: 'Billing Executive',
  technician: 'Technician',
  subdealer: 'Sub-dealer',
};

const INTERNAL = ['admin', 'manager', 'cashier', 'technician'];
const STAFF = ['admin', 'manager', 'cashier'];
const MGMT = ['admin', 'manager'];

export const NAV = [
  { to: '/', label: 'Dashboard', icon: 'grid', roles: [...INTERNAL, 'subdealer'], end: true },
  { section: 'Sales & billing', roles: STAFF },
  { to: '/vehicle-sales', label: 'Vehicle Sales', icon: 'bolt', roles: STAFF },
  { to: '/spare-billing', label: 'Spare Billing', icon: 'receipt', roles: STAFF },
  { to: '/service-billing', label: 'Service Billing', icon: 'wrench', roles: STAFF },
  { section: 'Workshop', roles: INTERNAL },
  { to: '/jobcards', label: 'Job Cards', icon: 'clipboard', roles: INTERNAL },
  { section: 'Stock', roles: STAFF },
  { to: '/vehicle-stock', label: 'Vehicle Stock', icon: 'scooter', roles: STAFF },
  { to: '/inventory', label: 'Spares & Labour', icon: 'box', roles: STAFF },
  { to: '/purchases', label: 'Purchases', icon: 'truck', roles: MGMT },
  { section: 'Partners', roles: STAFF },
  { to: '/subdealers', label: 'Sub-dealers', icon: 'store', roles: STAFF },
  { to: '/customers', label: 'Customers', icon: 'users', roles: STAFF },
  { section: 'My account', roles: ['subdealer'] },
  { to: '/my-stock', label: 'My Vehicles', icon: 'scooter', roles: ['subdealer'] },
  { to: '/my-bills', label: 'Bills & Ledger', icon: 'receipt', roles: ['subdealer'] },
  { section: 'Insights & control', roles: MGMT },
  { to: '/reports', label: 'Reports', icon: 'chart', roles: MGMT },
  { to: '/activity', label: 'Activity Log', icon: 'clock', roles: ['admin'] },
  { to: '/users', label: 'Users & Roles', icon: 'shield', roles: ['admin'] },
  { to: '/settings', label: 'Settings', icon: 'cog', roles: ['admin'] },
];

export const navFor = (role) => {
  const items = NAV.filter((n) => n.roles.includes(role));
  // drop section headers that have no links beneath them
  return items.filter((n, i) => !n.section || (items[i + 1] && !items[i + 1].section));
};

/** Fine-grained UI permissions. The API enforces the same rules server-side. */
export const can = {
  bill: (r) => STAFF.includes(r),
  createJob: (r) => STAFF.includes(r),
  manageItems: (r) => MGMT.includes(r),
  purchase: (r) => MGMT.includes(r),
  cancelInvoice: (r) => MGMT.includes(r),
  editPaidInvoice: (r) => r === 'admin',
  deletePayment: (r) => r === 'admin',
  deleteCustomer: (r) => MGMT.includes(r),
  deleteJob: (r) => MGMT.includes(r),
  manageSubdealers: (r) => MGMT.includes(r),
  setCreditLimit: (r) => r === 'admin',
  deleteVehicle: (r) => r === 'admin',
  reports: (r) => MGMT.includes(r),
};

export const CATEGORY = {
  vehicle: { label: 'Vehicle Sales', single: 'Vehicle sale', path: '/vehicle-sales', doc: 'Tax Invoice' },
  spare: { label: 'Spare Billing', single: 'Spare bill', path: '/spare-billing', doc: 'Tax Invoice' },
  service: { label: 'Service Billing', single: 'Service bill', path: '/service-billing', doc: 'Tax Invoice' },
};
