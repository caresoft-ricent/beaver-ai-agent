"""插入 inspection 工序验收样板域种子数据"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models.domain import Domain
from app.models.ontology import Entity, EntityProperty
from app.models.action import Action, ActionParameter
from app.models.config import Connector

db = SessionLocal()

try:
    # 0. 幂等：清除旧数据
    old = db.query(Domain).filter(Domain.code == "inspection").first()
    if old:
        old_actions = db.query(Action).filter(Action.domain_id == old.id).all()
        for a in old_actions:
            db.query(ActionParameter).filter(ActionParameter.action_id == a.id).delete()
            db.delete(a)
        old_entities = db.query(Entity).filter(Entity.domain_id == old.id).all()
        for e in old_entities:
            db.query(EntityProperty).filter(EntityProperty.entity_id == e.id).delete()
            db.delete(e)
        db.delete(old)
        db.flush()
        print("Cleaned old inspection data")

    # 1. Domain
    domain = Domain(
        tenant_id=1, code="inspection", name="工序验收",
        description="负责工序验收相关的查询与管理，包括验收记录查询、验收统计、验收详情等。关键词：验收、工序、检查、巡检",
        version=1, status="published", generated_by="manual",
        default_risk_level="low", requires_scope_check=True, response_style="table",
    )
    db.add(domain)
    db.flush()
    print(f"Domain id={domain.id}")

    # 2. Entity
    entity = Entity(
        tenant_id=1, entity_mode="api", entity_code="inspection_record",
        entity_name="工序验收记录", category="质量管理",
        entity_description="工序验收记录，包含项目、工序名称、验收结果、验收人、验收时间等信息",
        connector_id=2, status="published", domain_id=domain.id,
    )
    db.add(entity)
    db.flush()
    print(f"Entity id={entity.id}")

    # 3. Properties
    for p in [
        ("project_id", "number", "项目ID", "工程项目的唯一标识", True, False),
        ("project_name", "string", "项目名称", "项目名称支持模糊搜索", True, True),
        ("inspection_status", "string", "验收状态", "1=待验收 2=已通过 3=不通过 4=整改中", True, True),
        ("inspector_name", "string", "验收人", "执行验收的人员", True, True),
        ("process_name", "string", "工序名称", "被验收的工序名称", False, True),
        ("inspection_date", "date", "验收日期", "验收执行日期", True, True),
        ("inspection_result", "string", "验收结论", "合格/不合格/有条件通过", False, True),
    ]:
        db.add(EntityProperty(entity_id=entity.id, name=p[0], type=p[1], title=p[2],
                              property_description=p[3], is_input=p[4], is_output=p[5]))
    db.flush()
    print("Properties created")

    # 4. Action: inspection_list
    a1 = Action(
        tenant_id=1, entity_id=entity.id, connector_id=2, action_code="inspection_list",
        action_name="查询工序验收列表",
        action_description="查询工序验收记录列表，支持按项目、状态、日期、验收人等条件筛选",
        http_method="POST", api_path="/api/dataset/query", action_type="query",
        risk_level="low", response_type="table", domain_id=domain.id, discovery_status="published",
    )
    db.add(a1)
    db.flush()
    print(f"Action inspection_list id={a1.id}")

    # 5. Action: inspection_statistics
    a2 = Action(
        tenant_id=1, entity_id=entity.id, connector_id=2, action_code="inspection_statistics",
        action_name="工序验收统计",
        action_description="统计工序验收数据，包括通过率、各状态数量、按项目汇总等",
        http_method="POST", api_path="/api/dataset/query", action_type="query",
        risk_level="low", response_type="table", domain_id=domain.id, discovery_status="published",
    )
    db.add(a2)
    db.flush()
    print(f"Action inspection_statistics id={a2.id}")

    # 6. inspection_list 输入参数
    for name, sp, typ, title, desc, req, ft, fc, vm in [
        ("project_id", "project_id", "number", "项目ID", "项目唯一标识", False, "Long", "equals", "filter"),
        ("keyword", "project_name", "string", "关键字", "按项目/工序名称模糊搜索", False, None, None, "filter"),
        ("inspection_status", "inspection_status", "string", "验收状态", "1=待验收 2=已通过 3=不通过 4=整改中", False, "set", None, "values"),
        ("inspector_name", "inspector_name", "string", "验收人", "验收人姓名", False, "String", "contains", "filter"),
        ("inspection_date", "inspection_date", "date", "验收日期", "验收日期范围", False, "Date", "inRange", "date_range"),
        ("limit", None, "number", "数量限制", "返回记录数量上限", False, None, None, "filter"),
    ]:
        db.add(ActionParameter(
            action_id=a1.id, name=name, source_property=sp, type=typ, title=title,
            param_description=desc, is_input=True, is_output=False, is_required=req,
            filter_type=ft, filter_condition=fc, value_mode=vm,
            default_value="100" if name == "limit" else None,
        ))

    # 7. inspection_list 输出参数
    for name, typ, title, desc, agg, sort in [
        ("project_name", "string", "项目名称", "所属项目", None, None),
        ("process_name", "string", "工序名称", "验收工序", None, None),
        ("inspection_status", "string", "验收状态", "1=待验收 2=已通过 3=不通过 4=整改中", None, None),
        ("inspector_name", "string", "验收人", "验收执行人", None, None),
        ("inspection_date", "date", "验收日期", "验收执行日期", None, "desc"),
        ("inspection_result", "string", "验收结论", "合格/不合格/有条件通过", None, None),
    ]:
        db.add(ActionParameter(
            action_id=a1.id, name=name, type=typ, title=title,
            param_description=desc, is_input=False, is_output=True,
            agg_func=agg, sort_order=sort,
        ))

    # 8. inspection_statistics 输入参数
    for name, sp, typ, title, desc, ft, fc, vm in [
        ("project_id", "project_id", "number", "项目ID", "项目唯一标识", "Long", "equals", "filter"),
        ("inspection_date", "inspection_date", "date", "验收日期", "统计日期范围", "Date", "inRange", "date_range"),
        ("inspection_status", "inspection_status", "string", "验收状态", "按状态筛选", "set", None, "values"),
    ]:
        db.add(ActionParameter(
            action_id=a2.id, name=name, source_property=sp, type=typ, title=title,
            param_description=desc, is_input=True, is_output=False, is_required=False,
            filter_type=ft, filter_condition=fc, value_mode=vm,
        ))

    # 9. inspection_statistics 输出参数
    for name, typ, title, desc, agg in [
        ("project_name", "string", "项目名称", "按项目分组", None),
        ("inspection_status", "string", "验收状态", "按状态分组", None),
        ("total_count", "number", "验收总数", "验收记录总数量", "count"),
        ("pass_count", "number", "通过数量", "通过的验收数量", "count"),
        ("pass_rate", "number", "通过率", "验收通过率百分比", "percent"),
    ]:
        db.add(ActionParameter(
            action_id=a2.id, name=name, type=typ, title=title,
            param_description=desc, is_input=False, is_output=True, agg_func=agg,
        ))

    # 10. 更新 adapter 映射器
    c = db.query(Connector).filter(Connector.id == 2).first()
    if c:
        c.request_mapper = "beaver_dataset"
        c.response_mapper = "beaver_dataset"

    db.commit()
    print("✅ Seed data inserted successfully")

except Exception as e:
    db.rollback()
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
finally:
    db.close()
