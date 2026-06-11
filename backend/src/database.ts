import Database from "better-sqlite3";
import { join } from "path";

const db = new Database(join(process.cwd(), "data.db"));

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS journal_entries (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    decision TEXT NOT NULL,
    marketSentiment TEXT NOT NULL,
    confidence TEXT NOT NULL,
    priceLevel REAL,
    notes TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_journal_userId ON journal_entries(userId);
  CREATE INDEX IF NOT EXISTS idx_journal_timestamp ON journal_entries(timestamp);

  CREATE TABLE IF NOT EXISTS trading_rules (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    ruleName TEXT NOT NULL,
    platform TEXT NOT NULL,
    maxLossPercent REAL NOT NULL,
    stopLossPrice REAL,
    entryPrice REAL,
    action TEXT NOT NULL,
    isActive INTEGER DEFAULT 1,
    isGlobal INTEGER DEFAULT 0,
    createdAt TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_rules_userId ON trading_rules(userId);
  CREATE INDEX IF NOT EXISTS idx_rules_platform ON trading_rules(platform);
  CREATE INDEX IF NOT EXISTS idx_rules_global ON trading_rules(isGlobal);
`);

export interface JournalEntry {
  id: string;
  userId: string;
  timestamp: string;
  decision: string;
  marketSentiment: string;
  confidence: string;
  priceLevel?: number;
  notes?: string;
}

export interface TradingRule {
  id: string;
  userId: string;
  ruleName: string;
  platform: string;
  maxLossPercent: number;
  stopLossPrice?: number;
  entryPrice?: number;
  action: string;
  isActive: number;
  isGlobal?: number;
  createdAt: string;
}

// Journal entry operations
export const journalDb = {
  // Get all entries for a user
  getEntries(userId: string): JournalEntry[] {
    const stmt = db.prepare(`
      SELECT * FROM journal_entries 
      WHERE userId = ? 
      ORDER BY timestamp DESC
    `);
    return stmt.all(userId) as JournalEntry[];
  },

  // Create a new entry
  createEntry(entry: JournalEntry): JournalEntry {
    const stmt = db.prepare(`
      INSERT INTO journal_entries (id, userId, timestamp, decision, marketSentiment, confidence, priceLevel, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      entry.id,
      entry.userId,
      entry.timestamp,
      entry.decision,
      entry.marketSentiment,
      entry.confidence,
      entry.priceLevel ?? null,
      entry.notes ?? null
    );
    
    return entry;
  },

  // Delete an entry
  deleteEntry(userId: string, entryId: string): boolean {
    const stmt = db.prepare(`
      DELETE FROM journal_entries 
      WHERE id = ? AND userId = ?
    `);
    
    const result = stmt.run(entryId, userId);
    return result.changes > 0;
  },

  // Get a single entry
  getEntry(userId: string, entryId: string): JournalEntry | null {
    const stmt = db.prepare(`
      SELECT * FROM journal_entries 
      WHERE id = ? AND userId = ?
    `);
    
    return stmt.get(entryId, userId) as JournalEntry | null;
  },

  // Get all entries (admin only)
  getAllEntries(): JournalEntry[] {
    const stmt = db.prepare(`
      SELECT * FROM journal_entries 
      ORDER BY timestamp DESC
    `);
    return stmt.all() as JournalEntry[];
  }
};

// Trading rules operations
export const rulesDb = {
  // Get all rules for a user
  getRules(userId: string): TradingRule[] {
    const stmt = db.prepare(`
      SELECT * FROM trading_rules 
      WHERE userId = ? 
      ORDER BY createdAt DESC
    `);
    return stmt.all(userId) as TradingRule[];
  },

  // Get active rules for a user
  getActiveRules(userId: string): TradingRule[] {
    const stmt = db.prepare(`
      SELECT * FROM trading_rules 
      WHERE userId = ? AND isActive = 1 
      ORDER BY createdAt DESC
    `);
    return stmt.all(userId) as TradingRule[];
  },

  // Get global rules
  getGlobalRules(): TradingRule[] {
    const stmt = db.prepare(`
      SELECT * FROM trading_rules 
      WHERE isGlobal = 1 AND isActive = 1 
      ORDER BY createdAt DESC
    `);
    return stmt.all() as TradingRule[];
  },

  // Create a new rule
  createRule(rule: TradingRule): TradingRule {
    const stmt = db.prepare(`
      INSERT INTO trading_rules (id, userId, ruleName, platform, maxLossPercent, stopLossPrice, entryPrice, action, isActive, isGlobal, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      rule.id,
      rule.userId,
      rule.ruleName,
      rule.platform,
      rule.maxLossPercent,
      rule.stopLossPrice ?? null,
      rule.entryPrice ?? null,
      rule.action,
      rule.isActive,
      rule.isGlobal ?? 0,
      rule.createdAt
    );
    
    return rule;
  },

  // Update rule active status
  toggleRule(userId: string, ruleId: string): boolean {
    const stmt = db.prepare(`
      UPDATE trading_rules 
      SET isActive = CASE WHEN isActive = 1 THEN 0 ELSE 1 END
      WHERE id = ? AND userId = ?
    `);
    
    const result = stmt.run(ruleId, userId);
    return result.changes > 0;
  },

  // Delete a rule
  deleteRule(userId: string, ruleId: string): boolean {
    const stmt = db.prepare(`
      DELETE FROM trading_rules 
      WHERE id = ? AND userId = ?
    `);
    
    const result = stmt.run(ruleId, userId);
    return result.changes > 0;
  },

  // Get all rules (admin only)
  getAllRules(): TradingRule[] {
    const stmt = db.prepare(`
      SELECT * FROM trading_rules 
      ORDER BY createdAt DESC
    `);
    return stmt.all() as TradingRule[];
  },

  // Bulk insert rules
  createRules(rules: TradingRule[]): void {
    const stmt = db.prepare(`
      INSERT INTO trading_rules (id, userId, ruleName, platform, maxLossPercent, stopLossPrice, entryPrice, action, isActive, isGlobal, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const transaction = db.transaction((rulesToInsert: TradingRule[]) => {
      for (const rule of rulesToInsert) {
        stmt.run(
          rule.id,
          rule.userId,
          rule.ruleName,
          rule.platform,
          rule.maxLossPercent,
          rule.stopLossPrice ?? null,
          rule.entryPrice ?? null,
          rule.action,
          rule.isActive,
          rule.isGlobal ?? 0,
          rule.createdAt
        );
      }
    });
    
    transaction(rules);
  }
};

export default db;
