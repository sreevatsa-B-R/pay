const { query } = require('../config/db');

const getAll = async (req, res) => {
  try {
    const { month, year, status, emp_id } = req.query;
    let sql = `
      SELECT p.*, e.name AS emp_name, e.designation, e.location,
             e.bank_name, e.account_no, e.salary_mode,
             u1.username AS processed_by_name,
             u2.username AS paid_by_name
      FROM payouts p
      JOIN employees e ON p.emp_id=e.emp_id
      LEFT JOIN users u1 ON p.processed_by=u1.id
      LEFT JOIN users u2 ON p.paid_by=u2.id
      WHERE 1=1`;
    const params = [];
    if (emp_id) { params.push(emp_id); sql += ` AND p.emp_id=$${params.length}`; }
    if (month)  { params.push(month);  sql += ` AND p.month=$${params.length}`; }
    if (year)   { params.push(year);   sql += ` AND p.year=$${params.length}`; }
    if (status) { params.push(status); sql += ` AND p.status=$${params.length}`; }
    sql += ' ORDER BY p.year DESC, p.month, e.name';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// Generate payouts from salary records for a given month/year
const generatePayouts = async (req, res) => {
  try {
    const { month, year } = req.body;
    if (!month || !year) return res.status(400).json({ error: 'month and year required' });

    const salaries = await query(
      `SELECT sr.*, e.bank_name, e.account_no, e.salary_mode
       FROM salary_records sr
       JOIN employees e ON sr.emp_id=e.emp_id
       WHERE sr.month=$1 AND sr.year=$2`,
      [month, year]
    );
    if (!salaries.rows.length)
      return res.status(400).json({ error: 'No salary records found for this period' });

    let created = 0, skipped = 0;
    for (const s of salaries.rows) {
      try {
        await query(
          `INSERT INTO payouts
             (emp_id,month,year,gross_amount,total_deductions,net_amount,
              bank_name,account_no,payout_mode,status,created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10)
           ON CONFLICT (emp_id,month,year) DO NOTHING`,
          [s.emp_id, month, year,
           s.gross_earnings, s.total_deductions, s.net_pay,
           s.bank_name, s.account_no,
           s.salary_mode==='Cash'?'cash': s.salary_mode==='Cheque'?'cheque':'bank_transfer',
           req.user.id]
        );
        created++;
      } catch { skipped++; }
    }
    res.json({ message: `Payouts generated`, created, skipped });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const createPayout = async (req, res) => {
  try {
    const { emp_id, month, year, gross_amount, total_deductions, net_amount, payout_mode, remarks } = req.body;
    if (!emp_id || !month || !year) return res.status(400).json({ error: 'emp_id, month, year required' });
    const r = await query(
      `INSERT INTO payouts (emp_id,month,year,gross_amount,total_deductions,net_amount,payout_mode,remarks,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [emp_id, month, year, gross_amount||0, total_deductions||0, net_amount||0,
       payout_mode||'bank_transfer', remarks||null, req.user.id]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    if (err.code==='23505') return res.status(400).json({ error: 'Payout already exists for this employee/period' });
    res.status(500).json({ error: err.message });
  }
};

// Update payout status
const updateStatus = async (req, res) => {
  try {
    const { status, payment_date, reference_no, payout_mode, remarks } = req.body;
    const validTransitions = { pending:['processed'], processed:['paid','pending'], paid:[] };
    const existing = await query('SELECT status FROM payouts WHERE id=$1', [req.params.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Payout not found' });

    const current = existing.rows[0].status;
    if (!validTransitions[current]?.includes(status))
      return res.status(400).json({ error: `Cannot transition from ${current} to ${status}` });

    let sql, params;
    if (status === 'processed') {
      sql = `UPDATE payouts SET status='processed',payout_mode=$1,remarks=$2,
             processed_by=$3,processed_at=NOW(),updated_at=NOW() WHERE id=$4 RETURNING *`;
      params = [payout_mode||'bank_transfer', remarks, req.user.id, req.params.id];
    } else if (status === 'paid') {
      if (!payment_date || !reference_no)
        return res.status(400).json({ error: 'payment_date and reference_no required to mark as Paid' });
      sql = `UPDATE payouts SET status='paid',payment_date=$1,reference_no=$2,
             paid_by=$3,paid_at=NOW(),updated_at=NOW() WHERE id=$4 RETURNING *`;
      params = [payment_date, reference_no, req.user.id, req.params.id];
    } else {
      sql = `UPDATE payouts SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING *`;
      params = [status, req.params.id];
    }

    const r = await query(sql, params);
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// Bulk update status for entire month
const bulkUpdateStatus = async (req, res) => {
  try {
    const { month, year, status, ids } = req.body;
    if (!status || !ids?.length) return res.status(400).json({ error: 'status and ids[] required' });

    let updated = 0;
    for (const id of ids) {
      try {
        if (status === 'processed') {
          await query(`UPDATE payouts SET status='processed',processed_by=$1,processed_at=NOW(),updated_at=NOW() WHERE id=$2 AND status='pending'`, [req.user.id, id]);
        } else if (status === 'paid') {
          await query(`UPDATE payouts SET status='paid',paid_by=$1,paid_at=NOW(),updated_at=NOW() WHERE id=$2 AND status='processed'`, [req.user.id, id]);
        }
        updated++;
      } catch {}
    }
    res.json({ message: `${updated} payouts updated to ${status}` });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const getPayoutSummary = async (req, res) => {
  try {
    const { month, year } = req.query;
    let filter = 'WHERE 1=1'; const params = [];
    if (month) { params.push(month); filter += ` AND month=$${params.length}`; }
    if (year)  { params.push(year);  filter += ` AND year=$${params.length}`; }

    const [stats, monthly] = await Promise.all([
      query(`SELECT status, COUNT(*) AS count, SUM(net_amount) AS total
             FROM payouts ${filter} GROUP BY status`, params),
      query(`SELECT month, year, COUNT(*) AS emp_count,
             SUM(net_amount) AS total_payout,
             COUNT(CASE WHEN status='paid' THEN 1 END) AS paid_count,
             COUNT(CASE WHEN status='pending' THEN 1 END) AS pending_count,
             COUNT(CASE WHEN status='processed' THEN 1 END) AS processed_count
             FROM payouts GROUP BY month,year ORDER BY year DESC, month`, [])
    ]);
    res.json({ byStatus: stats.rows, monthlyHistory: monthly.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const deletePayout = async (req, res) => {
  try {
    const r = await query('DELETE FROM payouts WHERE id=$1 AND status=\'pending\' RETURNING id', [req.params.id]);
    if (!r.rows.length) return res.status(400).json({ error: 'Only pending payouts can be deleted' });
    res.json({ message: 'Payout deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

module.exports = { getAll, generatePayouts, createPayout, updateStatus, bulkUpdateStatus, getPayoutSummary, deletePayout };
