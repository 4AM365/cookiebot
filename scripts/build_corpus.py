"""Build the RAG corpus from notes/ -> data/chunks.jsonl + data/manifest.json.

Reads every committed Markdown note, splits it into ~target-token chunks with
overlap, attributes each chunk to a printed page (PDF page markers) and a
cookie-relevance flag, and writes a JSONL an embedder/retriever can consume.
"""
from __future__ import annotations

import json
import re

from common import (
    BOOKS, DATA_DIR, NOTES_DIR, chunk_id, chunk_text, estimate_tokens, parse_note,
)

TARGET_TOKENS = 800
OVERLAP_TOKENS = 100

PAGE_MARKER = re.compile(r"\{\{page:(\d+)\}\}")

# Cookie/pastry relevance — chapter/heading keywords (English + Italian).
# The cookie "why" lives in sugar chemistry, fats, eggs, leavening, flour/gluten,
# and the browning reactions (Maillard + caramelization) — not in proofing or
# crumb the way bread does, so the keyword set is re-cut toward those.
COOKIE_KEYWORDS = [
    # doughs & batters
    "cookie", "biscuit", "dough", "batter", "pastry", "shortbread", "short",
    "frolla", "crumb", "tender", "spread", "chew", "crisp", "snap",
    # sugars
    "sugar", "sucrose", "glucose", "fructose", "invert", "syrup", "molasses",
    "honey", "caramel", "caramelization", "caramelisation", "hygroscop",
    # browning & flavor
    "maillard", "brown", "browning", "toast", "flavor", "flavour",
    # fats
    "butter", "fat", "shortening", "oil", "cream", "creaming", "plasticit",
    "emulsif", "lecithin",
    # flour / structure
    "flour", "gluten", "glutenin", "gliadin", "starch", "wheat", "protein",
    # eggs
    "egg", "yolk", "albumen", "white", "foam", "meringue",
    # leavening & chemistry
    "leaven", "leavening", "soda", "bicarbonate", "baking powder", "alkali",
    "acid", "ph ",
    # method & heat
    "bake", "baking", "oven", "knead", "mix", "rest", "chill",
    # cookie families & add-ins
    "chocolate", "cocoa", "almond", "nut", "vanilla", "spice", "cinnamon",
    "biscotti", "amaretti", "macaron", "confection",
    # Italian
    "biscotto", "biscotti", "frolla", "frollini", "zucchero", "saccarosio",
    "burro", "grasso", "farina", "glutine", "amido", "uovo", "tuorlo", "albume",
    "lievit", "bicarbonato", "cottura", "forno", "impasto", "cioccolato",
    "cacao", "mandorla", "caramello", "meringa", "croccante", "friabile",
    "dolce", "dolci", "frutto", "frutta",
]


def is_cookie_relevant(book, chapter: str, heading: str) -> bool:
    if book.relevance == "core":          # whole book is cookie/pastry science
        return True
    hay = f"{chapter} {heading}".lower()
    return any(k in hay for k in COOKIE_KEYWORDS)


def citation(book, chapter: str, page: int | None) -> str:
    parts = [book.author.split("&")[0].strip(), f"{book.title} ({book.year})"]
    if chapter and chapter != book.title:
        parts.append(chapter)
    if page:
        parts.append(f"p.{page}")
    return ", ".join(parts)


def split_pages(text: str):
    """Yield (page_no_or_None, clean_text) segments, in order, by page marker."""
    pos = 0
    cur_page = None
    out = []
    for m in PAGE_MARKER.finditer(text):
        seg = text[pos:m.start()]
        if seg.strip():
            out.append((cur_page, seg))
        cur_page = int(m.group(1))
        pos = m.end()
    tail = text[pos:]
    if tail.strip():
        out.append((cur_page, tail))
    return out or [(None, text)]


def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    books_by_slug = {b.slug: b for b in BOOKS}

    chunks = []
    per_book: dict[str, dict] = {}

    note_paths = sorted(NOTES_DIR.glob("*/*.md"))
    for path in note_paths:
        meta, body = parse_note(path)
        slug = meta.get("book_slug") or path.parent.name
        book = books_by_slug.get(slug)
        if book is None:
            continue
        chapter = meta.get("chapter", "")
        heading = meta.get("heading", "")
        breadcrumb = meta.get("breadcrumb", [])
        order = int(meta.get("order", 0) or 0)
        cookie = is_cookie_relevant(book, chapter, heading)

        # Page-aware chunking: chunk within each page segment so a chunk maps to
        # exactly one printed page; fall back to note-level page for EPUBs.
        note_page = meta.get("source_page")
        seg_index = 0
        for seg_page, seg_text in split_pages(body):
            page = seg_page if seg_page is not None else note_page
            for piece in chunk_text(seg_text, TARGET_TOKENS, OVERLAP_TOKENS):
                piece = PAGE_MARKER.sub("", piece).strip()
                if estimate_tokens(piece) < 30:   # drop trivial fragments
                    continue
                rec = {
                    "id": chunk_id(slug, order, seg_index, piece),
                    "book_slug": slug,
                    "book": book.title,
                    "author": book.author,
                    "year": book.year,
                    "lang": book.lang,
                    "relevance": book.relevance,
                    "cookie_relevant": cookie,
                    "chapter": chapter,
                    "heading": heading,
                    "breadcrumb": breadcrumb,
                    "page": page,
                    "order": order,
                    "chunk_index": seg_index,
                    "tokens_est": estimate_tokens(piece),
                    "citation": citation(book, chapter, page),
                    "source_note": str(path.relative_to(NOTES_DIR.parent)).replace("\\", "/"),
                    "text": piece,
                }
                chunks.append(rec)
                seg_index += 1

        b = per_book.setdefault(slug, {
            "slug": slug, "title": book.title, "author": book.author,
            "year": book.year, "lang": book.lang, "relevance": book.relevance,
            "notes": 0, "chunks": 0, "tokens_est": 0, "cookie_chunks": 0,
        })
        b["notes"] += 1

    for rec in chunks:
        b = per_book[rec["book_slug"]]
        b["chunks"] += 1
        b["tokens_est"] += rec["tokens_est"]
        b["cookie_chunks"] += int(rec["cookie_relevant"])

    # Write JSONL (one chunk per line).
    chunks_path = DATA_DIR / "chunks.jsonl"
    with chunks_path.open("w", encoding="utf-8") as f:
        for rec in chunks:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")

    manifest = {
        "corpus": "cookiebot reference notes",
        "description": "RAG chunks distilled from purchased baking-science "
                       "references. Source books are git-ignored; these derived "
                       "notes are the committable work product.",
        "chunking": {"target_tokens": TARGET_TOKENS,
                     "overlap_tokens": OVERLAP_TOKENS,
                     "token_estimate": "chars/4 (no tokenizer dependency)"},
        "totals": {
            "books": len(per_book),
            "notes": sum(b["notes"] for b in per_book.values()),
            "chunks": len(chunks),
            "tokens_est": sum(b["tokens_est"] for b in per_book.values()),
            "cookie_relevant_chunks": sum(b["cookie_chunks"] for b in per_book.values()),
        },
        "books": sorted(per_book.values(), key=lambda b: b["slug"]),
    }
    manifest_path = DATA_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2),
                             encoding="utf-8")

    print(f"Wrote {len(chunks)} chunks -> {chunks_path}")
    print(f"Wrote manifest -> {manifest_path}")
    for b in manifest["books"]:
        print(f"  {b['slug']}: {b['notes']} notes, {b['chunks']} chunks, "
              f"{b['cookie_chunks']} cookie-relevant, ~{b['tokens_est']:,} tokens")


if __name__ == "__main__":
    main()
