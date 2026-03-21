"""Adapter Registry — 按 adapter_type 分发到具体 Adapter 实现"""
from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger("beaver.runtime.adapter")


class AdapterRegistry:
    """适配器注册表 — 按 adapter_type 路由"""

    def __init__(self):
        self._impls: dict = {}

    def register(self, adapter_type: str, impl):
        self._impls[adapter_type] = impl

    def get(self, adapter_type: str):
        impl = self._impls.get(adapter_type)
        if not impl:
            raise ValueError(f"Unknown adapter_type: {adapter_type}")
        return impl


def build_default_registry() -> AdapterRegistry:
    """构建默认的 AdapterRegistry，注册所有内置 Adapter"""
    from app.runtime.adapters.webapi_adapter import WebApiAdapter

    registry = AdapterRegistry()
    registry.register("webapi", WebApiAdapter())
    # 未来: registry.register("database", DatabaseAdapter())
    return registry
