"""连接器管理API"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
import httpx

from app.database import get_db
from app.models.config import Connector
from app.schemas.config import ConnectorCreate, ConnectorUpdate, ConnectorOut
from app.schemas.common import ResponseBase

router = APIRouter()


@router.get("")
def list_connectors(
    tenant_id: Optional[int] = None,
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
):
    query = db.query(Connector)
    if tenant_id:
        query = query.filter(Connector.tenant_id == tenant_id)
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    return ResponseBase(data={
        "total": total,
        "items": [ConnectorOut.model_validate(c).model_dump() for c in items],
    })


@router.get("/{connector_id}")
def get_connector(connector_id: int, db: Session = Depends(get_db)):
    conn = db.query(Connector).filter(Connector.id == connector_id).first()
    if not conn:
        raise HTTPException(status_code=404, detail="连接器不存在")
    return ResponseBase(data=ConnectorOut.model_validate(conn).model_dump())


@router.post("")
def create_connector(req: ConnectorCreate, db: Session = Depends(get_db)):
    conn = Connector(**req.model_dump())
    db.add(conn)
    db.commit()
    db.refresh(conn)
    return ResponseBase(data=ConnectorOut.model_validate(conn).model_dump())


@router.put("/{connector_id}")
def update_connector(connector_id: int, req: ConnectorUpdate, db: Session = Depends(get_db)):
    conn = db.query(Connector).filter(Connector.id == connector_id).first()
    if not conn:
        raise HTTPException(status_code=404, detail="连接器不存在")
    for key, value in req.model_dump(exclude_unset=True).items():
        setattr(conn, key, value)
    db.commit()
    db.refresh(conn)
    return ResponseBase(data=ConnectorOut.model_validate(conn).model_dump())


@router.delete("/{connector_id}")
def delete_connector(connector_id: int, db: Session = Depends(get_db)):
    conn = db.query(Connector).filter(Connector.id == connector_id).first()
    if not conn:
        raise HTTPException(status_code=404, detail="连接器不存在")
    db.delete(conn)
    db.commit()
    return ResponseBase(message="删除成功")


@router.post("/{connector_id}/test")
def test_connector(connector_id: int, db: Session = Depends(get_db)):
    """测试连接器是否可达"""
    conn = db.query(Connector).filter(Connector.id == connector_id).first()
    if not conn:
        raise HTTPException(status_code=404, detail="连接器不存在")

    # Mock 模式直接返回成功
    if conn.mock_enabled == "1":
        return ResponseBase(data={"reachable": True, "mock": True, "message": "Mock模式已启用，跳过连接测试"})

    test_url = conn.base_url.rstrip("/")
    if conn.health_check_path:
        test_url += "/" + conn.health_check_path.lstrip("/")

    try:
        from app.clients.connector_client import ConnectorClient
        cli = ConnectorClient({
            "base_url": conn.base_url,
            "auth_type": conn.auth_type,
            "auth_config": conn.auth_config,
            "timeout": conn.timeout,
            "mock_enabled": "0",
        })
        headers = cli._build_headers()
        with httpx.Client(timeout=conn.timeout) as client:
            resp = client.get(test_url, headers=headers)
            return ResponseBase(data={
                "reachable": True,
                "status_code": resp.status_code,
                "response_time_ms": int(resp.elapsed.total_seconds() * 1000),
            })
    except httpx.ConnectError:
        return ResponseBase(code=1, message="连接失败", data={"reachable": False, "error": "无法连接到目标地址"})
    except httpx.TimeoutException:
        return ResponseBase(code=1, message="连接超时", data={"reachable": False, "error": "连接超时"})
    except Exception as e:
        return ResponseBase(code=1, message="连接异常", data={"reachable": False, "error": str(e)})
