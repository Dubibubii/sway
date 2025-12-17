import { useState, useCallback, createContext, useContext, ReactNode } from 'react';
import { Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';

const HELIUS_API_KEY = import.meta.env.VITE_HELIUS_API_KEY || '';
const SOLANA_RPC = HELIUS_API_KEY 
  ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
  : 'https://api.mainnet-beta.solana.com';
const FEE_WALLET = '9DZEWwT47BKZnutbyJ4L5T8uEaVkwbQY8SeL3ehHHXGY';
const FEE_PERCENTAGE = 0.01;

export interface TransactionResult {
  signature: string;
  success: boolean;
  feeAmount?: number;
  recipientAmount?: number;
}

export interface SolanaTransactionContextType {
  sendSOL: (toAddress: string, amountSOL: number) => Promise<TransactionResult>;
  sendSOLWithFee: (toAddress: string, amountSOL: number) => Promise<TransactionResult>;
  isLoading: boolean;
  error: string | null;
}

export const SolanaTransactionContext = createContext<SolanaTransactionContextType | null>(null);

export function useSolanaTransaction(): SolanaTransactionContextType {
  const context = useContext(SolanaTransactionContext);
  if (!context) {
    return {
      sendSOL: async () => { throw new Error('Solana transaction context not available'); },
      sendSOLWithFee: async () => { throw new Error('Solana transaction context not available'); },
      isLoading: false,
      error: 'Context not available',
    };
  }
  return context;
}

export async function createSOLTransferTransaction(
  fromAddress: string,
  toAddress: string,
  amountSOL: number
): Promise<{ transaction: Transaction; connection: Connection }> {
  const connection = new Connection(SOLANA_RPC, 'confirmed');
  const fromPubkey = new PublicKey(fromAddress);
  const toPubkey = new PublicKey(toAddress);
  const lamports = Math.floor(amountSOL * LAMPORTS_PER_SOL);

  const transferInstruction = SystemProgram.transfer({
    fromPubkey,
    toPubkey,
    lamports
  });

  const transaction = new Transaction().add(transferInstruction);
  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = fromPubkey;

  return { transaction, connection };
}

export async function createSOLTransferWithFeeTransaction(
  fromAddress: string,
  toAddress: string,
  amountSOL: number
): Promise<{ transaction: Transaction; connection: Connection; feeAmount: number }> {
  const connection = new Connection(SOLANA_RPC, 'confirmed');
  const fromPubkey = new PublicKey(fromAddress);
  const toPubkey = new PublicKey(toAddress);
  const feePubkey = new PublicKey(FEE_WALLET);
  
  const feeAmount = amountSOL * FEE_PERCENTAGE;
  const netAmount = amountSOL - feeAmount;
  
  const mainLamports = Math.floor(netAmount * LAMPORTS_PER_SOL);
  const feeLamports = Math.floor(feeAmount * LAMPORTS_PER_SOL);

  if (mainLamports < 1 || feeLamports < 1) {
    throw new Error('Amount too small - minimum transaction size not met');
  }

  const mainTransfer = SystemProgram.transfer({
    fromPubkey,
    toPubkey,
    lamports: mainLamports
  });

  const feeTransfer = SystemProgram.transfer({
    fromPubkey,
    toPubkey: feePubkey,
    lamports: feeLamports
  });

  const transaction = new Transaction().add(mainTransfer, feeTransfer);
  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = fromPubkey;

  return { transaction, connection, feeAmount };
}

export const FEE_WALLET_ADDRESS = FEE_WALLET;
export const TRANSACTION_FEE_PERCENTAGE = FEE_PERCENTAGE;
