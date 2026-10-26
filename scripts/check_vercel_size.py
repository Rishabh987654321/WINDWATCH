"""Measure unzipped size of runtime dependencies in requirements.txt."""

import os
import shutil
import subprocess
import sys


def get_dir_size_mb(path: str) -> float:
    total_bytes = 0
    for root, dirs, files in os.walk(path):
        for f in files:
            fp = os.path.join(root, f)
            try:
                total_bytes += os.path.getsize(fp)
            except OSError:
                pass
    return total_bytes / (1024 * 1024)


def main() -> None:
    temp_dir = os.path.abspath("temp_vercel_install")
    if os.path.exists(temp_dir):
        shutil.rmtree(temp_dir, ignore_errors=True)

    os.makedirs(temp_dir, exist_ok=True)
    reqs_path = os.path.abspath("requirements.txt")

    print(f"Installing runtime requirements into temporary directory: {temp_dir}...")
    cmd = [
        sys.executable,
        "-m",
        "pip",
        "install",
        "-r",
        reqs_path,
        "-t",
        temp_dir,
        "--no-compile",
    ]
    subprocess.run(cmd, check=True)

    size_mb = get_dir_size_mb(temp_dir)
    print("\n" + "=" * 50)
    print(f"UNZIPPED RUNTIME DEPENDENCY SIZE: {size_mb:.2f} MB")
    print(f"VERCEL SERVERLESS LIMIT:         250.00 MB")
    margin_mb = 250.0 - size_mb
    print(f"HEADROOM REMAINING:             {margin_mb:.2f} MB")
    print("=" * 50)

    # Clean up
    print("Cleaning up temporary directory...")
    shutil.rmtree(temp_dir, ignore_errors=True)
    print("Done.")


if __name__ == "__main__":
    main()
