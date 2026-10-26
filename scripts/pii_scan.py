"""Scan tracked and staged files for PII and absolute paths."""

import os
import re
import subprocess
import sys

PATTERNS = [
    (r"risha", "Username / name match 'risha'"),
    (r"rishabh", "Name match 'rishabh'"),
    (r"perceptiv[i|t]ti", "Org match 'perceptiviti'"),
    (r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+", "Email address pattern"),
    (r"C:\\\\Users", "Windows user path 'C:\\Users'"),
    (r"c:/users", "Windows user path 'c:/users'"),
    (r"/Users/", "Unix user path '/Users/'"),
    (r"Downloads[\\/]", "Downloads folder path"),
]

# Exclude this script itself and git directory
EXCLUDED_FILES = {
    "scripts/pii_scan.py",
    "docs/phase4.md",
    "docs/phase5a.md",
    "docs/phase5b.md",
    "docs/phase6.md",
}

def get_files_to_scan() -> list[str]:
    # git ls-files (tracked)
    res_tracked = subprocess.run(["git", "ls-files"], capture_output=True, text=True, check=True)
    tracked = [line.strip() for line in res_tracked.stdout.splitlines() if line.strip()]

    # git ls-files --others --exclude-standard (untracked, not ignored)
    res_others = subprocess.run(["git", "ls-files", "--others", "--exclude-standard"], capture_output=True, text=True, check=True)
    others = [line.strip() for line in res_others.stdout.splitlines() if line.strip()]

    all_files = sorted(set(tracked + others))
    return [f for f in all_files if f not in EXCLUDED_FILES and not f.endswith(".png") and not f.endswith(".parquet")]

def scan_file(filepath: str) -> list[tuple[int, str, str, str]]:
    hits = []
    if not os.path.exists(filepath):
        return hits
    try:
        with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
            for idx, line in enumerate(f, 1):
                line_lower = line.lower()
                for pattern, desc in PATTERNS:
                    # Ignore harmless fake/noreply emails
                    if "noreply" in line_lower or "example.com" in line_lower or "git config" in line_lower:
                        continue
                    if re.search(pattern, line, re.IGNORECASE):
                        hits.append((idx, desc, pattern, line.strip()))
    except Exception as e:
        print(f"Error reading {filepath}: {e}", file=sys.stderr)
    return hits

def main() -> None:
    files = get_files_to_scan()
    print(f"Scanning {len(files)} files for PII and local path leaks...\n")
    total_hits = 0
    all_hits = {}

    for f in files:
        file_hits = scan_file(f)
        if file_hits:
            all_hits[f] = file_hits
            total_hits += len(file_hits)
            print(f"File: {f} ({len(file_hits)} hits)")
            for line_no, desc, pat, snippet in file_hits[:5]:
                print(f"  Line {line_no:4d} [{desc}]: {snippet[:120]}")
            if len(file_hits) > 5:
                print(f"  ... and {len(file_hits) - 5} more hits in this file")

    print("-" * 60)
    print(f"Total PII / Path Leaks Found: {total_hits} in {len(all_hits)} files.")

if __name__ == "__main__":
    main()
