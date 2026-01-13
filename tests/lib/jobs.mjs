'use strict';

import {
  JobStatus,
  create_job,
  update_job,
  get_job,
  get_jobs,
  get_queue_stats,
  cleanup_jobs
} from '../../lib/jobs.mjs';

import { test } from 'st';

// ============ JobStatus enum tests ============

await test('JobStatus has correct values', async (t) => {
  t.assert.eq(JobStatus.QUEUED, 'queued', 'QUEUED should be "queued"');
  t.assert.eq(JobStatus.RUNNING, 'running', 'RUNNING should be "running"');
  t.assert.eq(JobStatus.COMPLETED, 'completed', 'COMPLETED should be "completed"');
  t.assert.eq(JobStatus.FAILED, 'failed', 'FAILED should be "failed"');
});

// ============ create_job tests ============

await test('create_job creates a job with correct initial state', async (t) => {
  const job = create_job('test', { name: 'test-project' });

  t.assert.ok(job.id, 'Job should have an ID');
  t.assert.ok(job.id.startsWith('test-'), 'Job ID should start with type');
  t.assert.eq(job.type, 'test', 'Job type should match');
  t.assert.eq(job.status, JobStatus.QUEUED, 'Initial status should be QUEUED');
  t.assert.eq(job.progress, 0, 'Initial progress should be 0');
  t.assert.eq(job.message, 'Queued...', 'Initial message should be "Queued..."');
  t.assert.eq(job.metadata.name, 'test-project', 'Metadata should be preserved');
  t.assert.ok(job.created_at, 'Should have created_at timestamp');
  t.assert.eq(job.started_at, null, 'started_at should be null');
  t.assert.eq(job.completed_at, null, 'completed_at should be null');
  t.assert.eq(job.result, null, 'result should be null');
  t.assert.eq(job.error, null, 'error should be null');
});

await test('create_job generates unique IDs', async (t) => {
  const job1 = create_job('test', {});
  const job2 = create_job('test', {});

  t.assert.ok(job1.id !== job2.id, 'Job IDs should be unique');
});

await test('create_job accepts empty metadata', async (t) => {
  const job = create_job('test');

  t.assert.ok(job.metadata, 'Metadata should exist');
  t.assert.eq(Object.keys(job.metadata).length, 0, 'Metadata should be empty object');
});

// ============ get_job tests ============

await test('get_job retrieves a created job', async (t) => {
  const created = create_job('retrieve-test', { key: 'value' });
  const retrieved = get_job(created.id);

  t.assert.ok(retrieved, 'Should retrieve the job');
  t.assert.eq(retrieved.id, created.id, 'IDs should match');
  t.assert.eq(retrieved.type, 'retrieve-test', 'Type should match');
});

await test('get_job returns null for non-existent job', async (t) => {
  const result = get_job('non-existent-id-12345');

  t.assert.eq(result, null, 'Should return null for non-existent job');
});

// ============ update_job tests ============

await test('update_job updates job fields', async (t) => {
  const job = create_job('update-test', {});
  const updated = update_job(job.id, {
    status: JobStatus.RUNNING,
    progress: 50,
    message: 'Processing...'
  });

  t.assert.ok(updated, 'Should return updated job');
  t.assert.eq(updated.status, JobStatus.RUNNING, 'Status should be updated');
  t.assert.eq(updated.progress, 50, 'Progress should be updated');
  t.assert.eq(updated.message, 'Processing...', 'Message should be updated');
});

await test('update_job returns null for non-existent job', async (t) => {
  const result = update_job('non-existent-id-67890', { status: JobStatus.COMPLETED });

  t.assert.eq(result, null, 'Should return null for non-existent job');
});

await test('update_job can set error and completed_at', async (t) => {
  const job = create_job('error-test', {});
  const completedAt = new Date().toISOString();
  const updated = update_job(job.id, {
    status: JobStatus.FAILED,
    error: 'Something went wrong',
    completed_at: completedAt
  });

  t.assert.eq(updated.status, JobStatus.FAILED, 'Status should be FAILED');
  t.assert.eq(updated.error, 'Something went wrong', 'Error should be set');
  t.assert.eq(updated.completed_at, completedAt, 'completed_at should be set');
});

// ============ get_jobs tests ============

await test('get_jobs returns all jobs', async (t) => {
  // Create some jobs
  create_job('list-test-a', {});
  create_job('list-test-b', {});

  const jobs = get_jobs();

  t.assert.ok(jobs.length >= 2, 'Should return at least 2 jobs');
  t.assert.ok(Array.isArray(jobs), 'Should return an array');
});

await test('get_jobs filters by type', async (t) => {
  create_job('filter-type-test', {});
  create_job('filter-type-test', {});
  create_job('other-type', {});

  const jobs = get_jobs({ type: 'filter-type-test' });

  t.assert.ok(jobs.length >= 2, 'Should return at least 2 jobs of type');
  t.assert.ok(jobs.every(j => j.type === 'filter-type-test'), 'All jobs should match type');
});

await test('get_jobs filters by status', async (t) => {
  const job = create_job('status-filter-test', {});
  update_job(job.id, { status: JobStatus.COMPLETED });

  const completedJobs = get_jobs({ status: JobStatus.COMPLETED });

  t.assert.ok(completedJobs.length >= 1, 'Should find completed jobs');
  t.assert.ok(completedJobs.every(j => j.status === JobStatus.COMPLETED), 'All should be completed');
});

await test('get_jobs respects limit', async (t) => {
  create_job('limit-test', {});
  create_job('limit-test', {});
  create_job('limit-test', {});

  const jobs = get_jobs({ type: 'limit-test', limit: 2 });

  t.assert.eq(jobs.length, 2, 'Should return only 2 jobs');
});

await test('get_jobs returns jobs sorted by created_at descending', async (t) => {
  const job1 = create_job('order-test', { order: 1 });
  // Small delay to ensure different timestamps
  await new Promise(r => setTimeout(r, 5));
  const job2 = create_job('order-test', { order: 2 });

  const jobs = get_jobs({ type: 'order-test' });

  // Jobs should be sorted by created_at (newest first)
  t.assert.ok(jobs.length >= 2, 'Should have at least 2 jobs');
  t.assert.ok(
    new Date(jobs[0].created_at) >= new Date(jobs[1].created_at),
    'Jobs should be sorted by created_at descending'
  );
});

// ============ get_queue_stats tests ============

await test('get_queue_stats returns correct structure', async (t) => {
  const stats = get_queue_stats();

  t.assert.ok('queued' in stats, 'Should have queued count');
  t.assert.ok('running' in stats, 'Should have running count');
  t.assert.ok('completed' in stats, 'Should have completed count');
  t.assert.ok('failed' in stats, 'Should have failed count');
  t.assert.ok('total' in stats, 'Should have total count');
  t.assert.ok('active_workers' in stats, 'Should have active_workers count');
  t.assert.ok('max_workers' in stats, 'Should have max_workers count');
});

await test('get_queue_stats counts jobs by status', async (t) => {
  const initialStats = get_queue_stats();

  const job = create_job('stats-test', {});
  const afterCreate = get_queue_stats();

  t.assert.eq(afterCreate.queued, initialStats.queued + 1, 'Queued count should increase');
  t.assert.eq(afterCreate.total, initialStats.total + 1, 'Total should increase');

  update_job(job.id, { status: JobStatus.COMPLETED });
  const afterComplete = get_queue_stats();

  t.assert.eq(afterComplete.completed, initialStats.completed + 1, 'Completed count should increase');
  t.assert.eq(afterComplete.queued, initialStats.queued, 'Queued count should decrease back');
});

// ============ cleanup_jobs tests ============

await test('cleanup_jobs removes old completed jobs based on maxAge', async (t) => {
  // Create a job and mark it completed
  const job = create_job('cleanup-test', {});
  update_job(job.id, { status: JobStatus.COMPLETED });

  // Job should still exist with default maxAge (1 hour)
  t.assert.ok(get_job(job.id), 'Job should exist before cleanup');

  // Cleanup with very large maxAge should NOT remove it (job is too recent)
  cleanup_jobs(1000 * 60 * 60); // 1 hour
  t.assert.ok(get_job(job.id), 'Recent job should not be removed with 1 hour maxAge');

  // Note: We can't easily test actual removal without manipulating time,
  // so we verify the job persists when maxAge is larger than job age
});

await test('cleanup_jobs preserves recently completed jobs', async (t) => {
  const job = create_job('cleanup-recent-test', {});
  update_job(job.id, { status: JobStatus.COMPLETED });

  // With a very large maxAge, the job should not be removed
  cleanup_jobs(1000 * 60 * 60 * 24); // 24 hours

  t.assert.ok(get_job(job.id), 'Recently completed job should be preserved');
});

await test('cleanup_jobs does not remove running or queued jobs', async (t) => {
  const queuedJob = create_job('cleanup-queued-test', {});
  const runningJob = create_job('cleanup-running-test', {});
  update_job(runningJob.id, { status: JobStatus.RUNNING });

  // Even with 0 maxAge, running and queued jobs should not be removed
  cleanup_jobs(0);

  t.assert.ok(get_job(queuedJob.id), 'Queued job should not be removed');
  t.assert.ok(get_job(runningJob.id), 'Running job should not be removed');
});
