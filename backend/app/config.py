import os


class Settings:
    APP_NAME: str = os.getenv("APP_NAME", "Ampere EV")
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./autobill.db")
    SECRET_KEY: str = os.getenv("SECRET_KEY", "change-this-secret-in-production")
    TOKEN_HOURS: int = int(os.getenv("TOKEN_HOURS", "12"))
    CORS_ORIGINS: list[str] = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]
    ADMIN_EMAIL: str = os.getenv("ADMIN_EMAIL", "admin@ampereev.local")
    ADMIN_PASSWORD: str = os.getenv("ADMIN_PASSWORD", "Admin@123")
    SEED_DEMO: bool = os.getenv("SEED_DEMO", "0").lower() in ("1", "true", "yes")
    STATIC_DIR: str = os.getenv("STATIC_DIR", "")


settings = Settings()
