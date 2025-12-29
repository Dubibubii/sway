import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, decimal, boolean, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Developer wallet address for analytics access
export const DEV_WALLET = '9DZEWwT47BKZnutbyJ4L5T8uEaVkwbQY8SeL3ehHHXGY';

export const users = pgTable("users", {
  id: varchar("id").primaryKey(),
  privyId: text("privy_id").notNull().unique(),
  walletAddress: text("wallet_address"),
  yesWager: integer("yes_wager").notNull().default(5),
  noWager: integer("no_wager").notNull().default(5),
  interests: text("interests").array().notNull().default(sql`ARRAY[]::text[]`),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const trades = pgTable("trades", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  marketId: text("market_id").notNull(),
  marketTitle: text("market_title").notNull(),
  marketCategory: text("market_category"),
  optionLabel: text("option_label"), // e.g., "Democratic Party" - what the user bet on
  direction: text("direction").notNull(),
  wagerAmount: integer("wager_amount").notNull(), // Stored in cents
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  shares: decimal("shares", { precision: 10, scale: 2 }).notNull(),
  estimatedPayout: decimal("estimated_payout", { precision: 10, scale: 2 }).notNull(),
  entryFee: decimal("entry_fee", { precision: 10, scale: 4 }),
  exitFee: decimal("exit_fee", { precision: 10, scale: 4 }),
  isClosed: boolean("is_closed").notNull().default(false),
  closedAt: timestamp("closed_at"),
  pnl: decimal("pnl", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Analytics events for tracking user behavior
export const analyticsEvents = pgTable("analytics_events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  sessionId: text("session_id"),
  eventType: text("event_type").notNull(), // page_view, market_view, bet_placed
  page: text("page"), // home, discovery, profile, developer
  marketId: text("market_id"),
  marketTitle: text("market_title"),
  wagerAmount: decimal("wager_amount", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Fee configuration - Channel-based fee structure
// Swipe: $0.05 flat (high margin on micro-trades)
// Discovery: 0.75% (competitive rate for intentional bets)
// Positions: 0.25% (low friction for selling/active play)
export type FeeChannel = 'swipe' | 'discovery' | 'positions';

export const FEE_CONFIG = {
  // Fee recipient: USDC Associated Token Account (ATA) for wallet 9DZEWwT47BKZnutbyJ4L5T8uEaVkwbQY8SeL3ehHHXGY
  // DFlow requires the SPL token account, not the wallet address
  FEE_RECIPIENT: 'Csdoc9fHj4XBw6HcDq69SVx5dHQtubb9dCkXGGbus7Zy',
  
  // Original wallet address (for reference/logging)
  FEE_WALLET: '9DZEWwT47BKZnutbyJ4L5T8uEaVkwbQY8SeL3ehHHXGY',
  
  // Channel-based fee rates
  CHANNELS: {
    SWIPE: {
      type: 'flat' as const,
      amount: 0.05, // $0.05 flat fee
      bps: null, // Not used for flat fees
    },
    DISCOVERY: {
      type: 'percentage' as const,
      amount: null,
      bps: 75, // 0.75% = 75 basis points
    },
    POSITIONS: {
      type: 'percentage' as const,
      amount: null,
      bps: 25, // 0.25% = 25 basis points
    },
  },
  
  // Fallback for legacy or unknown channels
  DEFAULT_BPS: 100, // 1% = 100 basis points
  
  // Legacy percentage (for DB fee calculations)
  FEE_PERCENTAGE: 0.01, // 1% default fallback
};

/**
 * Calculates the platform fee based on where the user is in the app.
 * The fee is charged on TOP of the wager, so total cost = wager + fee.
 * 
 * For prediction market trades (async), DFlow uses platformFeeScale instead of platformFeeBps.
 * platformFeeScale has 3 decimals: e.g., 10 = 0.010 = 1%, 75 = 0.075 = 7.5%
 * 
 * @param wagerAmount - The USDC wager (what user wants to bet).
 * @param channel - 'swipe', 'discovery', or 'positions'.
 * @returns Object with fee amount, feeScale for DFlow API, and gross input
 */
export function calculateSwayFee(wagerAmount: number, channel: FeeChannel): { 
  feeUSDC: number; 
  feeBps: number;       // Legacy: basis points (kept for DB/display)
  feeScale: number;     // For DFlow platformFeeScale (3 decimals): 10 = 1%, 75 = 7.5%
  grossInput: number;   // Total amount to send to DFlow (wager + fee)
  wagerAmount: number;  // Original wager amount
} {
  // Validate input - handle zero/negative amounts gracefully
  if (!wagerAmount || wagerAmount <= 0) {
    return { feeUSDC: 0, feeBps: 0, feeScale: 0, grossInput: 0, wagerAmount: 0 };
  }
  
  let feeUSDC: number;
  let feeScale: number;  // DFlow platformFeeScale: 3 decimals (10 = 1%)
  
  switch (channel) {
    case 'swipe':
      // Fixed $0.05 fee for swipe trades
      // For $1 trade: 5% fee -> feeScale = 50
      // We calculate the effective percentage based on wager
      feeUSDC = 0.05;
      // Calculate effective fee percentage: (fee / wager) * 1000 for 3 decimals
      feeScale = Math.round((feeUSDC / wagerAmount) * 1000);
      break;
      
    case 'discovery':
      // 0.75% of wager amount -> feeScale = 7.5 (round to 8)
      feeUSDC = wagerAmount * 0.0075;
      feeScale = 8;  // 0.008 = 0.8% (closest to 0.75%)
      break;
      
    case 'positions':
      // 0.25% of wager amount -> feeScale = 2.5 (round to 3)
      feeUSDC = wagerAmount * 0.0025;
      feeScale = 3;  // 0.003 = 0.3% (closest to 0.25%)
      break;
      
    default:
      // 1% safety fallback -> feeScale = 10
      feeUSDC = wagerAmount * 0.01;
      feeScale = 10;
  }
  
  // Cap feeScale at 999 (max allowed by DFlow)
  feeScale = Math.min(feeScale, 999);
  
  // Gross input = wager + fee (what we send to DFlow)
  const grossInput = wagerAmount + feeUSDC;
  
  // Calculate BPS for display/DB (legacy field)
  const feeBps = Math.round((feeUSDC / grossInput) * 10000);
  
  return { 
    feeUSDC, 
    feeBps,
    feeScale,
    grossInput,
    wagerAmount 
  };
}

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertTradeSchema = createInsertSchema(trades).omit({
  id: true,
  createdAt: true,
});

export const insertAnalyticsEventSchema = createInsertSchema(analyticsEvents).omit({
  id: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertTrade = z.infer<typeof insertTradeSchema>;
export type Trade = typeof trades.$inferSelect;
export type InsertAnalyticsEvent = z.infer<typeof insertAnalyticsEventSchema>;
export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
