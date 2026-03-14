"""河狸云 (Beaver Cloud) API 适配客户端

河狸云是东威科技的 SaaS 生产管理平台。
本模块封装河狸云 OpenAPI 调用逻辑，供 ConnectorClient 通过配置驱动。

---
河狸云 API 对接配置说明
========================

1. 在「连接器管理」页面编辑连接器：
   - Base URL: 河狸云 API 地址（如 https://openapi.beavercloud.com/v1）
   - 认证方式: api_key
   - 认证配置: { "header_name": "Authorization", "key_value": "Bearer <your-api-key>" }
   - Mock 模式: 关闭（取消勾选）

2. 在「业务本体」页面，确保实体 (Entity) 关联了上述连接器

3. 在实体下配置操作 (Action)：
   - api_path: 河狸云 API 路径（如 production/lines）
   - http_method: GET
   - request_template: 请求体模板（POST 时使用）
   - response_mapping: 字段映射（从河狸云响应提取数据）
   - mock_response: 仍可保留作为降级兜底

4. 对话引擎会自动：连接器 → Action → API 调用 → response_mapping → 回复生成
"""
import httpx
import logging
from typing import Optional

logger = logging.getLogger(__name__)


class BeaverCloudClient:
    """河狸云 OpenAPI 专用客户端

    封装河狸云特有的认证、分页、错误处理逻辑。
    由 ConnectorClient 在 type=beaver_cloud 时调用。
    """

    def __init__(self, base_url: str, api_key: str, timeout: int = 30):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    def request(
        self,
        method: str,
        path: str,
        params: Optional[dict] = None,
        body: Optional[dict] = None,
    ) -> dict:
        """发起 HTTP 请求并处理河狸云标准响应格式

        河狸云标准响应格式:
        {
          "code": 0,        // 0=成功，非0=错误
          "message": "ok",
          "data": { ... }   // 业务数据
        }
        """
        url = f"{self.base_url}/{path.lstrip('/')}"
        headers = self._headers()

        with httpx.Client(timeout=self.timeout) as client:
            if method.upper() == "GET":
                resp = client.get(url, headers=headers, params=params)
            elif method.upper() == "POST":
                resp = client.post(url, headers=headers, json=body)
            elif method.upper() == "PUT":
                resp = client.put(url, headers=headers, json=body)
            else:
                resp = client.get(url, headers=headers, params=params)

            resp.raise_for_status()
            result = resp.json()

            # 处理河狸云标准错误码
            if isinstance(result, dict) and result.get("code", 0) != 0:
                error_msg = result.get("message", "未知错误")
                logger.warning("河狸云API错误: code=%s, msg=%s", result.get("code"), error_msg)
                raise RuntimeError(f"河狸云API错误: {error_msg}")

            return {
                "data": result.get("data", result) if isinstance(result, dict) else result,
                "source": "api",
                "status_code": resp.status_code,
                "response_time_ms": int(resp.elapsed.total_seconds() * 1000),
            }

    def get_production_lines(self, customer_id: Optional[str] = None) -> dict:
        """查询产线列表（便捷方法）"""
        params = {}
        if customer_id:
            params["customer_id"] = customer_id
        return self.request("GET", "production/lines", params=params)

    def get_production_progress(self, line_code: Optional[str] = None) -> dict:
        """查询产线进度（便捷方法）"""
        params = {}
        if line_code:
            params["line_code"] = line_code
        return self.request("GET", "production/progress", params=params)

    def get_field_staff(self, line_code: Optional[str] = None) -> dict:
        """查询现场人员（便捷方法）"""
        params = {}
        if line_code:
            params["line_code"] = line_code
        return self.request("GET", "field/staff", params=params)

    def health_check(self) -> dict:
        """健康检查"""
        try:
            result = self.request("GET", "health")
            return {"reachable": True, "data": result}
        except Exception as e:
            return {"reachable": False, "error": str(e)}
