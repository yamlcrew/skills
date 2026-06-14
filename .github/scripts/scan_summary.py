#!/usr/bin/env python3
"""Render a Markdown summary from a Snyk Agent Scan ``--json`` report.

Usage: scan_summary.py <report.json>

Writes Markdown to stdout. Report-only: it never exits non-zero, regardless of
findings, so it cannot fail CI.
"""
import json
import sys


def main() -> None:
    path = sys.argv[1] if len(sys.argv) > 1 else "agent-scan-report.json"
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"## Snyk Agent Scan\n\nWARNING: could not read `{path}`: {exc}")
        return

    lines = ["## Snyk Agent Scan — `skills/`", ""]

    # Results are grouped under a client key (e.g. "skills"); each block holds
    # the scanned servers (skills) and a flat `issues` list.
    for block in data.values():
        if not isinstance(block, dict):
            continue
        servers = block.get("servers") or []
        issues = block.get("issues") or []
        names = [s.get("name", "?") for s in servers]

        scanned = ", ".join(f"`{n}`" for n in names) or "_none_"
        lines.append(f"**Scanned {len(servers)} skill(s):** {scanned}")
        if block.get("error"):
            lines.append(f"- scan error: `{block['error']}`")

        if not issues:
            lines += ["", "**No issues found.**"]
        else:
            lines += [
                "",
                f"### {len(issues)} issue(s)",
                "",
                "| Severity | Code | Title | Where |",
                "|---|---|---|---|",
            ]
            for it in issues:
                if not isinstance(it, dict):
                    lines.append(f"|  |  | {it} |  |")
                    continue
                sev = it.get("severity") or it.get("level") or ""
                code = it.get("code") or it.get("id") or it.get("rule") or ""
                title = it.get("title") or it.get("message") or it.get("description") or ""
                where = it.get("path") or it.get("file") or it.get("location") or ""
                row = f"| {sev} | {code} | {title} | {where} |"
                lines.append(row.replace("\n", " "))
        lines.append("")

    lines.append(
        "_Report-only — this scan never fails CI. Full data in the "
        "`agent-scan-report.json` artifact._"
    )
    print("\n".join(lines))


if __name__ == "__main__":
    main()
