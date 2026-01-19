'use strict';

import {
  is_git_url,
  get_repo_name,
  ensure_repos_dir,
  REPOS_DIR
} from '../../lib/git.mjs';

import { test } from 'st';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// ============ is_git_url tests ============

await test('is_git_url returns false for null/empty', async (t) => {
  t.assert.eq(is_git_url(null), false, 'null should return false');
  t.assert.eq(is_git_url(''), false, 'empty string should return false');
  t.assert.eq(is_git_url(undefined), false, 'undefined should return false');
});

await test('is_git_url recognizes SSH git URLs', async (t) => {
  t.assert.eq(
    is_git_url('git@github.com:user/repo.git'),
    true,
    'SSH URL should be recognized'
  );
  t.assert.eq(
    is_git_url('git@gitlab.com:user/repo.git'),
    true,
    'GitLab SSH URL should be recognized'
  );
});

await test('is_git_url recognizes HTTPS GitHub URLs', async (t) => {
  t.assert.eq(
    is_git_url('https://github.com/user/repo'),
    true,
    'GitHub HTTPS URL should be recognized'
  );
  t.assert.eq(
    is_git_url('https://github.com/user/repo.git'),
    true,
    'GitHub HTTPS URL with .git should be recognized'
  );
});

await test('is_git_url recognizes HTTPS GitLab URLs', async (t) => {
  t.assert.eq(
    is_git_url('https://gitlab.com/user/repo'),
    true,
    'GitLab HTTPS URL should be recognized'
  );
  t.assert.eq(
    is_git_url('https://gitlab.com/user/repo.git'),
    true,
    'GitLab HTTPS URL with .git should be recognized'
  );
});

await test('is_git_url recognizes HTTPS Bitbucket URLs', async (t) => {
  t.assert.eq(
    is_git_url('https://bitbucket.org/user/repo'),
    true,
    'Bitbucket HTTPS URL should be recognized'
  );
  t.assert.eq(
    is_git_url('https://bitbucket.org/user/repo.git'),
    true,
    'Bitbucket HTTPS URL with .git should be recognized'
  );
});

await test('is_git_url recognizes git:// protocol', async (t) => {
  t.assert.eq(
    is_git_url('git://github.com/user/repo.git'),
    true,
    'git:// protocol should be recognized'
  );
});

await test('is_git_url recognizes URLs ending with .git', async (t) => {
  t.assert.eq(
    is_git_url('https://example.com/repo.git'),
    true,
    'Any URL ending with .git should be recognized'
  );
});

await test('is_git_url returns false for local paths', async (t) => {
  t.assert.eq(
    is_git_url('/home/user/project'),
    false,
    'Local path should return false'
  );
  t.assert.eq(
    is_git_url('./relative/path'),
    false,
    'Relative path should return false'
  );
  t.assert.eq(
    is_git_url('C:\\Users\\project'),
    false,
    'Windows path should return false'
  );
});

await test('is_git_url returns false for non-git URLs', async (t) => {
  t.assert.eq(
    is_git_url('https://example.com'),
    false,
    'Generic URL without path should return false'
  );
  t.assert.eq(
    is_git_url('ftp://example.com/file'),
    false,
    'FTP URL should return false'
  );
});

// ============ get_repo_name tests ============

await test('get_repo_name extracts name from HTTPS URL', async (t) => {
  t.assert.eq(
    get_repo_name('https://github.com/user/my-repo'),
    'my-repo',
    'Should extract repo name from HTTPS URL'
  );
});

await test('get_repo_name removes .git suffix', async (t) => {
  t.assert.eq(
    get_repo_name('https://github.com/user/my-repo.git'),
    'my-repo',
    'Should remove .git suffix'
  );
});

await test('get_repo_name handles SSH URLs', async (t) => {
  t.assert.eq(
    get_repo_name('git@github.com:user/my-repo.git'),
    'my-repo',
    'Should extract name from SSH URL'
  );
});

await test('get_repo_name handles nested paths', async (t) => {
  t.assert.eq(
    get_repo_name('https://gitlab.com/group/subgroup/my-repo.git'),
    'my-repo',
    'Should get last part of nested path'
  );
});

await test('get_repo_name handles URLs without .git suffix', async (t) => {
  t.assert.eq(
    get_repo_name('https://github.com/user/awesome-project'),
    'awesome-project',
    'Should handle URL without .git'
  );
});

// ============ REPOS_DIR tests ============

await test('REPOS_DIR is in home directory', async (t) => {
  const expected = join(homedir(), '.codebuddy', 'repos');
  t.assert.eq(REPOS_DIR, expected, 'REPOS_DIR should be in ~/.codebuddy/repos');
});

// ============ ensure_repos_dir tests ============

await test('ensure_repos_dir creates and returns repos directory', async (t) => {
  const result = ensure_repos_dir();
  t.assert.eq(result, REPOS_DIR, 'Should return REPOS_DIR path');
  t.assert.ok(existsSync(REPOS_DIR), 'Directory should exist after call');
});

await test('ensure_repos_dir is idempotent', async (t) => {
  // Call twice - should not throw
  const result1 = ensure_repos_dir();
  const result2 = ensure_repos_dir();
  t.assert.eq(result1, result2, 'Should return same path on multiple calls');
});
