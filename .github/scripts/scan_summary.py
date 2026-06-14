#!/usr/bin/env python3
"""Aggregate one or more Snyk Agent Scan ``--json`` reports and set the exit code.

Usage: scan_summary.py <report1.json> [report2.json ...]

Writes a Markdown summary to stdout. Exit policy (decided 2026-06-14):

- **errors only fail**: only error-class findings fail CI — codes starting with
  ``E`` (analysis errors) or ``X`` (scan/runtime failures). Warnings (``W*``) are
  reported but never fail the build.
- **repeatable only**: the scanner is LLM-based and non-deterministic, so the same
  content yields different verdicts run-to-run. To absorb that, CI fails only on
  *confirmed* error findings — a ``(code, skill)`` pair seen in a majority of runs.
  Findings seen in a minority are reported as "flaky" and do not fail CI.
- Exit ``1`` if any confirmed error finding exists (or no report could be read);
  exit ``0`` otherwise — warnings alone keep the build green.
"""
import json
import sys
from collections import defaultdict


def _severity(issue: dict) -> str:
    """Mirror the scanner's own mapping (printer.get_severity)."""
    code = issue.get("code") or ""
    if code.startswith("X"):
        return "error"
    extra = issue.get("extra_data") or {}
    sev = extra.get("severity")
    if sev:
        return str(sev)
    if code.startswith("W"):
        return "medium"
    if code.startswith("E"):
        return "high"
    return "unknown"


def _is_error(code: str) -> bool:
    """Error-class codes fail CI: ``E*`` (analysis errors) and ``X*`` (scan failures)."""
    return code.startswith(("E", "X"))


def _skill_name(issue: dict, servers: list) -> str:
    """Resolve the skill an issue references via ``reference = (server_idx, entity_idx)``."""
    ref = issue.get("reference")
    if isinstance(ref, (list, tuple)) and ref and isinstance(ref[0], int):
        idx = ref[0]
        if 0 <= idx < len(servers) and isinstance(servers[idx], dict):
            return servers[idx].get("name") or "?"
    return "(global)"


def _parse_run(path: str):
    """Return ``(skill_names, findings)`` for one report, or ``None`` if unreadable."""
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, json.JSONDecodeError):
        return None

    skills: list[str] = []
    findings: list[dict] = []
    for block in data.values():
        if not isinstance(block, dict):
            continue
        servers = block.get("servers") or []
        for s in servers:
            if isinstance(s, dict) and s.get("name"):
                skills.append(s["name"])
        for issue in block.get("issues") or []:
            if not isinstance(issue, dict):
                continue
            findings.append(
                {
                    "code": issue.get("code") or "?",
                    "message": (issue.get("message") or "").replace("\n", " ").strip(),
                    "severity": _severity(issue),
                    "skill": _skill_name(issue, servers),
                }
            )
    return skills, findings


def main() -> None:
    paths = sys.argv[1:]
    if not paths:
        print("## Snyk Agent Scan\n\nWARNING: no report files given.")
        sys.exit(2)

    runs = [_parse_run(p) for p in paths]
    valid = [r for r in runs if r is not None]
    total_runs = len(valid)

    lines = ["## Snyk Agent Scan — `skills/`", ""]

    if total_runs == 0:
        lines.append("**ERROR: no scan report could be read — treating as failure.**")
        print("\n".join(lines))
        sys.exit(1)

    threshold = total_runs // 2 + 1  # majority of successful runs

    skill_names = sorted({n for names, _ in valid for n in names})
    scanned = ", ".join(f"`{n}`" for n in skill_names) or "_none_"
    lines.append(f"**Scanned {len(skill_names)} skill(s) across {total_runs} run(s):** {scanned}")
    if total_runs != len(paths):
        lines.append(
            f"- WARNING: {len(paths) - total_runs} of {len(paths)} scan run(s) "
            "produced no readable report."
        )

    # Count the distinct runs each (code, skill) finding appears in.
    seen_runs: dict = defaultdict(set)
    meta: dict = {}
    for run_idx, (_, findings) in enumerate(valid):
        for f in findings:
            key = (f["code"], f["skill"])
            seen_runs[key].add(run_idx)
            meta[key] = f

    if not seen_runs:
        lines += ["", "**No findings.**", ""]
        lines.append(
            "_errors (E*/X*) fail CI on a majority of runs · warnings (W*) are reported only._"
        )
        print("\n".join(lines))
        sys.exit(0)

    rows = []
    failing = 0  # confirmed error-class findings — these fail CI
    for key, run_set in sorted(seen_runs.items()):
        f = meta[key]
        count = len(run_set)
        is_confirmed = count >= threshold
        is_error = _is_error(f["code"])
        if is_error and is_confirmed:
            failing += 1
            verdict = "🔴 error — fails CI"
        elif is_error:
            verdict = "🟡 error (flaky)"
        else:
            verdict = "⚪ warning"
        rows.append(
            f"| {f['code']} | {f['severity']} | `{f['skill']}` | "
            f"{f['message']} | {count}/{total_runs} | {verdict} |"
        )

    lines += [
        "",
        f"### {len(seen_runs)} finding(s) — {failing} failing, {len(seen_runs) - failing} reported only",
        "",
        "| Code | Severity | Skill | Message | Seen | Verdict |",
        "|---|---|---|---|---|---|",
        *rows,
        "",
        f"_errors (E*/X*) confirmed in ≥{threshold}/{total_runs} runs (majority) → fail CI · "
        "warnings (W*) and flaky one-offs are reported only._",
    ]
    print("\n".join(lines))
    sys.exit(1 if failing else 0)


if __name__ == "__main__":
    main()
