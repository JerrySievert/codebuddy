/**
 * Main application entry point.
 * Imports and orchestrates all modules to create the Vue application.
 */

import { create_state } from './modules/state.js';
import * as api from './modules/api.js';
import {
  create_flowchart_renderer,
  create_call_graph_renderer,
  create_inline_graph_renderer,
  create_tree_renderer
} from './modules/rendering.js';
import {
  create_navigation,
  create_directory_navigation,
  create_directory_computed,
  path_helpers
} from './modules/navigation.js';
import { create_job_manager, create_import_handlers } from './modules/jobs.js';
import {
  create_analysis_handlers,
  create_formatters
} from './modules/analysis.js';

const { createApp, ref, onMounted, watch, nextTick } = Vue;

createApp({
  setup() {
    // Create all state refs
    const state = create_state(ref);

    // Create formatters
    const formatters = create_formatters();

    // Create renderers (will be initialized after state is set up)
    const flowchart_renderer = create_flowchart_renderer(state, d3);
    const call_graph_renderer = create_call_graph_renderer(state, d3);
    const inline_graph_renderer = create_inline_graph_renderer(state, d3);
    const tree_renderer = create_tree_renderer(state, d3);

    // Debounce timer for search
    let search_debounce_timer = null;

    // ========================================
    // Core data loading functions
    // ========================================

    /**
     * Load server status (read-only mode check).
     */
    const load_server_status = async () => {
      const status = await api.load_server_status();
      state.server_read_only.value = status.read_only || false;
    };

    /**
     * Load all projects.
     */
    const load_projects = async () => {
      try {
        state.projects.value = await api.load_projects();
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

    // ========================================
    // Search functions
    // ========================================

    /**
     * Search for functions/entities.
     */
    const search_functions = async () => {
      if (!state.search_query.value) return;

      state.has_searched.value = true;
      state.show_autocomplete.value = false;

      try {
        state.search_results.value = await api.search_entities(
          state.search_query.value,
          state.selected_project.value?.name,
          50
        );
      } catch (error) {
        console.error('Failed to search entities:', error);
        state.search_results.value = [];
      }
    };

    /**
     * Handle search input for autocomplete.
     */
    const on_search_input = () => {
      if (search_debounce_timer) {
        clearTimeout(search_debounce_timer);
      }

      if (!state.search_query.value || state.search_query.value.length < 2) {
        state.search_suggestions.value = [];
        state.show_autocomplete.value = false;
        return;
      }

      search_debounce_timer = setTimeout(async () => {
        try {
          state.search_suggestions.value = await api.search_entities(
            state.search_query.value,
            state.selected_project.value?.name,
            10
          );
          state.show_autocomplete.value =
            state.search_suggestions.value.length > 0;
          state.autocomplete_index.value = -1;
        } catch (error) {
          console.error('Failed to fetch suggestions:', error);
          state.search_suggestions.value = [];
          state.show_autocomplete.value = false;
        }
      }, 200);
    };

    /**
     * Navigate autocomplete selection.
     * @param {number} direction - Direction (1 or -1)
     */
    const navigate_autocomplete = (direction) => {
      if (
        !state.show_autocomplete.value ||
        state.search_suggestions.value.length === 0
      )
        return;

      state.autocomplete_index.value += direction;

      if (state.autocomplete_index.value < 0) {
        state.autocomplete_index.value =
          state.search_suggestions.value.length - 1;
      } else if (
        state.autocomplete_index.value >= state.search_suggestions.value.length
      ) {
        state.autocomplete_index.value = 0;
      }
    };

    /**
     * Select autocomplete item on enter.
     */
    const select_autocomplete_item = () => {
      if (
        state.autocomplete_index.value >= 0 &&
        state.autocomplete_index.value < state.search_suggestions.value.length
      ) {
        select_suggestion(
          state.search_suggestions.value[state.autocomplete_index.value]
        );
      } else {
        search_functions();
      }
    };

    /**
     * Select a suggestion from autocomplete.
     * @param {Object} fn - Function/entity to select
     */
    const select_suggestion = (fn) => {
      state.show_autocomplete.value = false;
      state.search_suggestions.value = [];
      state.autocomplete_index.value = -1;
      select_function(fn);
    };

    /**
     * Close autocomplete dropdown.
     */
    const close_autocomplete = () => {
      state.show_autocomplete.value = false;
      state.autocomplete_index.value = -1;
    };

    /**
     * Handle search blur event.
     */
    const on_search_blur = () => {
      setTimeout(() => {
        state.show_autocomplete.value = false;
      }, 200);
    };

    // ========================================
    // Function selection and navigation
    // ========================================

    /**
     * Select a function and load its details.
     * @param {Object} fn - Function to select
     * @param {boolean} skip_url_update - Skip URL update
     */
    const select_function = async (fn, skip_url_update = false) => {
      state.show_call_graph.value = false;

      // If no project selected and function has project info, select the project first
      if (!state.selected_project.value && fn.project_id) {
        const matching_project = state.projects.value.find(
          (p) => p.project_id === fn.project_id
        );
        if (matching_project) {
          state.selected_project.value = matching_project;
          try {
            state.project_info.value = await api.load_project_info(
              matching_project.name
            );
          } catch (error) {
            console.error('Failed to load project info:', error);
          }
        }
      }

      const project_name = state.selected_project.value?.name;

      try {
        const results = await api.load_function_details(
          fn.symbol,
          project_name
        );
        if (results.length > 0) {
          state.selected_function.value =
            results.find((r) => r.id === fn.id) || results[0];
        } else {
          state.selected_function.value = fn;
        }
      } catch (error) {
        console.error('Failed to load function details:', error);
        state.selected_function.value = fn;
      }

      state.active_tab.value = 'source';
      state.callers.value = [];
      state.callees.value = [];
      state.class_members.value = [];
      state.entity_references.value = [];
      state.reference_definitions.value = [];
      state.flowchart_data.value = null;
      state.flowchart_error.value = '';
      state.inline_call_graph_data.value = null;
      state.inline_call_graph_error.value = '';
      state.inline_call_graph_depth.value = 5; // Reset to default depth
      state.selected_inline_graph_node.value = null;

      // If this is a class or struct, fetch its members
      if (
        state.selected_function.value &&
        (state.selected_function.value.type === 'class' ||
          state.selected_function.value.type === 'struct')
      ) {
        state.loading_class_members.value = true;
        try {
          const members_data = await api.load_class_members(
            state.selected_function.value.id
          );
          state.class_members.value = members_data.members || [];
        } catch (error) {
          console.error('Failed to load class members:', error);
          state.class_members.value = [];
        } finally {
          state.loading_class_members.value = false;
        }
      }

      if (!skip_url_update) navigation.update_url();
    };

    /**
     * Clear function selection.
     */
    const clear_function = () => {
      state.selected_function.value = null;
      state.selected_file.value = null;
      state.showing_all_functions.value = false;
      navigation.update_url();
    };

    /**
     * Go back to file view.
     */
    const back_to_file = () => {
      state.selected_function.value = null;
      navigation.update_url();
    };

    /**
     * Navigate to a function by symbol.
     * @param {string} symbol - Function symbol
     * @param {string} filename - File path
     */
    const navigate_to_function = async (symbol, filename) => {
      const project_name = state.selected_project.value?.name;

      try {
        const results = await api.load_function_details(symbol, project_name);
        if (results.length > 0) {
          const match =
            results.find((r) => r.filename === filename) || results[0];
          state.selected_function.value = match;
          state.selected_file.value = match.filename;
        }
      } catch (error) {
        console.error('Failed to navigate to function:', error);
      }

      state.active_tab.value = 'source';
      state.callers.value = [];
      state.callees.value = [];
      navigation.update_url();
    };

    // ========================================
    // Callers/Callees/References loading
    // ========================================

    /**
     * Load callers for the selected function.
     */
    const load_callers = async () => {
      if (!state.selected_function.value || state.callers.value.length > 0)
        return;

      state.loading_callers.value = true;

      try {
        state.callers.value = await api.load_callers(
          state.selected_function.value.symbol,
          state.selected_project.value?.name
        );
      } catch (error) {
        console.error('Failed to load callers:', error);
      } finally {
        state.loading_callers.value = false;
      }
    };

    /**
     * Load callees for the selected function.
     */
    const load_callees = async () => {
      if (!state.selected_function.value || state.callees.value.length > 0)
        return;

      state.loading_callees.value = true;

      try {
        state.callees.value = await api.load_callees(
          state.selected_function.value.symbol,
          state.selected_project.value?.name
        );
      } catch (error) {
        console.error('Failed to load callees:', error);
      } finally {
        state.loading_callees.value = false;
      }
    };

    /**
     * Load references for struct/class entities.
     */
    const load_references = async () => {
      if (!state.selected_function.value) return;
      if (state.entity_references.value.length > 0) return;

      state.loading_references.value = true;

      try {
        const project_name = state.selected_project.value?.name;
        if (!project_name) return;

        const [refs, defs] = await Promise.all([
          api.load_entity_references(
            state.selected_function.value.symbol,
            project_name
          ),
          api.load_entity_definitions(state.selected_function.value.symbol)
        ]);

        state.entity_references.value = refs;
        state.reference_definitions.value = defs;
      } catch (error) {
        console.error('Failed to load references:', error);
      } finally {
        state.loading_references.value = false;
      }
    };

    /**
     * Set active tab for function detail view.
     * @param {string} tab - Tab name
     */
    const set_active_tab = async (tab) => {
      state.active_tab.value = tab;
      if (tab === 'callers') await load_callers();
      else if (tab === 'callees') await load_callees();
      else if (tab === 'callgraph') await load_inline_call_graph();
      else if (tab === 'flowchart') await load_flowchart();
      else if (tab === 'references') await load_references();
      navigation.update_url();
    };

    /**
     * Navigate to a definition (possibly in another project).
     * @param {Object} def - Definition object
     */
    const navigate_to_definition = async (def) => {
      if (
        def.project_name &&
        (!state.selected_project.value ||
          state.selected_project.value.name !== def.project_name)
      ) {
        const project = state.projects.value.find(
          (p) => p.name === def.project_name
        );
        if (project) {
          await select_project(project, true);
        }
      }

      try {
        const results = await api.load_function_details(
          def.symbol,
          def.project_name
        );
        if (results.length > 0) {
          const match =
            results.find((r) => r.id === def.id) ||
            results.find(
              (r) =>
                r.filename === def.filename && r.start_line === def.start_line
            ) ||
            results[0];
          await select_function(match, true);
        }
      } catch (error) {
        console.error('Failed to navigate to definition:', error);
      }

      navigation.update_url();
    };

    // ========================================
    // Call Graph functions
    // ========================================

    /**
     * Open call graph for a function.
     * @param {string} function_name - Function symbol
     * @param {boolean} skip_url_update - Skip URL update
     */
    const open_call_graph = async (function_name, skip_url_update = false) => {
      state.call_graph_root.value = function_name;
      state.show_call_graph.value = true;
      state.selected_function.value = null;
      state.selected_file.value = null;
      state.showing_all_functions.value = false;
      state.selected_graph_node.value = null;

      // Reset depth to default (5) when opening a new call graph via UI
      // (skip_url_update=false means user clicked, not URL navigation)
      if (!skip_url_update) {
        state.call_graph_depth.value = 5;
      }

      await load_call_graph_for_node(function_name);
      if (!skip_url_update) navigation.update_url();
    };

    /**
     * Load call graph data for a node.
     * @param {string} function_name - Function symbol
     */
    const load_call_graph_for_node = async (function_name) => {
      state.loading_call_graph.value = true;
      state.call_graph_root.value = function_name;
      state.selected_graph_node.value = null;

      try {
        state.call_graph_data.value = await api.load_call_graph(
          function_name,
          state.selected_project.value.name,
          0 // Unlimited depth - filter client-side
        );
      } catch (error) {
        console.error('Failed to load call graph:', error);
        state.call_graph_data.value = { error: error.message };
      } finally {
        state.loading_call_graph.value = false;
        await nextTick();
        setTimeout(() => {
          call_graph_renderer.render_graph();
        }, 50);
      }
    };

    /**
     * Close call graph view.
     */
    const close_call_graph = () => {
      state.show_call_graph.value = false;
      state.call_graph_data.value = null;
      state.tree_data.value = null;
      state.selected_graph_node.value = null;
      state.graph_view_type.value = 'callgraph';
      call_graph_renderer.stop_simulation();
      navigation.update_url();
    };

    /**
     * Set call graph depth and re-render.
     * @param {number} new_depth - New depth value
     */
    const set_call_graph_depth = async (new_depth) => {
      state.call_graph_depth.value = new_depth;
      if (
        state.call_graph_data.value &&
        state.show_call_graph.value &&
        state.graph_view_type.value === 'callgraph'
      ) {
        await nextTick();
        call_graph_renderer.render_graph();
      }
      navigation.update_url();
    };

    /**
     * Switch between graph view types.
     * @param {string} view_type - View type (callgraph, callers, callees)
     */
    const switch_graph_view = async (view_type) => {
      if (state.graph_view_type.value === view_type) return;
      state.graph_view_type.value = view_type;
      state.selected_graph_node.value = null;

      if (view_type === 'callgraph') {
        await load_call_graph_for_node(state.call_graph_root.value);
      } else {
        await load_tree_view(state.call_graph_root.value, view_type);
      }
    };

    /**
     * Load caller or callee tree.
     * @param {string} function_name - Function symbol
     * @param {string} view_type - View type (callers or callees)
     */
    const load_tree_view = async (function_name, view_type) => {
      state.loading_call_graph.value = true;
      state.tree_data.value = null;
      state.call_graph_data.value = null;
      state.selected_graph_node.value = null;

      try {
        const data = await api.load_tree(
          function_name,
          state.selected_project.value.name,
          view_type,
          state.tree_depth.value
        );
        if (data.error) {
          state.call_graph_data.value = data;
        } else {
          state.tree_data.value = data;
        }
      } catch (error) {
        console.error('Failed to load tree:', error);
        state.call_graph_data.value = { error: error.message };
      } finally {
        state.loading_call_graph.value = false;
        await nextTick();
        setTimeout(() => {
          tree_renderer.render_tree();
        }, 50);
      }
    };

    /**
     * Reload tree view when depth changes.
     */
    const reload_tree_view = async () => {
      if (state.graph_view_type.value !== 'callgraph') {
        await load_tree_view(
          state.call_graph_root.value,
          state.graph_view_type.value
        );
      }
    };

    /**
     * Recenter tree on a different node.
     * @param {string} symbol - Function symbol
     */
    const recenter_tree_on_node = async (symbol) => {
      state.call_graph_root.value = symbol;
      await load_tree_view(symbol, state.graph_view_type.value);
    };

    // ========================================
    // Flowchart functions
    // ========================================

    /**
     * Load control flow flowchart.
     */
    const load_flowchart = async () => {
      if (!state.selected_function.value) return;

      if (state.flowchart_data.value) {
        await nextTick();
        setTimeout(() => {
          flowchart_renderer.render_flowchart();
        }, 50);
        return;
      }

      state.loading_flowchart.value = true;
      state.flowchart_error.value = '';
      state.selected_flowchart_node.value = null;

      try {
        const data = await api.load_control_flow(
          state.selected_function.value.symbol,
          state.selected_project.value.name,
          state.selected_function.value.filename
        );

        if (data.error) {
          state.flowchart_error.value = data.error;
          return;
        }

        state.flowchart_data.value = data;
      } catch (error) {
        console.error('Failed to load flowchart:', error);
        state.flowchart_error.value = 'Failed to load flowchart';
      } finally {
        state.loading_flowchart.value = false;
        await nextTick();
        setTimeout(() => {
          flowchart_renderer.render_flowchart();
        }, 50);
      }
    };

    // ========================================
    // Inline call graph functions
    // ========================================

    /**
     * Load inline call graph for function detail tab.
     */
    const load_inline_call_graph = async () => {
      if (!state.selected_function.value) return;

      if (state.inline_call_graph_data.value) {
        await nextTick();
        setTimeout(() => {
          inline_graph_renderer.render_inline_call_graph();
        }, 50);
        return;
      }

      state.loading_inline_call_graph.value = true;
      state.inline_call_graph_error.value = '';
      state.selected_inline_graph_node.value = null;

      try {
        const data = await api.load_call_graph(
          state.selected_function.value.symbol,
          state.selected_project.value.name,
          0 // Unlimited depth
        );

        if (data.error) {
          state.inline_call_graph_error.value = data.error;
          return;
        }

        state.inline_call_graph_data.value = data;
      } catch (error) {
        console.error('Failed to load inline call graph:', error);
        state.inline_call_graph_error.value = 'Failed to load call graph';
      } finally {
        state.loading_inline_call_graph.value = false;
        await nextTick();
        setTimeout(() => {
          inline_graph_renderer.render_inline_call_graph();
        }, 50);
      }
    };

    /**
     * Recenter inline call graph on a different function.
     * @param {string} symbol - Function symbol
     */
    const recenter_inline_graph = async (symbol) => {
      state.loading_inline_call_graph.value = true;
      state.inline_call_graph_error.value = '';
      state.selected_inline_graph_node.value = null;

      try {
        const data = await api.load_call_graph(
          symbol,
          state.selected_project.value.name,
          0
        );

        if (data.error) {
          state.inline_call_graph_error.value = data.error;
          return;
        }

        state.inline_call_graph_data.value = data;
      } catch (error) {
        console.error('Failed to recenter inline call graph:', error);
        state.inline_call_graph_error.value = 'Failed to load call graph';
      } finally {
        state.loading_inline_call_graph.value = false;
        await nextTick();
        setTimeout(() => {
          inline_graph_renderer.render_inline_call_graph();
        }, 50);
      }
    };

    /**
     * Set inline call graph depth and re-render.
     * @param {number} new_depth - New depth value
     */
    const set_inline_call_graph_depth = async (new_depth) => {
      state.inline_call_graph_depth.value = new_depth;

      if (
        state.inline_call_graph_data.value &&
        state.active_tab.value === 'callgraph'
      ) {
        await nextTick();
        inline_graph_renderer.render_inline_call_graph();
      }
    };

    /**
     * Toggle fullscreen for inline call graph.
     */
    const toggle_inline_graph_fullscreen = () => {
      state.inline_graph_fullscreen.value =
        !state.inline_graph_fullscreen.value;
      nextTick(() => {
        if (state.inline_call_graph_data.value) {
          inline_graph_renderer.render_inline_call_graph();
        }
      });
    };

    /**
     * Toggle fullscreen for flowchart.
     */
    const toggle_flowchart_fullscreen = () => {
      state.flowchart_fullscreen.value = !state.flowchart_fullscreen.value;
      nextTick(() => {
        if (state.flowchart_data.value) {
          flowchart_renderer.render_flowchart();
        }
      });
    };

    /**
     * View function details from graph node.
     * @param {Object} node - Graph node
     */
    const view_function_details = async (node) => {
      state.show_call_graph.value = false;

      try {
        const results = await api.load_function_details(
          node.symbol,
          state.selected_project.value?.name
        );
        if (results.length > 0) {
          state.selected_function.value =
            results.find((r) => r.id === node.id) || results[0];
          state.selected_file.value = state.selected_function.value.filename;
        }
      } catch (error) {
        console.error('Failed to load function details:', error);
      }

      state.active_tab.value = 'source';
      state.callers.value = [];
      state.callees.value = [];
    };

    // ========================================
    // Pagination functions
    // ========================================

    /**
     * Show more files.
     */
    const show_more_files = () => {
      state.file_display_limit.value += state.FILE_DISPLAY_INCREMENT;
    };

    /**
     * Show all files.
     */
    const show_all_files = () => {
      if (state.project_info.value?.files) {
        state.file_display_limit.value = state.project_info.value.files.length;
      }
    };

    /**
     * Show more functions.
     */
    const show_more_functions = () => {
      state.function_display_limit.value += state.FUNCTION_DISPLAY_INCREMENT;
    };

    /**
     * Show all function items.
     */
    const show_all_functions_items = () => {
      if (state.all_functions.value) {
        state.function_display_limit.value = state.all_functions.value.length;
      }
    };

    /**
     * Close read-only modal.
     */
    const close_read_only_modal = () => {
      state.show_read_only_modal.value = false;
    };

    // ========================================
    // Create navigation handlers
    // ========================================

    const navigation_handlers = {
      select_project,
      select_file,
      show_all_functions,
      load_function_by_symbol: (symbol) =>
        api.load_function_details(symbol, state.selected_project.value?.name),
      load_callers,
      load_callees,
      load_inline_call_graph,
      load_flowchart,
      load_references,
      open_call_graph,
      reload_tree_view,
      load_analysis_dashboard: () =>
        analysis_handlers.load_analysis_dashboard(),
      load_analysis_detail: (type) =>
        analysis_handlers.load_analysis_detail(type),
      stop_simulation: () => call_graph_renderer.stop_simulation()
    };

    const navigation = create_navigation(state, navigation_handlers);
    const dir_navigation = create_directory_navigation(
      state,
      navigation.update_url
    );
    const dir_computed = create_directory_computed(state, Vue);

    // ========================================
    // Create job and import handlers
    // ========================================

    const job_manager = create_job_manager(state, api);
    const import_handlers = create_import_handlers(
      state,
      api,
      job_manager,
      load_projects,
      navigation.update_url
    );

    // ========================================
    // Create analysis handlers
    // ========================================

    const analysis_handlers = create_analysis_handlers(
      state,
      api,
      navigation.update_url
    );

    // ========================================
    // Lifecycle
    // ========================================

    // Listen for browser back/forward
    window.addEventListener('popstate', () => {
      navigation.reset_to_home(true);
      navigation.parse_url();
    });

    onMounted(async () => {
      await load_server_status();
      await load_projects();
      await job_manager.load_job_queue();
      await navigation.parse_url();

      // Initialize WebSocket for real-time job updates
      await job_manager.init_web_socket();

      // Fall back to polling if WebSocket not connected and there are active jobs
      if (
        !state.ws_connected.value &&
        (state.job_queue_stats.value.running > 0 ||
          state.job_queue_stats.value.queued > 0)
      ) {
        job_manager.start_job_polling();
      }

      // Escape key to close fullscreen
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          if (state.inline_graph_fullscreen.value) {
            state.inline_graph_fullscreen.value = false;
            nextTick(() => {
              if (state.inline_call_graph_data.value) {
                inline_graph_renderer.render_inline_call_graph();
              }
            });
          }
          if (state.flowchart_fullscreen.value) {
            state.flowchart_fullscreen.value = false;
            nextTick(() => {
              if (state.flowchart_data.value) {
                flowchart_renderer.render_flowchart();
              }
            });
          }
        }
      });
    });

    // ========================================
    // Return all values and methods for template
    // ========================================

    return {
      // State (using camelCase for Vue template compatibility)
      projects: state.projects,
      loadingProjects: state.loading_projects,
      selectedProject: state.selected_project,
      projectInfo: state.project_info,
      searchQuery: state.search_query,
      searchResults: state.search_results,
      hasSearched: state.has_searched,
      selectedFile: state.selected_file,
      fileFunctions: state.file_functions,
      loadingFileFunctions: state.loading_file_functions,
      fileAnalytics: state.file_analytics,
      loadingFileAnalytics: state.loading_file_analytics,
      showingAllFunctions: state.showing_all_functions,
      allFunctions: state.all_functions,
      loadingAllFunctions: state.loading_all_functions,
      selectedFunction: state.selected_function,
      activeTab: state.active_tab,
      classMembers: state.class_members,
      loadingClassMembers: state.loading_class_members,
      callers: state.callers,
      callees: state.callees,
      loadingCallers: state.loading_callers,
      loadingCallees: state.loading_callees,
      showCallGraph: state.show_call_graph,
      callGraphRoot: state.call_graph_root,
      callGraphData: state.call_graph_data,
      loadingCallGraph: state.loading_call_graph,
      selectedGraphNode: state.selected_graph_node,
      graphContainer: state.graph_container,
      graphSvg: state.graph_svg,
      callGraphDepth: state.call_graph_depth,
      graphViewType: state.graph_view_type,
      treeData: state.tree_data,
      treeDepth: state.tree_depth,
      flowchartData: state.flowchart_data,
      loadingFlowchart: state.loading_flowchart,
      flowchartError: state.flowchart_error,
      flowchartContainer: state.flowchart_container,
      flowchartSvg: state.flowchart_svg,
      selectedFlowchartNode: state.selected_flowchart_node,
      inlineCallGraphData: state.inline_call_graph_data,
      loadingInlineCallGraph: state.loading_inline_call_graph,
      inlineCallGraphError: state.inline_call_graph_error,
      inlineGraphContainer: state.inline_graph_container,
      inlineGraphSvg: state.inline_graph_svg,
      selectedInlineGraphNode: state.selected_inline_graph_node,
      inlineCallGraphDepth: state.inline_call_graph_depth,
      searchSuggestions: state.search_suggestions,
      showAutocomplete: state.show_autocomplete,
      autocompleteIndex: state.autocomplete_index,
      entityReferences: state.entity_references,
      referenceDefinitions: state.reference_definitions,
      loadingReferences: state.loading_references,
      showImportModal: state.show_import_modal,
      importPath: state.import_path,
      importName: state.import_name,
      importing: state.importing,
      importError: state.import_error,
      importSuccess: state.import_success,
      refreshingProject: state.refreshing_project,
      jobs: state.jobs,
      jobQueueStats: state.job_queue_stats,
      jobQueueMinimized: state.job_queue_minimized,
      showJobsView: state.show_jobs_view,
      loadingProjectInfo: state.loading_project_info,
      showAnalysisView: state.show_analysis_view,
      analysisData: state.analysis_data,
      loadingAnalysis: state.loading_analysis,
      analysisTab: state.analysis_tab,
      analysisDetail: state.analysis_detail,
      loadingAnalysisDetail: state.loading_analysis_detail,
      inlineGraphFullscreen: state.inline_graph_fullscreen,
      flowchartFullscreen: state.flowchart_fullscreen,
      currentDirectory: state.current_directory,
      serverReadOnly: state.server_read_only,
      showReadOnlyModal: state.show_read_only_modal,

      // Computed properties
      displayedFiles: dir_computed.displayed_files,
      hasMoreFiles: dir_computed.has_more_files,
      remainingFilesCount: dir_computed.remaining_files_count,
      displayedFunctions: dir_computed.displayed_functions,
      hasMoreFunctions: dir_computed.has_more_functions,
      remainingFunctionsCount: dir_computed.remaining_functions_count,
      directoryContents: dir_computed.directory_contents,
      directoryBreadcrumbs: dir_computed.directory_breadcrumbs,
      groupedReferences: dir_computed.grouped_references,

      // Methods - using camelCase for Vue template compatibility
      selectProject: select_project,
      selectFile: select_file,
      clearFile: clear_file,
      showAllFunctions: show_all_functions,
      clearAllFunctions: clear_all_functions,
      searchFunctions: search_functions,
      selectFunction: select_function,
      clearFunction: clear_function,
      backToFile: back_to_file,
      navigateToFunction: navigate_to_function,
      loadCallers: load_callers,
      loadCallees: load_callees,
      loadReferences: load_references,
      setActiveTab: set_active_tab,
      navigateToDefinition: navigate_to_definition,
      openCallGraph: open_call_graph,
      loadCallGraphForNode: load_call_graph_for_node,
      closeCallGraph: close_call_graph,
      setCallGraphDepth: set_call_graph_depth,
      switchGraphView: switch_graph_view,
      loadTreeView: load_tree_view,
      reloadTreeView: reload_tree_view,
      recenterTreeOnNode: recenter_tree_on_node,
      loadFlowchart: load_flowchart,
      loadInlineCallGraph: load_inline_call_graph,
      recenterInlineGraph: recenter_inline_graph,
      setInlineCallGraphDepth: set_inline_call_graph_depth,
      toggleInlineGraphFullscreen: toggle_inline_graph_fullscreen,
      toggleFlowchartFullscreen: toggle_flowchart_fullscreen,
      viewFunctionDetails: view_function_details,
      onSearchInput: on_search_input,
      navigateAutocomplete: navigate_autocomplete,
      selectAutocompleteItem: select_autocomplete_item,
      selectSuggestion: select_suggestion,
      closeAutocomplete: close_autocomplete,
      onSearchBlur: on_search_blur,
      resetToHome: navigation.reset_to_home,
      showMoreFiles: show_more_files,
      showAllFiles: show_all_files,
      showMoreFunctions: show_more_functions,
      showAllFunctionsItems: show_all_functions_items,
      closeReadOnlyModal: close_read_only_modal,

      // Directory navigation
      navigateToDirectory: dir_navigation.navigate_to_directory,
      navigateUp: dir_navigation.navigate_up,
      navigateToRoot: dir_navigation.navigate_to_root,
      navigateToFileDirectory: dir_navigation.navigate_to_file_directory,
      navigateToBreadcrumb: dir_navigation.navigate_to_breadcrumb,
      getFilePathParts: path_helpers.get_file_path_parts,
      getFileName: path_helpers.get_file_name,

      // Renderer zoom controls
      zoomIn: call_graph_renderer.zoom_in,
      zoomOut: call_graph_renderer.zoom_out,
      resetZoom: call_graph_renderer.reset_zoom,
      flowchartZoomIn: flowchart_renderer.zoom_in,
      flowchartZoomOut: flowchart_renderer.zoom_out,
      flowchartResetZoom: flowchart_renderer.reset_zoom,
      inlineGraphZoomIn: inline_graph_renderer.zoom_in,
      inlineGraphZoomOut: inline_graph_renderer.zoom_out,
      inlineGraphResetZoom: inline_graph_renderer.reset_zoom,

      // Job management
      toggleJobsView: import_handlers.toggle_jobs_view,
      closeImportModal: import_handlers.close_import_modal,
      importProject: import_handlers.import_project,
      refreshProject: (name) =>
        import_handlers.refresh_project(name, async (project_name) => {
          state.project_info.value = await api.load_project_info(project_name);
        }),

      // Analysis
      toggleAnalysisView: analysis_handlers.toggle_analysis_view,
      closeAnalysisView: analysis_handlers.close_analysis_view,
      loadAnalysisDashboard: analysis_handlers.load_analysis_dashboard,
      loadAnalysisDetail: analysis_handlers.load_analysis_detail,
      setAnalysisTab: analysis_handlers.set_analysis_tab,
      navigateToFunctionById: analysis_handlers.navigate_to_function_by_id,

      // Formatters
      formatDate: formatters.format_date,
      formatNumber: formatters.format_number,
      formatDuration: formatters.format_duration,
      formatReferenceType: formatters.format_reference_type,
      getDistributionPercent: formatters.get_distribution_percent
    };
  }
}).mount('#app');
