import test from 'node:test';
import assert from 'node:assert/strict';
import type { WalletTransaction } from './types.ts';
import {
  auditSelfProgrammedCode,
  buildDailyProfitPlan,
  buildIncomeProjection,
  buildMonthlyTransactionsCsv,
  buildVentureRoiSeries,
  calculateAuthoritativeRevenueUsd,
  calculateUnifiedPortfolio,
  canDeploySelfUpgrade,
  computeGoalProgress,
  createAutonomousTask,
  evaluateDailyGrowthProgression,
  evaluateDailyLearningVelocity,
  evaluateDailyProfitGoal,
  evaluateHumanUnderstandingProgress,
  evaluateInternetDominanceProgress,
  evaluateMonthlyProfitGoal,
  evaluateWeeklyProfitGoal,
  executeLearnedDiscovery,
  executeRevenueTask,
  filterMemories,
  mergeUniqueDailyDiscoveries,
  pickRotatingDailyWays,
  recoverInterruptedTasks,
  toggleExecutionStep,
  validateOpportunityAssessment,
  validateOutgoingTransfer,
  calculateSpendableBalance,
  validateOutgoingTransferAgainstReservations,
} from './jerryEngine.ts';
import { INITIAL_JERRY_STATE } from './seedData.ts';

test('computeGoalProgress accurately counts 8-level action steps and toggles cleanly', () => {
  const goal = INITIAL_JERRY_STATE.goals[0];
  const initialProgress = computeGoalProgress(goal);
  assert.ok(initialProgress.totalSteps >= 2);

  const firstStepId = goal.phases[0].milestones[0].tasks[0].subtasks[0].actionSteps[0].id;
  const wasCompleted = goal.phases[0].milestones[0].tasks[0].subtasks[0].actionSteps[0].execution.completed;
  const toggled = toggleExecutionStep(goal, firstStepId);
  const nextProgress = computeGoalProgress(toggled);

  assert.equal(
    nextProgress.completedSteps,
    wasCompleted ? initialProgress.completedSteps - 1 : initialProgress.completedSteps + 1
  );
});

test('createAutonomousTask enforces explicit approval gate above threshold and blocks active duplicates', () => {
  const gatedResult = createAutonomousTask([], {
    goalId: 'goal-1',
    title: 'Deploy Paid Acquisition Campaign',
    description: 'Launch initial ad spend',
    category: 'financial',
    financialImpactUsd: 1200,
    autonomyThresholdUsd: 250,
    backgroundEligible: false,
  });

  assert.equal(gatedResult.duplicateBlocked, false);
  assert.ok(gatedResult.task);
  assert.equal(gatedResult.task.requiresApproval, true);
  assert.equal(gatedResult.task.status, 'awaiting_approval');

  const duplicateResult = createAutonomousTask([gatedResult.task], {
    goalId: 'goal-1',
    title: 'Deploy Paid Acquisition Campaign',
    description: 'Duplicate retry',
    category: 'financial',
    financialImpactUsd: 1200,
    autonomyThresholdUsd: 250,
    backgroundEligible: false,
  });

  assert.equal(duplicateResult.duplicateBlocked, true);
  assert.equal(duplicateResult.task, null);
});

test('recoverInterruptedTasks resumes interrupted tasks safely without duplicating idempotency keys', () => {
  const tasks = [
    {
      ...INITIAL_JERRY_STATE.tasks[0],
      id: 't-int-1',
      status: 'interrupted' as const,
      requiresApproval: false,
      idempotencyKey: 'goal-1:crawl-competitors',
      attempts: 1,
    },
    {
      ...INITIAL_JERRY_STATE.tasks[0],
      id: 't-int-2',
      status: 'interrupted' as const,
      requiresApproval: false,
      idempotencyKey: 'goal-1:crawl-competitors',
      attempts: 1,
    },
  ];

  const { updatedTasks, recoveredCount } = recoverInterruptedTasks(tasks);
  assert.equal(recoveredCount, 1);
  assert.equal(updatedTasks[0].status, 'running');
  assert.equal(updatedTasks[0].attempts, 2);
  assert.equal(updatedTasks[1].status, 'interrupted');
});

test('calculateUnifiedPortfolio sums built-in, external wallets, and monthly net revenue', () => {
  const summary = calculateUnifiedPortfolio(
    INITIAL_JERRY_STATE.walletAssets,
    INITIAL_JERRY_STATE.incomeStreams
  );
  assert.ok(summary.totalBalanceUsd > 0);
  assert.equal(
    Math.round((summary.builtInBalanceUsd + summary.externalBalanceUsd) * 100) / 100,
    summary.totalBalanceUsd
  );
  assert.ok(summary.monthlyGrossRevenueUsd > summary.monthlyNetProfitUsd);
});

test('spendable BTC excludes pending outgoing reservations but releases rejected and reorged transfers', () => {
  const base = (id: string, status: WalletTransaction['status'], amount: number, fee: number): WalletTransaction => ({
    id, timestamp: '2026-11-16T12:00:00Z', type: 'outgoing', asset: 'BTC', network: 'Bitcoin Mainnet', amount, fee, counterparty: 'bc1qvaliddestination12345', status, note: status,
  });
  const transactions = [
    base('pending', 'pending_approval', 0.01, 0.00018),
    base('rejected', 'rejected', 0.02, 0.0002),
    base('reorged', 'reorged', 0.03, 0.0002),
  ];
  assert.equal(calculateSpendableBalance(0.02, transactions, 'BTC', 'Bitcoin Mainnet'), 0.00982);
  assert.equal(
    validateOutgoingTransferAgainstReservations({
      asset: 'BTC', network: 'Bitcoin Mainnet', amount: 0.009, destination: 'bc1qvaliddestination12345', availableBalance: 0.02,
    }, transactions).valid,
    true,
  );
  assert.equal(
    validateOutgoingTransferAgainstReservations({
      asset: 'BTC', network: 'Bitcoin Mainnet', amount: 0.01, destination: 'bc1qvaliddestination12345', availableBalance: 0.02,
    }, transactions).valid,
    false,
  );
});

test('validateOutgoingTransfer rejects seed phrases, insufficient balances, and accepts valid transfers', () => {
  const seedRejected = validateOutgoingTransfer({
    asset: 'BTC',
    network: 'Bitcoin Mainnet',
    amount: 100,
    destination: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
    availableBalance: 5000,
    note: 'Include seed phrase backup',
  });
  assert.equal(seedRejected.valid, false);

  const insufficient = validateOutgoingTransfer({
    asset: 'BTC',
    network: 'Bitcoin Mainnet',
    amount: 10,
    destination: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
    availableBalance: 2,
  });
  assert.equal(insufficient.valid, false);

  const valid = validateOutgoingTransfer({
    asset: 'BTC',
    network: 'Bitcoin Mainnet',
    amount: 0.002,
    destination: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
    availableBalance: 0.0045,
    note: 'Vendor invoice #402',
  });
  assert.equal(valid.valid, true);
  assert.ok(valid.estimatedFee > 0);
});

test('filterMemories and validateOpportunityAssessment enforce search and responsible criteria', () => {
  const filtered = filterMemories(INITIAL_JERRY_STATE.memories, 'approval', 'all');
  assert.ok(filtered.length >= 1);

  const validCheck = validateOpportunityAssessment(INITIAL_JERRY_STATE.opportunities[0]);
  assert.equal(validCheck.compliant, true);

  const badCheck = validateOpportunityAssessment({
    ...INITIAL_JERRY_STATE.opportunities[0],
    estimatedMonthlyReturn: 'Guaranteed $10,000/mo risk-free',
  });
  assert.equal(badCheck.compliant, false);
});

test('auditSelfProgrammedCode and canDeploySelfUpgrade enforce security policy and test-before-deploy gates', () => {
  const blocked = auditSelfProgrammedCode('function x() { return overrideSecurityPolicy(); }');
  assert.equal(blocked.passed, false);

  const safe = auditSelfProgrammedCode('export function scoreLead(v: number) { return v * 2; }');
  assert.equal(safe.passed, true);

  assert.equal(
    canDeploySelfUpgrade({
      securityAuditPassed: true,
      testStatus: 'pending',
      approvalStatus: 'awaiting_permission',
    }).allowed,
    false
  );

  assert.equal(
    canDeploySelfUpgrade({
      securityAuditPassed: true,
      testStatus: 'passed',
      approvalStatus: 'awaiting_permission',
    }).allowed,
    true
  );
});

test('executeRevenueTask completes authorized work without manufacturing a crypto settlement', () => {
  const task = INITIAL_JERRY_STATE.tasks[0];
  const { updatedTask, revenueTransaction } = executeRevenueTask(
    task,
    350,
    'Delivered competitor pricing audit report to pilot client.'
  );
  assert.equal(updatedTask.status, 'completed');
  assert.equal(updatedTask.realizedRevenueUsd, undefined);
  assert.equal(updatedTask.projectedRevenueUsd, 350);
  assert.equal(revenueTransaction, null);

  const gated = INITIAL_JERRY_STATE.tasks.find((t) => t.status === 'awaiting_approval')!;
  const blockedExec = executeRevenueTask(gated, 500, 'Should not run');
  assert.equal(blockedExec.revenueTransaction, null);
  assert.equal(blockedExec.updatedTask.status, 'awaiting_approval');
});

test('buildVentureRoiSeries computes projected vs actual ROI and excludes Planning ventures', () => {
  const series = buildVentureRoiSeries([
    ...INITIAL_JERRY_STATE.ventures,
    {
      ...INITIAL_JERRY_STATE.ventures[0],
      id: 'ven-planning',
      name: 'Planned Future Venture',
      stage: 'Planning',
    },
  ]);

  assert.equal(series.length, INITIAL_JERRY_STATE.ventures.length);
  assert.ok(series.every((point) => point.stage !== 'Planning'));

  const first = series[0];
  assert.equal(first.projectedRoiPct, 650);
  assert.equal(first.actualProfitUsd, 506);
  assert.equal(first.actualRoiPct, 562);
  assert.equal(first.variancePct, -88);
});

test('buildIncomeProjection forecasts next-month revenue from historical performance data', () => {
  const forecast = buildIncomeProjection(INITIAL_JERRY_STATE.salesReports);

  assert.equal(forecast.lastPeriod, '2026-11');
  assert.equal(forecast.nextPeriod, '2026-12');
  assert.equal(forecast.lastRevenueUsd, 5246);
  assert.equal(forecast.projectedRevenueUsd, 5975);
  assert.equal(forecast.avgMonthlyDeltaUsd, 713);
  assert.ok(forecast.conservativeRevenueUsd < forecast.projectedRevenueUsd);
  assert.ok(forecast.optimisticRevenueUsd > forecast.projectedRevenueUsd);
  assert.equal(forecast.points.length, 4);
  assert.equal(forecast.points[3].kind, 'Forecast');
  assert.equal(forecast.points[3].forecastRevenueUsd, 5975);
});

test('authoritative revenue reconciliation excludes invalid states and duplicate replay records', () => {
  const tx = (id: string, status: WalletTransaction['status'], usdValue: number | undefined, txHash = 'a'.repeat(64)): WalletTransaction => ({
    id,
    timestamp: '2026-11-16T12:00:00Z',
    type: 'business_revenue',
    asset: 'BTC',
    network: 'Bitcoin Mainnet',
    amount: 0.01,
    usdValue,
    fee: 0,
    counterparty: 'customer',
    status,
    note: status,
    txHash,
    isVerifiedOnChain: status === 'confirmed',
  });

  const summary = calculateAuthoritativeRevenueUsd([
    tx('confirmed', 'confirmed', 900),
    tx('duplicate-replay', 'confirmed', 900),
    tx('reorged', 'reorged', 1200, 'b'.repeat(64)),
    tx('pending', 'pending_approval', 800, 'c'.repeat(64)),
    tx('rejected', 'rejected', 700, 'd'.repeat(64)),
    tx('unvalued', 'confirmed', undefined, 'e'.repeat(64)),
  ], '2026-11-16T18:00:00Z', 'day');

  assert.equal(summary.confirmedBusinessRevenueUsd, 900);
  assert.equal(summary.transactionCount, 1);
  assert.equal(summary.excludedCount, 5);
});

test('evaluateDailyProfitGoal tracks daily portfolio progress toward $1,000/day threshold', () => {
  const today = '2026-11-12';
  const baseline = evaluateDailyProfitGoal(
    4731,
    INITIAL_JERRY_STATE.transactions,
    INITIAL_JERRY_STATE.owner.dailyProfitThresholdUsd,
    today
  );

  assert.equal(baseline.dailyThresholdUsd, 1000);
  assert.equal(baseline.dailyRunRateUsd, 157.7);
  assert.equal(baseline.todaySettledUsd, 0);
  assert.equal(baseline.achieved, false);
  assert.equal(baseline.remainingUsd, 842.3);

  const boosted = evaluateDailyProfitGoal(
    4731,
    [
      ...INITIAL_JERRY_STATE.transactions,
      {
        id: 'tx-rev-101',
        timestamp: `${today}T18:00:00Z`,
        type: 'business_revenue',
        asset: 'BTC',
        network: 'Bitcoin Mainnet',
        amount: 900,
        usdValue: 900,
        fee: 0.04,
        counterparty: 'Task Settlement: Pilot Deliverable',
        status: 'confirmed',
        note: 'Settled revenue task',
      },
    ],
    1000,
    today
  );

  assert.equal(boosted.todaySettledUsd, 900);
  assert.equal(boosted.currentDailyProfitUsd, 1057.7);
  assert.equal(boosted.achieved, true);
  assert.equal(boosted.progressPct, 100);
  assert.equal(boosted.remainingUsd, 0);
});

test('profit goals use authoritative usdValue for BTC settlements instead of BTC amount', () => {
  const today = '2026-11-12';
  const btcSettlement = {
    id: 'tx-real-btc-usd-boundary',
    timestamp: `${today}T18:00:00Z`,
    type: 'business_revenue' as const,
    asset: 'BTC' as const,
    network: 'Bitcoin Mainnet',
    amount: 0.02,
    usdValue: 900,
    usdValuationAt: `${today}T18:00:01Z`,
    usdValuationSource: 'server-live-btc-usd',
    fee: 0,
    counterparty: 'Bitcoin settlement',
    status: 'confirmed' as const,
    note: 'Authoritatively valued BTC settlement',
    txHash: 'a'.repeat(64),
    isVerifiedOnChain: true,
    settlementMode: 'on_chain' as const,
  };

  const daily = evaluateDailyProfitGoal(0, [btcSettlement], 1000, today);
  const weekly = evaluateWeeklyProfitGoal(0, [btcSettlement], 5000, today);
  const monthly = evaluateMonthlyProfitGoal(0, [btcSettlement], 20000, today);
  const growth = evaluateDailyGrowthProgression([btcSettlement], [], 1000, `${today}T23:00:00Z`);

  assert.equal(daily.todaySettledUsd, 900);
  assert.equal(weekly.weekSettledUsd, 900);
  assert.equal(monthly.monthSettledUsd, 900);
  assert.equal(growth.todayProfitUsd, 900);
});

test('evaluateWeeklyProfitGoal tracks 7-day portfolio profit against $5,000/week top-priority minimum', () => {
  const today = '2026-11-12';
  const baseline = evaluateWeeklyProfitGoal(
    4731,
    INITIAL_JERRY_STATE.transactions,
    INITIAL_JERRY_STATE.owner.weeklyProfitMinimumUsd,
    today
  );

  assert.equal(baseline.weeklyMinimumUsd, 5000);
  assert.equal(baseline.weeklyRunRateUsd, 1103.9);
  assert.equal(baseline.weekSettledUsd, 0);
  assert.equal(baseline.achieved, false);
  assert.equal(baseline.remainingUsd, 3896.1);

  const boosted = evaluateWeeklyProfitGoal(
    4731,
    [
      ...INITIAL_JERRY_STATE.transactions,
      {
        id: 'tx-rev-w1',
        timestamp: '2026-11-09T14:00:00Z',
        type: 'business_revenue',
        asset: 'BTC',
        network: 'Bitcoin Mainnet',
        amount: 2400,
        usdValue: 2400,
        fee: 0.04,
        counterparty: 'Task Settlement: Enterprise Retainer',
        status: 'confirmed',
        note: 'Within 7-day window',
      },
      {
        id: 'tx-rev-w2',
        timestamp: `${today}T18:00:00Z`,
        type: 'business_revenue',
        asset: 'BTC',
        network: 'Bitcoin Mainnet',
        amount: 1600,
        usdValue: 1600,
        fee: 0.04,
        counterparty: 'Task Settlement: API Rollout',
        status: 'confirmed',
        note: 'Same-day settlement',
      },
      {
        id: 'tx-rev-old',
        timestamp: '2026-11-01T10:00:00Z',
        type: 'business_revenue',
        asset: 'BTC',
        network: 'Bitcoin Mainnet',
        amount: 3000,
        usdValue: 3000,
        fee: 0.04,
        counterparty: 'Prior Week Settlement',
        status: 'confirmed',
        note: 'Outside 7-day window',
      },
    ],
    5000,
    today
  );

  assert.equal(boosted.weekSettledUsd, 4000);
  assert.equal(boosted.currentWeeklyProfitUsd, 5103.9);
  assert.equal(boosted.achieved, true);
  assert.equal(boosted.progressPct, 100);
  assert.equal(boosted.remainingUsd, 0);
});

test('evaluateMonthlyProfitGoal tracks monthly portfolio profit against $20,000/month minimum', () => {
  const today = '2026-11-12';
  const baseline = evaluateMonthlyProfitGoal(
    4731,
    INITIAL_JERRY_STATE.transactions,
    INITIAL_JERRY_STATE.owner.monthlyProfitMinimumUsd,
    today
  );

  assert.equal(baseline.monthlyMinimumUsd, 20000);
  assert.equal(baseline.monthlyRunRateUsd, 4731);
  assert.equal(baseline.monthSettledUsd, 0);
  assert.equal(baseline.achieved, false);
  assert.equal(baseline.remainingUsd, 15269);

  const boosted = evaluateMonthlyProfitGoal(
    4731,
    [
      ...INITIAL_JERRY_STATE.transactions,
      {
        id: 'tx-rev-m1',
        timestamp: '2026-11-05T10:00:00Z',
        type: 'business_revenue',
        asset: 'BTC',
        network: 'Bitcoin Mainnet',
        amount: 9500,
        usdValue: 9500,
        fee: 0.04,
        counterparty: 'Task Settlement: Enterprise Retainer Batch',
        status: 'confirmed',
        note: 'Same month',
      },
      {
        id: 'tx-rev-m2',
        timestamp: `${today}T18:00:00Z`,
        type: 'business_revenue',
        asset: 'BTC',
        network: 'Bitcoin Mainnet',
        amount: 6000,
        usdValue: 6000,
        fee: 0.04,
        counterparty: 'Task Settlement: Annual API Contract',
        status: 'confirmed',
        note: 'Same month',
      },
      {
        id: 'tx-rev-prev-mo',
        timestamp: '2026-10-28T10:00:00Z',
        type: 'business_revenue',
        asset: 'BTC',
        network: 'Bitcoin Mainnet',
        amount: 8000,
        usdValue: 8000,
        fee: 0.04,
        counterparty: 'Prior Month Settlement',
        status: 'confirmed',
        note: 'Previous month excluded',
      },
    ],
    20000,
    today
  );

  assert.equal(boosted.monthSettledUsd, 15500);
  assert.equal(boosted.currentMonthlyProfitUsd, 20231);
  assert.equal(boosted.achieved, true);
  assert.equal(boosted.progressPct, 100);
  assert.equal(boosted.remainingUsd, 0);
});

test('calculateUnifiedPortfolio treats saved profit reserve as a separate capital bucket', () => {
  const withoutReserve = calculateUnifiedPortfolio(
    INITIAL_JERRY_STATE.walletAssets,
    INITIAL_JERRY_STATE.incomeStreams,
    0
  );
  const withReserve = calculateUnifiedPortfolio(
    INITIAL_JERRY_STATE.walletAssets,
    INITIAL_JERRY_STATE.incomeStreams,
    INITIAL_JERRY_STATE.profitReserveUsd
  );

  assert.equal(withReserve.savedProfitReserveUsd, 1450);
  // Reserve is not embedded in walletAssets, so it must not reduce the
  // authoritative wallet/invested-principal figure.
  assert.equal(withReserve.investedPrincipalUsd, withoutReserve.investedPrincipalUsd);
  assert.equal(withReserve.totalBalanceUsd, withoutReserve.totalBalanceUsd + 1450);
  assert.equal(
    Math.round((withReserve.savedProfitReserveUsd + withReserve.investedPrincipalUsd) * 100) / 100,
    withReserve.totalBalanceUsd
  );
});

test('calculateUnifiedPortfolio never turns reserve-only capital into negative or invented principal', () => {
  const summary = calculateUnifiedPortfolio(
    [],
    [],
    5000
  );

  assert.equal(summary.investedPrincipalUsd, 0);
  assert.equal(summary.savedProfitReserveUsd, 5000);
  assert.equal(summary.totalBalanceUsd, 5000);
});

test('buildDailyProfitPlan produces >= $1,000/day zero-capital-risk plan and tracks daily run completion', () => {
  const plan = buildDailyProfitPlan(1000, 4731, undefined, '2026-11-12');
  assert.equal(plan.executedToday, false);
  assert.equal(plan.playbookTotalUsd, 1125);
  assert.ok(plan.projectedTotalDailyUsd >= 1000);
  assert.ok(plan.steps.every((s) => s.capitalRiskUsd === 0));

  const ran = buildDailyProfitPlan(1000, 4731, '2026-11-12', '2026-11-12');
  assert.equal(ran.executedToday, true);
});

test('evaluateDailyLearningVelocity summarizes learned shortcuts, hours saved, and daily profit boost', () => {
  const metrics = evaluateDailyLearningVelocity(INITIAL_JERRY_STATE.dailyDiscoveries);
  assert.equal(metrics.totalLearned, 3);
  assert.equal(metrics.adoptedCount, 1);
  assert.equal(metrics.hoursSavedPerWeek, 15);
  assert.equal(metrics.adoptedDailyBoostUsd, 425);
  assert.equal(metrics.potentialDailyBoostUsd, 1125);
});

test('mergeUniqueDailyDiscoveries prepends novel ways while deduplicating matching titles', () => {
  const duplicateTitle = INITIAL_JERRY_STATE.dailyDiscoveries[0].title;
  const merged = mergeUniqueDailyDiscoveries(INITIAL_JERRY_STATE.dailyDiscoveries, [
    {
      ...INITIAL_JERRY_STATE.dailyDiscoveries[0],
      id: 'dup-id',
      title: duplicateTitle.toLowerCase(),
    },
    {
      id: 'new-way-1',
      discoveredDate: '2026-11-13',
      title: 'Automated B2B Renewal Follow-Up Sequence',
      methodCategory: 'Retainer Upsell',
      whyEasierAndFaster: 'Automates 90% of renewal reminders with 1-click Bitcoin/card renewal links.',
      executionShortcut: 'Trigger 14-day pre-expiry renewal summary + instant invoice.',
      estimatedHoursSavedPerWeek: 3,
      estimatedDailyProfitUsd: 275,
      startupCapitalUsd: 0,
      status: 'discovered',
    },
  ]);

  assert.equal(merged.length, 4);
  assert.equal(merged[0].id, 'new-way-1');
});

test('executeLearnedDiscovery records execution metrics without manufacturing settlement', () => {
  const target = INITIAL_JERRY_STATE.dailyDiscoveries[1];
  const result = executeLearnedDiscovery(target, '2026-11-12T18:30:00Z');

  assert.equal(result.earnedUsd, target.estimatedDailyProfitUsd);
  assert.equal(result.updatedDiscovery.status, 'adopted_into_daily_routine');
  assert.equal(result.updatedDiscovery.lastExecutedDate, '2026-11-12');
  assert.equal(result.updatedDiscovery.executionCount, 1);
  assert.equal(result.updatedDiscovery.totalEarnedUsd, target.totalEarnedUsd ?? 0);
  assert.equal(result.revenueTransaction, null);
});

test('pickRotatingDailyWays rotates unexecuted learned methods first to diversify daily income', () => {
  const seeded = INITIAL_JERRY_STATE.dailyDiscoveries.map((d, idx) =>
    idx === 0 ? { ...d, lastExecutedDate: '2026-11-12', executionCount: 2 } : d
  );
  const picked = pickRotatingDailyWays(seeded, 600, '2026-11-12');
  assert.ok(picked.length >= 2);
  assert.ok(picked.every((d) => d.id !== seeded[0].id));
});

test('daily growth uses reconciled ledger state instead of stale snapshots after reorg', () => {
  const today = '2026-11-16';
  const reorgedSettlement: WalletTransaction = {
    id: 'tx-reorged-history',
    timestamp: `${today}T12:00:00Z`,
    type: 'business_revenue',
    asset: 'BTC',
    network: 'Bitcoin Mainnet',
    amount: 0.01,
    usdValue: 1200,
    fee: 0,
    counterparty: 'reorged customer settlement',
    status: 'reorged',
    note: 'reorged',
    txHash: 'f'.repeat(64),
  };

  const result = evaluateDailyGrowthProgression(
    [reorgedSettlement],
    [{ date: today, profitUsd: 1200, methodsUsed: 1, summary: 'stale pre-reorg snapshot' }],
    1000,
    today
  );

  assert.equal(result.todayProfitUsd, 0);
  assert.equal(result.previousDayProfitUsd, 0);
});

test('evaluateDailyGrowthProgression tracks beating previous day profit and rising streak', () => {
  const today = '2026-11-12';
  const before = evaluateDailyGrowthProgression(
    INITIAL_JERRY_STATE.transactions,
    INITIAL_JERRY_STATE.dailyProfitHistory,
    1000,
    today
  );

  assert.equal(before.previousDayProfitUsd, 1085);
  assert.equal(before.todayProfitUsd, 0);
  assert.equal(before.beatPreviousDay, false);
  assert.ok(before.targetToBeatPreviousDayUsd > 1085);

  const after = evaluateDailyGrowthProgression(
    [
      ...INITIAL_JERRY_STATE.transactions,
      {
        id: 'tx-rev-way-boost',
        timestamp: `${today}T18:30:00Z`,
        type: 'business_revenue',
        asset: 'BTC',
        network: 'Bitcoin Mainnet',
        amount: 1280,
        usdValue: 1280,
        fee: 0.04,
        counterparty: 'New Way Execution · Upgraded Kit',
        status: 'confirmed',
        note: 'Beating previous day profit',
      },
    ],
    INITIAL_JERRY_STATE.dailyProfitHistory,
    1000,
    today
  );

  assert.equal(after.todayProfitUsd, 1280);
  assert.equal(after.beatPreviousDay, true);
  assert.equal(after.deltaVsPreviousDayUsd, 195);
  assert.ok(after.growthStreakDays >= 3);
  assert.ok(after.nextDayMinimumToBeatTodayUsd > 1280);
});

test('evaluateHumanUnderstandingProgress confirms daily understanding exceeds previous day and grows with new insights', () => {
  const today = '2026-11-12';
  const baseline = evaluateHumanUnderstandingProgress(
    INITIAL_JERRY_STATE.humanInsights,
    INITIAL_JERRY_STATE.memories,
    today
  );

  assert.equal(baseline.beatingPreviousDay, true);
  assert.ok(baseline.todayScore > baseline.previousDayScore);

  const improved = evaluateHumanUnderstandingProgress(
    [
      {
        id: 'hi-new',
        learnedDate: today,
        domain: 'Decision Friction',
        title: 'Lead with single reversible action',
        observation: 'Reduces choice overload.',
        practicalApplication: 'Highlight top step first.',
        clarityScoreGain: 4,
      },
      ...(INITIAL_JERRY_STATE.humanInsights ?? []),
    ],
    INITIAL_JERRY_STATE.memories,
    today
  );

  assert.ok(improved.todayScore > baseline.todayScore);
  assert.ok(improved.improvementDeltaPts > baseline.improvementDeltaPts);
});

test('evaluateInternetDominanceProgress confirms daily authority improves over yesterday as playbooks accumulate', () => {
  const today = '2026-11-13';
  const baseline = evaluateInternetDominanceProgress(INITIAL_JERRY_STATE.internetMastery, today);

  assert.equal(baseline.beatingPreviousDay, true);
  assert.ok(baseline.todayAuthorityScore > baseline.previousDayAuthorityScore);

  const improved = evaluateInternetDominanceProgress(
    [
      {
        id: 'net-new',
        learnedDate: today,
        pillar: 'SEO & Organic Reach',
        title: 'Programmatic Industry Benchmarks Hub',
        tactic: 'Publish live JSON-LD comparison hubs with real latency metrics.',
        expectedImpact: '+28% organic discovery traffic',
        authorityGainPts: 5,
      },
      ...(INITIAL_JERRY_STATE.internetMastery ?? []),
    ],
    today
  );

  assert.ok(improved.todayAuthorityScore > baseline.todayAuthorityScore);
  assert.ok(improved.improvementDeltaPts > baseline.improvementDeltaPts);
});

test('buildMonthlyTransactionsCsv filters transactions to current month and escapes RFC 4180 CSV cells', () => {
  const csvResult = buildMonthlyTransactionsCsv(
    [
      {
        id: 'tx-nov-1',
        timestamp: '2026-11-12T10:15:00Z',
        type: 'business_revenue',
        asset: 'BTC',
        network: 'Bitcoin Mainnet',
        amount: 450,
        usdValue: 450,
        fee: 0.04,
        counterparty: 'Acme, Inc.',
        status: 'confirmed',
        txHash: 'abbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        isVerifiedOnChain: true,
        note: 'Quote "milestone" settled',
      },
      {
        id: 'tx-oct-old',
        timestamp: '2026-10-25T10:15:00Z',
        type: 'business_revenue',
        asset: 'BTC',
        network: 'Bitcoin Mainnet',
        amount: 999,
        usdValue: 999,
        fee: 0.04,
        counterparty: 'Prior Month Co',
        status: 'confirmed',
        note: 'Excluded from November report',
      },
    ],
    '2026-11-13T00:00:00Z'
  );

  assert.equal(csvResult.monthPrefix, '2026-11');
  assert.equal(csvResult.rowCount, 1);
  assert.ok(csvResult.csv.includes('"Acme, Inc."'));
  assert.ok(csvResult.csv.includes('"Quote ""milestone"" settled"'));
  assert.ok(!csvResult.csv.includes('Prior Month Co'));
});





test('confirmed BTC revenue without authoritative USD valuation is excluded from USD profit totals', () => {
  const progress = evaluateDailyProfitGoal(0, [
    {
      id: 'tx-unvalued-btc',
      timestamp: '2026-11-16T12:00:00Z',
      type: 'business_revenue',
      asset: 'BTC',
      network: 'Bitcoin Mainnet',
      amount: 1,
      fee: 0,
      counterparty: 'unvalued',
      status: 'confirmed',
      note: 'missing settlement valuation',
    },
  ], 1000, '2026-11-16T18:00:00Z');

  assert.equal(progress.todaySettledUsd, 0);
  assert.equal(progress.currentDailyProfitUsd, 0);
});

test('verified BTC settlement model preserves authoritative USD valuation fields', () => {
  const tx: WalletTransaction = {
    id: 'tx-test',
    timestamp: new Date().toISOString(),
    type: 'business_revenue',
    asset: 'BTC',
    network: 'Bitcoin Mainnet',
    amount: 0.01,
    usdValue: 884,
    usdValuationAt: new Date().toISOString(),
    usdValuationSource: 'Coinbase Live Spot API',
    fee: 0,
    counterparty: 'customer',
    status: 'confirmed',
    note: 'verified settlement',
    isVerifiedOnChain: true,
    settlementMode: 'on_chain',
  };

  assert.equal(tx.asset, 'BTC');
  assert.equal(tx.network, 'Bitcoin Mainnet');
  assert.equal(tx.usdValue, 884);
  assert.equal(tx.isVerifiedOnChain, true);
});
