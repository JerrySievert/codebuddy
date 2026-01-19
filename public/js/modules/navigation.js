/**
 * Navigation module for URL routing and state management.
 * Contains URL parsing/updating and navigation helper functions.
 */

/**
 * Creates URL navigation handlers.
 * @param {Object} state - Application state
 * @param {Object} handlers - Handler functions for loading data
 * @returns {Object} Navigation functions
 */
export const create_navigation = (state, handlers) => {
  /**
   * Update URL based on current state.
   */
  const update_url = () => {
    const params = new URLSearchParams();

    if (state.selected_project.value) {
      params.set('project', state.selected_project.value.name);
    }
    if (state.current_directory.value) {
      params.set('dir', state.current_directory.value);
    }
    if (state.selected_file.value) {
      params.set('file', state.selected_file.value);
    }
    if (state.selected_function.value) {
      params.set('function', state.selected_function.value.symbol);
      if (state.selected_function.value.filename) {
        params.set('funcFile', state.selected_function.value.filename);
      }
      if (state.active_tab.value && state.active_tab.value !== 'source') {
        params.set('tab', state.active_tab.value);
      }
    }
    if (state.show_call_graph.value && state.call_graph_root.value) {
      params.set('callgraph', state.call_graph_root.value);
      if (
        state.graph_view_type.value &&
        state.graph_view_type.value !== 'callgraph'
      ) {
        params.set('graphType', state.graph_view_type.value);
      }
      if (state.call_graph_depth.value !== 5) {
        params.set('depth', state.call_graph_depth.value);
      }
    }
    if (state.showing_all_functions.value) {
      params.set('view', 'all-functions');
    }
    if (state.show_analysis_view.value) {
      params.set('view', 'analysis');
      if (state.analysis_tab.value && state.analysis_tab.value !== 'overview') {
        params.set('analysisTab', state.analysis_tab.value);
      }
    }
    if (state.show_jobs_view.value) {
      params.set('view', 'jobs');
    }

    const hash = params.toString();
    const new_url = hash ? `#${hash}` : window.location.pathname;
    window.history.pushState({}, '', new_url);
  };

  /**
   * Parse URL and restore state.
   */
  const parse_url = async () => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;

    const params = new URLSearchParams(hash);
    const project_name = params.get('project');
    const dir_path = params.get('dir');
    const file_name = params.get('file');
    const function_name = params.get('function');
    const func_file = params.get('funcFile');
    const tab = params.get('tab');
    const callgraph_root = params.get('callgraph');
    const graph_type = params.get('graphType');
    const depth_param = params.get('depth');
    const view = params.get('view');
    const analysis_tab_param = params.get('analysisTab');

    // Handle jobs view (doesn't require project)
    if (view === 'jobs') {
      state.show_jobs_view.value = true;
      state.show_analysis_view.value = false;
      return;
    }

    if (project_name) {
      // Wait for projects to load
      while (state.loading_projects.value) {
        await new Promise((r) => setTimeout(r, 50));
      }

      const project = state.projects.value.find((p) => p.name === project_name);
      if (project) {
        await handlers.select_project(project, true);

        // Restore directory path if specified
        if (dir_path) {
          state.current_directory.value = dir_path;
        }

        // Handle analysis view
        if (view === 'analysis') {
          state.show_analysis_view.value = true;
          state.show_jobs_view.value = false;
          await handlers.load_analysis_dashboard();
          if (analysis_tab_param) {
            state.analysis_tab.value = analysis_tab_param;
            if (analysis_tab_param !== 'overview') {
              await handlers.load_analysis_detail(analysis_tab_param);
            }
          }
        } else if (callgraph_root) {
          // Restore depth before opening call graph (default to 5 if not in URL)
          if (depth_param) {
            const depth = parseInt(depth_param, 10);
            if (!isNaN(depth) && depth >= 0) {
              state.call_graph_depth.value = depth;
            }
          } else {
            state.call_graph_depth.value = 5;
          }
          await handlers.open_call_graph(callgraph_root, true);
          if (graph_type) {
            state.graph_view_type.value = graph_type;
            await handlers.reload_tree_view();
          }
        } else if (function_name) {
          // Load function details
          try {
            const results =
              await handlers.load_function_by_symbol(function_name);
            if (results.length > 0) {
              const match = func_file
                ? results.find((r) => r.filename === func_file) || results[0]
                : results[0];
              state.selected_function.value = match;
              state.selected_file.value = match.filename;
              // Restore active tab if specified
              if (tab) {
                state.active_tab.value = tab;
                if (tab === 'callers') await handlers.load_callers();
                else if (tab === 'callees') await handlers.load_callees();
                else if (tab === 'callgraph')
                  await handlers.load_inline_call_graph();
                else if (tab === 'flowchart') await handlers.load_flowchart();
                else if (tab === 'references') await handlers.load_references();
              }
            }
          } catch (e) {
            console.error('Failed to load function from URL:', e);
          }
        } else if (view === 'all-functions') {
          await handlers.show_all_functions(true);
        } else if (file_name) {
          await handlers.select_file(file_name, true);
        }
      }
    }
  };

  /**
   * Reset to home/default state.
   * @param {boolean} skip_url_update - Skip URL update
   */
  const reset_to_home = (skip_url_update = false) => {
    state.selected_project.value = null;
    state.project_info.value = null;
    state.selected_file.value = null;
    state.file_functions.value = [];
    state.selected_function.value = null;
    state.showing_all_functions.value = false;
    state.all_functions.value = [];
    state.show_call_graph.value = false;
    state.call_graph_data.value = null;
    state.selected_graph_node.value = null;
    state.search_query.value = '';
    state.search_results.value = [];
    state.has_searched.value = false;
    state.callers.value = [];
    state.callees.value = [];
    state.show_jobs_view.value = false;
    state.show_analysis_view.value = false;
    state.analysis_data.value = null;
    state.analysis_detail.value = null;
    state.analysis_tab.value = 'overview';

    if (handlers.stop_simulation) {
      handlers.stop_simulation();
    }

    if (!skip_url_update) {
      window.history.pushState({}, '', window.location.pathname);
    }
  };

  return {
    update_url,
    parse_url,
    reset_to_home
  };
};

/**
 * Creates directory navigation handlers.
 * @param {Object} state - Application state
 * @param {Function} update_url - URL update function
 * @returns {Object} Directory navigation functions
 */
export const create_directory_navigation = (state, update_url) => {
  /**
   * Navigate into a directory.
   * @param {string} dir_name - Directory name
   */
  const navigate_to_directory = (dir_name) => {
    if (state.current_directory.value) {
      state.current_directory.value =
        state.current_directory.value + '/' + dir_name;
    } else {
      state.current_directory.value = dir_name;
    }
    state.file_display_limit.value = 100;
    update_url();
  };

  /**
   * Navigate up one directory level.
   */
  const navigate_up = () => {
    const current = state.current_directory.value;
    const last_slash = current.lastIndexOf('/');
    if (last_slash === -1) {
      state.current_directory.value = '';
    } else {
      state.current_directory.value = current.slice(0, last_slash);
    }
    state.file_display_limit.value = 100;
    update_url();
  };

  /**
   * Navigate to root.
   */
  const navigate_to_root = () => {
    state.current_directory.value = '';
    state.file_display_limit.value = 100;
    update_url();
  };

  /**
   * Navigate to a specific directory path from a full file path.
   * @param {string} filepath - Full file path
   * @param {number} directory_index - Directory index (-1 for root)
   */
  const navigate_to_file_directory = (filepath, directory_index) => {
    // Clear current views and go back to project view with directory
    state.showing_all_functions.value = false;
    state.selected_file.value = null;
    state.selected_function.value = null;
    state.file_functions.value = [];
    state.file_analytics.value = null;

    const parts = filepath.split('/');
    if (directory_index < 0) {
      state.current_directory.value = '';
    } else {
      state.current_directory.value = parts
        .slice(0, directory_index + 1)
        .join('/');
    }
    state.file_display_limit.value = 100;
    update_url();
  };

  /**
   * Navigate to a specific breadcrumb index.
   * @param {number} index - Breadcrumb index
   */
  const navigate_to_breadcrumb = (index) => {
    const parts = state.current_directory.value.split('/');
    state.current_directory.value = parts.slice(0, index + 1).join('/');
    state.file_display_limit.value = 100;
    update_url();
  };

  return {
    navigate_to_directory,
    navigate_up,
    navigate_to_root,
    navigate_to_file_directory,
    navigate_to_breadcrumb
  };
};

/**
 * Creates computed properties for directory contents.
 * @param {Object} state - Application state
 * @param {Object} Vue - Vue library
 * @returns {Object} Computed properties
 */
export const create_directory_computed = (state, Vue) => {
  /**
   * Get directory contents at current path.
   */
  const directory_contents = Vue.computed(() => {
    if (!state.project_info.value?.files) return { directories: [], files: [] };

    const current_path = state.current_directory.value;
    const prefix = current_path ? current_path + '/' : '';
    const prefix_len = prefix.length;

    const directories = new Map();
    const files = [];

    for (const file of state.project_info.value.files) {
      // Skip files not in current directory
      if (current_path && !file.filename.startsWith(prefix)) continue;
      if (!current_path && file.filename.startsWith('/')) continue;

      // Get the relative path from current directory
      const relative_path = current_path
        ? file.filename.slice(prefix_len)
        : file.filename;

      // Check if this file is in a subdirectory
      const slash_index = relative_path.indexOf('/');

      if (slash_index !== -1) {
        // It's in a subdirectory
        const dir_name = relative_path.slice(0, slash_index);
        if (!directories.has(dir_name)) {
          directories.set(dir_name, {
            name: dir_name,
            fileCount: 0,
            entityCount: 0
          });
        }
        const dir = directories.get(dir_name);
        dir.fileCount++;
        dir.entityCount += parseInt(file.function_count, 10) || 0;
      } else {
        // It's a file in the current directory
        files.push(file);
      }
    }

    // Sort directories and files alphabetically
    const sorted_dirs = Array.from(directories.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    const sorted_files = files.sort((a, b) => {
      const name_a = current_path ? a.filename.slice(prefix_len) : a.filename;
      const name_b = current_path ? b.filename.slice(prefix_len) : b.filename;
      return name_a.localeCompare(name_b);
    });

    return { directories: sorted_dirs, files: sorted_files };
  });

  /**
   * Get breadcrumb parts for current directory.
   */
  const directory_breadcrumbs = Vue.computed(() => {
    if (!state.current_directory.value) return [];
    return state.current_directory.value.split('/');
  });

  /**
   * Get displayed files (paginated).
   */
  const displayed_files = Vue.computed(() => {
    if (!state.project_info.value?.files) return [];
    return state.project_info.value.files.slice(
      0,
      state.file_display_limit.value
    );
  });

  /**
   * Check if there are more files.
   */
  const has_more_files = Vue.computed(() => {
    if (!state.project_info.value?.files) return false;
    return (
      state.project_info.value.files.length > state.file_display_limit.value
    );
  });

  /**
   * Get remaining files count.
   */
  const remaining_files_count = Vue.computed(() => {
    if (!state.project_info.value?.files) return 0;
    return (
      state.project_info.value.files.length - state.file_display_limit.value
    );
  });

  /**
   * Get displayed functions (paginated).
   */
  const displayed_functions = Vue.computed(() => {
    if (!state.all_functions.value) return [];
    return state.all_functions.value.slice(
      0,
      state.function_display_limit.value
    );
  });

  /**
   * Check if there are more functions.
   */
  const has_more_functions = Vue.computed(() => {
    if (!state.all_functions.value) return false;
    return (
      state.all_functions.value.length > state.function_display_limit.value
    );
  });

  /**
   * Get remaining functions count.
   */
  const remaining_functions_count = Vue.computed(() => {
    if (!state.all_functions.value) return 0;
    return (
      state.all_functions.value.length - state.function_display_limit.value
    );
  });

  /**
   * Group references by type for display.
   */
  const grouped_references = Vue.computed(() => {
    if (
      !state.entity_references.value ||
      state.entity_references.value.length === 0
    ) {
      return {};
    }
    const groups = {};
    for (const ref of state.entity_references.value) {
      const type = ref.reference_type || 'unknown';
      if (!groups[type]) {
        groups[type] = [];
      }
      groups[type].push(ref);
    }
    return groups;
  });

  return {
    directory_contents,
    directory_breadcrumbs,
    displayed_files,
    has_more_files,
    remaining_files_count,
    displayed_functions,
    has_more_functions,
    remaining_functions_count,
    grouped_references
  };
};

/**
 * Helper functions for file paths.
 */
export const path_helpers = {
  /**
   * Get path parts for a filename (for clickable path segments).
   * @param {string} filename - File path
   * @returns {Array} Path parts (excluding filename)
   */
  get_file_path_parts: (filename) => {
    if (!filename) return [];
    const parts = filename.split('/');
    return parts.slice(0, -1);
  },

  /**
   * Get just the filename from a path.
   * @param {string} filename - File path
   * @returns {string} Filename only
   */
  get_file_name: (filename) => {
    if (!filename) return '';
    const parts = filename.split('/');
    return parts[parts.length - 1];
  }
};
