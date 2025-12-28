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
 * @param amount - The USDC size of the trade.
 * @param channel - 'swipe', 'discovery', or 'positions'.
 * @returns Object with fee amount in USDC and basis points for API
 */
export function calculateSwayFee(amount: number, channel: FeeChannel): { feeUSDC: number; feeBps: number } {
  // Validate input - handle zero/negative amounts gracefully
  if (!amount || amount <= 0) {
    return { feeUSDC: 0, feeBps: 0 };
  }
  
  switch (channel) {
    case 'swipe':
      // Fixed $0.05 fee for swipe trades (high margin on micro-trades)
      // Convert to effective BPS for API: (0.05 / amount) * 10000
      // For $0.50 min trade: 1000 bps (10%)
      // For $2.50 avg trade: 200 bps (2%)
      // For $5.00 trade: 100 bps (1%)
      const effectiveBps = Math.round((0.05 / amount) * 10000);
      // Cap at 1000 bps (10%) to handle $0.50 minimum trade size
      return { feeUSDC: 0.05, feeBps: Math.min(effectiveBps, 1000) };
      
    case 'discovery':
      // 0.75% of trade amount
      return { feeUSDC: amount * 0.0075, feeBps: 75 };
      
    case 'positions':
      // 0.25% of trade amount
      return { feeUSDC: amount * 0.0025, feeBps: 25 };
      
    default:
      // 1% safety fallback
      return { feeUSDC: amount * 0.01, feeBps: 100 };
  }
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
