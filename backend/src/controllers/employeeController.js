const { query } = require('../config/db');

const getAll = async (req, res) => {
  try {
    const { search, location, state, active } = req.query;
    let sql = `SELECT * FROM employees WHERE 1=1`;
    const params = [];
    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (emp_id ILIKE $${params.length} OR name ILIKE $${params.length} OR designation ILIKE $${params.length})`;
    }
    if (location) { params.push(location); sql += ` AND location = $${params.length}`; }
    if (state)    { params.push(state);    sql += ` AND state = $${params.length}`; }
    if (active !== undefined) { params.push(active === 'true'); sql += ` AND is_active = $${params.length}`; }
    sql += ` ORDER BY created_at DESC`;
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getOne = async (req, res) => {
  try {
    const result = await query('SELECT * FROM employees WHERE emp_id = $1', [req.params.empId]);
    if (!result.rows.length) return res.status(404).json({ error: 'Employee not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

const create = async (req, res) => {
  try {
    const {
      emp_id, name, designation, client_lob, location, state,
      date_of_birth, sex, date_of_joining, email, pan_aadhaar,
      salary_mode, contact, bank_name, account_no
    } = req.body;

    if (!emp_id || !name) return res.status(400).json({ error: 'Employee ID and Name are required' });

    const result = await query(`
      INSERT INTO employees
        (emp_id, name, designation, client_lob, location, state, date_of_birth, sex,
         date_of_joining, email, pan_aadhaar, salary_mode, contact, bank_name, account_no, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING *`,
      [emp_id, name, designation, client_lob, location, state,
       date_of_birth || null, sex, date_of_joining || null, email,
       pan_aadhaar, salary_mode, contact, bank_name, account_no, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Employee ID already exists' });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const update = async (req, res) => {
  try {
    const {
      name, designation, client_lob, location, state,
      date_of_birth, sex, date_of_joining, email, pan_aadhaar,
      salary_mode, contact, bank_name, account_no, is_active
    } = req.body;

    const result = await query(`
      UPDATE employees SET
        name=$1, designation=$2, client_lob=$3, location=$4, state=$5,
        date_of_birth=$6, sex=$7, date_of_joining=$8, email=$9, pan_aadhaar=$10,
        salary_mode=$11, contact=$12, bank_name=$13, account_no=$14,
        is_active=$15, updated_at=NOW()
      WHERE emp_id=$16 RETURNING *`,
      [name, designation, client_lob, location, state,
       date_of_birth || null, sex, date_of_joining || null, email, pan_aadhaar,
       salary_mode, contact, bank_name, account_no, is_active ?? true, req.params.empId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Employee not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const remove = async (req, res) => {
  try {
    const result = await query('DELETE FROM employees WHERE emp_id=$1 RETURNING emp_id', [req.params.empId]);
    if (!result.rows.length) return res.status(404).json({ error: 'Employee not found' });
    res.json({ message: 'Employee deleted', emp_id: req.params.empId });
  } catch (err) {
    if (err.code === '23503') return res.status(400).json({ error: 'Cannot delete employee with salary records. Remove salary records first.' });
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getAll, getOne, create, update, remove };
