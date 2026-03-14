"""对话引擎 - 同步版核心处理流程

用户输入 → 加载上下文 → 意图识别(规则+LLM) → 实体抽取+归一化 → 查询执行 → 回答生成
"""
import re
import json
from typing import Optional
from sqlalchemy.orm import Session

from app.models.config import LLMConfig, Connector
from app.models.ontology import Entity, EntityProperty
from app.models.action import Action, ActionParameter
from app.models.intent import Skill, SkillTool
from app.clients.llm_client import call_llm, call_llm_for_intent
from app.clients.connector_client import ConnectorClient
from app.core.context_manager import (
    load_context, save_context, merge_entities,
    normalize_entities, convert_params, check_slots, build_clarification_reply,
)
from app.core.evidence import EvidenceCollector


class EngineResult(dict):
    """引擎处理结果 - 兼容dict和属性访问"""
    def __getattr__(self, key):
        try:
            return self[key]
        except KeyError:
            return None

    def __setattr__(self, key, value):
        self[key] = value


class DialogEngine:
    """配置驱动的对话引擎"""

    def __init__(self, db: Session, tenant_id: int, customer_id: str):
        self.db = db
        self.tenant_id = tenant_id
        self.customer_id = customer_id

    def process(self, session_id: str, message: str) -> EngineResult:
        """主处理流程"""
        result = EngineResult(reply="", reply_type="text")
        evidence = EvidenceCollector(session_id, self.tenant_id, self.customer_id)

        # Step 1: 加载上下文
        ctx = load_context(self.db, session_id)
        ctx["turn_count"] = ctx.get("turn_count", 0) + 1

        # Step 2: 加载租户的技能配置
        skills = (
            self.db.query(Skill)
            .filter(Skill.tenant_id == self.tenant_id, Skill.status == "published")
            .order_by(Skill.sort_order)
            .all()
        )

        if not skills:
            result.reply = "系统正在配置中，暂时无法回答您的问题。请稍后再试。"
            return result

        # Step 3: 意图识别 - 先用规则匹配，再用LLM
        matched_skill, confidence, entities = self._recognize_intent(message, skills, ctx)

        if not matched_skill:
            result.reply = "抱歉，我暂时无法理解您的问题。您可以试试：查看产线进度、查询现场人员、提交投诉等。"
            return result

        result["intent"] = matched_skill.skill_code

        # 意图切换检测 — 清除旧实体
        prev_intent = ctx.get("last_intent")
        if prev_intent and prev_intent != matched_skill.skill_code:
            ctx["entities"] = {}
        ctx["last_intent"] = matched_skill.skill_code

        # 合并上下文实体 + 规则抽取实体
        entities = merge_entities(ctx.get("entities", {}), entities)
        entities = normalize_entities(entities, message, db=self.db)
        entities = convert_params(self.db, entities, matched_skill)
        ctx["entities"] = entities
        save_context(self.db, session_id, ctx)

        # Step 4: 加载技能关联的工具链
        tools = (
            self.db.query(SkillTool)
            .filter(SkillTool.skill_id == matched_skill.id)
            .order_by(SkillTool.order_no)
            .all()
        )

        # 无工具链的技能 → 有response_prompt时走LLM，否则返回模板
        if not tools:
            if matched_skill.response_prompt:
                llm_config = self._get_llm_config("response") or self._get_llm_config("general")
                if llm_config:
                    llm_reply = self._generate_reply_with_llm(message, matched_skill, {})
                    if llm_reply:
                        result.reply = llm_reply
                        return result
            result.reply = matched_skill.response_template or "您好！请问有什么可以帮助您的？"
            return result

        # Step 4.5: 槽位校验
        slot_result = check_slots(self.db, matched_skill, entities)
        if not slot_result.complete:
            clarification = build_clarification_reply(slot_result)
            if clarification:
                result.reply = clarification
                result["needs_clarification"] = True
                result["clarification"] = {"missing": slot_result.missing_required}
                return result

        # Step 5: 按顺序执行工具链
        query_results = {}
        for tool in tools:
            tool_result = self._execute_tool(tool, entities)
            if tool_result:
                query_results[f"tool_{tool.order_no}"] = tool_result

        # Step 5: 生成回答
        if matched_skill.response_template and query_results:
            result.reply = self._render_template(
                matched_skill.response_template, query_results, entities
            )
        elif query_results:
            result.reply = self._generate_reply_with_llm(
                message, matched_skill, query_results
            )
        else:
            result.reply = "查询到的信息为空，请确认您的问题或稍后再试。"

        # 附带结构化数据
        if query_results:
            result["structured_data"] = query_results
            result["reply_type"] = "structured"

        return result

    def _recognize_intent(self, message: str, skills: list[Skill], ctx: dict = None):
        """意图识别 - 规则优先(多关键词得分排序)，LLM兜底"""
        # 策略1: 关键词/正则匹配 — 按命中关键词数排序
        candidates = []
        for skill in skills:
            score = 0
            hit_count = 0
            entities = {}

            # 关键词得分
            keywords = skill.match_keywords or []
            for kw in keywords:
                if kw in message:
                    hit_count += 1
            if hit_count > 0:
                score = 0.7 + min(hit_count * 0.1, 0.28)  # 1kw=0.8, 2kw=0.9, 3kw+=0.98

            # 正则匹配(额外加分)
            patterns = skill.match_patterns or []
            for pattern in patterns:
                match = re.search(pattern, message)
                if match:
                    score = max(score, 0.9)
                    entities.update(match.groupdict())

            if score > 0:
                candidates.append((skill, score, entities))

        if candidates:
            candidates.sort(key=lambda x: x[1], reverse=True)
            return candidates[0]

        # 策略2: LLM意图识别
        llm_config = self._get_llm_config("intent")
        if llm_config:
            available_intents = [
                {"code": s.skill_code, "description": s.skill_description or s.skill_name}
                for s in skills
            ]
            try:
                llm_result = call_llm_for_intent(
                    provider=llm_config.provider,
                    model=llm_config.model_name,
                    api_url=llm_config.api_url,
                    api_key=llm_config.api_key,
                    user_message=message,
                    available_intents=available_intents,
                    context=ctx.get("entities") if ctx else None,
                )
                intent_code = llm_result.get("intent")
                confidence = llm_result.get("confidence", 0)
                entities = llm_result.get("entities", {})
                if intent_code and confidence > 0.6:
                    for skill in skills:
                        if skill.skill_code == intent_code:
                            return skill, confidence, entities
            except Exception:
                pass  # LLM失败时降级

        return None, 0, {}

    def _execute_tool(self, tool: SkillTool, entities: dict) -> Optional[dict]:
        """执行单个工具 — 支持两种模式:
        1. api_config模式: tool.config.api_config 直接定义接口调用(殷明方案)
        2. entity+action模式: 通过本体和操作间接调用(原方案)
        """
        # ── 模式1: 接口调用直接包装(api_config) ──
        api_config = tool.config.get("api_config") if tool.config else None
        if api_config and tool.tools_mode == "api":
            params = {**entities, "customer_id": self.customer_id}
            connector_id = api_config.get("connector_id")
            connector = (
                self.db.query(Connector).filter(Connector.id == connector_id).first()
                if connector_id else None
            )
            if not connector:
                mock = api_config.get("mock_response")
                return {"data": mock, "source": "mock"} if mock else None

            client = ConnectorClient({
                "base_url": connector.base_url,
                "auth_type": connector.auth_type,
                "auth_config": connector.auth_config,
                "timeout": connector.timeout,
                "mock_enabled": connector.mock_enabled,
            })
            try:
                return client.call_action(
                    action_config={
                        "http_method": api_config.get("http_method", "GET"),
                        "api_path": api_config.get("api_path", ""),
                        "request_template": api_config.get("request_template"),
                        "response_mapping": api_config.get("response_mapping"),
                    },
                    params=params,
                    mock_response=api_config.get("mock_response"),
                )
            except Exception:
                mock = api_config.get("mock_response")
                return {"data": mock, "source": "mock_fallback"} if mock else None

        # ── 模式2: 本体+操作(entity+action) ──
        entity = self.db.query(Entity).filter(Entity.id == tool.entity_id).first() if tool.entity_id else None
        if not entity:
            return None

        # 获取操作
        if tool.action_id:
            action = self.db.query(Action).filter(Action.id == tool.action_id).first()
        else:
            # 取本体下第一个操作
            action = self.db.query(Action).filter(Action.entity_id == entity.id).first()

        if not action:
            return None

        # 获取连接器
        connector = None
        if entity.connector_id:
            connector = self.db.query(Connector).filter(Connector.id == entity.connector_id).first()

        if not connector:
            # 无连接器时返回mock数据
            if action.mock_response:
                return {"data": action.mock_response, "source": "mock"}
            return None

        # 构建参数
        params = {**entities}
        params["customer_id"] = self.customer_id

        # 通过连接器调用
        client = ConnectorClient({
            "base_url": connector.base_url,
            "auth_type": connector.auth_type,
            "auth_config": connector.auth_config,
            "timeout": connector.timeout,
            "mock_enabled": connector.mock_enabled,
        })

        try:
            return client.call_action(
                action_config={
                    "http_method": action.http_method,
                    "api_path": action.api_path,
                    "request_template": action.request_template,
                    "response_mapping": action.response_mapping,
                },
                params=params,
                mock_response=action.mock_response,
            )
        except Exception:
            return None

    def _render_template(self, template: str, data: dict, entities: dict) -> str:
        """渲染回答模板"""
        context = {**entities}
        # 展平查询结果
        for key, value in data.items():
            if isinstance(value, dict) and "data" in value:
                inner = value["data"]
                if isinstance(inner, dict):
                    context.update(inner)
        try:
            return template.format(**context)
        except (KeyError, IndexError):
            return template

    def _generate_reply_with_llm(self, message: str, skill: Skill, data: dict) -> str:
        """用LLM基于数据生成自然语言回答"""
        llm_config = self._get_llm_config("response")
        if not llm_config:
            return self._format_data_as_text(data)

        prompt = skill.response_prompt or "请根据以下数据，用友好的中文回答用户的问题。"
        data_str = json.dumps(data, ensure_ascii=False, indent=2)

        try:
            result = call_llm(
                provider=llm_config.provider,
                model=llm_config.model_name,
                api_url=llm_config.api_url,
                api_key=llm_config.api_key,
                messages=[
                    {"role": "user", "content": f"用户问题：{message}\n\n数据：{data_str}"},
                ],
                system_prompt=prompt,
                temperature=0.7,
                max_tokens=512,
            )
            return result["content"]
        except Exception:
            return self._format_data_as_text(data)

    def _format_data_as_text(self, data: dict) -> str:
        """无LLM时将结构化数据格式化为可读文本"""
        lines = []
        for _key, value in data.items():
            if not isinstance(value, dict):
                continue
            source = value.get("source", "api")
            raw = value.get("data", {})
            # 处理嵌套 {data: {items: [...]}} 或直接 {items: [...]}
            items = None
            if isinstance(raw, dict):
                inner = raw.get("data", raw)
                if isinstance(inner, dict):
                    items = inner.get("items", None)
            if isinstance(items, list):
                lines.append(f"为您查到 {len(items)} 条记录：\n")
                for i, item in enumerate(items, 1):
                    parts = []
                    for k, v in item.items():
                        parts.append(f"{k}: {v}")
                    lines.append(f"{i}. " + ", ".join(parts))
                if source == "mock":
                    lines.append("\n（当前为演示数据）")
            else:
                lines.append(json.dumps(raw, ensure_ascii=False, indent=2))
        return "\n".join(lines) if lines else "查询完成，暂无更多信息。"

    def _get_llm_config(self, usage: str) -> Optional[LLMConfig]:
        """获取指定用途的LLM配置"""
        config = (
            self.db.query(LLMConfig)
            .filter(
                LLMConfig.tenant_id == self.tenant_id,
                LLMConfig.usage == usage,
                LLMConfig.status == "active",
            )
            .first()
        )
        if not config:
            # fallback到general
            config = (
                self.db.query(LLMConfig)
                .filter(
                    LLMConfig.tenant_id == self.tenant_id,
                    LLMConfig.usage == "general",
                    LLMConfig.status == "active",
                )
                .first()
            )
        return config

    def execute_action(self, session_id: str, action: str, params: dict, confirmed: bool) -> dict:
        """执行业务动作(投诉、联系单等)"""
        # 简化实现 - 后续按需扩展
        return {
            "success": True,
            "reply": f"动作 {action} 已收到，参数: {json.dumps(params, ensure_ascii=False)}。功能开发中。",
        }
