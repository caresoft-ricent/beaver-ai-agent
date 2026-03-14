"""
东威科技演示数据种子脚本

创建完整的演示配置：
- 连接器（Mock模式）
- 本体：产线、现场人员
- 操作：查询产线进度、查询现场人员
- 技能：查进度、查人员、闲聊
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models.config import Connector, LLMConfig
from app.models.ontology import Entity, EntityProperty
from app.models.action import Action, ActionParameter
from app.models.intent import Skill, SkillTool

TENANT_ID = 1  # 东威科技


def seed():
    db = SessionLocal()
    try:
        # ===== 1. 连接器 (Mock模式，尚未接真实河狸云) =====
        existing = db.query(Connector).filter(Connector.tenant_id == TENANT_ID).first()
        if existing:
            print(f"连接器已存在 (id={existing.id})，跳过...")
            connector_id = existing.id
        else:
            connector = Connector(
                tenant_id=TENANT_ID,
                name="河狸云(Mock)",
                type="beaver_cloud",
                base_url="https://api.beaver-cloud.com/v1",
                auth_type="api_key",
                auth_config={"header_name": "Authorization", "key_value": "Bearer mock-token"},
                timeout=30,
                health_check_path="/health",
                mock_enabled="1",
                status="active",
            )
            db.add(connector)
            db.flush()
            connector_id = connector.id
            print(f"✓ 连接器创建成功 id={connector_id}")

        # ===== 2. 本体: 产线 (production_line) =====
        entity_pl = db.query(Entity).filter(
            Entity.tenant_id == TENANT_ID,
            Entity.entity_code == "production_line"
        ).first()
        if entity_pl:
            print(f"产线本体已存在 (id={entity_pl.id})，跳过...")
            entity_pl_id = entity_pl.id
        else:
            entity_pl = Entity(
                tenant_id=TENANT_ID,
                entity_mode="api",
                entity_code="production_line",
                entity_name="产线",
                entity_description="客户的生产线/产线信息，包括进度、状态、节点等",
                connector_id=connector_id,
                status="published",
                version=1,
            )
            db.add(entity_pl)
            db.flush()
            entity_pl_id = entity_pl.id
            print(f"✓ 产线本体创建成功 id={entity_pl_id}")

            # 产线属性
            props = [
                {"name": "line_code", "title": "产线编号", "type": "string", "is_input": True, "is_required": False},
                {"name": "line_name", "title": "产线名称", "type": "string", "is_output": True},
                {"name": "progress", "title": "进度(%)", "type": "number", "is_output": True},
                {"name": "status", "title": "状态", "type": "string", "is_output": True},
                {"name": "current_node", "title": "当前节点", "type": "string", "is_output": True},
                {"name": "expected_date", "title": "预计交付日期", "type": "date", "is_output": True},
                {"name": "customer_id", "title": "客户ID", "type": "string", "is_input": True, "is_required": True},
            ]
            for p in props:
                db.add(EntityProperty(entity_id=entity_pl_id, **p))
            db.flush()
            print(f"  → 添加 {len(props)} 个属性")

        # ===== 3. 操作: 查询产线进度 =====
        action_query_pl = db.query(Action).filter(
            Action.entity_id == entity_pl_id,
            Action.action_code == "query_progress"
        ).first()
        if action_query_pl:
            print(f"查询进度操作已存在 (id={action_query_pl.id})，跳过...")
            action_query_pl_id = action_query_pl.id
        else:
            action_query_pl = Action(
                entity_id=entity_pl_id,
                action_code="query_progress",
                action_name="查询产线进度",
                action_description="查询指定客户的产线生产进度",
                http_method="GET",
                api_path="/lines",
                request_template=None,
                response_mapping={
                    "lines": "data.items",
                },
                mock_response={
                    "data": {
                        "items": [
                            {
                                "line_code": "25B1339-G",
                                "line_name": "25B1339-G 自动化产线",
                                "progress": 72,
                                "status": "生产中",
                                "current_node": "组装工位-3",
                                "expected_date": "2026-04-15",
                            },
                            {
                                "line_code": "25A0987-H",
                                "line_name": "25A0987-H 柔性产线",
                                "progress": 45,
                                "status": "生产中",
                                "current_node": "焊接工位-1",
                                "expected_date": "2026-05-20",
                            },
                            {
                                "line_code": "24C2210-F",
                                "line_name": "24C2210-F 精密产线",
                                "progress": 100,
                                "status": "已完工",
                                "current_node": "验收完成",
                                "expected_date": "2026-03-01",
                            },
                        ]
                    }
                },
            )
            db.add(action_query_pl)
            db.flush()
            action_query_pl_id = action_query_pl.id
            print(f"✓ 查询进度操作创建成功 id={action_query_pl_id}")

        # ===== 4. 本体: 现场人员 (field_staff) =====
        entity_fs = db.query(Entity).filter(
            Entity.tenant_id == TENANT_ID,
            Entity.entity_code == "field_staff"
        ).first()
        if entity_fs:
            print(f"现场人员本体已存在 (id={entity_fs.id})，跳过...")
            entity_fs_id = entity_fs.id
        else:
            entity_fs = Entity(
                tenant_id=TENANT_ID,
                entity_mode="api",
                entity_code="field_staff",
                entity_name="现场人员",
                entity_description="驻厂/现场服务人员信息",
                connector_id=connector_id,
                status="published",
                version=1,
            )
            db.add(entity_fs)
            db.flush()
            entity_fs_id = entity_fs.id
            print(f"✓ 现场人员本体创建成功 id={entity_fs_id}")

            fs_props = [
                {"name": "staff_name", "title": "姓名", "type": "string", "is_output": True},
                {"name": "role", "title": "角色", "type": "string", "is_output": True},
                {"name": "phone", "title": "联系电话", "type": "string", "is_output": True},
                {"name": "line_code", "title": "负责产线", "type": "string", "is_input": True},
                {"name": "customer_id", "title": "客户ID", "type": "string", "is_input": True, "is_required": True},
            ]
            for p in fs_props:
                db.add(EntityProperty(entity_id=entity_fs_id, **p))
            db.flush()
            print(f"  → 添加 {len(fs_props)} 个属性")

        # ===== 5. 操作: 查询现场人员 =====
        action_query_fs = db.query(Action).filter(
            Action.entity_id == entity_fs_id,
            Action.action_code == "query_staff"
        ).first()
        if action_query_fs:
            print(f"查询人员操作已存在 (id={action_query_fs.id})，跳过...")
            action_query_fs_id = action_query_fs.id
        else:
            action_query_fs = Action(
                entity_id=entity_fs_id,
                action_code="query_staff",
                action_name="查询现场人员",
                action_description="查询指定产线的驻厂/现场人员信息",
                http_method="GET",
                api_path="/staff",
                mock_response={
                    "data": {
                        "items": [
                            {"staff_name": "张伟", "role": "项目经理", "phone": "138-0000-1001", "line_code": "25B1339-G"},
                            {"staff_name": "李明", "role": "调试工程师", "phone": "138-0000-1002", "line_code": "25B1339-G"},
                            {"staff_name": "王芳", "role": "售后服务", "phone": "138-0000-1003", "line_code": "25A0987-H"},
                        ]
                    }
                },
            )
            db.add(action_query_fs)
            db.flush()
            action_query_fs_id = action_query_fs.id
            print(f"✓ 查询人员操作创建成功 id={action_query_fs_id}")

        # ===== 6. 技能: 查询产线进度 =====
        skill_progress = db.query(Skill).filter(
            Skill.tenant_id == TENANT_ID,
            Skill.skill_code == "QUERY_PROGRESS"
        ).first()
        if skill_progress:
            print(f"进度技能已存在 (id={skill_progress.id})，跳过...")
        else:
            skill_progress = Skill(
                tenant_id=TENANT_ID,
                skill_name="查询产线进度",
                skill_code="QUERY_PROGRESS",
                skill_description="当用户询问产线进度、交付进度、生产状态时触发",
                match_keywords=["进度", "产线", "交货", "交付", "生产", "完工", "什么时候"],
                match_patterns=[r"(?P<line_code>\d{2}[A-Z]\d{4}-[A-Z])"],
                response_template=None,  # 用Mock数据直接返回结构化数据
                sort_order=1,
                status="published",
                version=1,
            )
            db.add(skill_progress)
            db.flush()
            print(f"✓ 进度技能创建成功 id={skill_progress.id}")

            # 技能工具关联
            db.add(SkillTool(
                skill_id=skill_progress.id,
                tools_mode="api",
                entity_id=entity_pl_id,
                action_id=action_query_pl_id,
                order_no=1,
            ))
            db.flush()
            print("  → 关联工具: 查询产线进度")

        # ===== 7. 技能: 查询现场人员 =====
        skill_staff = db.query(Skill).filter(
            Skill.tenant_id == TENANT_ID,
            Skill.skill_code == "QUERY_STAFF"
        ).first()
        if skill_staff:
            print(f"人员技能已存在 (id={skill_staff.id})，跳过...")
        else:
            skill_staff = Skill(
                tenant_id=TENANT_ID,
                skill_name="查询现场人员",
                skill_code="QUERY_STAFF",
                skill_description="当用户询问现场人员、驻厂人员、联系方式时触发",
                match_keywords=["人员", "驻厂", "联系", "电话", "工程师", "负责人"],
                sort_order=2,
                status="published",
                version=1,
            )
            db.add(skill_staff)
            db.flush()
            print(f"✓ 人员技能创建成功 id={skill_staff.id}")

            db.add(SkillTool(
                skill_id=skill_staff.id,
                tools_mode="api",
                entity_id=entity_fs_id,
                action_id=action_query_fs_id,
                order_no=1,
            ))
            db.flush()
            print("  → 关联工具: 查询现场人员")

        # ===== 8. 技能: 闲聊/兜底 =====
        skill_chat = db.query(Skill).filter(
            Skill.tenant_id == TENANT_ID,
            Skill.skill_code == "CHITCHAT"
        ).first()
        if skill_chat:
            print(f"闲聊技能已存在 (id={skill_chat.id})，跳过...")
        else:
            skill_chat = Skill(
                tenant_id=TENANT_ID,
                skill_name="闲聊/其他",
                skill_code="CHITCHAT",
                skill_description="无法匹配到其他意图时的兜底回答",
                match_keywords=["你好", "在吗", "谢谢"],
                response_template="您好！我是河狸云AI助手，可以帮您查询产线进度、现场人员信息等。请问有什么可以帮助您的？",
                sort_order=99,
                status="published",
                version=1,
            )
            db.add(skill_chat)
            db.flush()
            print(f"✓ 闲聊技能创建成功 id={skill_chat.id}")

        db.commit()
        print("\n✅ 演示数据插入完成！")
        print(f"   租户: 东威科技 (id={TENANT_ID})")
        print(f"   连接器: id={connector_id} (Mock模式)")
        print(f"   本体: 产线(id={entity_pl_id}), 现场人员(id={entity_fs_id})")
        print(f"   技能: QUERY_PROGRESS, QUERY_STAFF, CHITCHAT")

    except Exception as e:
        db.rollback()
        print(f"❌ 错误: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
