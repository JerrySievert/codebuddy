'use strict';

/**
 * @fileoverview Git operations using isomorphic-git.
 * Handles cloning, pulling, and URL parsing for git repositories.
 * @module lib/git
 */

import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import { existsSync, mkdirSync, promises as fs } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';

/** @type {string} Default directory for cloned repositories */
const REPOS_DIR = join(homedir(), '.codebuddy', 'repos');

/**
 * Check if a string is a git URL (supports GitHub, GitLab, Bitbucket, and generic patterns).
 * @param {string} str - The string to check
 * @returns {boolean} True if the string appears to be a git URL
 */
const is_git_url = (str) => {
  if (!str) return false;
  return (
    str.startsWith('git@') ||
    str.startsWith('https://github.com/') ||
    str.startsWith('https://gitlab.com/') ||
    str.startsWith('https://bitbucket.org/') ||
    str.startsWith('git://') ||
    str.endsWith('.git') ||
    /^https?:\/\/.*\/(.*\/)?[^\/]+$/.test(str) // Generic git URL pattern
  );
};

/**
 * Convert SSH git URL to HTTPS URL for isomorphic-git.
 * isomorphic-git doesn't support SSH URLs natively, so we convert them.
 * @param {string} url - The git URL to convert
 * @returns {string} HTTPS URL (or original if already HTTPS)
 */
const convert_to_https = (url) => {
  // Handle git@github.com:user/repo.git format
  if (url.startsWith('git@')) {
    const match = url.match(/^git@([^:]+):(.+)$/);
    if (match) {
      const host = match[1];
      let path = match[2];
      // Ensure .git suffix
      if (!path.endsWith('.git')) {
        path = path + '.git';
      }
      return `https://${host}/${path}`;
    }
  }
  // Handle git:// protocol
  if (url.startsWith('git://')) {
    return url.replace('git://', 'https://');
  }
  return url;
};

/**
 * Extract repository name from a git URL.
 * @param {string} url - The git URL to parse
 * @returns {string} The repository name (without .git suffix)
 */
const get_repo_name = (url) => {
  // Remove trailing .git if present
  let name = url.replace(/\.git$/, '');
  // Get the last part of the URL
  name = basename(name);
  return name;
};

/**
 * Ensure the repos directory exists, creating it if necessary.
 * @returns {string} The repos directory path
 */
const ensure_repos_dir = () => {
  if (!existsSync(REPOS_DIR)) {
    mkdirSync(REPOS_DIR, { recursive: true });
  }
  return REPOS_DIR;
};

/**
 * Clone a git repository using isomorphic-git
 * @param {string} url - The git URL to clone
 * @param {string} [target_name] - Optional name for the cloned directory
 * @returns {Promise<{path: string, name: string}>} - The path and name of the cloned repo
 */
const clone_repository = async (url, target_name = null) => {
  const repos_dir = ensure_repos_dir();
  const repo_name = target_name || get_repo_name(url);
  const target_path = join(repos_dir, repo_name);

  // Convert SSH URLs to HTTPS for isomorphic-git
  const https_url = convert_to_https(url);

  // Check if already cloned
  if (existsSync(target_path)) {
    // Try to pull latest changes
    try {
      await pull_repository(target_path);
    } catch (e) {
      // Ignore pull errors (might be detached HEAD, etc.)
      console.log(
        `Note: Could not pull updates for ${repo_name}: ${e.message}`
      );
    }
    return { path: target_path, name: repo_name };
  }

  // Clone the repository with depth 1 (shallow clone)
  try {
    await git.clone({
      fs,
      http,
      dir: target_path,
      url: https_url,
      depth: 1,
      singleBranch: true,
      onProgress: (progress) => {
        // Optional: log progress
        if (progress.phase === 'Receiving objects') {
          const pct = Math.round((progress.loaded / progress.total) * 100);
          if (pct % 20 === 0) {
            console.log(`Cloning ${repo_name}: ${pct}%`);
          }
        }
      }
    });

    return { path: target_path, name: repo_name };
  } catch (error) {
    throw new Error(`Failed to clone repository: ${error.message}`);
  }
};

/**
 * Pull latest changes for a repository using isomorphic-git.
 * Uses a hard reset strategy since we only need to read the code, not preserve local changes.
 * @param {string} path - The local path of the repository
 * @returns {Promise<boolean>} - Whether the pull was successful
 */
const pull_repository = async (path) => {
  try {
    // Get current branch before fetch
    const current_branch = await git.currentBranch({ fs, dir: path });
    if (!current_branch) {
      console.log(`No current branch found for ${path}, skipping pull`);
      return true;
    }

    // Fetch latest from remote
    await git.fetch({
      fs,
      http,
      dir: path,
      depth: 1,
      singleBranch: true
    });

    // Try fast-forward first (cleanest approach)
    try {
      await git.fastForward({
        fs,
        http,
        dir: path,
        singleBranch: true
      });
      return true;
    } catch (ff_error) {
      // Fast-forward failed (conflicts or diverged history)
      // Use hard reset to origin branch since we only need to read the code
      console.log(
        `Fast-forward failed for ${path}, performing hard reset to remote...`
      );

      // Get the remote tracking branch ref
      const remote_ref = `refs/remotes/origin/${current_branch}`;

      // Get the commit SHA of the remote branch
      const remote_commit = await git.resolveRef({
        fs,
        dir: path,
        ref: remote_ref
      });

      // Checkout (hard reset) to the remote commit
      await git.checkout({
        fs,
        dir: path,
        ref: current_branch,
        force: true // Force checkout, discarding local changes
      });

      // Update the branch to point to the remote commit
      await git.writeRef({
        fs,
        dir: path,
        ref: `refs/heads/${current_branch}`,
        value: remote_commit,
        force: true
      });

      // Checkout again to update working directory
      await git.checkout({
        fs,
        dir: path,
        ref: current_branch,
        force: true
      });

      console.log(`Hard reset complete for ${path}`);
      return true;
    }
  } catch (error) {
    console.log(`Pull failed for ${path}: ${error.message}`);
    return false;
  }
};

export {
  is_git_url,
  get_repo_name,
  clone_repository,
  pull_repository,
  ensure_repos_dir,
  REPOS_DIR
};
