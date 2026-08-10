"""
06 - Recommendation engine: item-based collaborative filtering using cosine similarity
over a customer x product interaction matrix (built with numpy, no external ML libs).
"""
import sqlite3
import pandas as pd
import numpy as np
import json

DB = "/mnt/user-data/uploads/ecommerce.db"
OUT = "/home/claude/urbancart/outputs"
DATA_OUT = "/home/claude/urbancart/cleaned_data"


def build_interaction_matrix(con):
    q = """
    SELECT o.customer_id, oi.product_id, SUM(oi.quantity) AS qty
    FROM orders o JOIN order_items oi ON oi.order_id = o.order_id
    WHERE o.status = 'completed' AND oi.quantity > 0
    GROUP BY o.customer_id, oi.product_id
    """
    df = pd.read_sql(q, con)
    customers = sorted(df["customer_id"].unique())
    products = sorted(df["product_id"].unique())
    cust_idx = {c: i for i, c in enumerate(customers)}
    prod_idx = {p: i for i, p in enumerate(products)}

    M = np.zeros((len(customers), len(products)))
    for r in df.itertuples():
        M[cust_idx[r.customer_id], prod_idx[r.product_id]] = r.qty
    # binarize (purchased / not) to avoid quantity outliers dominating similarity
    Mb = (M > 0).astype(float)
    return Mb, customers, products, cust_idx, prod_idx


def item_item_cosine(Mb):
    # cosine similarity between item columns: (I^T I) / (||i|| ||j||)
    norms = np.linalg.norm(Mb, axis=0)
    norms[norms == 0] = 1e-9
    numerator = Mb.T @ Mb
    denom = np.outer(norms, norms)
    sim = numerator / denom
    np.fill_diagonal(sim, 0)
    return sim


def top_n_similar_items(sim, products, product_names, n=5):
    prod_arr = np.array(products)
    results = {}
    for i, pid in enumerate(products):
        top_idx = np.argsort(-sim[i])[:n]
        results[pid] = [
            {"product_id": int(prod_arr[j]), "name": product_names.get(int(prod_arr[j]), ""), "similarity": round(float(sim[i, j]), 4)}
            for j in top_idx if sim[i, j] > 0
        ]
    return results


def recommend_for_customers(Mb, sim, customers, products, cust_idx, product_names, n=5, sample_size=10):
    # score = Mb (purchases) @ sim  -> higher score = recommended based on similar items already bought
    scores = Mb @ sim
    scores[Mb > 0] = -1  # exclude already-purchased items
    recs = {}
    sample_customers = customers[:sample_size]
    prod_arr = np.array(products)
    for cid in sample_customers:
        i = cust_idx[cid]
        top_idx = np.argsort(-scores[i])[:n]
        recs[int(cid)] = [
            {"product_id": int(prod_arr[j]), "name": product_names.get(int(prod_arr[j]), ""), "score": round(float(scores[i, j]), 4)}
            for j in top_idx if scores[i, j] > 0
        ]
    return recs


def main():
    con = sqlite3.connect(DB)
    products_df = pd.read_sql("SELECT product_id, name, category FROM products", con)
    product_names = dict(zip(products_df["product_id"], products_df["name"]))

    Mb, customers, products, cust_idx, prod_idx = build_interaction_matrix(con)
    sim = item_item_cosine(Mb)

    similar_items = top_n_similar_items(sim, products, product_names, n=5)
    sample_recs = recommend_for_customers(Mb, sim, customers, products, cust_idx, product_names, n=5, sample_size=10)
    con.close()

    # persist a compact "similar products" lookup table
    rows = []
    for pid, sims in similar_items.items():
        for rank, s in enumerate(sims, 1):
            rows.append({"product_id": pid, "rank": rank, **s})
    pd.DataFrame(rows).to_csv(f"{DATA_OUT}/product_similar_items.csv", index=False)

    summary = {
        "n_customers_with_purchases": len(customers),
        "n_products_with_purchases": len(products),
        "matrix_sparsity_pct": round(100 * (1 - Mb.sum() / Mb.size), 2),
        "example_similar_items": {product_names.get(k, k): v[:3] for k, v in list(similar_items.items())[:5]},
        "example_customer_recommendations": {str(cid): recs[:3] for cid, recs in sample_recs.items()},
    }
    with open(f"{OUT}/recommendation_engine_summary.json", "w") as f:
        json.dump(summary, f, indent=2, default=str)
    print(json.dumps(summary, indent=2, default=str))


if __name__ == "__main__":
    main()
