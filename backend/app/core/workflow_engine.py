"""流程编排引擎 - 执行 workflow_config 定义的有向图流程

节点类型:
  tool_call  — 调用本体操作(复用现有 _execute_tool_with_events)
  condition  — 条件分支(根据前序结果路由)
  parallel   — 并行执行多个子节点
  confirm    — 暂停等待用户确认
  llm_call   — 调用 LLM 生成文本
  reply      — 直接输出文本(模板替换)

workflow_config 结构:
{
  "version": 1,
  "start_node": "node_1",
  "nodes": [
    {
      "id": "node_1",
      "type": "tool_call",
      "label": "查询问题状态",
      "entity_id": 5, "action_id": 12,
      "next": "node_2"
    },
    {
      "id": "node_2",
      "type": "condition",
      "label": "判断状态",
      "field": "tool_results.node_1.status",
      "branches": [
        {"operator": "eq", "value": "open", "next": "node_3"},
        {"operator": "eq", "value": "closed", "next": "node_4"}
      ],
      "default_next": "node_5"
    },
    ...
  ]
}
"""
import json
import time
import traceback
from typing import Generator, Optional
from sqlalchemy.orm import Session

from app.models.config import LLMConfig, Connector
from app.models.ontology import Entity
from app.models.action import Action
from app.models.intent import Skill, SkillTool
from app.clients.llm_client import call_llm
from app.clients.connector_client import ConnectorClient
from app.core import agui
from app.core.evidence import EvidenceCollector


class WorkflowExecutor:
    """执行 workflow_config 定义的流程图"""

    MAX_STEPS = 50  # 防止死循环

    def __init__(
        self,
        db: Session,
        skill: Skill,
        entities: dict,
        customer_id: str,
        tenant_id: int,
        evidence: EvidenceCollector,
    ):
        self.db = db
        self.skill = skill
        self.entities = dict(entities)
        self.customer_id = customer_id
        self.tenant_id = tenant_id
        self.evidence = evidence

        cfg = skill.workflow_config or {}
        self.nodes = {n["id"]: n for n in cfg.get("nodes", [])}
        self.start_node = cfg.get("start_node")

        # 收集所有节点执行结果
        self.tool_results: dict = {}
        # 标记是否需要暂停(confirm 节点)
        self.paused = False
        self.pause_data: Optional[dict] = None

    def execute(self) -> Generator[str, None, None]:
        """同步生成器 — 逐步执行节点，yield AG-UI 事件"""
        if not self.start_node or not self.nodes:
            yield from self._emit_text("流程配置为空，无法执行。")
            return

        yield agui.step_started("workflow_execution")
        t0 = time.time()

        current_id = self.start_node
        steps = 0

        while current_id and steps < self.MAX_STEPS:
            steps += 1
            node = self.nodes.get(current_id)
            if not node:
                yield from self._emit_text(f"流程节点 {current_id} 未找到。")
                break

            node_type = node.get("type", "")
            self.evidence.add_step(f"wf_node_{current_id}", {
                "type": node_type, "label": node.get("label", ""),
            })

            if node_type == "tool_call":
                next_id = yield from self._handle_tool_call(node)
            elif node_type == "condition":
                next_id = self._handle_condition(node)
            elif node_type == "parallel":
                next_id = yield from self._handle_parallel(node)
            elif node_type == "confirm":
                next_id = yield from self._handle_confirm(node)
            elif node_type == "llm_call":
                next_id = yield from self._handle_llm_call(node)
            elif node_type == "reply":
                next_id = yield from self._handle_reply(node)
            else:
                yield from self._emit_text(f"未知节点类型: {node_type}")
                break

            if self.paused:
                break

            current_id = next_id

        elapsed = int((time.time() - t0) * 1000)
        self.evidence.add_step("workflow_execution", {
            "steps": steps, "paused": self.paused,
            "results_count": len(self.tool_results),
        }, elapsed)
        yield agui.step_finished("workflow_execution")

    # ── 节点处理器 ──

    def _handle_tool_call(self, node: dict) -> Generator[str, None, Optional[str]]:
        """执行工具调用节点"""
        entity_id = node.get("entity_id")
        action_id = node.get("action_id")
        node_id = node["id"]

        if not entity_id:
            return node.get("next")

        entity = self.db.query(Entity).filter(Entity.id == entity_id).first()
        if not entity:
            return node.get("next")

        action = None
        if action_id:
            action = self.db.query(Action).filter(Action.id == action_id).first()
        else:
            action = self.db.query(Action).filter(Action.entity_id == entity.id).first()
        if not action:
            return node.get("next")

        # 构建参数 — 合并 entities + 节点自定义参数
        params = {**self.entities, "customer_id": self.customer_id}
        extra_params = node.get("params", {})
        if isinstance(extra_params, dict):
            # 支持模板变量 ${tool_results.node_1.xxx}
            for k, v in extra_params.items():
                params[k] = self._resolve_value(v)

        tc_id = agui.new_id()
        tool_name = f"{entity.entity_code}.{action.action_code}"
        yield agui.tool_call_start(tc_id, tool_name)
        yield agui.tool_call_args(tc_id, json.dumps(params, ensure_ascii=False))
        yield agui.tool_call_end(tc_id)

        connector = None
        if entity.connector_id:
            connector = self.db.query(Connector).filter(Connector.id == entity.connector_id).first()

        result_data = None
        if connector:
            cli = ConnectorClient({
                "base_url": connector.base_url,
                "auth_type": connector.auth_type,
                "auth_config": connector.auth_config,
                "timeout": connector.timeout,
                "mock_enabled": connector.mock_enabled,
            })
            try:
                result = cli.call_action(
                    action_config={
                        "http_method": action.http_method,
                        "api_path": action.api_path,
                        "request_template": action.request_template,
                        "response_mapping": action.response_mapping,
                    },
                    params=params,
                    mock_response=action.mock_response,
                )
                result_data = result.get("data")
                yield agui.tool_call_result(tc_id, json.dumps(result, ensure_ascii=False, default=str))
            except Exception as exc:
                if self.evidence:
                    self.evidence.add_error(f"wf_tool_{node_id}", str(exc), traceback.format_exc())
                if action.mock_response:
                    result_data = action.mock_response
                    yield agui.tool_call_result(tc_id, json.dumps({"data": result_data, "source": "mock"}, ensure_ascii=False))
        elif action.mock_response:
            result_data = action.mock_response
            yield agui.tool_call_result(tc_id, json.dumps({"data": result_data, "source": "mock"}, ensure_ascii=False))

        # 保存结果
        self.tool_results[node_id] = result_data

        # 把结果中的关键字段合并到 entities，供后续节点使用
        output_mapping = node.get("output_mapping")
        if output_mapping and isinstance(output_mapping, dict) and isinstance(result_data, dict):
            for target_key, source_path in output_mapping.items():
                val = self._extract_path(result_data, source_path)
                if val is not None:
                    self.entities[target_key] = val

        return node.get("next")

    def _handle_condition(self, node: dict) -> Optional[str]:
        """条件分支节点 — 根据字段值路由"""
        field = node.get("field", "")
        actual_value = self._resolve_value(f"${{{field}}}")

        for branch in node.get("branches", []):
            op = branch.get("operator", "eq")
            expected = branch.get("value")

            if self._compare(actual_value, op, expected):
                self.evidence.add_step(f"wf_condition_{node['id']}", {
                    "field": field, "value": str(actual_value),
                    "matched_op": op, "matched_value": expected,
                    "next": branch.get("next"),
                })
                return branch.get("next")

        self.evidence.add_step(f"wf_condition_{node['id']}", {
            "field": field, "value": str(actual_value), "matched": "default",
        })
        return node.get("default_next")

    def _handle_parallel(self, node: dict) -> Generator[str, None, Optional[str]]:
        """并行执行节点 — 依次执行 parallel_nodes 列表(同步模拟并行)"""
        for sub_id in node.get("parallel_nodes", []):
            sub_node = self.nodes.get(sub_id)
            if sub_node and sub_node.get("type") == "tool_call":
                yield from self._handle_tool_call(sub_node)
        return node.get("next")

    def _handle_confirm(self, node: dict) -> Generator[str, None, Optional[str]]:
        """确认节点 — 发送确认卡片并暂停"""
        self.paused = True
        self.pause_data = {
            "node_id": node["id"],
            "next_on_confirm": node.get("next"),
            "next_on_reject": node.get("reject_next"),
        }

        title = node.get("title", "请确认")
        message = node.get("message", "请确认是否继续？")

        # 模板替换
        message = self._render_text(message)

        yield agui.custom_event("card", {
            "card_type": "confirm",
            "title": title,
            "message": message,
            "fields": node.get("fields", []),
        })
        yield from self._emit_text(message)
        return None  # 暂停，不继续

    def _handle_llm_call(self, node: dict) -> Generator[str, None, Optional[str]]:
        """LLM 调用节点 — 用 LLM 生成文本"""
        prompt = node.get("prompt", "请根据数据回答用户。")
        prompt = self._render_text(prompt)

        llm_config = self._get_llm_config()
        if not llm_config:
            yield from self._emit_text("未配置大模型，无法生成回答。")
            return node.get("next")

        data_str = json.dumps(self.tool_results, ensure_ascii=False, indent=2, default=str)

        try:
            result = call_llm(
                provider=llm_config.provider,
                model=llm_config.model_name,
                api_url=llm_config.api_url,
                api_key=llm_config.api_key,
                messages=[{"role": "user", "content": f"数据：{data_str}"}],
                system_prompt=prompt,
                temperature=0.7,
                max_tokens=node.get("max_tokens", 512),
            )
            text = result.get("content", "")
            if text:
                yield from self._emit_text(text)

            # 可选：把 LLM 结果存到 tool_results
            self.tool_results[node["id"]] = {"text": text}
        except Exception as exc:
            if self.evidence:
                self.evidence.add_error(f"wf_llm_{node['id']}", str(exc), traceback.format_exc())
            yield from self._emit_text("AI 回答生成失败，请稍后重试。")

        return node.get("next")

    def _handle_reply(self, node: dict) -> Generator[str, None, Optional[str]]:
        """直接文本回复节点"""
        text = node.get("text", "")
        text = self._render_text(text)
        if text:
            yield from self._emit_text(text)
        return node.get("next")

    # ── 辅助方法 ──

    def _emit_text(self, text: str) -> Generator[str, None, None]:
        """输出一段文本的 AG-UI 事件序列"""
        mid = agui.new_id()
        yield agui.text_message_start(mid)
        yield agui.text_message_content(mid, text)
        yield agui.text_message_end(mid)

    def _resolve_value(self, expr) -> object:
        """解析 ${tool_results.node_1.status} 或 ${entities.line_code} 形式的表达式"""
        if not isinstance(expr, str):
            return expr
        if not expr.startswith("${") or not expr.endswith("}"):
            return expr

        path = expr[2:-1]  # tool_results.node_1.status
        parts = path.split(".")

        if parts[0] == "tool_results" and len(parts) >= 2:
            data = self.tool_results.get(parts[1])
            return self._extract_path(data, ".".join(parts[2:])) if len(parts) > 2 else data
        elif parts[0] == "entities":
            return self.entities.get(parts[1]) if len(parts) > 1 else self.entities
        return expr

    def _extract_path(self, data, path: str):
        """从嵌套 dict 中根据路径提取值"""
        if data is None or not path:
            return data
        current = data
        for part in path.split("."):
            if isinstance(current, dict):
                # 支持 data.data.items 等常见路径
                current = current.get(part)
            elif isinstance(current, list) and part.isdigit():
                idx = int(part)
                current = current[idx] if idx < len(current) else None
            else:
                return None
        return current

    def _compare(self, actual, operator: str, expected) -> bool:
        """比较运算"""
        if actual is None:
            return operator == "is_null"

        actual_str = str(actual).lower().strip()
        expected_str = str(expected).lower().strip() if expected is not None else ""

        if operator == "eq":
            return actual_str == expected_str
        elif operator == "neq":
            return actual_str != expected_str
        elif operator == "contains":
            return expected_str in actual_str
        elif operator == "gt":
            try:
                return float(actual) > float(expected)
            except (ValueError, TypeError):
                return False
        elif operator == "lt":
            try:
                return float(actual) < float(expected)
            except (ValueError, TypeError):
                return False
        elif operator == "gte":
            try:
                return float(actual) >= float(expected)
            except (ValueError, TypeError):
                return False
        elif operator == "lte":
            try:
                return float(actual) <= float(expected)
            except (ValueError, TypeError):
                return False
        elif operator == "in":
            if isinstance(expected, list):
                return actual_str in [str(v).lower() for v in expected]
            return actual_str in expected_str
        elif operator == "is_null":
            return actual is None or actual_str == ""
        elif operator == "not_null":
            return actual is not None and actual_str != ""
        return False

    def _render_text(self, template: str) -> str:
        """模板变量替换: {node_1.status} → 实际值"""
        import re
        def replacer(m):
            path = m.group(1)
            parts = path.split(".")
            # 先尝试 tool_results
            if parts[0] in self.tool_results:
                val = self.tool_results[parts[0]]
                if len(parts) > 1:
                    val = self._extract_path(val, ".".join(parts[1:]))
                return str(val) if val is not None else ""
            # 再尝试 entities
            if parts[0] in self.entities:
                return str(self.entities[parts[0]])
            return m.group(0)

        return re.sub(r'\{([a-zA-Z0-9_.]+)\}', replacer, template)

    def _get_llm_config(self) -> Optional[LLMConfig]:
        """获取当前租户的 LLM 配置"""
        config = (
            self.db.query(LLMConfig)
            .filter(LLMConfig.tenant_id == self.tenant_id, LLMConfig.usage == "response", LLMConfig.status == "active")
            .first()
        )
        if not config:
            config = (
                self.db.query(LLMConfig)
                .filter(LLMConfig.tenant_id == self.tenant_id, LLMConfig.usage == "general", LLMConfig.status == "active")
                .first()
            )
        return config
