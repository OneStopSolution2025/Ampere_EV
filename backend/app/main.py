from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse

from .config import settings
from .database import Base, SessionLocal, engine
from .routers import (activity, auth, customers, dashboard, invoices, items, jobcards, purchases, reports, subdealers,
                      users, vehicle_stock)
from .routers import settings as settings_router
from .seed import seed


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed(db)
    yield


app = FastAPI(title=f"{settings.APP_NAME} API", version="1.0.0", lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(CORSMiddleware, allow_origins=settings.CORS_ORIGINS, allow_credentials=False,
                   allow_methods=["*"], allow_headers=["*"])

for r in (auth.router, users.router, customers.router, customers.vrouter, items.router, jobcards.router,
          invoices.router, invoices.prouter, dashboard.router, reports.router, settings_router.router,
          vehicle_stock.router, purchases.router, purchases.srouter, subdealers.router, activity.router):
    app.include_router(r, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok"}


# ---- Serve the built PWA (single-service deploy) ----
DIST = Path(settings.STATIC_DIR) if settings.STATIC_DIR else Path(__file__).resolve().parents[2] / "frontend" / "dist"

if DIST.is_dir():
    NO_CACHE = {"Cache-Control": "no-cache"}

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(404, "Not found")
        target = (DIST / full_path).resolve()
        if full_path and target.is_file() and DIST.resolve() in target.parents:
            # Service worker and manifest must never be cached by the browser.
            headers = NO_CACHE if target.name in ("sw.js", "manifest.webmanifest", "registerSW.js") else None
            return FileResponse(target, headers=headers)
        return FileResponse(DIST / "index.html", headers=NO_CACHE)
