"""build_site.py - assemble the cloud deployment bundle.

The Sites deployment limit is 10 MiB, while web/vendor/ (MediaPipe wasm + the
pose model) is ~35 MB.  Those large files are uploaded once to R2 and served by
the Worker from /media/; everything else is copied here.

Run:  python tools/build_site.py
Then: deploy site/manifest.json with the Sites tool.
"""

from __future__ import annotations

import json
import os
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, "web")
SITE = os.path.join(ROOT, "site")
PUBLIC = os.path.join(SITE, "public")

INCLUDE_DIRS = ["js", "assets", "fonts"]
INCLUDE_FILES = ["index.html", "styles.css", "theme-andalus.css", "theme-dark.css"]
VENDOR_FILES = ["vision_bundle.mjs", "mqtt.esm.js"]


def reset_dir(path: str) -> None:
    if os.path.isdir(path):
        shutil.rmtree(path)
    os.makedirs(path, exist_ok=True)


def copy_file(src: str, dst_root: str, rel: str) -> None:
    target = os.path.join(dst_root, rel)
    os.makedirs(os.path.dirname(target), exist_ok=True)
    shutil.copy2(src, target)


def main() -> int:
    reset_dir(PUBLIC)

    for rel in INCLUDE_FILES:
        src = os.path.join(WEB, rel)
        if not os.path.isfile(src):
            print(f"[x] missing {src}")
            return 1
        copy_file(src, PUBLIC, rel)

    for rel in INCLUDE_DIRS:
        src = os.path.join(WEB, rel)
        for base, _dirs, files in os.walk(src):
            for name in files:
                full = os.path.join(base, name)
                copy_file(full, PUBLIC, os.path.relpath(full, WEB))

    for name in VENDOR_FILES:
        copy_file(os.path.join(WEB, "vendor", name), PUBLIC, os.path.join("vendor", name))

    shutil.copy2(os.path.join(ROOT, "cloud", "worker.js"), os.path.join(SITE, "worker.js"))

    manifest = {
        "entrypoint": "worker.js",
        "compatibilityDate": "2026-10-21",
        "modules": [{"name": "worker.js", "type": "esm", "path": "./worker.js"}],
        "assetsDirectory": "./public",
    }
    with open(os.path.join(SITE, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2)

    total = 0
    largest = []
    for base, _dirs, files in os.walk(PUBLIC):
        for name in files:
            full = os.path.join(base, name)
            size = os.path.getsize(full)
            total += size
            largest.append((size, os.path.relpath(full, PUBLIC)))
    largest.sort(reverse=True)

    print(f"[OK] site/public: {len(largest)} files, {total / 1024 / 1024:.2f} MiB")
    for size, rel in largest[:6]:
        print(f"     {size / 1024:8.1f} KB  {rel}")
    print(f"[OK] worker: {os.path.getsize(os.path.join(SITE, 'worker.js')) / 1024:.1f} KB")
    if total > 10 * 1024 * 1024:
        print("[x] bundle exceeds the 10 MiB deployment limit")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
