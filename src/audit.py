"""
01 - Load raw data and run a full data quality audit.
Outputs: outputs/audit_report.json, outputs/audit_summary.md
"""
import sqlite3
import pandas as pd
import numpy as np
import json
import os

DB = "/mnt/user-data/uploads/ecommerce.db"
LEGACY_CSV = "/mnt/user-data/uploads/legacy_customers_export_-_legacy_customers_export.csv"
CATALOG_CSV = "/mnt/user-data/uploads/product_catalog_2024_-_product_catalog_2024.csv"
OUT = "/home/claude/urbancart/outputs"


def load_all():
    con = sqlite3.connect(DB)
    tables = {}
    for t in ["customers", "products", "orders", "order_items", "reviews", "web_sessions"]:
        tables[t] = pd.read_sql(f"SELECT * FROM {t}", con)
    con.close()
    tables["legacy_customers"] = pd.read_csv(LEGACY_CSV)
    tables["catalog"] = pd.read_csv(CATALOG_CSV)
    return tables


def audit_table(name, df):
    report = {"table": name, "n_rows": len(df), "n_cols": len(df.columns)}
    missing = df.isna().sum()
    missing = missing[missing > 0]
    report["missing_by_col"] = {k: int(v) for k, v in missing.items()}
    report["missing_pct_by_col"] = {k: round(float(v) / len(df) * 100, 2) for k, v in missing.items()}
    report["n_exact_dup_rows"] = int(df.duplicated().sum())
    return report


def main():
    os.makedirs(OUT, exist_ok=True)
    tables = load_all()
    audit = {}

    # --- core tables ---
    for name in ["customers", "products", "orders", "order_items", "reviews", "web_sessions"]:
        audit[name] = audit_table(name, tables[name])

    customers = tables["customers"]
    products = tables["products"]
    orders = tables["orders"]
    order_items = tables["order_items"]
    reviews = tables["reviews"]

    # customers: duplicate profiles (by normalized email) and fuzzy overlaps
    cust_email_norm = customers["email"].str.strip().str.lower()
    dup_email_count = int(cust_email_norm.duplicated().sum())
    audit["customers"]["exact_duplicate_emails"] = dup_email_count
    audit["customers"]["age_out_of_range"] = int(((customers["age"] < 10) | (customers["age"] > 100)).sum())
    audit["customers"]["gender_value_counts"] = customers["gender"].value_counts(dropna=False).to_dict()

    # products: outliers in unit_price via IQR
    q1, q3 = products["unit_price"].quantile([0.25, 0.75])
    iqr = q3 - q1
    lo, hi = q1 - 3 * iqr, q3 + 3 * iqr
    outliers = products[(products["unit_price"] < lo) | (products["unit_price"] > hi)]
    audit["products"]["unit_price_iqr_bounds"] = [round(float(lo), 2), round(float(hi), 2)]
    audit["products"]["unit_price_outlier_count"] = int(len(outliers))
    audit["products"]["unit_price_outlier_skus"] = outliers["product_id"].tolist()
    audit["products"]["cost_gt_price_count"] = int((products["cost"] > products["unit_price"]).sum())

    # orders: status breakdown, zero/negative issues
    audit["orders"]["status_counts"] = orders["status"].value_counts(dropna=False).to_dict()
    audit["orders"]["payment_method_counts"] = orders["payment_method"].value_counts(dropna=False).to_dict()

    # order_items: zero-price rows, negative qty (returns), exact dup rows
    audit["order_items"]["zero_price_rows"] = int((order_items["unit_price"] <= 0).sum())
    audit["order_items"]["negative_qty_rows"] = int((order_items["quantity"] < 0).sum())
    dup_oi = order_items.duplicated(subset=[c for c in order_items.columns if c != "order_item_id"]).sum()
    audit["order_items"]["exact_dup_rows_excl_pk"] = int(dup_oi)
    audit["order_items"]["discount_out_of_range"] = int(((order_items["discount"] < 0) | (order_items["discount"] > 1)).sum())

    # reviews: out-of-range ratings, missing text
    audit["reviews"]["rating_out_of_range"] = int(((reviews["rating"] < 1) | (reviews["rating"] > 5)).sum())
    audit["reviews"]["rating_distribution"] = reviews["rating"].value_counts(dropna=False).sort_index().to_dict()

    # referential integrity checks
    orphan_orders = orders[~orders["customer_id"].isin(customers["customer_id"])]
    orphan_oi_orders = order_items[~order_items["order_id"].isin(orders["order_id"])]
    orphan_oi_products = order_items[~order_items["product_id"].isin(products["product_id"])]
    orphan_reviews_cust = reviews[~reviews["customer_id"].isin(customers["customer_id"])]
    orphan_reviews_prod = reviews[~reviews["product_id"].isin(products["product_id"])]
    audit["referential_integrity"] = {
        "orphan_orders_bad_customer": int(len(orphan_orders)),
        "orphan_order_items_bad_order": int(len(orphan_oi_orders)),
        "orphan_order_items_bad_product": int(len(orphan_oi_products)),
        "orphan_reviews_bad_customer": int(len(orphan_reviews_cust)),
        "orphan_reviews_bad_product": int(len(orphan_reviews_prod)),
    }

    # legacy_customers.csv audit
    legacy = tables["legacy_customers"]
    legacy.columns = [c.strip() for c in legacy.columns]
    audit["legacy_customers_raw"] = {
        "n_rows": len(legacy),
        "columns": legacy.columns.tolist(),
        "missing_email": int(legacy["EMAIL_ADDR"].isna().sum() | (legacy["EMAIL_ADDR"].astype(str).str.strip() == "").sum()),
        "blank_rows": int(legacy.isna().all(axis=1).sum()),
    }
    # junk/test account detection (heuristic, computed not assumed)
    email_lower = legacy["EMAIL_ADDR"].astype(str).str.lower()
    test_mask = email_lower.str.contains("test", na=False) | legacy["Customer Name"].astype(str).str.lower().str.contains("test", na=False)
    audit["legacy_customers_raw"]["likely_test_rows"] = int(test_mask.sum())

    # catalog.csv audit
    catalog = tables["catalog"]
    audit["catalog_raw"] = {
        "n_rows": len(catalog),
        "columns": catalog.columns.tolist(),
        "skus_not_in_products": int((~catalog["SKU"].isin(products["product_id"])).sum()),
    }

    with open(f"{OUT}/audit_report.json", "w") as f:
        json.dump(audit, f, indent=2, default=str)

    print(json.dumps(audit, indent=2, default=str))


if __name__ == "__main__":
    main()
