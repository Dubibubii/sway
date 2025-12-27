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

// Fee configuration
export const FEE_CONFIG = {
  FEE_PERCENTAGE: 0.01, // 1% fee
  FEE_RECIPIENT: '9DZEWwT47BKZnutbyJ4L5T8uEaVkwbQY8SeL3ehHHXGY',
};

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
