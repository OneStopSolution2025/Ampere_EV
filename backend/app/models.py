from datetime import date, datetime
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.utcnow()


ROLES = ("admin", "manager", "cashier", "technician", "subdealer")


class Subdealer(Base):
    __tablename__ = "subdealers"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160), index=True)
    contact_person: Mapped[Optional[str]] = mapped_column(String(120))
    phone: Mapped[Optional[str]] = mapped_column(String(20))
    email: Mapped[Optional[str]] = mapped_column(String(160))
    gstin: Mapped[Optional[str]] = mapped_column(String(20))
    state: Mapped[Optional[str]] = mapped_column(String(60))
    address: Mapped[Optional[str]] = mapped_column(Text)
    credit_limit: Mapped[float] = mapped_column(Float, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    phone: Mapped[Optional[str]] = mapped_column(String(20))
    password_hash: Mapped[str] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(20), default="cashier")
    subdealer_id: Mapped[Optional[int]] = mapped_column(ForeignKey("subdealers.id"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    subdealer: Mapped[Optional[Subdealer]] = relationship()


class Business(Base):
    __tablename__ = "business"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160), default="Ampere EV")
    tagline: Mapped[Optional[str]] = mapped_column(String(200), default="Electric Vehicle Sales & Service")
    gstin: Mapped[Optional[str]] = mapped_column(String(20))
    phone: Mapped[Optional[str]] = mapped_column(String(30))
    email: Mapped[Optional[str]] = mapped_column(String(160))
    address: Mapped[Optional[str]] = mapped_column(Text)
    state: Mapped[str] = mapped_column(String(60), default="Tamil Nadu")
    state_code: Mapped[str] = mapped_column(String(4), default="33")
    vehicle_prefix: Mapped[str] = mapped_column(String(10), default="VS")
    spare_prefix: Mapped[str] = mapped_column(String(10), default="SP")
    service_prefix: Mapped[str] = mapped_column(String(10), default="SV")
    estimate_prefix: Mapped[str] = mapped_column(String(10), default="EST")
    jobcard_prefix: Mapped[str] = mapped_column(String(10), default="JC")
    purchase_prefix: Mapped[str] = mapped_column(String(10), default="PUR")
    upi_id: Mapped[Optional[str]] = mapped_column(String(80))
    bank_details: Mapped[Optional[str]] = mapped_column(Text)
    terms: Mapped[Optional[str]] = mapped_column(Text)


class Counter(Base):
    __tablename__ = "counters"
    key: Mapped[str] = mapped_column(String(40), primary_key=True)
    value: Mapped[int] = mapped_column(Integer, default=0)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), index=True)
    user_name: Mapped[Optional[str]] = mapped_column(String(120))
    action: Mapped[str] = mapped_column(String(40), index=True)
    entity: Mapped[str] = mapped_column(String(30), index=True)
    entity_id: Mapped[Optional[int]] = mapped_column(Integer)
    detail: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class Customer(Base):
    __tablename__ = "customers"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160), index=True)
    phone: Mapped[Optional[str]] = mapped_column(String(20), index=True)
    email: Mapped[Optional[str]] = mapped_column(String(160))
    address: Mapped[Optional[str]] = mapped_column(Text)
    gstin: Mapped[Optional[str]] = mapped_column(String(20))
    state: Mapped[Optional[str]] = mapped_column(String(60))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    vehicles: Mapped[list["Vehicle"]] = relationship(back_populates="customer", cascade="all, delete-orphan")


class Vehicle(Base):
    """A customer-owned vehicle (for service history). Created automatically on vehicle sale."""
    __tablename__ = "vehicles"
    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), index=True)
    reg_no: Mapped[Optional[str]] = mapped_column(String(20), unique=True, index=True)
    make: Mapped[Optional[str]] = mapped_column(String(60))
    model: Mapped[Optional[str]] = mapped_column(String(60))
    variant: Mapped[Optional[str]] = mapped_column(String(60))
    color: Mapped[Optional[str]] = mapped_column(String(30))
    fuel_type: Mapped[Optional[str]] = mapped_column(String(20))
    year: Mapped[Optional[int]] = mapped_column(Integer)
    vin: Mapped[Optional[str]] = mapped_column(String(40), index=True)
    motor_no: Mapped[Optional[str]] = mapped_column(String(40))
    battery_no: Mapped[Optional[str]] = mapped_column(String(40))
    odometer: Mapped[Optional[int]] = mapped_column(Integer)
    sold_on: Mapped[Optional[date]] = mapped_column(Date)
    customer: Mapped[Customer] = relationship(back_populates="vehicles")


class Item(Base):
    """Catalogue entry: spare part (qty stock), labour/service, or vehicle model (unit stock)."""
    __tablename__ = "items"
    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(10), default="part")  # part | service | vehicle
    name: Mapped[str] = mapped_column(String(160), index=True)
    sku: Mapped[Optional[str]] = mapped_column(String(60), index=True)
    brand: Mapped[Optional[str]] = mapped_column(String(60))
    hsn_sac: Mapped[Optional[str]] = mapped_column(String(12))
    unit: Mapped[str] = mapped_column(String(12), default="Nos")
    price: Mapped[float] = mapped_column(Float, default=0)
    cost_price: Mapped[float] = mapped_column(Float, default=0)
    gst_rate: Mapped[float] = mapped_column(Float, default=18)
    stock: Mapped[float] = mapped_column(Float, default=0)
    reorder_level: Mapped[float] = mapped_column(Float, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class StockMove(Base):
    __tablename__ = "stock_moves"
    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"), index=True)
    qty: Mapped[float] = mapped_column(Float)
    reason: Mapped[str] = mapped_column(String(40))
    reference: Mapped[Optional[str]] = mapped_column(String(60))
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Supplier(Base):
    __tablename__ = "suppliers"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160), index=True)
    phone: Mapped[Optional[str]] = mapped_column(String(20))
    email: Mapped[Optional[str]] = mapped_column(String(160))
    gstin: Mapped[Optional[str]] = mapped_column(String(20))
    state: Mapped[Optional[str]] = mapped_column(String(60))
    address: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Purchase(Base):
    __tablename__ = "purchases"
    id: Mapped[int] = mapped_column(primary_key=True)
    number: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id"), index=True)
    supplier_invoice_no: Mapped[Optional[str]] = mapped_column(String(40))
    date: Mapped[date] = mapped_column(Date, index=True)
    is_interstate: Mapped[bool] = mapped_column(Boolean, default=False)
    subtotal: Mapped[float] = mapped_column(Float, default=0)
    discount: Mapped[float] = mapped_column(Float, default=0)
    taxable: Mapped[float] = mapped_column(Float, default=0)
    cgst: Mapped[float] = mapped_column(Float, default=0)
    sgst: Mapped[float] = mapped_column(Float, default=0)
    igst: Mapped[float] = mapped_column(Float, default=0)
    round_off: Mapped[float] = mapped_column(Float, default=0)
    total: Mapped[float] = mapped_column(Float, default=0)
    paid: Mapped[float] = mapped_column(Float, default=0)
    status: Mapped[str] = mapped_column(String(12), default="unpaid", index=True)  # unpaid|partial|paid|cancelled
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    supplier: Mapped[Supplier] = relationship()
    lines: Mapped[list["PurchaseLine"]] = relationship(cascade="all, delete-orphan", order_by="PurchaseLine.id")
    payments: Mapped[list["SupplierPayment"]] = relationship(cascade="all, delete-orphan", order_by="SupplierPayment.id")


class PurchaseLine(Base):
    __tablename__ = "purchase_lines"
    id: Mapped[int] = mapped_column(primary_key=True)
    purchase_id: Mapped[int] = mapped_column(ForeignKey("purchases.id"), index=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"))
    kind: Mapped[str] = mapped_column(String(10), default="part")
    description: Mapped[str] = mapped_column(String(200))
    hsn_sac: Mapped[Optional[str]] = mapped_column(String(12))
    qty: Mapped[float] = mapped_column(Float, default=1)
    unit_price: Mapped[float] = mapped_column(Float, default=0)
    discount: Mapped[float] = mapped_column(Float, default=0)
    gst_rate: Mapped[float] = mapped_column(Float, default=18)
    taxable: Mapped[float] = mapped_column(Float, default=0)
    tax: Mapped[float] = mapped_column(Float, default=0)
    total: Mapped[float] = mapped_column(Float, default=0)


class SupplierPayment(Base):
    __tablename__ = "supplier_payments"
    id: Mapped[int] = mapped_column(primary_key=True)
    purchase_id: Mapped[int] = mapped_column(ForeignKey("purchases.id"), index=True)
    amount: Mapped[float] = mapped_column(Float)
    mode: Mapped[str] = mapped_column(String(12), default="bank")
    reference: Mapped[Optional[str]] = mapped_column(String(80))
    date: Mapped[date] = mapped_column(Date)
    created_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))


class VehicleUnit(Base):
    """One physical vehicle in stock, identified by chassis number."""
    __tablename__ = "vehicle_units"
    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"), index=True)
    chassis_no: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    motor_no: Mapped[Optional[str]] = mapped_column(String(40))
    battery_no: Mapped[Optional[str]] = mapped_column(String(40))
    charger_no: Mapped[Optional[str]] = mapped_column(String(40))
    color: Mapped[Optional[str]] = mapped_column(String(30))
    mfg_year: Mapped[Optional[int]] = mapped_column(Integer)
    cost: Mapped[float] = mapped_column(Float, default=0)
    status: Mapped[str] = mapped_column(String(16), default="in_stock", index=True)
    # in_stock | with_subdealer | sold
    purchase_id: Mapped[Optional[int]] = mapped_column(ForeignKey("purchases.id"))
    subdealer_id: Mapped[Optional[int]] = mapped_column(ForeignKey("subdealers.id"), index=True)
    invoice_id: Mapped[Optional[int]] = mapped_column(Integer)
    customer_vehicle_id: Mapped[Optional[int]] = mapped_column(Integer)
    retail_customer: Mapped[Optional[str]] = mapped_column(String(160))
    retail_phone: Mapped[Optional[str]] = mapped_column(String(20))
    sold_on: Mapped[Optional[date]] = mapped_column(Date)
    received_on: Mapped[date] = mapped_column(Date, default=date.today)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    item: Mapped[Item] = relationship()
    subdealer: Mapped[Optional[Subdealer]] = relationship()


class JobCard(Base):
    __tablename__ = "jobcards"
    id: Mapped[int] = mapped_column(primary_key=True)
    number: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), index=True)
    vehicle_id: Mapped[int] = mapped_column(ForeignKey("vehicles.id"), index=True)
    technician_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), index=True)
    odometer: Mapped[Optional[int]] = mapped_column(Integer)
    fuel_level: Mapped[Optional[str]] = mapped_column(String(10))  # battery charge level for EVs
    complaints: Mapped[Optional[str]] = mapped_column(Text)
    diagnosis: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="open", index=True)
    estimated_delivery: Mapped[Optional[date]] = mapped_column(Date)
    invoice_id: Mapped[Optional[int]] = mapped_column(Integer)
    created_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
    customer: Mapped[Customer] = relationship()
    vehicle: Mapped[Vehicle] = relationship()
    technician: Mapped[Optional[User]] = relationship(foreign_keys=[technician_id])
    items: Mapped[list["JobCardItem"]] = relationship(cascade="all, delete-orphan", order_by="JobCardItem.id")


class JobCardItem(Base):
    __tablename__ = "jobcard_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    jobcard_id: Mapped[int] = mapped_column(ForeignKey("jobcards.id"), index=True)
    item_id: Mapped[Optional[int]] = mapped_column(ForeignKey("items.id"))
    kind: Mapped[str] = mapped_column(String(10), default="part")
    description: Mapped[str] = mapped_column(String(200))
    hsn_sac: Mapped[Optional[str]] = mapped_column(String(12))
    qty: Mapped[float] = mapped_column(Float, default=1)
    unit_price: Mapped[float] = mapped_column(Float, default=0)
    gst_rate: Mapped[float] = mapped_column(Float, default=18)


class Invoice(Base):
    """Tax invoice or estimate. category: vehicle | spare | service. Billed to a customer or a sub-dealer."""
    __tablename__ = "invoices"
    id: Mapped[int] = mapped_column(primary_key=True)
    doc_type: Mapped[str] = mapped_column(String(10), default="invoice", index=True)
    category: Mapped[str] = mapped_column(String(10), default="service", index=True)
    number: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    customer_id: Mapped[Optional[int]] = mapped_column(ForeignKey("customers.id"), index=True)
    subdealer_id: Mapped[Optional[int]] = mapped_column(ForeignKey("subdealers.id"), index=True)
    vehicle_id: Mapped[Optional[int]] = mapped_column(ForeignKey("vehicles.id"))
    jobcard_id: Mapped[Optional[int]] = mapped_column(ForeignKey("jobcards.id"))
    odometer: Mapped[Optional[int]] = mapped_column(Integer)
    is_interstate: Mapped[bool] = mapped_column(Boolean, default=False)
    subtotal: Mapped[float] = mapped_column(Float, default=0)
    discount: Mapped[float] = mapped_column(Float, default=0)
    taxable: Mapped[float] = mapped_column(Float, default=0)
    cgst: Mapped[float] = mapped_column(Float, default=0)
    sgst: Mapped[float] = mapped_column(Float, default=0)
    igst: Mapped[float] = mapped_column(Float, default=0)
    round_off: Mapped[float] = mapped_column(Float, default=0)
    total: Mapped[float] = mapped_column(Float, default=0)
    paid: Mapped[float] = mapped_column(Float, default=0)
    status: Mapped[str] = mapped_column(String(12), default="unpaid", index=True)
    converted_to_id: Mapped[Optional[int]] = mapped_column(Integer)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    customer: Mapped[Optional[Customer]] = relationship()
    subdealer: Mapped[Optional[Subdealer]] = relationship()
    vehicle: Mapped[Optional[Vehicle]] = relationship()
    lines: Mapped[list["InvoiceLine"]] = relationship(cascade="all, delete-orphan", order_by="InvoiceLine.id")
    payments: Mapped[list["Payment"]] = relationship(cascade="all, delete-orphan", order_by="Payment.id")

    @property
    def party_name(self) -> str:
        return self.subdealer.name if self.subdealer else (self.customer.name if self.customer else "—")

    @property
    def party_phone(self) -> Optional[str]:
        return self.subdealer.phone if self.subdealer else (self.customer.phone if self.customer else None)


class InvoiceLine(Base):
    __tablename__ = "invoice_lines"
    id: Mapped[int] = mapped_column(primary_key=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id"), index=True)
    item_id: Mapped[Optional[int]] = mapped_column(ForeignKey("items.id"))
    vehicle_unit_id: Mapped[Optional[int]] = mapped_column(ForeignKey("vehicle_units.id"))
    kind: Mapped[str] = mapped_column(String(10), default="part")
    description: Mapped[str] = mapped_column(String(200))
    hsn_sac: Mapped[Optional[str]] = mapped_column(String(12))
    qty: Mapped[float] = mapped_column(Float, default=1)
    unit_price: Mapped[float] = mapped_column(Float, default=0)
    discount: Mapped[float] = mapped_column(Float, default=0)
    gst_rate: Mapped[float] = mapped_column(Float, default=18)
    taxable: Mapped[float] = mapped_column(Float, default=0)
    tax: Mapped[float] = mapped_column(Float, default=0)
    total: Mapped[float] = mapped_column(Float, default=0)


class Payment(Base):
    __tablename__ = "payments"
    id: Mapped[int] = mapped_column(primary_key=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id"), index=True)
    amount: Mapped[float] = mapped_column(Float)
    mode: Mapped[str] = mapped_column(String(12), default="cash")
    reference: Mapped[Optional[str]] = mapped_column(String(80))
    date: Mapped[date] = mapped_column(Date, index=True)
    received_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
