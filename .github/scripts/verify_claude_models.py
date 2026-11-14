#!/usr/bin/env python3
"""Claude Code Action の実使用モデルを検査する。会話内容は出力しない。"""

import json
import re
import sys
from pathlib import Path


ALLOWED_MODELS = frozenset({"claude-opus-5-5", "claude-fable-5-1"})


class AuditError(ValueError):
    """ログに安全に出せる固定の検査エラー。"""


def audit_messages(messages):
    # claude-code-action@v1 の execution_file は SDKMessage[] の JSON。
    if not isinstance(messages, list) or not messages:
        raise AuditError("実行記録が空、または対応していない形式です。")

    observed = set()
    init_count = 0
    result_count = 0
    workflow_calls = 0
    agent_calls = 0

    def record_model(model):
        if not isinstance(model, str) or not re.fullmatch(r"claude-[a-z0-9-]{1,80}", model):
            raise AuditError("モデル ID が欠落、または不正です。")
        observed.add(model)

    for message in messages:
        if not isinstance(message, dict):
            raise AuditError("実行記録に不正な項目があります。")
        kind = message.get("type")
        if kind == "system" and message.get("subtype") == "init":
            init_count += 1
            record_model(message.get("model"))
        elif kind == "assistant":
            payload = message.get("message")
            if not isinstance(payload, dict):
                raise AuditError("assistant の実行記録が不正です。")
            record_model(payload.get("model"))
            content = payload.get("content", [])
            if not isinstance(content, list):
                raise AuditError("assistant の実行記録が不正です。")
            for block in content:
                if isinstance(block, dict) and block.get("type") == "tool_use":
                    workflow_calls += block.get("name") == "Workflow"
                    agent_calls += block.get("name") == "Agent"
        elif kind == "result":
            result_count += 1
            if message.get("subtype") != "success" or message.get("is_error") is not False:
                raise AuditError("Claude の実行結果が成功ではありません。")
            usage = message.get("modelUsage")
            if not isinstance(usage, dict) or not usage:
                raise AuditError("modelUsage がなく、使用モデルを確認できません。")
            for model, details in usage.items():
                record_model(model)
                if not isinstance(details, dict):
                    raise AuditError("modelUsage の形式が不正です。")

    if init_count == 0 or result_count == 0:
        raise AuditError("初期化または終了の記録がなく、実行が完了したか確認できません。")
    forbidden = observed - ALLOWED_MODELS
    if forbidden:
        raise AuditError("指定外モデルを検出: " + ", ".join(sorted(forbidden)))
    return {
        "models": sorted(observed),
        "workflow_tool_calls": workflow_calls,
        "agent_tool_calls": agent_calls,
    }


def main(argv=None):
    args = sys.argv[1:] if argv is None else argv
    try:
        if len(args) != 1 or not args[0]:
            raise AuditError("execution_file がありません。使用モデルは未確認です。")
        try:
            messages = json.loads(Path(args[0]).read_text(encoding="utf-8"))
        except (OSError, UnicodeError, ValueError):
            # 例外文字列にはパスや会話断片が含まれ得るため出力しない。
            raise AuditError("execution_file を読み取れません。使用モデルは未確認です。") from None
        result = audit_messages(messages)
    except AuditError as error:
        print("::error::Claude モデル検査失敗: " + str(error))
        return 1

    print("Claude モデル検査成功: " + ", ".join(result["models"]))
    print("Workflow 呼び出し数: " + str(result["workflow_tool_calls"]))
    print("Agent 呼び出し数: " + str(result["agent_tool_calls"]))
    print("呼び出し数は担当の起動・完了や並列実行を証明しません。別途実行記録を確認してください。")
    print("effort は設定で max に固定。全リクエストの実効 effort はこの記録だけでは検証できません。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
