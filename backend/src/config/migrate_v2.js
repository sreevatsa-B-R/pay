require('dotenv').config();
const { pool } = require('./db');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── ALLOWANCE TYPES (master list) ────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS allowance_types (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        code VARCHAR(30) UNIQUE NOT NULL,
        calc_type VARCHAR(10) NOT NULL CHECK (calc_type IN ('fixed','percent')),
        default_value NUMERIC(10,2) DEFAULT 0,
        description TEXT,
        is_taxable BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // ── EMPLOYEE ALLOWANCES (per-employee assignment) ─────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS employee_allowances (
        id SERIAL PRIMARY KEY,
        emp_id VARCHAR(20) NOT NULL REFERENCES employees(emp_id) ON UPDATE CASCADE ON DELETE CASCADE,
        allowance_type_id INTEGER NOT NULL REFERENCES allowance_types(id),
        calc_type VARCHAR(10) NOT NULL CHECK (calc_type IN ('fixed','percent')),
        value NUMERIC(10,2) NOT NULL DEFAULT 0,
        effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
        effective_to DATE,
        remarks TEXT,
        is_active BOOLEAN DEFAULT true,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(emp_id, allowance_type_id, effective_from)
      );
    `);

    // ── PAYOUT ───────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS payouts (
        id SERIAL PRIMARY KEY,
        emp_id VARCHAR(20) NOT NULL REFERENCES employees(emp_id) ON UPDATE CASCADE,
        month VARCHAR(20) NOT NULL,
        year INTEGER NOT NULL,
        gross_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        total_deductions NUMERIC(12,2) NOT NULL DEFAULT 0,
        net_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending','processed','paid')),
        payout_mode VARCHAR(20) DEFAULT 'bank_transfer'
          CHECK (payout_mode IN ('bank_transfer','cash','cheque')),
        payment_date DATE,
        reference_no VARCHAR(100),
        bank_name VARCHAR(100),
        account_no VARCHAR(30),
        remarks TEXT,
        processed_by INTEGER REFERENCES users(id),
        processed_at TIMESTAMPTZ,
        paid_by INTEGER REFERENCES users(id),
        paid_at TIMESTAMPTZ,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(emp_id, month, year)
      );
    `);

    // ── FULL & FINAL SETTLEMENT ───────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS fnf_settlements (
        id SERIAL PRIMARY KEY,
        emp_id VARCHAR(20) NOT NULL REFERENCES employees(emp_id) ON UPDATE CASCADE,
        separation_type VARCHAR(30) NOT NULL
          CHECK (separation_type IN ('resignation','termination','retirement','absconding')),
        last_working_date DATE NOT NULL,
        settlement_date DATE,

        -- Earnings
        pending_salary NUMERIC(12,2) DEFAULT 0,
        leave_encashment_days NUMERIC(6,2) DEFAULT 0,
        leave_encashment_amount NUMERIC(12,2) DEFAULT 0,
        gratuity_years NUMERIC(6,2) DEFAULT 0,
        gratuity_amount NUMERIC(12,2) DEFAULT 0,
        bonus_amount NUMERIC(12,2) DEFAULT 0,
        notice_period_days INTEGER DEFAULT 0,
        notice_period_amount NUMERIC(12,2) DEFAULT 0,  -- positive = payable, negative = recovery
        other_earnings NUMERIC(12,2) DEFAULT 0,
        other_earnings_remarks TEXT,

        -- Deductions
        pf_deduction NUMERIC(12,2) DEFAULT 0,
        esi_deduction NUMERIC(12,2) DEFAULT 0,
        tds_deduction NUMERIC(12,2) DEFAULT 0,
        loan_recovery NUMERIC(12,2) DEFAULT 0,
        other_deductions NUMERIC(12,2) DEFAULT 0,
        other_deductions_remarks TEXT,

        -- Computed (stored for record)
        total_earnings NUMERIC(12,2) GENERATED ALWAYS AS (
          pending_salary + leave_encashment_amount + gratuity_amount +
          bonus_amount + notice_period_amount + other_earnings
        ) STORED,
        total_deductions NUMERIC(12,2) GENERATED ALWAYS AS (
          pf_deduction + esi_deduction + tds_deduction + loan_recovery + other_deductions
        ) STORED,
        net_settlement NUMERIC(12,2) GENERATED ALWAYS AS (
          (pending_salary + leave_encashment_amount + gratuity_amount +
           bonus_amount + notice_period_amount + other_earnings) -
          (pf_deduction + esi_deduction + tds_deduction + loan_recovery + other_deductions)
        ) STORED,

        status VARCHAR(20) DEFAULT 'draft'
          CHECK (status IN ('draft','pending_approval','approved','paid')),
        payment_date DATE,
        payment_reference VARCHAR(100),
        hr_remarks TEXT,

        created_by INTEGER REFERENCES users(id),
        approved_by INTEGER REFERENCES users(id),
        approved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(emp_id)  -- one settlement per employee
      );
    `);

    // Indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_payouts_emp_id ON payouts(emp_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_payouts_status ON payouts(status);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_payouts_month_year ON payouts(month,year);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_emp_allowances_emp ON employee_allowances(emp_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_fnf_emp ON fnf_settlements(emp_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_fnf_status ON fnf_settlements(status);`);

    await client.query('COMMIT');
    console.log('✅ Migration v2 complete — allowances, payouts, F&F tables created.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration v2 failed:', err.message);
    throw err;
  } finally {
    client.release();
    pool.end();
  }
};

migrate();
