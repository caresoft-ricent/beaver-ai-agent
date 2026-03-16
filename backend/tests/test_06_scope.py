"""Stage 1 测试：BeaverSessionScope 提取 + 引擎集成

验证：
- Scope 从 Header 正确提取
- 缺失 Header 时优雅降级为空值
- Referer 解析 current_module
- Scope 传递到引擎和证据链
- is_authenticated / log_identity 属性正确
"""
import pytest
from unittest.mock import MagicMock
from app.kernel.scope import BeaverSessionScope, extract_scope
from app.core.evidence import EvidenceCollector


class TestBeaverSessionScope:
    """Scope 数据类测试"""

    def test_default_scope_is_anonymous(self):
        """默认 Scope 无身份信息"""
        scope = BeaverSessionScope()
        assert not scope.is_authenticated
        assert scope.log_identity == "anonymous"
        assert scope.enterprise_id == ""
        assert scope.ouid == ""

    def test_authenticated_scope(self):
        """携带企业信息时 is_authenticated 为 True"""
        scope = BeaverSessionScope(
            enterprise_id="RYSGS",
            ouid="495232",
            member_id="1583859",
            org_id="RYSGS",
            token="test-jwt-token",
        )
        assert scope.is_authenticated
        assert scope.log_identity == "RYSGS/495232"
        assert scope.enterprise_id == "RYSGS"

    def test_partial_scope_not_authenticated(self):
        """只有 ouid 没有 enterprise_id 不算已认证"""
        scope = BeaverSessionScope(ouid="12345")
        assert not scope.is_authenticated

    def test_tenant_id_mapping(self):
        """tenant_id 可以映射设置"""
        scope = BeaverSessionScope(enterprise_id="RYSGS")
        scope.tenant_id = 1
        assert scope.tenant_id == 1
        assert scope.enterprise_id == "RYSGS"


class TestExtractScope:
    """从 Request Header 提取 Scope"""

    def _make_request(self, headers: dict):
        """构造 mock Request"""
        req = MagicMock()
        # FastAPI 的 headers 是 case-insensitive mapping
        header_lower = {k.lower(): v for k, v in headers.items()}
        req.headers = MagicMock()
        req.headers.get = lambda key, default="": header_lower.get(key.lower(), default)
        req.headers.__contains__ = lambda self, key: key.lower() in header_lower
        return req

    def test_extract_all_headers(self):
        """完整 Header 提取"""
        req = self._make_request({
            "Authorization": "Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9",
            "Enterpriseid": "RYSGS",
            "Memberid": "1583859",
            "Orgid": "RYSGS",
            "Ouid": "495232",
        })
        scope = extract_scope(req)
        assert scope.enterprise_id == "RYSGS"
        assert scope.ouid == "495232"
        assert scope.member_id == "1583859"
        assert scope.org_id == "RYSGS"
        assert scope.token == "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9"
        assert scope.is_authenticated

    def test_extract_empty_headers(self):
        """无 Header 时降级为空"""
        req = self._make_request({})
        scope = extract_scope(req)
        assert scope.enterprise_id == ""
        assert scope.ouid == ""
        assert not scope.is_authenticated
        assert scope.log_identity == "anonymous"

    def test_bearer_prefix_stripped(self):
        """Bearer 前缀正确去除"""
        req = self._make_request({"Authorization": "Bearer my-token-123"})
        scope = extract_scope(req)
        assert scope.token == "my-token-123"

    def test_bearer_case_insensitive(self):
        """bearer 前缀大小写不敏感"""
        req = self._make_request({"Authorization": "bearer my-token"})
        scope = extract_scope(req)
        assert scope.token == "my-token"

    def test_no_bearer_prefix(self):
        """非 Bearer 格式的 Authorization"""
        req = self._make_request({"Authorization": "api-key-direct"})
        scope = extract_scope(req)
        assert scope.token == "api-key-direct"

    def test_referer_module_parsing(self):
        """从 Referer 解析 current_module"""
        req = self._make_request({
            "Referer": "https://beavercloud.com/org/RYSGS/enterprise/RYSGS/service/list",
            "Enterpriseid": "RYSGS",
            "Ouid": "123",
        })
        scope = extract_scope(req)
        assert scope.current_module == "service/list"

    def test_referer_no_enterprise(self):
        """Referer 无 enterprise 路径"""
        req = self._make_request({
            "Referer": "https://beavercloud.com/dashboard",
        })
        scope = extract_scope(req)
        assert scope.current_module == ""


class TestEvidenceWithScope:
    """证据链集成 Scope"""

    def test_evidence_includes_scope(self):
        """认证 Scope 记录到证据链"""
        scope = BeaverSessionScope(
            enterprise_id="RYSGS",
            ouid="495232",
            member_id="1583859",
            org_id="RYSGS",
        )
        evidence = EvidenceCollector("sess_001", 1, "C001", scope=scope)
        evidence.add_step("test_step", {"foo": "bar"})
        result = evidence.to_dict()

        assert "scope" in result
        assert result["scope"]["enterprise_id"] == "RYSGS"
        assert result["scope"]["ouid"] == "495232"
        assert result["scope"]["member_id"] == "1583859"

    def test_evidence_no_scope(self):
        """无 Scope 时证据链不含 scope 字段"""
        evidence = EvidenceCollector("sess_001", 1, "C001")
        result = evidence.to_dict()
        assert "scope" not in result

    def test_evidence_anonymous_scope(self):
        """匿名 Scope 不记录到证据链"""
        scope = BeaverSessionScope()
        evidence = EvidenceCollector("sess_001", 1, "C001", scope=scope)
        result = evidence.to_dict()
        assert "scope" not in result


class TestEngineWithScope:
    """引擎集成 Scope（使用真实 DB）"""

    def test_dialog_engine_accepts_scope(self, db, factory, tenant_id):
        """DialogEngine 接受 scope 参数"""
        from app.core.engine import DialogEngine
        scope = BeaverSessionScope(enterprise_id="RYSGS", ouid="495232")
        scope.tenant_id = tenant_id
        engine = DialogEngine(db=db, tenant_id=tenant_id, customer_id="C001",
                              scope=scope)
        assert engine.scope.enterprise_id == "RYSGS"

    def test_dialog_engine_default_scope(self, db, factory, tenant_id):
        """不传 scope 时使用默认空 Scope"""
        from app.core.engine import DialogEngine
        engine = DialogEngine(db=db, tenant_id=tenant_id, customer_id="C001")
        assert engine.scope is not None
        assert not engine.scope.is_authenticated

    def test_e2e_with_scope(self, db, factory, tenant_id):
        """带 Scope 的端到端对话"""
        from app.core.engine import DialogEngine
        skill = factory.skill(db, skill_code="test_scope",
                              skill_name="测试", match_keywords=["测试"])
        scope = BeaverSessionScope(enterprise_id="BLOGI", ouid="999")
        engine = DialogEngine(db=db, tenant_id=tenant_id, customer_id="C001",
                              scope=scope)
        session = factory.chat_session(db, "sess_scope_test")
        result = engine.process(session_id=session.session_id, message="测试查询")
        # 应该能正常识别意图并返回结果
        assert result.reply is not None
        assert result.get("intent") == "test_scope"
