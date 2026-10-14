#!/usr/bin/env python3
"""Convert official production-table evidence into traceable recipe records.

Names are display labels inferred from image filenames; registry matching uses
exact filename stems only, and never fabricates identifiers.
"""
import argparse
import collections
import datetime as dt
import json
import pathlib
import re
from urllib.parse import urlparse, unquote

QUANTITIES = re.compile(r"(\d+)\s*x\b", re.I)
OUTPUT = re.compile(r"^(.*?)\s+x\s+(\d+)$", re.I)

def stem(image):
    src = image.get("src", "")
    path = urlparse(src).path
    if "/items/" not in path or not path.lower().endswith(".png"):
        return None
    return unquote(path.rsplit("/", 1)[-1][:-4])

def build(source, registry):
    page = source["pages"]["production"]
    assert page.get("http_status") == 200 and not page.get("truncated")
    tables = page["tables"]
    assert len(tables) == 1
    rows = tables[0]["rows"]
    assert [c["text"] for c in rows[0]] == ["Item", "", "Skill", "Level", "Materials"]
    ids = {i["id"] for i in registry["items"]}
    recipes, problems = [], []
    for n, cells in enumerate(rows[1:], 2):
        issues = []
        if len(cells) != 5:
            problems.append({"source_row": n, "issues": ["unexpected_cell_count"]})
            continue
        label = cells[0]["text"]
        match = OUTPUT.fullmatch(label)
        if not match:
            issues.append("unparsed_output_quantity")
        output_id = stem(cells[1]["images"][0]) if len(cells[1]["images"]) == 1 else None
        if not output_id:
            issues.append("missing_output_image_identifier")
        elif output_id not in ids:
            issues.append("output_identifier_not_in_registry")
        skill_image = cells[2]["images"]
        skill = pathlib.PurePosixPath(urlparse(skill_image[0]["src"]).path).stem if len(skill_image) == 1 else None
        if not skill:
            issues.append("missing_skill_icon")
        try:
            level = int(cells[3]["text"])
        except ValueError:
            level = None
            issues.append("invalid_level")
        quantities = [int(x) for x in QUANTITIES.findall(cells[4]["text"])]
        ingredient_images = cells[4]["images"]
        if len(quantities) != len(ingredient_images):
            issues.append("ingredient_quantity_image_count_mismatch")
        ingredients = []
        for index, image in enumerate(ingredient_images):
            item_id = stem(image)
            if not item_id:
                issues.append("unrecognized_ingredient_image")
            elif item_id not in ids:
                issues.append("ingredient_identifier_not_in_registry")
            ingredients.append({"id_from_image": item_id, "quantity": quantities[index] if index < len(quantities) else None,
                                "registry_match": item_id in ids if item_id else False, "image_src": image.get("src")})
        recipes.append({"source_row": n, "output_label": match.group(1) if match else label,
                        "output_id_from_image": output_id,
                        "output_quantity": int(match.group(2)) if match else None,
                        "output_registry_match": output_id in ids if output_id else False,
                        "skill_icon": skill, "level": level, "ingredients": ingredients,
                        "validation_issues": sorted(set(issues))})
        if issues:
            problems.append({"source_row": n, "issues": sorted(set(issues))})
    stats = {"recipe_rows": len(recipes), "fully_validated_rows": sum(not r["validation_issues"] for r in recipes),
             "rows_with_issues": len(problems), "distinct_output_ids": len({r["output_id_from_image"] for r in recipes if r["output_id_from_image"]}),
             "distinct_ingredient_ids": len({i["id_from_image"] for r in recipes for i in r["ingredients"] if i["id_from_image"]}),
             "issue_counts": dict(collections.Counter(issue for r in recipes for issue in r["validation_issues"]))}
    return {"schema_version": 1, "generated_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
            "source": page["url"], "source_artifact_run": 38490333986,
            "method": "Image filename stems are candidate IDs; exact-match checked against official item registry. Display names and recipe interpretation remain source-derived, not independently verified.",
            "stats": stats, "recipes": recipes, "validation_problems": problems}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tables", required=True)
    ap.add_argument("--registry", default="flatmmo_knowledge/items_registry_v1.json")
    ap.add_argument("--output", default="flatmmo_knowledge/production_recipes_evidence_v1.json")
    a = ap.parse_args()
    result = build(json.loads(pathlib.Path(a.tables).read_text()), json.loads(pathlib.Path(a.registry).read_text()))
    target = pathlib.Path(a.output)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(result["stats"], indent=2))

if __name__ == "__main__":
    main()
