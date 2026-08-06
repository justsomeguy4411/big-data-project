# UrbanCart — Ecommerce Data Engineering & Analytics

A full-scope data cleaning, reconciliation, and analytics project for UrbanCart,
built from a SQLite database, a legacy customer export, and a supplier product
catalog. All numbers in this project are computed directly from the raw data —
see [Scope note](#scope-note) below.

## Quick start

```bash
cd urbancart
pip install pandas numpy rapidfuzz --break-system-packages

# Run the full pipeline (regenerates everything in outputs/ and cleaned_data/)
python3 src/main.py

# Or run it as notebooks, stage by stage:
jupyter notebook notebooks/00_run_full_pipeline.ipynb
```

Source data is expected at:
```
/mnt/user-data/uploads/ecommerce.db
/mnt/user-data/uploads/legacy_customers_export_-_legacy_customers_export.csv
/mnt/user-data/uploads/product_catalog_2024_-_product_catalog_2024.csv
```
Update the path constants at the top of each script/notebook if your data lives elsewhere.

## Project structure

```
urbancart/
├── src/                          Python pipeline (run in this order via main.py)
│   ├── audit.py                  Data quality audit — 6 DB tables + 2 raw CSVs
│   ├── clean.py                  Cleaning & reconciliation of the legacy CSVs
│   ├── sql_analysis.py           Cohort retention + market basket analysis (SQL)
│   ├── rfm_cltv.py               RFM segmentation + CLTV modeling
│   ├── regression_elasticity.py  OLS regression, price elasticity, Monte Carlo
│   ├── recommend.py              Item-based collaborative filtering recommender
│   ├── forecast.py               Holt's linear smoothing + OLS trend forecasting
│   ├── main.py                   Orchestrator — runs all seven stages in order
│   ├── build_report.js           Generates outputs/UrbanCart_Analytics_Report.docx
│   └── build_deck.js             Generates outputs/UrbanCart_Summary_Deck.pptx
│
├── notebooks/                    Same pipeline as interactive Jupyter notebooks
│   ├── 00_run_full_pipeline.ipynb    Index — runs all stages, start here
│   ├── 01_data_quality_audit.ipynb
│   ├── 02_cleaning_and_reconciliation.ipynb
│   ├── 03_cohort_and_basket_analysis.ipynb
│   ├── 04_rfm_segmentation_and_cltv.ipynb
│   ├── 05_regression_elasticity_montecarlo.ipynb
│   ├── 06_recommendation_engine.ipynb
│   └── 07_revenue_forecasting.ipynb
│
├── cleaned_data/                 Cleaned & reconciled datasets (pipeline output)
│   ├── legacy_customers_cleaned.csv
│   ├── product_catalog_cleaned.csv
│   ├── catalog_vs_db_price_comparison.csv
│   ├── rfm_segments.csv
│   ├── cltv_predictions.csv
│   └── product_similar_items.csv
│
└── outputs/                      Analysis results + final deliverables
    ├── UrbanCart_Analytics_Report.docx   Full written report
    ├── UrbanCart_Summary_Deck.pptx       11-slide executive summary
    ├── audit_report.json
    ├── cleaning_report.json
    ├── sql_analysis_summary.json
    ├── cohort_retention_matrix.csv
    ├── market_basket_top_pairs.csv
    ├── category_affinity.csv
    ├── rfm_cltv_summary.json
    ├── rfm_segment_summary.csv
    ├── regression_elasticity_montecarlo.json
    ├── historical_monthly_revenue.csv
    ├── recommendation_engine_summary.json
    ├── forecast_summary.json
    └── revenue_forecast_next_6mo.csv
```

## Data sources

| File | Description |
|---|---|
| `ecommerce.db` | SQLite database — `customers`, `products`, `orders`, `order_items`, `reviews`, `web_sessions` (source of truth) |
| `legacy_customers_export.csv` | Legacy customer file: inconsistent name casing, 4 different date formats, blank/duplicate rows. Reconciled against `customers` by email. |
| `product_catalog_2024.csv` | Supplier-side product catalog with different column names/prices than the internal `products` table. Reconciled by SKU. |

The dataset covers **2,500 customers, 9,000 orders, 20,362 order line items, and 300 products** across **34 months** of completed-order history.

## Scope note

The project was also supplied with an *UrbanCart Master Specification* document
describing cloud/streaming infrastructure (Kafka, Snowflake, MLOps) and citing
specific "achieved" metrics that don't correspond to anything in this dataset
(a 2,500-row SQLite database + 2 CSVs). That document was treated as
aspirational narrative, not a source of numbers. The actual spec used
throughout this project is the README data dictionary supplied alongside it —
every figure here is computed independently from the raw data.

## Methodology notes

- **SQL**: cohort retention and market basket analysis are implemented as SQL self-joins / date arithmetic directly against SQLite (`sql_analysis.py`), not pandas groupbys.
- **Statistics**: OLS regression (normal equations), Holt's linear exponential smoothing, and cosine similarity are implemented from scratch with `numpy` — no `scikit-learn`/`statsmodels` black boxes.
- **Fuzzy matching**: near-duplicate legacy customer records (no reliable email key) are caught via `rapidfuzz` name similarity.
- **Honesty over polish**: where the data doesn't support a strong conclusion — price elasticity, market-basket lift, the regression's low R² — the report and deck say so plainly rather than dressing up noise as a finding.

## Key findings

- **Data quality**: 48 duplicate customer records, 186 duplicate order-item rows, 583 negative-quantity (return) lines, and 253 of 255 overlapping catalog SKUs (99%) have a price mismatch averaging $9.44/item versus the internal product table.
- **Customer value**: mean predicted CLTV is $1,916.85 (median $990.27); "Champions" is the highest-value RFM segment, "At Risk (High Value)" (210 customers, $2,734 avg CLTV) is the top reactivation priority.
- **Revenue outlook**: Monte Carlo simulation (10,000 runs) puts next-12-month revenue at a P10–P90 range of **$2.13M–$2.98M** (median $2.55M), against a historical monthly average of $212,712.
- **What the data doesn't support**: price elasticity, market-basket lift, and the age/recency terms in the spend regression all come back statistically indistinguishable from noise — flagged rather than overstated.

Full detail, tables, and charts are in `outputs/UrbanCart_Analytics_Report.docx` and `outputs/UrbanCart_Summary_Deck.pptx`.
