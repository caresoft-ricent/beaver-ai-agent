"""AG-UI Protocol implementation — lightweight SSE event encoder

Implements the Agent-User Interaction Protocol event types.
See: https://docs.ag-ui.com/concepts/events
"""
import json
import uuid
import time
from enum import Enum
from typing import Optional, Any


class EventType(str, Enum):
    RUN_STARTED = "RUN_STARTED"
    RUN_FINISHED = "RUN_FINISHED"
    RUN_ERROR = "RUN_ERROR"
    STEP_STARTED = "STEP_STARTED"
    STEP_FINISHED = "STEP_FINISHED"
    TEXT_MESSAGE_START = "TEXT_MESSAGE_START"
    TEXT_MESSAGE_CONTENT = "TEXT_MESSAGE_CONTENT"
    TEXT_MESSAGE_END = "TEXT_MESSAGE_END"
    TOOL_CALL_START = "TOOL_CALL_START"
    TOOL_CALL_ARGS = "TOOL_CALL_ARGS"
    TOOL_CALL_END = "TOOL_CALL_END"
    TOOL_CALL_RESULT = "TOOL_CALL_RESULT"
    MESSAGES_SNAPSHOT = "MESSAGES_SNAPSHOT"
    STATE_SNAPSHOT = "STATE_SNAPSHOT"
    CUSTOM = "CUSTOM"


def encode_event(event_type: EventType, data: dict) -> str:
    """Encode an AG-UI event as SSE text."""
    payload = {"type": event_type.value, "timestamp": int(time.time() * 1000), **data}
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def run_started(thread_id: str, run_id: str) -> str:
    return encode_event(EventType.RUN_STARTED, {
        "threadId": thread_id, "runId": run_id,
    })


def run_finished(thread_id: str, run_id: str, result: Any = None) -> str:
    d = {"threadId": thread_id, "runId": run_id}
    if result is not None:
        d["result"] = result
    return encode_event(EventType.RUN_FINISHED, d)


def run_error(message: str, code: Optional[str] = None) -> str:
    d: dict = {"message": message}
    if code:
        d["code"] = code
    return encode_event(EventType.RUN_ERROR, d)


def step_started(step_name: str) -> str:
    return encode_event(EventType.STEP_STARTED, {"stepName": step_name})


def step_finished(step_name: str) -> str:
    return encode_event(EventType.STEP_FINISHED, {"stepName": step_name})


def text_message_start(message_id: str, role: str = "assistant") -> str:
    return encode_event(EventType.TEXT_MESSAGE_START, {
        "messageId": message_id, "role": role,
    })


def text_message_content(message_id: str, delta: str) -> str:
    return encode_event(EventType.TEXT_MESSAGE_CONTENT, {
        "messageId": message_id, "delta": delta,
    })


def text_message_end(message_id: str) -> str:
    return encode_event(EventType.TEXT_MESSAGE_END, {"messageId": message_id})


def tool_call_start(tool_call_id: str, tool_call_name: str,
                    parent_message_id: Optional[str] = None) -> str:
    d: dict = {"toolCallId": tool_call_id, "toolCallName": tool_call_name}
    if parent_message_id:
        d["parentMessageId"] = parent_message_id
    return encode_event(EventType.TOOL_CALL_START, d)


def tool_call_args(tool_call_id: str, delta: str) -> str:
    return encode_event(EventType.TOOL_CALL_ARGS, {
        "toolCallId": tool_call_id, "delta": delta,
    })


def tool_call_end(tool_call_id: str) -> str:
    return encode_event(EventType.TOOL_CALL_END, {"toolCallId": tool_call_id})


def tool_call_result(tool_call_id: str, content: str,
                     message_id: Optional[str] = None) -> str:
    d: dict = {"toolCallId": tool_call_id, "content": content}
    if message_id:
        d["messageId"] = message_id
    return encode_event(EventType.TOOL_CALL_RESULT, d)


def messages_snapshot(messages: list[dict]) -> str:
    return encode_event(EventType.MESSAGES_SNAPSHOT, {"messages": messages})


def custom_event(name: str, value: Any) -> str:
    return encode_event(EventType.CUSTOM, {"name": name, "value": value})


def new_id() -> str:
    return uuid.uuid4().hex[:16]
