import type {
  AutonomousTask,
  BusinessOpportunity,
  BusinessVenture,
  DailyMoneyDiscovery,
  DailyProfitRecord,
  ExecutionDetail,
  Goal,
  HumanUnderstandingInsight,
  IncomeStream,
  InternetDominanceInsight,
  MemoryEntry,
  SalesPerformanceEntry,
  WalletAsset,
  WalletTransaction,
} from './types';

export interface GoalProgressSummary {
  totalSteps: number;
  completedSteps: number;
  percentage: number;
}

export function computeGoalProgress(goal: Goal): GoalProgressSummary {
  let totalSteps = 0;
  let completedSteps = 0;

  for (const phase of goal.phases) {
    for (const milestone of phase.milestones) {
      for (const task of milestone.tasks) {
        for (const subtask of task.subtasks) {
          for (const step of subtask.actionSteps) {
            totalSteps += 1;
            if (step.execution.completed) {
              completedSteps += 1;
            }
          }
        }
      }
    }
  }

  const percentage = totalSteps === 0 ? 0 : Math.round((completedSteps / totalSteps) * 100);
  return { totalSteps, completedSteps, percentage };
}

export function toggleExecutionStep(goal: Goal, actionStepId: string): Goal {
  return {
    ...goal,
    phases: goal.phases.map((phase) => ({
      ...phase,
      milestones: phase.milestones.map((milestone) => ({
        ...milestone,
        tasks: milestone.tasks.map((task) => ({
          ...task,
          subtasks: task.subtasks.map((subtask) => ({
            ...subtask,
            actionSteps: subtask.actionSteps.map((step) => {
              if (step.id !== actionStepId) return step;
              const updatedExecution: ExecutionDetail = {
                ...step.execution,
                completed: !step.execution.completed,
              };
              return { ...step, execution: updatedExecution };
            }),
          })),
        })),
      })),
    })),
  };
}

export function createIdempotencyKey(goalId: string, title: string): string {
  const normalized = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 32);
  return `${goalId}:${normalized}`;
}

export function shouldRequireExplicitApproval(
  category: AutonomousTask['category'],
  financialImpactUsd: number,
  autonomyThresholdUsd: number,
  explicitSensitiveFlag = false
): { requiresApproval: boolean; reason?: string } {
  if (explicitSensitiveFlag) {
    return {
      requiresApproval: true,
      reason: 'Involves confidential information sharing or major objective modification.',
    };
  }
  if (financialImpactUsd > autonomyThresholdUsd) {
    return {
      requiresApproval: true,
      reason: `Financial commitment ($${financialImpactUsd.toLocaleString()}) exceeds autonomous threshold ($${autonomyThresholdUsd.toLocaleString()}).`,
    };
  }
  if (category === 'financial' && financialImpactUsd > 0) {
    return {
      requiresApproval: true,
      reason: 'Outgoing financial payment or transfer requires explicit owner approval.',
    };
  }
  return { requiresApproval: false };
}

export function createAutonomousTask(
  existingTasks: AutonomousTask[],
  input: {
    goalId: string;
    title: string;
    description: string;
    category: AutonomousTask['category'];
    financialImpactUsd: number;
    autonomyThresholdUsd: number;
    backgroundEligible: boolean;
    explicitSensitiveFlag?: boolean;
  }
): { task: AutonomousTask | null; duplicateBlocked: boolean } {
  const idempotencyKey = createIdempotencyKey(input.goalId, input.title);
  const activeDuplicate = existingTasks.find(
    (t) => t.idempotencyKey === idempotencyKey && t.status !== 'completed' && t.status !== 'rejected'
  );
  if (activeDuplicate) {
    return { task: null, duplicateBlocked: true };
  }

  const gate = shouldRequireExplicitApproval(
    input.category,
    input.financialImpactUsd,
    input.autonomyThresholdUsd,
    input.explicitSensitiveFlag
  );

  const task: AutonomousTask = {
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    goalId: input.goalId,
    title: input.title.trim(),
    description: input.description.trim(),
    category: input.category,
    status: gate.requiresApproval ? 'awaiting_approval' : 'queued',
    idempotencyKey,
    attempts: 0,
    lastCheckpoint: gate.requiresApproval
      ? 'Paused at owner authorization gate before execution.'
      : 'Task queued with idempotency lock.',
    requiresApproval: gate.requiresApproval,
    approvalReason: gate.reason,
    financialImpactUsd: input.financialImpactUsd,
    backgroundEligible: input.backgroundEligible,
    updatedAt: new Date().toISOString(),
  };

  return { task, duplicateBlocked: false };
}

export function recoverInterruptedTasks(tasks: AutonomousTask[]): {
  updatedTasks: AutonomousTask[];
  recoveredCount: number;
} {
  let recoveredCount = 0;
  const seenKeys = new Set<string>();

  const updatedTasks = tasks.map((task) => {
    if (task.status === 'interrupted') {
      if (seenKeys.has(task.idempotencyKey)) {
        return task;
      }
      seenKeys.add(task.idempotencyKey);
      recoveredCount += 1;
      return {
        ...task,
        status: task.requiresApproval ? ('awaiting_approval' as const) : ('running' as const),
        attempts: task.attempts + 1,
        lastCheckpoint: `Resumed safely from checkpoint after interruption (attempt #${task.attempts + 1}).`,
        updatedAt: new Date().toISOString(),
      };
    }
    if (task.status === 'running' || task.status === 'queued') {
      seenKeys.add(task.idempotencyKey);
    }
    return task;
  });

  return { updatedTasks, recoveredCount };
}

export interface AuthoritativeRevenueSummary {
  confirmedBusinessRevenueUsd: number;
  transactionCount: number;
  excludedCount: number;
}

/**
 * Canonical USD revenue projection from the durable transaction state.
 * Only confirmed business-revenue BTC settlements with an authoritative USD
 * valuation contribute. Reorged, rejected, pending, unvalued, and duplicate
 * records are excluded. On-chain tx hashes are the replay identity when present.
 */
export function calculateAuthoritativeRevenueUsd(
  transactions: WalletTransaction[],
  referenceDateIso?: string,
  period: 'day' | 'week' | 'month' | 'all' = 'all'
): AuthoritativeRevenueSummary {
  const refDay = (referenceDateIso ?? new Date().toISOString()).slice(0, 10);
  const refMidnightMs = Date.parse(`${refDay}T00:00:00Z`);
  const refMonth = refDay.slice(0, 7);
  const seen = new Set<string>();
  let confirmedBusinessRevenueUsd = 0;
  let transactionCount = 0;
  let excludedCount = 0;

  for (const tx of transactions) {
    const identity = tx.txHash?.trim().toLowerCase() || `id:${tx.id}`;
    if (seen.has(identity)) {
      excludedCount += 1;
      continue;
    }
    seen.add(identity);

    const txDay = tx.timestamp.slice(0, 10);
    const txMidnightMs = Date.parse(`${txDay}T00:00:00Z`);
    const inPeriod = period === 'all'
      || (period === 'day' && txDay === refDay)
      || (period === 'month' && txDay.slice(0, 7) === refMonth)
      || (period === 'week' && !Number.isNaN(refMidnightMs) && !Number.isNaN(txMidnightMs) && (refMidnightMs - txMidnightMs) >= 0 && (refMidnightMs - txMidnightMs) < 7 * 86400000);

    if (!inPeriod || tx.status !== 'confirmed' || tx.type !== 'business_revenue' || tx.asset !== 'BTC' || !Number.isFinite(tx.usdValue)) {
      excludedCount += 1;
      continue;
    }

    const usdValue = Number(tx.usdValue);
    if (usdValue <= 0) {
      excludedCount += 1;
      continue;
    }
    confirmedBusinessRevenueUsd += usdValue;
    transactionCount += 1;
  }

  return {
    confirmedBusinessRevenueUsd: Math.round(confirmedBusinessRevenueUsd * 100) / 100,
    transactionCount,
    excludedCount,
  };
}

export interface PortfolioSummary {
  totalBalanceUsd: number;
  builtInBalanceUsd: number;
  externalBalanceUsd: number;
  savedProfitReserveUsd: number;
  investedPrincipalUsd: number;
  monthlyGrossRevenueUsd: number;
  monthlyNetProfitUsd: number;
}

export function calculateUnifiedPortfolio(
  assets: WalletAsset[],
  streams: IncomeStream[],
  profitReserveUsd = 0
): PortfolioSummary {
  let totalBalanceUsd = 0;
  let builtInBalanceUsd = 0;
  let externalBalanceUsd = 0;

  for (const asset of assets) {
    const usd = asset.balance * asset.usdPrice;
    totalBalanceUsd += usd;
    if (asset.source === 'Jerry Built-in') {
      builtInBalanceUsd += usd;
    } else {
      externalBalanceUsd += usd;
    }
  }

  let monthlyGrossRevenueUsd = 0;
  let monthlyExpenseUsd = 0;
  for (const stream of streams) {
    monthlyGrossRevenueUsd += stream.monthlyRevenueUsd;
    monthlyExpenseUsd += stream.monthlyExpenseUsd;
  }

  // The saved profit reserve is a separate accounting bucket from wallet
  // assets. It must never be subtracted from wallet assets to manufacture an
  // "invested principal" figure, nor should it be counted twice if a reserve
  // value is displayed alongside the wallet balances.
  const investedPrincipalUsd = Math.max(0, Math.round(totalBalanceUsd * 100) / 100);
  const savedProfitReserveUsd = Math.max(0, Math.round(profitReserveUsd * 100) / 100);
  const totalOwnedCapitalUsd = Math.round((investedPrincipalUsd + savedProfitReserveUsd) * 100) / 100;

  return {
    totalBalanceUsd: totalOwnedCapitalUsd,
    builtInBalanceUsd: Math.round(builtInBalanceUsd * 100) / 100,
    externalBalanceUsd: Math.round(externalBalanceUsd * 100) / 100,
    savedProfitReserveUsd,
    investedPrincipalUsd,
    monthlyGrossRevenueUsd: Math.round(monthlyGrossRevenueUsd * 100) / 100,
    monthlyNetProfitUsd: Math.round((monthlyGrossRevenueUsd - monthlyExpenseUsd) * 100) / 100,
  };
}

export interface TransferValidationInput {
  asset: WalletTransaction['asset'];
  network: string;
  amount: number;
  destination: string;
  availableBalance: number;
  note?: string;
}

export interface TransferValidationResult {
  valid: boolean;
  error?: string;
  estimatedFee: number;
}

const FEE_ESTIMATES: Record<WalletTransaction['asset'], number> = {
  BTC: 0.00018,
};

export function calculateSpendableBalance(
  walletBalance: number,
  transactions: WalletTransaction[],
  asset: WalletTransaction['asset'],
  network: string,
): number {
  const reserved = transactions
    .filter((tx) => tx.type === 'outgoing' && tx.asset === asset && tx.network === network && tx.status === 'pending_approval')
    .reduce((sum, tx) => sum + Math.max(0, Number(tx.amount) || 0) + Math.max(0, Number(tx.fee) || 0), 0);
  return Math.max(0, (Number(walletBalance) || 0) - reserved);
}

export function validateOutgoingTransferAgainstReservations(
  input: TransferValidationInput,
  transactions: WalletTransaction[],
): TransferValidationResult {
  const result = validateOutgoingTransfer({
    ...input,
    availableBalance: calculateSpendableBalance(input.availableBalance, transactions, input.asset, input.network),
  });
  return result;
}

export function validateOutgoingTransfer(input: TransferValidationInput): TransferValidationResult {
  const dest = input.destination.trim();
  const note = (input.note ?? '').toLowerCase();

  if (input.asset !== 'BTC' || input.network !== 'Bitcoin Mainnet') {
    return {
      valid: false,
      error: 'Jerry Wallet supports BTC on Bitcoin Mainnet only.',
      estimatedFee: 0,
    };
  }

  if (dest.toLowerCase().includes('seed') || note.includes('seed phrase') || note.includes('mnemonic')) {
    return {
      valid: false,
      error: 'Security policy blocks any entry referencing seed phrases or recovery mnemonics.',
      estimatedFee: 0,
    };
  }

  if (!dest || dest.length < 12) {
    return {
      valid: false,
      error: 'Enter a valid destination wallet address (minimum 12 characters).',
      estimatedFee: 0,
    };
  }

  if (!input.network.trim()) {
    return {
      valid: false,
      error: 'Select a destination network before preparing the transaction.',
      estimatedFee: 0,
    };
  }

  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return {
      valid: false,
      error: 'Transfer amount must be greater than zero.',
      estimatedFee: 0,
    };
  }

  const estimatedFee = FEE_ESTIMATES[input.asset];
  if (input.amount + estimatedFee > input.availableBalance) {
    return {
      valid: false,
      error: `Insufficient ${input.asset} balance to cover amount plus network fee (${estimatedFee} ${input.asset}).`,
      estimatedFee,
    };
  }

  return {
    valid: true,
    estimatedFee,
  };
}

export function filterMemories(
  entries: MemoryEntry[],
  query: string,
  category: string
): MemoryEntry[] {
  const normalizedQuery = query.trim().toLowerCase();
  return entries.filter((entry) => {
    const matchesCategory = category === 'all' || entry.category === category;
    if (!matchesCategory) return false;
    if (!normalizedQuery) return true;
    return (
      entry.title.toLowerCase().includes(normalizedQuery) ||
      entry.content.toLowerCase().includes(normalizedQuery) ||
      entry.tags.some((t) => t.toLowerCase().includes(normalizedQuery))
    );
  });
}

export function validateOpportunityAssessment(opp: BusinessOpportunity): {
  compliant: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];
  if (opp.verifiedFacts.length === 0) {
    warnings.push('No verified market facts documented yet.');
  }
  if (opp.estimatesAndAssumptions.length === 0) {
    warnings.push('Estimates and assumptions must be explicitly separated from verified data.');
  }
  if (!opp.legalAndEthicalNotes.trim()) {
    warnings.push('Legal and ethical assessment is required.');
  }
  if (/\b(?<!not\s)guaranteed\b|100% certain|risk-free/i.test(opp.estimatedMonthlyReturn)) {
    warnings.push('Jerry policy prohibits guaranteeing profits or claiming risk-free returns.');
  }
  return {
    compliant: warnings.length === 0,
    warnings,
  };
}

export const ALL_PROGRAMMING_LANGUAGES = [
  'TypeScript',
  'JavaScript',
  'Python',
  'Kotlin',
  'Java',
  'Rust',
  'Go',
  'Swift',
  'C++',
  'C#',
  'SQL',
  'Solidity',
  'Dart',
  'Ruby',
  'PHP',
  'Scala',
  'Elixir',
  'R',
  'Haskell',
  'Lua',
  'Bash / Shell',
] as const;

export function auditSelfProgrammedCode(code: string): {
  passed: boolean;
  notes: string;
} {
  const normalized = code.trim();
  if (!normalized) {
    return {
      passed: false,
      notes: 'Generated code payload is empty.',
    };
  }

  const prohibitedPatterns: Array<{ pattern: RegExp; reason: string }> = [
    {
      pattern: /disableApproval|bypassGate|skipOwnerApproval|overrideSecurityPolicy/i,
      reason: 'Attempts to bypass explicit owner approval or modify security policies.',
    },
    {
      pattern: /seedPhrase|recoveryMnemonic|exportPrivateKey/i,
      reason: 'References wallet seed phrases or private key extraction.',
    },
    {
      pattern: /\brm\s+-rf\b|\bchild_process\b|\beval\s*\(/i,
      reason: 'Contains unsafe dynamic execution or destructive shell primitives.',
    },
  ];

  for (const rule of prohibitedPatterns) {
    if (rule.pattern.test(normalized)) {
      return {
        passed: false,
        notes: `Security Policy Blocked: ${rule.reason}`,
      };
    }
  }

  return {
    passed: true,
    notes: 'Security policy intact: approval gates, wallet key custody, and permission boundaries preserved.',
  };
}

export function canDeploySelfUpgrade(proposal: {
  securityAuditPassed: boolean;
  testStatus: 'pending' | 'passed' | 'failed';
  approvalStatus: 'awaiting_permission' | 'approved' | 'approved_deployed' | 'rejected';
}): { allowed: boolean; reason?: string } {
  if (!proposal.securityAuditPassed) {
    return {
      allowed: false,
      reason: 'Cannot deploy: security policy audit failed.',
    };
  }
  if (proposal.testStatus !== 'passed') {
    return {
      allowed: false,
      reason: 'Cannot deploy: verification tests must pass before deployment.',
    };
  }
  if (proposal.approvalStatus !== 'approved') {
    return {
      allowed: false,
      reason: proposal.approvalStatus === 'rejected'
        ? 'Proposal was rejected by the owner.'
        : 'Cannot deploy: explicit owner approval is required.',
    };
  }
  return { allowed: true };
}

export function executeRevenueTask(
  task: AutonomousTask,
  revenueGeneratedUsd: number,
  deliverableOutput: string
): {
  updatedTask: AutonomousTask;
  revenueTransaction: WalletTransaction | null;
} {
  if (task.status === 'awaiting_approval') {
    return {
      updatedTask: task,
      revenueTransaction: null,
    };
  }

  const safeRevenue = Math.max(0, Math.round(revenueGeneratedUsd * 100) / 100);
  const now = new Date().toISOString();

  const updatedTask: AutonomousTask = {
    ...task,
    status: 'completed',
    attempts: task.attempts + 1,
    // A task execution estimate is not a verified settlement. Keep it as projectedRevenueUsd;
    // realizedRevenueUsd is reserved for confirmed financial settlement records.
    realizedRevenueUsd: undefined,
    projectedRevenueUsd: safeRevenue,
    deliverableOutput,
    lastCheckpoint:
      safeRevenue > 0
        ? `Executed cleanly and recorded $${safeRevenue.toLocaleString()} business revenue in Jerry Wallet.`
        : `Executed cleanly: ${deliverableOutput}`,
    updatedAt: now,
  };

  // No wallet transaction is created here. A business task can produce a deliverable
  // and a projected USD amount, but it cannot manufacture confirmed crypto settlement.
  const revenueTransaction: WalletTransaction | null = null;

  return { updatedTask, revenueTransaction };
}

export interface VenturePerformancePoint {
  id: string;
  ventureName: string;
  shortName: string;
  stage: BusinessVenture['stage'];
  projectedRoiPct: number;
  actualRoiPct: number;
  projectedProfitUsd: number;
  actualProfitUsd: number;
  variancePct: number;
  monthlyRevenueUsd: number;
  monthlyExpensesUsd: number;
}

export function buildVentureRoiSeries(ventures: BusinessVenture[]): VenturePerformancePoint[] {
  return ventures
    .filter((v) => v.stage !== 'Planning')
    .map((v) => {
      const actualProfitUsd = Math.round((v.monthlyRevenueUsd - v.monthlyExpensesUsd) * 100) / 100;
      const actualRoiPct =
        v.monthlyExpensesUsd > 0
          ? Math.round((actualProfitUsd / v.monthlyExpensesUsd) * 100)
          : 0;
      const projectedRoiPct =
        v.projectedRoiPct ?? Math.max(150, Math.round(Math.abs(actualRoiPct) * 1.1));
      const projectedProfitUsd =
        v.projectedMonthlyProfitUsd ??
        Math.round((projectedRoiPct / 100) * Math.max(v.monthlyExpensesUsd, 100));
      const shortName =
        v.name.length > 18 ? `${v.name.slice(0, 16).trimEnd()}…` : v.name;

      return {
        id: v.id,
        ventureName: v.name,
        shortName,
        stage: v.stage,
        projectedRoiPct,
        actualRoiPct,
        projectedProfitUsd,
        actualProfitUsd,
        variancePct: actualRoiPct - projectedRoiPct,
        monthlyRevenueUsd: v.monthlyRevenueUsd,
        monthlyExpensesUsd: v.monthlyExpensesUsd,
      };
    });
}

export interface IncomeProjectionPoint {
  period: string;
  label: string;
  kind: 'Historical' | 'Forecast';
  actualRevenueUsd: number | null;
  forecastRevenueUsd: number | null;
  trendRevenueUsd: number;
  conservativeRevenueUsd?: number;
  optimisticRevenueUsd?: number;
  expensesUsd: number;
  netProfitUsd: number;
  dealsClosed: number | null;
  pipelineValueUsd: number | null;
}

export interface IncomeProjectionSummary {
  nextPeriod: string;
  lastPeriod: string;
  lastRevenueUsd: number;
  projectedRevenueUsd: number;
  conservativeRevenueUsd: number;
  optimisticRevenueUsd: number;
  projectedExpensesUsd: number;
  projectedNetProfitUsd: number;
  momGrowthPct: number;
  avgMonthlyDeltaUsd: number;
  points: IncomeProjectionPoint[];
}

function incrementPeriod(period: string): string {
  const match = period.match(/^(\d{4})-(\d{2})$/);
  if (!match) return 'Next Month';
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month >= 12) {
    return `${year + 1}-01`;
  }
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

export function buildIncomeProjection(
  salesReports: SalesPerformanceEntry[],
  currentRunRateUsd?: number
): IncomeProjectionSummary {
  if (salesReports.length === 0) {
    const fallbackRev = Math.max(0, Math.round(currentRunRateUsd ?? 0));
    return {
      nextPeriod: 'Next Month',
      lastPeriod: 'Baseline',
      lastRevenueUsd: fallbackRev,
      projectedRevenueUsd: fallbackRev,
      conservativeRevenueUsd: Math.round(fallbackRev * 0.9),
      optimisticRevenueUsd: Math.round(fallbackRev * 1.1),
      projectedExpensesUsd: 0,
      projectedNetProfitUsd: fallbackRev,
      momGrowthPct: 0,
      avgMonthlyDeltaUsd: 0,
      points: [],
    };
  }

  // Aggregate by period and sort chronologically
  const byPeriod = new Map<
    string,
    { revenue: number; expenses: number; pipeline: number; deals: number }
  >();
  for (const row of salesReports) {
    const existing = byPeriod.get(row.period) ?? {
      revenue: 0,
      expenses: 0,
      pipeline: 0,
      deals: 0,
    };
    byPeriod.set(row.period, {
      revenue: existing.revenue + row.closedRevenueUsd,
      expenses: existing.expenses + row.expensesUsd,
      pipeline: existing.pipeline + row.pipelineValueUsd,
      deals: existing.deals + row.dealsClosed,
    });
  }

  const ordered = Array.from(byPeriod.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, totals]) => ({ period, ...totals }));

  if (
    typeof currentRunRateUsd === 'number' &&
    currentRunRateUsd > ordered[ordered.length - 1].revenue
  ) {
    ordered[ordered.length - 1] = {
      ...ordered[ordered.length - 1],
      revenue: Math.round(currentRunRateUsd),
    };
  }

  const n = ordered.length;
  const meanX = (n - 1) / 2;
  const meanY = ordered.reduce((sum, item) => sum + item.revenue, 0) / n;

  let slope = 0;
  if (n > 1) {
    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < n; i += 1) {
      const dx = i - meanX;
      numerator += dx * (ordered[i].revenue - meanY);
      denominator += dx * dx;
    }
    slope = denominator > 0 ? numerator / denominator : 0;
  }

  const intercept = meanY - slope * meanX;
  const projectedRevenueUsd = Math.max(0, Math.round(intercept + slope * n));
  const lastPoint = ordered[n - 1];
  const lastRevenueUsd = lastPoint.revenue;
  const nextPeriod = incrementPeriod(lastPoint.period);
  const avgExpenses = Math.round(
    ordered.reduce((sum, item) => sum + item.expenses, 0) / n
  );
  const projectedExpensesUsd = Math.max(0, avgExpenses);
  const projectedNetProfitUsd = projectedRevenueUsd - projectedExpensesUsd;
  const conservativeRevenueUsd = Math.max(
    0,
    Math.round(projectedRevenueUsd * 0.9)
  );
  const optimisticRevenueUsd = Math.max(
    projectedRevenueUsd,
    Math.round(projectedRevenueUsd * 1.12)
  );
  const momGrowthPct =
    lastRevenueUsd > 0
      ? Math.round(((projectedRevenueUsd - lastRevenueUsd) / lastRevenueUsd) * 1000) / 10
      : 0;

  const historicalPoints: IncomeProjectionPoint[] = ordered.map((item, idx) => ({
    period: item.period,
    label: item.period,
    kind: 'Historical',
    actualRevenueUsd: item.revenue,
    forecastRevenueUsd: null,
    trendRevenueUsd: Math.max(0, Math.round(intercept + slope * idx)),
    expensesUsd: item.expenses,
    netProfitUsd: item.revenue - item.expenses,
    dealsClosed: item.deals,
    pipelineValueUsd: item.pipeline,
  }));

  const forecastPoint: IncomeProjectionPoint = {
    period: nextPeriod,
    label: `${nextPeriod} (Forecast)`,
    kind: 'Forecast',
    actualRevenueUsd: null,
    forecastRevenueUsd: projectedRevenueUsd,
    trendRevenueUsd: projectedRevenueUsd,
    conservativeRevenueUsd,
    optimisticRevenueUsd,
    expensesUsd: projectedExpensesUsd,
    netProfitUsd: projectedNetProfitUsd,
    dealsClosed: null,
    pipelineValueUsd: null,
  };

  return {
    nextPeriod,
    lastPeriod: lastPoint.period,
    lastRevenueUsd,
    projectedRevenueUsd,
    conservativeRevenueUsd,
    optimisticRevenueUsd,
    projectedExpensesUsd,
    projectedNetProfitUsd,
    momGrowthPct,
    avgMonthlyDeltaUsd: Math.round(slope),
    points: [...historicalPoints, forecastPoint],
  };
}

export interface DailyProfitProgress {
  dailyThresholdUsd: number;
  monthlyEquivalentTargetUsd: number;
  dailyRunRateUsd: number;
  todaySettledUsd: number;
  currentDailyProfitUsd: number;
  remainingUsd: number;
  progressPct: number;
  achieved: boolean;
}

export function evaluateDailyProfitGoal(
  monthlyNetProfitUsd: number,
  transactions: WalletTransaction[],
  dailyThresholdUsd = 1000,
  referenceDateIso?: string
): DailyProfitProgress {
  const safeTarget = Math.max(1, Math.round(dailyThresholdUsd * 100) / 100);
  const refDay = (referenceDateIso ?? new Date().toISOString()).slice(0, 10);
  const dailyRunRateUsd = Math.round((Math.max(0, monthlyNetProfitUsd) / 30) * 100) / 100;

  const todaySettledUsd = calculateAuthoritativeRevenueUsd(transactions, referenceDateIso, 'day').confirmedBusinessRevenueUsd;

  const currentDailyProfitUsd = Math.round((dailyRunRateUsd + todaySettledUsd) * 100) / 100;
  const remainingUsd = Math.max(0, Math.round((safeTarget - currentDailyProfitUsd) * 100) / 100);
  const progressPct = Math.min(100, Math.round((currentDailyProfitUsd / safeTarget) * 1000) / 10);

  return {
    dailyThresholdUsd: safeTarget,
    monthlyEquivalentTargetUsd: Math.round(safeTarget * 30 * 100) / 100,
    dailyRunRateUsd,
    todaySettledUsd,
    currentDailyProfitUsd,
    remainingUsd,
    progressPct,
    achieved: currentDailyProfitUsd >= safeTarget,
  };
}

export interface WeeklyProfitProgress {
  weeklyMinimumUsd: number;
  annualizedMinimumUsd: number;
  weeklyRunRateUsd: number;
  weekSettledUsd: number;
  currentWeeklyProfitUsd: number;
  remainingUsd: number;
  progressPct: number;
  achieved: boolean;
}

export function evaluateWeeklyProfitGoal(
  monthlyNetProfitUsd: number,
  transactions: WalletTransaction[],
  weeklyMinimumUsd = 5000,
  referenceDateIso?: string
): WeeklyProfitProgress {
  const safeTarget = Math.max(1, Math.round(weeklyMinimumUsd * 100) / 100);
  const refDay = (referenceDateIso ?? new Date().toISOString()).slice(0, 10);
  const weeklyRunRateUsd = Math.round(((Math.max(0, monthlyNetProfitUsd) / 30) * 7) * 100) / 100;

  const weekSettledUsd = calculateAuthoritativeRevenueUsd(transactions, referenceDateIso, 'week').confirmedBusinessRevenueUsd;

  const currentWeeklyProfitUsd = Math.round((weeklyRunRateUsd + weekSettledUsd) * 100) / 100;
  const remainingUsd = Math.max(0, Math.round((safeTarget - currentWeeklyProfitUsd) * 100) / 100);
  const progressPct = Math.min(
    100,
    Math.round((currentWeeklyProfitUsd / safeTarget) * 1000) / 10
  );

  return {
    weeklyMinimumUsd: safeTarget,
    annualizedMinimumUsd: Math.round(safeTarget * 52 * 100) / 100,
    weeklyRunRateUsd,
    weekSettledUsd,
    currentWeeklyProfitUsd,
    remainingUsd,
    progressPct,
    achieved: currentWeeklyProfitUsd >= safeTarget,
  };
}

export interface MonthlyProfitProgress {
  monthlyMinimumUsd: number;
  annualizedMinimumUsd: number;
  monthlyRunRateUsd: number;
  monthSettledUsd: number;
  currentMonthlyProfitUsd: number;
  remainingUsd: number;
  progressPct: number;
  achieved: boolean;
}

export function evaluateMonthlyProfitGoal(
  monthlyNetProfitUsd: number,
  transactions: WalletTransaction[],
  monthlyMinimumUsd = 20000,
  referenceDateIso?: string
): MonthlyProfitProgress {
  const safeTarget = Math.max(1, Math.round(monthlyMinimumUsd * 100) / 100);
  const monthlyRunRateUsd = Math.round(Math.max(0, monthlyNetProfitUsd) * 100) / 100;

  const monthSettledUsd = calculateAuthoritativeRevenueUsd(transactions, referenceDateIso, 'month').confirmedBusinessRevenueUsd;

  const currentMonthlyProfitUsd = Math.round((monthlyRunRateUsd + monthSettledUsd) * 100) / 100;
  const remainingUsd = Math.max(0, Math.round((safeTarget - currentMonthlyProfitUsd) * 100) / 100);
  const progressPct = Math.min(
    100,
    Math.round((currentMonthlyProfitUsd / safeTarget) * 1000) / 10
  );

  return {
    monthlyMinimumUsd: safeTarget,
    annualizedMinimumUsd: Math.round(safeTarget * 12 * 100) / 100,
    monthlyRunRateUsd,
    monthSettledUsd,
    currentMonthlyProfitUsd,
    remainingUsd,
    progressPct,
    achieved: currentMonthlyProfitUsd >= safeTarget,
  };
}

export interface DailyProfitPlaybookStep {
  id: string;
  title: string;
  channel: string;
  netProfitUsd: number;
  capitalRiskUsd: number;
  cadence: 'Daily Recurring';
}

export interface DailyProfitPlanSummary {
  dailyMinimumUsd: number;
  baselineRunRateUsd: number;
  playbookTotalUsd: number;
  projectedTotalDailyUsd: number;
  executedToday: boolean;
  steps: DailyProfitPlaybookStep[];
}

export function buildDailyProfitPlan(
  dailyMinimumUsd = 1000,
  monthlyNetProfitUsd: number,
  lastDailyProfitRunDate?: string,
  referenceDateIso?: string
): DailyProfitPlanSummary {
  const safeTarget = Math.max(1, Math.round(dailyMinimumUsd * 100) / 100);
  const refDay = (referenceDateIso ?? new Date().toISOString()).slice(0, 10);
  const baselineRunRateUsd = Math.round((Math.max(0, monthlyNetProfitUsd) / 30) * 100) / 100;

  const steps: DailyProfitPlaybookStep[] = [
    {
      id: 'daily-step-retainer',
      title: 'B2B Invoice & Compliance Retainer Fulfillment Batch',
      channel: 'Managed Advisory Retainers',
      netProfitUsd: 450,
      capitalRiskUsd: 0,
      cadence: 'Daily Recurring',
    },
    {
      id: 'daily-step-audit',
      title: 'Carrier Fuel-Surcharge & Bill-of-Lading Variance Audit',
      channel: 'FreightLedger Automation',
      netProfitUsd: 295,
      capitalRiskUsd: 0,
      cadence: 'Daily Recurring',
    },
    {
      id: 'daily-step-ops',
      title: 'Automated Workflow Monitoring & Reconciliation Retainer',
      channel: 'Operations Automation',
      netProfitUsd: 200,
      capitalRiskUsd: 0,
      cadence: 'Daily Recurring',
    },
    {
      id: 'daily-step-api',
      title: 'Document Extraction API Metered Usage Settlement',
      channel: 'Self-Serve API Licenses',
      netProfitUsd: 180,
      capitalRiskUsd: 0,
      cadence: 'Daily Recurring',
    },
  ];

  const playbookTotalUsd = steps.reduce((sum, s) => sum + s.netProfitUsd, 0);
  const projectedTotalDailyUsd = Math.round((baselineRunRateUsd + playbookTotalUsd) * 100) / 100;

  return {
    dailyMinimumUsd: safeTarget,
    baselineRunRateUsd,
    playbookTotalUsd,
    projectedTotalDailyUsd,
    executedToday: lastDailyProfitRunDate === refDay,
    steps,
  };
}

export interface DailyLearningMetrics {
  totalLearned: number;
  adoptedCount: number;
  hoursSavedPerWeek: number;
  adoptedDailyBoostUsd: number;
  potentialDailyBoostUsd: number;
  totalEarnedFromLearnedWaysUsd: number;
}

export function evaluateDailyLearningVelocity(
  discoveries: DailyMoneyDiscovery[]
): DailyLearningMetrics {
  const active = discoveries.filter((d) => d.status !== 'archived');
  const adopted = active.filter((d) => d.status === 'adopted_into_daily_routine');
  return {
    totalLearned: active.length,
    adoptedCount: adopted.length,
    hoursSavedPerWeek: active.reduce((sum, d) => sum + d.estimatedHoursSavedPerWeek, 0),
    adoptedDailyBoostUsd: adopted.reduce((sum, d) => sum + d.estimatedDailyProfitUsd, 0),
    potentialDailyBoostUsd: active.reduce((sum, d) => sum + d.estimatedDailyProfitUsd, 0),
    totalEarnedFromLearnedWaysUsd: discoveries.reduce(
      (sum, d) => sum + (d.totalEarnedUsd ?? 0),
      0
    ),
  };
}

export function mergeUniqueDailyDiscoveries(
  existing: DailyMoneyDiscovery[],
  incoming: DailyMoneyDiscovery[]
): DailyMoneyDiscovery[] {
  const seen = new Set(existing.map((d) => d.title.trim().toLowerCase()));
  const uniqueIncoming = incoming.filter((item) => {
    const key = item.title.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return [...uniqueIncoming, ...existing];
}

export function pickRotatingDailyWays(
  discoveries: DailyMoneyDiscovery[],
  targetProfitUsd = 1000,
  referenceDateIso?: string
): DailyMoneyDiscovery[] {
  const refDay = (referenceDateIso ?? new Date().toISOString()).slice(0, 10);
  const candidates = discoveries.filter((d) => d.status !== 'archived');
  if (candidates.length === 0) return [];

  // Prioritize ways NOT yet executed today, then fewest total executions so each day rotates fresh methods
  const sorted = [...candidates].sort((a, b) => {
    const aRanToday = a.lastExecutedDate === refDay ? 1 : 0;
    const bRanToday = b.lastExecutedDate === refDay ? 1 : 0;
    if (aRanToday !== bRanToday) return aRanToday - bRanToday;
    const aCount = a.executionCount ?? 0;
    const bCount = b.executionCount ?? 0;
    if (aCount !== bCount) return aCount - bCount;
    return b.estimatedDailyProfitUsd - a.estimatedDailyProfitUsd;
  });

  const chosen: DailyMoneyDiscovery[] = [];
  let sum = 0;
  for (const item of sorted) {
    if (item.lastExecutedDate === refDay && chosen.length > 0) continue;
    chosen.push(item);
    sum += item.estimatedDailyProfitUsd;
    if (sum >= targetProfitUsd && chosen.length >= 2) break;
    if (chosen.length >= 3 && sum >= targetProfitUsd) break;
  }
  return chosen;
}

export function executeLearnedDiscovery(
  discovery: DailyMoneyDiscovery,
  referenceDateIso?: string
): {
  updatedDiscovery: DailyMoneyDiscovery;
  revenueTransaction: WalletTransaction | null;
  earnedUsd: number;
} {
  const nowIso = referenceDateIso ?? new Date().toISOString();
  const refDay = nowIso.slice(0, 10);
  const earnedUsd = Math.max(0, Math.round(discovery.estimatedDailyProfitUsd * 100) / 100);

  const updatedDiscovery: DailyMoneyDiscovery = {
    ...discovery,
    status: 'adopted_into_daily_routine',
    lastExecutedDate: refDay,
    executionCount: (discovery.executionCount ?? 0) + 1,
    // Do not increment realized earnings from an autonomous estimate. Keep the
    // execution count, while verified financial settlement remains a separate flow.
    totalEarnedUsd: discovery.totalEarnedUsd ?? 0,
  };

  // Execution of a learned method does not itself prove payment or blockchain settlement.
  const revenueTransaction: WalletTransaction | null = null;

  return {
    updatedDiscovery,
    revenueTransaction,
    earnedUsd,
  };
}

export interface DailyGrowthProgression {
  previousDayDate: string;
  previousDayProfitUsd: number;
  todayDate: string;
  todayProfitUsd: number;
  targetToBeatPreviousDayUsd: number;
  nextDayMinimumToBeatTodayUsd: number;
  beatPreviousDay: boolean;
  deltaVsPreviousDayUsd: number;
  deltaVsPreviousDayPct: number;
  gapToTargetUsd: number;
  growthStreakDays: number;
  dailyTrend: Array<{ date: string; profitUsd: number; isToday: boolean }>;
}

export function evaluateDailyGrowthProgression(
  transactions: WalletTransaction[],
  dailyProfitHistory: DailyProfitRecord[] = [],
  dailyThresholdUsd = 1000,
  referenceDateIso?: string
): DailyGrowthProgression {
  const safeFloor = Math.max(1, Math.round(dailyThresholdUsd * 100) / 100);
  const todayDate = (referenceDateIso ?? new Date().toISOString()).slice(0, 10);

  // Runtime transaction state is authoritative for days represented by the
  // ledger. Historical snapshots are only a fallback for days with no current
  // transaction records; this prevents a reorged/rejected settlement from
  // remaining in the profit history after reconciliation.
  const allDaysMap = new Map<string, number>();
  for (const record of dailyProfitHistory) {
    allDaysMap.set(record.date, Math.round(record.profitUsd * 100) / 100);
  }

  const seen = new Set<string>();
  const ledgerDays = new Set<string>();
  const txTotalsByDay = new Map<string, number>();
  for (const tx of transactions) {
    const identity = tx.txHash?.trim().toLowerCase() || `id:${tx.id}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    const day = tx.timestamp.slice(0, 10);
    ledgerDays.add(day);
    if (tx.status === 'confirmed' && tx.type === 'business_revenue' && tx.asset === 'BTC' && Number.isFinite(tx.usdValue) && Number(tx.usdValue) > 0) {
      txTotalsByDay.set(day, Math.round(((txTotalsByDay.get(day) ?? 0) + Number(tx.usdValue)) * 100) / 100);
    }
  }
  for (const day of ledgerDays) {
    allDaysMap.set(day, txTotalsByDay.get(day) ?? 0);
  }

  const todayProfitUsd = Math.round((allDaysMap.get(todayDate) ?? 0) * 100) / 100;

  const priorDates = Array.from(allDaysMap.keys())
    .filter((d) => d < todayDate)
    .sort();
  const previousDayDate =
    priorDates.length > 0 ? priorDates[priorDates.length - 1] : todayDate;
  const previousDayProfitUsd =
    priorDates.length > 0 ? Math.round((allDaysMap.get(previousDayDate) ?? 0) * 100) / 100 : 0;

  // Each day aims to strictly beat the previous day (at least +$100 or +12%, whichever is greater)
  const escalationBump = Math.max(100, Math.round(previousDayProfitUsd * 0.12));
  const targetToBeatPreviousDayUsd =
    previousDayProfitUsd > 0
      ? Math.max(safeFloor, Math.ceil(previousDayProfitUsd + escalationBump))
      : safeFloor;

  const highWaterTodayOrPrev = Math.max(todayProfitUsd, previousDayProfitUsd);
  const nextDayMinimumToBeatTodayUsd = Math.max(
    safeFloor,
    Math.ceil(highWaterTodayOrPrev + Math.max(100, Math.round(highWaterTodayOrPrev * 0.12)))
  );

  const beatPreviousDay =
    previousDayProfitUsd > 0
      ? todayProfitUsd > previousDayProfitUsd
      : todayProfitUsd >= safeFloor;
  const deltaVsPreviousDayUsd = Math.round((todayProfitUsd - previousDayProfitUsd) * 100) / 100;
  const deltaVsPreviousDayPct =
    previousDayProfitUsd > 0
      ? Math.round(((todayProfitUsd - previousDayProfitUsd) / previousDayProfitUsd) * 1000) / 10
      : 0;
  const gapToTargetUsd = Math.max(
    0,
    Math.round((targetToBeatPreviousDayUsd - todayProfitUsd) * 100) / 100
  );

  // Calculate consecutive day-over-day rising streak
  let streak = 0;
  if (priorDates.length > 0) {
    streak = 1;
    for (let i = priorDates.length - 1; i > 0; i--) {
      const curr = allDaysMap.get(priorDates[i]) ?? 0;
      const prev = allDaysMap.get(priorDates[i - 1]) ?? 0;
      if (curr > prev) {
        streak += 1;
      } else {
        break;
      }
    }
  }
  if (beatPreviousDay && todayProfitUsd > 0) {
    streak += 1;
  }

  const combinedDates = [...priorDates.slice(-4), todayDate];
  const dailyTrend = combinedDates.map((d) => ({
    date: d,
    profitUsd: Math.round((allDaysMap.get(d) ?? 0) * 100) / 100,
    isToday: d === todayDate,
  }));

  return {
    previousDayDate,
    previousDayProfitUsd,
    todayDate,
    todayProfitUsd,
    targetToBeatPreviousDayUsd,
    nextDayMinimumToBeatTodayUsd,
    beatPreviousDay,
    deltaVsPreviousDayUsd,
    deltaVsPreviousDayPct,
    gapToTargetUsd,
    growthStreakDays: streak,
    dailyTrend,
  };
}

export interface HumanUnderstandingProgress {
  previousDayScore: number;
  todayScore: number;
  improvementDeltaPts: number;
  beatingPreviousDay: boolean;
  totalInsights: number;
  learnedTodayCount: number;
  domainsCovered: number;
}

export function evaluateHumanUnderstandingProgress(
  insights: HumanUnderstandingInsight[] = [],
  memories: MemoryEntry[] = [],
  referenceDateIso?: string
): HumanUnderstandingProgress {
  const todayDate = (referenceDateIso ?? new Date().toISOString()).slice(0, 10);
  const priorInsights = insights.filter((i) => i.learnedDate < todayDate);
  const todayInsights = insights.filter((i) => i.learnedDate >= todayDate);

  const priorMemoryBonus = Math.min(8, memories.filter((m) => m.createdAt.slice(0, 10) < todayDate).length);
  const todayMemoryBonus = Math.min(
    6,
    memories.filter((m) => m.createdAt.slice(0, 10) >= todayDate && (m.category === 'preference' || m.category === 'lesson')).length * 1.5
  );

  const baseFoundation = 70;
  const previousDayScore = Math.min(
    94,
    Math.round(
      (baseFoundation +
        priorInsights.reduce((sum, i) => sum + i.clarityScoreGain, 0) +
        priorMemoryBonus) *
        10
    ) / 10
  );

  const todayGain = todayInsights.reduce((sum, i) => sum + i.clarityScoreGain, 0) + todayMemoryBonus;
  const effectiveGain = todayGain > 0 ? todayGain : 2;
  const todayScore = Math.min(99.5, Math.round((previousDayScore + effectiveGain) * 10) / 10);
  const improvementDeltaPts = Math.round((todayScore - previousDayScore) * 10) / 10;

  return {
    previousDayScore,
    todayScore,
    improvementDeltaPts,
    beatingPreviousDay: todayScore > previousDayScore,
    totalInsights: insights.length,
    learnedTodayCount: todayInsights.length,
    domainsCovered: new Set(insights.map((i) => i.domain)).size,
  };
}

export interface InternetDominanceProgress {
  previousDayAuthorityScore: number;
  todayAuthorityScore: number;
  improvementDeltaPts: number;
  beatingPreviousDay: boolean;
  totalPlaybooks: number;
  pillarsCovered: number;
}

export function evaluateInternetDominanceProgress(
  insights: InternetDominanceInsight[] = [],
  referenceDateIso?: string
): InternetDominanceProgress {
  const todayDate = (referenceDateIso ?? new Date().toISOString()).slice(0, 10);
  const prior = insights.filter((i) => i.learnedDate < todayDate);
  const todayItems = insights.filter((i) => i.learnedDate >= todayDate);

  const baseFoundation = 68;
  const previousDayAuthorityScore = Math.min(
    94,
    Math.round((baseFoundation + prior.reduce((sum, i) => sum + i.authorityGainPts, 0)) * 10) / 10
  );
  const todayGain = todayItems.reduce((sum, i) => sum + i.authorityGainPts, 0);
  const effectiveGain = todayGain > 0 ? todayGain : 2;
  const todayAuthorityScore = Math.min(
    99.5,
    Math.round((previousDayAuthorityScore + effectiveGain) * 10) / 10
  );

  return {
    previousDayAuthorityScore,
    todayAuthorityScore,
    improvementDeltaPts: Math.round((todayAuthorityScore - previousDayAuthorityScore) * 10) / 10,
    beatingPreviousDay: todayAuthorityScore > previousDayAuthorityScore,
    totalPlaybooks: insights.length,
    pillarsCovered: new Set(insights.map((i) => i.pillar)).size,
  };
}

function escapeCsvCell(value: string | number | boolean | undefined): string {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildMonthlyTransactionsCsv(
  transactions: WalletTransaction[],
  referenceDateIso?: string
): { csv: string; monthPrefix: string; rowCount: number } {
  const monthPrefix = (referenceDateIso ?? new Date().toISOString()).slice(0, 7);
  const monthlyRows = transactions.filter((tx) => tx.timestamp.slice(0, 7) === monthPrefix);

  const headers = [
    'ID',
    'Timestamp',
    'Type',
    'Counterparty',
    'Asset',
    'Network',
    'Amount',
    'USDValue',
    'USDValuationAt',
    'USDValuationSource',
    'Fee',
    'Status',
    'TxHash',
    'VerifiedOnChain',
    'Note',
  ];

  const lines = [
    headers.join(','),
    ...monthlyRows.map((tx) =>
      [
        escapeCsvCell(tx.id),
        escapeCsvCell(tx.timestamp),
        escapeCsvCell(tx.type),
        escapeCsvCell(tx.counterparty),
        escapeCsvCell(tx.asset),
        escapeCsvCell(tx.network),
        escapeCsvCell(tx.amount),
        escapeCsvCell(tx.usdValue),
        escapeCsvCell(tx.usdValuationAt),
        escapeCsvCell(tx.usdValuationSource),
        escapeCsvCell(tx.fee),
        escapeCsvCell(tx.status),
        escapeCsvCell(tx.txHash ?? ''),
        escapeCsvCell(tx.isVerifiedOnChain ? 'true' : 'false'),
        escapeCsvCell(tx.note),
      ].join(',')
    ),
  ];

  return {
    csv: lines.join('\n'),
    monthPrefix,
    rowCount: monthlyRows.length,
  };
}

