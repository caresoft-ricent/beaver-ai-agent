interface IServerSideGetRowsRequest {
  // 起始行，没传为0. 
  startRow: number | undefined;
  // 结束行，传-1返回所有. 
  endRow: number | undefined;
  // 用于分组的字段.  
  rowGroupCols: ColumnVO[];
  // 展开分级的条件，值的顺序字段对应rowGroupCols顺序.  
  groupKeys: string[];
  // 搜索条件.  
  filterModel: FilterModel;
  // 排序.  
  sortModel: SortModelItem[];
  // 自定义字段查询， 如 extendStrA1, extendStrC1, extendDate1
  customFields?: string[];
  // 数据集 datasetCode
  datasetCode: string;
  // 分组后统计的字段.  
  valueCols: ColumnVO[];
}

interface ColumnVO {
  // 字段名
  field: string;
  // 聚合函数（在valueCols汇总使用）
  // "sum" : "求和", "count" : "计数", "distinctCount" : "去重计数", "avg" : "平均", "max" : "最大值", "min" : "最小值", "first" : "第一个值", "last" : "最后一个值, "percent" : "百分比", "formula" : "自定义计算", 
  aggFunc?:  "sum" | "count" | "distinctCount" | "avg" | "max" | "min" | "first" | "last" | "percent"| 'formula';
  // 计算公式表达式
  func?: string;
  // 格式化配置（以“%”结尾的配置表示百分比格式化，输出时数字乘以100，加上后缀%）
  formula?: string;
}

interface SortModelItem {
  // 字段名. 
  colId: string;
  // 排序方式 
  sort: 'asc' | 'desc';
}

interface FilterModel {
  // 字段名
  [colId: string]: FieldFilterModel
}

interface FieldFilterModel {
   // 字段类型： 与数据集定义的字段类型一致 + set
   filterType: "String" | "Integer" | "Long" | "Decimal" | "Boolean" | "Date" | "Time" | "DateTime" | "set",
   // 条件类型（对应filterType时的条件类型）
   // "String":  contains|notContains|equals|notEqual|startsWith|endsWith|blank|notBlank
   // ["Integer" | "Integer"]: equals|notEqual|lessThan|lessThanOrEqual|greaterThan|greaterThanOrEqual
   //          |inRange|blank|notBlank
   // ["Date" | "Time" | "DateTime"]: equals|greaterThan|lessThan|notEqual|inRange|blank|notBlank
   type?: string;
   
   // 当filterType=text|number时文本值或数字值
   filter: string | number | null;
   // 当filterType=text|number 时，且是一个范围时，第二个值
   filterTo?: string | number | null;
   
   // 当filterType=date时，第一个日期值
   dateFrom: string | null;
   // 当filterType=date时，且是一个范围时，第二个值
   dateTo: string | null;
   
   // 当 filterType=set时 下拉值，可能是文本的（比如项目、姓名），
   // 也可能是数字的（比如状态、类型）
   values?: string[] | number[];
}
