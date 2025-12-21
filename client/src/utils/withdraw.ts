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

const heliusApiKey = import.meta.env.VITE_HELIUS_API_KEY;
const SOLANA_RPC_URL = heliusApiKey 
  ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`
  : 'https://api.mainnet-beta.solana.com';

export const MIN_SOL_RESERVE = 0.001;
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
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL);

    if (lamports <= 0) {
      return { success: false, error: 'Amount must be greater than 0' };
    }

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

    const transaction = new VersionedTransaction(messageV0);

    return { success: true, transaction };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to build SOL withdrawal' };
  }
}

export async function buildUsdcWithdrawal(
  fromPubkey: PublicKey,
  toPubkey: PublicKey,
  amountUsdc: number
): Promise<WithdrawResult> {
  try {
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    const usdcMint = new PublicKey(USDC_MINT);
    
    const usdcAmount = BigInt(Math.floor(amountUsdc * 1_000_000));

    if (usdcAmount <= BigInt(0)) {
      return { success: false, error: 'Amount must be greater than 0' };
    }

    const sourceAta = getAssociatedTokenAddress(usdcMint, fromPubkey);
    const destinationAta = getAssociatedTokenAddress(usdcMint, toPubkey);

    const instructions: TransactionInstruction[] = [];

    const destinationAccount = await connection.getAccountInfo(destinationAta);
    if (!destinationAccount) {
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

    const transaction = new VersionedTransaction(messageV0);

    return { success: true, transaction };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to build USDC withdrawal' };
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
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    
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
