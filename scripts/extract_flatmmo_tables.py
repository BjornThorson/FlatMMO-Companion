"""Extract public HTML table cells as evidence, preserving source and row order."""
from html.parser import HTMLParser
import datetime as dt
import json
from pathlib import Path
import urllib.request

BASE = "https://flatmmo.com"
PAGES = {
    "production": "/db/makeitems.php",
    "mining": "/data/mining.html",
    "woodcutting": "/data/woodcutting.html",
}
LIMIT = 2_000_000

class TableParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables = []
        self.table = None
        self.row = None
        self.cell = None
        self.depth = 0
        self.in_caption = False
        self.caption = []
    def handle_starttag(self, tag, attrs):
        if tag == "table":
            if self.table is None:
                self.table = {"caption": "", "rows": []}
                self.depth = 1
            else:
                self.depth += 1
        elif self.table is not None:
            if tag == "caption":
                self.in_caption = True
            elif tag == "tr" and self.row is None:
                self.row = []
            elif tag in ("td", "th") and self.row is not None and self.cell is None:
                self.cell = {"kind": tag, "text": [], "links": [], "images": [], "attributes": {k: v[:300] for k, v in attrs if k in ("title", "data-id", "data-item-id", "data-tooltip", "aria-label") and v}}
            elif tag == "a" and self.cell is not None:
                href = dict(attrs).get("href")
                if href:
                    self.cell["links"].append(href[:300])
            elif tag == "img" and self.cell is not None:
                a = dict(attrs)
                self.cell["images"].append({k: a[k][:400] for k in ("src", "data-src", "alt", "title", "data-id", "data-item-id", "data-tooltip", "aria-label") if a.get(k)})
            elif tag == "br" and self.cell is not None:
                self.cell["text"].append(" ")
    def handle_data(self, data):
        if self.cell is not None:
            self.cell["text"].append(data)
        if self.in_caption:
            self.caption.append(data)
    def handle_endtag(self, tag):
        if self.table is None:
            return
        if tag in ("td", "th") and self.cell is not None:
            text = " ".join(" ".join(self.cell["text"]).split())[:1000]
            self.row.append({"kind": self.cell["kind"], "text": text, "links": self.cell["links"][:10], "images": self.cell["images"][:20], "attributes": self.cell["attributes"]})
            self.cell = None
        elif tag == "tr" and self.row is not None:
            if self.row:
                self.table["rows"].append(self.row)
            self.row = None
        elif tag == "caption":
            self.table["caption"] = " ".join(" ".join(self.caption).split())[:200]
            self.caption = []
            self.in_caption = False
        elif tag == "table":
            self.depth -= 1
            if self.depth == 0:
                self.tables.append(self.table)
                self.table = None

def extract():
    result = {"generated_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
              "method": "Read-only HTML table extraction; text, links, image metadata and cell attributes are unverified source evidence, not normalized game facts",
              "pages": {}}
    for name, path in PAGES.items():
        entry = {"url": BASE + path}
        try:
            req = urllib.request.Request(BASE + path, headers={"User-Agent": "FlatMMO-Companion-Endpoint-Audit/1.2"})
            with urllib.request.urlopen(req, timeout=25) as response:
                raw = response.read(LIMIT + 1)
                entry["http_status"] = response.status
                entry["content_type"] = response.headers.get("Content-Type", "")
            entry["truncated"] = len(raw) > LIMIT
            if entry["truncated"]:
                entry["error"] = "Response exceeded size limit; not parsed"
            else:
                parser = TableParser()
                parser.feed(raw.decode("utf-8", "replace"))
                entry["table_count"] = len(parser.tables)
                entry["row_count"] = sum(len(t["rows"]) for t in parser.tables)
                entry["tables"] = parser.tables
        except Exception as error:
            entry["error"] = type(error).__name__ + ": " + str(error)[:200]
        result["pages"][name] = entry
        print(f"HTML tables {name}: {entry.get('table_count', 'error')} tables, {entry.get('row_count', 0)} rows")
    out = Path("endpoint-audit")
    out.mkdir(exist_ok=True)
    (out / "html_tables_v1.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return result

if __name__ == "__main__":
    extract()
