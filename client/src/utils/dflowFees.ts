/**
 * DFlow Prediction Market API Fee Calculator
 * 
 * Fee formula: scale * p * (1 - p) * contracts
 * 
 * Where:
 * - scale = fee coefficient (0.09 for Frost tier taker, 0.0225 for maker)
 * - p = fill price (probability 0-1)
 * - contracts = number of contracts traded
 * 
 * Platform Fee: 50% of DFlow VIP 0 (Frost tier) fees
 * - Platform Taker Scale: 0.045 (50% of 0.09)
 * - Platform Maker Scale: 0.01125 (50% of 0.0225)
 * 
 * See: https://pond.dflow.net/concepts/prediction/api-fees-and-rebates
 */

// Platform fee = 50% of DFlow VIP 0 rates
export const PLATFORM_TAKER_SCALE = 0.045;  // 50% of DFlow's 0.09
export const PLATFORM_MAKER_SCALE = 0.01125; // 50% of DFlow's 0.0225
export const PLATFORM_FEE_SCALE = 45; // For DFlow API (3 decimals: 45 = 0.045)

export interface FeeSchedule {
  tier: string;
  minVolume: number;
  maxVolume: number | null;
  takerScale: number;
  makerScale: number;
}

export const FEE_SCHEDULES: FeeSchedule[] = [
  { tier: 'Frost', minVolume: 0, maxVolume: 50_000_000, takerScale: 0.09, makerScale: 0.0225 },
  { tier: 'Glacier', minVolume: 50_000_000, maxVolume: 150_000_000, takerScale: 0.0875, makerScale: 0.021875 },
  { tier: 'Steel', minVolume: 150_000_000, maxVolume: 300_000_000, takerScale: 0.085, makerScale: 0.02125 },
  { tier: 'Obsidian', minVolume: 300_000_000, maxVolume: null, takerScale: 0.08, makerScale: 0.02 },
];

export type OrderType = 'taker' | 'maker';

/**
 * Get the fee schedule tier based on 30-day trading volume
 */
export function getFeeTier(volume30d: number = 0): FeeSchedule {
  for (const schedule of FEE_SCHEDULES) {
    if (schedule.maxVolume === null || volume30d < schedule.maxVolume) {
      return schedule;
    }
  }
  return FEE_SCHEDULES[FEE_SCHEDULES.length - 1];
}

/**
 * Calculate DFlow trading fee
 * 
 * @param price - Fill price (probability 0-1)
 * @param contracts - Number of contracts
 * @param orderType - 'taker' or 'maker'
 * @param volume30d - 30-day trading volume for tier calculation
 * @returns Fee amount in USDC
 */
export function calculateDFlowFee(
  price: number,
  contracts: number,
  orderType: OrderType = 'taker',
  volume30d: number = 0
): number {
  const tier = getFeeTier(volume30d);
  const scale = orderType === 'taker' ? tier.takerScale : tier.makerScale;
  
  // Fee formula: scale * p * (1 - p) * contracts
  const fee = scale * price * (1 - price) * contracts;
  
  return fee;
}

/**
 * Calculate the maximum DFlow fee (at p = 0.5)
 * This is the worst-case fee for a given number of contracts
 */
export function calculateMaxDFlowFee(
  contracts: number,
  orderType: OrderType = 'taker',
  volume30d: number = 0
): number {
  // Fee is maximized when p = 0.5 (p * (1-p) = 0.25)
  return calculateDFlowFee(0.5, contracts, orderType, volume30d);
}

/**
 * Calculate complete fee breakdown for a trade
 */
export interface FeeBreakdown {
  dflowFee: number;
  platformFee: number;
  totalFee: number;
  netShares: number;
  effectivePricePerShare: number;
  tier: string;
}

/**
 * Calculate platform fee using DFlow formula at 50% of their VIP 0 rate
 * Formula: scale × p × (1-p) × contracts
 * 
 * Since we need price to calculate exact fee, this returns the scale constant.
 * The actual fee is: PLATFORM_TAKER_SCALE × price × (1-price) × contracts
 * 
 * @param price - Fill price (probability 0-1)
 * @param contracts - Number of contracts
 * @param orderType - 'taker' or 'maker'
 * @returns Platform fee in USDC
 */
export function calculatePlatformFee(
  price: number,
  contracts: number,
  orderType: OrderType = 'taker'
): number {
  const scale = orderType === 'taker' ? PLATFORM_TAKER_SCALE : PLATFORM_MAKER_SCALE;
  return scale * price * (1 - price) * contracts;
}

/**
 * Calculate complete fee breakdown for a buy trade
 * 
 * DFlow deducts fees from the wager before buying contracts.
 * We solve algebraically for contracts after fees:
 * 
 * wager = platformFee + (contracts * price) + (scale * p * (1-p) * contracts)
 * wager - platformFee = contracts * (price + scale * p * (1-p))
 * contracts = (wager - platformFee) / (price + scale * p * (1-p))
 * 
 * IMPORTANT: Kalshi only accepts whole contracts, so we floor the result
 * and recalculate the actual spend to avoid fractional shares.
 * 
 * @param usdcAmount - Amount user wants to spend in USDC
 * @param price - Current price (probability 0-1)
 * @param channel - Trading channel for platform fee calculation
 * @returns Fee breakdown with whole shares and adjusted actual spend
 */
export function calculateTradeFeesForBuy(
  usdcAmount: number,
  price: number,
  _channel: 'swipe' | 'discovery' | 'positions' = 'swipe' // Channel no longer affects fee
): FeeBreakdown & { actualSpend: number; unspentAmount: number } {
  // Guard against invalid prices
  if (price <= 0 || price >= 1) {
    return {
      dflowFee: 0,
      platformFee: 0,
      totalFee: 0,
      netShares: 0,
      effectivePricePerShare: price,
      tier: 'Frost',
      actualSpend: 0,
      unspentAmount: usdcAmount,
    };
  }
  
  const tier = getFeeTier(0);
  const dflowScale = tier.takerScale; // 0.09 for Frost tier
  const platformScale = PLATFORM_TAKER_SCALE; // 0.045 (50% of DFlow)
  
  // Combined fee scale includes both DFlow and platform fees
  // This ensures total spend never exceeds the user's wager
  // Solve: wager = contracts * price + (dflowScale + platformScale) * p * (1-p) * contracts
  // contracts = wager / (price + (dflowScale + platformScale) * p * (1-p))
  const combinedScale = dflowScale + platformScale; // 0.135
  const combinedFeeMultiplier = combinedScale * price * (1 - price);
  const effectiveCostPerContract = price + combinedFeeMultiplier;
  
  // Calculate raw shares, then FLOOR to whole contracts
  const rawShares = effectiveCostPerContract > 0 
    ? usdcAmount / effectiveCostPerContract 
    : 0;
  const netShares = Math.floor(rawShares);
  
  // If we can't buy at least 1 whole share, return zero
  if (netShares < 1) {
    return {
      dflowFee: 0,
      platformFee: 0,
      totalFee: 0,
      netShares: 0,
      effectivePricePerShare: price,
      tier: tier.tier,
      actualSpend: 0,
      unspentAmount: usdcAmount,
    };
  }
  
  // Calculate fees based on filled contracts
  const dflowFeeMultiplier = dflowScale * price * (1 - price);
  const dflowFee = dflowFeeMultiplier * netShares;
  const platformFee = platformScale * price * (1 - price) * netShares;
  const contractCost = netShares * price;
  
  // Actual spend includes contract cost, DFlow fee, and platform fee
  // (Platform fee is collected via DFlow's platformFeeScale parameter)
  const actualSpend = contractCost + dflowFee + platformFee;
  const unspentAmount = Math.max(0, usdcAmount - actualSpend);
  
  const totalFee = dflowFee + platformFee;
  
  // Effective price per share including all fees
  const effectivePricePerShare = netShares > 0 ? actualSpend / netShares : price;
  
  return {
    dflowFee,
    platformFee,
    totalFee,
    netShares,
    effectivePricePerShare,
    tier: tier.tier,
    actualSpend,
    unspentAmount,
  };
}

/**
 * Calculate complete fee breakdown for a sell trade
 * 
 * For selling, the user has shares and receives USDC.
 * DFlow applies the same fee formula: scale * p * (1-p) * contracts
 * 
 * @param shares - Number of shares to sell
 * @param price - Current price (probability 0-1)
 * @returns Fee breakdown with netUSDC in the netShares field (for consistency)
 */
export function calculateTradeFeesForSell(
  shares: number,
  price: number
): FeeBreakdown & { netUSDC: number } {
  // Guard against invalid prices
  if (price <= 0 || price >= 1 || shares <= 0) {
    return {
      dflowFee: 0,
      platformFee: 0,
      totalFee: 0,
      netShares: shares,
      netUSDC: 0,
      effectivePricePerShare: price,
      tier: 'Frost',
    };
  }
  
  const tier = getFeeTier(0);
  const dflowScale = tier.takerScale; // 0.09 for Frost tier
  const platformScale = PLATFORM_TAKER_SCALE; // 0.045 (50% of DFlow)
  
  // DFlow fee for selling: scale * p * (1-p) * shares
  const dflowFee = dflowScale * price * (1 - price) * shares;
  
  // Platform fee uses same formula at 50% of DFlow rate
  const platformFee = platformScale * price * (1 - price) * shares;
  
  // Gross USDC from selling at price
  const grossUSDC = shares * price;
  
  const totalFee = dflowFee + platformFee;
  
  // Net USDC received after fees
  const netUSDC = Math.max(0, grossUSDC - totalFee);
  
  // Effective price per share after fees
  const effectivePricePerShare = shares > 0 ? netUSDC / shares : price;
  
  return {
    dflowFee,
    platformFee,
    totalFee,
    netShares: shares, // For sells, shares is input
    netUSDC,
    effectivePricePerShare,
    tier: tier.tier,
  };
}

/**
 * Format fee amount for display
 */
export function formatFee(fee: number): string {
  if (fee < 0.01) {
    return '<$0.01';
  }
  return `$${fee.toFixed(2)}`;
}

/**
 * Get fee explanation for display
 */
export function getFeeExplanation(price: number, contracts: number): string {
  const fee = calculateDFlowFee(price, contracts, 'taker');
  const maxPossibleFee = calculateMaxDFlowFee(contracts, 'taker');
  
  // Fee is lower when price is far from 0.5
  const discount = maxPossibleFee > 0 ? (1 - fee / maxPossibleFee) * 100 : 0;
  
  if (discount > 20) {
    return `DFlow fee: ${formatFee(fee)} (${discount.toFixed(0)}% lower due to lopsided odds)`;
  }
  
  return `DFlow fee: ${formatFee(fee)}`;
}
