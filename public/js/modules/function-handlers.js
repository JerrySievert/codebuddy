/**
 * Function handlers module.
 * Contains functions for selecting, navigating, and loading function details.
 */

/**
 * Creates function selection handlers.
 * @param {Object} state - Application state
 * @param {Object} api - API module
 * @param {Object} navigation - Navigation handlers
 * @returns {Object} Function selection functions
 */
export const create_function_handlers = (state, api, navigation) => {
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
      const results = await api.load_function_details(fn.symbol, project_name);
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
    state.reverse_call_graph_data.value = null;
    state.reverse_call_graph_error.value = '';
    state.reverse_call_graph_depth.value = 5; // Reset to default depth
    state.selected_reverse_graph_node.value = null;
    state.heatmap_data.value = null;
    state.heatmap_error.value = '';
    state.heatmap_depth.value = 3; // Reset to default depth
    state.selected_heatmap_node.value = null;

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

  return {
    select_function,
    clear_function,
    back_to_file,
    navigate_to_function
  };
};

/**
 * Creates callers/callees/references handlers.
 * @param {Object} state - Application state
 * @param {Object} api - API module
 * @param {Object} navigation - Navigation handlers
 * @param {Object} graph_handlers - Graph handlers for loading graphs
 * @param {Object} flowchart_handlers - Flowchart handlers
 * @param {Object} reverse_graph_handlers - Reverse graph handlers (optional)
 * @param {Object} heatmap_handlers - Heatmap handlers (optional)
 * @returns {Object} Callers/callees/references functions
 */
export const create_callers_callees_handlers = (
  state,
  api,
  navigation,
  graph_handlers,
  flowchart_handlers,
  reverse_graph_handlers = null,
  heatmap_handlers = null
) => {
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
    else if (tab === 'callgraph') await graph_handlers.load_inline_call_graph();
    else if (tab === 'reversegraph' && reverse_graph_handlers)
      await reverse_graph_handlers.load_reverse_call_graph();
    else if (tab === 'flowchart') await flowchart_handlers.load_flowchart();
    else if (tab === 'heatmap' && heatmap_handlers)
      await heatmap_handlers.load_heatmap();
    else if (tab === 'references') await load_references();
    navigation.update_url();
  };

  /**
   * Navigate to a definition (possibly in another project).
   * @param {Object} def - Definition object
   * @param {Function} select_project - Project selection function
   * @param {Function} select_function - Function selection function
   */
  const navigate_to_definition = async (
    def,
    select_project,
    select_function
  ) => {
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

  return {
    load_callers,
    load_callees,
    load_references,
    set_active_tab,
    navigate_to_definition
  };
};
