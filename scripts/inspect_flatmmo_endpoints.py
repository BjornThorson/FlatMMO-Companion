#!/usr/bin/env python3
"""Read-only structural audit of known FlatMMO data sources."""
import datetime as dt
import json
import pathlib
import urllib.error
import urllib.request

BASE = "https://flatmmo.com"
SOURCES = {
    "items": "/api/db/items.php",
    "monsters": "/data/monsters.json",
    "production": "/db/makeitems.php",
    "mining": "/data/mining.html",
    "woodcutting": "/data/woodcutting.html",
    "prices": "/data/prices.php",
}
OUT = pathlib.Path("endpoint-audit")
OUT.mkdir(exist_ok=True)
MAX_BYTES = 2_000_000

def shape(value, depth=0):
    if depth >= 3:
        return {"type": type(value).__name__}
    if isinstance(value, dict):
        return {"type": "object", "count": len(value), "keys": list(value)[:40],
                "fields": {k: shape(v, depth + 1) for k, v in list(value.items())[:12]}}
    if isinstance(value, list):
        return {"type": "array", "count": len(value),
                "first_element": shape(value[0], depth + 1) if value else None}
    return {"type": type(value).__name__}

report = {"generated_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
          "purpose": "Structural inspection only; no authenticated access or raw response storage",
          "sources": {}}
for name, path in SOURCES.items():
    entry = {"url": BASE + path}
    try:
        request = urllib.request.Request(BASE + path, headers={
            "User-Agent": "FlatMMO-Companion-Endpoint-Audit/1.0",
            "Accept": "application/json, text/html, text/plain, */*",
        })
        with urllib.request.urlopen(request, timeout=20) as response:
            entry["http_status"] = response.status
            entry["final_url"] = response.url
            entry["content_type"] = response.headers.get("Content-Type", "")
            body = response.read(MAX_BYTES + 1)
            entry["truncated_at_limit"] = len(body) > MAX_BYTES
            entry["bytes_read"] = min(len(body), MAX_BYTES)
            if not entry["truncated_at_limit"]:
                try:
                    parsed = json.loads(body)
                    entry["format"] = "json"
                    entry["structure"] = shape(parsed)
                except (UnicodeError, json.JSONDecodeError):
                    entry["format"] = "html" if b"<html" in body[:4096].lower() or b"<!doctype html" in body[:4096].lower() else "text_or_other"
                    entry["structure"] = {"type": "document", "first_200_characters": body[:200].decode("utf-8", "replace")}
            else:
                entry["format"] = "oversized_response"
    except urllib.error.HTTPError as error:
        entry["http_status"] = error.code
        entry["error"] = "HTTP error"
    except Exception as error:
        entry["error"] = type(error).__name__ + ": " + str(error)[:250]
    report["sources"][name] = entry
    print(f"{name}: {entry.get('http_status', 'error')} {entry.get('format', entry.get('error', ''))}")
from discover_flatmmo_sources import discover
report["reference_discovery"] = discover()
print("Discovery: inspected", len(report["reference_discovery"]["pages"]), "pages and", len(report["reference_discovery"]["javascript"]), "JavaScript files")
(OUT / "endpoint_inventory_v1.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
