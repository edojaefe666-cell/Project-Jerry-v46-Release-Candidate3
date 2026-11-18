import type { CycleStage, JerryState } from './types';

export const OPERATING_CYCLE_STAGES: CycleStage[] = [
  {
    id: 'discover',
    stepNumber: 1,
    label: 'Discover',
    description: 'Surface viable revenue ideas',
    status: 'completed',
  },
  {
    id: 'discuss',
    stepNumber: 2,
    label: 'Discuss',
    description: 'Evaluate strategic fit together',
    status: 'completed',
  },
  {
    id: 'recommend',
    stepNumber: 3,
    label: 'Recommend',
    description: 'Weigh capital, demand & risk',
    status: 'completed',
  },
  {
    id: 'plan',
    stepNumber: 4,
    label: 'Plan',
    description: 'Build 8-level execution tree',
    status: 'completed',
  },
  {
    id: 'authorize',
    stepNumber: 5,
    label: 'Authorize',
    description: 'Sign off on financial gates',
    status: 'active',
  },
  {
    id: 'execute',
    stepNumber: 6,
    label: 'Execute',
    description: 'Run tasks with checkpoints',
    status: 'pending',
  },
  {
    id: 'monitor',
    stepNumber: 7,
    label: 'Monitor',
    description: 'Track progress & recover',
    status: 'pending',
  },
  {
    id: 'improve',
    stepNumber: 8,
    label: 'Improve',
    description: 'Learn and refine workflows',
    status: 'pending',
  },
];

export const ARCHITECTURE_MODULES = [
  {
    name: 'Jerry Core',
    responsibility: 'Main application lifecycle, interface orchestration, and component coordination.',
    stage: 'Stage 1',
  },
  {
    name: 'Jerry Brain',
    responsibility: 'Central intelligence for reasoning, synthesis, strategy comparison, and planning.',
    stage: 'Stage 2',
  },
  {
    name: 'Jerry Memory',
    responsibility: 'Searchable persistent storage surviving reloads and device restarts.',
    stage: 'Stage 3',
  },
  {
    name: 'Jerry Goal Engine',
    responsibility: 'Independent goal evaluation and eight-level hierarchical work breakdown.',
    stage: 'Stage 4',
  },
  {
    name: 'Jerry Task Engine',
    responsibility: 'Idempotent task scheduling, checkpointing, and error recovery.',
    stage: 'Stage 5',
  },
  {
    name: 'Jerry Background Manager',
    responsibility: 'WorkManager / persistent background continuity and interruption resumption.',
    stage: 'Stage 5',
  },
  {
    name: 'Jerry Proactive Intelligence',
    responsibility: 'Initiates meaningful discussions on opportunities, blockers, and optimizations.',
    stage: 'Stage 6',
  },
  {
    name: 'Jerry Voice',
    responsibility: 'Natural speech recognition, spoken updates, and text-to-speech playback.',
    stage: 'Stage 7',
  },
  {
    name: 'Jerry Vision',
    responsibility: 'Document reading, screenshot interpretation, and visual asset analysis.',
    stage: 'Stage 7',
  },
  {
    name: 'Jerry Phone Integration',
    responsibility: 'Authorized Android apps, calls, messages, calendar, files, and accessibility.',
    stage: 'Stage 8',
  },
  {
    name: 'Jerry Business',
    responsibility: 'Market research, customer acquisition, revenue tracking, and multi-stream growth.',
    stage: 'Stage 9',
  },
  {
    name: 'Jerry Wallet',
    responsibility: 'Built-in self-custody assets, Jerry Built-in/Trust/Jerry Built-in, and gated transfers.',
    stage: 'Stage 10',
  },
  {
    name: 'Jerry Learning Engine',
    responsibility: 'Outcome retrospectives, mistake prevention, and workflow optimization.',
    stage: 'Stage 11',
  },
];

export const DEVELOPMENT_ROADMAP = [
  { stage: 1, deliverable: 'Android & Web foundation and Jerry interface', status: 'Active' },
  { stage: 2, deliverable: 'Jerry Brain and Gemini AI connection', status: 'Active' },
  { stage: 3, deliverable: 'Persistent memory surviving restarts', status: 'Active' },
  { stage: 4, deliverable: 'Goal Engine and eight-level planning', status: 'Active' },
  { stage: 5, deliverable: 'Task execution and background recovery', status: 'Active' },
  { stage: 6, deliverable: 'Proactive intelligence discussions', status: 'Active' },
  { stage: 7, deliverable: 'Voice and Vision multimodal pipeline', status: 'Active' },
  { stage: 8, deliverable: 'Android phone integration & permissions', status: 'Configured' },
  { stage: 9, deliverable: 'Jerry Business & opportunity assessment', status: 'Active' },
  { stage: 10, deliverable: 'Jerry Wallet unified financial dashboard', status: 'Active' },
  { stage: 11, deliverable: 'Continuous learning & retrospective loop', status: 'Active' },
  { stage: 12, deliverable: 'Advanced OS integrations & hardware expansion', status: 'Planned' },
];

export const INITIAL_JERRY_STATE: JerryState = {
  owner: {
    name: 'Edoja Efe',
    title: 'Principal Owner & Partner',
    avatarUrl: '/src/assets/images/owner_portrait_1794533353141.jpg',
    autonomyThresholdUsd: 250,
    dailyProfitThresholdUsd: 1000,
    weeklyProfitMinimumUsd: 5000,
    monthlyProfitMinimumUsd: 20000,
    preferredVoice: 'Puck',
    voiceProfile: 'Male, 32 years old, American — clear, energetic, confident executive strategist',
    missionFocus: 'Top-Most Priority: Generate and save at least $1,000/day ($5,000+/week, $20,000+/month) in net profit each day inside our Saved Profit Reserve—strictly separate from our investment principal.',
  },
  profitReserveUsd: 1450,
  lastDailyProfitRunDate: undefined,
  lastDailyDiscoveryDate: undefined,
  dailyProfitHistory: [
    {
      date: '2026-11-10',
      profitUsd: 960,
      methodsUsed: 2,
      summary: 'Automated invoice audit templates & API batch settlements.',
    },
    {
      date: '2026-11-11',
      profitUsd: 1085,
      methodsUsed: 3,
      summary: 'Freight variance packager + onboarding checkout link (+13.0% vs Nov 10).',
    },
  ],
  humanInsights: [
    {
      id: 'hi-1',
      learnedDate: '2026-11-12',
      domain: 'Buyer Psychology',
      title: 'Quantify Time & Stress Saved Before Presenting Price',
      observation:
        'Operators decide 2.4x faster when shown concrete weekly hours returned and operational headaches eliminated before seeing a retainer fee.',
      practicalApplication:
        'Every Jerry pitch and offer summary opens with exact weekly hours saved and zero-risk verification before stating USD fee.',
      clarityScoreGain: 3,
    },
    {
      id: 'hi-2',
      learnedDate: '2026-11-11',
      domain: 'Communication & Trust',
      title: 'Calm Executive Brevity Outperforms Hype & Jargon',
      observation:
        'Human partners trust clear numbers, explicit caveats between verified facts vs. estimates, and concise action options over long sales copy.',
      practicalApplication:
        'Jerry speaks as a measured 50-year-old executive partner—plain truth, explicit risk notes, zero fluff.',
      clarityScoreGain: 3,
    },
    {
      id: 'hi-3',
      learnedDate: '2026-11-10',
      domain: 'Owner Style',
      title: 'Protect Principal Strictly While Automating Low-Friction Cash Flow',
      observation:
        'Knowing invested capital is untouched lowers cognitive friction and builds confidence to scale daily revenue experiments.',
      practicalApplication:
        'Keep Profit Reserve visibly separated from Invested Holdings and route all daily tasks through zero-drawdown templates.',
      clarityScoreGain: 2,
    },
  ],
  internetMastery: [
    {
      id: 'net-1',
      learnedDate: '2026-11-12',
      pillar: 'SEO & Organic Reach',
      title: 'Programmatic Problem-Solution Landing Pages for Freight & Compliance Queries',
      tactic:
        'Publish 15 intent-matched diagnostic landing pages targeting exact carrier invoice error queries so organic search compounds customer acquisition at $0 ad spend.',
      expectedImpact: '+28% weekly organic signups and compounding domain authority',
      authorityGainPts: 4,
    },
    {
      id: 'net-2',
      learnedDate: '2026-11-11',
      pillar: 'Autonomous Distribution',
      title: 'Zero-Friction Interactive Calculator Embeds That Spread Across B2B Teams',
      tactic:
        'Package our invoice variance check as a shareable web tool with embedded referral attribution so every operator sharing a report introduces 3+ new prospects.',
      expectedImpact: '+1.6x referral loop multiplier across B2B operations teams',
      authorityGainPts: 3,
    },
    {
      id: 'net-3',
      learnedDate: '2026-11-10',
      pillar: 'Developer & API Ecosystem',
      title: 'Self-Serve Webhook & OpenAPI Spec Directory Distribution',
      tactic:
        'Publish clean OpenAPI snippets and copy-paste TypeScript webhooks so developers integrate Jerry APIs in under 5 minutes.',
      expectedImpact: '3x faster developer onboarding and metered usage licensing',
      authorityGainPts: 3,
    },
  ],
  dailySummaryReports: [],
  dailyDiscoveries: [
    {
      id: 'disc-way-1',
      discoveredDate: '2026-11-12',
      title: 'One-Click Freight Bill Variance Packager',
      methodCategory: 'Productized Service',
      whyEasierAndFaster:
        'Replaces 45 minutes of manual spreadsheet reconciliation per broker with a pre-built PDF/CSV audit template that executes in under 90 seconds.',
      executionShortcut:
        'Run batch carrier OCR schema check -> export PDF variance summary -> issue $295 fixed-fee USD invoice automatically.',
      estimatedHoursSavedPerWeek: 6,
      estimatedDailyProfitUsd: 425,
      startupCapitalUsd: 0,
      status: 'adopted_into_daily_routine',
    },
    {
      id: 'disc-way-2',
      discoveredDate: '2026-11-12',
      title: 'Zero-Touch Retainer Onboarding & Auto-Billing Link',
      methodCategory: 'Automation Template',
      whyEasierAndFaster:
        'Eliminates multi-day proposal back-and-forth by bundling scope, SLA, and recurring Bitcoin/card checkout into one pre-approved template.',
      executionShortcut:
        'Send 1-page pre-scoped retainer link -> auto-provision API workspace key -> collect day-1 milestone settlement.',
      estimatedHoursSavedPerWeek: 5,
      estimatedDailyProfitUsd: 360,
      startupCapitalUsd: 0,
      status: 'discovered',
    },
    {
      id: 'disc-way-3',
      discoveredDate: '2026-11-12',
      title: 'Compliance Invoice Anomaly Webhook Micro-Tool',
      methodCategory: 'AI Micro-Tool',
      whyEasierAndFaster:
        'Turns existing Gemini Vision extraction rules into a self-serve metered webhook endpoint so clients pay per batch without manual Jerry intervention.',
      executionShortcut:
        'Deploy reusable JSON validator schema -> charge $0.18/document overage automatically settled weekly.',
      estimatedHoursSavedPerWeek: 4,
      estimatedDailyProfitUsd: 340,
      startupCapitalUsd: 0,
      status: 'discovered',
    },
  ],
  activeCycleStep: 'authorize',
  interestTopics: ['AI startups', 'renewable energy stocks', 'e-commerce trends'],
  opportunityAlerts: [
    {
      id: 'alert-ai-vertical',
      interestTopic: 'AI startups',
      title: 'Vertical AI Agents for Compliance-Heavy SMB Back Offices',
      kind: 'Business',
      summary:
        'Mid-market customs brokers, clinics, and property managers are adopting specialized document-triage workflows rather than generic chat interfaces.',
      profitabilityAnalysis:
        'Estimated 75%–85% gross SaaS margins at $149–$399/month per account; low initial tooling spend (<$500) using existing APIs (estimate, not guaranteed).',
      riskAnalysis:
        'Moderate churn risk if extraction accuracy drops below 98%, plus strict client data-privacy compliance requirements.',
      estimatedCapitalUsd: 450,
      verifiedSources: [
        { title: 'FMCSA Freight Broker Operations Overview', uri: 'https://www.fmcsa.dot.gov' },
      ],
      nextAction: 'Launch 5-partner manual-assisted invoice reconciliation pilot.',
      status: 'new',
      createdAt: '2026-11-12T16:50:00Z',
    },
    {
      id: 'alert-grid-storage',
      interestTopic: 'renewable energy stocks',
      title: 'Utility-Scale Grid Storage & Transformer Infrastructure Suppliers',
      kind: 'Investment',
      summary:
        'AI data center load growth is creating multi-year backlogs for grid interconnects, high-voltage transformers, and utility battery storage integrators.',
      profitabilityAnalysis:
        'Multi-year contracted order backlogs support steadier cash-flow visibility than speculative early-stage hardware developers (estimate, not guaranteed).',
      riskAnalysis:
        'Elevated valuation multiples, interest-rate sensitivity on project financing, and supply-chain copper/component bottlenecks.',
      estimatedCapitalUsd: 1000,
      verifiedSources: [
        { title: 'U.S. EIA Electric Power Monthly', uri: 'https://www.eia.gov' },
      ],
      nextAction: 'Compile earnings backlog & debt-to-equity comparison across 4 grid equipment leaders.',
      status: 'new',
      createdAt: '2026-11-12T16:30:00Z',
    },
    {
      id: 'alert-ecom-b2b',
      interestTopic: 'e-commerce trends',
      title: 'Automated Post-Purchase Returns & Margin Recovery Tooling for Shopify Plus Brands',
      kind: 'Business',
      summary:
        'Rising return rates in apparel and home goods are pushing merchants toward exchange-first workflows and automated supplier defect claims.',
      profitabilityAnalysis:
        'Usage-based pricing (% of recovered margin or $199/mo base) can align ROI directly with merchant retention (estimate, not guaranteed).',
      riskAnalysis:
        'High app-store competition; requires differentiated ERP/3PL integration to avoid commoditization.',
      estimatedCapitalUsd: 600,
      verifiedSources: [],
      nextAction: 'Audit top 10 Shopify return apps to isolate an underserved 3PL reconciliation gap.',
      status: 'reviewed',
      createdAt: '2026-11-11T19:15:00Z',
    },
  ],
  ventures: [
    {
      id: 'ven-1',
      name: 'FreightLedger Reconciliation SaaS',
      stage: 'Pilot',
      monthlyRevenueUsd: 596,
      monthlyExpensesUsd: 90,
      activeCustomers: 4,
      businessPlanSummary: 'Automated carrier bill-of-lading & fuel-surcharge audit platform priced at $149/mo per logistics desk.',
      marketResearchSummary: '28,000+ US freight brokers face 6–12 min manual invoice reconciliation overhead per multi-stop shipment.',
      acquisitionChannel: 'Direct Broker Registry Outbound + Audit Offer',
      targetCacUsd: 150,
      estimatedLtvUsd: 2680,
      conversionRatePct: 14.5,
      projectedRoiPct: 650,
      projectedMonthlyProfitUsd: 585,
      linkedGoalId: 'goal-b2b-invoicing',
    },
    {
      id: 'ven-2',
      name: 'Document Extraction API Licenses',
      stage: 'Scaling',
      monthlyRevenueUsd: 1450,
      monthlyExpensesUsd: 185,
      activeCustomers: 11,
      businessPlanSummary: 'Usage-tiered structured JSON extraction API for boutique operations and accounting teams.',
      marketResearchSummary: 'Strong demand for schema-verified invoice & receipt parsing with <1% numeric variance.',
      acquisitionChannel: 'Technical Case Studies & Partner Referrals',
      targetCacUsd: 95,
      estimatedLtvUsd: 1950,
      conversionRatePct: 18.2,
      projectedRoiPct: 620,
      projectedMonthlyProfitUsd: 1147,
    },
    {
      id: 'ven-3',
      name: 'B2B Automation Advisory Retainers',
      stage: 'Active',
      monthlyRevenueUsd: 3200,
      monthlyExpensesUsd: 240,
      activeCustomers: 2,
      businessPlanSummary: 'High-margin workflow architecture retainers converting manual back-office bottlenecks into automated pipelines.',
      marketResearchSummary: 'SMB operators prefer fixed-scope 10-day diagnostics before committing to recurring retainers.',
      acquisitionChannel: 'Executive Network & Warm Diagnostic Pilots',
      targetCacUsd: 220,
      estimatedLtvUsd: 9600,
      conversionRatePct: 28.0,
      projectedRoiPct: 1100,
      projectedMonthlyProfitUsd: 2640,
    },
  ],
  salesReports: [
    {
      id: 'sr-1',
      period: '2026-09',
      ventureName: 'All Managed Ventures',
      dealsClosed: 3,
      pipelineValueUsd: 6400,
      closedRevenueUsd: 3820,
      expensesUsd: 490,
    },
    {
      id: 'sr-2',
      period: '2026-10',
      ventureName: 'All Managed Ventures',
      dealsClosed: 5,
      pipelineValueUsd: 9200,
      closedRevenueUsd: 4580,
      expensesUsd: 530,
    },
    {
      id: 'sr-3',
      period: '2026-11',
      ventureName: 'All Managed Ventures',
      dealsClosed: 6,
      pipelineValueUsd: 12450,
      closedRevenueUsd: 5246,
      expensesUsd: 515,
    },
  ],
  goals: [
    {
      id: 'goal-weekly-5k-minimum',
      title: 'Top Priority: Minimum $20,000/Month & $5,000/Week Profit Floor',
      strategy:
        'Prioritize high-margin B2B retainers, API licensing tiers, and recurring deliverable settlements so net portfolio profit clears at least $20,000 every month and $5,000 every single week ($240,000+/yr annualized floor) before allocating capital to speculative experiments.',
      category: 'Revenue',
      status: 'in_progress',
      origin: 'owner_assigned',
      createdAt: '2026-11-12T18:14:00Z',
      evaluation: {
        availableCapitalUsd: 1500,
        requiredSkills: 'Enterprise B2B sales, recurring SaaS fulfillment, margin & CAC discipline',
        weeklyHoursRequired: 12,
        technologyStack: 'Jerry Business, Jerry Wallet (Bitcoin), automated billing & extraction pipelines',
        marketDemandSummary: 'Retainers + metered API seats + high-ticket deliverables reliably stack monthly net cash flow above $20,000/month ($5,000+/week).',
        profitabilityPotential: 'Minimum floor: $20,000/month and $5,000/week net profit at >80% gross margin (target benchmark, not guaranteed).',
      },
      phases: [
        {
          id: 'phase-5k-1',
          title: 'Phase 1: Lock $20,000/Month & $5,000/Week Recurring Floor',
          milestones: [
            {
              id: 'ms-5k-1',
              title: 'Milestone 1.1: Stack Weekly & Monthly Retainer Pipeline',
              targetDate: '2026-11-26',
              tasks: [
                {
                  id: 't-5k-1',
                  title: 'Prioritize $20,000/Month ($5,000/Week) Net Profit Execution Queue',
                  subtasks: [
                    {
                      id: 'st-5k-1',
                      title: 'Close recurring B2B accounts and settle revenue milestones to Jerry Wallet',
                      actionSteps: [
                        {
                          id: 'step-5k-1',
                          title: 'Execute highest-margin client deliverables and track monthly ($20,000+) & weekly ($5,000+) net profit',
                          execution: {
                            tools: ['Command Hub', 'Tasks & Recovery', 'Jerry Wallet'],
                            resources: ['Active B2B pipeline', 'Bitcoin settlement address'],
                            instructions: 'Always rank tasks and business ventures by contribution toward the $20,000/month ($5,000/week) minimum profit floor.',
                            dependencies: ['None'],
                            deadline: '2026-11-22',
                            completionCheck: 'Monthly net profit clears $20,000+ and weekly net profit clears $5,000+ in Jerry Wallet.',
                            completed: false,
                          },
                        },
                        {
                          id: 'step-5k-2',
                          title: 'Expand recurring SaaS & Extraction API seats to lock baseline $5,000/week run-rate',
                          execution: {
                            tools: ['Jerry Business', 'Opportunity Radar'],
                            resources: ['Account conversion playbooks', 'Usage billing ledger'],
                            instructions: 'Convert pilot accounts onto annual or auto-renewing monthly retainers prioritizing >80% gross margin.',
                            dependencies: ['step-5k-1'],
                            deadline: '2026-11-26',
                            completionCheck: 'Recurring run-rate contributes at least $5,000/week ($20,000/month) across active ventures.',
                            completed: false,
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'goal-b2b-invoicing',
      title: 'Launch Automated B2B Compliance & Invoice Reconciliation Micro-SaaS',
      strategy:
        'Target mid-market logistics agencies with an automated PDF-to-ledger reconciliation workflow priced at $149/month per seat, leveraging founder-led outreach and zero-inventory SaaS margins.',
      category: 'Revenue',
      status: 'in_progress',
      origin: 'jerry_recommended',
      createdAt: '2026-11-04T09:30:00Z',
      evaluation: {
        availableCapitalUsd: 1500,
        requiredSkills: 'TypeScript, OCR/Vision APIs, B2B outbound sales',
        weeklyHoursRequired: 12,
        technologyStack: 'Node.js, Gemini Vision document extraction, Stripe / USD invoicing',
        marketDemandSummary: 'High recurring pain point for freight brokers processing 400+ weekly carrier invoices.',
        profitabilityPotential: 'Estimated $4,500–$9,000/mo gross revenue at 82% margin after 90 days (estimate).',
      },
      phases: [
        {
          id: 'phase-1',
          title: 'Phase 1: Market Validation & Technical Prototype',
          milestones: [
            {
              id: 'ms-1',
              title: 'Milestone 1.1: Confirm 10 Qualified Design Partners',
              targetDate: '2026-11-24',
              tasks: [
                {
                  id: 't-node-1',
                  title: 'Build Verified Freight Broker Prospect List',
                  subtasks: [
                    {
                      id: 'st-1',
                      title: 'Extract and qualify 50 active regional logistics operators',
                      actionSteps: [
                        {
                          id: 'step-1',
                          title: 'Query public FMCSA broker registry and filter 10–50 truck fleets',
                          execution: {
                            tools: ['Public Registry Parser', 'Jerry Business Research'],
                            resources: ['FMCSA Open Dataset', 'CRM Sheet'],
                            instructions: 'Filter active licensed brokers in target corridor with verified ops email.',
                            dependencies: ['None'],
                            deadline: '2026-11-15',
                            completionCheck: '50 validated broker records saved to prospect ledger.',
                            completed: true,
                          },
                        },
                        {
                          id: 'step-2',
                          title: 'Draft personalized 3-line audit offer highlighting invoice mismatch savings',
                          execution: {
                            tools: ['Jerry Brain', 'Email Draft Engine'],
                            resources: ['Case benchmark template'],
                            instructions: 'Prepare non-spammy outreach drafts for owner review prior to sending.',
                            dependencies: ['step-1'],
                            deadline: '2026-11-18',
                            completionCheck: '15 personalized drafts queued and approved.',
                            completed: true,
                          },
                        },
                      ],
                    },
                  ],
                },
                {
                  id: 't-node-2',
                  title: 'Validate Extraction Accuracy on Real Invoices',
                  subtasks: [
                    {
                      id: 'st-2',
                      title: 'Benchmark Jerry Vision OCR against 25 sample bills of lading',
                      actionSteps: [
                        {
                          id: 'step-3',
                          title: 'Run structured JSON extraction on sample quarterly & carrier documents',
                          execution: {
                            tools: ['Jerry Vision', 'Node Validation Runner'],
                            resources: ['Sample PDF & PNG invoice corpus'],
                            instructions: 'Verify line-item totals, tax rates, and currency parsing with <1% error.',
                            dependencies: ['None'],
                            deadline: '2026-11-21',
                            completionCheck: 'Accuracy report shows >= 99% numeric extraction accuracy.',
                            completed: false,
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          id: 'phase-2',
          title: 'Phase 2: Production Billing & Automated Onboarding',
          milestones: [
            {
              id: 'ms-2',
              title: 'Milestone 2.1: Activate Recurring Revenue Collection',
              targetDate: '2026-12-10',
              tasks: [
                {
                  id: 't-node-3',
                  title: 'Configure Automated USD & Card Settlement Pipeline',
                  subtasks: [
                    {
                      id: 'st-3',
                      title: 'Connect business revenue ledger to Jerry Wallet treasury',
                      actionSteps: [
                        {
                          id: 'step-4',
                          title: 'Verify Bitcoin merchant receiving address and webhook reconciliation',
                          execution: {
                            tools: ['Jerry Wallet', 'Webhook Verifier'],
                            resources: ['Bitcoin verification API', 'Treasury Address'],
                            instructions: 'Confirm incoming USD test transfer reconciles cleanly into Income Streams.',
                            dependencies: ['step-3'],
                            deadline: '2026-12-05',
                            completionCheck: 'Test invoice marked Paid and reflected in Unified Financial Dashboard.',
                            completed: false,
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'goal-workflow-automation',
      title: 'Automate Digital Asset Treasury Rebalancing & Yield Reporting',
      strategy:
        'Consolidate multi-wallet revenue tracking across Built-in Jerry Wallet and Jerry Built-in/Jerry Built-in into automated weekly P&L summaries with strict human approval on all outgoing moves.',
      category: 'Automation',
      status: 'authorized',
      origin: 'collaborative',
      createdAt: '2026-11-08T14:15:00Z',
      evaluation: {
        availableCapitalUsd: 500,
        requiredSkills: 'Portfolio accounting, on-chain read-only indexing',
        weeklyHoursRequired: 3,
        technologyStack: 'Read-only RPC balance watchers, CSV/JSON financial reporting',
        marketDemandSummary: 'Internal operational multiplier saving ~4 hours/week in manual bookkeeping.',
        profitabilityPotential: 'Preserves capital via fee minimization and zero-custody-leak alerts.',
      },
      phases: [
        {
          id: 'phase-w1',
          title: 'Phase 1: Read-Only Aggregation & Alerting',
          milestones: [
            {
              id: 'ms-w1',
              title: 'Milestone 1.1: Unified Portfolio Feed Live',
              targetDate: '2026-11-28',
              tasks: [
                {
                  id: 't-w1',
                  title: 'Sync Jerry Built-in & Bitcoin Balances',
                  subtasks: [
                    {
                      id: 'st-w1',
                      title: 'Configure address watchlists without exposing private keys',
                      actionSteps: [
                        {
                          id: 'step-w1',
                          title: 'Verify public address checksums across BTC',
                          execution: {
                            tools: ['Jerry Wallet'],
                            resources: ['Public wallet addresses'],
                            instructions: 'Read balances exclusively via public addresses; never request seed phrases.',
                            dependencies: ['None'],
                            deadline: '2026-11-19',
                            completionCheck: 'All 4 supported assets display accurate live USD valuations.',
                            completed: true,
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'goal-daily-1k-profit',
      title: 'Reach & Sustain $1,000/Day Portfolio Profit Threshold',
      strategy:
        'Scale recurring B2B automation retainers, usage-based extraction APIs, and daily revenue task settlements to achieve $1,000 net profit per day ($30,000/month equivalent) across the Jerry Business and Jerry Wallet portfolio.',
      category: 'Revenue',
      status: 'in_progress',
      origin: 'collaborative',
      createdAt: '2026-11-12T18:00:00Z',
      evaluation: {
        availableCapitalUsd: 1500,
        requiredSkills: 'B2B outbound conversion, SaaS pricing optimization, automated task fulfillment',
        weeklyHoursRequired: 10,
        technologyStack: 'Jerry Business, Jerry Wallet (Bitcoin), automated billing & extraction pipelines',
        marketDemandSummary: 'Stacking 10–12 B2B retainers plus 40+ SaaS seats closes the gap to $1,000/day net profit.',
        profitabilityPotential: 'Target: $1,000/day ($30,000/mo) net portfolio profit with >80% operating margin (goal target, not guaranteed).',
      },
      phases: [
        {
          id: 'phase-1k-1',
          title: 'Phase 1: Expand Daily Revenue Run-Rate to $500/Day',
          milestones: [
            {
              id: 'ms-1k-1',
              title: 'Milestone 1.1: Convert Pilot Cohort & Queue High-Value Deliverables',
              targetDate: '2026-11-30',
              tasks: [
                {
                  id: 't-1k-1',
                  title: 'Close 3 Additional B2B Advisory & Reconciliation Accounts',
                  subtasks: [
                    {
                      id: 'st-1k-1',
                      title: 'Execute daily client deliverables and settle USD invoices to Jerry Wallet',
                      actionSteps: [
                        {
                          id: 'step-1k-1',
                          title: 'Deliver carrier variance audits and record daily settlements toward the $1,000/day portfolio goal',
                          execution: {
                            tools: ['Tasks & Recovery', 'Jerry Wallet', 'Jerry Business'],
                            resources: ['Active pilot prospects', 'Bitcoin settlement address'],
                            instructions: 'Prioritize recurring contracts and same-day deliverable settlements above $250/day net contribution.',
                            dependencies: ['None'],
                            deadline: '2026-11-25',
                            completionCheck: 'Daily portfolio profit progress crosses 50% ($500/day) in Jerry Wallet.',
                            completed: false,
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
  tasks: [
    {
      id: 'task-daily-100',
      goalId: 'goal-daily-1k-profit',
      title: 'Top-Most Priority Daily Task: Generate & Save $1,000+ Minimum Net Profit (Non-Investment Reserve)',
      description: 'Execute daily zero-investment B2B retainer, freight variance audit, workflow monitoring, and API settlement batch ($1,125 total net profit) and save 100% into Portfolio Profit Reserve separate from investment capital.',
      category: 'operations',
      status: 'running',
      idempotencyKey: 'daily-1k-profit:recurring-reserve-routine',
      attempts: 1,
      lastCheckpoint: 'Ready to execute daily $1,125 non-investment deliverable bundle and sweep profit into Bitcoin Profit Reserve.',
      requiresApproval: false,
      financialImpactUsd: 0,
      expectedRevenueUsd: 1125,
      backgroundEligible: true,
      updatedAt: '2026-11-12T18:17:00Z',
    },
    {
      id: 'task-101',
      goalId: 'goal-b2b-invoicing',
      title: 'Compile competitor pricing matrix across 6 logistics SaaS tools',
      description: 'Autonomous background research comparing per-seat pricing, OCR limits, and onboarding friction.',
      category: 'research',
      status: 'running',
      idempotencyKey: 'goal-b2b-invoicing:compile-competitor-pricing',
      attempts: 1,
      lastCheckpoint: '4 of 6 competitor pricing pages parsed and normalized.',
      requiresApproval: false,
      financialImpactUsd: 0,
      backgroundEligible: true,
      updatedAt: '2026-11-12T16:40:00Z',
    },
    {
      id: 'task-102',
      goalId: 'goal-b2b-invoicing',
      title: 'Resume carrier invoice benchmark batch after network timeout',
      description: 'Interrupted during batch #3 document parsing; safe to resume via idempotency checkpoint.',
      category: 'operations',
      status: 'interrupted',
      idempotencyKey: 'goal-b2b-invoicing:carrier-invoice-benchmark',
      attempts: 1,
      lastCheckpoint: 'Saved 16/25 parsed invoices before transient timeout at batch #3.',
      requiresApproval: false,
      financialImpactUsd: 0,
      backgroundEligible: true,
      updatedAt: '2026-11-12T15:55:00Z',
    },
    {
      id: 'task-103',
      goalId: 'goal-b2b-invoicing',
      title: 'Authorize $600 initial LinkedIn & industry newsletter sponsorship deposit',
      description: 'Targeted pilot acquisition test for logistics operations directors.',
      category: 'financial',
      status: 'awaiting_approval',
      idempotencyKey: 'goal-b2b-invoicing:sponsorship-deposit-600',
      attempts: 0,
      lastCheckpoint: 'Paused at owner authorization gate prior to payment commitment.',
      requiresApproval: true,
      approvalReason: 'Financial commitment ($600) exceeds autonomous threshold ($250).',
      financialImpactUsd: 600,
      backgroundEligible: false,
      updatedAt: '2026-11-12T14:20:00Z',
    },
    {
      id: 'task-104',
      goalId: 'goal-workflow-automation',
      title: 'Generate weekly multi-stream P&L ledger snapshot',
      description: 'Reconcile consulting retainer, digital product sales, and treasury gas fees.',
      category: 'operations',
      status: 'completed',
      idempotencyKey: 'goal-workflow-automation:weekly-pnl-snapshot',
      attempts: 1,
      lastCheckpoint: 'Completed cleanly and archived to Jerry Memory.',
      requiresApproval: false,
      financialImpactUsd: 0,
      backgroundEligible: true,
      updatedAt: '2026-11-11T18:00:00Z',
    },
  ],
  proactiveDiscussions: [
    {
      id: 'disc-1',
      topic: 'High-Margin Add-On Opportunity: Automated Fuel Surcharge Auditing',
      triggerType: 'opportunity',
      summary:
        'While analyzing competitor logistics tools, I noticed 4 of 6 platforms omit automated fuel-surcharge variance checks. Adding this check to our invoice reconciliation prototype increases perceived ROI without extra infrastructure cost.',
      recommendation:
        'Add a Level-5 task to Phase 1 Milestone 1.1 to include fuel surcharge variance rules before next week’s design partner demos.',
      status: 'awaiting_response',
      createdAt: '2026-11-12T17:10:00Z',
    },
    {
      id: 'disc-2',
      topic: 'Interrupted Benchmark Batch Ready for Safe Recovery',
      triggerType: 'problem_alert',
      summary:
        'The carrier invoice benchmark batch paused at 16/25 documents due to an upstream timeout. Idempotency guards confirm zero duplicate rows were written.',
      recommendation:
        'Approve background resumption in Tasks & Recovery to complete the remaining 9 documents.',
      status: 'awaiting_response',
      createdAt: '2026-11-12T16:05:00Z',
    },
  ],
  opportunities: [
    {
      id: 'opp-1',
      title: 'Automated Freight & Carrier Invoice Reconciliation SaaS',
      sector: 'B2B Logistics Automation',
      startupCostUsd: 1200,
      marketDemand: 'High',
      competition: 'Moderate',
      estimatedMonthlyReturn: '$4,500–$9,000/mo within 90 days (estimate, not guaranteed)',
      riskLevel: 'Low',
      evidenceType: 'Verified Market Data',
      verifiedFacts: [
        'Public FMCSA registry lists over 28,000 active US freight brokers.',
        'Manual invoice matching typically requires 6–12 minutes per multi-stop bill of lading.',
      ],
      estimatesAndAssumptions: [
        'Assumes 30–60 paying accounts at $149/month after 90 days of outbound demos.',
        'Assumes <2% monthly churn once integrated into weekly carrier settlements.',
      ],
      legalAndEthicalNotes:
        'Requires strict SOC-style tenant isolation, data encryption at rest, and explicit customer consent for uploaded financial documents. Zero scraping of restricted private portals.',
      saferAlternative: 'Start with a concierge manual-assisted audit for 5 pilot brokers before building full ERP integrations.',
      status: 'active',
    },
    {
      id: 'opp-2',
      title: 'AI Workflow & Telemetry Audit Retainers for Boutique Accounting Firms',
      sector: 'B2B Advisory & Automation',
      startupCostUsd: 350,
      marketDemand: 'Moderate',
      competition: 'Low',
      estimatedMonthlyReturn: '$2,500–$6,000/mo on 2–4 retainers (estimate)',
      riskLevel: 'Low',
      evidenceType: 'Model Estimate',
      verifiedFacts: [
        'Regional accounting firms face seasonal capacity crunches during quarterly closes.',
      ],
      estimatesAndAssumptions: [
        'Estimated $1,500/month retainer per firm based on 15 hours/week owner + Jerry research leverage.',
      ],
      legalAndEthicalNotes:
        'Must clearly disclaim non-CPA status and restrict automation to document organization and data preparation.',
      saferAlternative: 'Offer a fixed-scope $750 10-day workflow diagnostic before proposing recurring retainers.',
      status: 'recommended',
    },
    {
      id: 'opp-3',
      title: 'Automated Cross-Exchange Arbitrage Relay Bot',
      sector: 'Algorithmic Digital Assets',
      startupCostUsd: 8500,
      marketDemand: 'Emerging',
      competition: 'High',
      estimatedMonthlyReturn: 'Highly volatile; -12% to +8% monthly variance (estimate)',
      riskLevel: 'Elevated',
      evidenceType: 'Model Estimate',
      verifiedFacts: [
        'On-chain latency and MEV competition compress retail arbitrage spreads below gas/fee thresholds.',
      ],
      estimatesAndAssumptions: [
        'Historical spreads frequently invert during high-volatility gas spikes.',
      ],
      legalAndEthicalNotes:
        'High capital exposure, smart-contract execution risk, and potential jurisdictional tax reporting complexity.',
      saferAlternative: 'Keep treasury reserves in low-risk BTC self-custody and allocate growth capital to cash-flowing B2B software.',
      status: 'declined',
    },
  ],
  incomeStreams: [
    {
      id: 'stream-1',
      name: 'B2B Automation Advisory Retainers',
      channel: 'Direct Enterprise Clients',
      monthlyRevenueUsd: 3200,
      monthlyExpenseUsd: 240,
      automationLevel: 'Semi-Automated',
      status: 'active',
    },
    {
      id: 'stream-2',
      name: 'Document Extraction API Licenses',
      channel: 'Self-Serve SaaS',
      monthlyRevenueUsd: 1450,
      monthlyExpenseUsd: 185,
      automationLevel: 'Automated',
      status: 'scaling',
    },
    {
      id: 'stream-3',
      name: 'Freight Reconciliation Pilot Cohort',
      channel: 'Design Partner Subscriptions',
      monthlyRevenueUsd: 596,
      monthlyExpenseUsd: 90,
      automationLevel: 'Semi-Automated',
      status: 'pilot',
    },
  ],
  walletAssets: [
    {
      id: 'asset-btc',
      symbol: 'BTC',
      network: 'Bitcoin Mainnet',
      balance: 0.145,
      usdPrice: 88400,
      source: 'Jerry Built-in',
      address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
    },
  ],
  externalWallets: [],
  transactions: [],
  messages: [
    {
      id: 'msg-1',
      role: 'jerry',
      mode: 'proactive',
      content:
        'Good evening. I have completed the initial scan of 50 regional freight brokers and drafted 15 tailored audit invitations. Before I authorize any paid distribution, two items need your decision: a $600 newsletter sponsorship deposit in Tasks & Recovery, and my recommendation to add fuel-surcharge variance checks to Phase 1.',
      timestamp: '2026-11-12T17:12:00Z',
      modelUsed: 'Jerry Brain',
    },
  ],
  visionHistory: [
    {
      id: 'vis-1',
      title: 'CloudTech Inc. — Q3 Revenue & Opex Summary',
      imageUrl: '/src/assets/images/vision_sample_document_1794533353073.jpg',
      prompt: 'Extract MRR, ARR, NRR, and flag operating expense variance risks.',
      analysis:
        'MRR stands at $485,250 (+31.4% YoY) with $5.82M ARR and 109.8% NRR. Total Opex is $1,050,100 (81.3% of revenue), led by Sales & Marketing at $388,400 (+1.8% vs Q2). Net income is $193,800 (15.0% margin).',
      extractedActions: [
        'Investigate +1.8% QoQ Sales & Marketing variance against CAC payback.',
        'Benchmark COGS reduction (-2.1% vs Q2) for replication in our SaaS unit economics.',
      ],
      timestamp: '2026-11-12T13:40:00Z',
    },
  ],
  memories: [
    {
      id: 'mem-1',
      category: 'preference',
      title: 'Financial Commitment Autonomy Cap ($250)',
      content:
        'Owner requires explicit approval before any payment, transfer, sponsorship, or contract exceeding $250, regardless of expected ROI.',
      outcome: 'insight',
      tags: ['governance', 'wallet', 'approval'],
      createdAt: '2026-11-01T10:00:00Z',
    },
    {
      id: 'mem-2',
      category: 'lesson',
      title: 'Always Verify Invoice Math via Structured Schema Before Client Delivery',
      content:
        'During early OCR tests, unstructured prose extraction occasionally misread multi-page subtotals. Enforcing strict JSON schema validation eliminated subtotal drift.',
      outcome: 'correction',
      tags: ['vision', 'ocr', 'quality'],
      createdAt: '2026-11-06T15:20:00Z',
    },
    {
      id: 'mem-3',
      category: 'decision',
      title: 'Declined High-Frequency Arbitrage Bot in Favor of B2B Cash Flow',
      content:
        'Evaluated MEV competition and gas spike exposure; decided to keep digital assets in self-custody while building recurring B2B SaaS revenue.',
      outcome: 'success',
      tags: ['strategy', 'risk', 'business'],
      createdAt: '2026-11-09T11:45:00Z',
    },
    {
      id: 'mem-4',
      category: 'workflow',
      title: 'Idempotent Batch Checkpointing for Background Tasks',
      content:
        'Long research batches save progress every 5 items with deterministic idempotency keys so interruptions never duplicate outreach or ledger entries.',
      outcome: 'success',
      tags: ['tasks', 'recovery', 'automation'],
      createdAt: '2026-11-11T09:10:00Z',
    },
    {
      id: 'mem-10',
      category: 'lesson',
      title: 'Internet Authority Growth: Programmatic SEO, Shareable Web Tools & API Distribution',
      content:
        'Jerry studies search distribution, viral product loops, and developer API adoption every day so digital reach and organic inbound revenue outpace the previous day.',
      outcome: 'insight',
      tags: ['internet-growth', 'seo', 'distribution'],
      createdAt: '2026-11-12T18:37:00Z',
    },
    {
      id: 'mem-9',
      category: 'lesson',
      title: 'Human Understanding Evolution: Clarity, Empathy & Zero-Risk Framing',
      content:
        'Jerry studies human decision friction and owner communication preferences daily—leading with hours saved, clear fact/estimate separation, and calm executive conciseness to understand humans better each day than the previous day.',
      outcome: 'insight',
      tags: ['human-understanding', 'psychology', 'communication'],
      createdAt: '2026-11-12T18:34:00Z',
    },
    {
      id: 'mem-8',
      category: 'workflow',
      title: 'Continuous Daily Learning: Find Easier & Faster Ways to Make Money Each Day',
      content:
        'Jerry researches and stores new automation templates, productized workflows, and low-friction monetization shortcuts every day to raise profit velocity while reducing manual hours.',
      outcome: 'insight',
      tags: ['daily-learning', 'automation', 'profit-velocity'],
      createdAt: '2026-11-12T18:29:00Z',
    },
    {
      id: 'mem-7',
      category: 'goal',
      title: 'Top-Most Priority Daily Task: Save $1,000+ Daily Profit Outside Investment Principal',
      content:
        'Jerry carries out a daily zero-capital-risk B2B and SaaS deliverable routine generating $1,000+ net profit each day, saved directly into our Bitcoin Saved Profit Reserve and never mixed with invested principal.',
      outcome: 'insight',
      tags: ['top-priority', 'daily-profit', 'profit-reserve', 'non-investment'],
      createdAt: '2026-11-12T18:17:00Z',
    },
    {
      id: 'mem-6',
      category: 'goal',
      title: 'Top Priority Mandate: Minimum $20,000/Month & $5,000/Week Profit',
      content:
        'Owner designated generating at least $20,000/month and $5,000/week in net profit every month and week as Jerry’s top-priority task across all business ventures, task queues, and portfolio allocations.',
      outcome: 'insight',
      tags: ['top-priority', 'monthly-profit', 'weekly-profit', 'portfolio'],
      createdAt: '2026-11-12T18:15:00Z',
    },
    {
      id: 'mem-5',
      category: 'goal',
      title: 'Portfolio Daily Profit Threshold Goal ($1,000/Day)',
      content:
        'Jerry tracks combined daily portfolio net profit run-rate plus same-day task settlements against a $1,000/day ($30,000/month) benchmark.',
      outcome: 'insight',
      tags: ['portfolio', 'profit-goal', 'revenue'],
      createdAt: '2026-11-12T18:00:00Z',
    },
  ],
  phoneIntegrations: [
    {
      id: 'phone-apps',
      area: 'Applications & Navigation',
      capabilities: 'Open and navigate supported productivity, finance, and messaging apps.',
      accessTier: 'Standard Permission',
      enabled: true,
      securityImplication: 'Scoped to explicitly allowlisted package names; cannot inspect banking PIN screens.',
    },
    {
      id: 'phone-messages',
      area: 'Messages & Calls',
      capabilities: 'Read permitted threads, draft replies, and prepare calls with contacts.',
      accessTier: 'Standard Permission',
      enabled: true,
      securityImplication: 'Outgoing messages and calls require draft confirmation unless contact is whitelisted.',
    },
    {
      id: 'phone-calendar',
      area: 'Calendar, Reminders & Files',
      capabilities: 'Schedule appointments, manage project reminders, and organize workspace documents.',
      accessTier: 'Standard Permission',
      enabled: true,
      securityImplication: 'Restricted to designated Jerry workspace folders and authorized calendars.',
    },
    {
      id: 'phone-accessibility',
      area: 'Android Accessibility & Default Assistant',
      capabilities: 'Cross-app UI automation and hands-free system-wide voice invocation.',
      accessTier: 'Advanced Access',
      enabled: false,
      securityImplication:
        'Accessibility Services can observe on-screen text; enable only for trusted workflows. Never enable over password or wallet seed prompts.',
    },
    {
      id: 'phone-adb-root',
      area: 'ADB, Device Owner & Custom Build Controls',
      capabilities: 'Deep enterprise policy automation and persistent background execution exemptions.',
      accessTier: 'Advanced Access',
      enabled: false,
      securityImplication:
        'Device Owner or Root access alters OS security boundaries, may void manufacturer warranty, and requires explicit hardware owner confirmation.',
    },
  ],
  selfUpgrades: [
    {
      id: 'upg-seed-1',
      prompt: 'Build a Python fuel-surcharge variance detector for carrier bills of lading.',
      language: 'Python',
      targetModule: 'Jerry Business',
      title: 'Carrier Fuel Surcharge Variance Calculator',
      summary: 'Checks billed diesel surcharge percentages against DOE regional index thresholds and flags overbillings above 2.5%.',
      code: `def detect_fuel_variance(billed_pct: float, benchmark_pct: float, base_freight_usd: float) -> dict:\n    variance_pct = round(billed_pct - benchmark_pct, 2)\n    overcharge_usd = round(max(0.0, (variance_pct / 100.0) * base_freight_usd), 2)\n    return {\n        "flagged": variance_pct > 2.5,\n        "variance_pct": variance_pct,\n        "recoverable_usd": overcharge_usd,\n    }`,
      testCode: `assert detect_fuel_variance(24.0, 19.5, 2000.0)["flagged"] is True\nassert detect_fuel_variance(24.0, 19.5, 2000.0)["recoverable_usd"] == 90.0\nassert detect_fuel_variance(20.0, 19.5, 2000.0)["flagged"] is False`,
      securityAuditPassed: true,
      securityAuditNotes: 'Pure calculation module; zero external network writes or security policy modifications.',
      testStatus: 'passed',
      testReport: '3/3 deterministic assertions verified; security policy invariants preserved.',
      approvalStatus: 'awaiting_permission',
      createdAt: '2026-11-12T15:30:00Z',
    },
  ],
};
