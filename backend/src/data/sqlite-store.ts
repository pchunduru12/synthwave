import fs from 'node:fs';
import path from 'node:path';
import initSqlJs from 'sql.js';
import { env } from '../config/env.js';
import { BudgetSettings, Creation, UsageEvent, User } from '../domain/types.js';

const SQL = await initSqlJs({
  locateFile: (file) => path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file),
});

fs.mkdirSync(path.dirname(env.sqliteDbPath), { recursive: true });
const dbBuffer = fs.existsSync(env.sqliteDbPath) ? fs.readFileSync(env.sqliteDbPath) : undefined;
const db = dbBuffer ? new SQL.Database(dbBuffer) : new SQL.Database();

initializeSchema();

function initializeSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      plan TEXT NOT NULL,
      credits_remaining INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS budgets (
      user_id TEXT PRIMARY KEY,
      json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS creations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS usage_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  persistDb();
}

export function loadSnapshot() {
  const users = new Map<string, User>();
  const budgets = new Map<string, BudgetSettings>();
  const creations = new Map<string, Creation>();
  const usageEvents: UsageEvent[] = [];

  const userRows = db.exec('SELECT * FROM users');
  if (userRows[0]) {
    const cols = userRows[0].columns;
    for (const row of userRows[0].values) {
      const rec = Object.fromEntries(cols.map((c, i) => [c, row[i]]));
      users.set(String(rec.id), {
        id: String(rec.id),
        email: String(rec.email),
        passwordHash: String(rec.password_hash),
        displayName: String(rec.display_name),
        plan: rec.plan as User['plan'],
        creditsRemaining: Number(rec.credits_remaining),
        createdAt: String(rec.created_at),
      });
    }
  }

  const budgetRows = db.exec('SELECT * FROM budgets');
  if (budgetRows[0]) {
    const cols = budgetRows[0].columns;
    for (const row of budgetRows[0].values) {
      const rec = Object.fromEntries(cols.map((c, i) => [c, row[i]]));
      budgets.set(String(rec.user_id), JSON.parse(String(rec.json)) as BudgetSettings);
    }
  }

  const creationRows = db.exec('SELECT json FROM creations ORDER BY updated_at DESC');
  if (creationRows[0]) {
    const idx = creationRows[0].columns.indexOf('json');
    for (const row of creationRows[0].values) {
      const creation = JSON.parse(String(row[idx])) as Creation;
      creations.set(creation.id, creation);
    }
  }

  const usageRows = db.exec('SELECT json FROM usage_events ORDER BY created_at DESC');
  if (usageRows[0]) {
    const idx = usageRows[0].columns.indexOf('json');
    for (const row of usageRows[0].values) {
      usageEvents.push(JSON.parse(String(row[idx])) as UsageEvent);
    }
  }

  return { users, budgets, creations, usageEvents };
}

export function persistSnapshot(snapshot: {
  users: Map<string, User>;
  budgets: Map<string, BudgetSettings>;
  creations: Map<string, Creation>;
  usageEvents: UsageEvent[];
}) {
  db.run('BEGIN TRANSACTION');
  try {
    db.run('DELETE FROM users');
    db.run('DELETE FROM budgets');
    db.run('DELETE FROM creations');
    db.run('DELETE FROM usage_events');

    const userStmt = db.prepare(`INSERT INTO users (id, email, password_hash, display_name, plan, credits_remaining, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    for (const user of snapshot.users.values()) {
      userStmt.run([user.id, user.email, user.passwordHash, user.displayName, user.plan, user.creditsRemaining, user.createdAt]);
    }
    userStmt.free();

    const budgetStmt = db.prepare(`INSERT INTO budgets (user_id, json) VALUES (?, ?)`);
    for (const [userId, budget] of snapshot.budgets.entries()) {
      budgetStmt.run([userId, JSON.stringify(budget)]);
    }
    budgetStmt.free();

    const creationStmt = db.prepare(`INSERT INTO creations (id, user_id, json, updated_at) VALUES (?, ?, ?, ?)`);
    for (const creation of snapshot.creations.values()) {
      creationStmt.run([creation.id, creation.userId, JSON.stringify(creation), creation.updatedAt]);
    }
    creationStmt.free();

    const usageStmt = db.prepare(`INSERT INTO usage_events (id, user_id, json, created_at) VALUES (?, ?, ?, ?)`);
    for (const event of snapshot.usageEvents) {
      usageStmt.run([event.id, event.userId, JSON.stringify(event), event.createdAt]);
    }
    usageStmt.free();

    db.run('COMMIT');
    persistDb();
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }
}

function persistDb() {
  const data = db.export();
  fs.writeFileSync(env.sqliteDbPath, Buffer.from(data));
}
