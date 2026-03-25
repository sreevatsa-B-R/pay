const { query } = require('../config/db');

// Gratuity formula: (Last Basic / 26) * 15 * years_of_service (if >= 5 years)
function calcGratuity(basicSalary, joiningDate, lastWorkingDate) {
  if (!joiningDate || !lastWorkingDate) return { years: 0, amount: 0 };
  const join = new Date(joiningDate);
  const last = new Date(lastWorkingDate);
  const diffMs = last - join;
  const years = diffMs / (1000 * 60 * 60 * 24 * 365.25);
  if (years < 5) return { years: parseFloat(years.toFixed(2)), amount: 0 };
  const amount = (basicSalary / 26) * 15 * Math.floor(years);
  return { years: parseFloat(years.toFixed(2)), amount: parseFloat(amount.toFixed(2)) };
}

const getAll = async (req, res) => {
  try {
    const { status, emp_id } = req.query;
    let sql = `
      SELECT f.*, e.name AS emp_name, e.designation, e.location,
             e.date_of_joining, e.bank_name, e.account_no,
             u1.username AS created_by_name, u2.username AS approved_by_name
      FROM fnf_settlements f
      JOIN employees e ON f.emp_id=e.emp_id
      LEFT JOIN users u1 ON f.created_by=u1.id
      LEFT JOIN users u2 ON f.approved_by=u2.id
      WHERE 1=1`;
    const params = [];
    if (emp_id) { params.push(emp_id); sql += ` AND f.emp_id=$${params.length}`; }
    if (status) { params.push(status); sql += ` AND f.status=$${params.length}`; }
    sql += ' ORDER BY f.created_at DESC';
    res.json((await query(sql, params)).rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const getOne = async (req, res) => {
  try {
    const r = await query(
      `SELECT f.*, e.name AS emp_name, e.designation, e.date_of_joining,
              e.bank_name, e.account_no, e.location, e.state
       FROM fnf_settlements f JOIN employees e ON f.emp_id=e.emp_id
       WHERE f.id=$1`, [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Settlement not found' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// Pre-fill calculator — pull last salary, compute gratuity etc.
const calculate = async (req, res) => {
  try {
    const { emp_id, last_working_date } = req.query;
    if (!emp_id) return res.status(400).json({ error: 'emp_id required' });

    const [empRes, lastSalRes] = await Promise.all([
      query('SELECT * FROM employees WHERE emp_id=$1', [emp_id]),
      query(`SELECT * FROM salary_records WHERE emp_id=$1 ORDER BY year DESC, created_at DESC LIMIT 1`, [emp_id])
    ]);
    if (!empRes.rows.length) return res.status(404).json({ error: 'Employee not found' });

    const emp = empRes.rows[0];
    const lastSal = lastSalRes.rows[0] || null;
    const basic = parseFloat(lastSal?.basic || 0);
    const gratuity = calcGratuity(basic, emp.date_of_joining, last_working_date || new Date().toISOString().slice(0,10));

    res.json({
      employee: emp,
      last_salary: lastSal,
      suggestions: {
        pending_salary: lastSal ? parseFloat(lastSal.net_pay) : 0,
        gratuity_years: gratuity.years,
        gratuity_amount: gratuity.amount,
        pf_deduction: lastSal ? parseFloat(lastSal.pf) : 0,
        esi_deduction: lastSal ? parseFloat(lastSal.esi) : 0,
        tds_deduction: lastSal ? parseFloat(lastSal.tds) : 0,
      }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const create = async (req, res) => {
  try {
    const {
      emp_id, separation_type, last_working_date, settlement_date,
      pending_salary, leave_encashment_days, leave_encashment_amount,
      gratuity_years, gratuity_amount, bonus_amount,
      notice_period_days, notice_period_amount, other_earnings, other_earnings_remarks,
      pf_deduction, esi_deduction, tds_deduction, loan_recovery,
      other_deductions, other_deductions_remarks, hr_remarks
    } = req.body;

    if (!emp_id || !separation_type || !last_working_date)
      return res.status(400).json({ error: 'emp_id, separation_type, last_working_date required' });

    const n = v => parseFloat(v) || 0;
    const r = await query(`
      INSERT INTO fnf_settlements (
        emp_id, separation_type, last_working_date, settlement_date,
        pending_salary, leave_encashment_days, leave_encashment_amount,
        gratuity_years, gratuity_amount, bonus_amount,
        notice_period_days, notice_period_amount, other_earnings, other_earnings_remarks,
        pf_deduction, esi_deduction, tds_deduction, loan_recovery,
        other_deductions, other_deductions_remarks, hr_remarks, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
      RETURNING *`,
      [emp_id, separation_type, last_working_date, settlement_date||null,
       n(pending_salary), n(leave_encashment_days), n(leave_encashment_amount),
       n(gratuity_years), n(gratuity_amount), n(bonus_amount),
       n(notice_period_days), n(notice_period_amount), n(other_earnings), other_earnings_remarks||null,
       n(pf_deduction), n(esi_deduction), n(tds_deduction), n(loan_recovery),
       n(other_deductions), other_deductions_remarks||null, hr_remarks||null, req.user.id]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    if (err.code==='23505') return res.status(400).json({ error: 'F&F settlement already exists for this employee' });
    res.status(500).json({ error: err.message });
  }
};

const update = async (req, res) => {
  try {
    const {
      separation_type, last_working_date, settlement_date,
      pending_salary, leave_encashment_days, leave_encashment_amount,
      gratuity_years, gratuity_amount, bonus_amount,
      notice_period_days, notice_period_amount, other_earnings, other_earnings_remarks,
      pf_deduction, esi_deduction, tds_deduction, loan_recovery,
      other_deductions, other_deductions_remarks, hr_remarks
    } = req.body;

    const n = v => parseFloat(v) || 0;
    const r = await query(`
      UPDATE fnf_settlements SET
        separation_type=$1, last_working_date=$2, settlement_date=$3,
        pending_salary=$4, leave_encashment_days=$5, leave_encashment_amount=$6,
        gratuity_years=$7, gratuity_amount=$8, bonus_amount=$9,
        notice_period_days=$10, notice_period_amount=$11, other_earnings=$12, other_earnings_remarks=$13,
        pf_deduction=$14, esi_deduction=$15, tds_deduction=$16, loan_recovery=$17,
        other_deductions=$18, other_deductions_remarks=$19, hr_remarks=$20, updated_at=NOW()
      WHERE id=$21 AND status IN ('draft','pending_approval')
      RETURNING *`,
      [separation_type, last_working_date, settlement_date||null,
       n(pending_salary), n(leave_encashment_days), n(leave_encashment_amount),
       n(gratuity_years), n(gratuity_amount), n(bonus_amount),
       n(notice_period_days), n(notice_period_amount), n(other_earnings), other_earnings_remarks||null,
       n(pf_deduction), n(esi_deduction), n(tds_deduction), n(loan_recovery),
       n(other_deductions), other_deductions_remarks||null, hr_remarks||null, req.params.id]
    );
    if (!r.rows.length) return res.status(400).json({ error: 'Settlement not found or already approved/paid' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const updateStatus = async (req, res) => {
  try {
    const { status, payment_date, payment_reference } = req.body;
    const allowed = ['draft','pending_approval','approved','paid'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    let sql, params;
    if (status === 'approved') {
      sql = `UPDATE fnf_settlements SET status='approved',approved_by=$1,approved_at=NOW(),updated_at=NOW() WHERE id=$2 RETURNING *`;
      params = [req.user.id, req.params.id];
    } else if (status === 'paid') {
      if (!payment_date || !payment_reference)
        return res.status(400).json({ error: 'payment_date and payment_reference required' });
      sql = `UPDATE fnf_settlements SET status='paid',payment_date=$1,payment_reference=$2,updated_at=NOW() WHERE id=$3 RETURNING *`;
      params = [payment_date, payment_reference, req.params.id];
    } else {
      sql = `UPDATE fnf_settlements SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING *`;
      params = [status, req.params.id];
    }
    const r = await query(sql, params);
    if (!r.rows.length) return res.status(404).json({ error: 'Settlement not found' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const remove = async (req, res) => {
  try {
    const r = await query(`DELETE FROM fnf_settlements WHERE id=$1 AND status='draft' RETURNING id`, [req.params.id]);
    if (!r.rows.length) return res.status(400).json({ error: 'Only draft settlements can be deleted' });
    res.json({ message: 'Settlement deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

module.exports = { getAll, getOne, calculate, create, update, updateStatus, remove };
