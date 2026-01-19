/**
 * Analysis module for code analysis dashboard and detail views.
 * Contains functions for loading and managing analysis data.
 */

// ============================================================================
// Analysis Count Sync Helpers
// ============================================================================

/**
 * Sync security counts from detail data.
 * @param {Object} summaries - Summary data object
 * @param {Object} detail - Detail data object
 */
const sync_security_counts = (summaries, detail) => {
  if (detail.summary) {
    summaries.security.total_vulnerabilities =
      detail.summary.total_vulnerabilities || 0;
    summaries.security.high_severity = detail.summary.high_severity || 0;
    summaries.security.medium_severity = detail.summary.medium_severity || 0;
    summaries.security.low_severity = detail.summary.low_severity || 0;
  }
};

/**
 * Sync code smells counts from detail data.
 * @param {Object} summaries - Summary data object
 * @param {Object} detail - Detail data object
 */
const sync_code_smells_counts = (summaries, detail) => {
  if (detail.summary) {
    summaries.code_smells.total_smells = detail.summary.total_smells || 0;
    summaries.code_smells.smell_density = detail.summary.smell_density || 0;
    summaries.code_smells.god_functions = detail.summary.god_functions || 0;
  }
};

/**
 * Sync dead code counts from detail data.
 * @param {Object} summaries - Summary data object
 * @param {Object} detail - Detail data object
 */
const sync_dead_code_counts = (summaries, detail) => {
  if (detail.summary) {
    summaries.dead_code.dead_function_count =
      detail.summary.dead_function_count || 0;
    summaries.dead_code.dead_code_percentage =
      detail.summary.dead_code_percentage || 0;
    summaries.dead_code.dead_lines_of_code =
      detail.summary.dead_lines_of_code || 0;
  }
};

/**
 * Sync types counts from detail data.
 * @param {Object} summaries - Summary data object
 * @param {Object} detail - Detail data object
 */
const sync_types_counts = (summaries, detail) => {
  if (detail.summary) {
    summaries.types.type_coverage_percentage =
      detail.summary.type_coverage_percentage || 0;
    summaries.types.total_dynamic_functions =
      detail.summary.total_functions || 0;
    summaries.types.with_type_hints = detail.summary.with_type_hints || 0;
  }
};

/**
 * Sync documentation counts from detail data.
 * @param {Object} summaries - Summary data object
 * @param {Object} detail - Detail data object
 */
const sync_documentation_counts = (summaries, detail) => {
  if (detail.summary) {
    summaries.documentation.coverage_percentage =
      detail.summary.coverage_percentage || 0;
    summaries.documentation.fully_documented =
      detail.summary.fully_documented || 0;
    summaries.documentation.undocumented = detail.summary.undocumented || 0;
  }
};

/**
 * Sync scope counts from detail data.
 * @param {Object} summaries - Summary data object
 * @param {Object} detail - Detail data object
 */
const sync_scope_counts = (summaries, detail) => {
  if (detail.summary) {
    summaries.scope.total_issues = detail.summary.total_issues || 0;
    summaries.scope.global_variable_issues =
      detail.summary.global_variable_issues || 0;
    summaries.scope.shadowing_issues = detail.summary.shadowing_issues || 0;
  }
};

/**
 * Sync duplication counts from detail data.
 * @param {Object} summaries - Summary data object
 * @param {Object} detail - Detail data object
 */
const sync_duplication_counts = (summaries, detail) => {
  if (detail.summary) {
    summaries.duplication.duplicate_group_count =
      detail.summary.duplicate_group_count || 0;
    summaries.duplication.duplication_percentage =
      detail.summary.duplication_percentage || 0;
  }
};

/**
 * Sync dependencies counts from detail data.
 * @param {Object} summaries - Summary data object
 * @param {Object} detail - Detail data object
 */
const sync_dependencies_counts = (summaries, detail) => {
  if (detail.summary) {
    summaries.dependencies.circular_dependency_count =
      detail.summary.circular_dependency_count || 0;
    summaries.dependencies.total_dependencies =
      detail.summary.total_dependencies || 0;
  }
};

/**
 * Map of analysis types to their sync functions.
 */
const SYNC_HANDLERS = {
  security: sync_security_counts,
  'code-smells': sync_code_smells_counts,
  'dead-code': sync_dead_code_counts,
  types: sync_types_counts,
  documentation: sync_documentation_counts,
  scope: sync_scope_counts,
  duplication: sync_duplication_counts,
  dependencies: sync_dependencies_counts
};

/**
 * Sync summary counts with actual detail data to fix mismatches.
 * @param {Object} summaries - Summary data object
 * @param {string} type - Analysis type
 * @param {Object} detail - Detail data
 */
const sync_analysis_counts = (summaries, type, detail) => {
  const handler = SYNC_HANDLERS[type];
  if (handler) {
    handler(summaries, detail);
  }
};

// ============================================================================
// Analysis Handlers Factory
// ============================================================================

/**
 * Creates analysis view handlers.
 * @param {Object} state - Application state
 * @param {Object} api - API module
 * @param {Function} update_url - URL update function
 * @returns {Object} Analysis view functions
 */
export const create_analysis_handlers = (state, api, update_url) => {
  // Track the current analysis request to handle race conditions
  let current_analysis_request_id = 0;

  /**
   * Toggle analysis view visibility.
   */
  const toggle_analysis_view = async () => {
    if (!state.selected_project.value) return;

    state.show_analysis_view.value = !state.show_analysis_view.value;
    if (state.show_analysis_view.value) {
      // Clear other views
      state.selected_file.value = null;
      state.selected_function.value = null;
      state.show_call_graph.value = false;
      state.showing_all_functions.value = false;
      state.show_jobs_view.value = false;
      // Load analysis data
      await load_analysis_dashboard();
    }
    update_url();
  };

  /**
   * Close analysis view.
   */
  const close_analysis_view = () => {
    state.show_analysis_view.value = false;
    state.analysis_data.value = null;
    state.analysis_detail.value = null;
    state.analysis_tab.value = 'overview';
    update_url();
  };

  /**
   * Load analysis dashboard for the selected project.
   */
  const load_analysis_dashboard = async () => {
    if (!state.selected_project.value) return;

    state.loading_analysis.value = true;
    state.analysis_data.value = null;
    state.analysis_detail.value = null;
    state.analysis_tab.value = 'overview';

    try {
      state.analysis_data.value = await api.load_analysis_dashboard(
        state.selected_project.value.name
      );
    } catch (error) {
      console.error('Failed to load analysis dashboard:', error);
    } finally {
      state.loading_analysis.value = false;
    }
  };

  /**
   * Load analysis detail for a specific type.
   * @param {string} type - Analysis type (security, code-smells, etc.)
   * @param {boolean} skip_url_update - Skip URL update
   */
  const load_analysis_detail = async (type, skip_url_update = false) => {
    if (!state.selected_project.value) return;

    // Increment request ID to track this specific request
    const request_id = ++current_analysis_request_id;

    state.loading_analysis_detail.value = true;
    state.analysis_detail.value = null;

    try {
      const detail = await api.load_analysis_detail(
        state.selected_project.value.name,
        type
      );

      // Check if this request is still the current one
      if (request_id !== current_analysis_request_id) {
        return; // Stale request, ignore the response
      }

      state.analysis_detail.value = detail;

      // Sync summary counts with actual detail data
      if (state.analysis_data.value?.summaries && detail) {
        sync_analysis_counts(state.analysis_data.value.summaries, type, detail);
      }
    } catch (error) {
      console.error(`Failed to load ${type} analysis:`, error);
      if (request_id === current_analysis_request_id) {
        state.analysis_detail.value = null;
      }
    } finally {
      if (request_id === current_analysis_request_id) {
        state.loading_analysis_detail.value = false;
      }
    }

    if (!skip_url_update && request_id === current_analysis_request_id) {
      update_url();
    }
  };

  /**
   * Set the active analysis tab.
   * @param {string} tab - Tab name
   */
  const set_analysis_tab = async (tab) => {
    state.analysis_tab.value = tab;
    if (tab !== 'overview') {
      await load_analysis_detail(tab);
    } else {
      state.analysis_detail.value = null;
      update_url();
    }
  };

  /**
   * Navigate to a function from analysis view.
   * @param {Object} fn - Function object with symbol and filename
   */
  const navigate_to_function_by_id = async (fn) => {
    if (!fn || !fn.symbol) return;

    state.show_analysis_view.value = false;
    state.analysis_data.value = null;

    const project_name = state.selected_project.value?.name;

    try {
      const results = await api.load_function_details(fn.symbol, project_name);
      if (results.length > 0) {
        const match = fn.filename
          ? results.find((r) => r.filename === fn.filename) || results[0]
          : results[0];
        state.selected_function.value = match;
        state.selected_file.value = match.filename;
      }
    } catch (error) {
      console.error('Failed to navigate to function:', error);
    }

    state.active_tab.value = 'source';
    state.callers.value = [];
    state.callees.value = [];
    update_url();
  };

  return {
    toggle_analysis_view,
    close_analysis_view,
    load_analysis_dashboard,
    load_analysis_detail,
    set_analysis_tab,
    navigate_to_function_by_id
  };
};

// ============================================================================
// Formatters
// ============================================================================

/**
 * Creates utility functions for formatting.
 * @returns {Object} Formatting utility functions
 */
export const create_formatters = () => {
  /**
   * Format a date string for display.
   * @param {string} date_str - ISO date string
   * @returns {string} Formatted date string
   */
  const format_date = (date_str) => {
    if (!date_str) return '-';
    const date = new Date(date_str);
    return date.toLocaleString();
  };

  /**
   * Format a number for display with locale-specific formatting.
   * @param {number} num - Number to format
   * @returns {string} Formatted number string
   */
  const format_number = (num) => {
    if (num === null || num === undefined) return '-';
    return Number(num).toLocaleString();
  };

  /**
   * Format a duration between two timestamps.
   * @param {string} start_str - Start ISO date string
   * @param {string} end_str - End ISO date string
   * @returns {string} Formatted duration string
   */
  const format_duration = (start_str, end_str) => {
    if (!start_str || !end_str) return '-';
    const start = new Date(start_str);
    const end = new Date(end_str);
    const ms = end - start;
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const mins = Math.floor(ms / 60000);
    const secs = ((ms % 60000) / 1000).toFixed(0);
    return `${mins}m ${secs}s`;
  };

  /**
   * Format reference type for display.
   * @param {string} type - Reference type key
   * @returns {string} Human-readable reference type
   */
  const format_reference_type = (type) => {
    const type_labels = {
      variable: 'Variable Declarations',
      parameter: 'Function Parameters',
      return_type: 'Return Types',
      field: 'Field Declarations',
      typedef: 'Type Definitions',
      macro: 'Macro Definitions',
      unknown: 'Other References'
    };
    return type_labels[type] || type;
  };

  /**
   * Format job title for user-friendly display.
   * @param {Object} job - Job object with type and metadata
   * @returns {string} Formatted job title
   */
  const format_job_title = (job) => {
    if (!job) return 'Unknown Job';
    const name = job.metadata?.name || '';
    switch (job.type) {
      case 'import':
        return name ? `Importing ${name}` : 'Importing project';
      case 'refresh':
        return name ? `Refreshing ${name}` : 'Refreshing project';
      case 'delete':
        return name ? `Deleting ${name}` : 'Deleting project';
      case 'analyze':
        return name ? `Analyzing ${name}` : 'Analyzing project';
      default:
        return name || job.metadata?.path || job.id || 'Unknown Job';
    }
  };

  /**
   * Calculate percentage for complexity distribution bar.
   * @param {Object} complexity - Complexity data object
   * @param {string} level - Complexity level
   * @returns {number} Percentage value
   */
  const get_distribution_percent = (complexity, level) => {
    if (
      !complexity ||
      !complexity.complexity_distribution ||
      complexity.total_functions === 0
    ) {
      return 0;
    }
    return (
      (complexity.complexity_distribution[level] / complexity.total_functions) *
      100
    );
  };

  return {
    format_date,
    format_number,
    format_duration,
    format_reference_type,
    format_job_title,
    get_distribution_percent
  };
};
