"""
04 - RFM segmentation and Customer Lifetime Value (CLTV) modeling.
"""
import sqlite3
import pandas as pd
import numpy as np
import json

DB = "/mnt/user-data/uploads/ecommerce.db"
OUT = "/home/claude/urbancart/outputs"
DATA_OUT = "/home/claude/urbancart/cleaned_data"


def build_order_value(con):
    q = """
    SELECT o.order_id, o.customer_id, o.order_date, o.status,
           oi.product_id, oi.quantity, oi.unit_price, oi.discount
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.order_id
    WHERE o.status = 'completed' AND oi.quantity > 0
    """
    df = pd.read_sql(q, con, parse_dates=["order_date"])
    df["line_value"] = df["quantity"] * df["unit_price"] * (1 - df["discount"])
    return df


def rfm(con, line_items):
    ref_date = line_items["order_date"].max() + pd.Timedelta(days=1)

    order_level = line_items.groupby(["customer_id", "order_id"]).agg(order_date=("order_date", "max"), order_value=("line_value", "sum")).reset_index()

    agg = order_level.groupby("customer_id").agg(
        recency_days=("order_date", lambda x: (ref_date - x.max()).days),
        frequency=("order_id", "nunique"),
        monetary=("order_value", "sum"),
    ).reset_index()

    customers = pd.read_sql("SELECT customer_id, name, email, signup_date, city, country FROM customers", con)
    agg = customers.merge(agg, on="customer_id", how="left")
    # customers with zero completed orders
    agg[["recency_days", "frequency", "monetary"]] = agg[["recency_days", "frequency", "monetary"]].fillna(
        {"recency_days": (ref_date - pd.to_datetime(agg["signup_date"])).dt.days, "frequency": 0, "monetary": 0}
    )

    # quintile scoring (5 = best). Recency: lower is better -> reverse.
    agg["R_score"] = pd.qcut(agg["recency_days"].rank(method="first"), 5, labels=[5, 4, 3, 2, 1]).astype(int)
    agg["F_score"] = pd.qcut(agg["frequency"].rank(method="first"), 5, labels=[1, 2, 3, 4, 5]).astype(int)
    agg["M_score"] = pd.qcut(agg["monetary"].rank(method="first"), 5, labels=[1, 2, 3, 4, 5]).astype(int)
    agg["RFM_score"] = agg["R_score"].astype(str) + agg["F_score"].astype(str) + agg["M_score"].astype(str)

    def segment(row):
        r, f, m = row["R_score"], row["F_score"], row["M_score"]
        if r >= 4 and f >= 4 and m >= 4:
            return "Champions"
        if r >= 3 and f >= 3:
            return "Loyal Customers"
        if r >= 4 and f <= 2:
            return "New/Promising"
        if r <= 2 and f >= 4:
            return "At Risk (High Value)"
        if r <= 2 and f <= 2 and m <= 2:
            return "Hibernating/Lost"
        return "Needs Attention"

    agg["segment"] = agg.apply(segment, axis=1)
    agg.to_csv(f"{DATA_OUT}/rfm_segments.csv", index=False)

    seg_summary = agg.groupby("segment").agg(
        n_customers=("customer_id", "count"),
        avg_recency=("recency_days", "mean"),
        avg_frequency=("frequency", "mean"),
        avg_monetary=("monetary", "mean"),
    ).round(2).sort_values("n_customers", ascending=False)
    seg_summary.to_csv(f"{OUT}/rfm_segment_summary.csv")
    return agg, seg_summary


def cltv(con, agg, line_items):
    products = pd.read_sql("SELECT product_id, unit_price, cost FROM products", con)
    margin_rate = float(((products["unit_price"] - products["cost"]) / products["unit_price"]).mean())

    span_days = (pd.to_datetime(line_items["order_date"].max()) - pd.to_datetime(line_items["order_date"].min())).days
    span_years = max(span_days / 365.25, 0.5)

    active = agg[agg["frequency"] > 0].copy()
    active["avg_order_value"] = active["monetary"] / active["frequency"]
    active["purchase_freq_per_year"] = active["frequency"] / span_years

    # historic customer lifespan proxy: days between signup and most recent purchase, floored
    ref_date = pd.to_datetime(line_items["order_date"].max())
    active["signup_date"] = pd.to_datetime(active["signup_date"])
    active["tenure_years"] = ((ref_date - active["signup_date"]).dt.days / 365.25).clip(lower=0.25)

    active["predicted_cltv"] = (
        active["avg_order_value"] * active["purchase_freq_per_year"] * active["tenure_years"] * margin_rate
    ).round(2)

    active[["customer_id", "name", "segment", "avg_order_value", "purchase_freq_per_year", "tenure_years", "predicted_cltv"]].sort_values(
        "predicted_cltv", ascending=False
    ).to_csv(f"{DATA_OUT}/cltv_predictions.csv", index=False)

    summary = {
        "avg_gross_margin_rate": round(margin_rate, 4),
        "data_span_years": round(span_years, 2),
        "mean_predicted_cltv": round(float(active["predicted_cltv"].mean()), 2),
        "median_predicted_cltv": round(float(active["predicted_cltv"].median()), 2),
        "top_decile_cltv_threshold": round(float(active["predicted_cltv"].quantile(0.9)), 2),
        "cltv_by_segment": active.groupby("segment")["predicted_cltv"].mean().round(2).to_dict(),
    }
    return active, summary


def main():
    con = sqlite3.connect(DB)
    line_items = build_order_value(con)
    agg, seg_summary = rfm(con, line_items)
    cltv_df, cltv_summary = cltv(con, agg, line_items)
    con.close()

    out = {
        "rfm_segment_summary": seg_summary.reset_index().to_dict(orient="records"),
        "cltv_summary": cltv_summary,
    }
    with open(f"{OUT}/rfm_cltv_summary.json", "w") as f:
        json.dump(out, f, indent=2, default=str)
    print(json.dumps(out, indent=2, default=str))


if __name__ == "__main__":
    main()
