'use strict';

import {
  is_git_url,
  get_repo_name
} from '../../lib/git.mjs';

import { test } from 'st';

// ============ is_git_url tests ============

await test('is_git_url returns false for null/empty', async (t) => {
  t.assert.eq(is_git_url(null), false, 'null should return false');
  t.assert.eq(is_git_url(''), false, 'empty string should return false');
  t.assert.eq(is_git_url(undefined), false, 'undefined should return false');
});

await test('is_git_url recognizes SSH git URLs', async (t) => {
  t.assert.eq(is_git_url('git@github.com:user/repo.git'), true, 'SSH URL should be recognized');
  t.assert.eq(is_git_url('git@gitlab.com:user/repo.git'), true, 'GitLab SSH URL should be recognized');
});

await test('is_git_url recognizes HTTPS GitHub URLs', async (t) => {
  t.assert.eq(is_git_url('https://github.com/user/repo'), true, 'GitHub HTTPS URL should be recognized');
  t.assert.eq(is_git_url('https://github.com/user/repo.git'), true, 'GitHub HTTPS URL with .git should be recognized');
});

await test('is_git_url recognizes HTTPS GitLab URLs', async (t) => {
  t.assert.eq(is_git_url('https://gitlab.com/user/repo'), true, 'GitLab HTTPS URL should be recognized');
  t.assert.eq(is_git_url('https://gitlab.com/user/repo.git'), true, 'GitLab HTTPS URL with .git should be recognized');
});

await test('is_git_url recognizes HTTPS Bitbucket URLs', async (t) => {
  t.assert.eq(is_git_url('https://bitbucket.org/user/repo'), true, 'Bitbucket HTTPS URL should be recognized');
  t.assert.eq(is_git_url('https://bitbucket.org/user/repo.git'), true, 'Bitbucket HTTPS URL with .git should be recognized');
});

await test('is_git_url recognizes git:// protocol', async (t) => {
  t.assert.eq(is_git_url('git://github.com/user/repo.git'), true, 'git:// protocol should be recognized');
});

await test('is_git_url recognizes URLs ending with .git', async (t) => {
  t.assert.eq(is_git_url('https://example.com/repo.git'), true, 'Any URL ending with .git should be recognized');
});

await test('is_git_url returns false for local paths', async (t) => {
  t.assert.eq(is_git_url('/home/user/project'), false, 'Local path should return false');
  t.assert.eq(is_git_url('./relative/path'), false, 'Relative path should return false');
  t.assert.eq(is_git_url('C:\\Users\\project'), false, 'Windows path should return false');
});

await test('is_git_url returns false for non-git URLs', async (t) => {
  t.assert.eq(is_git_url('https://example.com'), false, 'Generic URL without path should return false');
  t.assert.eq(is_git_url('ftp://example.com/file'), false, 'FTP URL should return false');
});

// ============ get_repo_name tests ============

await test('get_repo_name extracts name from HTTPS URL', async (t) => {
  t.assert.eq(get_repo_name('https://github.com/user/my-repo'), 'my-repo', 'Should extract repo name from HTTPS URL');
});

await test('get_repo_name removes .git suffix', async (t) => {
  t.assert.eq(get_repo_name('https://github.com/user/my-repo.git'), 'my-repo', 'Should remove .git suffix');
});

await test('get_repo_name handles SSH URLs', async (t) => {
  t.assert.eq(get_repo_name('git@github.com:user/my-repo.git'), 'my-repo', 'Should extract name from SSH URL');
});

await test('get_repo_name handles nested paths', async (t) => {
  t.assert.eq(get_repo_name('https://gitlab.com/group/subgroup/my-repo.git'), 'my-repo', 'Should get last part of nested path');
});

await test('get_repo_name handles URLs without .git suffix', async (t) => {
  t.assert.eq(get_repo_name('https://github.com/user/awesome-project'), 'awesome-project', 'Should handle URL without .git');
});
