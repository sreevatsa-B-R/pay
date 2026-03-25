const { query } = require('../config/db');

const getAll = async (req, res) => {
  try {
    const { month, year, emp_id } = req.query;
    let sql = `
      SELECT sr.*, e.name, e.designation, e.location, e.state, e.client_lob
      FROM salary_records sr
      JOIN employees e ON sr.emp_id = e.emp_id
      WHERE 1=1`;
    const params = [];
    if (emp_id) { params.push(emp_id); sql += ` AND sr.emp_id = $${params.length}`; }
    if (month)  { params.push(month);  sql += ` AND sr.month = $${params.length}`; }
    if (year)   { params.push(year);   sql += ` AND sr.year = $${params.length}`; }
    sql += ` ORDER BY sr.year DESC, sr.month, e.name`;
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const upsert = async (req, res) => {
  try {
    const {
      emp_id, month, year,
      basic, hra, conv_allowance, medical_allowance, special_allowance,
      statutory_bonus, consultant_fee, other_allowances, leave_encashment,
      pf, pt, esi, tds, tds_lwf, gmi, other_deductions
    } = req.body;

    if (!emp_id || !month || !year) return res.status(400).json({ error: 'emp_id, month, year required' });

    // Verify employee exists
    const empCheck = await query('SELECT emp_id FROM employees WHERE emp_id=$1', [emp_id]);
    if (!empCheck.rows.length) return res.status(404).json({ error: 'Employee not found' });

    const n = v => parseFloat(v) || 0;

    const result = await query(`
      INSERT INTO salary_records
        (emp_id, month, year, basic, hra, conv_allowance, medical_allowance, special_allowance,
         statutory_bonus, consultant_fee, other_allowances, leave_encashment,
         pf, pt, esi, tds, tds_lwf, gmi, other_deductions, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
      ON CONFLICT (emp_id, month, year) DO UPDATE SET
        basic=$4, hra=$5, conv_allowance=$6, medical_allowance=$7, special_allowance=$8,
        statutory_bonus=$9, consultant_fee=$10, other_allowances=$11, leave_encashment=$12,
        pf=$13, pt=$14, esi=$15, tds=$16, tds_lwf=$17, gmi=$18, other_deductions=$19,
        updated_at=NOW()
      RETURNING *`,
      [emp_id, month, year,
       n(basic), n(hra), n(conv_allowance), n(medical_allowance), n(special_allowance),
       n(statutory_bonus), n(consultant_fee), n(other_allowances), n(leave_encashment),
       n(pf), n(pt), n(esi), n(tds), n(tds_lwf), n(gmi), n(other_deductions),
       req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const remove = async (req, res) => {
  try {
    const result = await query('DELETE FROM salary_records WHERE id=$1 RETURNING id', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Record not found' });
    res.json({ message: 'Salary record deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

const getSummary = async (req, res) => {
  try {
    const { year, month } = req.query;
    let filter = 'WHERE 1=1';
    const params = [];
    if (year)  { params.push(year);  filter += ` AND sr.year = $${params.length}`; }
    if (month) { params.push(month); filter += ` AND sr.month = $${params.length}`; }

    const [totals, byEmp, dedBreakdown, empCount] = await Promise.all([
      query(`SELECT
          COALESCE(SUM(gross_earnings),0) AS total_gross,
          COALESCE(SUM(total_deductions),0) AS total_deductions,
          COALESCE(SUM(net_pay),0) AS total_net
        FROM salary_records sr ${filter}`, params),

      query(`SELECT sr.emp_id, e.name, e.designation, e.location,
          sr.basic, sr.hra, sr.special_allowance,
          sr.gross_earnings, sr.pf, sr.tds, sr.total_deductions, sr.net_pay
        FROM salary_records sr JOIN employees e ON sr.emp_id=e.emp_id
        ${filter} ORDER BY e.name`, params),

      query(`SELECT
          COALESCE(SUM(pf),0) AS pf, COALESCE(SUM(pt),0) AS pt,
          COALESCE(SUM(esi),0) AS esi, COALESCE(SUM(tds),0) AS tds,
          COALESCE(SUM(tds_lwf),0) AS tds_lwf, COALESCE(SUM(gmi),0) AS gmi,
          COALESCE(SUM(other_deductions),0) AS other_deductions,
          COALESCE(SUM(gross_earnings),0) AS gross_earnings
        FROM salary_records sr ${filter}`, params),

      query('SELECT COUNT(*) FROM employees WHERE is_active=true')
    ]);

    res.json({
      totals: totals.rows[0],
      byEmployee: byEmp.rows,
      deductionBreakdown: dedBreakdown.rows[0],
      activeEmployees: parseInt(empCount.rows[0].count)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getAll, upsert, remove, getSummary };
