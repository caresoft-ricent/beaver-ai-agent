"""连接器HTTP客户端 - 通过连接器配置调用外部API"""
import httpx
import json
from typing import Optional
from string import Template


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

    def _build_headers(self) -> dict:
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
        return headers

    def call_action(
        self,
        action_config: dict,
        params: Optional[dict] = None,
        mock_response: Optional[dict] = None,
    ) -> dict:
        """
        执行一个操作
        action_config: {http_method, api_path, request_template, response_mapping}
        """
        # Mock模式
        if self.mock_enabled and mock_response:
            return {"data": mock_response, "source": "mock"}

        method = action_config.get("http_method", "GET").upper()
        path = action_config.get("api_path", "")

        # 替换路径中的变量 (如 /api/lines/{line_code})
        if params:
            for key, value in params.items():
                path = path.replace(f"{{{key}}}", str(value))

        url = f"{self.base_url}/{path.lstrip('/')}"
        headers = self._build_headers()

        # 构建请求体
        request_body = None
        if method in ("POST", "PUT", "PATCH"):
            template = action_config.get("request_template")
            if template and params:
                # 简单模板替换
                request_body = self._apply_template(template, params)
            else:
                request_body = params

        try:
            with httpx.Client(timeout=self.timeout) as client:
                if method == "GET":
                    resp = client.get(url, headers=headers, params=params)
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
                }

        except httpx.HTTPError as e:
            # 如果API失败且启用了mock，降级到mock
            if mock_response:
                return {"data": mock_response, "source": "mock_fallback", "error": str(e)}
            raise

    def _apply_template(self, template: dict, params: dict) -> dict:
        """简单的JSON模板参数替换"""
        result = json.loads(json.dumps(template))
        for key, value in params.items():
            result = json.loads(
                json.dumps(result).replace(f"${{{key}}}", str(value))
            )
        return result

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
