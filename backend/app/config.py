from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    db_host: str = "127.0.0.1"
    db_port: int = 13306
    db_user: str = "root"
    db_password: str = "beaver2026"
    db_name: str = "beaver_ai"

    # Redis
    redis_host: str = "127.0.0.1"
    redis_port: int = 16379
    redis_db: int = 0

    # JWT
    jwt_secret: str = "beaver-ai-secret-2026-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440

    # App
    app_env: str = "development"
    app_debug: bool = True
    app_port: int = 8000

    # Beaver Cloud WebAPI（身份验证）
    app_secret: str = ""
    app_retrieve_url: str = ""

    @property
    def database_url(self) -> str:
        return (
            f"mysql+pymysql://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}?charset=utf8mb4"
        )

    @property
    def redis_url(self) -> str:
        return f"redis://{self.redis_host}:{self.redis_port}/{self.redis_db}"

    model_config = {"env_file": "../../.env", "env_file_encoding": "utf-8"}


@lru_cache()
def get_settings() -> Settings:
    return Settings()
