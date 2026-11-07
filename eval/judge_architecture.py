#!/usr/bin/env python3
"""Semantic architecture judge for existing structural-eval artifacts.

This does not generate architecture output. It reads the latest GLM architecture
JSONL, sends each case+output to a separate judge model, and writes per-case
scores.

DeepEval's BaseMetric is used as the metric contract. We call measure() directly
instead of DeepEval's batch evaluator so the artifact remains one JSONL record
per case and judge failures are explicit.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from deepeval.metrics import BaseMetric
from deepeval.test_case import LLMTestCase
from dotenv import load_dotenv
from openai import OpenAI

ROOT = Path(__file__).resolve().parent.parent
EVAL_DIR = ROOT / "eval"
ARTIFACT_DIR = EVAL_DIR / "artifacts" / "structural"
JUDGE_DIR = EVAL_DIR / "artifacts" / "judge"
DATASET_DIR = EVAL_DIR / "datasets" / "sda-v1"
JUDGE_PROMPT = DATASET_DIR / "judge-prompts" / "architecture-judge-v1.md"
DEFAULT_JUDGE_MODEL = "anthropic/claude-haiku-5.5"

SCORE_KEYS = [
    "traceability",
    "hld_boundaries",
    "lld_responsibility",
    "dsa_correctness",
    "simplicity",
    "pedagogical_quality",
    "learning_quality",
    "interview_usefulness",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--judge-model", default=os.getenv("JUDGE_MODEL", DEFAULT_JUDGE_MODEL))
    parser.add_argument("--limit", type=int, default=0, help="0 = all records")
    parser.add_argument("--case", default=None)
    return parser.parse_args()


def load_cases() -> dict[str, dict[str, Any]]:
    cases = {}
    for line in (DATASET_DIR / "cases.jsonl").read_text(encoding="utf-8").splitlines():
        if line.strip():
            item = json.loads(line)
            cases[item["id"]] = item
    return cases


def latest_glm_architecture_artifact() -> Path:
    candidates = []
    for path in ARTIFACT_DIR.glob("*.jsonl"):
        try:
            first = json.loads(path.read_text(encoding="utf-8").splitlines()[0])
        except (IndexError, json.JSONDecodeError):
            continue
        if first.get("model") == "z-ai/glm-5.3-flash" and first.get("stage_mode") == "architecture":
            candidates.append(path)
    if not candidates:
        raise SystemExit("No GLM architecture artifact found")
    return max(candidates, key=lambda path: path.stat().st_mtime)


def confirmed_with_ids(case: dict[str, Any]) -> dict[str, Any]:
    requirements = case["confirmed_requirements"]
    return {
        "functional": [
            {
                "id": item["id"],
                "kind": "functional",
                "text": item["text"],
                "priority": item["priority"],
            }
            for item in requirements["functional"]
        ],
        "nonFunctional": [
            {
                "id": item["id"],
                "kind": "nonfunctional",
                "text": item["text"],
                "priority": item["priority"],
                "category": item["category"],
                "target": item.get("target", ""),
            }
            for item in requirements["nonFunctional"]
        ],
        "assumptions": [
            {"id": f"asm_{index}", "text": text}
            for index, text in enumerate(requirements["assumptions"], start=1)
        ],
        "clarifications": [
            {"id": f"q_{index}", "question": question, "answer": ""}
            for index, question in enumerate(requirements["clarifications"], start=1)
        ],
    }


def extract_json(text: str) -> dict[str, Any]:
    text = text.strip()
    fenced = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1)
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("Judge response contains no JSON object")
    return json.loads(text[start : end + 1])


class ArchitectureJudgeMetric(BaseMetric):
    """One judge call returns the full seven-dimension rubric."""

    def __init__(self, client: OpenAI, model: str, prompt: str):
        self.client = client
        self.model = model
        self.prompt = prompt
        self.threshold = 0.8  # mean 4/5
        self.score = None
        self.reason = None
        self.success = None
        self.input_tokens = 0
        self.output_tokens = 0
        self.raw = None

    def _judge(self, case_payload: dict[str, Any], output_payload: dict[str, Any]) -> dict[str, Any]:
        user = (
            "Evaluate this architecture case and output JSON only.\n\n"
            f"CASE:\n{json.dumps(case_payload, ensure_ascii=False)}\n\n"
            f"OUTPUT:\n{json.dumps(output_payload, ensure_ascii=False)}"
        )
        kwargs = {
            "model": self.model,
            "temperature": 0,
            "max_tokens": 8000,
            "messages": [
                {"role": "system", "content": self.prompt},
                {"role": "user", "content": user},
            ],
        }
        try:
            response = self.client.chat.completions.create(
                **kwargs,
                response_format={"type": "json_object"},
            )
        except Exception:
            # Some routed providers reject response_format; the prompt still
            # requires JSON, so retry once without it.
            response = self.client.chat.completions.create(**kwargs)

        content = response.choices[0].message.content or ""
        if not content.strip():
            # Claude Haiku can return an empty JSON-mode completion on this
            # route even though it answers the same prompt without the flag.
            response = self.client.chat.completions.create(**kwargs)
            content = response.choices[0].message.content or ""
        if not content.strip():
            raise ValueError(
                "judge returned empty content; "
                f"finish={response.choices[0].finish_reason!r} usage={response.usage!r}"
            )

        parsed = extract_json(content)
        usage = getattr(response, "usage", None)
        if usage is not None:
            self.input_tokens += getattr(usage, "prompt_tokens", 0) or 0
            self.output_tokens += getattr(usage, "completion_tokens", 0) or 0
        self.raw = content
        return parsed

    def measure(self, test_case: LLMTestCase, *args: Any, **kwargs: Any) -> float:
        case_payload = json.loads(test_case.input)
        output_payload = json.loads(test_case.actual_output or "{}")
        parsed = self._judge(case_payload, output_payload)
        scores = parsed.get("scores") or {}
        if parsed.get("status") == "hard_fail" or not all(
            isinstance(scores.get(key), (int, float)) for key in SCORE_KEYS
        ):
            self.score = 0.0
            self.reason = json.dumps(parsed, ensure_ascii=False)
            self.success = False
            return self.score
        mean = sum(float(scores[key]) for key in SCORE_KEYS) / len(SCORE_KEYS)
        self.score = mean / 5.0
        self.reason = json.dumps(parsed, ensure_ascii=False)
        self.success = mean >= 4.0 and not parsed.get("hard_flags")
        return self.score

    async def a_measure(self, test_case: LLMTestCase, *args: Any, **kwargs: Any) -> float:
        return self.measure(test_case, *args, **kwargs)


def main() -> None:
    load_dotenv(ROOT / "backend-server" / ".env")
    args = parse_args()
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise SystemExit("OPENROUTER_API_KEY is not set")

    cases = load_cases()
    artifact = latest_glm_architecture_artifact()
    records = [
        json.loads(line)
        for line in artifact.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    records = [record for record in records if record.get("structural", {}).get("valid")]
    if args.case:
        records = [record for record in records if record.get("case_id") == args.case]
    if args.limit:
        records = records[: args.limit]
    if not records:
        raise SystemExit("No valid GLM architecture records found")

    prompt = JUDGE_PROMPT.read_text(encoding="utf-8")
    client = OpenAI(
        api_key=api_key,
        base_url="https://openrouter.ai/api/v1",
        default_headers={"X-Title": "SDA Architecture Judge"},
    )
    metric = ArchitectureJudgeMetric(client, args.judge_model, prompt)

    JUDGE_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%SZ")
    out_path = JUDGE_DIR / f"architecture-glm-{stamp}.jsonl"
    results = []

    for index, record in enumerate(records, start=1):
        case = cases.get(record["case_id"])
        if case is None:
            raise SystemExit(f"Case missing from dataset: {record['case_id']}")
        case_payload = {
            "case_id": case["id"],
            "domain": case["domain"],
            "complexity": case["complexity"],
            "idea": case["idea"],
            "confirmed_requirements": confirmed_with_ids(case),
            "must_have_behaviors": case["must_have_behaviors"],
            "acceptable_alternatives": case["acceptable_alternatives"],
            "anti_patterns": case["anti_patterns"],
            "reference_notes": case.get("reference_notes"),
        }
        output_payload = {
            "structural_result": record.get("structural"),
            "hld": record.get("raw", {}).get("hld"),
            "lld": record.get("raw", {}).get("lld_dsa", {}).get("lld"),
            "dsa": record.get("raw", {}).get("lld_dsa", {}).get("dsa"),
            "learningSteps": record.get("raw", {}).get("lld_dsa", {}).get("learningSteps"),
        }
        test_case = LLMTestCase(
            input=json.dumps(case_payload, ensure_ascii=False),
            actual_output=json.dumps(output_payload, ensure_ascii=False),
            metadata={
                "case_id": record["case_id"],
                "repeat_index": record.get("repeat_index"),
                "artifact": artifact.name,
            },
        )
        started = time.perf_counter()
        metric.input_tokens = 0
        metric.output_tokens = 0
        metric.raw = None
        try:
            metric.measure(test_case)
            parsed = json.loads(metric.reason or "{}")
            result = {
                "case_id": record["case_id"],
                "repeat_index": record.get("repeat_index"),
                "judge_model": args.judge_model,
                "status": parsed.get("status", "scored"),
                "scores": parsed.get("scores"),
                "mean": round((metric.score or 0.0) * 5, 3),
                "success": metric.success,
                "hard_flags": parsed.get("hard_flags", []),
                "rationale": parsed.get("rationale"),
                "evidence": parsed.get("evidence", []),
                "input_tokens": metric.input_tokens,
                "output_tokens": metric.output_tokens,
                "duration_ms": round((time.perf_counter() - started) * 1000),
            }
        except Exception as error:  # keep the run auditable instead of aborting
            result = {
                "case_id": record["case_id"],
                "repeat_index": record.get("repeat_index"),
                "judge_model": args.judge_model,
                "status": "judge_error",
                "scores": None,
                "mean": None,
                "success": False,
                "error": f"{type(error).__name__}: {error}",
                "raw_response": (metric.raw or "")[:4000],
                "duration_ms": round((time.perf_counter() - started) * 1000),
            }
        results.append(result)
        with out_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(result, ensure_ascii=False) + "\n")
        print(f"[{index}/{len(records)}] {record['case_id']} repeat={record.get('repeat_index')} -> {result['status']} mean={result['mean']}")

    scored = [r for r in results if r["status"] == "scored" and r["mean"] is not None]
    dimension_means = {
        key: round(sum(r["scores"][key] for r in scored) / len(scored), 3)
        if scored
        else None
        for key in SCORE_KEYS
    }
    summary = {
        "artifact": artifact.name,
        "judge_model": args.judge_model,
        "records": len(results),
        "scored": len(scored),
        "successful": sum(1 for r in results if r["success"]),
        "hard_flags": sum(1 for r in results if r.get("hard_flags")),
        "mean": round(sum(r["mean"] for r in scored) / len(scored), 3) if scored else None,
        "dimension_means": dimension_means,
        "input_tokens": sum(r.get("input_tokens", 0) for r in results),
        "output_tokens": sum(r.get("output_tokens", 0) for r in results),
        "output": str(out_path),
    }
    summary_path = out_path.with_suffix(".summary.json")
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
