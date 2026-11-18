import { useState, type FormEvent } from 'react';
import {
  ShieldCheck,
  Send,
  Link2,
  Download,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Loader2,
  Copy,
  Check,
  ExternalLink,
} from 'lucide-react';
import {
  buildMonthlyTransactionsCsv,
  calculateUnifiedPortfolio,
  evaluateDailyProfitGoal,
  evaluateMonthlyProfitGoal,
  evaluateWeeklyProfitGoal,
  validateOutgoingTransfer,
} from '../lib/jerryEngine';
import { apiFetch } from '../lib/apiClient';
import type {
  ExternalWalletConnection,
  IncomeStream,
  WalletAsset,
  WalletTransaction,
} from '../lib/types';

interface WalletDashboardProps {
  assets: WalletAsset[];
  externalWallets: ExternalWalletConnection[];
  transactions: WalletTransaction[];
  incomeStreams: IncomeStream[];
  dailyProfitThresholdUsd: number;
  weeklyProfitMinimumUsd?: number;
  monthlyProfitMinimumUsd?: number;
  profitReserveUsd?: number;
  lastWalletSyncAt?: string;
  onSubmitTransaction: (tx: WalletTransaction, approvalId: string) => Promise<string>;
  onResolveTransaction: (txId: string, decision: 'confirmed' | 'rejected') => Promise<void>;
  onSyncWalletReal: () => Promise<string>;
  onAttachPublicAddress: (
    assetId: string,
    address: string,
    useLiveOnChain: boolean
  ) => Promise<string>;
  onRecordRealIncome: (input: {
    asset: WalletAsset['symbol'];
    network: string;
    amount: number;
    counterparty: string;
    note: string;
    txHash?: string;
    isVerifiedOnChain: boolean;
  }) => Promise<string>;
}

export function WalletDashboard({
  assets,
  externalWallets,
  transactions,
  incomeStreams,
  dailyProfitThresholdUsd,
  weeklyProfitMinimumUsd = 5000,
  monthlyProfitMinimumUsd = 20000,
  profitReserveUsd = 1450,
  lastWalletSyncAt,
  onSubmitTransaction,
  onResolveTransaction,
  onSyncWalletReal,
  onAttachPublicAddress,
  onRecordRealIncome,
}: WalletDashboardProps) {
  const portfolio = calculateUnifiedPortfolio(assets, incomeStreams, profitReserveUsd);
  const monthlyProfitGoal = evaluateMonthlyProfitGoal(
    portfolio.monthlyNetProfitUsd,
    transactions,
    monthlyProfitMinimumUsd
  );
  const weeklyProfitGoal = evaluateWeeklyProfitGoal(
    portfolio.monthlyNetProfitUsd,
    transactions,
    weeklyProfitMinimumUsd
  );
  const dailyProfitGoal = evaluateDailyProfitGoal(
    portfolio.monthlyNetProfitUsd,
    transactions,
    dailyProfitThresholdUsd
  );
  const [selectedAssetId, setSelectedAssetId] = useState(assets[2]?.id ?? assets[0]?.id ?? '');
  const [destination, setDestination] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [transferApprovalId, setTransferApprovalId] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    asset: WalletAsset;
    destination: string;
    amount: number;
    estimatedFee: number;
    note: string;
  } | null>(null);

  // Real Market / On-Chain Sync & Settlement State
  const [syncingWallet, setSyncingWallet] = useState(false);
  const [walletStatusMsg, setWalletStatusMsg] = useState<string | null>(null);
  const [addressAssetId, setAddressAssetId] = useState(assets[2]?.id ?? assets[0]?.id ?? '');
  const [publicAddressInput, setPublicAddressInput] = useState('');
  const [useLiveOnChainBalance, setUseLiveOnChainBalance] = useState(true);
  const [linkingAddress, setLinkingAddress] = useState(false);

  // Payment Link & Incoming Settlement Verification State
  const [invoiceAmountUsd, setInvoiceAmountUsd] = useState('250');
  const [copiedUri, setCopiedUri] = useState(false);
  const [incomeCounterparty, setIncomeCounterparty] = useState('');
  const [incomeAmount, setIncomeAmount] = useState('250');
  const [incomeAsset, setIncomeAsset] = useState<WalletAsset['symbol']>('BTC');
  const [incomeTxHash, setIncomeTxHash] = useState('');
  const [incomeNote, setIncomeNote] = useState('');
  const [verifyingSettlement, setVerifyingSettlement] = useState(false);

  const selectedAsset = assets.find((a) => a.id === selectedAssetId) ?? assets[0];
  const bitcoinAsset = assets.find((a) => a.symbol === 'BTC') ?? assets[0];
  const receivingAddress = bitcoinAsset?.address && /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,59}$/.test(bitcoinAsset.address)
    ? bitcoinAsset.address
    : '';
  const bitcoinPaymentUri = receivingAddress ? `bitcoin:${receivingAddress}` : 'bitcoin:';

  const handlePrepareTransfer = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedAsset) return;
    setValidationError(null);

    const parsedAmount = Number(amount);
    const check = validateOutgoingTransfer({
      asset: selectedAsset.symbol,
      network: selectedAsset.network,
      amount: parsedAmount,
      destination,
      availableBalance: selectedAsset.balance,
      note,
    });

    if (!check.valid) {
      setValidationError(check.error ?? 'Invalid transfer details.');
      return;
    }

    setPendingConfirmation({
      asset: selectedAsset,
      destination: destination.trim(),
      amount: parsedAmount,
      estimatedFee: check.estimatedFee,
      note: note.trim() || 'Authorized outgoing transfer',
    });
  };

  const handleConfirmTransfer = async () => {
    if (!pendingConfirmation) return;
    if (!transferApprovalId.trim()) {
      setValidationError('Enter the approved bitcoin_transfer approval ID from Approval Center.');
      return;
    }
    const tx: WalletTransaction = {
      id: `tx-${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: 'outgoing',
      asset: pendingConfirmation.asset.symbol,
      network: pendingConfirmation.asset.network,
      amount: pendingConfirmation.amount,
      fee: pendingConfirmation.estimatedFee,
      counterparty: pendingConfirmation.destination,
      status: 'confirmed',
      note: pendingConfirmation.note,
    };
    try {
      await onSubmitTransaction(tx, transferApprovalId.trim());
      setPendingConfirmation(null);
      setTransferApprovalId('');
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Transfer authorization failed.');
      return;
    }
    setDestination('');
    setAmount('');
    setNote('');
  };

  const handleDownloadFinancialReport = () => {
    const { csv, monthPrefix, rowCount } = buildMonthlyTransactionsCsv(transactions);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `jerry-financial-report-${monthPrefix}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setWalletStatusMsg(
      `Downloaded CSV report for ${monthPrefix} (${rowCount} transaction${rowCount === 1 ? '' : 's'}).`
    );
  };

  const handleSyncMarketAndChain = async () => {
    if (syncingWallet) return;
    setSyncingWallet(true);
    try {
      const msg = await onSyncWalletReal();
      setWalletStatusMsg(msg);
    } catch (err) {
      setWalletStatusMsg(err instanceof Error ? err.message : 'Unable to sync market prices right now.');
    } finally {
      setSyncingWallet(false);
    }
  };

  const handleAttachAddressSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!publicAddressInput.trim() || linkingAddress) return;
    setLinkingAddress(true);
    try {
      const msg = await onAttachPublicAddress(
        addressAssetId,
        publicAddressInput.trim(),
        useLiveOnChainBalance
      );
      setWalletStatusMsg(msg);
      setPublicAddressInput('');
    } catch (err) {
      setWalletStatusMsg(err instanceof Error ? err.message : 'Could not attach public address.');
    } finally {
      setLinkingAddress(false);
    }
  };

  const handleCopyPaymentUri = async () => {
    try {
      await navigator.clipboard.writeText(bitcoinPaymentUri);
      setCopiedUri(true);
      setTimeout(() => setCopiedUri(false), 2000);
    } catch {
      setWalletStatusMsg('Copy the Bitcoin payment URI directly from the input field.');
    }
  };

  const handleVerifyAndRecordIncome = async (e: FormEvent) => {
    e.preventDefault();
    const parsedAmt = Number(incomeAmount);
    if (!incomeCounterparty.trim() || !Number.isFinite(parsedAmt) || parsedAmt <= 0 || verifyingSettlement) {
      return;
    }

    setVerifyingSettlement(true);
    try {
      const cleanHash = incomeTxHash.trim();
      const targetAsset = assets.find((a) => a.symbol === incomeAsset);
      const network = targetAsset?.network ?? 'Bitcoin Mainnet';
      let isVerifiedOnChain = false;

      if (cleanHash) {
        const res = await apiFetch('/api/wallet/verify-tx', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ txHash: cleanHash, network }),
        });
        const data = (await res.json()) as { verified?: boolean; blockNumber?: number; confirmations?: number; requiredConfirmations?: number; error?: string };
        if (!data.verified) {
          setWalletStatusMsg(
            data.error ?? `Transaction hash ${cleanHash.slice(0, 12)}... is not confirmed on ${network} yet.`
          );
          return;
        }
        isVerifiedOnChain = true;
      }

      const msg = await onRecordRealIncome({
        asset: incomeAsset,
        network,
        amount: parsedAmt,
        counterparty: incomeCounterparty.trim(),
        note: incomeNote.trim() || (isVerifiedOnChain ? 'On-chain verified receipt' : 'Verified client settlement entry'),
        txHash: cleanHash || undefined,
        isVerifiedOnChain,
      });
      setWalletStatusMsg(msg);
      setIncomeCounterparty('');
      setIncomeTxHash('');
      setIncomeNote('');
    } catch (err) {
      setWalletStatusMsg(err instanceof Error ? err.message : 'Unable to verify settlement right now.');
    } finally {
      setVerifyingSettlement(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Unified Financial Dashboard Header */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">
              Jerry Wallet — Live Treasury &amp; Financial Dashboard
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Live Coinbase spot valuation, public blockchain balance verification, and Bitcoin address linking.{' '}
              {lastWalletSyncAt && (
                <span className="font-mono tabular-nums text-slate-700">
                  Last synced: {lastWalletSyncAt.slice(0, 19).replace('T', ' ')} UTC
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={syncingWallet}
              onClick={() => void handleSyncMarketAndChain()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              {syncingWallet ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              Sync Live Market &amp; On-Chain
            </button>
            <button
              type="button"
              onClick={handleDownloadFinancialReport}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Download Financial Report
            </button>
          </div>
        </div>

        {walletStatusMsg && (
          <div className="px-3.5 py-2.5 rounded-lg bg-slate-900 text-white text-xs flex items-center justify-between gap-3">
            <span>{walletStatusMsg}</span>
            <button
              type="button"
              onClick={() => setWalletStatusMsg(null)}
              className="text-slate-300 hover:text-white underline shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 pt-5 border-t border-slate-200">
          <div>
            <p className="text-xs font-medium text-slate-500">Unified Treasury Value</p>
            <p className="text-2xl font-semibold text-slate-900 font-mono tabular-nums mt-1">
              ${portfolio.totalBalanceUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
              Built-in ${portfolio.builtInBalanceUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Invested Capital Holdings</p>
            <p className="text-2xl font-semibold text-slate-900 font-mono tabular-nums mt-1">
              ${portfolio.investedPrincipalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-slate-500 mt-1">Untouched core investment principal</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Saved Profit Reserve (Non-Investment)</p>
            <p className="text-2xl font-semibold text-emerald-700 font-mono tabular-nums mt-1">
              ${portfolio.savedProfitReserveUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-slate-500 mt-1">Daily earned profit kept outside investments</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">External Wallet Valuation</p>
            <p className="text-2xl font-semibold text-slate-900 font-mono tabular-nums mt-1">
              ${portfolio.externalBalanceUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-slate-500 mt-1">Verified Bitcoin address links only</p>
          </div>
        </div>

        {/* Top Priority Profit Minimums ($20k/mo, $5k/wk) & Daily Threshold ($1k/day) */}
        <div className="pt-4 border-t border-slate-200 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="font-semibold text-slate-900">
                Top Priority · Monthly Minimum
              </span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                ${monthlyProfitGoal.currentMonthlyProfitUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / $
                {monthlyProfitGoal.monthlyMinimumUsd.toLocaleString()}
              </span>
            </div>
            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  monthlyProfitGoal.achieved ? 'bg-emerald-600' : 'bg-blue-700'
                }`}
                style={{ width: `${monthlyProfitGoal.progressPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-500">
                Floor ${monthlyProfitGoal.monthlyMinimumUsd.toLocaleString()}/mo
              </span>
              <span
                className={`font-mono tabular-nums font-semibold ${
                  monthlyProfitGoal.achieved ? 'text-emerald-700' : 'text-blue-700'
                }`}
              >
                {monthlyProfitGoal.achieved
                  ? 'Monthly Minimum Met'
                  : `${monthlyProfitGoal.progressPct}% ($${monthlyProfitGoal.remainingUsd.toLocaleString()} remaining)`}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="font-semibold text-slate-900">
                Top Priority · Weekly Minimum
              </span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                ${weeklyProfitGoal.currentWeeklyProfitUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / $
                {weeklyProfitGoal.weeklyMinimumUsd.toLocaleString()}
              </span>
            </div>
            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  weeklyProfitGoal.achieved ? 'bg-emerald-600' : 'bg-blue-700'
                }`}
                style={{ width: `${weeklyProfitGoal.progressPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-500">
                Floor ${weeklyProfitGoal.weeklyMinimumUsd.toLocaleString()}/wk
              </span>
              <span
                className={`font-mono tabular-nums font-semibold ${
                  weeklyProfitGoal.achieved ? 'text-emerald-700' : 'text-blue-700'
                }`}
              >
                {weeklyProfitGoal.achieved
                  ? 'Weekly Minimum Met'
                  : `${weeklyProfitGoal.progressPct}% ($${weeklyProfitGoal.remainingUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} remaining)`}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="font-semibold text-slate-900">
                Daily Portfolio Profit Threshold Goal
              </span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                ${dailyProfitGoal.currentDailyProfitUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} today
              </span>
            </div>
            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  dailyProfitGoal.achieved ? 'bg-emerald-600' : 'bg-blue-700'
                }`}
                style={{ width: `${dailyProfitGoal.progressPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-500">
                Target ${dailyProfitGoal.dailyThresholdUsd.toLocaleString()}/day
              </span>
              <span
                className={`font-mono tabular-nums font-semibold whitespace-nowrap shrink-0 ${
                  dailyProfitGoal.achieved ? 'text-emerald-700' : 'text-blue-700'
                }`}
              >
                {dailyProfitGoal.achieved
                  ? 'Daily Threshold Achieved'
                  : `${dailyProfitGoal.progressPct}% ($${dailyProfitGoal.remainingUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} remaining)`}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* External Wallet Integration + Asset Ledger */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">External Wallet &amp; Public Address Link</h2>
          <p className="text-xs text-slate-500">
            Jerry Wallet accepts Bitcoin public receiving addresses only. Seed phrases and unsupported external wallet connections are not accepted.
          </p>
          <div className="divide-y divide-slate-200">
            {externalWallets.map((w) => (
              <div key={w.provider} className="py-3.5 first:pt-1 last:pb-0 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{w.provider}</p>
                  <p className="text-xs text-slate-500 font-mono">
                    {w.connected ? `${w.accountLabel} · ${w.network}` : 'Disconnected'}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-slate-500 bg-slate-100 border border-slate-200 whitespace-nowrap shrink-0">
                  <Link2 className="w-3.5 h-3.5" />
                  Use address link below
                </span>
              </div>
            ))}
          </div>

          <form onSubmit={handleAttachAddressSubmit} className="pt-3 border-t border-slate-200 space-y-2.5">
            <label htmlFor="public-addr-asset" className="block text-xs font-medium text-slate-700">
              Link Real Public Receiving Address
            </label>
            <select
              id="public-addr-asset"
              value={addressAssetId}
              onChange={(e) => setAddressAssetId(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-900"
            >
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.symbol} ({a.network})
                </option>
              ))}
            </select>
            <input
              type="text"
              value={publicAddressInput}
              onChange={(e) => setPublicAddressInput(e.target.value)}
              placeholder="Paste public 0x... or bc1... address"
              className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={useLiveOnChainBalance}
                onChange={(e) => setUseLiveOnChainBalance(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-slate-300"
              />
              Replace tracked ledger balance with live RPC query
            </label>
            <button
              type="submit"
              disabled={!publicAddressInput.trim() || linkingAddress}
              className="w-full px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-500 rounded-lg cursor-pointer"
            >
              {linkingAddress ? 'Querying Blockchain RPC...' : 'Attach Public Address'}
            </button>
          </form>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <span>
              Self-custody policy: Jerry never stores or requests 12/24-word seed phrases. Public RPC sync reads public balances only.
            </span>
          </div>
        </section>

        {/* Supported Digital Asset (BTC) */}
        <section className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">Digital Asset Holdings (Live Spot Valuation)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                  <th className="py-2.5 pr-4">Asset</th>
                  <th className="py-2.5 px-3">Source &amp; Mode</th>
                  <th className="py-2.5 px-3">Network</th>
                  <th className="py-2.5 px-3 text-right">Spot Price</th>
                  <th className="py-2.5 px-3 text-right">Balance</th>
                  <th className="py-2.5 pl-3 text-right">USD Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {assets.map((asset) => (
                  <tr key={asset.id}>
                    <td className="py-3 pr-4">
                      <p className="font-semibold text-slate-900">{asset.symbol}</p>
                      <p className="text-xs font-mono text-slate-500 truncate max-w-[180px]">
                        {asset.address}
                      </p>
                    </td>
                    <td className="py-3 px-3 text-xs text-slate-700">
                      <p>{asset.source}</p>
                      <p className="text-slate-500">
                        {asset.isLiveOnChainBalance ? 'Live On-Chain RPC' : 'Tracked Ledger'}
                      </p>
                    </td>
                    <td className="py-3 px-3 text-xs text-slate-600">{asset.network}</td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-xs text-slate-600">
                      ${asset.usdPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-900">
                      {asset.balance.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                    </td>
                    <td className="py-3 pl-3 text-right font-mono tabular-nums font-medium text-slate-900">
                      ${(asset.balance * asset.usdPrice).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Real Client Payment URI & On-Chain Settlement Verification */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Client Bitcoin Payment Request
          </h2>
          <p className="text-xs text-slate-500">
            Generate a Bitcoin receiving request targeting your treasury address. Jerry records it as financial truth only after the Bitcoin transaction is confirmed on-chain.
          </p>
          <div>
            <label htmlFor="invoice-usd-amount" className="block text-xs font-medium text-slate-700 mb-1">
              Invoice Amount (USD reference only)
            </label>
            <input
              id="invoice-usd-amount"
              type="number"
              min="1"
              step="any"
              value={invoiceAmountUsd}
              onChange={(e) => setInvoiceAmountUsd(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
            />
          </div>
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
            <p className="text-xs font-mono text-slate-700 break-all">{bitcoinPaymentUri}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleCopyPaymentUri()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-100 rounded-md cursor-pointer"
              >
                {copiedUri ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedUri ? 'Copied URI' : 'Copy Payment URI'}
              </button>
              <a
                href={`https://blockstream.info/address/${receivingAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-700 hover:text-blue-800"
              >
                View on Bitcoin explorer <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>

        <form onSubmit={handleVerifyAndRecordIncome} className="lg:col-span-7 space-y-3 border-t lg:border-t-0 lg:border-l border-slate-200 pt-4 lg:pt-0 lg:pl-6">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Record &amp; Verify Client Settlement
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Provide a Bitcoin transaction ID. Jerry records incoming funds only after the transaction is confirmed on the Bitcoin network.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-5">
              <label htmlFor="income-counterparty" className="block text-xs font-medium text-slate-700 mb-1">
                Client / Counterparty
              </label>
              <input
                id="income-counterparty"
                type="text"
                required
                value={incomeCounterparty}
                onChange={(e) => setIncomeCounterparty(e.target.value)}
                placeholder="e.g., Northstar Logistics Retainer"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>
            <div className="sm:col-span-3">
              <label htmlFor="income-asset" className="block text-xs font-medium text-slate-700 mb-1">
                Asset
              </label>
              <select
                id="income-asset"
                value={incomeAsset}
                onChange={(e) => setIncomeAsset(e.target.value as WalletAsset['symbol'])}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="BTC">BTC (Bitcoin Mainnet)</option>
              </select>
            </div>
            <div className="sm:col-span-4">
              <label htmlFor="income-amount" className="block text-xs font-medium text-slate-700 mb-1">
                Amount Received
              </label>
              <input
                id="income-amount"
                type="number"
                step="any"
                required
                value={incomeAmount}
                onChange={(e) => setIncomeAmount(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono tabular-nums border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-6">
              <label htmlFor="income-tx-hash" className="block text-xs font-medium text-slate-700 mb-1">
                Bitcoin Tx ID (required for verification)
              </label>
              <input
                id="income-tx-hash"
                type="text"
                value={incomeTxHash}
                onChange={(e) => setIncomeTxHash(e.target.value)}
                placeholder="0x... (66 chars)"
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div className="sm:col-span-6">
              <label htmlFor="income-note" className="block text-xs font-medium text-slate-700 mb-1">
                Invoice / Settlement Memo
              </label>
              <input
                id="income-note"
                type="text"
                value={incomeNote}
                onChange={(e) => setIncomeNote(e.target.value)}
                placeholder="e.g., Invoice #204 paid"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={verifyingSettlement || !incomeCounterparty.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-lg cursor-pointer"
          >
            {verifyingSettlement ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            {incomeTxHash.trim() ? 'Verify On-Chain Receipt & Credit Reserve' : 'Record Verified Ledger Settlement'}
          </button>
        </form>
      </section>

      {/* Prepare Gated Outgoing Transaction */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Prepare Outgoing Transaction</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Verify destination address, network, amount, and estimated fee before explicit owner confirmation.
          </p>
        </div>

        <form onSubmit={handlePrepareTransfer} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-3">
            <label htmlFor="tx-asset-select" className="block text-xs font-medium text-slate-700 mb-1">
              Asset &amp; Network
            </label>
            <select
              id="tx-asset-select"
              value={selectedAssetId}
              onChange={(e) => setSelectedAssetId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900"
            >
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.symbol} ({a.network}) — {a.balance}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-4">
            <label htmlFor="tx-destination" className="block text-xs font-medium text-slate-700 mb-1">
              Destination Address
            </label>
            <input
              id="tx-destination"
              type="text"
              required
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="0x... or bc1..."
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="tx-amount" className="block text-xs font-medium text-slate-700 mb-1">
              Amount ({selectedAsset?.symbol})
            </label>
            <input
              id="tx-amount"
              type="number"
              step="any"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <div className="md:col-span-3">
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Send className="w-4 h-4" />
              Verify &amp; Review Transfer
            </button>
          </div>
          <div className="md:col-span-12">
            <label htmlFor="tx-note" className="block text-xs font-medium text-slate-700 mb-1">
              Payment Memo / Purpose
            </label>
            <input
              id="tx-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g., Infrastructure invoice #108"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
        </form>

        {validationError && (
          <p className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3.5 py-2.5">
            {validationError}
          </p>
        )}

        {pendingConfirmation && (
          <div
            role="dialog"
            aria-label="Verify Outgoing Transaction"
            className="p-5 rounded-xl border border-amber-300 bg-amber-50/70 space-y-3"
          >
            <h3 className="text-sm font-semibold text-slate-900">
              Explicit Owner Verification Required
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div>
                <p className="text-slate-500">Asset &amp; Network</p>
                <p className="font-medium text-slate-900 mt-0.5">
                  {pendingConfirmation.asset.symbol} · {pendingConfirmation.asset.network}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Amount</p>
                <p className="font-mono tabular-nums font-semibold text-slate-900 mt-0.5">
                  {pendingConfirmation.amount} {pendingConfirmation.asset.symbol}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Estimated Network Fee</p>
                <p className="font-mono tabular-nums text-slate-900 mt-0.5">
                  {pendingConfirmation.estimatedFee} {pendingConfirmation.asset.symbol}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Destination</p>
                <p className="font-mono text-slate-900 mt-0.5 break-all">
                  {pendingConfirmation.destination}
                </p>
              </div>
            </div>
            <div>
              <label htmlFor="tx-approval-id" className="block text-xs font-medium text-slate-700 mb-1">Approved bitcoin_transfer ID</label>
              <input id="tx-approval-id" type="text" value={transferApprovalId} onChange={(e) => setTransferApprovalId(e.target.value)} placeholder="Paste approved ID from Approval Center" className="w-full px-3 py-2 text-xs font-mono border border-amber-300 rounded-lg bg-white" />
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleConfirmTransfer}
                className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                Authorize Bitcoin Transfer
              </button>
              <button
                type="button"
                onClick={() => setPendingConfirmation(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Transaction History */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900">Transaction &amp; Revenue History</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                <th className="py-2.5 pr-4">Date</th>
                <th className="py-2.5 px-3">Type &amp; Counterparty</th>
                <th className="py-2.5 px-3">Network</th>
                <th className="py-2.5 px-3 text-right">Amount</th>
                <th className="py-2.5 px-3 text-right">Fee</th>
                <th className="py-2.5 pl-3 text-right">Status / Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {transactions.map((tx) => (
                <tr key={tx.id}>
                  <td className="py-3 pr-4 font-mono tabular-nums text-xs text-slate-500">
                    {tx.timestamp.slice(0, 10)}
                  </td>
                  <td className="py-3 px-3">
                    <p className="font-medium text-slate-900 capitalize">
                      {tx.type.replace('_', ' ')} · {tx.counterparty}
                    </p>
                    <p className="text-xs text-slate-500">
                      {tx.note}
                      {tx.isVerifiedOnChain ? ' · Verified On-Chain' : tx.settlementMode === 'verified_ledger' ? ' · Verified Ledger Entry' : ''}
                    </p>
                  </td>
                  <td className="py-3 px-3 text-xs text-slate-600">{tx.network}</td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums font-medium text-slate-900">
                    {tx.type === 'outgoing' ? '-' : '+'}
                    {tx.amount} {tx.asset}
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums text-xs text-slate-500">
                    {tx.fee} {tx.asset}
                  </td>
                  <td className="py-3 pl-3 text-right">
                    {tx.status === 'pending_approval' ? (
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onResolveTransaction(tx.id, 'confirmed')}
                          aria-label={`Approve transaction ${tx.id}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded cursor-pointer"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => onResolveTransaction(tx.id, 'rejected')}
                          aria-label={`Reject transaction ${tx.id}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-rose-700 border border-rose-300 rounded cursor-pointer"
                        >
                          <XCircle className="w-3 h-3" />
                          Reject
                        </button>
                      </div>
                    ) : (
                      <span
                        className={`text-xs font-medium capitalize ${
                          tx.status === 'confirmed' ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {tx.status}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
