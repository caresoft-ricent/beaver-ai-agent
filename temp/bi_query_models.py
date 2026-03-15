from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional


class BiDatasetFieldType(str, Enum):
    STRING = "String"
    DOUBLE = "Double"
    FLOAT = "Float"
    INTEGER = "Integer"
    LONG = "Long"
    DECIMAL = "Decimal"
    BOOLEAN = "Boolean"
    DATE = "Date"
    TIME = "Time"
    DATETIME = "DateTime"
    SET = "set"
    TEXT = "text"
    NUMBER = "number"
    DATE1 = "date"
    DATE_FUNC = "dateFunc"


class BiConditionType(str, Enum):
    SET = "set"
    CONTAINS = "contains"
    NOT_CONTAINS = "notContains"
    EQUALS = "equals"
    NOT_EQUAL = "notEqual"
    STARTS_WITH = "startsWith"
    ENDS_WITH = "endsWith"
    BLANK = "blank"
    NOT_BLANK = "notBlank"
    LESS_THAN = "lessThan"
    LESS_THAN_OR_EQUAL = "lessThanOrEqual"
    GREATER_THAN = "greaterThan"
    GREATER_THAN_OR_EQUAL = "greaterThanOrEqual"
    IN_RANGE = "inRange"
    CURRENT_DAY = "currentDay"
    BEFORE = "before"
    AFTER = "after"


class BiOperatorType(str, Enum):
    OR = "OR"
    AND = "AND"


def _enum_or_none(enum_cls: type[Enum], value: Any) -> Any:
    if value is None or isinstance(value, enum_cls):
        return value
    try:
        return enum_cls(value)
    except ValueError:
        return None


@dataclass
class BiColumnModel:
    id: Optional[str] = None
    displayName: Optional[str] = None
    field: Optional[str] = None
    func: Optional[str] = None
    aggFunc: Optional[str] = None
    filterType: Optional[str] = None

    @classmethod
    def from_dict(cls, data: Optional[dict[str, Any]]) -> "BiColumnModel":
        data = data or {}
        return cls(
            id=data.get("id"),
            displayName=data.get("displayName"),
            field=data.get("field"),
            func=data.get("func"),
            aggFunc=data.get("aggFunc"),
            filterType=data.get("filterType"),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "displayName": self.displayName,
            "field": self.field,
            "func": self.func,
            "aggFunc": self.aggFunc,
            "filterType": self.filterType,
        }


@dataclass
class BiSortModel:
    colId: Optional[str] = None
    sort: Optional[str] = None

    @classmethod
    def from_dict(cls, data: Optional[dict[str, Any]]) -> "BiSortModel":
        data = data or {}
        return cls(colId=data.get("colId"), sort=data.get("sort"))

    def to_dict(self) -> dict[str, Any]:
        return {"colId": self.colId, "sort": self.sort}


@dataclass
class BiFieldFilterModel:
    filterType: Optional[BiDatasetFieldType] = None
    type: Optional[BiConditionType] = None
    field: Optional[str] = None
    filter: Any = None
    filterTo: Any = None
    dateFrom: Optional[str] = None
    dateTo: Optional[str] = None
    values: Optional[list[Any]] = None
    operator: Optional[BiOperatorType] = None
    conditions: Optional[list["BiFieldFilterModel"]] = None

    @classmethod
    def from_dict(cls, data: Optional[dict[str, Any]]) -> "BiFieldFilterModel":
        data = data or {}
        conditions_data = data.get("conditions") or []
        return cls(
            filterType=_enum_or_none(BiDatasetFieldType, data.get("filterType")),
            type=_enum_or_none(BiConditionType, data.get("type")),
            field=data.get("field"),
            filter=data.get("filter"),
            filterTo=data.get("filterTo"),
            dateFrom=data.get("dateFrom"),
            dateTo=data.get("dateTo"),
            values=list(data.get("values") or []) if data.get("values") is not None else None,
            operator=_enum_or_none(BiOperatorType, data.get("operator")),
            conditions=[BiFieldFilterModel.from_dict(item) for item in conditions_data] if conditions_data else None,
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "filterType": self.filterType.value if self.filterType else None,
            "type": self.type.value if self.type else None,
            "field": self.field,
            "filter": self.filter,
            "filterTo": self.filterTo,
            "dateFrom": self.dateFrom,
            "dateTo": self.dateTo,
            "values": self.values,
            "operator": self.operator.value if self.operator else None,
            "conditions": [item.to_dict() for item in self.conditions] if self.conditions else None,
        }


@dataclass
class BiQueryDto:
    datasetCode: Optional[str] = None
    startRow: int = 0
    endRow: int = 20
    keyword: Optional[str] = None
    rowGroupCols: list[BiColumnModel] = field(default_factory=list)
    groupKeys: list[str] = field(default_factory=list)
    valueCols: list[BiColumnModel] = field(default_factory=list)
    filterModel: dict[str, BiFieldFilterModel] = field(default_factory=dict)
    filterModels: list[dict[str, BiFieldFilterModel]] = field(default_factory=list)
    filterModelsOperators: Optional[str] = None
    sortModel: list[BiSortModel] = field(default_factory=list)
    showCount: bool = False
    compoundQueryDto: Optional["BiQueryDto"] = None
    formId: Optional[str] = None
    customFields: Optional[list[str]] = None

    @classmethod
    def from_dict(cls, data: Optional[dict[str, Any]]) -> "BiQueryDto":
        data = data or {}

        row_group_cols = [BiColumnModel.from_dict(item) for item in data.get("rowGroupCols", [])]
        value_cols = [BiColumnModel.from_dict(item) for item in data.get("valueCols", [])]
        sort_model = [BiSortModel.from_dict(item) for item in data.get("sortModel", [])]

        filter_model_raw = data.get("filterModel") or {}
        filter_model = {
            key: BiFieldFilterModel.from_dict(value)
            for key, value in filter_model_raw.items()
        }

        filter_models_raw = data.get("filterModels") or []
        filter_models = []
        for one_map in filter_models_raw:
            typed_map = {
                key: BiFieldFilterModel.from_dict(value)
                for key, value in (one_map or {}).items()
            }
            filter_models.append(typed_map)

        compound_query = (
            BiQueryDto.from_dict(data.get("compoundQueryDto"))
            if data.get("compoundQueryDto")
            else None
        )

        return cls(
            datasetCode=data.get("datasetCode"),
            startRow=int(data.get("startRow", 0)),
            endRow=int(data.get("endRow", 20)),
            keyword=data.get("keyword"),
            rowGroupCols=row_group_cols,
            groupKeys=list(data.get("groupKeys") or []),
            valueCols=value_cols,
            filterModel=filter_model,
            filterModels=filter_models,
            filterModelsOperators=data.get("filterModelsOperators"),
            sortModel=sort_model,
            showCount=bool(data.get("showCount", False)),
            compoundQueryDto=compound_query,
            formId=data.get("formId"),
            customFields=list(data.get("customFields") or []) if data.get("customFields") is not None else None,
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "datasetCode": self.datasetCode,
            "startRow": self.startRow,
            "endRow": self.endRow,
            "keyword": self.keyword,
            "rowGroupCols": [item.to_dict() for item in self.rowGroupCols],
            "groupKeys": self.groupKeys,
            "valueCols": [item.to_dict() for item in self.valueCols],
            "filterModel": {
                key: value.to_dict() for key, value in self.filterModel.items()
            },
            "filterModels": [
                {key: value.to_dict() for key, value in one_map.items()}
                for one_map in self.filterModels
            ],
            "filterModelsOperators": self.filterModelsOperators,
            "sortModel": [item.to_dict() for item in self.sortModel],
            "showCount": self.showCount,
            "compoundQueryDto": self.compoundQueryDto.to_dict() if self.compoundQueryDto else None,
            "formId": self.formId,
            "customFields": self.customFields,
        }


