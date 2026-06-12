# cookiebot — reference corpus

RAG-ready notes distilled from three baking-science references, for grounding a
cookie assistant in *why* a formula behaves the way it does (spread, chew vs.
crisp, sugar chemistry, fat state, leavening, browning) rather than just
recipes.

This is a fork of [foccaciabot](https://github.com/4AM365/foccaciabot) — same
three academic references, re-cut for cookies. The interactive build sheet lives
in `cookie-build-sheet.jsx`; the science behind every dial is drawn from the
corpus below.

## What's tracked vs. ignored

| Path | In git? | What it is |
|------|:-------:|------------|
| `*.epub`, `*.pdf` | ❌ ignored | The **purchased source books** (binaries). Never committed. |
| `notes/` | ✅ committed | Cleaned, per-section Markdown extracted from the books (human-reviewable). |
| `data/chunks.jsonl` | ✅ committed | The embeddable RAG corpus — one chunk per line, with metadata. |
| `data/manifest.json` | ✅ committed | Corpus stats + per-book index. |
| `scripts/` | ✅ committed | The reproducible extraction + chunking pipeline. |
| `cookie-build-sheet.jsx` | ✅ committed | The interactive calculator (React, single file). |

The source books are licensed/purchased copies kept locally; only the derived
notes are version-controlled.

## Sources

Same three references as foccaciabot, **re-weighted for cookies** — pastry
science moves to the centre, bread to the edge:

| Slug | Book | Lang | Role |
|------|------|:----:|------|
| `bressanini-scienza-della-pasticceria` | Bressanini, *La scienza della pasticceria* (Gribaudo, 2014) | it | **core** — the academic pastry reference: pasta frolla, biscotti, sugars, leavening, fats. |
| `mcgee-on-food-and-cooking` | McGee, *On Food and Cooking* (1984) | en | **high** — Sugars, Maillard/caramel browning, butter & fats, eggs, cookies/cakes/batters. |
| `cauvain-technology-of-breadmaking` | Cauvain & Young, *Technology of Breadmaking* (Springer, 1998) | en | **general** — flour/gluten/leavening/fat fundamentals that transfer to cookie dough. |

Current corpus: **748 notes → 1,737 chunks (~1.0M tokens)**, of which **1,040**
are flagged `cookie_relevant`. Regenerate the exact numbers with the pipeline
below.

> The notes themselves are book extractions and so are identical to foccaciabot's
> (same purchased books). What changed for cookies is the **relevance weighting**
> in `scripts/common.py` and the **`cookie_relevant` keyword filter** in
> `scripts/build_corpus.py` — so retrieval now favours sugar, fat, egg,
> leavening and browning science over proofing and crumb.

## Pipeline

```bash
pip install -r requirements.txt          # beautifulsoup4, lxml, PyMuPDF

python scripts/extract_epub.py           # EPUBs  -> notes/<slug>/*.md
python scripts/extract_pdf.py            # PDF    -> notes/<slug>/*.md
python scripts/build_corpus.py           # notes/ -> data/chunks.jsonl + manifest.json
```

`notes/` is the source of truth; `data/` is fully derived from it. Re-running is
idempotent for a given set of source books. If you only adjusted the relevance
filter (the common cookie tweak), just re-run `build_corpus.py` — it reads the
already-extracted `notes/` and needs neither the source books nor PyMuPDF.

### How extraction works

- **EPUB** (`extract_epub.py`): reads the spine + NCX table of contents directly
  (ebooklib chokes on these files' broken font manifests). Sectioning is
  TOC-driven via anchor IDs, because every page repeats the book title as an
  `<h1>`. Handles both nested TOCs (Bressanini) and flat TOCs where chapter
  titles are listed before a separate flat list of sub-sections (McGee), mapping
  sub-sections to chapters by spine position. Decodes cp1252-mislabeled-as-UTF-8
  bytes so Italian/French accents survive.
- **PDF** (`extract_pdf.py`): the book has no bookmarks, so chapters are detected
  from numbered title lines (`"3 Functional ingredients"`) validated by
  monotonic numbering. Running headers/footers (page numbers, the ALL-CAPS
  running title) are stripped; printed page numbers are captured as inline
  markers so each chunk gets a precise `page` for citation. Front matter
  (title/copyright/contents OCR noise) is skipped.

### Chunk schema (`data/chunks.jsonl`)

Each line is one JSON object:

```jsonc
{
  "id": "bressanini-...:0012:03:ab12cd34",  // stable: book:order:index:hash
  "book_slug": "bressanini-scienza-della-pasticceria",
  "book": "La scienza della pasticceria",
  "author": "Dario Bressanini",
  "year": 2014,
  "lang": "it",
  "relevance": "core",                    // book-level
  "cookie_relevant": true,                // chunk-level cookie filter
  "chapter": "...",
  "heading": "...",
  "breadcrumb": ["...", "..."],
  "page": 88,                             // printed page (PDF) or null (EPUB)
  "citation": "Dario Bressanini, La scienza della pasticceria (2014), ..., p.88",
  "source_note": "notes/bressanini-.../0013-....md",
  "tokens_est": 587,
  "text": "Lo zucchero non è solo un dolcificante..."
}
```

Chunks target ~800 tokens with ~100 tokens of overlap, packed on paragraph
boundaries (oversized paragraphs are sentence-split). Token counts are estimated
as `chars/4` to avoid a tokenizer dependency.

### Consuming the corpus

`chunks.jsonl` is embedder-agnostic. Typical next step: embed each `text`,
store with the metadata, and at query time filter on `cookie_relevant` (or weight
by `relevance`) before vector search. The `citation` field is ready to surface
in answers.

## The build sheet

`cookie-build-sheet.jsx` is a single self-contained React component — drive the
*qualities* (spread, chew vs. crisp vs. cakey, brown-sugar share, butter state,
leavening, browning) and the *style*; the recipe and method regenerate live.
Baker's percentages are all relative to total flour = 100%. Run it locally with
Vite (`npm install && npm run dev`), or see it embedded on the website at
`/kitchen/cookie-calculator`.
