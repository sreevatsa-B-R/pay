require('dotenv').config();
const { pool } = require('./db');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(10) NOT NULL CHECK (role IN ('admin', 'user')),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Employees table
    await client.query(`
      CREATE TABLE IF NOT EXISTS employees (
        id SERIAL PRIMARY KEY,
        emp_id VARCHAR(20) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        designation VARCHAR(100),
        client_lob VARCHAR(100),
        location VARCHAR(100),
        state VARCHAR(100),
        date_of_birth DATE,
        sex VARCHAR(10),
        date_of_joining DATE,
        email VARCHAR(100),
        pan_aadhaar VARCHAR(20),
        salary_mode VARCHAR(30),
        contact VARCHAR(15),
        bank_name VARCHAR(100),
        account_no VARCHAR(30),
        is_active BOOLEAN DEFAULT true,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Salary records table
    await client.query(`
      CREATE TABLE IF NOT EXISTS salary_records (
        id SERIAL PRIMARY KEY,
        emp_id VARCHAR(20) NOT NULL REFERENCES employees(emp_id) ON UPDATE CASCADE,
        month VARCHAR(20) NOT NULL,
        year INTEGER NOT NULL,
        basic NUMERIC(12,2) DEFAULT 0,
        hra NUMERIC(12,2) DEFAULT 0,
        conv_allowance NUMERIC(12,2) DEFAULT 0,
        medical_allowance NUMERIC(12,2) DEFAULT 0,
        special_allowance NUMERIC(12,2) DEFAULT 0,
        statutory_bonus NUMERIC(12,2) DEFAULT 0,
        consultant_fee NUMERIC(12,2) DEFAULT 0,
        other_allowances NUMERIC(12,2) DEFAULT 0,
        leave_encashment NUMERIC(12,2) DEFAULT 0,
        gross_earnings NUMERIC(12,2) GENERATED ALWAYS AS (
          basic + hra + conv_allowance + medical_allowance + special_allowance +
          statutory_bonus + consultant_fee + other_allowances + leave_encashment
        ) STORED,
        pf NUMERIC(12,2) DEFAULT 0,
        pt NUMERIC(12,2) DEFAULT 0,
        esi NUMERIC(12,2) DEFAULT 0,
        tds NUMERIC(12,2) DEFAULT 0,
        tds_lwf NUMERIC(12,2) DEFAULT 0,
        gmi NUMERIC(12,2) DEFAULT 0,
        other_deductions NUMERIC(12,2) DEFAULT 0,
        total_deductions NUMERIC(12,2) GENERATED ALWAYS AS (
          pf + pt + esi + tds + tds_lwf + gmi + other_deductions
        ) STORED,
        net_pay NUMERIC(12,2) GENERATED ALWAYS AS (
          (basic + hra + conv_allowance + medical_allowance + special_allowance +
           statutory_bonus + consultant_fee + other_allowances + leave_encashment) -
          (pf + pt + esi + tds + tds_lwf + gmi + other_deductions)
        ) STORED,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(emp_id, month, year)
      );
    `);

    // Audit log
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        action VARCHAR(50) NOT NULL,
        table_name VARCHAR(50),
        record_id VARCHAR(50),
        details JSONB,
        ip_address VARCHAR(45),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_employees_emp_id ON employees(emp_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_salary_emp_id ON salary_records(emp_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_salary_month_year ON salary_records(month, year);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);`);

    await client.query('COMMIT');
    console.log('✅ Migration complete — all tables created.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
    pool.end();
  }
};

migrate();
