"""
05 - Regression analysis (closed-form OLS via numpy), price elasticity of demand,
and Monte Carlo simulation of 12-month revenue.
"""
import sqlite3
import pandas as pd
import numpy as np
import json

DB = "/mnt/user-data/uploads/ecommerce.db"
OUT = "/home/claude/urbancart/outputs"

rng = np.random.default_rng(42)


def ols_fit(X, y):
    """Closed-form OLS: beta = (X'X)^-1 X'y, with an intercept column prepended."""
    X1 = np.column_stack([np.ones(len(X)), X])
    beta, *_ = np.linalg.lstsq(X1, y, rcond=None)
    y_hat = X1 @ beta
    ss_res = np.sum((y - y_hat) ** 2)
    ss_tot = np.sum((y - y.mean()) ** 2)
    r2 = 1 - ss_res / ss_tot
    n, k = X1.shape
    adj_r2 = 1 - (1 - r2) * (n - 1) / (n - k)
    # standard errors
    sigma2 = ss_res / (n - k)
    cov = sigma2 * np.linalg.inv(X1.T @ X1)
    se = np.sqrt(np.diag(cov))
    t_stats = beta / se
    return {"beta": beta, "se": se, "t_stats": t_stats, "r2": r2, "adj_r2": adj_r2, "n": n}


def regression_monetary(con):
    q = """
    SELECT o.customer_id, c.age,
           strftime('%Y-%m', o.order_date) AS order_month,
           oi.quantity, oi.unit_price, oi.discount
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.order_id
    JOIN customers c ON c.customer_id = o.customer_id
    WHERE o.status = 'completed' AND oi.quantity > 0 AND c.age IS NOT NULL
    """
    df = pd.read_sql(q, con)
    df["line_value"] = df["quantity"] * df["unit_price"] * (1 - df["discount"])

    ref = pd.read_sql(
        "SELECT o.customer_id, MAX(o.order_date) AS last_order, COUNT(DISTINCT o.order_id) AS frequency "
        "FROM orders o WHERE o.status='completed' GROUP BY o.customer_id",
        con, parse_dates=["last_order"]
    )
    max_date = ref["last_order"].max()
    ref["recency_days"] = (max_date - ref["last_order"]).dt.days

    cust_monetary = df.groupby("customer_id")["line_value"].sum().rename("monetary").reset_index()
    customers = pd.read_sql("SELECT customer_id, age FROM customers WHERE age IS NOT NULL", con)

    m = customers.merge(cust_monetary, on="customer_id", how="inner").merge(ref, on="customer_id", how="inner")

    X = m[["age", "frequency", "recency_days"]].to_numpy(dtype=float)
    y = m["monetary"].to_numpy(dtype=float)
    fit = ols_fit(X, y)

    feature_names = ["intercept", "age", "frequency", "recency_days"]
    result = {
        "target": "customer total monetary value (completed orders)",
        "n_obs": fit["n"],
        "r2": round(float(fit["r2"]), 4),
        "adj_r2": round(float(fit["adj_r2"]), 4),
        "coefficients": {
            feature_names[i]: {"beta": round(float(fit["beta"][i]), 4), "t_stat": round(float(fit["t_stats"][i]), 3)}
            for i in range(len(feature_names))
        },
    }
    return result


def price_elasticity(con):
    # effective unit price after discount vs quantity, at the order-line level, log-log OLS by category
    q = """
    SELECT p.category, oi.unit_price, oi.discount, oi.quantity
    FROM order_items oi
    JOIN products p ON p.product_id = oi.product_id
    JOIN orders o ON o.order_id = oi.order_id
    WHERE o.status = 'completed' AND oi.quantity > 0 AND oi.unit_price > 0
    """
    df = pd.read_sql(q, con)
    df["eff_price"] = df["unit_price"] * (1 - df["discount"])
    df = df[df["eff_price"] > 0]
    df["log_price"] = np.log(df["eff_price"])
    df["log_qty"] = np.log(df["quantity"])

    results = {}
    for cat, g in df.groupby("category"):
        if len(g) < 30:
            continue
        X = g[["log_price"]].to_numpy(dtype=float)
        y = g["log_qty"].to_numpy(dtype=float)
        fit = ols_fit(X, y)
        results[cat] = {
            "elasticity": round(float(fit["beta"][1]), 4),
            "t_stat": round(float(fit["t_stats"][1]), 3),
            "r2": round(float(fit["r2"]), 4),
            "n": fit["n"],
        }
    # overall
    X = df[["log_price"]].to_numpy(dtype=float)
    y = df["log_qty"].to_numpy(dtype=float)
    overall = ols_fit(X, y)
    results["__overall__"] = {
        "elasticity": round(float(overall["beta"][1]), 4),
        "t_stat": round(float(overall["t_stats"][1]), 3),
        "r2": round(float(overall["r2"]), 4),
        "n": overall["n"],
    }
    return results


def monte_carlo_revenue(con, n_sims=10000):
    q = """
    SELECT strftime('%Y-%m', o.order_date) AS month, SUM(oi.quantity*oi.unit_price*(1-oi.discount)) AS revenue
    FROM orders o JOIN order_items oi ON oi.order_id = o.order_id
    WHERE o.status = 'completed'
    GROUP BY month ORDER BY month
    """
    monthly = pd.read_sql(q, con)
    # drop first/last partial months for a cleaner distribution
    monthly_rev = monthly["revenue"].iloc[1:-1] if len(monthly) > 2 else monthly["revenue"]

    mu = float(monthly_rev.mean())
    sigma = float(monthly_rev.std(ddof=1))

    sims = rng.normal(mu, sigma, size=(n_sims, 12))
    sims = np.clip(sims, 0, None)
    annual_totals = sims.sum(axis=1)

    result = {
        "historical_monthly_mean": round(mu, 2),
        "historical_monthly_std": round(sigma, 2),
        "n_simulations": n_sims,
        "simulated_next_12mo_revenue_mean": round(float(annual_totals.mean()), 2),
        "simulated_next_12mo_revenue_p10": round(float(np.percentile(annual_totals, 10)), 2),
        "simulated_next_12mo_revenue_p50": round(float(np.percentile(annual_totals, 50)), 2),
        "simulated_next_12mo_revenue_p90": round(float(np.percentile(annual_totals, 90)), 2),
    }
    pd.DataFrame({"monthly_revenue": monthly_rev}).to_csv(f"{OUT}/historical_monthly_revenue.csv", index=False)
    return result


def main():
    con = sqlite3.connect(DB)
    reg = regression_monetary(con)
    elasticity = price_elasticity(con)
    mc = monte_carlo_revenue(con)
    con.close()

    out = {"regression_monetary_value": reg, "price_elasticity_by_category": elasticity, "monte_carlo_revenue_simulation": mc}
    with open(f"{OUT}/regression_elasticity_montecarlo.json", "w") as f:
        json.dump(out, f, indent=2, default=str)
    print(json.dumps(out, indent=2, default=str))


if __name__ == "__main__":
    main()
