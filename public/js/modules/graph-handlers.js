/**
 * Graph handlers module.
 * Contains functions for managing call graphs and flowcharts.
 */

/**
 * Creates call graph handlers.
 * @param {Object} state - Application state
 * @param {Object} api - API module
 * @param {Object} navigation - Navigation handlers
 * @param {Object} call_graph_renderer - Call graph renderer
 * @param {Object} tree_renderer - Tree renderer
 * @param {Function} nextTick - Vue nextTick function
 * @returns {Object} Call graph functions
 */
export const create_call_graph_handlers = (
  state,
  api,
  navigation,
  call_graph_renderer,
  tree_renderer,
  nextTick
) => {
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

  /**
   * View function details from graph node.
   * @param {Object} node - Graph node
   * @param {Function} select_function_callback - Callback to set selected function
   */
  const view_function_details = async (node, select_function_callback) => {
    state.show_call_graph.value = false;

    try {
      const results = await api.load_function_details(
        node.symbol,
        state.selected_project.value?.name
      );
      if (results.length > 0) {
        const selected = results.find((r) => r.id === node.id) || results[0];
        select_function_callback(selected);
      }
    } catch (error) {
      console.error('Failed to load function details:', error);
    }
  };

  return {
    open_call_graph,
    load_call_graph_for_node,
    close_call_graph,
    set_call_graph_depth,
    switch_graph_view,
    load_tree_view,
    reload_tree_view,
    recenter_tree_on_node,
    view_function_details
  };
};

/**
 * Creates flowchart handlers.
 * @param {Object} state - Application state
 * @param {Object} api - API module
 * @param {Object} flowchart_renderer - Flowchart renderer
 * @param {Function} nextTick - Vue nextTick function
 * @returns {Object} Flowchart functions
 */
export const create_flowchart_handlers = (
  state,
  api,
  flowchart_renderer,
  nextTick
) => {
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

  return {
    load_flowchart,
    toggle_flowchart_fullscreen
  };
};

/**
 * Creates inline call graph handlers.
 * @param {Object} state - Application state
 * @param {Object} api - API module
 * @param {Object} inline_graph_renderer - Inline graph renderer
 * @param {Function} nextTick - Vue nextTick function
 * @returns {Object} Inline call graph functions
 */
export const create_inline_graph_handlers = (
  state,
  api,
  inline_graph_renderer,
  nextTick
) => {
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
    state.inline_graph_fullscreen.value = !state.inline_graph_fullscreen.value;
    nextTick(() => {
      if (state.inline_call_graph_data.value) {
        inline_graph_renderer.render_inline_call_graph();
      }
    });
  };

  return {
    load_inline_call_graph,
    recenter_inline_graph,
    set_inline_call_graph_depth,
    toggle_inline_graph_fullscreen
  };
};
