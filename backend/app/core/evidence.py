"""证据链 + 执行日志 — 记录引擎每一步的决策和数据

提供:
- EvidenceCollector: 在引擎流程中收集证据
- 存入 ChatMessage.evidence_chain 和 ActionLog
- 供管理后台查询分析
"""
import json
import time
import traceback
from typing import Optional, Any
from sqlalchemy.orm import Session

from app.models.chat import ActionLog


class EvidenceCollector:
    """在一次对话处理中收集证据链"""

    def __init__(self, session_id: str, tenant_id: int, customer_id: str):
        self.session_id = session_id
        self.tenant_id = tenant_id
        self.customer_id = customer_id
        self.steps: list[dict] = []
        self.errors: list[dict] = []
        self.start_time = time.time()

    def add_step(self, step: str, detail: Any = None, duration_ms: int = 0):
        """记录一个处理步骤"""
        self.steps.append({
            "step": step,
            "detail": detail,
            "duration_ms": duration_ms,
            "timestamp": int(time.time() * 1000),
        })

    def add_error(self, step: str, error: str, traceback_str: str = ""):
        """记录一个错误"""
        self.errors.append({
            "step": step,
            "error": error,
            "traceback": traceback_str[:2000],
            "timestamp": int(time.time() * 1000),
        })

    def to_dict(self) -> dict:
        """输出证据链字典"""
        return {
            "session_id": self.session_id,
            "total_duration_ms": int((time.time() - self.start_time) * 1000),
            "steps": self.steps,
            "errors": self.errors,
        }

    def save_action_log(self, db: Session, action_type: str, params: dict = None,
                        status: str = "success", result: dict = None, error_message: str = None):
        """写入 ActionLog 表"""
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
