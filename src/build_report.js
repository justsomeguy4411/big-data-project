const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, ShadingType, AlignmentType, BorderStyle, PageBreak, PageOrientation
} = require("docx");

const OUT = "/home/claude/urbancart/outputs";
const j = (name) => JSON.parse(fs.readFileSync(`${OUT}/${name}`, "utf8"));

const audit = j("audit_report.json");
const cleaning = j("cleaning_report.json");
const sqlA = j("sql_analysis_summary.json");
const rfmC = j("rfm_cltv_summary.json");
const reg = j("regression_elasticity_montecarlo.json");
const rec = j("recommendation_engine_summary.json");
const fc = j("forecast_summary.json");

const NAVY = "1F2A44";
const ACCENT = "2E5E8C";
const LIGHT = "EAF0F6";
const GREY = "595959";

function h1(text) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 } });
}
function h2(text) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 150 } });
}
function p(text, opts = {}) {
  return new Paragraph({ children: [new TextRun({ text, ...opts })], spacing: { after: 160 } });
}
function bullet(text) {
  return new Paragraph({ text, bullet: { level: 0 }, spacing: { after: 80 } });
}
function note(text) {
  return new Paragraph({
    children: [new TextRun({ text, italics: true, color: GREY, size: 20 })],
    spacing: { after: 200 },
  });
}

function cell(text, { header = false, width = 2000, shade = null, bold = false } = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: shade ? { fill: shade, type: ShadingType.CLEAR } : undefined,
    children: [new Paragraph({
      children: [new TextRun({ text: String(text), bold: header || bold, color: header ? "FFFFFF" : "000000", size: 20 })],
    })],
  });
}

function table(headers, rows, widths) {
  const w = widths || headers.map(() => Math.floor(9000 / headers.length));
  return new Table({
    width: { size: 9000, type: WidthType.DXA },
    columnWidths: w,
    rows: [
      new TableRow({ children: headers.map((hd, i) => cell(hd, { header: true, width: w[i], shade: NAVY })) }),
      ...rows.map((r, ri) => new TableRow({
        children: r.map((val, i) => cell(val, { width: w[i], shade: ri % 2 === 1 ? LIGHT : null })),
      })),
    ],
  });
}

const children = [];

// ---------- TITLE ----------
children.push(
  new Paragraph({ text: "UrbanCart", heading: HeadingLevel.TITLE, spacing: { after: 100 } }),
  new Paragraph({
    children: [new TextRun({ text: "Ecommerce Data Engineering & Analytics Report", size: 32, color: ACCENT, bold: true })],
    spacing: { after: 300 },
  }),
  p("Prepared from ecommerce.db, the legacy customer export, and the 2024 product catalog. All figures in this report are computed directly from the underlying data — none are estimated or carried over from prior specification documents."),
  note("Scope note: the UrbanCart Master Specification document supplied alongside the data contains unverifiable infrastructure claims and pre-stated results (e.g. specific query-time reductions, named cloud services, dollar-value impact figures) that could not be reconciled with the actual dataset. This report instead follows the README data dictionary and reports only what was independently computed from the source data."),
  new Paragraph({ children: [new PageBreak()] }),
);

// ---------- EXEC SUMMARY ----------
children.push(h1("Executive Summary"));
children.push(p(`The dataset covers ${audit.customers.n_rows.toLocaleString()} customers, ${audit.orders.n_rows.toLocaleString()} orders, ${audit.order_items.n_rows.toLocaleString()} order line items, ${audit.products.n_rows} products, ${audit.reviews.n_rows.toLocaleString()} reviews, and ${audit.web_sessions.n_rows.toLocaleString()} web sessions, spanning ${fc.n_historical_months} months of completed-order history.`));
children.push(bullet(`Of ${audit.orders.n_rows.toLocaleString()} orders, ${audit.orders.status_counts.completed.toLocaleString()} (${(audit.orders.status_counts.completed/audit.orders.n_rows*100).toFixed(1)}%) are completed; ${audit.orders.status_counts.cancelled.toLocaleString()} cancelled and ${audit.orders.status_counts.returned.toLocaleString()} returned.`));
children.push(bullet(`Data quality issues found and corrected: ${cleaning.legacy_customers_reconciliation.exact_duplicate_emails_dropped} duplicate customer records, ${audit.order_items.exact_dup_rows_excl_pk} duplicate order-item rows, ${audit.order_items.negative_qty_rows} negative-quantity line items, and ${audit.reviews.rating_out_of_range} out-of-range review ratings.`));
children.push(bullet(`Average customer gross margin rate is ${(rfmC.cltv_summary.avg_gross_margin_rate*100).toFixed(1)}%; mean predicted CLTV is $${rfmC.cltv_summary.mean_predicted_cltv.toLocaleString()} (median $${rfmC.cltv_summary.median_predicted_cltv.toLocaleString()}).`));
children.push(bullet(`"Champions" is the highest-value RFM segment (avg CLTV $${rfmC.cltv_summary.cltv_by_segment.Champions.toLocaleString()}); "Hibernating/Lost" customers still represent ${rfmC.rfm_segment_summary.find(s=>s.segment==="Hibernating/Lost").n_customers} people worth reactivating.`));
children.push(bullet(`Regression and price-elasticity models show weak/near-zero explanatory power outside of purchase frequency — consistent with the order, pricing, and quantity fields behaving as statistically independent (i.e. synthetically generated) rather than reflecting real consumer price sensitivity.`));
children.push(bullet(`A Holt's linear-trend forecast projects monthly revenue rising from a historical average of $${fc.historical_avg_monthly_revenue.toLocaleString()} to roughly $${fc.forecast_next_6_months[5].holt_forecast.toLocaleString()} within 6 months, driven mainly by the fitted upward trend rather than seasonality.`));

// ---------- METHODOLOGY ----------
children.push(h1("Methodology & Data Sources"));
children.push(p("Three source inputs were used:"));
children.push(bullet("ecommerce.db — SQLite database with customers, products, orders, order_items, reviews, and web_sessions tables (source of truth)."));
children.push(bullet("legacy_customers_export.csv — a legacy customer file with inconsistent name casing, four different date formats, and duplicate/blank rows, reconciled against the customers table."));
children.push(bullet("product_catalog_2024.csv — a supplier-side catalog with different column names and prices than the internal products table, reconciled by SKU."));
children.push(p("All analysis code is organized as a modular Python pipeline (src/) with SQL executed via sqlite3/pandas, statistics implemented with numpy (closed-form OLS, Holt's exponential smoothing, cosine similarity) rather than black-box libraries, and fuzzy matching via rapidfuzz. Every figure in this report is pulled directly from the pipeline's JSON/CSV outputs — see the Appendix for the file manifest."));

// ---------- DATA QUALITY AUDIT ----------
children.push(h1("1. Data Quality Audit"));
children.push(h2("1.1 Core Database Tables"));
children.push(table(
  ["Table", "Rows", "Key issues found"],
  [
    ["customers", audit.customers.n_rows, `${audit.customers.missing_by_col.city||0} missing city, ${audit.customers.missing_by_col.age||0} missing age, ${audit.customers.missing_by_col.gender||0} missing gender`],
    ["products", audit.products.n_rows, `${audit.products.unit_price_outlier_count} price outliers (IQR method), 0 cost > price rows`],
    ["orders", audit.orders.n_rows, `Status split: ${Object.entries(audit.orders.status_counts).map(([k,v])=>`${k} ${v}`).join(", ")}`],
    ["order_items", audit.order_items.n_rows, `${audit.order_items.exact_dup_rows_excl_pk} exact duplicate rows, ${audit.order_items.negative_qty_rows} negative-quantity rows (returns)`],
    ["reviews", audit.reviews.n_rows, `${audit.reviews.missing_by_col.review_text} missing review text, ${audit.reviews.rating_out_of_range} ratings outside 1-5 range`],
    ["web_sessions", audit.web_sessions.n_rows, "No missing values or duplicates found"],
  ],
  [1800, 1200, 6000]
));
children.push(note("Referential integrity: zero orphaned rows across all foreign-key relationships (orders→customers, order_items→orders/products, reviews→customers/products)."));

children.push(h2("1.2 Legacy Customer Export (raw)"));
children.push(bullet(`${audit.legacy_customers_raw.n_rows.toLocaleString()} raw rows across 5 columns with inconsistent naming (Customer Name, EMAIL_ADDR, Signup_Dt, Home City, Marketing Segment).`));
children.push(bullet(`${audit.legacy_customers_raw.missing_email} rows missing an email address; 1 fully blank row; 1 row identified as a test account.`));
children.push(bullet("Signup dates appeared in four different formats within the same column (ISO, 'Month DD, YYYY', MM/DD/YYYY, DD-Mon-YYYY), all successfully parsed."));

children.push(h2("1.3 Product Catalog 2024 (raw)"));
children.push(bullet(`${audit.catalog_raw.n_rows} rows using supplier-side column names (SKU, item_name, dept, list_price_usd, supplier_cost, in_stock_units).`));
children.push(bullet(`${audit.catalog_raw.skus_not_in_products} SKUs (IDs 9000–9011) do not exist in the internal products table — likely new/discontinued supplier items never synced to the catalog DB.`));

// ---------- CLEANING ----------
children.push(h1("2. Cleaning & Reconciliation"));
children.push(h2("2.1 Legacy Customers"));
const lc = cleaning.legacy_customers_reconciliation;
children.push(table(
  ["Step", "Result"],
  [
    ["Raw rows", lc.rows_raw],
    ["Blank rows dropped", lc.blank_rows_dropped],
    ["Test/junk accounts dropped", lc.junk_test_rows_dropped],
    ["Exact duplicate emails dropped", lc.exact_duplicate_emails_dropped],
    ["Near-duplicate name pairs flagged (no email to disambiguate)", lc.near_duplicate_name_pairs_flagged_no_email],
    ["Rows after cleaning", lc.rows_after_cleaning],
    ["Matched to an existing customers.db record (by email)", lc.matched_to_existing_db_customers],
    ["Legacy-only / unmatched customers", lc.legacy_only_or_unmatched_customers],
  ],
  [6500, 2500]
));
children.push(p("Cleaning steps applied: whitespace trimming, name casing normalized to Title Case, emails lower-cased, dates parsed into ISO 8601 regardless of source format, and city names title-cased. Output: cleaned_data/legacy_customers_cleaned.csv."));

children.push(h2("2.2 Product Catalog"));
const cc = cleaning.catalog_reconciliation;
children.push(bullet(`${cc.overlapping_skus} of ${cc.rows_raw} catalog SKUs matched an internal product_id; ${cc.n_supplier_only_skus} exist only in the supplier catalog.`));
children.push(bullet(`Among overlapping SKUs, ${cc.price_mismatches_on_overlap} (${(cc.price_mismatches_on_overlap/cc.overlapping_skus*100).toFixed(0)}%) had a list price that differs from the internal unit_price, by an average of $${cc.avg_abs_price_diff_on_overlap}. This is a systematic, near-universal discrepancy — worth a pricing-source reconciliation with the merchandising team rather than treating as noise.`));
children.push(p("Output: cleaned_data/product_catalog_cleaned.csv and cleaned_data/catalog_vs_db_price_comparison.csv (full line-by-line diff)."));

// ---------- SQL ANALYSIS ----------
children.push(h1("3. Cohort Retention & Market Basket Analysis (SQL)"));
children.push(h2("3.1 Monthly Cohort Retention"));
children.push(p("Retention rate = distinct customers from a signup cohort placing a completed order N months later, divided by cohort size. Averaged across all cohorts with at least 12 months of history:"));
const retRows = Object.entries(sqlA.avg_retention_curve_by_month_offset).map(([m, r]) => [`Month ${m}`, `${(r*100).toFixed(1)}%`]);
children.push(table(["Months since signup", "Avg. retention"], retRows, [4500, 4500]));
children.push(note("The curve stays flat in the 8–13% band rather than showing the typical steep early drop-off, suggesting order timing in this dataset isn't strongly coupled to signup date — full matrix in outputs/cohort_retention_matrix.csv."));

children.push(h2("3.2 Market Basket Analysis"));
children.push(p("Computed via self-join of order_items on shared order_id, at both SKU-pair and category-pair granularity (support, confidence, lift)."));
children.push(h2("Top 5 SKU pairs by lift"));
children.push(table(
  ["Product A", "Product B", "Support", "Confidence (A→B)", "Lift"],
  sqlA.top_5_sku_pairs_by_lift.map(r => [r.product_a_name, r.product_b_name, r.support, r.confidence_a_to_b, r.lift]),
  [2500, 2500, 1500, 1500, 1000]
));
children.push(h2("Top 5 category pairs by lift"));
children.push(table(
  ["Category A", "Category B", "Support", "Lift"],
  sqlA.top_5_category_pairs_by_lift.map(r => [r.cat_a, r.cat_b, r.support, r.lift]),
  [3000, 3000, 1500, 1500]
));
children.push(note("All category-pair lift values are ≤1, meaning no category combination is purchased together more than chance would predict — cross-sell bundling by category isn't supported by this data. The SKU-level lift values above are driven by very small order counts (3–5 shared orders) and should be treated as exploratory, not a merchandising recommendation, until validated on more data."));

// ---------- RFM & CLTV ----------
children.push(h1("4. RFM Segmentation & Customer Lifetime Value"));
children.push(h2("4.1 RFM Segments"));
children.push(table(
  ["Segment", "Customers", "Avg. Recency (days)", "Avg. Frequency", "Avg. Monetary ($)"],
  rfmC.rfm_segment_summary.map(s => [s.segment, s.n_customers, s.avg_recency, s.avg_frequency, s.avg_monetary.toLocaleString()]),
  [2200, 1500, 1800, 1500, 2000]
));
children.push(p("Segmentation logic: each customer is scored 1–5 on Recency, Frequency, and Monetary quintiles, then bucketed by rule (e.g. Champions = top quintile on all three; Hibernating/Lost = bottom quintile on all three). Full customer-level scores in cleaned_data/rfm_segments.csv."));

children.push(h2("4.2 Customer Lifetime Value"));
children.push(bullet(`CLTV = avg. order value × purchase frequency/year × tenure (years) × gross margin rate (${(rfmC.cltv_summary.avg_gross_margin_rate*100).toFixed(1)}%).`));
children.push(bullet(`Mean predicted CLTV: $${rfmC.cltv_summary.mean_predicted_cltv.toLocaleString()}  |  Median: $${rfmC.cltv_summary.median_predicted_cltv.toLocaleString()}  |  Top decile threshold: $${rfmC.cltv_summary.top_decile_cltv_threshold.toLocaleString()}.`));
children.push(table(
  ["Segment", "Avg. predicted CLTV ($)"],
  Object.entries(rfmC.cltv_summary.cltv_by_segment).sort((a,b)=>b[1]-a[1]).map(([k,v]) => [k, v.toLocaleString()]),
  [6000, 3000]
));
children.push(p("Output: cleaned_data/cltv_predictions.csv (per-customer)."));

// ---------- REGRESSION / ELASTICITY / MC ----------
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(h1("5. Regression, Price Elasticity & Revenue Simulation"));
children.push(h2("5.1 Regression: drivers of customer monetary value"));
children.push(p(`Closed-form OLS (numpy normal equations) predicting a customer's total completed-order spend from age, purchase frequency, and recency. n = ${reg.regression_monetary_value.n_obs}, R² = ${reg.regression_monetary_value.r2}, adjusted R² = ${reg.regression_monetary_value.adj_r2}.`));
children.push(table(
  ["Predictor", "Coefficient (β)", "t-statistic"],
  Object.entries(reg.regression_monetary_value.coefficients).map(([k, v]) => [k, v.beta, v.t_stat]),
  [3500, 3000, 2500]
));
children.push(note("Only purchase frequency is a statistically meaningful predictor (t = 12.7); age and recency are not significant. The low R² (0.08) indicates spend is driven mostly by factors outside this feature set (or by randomness in how the data was generated)."));

children.push(h2("5.2 Price Elasticity of Demand"));
children.push(p("Log-log OLS of quantity on effective (post-discount) unit price, by product category:"));
const elRows = Object.entries(reg.price_elasticity_by_category).filter(([k])=>k!=="__overall__").map(([k,v]) => [k, v.elasticity, v.t_stat, v.r2, v.n]);
children.push(table(["Category", "Elasticity", "t-stat", "R²", "n"], elRows, [2500,1500,1500,1500,2000]));
const ov = reg.price_elasticity_by_category.__overall__;
children.push(note(`Overall elasticity: ${ov.elasticity} (t = ${ov.t_stat}, R² = ${ov.r2}, n = ${ov.n}). All elasticities are statistically indistinguishable from zero — quantity purchased shows no measurable relationship to price in this dataset, so elasticity-based pricing recommendations aren't supportable from this data as-is.`));

children.push(h2("5.3 Monte Carlo Revenue Simulation"));
const mc = reg.monte_carlo_revenue_simulation;
children.push(p(`10,000 simulations of the next 12 months, drawing monthly revenue from a Normal(μ=$${mc.historical_monthly_mean.toLocaleString()}, σ=$${mc.historical_monthly_std.toLocaleString()}) distribution fit to historical completed-order revenue.`));
children.push(table(
  ["Metric", "Value"],
  [
    ["Simulated mean 12-mo revenue", `$${mc.simulated_next_12mo_revenue_mean.toLocaleString()}`],
    ["P10 (downside case)", `$${mc.simulated_next_12mo_revenue_p10.toLocaleString()}`],
    ["P50 (median)", `$${mc.simulated_next_12mo_revenue_p50.toLocaleString()}`],
    ["P90 (upside case)", `$${mc.simulated_next_12mo_revenue_p90.toLocaleString()}`],
  ],
  [6000, 3000]
));

// ---------- RECOMMENDATION ENGINE ----------
children.push(h1("6. Recommendation Engine"));
children.push(p(`Item-based collaborative filtering: a binary customer × product purchase matrix (${rec.n_customers_with_purchases} customers × ${rec.n_products_with_purchases} products, ${rec.matrix_sparsity_pct}% sparse) with cosine similarity computed between product columns using numpy (no external ML library). Customer recommendations are generated by scoring each product as (purchase vector) · (item-similarity matrix), excluding already-purchased items.`));
children.push(h2("Example: products similar to \"Black Camera\""));
const exKey = Object.keys(rec.example_similar_items)[0];
children.push(table(
  ["Similar product", "Cosine similarity"],
  rec.example_similar_items[exKey].map(x => [x.name, x.similarity]),
  [6000, 3000]
));
children.push(p("Full similar-items lookup for all products: cleaned_data/product_similar_items.csv. Per-customer recommendations are generated the same way at query time from the same similarity matrix."));

// ---------- FORECASTING ----------
children.push(h1("7. Revenue Forecasting"));
children.push(p(`${fc.n_historical_months} months of historical completed-order revenue, averaging $${fc.historical_avg_monthly_revenue.toLocaleString()}/month. Two models: Holt's linear exponential smoothing (α=0.4, β=0.2, implemented from scratch with numpy) and an OLS linear-trend baseline (slope $${fc.linear_trend_slope_per_month.toLocaleString()}/month).`));
children.push(table(
  ["Model", "In-sample MAE", "In-sample RMSE"],
  [["Holt's linear", `$${fc.holt_in_sample_mae.toLocaleString()}`, `$${fc.holt_in_sample_rmse.toLocaleString()}`], ["Linear trend (OLS)", `$${fc.linear_in_sample_mae.toLocaleString()}`, "—"]],
  [4500, 2500, 2500]
));
children.push(h2("6-month forward forecast"));
children.push(table(
  ["Month", "Holt forecast", "Linear trend forecast"],
  fc.forecast_next_6_months.map(r => [r.month, `$${r.holt_forecast.toLocaleString()}`, `$${r.linear_trend_forecast.toLocaleString()}`]),
  [3000, 3000, 3000]
));
children.push(note("Both models agree on direction (revenue rising) but diverge in magnitude by month 6 (~$334K vs ~$387K) — the gap is the trend-extrapolation risk inherent to only 34 months of history with no clear seasonal pattern. Treat these as a range, not a point estimate."));

// ---------- CONCLUSIONS ----------
children.push(h1("8. Conclusions & Recommendations"));
children.push(bullet("Prioritize reactivating the 535 'Hibernating/Lost' customers and the 210 'At Risk (High Value)' customers ($2,734 avg CLTV) before they fully churn — this is the largest addressable value pool identified."));
children.push(bullet("Resolve the systematic catalog-vs-internal price mismatch (253 of 255 overlapping SKUs, avg $9.44 diff) with the merchandising/supplier team; this looks like a stale sync issue, not natural price variation."));
children.push(bullet("Treat the market-basket and price-elasticity results as inconclusive given near-chance lift values and statistically insignificant elasticity — re-run once more transaction history accumulates, or investigate whether order data reflects real customer behavior vs. system-generated test data."));
children.push(bullet("Use the Monte Carlo P10–P90 range ($" + mc.simulated_next_12mo_revenue_p10.toLocaleString() + "–$" + mc.simulated_next_12mo_revenue_p90.toLocaleString() + ") rather than a single forecast number for 12-month revenue planning."));

// ---------- APPENDIX ----------
children.push(h1("Appendix: File Manifest"));
children.push(h2("Code (src/)"));
["audit.py","clean.py","sql_analysis.py","rfm_cltv.py","regression_elasticity.py","recommend.py","forecast.py","main.py"].forEach(f => children.push(bullet(f)));
children.push(h2("Cleaned data (cleaned_data/)"));
["legacy_customers_cleaned.csv","product_catalog_cleaned.csv","catalog_vs_db_price_comparison.csv","rfm_segments.csv","cltv_predictions.csv","product_similar_items.csv"].forEach(f => children.push(bullet(f)));
children.push(h2("Analysis outputs (outputs/)"));
["audit_report.json","cleaning_report.json","sql_analysis_summary.json","cohort_retention_matrix.csv","market_basket_top_pairs.csv","category_affinity.csv","rfm_cltv_summary.json","rfm_segment_summary.csv","regression_elasticity_montecarlo.json","historical_monthly_revenue.csv","recommendation_engine_summary.json","forecast_summary.json","revenue_forecast_next_6mo.csv"].forEach(f => children.push(bullet(f)));

const doc = new Document({
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 } } },
    children,
  }],
  styles: {
    default: {
      document: { run: { font: "Calibri", size: 22 } },
    },
  },
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync("/home/claude/urbancart/outputs/UrbanCart_Analytics_Report.docx", buf);
  console.log("done");
});
