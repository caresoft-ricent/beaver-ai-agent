"""本体管理API - Entity + Property + Relation + Action + ActionParameter"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional

from app.database import get_db
from app.models.ontology import Entity, EntityProperty, EntityRelation, BaseProperty
from app.models.action import Action, ActionParameter
from app.schemas.ontology import (
    EntityCreate, EntityUpdate, EntityOut,
    EntityPropertyCreate, EntityPropertyUpdate, EntityPropertyOut,
    EntityRelationCreate, EntityRelationOut,
    BasePropertyCreate, BasePropertyOut,
    ActionCreate, ActionUpdate, ActionOut,
    ActionParameterCreate, ActionParameterUpdate, ActionParameterOut,
)
from app.schemas.common import ResponseBase

router = APIRouter()


# ===== Entity CRUD =====
@router.get("/entities")
def list_entities(
    tenant_id: Optional[int] = None,
    status: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
):
    query = db.query(Entity)
    if tenant_id:
        query = query.filter(Entity.tenant_id == tenant_id)
    if status:
        query = query.filter(Entity.status == status)
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    return ResponseBase(data={
        "total": total,
        "items": [EntityOut.model_validate(e).model_dump() for e in items],
    })


@router.get("/entities/{entity_id}")
def get_entity(entity_id: int, db: Session = Depends(get_db)):
    entity = db.query(Entity).filter(Entity.id == entity_id).first()
    if not entity:
        raise HTTPException(status_code=404, detail="本体不存在")
    # 附带属性和操作
    properties = db.query(EntityProperty).filter(EntityProperty.entity_id == entity_id).all()
    actions = db.query(Action).filter(Action.entity_id == entity_id).all()
    relations = db.query(EntityRelation).filter(EntityRelation.entity_id == entity_id).all()
    data = EntityOut.model_validate(entity).model_dump()
    data["properties"] = [EntityPropertyOut.model_validate(p).model_dump() for p in properties]
    data["actions"] = [ActionOut.model_validate(a).model_dump() for a in actions]
    data["relations"] = [EntityRelationOut.model_validate(r).model_dump() for r in relations]
    return ResponseBase(data=data)


@router.post("/entities")
def create_entity(req: EntityCreate, db: Session = Depends(get_db)):
    entity = Entity(**req.model_dump())
    db.add(entity)
    db.commit()
    db.refresh(entity)
    return ResponseBase(data=EntityOut.model_validate(entity).model_dump())


@router.put("/entities/{entity_id}")
def update_entity(entity_id: int, req: EntityUpdate, db: Session = Depends(get_db)):
    entity = db.query(Entity).filter(Entity.id == entity_id).first()
    if not entity:
        raise HTTPException(status_code=404, detail="本体不存在")
    for key, value in req.model_dump(exclude_unset=True).items():
        setattr(entity, key, value)
    db.commit()
    db.refresh(entity)
    return ResponseBase(data=EntityOut.model_validate(entity).model_dump())


@router.post("/entities/{entity_id}/publish")
def publish_entity(entity_id: int, db: Session = Depends(get_db)):
    """发布本体配置"""
    entity = db.query(Entity).filter(Entity.id == entity_id).first()
    if not entity:
        raise HTTPException(status_code=404, detail="本体不存在")
    entity.status = "published"
    entity.version += 1
    db.commit()
    return ResponseBase(message="发布成功")


@router.delete("/entities/{entity_id}")
def delete_entity(entity_id: int, db: Session = Depends(get_db)):
    entity = db.query(Entity).filter(Entity.id == entity_id).first()
    if not entity:
        raise HTTPException(status_code=404, detail="本体不存在")
    # 级联删除属性、操作、关系
    db.query(EntityProperty).filter(EntityProperty.entity_id == entity_id).delete()
    db.query(Action).filter(Action.entity_id == entity_id).delete()
    db.query(EntityRelation).filter(EntityRelation.entity_id == entity_id).delete()
    db.delete(entity)
    db.commit()
    return ResponseBase(message="删除成功")


# ===== EntityProperty CRUD =====
@router.post("/entities/{entity_id}/properties")
def create_entity_property(entity_id: int, req: EntityPropertyCreate, db: Session = Depends(get_db)):
    req_data = req.model_dump()
    req_data["entity_id"] = entity_id
    prop = EntityProperty(**req_data)
    db.add(prop)
    db.commit()
    db.refresh(prop)
    return ResponseBase(data=EntityPropertyOut.model_validate(prop).model_dump())


@router.delete("/properties/{property_id}")
def delete_entity_property(property_id: int, db: Session = Depends(get_db)):
    prop = db.query(EntityProperty).filter(EntityProperty.id == property_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="属性不存在")
    db.delete(prop)
    db.commit()
    return ResponseBase(message="删除成功")


@router.put("/properties/{property_id}")
def update_entity_property(property_id: int, req: EntityPropertyUpdate, db: Session = Depends(get_db)):
    prop = db.query(EntityProperty).filter(EntityProperty.id == property_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="属性不存在")
    for key, value in req.model_dump(exclude_unset=True).items():
        setattr(prop, key, value)
    db.commit()
    db.refresh(prop)
    return ResponseBase(data=EntityPropertyOut.model_validate(prop).model_dump())


# ===== EntityRelation CRUD =====
@router.post("/relations")
def create_entity_relation(req: EntityRelationCreate, db: Session = Depends(get_db)):
    rel = EntityRelation(**req.model_dump())
    db.add(rel)
    db.commit()
    db.refresh(rel)
    return ResponseBase(data=EntityRelationOut.model_validate(rel).model_dump())


@router.delete("/relations/{relation_id}")
def delete_entity_relation(relation_id: int, db: Session = Depends(get_db)):
    rel = db.query(EntityRelation).filter(EntityRelation.id == relation_id).first()
    if not rel:
        raise HTTPException(status_code=404, detail="关系不存在")
    db.delete(rel)
    db.commit()
    return ResponseBase(message="删除成功")


# ===== BaseProperty CRUD =====
@router.get("/base-properties")
def list_base_properties(tenant_id: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(BaseProperty)
    if tenant_id:
        query = query.filter(BaseProperty.tenant_id == tenant_id)
    items = query.all()
    return ResponseBase(data=[BasePropertyOut.model_validate(p).model_dump() for p in items])


@router.post("/base-properties")
def create_base_property(req: BasePropertyCreate, db: Session = Depends(get_db)):
    prop = BaseProperty(**req.model_dump())
    db.add(prop)
    db.commit()
    db.refresh(prop)
    return ResponseBase(data=BasePropertyOut.model_validate(prop).model_dump())


# ===== Action CRUD =====

# 独立操作列表(全局)
@router.get("/actions")
def list_all_actions(
    tenant_id: Optional[int] = None,
    entity_id: Optional[int] = None,
    category: Optional[str] = None,
    keyword: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
):
    query = db.query(Action)
    if tenant_id:
        query = query.filter(Action.tenant_id == tenant_id)
    if entity_id:
        query = query.filter(Action.entity_id == entity_id)
    if category:
        query = query.filter(Action.category == category)
    if keyword:
        query = query.filter(
            (Action.action_name.contains(keyword)) | (Action.action_code.contains(keyword))
        )
    total = query.count()
    items = query.order_by(Action.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return ResponseBase(data={
        "total": total,
        "items": [ActionOut.model_validate(a).model_dump() for a in items],
    })


# 本体下的操作列表(兼容旧接口)
@router.get("/entities/{entity_id}/actions")
def list_actions(entity_id: int, db: Session = Depends(get_db)):
    items = db.query(Action).filter(Action.entity_id == entity_id).all()
    return ResponseBase(data=[ActionOut.model_validate(a).model_dump() for a in items])


# 创建操作(独立)
@router.post("/actions")
def create_standalone_action(req: ActionCreate, db: Session = Depends(get_db)):
    action = Action(**req.model_dump())
    db.add(action)
    db.commit()
    db.refresh(action)
    return ResponseBase(data=ActionOut.model_validate(action).model_dump())


# 更新操作参数(放在 /actions/{action_id} 之前避免路由冲突)
@router.put("/actions/parameters/{param_id}")
def update_action_parameter(param_id: int, req: ActionParameterUpdate, db: Session = Depends(get_db)):
    param = db.query(ActionParameter).filter(ActionParameter.id == param_id).first()
    if not param:
        raise HTTPException(status_code=404, detail="参数不存在")
    for key, value in req.model_dump(exclude_unset=True).items():
        setattr(param, key, value)
    db.commit()
    db.refresh(param)
    return ResponseBase(data=ActionParameterOut.model_validate(param).model_dump())


@router.delete("/actions/parameters/{param_id}")
def delete_action_parameter(param_id: int, db: Session = Depends(get_db)):
    param = db.query(ActionParameter).filter(ActionParameter.id == param_id).first()
    if not param:
        raise HTTPException(status_code=404, detail="参数不存在")
    db.delete(param)
    db.commit()
    return ResponseBase(message="删除成功")


# 创建操作(本体下, 兼容旧接口)
@router.post("/entities/{entity_id}/actions")
def create_action(entity_id: int, req: ActionCreate, db: Session = Depends(get_db)):
    req_data = req.model_dump()
    req_data["entity_id"] = entity_id
    # 从本体继承tenant_id
    entity = db.query(Entity).filter(Entity.id == entity_id).first()
    if entity:
        req_data["tenant_id"] = entity.tenant_id
    action = Action(**req_data)
    db.add(action)
    db.commit()
    db.refresh(action)
    return ResponseBase(data=ActionOut.model_validate(action).model_dump())


# 获取操作详情
@router.get("/actions/{action_id}")
def get_action(action_id: int, db: Session = Depends(get_db)):
    action = db.query(Action).filter(Action.id == action_id).first()
    if not action:
        raise HTTPException(status_code=404, detail="操作不存在")
    data = ActionOut.model_validate(action).model_dump()
    # 附带参数列表
    params = db.query(ActionParameter).filter(ActionParameter.action_id == action_id).all()
    data["parameters"] = [ActionParameterOut.model_validate(p).model_dump() for p in params]
    return ResponseBase(data=data)


# 更新操作
@router.put("/actions/{action_id}")
def update_action(action_id: int, req: ActionUpdate, db: Session = Depends(get_db)):
    action = db.query(Action).filter(Action.id == action_id).first()
    if not action:
        raise HTTPException(status_code=404, detail="操作不存在")
    for key, value in req.model_dump(exclude_unset=True).items():
        setattr(action, key, value)
    db.commit()
    db.refresh(action)
    return ResponseBase(data=ActionOut.model_validate(action).model_dump())


@router.delete("/actions/{action_id}")
def delete_action(action_id: int, db: Session = Depends(get_db)):
    action = db.query(Action).filter(Action.id == action_id).first()
    if not action:
        raise HTTPException(status_code=404, detail="操作不存在")
    db.query(ActionParameter).filter(ActionParameter.action_id == action_id).delete()
    db.delete(action)
    db.commit()
    return ResponseBase(message="删除成功")


# ===== ActionParameter CRUD =====
@router.get("/actions/{action_id}/parameters")
def list_action_parameters(action_id: int, db: Session = Depends(get_db)):
    items = db.query(ActionParameter).filter(ActionParameter.action_id == action_id).all()
    return ResponseBase(data=[ActionParameterOut.model_validate(p).model_dump() for p in items])


@router.post("/actions/{action_id}/parameters")
def create_action_parameter(action_id: int, req: ActionParameterCreate, db: Session = Depends(get_db)):
    req_data = req.model_dump()
    req_data["action_id"] = action_id
    param = ActionParameter(**req_data)
    db.add(param)
    db.commit()
    db.refresh(param)
    return ResponseBase(data=ActionParameterOut.model_validate(param).model_dump())
