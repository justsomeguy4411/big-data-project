"""
02 - Clean legacy_customers_export.csv and product_catalog_2024.csv,
reconcile both against the ecommerce.db core tables.
Outputs cleaned files to cleaned_data/ and a reconciliation summary.
"""
import sqlite3
import pandas as pd
import numpy as np
import json
from rapidfuzz import fuzz

DB = "/mnt/user-data/uploads/ecommerce.db"
LEGACY_CSV = "/mnt/user-data/uploads/legacy_customers_export_-_legacy_customers_export.csv"
CATALOG_CSV = "/mnt/user-data/uploads/product_catalog_2024_-_product_catalog_2024.csv"
OUT_DATA = "/home/claude/urbancart/cleaned_data"
OUT = "/home/claude/urbancart/outputs"


def parse_messy_date(s):
    if pd.isna(s):
        return pd.NaT
    s = str(s).strip()
    for fmt in ("%Y-%m-%d", "%B %d, %Y", "%m/%d/%Y", "%d-%b-%Y"):
        try:
            return pd.to_datetime(s, format=fmt)
        except (ValueError, TypeError):
            continue
    return pd.to_datetime(s, errors="coerce")  # last resort


def clean_legacy_customers(customers_db):
    df = pd.read_csv(LEGACY_CSV)
    df.columns = [c.strip() for c in df.columns]
    n_raw = len(df)

    # strip whitespace on all string cells
    for c in df.select_dtypes(include="object").columns:
        df[c] = df[c].astype(str).str.strip().replace({"nan": np.nan, "": np.nan})

    # drop fully-blank rows
    df = df.dropna(how="all")
    n_after_blank = len(df)

    # drop obvious junk/test accounts
    is_test = (
        df["EMAIL_ADDR"].astype(str).str.lower().str.contains("test", na=False)
        | df["Customer Name"].astype(str).str.lower().str.contains("test", na=False)
    )
    n_junk = int(is_test.sum())
    df = df[~is_test]

    # normalize name casing -> Title Case
    df["name_clean"] = df["Customer Name"].astype(str).str.title().str.strip()

    # normalize email
    df["email_clean"] = df["EMAIL_ADDR"].astype(str).str.strip().str.lower()
    df.loc[df["email_clean"].isin(["nan", "none", ""]), "email_clean"] = np.nan

    # normalize dates -> YYYY-MM-DD
    df["signup_date_clean"] = df["Signup_Dt"].apply(parse_messy_date)
    n_unparsed_dates = int(df["signup_date_clean"].isna().sum() - df["Signup_Dt"].isna().sum())

    # normalize city
    df["city_clean"] = df["Home City"].astype(str).str.strip().str.title()
    df.loc[df["city_clean"].isin(["Nan", "None", ""]), "city_clean"] = np.nan

    # exact duplicate detection on normalized email
    n_before_dedupe = len(df)
    exact_dup_mask = df["email_clean"].notna() & df.duplicated(subset=["email_clean"], keep="first")
    n_exact_email_dupes = int(exact_dup_mask.sum())
    df_deduped = df[~exact_dup_mask].copy()

    # near-duplicate detection (same normalized name, no reliable email) via fuzzy match
    near_dupe_pairs = []
    no_email = df_deduped[df_deduped["email_clean"].isna()].copy()
    names = no_email["name_clean"].fillna("").tolist()
    idxs = no_email.index.tolist()
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            if names[i] and names[j]:
                score = fuzz.ratio(names[i].lower(), names[j].lower())
                if score >= 92:
                    near_dupe_pairs.append((idxs[i], idxs[j], names[i], names[j], score))

    final = df_deduped[["name_clean", "email_clean", "signup_date_clean", "city_clean", "Marketing Segment"]].rename(
        columns={
            "name_clean": "name",
            "email_clean": "email",
            "signup_date_clean": "signup_date",
            "city_clean": "city",
            "Marketing Segment": "marketing_segment",
        }
    )
    final["signup_date"] = final["signup_date"].dt.strftime("%Y-%m-%d")
    final.to_csv(f"{OUT_DATA}/legacy_customers_cleaned.csv", index=False)

    # reconcile against DB customers table (match on normalized email)
    db_emails = set(customers_db["email"].str.strip().str.lower())
    final_valid_email = final[final["email"].notna()]
    matched = final_valid_email["email"].isin(db_emails)
    n_matched_to_db = int(matched.sum())
    n_legacy_only = int((~matched).sum()) + int(final["email"].isna().sum())

    summary = {
        "rows_raw": n_raw,
        "rows_after_dropping_blank_rows": n_after_blank,
        "blank_rows_dropped": n_raw - n_after_blank,
        "junk_test_rows_dropped": n_junk,
        "rows_missing_email": int(df["email_clean"].isna().sum()),
        "unparseable_dates": n_unparsed_dates,
        "exact_duplicate_emails_dropped": n_exact_email_dupes,
        "near_duplicate_name_pairs_flagged_no_email": len(near_dupe_pairs),
        "near_duplicate_examples": near_dupe_pairs[:10],
        "rows_after_cleaning": len(final),
        "matched_to_existing_db_customers": n_matched_to_db,
        "legacy_only_or_unmatched_customers": n_legacy_only,
    }
    return final, summary


def clean_catalog(products_db):
    df = pd.read_csv(CATALOG_CSV)
    df.columns = [c.strip() for c in df.columns]
    n_raw = len(df)

    df = df.rename(
        columns={
            "SKU": "product_id",
            "item_name": "name",
            "dept": "category",
            "list_price_usd": "unit_price",
            "supplier_cost": "cost",
            "in_stock_units": "stock_units",
        }
    )
    df["name"] = df["name"].astype(str).str.strip()
    df["category"] = df["category"].astype(str).str.strip()
    df["unit_price"] = df["unit_price"].round(2)

    df.to_csv(f"{OUT_DATA}/product_catalog_cleaned.csv", index=False)

    db_ids = set(products_db["product_id"])
    catalog_ids = set(df["product_id"])
    supplier_only = sorted(catalog_ids - db_ids)
    overlap = sorted(catalog_ids & db_ids)

    # price mismatches on overlapping SKUs
    merged = df[df["product_id"].isin(overlap)].merge(
        products_db[["product_id", "unit_price"]], on="product_id", suffixes=("_catalog", "_db")
    )
    merged["price_diff"] = (merged["unit_price_catalog"] - merged["unit_price_db"]).round(2)
    price_mismatches = merged[merged["price_diff"].abs() > 0.01]

    merged.to_csv(f"{OUT_DATA}/catalog_vs_db_price_comparison.csv", index=False)

    summary = {
        "rows_raw": n_raw,
        "supplier_only_skus_not_in_db": supplier_only,
        "n_supplier_only_skus": len(supplier_only),
        "overlapping_skus": len(overlap),
        "price_mismatches_on_overlap": int(len(price_mismatches)),
        "avg_abs_price_diff_on_overlap": round(float(merged["price_diff"].abs().mean()), 2) if len(merged) else None,
    }
    return df, summary


def main():
    con = sqlite3.connect(DB)
    customers_db = pd.read_sql("SELECT * FROM customers", con)
    products_db = pd.read_sql("SELECT * FROM products", con)
    con.close()

    legacy_clean, legacy_summary = clean_legacy_customers(customers_db)
    catalog_clean, catalog_summary = clean_catalog(products_db)

    report = {"legacy_customers_reconciliation": legacy_summary, "catalog_reconciliation": catalog_summary}
    with open(f"{OUT}/cleaning_report.json", "w") as f:
        json.dump(report, f, indent=2, default=str)
    print(json.dumps(report, indent=2, default=str))


if __name__ == "__main__":
    main()
