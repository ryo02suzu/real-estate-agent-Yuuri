"""LLM を呼ばず、指定外モデル・記録欠落・情報漏えいを検査する。"""

import contextlib
import copy
import io
import json
import tempfile
import unittest
from pathlib import Path

from verify_claude_models import AuditError, audit_messages, main


OPUS = "claude-opus-5-5"
FABLE = "claude-fable-5-1"


def success(model=OPUS):
    return [
        {"type": "system", "subtype": "init", "model": model},
        {"type": "assistant", "message": {"model": model, "content": []}},
        {"type": "result", "subtype": "success", "is_error": False, "modelUsage": {model: {}}},
    ]


class ModelAuditTest(unittest.TestCase):
    def test_allowed_models(self):
        for model in [OPUS, FABLE]:
            with self.subTest(model=model):
                self.assertEqual(audit_messages(success(model))["models"], [model])

    def test_allowed_fallback(self):
        messages = success()
        messages[1]["message"]["model"] = FABLE
        messages[-1]["modelUsage"][FABLE] = {}
        self.assertEqual(audit_messages(messages)["models"], sorted([OPUS, FABLE]))

    def test_background_haiku_fails_even_with_zero_tokens(self):
        messages = success()
        messages[-1]["modelUsage"]["claude-haiku-5-5"] = {"inputTokens": 0}
        with self.assertRaisesRegex(AuditError, "claude-haiku-5-5"):
            audit_messages(messages)

    def test_forbidden_init_or_assistant_fails(self):
        for index in [0, 1]:
            messages = success()
            target = messages[index] if index == 0 else messages[index]["message"]
            target["model"] = "claude-sonnet-5"
            with self.subTest(index=index), self.assertRaises(AuditError):
                audit_messages(messages)

    def test_different_version_fails(self):
        with self.assertRaises(AuditError):
            audit_messages(success("claude-opus-5-6"))

    def test_missing_usage_fails(self):
        for usage in [None, {}, []]:
            messages = success()
            messages[-1]["modelUsage"] = usage
            with self.subTest(usage=usage), self.assertRaises(AuditError):
                audit_messages(messages)

    def test_incomplete_execution_fails(self):
        for messages in [success()[:-1], success()[1:], [], {}]:
            with self.subTest(messages=messages), self.assertRaises(AuditError):
                audit_messages(messages)

    def test_error_result_fails(self):
        messages = success()
        messages[-1]["is_error"] = True
        with self.assertRaises(AuditError):
            audit_messages(messages)

    def test_tool_counts_do_not_parse_tool_payloads(self):
        messages = success()
        messages[1]["message"]["content"] = [
            {"type": "tool_use", "name": "Workflow", "input": {"model": "claude-haiku-5-5"}},
            {"type": "tool_use", "name": "Agent"},
            {"type": "text", "text": "claude-sonnet-5"},
        ]
        result = audit_messages(messages)
        self.assertEqual((result["workflow_tool_calls"], result["agent_tool_calls"]), (1, 1))
        self.assertEqual(result["models"], [OPUS])

    def test_malformed_schema_fails(self):
        cases = [success() + [None]]
        for field, value in [("model", None), ("content", "invalid")]:
            messages = success()
            messages[1]["message"][field] = value
            cases.append(messages)
        messages = success()
        messages[-1]["modelUsage"][OPUS] = []
        cases.append(messages)
        for messages in cases:
            with self.subTest(messages=messages), self.assertRaises(AuditError):
                audit_messages(messages)

    def run_cli(self, contents):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "execution.json"
            path.write_text(contents, encoding="utf-8")
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                code = main([str(path)])
            return code, output.getvalue()

    def test_raw_transcript_and_invalid_model_are_not_printed(self):
        secret = "PRIVATE_TEST_MARKER\n::error::untrusted"
        messages = success()
        messages[1]["message"]["content"] = [{"type": "text", "text": secret}]
        cases = [copy.deepcopy(messages)]
        messages[-1]["modelUsage"][secret] = {}
        cases.append(messages)
        for messages in cases:
            code, output = self.run_cli(json.dumps(messages))
            self.assertNotIn(secret, output)
            self.assertEqual(code, 0 if len(messages[-1]["modelUsage"]) == 1 else 1)

    def test_unreadable_or_invalid_json_fails_without_contents(self):
        for args in [[], [""], ["/nonexistent/PRIVATE_TEST_MARKER"]]:
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main(args), 1)
            self.assertNotIn("PRIVATE_TEST_MARKER", output.getvalue())
        code, output = self.run_cli("{PRIVATE_TEST_MARKER")
        self.assertEqual(code, 1)
        self.assertNotIn("PRIVATE_TEST_MARKER", output)


if __name__ == "__main__":
    unittest.main()
