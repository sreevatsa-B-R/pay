const { query } = require('../config/db');

// ── DASHBOARD ANALYTICS ───────────────────────────────────────────────────────
const getDashboardAnalytics = async (req, res) => {
  try {
    const { year, month, location, department } = req.query;

    const salaryParams = [];
    let salaryFilter = 'WHERE 1=1';
    if (year)  { salaryParams.push(year);  salaryFilter += ` AND sr.year=$${salaryParams.length}`; }
    if (month) { salaryParams.push(month); salaryFilter += ` AND sr.month=$${salaryParams.length}`; }

    const empParams = [];
    let empFilter = 'WHERE is_active=true';
    if (location)   { empParams.push(location);   empFilter += ` AND location=$${empParams.length}`; }

    const [
      totals, empCount, monthlyTrend, locationWise,
      dedBreakdown, topEarners, payoutStatus, fnfCount,
      earningsComponents, headcountByLocation
    ] = await Promise.all([

      // KPI totals
      query(`SELECT
        COALESCE(SUM(gross_earnings),0) AS total_gross,
        COALESCE(SUM(total_deductions),0) AS total_deductions,
        COALESCE(SUM(net_pay),0) AS total_net,
        COALESCE(AVG(net_pay),0) AS avg_net,
        COUNT(*) AS record_count
        FROM salary_records sr ${salaryFilter}`, salaryParams),

      // Employee counts
      query(`SELECT
        COUNT(*) FILTER (WHERE is_active=true) AS active,
        COUNT(*) FILTER (WHERE is_active=false) AS inactive,
        COUNT(*) AS total
        FROM employees`),

      // Monthly trend (last 12 months of data)
      query(`SELECT month, year,
        COALESCE(SUM(gross_earnings),0) AS gross,
        COALESCE(SUM(net_pay),0) AS net,
        COALESCE(SUM(total_deductions),0) AS deductions,
        COUNT(*) AS emp_count
        FROM salary_records
        WHERE (year * 100 + CASE month
          WHEN 'January' THEN 1 WHEN 'February' THEN 2 WHEN 'March' THEN 3
          WHEN 'April' THEN 4 WHEN 'May' THEN 5 WHEN 'June' THEN 6
          WHEN 'July' THEN 7 WHEN 'August' THEN 8 WHEN 'September' THEN 9
          WHEN 'October' THEN 10 WHEN 'November' THEN 11 WHEN 'December' THEN 12
          END) >= (EXTRACT(YEAR FROM NOW())::int * 100 + EXTRACT(MONTH FROM NOW())::int - 12)
        GROUP BY month, year
        ORDER BY year, CASE month
          WHEN 'January' THEN 1 WHEN 'February' THEN 2 WHEN 'March' THEN 3
          WHEN 'April' THEN 4 WHEN 'May' THEN 5 WHEN 'June' THEN 6
          WHEN 'July' THEN 7 WHEN 'August' THEN 8 WHEN 'September' THEN 9
          WHEN 'October' THEN 10 WHEN 'November' THEN 11 WHEN 'December' THEN 12
          END`),

      // Location-wise payroll
      query(`SELECT e.location,
        COUNT(DISTINCT sr.emp_id) AS emp_count,
        COALESCE(SUM(sr.gross_earnings),0) AS total_gross,
        COALESCE(SUM(sr.net_pay),0) AS total_net,
        COALESCE(AVG(sr.net_pay),0) AS avg_net
        FROM salary_records sr
        JOIN employees e ON sr.emp_id=e.emp_id
        ${salaryFilter}
        GROUP BY e.location ORDER BY total_gross DESC LIMIT 10`, salaryParams),

      // Deduction breakdown
      query(`SELECT
        COALESCE(SUM(pf),0) AS pf,
        COALESCE(SUM(pt),0) AS pt,
        COALESCE(SUM(esi),0) AS esi,
        COALESCE(SUM(tds),0) AS tds,
        COALESCE(SUM(tds_lwf),0) AS tds_lwf,
        COALESCE(SUM(gmi),0) AS gmi,
        COALESCE(SUM(other_deductions),0) AS other_deductions,
        COALESCE(SUM(total_deductions),0) AS total
        FROM salary_records sr ${salaryFilter}`, salaryParams),

      // Top earners
      query(`SELECT sr.emp_id, e.name, e.designation, e.location,
        sr.gross_earnings, sr.net_pay
        FROM salary_records sr
        JOIN employees e ON sr.emp_id=e.emp_id
        ${salaryFilter}
        ORDER BY sr.gross_earnings DESC LIMIT 5`, salaryParams),

      // Payout status counts
      query(`SELECT status, COUNT(*) AS count, COALESCE(SUM(net_amount),0) AS total
        FROM payouts GROUP BY status`),

      // F&F counts
      query(`SELECT status, COUNT(*) AS count FROM fnf_settlements GROUP BY status`),

      // Earnings component breakdown (for stacked chart)
      query(`SELECT
        COALESCE(SUM(basic),0) AS basic,
        COALESCE(SUM(hra),0) AS hra,
        COALESCE(SUM(special_allowance),0) AS special_allowance,
        COALESCE(SUM(statutory_bonus),0) AS statutory_bonus,
        COALESCE(SUM(conv_allowance),0) AS conv_allowance,
        COALESCE(SUM(medical_allowance),0) AS medical_allowance,
        COALESCE(SUM(consultant_fee),0) AS consultant_fee,
        COALESCE(SUM(other_allowances),0) AS other_allowances
        FROM salary_records sr ${salaryFilter}`, salaryParams),

      // Headcount by location
      query(`SELECT location, COUNT(*) AS count FROM employees WHERE is_active=true GROUP BY location ORDER BY count DESC LIMIT 8`),
    ]);

    res.json({
      kpis: { ...totals.rows[0], ...empCount.rows[0] },
      monthlyTrend: monthlyTrend.rows,
      locationWise: locationWise.rows,
      deductionBreakdown: dedBreakdown.rows[0],
      topEarners: topEarners.rows,
      payoutStatus: payoutStatus.rows,
      fnfStatus: fnfCount.rows,
      earningsComponents: earningsComponents.rows[0],
      headcountByLocation: headcountByLocation.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// ── REPORTS ──────────────────────────────────────────────────────────────────
const getPayrollReport = async (req, res) => {
  try {
    const { year, month, location, emp_id } = req.query;
    const params = []; let filter = 'WHERE 1=1';
    if (year)     { params.push(year);     filter += ` AND sr.year=$${params.length}`; }
    if (month)    { params.push(month);    filter += ` AND sr.month=$${params.length}`; }
    if (location) { params.push(location); filter += ` AND e.location=$${params.length}`; }
    if (emp_id)   { params.push(emp_id);   filter += ` AND sr.emp_id=$${params.length}`; }

    const result = await query(`
      SELECT sr.*, e.name, e.designation, e.location, e.state, e.client_lob,
             e.bank_name, e.account_no, e.salary_mode, e.pan_aadhaar, e.contact
      FROM salary_records sr
      JOIN employees e ON sr.emp_id=e.emp_id
      ${filter}
      ORDER BY sr.year DESC, CASE sr.month
        WHEN 'January' THEN 1 WHEN 'February' THEN 2 WHEN 'March' THEN 3
        WHEN 'April' THEN 4 WHEN 'May' THEN 5 WHEN 'June' THEN 6
        WHEN 'July' THEN 7 WHEN 'August' THEN 8 WHEN 'September' THEN 9
        WHEN 'October' THEN 10 WHEN 'November' THEN 11 WHEN 'December' THEN 12
        END, e.name`, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const getPayoutReport = async (req, res) => {
  try {
    const { year, month, status, location } = req.query;
    const params = []; let filter = 'WHERE 1=1';
    if (year)     { params.push(year);     filter += ` AND p.year=$${params.length}`; }
    if (month)    { params.push(month);    filter += ` AND p.month=$${params.length}`; }
    if (status)   { params.push(status);   filter += ` AND p.status=$${params.length}`; }
    if (location) { params.push(location); filter += ` AND e.location=$${params.length}`; }

    const result = await query(`
      SELECT p.*, e.name, e.designation, e.location, e.bank_name, e.account_no,
             u1.username AS processed_by_name, u2.username AS paid_by_name
      FROM payouts p
      JOIN employees e ON p.emp_id=e.emp_id
      LEFT JOIN users u1 ON p.processed_by=u1.id
      LEFT JOIN users u2 ON p.paid_by=u2.id
      ${filter}
      ORDER BY p.year DESC, p.month, e.name`, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const getFnfReport = async (req, res) => {
  try {
    const { status, separation_type, year } = req.query;
    const params = []; let filter = 'WHERE 1=1';
    if (status)          { params.push(status);          filter += ` AND f.status=$${params.length}`; }
    if (separation_type) { params.push(separation_type); filter += ` AND f.separation_type=$${params.length}`; }
    if (year)            { params.push(year);            filter += ` AND EXTRACT(YEAR FROM f.last_working_date)=$${params.length}`; }

    const result = await query(`
      SELECT f.*, e.name, e.designation, e.location, e.date_of_joining,
             e.bank_name, e.account_no
      FROM fnf_settlements f
      JOIN employees e ON f.emp_id=e.emp_id
      ${filter}
      ORDER BY f.created_at DESC`, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const getAllowanceReport = async (req, res) => {
  try {
    const { emp_id, location, calc_type } = req.query;
    const params = []; let filter = 'WHERE ea.is_active=true';
    if (emp_id)    { params.push(emp_id);    filter += ` AND ea.emp_id=$${params.length}`; }
    if (location)  { params.push(location);  filter += ` AND e.location=$${params.length}`; }
    if (calc_type) { params.push(calc_type); filter += ` AND ea.calc_type=$${params.length}`; }

    const result = await query(`
      SELECT ea.*, at.name AS type_name, at.code, at.is_taxable,
             e.name AS emp_name, e.designation, e.location,
             CASE WHEN ea.calc_type='percent'
               THEN (SELECT sr.basic FROM salary_records sr WHERE sr.emp_id=ea.emp_id ORDER BY sr.year DESC LIMIT 1) * ea.value/100
               ELSE ea.value END AS computed_amount
      FROM employee_allowances ea
      JOIN allowance_types at ON ea.allowance_type_id=at.id
      JOIN employees e ON ea.emp_id=e.emp_id
      ${filter}
      ORDER BY e.name, at.name`, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const getLocations = async (req, res) => {
  try {
    const r = await query(`SELECT DISTINCT location FROM employees WHERE location IS NOT NULL AND location != '' ORDER BY location`);
    res.json(r.rows.map(x => x.location));
  } catch (err) { res.status(500).json({ error: err.message }); }
};

module.exports = { getDashboardAnalytics, getPayrollReport, getPayoutReport, getFnfReport, getAllowanceReport, getLocations };
