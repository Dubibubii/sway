import { type User, type InsertUser, type Trade, type InsertTrade, users, trades } from "@shared/schema";
import { db } from "../db/index";
import { eq, and, desc } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface IStorage {
  getUserByPrivyId(privyId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserSettings(userId: string, settings: { yesWager?: number; noWager?: number; interests?: string[] }): Promise<User>;
  
  createTrade(trade: InsertTrade): Promise<Trade>;
  getUserTrades(userId: string): Promise<Trade[]>;
  getOpenPositions(userId: string): Promise<Trade[]>;
  closeTrade(tradeId: string, pnl: number, exitFee?: number): Promise<Trade>;
}

export class DatabaseStorage implements IStorage {
  async getUserByPrivyId(privyId: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.privyId, privyId)).limit(1);
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const result = await db.insert(users).values({ ...insertUser, id }).returning();
    return result[0];
  }

  async updateUserSettings(userId: string, settings: { yesWager?: number; noWager?: number; interests?: string[] }): Promise<User> {
    const result = await db.update(users)
      .set(settings)
      .where(eq(users.id, userId))
      .returning();
    return result[0];
  }

  async createTrade(trade: InsertTrade): Promise<Trade> {
    const result = await db.insert(trades).values(trade).returning();
    return result[0];
  }

  async getUserTrades(userId: string): Promise<Trade[]> {
    return await db.select().from(trades)
      .where(eq(trades.userId, userId))
      .orderBy(desc(trades.createdAt));
  }

  async getOpenPositions(userId: string): Promise<Trade[]> {
    return await db.select().from(trades)
      .where(and(eq(trades.userId, userId), eq(trades.isClosed, false)))
      .orderBy(desc(trades.createdAt));
  }

  async closeTrade(tradeId: string, pnl: number, exitFee?: number): Promise<Trade> {
    const result = await db.update(trades)
      .set({ 
        isClosed: true, 
        closedAt: new Date(), 
        pnl: pnl.toString(),
        exitFee: exitFee ? exitFee.toFixed(4) : null,
      })
      .where(eq(trades.id, tradeId))
      .returning();
    return result[0];
  }
}

export const storage = new DatabaseStorage();
