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
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
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
  closureReason: text("closure_reason"), // 'user_sold' = user exited position, 'market_resolved' = market settled
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

// Fee configuration - DFlow-style fee structure at 50% discount
// Uses same formula as DFlow: scale × p × (1-p) × contracts
// Our platform fee = 50% of DFlow VIP 0 (Frost tier) fees
export type FeeChannel = 'swipe' | 'discovery' | 'positions';

export const FEE_CONFIG = {
  // Fee recipient: USDC Associated Token Account (ATA) for wallet 9DZEWwT47BKZnutbyJ4L5T8uEaVkwbQY8SeL3ehHHXGY
  // DFlow requires the SPL token account, not the wallet address
  FEE_RECIPIENT: 'Csdoc9fHj4XBw6HcDq69SVx5dHQtubb9dCkXGGbus7Zy',
  
  // Original wallet address (for reference/logging)
  FEE_WALLET: '9DZEWwT47BKZnutbyJ4L5T8uEaVkwbQY8SeL3ehHHXGY',
  
  // Platform fees = 50% of DFlow's VIP 0 (Frost tier) fees
  // DFlow Frost: taker=0.09, maker=0.0225
  // Formula: scale × p × (1-p) × contracts
  PLATFORM_TAKER_SCALE: 0.045,   // 50% of DFlow's 0.09
  PLATFORM_MAKER_SCALE: 0.01125, // 50% of DFlow's 0.0225
  
  // DFlow API uses platformFeeScale with 3 decimals: 45 = 0.045
  // This is passed to DFlow in API calls
  PLATFORM_FEE_SCALE: 45, // 0.045 in DFlow's thousandths format
  
  // DFlow's fee scales (for reference/calculations)
  DFLOW_TAKER_SCALE: 0.09,
  DFLOW_MAKER_SCALE: 0.0225,
};

/**
 * Calculates the platform fee using DFlow-style formula at 50% of their VIP 0 rates.
 * Formula: scale × p × (1-p) × contracts
 * 
 * This function provides the feeScale constant for the DFlow API.
 * The actual USD fee is calculated by DFlow using our platformFeeScale parameter
 * and is applied to the filled contracts.
 * 
 * @param wagerAmount - The USDC wager
 * @param _channel - The channel (unused, unified fee now)
 * @param price - Optional price for more accurate fee estimation
 * @param contracts - Optional contract count for accurate fee calculation
 * @returns Object with feeScale for DFlow API and estimated fee
 */
export function calculateSwayFee(
  wagerAmount: number, 
  _channel: FeeChannel,
  price?: number,
  contracts?: number
): { 
  feeUSDC: number; 
  feeBps: number;       // Legacy: approximate bps for display
  feeScale: number;     // For DFlow platformFeeScale: 45 = 0.045
  grossInput: number;   // Total wager (DFlow handles fee deduction)
  wagerAmount: number;  // Original wager amount
} {
  // Validate input - handle zero/negative amounts gracefully
  if (!wagerAmount || wagerAmount <= 0) {
    return { feeUSDC: 0, feeBps: 0, feeScale: 0, grossInput: 0, wagerAmount: 0 };
  }
  
  // Platform fee scale for DFlow API
  const feeScale = FEE_CONFIG.PLATFORM_FEE_SCALE; // 45 = 0.045
  
  // Calculate platform fee: scale × p × (1-p) × contracts
  let feeUSDC = 0;
  if (price !== undefined && contracts !== undefined && price > 0 && price < 1) {
    feeUSDC = FEE_CONFIG.PLATFORM_TAKER_SCALE * price * (1 - price) * contracts;
  } else if (price !== undefined && price > 0 && price < 1) {
    // Estimate based on price, assume wager buys contracts at that price
    const estimatedContracts = wagerAmount / price;
    feeUSDC = FEE_CONFIG.PLATFORM_TAKER_SCALE * price * (1 - price) * estimatedContracts;
  } else {
    // Fallback: estimate at max fee (p=0.5)
    const estimatedContracts = wagerAmount / 0.5;
    feeUSDC = FEE_CONFIG.PLATFORM_TAKER_SCALE * 0.5 * 0.5 * estimatedContracts;
  }
  
  // Approximate bps for display/logging
  const feeBps = wagerAmount > 0 ? Math.round((feeUSDC / wagerAmount) * 10000) : 0;
  
  return { 
    feeUSDC, 
    feeBps,
    feeScale,
    grossInput: wagerAmount, // DFlow handles fee collection from this amount
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
