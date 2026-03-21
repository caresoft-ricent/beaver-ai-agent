"""Database Adapter — 只读 SQL 查询适配器

安全约束:
  - 仅支持 query (SELECT)
  - 参数化查询（防注入）
  - 硬限 LIMIT 1000
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass

from app.runtime.adapters.webapi_adapter import AdapterResult

logger = logging.getLogger("beaver.runtime.adapter.database")

# 允许的 SQL 操作白名单
_ALLOWED_ACTIONS = {"query"}


class DatabaseAdapter:
    """数据库适配器：只读、参数化、限流"""

    async def execute(
        self,
        adapter,
        action,
        flat_params: dict,
        input_param_defs,
        output_param_defs,
        headers: dict,
        scope: dict = None,
    ) -> AdapterResult:
        t0 = time.time()

        # 安全检查: 只读
        action_type = getattr(action, "action_type", "query")
        if action_type not in _ALLOWED_ACTIONS:
            return AdapterResult(
                success=False,
                error=f"DatabaseAdapter only supports query, got '{action_type}'",
                latency_ms=int((time.time() - t0) * 1000),
            )

        db_config = adapter.db_config
        if not db_config:
            return AdapterResult(
                success=False,
                error="Adapter missing db_config",
                latency_ms=int((time.time() - t0) * 1000),
            )

        # 构建 SELECT
        select_fields = ", ".join(
            f"`{p.name}`" for p in output_param_defs
        ) if output_param_defs else "*"

        # WHERE 从输入参数构建（参数化）
        where_parts = []
        values = []
        for p in input_param_defs:
            val = flat_params.get(p.source_property or p.name) or flat_params.get(p.name)
            if val is not None:
                where_parts.append(f"`{p.name}` = %s")
                values.append(val)

        where_sql = " AND ".join(where_parts) if where_parts else "1=1"
        table_name = action.action_code  # action_code 作为表名
        limit = min(int(flat_params.get("limit", 100)), 1000)
        sql = f"SELECT {select_fields} FROM `{table_name}` WHERE {where_sql} LIMIT {limit}"

        try:
            import aiomysql
            pool = await aiomysql.create_pool(
                host=db_config.get("host", "127.0.0.1"),
                port=db_config.get("port", 3306),
                user=db_config.get("user", "root"),
                password=db_config.get("password", ""),
                db=db_config.get("database", ""),
                minsize=1, maxsize=3,
                connect_timeout=10,
            )
            async with pool.acquire() as conn:
                async with conn.cursor(aiomysql.DictCursor) as cursor:
                    await cursor.execute(sql, values)
                    rows = await cursor.fetchall()
            pool.close()
            await pool.wait_closed()

            return AdapterResult(
                success=True,
                data=rows,
                raw={"sql": sql, "row_count": len(rows)},
                latency_ms=int((time.time() - t0) * 1000),
            )
        except ImportError:
            return AdapterResult(
                success=False,
                error="aiomysql not installed (pip install aiomysql)",
                latency_ms=int((time.time() - t0) * 1000),
            )
        except Exception as e:
            return AdapterResult(
                success=False,
                error=str(e),
                latency_ms=int((time.time() - t0) * 1000),
            )
