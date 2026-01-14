'use strict';

/**
 * @fileoverview Source code file operations and text extraction utilities.
 * Handles reading source files and extracting text at specific positions.
 * @module lib/sourcecode
 */

import { readdir, readFile, stat } from 'fs/promises';
import path from 'path';

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
const text_at_position = ({
  source,
  start_line,
  start_position,
  end_line,
  end_position
}) => {
  // Make a copy of the source as lines.
  const lines = source.split('\n');

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
  'target',        // Rust/Java build output
  '.next',         // Next.js
  '.nuxt',         // Nuxt.js
  'coverage'       // Test coverage reports
];

/**
 * Recursively get all files with a specific extension from a directory.
 * Excludes common dependency and build directories (node_modules, .git, vendor, etc.)
 * @param {string} directory - The directory to search
 * @param {string} type - The file extension to match (without dot, e.g., 'js', 'py')
 * @returns {Promise<string[]>} Array of absolute file paths matching the extension
 */
const get_all_filenames_with_type = async (directory, type) => {
  const files = [];

  const files_in_directory = await readdir(directory);
  for (const file of files_in_directory) {
    // Skip excluded directories
    if (EXCLUDED_DIRECTORIES.includes(file)) {
      continue;
    }

    const absolute = path.join(directory, file);
    const stats = await stat(absolute);

    if (stats.isDirectory()) {
      files.push(...(await get_all_filenames_with_type(absolute, type)));
    } else {
      files.push(absolute);
    }
  }

  return files.filter((file) => file.endsWith(`.${type}`));
};

export { import_file, text_at_position, get_all_filenames_with_type };
