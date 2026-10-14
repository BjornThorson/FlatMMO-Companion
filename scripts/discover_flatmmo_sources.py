"""Bounded, read-only discovery of same-site public FlatMMO data references."""
import html.parser
import re
import urllib.parse
import urllib.request

ROOT = "https://flatmmo.com"
PAGES = ["/db/makeitems.php", "/data/mining.html", "/data/woodcutting.html"]
MAX_BYTES = 500_000
URL_PATTERN = re.compile(r"""(?:(?:https?://flatmmo\.com)?/[\w./?=&%-]+\.(?:php|json|js|html)(?:\?[\w=&%.-]+)?|[\w./-]+\.(?:php|json)(?:\?[\w=&%.-]+)?)""", re.I)
KEYWORDS = ("item", "drop", "monster", "craft", "recipe", "api", "db/", "data/", "price", "equip", "stat")

class Links(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.refs = []
    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if tag in ("script", "a", "link", "form"):
            v = d.get("src") or d.get("href") or d.get("action")
            if v:
                self.refs.append({"tag": tag, "url": v})

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent":"FlatMMO-Companion-Endpoint-Audit/1.1"})
    with urllib.request.urlopen(req, timeout=20) as r:
        data = r.read(MAX_BYTES + 1)
        return {"status": r.status, "bytes": min(len(data), MAX_BYTES), "truncated":len(data)>MAX_BYTES}, data[:MAX_BYTES].decode("utf-8", "replace")

def discover():
    out = {"purpose":"Public, same-host reference discovery. No credentials, no endpoint guessing or recursive crawling.", "pages":{}, "javascript":{}}
    scripts = []
    for path in PAGES:
        try:
            meta, body = get(ROOT + path)
            parser = Links()
            parser.feed(body)
            links = []
            for ref in parser.refs:
                absolute = urllib.parse.urljoin(ROOT + path, ref["url"])
                u = urllib.parse.urlparse(absolute)
                if u.hostname == "flatmmo.com" and u.scheme == "https":
                    links.append({"tag":ref["tag"],"path":u.path, "query":u.query[:120]})
                    if ref["tag"] == "script" and u.path.endswith(".js") and absolute not in scripts:
                        scripts.append(absolute)
            matches = sorted(set(m.group(0) for m in URL_PATTERN.finditer(body) if any(k in m.group(0).lower() for k in KEYWORDS)))
            out["pages"][path] = {**meta, "references": links[:100], "data_url_candidates":matches[:100], "reference_count":len(links)}
        except Exception as e:
            out["pages"][path] = {"error":type(e).__name__ + ": " + str(e)[:160]}
    for url in scripts[:12]:
        path = urllib.parse.urlparse(url).path
        try:
            meta, body = get(url)
            matches = sorted(set(m.group(0) for m in URL_PATTERN.finditer(body) if any(k in m.group(0).lower() for k in KEYWORDS)))
            out["javascript"][path] = {**meta,"data_url_candidates":matches[:100]}
        except Exception as e:
            out["javascript"][path] = {"error":type(e).__name__ + ": " + str(e)[:160]}
    return out
