/**
 * Data loading handlers module.
 * Contains functions for loading projects, files, and functions.
 */

/**
 * Creates data loading handlers.
 * @param {Object} state - Application state
 * @param {Object} api - API module
 * @param {Object} navigation - Navigation handlers
 * @returns {Object} Data loading functions
 */
export const create_data_handlers = (state, api, navigation) => {
  /**
   * Load server status (read-only mode check).
   */
  const load_server_status = async () => {
    const status = await api.load_server_status();
    state.server_read_only.value = status.read_only || false;
  };

  /**
   * Load global statistics.
   */
  const load_global_stats = async () => {
    try {
      state.global_stats.value = await api.load_global_stats();
    } catch (error) {
      console.error('Failed to load global stats:', error);
    }
  };

  /**
   * Load all projects.
   */
  const load_projects = async () => {
    try {
      state.projects.value = await api.load_projects();
      // Also refresh global stats when projects are loaded
      await load_global_stats();
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      state.loading_projects.value = false;
    }
  };

  /**
   * Select a project and load its info.
   * @param {Object} project - Project to select
   * @param {boolean} skip_url_update - Skip URL update
   */
  const select_project = async (project, skip_url_update = false) => {
    state.selected_project.value = project;
    state.selected_function.value = null;
    state.selected_file.value = null;
    state.showing_all_functions.value = false;
    state.show_call_graph.value = false;
    state.search_results.value = [];
    state.has_searched.value = false;

    // Reset analysis data when switching projects
    state.analysis_data.value = null;
    state.analysis_detail.value = null;
    state.analysis_tab.value = 'overview';

    // Close analysis and jobs views when selecting a project
    state.show_analysis_view.value = false;
    state.show_jobs_view.value = false;

    // Reset file display limit and directory for new project
    state.file_display_limit.value = 100;
    state.current_directory.value = '';

    // Show loading spinner while fetching project info
    state.loading_project_info.value = true;
    state.project_info.value = null;

    try {
      state.project_info.value = await api.load_project_info(project.name);
    } catch (error) {
      console.error('Failed to load project info:', error);
    } finally {
      state.loading_project_info.value = false;
    }

    if (!skip_url_update) navigation.update_url();
  };

  /**
   * Select a file and load its functions.
   * @param {string} filename - File path
   * @param {boolean} skip_url_update - Skip URL update
   */
  const select_file = async (filename, skip_url_update = false) => {
    state.selected_file.value = filename;
    state.selected_function.value = null;
    state.showing_all_functions.value = false;
    state.show_call_graph.value = false;
    state.loading_file_functions.value = true;
    state.loading_file_analytics.value = true;
    state.file_analytics.value = null;

    try {
      const [functions_data, analytics_data] = await Promise.all([
        api.load_file_functions(state.selected_project.value.name, filename),
        api.load_file_analytics(state.selected_project.value.name, filename)
      ]);
      state.file_functions.value = functions_data;
      state.file_analytics.value = analytics_data;
    } catch (error) {
      console.error('Failed to load file data:', error);
      state.file_functions.value = [];
      state.file_analytics.value = null;
    } finally {
      state.loading_file_functions.value = false;
      state.loading_file_analytics.value = false;
    }

    if (!skip_url_update) navigation.update_url();
  };

  /**
   * Clear file selection.
   */
  const clear_file = () => {
    state.selected_file.value = null;
    state.file_functions.value = [];
    state.file_analytics.value = null;
    state.selected_function.value = null;
    state.showing_all_functions.value = false;
    navigation.update_url();
  };

  /**
   * Show all functions for the project.
   * @param {boolean} skip_url_update - Skip URL update
   */
  const show_all_functions = async (skip_url_update = false) => {
    state.showing_all_functions.value = true;
    state.selected_file.value = null;
    state.selected_function.value = null;
    state.show_call_graph.value = false;
    state.loading_all_functions.value = true;
    state.function_display_limit.value = 100;

    try {
      state.all_functions.value = await api.load_all_functions(
        state.selected_project.value.name
      );
    } catch (error) {
      console.error('Failed to load all functions:', error);
      state.all_functions.value = [];
    } finally {
      state.loading_all_functions.value = false;
    }

    if (!skip_url_update) navigation.update_url();
  };

  /**
   * Clear all functions view.
   */
  const clear_all_functions = () => {
    state.showing_all_functions.value = false;
    state.all_functions.value = [];
    state.selected_function.value = null;
    navigation.update_url();
  };

  return {
    load_server_status,
    load_projects,
    select_project,
    select_file,
    clear_file,
    show_all_functions,
    clear_all_functions
  };
};
