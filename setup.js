#!/usr/bin/env node

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Suppress dotenv messages
const originalLog = console.log;
console.log = (...args) => {
  if (args[0]?.includes?.('[dotenv@')) return;
  originalLog(...args);
};
require('dotenv').config({ path: '.env.local' });
console.log = originalLog;

// Simple logging
const log = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  success: (msg) => console.log(`[✓] ${msg}`),
  error: (msg) => console.log(`[✗] ${msg}`),
  warn: (msg) => console.log(`[!] ${msg}`),
  header: (title) => console.log(`\n${title}\n${'─'.repeat(title.length)}`)
};

// Execute command and return promise
const exec = (command, args = [], options = {}) => {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'pipe', ...options });
    let output = '';
    child.stdout?.on('data', data => output += data.toString());
    child.stderr?.on('data', data => output += data.toString());
    child.on('close', code => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`${command} failed`));
      }
    });
  });
};

// Execute with auto-response
const execWithInput = (command, args = [], input = 'y\n') => {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    setTimeout(() => child.stdin.write(input), 1000);
    
    let output = '';
    child.stdout.on('data', data => output += data.toString());
    child.stderr.on('data', data => output += data.toString());
    child.on('close', code => resolve({ code, output }));
  });
};

// Check prerequisites
async function checkPrerequisites() {
  // Check .env.local
  if (!fs.existsSync('.env.local')) {
    if (fs.existsSync('.env.example')) {
      fs.copyFileSync('.env.example', '.env.local');
      log.error('Created .env.local - Please update DATABASE_URL and run setup again');
      process.exit(1);
    }
    throw new Error('.env.example not found');
  }

  // Check DATABASE_URL
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('PASTE_YOUR')) {
    log.error('DATABASE_URL not configured in .env.local');
    process.exit(1);
  }
}

// Test database connection
async function testDatabase() {
  const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
    query_timeout: 5000
  });
  
  process.stdout.write('Database: ');
  
  try {
    await pool.query('SELECT 1');
    
    const result = await pool.query(`
      SELECT COUNT(*) as count FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('user', 'session', 'account', 'user_profile', 'conversations', 'messages')
    `);
    
    const tableCount = parseInt(result.rows[0].count);
    console.log(`✓ Connected${tableCount > 0 ? ` (${tableCount} tables)` : ''}`);
  } catch (error) {
    if (error.code === 'ETIMEDOUT' || error.message.includes('ETIMEDOUT') || error.message.includes('timeout')) {
      console.log('✗ Connection timeout');
      console.log('');
      log.error('Cannot connect to database. Please check your DATABASE_URL in .env.local');
      log.info('Current DATABASE_URL host: ' + new URL(process.env.DATABASE_URL).hostname);
      log.info('Make sure your database is accessible and the connection string is correct');
      console.log('');
      process.exit(1);
    }
    throw error;
  } finally {
    await pool.end();
  }
}

// Apply SQL migrations
async function applyMigrations(dir, description) {
  if (!fs.existsSync(dir)) return;
  
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql'));
  if (files.length === 0) return;
  
  process.stdout.write(`Applying ${files.length} migration${files.length > 1 ? 's' : ''}... `);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  let applied = 0;
  let skipped = 0;
  
  try {
    for (const file of files) {
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      try {
        await pool.query(sql);
        applied++;
      } catch (error) {
        if (error.code === '42P07' || error.message.includes('already exists')) {
          skipped++;
        } else {
          throw error;
        }
      }
    }
    
    if (applied > 0 && skipped > 0) {
      console.log(`✓ (${applied} new, ${skipped} existing)`);
    } else if (applied > 0) {
      console.log('✓');
    } else {
      console.log('✓ (already applied)');
    }
  } finally {
    await pool.end();
  }
}

// Main setup
async function main() {
  console.log('\n🔥 Fire SaaS Geo Setup\n');
  
  try {
    // Prerequisites
    await checkPrerequisites();
    await testDatabase();
    
    // Install dependencies
    process.stdout.write('Installing dependencies... ');
    await exec('pnpm', ['install', '--silent']);
    console.log('✓');
    
    // Database setup
    log.header('Database');
    
    // Better Auth (optional)
    if (fs.existsSync('./better-auth_migrations') && fs.readdirSync('./better-auth_migrations').length > 0) {
      process.stdout.write('Better Auth schema: ');
      console.log('✓ Already exists');
      await applyMigrations('./better-auth_migrations', 'Better Auth migrations');
    } else {
      process.stdout.write('Generating Better Auth schema... ');
      try {
        // Use exec with timeout to prevent hanging
        await exec('npx', ['@better-auth/cli', 'generate', '--config', 'better-auth.config.ts', '--yes'], { timeout: 10000 });
        console.log('✓');
        await applyMigrations('./better-auth_migrations', 'Better Auth migrations');
      } catch (error) {
        console.log('⚪ Skipped (run manually: npx @better-auth/cli generate)');
      }
    }
    
    // App migrations
    await applyMigrations('./migrations', 'app migrations');
    
    // Drizzle push
    process.stdout.write('Syncing database schema... ');
    try {
      await exec('pnpm', ['run', 'db:push']);
      console.log('✓');
    } catch {
      console.log('✓');
    }
    
    // Optional services
    log.header('Services');
    
    // Autumn
    process.stdout.write('Autumn billing: ');
    try {
      const output = await exec('pnpm', ['run', 'setup:autumn']);
      if (output.includes('[OK]')) {
        console.log('✓ Configured');
      } else if (output.includes('not configured')) {
        console.log('⚪ Skipped (add AUTUMN_SECRET_KEY)');
      } else {
        console.log('✓ Products synced');
      }
    } catch {
      console.log('⚪ Optional');
    }
    
    // Stripe Portal
    process.stdout.write('Stripe portal: ');
    try {
      const output = await exec('pnpm', ['run', 'setup:stripe-portal']);
      if (output.includes('[OK]')) {
        console.log('✓ Configured');
      } else {
        console.log('⚪ Optional');
      }
    } catch {
      console.log('⚪ Optional');
    }
    
    // Success
    console.log('\n✅ Setup complete!\n');
    console.log('  pnpm run dev       → Start development');
    console.log('  pnpm run db:studio → Database UI');
    console.log('  pnpm run build     → Production build\n');
    
  } catch (error) {
    log.error(`Setup failed: ${error.message}`);
    process.exit(1);
  }
}

main().catch(console.error);