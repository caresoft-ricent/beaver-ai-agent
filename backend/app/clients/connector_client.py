"""连接器HTTP客户端 - 通过连接器配置调用外部API"""
import httpx
import json
import logging
import re
import shlex
from typing import Optional
from string import Template

logger = logging.getLogger("beaver.connector")


class ConnectorAPIError(Exception):
    """API调用失败，携带 curl 调试命令"""
    def __init__(self, message: str, curl: str = "", status_code: int = None):
        super().__init__(message)
        self.curl = curl
        self.status_code = status_code


class ConnectorClient:
    """基于连接器配置调用外部系统API"""

    def __init__(self, connector_config: dict):
        """
        connector_config: {
            base_url, auth_type, auth_config, timeout, mock_enabled
        }
        """
        self.base_url = connector_config["base_url"].rstrip("/")
        self.auth_type = connector_config.get("auth_type", "api_key")
        self.auth_config = connector_config.get("auth_config") or {}
        self.timeout = connector_config.get("timeout", 30)
        self.mock_enabled = connector_config.get("mock_enabled", "0") == "1"
        # v6: Session headers（河狸云打包好的完整请求头）
        self._session_headers = connector_config.get("session_headers")

    def _build_headers(self) -> dict:
        # 优先：从 Session 获取河狸云打包好的完整 headers
        if self._session_headers:
            headers = dict(self._session_headers)
            headers.setdefault("Content-Type", "application/json")
            return headers
        # 兼容：无 Session 时用老方式
        headers = {"Content-Type": "application/json"}
        if self.auth_type == "api_key":
            header_name = self.auth_config.get("header_name", "Authorization")
            key_value = self.auth_config.get("key_value", "")
            if key_value:
                headers[header_name] = key_value
        elif self.auth_type == "jwt_pass":
            token = self.auth_config.get("token", "")
            if token:
                headers["Authorization"] = f"Bearer {token}"
        elif self.auth_type == "proxy_headers":
            # 代理模式: 将 auth_config.headers 中所有键值对注入请求头
            proxy_headers = self.auth_config.get("headers") or {}
            for k, v in proxy_headers.items():
                if k and v:
                    headers[k] = str(v)
        return headers

    def call_action(
        self,
        action_config: dict,
        params: Optional[dict] = None,
        mock_response: Optional[dict] = None,
        param_mapping: Optional[dict] = None,
    ) -> dict:
        """
        执行一个操作
        action_config: {http_method, api_path, request_template, response_mapping}
        param_mapping: {api_param_name: source_property_name} 参数名映射
                       例如 {"regionId": "line_code", "stageId": "line_code"}
                       表示API需要regionId，从上下文的line_code字段取值
        """
        # Mock模式
        if self.mock_enabled and mock_response:
            return {"data": mock_response, "source": "mock"}

        # 应用参数名映射: 将语义参数名转换为API实际参数名
        mapped_params = self._apply_param_mapping(params, param_mapping)

        method = action_config.get("http_method", "GET").upper()
        path = action_config.get("api_path", "")

        # 替换路径中的变量 (如 /api/lines/{line_code})
        if mapped_params:
            for key, value in mapped_params.items():
                path = path.replace(f"{{{key}}}", str(value))

        url = f"{self.base_url}/{path.lstrip('/')}"
        headers = self._build_headers()

        # 构建请求体
        request_body = None
        if method in ("POST", "PUT", "PATCH"):
            template = action_config.get("request_template")
            if template and mapped_params:
                # 简单模板替换
                request_body = self._apply_template(template, mapped_params)
            else:
                request_body = mapped_params

        # 生成等效 curl 命令用于调试
        curl_cmd = self._build_curl(method, url, headers, request_body, mapped_params)

        logger.info("API调用 %s %s params_keys=%s has_body=%s",
                     method, url, list((mapped_params or {}).keys()), request_body is not None)

        try:
            with httpx.Client(timeout=self.timeout) as client:
                if method == "GET":
                    resp = client.get(url, headers=headers, params=mapped_params)
                elif method == "POST":
                    resp = client.post(url, headers=headers, json=request_body)
                elif method == "PUT":
                    resp = client.put(url, headers=headers, json=request_body)
                elif method == "DELETE":
                    resp = client.delete(url, headers=headers)
                else:
                    resp = client.get(url, headers=headers, params=params)

                resp.raise_for_status()
                data = resp.json()

                # 应用响应映射
                mapped = self._apply_response_mapping(
                    data, action_config.get("response_mapping")
                )

                return {
                    "data": mapped,
                    "source": "api",
                    "status_code": resp.status_code,
                    "response_time_ms": int(resp.elapsed.total_seconds() * 1000),
                    "curl": curl_cmd,
                }

        except httpx.HTTPError as e:
            logger.error("API调用失败 %s %s: %s\ncurl: %s", method, url, e, curl_cmd)
            # 如果API失败且启用了mock，降级到mock
            if mock_response:
                return {"data": mock_response, "source": "mock_fallback", "error": str(e), "curl": curl_cmd}
            raise ConnectorAPIError(str(e), curl=curl_cmd, status_code=getattr(getattr(e, 'response', None), 'status_code', None))

    def _apply_param_mapping(self, params: Optional[dict], param_mapping: Optional[dict]) -> Optional[dict]:
        """应用参数名映射: 将语义参数名(如line_code)转换为API实际参数名(如regionId)
        
        param_mapping: {api_param_name: source_property_name}
        例如 {"regionId": "line_code"} → 从params["line_code"]取值, 放入结果的["regionId"]
        
        未在mapping中的原始参数也会保留(透传)
        """
        if not params:
            return params
        if not param_mapping:
            return params

        mapped = {}
        used_sources = set()
        for api_name, source_name in param_mapping.items():
            if source_name in params:
                mapped[api_name] = params[source_name]
                used_sources.add(source_name)
        # 透传未映射的参数
        for key, value in params.items():
            if key not in used_sources and key not in mapped:
                mapped[key] = value
        return mapped

    def _apply_template(self, template: dict, params: dict) -> dict:
        """JSON模板参数替换，自动清理未替换的 ${...} 占位符"""
        result = json.loads(json.dumps(template))
        for key, value in params.items():
            result = json.loads(
                json.dumps(result).replace(f"${{{key}}}", str(value))
            )
        # 提取仍存在的未替换变量名，清理对应条目
        unresolved = set(re.findall(r'\$\{(\w+)\}', json.dumps(result)))
        if unresolved:
            self._clean_unresolved(result, unresolved)
        return result

    @staticmethod
    def _clean_unresolved(obj, unresolved_vars: set):
        """递归移除: (1) key 命中未替换变量名的条目  (2) 值为含 ${} 字符串的条目"""
        if isinstance(obj, dict):
            keys_to_remove = set()
            for k, v in obj.items():
                if k in unresolved_vars:
                    keys_to_remove.add(k)
                elif isinstance(v, str) and '${' in v:
                    keys_to_remove.add(k)
            for k in keys_to_remove:
                del obj[k]
            for v in obj.values():
                if isinstance(v, (dict, list)):
                    ConnectorClient._clean_unresolved(v, unresolved_vars)
        elif isinstance(obj, list):
            for item in obj:
                if isinstance(item, (dict, list)):
                    ConnectorClient._clean_unresolved(item, unresolved_vars)

    @staticmethod
    def _build_curl(method: str, url: str, headers: dict, body=None, params=None) -> str:
        """生成等效 curl 命令(脱敏 Authorization)"""
        parts = ["curl", "-X", method]
        for k, v in headers.items():
            val = v
            if k.lower() == "authorization" and len(v) > 20:
                val = v[:20] + "...[REDACTED]"
            parts.extend(["-H", f"{k}: {val}"])
        if body is not None:
            parts.extend(["-d", json.dumps(body, ensure_ascii=False)])
        final_url = url
        if method == "GET" and params:
            qs = "&".join(f"{k}={v}" for k, v in params.items())
            final_url = f"{url}?{qs}"
        parts.append(final_url)
        return " ".join(shlex.quote(str(p)) for p in parts)

    def _apply_response_mapping(self, data: dict, mapping: Optional[dict]) -> dict:
        """应用响应映射，从API响应中提取需要的字段"""
        if not mapping:
            return data

        result = {}
        for target_key, source_path in mapping.items():
            value = data
            for path_part in source_path.split("."):
                if isinstance(value, dict):
                    value = value.get(path_part)
                elif isinstance(value, list) and path_part.isdigit():
                    value = value[int(path_part)] if int(path_part) < len(value) else None
                else:
                    value = None
                    break
            result[target_key] = value
        return result
