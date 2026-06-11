#!/usr/bin/env python3
"""
plugins2skills.py — Sync skills from plugins/ to skills/ for skills.sh compatibility.

Source of truth:  plugins/<plugin-name>/skills/<skill-name>/SKILL.md
Generated output:  skills/<skill-name>/SKILL.md  (+ references/, templates/, scripts/)

Usage:
    python plugins2skills.py          # sync all
    python plugins2skills.py --dry-run  # preview without writing
"""

import argparse
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PLUGINS_DIR = ROOT / "plugins"
SKILLS_DIR = ROOT / "skills"


def discover_skills() -> list[tuple[str, Path]]:
    """Find all skills inside plugins/*/skills/*/SKILL.md"""
    skills = []
    if not PLUGINS_DIR.is_dir():
        return skills

    for plugin_dir in sorted(PLUGINS_DIR.iterdir()):
        if not plugin_dir.is_dir():
            continue
        plugin_skills = plugin_dir / "skills"
        if not plugin_skills.is_dir():
            continue
        for skill_dir in sorted(plugin_skills.iterdir()):
            skill_md = skill_dir / "SKILL.md"
            if skill_dir.is_dir() and skill_md.is_file():
                skills.append((skill_dir.name, skill_dir))

    return skills


def sync(skill_name: str, skill_src: Path, dry_run: bool = False) -> list[str]:
    """Copy skill directory to skills/<skill-name>/"""
    dest = SKILLS_DIR / skill_name
    actions = []

    # Collect all files in the skill directory
    for src_file in sorted(skill_src.rglob("*")):
        if not src_file.is_file():
            continue
        rel = src_file.relative_to(skill_src)
        dst_file = dest / rel
        actions.append((src_file, dst_file))

    if dry_run:
        for src, dst in actions:
            print(f"  would copy: {src.relative_to(ROOT)} -> {dst.relative_to(ROOT)}")
        return [str(dst) for _, dst in actions]

    # Remove stale output (skill that no longer exists in plugins/)
    if dest.is_dir():
        shutil.rmtree(dest)

    for src, dst in actions:
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        print(f"  copied: {src.relative_to(ROOT)} -> {dst.relative_to(ROOT)}")

    return [str(dst) for _, dst in actions]


def clean_orphans(known_skills: set[str], dry_run: bool = False) -> list[str]:
    """Remove skills/ directories that have no corresponding plugin source."""
    removed = []
    if not SKILLS_DIR.is_dir():
        return removed

    for existing in sorted(SKILLS_DIR.iterdir()):
        if existing.is_dir() and existing.name not in known_skills:
            if dry_run:
                print(f"  would remove: {existing.relative_to(ROOT)}/")
            else:
                shutil.rmtree(existing)
                print(f"  removed: {existing.relative_to(ROOT)}/")
            removed.append(existing.name)

    return removed


def main():
    parser = argparse.ArgumentParser(description="Sync plugins/*/skills/*/ to skills/")
    parser.add_argument("--dry-run", action="store_true", help="Preview changes without writing")
    args = parser.parse_args()

    print(f"Scanning {PLUGINS_DIR.relative_to(ROOT)}/ ...")
    skills = discover_skills()

    if not skills:
        print("No skills found in plugins/.")
        sys.exit(0)

    print(f"Found {len(skills)} skill(s):")
    known = set()
    for name, src in skills:
        print(f"\n  {name}  (from {src.parent.relative_to(ROOT)})")
        known.add(name)
        sync(name, src, dry_run=args.dry_run)

    print(f"\nCleaning orphaned skills/ directories ...")
    clean_orphans(known, dry_run=args.dry_run)

    print("\nDone.")


if __name__ == "__main__":
    main()
