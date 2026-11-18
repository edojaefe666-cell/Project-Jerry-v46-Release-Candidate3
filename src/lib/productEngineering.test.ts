import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeProductDeployment, createProductProject, evaluateProductRelease, recordVerifiedDeployment, updateProductTask } from './productEngineering.ts';

test('creates a complete idea-to-product lifecycle plan', () => {
  const project = createProductProject({ idea: 'Build a marketplace for local service providers', now: '2026-11-13T10:00:00.000Z' });
  assert.equal(project.tasks.length, 9);
  assert.deepEqual(project.approvalsRequired, ['production_deployment','paid_service','external_purchase','sensitive_data_access']);
  assert.equal(project.deploymentAuthorized, false);
});

test('rejects empty or underspecified ideas', () => {
  assert.throws(() => createProductProject({ idea: 'tiny' }), /at least 12 characters/);
});

test('prevents starting work before dependencies complete', () => {
  const project = createProductProject({ idea: 'Build a secure customer support portal' });
  assert.throws(() => updateProductTask(project, 'implementation', 'in_progress'), /Dependencies are not complete/);
});

test('requires evidence before marking a task complete', () => {
  const project = createProductProject({ idea: 'Build a secure customer support portal' });
  assert.throws(() => updateProductTask(project, 'discovery', 'completed'), /requires recorded evidence/);
});

test('records evidence and advances task state', () => {
  const project = createProductProject({ idea: 'Build a secure customer support portal' });
  updateProductTask(project, 'discovery', 'completed', ['Interview notes reviewed']);
  assert.equal(project.tasks[0].status, 'completed');
  assert.deepEqual(project.tasks[0].evidence, ['Interview notes reviewed']);
});

test('release gate blocks incomplete tasks', () => {
  const project = createProductProject({ idea: 'Build a secure customer support portal' });
  const gate = evaluateProductRelease(project);
  assert.equal(gate.ready, false);
  assert.ok(gate.blockers.length >= 9);
});

test('release authorization requires every task and evidence', () => {
  const project = createProductProject({ idea: 'Build a secure customer support portal' });
  for (const item of project.tasks) {
    for (const dependency of item.dependsOn) {
      const dep = project.tasks.find(x => x.id === dependency)!;
      if (dep.status !== 'completed') updateProductTask(project, dep.id, 'completed', [`Evidence for ${dep.id}`]);
    }
    if (item.status !== 'completed') updateProductTask(project, item.id, 'completed', [`Evidence for ${item.id}`]);
  }
  assert.equal(evaluateProductRelease(project).ready, true);
  assert.throws(() => authorizeProductDeployment(project, false), /Explicit owner approval/);
  authorizeProductDeployment(project, true);
  assert.equal(project.deploymentAuthorized, true);
});

test('cannot record deployment before explicit authorization', () => {
  const project = createProductProject({ idea: 'Build a secure customer support portal' });
  assert.throws(() => recordVerifiedDeployment(project, { deploymentId: 'deploy-1', verifiedAt: new Date().toISOString() }), /not been authorized/);
});

test('deployment requires verifiable deployment evidence', () => {
  const project = createProductProject({ idea: 'Build a secure customer support portal' });
  for (const item of project.tasks) {
    for (const dependency of item.dependsOn) {
      const dep = project.tasks.find(x => x.id === dependency)!;
      if (dep.status !== 'completed') updateProductTask(project, dep.id, 'completed', [`Evidence for ${dep.id}`]);
    }
    if (item.status !== 'completed') updateProductTask(project, item.id, 'completed', [`Evidence for ${item.id}`]);
  }
  authorizeProductDeployment(project, true);
  assert.throws(() => recordVerifiedDeployment(project, { deploymentId: '', verifiedAt: 'not-a-date' }), /Valid deployment evidence/);
  recordVerifiedDeployment(project, { deploymentId: 'verified-deploy-123', verifiedAt: '2026-11-13T12:00:00.000Z' });
  assert.equal(project.status, 'released');
});

test('creates a distinct existing-application maintenance workflow', async () => {
  const { mode, existingProject, tasks } = createProductProject({
    idea: 'Add role-based access control to the existing customer portal',
    mode: 'existing',
    existingProject: { source: 'git_repository', sourceReference: 'https://example.com/org/customer-portal.git', primaryLanguage: 'TypeScript', frameworks: ['React', 'Express'], baselineCommit: 'a'.repeat(40), ownerConfirmedAccess: true },
  });
  assert.equal(mode, 'existing');
  assert.equal(existingProject?.primaryLanguage, 'TypeScript');
  assert.deepEqual(tasks.map(item => item.id), ['discovery','baseline','requirements','architecture','design','implementation','testing','security','release','operations']);
  assert.match(tasks[0].description, /Do not execute project scripts during passive inventory/);
  assert.match(tasks[5].description, /isolated branch/);
});

test('existing applications require explicit owner access confirmation', () => {
  assert.throws(() => createProductProject({ idea: 'Improve the existing customer portal safely', mode: 'existing', existingProject: { source: 'local_folder', sourceReference: 'workspace/customer-portal', ownerConfirmedAccess: false } }), /Owner confirmation/);
});

test('existing applications require a source reference', () => {
  assert.throws(() => createProductProject({ idea: 'Improve the existing customer portal safely', mode: 'existing', existingProject: { source: 'local_folder', sourceReference: ' ', ownerConfirmedAccess: true } }), /source reference/);
});

test('rejects an existing-project descriptor on a new project', () => {
  assert.throws(() => createProductProject({ idea: 'Create a new customer portal from scratch', existingProject: { source: 'local_folder', sourceReference: 'workspace/app', ownerConfirmedAccess: true } }), /only valid when mode is existing/);
});

test('validates remote repository URLs and owner confirmation', async () => {
  const { validateExistingProjectContext } = await import('./productEngineering.ts');
  const bad = validateExistingProjectContext({ source: 'remote_repository', sourceReference: 'file:///etc/passwd', ownerConfirmedAccess: false });
  assert.equal(bad.valid, false);
  assert.equal(bad.errors.length, 2);
  const good = validateExistingProjectContext({ source: 'git_repository', sourceReference: 'https://example.com/org/app.git', baselineCommit: 'abcdef1234567', ownerConfirmedAccess: true });
  assert.equal(good.valid, true);
});

test('existing application implementation cannot begin before inventory, baseline and design dependencies', () => {
  const project = createProductProject({ idea: 'Refactor the existing billing dashboard', mode: 'existing', existingProject: { source: 'uploaded_archive', sourceReference: 'billing-dashboard.zip', ownerConfirmedAccess: true } });
  assert.throws(() => updateProductTask(project, 'baseline', 'in_progress'), /Dependencies are not complete/);
  assert.throws(() => updateProductTask(project, 'implementation', 'in_progress'), /Dependencies are not complete/);
});

test('existing application release plan includes regression evidence and rollback', () => {
  const project = createProductProject({ idea: 'Upgrade the existing inventory management application', mode: 'existing', existingProject: { source: 'local_folder', sourceReference: 'workspace/inventory', ownerConfirmedAccess: true } });
  const testing = project.tasks.find(item => item.id === 'testing')!;
  const release = project.tasks.find(item => item.id === 'release')!;
  assert.match(testing.description, /regression/);
  assert.ok(release.evidenceRequired.some(item => /rollback/i.test(item)));
  assert.equal(project.deploymentAuthorized, false);
});
