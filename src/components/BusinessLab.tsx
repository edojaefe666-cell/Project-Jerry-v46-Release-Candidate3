import { useState, type FormEvent } from 'react';
import {
  Radar,
  Plus,
  Loader2,
  Download,
  ArrowUpRight,
  ShieldCheck,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/apiClient';
import {
  BarChart,
  Bar,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  buildIncomeProjection,
  buildVentureRoiSeries,
  validateOpportunityAssessment,
  type IncomeProjectionPoint,
  type VenturePerformancePoint,
} from '../lib/jerryEngine';
import type {
  BusinessOpportunity,
  BusinessVenture,
  IncomeStream,
  OpportunityAlert,
  SalesPerformanceEntry,
} from '../lib/types';

interface BusinessLabProps {
  interestTopics: string[];
  opportunityAlerts: OpportunityAlert[];
  ventures: BusinessVenture[];
  salesReports: SalesPerformanceEntry[];
  opportunities: BusinessOpportunity[];
  incomeStreams: IncomeStream[];
  availableCapitalUsd: number;
  monthlyProfitMinimumUsd?: number;
  weeklyProfitMinimumUsd?: number;
  onUpdateInterests: (topics: string[]) => void;
  onAddOpportunityAlerts: (alerts: OpportunityAlert[]) => void;
  onUpdateAlertStatus: (alertId: string, status: OpportunityAlert['status']) => void;
  onAddOpportunity: (opp: BusinessOpportunity) => void;
  onUpdateOpportunityStatus: (id: string, status: BusinessOpportunity['status']) => void;
  onAddIncomeStream: (stream: IncomeStream) => void;
  onAddVenture: (venture: BusinessVenture) => void;
  onPromoteToGoal: (title: string, strategy: string, capitalUsd: number) => Promise<void>;
}

export function BusinessLab({
  interestTopics,
  opportunityAlerts,
  ventures,
  salesReports,
  opportunities,
  incomeStreams,
  availableCapitalUsd,
  monthlyProfitMinimumUsd = 20000,
  weeklyProfitMinimumUsd = 5000,
  onUpdateInterests,
  onAddOpportunityAlerts,
  onUpdateAlertStatus,
  onAddOpportunity,
  onUpdateOpportunityStatus,
  onAddIncomeStream,
  onAddVenture,
  onPromoteToGoal,
}: BusinessLabProps) {
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'radar' | 'research' | 'sales'>('overview');
  const [newInterest, setNewInterest] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  const [ideaInput, setIdeaInput] = useState('');
  const [assessing, setAssessing] = useState(false);
  const [assessError, setAssessError] = useState<string | null>(null);

  const [ventureName, setVentureName] = useState('');
  const [ventureRev, setVentureRev] = useState('1200');
  const [ventureExp, setVentureExp] = useState('250');
  const [ventureProjectedRoi, setVentureProjectedRoi] = useState('420');
  const [ventureChannel, setVentureChannel] = useState('Direct B2B Outbound');
  const [chartMetric, setChartMetric] = useState<'roi' | 'profit'>('roi');

  const totalRevenue = ventures.reduce((sum, v) => sum + v.monthlyRevenueUsd, 0);
  const totalExpenses = ventures.reduce((sum, v) => sum + v.monthlyExpensesUsd, 0);
  const netProfit = totalRevenue - totalExpenses;
  const marginPct = totalRevenue === 0 ? 0 : Math.round((netProfit / totalRevenue) * 1000) / 10;
  const newAlertsCount = opportunityAlerts.filter((a) => a.status === 'new').length;
  const ventureRoiSeries = buildVentureRoiSeries(ventures);
  const avgProjectedRoi =
    ventureRoiSeries.length > 0
      ? Math.round(
          ventureRoiSeries.reduce((sum, p) => sum + p.projectedRoiPct, 0) / ventureRoiSeries.length
        )
      : 0;
  const avgActualRoi =
    ventureRoiSeries.length > 0
      ? Math.round(
          ventureRoiSeries.reduce((sum, p) => sum + p.actualRoiPct, 0) / ventureRoiSeries.length
        )
      : 0;
  const incomeProjection = buildIncomeProjection(salesReports, totalRevenue);

  const handleAddInterest = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = newInterest.trim();
    if (!trimmed) return;
    if (!interestTopics.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
      onUpdateInterests([...interestTopics, trimmed]);
    }
    setNewInterest('');
  };

  const handleRemoveInterest = (topic: string) => {
    onUpdateInterests(interestTopics.filter((t) => t !== topic));
  };

  const handleScanOpportunities = async () => {
    if (interestTopics.length === 0 || scanning) return;
    setScanning(true);
    setScanMessage(null);
    try {
      const response = await apiFetch('/api/jerry/scan-opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interests: interestTopics,
          availableCapitalUsd,
        }),
      });
      const data = (await response.json()) as {
        alerts?: OpportunityAlert[];
        modelUsed?: string;
        error?: string;
        message?: string;
        code?: string;
      };
      if (!response.ok || !data.alerts) {
        throw new Error(data.error || data.message || data.code || `Opportunity Radar scan failed (HTTP ${response.status}).`);
      }
      onAddOpportunityAlerts(data.alerts);
      setScanMessage(
        `Scanned ${interestTopics.length} areas of interest and surfaced ${data.alerts.length} new opportunity alert${data.alerts.length === 1 ? '' : 's'} (${data.modelUsed ?? 'Jerry Radar'}).`
      );
      setActiveSubTab('radar');
    } catch (err) {
      setScanMessage(err instanceof Error ? err.message : 'Unable to complete opportunity scan.');
    } finally {
      setScanning(false);
    }
  };

  const handleAssessIdea = async (e: FormEvent) => {
    e.preventDefault();
    if (!ideaInput.trim() || assessing) return;
    setAssessing(true);
    setAssessError(null);
    try {
      const response = await apiFetch('/api/jerry/assess-opportunity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea: ideaInput.trim() }),
      });
      const data = (await response.json()) as { opportunity?: BusinessOpportunity; error?: string };
      if (!response.ok || !data.opportunity) {
        throw new Error(data.error || 'Assessment failed.');
      }
      onAddOpportunity(data.opportunity);
      setIdeaInput('');
    } catch (err) {
      setAssessError(err instanceof Error ? err.message : 'Unable to assess opportunity.');
    } finally {
      setAssessing(false);
    }
  };

  const handleCreateVenture = (e: FormEvent) => {
    e.preventDefault();
    if (!ventureName.trim()) return;
    const rev = Number(ventureRev) || 0;
    const exp = Number(ventureExp) || 0;
    const projRoi = Math.max(0, Number(ventureProjectedRoi) || 0);
    const projProfit = exp > 0 ? Math.round((projRoi / 100) * exp) : Math.max(0, rev - exp);
    onAddVenture({
      id: `ven-${Date.now()}`,
      name: ventureName.trim(),
      stage: 'Pilot',
      monthlyRevenueUsd: rev,
      monthlyExpensesUsd: exp,
      activeCustomers: 1,
      businessPlanSummary: `Lean pilot launch for ${ventureName.trim()} targeting positive unit margin from month one.`,
      marketResearchSummary: 'Initial customer discovery validated core operational bottleneck.',
      acquisitionChannel: ventureChannel.trim() || 'Direct Outreach',
      targetCacUsd: 120,
      estimatedLtvUsd: 2400,
      conversionRatePct: 12.0,
      projectedRoiPct: projRoi,
      projectedMonthlyProfitUsd: projProfit,
    });
    onAddIncomeStream({
      id: `stream-${Date.now()}`,
      name: ventureName.trim(),
      channel: ventureChannel.trim() || 'Direct Outreach',
      monthlyRevenueUsd: rev,
      monthlyExpenseUsd: exp,
      automationLevel: 'Semi-Automated',
      status: 'pilot',
    });
    setVentureName('');
  };

  const handleExportSalesCsv = () => {
    const header = 'Period,Venture,Deals Closed,Pipeline USD,Closed Revenue USD,Expenses USD,Net Profit USD\n';
    const rows = salesReports
      .map(
        (r) =>
          `${r.period},"${r.ventureName}",${r.dealsClosed},${r.pipelineValueUsd},${r.closedRevenueUsd},${r.expensesUsd},${r.closedRevenueUsd - r.expensesUsd}`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'jerry-business-sales-report.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Jerry Business Executive Header + Financial Metrics */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">
              Jerry Business
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Ventures, active business plans, financial metrics, customer acquisition, sales reports, and opportunity radar
            </p>
          </div>

          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto shrink-0">
            {[
              { id: 'overview', label: 'Ventures & Plans' },
              { id: 'radar', label: `Opportunity Radar (${newAlertsCount})` },
              { id: 'research', label: 'Market Research' },
              { id: 'sales', label: 'Acquisition & Sales' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSubTab(tab.id as typeof activeSubTab)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeSubTab === tab.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Consolidated Financial Performance Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 pt-5 border-t border-slate-200">
          <div>
            <p className="text-xs font-medium text-slate-500">Monthly Gross Revenue</p>
            <p className="text-2xl font-semibold text-slate-900 font-mono tabular-nums mt-1">
              ${totalRevenue.toLocaleString()}
            </p>
            <p className="text-xs text-slate-500 mt-1">{ventures.length} managed ventures</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Monthly Operating Expenses</p>
            <p className="text-2xl font-semibold text-slate-900 font-mono tabular-nums mt-1">
              ${totalExpenses.toLocaleString()}
            </p>
            <p className="text-xs text-slate-500 mt-1">API, hosting &amp; acquisition spend</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Monthly Net Profit</p>
            <p className="text-2xl font-semibold text-emerald-700 font-mono tabular-nums mt-1">
              ${netProfit.toLocaleString()}
            </p>
            <p className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
              {marginPct}% margin · Min ${monthlyProfitMinimumUsd.toLocaleString()}/mo (${weeklyProfitMinimumUsd.toLocaleString()}/wk)
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Active Paying Accounts</p>
            <p className="text-2xl font-semibold text-slate-900 font-mono tabular-nums mt-1">
              {ventures.reduce((sum, v) => sum + v.activeCustomers, 0)}
            </p>
            <p className="text-xs text-slate-500 mt-1">{incomeStreams.length} active revenue streams</p>
          </div>
        </div>
      </section>

      {/* Sub-Tab 1: Managed Ventures & Active Business Plans */}
      {activeSubTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Projected ROI vs Actual Performance Chart */}
          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Projected ROI vs Actual Performance
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Comparing forecasted return against actual monthly performance across{' '}
                  <span className="font-mono tabular-nums text-slate-700">
                    {ventureRoiSeries.length}
                  </span>{' '}
                  active ventures · Avg Projected{' '}
                  <span className="font-mono tabular-nums font-medium text-slate-900">
                    {avgProjectedRoi.toLocaleString()}%
                  </span>{' '}
                  vs Avg Actual{' '}
                  <span className="font-mono tabular-nums font-semibold text-emerald-700">
                    {avgActualRoi.toLocaleString()}%
                  </span>
                </p>
              </div>

              <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start md:self-auto shrink-0">
                <button
                  type="button"
                  onClick={() => setChartMetric('roi')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    chartMetric === 'roi'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  ROI (%)
                </button>
                <button
                  type="button"
                  onClick={() => setChartMetric('profit')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    chartMetric === 'profit'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Net Profit ($)
                </button>
              </div>
            </div>

            {ventureRoiSeries.length === 0 ? (
              <div className="py-12 text-center border border-dashed border-slate-200 rounded-lg text-xs text-slate-500">
                No active ventures available yet. Register a venture below to track projected ROI against actual results.
              </div>
            ) : (
              <div className="h-72 w-full" data-testid="venture-roi-chart">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart
                    data={ventureRoiSeries}
                    margin={{ top: 10, right: 16, left: 4, bottom: 4 }}
                    barGap={8}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis
                      dataKey="shortName"
                      interval={0}
                      tick={{ fill: '#475569', fontSize: 11 }}
                      axisLine={{ stroke: '#E2E8F0' }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: '#64748B', fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      width={60}
                      tickFormatter={(val: number) =>
                        chartMetric === 'roi' ? `${val}%` : `$${val.toLocaleString()}`
                      }
                    />
                    <Tooltip
                      cursor={{ fill: '#F8FAFC' }}
                      content={({ active, payload }) => {
                        if (!active || !payload || payload.length === 0) return null;
                        const point = payload[0].payload as VenturePerformancePoint;
                        const varianceSign = point.variancePct >= 0 ? '+' : '';
                        return (
                          <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-3 text-xs space-y-1.5 min-w-[220px]">
                            <div className="border-b border-slate-100 pb-1.5">
                              <p className="font-semibold text-slate-900">{point.ventureName}</p>
                              <p className="text-slate-500">{point.stage} Stage</p>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-slate-600">Projected ROI</span>
                              <span className="font-mono tabular-nums font-medium text-slate-900">
                                {point.projectedRoiPct.toLocaleString()}% ($
                                {point.projectedProfitUsd.toLocaleString()})
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-slate-600">Actual Performance</span>
                              <span className="font-mono tabular-nums font-semibold text-blue-700">
                                {point.actualRoiPct.toLocaleString()}% ($
                                {point.actualProfitUsd.toLocaleString()})
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-100">
                              <span className="text-slate-500">ROI Variance</span>
                              <span
                                className={`font-mono tabular-nums font-semibold ${
                                  point.variancePct >= 0 ? 'text-emerald-700' : 'text-amber-700'
                                }`}
                              >
                                {varianceSign}
                                {point.variancePct.toLocaleString()}%
                              </span>
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
                      iconType="square"
                      itemSorter={null}
                    />
                    <Bar
                      dataKey={chartMetric === 'roi' ? 'projectedRoiPct' : 'projectedProfitUsd'}
                      name={chartMetric === 'roi' ? 'Projected ROI (%)' : 'Projected Net Profit ($)'}
                      fill="#94A3B8"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={44}
                      isAnimationActive={false}
                    />
                    <Bar
                      dataKey={chartMetric === 'roi' ? 'actualRoiPct' : 'actualProfitUsd'}
                      name={chartMetric === 'roi' ? 'Actual ROI (%)' : 'Actual Net Profit ($)'}
                      fill="#1D4ED8"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={44}
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          {/* Income Projection Section (Historical Trend -> Next-Month Forecast) */}
          <section
            aria-label="Income Projection"
            className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
          >
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Income Projection</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Next-month revenue forecast ({incomeProjection.nextPeriod}) modeled from{' '}
                  <span className="font-mono tabular-nums text-slate-700">
                    {Math.max(0, incomeProjection.points.length - 1)}
                  </span>{' '}
                  historical months · Estimate, not guaranteed
                </p>
              </div>
              <div className="text-left sm:text-right shrink-0">
                <p className="text-xs text-slate-500">Forecast ({incomeProjection.nextPeriod})</p>
                <p className="text-lg font-semibold text-emerald-700 font-mono tabular-nums">
                  ${incomeProjection.projectedRevenueUsd.toLocaleString()}
                  <span className="text-xs font-medium text-slate-500 ml-1.5">
                    ({incomeProjection.momGrowthPct >= 0 ? '+' : ''}
                    {incomeProjection.momGrowthPct}% MoM)
                  </span>
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 pt-3 border-t border-slate-200 text-xs">
              <div>
                <p className="text-slate-500">Last Month ({incomeProjection.lastPeriod})</p>
                <p className="font-mono tabular-nums font-semibold text-slate-900 mt-0.5">
                  ${incomeProjection.lastRevenueUsd.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Projected Net Profit</p>
                <p className="font-mono tabular-nums font-semibold text-emerald-700 mt-0.5">
                  ${incomeProjection.projectedNetProfitUsd.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Model Range</p>
                <p className="font-mono tabular-nums font-medium text-slate-800 mt-0.5">
                  ${incomeProjection.conservativeRevenueUsd.toLocaleString()}–$
                  {incomeProjection.optimisticRevenueUsd.toLocaleString()}
                </p>
              </div>
            </div>

            {incomeProjection.points.length === 0 ? (
              <div className="py-12 text-center border border-dashed border-slate-200 rounded-lg text-xs text-slate-500">
                Historical sales performance entries are required to compute a next-month forecast.
              </div>
            ) : (
              <div className="h-64 w-full" data-testid="income-projection-chart">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <ComposedChart
                    data={incomeProjection.points}
                    margin={{ top: 10, right: 16, left: 4, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: '#475569', fontSize: 12 }}
                      axisLine={{ stroke: '#E2E8F0' }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: '#64748B', fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      width={58}
                      tickFormatter={(val: number) => `$${val.toLocaleString()}`}
                    />
                    <Tooltip
                      cursor={{ fill: '#F8FAFC' }}
                      content={({ active, payload }) => {
                        if (!active || !payload || payload.length === 0) return null;
                        const point = payload[0].payload as IncomeProjectionPoint;
                        const revValue =
                          point.kind === 'Forecast'
                            ? point.forecastRevenueUsd ?? 0
                            : point.actualRevenueUsd ?? 0;
                        return (
                          <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-3 text-xs space-y-1.5 min-w-[220px]">
                            <div className="border-b border-slate-100 pb-1.5">
                              <p className="font-semibold text-slate-900">{point.label}</p>
                              <p className="text-slate-500">{point.kind} Performance</p>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-slate-600">
                                {point.kind === 'Forecast' ? 'Projected Revenue' : 'Closed Revenue'}
                              </span>
                              <span
                                className={`font-mono tabular-nums font-semibold ${
                                  point.kind === 'Forecast' ? 'text-emerald-700' : 'text-blue-700'
                                }`}
                              >
                                ${revValue.toLocaleString()}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-slate-600">Trend Line</span>
                              <span className="font-mono tabular-nums text-slate-900">
                                ${point.trendRevenueUsd.toLocaleString()}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-slate-600">Net Profit</span>
                              <span className="font-mono tabular-nums font-medium text-emerald-700">
                                ${point.netProfitUsd.toLocaleString()}
                              </span>
                            </div>
                            {point.kind === 'Forecast' &&
                              point.conservativeRevenueUsd !== undefined &&
                              point.optimisticRevenueUsd !== undefined && (
                                <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-100">
                                  <span className="text-slate-500">Confidence Band</span>
                                  <span className="font-mono tabular-nums text-slate-800">
                                    ${point.conservativeRevenueUsd.toLocaleString()}–$
                                    {point.optimisticRevenueUsd.toLocaleString()}
                                  </span>
                                </div>
                              )}
                          </div>
                        );
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
                      iconType="square"
                      itemSorter={null}
                    />
                    <Bar
                      dataKey="actualRevenueUsd"
                      stackId="rev"
                      name="Historical Revenue"
                      fill="#1D4ED8"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={42}
                      isAnimationActive={false}
                    />
                    <Bar
                      dataKey="forecastRevenueUsd"
                      stackId="rev"
                      name="Projected Next Month"
                      fill="#059669"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={42}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="trendRevenueUsd"
                      name="Trend Trajectory"
                      stroke="#0F172A"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={{ r: 3, fill: '#0F172A' }}
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>
          </div>

          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">Managed Business Ventures &amp; Active Plans</h2>
              <span className="text-xs text-slate-500">High-level operational &amp; P&amp;L summary</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                    <th className="py-2.5 pr-4">Venture &amp; Business Plan</th>
                    <th className="py-2.5 px-3">Stage</th>
                    <th className="py-2.5 px-3 text-right">Customers</th>
                    <th className="py-2.5 px-3 text-right">Revenue</th>
                    <th className="py-2.5 px-3 text-right">Expenses</th>
                    <th className="py-2.5 pl-3 text-right">Net Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {ventures.map((v) => {
                    const vProfit = v.monthlyRevenueUsd - v.monthlyExpensesUsd;
                    return (
                      <tr key={v.id} className="hover:bg-slate-50/80 align-top">
                        <td className="py-3.5 pr-4 max-w-md">
                          <p className="font-semibold text-slate-900">{v.name}</p>
                          <p className="text-xs text-slate-600 mt-1">{v.businessPlanSummary}</p>
                          <p className="text-xs text-slate-500 mt-1">Market: {v.marketResearchSummary}</p>
                        </td>
                        <td className="py-3.5 px-3 text-xs font-medium text-slate-700 whitespace-nowrap">
                          {v.stage}
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono tabular-nums text-slate-700">
                          {v.activeCustomers}
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono tabular-nums text-slate-900">
                          ${v.monthlyRevenueUsd.toLocaleString()}
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono tabular-nums text-slate-600">
                          ${v.monthlyExpensesUsd.toLocaleString()}
                        </td>
                        <td className="py-3.5 pl-3 text-right font-mono tabular-nums font-semibold text-emerald-700">
                          ${vProfit.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Add New Venture / Income Stream */}
          <section className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Register New Business Venture</h2>
            <form onSubmit={handleCreateVenture} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-3">
                <label htmlFor="venture-name" className="block text-xs font-medium text-slate-700 mb-1">
                  Venture Name
                </label>
                <input
                  id="venture-name"
                  type="text"
                  required
                  value={ventureName}
                  onChange={(e) => setVentureName(e.target.value)}
                  placeholder="e.g., E-Commerce Margin Recovery Bot"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div className="md:col-span-3">
                <label htmlFor="venture-channel" className="block text-xs font-medium text-slate-700 mb-1">
                  Acquisition Channel
                </label>
                <input
                  id="venture-channel"
                  type="text"
                  value={ventureChannel}
                  onChange={(e) => setVentureChannel(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div className="md:col-span-2">
                <label htmlFor="venture-rev" className="block text-xs font-medium text-slate-700 mb-1">
                  Monthly Rev ($)
                </label>
                <input
                  id="venture-rev"
                  type="number"
                  min="0"
                  value={ventureRev}
                  onChange={(e) => setVentureRev(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div className="md:col-span-1">
                <label htmlFor="venture-exp" className="block text-xs font-medium text-slate-700 mb-1">
                  Exp ($)
                </label>
                <input
                  id="venture-exp"
                  type="number"
                  min="0"
                  value={ventureExp}
                  onChange={(e) => setVentureExp(e.target.value)}
                  className="w-full px-2.5 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div className="md:col-span-1">
                <label htmlFor="venture-roi" className="block text-xs font-medium text-slate-700 mb-1">
                  Proj ROI %
                </label>
                <input
                  id="venture-roi"
                  type="number"
                  min="0"
                  value={ventureProjectedRoi}
                  onChange={(e) => setVentureProjectedRoi(e.target.value)}
                  className="w-full px-2.5 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div className="md:col-span-2">
                <button
                  type="submit"
                  className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add Venture
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* Sub-Tab 2: Proactive Opportunity Radar (User-Specified Areas of Interest) */}
      {activeSubTab === 'radar' && (
        <div className="space-y-6">
          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Proactive Opportunity Radar — Areas of Interest
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Specify markets, sectors, or investment themes. Jerry researches opportunities and alerts you with profitability and risk analyses.
                </p>
              </div>
              <button
                type="button"
                disabled={scanning || interestTopics.length === 0}
                onClick={() => void handleScanOpportunities()}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
              >
                {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radar className="w-4 h-4" />}
                Scan Interests Now
              </button>
            </div>

            {/* Watchlist Topics */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {interestTopics.map((topic) => (
                <div
                  key={topic}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 text-slate-800 rounded-lg border border-slate-200"
                >
                  <span>{topic}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveInterest(topic)}
                    aria-label={`Remove interest ${topic}`}
                    className="text-slate-500 hover:text-slate-900 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <form onSubmit={handleAddInterest} className="flex flex-col sm:flex-row gap-3">
              <label htmlFor="interest-topic-input" className="sr-only">
                Add area of interest
              </label>
              <input
                id="interest-topic-input"
                type="text"
                value={newInterest}
                onChange={(e) => setNewInterest(e.target.value)}
                placeholder="Add area of interest (e.g., AI startups, renewable energy stocks, e-commerce trends)"
                className="flex-1 px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                type="submit"
                disabled={!newInterest.trim()}
                className="px-4 py-2 text-sm font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
              >
                Add Interest
              </button>
            </form>

            {scanMessage && (
              <p className="text-xs text-slate-800 bg-slate-100 border border-slate-200 rounded-lg px-3.5 py-2.5">
                {scanMessage}
              </p>
            )}
          </section>

          {/* Opportunity Alerts Feed */}
          <section className="space-y-4">
            {opportunityAlerts.map((alert) => (
              <article
                key={alert.id}
                className="bg-white border border-slate-200 rounded-xl p-6 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <div>
                    <span className="font-semibold text-blue-700">{alert.interestTopic}</span>
                    <span aria-hidden="true"> · </span>
                    <span>{alert.kind}</span>
                    <span aria-hidden="true"> · </span>
                    <span className="font-mono tabular-nums">
                      Est. Capital ${alert.estimatedCapitalUsd.toLocaleString()}
                    </span>
                    <span aria-hidden="true"> · </span>
                    <span className="capitalize">{alert.status.replace('_', ' ')}</span>
                  </div>
                  <span className="font-mono tabular-nums">{alert.createdAt.slice(0, 10)}</span>
                </div>

                <h3 className="text-base font-semibold text-slate-900">{alert.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{alert.summary}</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                    <p className="text-xs font-semibold text-slate-900">Potential Profitability Analysis</p>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      {alert.profitabilityAnalysis}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                    <p className="text-xs font-semibold text-slate-900">Risk Assessment</p>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">{alert.riskAnalysis}</p>
                  </div>
                </div>

                {alert.capitalFit && (
                  <p className={`text-xs font-medium ${alert.capitalFit === 'within_budget' ? 'text-emerald-700' : 'text-amber-700'}`}>
                    Capital fit: {alert.capitalFit === 'within_budget' ? 'Within stated budget' : 'Above stated budget'} — estimate ${alert.estimatedCapitalUsd.toLocaleString()} USD; no spending is authorized.
                  </p>
                )}

                {alert.evidenceStatus && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Evidence status: Source-referenced AI analysis, not independently verified. Treat conclusions and estimates as provisional.
                  </p>
                )}

                {alert.sourceSupportedObservations && alert.sourceSupportedObservations.length > 0 && (
                  <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                    <p className="text-xs font-semibold text-slate-900">Observations supported by retrieved material</p>
                    <ul className="list-disc pl-5 mt-1 space-y-1 text-xs text-slate-600">
                      {alert.sourceSupportedObservations.map((observation, idx) => <li key={idx}>{observation}</li>)}
                    </ul>
                  </div>
                )}

                {alert.estimatesAndAssumptions && alert.estimatesAndAssumptions.length > 0 && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                    <p className="text-xs font-semibold text-amber-900">Estimates and assumptions — not verified facts</p>
                    <ul className="list-disc pl-5 mt-1 space-y-1 text-xs text-amber-900">
                      {alert.estimatesAndAssumptions.map((assumption, idx) => <li key={idx}>{assumption}</li>)}
                    </ul>
                  </div>
                )}

                {alert.sourceReferences && alert.sourceReferences.length > 0 && (
                  <div className="text-xs text-slate-500 flex flex-col gap-2 pt-1">
                    <span className="font-medium text-slate-700">Retrieved references (not independently verified):</span>
                    {alert.sourceReferences.map((src, idx) => (
                      <a key={idx} href={src.uri} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-700 hover:underline break-all">
                        {src.title}{src.publishedDate ? ` · ${src.publishedDate.slice(0, 10)}` : ''}
                        <ArrowUpRight className="w-3 h-3 shrink-0" />
                      </a>
                    ))}
                  </div>
                )}

                {alert.verifiedSources.length > 0 && (
                  <div className="text-xs text-slate-500 flex flex-wrap items-center gap-3 pt-1">
                    <span className="font-medium text-slate-700">Independently verified sources:</span>
                    {alert.verifiedSources.map((src, idx) => (
                      <a key={idx} href={src.uri} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-700 hover:underline">
                        {src.title}
                        <ArrowUpRight className="w-3 h-3" />
                      </a>
                    ))}
                  </div>
                )}

                <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-slate-700">
                    <span className="font-medium text-slate-900">Next Step: </span>
                    {alert.nextAction}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {alert.status === 'new' && (
                      <button
                        type="button"
                        onClick={() => onUpdateAlertStatus(alert.id, 'reviewed')}
                        className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Mark Reviewed
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateAlertStatus(alert.id, 'converted_to_goal');
                        void onPromoteToGoal(alert.title, alert.nextAction, alert.estimatedCapitalUsd);
                      }}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Convert to 8-Level Goal
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </section>
        </div>
      )}

      {/* Sub-Tab 3: Market Research & Responsible Opportunity Assessment */}
      {activeSubTab === 'research' && (
        <div className="space-y-6">
          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Responsible Opportunity Investigation
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Jerry evaluates startup cost, demand, competition, legal/ethical considerations, and safer alternatives—separating verified facts from estimates.
              </p>
            </div>

            <form onSubmit={handleAssessIdea} className="flex flex-col sm:flex-row gap-3">
              <label htmlFor="assess-idea-input" className="sr-only">
                Business opportunity to investigate
              </label>
              <input
                id="assess-idea-input"
                type="text"
                required
                value={ideaInput}
                onChange={(e) => setIdeaInput(e.target.value)}
                placeholder="Investigate a business idea (e.g., Automated clinic insurance pre-check SaaS)"
                className="flex-1 px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                type="submit"
                disabled={assessing || !ideaInput.trim()}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
              >
                {assessing && <Loader2 className="w-4 h-4 animate-spin" />}
                Run Risk &amp; Return Audit
              </button>
            </form>
            {assessError && <p className="text-xs text-rose-700">{assessError}</p>}
          </section>

          <div className="space-y-4">
            {opportunities.map((opp) => {
              const compliance = validateOpportunityAssessment(opp);
              return (
                <article
                  key={opp.id}
                  className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div>
                      <p className="text-xs text-slate-500">
                        {opp.sector} · {opp.evidenceType} · Demand: {opp.marketDemand} · Competition:{' '}
                        {opp.competition} · Risk: {opp.riskLevel}
                      </p>
                      <h3 className="text-base font-semibold text-slate-900 mt-1">{opp.title}</h3>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-mono tabular-nums text-slate-700">
                        Startup ${opp.startupCostUsd.toLocaleString()}
                      </span>
                      <select
                        aria-label={`Status for ${opp.title}`}
                        value={opp.status}
                        onChange={(e) =>
                          onUpdateOpportunityStatus(opp.id, e.target.value as BusinessOpportunity['status'])
                        }
                        className="px-2.5 py-1 text-xs bg-white border border-slate-300 rounded-md text-slate-800"
                      >
                        <option value="investigating">Investigating</option>
                        <option value="recommended">Recommended</option>
                        <option value="active">Active</option>
                        <option value="declined">Declined</option>
                      </select>
                    </div>
                  </div>

                  <p className="text-sm text-slate-700">
                    <span className="font-medium text-slate-900">Return Profile: </span>
                    {opp.estimatedMonthlyReturn}
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
                      <p className="font-semibold text-emerald-800">Verified Facts</p>
                      <ul className="list-disc pl-4 space-y-1 text-slate-700">
                        {opp.verifiedFacts.map((f, i) => (
                          <li key={i}>{f}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
                      <p className="font-semibold text-amber-800">Estimates &amp; Assumptions</p>
                      <ul className="list-disc pl-4 space-y-1 text-slate-700">
                        {opp.estimatesAndAssumptions.map((a, i) => (
                          <li key={i}>{a}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-600">
                    <div>
                      <span className="font-semibold text-slate-800">Legal &amp; Ethical Notes: </span>
                      {opp.legalAndEthicalNotes}
                    </div>
                    <div>
                      <span className="font-semibold text-slate-800">Safer Alternative: </span>
                      {opp.saferAlternative}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-xs">
                    <span className="inline-flex items-center gap-1.5 text-slate-600">
                      <ShieldCheck className="w-4 h-4 text-emerald-700" />
                      {compliance.compliant
                        ? 'Responsible Assessment Policy Compliant'
                        : compliance.warnings.join(' ')}
                    </span>
                    {opp.status !== 'declined' && (
                      <button
                        type="button"
                        onClick={() =>
                          void onPromoteToGoal(opp.title, opp.saferAlternative, opp.startupCostUsd)
                        }
                        className="px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Create 8-Level Plan
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {/* Sub-Tab 4: Customer Acquisition Strategy & Sales Performance Reports */}
      {activeSubTab === 'sales' && (
        <div className="space-y-6">
          {/* Customer Acquisition Strategy Overviews */}
          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Customer Acquisition Strategy Overview
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Channel economics, target CAC vs LTV ratios, and conversion performance by venture
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                    <th className="py-2.5 pr-4">Venture</th>
                    <th className="py-2.5 px-3">Primary Acquisition Channel</th>
                    <th className="py-2.5 px-3 text-right">Target CAC</th>
                    <th className="py-2.5 px-3 text-right">Est. LTV</th>
                    <th className="py-2.5 px-3 text-right">LTV:CAC</th>
                    <th className="py-2.5 pl-3 text-right">Conversion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {ventures.map((v) => {
                    const ratio = v.targetCacUsd > 0 ? (v.estimatedLtvUsd / v.targetCacUsd).toFixed(1) : '—';
                    return (
                      <tr key={v.id}>
                        <td className="py-3 pr-4 font-medium text-slate-900">{v.name}</td>
                        <td className="py-3 px-3 text-xs text-slate-600">{v.acquisitionChannel}</td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                          ${v.targetCacUsd.toLocaleString()}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-900">
                          ${v.estimatedLtvUsd.toLocaleString()}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-emerald-700 font-medium">
                          {ratio}x
                        </td>
                        <td className="py-3 pl-3 text-right font-mono tabular-nums text-slate-700">
                          {v.conversionRatePct.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Sales Performance Reports */}
          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Sales Performance Reports</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Monthly closed revenue, pipeline progression, and net contribution across Jerry-managed ventures
                </p>
              </div>
              <button
                type="button"
                onClick={handleExportSalesCsv}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV Report
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                    <th className="py-2.5 pr-4">Period</th>
                    <th className="py-2.5 px-3">Scope</th>
                    <th className="py-2.5 px-3 text-right">Deals Closed</th>
                    <th className="py-2.5 px-3 text-right">Pipeline Value</th>
                    <th className="py-2.5 px-3 text-right">Closed Revenue</th>
                    <th className="py-2.5 px-3 text-right">Expenses</th>
                    <th className="py-2.5 pl-3 text-right">Net Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {salesReports.map((row) => {
                    const net = row.closedRevenueUsd - row.expensesUsd;
                    return (
                      <tr key={row.id}>
                        <td className="py-3 pr-4 font-mono tabular-nums font-medium text-slate-900">
                          {row.period}
                        </td>
                        <td className="py-3 px-3 text-xs text-slate-600">{row.ventureName}</td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                          {row.dealsClosed}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                          ${row.pipelineValueUsd.toLocaleString()}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-900 font-medium">
                          ${row.closedRevenueUsd.toLocaleString()}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-600">
                          ${row.expensesUsd.toLocaleString()}
                        </td>
                        <td className="py-3 pl-3 text-right font-mono tabular-nums font-semibold text-emerald-700">
                          ${net.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
