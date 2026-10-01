"""Deep-merges a JSON fragment ({"es": {...}, "en": {...}, "pt": {...}}) into messages/<locale>.json."""
import json
import pathlib
import sys


def merge(dst, src):
    for key, value in src.items():
        if isinstance(value, dict) and isinstance(dst.get(key), dict):
            merge(dst[key], value)
        else:
            dst[key] = value


fragment = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
for locale, data in fragment.items():
    path = pathlib.Path(f"messages/{locale}.json")
    current = json.loads(path.read_text(encoding="utf-8"))
    merge(current, data)
    path.write_text(json.dumps(current, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("merged", ", ".join(fragment.keys()))
