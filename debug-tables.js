require('dotenv').config();
const { Pool } = require('pg');

async function test() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return;

  console.log('Connecting to:', dbUrl.replace(/:([^@]+)@/, ':****@'));
  const pool = new Pool({ connectionString: dbUrl });
  
  try {
    const client = await pool.connect();
    console.log('Successfully connected!');
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log('Tables in public schema:', res.rows.map(r => r.table_name));
    client.release();
  } catch (err) {
    console.error('Failed to list tables:', err.message);
  } finally {
    await pool.end();
  }
}

test();
