import express from "express";
import cors from "cors";
import multer from "multer";
import csv from "csv-parser";
import { Readable } from "stream";
import { config } from "./config.js";
import { getEthereumFees, getBitcoinFees, getEthereumHistory, getBitcoinHistory, getBitcoinPriceHistory } from "./fee.js";
import { createCheckout } from "./stripe.js";
import { register, login, authenticate, requireAdmin, getUserById, initializeDefaultAdmin, getAllUsers, updateNotifyEmail } from "./auth.js";
import { journalDb, JournalEntry, rulesDb, TradingRule } from "./database.js";


const app = express();
app.use(cors());
app.use(express.json());

// Configure multer for file uploads
const upload = multer({ storage: multer.memoryStorage() });

// Initialize default admin user
initializeDefaultAdmin();

// Store admin message in memory (could be replaced with database storage)
let adminMessage: { text: string; timestamp: Date } | null = null;


app.get("/api/fees", authenticate, async (req, res) => {
try {
const platform = req.query.platform;


if (platform === "ethereum") {
return res.json(await getEthereumFees(config.etherscanKey));
}


if (platform === "bitcoin") {
return res.json(await getBitcoinFees());
}


res.status(400).json({ error: "Invalid platform" });
} catch {
res.status(500).json({ error: "Fee fetch failed" });
}
});

app.get("/api/history", authenticate, async (req, res) => {
try {
const platform = req.query.platform as string;
const period = req.query.period as string;

const days = period === "week" ? 7 : period === "month" ? 30 : 1;

if (platform === "ethereum") {
return res.json(await getEthereumHistory(config.etherscanKey, days));
}

if (platform === "bitcoin") {
return res.json(await getBitcoinHistory(days));
}

res.status(400).json({ error: "Invalid platform" });
} catch {
res.status(500).json({ error: "History fetch failed" });
}
});

// Authentication endpoints
app.post("/api/auth/register", async (req, res) => {
const { username, password } = req.body;

if (!username || !password) {
return res.status(400).json({ error: "Username and password required" });
}

if (password.length < 6) {
return res.status(400).json({ error: "Password must be at least 6 characters" });
}

const result = await register(username, password, false);

if ("error" in result) {
return res.status(400).json(result);
}

res.json(result);
});

app.post("/api/auth/login", async (req, res) => {
const { username, password } = req.body;

if (!username || !password) {
return res.status(400).json({ error: "Username and password required" });
}

const result = await login(username, password);

if ("error" in result) {
return res.status(401).json(result);
}

res.json(result);
});

// Get current user info
app.get("/api/auth/me", authenticate, (req, res) => {
const user = getUserById((req as any).user.userId);
if (!user) {
return res.status(404).json({ error: "User not found" });
}
res.json(user);
});

// Get current user's notification email
app.get("/api/auth/notify-email", authenticate, (req, res) => {
  const user = getUserById((req as any).user.userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ notifyEmail: user.notifyEmail ?? "" });
});

// Update current user's notification email
app.put("/api/auth/notify-email", authenticate, (req, res) => {
  const userId = (req as any).user.userId;
  const { email } = req.body;
  if (email !== undefined && typeof email !== "string") {
    return res.status(400).json({ error: "Invalid email" });
  }
  const updated = updateNotifyEmail(userId, email ?? "");
  if (!updated) return res.status(404).json({ error: "User not found" });
  res.json({ success: true, notifyEmail: email?.trim() || "" });
});

// Admin: update any user's notification email
app.put("/api/admin/users/:id/notify-email", authenticate, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { email } = req.body;
  if (email !== undefined && typeof email !== "string") {
    return res.status(400).json({ error: "Invalid email" });
  }
  const updated = updateNotifyEmail(id, email ?? "");
  if (!updated) return res.status(404).json({ error: "User not found" });
  res.json({ success: true, notifyEmail: email?.trim() || "" });
});


app.post("/api/subscribe", authenticate, async (_, res) => {
if (!config.stripeSecret) {
return res.status(501).json({ error: "Stripe not configured" });
}
const session = await createCheckout();
res.json({ url: session.url });
});

// Get admin message (public)
app.get("/api/admin/message", (_, res) => {
res.json(adminMessage);
});

// Set admin message (protected - admin only)
app.post("/api/admin/message", authenticate, requireAdmin, (req, res) => {
const { text } = req.body;

if (!text || typeof text !== "string") {
return res.status(400).json({ error: "Invalid message text" });
}

adminMessage = {
text: text.trim(),
timestamp: new Date()
};

res.json({ success: true, message: adminMessage });
});

// Clear admin message (protected - admin only)
app.delete("/api/admin/message", authenticate, requireAdmin, (_, res) => {
adminMessage = null;
res.json({ success: true });
});
// Get all users (admin only)
app.get("/api/admin/users", authenticate, requireAdmin, (_, res) => {
  const usersList = getAllUsers();
  res.json(usersList);
});

// Create a new user (admin only)
app.post("/api/admin/users", authenticate, requireAdmin, async (req, res) => {
  const { username, password, isAdmin } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  const result = await register(username, password, isAdmin || false);

  if ("error" in result) {
    return res.status(400).json(result);
  }

  res.json({ success: true, user: result.user });
});

// Get all journal entries (admin only)
app.get("/api/admin/journals", authenticate, requireAdmin, (_, res) => {
  try {
    const entries = journalDb.getAllEntries();
    res.json(entries);
  } catch (error) {
    console.error("Error fetching all journal entries:", error);
    res.status(500).json({ error: "Failed to fetch journal entries" });
  }
});
// Journal endpoints
// Get all journal entries for the authenticated user
app.get("/api/journal", authenticate, (req, res) => {
  const userId = (req as any).user.userId;
  
  try {
    const entries = journalDb.getEntries(userId);
    res.json(entries);
  } catch (error) {
    console.error("Error fetching journal entries:", error);
    res.status(500).json({ error: "Failed to fetch journal entries" });
  }
});

// Create a new journal entry
app.post("/api/journal", authenticate, (req, res) => {
  const userId = (req as any).user.userId;
  const { decision, marketSentiment, confidence, priceLevel, notes } = req.body;

  if (!decision || !marketSentiment || !confidence) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const entry: JournalEntry = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      userId,
      timestamp: new Date().toISOString(),
      decision,
      marketSentiment,
      confidence,
      priceLevel: priceLevel ? parseFloat(priceLevel) : undefined,
      notes: notes?.trim() || undefined,
    };

    const created = journalDb.createEntry(entry);
    res.json(created);
  } catch (error) {
    console.error("Error creating journal entry:", error);
    res.status(500).json({ error: "Failed to create journal entry" });
  }
});

// Delete a journal entry
app.delete("/api/journal/:id", authenticate, (req, res) => {
  const userId = (req as any).user.userId;
  const entryId = req.params.id;
  
  try {
    const deleted = journalDb.deleteEntry(userId, entryId);
    
    if (!deleted) {
      return res.status(404).json({ error: "Entry not found" });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting journal entry:", error);
    res.status(500).json({ error: "Failed to delete journal entry" });
  }
});

// Trading Rules endpoints
// Get all rules for the authenticated user
app.get("/api/rules", authenticate, (req, res) => {
  const userId = (req as any).user.userId;
  
  try {
    const rules = rulesDb.getRules(userId);
    res.json(rules);
  } catch (error) {
    console.error("Error fetching rules:", error);
    res.status(500).json({ error: "Failed to fetch rules" });
  }
});

// Create a new rule
app.post("/api/rules", authenticate, (req, res) => {
  const userId = (req as any).user.userId;
  const { ruleName, platform, maxLossPercent, stopLossPrice, entryPrice, action } = req.body;

  if (!ruleName || !platform || !maxLossPercent || !action) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const rule: TradingRule = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      userId,
      ruleName,
      platform,
      maxLossPercent: parseFloat(maxLossPercent),
      stopLossPrice: stopLossPrice ? parseFloat(stopLossPrice) : undefined,
      entryPrice: entryPrice ? parseFloat(entryPrice) : undefined,
      action,
      isActive: 1,
      createdAt: new Date().toISOString(),
    };

    const created = rulesDb.createRule(rule);
    res.json(created);
  } catch (error) {
    console.error("Error creating rule:", error);
    res.status(500).json({ error: "Failed to create rule" });
  }
});

// Upload rules from CSV
app.post("/api/rules/upload", authenticate, upload.single("file"), async (req, res) => {
  const userId = (req as any).user.userId;
  
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  try {
    const rules: TradingRule[] = [];
    const csvData = req.file.buffer.toString('utf-8');
    const stream = Readable.from(csvData);

    stream
      .pipe(csv())
      .on('data', (row) => {
        // Expected CSV columns: ruleName, platform, maxLossPercent, stopLossPrice, entryPrice, action
        if (row.ruleName && row.platform && row.maxLossPercent && row.action) {
          rules.push({
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            userId,
            ruleName: row.ruleName,
            platform: row.platform.toLowerCase(),
            maxLossPercent: parseFloat(row.maxLossPercent),
            stopLossPrice: row.stopLossPrice ? parseFloat(row.stopLossPrice) : undefined,
            entryPrice: row.entryPrice ? parseFloat(row.entryPrice) : undefined,
            action: row.action.toLowerCase(),
            isActive: 1,
            createdAt: new Date().toISOString(),
          });
        }
      })
      .on('end', () => {
        if (rules.length === 0) {
          return res.status(400).json({ error: "No valid rules found in CSV" });
        }

        rulesDb.createRules(rules);
        res.json({ success: true, count: rules.length, rules });
      })
      .on('error', (error) => {
        console.error("CSV parsing error:", error);
        res.status(500).json({ error: "Failed to parse CSV file" });
      });
  } catch (error) {
    console.error("Error uploading rules:", error);
    res.status(500).json({ error: "Failed to upload rules" });
  }
});

// Toggle rule active status
app.patch("/api/rules/:id/toggle", authenticate, (req, res) => {
  const userId = (req as any).user.userId;
  const ruleId = req.params.id;
  
  try {
    const updated = rulesDb.toggleRule(userId, ruleId);
    
    if (!updated) {
      return res.status(404).json({ error: "Rule not found" });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error("Error toggling rule:", error);
    res.status(500).json({ error: "Failed to toggle rule" });
  }
});

// Delete a rule
app.delete("/api/rules/:id", authenticate, (req, res) => {
  const userId = (req as any).user.userId;
  const ruleId = req.params.id;
  
  try {
    const deleted = rulesDb.deleteRule(userId, ruleId);
    
    if (!deleted) {
      return res.status(404).json({ error: "Rule not found" });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting rule:", error);
    res.status(500).json({ error: "Failed to delete rule" });
  }
});

// Get rule recommendations based on current price
app.post("/api/rules/evaluate", authenticate, async (req, res) => {
  const userId = (req as any).user.userId;
  const { platform, currentPrice } = req.body;

  if (!platform || !currentPrice) {
    return res.status(400).json({ error: "Missing platform or currentPrice" });
  }

  try {
    const activeRules = rulesDb.getActiveRules(userId);
    const platformRules = activeRules.filter(rule => rule.platform.toLowerCase() === platform.toLowerCase());
    
    const recommendations = platformRules.map(rule => {
      let triggered = false;
      let message = "";
      
      if (rule.entryPrice && rule.maxLossPercent) {
        const lossPercent = ((rule.entryPrice - currentPrice) / rule.entryPrice) * 100;
        if (lossPercent >= rule.maxLossPercent) {
          triggered = true;
          message = `Loss limit reached: ${lossPercent.toFixed(2)}% (max: ${rule.maxLossPercent}%)`;
        }
      }
      
      if (rule.stopLossPrice && currentPrice <= rule.stopLossPrice) {
        triggered = true;
        message = `Stop loss price reached: $${currentPrice} <= $${rule.stopLossPrice}`;
      }
      
      return {
        rule: rule.ruleName,
        triggered,
        action: triggered ? rule.action : "hold",
        message: triggered ? message : "No action needed",
        currentPrice,
      };
    });
    
    res.json({
      platform,
      currentPrice,
      recommendations,
      anyTriggered: recommendations.some(r => r.triggered)
    });
  } catch (error) {
    console.error("Error evaluating rules:", error);
    res.status(500).json({ error: "Failed to evaluate rules" });
  }
});

// Admin: Get all rules
app.get("/api/admin/rules", authenticate, requireAdmin, (_, res) => {
  try {
    const rules = rulesDb.getAllRules();
    res.json(rules);
  } catch (error) {
    console.error("Error fetching all rules:", error);
    res.status(500).json({ error: "Failed to fetch rules" });
  }
});

// Admin: Create global rule
app.post("/api/admin/rules/global", authenticate, requireAdmin, (req, res) => {
  const { ruleName, platform, maxLossPercent, stopLossPrice, entryPrice, action } = req.body;

  if (!ruleName || !platform || !maxLossPercent || !action) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const rule: TradingRule = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      userId: "admin",
      ruleName,
      platform,
      maxLossPercent: parseFloat(maxLossPercent),
      stopLossPrice: stopLossPrice ? parseFloat(stopLossPrice) : undefined,
      entryPrice: entryPrice ? parseFloat(entryPrice) : undefined,
      action,
      isActive: 1,
      isGlobal: 1,
      createdAt: new Date().toISOString(),
    };

    const created = rulesDb.createRule(rule);
    res.json(created);
  } catch (error) {
    console.error("Error creating global rule:", error);
    res.status(500).json({ error: "Failed to create global rule" });
  }
});

// Admin: Get global rules
app.get("/api/admin/rules/global", authenticate, requireAdmin, (_, res) => {
  try {
    const rules = rulesDb.getGlobalRules();
    res.json(rules);
  } catch (error) {
    console.error("Error fetching global rules:", error);
    res.status(500).json({ error: "Failed to fetch global rules" });
  }
});

// Admin: Run global rule evaluation across all current prices
app.post("/api/admin/rules/run-global", authenticate, requireAdmin, async (req, res) => {
  try {
    const globalRules = rulesDb.getGlobalRules();
    
    if (globalRules.length === 0) {
      return res.json({ message: "No global rules configured", results: [] });
    }

    // Fetch current prices
    const bitcoinFees = await getBitcoinFees();
    const ethereumFees = await getEthereumFees(config.etherscanKey);
    
    // For simplicity, we'll use the average fee as a proxy for price
    // In production, you'd fetch actual market prices
    const currentPrices = {
      bitcoin: 50000, // Mock price - replace with actual price fetch
      ethereum: 3500  // Mock price - replace with actual price fetch
    };

    const results = globalRules.map(rule => {
      const currentPrice = currentPrices[rule.platform as keyof typeof currentPrices];
      let triggered = false;
      let message = "";
      
      if (rule.entryPrice && rule.maxLossPercent) {
        const lossPercent = ((rule.entryPrice - currentPrice) / rule.entryPrice) * 100;
        if (lossPercent >= rule.maxLossPercent) {
          triggered = true;
          message = `Loss limit reached: ${lossPercent.toFixed(2)}% (max: ${rule.maxLossPercent}%)`;
        }
      }
      
      if (rule.stopLossPrice && currentPrice <= rule.stopLossPrice) {
        triggered = true;
        message = `Stop loss price reached: $${currentPrice} <= $${rule.stopLossPrice}`;
      }
      
      return {
        ruleId: rule.id,
        ruleName: rule.ruleName,
        platform: rule.platform,
        currentPrice,
        triggered,
        action: triggered ? rule.action : "hold",
        message: triggered ? message : "No action needed",
      };
    });

    res.json({
      timestamp: new Date().toISOString(),
      currentPrices,
      results,
      anyTriggered: results.some(r => r.triggered),
      triggeredRules: results.filter(r => r.triggered),
    });
  } catch (error) {
    console.error("Error running global rules:", error);
    res.status(500).json({ error: "Failed to run global rules" });
  }
});


// Test endpoint: Simulate rule evaluation with sample data
app.post("/api/rules/simulate", authenticate, (req, res) => {
  const userId = (req as any).user.userId;
  
  // Create sample rules if user has none
  const existingRules = rulesDb.getRules(userId);
  
  if (existingRules.length === 0) {
    // Create sample rules for testing
    const sampleRules: TradingRule[] = [
      {
        id: "sample1",
        userId,
        ruleName: "BTC 5% Stop Loss",
        platform: "bitcoin",
        maxLossPercent: 5,
        entryPrice: 50000,
        action: "sell",
        isActive: 1,
        createdAt: new Date().toISOString(),
      },
      {
        id: "sample2",
        userId,
        ruleName: "BTC Absolute Stop at 48K",
        platform: "bitcoin",
        stopLossPrice: 48000,
        maxLossPercent: 0,
        action: "sell",
        isActive: 1,
        createdAt: new Date().toISOString(),
      },
      {
        id: "sample3",
        userId,
        ruleName: "ETH 10% Stop Loss",
        platform: "ethereum",
        maxLossPercent: 10,
        entryPrice: 3500,
        action: "sell",
        isActive: 1,
        createdAt: new Date().toISOString(),
      },
    ];
    
    rulesDb.createRules(sampleRules);
  }

  // Simulate different price scenarios
  const scenarios = [
    { name: "Current Price (No Loss)", bitcoin: 50000, ethereum: 3500 },
    { name: "Small Loss (2%)", bitcoin: 49000, ethereum: 3430 },
    { name: "Medium Loss (5%)", bitcoin: 47500, ethereum: 3325 },
    { name: "Large Loss (10%)", bitcoin: 45000, ethereum: 3150 },
    { name: "Critical Loss (15%)", bitcoin: 42500, ethereum: 2975 },
  ];

  const results = scenarios.map(scenario => {
    const activeRules = rulesDb.getActiveRules(userId);
    
    const bitcoinEval = activeRules
      .filter(rule => rule.platform === "bitcoin")
      .map(rule => {
        let triggered = false;
        let message = "";
        
        if (rule.entryPrice && rule.maxLossPercent) {
          const lossPercent = ((rule.entryPrice - scenario.bitcoin) / rule.entryPrice) * 100;
          if (lossPercent >= rule.maxLossPercent) {
            triggered = true;
            message = `Loss limit reached: ${lossPercent.toFixed(2)}% (max: ${rule.maxLossPercent}%)`;
          }
        }
        
        if (rule.stopLossPrice && scenario.bitcoin <= rule.stopLossPrice) {
          triggered = true;
          message = `Stop loss price reached: $${scenario.bitcoin} <= $${rule.stopLossPrice}`;
        }
        
        return {
          rule: rule.ruleName,
          triggered,
          action: triggered ? rule.action : "hold",
          message: triggered ? message : "No action needed",
        };
      });

    const ethereumEval = activeRules
      .filter(rule => rule.platform === "ethereum")
      .map(rule => {
        let triggered = false;
        let message = "";
        
        if (rule.entryPrice && rule.maxLossPercent) {
          const lossPercent = ((rule.entryPrice - scenario.ethereum) / rule.entryPrice) * 100;
          if (lossPercent >= rule.maxLossPercent) {
            triggered = true;
            message = `Loss limit reached: ${lossPercent.toFixed(2)}% (max: ${rule.maxLossPercent}%)`;
          }
        }
        
        if (rule.stopLossPrice && scenario.ethereum <= rule.stopLossPrice) {
          triggered = true;
          message = `Stop loss price reached: $${scenario.ethereum} <= $${rule.stopLossPrice}`;
        }
        
        return {
          rule: rule.ruleName,
          triggered,
          action: triggered ? rule.action : "hold",
          message: triggered ? message : "No action needed",
        };
      });

    return {
      scenario: scenario.name,
      prices: {
        bitcoin: scenario.bitcoin,
        ethereum: scenario.ethereum,
      },
      bitcoin: {
        rules: bitcoinEval,
        anyTriggered: bitcoinEval.some(r => r.triggered),
      },
      ethereum: {
        rules: ethereumEval,
        anyTriggered: ethereumEval.some(r => r.triggered),
      },
    };
  });

  res.json({
    message: "Simulation complete with sample rules",
    userRules: rulesDb.getRules(userId),
    scenarios: results,
  });
});


// BTC price history from CoinGecko (real market price, not fees)
app.get("/api/btc-price", authenticate, async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days as string) || 30, 90);
    const data = await getBitcoinPriceHistory(days);
    res.json(data);
  } catch {
    res.status(500).json({ error: "Failed to fetch BTC price history" });
  }
});

// BTC price history from CoinGecko (real market price, not fees)
app.get("/api/btc-price", authenticate, async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days as string) || 30, 90);
    const data = await getBitcoinPriceHistory(days);
    res.json(data);
  } catch {
    res.status(500).json({ error: "Failed to fetch BTC price history" });
  }
});

app.listen(config.port, () => {
console.log(`Backend running on :${config.port}`);
});