const pptxgen = require("pptxgenjs");
const fs = require("fs");

const OUT = "/home/claude/urbancart/outputs";
const j = (name) => JSON.parse(fs.readFileSync(`${OUT}/${name}`, "utf8"));

const audit = j("audit_report.json");
const cleaning = j("cleaning_report.json");
const sqlA = j("sql_analysis_summary.json");
const rfmC = j("rfm_cltv_summary.json");
const reg = j("regression_elasticity_montecarlo.json");
const rec = j("recommendation_engine_summary.json");
const fc = j("forecast_summary.json");

// ---- Palette: Midnight Executive ----
const NAVY = "1E2761";
const ICE = "CADCFC";
const WHITE = "FFFFFF";
const DARKTXT = "1A1A2E";
const MUTED = "6B7290";
const GOLD = "E8B84B"; // sharp accent, used sparingly

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.3 x 7.5
const PAGE_W = 13.33, PAGE_H = 7.5;

function titleBar(slide, kicker, title, opts = {}) {
  const color = opts.dark ? WHITE : DARKTXT;
  const kickerColor = opts.dark ? ICE : NAVY;
  slide.addText(kicker.toUpperCase(), {
    x: 0.6, y: 0.4, w: 8, h: 0.35, fontFace: "Calibri", fontSize: 13, bold: true,
    color: kickerColor, charSpacing: 2,
  });
  slide.addText(title, {
    x: 0.6, y: 0.72, w: 11.8, h: 0.9, fontFace: "Cambria", fontSize: 30, bold: true, color,
  });
}

function pageNum(slide, n, dark = false) {
  slide.addText(String(n).padStart(2, "0"), {
    x: 12.6, y: 7.05, w: 0.6, h: 0.35, fontFace: "Calibri", fontSize: 10,
    color: dark ? "8A90B8" : "A9ADC4", align: "right",
  });
}

function statCard(slide, x, y, w, h, value, label, opts = {}) {
  slide.addShape("roundRect", { x, y, w, h, rectRadius: 0.08, fill: { color: opts.fill || ICE }, line: { type: "none" } });
  slide.addText(value, { x: x + 0.15, y: y + 0.12, w: w - 0.3, h: h * 0.55, fontFace: "Cambria", fontSize: opts.valueSize || 30, bold: true, color: opts.valueColor || NAVY, align: "left", valign: "bottom" });
  slide.addText(label, { x: x + 0.15, y: y + h * 0.6, w: w - 0.3, h: h * 0.35, fontFace: "Calibri", fontSize: 11.5, color: opts.labelColor || MUTED, align: "left", valign: "top" });
}

// ============================================================
// SLIDE 1 — Title
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: NAVY };
  s.addText("UrbanCart", { x: 0.7, y: 2.5, w: 10, h: 1.1, fontFace: "Cambria", fontSize: 54, bold: true, color: WHITE });
  s.addText("Ecommerce Data & Analytics — Executive Summary", { x: 0.72, y: 3.55, w: 10, h: 0.6, fontFace: "Calibri", fontSize: 20, color: ICE });
  s.addText("Findings computed directly from ecommerce.db, the legacy customer export, and the 2024 product catalog.", {
    x: 0.72, y: 4.25, w: 9.5, h: 0.5, fontFace: "Calibri", fontSize: 13, italic: true, color: "9AA5D6",
  });
  s.addShape("ellipse", { x: 10.6, y: 4.6, w: 3.6, h: 3.6, fill: { color: "263080" }, line: { type: "none" } });
  s.addShape("ellipse", { x: 11.3, y: 5.3, w: 2.2, h: 2.2, fill: { color: "2E3A99" }, line: { type: "none" } });
  s.addShape("ellipse", { x: 11.9, y: 5.9, w: 1.0, h: 1.0, fill: { color: GOLD }, line: { type: "none" } });
}

// ============================================================
// SLIDE 2 — Scope note
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  titleBar(s, "Methodology", "What this deck is based on — and isn't");
  s.addShape("roundRect", { x: 0.6, y: 1.9, w: 5.9, h: 4.6, rectRadius: 0.08, fill: { color: ICE }, line: { type: "none" } });
  s.addText("Source of truth", { x: 0.95, y: 2.15, w: 5.2, h: 0.4, fontFace: "Calibri", fontSize: 16, bold: true, color: NAVY });
  s.addText([
    { text: "ecommerce.db — 6-table SQLite database (customers, products, orders, order_items, reviews, web_sessions)", options: { bullet: true, breakLine: true } },
    { text: "legacy_customers_export.csv — reconciled against customers", options: { bullet: true, breakLine: true } },
    { text: "product_catalog_2024.csv — reconciled against products by SKU", options: { bullet: true } },
  ], { x: 0.95, y: 2.65, w: 5.2, h: 3.6, fontFace: "Calibri", fontSize: 14, color: DARKTXT, paraSpaceAfter: 10, lineSpacingMultiple: 1.15 });

  s.addShape("roundRect", { x: 6.8, y: 1.9, w: 5.9, h: 4.6, rectRadius: 0.08, fill: { color: "FBF3E3" }, line: { type: "none" } });
  s.addText("Deprioritized", { x: 7.15, y: 2.15, w: 5.2, h: 0.4, fontFace: "Calibri", fontSize: 16, bold: true, color: "8A6116" });
  s.addText(
    "The supplied Master Specification document describes cloud/streaming infrastructure and cites specific \"achieved\" metrics that don't correspond to anything in this dataset. It was treated as aspirational narrative, not a source of numbers — every figure in this deck is computed independently from the raw data.",
    { x: 7.15, y: 2.65, w: 5.2, h: 3.6, fontFace: "Calibri", fontSize: 14, color: "5C450F", lineSpacingMultiple: 1.25 }
  );
  pageNum(s, 2);
}

// ============================================================
// SLIDE 3 — Dataset overview + order status chart
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  titleBar(s, "Dataset", "34 months of UrbanCart order history");

  const stats = [
    [audit.customers.n_rows.toLocaleString(), "Customers"],
    [audit.orders.n_rows.toLocaleString(), "Orders"],
    [audit.order_items.n_rows.toLocaleString(), "Order line items"],
    [audit.products.n_rows.toLocaleString(), "Products"],
  ];
  stats.forEach((st, i) => statCard(s, 0.6 + i * 3.0, 1.9, 2.75, 1.5, st[0], st[1]));

  const statusData = audit.orders.status_counts;
  s.addChart(pres.ChartType.doughnut, [{
    name: "Orders", labels: Object.keys(statusData), values: Object.values(statusData),
  }], {
    x: 0.6, y: 3.7, w: 5.3, h: 3.3,
    chartColors: [NAVY, GOLD, "8A90B8", "CADCFC"],
    showLegend: true, legendPos: "r", legendColor: DARKTXT, legendFontSize: 12,
    showTitle: true, title: "Order status breakdown", titleColor: DARKTXT, titleFontSize: 14,
    showValue: true, dataLabelColor: WHITE, dataLabelFontSize: 11, dataLabelPosition: "ctr",
    showPercent: false,
    dataBorder: { pt: 2, color: WHITE },
  });

  s.addShape("roundRect", { x: 6.3, y: 3.7, w: 6.4, h: 3.3, rectRadius: 0.08, fill: { color: ICE }, line: { type: "none" } });
  s.addText("Only 57% of orders are completed", { x: 6.65, y: 3.9, w: 5.7, h: 0.45, fontFace: "Calibri", fontSize: 15, bold: true, color: NAVY });
  s.addText(
    `${statusData.completed.toLocaleString()} completed, ${statusData.cancelled.toLocaleString()} cancelled, ${statusData.returned.toLocaleString()} returned, and ${statusData.pending.toLocaleString()} still pending. All revenue and customer-value figures in this deck use completed orders only — cancelled/returned/pending are excluded so segment and forecast numbers aren't inflated.`,
    { x: 6.65, y: 4.4, w: 5.7, h: 2.4, fontFace: "Calibri", fontSize: 13, color: DARKTXT, lineSpacingMultiple: 1.3 }
  );
  pageNum(s, 3);
}

// ============================================================
// SLIDE 4 — Data quality & cleaning
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  titleBar(s, "Data Quality", "Cleaning & reconciliation, by the numbers");

  const items = [
    [String(cleaning.legacy_customers_reconciliation.exact_duplicate_emails_dropped), "duplicate customer\nrecords removed"],
    [String(audit.order_items.exact_dup_rows_excl_pk), "duplicate order-item\nrows removed"],
    [String(audit.order_items.negative_qty_rows), "negative-quantity\nlines (returns) flagged"],
    [String(cleaning.catalog_reconciliation.price_mismatches_on_overlap), "of 255 SKUs have a\ncatalog price mismatch"],
  ];
  items.forEach((it, i) => statCard(s, 0.6 + i * 3.0, 1.9, 2.75, 1.7, it[0], it[1], { valueColor: NAVY }));

  s.addShape("roundRect", { x: 0.6, y: 3.85, w: 12.1, h: 2.9, rectRadius: 0.08, fill: { color: "FBF3E3" }, line: { type: "none" } });
  s.addText("Biggest finding: catalog pricing is systematically stale", { x: 0.95, y: 4.05, w: 11.4, h: 0.4, fontFace: "Calibri", fontSize: 15, bold: true, color: "8A6116" });
  s.addText(
    `${cleaning.catalog_reconciliation.price_mismatches_on_overlap} of ${cleaning.catalog_reconciliation.overlapping_skus} overlapping SKUs (99%) show a price gap between the supplier catalog and the internal product table, averaging $${cleaning.catalog_reconciliation.avg_abs_price_diff_on_overlap}/item. That's near-universal, not noise — worth a pricing-sync conversation with merchandising before it's trusted for any pricing decision. Separately, the legacy customer file used four different date formats in one column and needed fuzzy name-matching to catch near-duplicates without a reliable email key.`,
    { x: 0.95, y: 4.55, w: 11.4, h: 2.1, fontFace: "Calibri", fontSize: 13.5, color: "5C450F", lineSpacingMultiple: 1.3 }
  );
  pageNum(s, 4);
}

// ============================================================
// SLIDE 5 — RFM segmentation
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  titleBar(s, "Customer Segmentation", "RFM splits customers into 6 value tiers");

  const segs = rfmC.rfm_segment_summary.slice().sort((a, b) => b.n_customers - a.n_customers);
  s.addChart(pres.ChartType.bar, [{
    name: "Customers", labels: segs.map(x => x.segment), values: segs.map(x => x.n_customers),
  }], {
    x: 0.6, y: 1.85, w: 7.0, h: 4.9,
    barDir: "bar",
    chartColors: [NAVY],
    showTitle: true, title: "Customers per segment", titleColor: DARKTXT, titleFontSize: 14,
    showValue: true, dataLabelColor: DARKTXT, dataLabelFontSize: 11, dataLabelPosition: "outEnd",
    catAxisLabelColor: DARKTXT, catAxisLabelFontSize: 12,
    valAxisLabelColor: MUTED, valAxisLabelFontSize: 10,
    valGridLine: { color: "E5E7F2", size: 0.75 }, catGridLine: { style: "none" },
    showLegend: false,
  });

  s.addShape("roundRect", { x: 7.9, y: 1.85, w: 4.8, h: 4.9, rectRadius: 0.08, fill: { color: ICE }, line: { type: "none" } });
  s.addText("Segmentation logic", { x: 8.25, y: 2.1, w: 4.1, h: 0.4, fontFace: "Calibri", fontSize: 15, bold: true, color: NAVY });
  s.addText(
    "Each customer is scored 1–5 on Recency, Frequency, and Monetary quintiles, then bucketed:",
    { x: 8.25, y: 2.55, w: 4.1, h: 0.7, fontFace: "Calibri", fontSize: 12.5, color: DARKTXT, lineSpacingMultiple: 1.2 }
  );
  s.addText([
    { text: "Champions — top on all three", options: { bullet: true, breakLine: true } },
    { text: "Loyal Customers — recent + frequent", options: { bullet: true, breakLine: true } },
    { text: "At Risk (High Value) — used to spend, now quiet", options: { bullet: true, breakLine: true } },
    { text: "Hibernating/Lost — bottom on all three", options: { bullet: true, breakLine: true } },
    { text: "New/Promising & Needs Attention — the rest", options: { bullet: true } },
  ], { x: 8.25, y: 3.25, w: 4.1, h: 3.3, fontFace: "Calibri", fontSize: 12, color: DARKTXT, paraSpaceAfter: 8, lineSpacingMultiple: 1.15 });
  pageNum(s, 5);
}

// ============================================================
// SLIDE 6 — CLTV by segment
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  titleBar(s, "Lifetime Value", "Where the value actually sits");

  const cltvSeg = Object.entries(rfmC.cltv_summary.cltv_by_segment).sort((a, b) => b[1] - a[1]);
  s.addChart(pres.ChartType.bar, [{
    name: "Avg CLTV ($)", labels: cltvSeg.map(x => x[0]), values: cltvSeg.map(x => Math.round(x[1])),
  }], {
    x: 0.6, y: 1.85, w: 7.6, h: 4.9,
    barDir: "bar",
    chartColors: [NAVY],
    showTitle: true, title: "Avg. predicted CLTV by segment ($)", titleColor: DARKTXT, titleFontSize: 14,
    showValue: true, dataLabelColor: DARKTXT, dataLabelFontSize: 11, dataLabelPosition: "outEnd",
    catAxisLabelColor: DARKTXT, catAxisLabelFontSize: 12,
    valAxisLabelColor: MUTED, valAxisLabelFontSize: 10,
    valGridLine: { color: "E5E7F2", size: 0.75 }, catGridLine: { style: "none" },
    showLegend: false,
  });

  statCard(s, 8.5, 1.85, 4.2, 1.4, `$${rfmC.cltv_summary.mean_predicted_cltv.toLocaleString()}`, "Mean predicted CLTV\n(median $" + rfmC.cltv_summary.median_predicted_cltv.toLocaleString() + ")", { fill: ICE });
  statCard(s, 8.5, 3.4, 4.2, 1.4, `${(rfmC.cltv_summary.avg_gross_margin_rate * 100).toFixed(1)}%`, "Average gross margin rate\nused in the CLTV formula", { fill: ICE });
  s.addShape("roundRect", { x: 8.5, y: 4.95, w: 4.2, h: 1.8, rectRadius: 0.08, fill: { color: "FBF3E3" }, line: { type: "none" } });
  s.addText("Priority", { x: 8.75, y: 5.1, w: 3.7, h: 0.3, fontFace: "Calibri", fontSize: 12, bold: true, color: "8A6116" });
  s.addText("At Risk (High Value) customers average $2,734 in CLTV but have gone quiet — the highest-leverage reactivation target.", { x: 8.75, y: 5.4, w: 3.7, h: 1.3, fontFace: "Calibri", fontSize: 11.5, color: "5C450F", lineSpacingMultiple: 1.2 });
  pageNum(s, 6);
}

// ============================================================
// SLIDE 7 — Cohort retention
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  titleBar(s, "Retention", "Monthly cohort retention stays flat, not steep");

  const ret = sqlA.avg_retention_curve_by_month_offset;
  const months = Object.keys(ret).sort((a, b) => Number(a) - Number(b));
  s.addChart(pres.ChartType.line, [{
    name: "Retention rate", labels: months.map(m => `M${m}`), values: months.map(m => Math.round(ret[m] * 1000) / 10),
  }], {
    x: 0.6, y: 1.9, w: 8.4, h: 4.8,
    chartColors: [NAVY],
    lineSize: 3, lineDataSymbol: "circle", lineDataSymbolSize: 6,
    showTitle: true, title: "Avg. retention rate by month since signup (%)", titleColor: DARKTXT, titleFontSize: 14,
    showValue: false,
    catAxisLabelColor: MUTED, catAxisLabelFontSize: 10,
    valAxisLabelColor: MUTED, valAxisLabelFontSize: 10,
    valAxisTitle: "% of cohort active", showValAxisTitle: true, valAxisTitleColor: MUTED, valAxisTitleFontSize: 11,
    valGridLine: { color: "E5E7F2", size: 0.75 }, catGridLine: { style: "none" },
    showLegend: false,
  });

  s.addShape("roundRect", { x: 9.3, y: 1.9, w: 3.4, h: 4.8, rectRadius: 0.08, fill: { color: ICE }, line: { type: "none" } });
  s.addText("Reading this chart", { x: 9.6, y: 2.15, w: 2.9, h: 0.4, fontFace: "Calibri", fontSize: 14, bold: true, color: NAVY });
  s.addText(
    "Retention hovers in the 7–13% band for all 12 months, instead of the steep early drop-off typical of real cohorts. Order timing doesn't appear strongly coupled to signup date in this dataset — worth validating against a larger or more recent data pull.",
    { x: 9.6, y: 2.65, w: 2.9, h: 3.9, fontFace: "Calibri", fontSize: 12.5, color: DARKTXT, lineSpacingMultiple: 1.3 }
  );
  pageNum(s, 7);
}

// ============================================================
// SLIDE 8 — Basket / regression / elasticity (inconclusive findings)
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: NAVY };
  titleBar(s, "What the data doesn't support", "Three models came back statistically flat", { dark: true });

  const cols = [
    {
      h: "Market basket lift", body: "Every category pair has lift ≤ 1 — no cross-category combo sells together more than chance predicts. SKU-level lift is driven by orders as small as 3–5 and shouldn't drive bundling decisions yet.",
    },
    {
      h: "Price elasticity", body: `Overall elasticity: ${reg.price_elasticity_by_category.__overall__.elasticity} (t = ${reg.price_elasticity_by_category.__overall__.t_stat}). Every category is statistically indistinguishable from zero — quantity sold shows no measurable link to price here.`,
    },
    {
      h: "Spend regression", body: `R² = ${reg.regression_monetary_value.r2} predicting customer spend from age, frequency, recency. Only purchase frequency is significant (t = ${reg.regression_monetary_value.coefficients.frequency.t_stat}); age and recency aren't.`,
    },
  ];
  cols.forEach((c, i) => {
    const x = 0.6 + i * 4.15;
    s.addShape("roundRect", { x, y: 1.9, w: 3.85, h: 4.7, rectRadius: 0.08, fill: { color: "263080" }, line: { type: "none" } });
    s.addText(c.h, { x: x + 0.3, y: 2.15, w: 3.25, h: 0.6, fontFace: "Calibri", fontSize: 15, bold: true, color: GOLD });
    s.addText(c.body, { x: x + 0.3, y: 2.85, w: 3.25, h: 3.5, fontFace: "Calibri", fontSize: 12.5, color: ICE, lineSpacingMultiple: 1.3 });
  });
  pageNum(s, 8, true);
}

// ============================================================
// SLIDE 9 — Monte Carlo + Forecast
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  titleBar(s, "Revenue Outlook", "12-month range vs. 6-month trend");

  const mc = reg.monte_carlo_revenue_simulation;
  s.addChart(pres.ChartType.bar, [{
    name: "Revenue ($)", labels: ["P10 (downside)", "P50 (median)", "P90 (upside)"], values: [mc.simulated_next_12mo_revenue_p10, mc.simulated_next_12mo_revenue_p50, mc.simulated_next_12mo_revenue_p90],
  }], {
    x: 0.6, y: 1.9, w: 6.0, h: 4.7,
    chartColors: [NAVY, GOLD, NAVY],
    showTitle: true, title: "Monte Carlo: next-12-mo revenue (10,000 runs)", titleColor: DARKTXT, titleFontSize: 13,
    showValue: true, dataLabelColor: DARKTXT, dataLabelFontSize: 10, dataLabelPosition: "outEnd", dataLabelFormatCode: "$#,##0,K",
    catAxisLabelColor: DARKTXT, catAxisLabelFontSize: 11,
    valAxisLabelColor: MUTED, valAxisLabelFontSize: 9, valAxisLabelFormatCode: "$#,##0,K",
    valGridLine: { color: "E5E7F2", size: 0.75 }, catGridLine: { style: "none" },
    showLegend: false,
  });

  const fcRows = fc.forecast_next_6_months;
  s.addChart(pres.ChartType.line, [
    { name: "Holt forecast", labels: fcRows.map(r => r.month), values: fcRows.map(r => Math.round(r.holt_forecast)) },
    { name: "Linear trend", labels: fcRows.map(r => r.month), values: fcRows.map(r => Math.round(r.linear_trend_forecast)) },
  ], {
    x: 6.8, y: 1.9, w: 5.9, h: 4.7,
    chartColors: [NAVY, GOLD],
    lineSize: 3, lineDataSymbol: "circle", lineDataSymbolSize: 5,
    showTitle: true, title: "6-month revenue forecast ($)", titleColor: DARKTXT, titleFontSize: 13,
    showValue: false,
    catAxisLabelColor: MUTED, catAxisLabelFontSize: 9,
    valAxisLabelColor: MUTED, valAxisLabelFontSize: 9, valAxisLabelFormatCode: "$#,##0,K",
    valGridLine: { color: "E5E7F2", size: 0.75 }, catGridLine: { style: "none" },
    showLegend: true, legendPos: "b", legendColor: DARKTXT, legendFontSize: 10,
  });
  pageNum(s, 9);
}

// ============================================================
// SLIDE 10 — Recommendation engine
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  titleBar(s, "Recommendation Engine", "Item-based collaborative filtering, built from scratch");

  statCard(s, 0.6, 1.9, 3.6, 1.5, rec.n_customers_with_purchases.toLocaleString(), "customers in the\npurchase matrix");
  statCard(s, 4.4, 1.9, 3.6, 1.5, rec.n_products_with_purchases.toLocaleString(), "products in the\npurchase matrix");
  statCard(s, 8.2, 1.9, 4.3, 1.5, `${rec.matrix_sparsity_pct}%`, "matrix sparsity —\ncosine similarity handles it");

  const exKey = Object.keys(rec.example_similar_items)[0];
  const exItems = rec.example_similar_items[exKey];
  s.addShape("roundRect", { x: 0.6, y: 3.7, w: 12.0, h: 3.0, rectRadius: 0.08, fill: { color: ICE }, line: { type: "none" } });
  s.addText(`Example: products most similar to "${exKey}"`, { x: 0.95, y: 3.9, w: 11.3, h: 0.4, fontFace: "Calibri", fontSize: 15, bold: true, color: NAVY });
  exItems.forEach((it, i) => {
    const x = 0.95 + i * 3.9;
    s.addShape("roundRect", { x, y: 4.5, w: 3.6, h: 1.9, rectRadius: 0.06, fill: { color: WHITE }, line: { type: "none" } });
    s.addText(it.name, { x: x + 0.2, y: 4.65, w: 3.2, h: 0.9, fontFace: "Calibri", fontSize: 13, bold: true, color: DARKTXT, valign: "top" });
    s.addText(`Cosine similarity: ${it.similarity}`, { x: x + 0.2, y: 5.6, w: 3.2, h: 0.5, fontFace: "Calibri", fontSize: 11.5, color: MUTED });
  });
  pageNum(s, 10);
}

// ============================================================
// SLIDE 11 — Recommendations / conclusions
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: NAVY };
  titleBar(s, "Recommendations", "Four next steps", { dark: true });

  const recs = [
    "Reactivate the 210 At Risk (High Value) customers ($2,734 avg CLTV) and 535 Hibernating/Lost customers — the largest addressable value pool found.",
    "Resolve the catalog-vs-internal pricing gap (99% of overlapping SKUs) with merchandising before using either price source for decisions.",
    "Treat basket-affinity and elasticity results as inconclusive until more transaction history accumulates — don't act on them yet.",
    "Plan 12-month revenue off the Monte Carlo P10–P90 range ($2.13M–$2.98M), not a single forecast number.",
  ];
  recs.forEach((r, i) => {
    const y = 1.95 + i * 1.2;
    s.addShape("ellipse", { x: 0.7, y: y, w: 0.55, h: 0.55, fill: { color: GOLD }, line: { type: "none" } });
    s.addText(String(i + 1), { x: 0.7, y: y, w: 0.55, h: 0.55, fontFace: "Cambria", fontSize: 20, bold: true, color: NAVY, align: "center", valign: "middle" });
    s.addText(r, { x: 1.5, y: y - 0.05, w: 11.2, h: 1.0, fontFace: "Calibri", fontSize: 15, color: WHITE, valign: "middle", lineSpacingMultiple: 1.2 });
  });
  pageNum(s, 11, true);
}

pres.writeFile({ fileName: `${OUT}/UrbanCart_Summary_Deck.pptx` }).then(() => console.log("done"));
