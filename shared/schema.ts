import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, decimal, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

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
  direction: text("direction").notNull(),
  wagerAmount: integer("wager_amount").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  shares: decimal("shares", { precision: 10, scale: 2 }).notNull(),
  estimatedPayout: decimal("estimated_payout", { precision: 10, scale: 2 }).notNull(),
  isClosed: boolean("is_closed").notNull().default(false),
  closedAt: timestamp("closed_at"),
  pnl: decimal("pnl", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertTradeSchema = createInsertSchema(trades).omit({
  id: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertTrade = z.infer<typeof insertTradeSchema>;
export type Trade = typeof trades.$inferSelect;
