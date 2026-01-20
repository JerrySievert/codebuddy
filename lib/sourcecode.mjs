'use strict';

/**
 * @fileoverview Source code file operations and text extraction utilities.
 * Handles reading source files and extracting text at specific positions.
 * @module lib/sourcecode
 */

import { readdir, readFile, stat } from 'fs/promises';
import path from 'path';
import ignore from 'ignore';

/**
 * Read a source file and return its contents as a string.
 * @param {string} path - The file path to read
 * @returns {Promise<string>} The file contents
 * @throws {Error} If the file cannot be read
 */
const import_file = async (path) => {
  try {
    const content = await readFile(path, 'utf8');
    content.replace(/\\/g, '\\\\');

    return content;
  } catch (error) {
    throw error;
  }
};

/**
 * Extract text from source code at a specific position range.
 * Line numbers are 1-based, positions are 0-based column offsets.
 * @param {Object} params - Position parameters
 * @param {string} params.source - The full source code string
 * @param {number} [params.start_line] - Starting line number (1-based, default: 1)
 * @param {number} [params.start_position] - Starting column (0-based, default: 0)
 * @param {number} [params.end_line] - Ending line number (1-based, default: last line)
 * @param {number} [params.end_position] - Ending column (0-based, default: -1 for end of line)
 * @returns {string} The extracted text
 */
/**
 * Cache for split source lines to avoid repeated splitting.
 * Key: source string, Value: array of lines
 * Uses WeakRef-like pattern with a simple LRU cache of 1 entry
 * since we typically process one file at a time.
 */
let _last_source = null;
let _last_lines = null;

const text_at_position = ({
  source,
  start_line,
  start_position,
  end_line,
  end_position
}) => {
  // Cache the split lines - source.split('\n') is expensive and called many times per file
  let lines;
  if (source === _last_source) {
    lines = _last_lines;
  } else {
    lines = source.split('\n');
    _last_source = source;
    _last_lines = lines;
  }

  // Check for any undefined values and set some defaults.
  if (start_line === undefined) {
    start_line = 0;
  } else {
    // Otherwise we decrement the line since we are 0 based.
    start_line--;
  }

  if (end_line === undefined) {
    end_line = lines.length;
  } else {
    end_line--;
  }

  if (start_position === undefined) {
    start_position = 0;
  }

  if (end_position === undefined) {
    end_position = -1;
  }

  const parts = [];

  for (
    let current_line = start_line;
    current_line <= end_line;
    current_line++
  ) {
    // If we are on the first line matched, we get a partial line.
    if (current_line === start_line) {
      // If the end line is the same as the start line, we get a partial
      // from the start position to the end position.
      if (end_line === start_line) {
        if (end_position === -1) {
          end_position = lines[current_line].length;
        }
        parts.push(lines[current_line].substring(start_position, end_position));
      } else {
        parts.push(lines[current_line].substring(start_position));
      }
    } else if (current_line === end_line) {
      // When -1 is passed as the end_position, assume it's the whole line.
      if (end_position === -1) {
        if (lines[current_line] === undefined) {
          break;
        }

        end_position = lines[current_line].length;
      }

      parts.push(lines[current_line].substring(0, end_position));
    } else {
      parts.push(lines[current_line]);
    }
  }

  return parts.join('\n');
};

// Directories to exclude from file scanning
const EXCLUDED_DIRECTORIES = [
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'vendor',
  'dist',
  'build',
  '__pycache__',
  '.pytest_cache',
  'target', // Rust/Java build output
  '.next', // Next.js
  '.nuxt', // Nuxt.js
  'coverage' // Test coverage reports
];

/**
 * Load and parse a .cbignore file from a directory.
 * The .cbignore file follows gitignore syntax.
 * @param {string} root_directory - The root directory to look for .cbignore
 * @returns {Promise<Object|null>} An ignore instance or null if no .cbignore exists
 */
const load_cbignore = async (root_directory) => {
  const cbignore_path = path.join(root_directory, '.cbignore');
  try {
    const content = await readFile(cbignore_path, 'utf8');
    const ig = ignore();
    ig.add(content);
    return ig;
  } catch (error) {
    // No .cbignore file exists, return null
    return null;
  }
};

/**
 * Recursively get all files from a directory.
 * Excludes common dependency and build directories (node_modules, .git, vendor, etc.)
 * Also respects .cbignore file in the root directory if it exists.
 * @param {string} directory - The directory to search
 * @param {string} [root_directory] - The root directory (used internally for .cbignore)
 * @param {Object} [ig] - The ignore instance (used internally)
 * @returns {Promise<string[]>} Array of absolute file paths
 */
const get_all_filenames = async (
  directory,
  root_directory = null,
  ig = null
) => {
  // On first call, set root_directory and load .cbignore
  if (root_directory === null) {
    root_directory = directory;
    ig = await load_cbignore(root_directory);
  }

  const files = [];

  const files_in_dir = await readdir(directory);
  for (const file of files_in_dir) {
    // Skip excluded directories (hardcoded list)
    if (EXCLUDED_DIRECTORIES.includes(file)) {
      continue;
    }

    const absolute = path.join(directory, file);

    // Get relative path from root for .cbignore matching
    const relative_path = path.relative(root_directory, absolute);

    // Check against .cbignore patterns if loaded
    if (ig !== null && ig.ignores(relative_path)) {
      continue;
    }

    const file_stats = await stat(absolute);

    if (file_stats.isDirectory()) {
      // Also check if directory is ignored (with trailing slash for gitignore semantics)
      if (ig !== null && ig.ignores(relative_path + '/')) {
        continue;
      }
      files.push(...(await get_all_filenames(absolute, root_directory, ig)));
    } else {
      files.push(absolute);
    }
  }

  return files;
};

/**
 * Recursively get all files with a specific extension from a directory.
 * Excludes common dependency and build directories (node_modules, .git, vendor, etc.)
 * Also respects .cbignore file in the root directory if it exists.
 * @param {string} directory - The directory to search
 * @param {string} type - The file extension to match (without dot, e.g., 'js', 'py')
 * @param {string} [root_directory] - The root directory (used internally for .cbignore)
 * @param {Object} [ig] - The ignore instance (used internally)
 * @returns {Promise<string[]>} Array of absolute file paths matching the extension
 */
const get_all_filenames_with_type = async (
  directory,
  type,
  root_directory = null,
  ig = null
) => {
  const files = await get_all_filenames(directory, root_directory, ig);
  return files.filter((file) => file.endsWith(`.${type}`));
};

export {
  import_file,
  text_at_position,
  get_all_filenames,
  get_all_filenames_with_type
};
