import {
  Connection,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
  TransactionInstruction,
} from '@solana/web3.js';
import { USDC_MINT } from './jupiterSwap';
import { getRpcConfig, getRpcUrl } from '@/lib/rpc-config';

export const MIN_SOL_RESERVE = 0.001;

// Async version that ensures we have the proper config
async function getWithdrawConnectionAsync(): Promise<Connection> {
  const config = await getRpcConfig();
  console.log('[Withdraw] Using RPC URL:', config.provider, config.rpcUrl.includes('helius') ? '(Helius)' : '');
  return new Connection(config.rpcUrl, {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 60000,
  });
}

// Fallback sync version for confirmation checks
function getWithdrawConnection(): Connection {
  const rpcUrl = getRpcUrl();
  console.log('[Withdraw] Using RPC URL:', rpcUrl.includes('helius') ? 'Helius RPC' : rpcUrl);
  return new Connection(rpcUrl, {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 60000,
  });
}

// Retry wrapper for network operations
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      const errorMsg = error.message || '';
      // Only retry on network/transient errors, not on validation errors
      if (errorMsg.includes('403') || errorMsg.includes('blockhash') || errorMsg.includes('timeout') || errorMsg.includes('ECONNREFUSED')) {
        console.log(`[Withdraw] Attempt ${attempt + 1}/${maxRetries} failed, retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)));
        continue;
      }
      throw error; // Don't retry non-transient errors
    }
  }
  throw lastError;
}
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

export interface WithdrawResult {
  success: boolean;
  transaction?: VersionedTransaction;
  error?: string;
}

export function validateSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

function getAssociatedTokenAddress(
  mint: PublicKey,
  owner: PublicKey
): PublicKey {
  const [address] = PublicKey.findProgramAddressSync(
    [
      owner.toBytes(),
      TOKEN_PROGRAM_ID.toBytes(),
      mint.toBytes(),
    ],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return address;
}

function createAssociatedTokenAccountInstruction(
  payer: PublicKey,
  associatedToken: PublicKey,
  owner: PublicKey,
  mint: PublicKey
): TransactionInstruction {
  const keys = [
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: associatedToken, isSigner: false, isWritable: true },
    { pubkey: owner, isSigner: false, isWritable: false },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    data: new Uint8Array(0) as Buffer,
  });
}

function createSplTransferInstruction(
  source: PublicKey,
  destination: PublicKey,
  owner: PublicKey,
  amount: bigint
): TransactionInstruction {
  const data = new Uint8Array(9);
  data[0] = 3;
  const view = new DataView(data.buffer);
  view.setBigUint64(1, amount, true);

  const keys = [
    { pubkey: source, isSigner: false, isWritable: true },
    { pubkey: destination, isSigner: false, isWritable: true },
    { pubkey: owner, isSigner: true, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    programId: TOKEN_PROGRAM_ID,
    data: data as Buffer,
  });
}

export async function buildSolWithdrawal(
  fromPubkey: PublicKey,
  toPubkey: PublicKey,
  amountSol: number
): Promise<WithdrawResult> {
  try {
    const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL);

    if (lamports <= 0) {
      return { success: false, error: 'Amount must be greater than 0' };
    }

    // Use async connection to ensure proper RPC config, with retry logic
    const result = await withRetry(async () => {
      const connection = await getWithdrawConnectionAsync();
      const { blockhash } = await connection.getLatestBlockhash('confirmed');

      const instruction = SystemProgram.transfer({
        fromPubkey,
        toPubkey,
        lamports,
      });

      const messageV0 = new TransactionMessage({
        payerKey: fromPubkey,
        recentBlockhash: blockhash,
        instructions: [instruction],
      }).compileToV0Message();

      return new VersionedTransaction(messageV0);
    });

    return { success: true, transaction: result };
  } catch (error: any) {
    console.error('[Withdraw] SOL withdrawal error:', error);
    let errorMessage = error.message || 'Failed to build SOL withdrawal';
    
    if (errorMessage.includes('403') || errorMessage.includes('Access forbidden')) {
      errorMessage = 'Network error: Unable to connect to Solana network. Please try again.';
    } else if (errorMessage.includes('blockhash')) {
      errorMessage = 'Network congestion. Please try again in a moment.';
    }
    
    return { success: false, error: errorMessage };
  }
}

export async function buildUsdcWithdrawal(
  fromPubkey: PublicKey,
  toPubkey: PublicKey,
  amountUsdc: number
): Promise<WithdrawResult> {
  try {
    const usdcMint = new PublicKey(USDC_MINT);
    
    const usdcAmount = BigInt(Math.floor(amountUsdc * 1_000_000));

    if (usdcAmount <= BigInt(0)) {
      return { success: false, error: 'Amount must be greater than 0' };
    }

    const sourceAta = getAssociatedTokenAddress(usdcMint, fromPubkey);
    const destinationAta = getAssociatedTokenAddress(usdcMint, toPubkey);

    // Use async connection with retry logic
    const result = await withRetry(async () => {
      const connection = await getWithdrawConnectionAsync();
      const instructions: TransactionInstruction[] = [];

      let needsCreateAta = false;
      try {
        const destinationAccount = await connection.getAccountInfo(destinationAta);
        needsCreateAta = !destinationAccount;
      } catch (rpcError: any) {
        console.log('[Withdraw] Could not check destination account, will include create ATA instruction:', rpcError.message);
        needsCreateAta = true;
      }
      
      if (needsCreateAta) {
        instructions.push(
          createAssociatedTokenAccountInstruction(
            fromPubkey,
            destinationAta,
            toPubkey,
            usdcMint
          )
        );
      }

      instructions.push(
        createSplTransferInstruction(
          sourceAta,
          destinationAta,
          fromPubkey,
          usdcAmount
        )
      );

      const { blockhash } = await connection.getLatestBlockhash('confirmed');

      const messageV0 = new TransactionMessage({
        payerKey: fromPubkey,
        recentBlockhash: blockhash,
        instructions,
      }).compileToV0Message();

      return new VersionedTransaction(messageV0);
    });

    return { success: true, transaction: result };
  } catch (error: any) {
    console.error('[Withdraw] USDC withdrawal error:', error);
    let errorMessage = error.message || 'Failed to build USDC withdrawal';
    
    if (errorMessage.includes('403') || errorMessage.includes('Access forbidden')) {
      errorMessage = 'Network error: Unable to connect to Solana network. Please try again.';
    } else if (errorMessage.includes('blockhash')) {
      errorMessage = 'Network congestion. Please try again in a moment.';
    }
    
    return { success: false, error: errorMessage };
  }
}

export async function buildWithdrawalTransaction(
  token: 'SOL' | 'USDC',
  amount: number,
  fromAddress: string,
  toAddress: string
): Promise<WithdrawResult> {
  if (!validateSolanaAddress(toAddress)) {
    return { success: false, error: 'Invalid recipient wallet address' };
  }

  const fromPubkey = new PublicKey(fromAddress);
  const toPubkey = new PublicKey(toAddress);

  if (token === 'SOL') {
    return buildSolWithdrawal(fromPubkey, toPubkey, amount);
  } else {
    return buildUsdcWithdrawal(fromPubkey, toPubkey, amount);
  }
}

export async function confirmTransaction(signature: string): Promise<{ success: boolean; error?: string }> {
  try {
    const connection = getWithdrawConnection();
    
    const result = await connection.getSignatureStatus(signature, {
      searchTransactionHistory: true,
    });
    
    if (result.value?.err) {
      return { success: false, error: `Transaction failed: ${JSON.stringify(result.value.err)}` };
    }
    
    if (result.value?.confirmationStatus === 'confirmed' || result.value?.confirmationStatus === 'finalized') {
      return { success: true };
    }
    
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');
    
    if (confirmation.value.err) {
      return { success: false, error: `Transaction failed: ${JSON.stringify(confirmation.value.err)}` };
    }
    
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to confirm transaction' };
  }
}
