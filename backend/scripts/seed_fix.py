"""
修复数据种子脚本 - 补齐投诉/服务/联系人业务 + 修复错误工具链

修复项目:
1. 删除 QUERY_STAFF 多余的 production_line 工具
2. 删除 QUERY_PROGRESS 多余的 field_staff 工具
3. 删除 CHITCHAT 错误的 field_staff 工具
4. 新增 complaint 本体 + submit/query 操作
5. 新增 service_record 本体 + query 操作
6. 新增 SUBMIT_COMPLAINT / QUERY_COMPLAINT / QUERY_SERVICE / CONTACT_PERSON 技能
7. 修复 QUERY_STAFF 技能的 response_prompt
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.database import SessionLocal
from app.models.ontology import Entity, EntityProperty
from app.models.action import Action
from app.models.intent import Skill, SkillTool

TENANT_ID = 1


def seed_fix():
    db = SessionLocal()
    try:
        # ── 0. 获取已有 entity / action ID ──
        entity_pl = db.query(Entity).filter(
            Entity.tenant_id == TENANT_ID, Entity.entity_code == "production_line"
        ).first()
        entity_fs = db.query(Entity).filter(
            Entity.tenant_id == TENANT_ID, Entity.entity_code == "field_staff"
        ).first()
        if not entity_pl or not entity_fs:
            print("❌ 基础本体 production_line / field_staff 不存在，请先运行 seed_demo.py")
            return

        action_query_staff = db.query(Action).filter(
            Action.entity_id == entity_fs.id, Action.action_code == "query_staff"
        ).first()

        # ── 1. 修复错误的工具链关联 ──
        print("\n=== 修复工具链 ===")

        # 查找所有错误的 tool 关联
        skill_progress = db.query(Skill).filter(
            Skill.tenant_id == TENANT_ID, Skill.skill_code == "QUERY_PROGRESS"
        ).first()
        skill_staff = db.query(Skill).filter(
            Skill.tenant_id == TENANT_ID, Skill.skill_code == "QUERY_STAFF"
        ).first()
        skill_chat = db.query(Skill).filter(
            Skill.tenant_id == TENANT_ID, Skill.skill_code == "CHITCHAT"
        ).first()

        # QUERY_PROGRESS 不应该有 field_staff 工具
        if skill_progress:
            bad = db.query(SkillTool).filter(
                SkillTool.skill_id == skill_progress.id,
                SkillTool.entity_id == entity_fs.id,
            ).all()
            for t in bad:
                db.delete(t)
                print(f"  ✓ 删除 QUERY_PROGRESS 的多余工具 tool_id={t.id} (field_staff)")

        # QUERY_STAFF 不应该有 production_line 工具
        if skill_staff:
            bad = db.query(SkillTool).filter(
                SkillTool.skill_id == skill_staff.id,
                SkillTool.entity_id == entity_pl.id,
            ).all()
            for t in bad:
                db.delete(t)
                print(f"  ✓ 删除 QUERY_STAFF 的多余工具 tool_id={t.id} (production_line)")

            # 修复 QUERY_STAFF 的 response_prompt
            skill_staff.response_prompt = (
                "你是河狸云AI助手。根据查询到的现场人员数据回答用户。"
                "数据包含 staff_name(姓名)、role(角色)、phone(电话)、line_code(负责产线)。"
                "请准确列出人员信息，标注负责人（角色含'经理'或'负责'的人）。"
                "用简洁友好的中文回答。"
            )
            print("  ✓ 更新 QUERY_STAFF response_prompt")

        # CHITCHAT 不应该有任何工具
        if skill_chat:
            bad = db.query(SkillTool).filter(
                SkillTool.skill_id == skill_chat.id,
            ).all()
            for t in bad:
                db.delete(t)
                print(f"  ✓ 删除 CHITCHAT 的多余工具 tool_id={t.id}")

        db.flush()

        # ── 2. 获取连接器 ID ──
        connector_id = entity_pl.connector_id

        # ── 3. 新增 complaint 本体 ──
        print("\n=== 新增投诉本体 ===")
        entity_cp = db.query(Entity).filter(
            Entity.tenant_id == TENANT_ID, Entity.entity_code == "complaint"
        ).first()
        if entity_cp:
            print(f"投诉本体已存在 (id={entity_cp.id})，跳过...")
        else:
            entity_cp = Entity(
                tenant_id=TENANT_ID,
                entity_mode="api",
                entity_code="complaint",
                entity_name="投诉工单",
                entity_description="客户投诉/反馈工单，包含问题描述、紧急程度、处理状态、处理结果等",
                connector_id=connector_id,
                status="published",
                version=1,
            )
            db.add(entity_cp)
            db.flush()
            print(f"✓ 投诉本体创建成功 id={entity_cp.id}")

            cp_props = [
                {"name": "complaint_no", "title": "投诉编号", "type": "string", "is_output": True},
                {"name": "line_code", "title": "产线编号", "type": "string", "is_input": True},
                {"name": "issue", "title": "问题描述", "type": "string", "is_input": True, "is_required": True},
                {"name": "urgency", "title": "紧急程度", "type": "string", "is_input": True,
                 "property_description": "紧急程度: 紧急/普通"},
                {"name": "status", "title": "处理状态", "type": "string", "is_output": True},
                {"name": "handler", "title": "处理人", "type": "string", "is_output": True},
                {"name": "result", "title": "处理结果", "type": "string", "is_output": True},
                {"name": "completed_date", "title": "完成日期", "type": "date", "is_output": True},
                {"name": "customer_id", "title": "客户ID", "type": "string", "is_input": True, "is_required": True},
            ]
            for p in cp_props:
                db.add(EntityProperty(entity_id=entity_cp.id, **p))
            db.flush()
            print(f"  → 添加 {len(cp_props)} 个属性")

        # ── 4. 投诉操作: 提交投诉 ──
        action_submit_cp = db.query(Action).filter(
            Action.entity_id == entity_cp.id, Action.action_code == "submit_complaint"
        ).first()
        if action_submit_cp:
            print(f"提交投诉操作已存在 (id={action_submit_cp.id})，跳过...")
        else:
            action_submit_cp = Action(
                entity_id=entity_cp.id,
                action_code="submit_complaint",
                action_name="提交投诉",
                action_description="提交客户投诉/反馈工单",
                http_method="POST",
                api_path="/complaints",
                mock_response={
                    "data": {
                        "complaint_no": "CP202601280001",
                        "status": "已受理",
                        "message": "投诉已成功提交，我们将在24小时内处理",
                    }
                },
            )
            db.add(action_submit_cp)
            db.flush()
            print(f"✓ 提交投诉操作创建成功 id={action_submit_cp.id}")

        # ── 5. 投诉操作: 查询投诉进度 ──
        action_query_cp = db.query(Action).filter(
            Action.entity_id == entity_cp.id, Action.action_code == "query_complaint"
        ).first()
        if action_query_cp:
            print(f"查询投诉操作已存在 (id={action_query_cp.id})，跳过...")
        else:
            action_query_cp = Action(
                entity_id=entity_cp.id,
                action_code="query_complaint",
                action_name="查询投诉进度",
                action_description="查询客户投诉工单的处理进度",
                http_method="GET",
                api_path="/complaints",
                mock_response={
                    "data": {
                        "items": [
                            {
                                "complaint_no": "CP202601280001",
                                "line_code": "25B1339-G",
                                "issue": "上料机械手需要增加旋转功能",
                                "urgency": "普通",
                                "status": "已完成",
                                "handler": "黄秋军",
                                "result": "已增加旋转程序，清洁喷头",
                                "completed_date": "2026-01-30",
                            },
                            {
                                "complaint_no": "CP202601150002",
                                "line_code": "25A0987-H",
                                "issue": "焊接工位温控不稳定",
                                "urgency": "紧急",
                                "status": "处理中",
                                "handler": "李明",
                                "result": "",
                                "completed_date": "",
                            },
                        ]
                    }
                },
            )
            db.add(action_query_cp)
            db.flush()
            print(f"✓ 查询投诉操作创建成功 id={action_query_cp.id}")

        # ── 6. 新增 service_record 本体 ──
        print("\n=== 新增服务记录本体 ===")
        entity_sv = db.query(Entity).filter(
            Entity.tenant_id == TENANT_ID, Entity.entity_code == "service_record"
        ).first()
        if entity_sv:
            print(f"服务记录本体已存在 (id={entity_sv.id})，跳过...")
        else:
            entity_sv = Entity(
                tenant_id=TENANT_ID,
                entity_mode="api",
                entity_code="service_record",
                entity_name="服务记录",
                entity_description="现场服务记录/服务报告，包含服务类型、工程师、服务状态、工时等",
                connector_id=connector_id,
                status="published",
                version=1,
            )
            db.add(entity_sv)
            db.flush()
            print(f"✓ 服务记录本体创建成功 id={entity_sv.id}")

            sv_props = [
                {"name": "service_no", "title": "服务单编号", "type": "string", "is_output": True},
                {"name": "line_code", "title": "产线编号", "type": "string", "is_input": True},
                {"name": "service_type", "title": "服务类型", "type": "string", "is_output": True},
                {"name": "issue", "title": "问题描述", "type": "string", "is_output": True},
                {"name": "resolution", "title": "处理结果", "type": "string", "is_output": True},
                {"name": "engineer", "title": "服务工程师", "type": "string", "is_output": True},
                {"name": "work_hours", "title": "服务工时(小时)", "type": "number", "is_output": True},
                {"name": "status", "title": "服务状态", "type": "string", "is_output": True},
                {"name": "service_date", "title": "服务日期", "type": "date", "is_output": True},
                {"name": "customer_id", "title": "客户ID", "type": "string", "is_input": True, "is_required": True},
            ]
            for p in sv_props:
                db.add(EntityProperty(entity_id=entity_sv.id, **p))
            db.flush()
            print(f"  → 添加 {len(sv_props)} 个属性")

        # ── 7. 服务记录操作: 查询服务 ──
        action_query_sv = db.query(Action).filter(
            Action.entity_id == entity_sv.id, Action.action_code == "query_service"
        ).first()
        if action_query_sv:
            print(f"查询服务操作已存在 (id={action_query_sv.id})，跳过...")
        else:
            action_query_sv = Action(
                entity_id=entity_sv.id,
                action_code="query_service",
                action_name="查询服务记录",
                action_description="查询客户相关的现场服务记录和报告",
                http_method="GET",
                api_path="/services",
                mock_response={
                    "data": {
                        "items": [
                            {
                                "service_no": "SP202601030001",
                                "line_code": "25B1339-G",
                                "service_type": "现场调试",
                                "issue": "上料机械手增加旋转功能",
                                "resolution": "已增加旋转程序，清洁喷头",
                                "engineer": "黄秋军",
                                "work_hours": 24,
                                "status": "已完成",
                                "service_date": "2026-01-28",
                            },
                            {
                                "service_no": "SP202601150002",
                                "line_code": "25A0987-H",
                                "service_type": "故障排查",
                                "issue": "焊接工位温控不稳定",
                                "resolution": "",
                                "engineer": "李明",
                                "work_hours": 8,
                                "status": "处理中",
                                "service_date": "2026-01-15",
                            },
                            {
                                "service_no": "SP202512200003",
                                "line_code": "24C2210-F",
                                "service_type": "验收交付",
                                "issue": "产线最终验收",
                                "resolution": "验收通过，交付完成",
                                "engineer": "王芳",
                                "work_hours": 16,
                                "status": "已完成",
                                "service_date": "2025-12-20",
                            },
                        ]
                    }
                },
            )
            db.add(action_query_sv)
            db.flush()
            print(f"✓ 查询服务操作创建成功 id={action_query_sv.id}")

        # ── 8. 技能: 提交投诉 ──
        print("\n=== 新增技能 ===")
        _ensure_skill(db, "SUBMIT_COMPLAINT", {
            "skill_name": "提交投诉",
            "skill_description": "当用户要反馈问题、提交投诉、提出意见时触发。需要收集产线编号、问题描述、紧急程度。",
            "match_keywords": ["投诉", "反馈", "问题", "意见", "不满", "建议", "我要反馈"],
            "response_prompt": (
                "你是河狸云AI助手。用户提交了投诉/反馈。"
                "请先从用户消息中提取相关信息（产线、问题描述、紧急程度）。"
                "如果信息不完整，礼貌地逐步询问补充。"
                "信息齐全后，调用提交接口并告知用户结果。"
            ),
            "entity_extract_prompt": (
                "从用户消息中提取投诉相关参数:\n"
                "- line_code: 产线编号(如 25B1339-G)\n"
                "- issue: 问题描述\n"
                "- urgency: 紧急程度(紧急/普通，默认普通)\n"
                "返回JSON: {\"line_code\": ..., \"issue\": ..., \"urgency\": ...}"
            ),
            "sort_order": 3,
            "tools": [{"entity_id": entity_cp.id, "action_id": action_submit_cp.id, "order_no": 1}],
        })

        # ── 9. 技能: 查询投诉进度 ──
        _ensure_skill(db, "QUERY_COMPLAINT", {
            "skill_name": "查询投诉进度",
            "skill_description": "当用户查询投诉进度、处理状态、投诉结果时触发",
            "match_keywords": ["投诉进度", "投诉状态", "处理了吗", "处理进度", "投诉结果"],
            "response_prompt": (
                "你是河狸云AI助手。根据查询到的投诉数据回答用户。"
                "包含 complaint_no(编号), issue(问题), status(状态), handler(处理人), result(结果)。"
                "用简洁友好的中文汇总投诉处理情况。"
            ),
            "sort_order": 4,
            "tools": [{"entity_id": entity_cp.id, "action_id": action_query_cp.id, "order_no": 1}],
        })

        # ── 10. 技能: 查询服务记录 ──
        _ensure_skill(db, "QUERY_SERVICE", {
            "skill_name": "查询服务记录",
            "skill_description": "当用户查询服务记录、服务报告、服务状况时触发",
            "match_keywords": ["服务", "服务记录", "服务报告", "工时", "维修", "查服务"],
            "response_prompt": (
                "你是河狸云AI助手。根据查询到的服务记录数据回答用户。"
                "包含 service_no(编号), service_type(类型), issue(问题), resolution(结果), "
                "engineer(工程师), work_hours(工时), status(状态)。"
                "用简洁友好的中文汇总服务情况。"
            ),
            "sort_order": 5,
            "tools": [{"entity_id": entity_sv.id, "action_id": action_query_sv.id, "order_no": 1}],
        })

        # ── 11. 技能: 联系负责人 ──
        _ensure_skill(db, "CONTACT_PERSON", {
            "skill_name": "联系负责人",
            "skill_description": "当用户要联系负责人、打电话、找人时触发",
            "match_keywords": ["联系", "电话", "打电话", "联系人", "找人", "联系负责人"],
            "response_prompt": (
                "你是河狸云AI助手。根据查询到的人员数据帮助用户联系相关人员。"
                "重点标注负责人（角色含'经理'或'负责'的人），展示其联系电话。"
                "如果用户指定了具体人员，精确匹配。"
            ),
            "sort_order": 6,
            "tools": [{"entity_id": entity_fs.id, "action_id": action_query_staff.id, "order_no": 1}],
        })

        db.commit()
        print("\n✅ 修复完成！")
        print("  已清理错误工具链关联")
        print("  已新增: complaint本体 + submit/query操作")
        print("  已新增: service_record本体 + query操作")
        print("  已新增: SUBMIT_COMPLAINT / QUERY_COMPLAINT / QUERY_SERVICE / CONTACT_PERSON 技能")

    except Exception as e:
        db.rollback()
        print(f"❌ 错误: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        db.close()


def _ensure_skill(db, skill_code: str, cfg: dict):
    """创建或跳过技能"""
    existing = db.query(Skill).filter(
        Skill.tenant_id == TENANT_ID, Skill.skill_code == skill_code
    ).first()
    if existing:
        print(f"技能 {skill_code} 已存在 (id={existing.id})，跳过...")
        return

    tools = cfg.pop("tools", [])
    skill = Skill(
        tenant_id=TENANT_ID,
        skill_code=skill_code,
        status="published",
        version=1,
        **cfg,
    )
    db.add(skill)
    db.flush()
    print(f"✓ 技能 {skill_code} 创建成功 id={skill.id}")

    for t in tools:
        db.add(SkillTool(
            skill_id=skill.id,
            tools_mode="api",
            **t,
        ))
    db.flush()
    if tools:
        print(f"  → 关联 {len(tools)} 个工具")


if __name__ == "__main__":
    seed_fix()
