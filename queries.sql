-- ============================================================================
-- UrbanCart — Phase 1: SQL Exploration & Data Profiling
-- ============================================================================
-- Runnable standalone against ecommerce.db:
--     sqlite3 ecommerce.db < queries.sql
-- or loaded query-by-query in a SQLite browser / DB Browser for SQLite.
--
-- Sections:
--   1.1  Schema overview
--   1.2  Row counts & basic profiling
--   1.3  Data quality checks (missing values, duplicates, referential integrity)
--   1.4  Outlier detection
--   1.5  Monthly cohort retention
--   1.6  Market basket analysis (SKU pairs)
--   1.7  Category-level affinity
--   1.8  Revenue aggregations (used downstream for forecasting / Monte Carlo)
-- ============================================================================


-- ============================================================================
-- 1.1  SCHEMA OVERVIEW
-- ============================================================================

-- List all tables in the database
SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;

-- Full column definitions for every table
SELECT m.name AS table_name, p.cid, p.name AS column_name, p.type, p."notnull", p.pk
FROM sqlite_master m
JOIN pragma_table_info(m.name) p
WHERE m.type = 'table'
ORDER BY m.name, p.cid;


-- ============================================================================
-- 1.2  ROW COUNTS & BASIC PROFILING
-- ============================================================================

SELECT 'customers' AS table_name, COUNT(*) AS n_rows FROM customers
UNION ALL SELECT 'products', COUNT(*) FROM products
UNION ALL SELECT 'orders', COUNT(*) FROM orders
UNION ALL SELECT 'order_items', COUNT(*) FROM order_items
UNION ALL SELECT 'reviews', COUNT(*) FROM reviews
UNION ALL SELECT 'web_sessions', COUNT(*) FROM web_sessions;

-- Customer signup date range
SELECT MIN(signup_date) AS earliest_signup, MAX(signup_date) AS latest_signup FROM customers;

-- Order date range
SELECT MIN(order_date) AS earliest_order, MAX(order_date) AS latest_order FROM orders;

-- Distinct categorical values
SELECT DISTINCT status FROM orders ORDER BY status;
SELECT DISTINCT payment_method FROM orders ORDER BY payment_method;
SELECT DISTINCT category FROM products ORDER BY category;
SELECT DISTINCT gender FROM customers ORDER BY gender;
SELECT DISTINCT country FROM customers ORDER BY country;


-- ============================================================================
-- 1.3  DATA QUALITY CHECKS
-- ============================================================================

-- Missing values per column (customers)
SELECT
    SUM(CASE WHEN name IS NULL THEN 1 ELSE 0 END) AS missing_name,
    SUM(CASE WHEN email IS NULL THEN 1 ELSE 0 END) AS missing_email,
    SUM(CASE WHEN age IS NULL THEN 1 ELSE 0 END) AS missing_age,
    SUM(CASE WHEN gender IS NULL THEN 1 ELSE 0 END) AS missing_gender,
    SUM(CASE WHEN city IS NULL THEN 1 ELSE 0 END) AS missing_city,
    SUM(CASE WHEN country IS NULL THEN 1 ELSE 0 END) AS missing_country,
    SUM(CASE WHEN signup_date IS NULL THEN 1 ELSE 0 END) AS missing_signup_date
FROM customers;

-- Missing values per column (products)
SELECT
    SUM(CASE WHEN name IS NULL THEN 1 ELSE 0 END) AS missing_name,
    SUM(CASE WHEN category IS NULL THEN 1 ELSE 0 END) AS missing_category,
    SUM(CASE WHEN unit_price IS NULL THEN 1 ELSE 0 END) AS missing_price,
    SUM(CASE WHEN cost IS NULL THEN 1 ELSE 0 END) AS missing_cost
FROM products;

-- Duplicate customer emails (normalized)
SELECT LOWER(TRIM(email)) AS email_norm, COUNT(*) AS n
FROM customers
GROUP BY email_norm
HAVING COUNT(*) > 1;

-- Exact duplicate order_items rows (ignoring the primary key)
SELECT order_id, product_id, quantity, unit_price, discount, COUNT(*) AS n
FROM order_items
GROUP BY order_id, product_id, quantity, unit_price, discount
HAVING COUNT(*) > 1;

-- Referential integrity: orders with no matching customer
SELECT o.order_id, o.customer_id
FROM orders o
LEFT JOIN customers c ON c.customer_id = o.customer_id
WHERE c.customer_id IS NULL;

-- Referential integrity: order_items with no matching order
SELECT oi.order_item_id, oi.order_id
FROM order_items oi
LEFT JOIN orders o ON o.order_id = oi.order_id
WHERE o.order_id IS NULL;

-- Referential integrity: order_items with no matching product
SELECT oi.order_item_id, oi.product_id
FROM order_items oi
LEFT JOIN products p ON p.product_id = oi.product_id
WHERE p.product_id IS NULL;

-- Referential integrity: reviews with no matching customer or product
SELECT r.review_id, r.customer_id, r.product_id
FROM reviews r
LEFT JOIN customers c ON c.customer_id = r.customer_id
LEFT JOIN products p ON p.product_id = r.product_id
WHERE c.customer_id IS NULL OR p.product_id IS NULL;

-- Invalid review ratings (outside 1-5)
SELECT * FROM reviews WHERE rating < 1 OR rating > 5;

-- Negative-quantity order_items (returns)
SELECT * FROM order_items WHERE quantity < 0;

-- Discount values outside a sane [0, 1] range
SELECT * FROM order_items WHERE discount < 0 OR discount > 1;

-- Age values outside a sane [10, 100] range
SELECT * FROM customers WHERE age < 10 OR age > 100;


-- ============================================================================
-- 1.4  OUTLIER DETECTION (IQR method on product price)
-- ============================================================================

WITH ordered AS (
    SELECT unit_price,
           NTILE(4) OVER (ORDER BY unit_price) AS quartile
    FROM products
),
bounds AS (
    SELECT
        MAX(CASE WHEN quartile = 1 THEN unit_price END) AS q1_max,
        MIN(CASE WHEN quartile = 3 THEN unit_price END) AS q3_min
    FROM ordered
)
SELECT p.*
FROM products p, bounds b
WHERE p.unit_price < (b.q1_max - 3 * (b.q3_min - b.q1_max))
   OR p.unit_price > (b.q3_min + 3 * (b.q3_min - b.q1_max));

-- Products where cost exceeds the selling price (margin < 0)
SELECT * FROM products WHERE cost > unit_price;


-- ============================================================================
-- 1.5  MONTHLY COHORT RETENTION
-- ============================================================================
-- Retention rate = distinct customers from a signup cohort placing a
-- completed order N months later, divided by the cohort's size.

WITH cohort AS (
    SELECT customer_id, strftime('%Y-%m', signup_date) AS cohort_month
    FROM customers
),
activity AS (
    SELECT o.customer_id, strftime('%Y-%m', o.order_date) AS order_month
    FROM orders o
    WHERE o.status = 'completed'
),
joined AS (
    SELECT
        c.cohort_month,
        a.customer_id,
        (CAST(strftime('%Y', a.order_month || '-01') AS INT) - CAST(strftime('%Y', c.cohort_month || '-01') AS INT)) * 12
        + (CAST(strftime('%m', a.order_month || '-01') AS INT) - CAST(strftime('%m', c.cohort_month || '-01') AS INT)) AS month_offset
    FROM cohort c
    JOIN activity a ON a.customer_id = c.customer_id
),
cohort_size AS (
    SELECT strftime('%Y-%m', signup_date) AS cohort_month, COUNT(*) AS n
    FROM customers
    GROUP BY cohort_month
)
SELECT
    j.cohort_month,
    j.month_offset,
    COUNT(DISTINCT j.customer_id) AS active_customers,
    cs.n AS cohort_size,
    ROUND(CAST(COUNT(DISTINCT j.customer_id) AS FLOAT) / cs.n, 4) AS retention_rate
FROM joined j
JOIN cohort_size cs ON cs.cohort_month = j.cohort_month
WHERE j.month_offset BETWEEN 0 AND 11
GROUP BY j.cohort_month, j.month_offset
ORDER BY j.cohort_month, j.month_offset;


-- ============================================================================
-- 1.6  MARKET BASKET ANALYSIS — SKU PAIRS (support / confidence / lift)
-- ============================================================================

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


-- ============================================================================
-- 1.7  CATEGORY-LEVEL AFFINITY
-- ============================================================================
-- SKU-level lift is sparse/noisy at this data volume; category-level pairs
-- give a more stable read on cross-category purchase behavior.

WITH items AS (
    SELECT oi.order_id, p.category
    FROM order_items oi
    JOIN products p ON p.product_id = oi.product_id
    JOIN orders o ON o.order_id = oi.order_id
    WHERE o.status = 'completed' AND oi.quantity > 0
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
total_orders AS (
    SELECT COUNT(DISTINCT order_id) AS n FROM distinct_pairs
),
cat_counts AS (
    SELECT category, COUNT(DISTINCT order_id) AS orders_with_cat
    FROM distinct_pairs GROUP BY category
)
SELECT
    pc.cat_a, pc.cat_b, pc.pair_orders, t.n AS total_orders,
    ROUND(CAST(pc.pair_orders AS FLOAT)/t.n, 4) AS support,
    ROUND((CAST(pc.pair_orders AS FLOAT)/t.n) / ((CAST(ca.orders_with_cat AS FLOAT)/t.n)*(CAST(cb.orders_with_cat AS FLOAT)/t.n)), 4) AS lift
FROM pair_counts pc
JOIN total_orders t
JOIN cat_counts ca ON ca.category = pc.cat_a
JOIN cat_counts cb ON cb.category = pc.cat_b
ORDER BY lift DESC;


-- ============================================================================
-- 1.8  REVENUE AGGREGATIONS
-- ============================================================================
-- Feeds the Phase 4 forecasting and Monte Carlo simulation.

-- Monthly completed-order revenue
SELECT
    strftime('%Y-%m', o.order_date) AS month,
    SUM(oi.quantity * oi.unit_price * (1 - oi.discount)) AS revenue,
    COUNT(DISTINCT o.order_id) AS n_orders
FROM orders o
JOIN order_items oi ON oi.order_id = o.order_id
WHERE o.status = 'completed'
GROUP BY month
ORDER BY month;

-- Revenue by product category
SELECT
    p.category,
    SUM(oi.quantity * oi.unit_price * (1 - oi.discount)) AS revenue,
    COUNT(DISTINCT oi.order_id) AS n_orders
FROM order_items oi
JOIN products p ON p.product_id = oi.product_id
JOIN orders o ON o.order_id = oi.order_id
WHERE o.status = 'completed'
GROUP BY p.category
ORDER BY revenue DESC;

-- Top 20 customers by lifetime completed-order spend
SELECT
    c.customer_id, c.name, c.email,
    SUM(oi.quantity * oi.unit_price * (1 - oi.discount)) AS lifetime_spend,
    COUNT(DISTINCT o.order_id) AS n_orders
FROM customers c
JOIN orders o ON o.customer_id = c.customer_id
JOIN order_items oi ON oi.order_id = o.order_id
WHERE o.status = 'completed'
GROUP BY c.customer_id, c.name, c.email
ORDER BY lifetime_spend DESC
LIMIT 20;

-- Average order value by payment method
SELECT
    o.payment_method,
    COUNT(DISTINCT o.order_id) AS n_orders,
    ROUND(AVG(order_total.total), 2) AS avg_order_value
FROM orders o
JOIN (
    SELECT order_id, SUM(quantity * unit_price * (1 - discount)) AS total
    FROM order_items
    GROUP BY order_id
) order_total ON order_total.order_id = o.order_id
WHERE o.status = 'completed'
GROUP BY o.payment_method
ORDER BY avg_order_value DESC;
