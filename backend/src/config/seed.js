require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('./db');

const seed = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const adminHash = await bcrypt.hash('Admin@123', 12);
    const userHash  = await bcrypt.hash('User@123', 12);

    await client.query(`
      INSERT INTO users (username, email, password_hash, role)
      VALUES
        ('admin', 'admin@payroll.com', $1, 'admin'),
        ('viewer', 'viewer@payroll.com', $2, 'user')
      ON CONFLICT (username) DO NOTHING;
    `, [adminHash, userHash]);

    await client.query('COMMIT');
    console.log('✅ Seed complete.');
    console.log('   Admin  → username: admin   | password: Admin@123');
    console.log('   User   → username: viewer  | password: User@123');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', err.message);
  } finally {
    client.release();
    pool.end();
  }
};

seed();
