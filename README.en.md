# Sport Reference — open data

Dataset of an evidence-based reference on sports supplements and training:
**549 PubMed publications**, **103 supplement reviews** with
A/B/C evidence levels and doses per goal, weekly training volumes by muscle group,
**25 exercises**, **37 food groups**, **160 foods**
with calories and macronutrients per 100 g, **62 foods** with glycemic index,
**164 recipes**, supplement comparisons, myth reviews and health sections.

<!-- counts: references=549 supplements=103 exercises=25 foods=37 foods-nutrition=160 gi-table=62 recipes=164 comparisons=16 myths=25 health=10 symptoms-items=24 symptoms-groups=7 -->

Website: <https://sportreference.online/> · Data page: <https://sportreference.online/data/> · Repository: <https://github.com/execrat1on/sport-reference-data>

## Why this exists

Every claim on the website is backed by a publication. Source metadata was not typed
by hand: titles, authors, journals, years and DOIs come from PubMed E-utilities, and a
separate script re-checks the database against PubMed and fails when a record is
missing or does not match. This repository is the result of that work in a
machine-readable form.

## What is inside

| File | Contents |
|---|---|
| `data/references.json` | 549 publications: title, authors, journal, year, DOI, PMID, source type and evidence level |
| `data/supplements.json` | 103 supplements: mechanism, dose per goal, confirmed effects, cautions, interactions, forms, special populations, references |
| `data/training.json` | Weekly volume per muscle group for five goals: frequency, load, reps, reps in reserve, cardio, periodisation, principles |
| `data/exercises.json` | 25 exercises by muscle group: technique cue and video link |
| `data/foods.json` | 37 food groups: which group a food belongs to and what to watch for |
| `data/foods-nutrition.json` | 160 foods: calories, protein, fat, carbs, sugars, fibre and saturated fat per 100 g, with the food code in the source table |
| `data/gi-table.json` | 62 foods: glycemic index with measurement error and the original English name for cross-checking |
| `data/recipes.json` | 164 recipes: ingredients, steps, time and the nutritional value of one serving |
| `data/comparisons.json` | 16 supplement pairs for comparison |
| `data/myths.json` | 25 popular claims with a myth/true verdict and research references |
| `data/health.json` | 10 health sections: what to watch for and which check-ups to discuss with a doctor |
| `data/symptoms.json` | 7 symptom groups (24 entries) with a note on when to call emergency services |
| `data/references.csv`, `data/references.bib`, `data/references.ris` | The same 549 publications as a table, BibTeX and RIS |
| `data/supplements.csv` | 103 supplements as a table |
| `data/manifest.json` | File list: dataset version, release date, record counts and a checksum for every file |

Field descriptions in plain Russian — [SCHEMA.md](SCHEMA.md).

There is deliberately no section on sports pharmacology, PCT or HRT. On the website it
is reference material behind an age confirmation; it is not published as a separate file.

## Data from third-party sources

Some numbers come from official composition tables rather than from the website's own
research. We credit the source and keep a code or an original name on every entry so a
value can be verified:

- **Food composition per 100 g** (`foods-nutrition.json`, and the nutritional values in
  `recipes.json`): ANSES, Table de composition nutritionnelle **Ciqual 2025**,
  <https://ciqual.anses.fr/>. Licence **Etalab 2.0** — open, attribution required. The
  `sourceId` field is the food code in the Ciqual table.
- **Glycemic index** (`gi-table.json`): Atkinson FS, Foster-Powell K, Brand-Miller JC.
  International Tables of Glycemic Index and Glycemic Load Values: 2008. Diabetes Care.
  Open access in PubMed Central, <https://pmc.ncbi.nlm.nih.gov/articles/PMC2584181/>.
  The `nameEn` field is the original English name for cross-checking.

For 50 of 160 foods some values are empty: the source table does not
provide them. This is not an export gap — the list of missing fields is stored in the
file itself, in the `missing` field, and we do not fill it with estimates.

## Integrity check

`data/manifest.json` stores the dataset version, the release date and a SHA-256 checksum
for every file. A downloaded file can be verified against the manifest; a checksum
mismatch means the file was changed or downloaded incompletely.

The check runs automatically on every repository update
(`.github/workflows/validate-dataset.yml`) and verifies that files parse, required
fields are present, the numbers in the README match the files and the checksums match
the manifest. Locally: `node tools/validate-dataset.mjs`.

## How to cite

The data is released under **[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)**:
use it freely, including commercially, provided you give attribution. Data taken from
third-party tables (Ciqual, glycemic index) additionally requires crediting their own
sources listed above.

Suggested attribution:

> Data: Sport Reference — evidence-based reference on supplements and training,
> https://sportreference.online/, CC BY 4.0.

## What this data does not mean

This is not medical advice and not a guide to use. The A/B/C level describes the
strength of evidence for a specific claim, not the benefit for an individual. Doses are
given for adults and do not replace a doctor's advice. Where no research for a goal was
found, the file says so honestly instead of a number — see <https://sportreference.online/evidence/gaps/>.

## Updates

Files are exported from the main project with `node scripts/export-dataset.mjs`.
Publication metadata is refreshed by the PubMed verification script; it is never edited
by hand.
