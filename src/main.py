"""
main.py - Runs the full UrbanCart analytics pipeline end-to-end.

Usage: python3 src/main.py

Stages:
  1. audit.py               - data quality audit of DB tables + raw CSVs
  2. clean.py                - clean & reconcile legacy CSVs against the DB
  3. sql_analysis.py         - cohort retention + market basket analysis (SQL)
  4. rfm_cltv.py              - RFM segmentation + CLTV modeling
  5. regression_elasticity.py - OLS regression, price elasticity, Monte Carlo
  6. recommend.py            - item-based collaborative filtering recommender
  7. forecast.py             - Holt's linear + OLS trend revenue forecasting

All outputs land in outputs/ (analysis results) and cleaned_data/ (cleaned CSVs).
"""
import subprocess
import sys

STAGES = [
    "audit.py",
    "clean.py",
    "sql_analysis.py",
    "rfm_cltv.py",
    "regression_elasticity.py",
    "recommend.py",
    "forecast.py",
]

if __name__ == "__main__":
    for stage in STAGES:
        print(f"\n{'=' * 70}\nRunning {stage}\n{'=' * 70}")
        result = subprocess.run([sys.executable, f"src/{stage}"], cwd="/home/claude/urbancart")
        if result.returncode != 0:
            print(f"Stage {stage} failed, stopping pipeline.")
            sys.exit(1)
    print("\nPipeline complete. See outputs/ and cleaned_data/.")
