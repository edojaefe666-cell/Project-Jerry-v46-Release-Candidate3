/** Product Engineering Engine: turns a product idea into a verifiable delivery plan.
 * This module plans and governs work; it does not claim to generate, deploy, or run a product.
 */
export type WorkStatus = 'planned' | 'in_progress' | 'blocked' | 'completed';
export type ProductStage = 'discovery' | 'requirements' | 'architecture' | 'design' | 'implementation' | 'verification' | 'release' | 'operations';
export type ApprovalGate = 'production_deployment' | 'paid_service' | 'external_purchase' | 'sensitive_data_access';
export type ProjectMode = 'new' | 'existing';
export type ExistingProjectSource = 'local_folder' | 'git_repository' | 'uploaded_archive' | 'remote_repository';

export interface ExistingProjectContext {
  source: ExistingProjectSource;
  /** A user-selected workspace label or repository URL; never treated as a trusted filesystem path. */
  sourceReference: string;
  primaryLanguage?: string;
  frameworks?: string[];
  knownBuildCommand?: string;
  knownTestCommand?: string;
  baselineCommit?: string;
  ownerConfirmedAccess: boolean;
}

export interface ProductTask {
  id: string;
  title: string;
  stage: ProductStage;
  description: string;
  status: WorkStatus;
  dependsOn: string[];
  evidenceRequired: string[];
  evidence: string[];
}
export interface ProductProject {
  id: string;
  name: string;
  idea: string;
  mode: ProjectMode;
  existingProject?: ExistingProjectContext;
  createdAt: string;
  status: 'planning' | 'building' | 'verification' | 'release_ready' | 'blocked' | 'released';
  targetPlatforms: string[];
  tasks: ProductTask[];
  approvalsRequired: ApprovalGate[];
  deploymentAuthorized: boolean;
  actualDeploymentAt?: string;
}

const task = (id: string, title: string, stage: ProductStage, description: string, dependsOn: string[] = [], evidenceRequired: string[] = ['owner-reviewed completion evidence']): ProductTask => ({ id, title, stage, description, status: 'planned', dependsOn, evidenceRequired, evidence: [] });

/** Creates an end-to-end delivery plan from an idea without inventing requirements or claiming execution. */
export function createProductProject(input: { idea: string; name?: string; targetPlatforms?: string[]; now?: string; mode?: ProjectMode; existingProject?: ExistingProjectContext }): ProductProject {
  const idea = input.idea.trim();
  if (idea.length < 12) throw new Error('Describe the product idea in at least 12 characters.');
  if (idea.length > 5000) throw new Error('Product idea must be 5,000 characters or fewer.');
  const id = `product-${(input.now ?? new Date().toISOString()).replace(/[^0-9]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 8)}`;
  const name = (input.name?.trim() || idea.split(/[.!?\n]/)[0].slice(0, 80)).trim();
  const mode = input.mode ?? 'new';
  if (mode === 'existing') {
    if (!input.existingProject?.sourceReference?.trim()) throw new Error('Existing projects require a source reference.');
    const validation = validateExistingProjectContext(input.existingProject);
    if (!validation.valid) throw new Error(validation.errors.join(' '));
  } else if (input.existingProject) {
    throw new Error('Existing-project context is only valid when mode is existing.');
  }
  const tasks = mode === 'existing' ? [
    task('discovery', 'Inventory the existing application', 'discovery', 'Identify repository structure, languages, frameworks, entry points, package manifests, build/test commands and deployment configuration. Do not execute project scripts during passive inventory.'),
    task('baseline', 'Establish a verified baseline', 'discovery', 'Run only owner-approved, non-destructive baseline checks in an isolated workspace; record current build/test results, git state and known defects.', ['discovery'], ['baseline report, command logs and source revision']),
    task('requirements', 'Define requested changes and acceptance criteria', 'requirements', 'Understand the requested outcome, preserve existing behaviour, identify compatibility constraints and define acceptance criteria.', ['baseline'], ['approved change specification and acceptance criteria']),
    task('architecture', 'Assess architecture and change impact', 'architecture', 'Map affected modules, dependencies, data contracts, migrations, integrations and rollback boundaries.', ['requirements'], ['impact analysis, architecture decision record and threat model']),
    task('design', 'Design compatible changes', 'design', 'Plan interface and interaction changes that fit the existing product, including accessibility and regression considerations.', ['requirements','architecture'], ['reviewable design and compatibility specifications']),
    task('implementation', 'Implement changes in an isolated branch', 'implementation', 'Modify the existing application without overwriting the source; use an isolated branch or copied workspace, preserve unrelated behaviour and document changed files.', ['architecture','design'], ['diff, branch/revision and setup instructions']),
    task('testing', 'Run regression and acceptance tests', 'verification', 'Run existing tests plus targeted regression, integration, accessibility and acceptance tests; compare against baseline.', ['implementation'], ['before/after test results and defect disposition']),
    task('security', 'Review changed and inherited security boundaries', 'verification', 'Review changed code, dependencies, authentication, authorization, secrets, data handling and regressions.', ['implementation'], ['security review and resolved critical/high findings']),
    task('release', 'Prepare a reversible update', 'release', 'Prepare a reproducible patch/release candidate, migration and rollback plan, documentation and deployment checklist; do not deploy.', ['testing','security'], ['reviewable patch, reproducible build and rollback checklist']),
    task('operations', 'Plan post-change monitoring and maintenance', 'operations', 'Define health checks, logs, backups, incident response, maintenance and post-release verification.', ['release'], ['operations and recovery runbook']),
  ] : [
    task('discovery', 'Validate the problem and intended users', 'discovery', 'Identify users, pain points, alternatives, assumptions and measurable success criteria.'),
    task('requirements', 'Create a reviewed product requirements specification', 'requirements', 'Define user journeys, functional and non-functional requirements, accessibility, privacy and acceptance criteria.', ['discovery'], ['approved requirements and acceptance criteria']),
    task('architecture', 'Design the system architecture and technology choices', 'architecture', 'Select suitable stack, interfaces, data model, integrations, hosting assumptions and threat boundaries.', ['requirements'], ['architecture decision record and threat model']),
    task('design', 'Design the user experience and interface', 'design', 'Create navigation, responsive layouts, interaction states and accessible design specifications.', ['requirements','architecture'], ['reviewable design and interaction specifications']),
    task('implementation', 'Implement the product in an isolated workspace', 'implementation', 'Build frontend, backend, data layer and integrations with version control and reproducible setup.', ['architecture','design'], ['source changes, setup instructions and dependency manifest']),
    task('testing', 'Run automated and manual verification', 'verification', 'Test acceptance criteria, edge cases, accessibility, performance and supported platform behaviour.', ['implementation'], ['test results and defect disposition']),
    task('security', 'Complete security and privacy review', 'verification', 'Review authentication, authorization, secrets, data handling, dependencies and abuse cases.', ['implementation'], ['security review and resolved critical/high findings']),
    task('release', 'Prepare a reproducible release candidate', 'release', 'Build artifacts, migration/rollback plan, documentation and deployment checklist; do not deploy.', ['testing','security'], ['reproducible build and release checklist']),
    task('operations', 'Prepare monitoring, support and improvement plan', 'operations', 'Define health checks, logs, backups, incident response, maintenance and feedback loops.', ['release'], ['operations and recovery runbook']),
  ];
  return { id, name, idea, mode, ...(mode === 'existing' ? { existingProject: { ...input.existingProject!, frameworks: [...(input.existingProject!.frameworks ?? [])] } } : {}), createdAt: input.now ?? new Date().toISOString(), status: 'planning', targetPlatforms: [...new Set((input.targetPlatforms ?? ['web']).map(x => x.trim().toLowerCase()).filter(Boolean))], tasks, approvalsRequired: ['production_deployment','paid_service','external_purchase','sensitive_data_access'], deploymentAuthorized: false };
}

/** Validate an existing-project source descriptor without trusting it as a filesystem path. */
export function validateExistingProjectContext(context: ExistingProjectContext): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const reference = context.sourceReference.trim();
  if (!reference) errors.push('Source reference is required.');
  if (reference.length > 2000) errors.push('Source reference must be 2,000 characters or fewer.');
  if (!context.ownerConfirmedAccess) errors.push('Owner confirmation is required.');
  if (context.source === 'remote_repository' || context.source === 'git_repository') {
    if (!/^https:\/\//i.test(reference) && !/^ssh:\/\//i.test(reference) && !/^git@[^:]+:.+/.test(reference)) errors.push('Repository references must use HTTPS or an SSH Git URL.');
  }
  if (context.baselineCommit && !/^[a-f0-9]{7,64}$/i.test(context.baselineCommit)) errors.push('Baseline commit must be a hexadecimal Git revision.');
  return { valid: errors.length === 0, errors };
}

/** Records evidence-backed progress. Dependencies must be completed before work can start. */
export function updateProductTask(project: ProductProject, taskId: string, status: WorkStatus, evidence: string[] = []): ProductProject {
  const target = project.tasks.find(item => item.id === taskId);
  if (!target) throw new Error('Product task not found.');
  if (status === 'in_progress' || status === 'completed') {
    const unmet = target.dependsOn.filter(id => project.tasks.find(item => item.id === id)?.status !== 'completed');
    if (unmet.length) throw new Error(`Dependencies are not complete: ${unmet.join(', ')}`);
  }
  if (status === 'completed') {
    const cleanEvidence = evidence.map(item => item.trim()).filter(Boolean);
    if (!cleanEvidence.length) throw new Error('Completion requires recorded evidence.');
    target.evidence = [...new Set([...target.evidence, ...cleanEvidence])];
  }
  target.status = status;
  project.status = project.tasks.every(item => item.status === 'completed') ? 'release_ready' : project.tasks.some(item => item.status === 'blocked') ? 'blocked' : project.tasks.some(item => item.status === 'in_progress' || item.status === 'completed') ? 'building' : 'planning';
  return project;
}

/** Release readiness is not deployment authorization. Deployment always requires a separate owner approval. */
export function evaluateProductRelease(project: ProductProject): { ready: boolean; blockers: string[]; deploymentAuthorized: boolean } {
  const blockers: string[] = [];
  for (const item of project.tasks) {
    if (item.status !== 'completed') blockers.push(`Task incomplete: ${item.title}`);
    if (item.status === 'completed' && !item.evidence.length) blockers.push(`Missing evidence: ${item.title}`);
  }
  if (!project.tasks.find(item => item.id === 'testing')?.evidence.length) blockers.push('Automated/manual test evidence missing.');
  if (!project.tasks.find(item => item.id === 'security')?.evidence.length) blockers.push('Security review evidence missing.');
  return { ready: blockers.length === 0, blockers, deploymentAuthorized: project.deploymentAuthorized };
}

export function authorizeProductDeployment(project: ProductProject, explicitOwnerApproval: boolean): ProductProject {
  const readiness = evaluateProductRelease(project);
  if (!readiness.ready) throw new Error('Deployment cannot be authorized before all release gates pass.');
  if (explicitOwnerApproval !== true) throw new Error('Explicit owner approval is required for production deployment.');
  project.deploymentAuthorized = true;
  return project;
}

/** Call only after an external deployment adapter reports verifiable success. */
export function recordVerifiedDeployment(project: ProductProject, evidence: { deploymentId: string; verifiedAt: string }): ProductProject {
  if (!project.deploymentAuthorized) throw new Error('Deployment has not been authorized.');
  if (!evidence.deploymentId.trim() || !Number.isFinite(Date.parse(evidence.verifiedAt))) throw new Error('Valid deployment evidence is required.');
  project.actualDeploymentAt = evidence.verifiedAt;
  project.status = 'released';
  return project;
}
