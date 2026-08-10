"""
07 - Revenue forecasting: Holt's linear exponential smoothing (implemented from scratch
with numpy) plus an OLS linear-trend baseline, forecasting the next 6 months of revenue.
"""
import sqlite3
import pandas as pd
import numpy as np
import json

DB = "/mnt/user-data/uploads/ecommerce.db"
OUT = "/home/claude/urbancart/outputs"


def monthly_revenue_series(con):
    q = """
    SELECT strftime('%Y-%m', o.order_date) AS month,
           SUM(oi.quantity*oi.unit_price*(1-oi.discount)) AS revenue
    FROM orders o JOIN order_items oi ON oi.order_id = o.order_id
    WHERE o.status = 'completed'
    GROUP BY month ORDER BY month
    """
    df = pd.read_sql(q, con)
    # drop first and last month (partial data at the boundaries of the dataset)
    return df.iloc[1:-1].reset_index(drop=True)


def holt_linear(y, alpha=0.4, beta=0.2, n_forecast=6):
    """Holt's linear trend method, implemented with plain numpy recursion."""
    level = np.zeros(len(y))
    trend = np.zeros(len(y))
    level[0] = y[0]
    trend[0] = y[1] - y[0] if len(y) > 1 else 0
    for t in range(1, len(y)):
        level[t] = alpha * y[t] + (1 - alpha) * (level[t - 1] + trend[t - 1])
        trend[t] = beta * (level[t] - level[t - 1]) + (1 - beta) * trend[t - 1]
    forecast = [level[-1] + (h + 1) * trend[-1] for h in range(n_forecast)]
    # in-sample fit error
    fitted = np.concatenate([[y[0]], level[:-1] + trend[:-1]])
    mae = float(np.mean(np.abs(y - fitted)))
    rmse = float(np.sqrt(np.mean((y - fitted) ** 2)))
    return np.array(forecast), mae, rmse


def linear_trend_ols(y, n_forecast=6):
    t = np.arange(len(y))
    X1 = np.column_stack([np.ones(len(t)), t])
    beta, *_ = np.linalg.lstsq(X1, y, rcond=None)
    future_t = np.arange(len(y), len(y) + n_forecast)
    forecast = beta[0] + beta[1] * future_t
    fitted = X1 @ beta
    mae = float(np.mean(np.abs(y - fitted)))
    return forecast, beta, mae


def main():
    con = sqlite3.connect(DB)
    series = monthly_revenue_series(con)
    con.close()

    y = series["revenue"].to_numpy(dtype=float)
    holt_fc, holt_mae, holt_rmse = holt_linear(y, n_forecast=6)
    lin_fc, lin_beta, lin_mae = linear_trend_ols(y, n_forecast=6)

    last_month = pd.Period(series["month"].iloc[-1], freq="M")
    future_months = [str(last_month + i) for i in range(1, 7)]

    forecast_df = pd.DataFrame({
        "month": future_months,
        "holt_forecast": holt_fc.round(2),
        "linear_trend_forecast": lin_fc.round(2),
    })
    forecast_df.to_csv(f"{OUT}/revenue_forecast_next_6mo.csv", index=False)

    summary = {
        "n_historical_months": len(y),
        "historical_avg_monthly_revenue": round(float(y.mean()), 2),
        "linear_trend_slope_per_month": round(float(lin_beta[1]), 2),
        "holt_in_sample_mae": round(holt_mae, 2),
        "holt_in_sample_rmse": round(holt_rmse, 2),
        "linear_in_sample_mae": round(lin_mae, 2),
        "forecast_next_6_months": forecast_df.to_dict(orient="records"),
    }
    with open(f"{OUT}/forecast_summary.json", "w") as f:
        json.dump(summary, f, indent=2, default=str)
    print(json.dumps(summary, indent=2, default=str))


if __name__ == "__main__":
    main()
