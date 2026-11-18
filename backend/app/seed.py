from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .config import settings
from .models import Customer, Item, StockMove, Subdealer, Supplier, User, Vehicle, VehicleUnit
from .security import hash_password
from .services import get_business

DEMO_USERS = [
    ("Meena Manager", "manager@ampereev.local", "manager"),
    ("Karthik Cashier", "cashier@ampereev.local", "cashier"),
    ("Ravi Technician", "tech@ampereev.local", "technician"),
]

# name, sku, hsn, ex-showroom price (excl. GST), cost, gst, reorder level, colours  — demo values, edit in Inventory
DEMO_MODELS = [
    ("Magnus EX", "AMP-MAGEX", "87116010", 88000, 80000, 5, 2, ["Graphite Black", "Metallic Red", "Galactic Grey"]),
    ("Primus", "AMP-PRIMUS", "87116010", 105000, 96000, 5, 2, ["Havelock Blue", "Royal Orange", "White"]),
    ("Nexus", "AMP-NEXUS", "87116010", 112000, 102000, 5, 1, ["Zanskar Aqua", "Lunar White"]),
    ("Reo Li Plus", "AMP-REO", "87116010", 62000, 56000, 5, 2, ["Black", "Blue"]),
]

DEMO_ITEMS = [
    # kind, name, sku, brand, hsn/sac, unit, price, cost, gst, stock, reorder
    ("service", "Periodic Service – Labour", "SRV-PS", None, "998714", "Job", 450, 0, 18, 0, 0),
    ("service", "Battery Health Check & Diagnostics", "SRV-BHC", None, "998714", "Job", 300, 0, 18, 0, 0),
    ("service", "Motor & Controller Inspection", "SRV-MCI", None, "998714", "Job", 400, 0, 18, 0, 0),
    ("service", "Brake Adjustment", "SRV-BRK", None, "998714", "Job", 150, 0, 18, 0, 0),
    ("service", "Wash & Polish", "SRV-WASH", None, "998714", "Job", 200, 0, 18, 0, 0),
    ("part", "Brake Shoe Set", "BRK-SHOE", None, "87149400", "Set", 380, 260, 18, 20, 5),
    ("part", "Tyre 90/90-12 Tubeless", "TYR-9090", None, "40114000", "Nos", 1650, 1250, 18, 10, 4),
    ("part", "Off-board Charger 48V", "CHG-48V", None, "85044090", "Nos", 4200, 3300, 18, 4, 2),
    ("part", "Motor Controller", "CTRL-48V", None, "85371000", "Nos", 6800, 5200, 18, 2, 1),
    ("part", "Throttle Assembly", "THR-ASSY", None, "87149990", "Nos", 950, 680, 18, 6, 2),
    ("part", "Headlamp LED Assembly", "HL-LED", None, "85122010", "Nos", 1450, 1050, 18, 3, 3),
    ("part", "Li-ion Battery Pack 60V", "BAT-LI60", None, "85076000", "Nos", 32000, 27000, 18, 2, 1),
]


def seed(db: Session):
    get_business(db)
    if not db.scalar(select(func.count()).select_from(User)):
        db.add(User(name="Administrator", email=settings.ADMIN_EMAIL.lower(), role="admin",
                    password_hash=hash_password(settings.ADMIN_PASSWORD)))
        db.flush()

    if settings.SEED_DEMO and not db.scalar(select(func.count()).select_from(Item)):
        for name, email, role in DEMO_USERS:
            if not db.scalar(select(User).where(User.email == email)):
                db.add(User(name=name, email=email, role=role, password_hash=hash_password("Demo@123")))
        for kind, name, sku, brand, hsn, unit, price, cost, gst, stock, reorder in DEMO_ITEMS:
            item = Item(kind=kind, name=name, sku=sku, brand=brand, hsn_sac=hsn, unit=unit, price=price,
                        cost_price=cost, gst_rate=gst, stock=stock, reorder_level=reorder)
            db.add(item)
            db.flush()
            if stock:
                db.add(StockMove(item_id=item.id, qty=stock, reason="opening", reference="Opening stock"))
        db.flush()
        n = 0
        for name, sku, hsn, price, cost, gst, reorder, colours in DEMO_MODELS:
            m = Item(kind="vehicle", name=name, sku=sku, brand="Ampere", hsn_sac=hsn, unit="Nos", price=price,
                     cost_price=cost, gst_rate=gst, reorder_level=reorder)
            db.add(m)
            db.flush()
            for k in range(3):
                n += 1
                db.add(VehicleUnit(item_id=m.id, chassis_no=f"MD9AMP{2026}{n:05d}", motor_no=f"MTR{n:06d}",
                                   battery_no=f"BAT{n:06d}", charger_no=f"CHG{n:06d}", color=colours[k % len(colours)],
                                   mfg_year=2026, cost=cost))
            m.stock = 3
        db.add(Supplier(name="Greaves Electric Mobility Pvt Ltd", state="Tamil Nadu", phone="1800 000 0000",
                        address="Ranipet, Tamil Nadu"))
        sdl = Subdealer(name="Sri Balaji EV Point", contact_person="Balaji R", phone="9443012345", state="Tamil Nadu",
                        address="Palani", credit_limit=500000)
        db.add(sdl)
        db.flush()
        db.add(User(name="Balaji R", email="subdealer@ampereev.local", role="subdealer", subdealer_id=sdl.id,
                    password_hash=hash_password("Demo@123")))
        c = Customer(name="Arun Kumar", phone="9876543210", state="Tamil Nadu", address="Dindigul")
        c.vehicles.append(Vehicle(reg_no="TN57AB1234", make="Ampere", model="Magnus EX", fuel_type="Electric",
                                  year=2024, odometer=8200))
        db.add(c)
    db.commit()
