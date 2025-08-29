'use strict';

import { readdir, readFile, stat } from 'fs/promises';
import path from 'path';

const import_file = async (path) => {
  try {
    const content = await readFile(path, 'utf8');
    content.replace(/\\/g, '\\\\');

    return content;
  } catch (error) {
    throw error;
  }
};

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

// Get all files of a type from a directory recursively.
const get_all_filenames_with_type = async (directory, type) => {
  const files = [];

  const files_in_directory = await readdir(directory);
  for (const file of files_in_directory) {
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
