export type WorkspaceTab =
  | 'overview'
  | 'brain'
  | 'goals'
  | 'tasks'
  | 'business'
  | 'wallet'
  | 'voice_vision'
  | 'self_growth'
  | 'memory'
  | 'approvals';

export type CycleStageId =
  | 'discover'
  | 'discuss'
  | 'recommend'
  | 'plan'
  | 'authorize'
  | 'execute'
  | 'monitor'
  | 'improve';

export interface CycleStage {
  id: CycleStageId;
  stepNumber: number;
  label: string;
  description: string;
  status: 'completed' | 'active' | 'pending';
}

// 8-Level Planning System (Section 4)
export interface ExecutionDetail {
  id?: string;
  tools: string[];
  resources: string[];
  instructions: string;
  dependencies: string[];
  deadline: string;
  completionCheck: string;
  completed: boolean;
}

export interface ActionStep {
  id: string;
  title: string;
  execution: ExecutionDetail;
}

export interface SubtaskNode {
  id: string;
  title: string;
  actionSteps: ActionStep[];
}

export interface TaskNode {
  id: string;
  title: string;
  subtasks: SubtaskNode[];
}

export interface MilestoneNode {
  id: string;
  title: string;
  targetDate: string;
  tasks: TaskNode[];
}

export interface ProjectPhaseNode {
  id: string;
  title: string;
  milestones: MilestoneNode[];
}

export interface GoalEvaluation {
  availableCapitalUsd: number;
  requiredSkills: string;
  weeklyHoursRequired: number;
  technologyStack: string;
  marketDemandSummary: string;
  profitabilityPotential: string;
}

export interface Goal {
  id: string;
  title: string; // Level 1: Goal
  strategy: string; // Level 2: Strategy
  category: 'Revenue' | 'Product' | 'Automation' | 'Investment';
  status: 'proposed' | 'authorized' | 'in_progress' | 'completed';
  origin: 'jerry_recommended' | 'collaborative' | 'owner_assigned';
  evaluation: GoalEvaluation;
  phases: ProjectPhaseNode[]; // Levels 3-8
  createdAt: string;
}

export type TaskExecutionStatus =
  | 'queued'
  | 'running'
  | 'interrupted'
  | 'awaiting_approval'
  | 'completed'
  | 'rejected';

export interface AutonomousTask {
  id: string;
  goalId: string;
  title: string;
  description: string;
  category: 'research' | 'operations' | 'financial' | 'outreach' | 'engineering';
  status: TaskExecutionStatus;
  idempotencyKey: string;
  attempts: number;
  lastCheckpoint: string;
  requiresApproval: boolean;
  approvalReason?: string;
  financialImpactUsd: number;
  expectedRevenueUsd?: number;
  projectedRevenueUsd?: number;
  realizedRevenueUsd?: number;
  deliverableOutput?: string;
  backgroundEligible: boolean;
  updatedAt: string;
}

export interface ProactiveDiscussion {
  id: string;
  topic: string;
  triggerType: 'opportunity' | 'task_review' | 'problem_alert' | 'strategy_upgrade' | 'tech_shift';
  summary: string;
  recommendation: string;
  status: 'awaiting_response' | 'discussed' | 'adopted' | 'dismissed';
  createdAt: string;
}

export interface BusinessOpportunity {
  id: string;
  title: string;
  sector: string;
  startupCostUsd: number;
  marketDemand: 'High' | 'Moderate' | 'Emerging';
  competition: 'Low' | 'Moderate' | 'High';
  estimatedMonthlyReturn: string;
  riskLevel: 'Low' | 'Moderate' | 'Elevated';
  evidenceType: 'Verified Market Data' | 'Model Estimate';
  verifiedFacts: string[];
  estimatesAndAssumptions: string[];
  legalAndEthicalNotes: string;
  saferAlternative: string;
  status: 'investigating' | 'recommended' | 'active' | 'declined';
}

export interface IncomeStream {
  id: string;
  name: string;
  channel: string;
  monthlyRevenueUsd: number;
  monthlyExpenseUsd: number;
  automationLevel: 'Automated' | 'Semi-Automated' | 'Manual';
  status: 'active' | 'scaling' | 'pilot';
}

export type WalletSource = 'Jerry Built-in';

export interface WalletAsset {
  id: string;
  symbol: 'BTC';
  network: string;
  balance: number;
  usdPrice: number;
  source: WalletSource;
  address: string;
  lastSyncedAt?: string;
  priceSource?: string;
  isLiveOnChainBalance?: boolean;
}

export interface ExternalWalletConnection {
  provider: 'Bitcoin External Wallet';
  connected: boolean;
  accountLabel: string;
  network: string;
  lastSyncedAt: string;
}

export interface ApprovalRequest {
  id: string;
  kind: 'wallet_transfer' | 'settlement' | 'autonomous_task' | 'self_upgrade';
  subjectId: string;
  title: string;
  reason: string;
  requestedAt: string;
  decision: 'pending' | 'approved' | 'rejected';
  decidedAt?: string;
  /** Set atomically when this authorization is consumed to start a task execution. */
  consumedAt?: string;
}

export interface WalletTransaction {
  id: string;
  timestamp: string;
  type: 'incoming' | 'outgoing' | 'business_revenue';
  asset: 'BTC';
  network: string;
  amount: number;
  /** Authoritative USD valuation captured at the time this settlement was verified. */
  usdValue?: number;
  usdValuationAt?: string;
  usdValuationSource?: string;
  fee: number;
  counterparty: string;
  status: 'confirmed' | 'pending_approval' | 'rejected' | 'reorged';
  note: string;
  txHash?: string;
  isVerifiedOnChain?: boolean;
  settlementMode?: 'on_chain' | 'verified_ledger' | 'autonomous_run';
  /** Bitcoin settlement finality evidence captured by the server. */
  confirmationDepth?: number;
  verifiedBlockHeight?: number;
  verifiedBlockHash?: string;
  /** Monotonic journal generation; increments only after a reorged tx is reconfirmed. */
  journalCycle?: number;
  approvalId?: string;

}

export interface ChatMessage {
  id: string;
  role: 'user' | 'jerry';
  content: string;
  timestamp: string;
  mode?: 'text' | 'voice' | 'proactive';
  modelUsed?: string;
}

export interface VisionAnalysisRecord {
  id: string;
  title: string;
  imageUrl: string;
  prompt: string;
  analysis: string;
  extractedActions: string[];
  timestamp: string;
}

export interface MemoryEntry {
  id: string;
  category: 'goal' | 'decision' | 'lesson' | 'preference' | 'workflow';
  title: string;
  content: string;
  outcome?: 'success' | 'correction' | 'insight';
  tags: string[];
  createdAt: string;
}

export interface PhoneIntegrationItem {
  id: string;
  area: string;
  capabilities: string;
  accessTier: 'Standard Permission' | 'Advanced Access';
  enabled: boolean;
  securityImplication: string;
}

export interface OwnerProfile {
  name: string;
  title: string;
  avatarUrl: string;
  autonomyThresholdUsd: number;
  dailyProfitThresholdUsd: number;
  weeklyProfitMinimumUsd: number;
  monthlyProfitMinimumUsd: number;
  preferredVoice: 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr';
  voiceProfile?: string;
  missionFocus: string;
}

export interface OpportunityAlert {
  id: string;
  interestTopic: string;
  title: string;
  kind: 'Business' | 'Investment';
  summary: string;
  profitabilityAnalysis: string;
  riskAnalysis: string;
  estimatedCapitalUsd: number;
  /** Empty unless independently verified; sourceReferences are retrieved references only. */
  verifiedSources: Array<{ title: string; uri: string }>;
  sourceReferences?: Array<{ title: string; uri: string; publishedDate: string | null }>;
  evidenceStatus?: string;
  sourceSupportedObservations?: string[];
  capitalFit?: 'within_budget' | 'above_budget';
  estimatesAndAssumptions?: string[];
  nextAction: string;
  status: 'new' | 'reviewed' | 'converted_to_goal' | 'dismissed';
  createdAt: string;
}

export interface BusinessVenture {
  id: string;
  name: string;
  stage: 'Active' | 'Scaling' | 'Pilot' | 'Planning';
  monthlyRevenueUsd: number;
  monthlyExpensesUsd: number;
  activeCustomers: number;
  businessPlanSummary: string;
  marketResearchSummary: string;
  acquisitionChannel: string;
  targetCacUsd: number;
  estimatedLtvUsd: number;
  conversionRatePct: number;
  projectedRoiPct?: number;
  projectedMonthlyProfitUsd?: number;
  linkedGoalId?: string;
}

export interface SalesPerformanceEntry {
  id: string;
  period: string;
  ventureName: string;
  dealsClosed: number;
  pipelineValueUsd: number;
  closedRevenueUsd: number;
  expensesUsd: number;
}

export interface SelfUpgradeProposal {
  id: string;
  prompt: string;
  language: string;
  targetModule: string;
  title: string;
  summary: string;
  code: string;
  testCode: string;
  securityAuditPassed: boolean;
  securityAuditNotes: string;
  testStatus: 'pending' | 'passed' | 'failed';
  testReport: string;
  approvalStatus: 'awaiting_permission' | 'approved' | 'approved_deployed' | 'rejected';
  createdAt: string;
  deployedAt?: string;
}

export interface DailyMoneyDiscovery {
  id: string;
  discoveredDate: string;
  title: string;
  methodCategory:
    | 'Automation Template'
    | 'Productized Service'
    | 'AI Micro-Tool'
    | 'Retainer Upsell'
    | 'Data & API Feed';
  whyEasierAndFaster: string;
  executionShortcut: string;
  estimatedHoursSavedPerWeek: number;
  estimatedDailyProfitUsd: number;
  startupCapitalUsd: number;
  status: 'discovered' | 'adopted_into_daily_routine' | 'archived';
  lastExecutedDate?: string;
  executionCount?: number;
  totalEarnedUsd?: number;
}

export interface DailyProfitRecord {
  date: string;
  profitUsd: number;
  methodsUsed: number;
  summary: string;
}

export interface HumanUnderstandingInsight {
  id: string;
  learnedDate: string;
  domain:
    | 'Buyer Psychology'
    | 'Owner Style'
    | 'Communication & Trust'
    | 'Decision Friction'
    | 'Offer Framing';
  title: string;
  observation: string;
  practicalApplication: string;
  clarityScoreGain: number;
}

export interface InternetDominanceInsight {
  id: string;
  learnedDate: string;
  pillar:
    | 'SEO & Organic Reach'
    | 'Autonomous Distribution'
    | 'Viral Product Loops'
    | 'Developer & API Ecosystem'
    | 'Conversion & Monetization';
  title: string;
  tactic: string;
  expectedImpact: string;
  authorityGainPts: number;
}

export interface DailySummaryReport {
  id: string;
  reportDate: string;
  generatedAt: string;
  headline: string;
  summaryText: string;
  notificationTitle: string;
  notificationRead: boolean;
  modelUsed: string;
  metrics: {
    todayProfitUsd: number;
    previousDayProfitUsd: number;
    activeTasksCount: number;
    completedTasksCount: number;
    newRevenueInsightsCount: number;
    internetAuthorityScore: number;
  };
  chartSeries: Array<{
    label: string;
    profitUsd: number;
    insightPotentialUsd: number;
  }>;
  taskBreakdown: Array<{
    name: string;
    count: number;
  }>;
}

export interface JerryState {
  owner: OwnerProfile;
  profitReserveUsd: number;
  lastDailyProfitRunDate?: string;
  lastDailyDiscoveryDate?: string;
  lastDailySummaryDate?: string;
  lastWalletSyncAt?: string;
  dailyDiscoveries: DailyMoneyDiscovery[];
  dailyProfitHistory?: DailyProfitRecord[];
  humanInsights?: HumanUnderstandingInsight[];
  internetMastery?: InternetDominanceInsight[];
  dailySummaryReports?: DailySummaryReport[];
  activeCycleStep: CycleStageId;
  interestTopics: string[];
  opportunityAlerts: OpportunityAlert[];
  ventures: BusinessVenture[];
  salesReports: SalesPerformanceEntry[];
  goals: Goal[];
  tasks: AutonomousTask[];
  proactiveDiscussions: ProactiveDiscussion[];
  opportunities: BusinessOpportunity[];
  incomeStreams: IncomeStream[];
  walletAssets: WalletAsset[];
  externalWallets: ExternalWalletConnection[];
  transactions: WalletTransaction[];
  approvals?: ApprovalRequest[];

  messages: ChatMessage[];
  visionHistory: VisionAnalysisRecord[];
  memories: MemoryEntry[];
  phoneIntegrations: PhoneIntegrationItem[];
  selfUpgrades: SelfUpgradeProposal[];
}
