import { type User, type InsertUser, type Trade, type InsertTrade, type InsertAnalyticsEvent, users, trades, analyticsEvents } from "@shared/schema";
import { db } from "../db/index";
import { eq, and, desc, sql, count, avg, gte } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface AnalyticsSummary {
  totalUsers: number;
  activeUsers24h: number;
  activeUsers7d: number;
  totalBets: number;
  totalVolume: number;
  avgBetSize: number;
  pageUsage: { page: string; count: number; percentage: number }[];
  popularMarkets: { marketId: string; marketTitle: string; views: number; bets: number }[];
}

export interface IStorage {
  getUserByPrivyId(privyId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserSettings(userId: string, settings: { yesWager?: number; noWager?: number; interests?: string[] }): Promise<User>;
  
  createTrade(trade: InsertTrade): Promise<Trade>;
  getUserTrades(userId: string): Promise<Trade[]>;
  getOpenPositions(userId: string): Promise<Trade[]>;
  getOpenTradeForUserMarketDirection(userId: string, marketId: string, direction: string): Promise<Trade | undefined>;
  updateTradePosition(tradeId: string, updates: { wagerAmount: number; shares: string; entryFee: string; estimatedPayout: string; price: string }): Promise<Trade>;
  closeTrade(tradeId: string, pnl: number, exitFee?: number): Promise<Trade>;
  
  logAnalyticsEvent(event: InsertAnalyticsEvent): Promise<void>;
  getAnalyticsSummary(): Promise<AnalyticsSummary>;
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

  async getOpenTradeForUserMarketDirection(userId: string, marketId: string, direction: string): Promise<Trade | undefined> {
    // Select the oldest open trade for this market/direction (deterministic, avoids duplicate issues)
    const result = await db.select().from(trades)
      .where(and(
        eq(trades.userId, userId),
        eq(trades.marketId, marketId),
        eq(trades.direction, direction),
        eq(trades.isClosed, false)
      ))
      .orderBy(trades.createdAt) // ASC - oldest first for consistent consolidation
      .limit(1);
    return result[0];
  }

  async updateTradePosition(tradeId: string, updates: { wagerAmount: number; shares: string; entryFee: string; estimatedPayout: string; price: string }): Promise<Trade> {
    const result = await db.update(trades)
      .set({
        wagerAmount: updates.wagerAmount,
        shares: updates.shares,
        entryFee: updates.entryFee,
        estimatedPayout: updates.estimatedPayout,
        price: updates.price,
      })
      .where(eq(trades.id, tradeId))
      .returning();
    return result[0];
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

  async logAnalyticsEvent(event: InsertAnalyticsEvent): Promise<void> {
    await db.insert(analyticsEvents).values(event);
  }

  async getAnalyticsSummary(): Promise<AnalyticsSummary> {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [totalUsersResult] = await db.select({ count: count() }).from(users);
    const totalUsers = totalUsersResult?.count || 0;

    const [activeUsers24hResult] = await db
      .select({ count: sql<number>`COUNT(DISTINCT user_id)` })
      .from(analyticsEvents)
      .where(gte(analyticsEvents.createdAt, oneDayAgo));
    const activeUsers24h = activeUsers24hResult?.count || 0;

    const [activeUsers7dResult] = await db
      .select({ count: sql<number>`COUNT(DISTINCT user_id)` })
      .from(analyticsEvents)
      .where(gte(analyticsEvents.createdAt, sevenDaysAgo));
    const activeUsers7d = activeUsers7dResult?.count || 0;

    const [betsResult] = await db.select({ 
      count: count(),
      total: sql<number>`COALESCE(SUM(wager_amount), 0)`,
      avg: sql<number>`COALESCE(AVG(wager_amount), 0)`
    }).from(trades);
    const totalBets = betsResult?.count || 0;
    const totalVolume = Number(betsResult?.total) || 0;
    const avgBetSize = Number(betsResult?.avg) || 0;

    const pageUsageRaw = await db
      .select({ 
        page: analyticsEvents.page,
        count: count()
      })
      .from(analyticsEvents)
      .where(eq(analyticsEvents.eventType, 'page_view'))
      .groupBy(analyticsEvents.page);

    const totalPageViews = pageUsageRaw.reduce((sum, p) => sum + (p.count || 0), 0);
    const pageUsage = pageUsageRaw
      .filter(p => p.page)
      .map(p => ({
        page: p.page!,
        count: p.count || 0,
        percentage: totalPageViews > 0 ? Math.round(((p.count || 0) / totalPageViews) * 100) : 0
      }))
      .sort((a, b) => b.count - a.count);

    const marketViewsRaw = await db
      .select({
        marketId: analyticsEvents.marketId,
        marketTitle: analyticsEvents.marketTitle,
        views: count()
      })
      .from(analyticsEvents)
      .where(eq(analyticsEvents.eventType, 'market_view'))
      .groupBy(analyticsEvents.marketId, analyticsEvents.marketTitle)
      .orderBy(desc(count()))
      .limit(10);

    const marketBetsRaw = await db
      .select({
        marketId: trades.marketId,
        bets: count()
      })
      .from(trades)
      .groupBy(trades.marketId);

    const betsMap = new Map(marketBetsRaw.map(m => [m.marketId, m.bets || 0]));

    const popularMarkets = marketViewsRaw
      .filter(m => m.marketId)
      .map(m => ({
        marketId: m.marketId!,
        marketTitle: m.marketTitle || 'Unknown',
        views: m.views || 0,
        bets: betsMap.get(m.marketId!) || 0
      }));

    return {
      totalUsers,
      activeUsers24h,
      activeUsers7d,
      totalBets,
      totalVolume,
      avgBetSize,
      pageUsage,
      popularMarkets
    };
  }
}

export const storage = new DatabaseStorage();
