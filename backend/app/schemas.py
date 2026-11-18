import datetime as dt
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

Role = Literal["admin", "manager", "cashier", "technician", "subdealer"]
Kind = Literal["part", "service", "vehicle"]
Mode = Literal["cash", "upi", "card", "bank", "cheque"]


def _clean_id(v: Optional[str]) -> Optional[str]:
    return "".join(v.upper().split()) if v else None


class LoginIn(BaseModel):
    email: str
    password: str


class PasswordChangeIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6)


class UserIn(BaseModel):
    name: str = Field(min_length=2)
    email: str
    phone: Optional[str] = None
    role: Role = "cashier"
    subdealer_id: Optional[int] = None
    is_active: bool = True
    password: Optional[str] = None

    @field_validator("email")
    @classmethod
    def lower(cls, v: str) -> str:
        v = v.strip().lower()
        if "@" not in v:
            raise ValueError("Enter a valid email")
        return v

    @model_validator(mode="after")
    def subdealer_link(self):
        if self.role == "subdealer" and not self.subdealer_id:
            raise ValueError("Select the sub-dealer this login belongs to")
        if self.role != "subdealer":
            self.subdealer_id = None
        return self


class BusinessIn(BaseModel):
    name: str
    tagline: Optional[str] = None
    gstin: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    state: str = "Tamil Nadu"
    state_code: str = "33"
    vehicle_prefix: str = "VS"
    spare_prefix: str = "SP"
    service_prefix: str = "SV"
    estimate_prefix: str = "EST"
    jobcard_prefix: str = "JC"
    purchase_prefix: str = "PUR"
    upi_id: Optional[str] = None
    bank_details: Optional[str] = None
    terms: Optional[str] = None


class VehicleIn(BaseModel):
    reg_no: Optional[str] = None
    make: Optional[str] = None
    model: Optional[str] = None
    variant: Optional[str] = None
    color: Optional[str] = None
    fuel_type: Optional[str] = None
    year: Optional[int] = None
    vin: Optional[str] = None
    motor_no: Optional[str] = None
    battery_no: Optional[str] = None
    odometer: Optional[int] = None

    @field_validator("reg_no", "vin", "motor_no", "battery_no")
    @classmethod
    def norm(cls, v):
        return _clean_id(v)

    @model_validator(mode="after")
    def need_id(self):
        if not self.reg_no and not self.vin:
            raise ValueError("Enter a registration number or chassis number")
        return self


class CustomerIn(BaseModel):
    name: str = Field(min_length=2)
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    gstin: Optional[str] = None
    state: Optional[str] = None
    vehicles: list[VehicleIn] = []


class SubdealerIn(BaseModel):
    name: str = Field(min_length=2)
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    gstin: Optional[str] = None
    state: Optional[str] = None
    address: Optional[str] = None
    credit_limit: float = Field(default=0, ge=0)
    is_active: bool = True


class SupplierIn(BaseModel):
    name: str = Field(min_length=2)
    phone: Optional[str] = None
    email: Optional[str] = None
    gstin: Optional[str] = None
    state: Optional[str] = None
    address: Optional[str] = None


class ItemIn(BaseModel):
    kind: Kind = "part"
    name: str = Field(min_length=2)
    sku: Optional[str] = None
    brand: Optional[str] = None
    hsn_sac: Optional[str] = None
    unit: str = "Nos"
    price: float = Field(ge=0)
    cost_price: float = Field(default=0, ge=0)
    gst_rate: float = Field(default=18, ge=0, le=28)
    stock: float = 0
    reorder_level: float = 0
    is_active: bool = True


class StockAdjustIn(BaseModel):
    qty: float
    reason: Literal["purchase", "adjustment", "return", "damage"] = "adjustment"
    reference: Optional[str] = None


class UnitIn(BaseModel):
    chassis_no: str = Field(min_length=4)
    motor_no: Optional[str] = None
    battery_no: Optional[str] = None
    charger_no: Optional[str] = None
    color: Optional[str] = None
    mfg_year: Optional[int] = None

    @field_validator("chassis_no", "motor_no", "battery_no", "charger_no")
    @classmethod
    def norm(cls, v):
        return _clean_id(v)


class OpeningUnitIn(UnitIn):
    item_id: int
    cost: float = Field(default=0, ge=0)


class UnitUpdateIn(BaseModel):
    motor_no: Optional[str] = None
    battery_no: Optional[str] = None
    charger_no: Optional[str] = None
    color: Optional[str] = None
    mfg_year: Optional[int] = None


class RetailIn(BaseModel):
    customer_name: str = Field(min_length=2)
    phone: Optional[str] = None
    date: Optional[dt.date] = None


class LineIn(BaseModel):
    item_id: Optional[int] = None
    vehicle_unit_id: Optional[int] = None
    kind: Kind = "part"
    description: str = Field(min_length=1)
    hsn_sac: Optional[str] = None
    qty: float = Field(gt=0)
    unit_price: float = Field(ge=0)
    discount: float = Field(default=0, ge=0)
    gst_rate: float = Field(default=18, ge=0, le=28)


class PurchaseLineIn(BaseModel):
    item_id: int
    qty: float = Field(gt=0)
    unit_price: float = Field(ge=0)
    discount: float = Field(default=0, ge=0)
    gst_rate: float = Field(default=18, ge=0, le=28)
    units: list[UnitIn] = []  # one entry per vehicle when the item is a vehicle model


class PaymentIn(BaseModel):
    amount: float = Field(gt=0)
    mode: Mode = "cash"
    reference: Optional[str] = None
    date: Optional[dt.date] = None


class PurchaseIn(BaseModel):
    supplier_id: int
    supplier_invoice_no: Optional[str] = None
    date: Optional[dt.date] = None
    is_interstate: Optional[bool] = None
    notes: Optional[str] = None
    items: list[PurchaseLineIn] = Field(min_length=1)
    payment: Optional[PaymentIn] = None


class JobCardIn(BaseModel):
    customer_id: int
    vehicle_id: int
    technician_id: Optional[int] = None
    odometer: Optional[int] = None
    fuel_level: Optional[str] = None
    complaints: Optional[str] = None
    diagnosis: Optional[str] = None
    estimated_delivery: Optional[dt.date] = None
    items: list[LineIn] = []


class JobCardWorkIn(BaseModel):
    diagnosis: Optional[str] = None
    items: Optional[list[LineIn]] = None


class StatusIn(BaseModel):
    status: Literal["open", "in_progress", "completed", "cancelled"]


class InvoiceIn(BaseModel):
    doc_type: Literal["invoice", "estimate"] = "invoice"
    category: Literal["vehicle", "spare", "service"] = "service"
    date: Optional[dt.date] = None
    customer_id: Optional[int] = None
    subdealer_id: Optional[int] = None
    vehicle_id: Optional[int] = None
    jobcard_id: Optional[int] = None
    odometer: Optional[int] = None
    is_interstate: Optional[bool] = None
    notes: Optional[str] = None
    items: list[LineIn] = Field(min_length=1)
    payment: Optional[PaymentIn] = None

    @model_validator(mode="after")
    def check(self):
        if bool(self.customer_id) == bool(self.subdealer_id):
            raise ValueError("Bill to either a customer or a sub-dealer")
        kinds = {l.kind for l in self.items}
        if self.category == "spare" and kinds - {"part"}:
            raise ValueError("Spare billing can only contain spare parts")
        if self.category == "service" and "vehicle" in kinds:
            raise ValueError("Vehicles are billed under Vehicle Sales")
        if self.category == "service" and self.subdealer_id:
            raise ValueError("Service bills are raised to customers")
        if self.category == "vehicle" and "vehicle" not in kinds:
            raise ValueError("Add at least one vehicle")
        if self.category == "vehicle" and "service" in kinds:
            raise ValueError("Labour belongs on a service bill")
        units = [l.vehicle_unit_id for l in self.items if l.kind == "vehicle"]
        if len(units) != len(set(units)):
            raise ValueError("The same chassis appears twice")
        for l in self.items:
            if l.kind == "vehicle":
                l.qty = 1
        return self
