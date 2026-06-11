# Trading Rules System

## Overview
The trading rules system allows users to configure automated decision-making based on loss limits and price thresholds. Rules can be created manually or uploaded via CSV file.

## Rule Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ruleName` | string | Yes | Descriptive name for the rule |
| `platform` | string | Yes | Platform (bitcoin or ethereum) |
| `maxLossPercent` | number | Yes | Maximum loss percentage before action triggers |
| `stopLossPrice` | number | No | Absolute price threshold for stop loss |
| `entryPrice` | number | No | Entry price for calculating loss percentage |
| `action` | string | Yes | Action to recommend (sell, hold, buy) |
| `isActive` | boolean | Auto | Whether the rule is active (defaults to true) |

## CSV Format

Create a CSV file with the following columns:
```csv
ruleName,platform,maxLossPercent,stopLossPrice,entryPrice,action
BTC Stop Loss 5%,bitcoin,5,,50000,sell
ETH Stop Loss 10%,ethereum,10,3000,3500,sell
```

### CSV Column Details:
- **ruleName**: Name of your rule (e.g., "BTC Stop Loss 5%")
- **platform**: Either "bitcoin" or "ethereum"
- **maxLossPercent**: Percentage (e.g., 5 for 5%)
- **stopLossPrice**: Optional absolute price threshold (leave empty if not needed)
- **entryPrice**: Optional entry price to calculate loss from (leave empty if not needed)
- **action**: Recommended action when rule triggers (sell, hold, buy)

See `rules-template.csv` for examples.

## API Endpoints

### User Endpoints (Requires Authentication)

#### Get All Rules
```
GET /api/rules
```
Returns all trading rules for the authenticated user.

#### Create Single Rule
```
POST /api/rules
Content-Type: application/json

{
  "ruleName": "BTC Stop Loss",
  "platform": "bitcoin",
  "maxLossPercent": 5,
  "stopLossPrice": 48000,
  "entryPrice": 50000,
  "action": "sell"
}
```

#### Upload Rules from CSV
```
POST /api/rules/upload
Content-Type: multipart/form-data

file: <csv-file>
```

#### Toggle Rule Active/Inactive
```
PATCH /api/rules/:id/toggle
```

#### Delete Rule
```
DELETE /api/rules/:id
```

#### Evaluate Rules
```
POST /api/rules/evaluate
Content-Type: application/json

{
  "platform": "bitcoin",
  "currentPrice": 49000
}
```

Returns recommendations based on active rules:
```json
{
  "platform": "bitcoin",
  "currentPrice": 49000,
  "recommendations": [
    {
      "rule": "BTC Stop Loss 5%",
      "triggered": true,
      "action": "sell",
      "message": "Loss limit reached: 2.00% (max: 5%)",
      "currentPrice": 49000
    }
  ],
  "anyTriggered": true
}
```

### Admin Endpoints

#### Get All Rules (All Users)
```
GET /api/admin/rules
```
Returns all trading rules from all users.

## Rule Logic

### Loss Percentage Calculation
If both `entryPrice` and `maxLossPercent` are specified:
```
lossPercent = ((entryPrice - currentPrice) / entryPrice) * 100
```
Rule triggers if `lossPercent >= maxLossPercent`

### Stop Loss Price
If `stopLossPrice` is specified:
Rule triggers if `currentPrice <= stopLossPrice`

### Multiple Conditions
A rule can have both loss percentage and stop loss price. If either condition is met, the rule triggers.

## Example Use Cases

### 1. Percentage-Based Stop Loss
```csv
ruleName,platform,maxLossPercent,stopLossPrice,entryPrice,action
5% Bitcoin Stop,bitcoin,5,,50000,sell
```
Triggers when Bitcoin drops 5% below $50,000 entry price.

### 2. Absolute Price Stop Loss
```csv
ruleName,platform,maxLossPercent,stopLossPrice,entryPrice,action
BTC Floor Price,bitcoin,,,48000,sell
```
Triggers when Bitcoin price reaches $48,000.

### 3. Combined Stop Loss
```csv
ruleName,platform,maxLossPercent,stopLossPrice,entryPrice,action
Conservative Exit,ethereum,10,2500,3000,sell
```
Triggers if ETH drops 10% from $3000 OR reaches $2500.

## Notes

- Rules are evaluated on-demand via the `/api/rules/evaluate` endpoint
- Users can have multiple rules per platform
- Inactive rules are not evaluated
- Rules persist in the database across server restarts
- CSV upload appends rules to existing ones (doesn't replace)
