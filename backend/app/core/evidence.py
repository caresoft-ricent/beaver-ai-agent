"""证据链 + 执行日志 — 记录引擎每一步的决策和数据

提供:
- EvidenceCollector: 在引擎流程中收集证据
- 存入 ChatMessage.evidence_chain 和 ActionLog
- 同步输出到 Python logger，方便服务端日志查看全链路
"""
import json
import logging
import time
import traceback
from typing import Optional, Any
from sqlalchemy.orm import Session

from app.models.chat import ActionLog

logger = logging.getLogger("beaver.evidence")


def _safe_json(obj: Any, max_len: int = 2000) -> str:
    """安全序列化为 JSON 字符串, 超长截断"""
    try:
        s = json.dumps(obj, ensure_ascii=False, default=str)
        return s[:max_len] + "..." if len(s) > max_len else s
    except Exception:
        return str(obj)[:max_len]


class EvidenceCollector:
    """在一次对话处理中收集证据链，并同步输出到 logger"""

    def __init__(self, session_id: str, tenant_id: int, customer_id: str,
                 scope=None):
        self.session_id = session_id
        self.tenant_id = tenant_id
        self.customer_id = customer_id
        self.scope = scope
        self.steps: list[dict] = []
        self.errors: list[dict] = []
        self.start_time = time.time()
        scope_info = f" enterprise={scope.enterprise_id}" if scope and scope.enterprise_id else ""
        logger.info("═══ 对话链路开始 ═══ session=%s customer=%s%s", session_id, customer_id, scope_info)

    def add_step(self, step: str, detail: Any = None, duration_ms: int = 0):
        """记录一个处理步骤，同时输出到日志"""
        self.steps.append({
            "step": step,
            "detail": detail,
            "duration_ms": duration_ms,
            "timestamp": int(time.time() * 1000),
        })
        logger.info("── [%s] %dms %s", step, duration_ms, _safe_json(detail))

    def add_error(self, step: str, error: str, detail = ""):
        """记录一个错误, detail 可以是 traceback 字符串或包含 curl 等信息的字典"""
        entry = {
            "step": step,
            "error": error,
            "timestamp": int(time.time() * 1000),
        }
        if isinstance(detail, dict):
            entry.update(detail)
            if "traceback" in entry and isinstance(entry["traceback"], str):
                entry["traceback"] = entry["traceback"][:2000]
        else:
            entry["traceback"] = str(detail)[:2000]
        self.errors.append(entry)
        logger.error("── [ERROR:%s] %s", step, error)

    def to_dict(self) -> dict:
        """输出证据链字典"""
        result = {
            "session_id": self.session_id,
            "total_duration_ms": int((time.time() - self.start_time) * 1000),
            "steps": self.steps,
            "errors": self.errors,
        }
        if self.scope and self.scope.is_authenticated:
            result["scope"] = {
                "enterprise_id": self.scope.enterprise_id,
                "ouid": self.scope.ouid,
                "member_id": self.scope.member_id,
                "org_id": self.scope.org_id,
                "current_module": self.scope.current_module,
            }
        return result

    def save_action_log(self, db: Session, action_type: str, params: dict = None,
                        status: str = "success", result: dict = None, error_message: str = None):
        """写入 ActionLog 表"""
        total_ms = int((time.time() - self.start_time) * 1000)
        logger.info("═══ 对话链路结束 ═══ session=%s status=%s total=%dms steps=%d errors=%d",
                     self.session_id, status, total_ms, len(self.steps), len(self.errors))
        log = ActionLog(
            session_id=self.session_id,
            tenant_id=self.tenant_id,
            customer_id=self.customer_id,
            action_type=action_type,
            action_params=params,
            status=status,
            result=result,
            error_message=error_message,
        )
        db.add(log)
        db.flush()


def format_evidence_chain(evidence: dict) -> str:
    """将证据链格式化为可读文本（供管理后台展示）"""
    lines = []
    lines.append(f"总耗时: {evidence.get('total_duration_ms', 0)}ms")
    for s in evidence.get("steps", []):
        detail_str = ""
        if s.get("detail"):
            if isinstance(s["detail"], dict):
                detail_str = json.dumps(s["detail"], ensure_ascii=False)[:200]
            else:
                detail_str = str(s["detail"])[:200]
        lines.append(f"[{s['step']}] {detail_str} ({s.get('duration_ms', 0)}ms)")
    for e in evidence.get("errors", []):
        lines.append(f"[ERROR:{e['step']}] {e['error']}")
    return "\n".join(lines)
