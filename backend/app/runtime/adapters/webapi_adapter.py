"""WebAPI Adapter — HTTP 调用 + 请求/响应映射

根据 adapter.request_mapper 选择映射策略:
  - passthrough:     平进平出（通用 REST）
  - beaver_dataset:  河狸云数据集查询协议（filterModel/valueCols/sortModel）

关键设计：
  - Parameter 表的 filter_type / filter_condition / value_mode / agg_func
    提供映射所需的元信息
  - Adapter 代码按元信息组装请求体
  - filterModel 中，同一字段的多条件用 conditions 集合 + operator 组合
"""
from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from typing import Optional

import httpx

logger = logging.getLogger("beaver.runtime.adapter.webapi")


# ━━━━━━━━━━━━━━━━━━ 数据结构 ━━━━━━━━━━━━━━━━━━

@dataclass
class AdapterResult:
    """Adapter 统一返回"""
    success: bool
    data: object = None
    raw: object = None
    status_code: int = 0
    latency_ms: int = 0
    error: str = None
    curl: str = ""


# ━━━━━━━━━━━━━━━━━━ WebApiAdapter ━━━━━━━━━━━━━━━━━━

class WebApiAdapter:
    """WebAPI 适配器"""

    async def execute(
        self,
        adapter,             # Connector ORM 对象
        action,              # Action ORM 对象
        flat_params: dict,   # 打平的 key-value（Kernel 视角）
        input_param_defs,    # list[ActionParameter] — 输入参数定义
        output_param_defs,   # list[ActionParameter] — 输出参数定义
        headers: dict,       # 完整请求头（session_headers 或 legacy）
        scope: dict = None,
    ) -> AdapterResult:
        """执行 HTTP 调用: 映射 → 请求 → 响应映射"""
        t0 = time.time()

        # 1. 选择映射器并构建请求体
        req_mapper = _get_request_mapper(adapter.request_mapper)
        request_body = req_mapper.map_request(flat_params, input_param_defs, output_param_defs, action)

        # 2. 构建 URL
        base_url = (adapter.base_url or "").rstrip("/")
        api_path = (action.api_path or "").lstrip("/")
        url = f"{base_url}/{api_path}" if api_path else base_url

        # 3. HTTP 方法
        method = (action.http_method or "POST").upper()

        # 4. 发起请求
        try:
            timeout = adapter.timeout or 30
            async with httpx.AsyncClient(timeout=timeout) as client:
                if method == "GET":
                    resp = await client.get(url, params=request_body if isinstance(request_body, dict) else None, headers=headers)
                else:
                    resp = await client.request(method, url, json=request_body, headers=headers)
                resp.raise_for_status()
                raw_response = resp.json()
        except httpx.HTTPStatusError as e:
            return AdapterResult(
                success=False, status_code=e.response.status_code,
                error=f"HTTP {e.response.status_code}: {e.response.text[:500]}",
                latency_ms=int((time.time() - t0) * 1000),
                curl=_build_curl(method, url, request_body, headers),
            )
        except Exception as e:
            return AdapterResult(
                success=False, error=str(e),
                latency_ms=int((time.time() - t0) * 1000),
                curl=_build_curl(method, url, request_body, headers),
            )

        # 5. 响应映射
        resp_mapper = _get_response_mapper(adapter.response_mapper)
        mapped_data = resp_mapper.map_response(raw_response, output_param_defs)

        return AdapterResult(
            success=True,
            data=mapped_data,
            raw=raw_response,
            status_code=resp.status_code,
            latency_ms=int((time.time() - t0) * 1000),
            curl=_build_curl(method, url, request_body, headers),
        )


# ━━━━━━━━━━━━━━━━━━ 请求映射器 ━━━━━━━━━━━━━━━━━━


class PassthroughRequestMapper:
    """平进: 打平参数直接作为请求体"""

    def map_request(self, flat_params, input_defs, output_defs, action):
        return flat_params


class BeaverDatasetRequestMapper:
    """河狸云数据集查询协议映射器

    把打平的 input/output 参数转换为 filterModel + valueCols + rowGroupCols + sortModel。

    关键：filterModel 是集合结构，同一字段的多个条件组装为:
      {
        "fieldName": {
          "filterType": "...",
          "operator": "AND",
          "conditions": [
            {"type": "greaterThan", "filter": 100},
            {"type": "lessThan", "filter": 1000}
          ]
        }
      }
    单条件简化为不含 conditions 的平铺格式。
    """

    def map_request(self, flat_params, input_defs, output_defs, action):
        body = {
            "datasetCode": action.action_code,
            "filterModel": {},
            "valueCols": [],
            "rowGroupCols": [],
            "sortModel": [],
        }

        # ========== 输入参数 → filterModel / keyword / limit ==========
        # 收集同一字段的多条件
        filter_collector: dict[str, list] = {}  # name → [(param_def, value)]

        for p in input_defs:
            value = flat_params.get(p.source_property or p.name)
            if value is None:
                # 尝试直接用 name 取
                value = flat_params.get(p.name)
            if value is None and not p.is_required:
                continue

            # 特殊参数：keyword
            if p.name == "keyword":
                if value is not None:
                    body["keyword"] = value
                continue

            # 特殊参数：limit
            if p.name == "limit":
                if value is not None:
                    body["limit"] = int(value)
                continue

            # 常规参数 → 收集到 filter_collector
            if p.filter_type:
                key = p.name
                if key not in filter_collector:
                    filter_collector[key] = []
                filter_collector[key].append((p, value))

        # 组装 filterModel — 支持集合（同一字段多条件）
        for field_name, items in filter_collector.items():
            if len(items) == 1:
                # 单条件 → 平铺格式
                p, value = items[0]
                body["filterModel"][field_name] = self._build_single_filter(p, value)
            else:
                # 多条件 → conditions 集合
                first_p = items[0][0]
                conditions = []
                for p, value in items:
                    cond = {}
                    if p.filter_condition:
                        cond["type"] = p.filter_condition
                    self._set_filter_value(cond, p, value)
                    conditions.append(cond)
                body["filterModel"][field_name] = {
                    "filterType": first_p.filter_type,
                    "operator": "AND",
                    "conditions": conditions,
                }

        # ========== 输出参数 → valueCols + rowGroupCols + sortModel ==========
        has_agg = any(p.agg_func for p in output_defs)

        for p in output_defs:
            col = {"field": p.name}

            if p.agg_func:
                col["aggFunc"] = p.agg_func
                body["valueCols"].append(col)
            else:
                body["valueCols"].append(col)
                if has_agg:
                    # 其他输出参数有聚合 → 本参数自动归入 rowGroupCols
                    body["rowGroupCols"].append({"field": p.name})

            # 排序
            if p.sort_order:
                body["sortModel"].append({"colId": p.name, "sort": p.sort_order})

        return body

    def _build_single_filter(self, p, value) -> dict:
        """构建单条件 filter item"""
        filter_item = {"filterType": p.filter_type}
        if p.filter_condition:
            filter_item["type"] = p.filter_condition
        self._set_filter_value(filter_item, p, value)
        return filter_item

    def _set_filter_value(self, item: dict, p, value):
        """根据 value_mode 设置 filter 的值字段"""
        if p.value_mode == "values":
            # set 模式: 多值
            item["values"] = value if isinstance(value, list) else [value]
        elif p.value_mode == "range":
            # 范围模式
            if isinstance(value, (list, tuple)) and len(value) == 2:
                item["filter"] = value[0]
                item["filterTo"] = value[1]
            else:
                item["filter"] = value
        elif p.value_mode == "date_range":
            # 日期范围模式
            if isinstance(value, (list, tuple)) and len(value) == 2:
                item["dateFrom"] = value[0]
                item["dateTo"] = value[1]
            else:
                item["dateFrom"] = value
        else:
            # 默认 filter 模式: 单值
            item["filter"] = value


# ━━━━━━━━━━━━━━━━━━ 响应映射器 ━━━━━━━━━━━━━━━━━━


class PassthroughResponseMapper:
    """平出: 原始响应直接返回"""

    def map_response(self, raw_response, output_defs):
        return raw_response


class BeaverDatasetResponseMapper:
    """河狸云数据集响应提取

    河狸云响应通常是:
      { "code": 200, "data": { "data": [...], "total": N } }
    或:
      { "code": 200, "data": [...] }
    """

    def map_response(self, raw_response, output_defs):
        if not isinstance(raw_response, dict):
            return raw_response

        # 解包 {code, data} 外层
        data = raw_response.get("data", raw_response)
        if isinstance(data, dict) and "data" in data:
            inner = data["data"]
            total = data.get("total")
            if isinstance(inner, list):
                return {"items": inner, "total": total or len(inner)}
            return inner
        if isinstance(data, list):
            return {"items": data, "total": len(data)}
        return data


# ━━━━━━━━━━━━━━━━━━ 工具函数 ━━━━━━━━━━━━━━━━━━


_MAPPER_CACHE: dict[str, object] = {}


def _get_request_mapper(mapper_type: str):
    key = f"req_{mapper_type}"
    if key not in _MAPPER_CACHE:
        _MAPPER_CACHE[key] = {
            "passthrough": PassthroughRequestMapper(),
            "beaver_dataset": BeaverDatasetRequestMapper(),
        }.get(mapper_type, PassthroughRequestMapper())
    return _MAPPER_CACHE[key]


def _get_response_mapper(mapper_type: str):
    key = f"resp_{mapper_type}"
    if key not in _MAPPER_CACHE:
        _MAPPER_CACHE[key] = {
            "passthrough": PassthroughResponseMapper(),
            "beaver_dataset": BeaverDatasetResponseMapper(),
        }.get(mapper_type, PassthroughResponseMapper())
    return _MAPPER_CACHE[key]


def _build_curl(method: str, url: str, body, headers: dict) -> str:
    """生成调试用 curl（脱敏 Authorization）"""
    parts = [f"curl -X {method}"]
    safe_headers = {}
    for k, v in (headers or {}).items():
        if k.lower() == "authorization":
            safe_headers[k] = v[:20] + "..."
        else:
            safe_headers[k] = v
    for k, v in safe_headers.items():
        parts.append(f"-H '{k}: {v}'")
    if body and method != "GET":
        body_str = json.dumps(body, ensure_ascii=False)
        if len(body_str) > 500:
            body_str = body_str[:500] + "..."
        parts.append(f"-d '{body_str}'")
    parts.append(f"'{url}'")
    return " \\\n  ".join(parts)
