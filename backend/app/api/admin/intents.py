"""技能/意图管理API"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional

from app.database import get_db
from app.models.intent import Skill, SkillTool
from app.schemas.intent import (
    SkillCreate, SkillUpdate, SkillOut,
    SkillToolCreate, SkillToolOut,
)
from app.schemas.common import ResponseBase

router = APIRouter()


# ===== Skill CRUD =====
@router.get("")
def list_skills(
    tenant_id: Optional[int] = None,
    status: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
):
    query = db.query(Skill).order_by(Skill.sort_order)
    if tenant_id:
        query = query.filter(Skill.tenant_id == tenant_id)
    if status:
        query = query.filter(Skill.status == status)
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    return ResponseBase(data={
        "total": total,
        "items": [SkillOut.model_validate(s).model_dump() for s in items],
    })


@router.get("/{skill_id}")
def get_skill(skill_id: int, db: Session = Depends(get_db)):
    skill = db.query(Skill).filter(Skill.id == skill_id).first()
    if not skill:
        raise HTTPException(status_code=404, detail="技能不存在")
    tools = db.query(SkillTool).filter(SkillTool.skill_id == skill_id).order_by(SkillTool.order_no).all()
    data = SkillOut.model_validate(skill).model_dump()
    data["tools"] = [SkillToolOut.model_validate(t).model_dump() for t in tools]
    return ResponseBase(data=data)


@router.post("")
def create_skill(req: SkillCreate, db: Session = Depends(get_db)):
    skill = Skill(**req.model_dump())
    db.add(skill)
    db.commit()
    db.refresh(skill)
    return ResponseBase(data=SkillOut.model_validate(skill).model_dump())


@router.put("/{skill_id}")
def update_skill(skill_id: int, req: SkillUpdate, db: Session = Depends(get_db)):
    skill = db.query(Skill).filter(Skill.id == skill_id).first()
    if not skill:
        raise HTTPException(status_code=404, detail="技能不存在")
    for key, value in req.model_dump(exclude_unset=True).items():
        setattr(skill, key, value)
    db.commit()
    db.refresh(skill)
    return ResponseBase(data=SkillOut.model_validate(skill).model_dump())


@router.post("/{skill_id}/publish")
def publish_skill(skill_id: int, db: Session = Depends(get_db)):
    """发布技能配置"""
    skill = db.query(Skill).filter(Skill.id == skill_id).first()
    if not skill:
        raise HTTPException(status_code=404, detail="技能不存在")
    skill.status = "published"
    skill.version += 1
    db.commit()
    return ResponseBase(message="发布成功")


@router.delete("/{skill_id}")
def delete_skill(skill_id: int, db: Session = Depends(get_db)):
    skill = db.query(Skill).filter(Skill.id == skill_id).first()
    if not skill:
        raise HTTPException(status_code=404, detail="技能不存在")
    db.query(SkillTool).filter(SkillTool.skill_id == skill_id).delete()
    db.delete(skill)
    db.commit()
    return ResponseBase(message="删除成功")


# ===== SkillTool CRUD =====
@router.post("/{skill_id}/tools")
def create_skill_tool(skill_id: int, req: SkillToolCreate, db: Session = Depends(get_db)):
    req_data = req.model_dump()
    req_data["skill_id"] = skill_id
    tool = SkillTool(**req_data)
    db.add(tool)
    db.commit()
    db.refresh(tool)
    return ResponseBase(data=SkillToolOut.model_validate(tool).model_dump())


@router.put("/tools/{tool_id}")
def update_skill_tool(tool_id: int, req: SkillToolCreate, db: Session = Depends(get_db)):
    tool = db.query(SkillTool).filter(SkillTool.id == tool_id).first()
    if not tool:
        raise HTTPException(status_code=404, detail="技能工具不存在")
    for key, value in req.model_dump(exclude_unset=True).items():
        if key != "skill_id":
            setattr(tool, key, value)
    db.commit()
    db.refresh(tool)
    return ResponseBase(data=SkillToolOut.model_validate(tool).model_dump())


@router.delete("/tools/{tool_id}")
def delete_skill_tool(tool_id: int, db: Session = Depends(get_db)):
    tool = db.query(SkillTool).filter(SkillTool.id == tool_id).first()
    if not tool:
        raise HTTPException(status_code=404, detail="技能工具不存在")
    db.delete(tool)
    db.commit()
    return ResponseBase(message="删除成功")
