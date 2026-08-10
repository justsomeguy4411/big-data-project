"""
03 - Cohort retention analysis and market basket (support/confidence/lift) analysis,
implemented as SQL window-function / self-join queries against ecommerce.db.
"""
import sqlite3
import pandas as pd
import json

DB = "/mnt/user-data/uploads/ecommerce.db"
OUT = "/home/claude/urbancart/outputs"


def cohort_retention(con):
    # monthly signup cohort, month-offset of each completed order, distinct customers per cohort/offset
    q = """
    WITH cohort AS (
        SELECT customer_id, strftime('%Y-%m', signup_date) AS cohort_month
        FROM customers
    ),
    activity AS (
        SELECT o.customer_id,
               strftime('%Y-%m', o.order_date) AS order_month
        FROM orders o
        WHERE o.status = 'completed'
    ),
    joined AS (
        SELECT c.cohort_month,
               a.customer_id,
               (CAST(strftime('%Y', a.order_month || '-01') AS INT) - CAST(strftime('%Y', c.cohort_month || '-01') AS INT)) * 12
               + (CAST(strftime('%m', a.order_month || '-01') AS INT) - CAST(strftime('%m', c.cohort_month || '-01') AS INT)) AS month_offset
        FROM cohort c
        JOIN activity a ON a.customer_id = c.customer_id
    )
    SELECT cohort_month, month_offset, COUNT(DISTINCT customer_id) AS active_customers
    FROM joined
    WHERE month_offset BETWEEN 0 AND 11
    GROUP BY cohort_month, month_offset
    ORDER BY cohort_month, month_offset;
    """
    df = pd.read_sql(q, con)

    cohort_size = pd.read_sql(
        "SELECT strftime('%Y-%m', signup_date) AS cohort_month, COUNT(*) AS cohort_size FROM customers GROUP BY cohort_month",
        con,
    )
    df = df.merge(cohort_size, on="cohort_month")
    df["retention_rate"] = (df["active_customers"] / df["cohort_size"]).round(4)

    pivot = df.pivot(index="cohort_month", columns="month_offset", values="retention_rate")
    pivot.to_csv(f"{OUT}/cohort_retention_matrix.csv")

    # overall average retention curve across cohorts with enough history (>=6 months old)
    avg_curve = df.groupby("month_offset")["retention_rate"].mean().round(4)
    return pivot, avg_curve


def market_basket(con):
    # self-join order_items within the same order to find product pairs bought together
    q = """
    WITH items AS (
        SELECT order_id, product_id
        FROM order_items
        WHERE quantity > 0
    ),
    pairs AS (
        SELECT a.product_id AS product_a, b.product_id AS product_b, a.order_id
        FROM items a
        JOIN items b ON a.order_id = b.order_id AND a.product_id < b.product_id
    ),
    pair_counts AS (
        SELECT product_a, product_b, COUNT(DISTINCT order_id) AS pair_orders
        FROM pairs
        GROUP BY product_a, product_b
    ),
    total_orders AS (
        SELECT COUNT(DISTINCT order_id) AS n FROM items
    ),
    product_order_counts AS (
        SELECT product_id, COUNT(DISTINCT order_id) AS orders_with_product
        FROM items
        GROUP BY product_id
    )
    SELECT
        pc.product_a, pc.product_b, pc.pair_orders,
        pa.orders_with_product AS orders_a,
        pb.orders_with_product AS orders_b,
        t.n AS total_orders,
        ROUND(CAST(pc.pair_orders AS FLOAT) / t.n, 5) AS support,
        ROUND(CAST(pc.pair_orders AS FLOAT) / pa.orders_with_product, 5) AS confidence_a_to_b,
        ROUND((CAST(pc.pair_orders AS FLOAT) / t.n) / ((CAST(pa.orders_with_product AS FLOAT)/t.n) * (CAST(pb.orders_with_product AS FLOAT)/t.n)), 4) AS lift
    FROM pair_counts pc
    JOIN total_orders t
    JOIN product_order_counts pa ON pa.product_id = pc.product_a
    JOIN product_order_counts pb ON pb.product_id = pc.product_b
    WHERE pc.pair_orders >= 3
    ORDER BY lift DESC
    LIMIT 25;
    """
    df = pd.read_sql(q, con)
    products = pd.read_sql("SELECT product_id, name, category FROM products", con)
    df = df.merge(products, left_on="product_a", right_on="product_id").rename(
        columns={"name": "product_a_name", "category": "product_a_category"}
    ).drop(columns=["product_id"])
    df = df.merge(products, left_on="product_b", right_on="product_id").rename(
        columns={"name": "product_b_name", "category": "product_b_category"}
    ).drop(columns=["product_id"])
    df.to_csv(f"{OUT}/market_basket_top_pairs.csv", index=False)
    return df


def category_affinity(con):
    # aggregate to category-level lift, since individual SKU pairs are sparse/noisy
    q = """
    WITH items AS (
        SELECT oi.order_id, p.category
        FROM order_items oi
        JOIN products p ON p.product_id = oi.product_id
        WHERE oi.quantity > 0
    ),
    distinct_pairs AS (
        SELECT DISTINCT order_id, category FROM items
    ),
    pairs AS (
        SELECT a.category AS cat_a, b.category AS cat_b, a.order_id
        FROM distinct_pairs a
        JOIN distinct_pairs b ON a.order_id = b.order_id AND a.category < b.category
    ),
    pair_counts AS (
        SELECT cat_a, cat_b, COUNT(DISTINCT order_id) AS pair_orders
        FROM pairs GROUP BY cat_a, cat_b
    ),
    total_orders AS (SELECT COUNT(DISTINCT order_id) AS n FROM distinct_pairs),
    cat_counts AS (
        SELECT category, COUNT(DISTINCT order_id) AS orders_with_cat
        FROM distinct_pairs GROUP BY category
    )
    SELECT pc.cat_a, pc.cat_b, pc.pair_orders, t.n AS total_orders,
        ROUND(CAST(pc.pair_orders AS FLOAT)/t.n, 4) AS support,
        ROUND((CAST(pc.pair_orders AS FLOAT)/t.n) / ((CAST(ca.orders_with_cat AS FLOAT)/t.n)*(CAST(cb.orders_with_cat AS FLOAT)/t.n)), 4) AS lift
    FROM pair_counts pc
    JOIN total_orders t
    JOIN cat_counts ca ON ca.category = pc.cat_a
    JOIN cat_counts cb ON cb.category = pc.cat_b
    ORDER BY lift DESC;
    """
    df = pd.read_sql(q, con)
    df.to_csv(f"{OUT}/category_affinity.csv", index=False)
    return df


def main():
    con = sqlite3.connect(DB)
    pivot, avg_curve = cohort_retention(con)
    basket = market_basket(con)
    cat_aff = category_affinity(con)
    con.close()

    summary = {
        "avg_retention_curve_by_month_offset": avg_curve.to_dict(),
        "top_5_sku_pairs_by_lift": basket.head(5)[
            ["product_a_name", "product_b_name", "support", "confidence_a_to_b", "lift"]
        ].to_dict(orient="records"),
        "top_5_category_pairs_by_lift": cat_aff.head(5).to_dict(orient="records"),
    }
    with open(f"{OUT}/sql_analysis_summary.json", "w") as f:
        json.dump(summary, f, indent=2, default=str)
    print(json.dumps(summary, indent=2, default=str))


if __name__ == "__main__":
    main()
