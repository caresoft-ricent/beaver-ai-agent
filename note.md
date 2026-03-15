本体: issue_close (问题关闭)
  └─ 操作: close_issue (POST /api/issues/close)
      └─ 属性(is_input):
          ├─ issue_id     (问题ID, 必填)
          ├─ close_reason  (关闭原因, 必填)
          └─ source_type   (来源类型, 可选，默认值可配)

技能1: CLOSE_INSPECTION_ISSUE (工序验收问题关闭)
  └─ SkillTool → entity=issue_close, action=close_issue
  └─ match_keywords: ["工序验收", "问题关闭", "验收关闭"]
  └─ entity_extract_prompt: "抽取 issue_id 和 close_reason，source_type 固定为 inspection"

技能2: CLOSE_PATROL_ISSUE (日常巡检问题关闭)
  └─ SkillTool → entity=issue_close, action=close_issue  ← 同一个本体+操作
  └─ match_keywords: ["巡检", "巡查", "问题关闭"]
  └─ entity_extract_prompt: "抽取 issue_id 和 close_reason，source_type 固定为 patrol"

  