const { query } = require('../config/db');

// ── ALLOWANCE TYPES ──────────────────────────────────────────────────────────

const getAllTypes = async (req, res) => {
  try {
    const result = await query(
      `SELECT at.*, u.username AS created_by_name
       FROM allowance_types at
       LEFT JOIN users u ON at.created_by = u.id
       ORDER BY at.name`
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const createType = async (req, res) => {
  try {
    const { name, code, calc_type, default_value, description, is_taxable } = req.body;
    if (!name || !code || !calc_type) return res.status(400).json({ error: 'name, code, calc_type required' });
    if (!['fixed','percent'].includes(calc_type)) return res.status(400).json({ error: 'calc_type must be fixed or percent' });
    const r = await query(
      `INSERT INTO allowance_types (name,code,calc_type,default_value,description,is_taxable,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name, code.toUpperCase(), calc_type, default_value||0, description||null, is_taxable||false, req.user.id]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Allowance code already exists' });
    res.status(500).json({ error: err.message });
  }
};

const updateType = async (req, res) => {
  try {
    const { name, calc_type, default_value, description, is_taxable, is_active } = req.body;
    const r = await query(
      `UPDATE allowance_types SET name=$1,calc_type=$2,default_value=$3,description=$4,
       is_taxable=$5,is_active=$6,updated_at=NOW() WHERE id=$7 RETURNING *`,
      [name, calc_type, default_value||0, description, is_taxable||false, is_active??true, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const deleteType = async (req, res) => {
  try {
    await query('UPDATE allowance_types SET is_active=false WHERE id=$1', [req.params.id]);
    res.json({ message: 'Allowance type deactivated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ── EMPLOYEE ALLOWANCES ───────────────────────────────────────────────────────

const getEmpAllowances = async (req, res) => {
  try {
    const { emp_id } = req.params;
    const result = await query(
      `SELECT ea.*, at.name AS type_name, at.code, at.is_taxable,
              e.name AS emp_name,
              CASE WHEN ea.calc_type='percent'
                   THEN (SELECT sr.basic FROM salary_records sr WHERE sr.emp_id=ea.emp_id ORDER BY sr.year DESC, sr.created_at DESC LIMIT 1) * ea.value/100
                   ELSE ea.value END AS computed_amount
       FROM employee_allowances ea
       JOIN allowance_types at ON ea.allowance_type_id=at.id
       JOIN employees e ON ea.emp_id=e.emp_id
       WHERE ea.emp_id=$1
       ORDER BY at.name`,
      [emp_id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const getAllAllowances = async (req, res) => {
  try {
    const { emp_id, active } = req.query;
    let sql = `SELECT ea.*, at.name AS type_name, at.code, at.is_taxable,
                      e.name AS emp_name, e.designation, e.location
               FROM employee_allowances ea
               JOIN allowance_types at ON ea.allowance_type_id=at.id
               JOIN employees e ON ea.emp_id=e.emp_id
               WHERE 1=1`;
    const params = [];
    if (emp_id) { params.push(emp_id); sql += ` AND ea.emp_id=$${params.length}`; }
    if (active !== undefined) { params.push(active==='true'); sql += ` AND ea.is_active=$${params.length}`; }
    sql += ' ORDER BY e.name, at.name';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const assignAllowance = async (req, res) => {
  try {
    const { emp_id, allowance_type_id, calc_type, value, effective_from, effective_to, remarks } = req.body;
    if (!emp_id || !allowance_type_id || !calc_type || value === undefined)
      return res.status(400).json({ error: 'emp_id, allowance_type_id, calc_type, value required' });

    const r = await query(
      `INSERT INTO employee_allowances
         (emp_id,allowance_type_id,calc_type,value,effective_from,effective_to,remarks,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (emp_id,allowance_type_id,effective_from)
       DO UPDATE SET calc_type=$3,value=$4,effective_to=$6,remarks=$7,updated_at=NOW()
       RETURNING *`,
      [emp_id, allowance_type_id, calc_type, value,
       effective_from||new Date().toISOString().slice(0,10),
       effective_to||null, remarks||null, req.user.id]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const updateAllowance = async (req, res) => {
  try {
    const { calc_type, value, effective_to, remarks, is_active } = req.body;
    const r = await query(
      `UPDATE employee_allowances
       SET calc_type=$1,value=$2,effective_to=$3,remarks=$4,is_active=$5,updated_at=NOW()
       WHERE id=$6 RETURNING *`,
      [calc_type, value, effective_to||null, remarks, is_active??true, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const deleteAllowance = async (req, res) => {
  try {
    await query('DELETE FROM employee_allowances WHERE id=$1', [req.params.id]);
    res.json({ message: 'Allowance removed' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const getAllowanceSummary = async (req, res) => {
  try {
    const result = await query(
      `SELECT at.name AS type_name, at.code, at.calc_type,
              COUNT(ea.id) AS emp_count,
              SUM(CASE WHEN ea.calc_type='fixed' THEN ea.value ELSE 0 END) AS total_fixed,
              AVG(CASE WHEN ea.calc_type='percent' THEN ea.value ELSE NULL END) AS avg_percent
       FROM employee_allowances ea
       JOIN allowance_types at ON ea.allowance_type_id=at.id
       WHERE ea.is_active=true
       GROUP BY at.id, at.name, at.code, at.calc_type
       ORDER BY emp_count DESC`
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

module.exports = {
  getAllTypes, createType, updateType, deleteType,
  getEmpAllowances, getAllAllowances, assignAllowance, updateAllowance,
  deleteAllowance, getAllowanceSummary
};
