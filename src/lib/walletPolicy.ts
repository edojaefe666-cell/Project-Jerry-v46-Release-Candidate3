import type { ExternalWalletConnection, WalletAsset, WalletTransaction, JerryState } from './types';

export const DEFAULT_FIAT_CURRENCY = 'USD' as const;
export const SUPPORTED_CRYPTO_ASSET = 'BTC' as const;
export const SUPPORTED_CRYPTO_NETWORK = 'Bitcoin Mainnet' as const;

export function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: DEFAULT_FIAT_CURRENCY,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

export function isSupportedBitcoinAsset(asset: WalletAsset): boolean {
  return asset.symbol === SUPPORTED_CRYPTO_ASSET && asset.network === SUPPORTED_CRYPTO_NETWORK;
}

export function isSupportedBitcoinTransaction(tx: WalletTransaction): boolean {
  return tx.asset === SUPPORTED_CRYPTO_ASSET && tx.network === SUPPORTED_CRYPTO_NETWORK;
}

export function normalizeWalletRecords(input: Pick<JerryState, 'walletAssets' | 'externalWallets' | 'transactions'>) {
  const walletAssets = (input.walletAssets ?? []).filter(isSupportedBitcoinAsset);
  const fallbackAsset: WalletAsset = {
    id: 'asset-btc',
    symbol: SUPPORTED_CRYPTO_ASSET,
    network: SUPPORTED_CRYPTO_NETWORK,
    balance: 0,
    usdPrice: 0,
    source: 'Jerry Built-in',
    address: '',
  };

  return {
    walletAssets: walletAssets.length ? walletAssets : [fallbackAsset],
    externalWallets: (input.externalWallets ?? []).map((wallet: ExternalWalletConnection) => ({
      ...wallet,
      connected: false,
      accountLabel: 'Not linked',
      network: SUPPORTED_CRYPTO_NETWORK,
      lastSyncedAt: 'Never',
    })),
    // Historical records from unsupported networks are intentionally discarded from the financial truth set.
    transactions: (input.transactions ?? []).filter(isSupportedBitcoinTransaction),
  };
}

export function normalizeJerryWalletState(state: JerryState): JerryState {
  return {
    ...state,
    ...normalizeWalletRecords(state),
  };
}
