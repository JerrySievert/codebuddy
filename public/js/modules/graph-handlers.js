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
   * @param {string|Object} symbol_or_node - Function symbol or node object with symbol and project
   */
  const load_call_graph_for_node = async (symbol_or_node) => {
    // Handle both string (symbol) and object (node) inputs
    const function_name =
      typeof symbol_or_node === 'string'
        ? symbol_or_node
        : symbol_or_node.symbol;
    const project_name =
      typeof symbol_or_node === 'object' && symbol_or_node.project
        ? symbol_or_node.project
        : state.selected_project.value.name;

    state.loading_call_graph.value = true;
    state.call_graph_root.value = function_name;
    state.selected_graph_node.value = null;

    try {
      state.call_graph_data.value = await api.load_call_graph(
        function_name,
        project_name,
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
   * @param {string|Object} symbol_or_node - Function symbol or node object with symbol and project
   * @param {string} view_type - View type (callers or callees)
   */
  const load_tree_view = async (symbol_or_node, view_type) => {
    // Handle both string (symbol) and object (node) inputs
    const function_name =
      typeof symbol_or_node === 'string'
        ? symbol_or_node
        : symbol_or_node.symbol;
    const project_name =
      typeof symbol_or_node === 'object' && symbol_or_node.project
        ? symbol_or_node.project
        : state.selected_project.value.name;

    state.loading_call_graph.value = true;
    state.tree_data.value = null;
    state.call_graph_data.value = null;
    state.selected_graph_node.value = null;

    try {
      const data = await api.load_tree(
        function_name,
        project_name,
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
   * @param {string|Object} symbol_or_node - Function symbol or node object with symbol and project
   */
  const recenter_tree_on_node = async (symbol_or_node) => {
    // Handle both string (symbol) and object (node) inputs
    const symbol =
      typeof symbol_or_node === 'string'
        ? symbol_or_node
        : symbol_or_node.symbol;
    state.call_graph_root.value = symbol;
    await load_tree_view(symbol_or_node, state.graph_view_type.value);
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

  /**
   * Toggle fullscreen for main call graph.
   */
  const toggle_call_graph_fullscreen = () => {
    state.call_graph_fullscreen.value = !state.call_graph_fullscreen.value;
    nextTick(() => {
      if (state.call_graph_data.value) {
        call_graph_renderer.render_graph();
      }
    });
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
    view_function_details,
    toggle_call_graph_fullscreen
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
   * @param {string|Object} symbol_or_node - Function symbol or node object with symbol and project
   */
  const recenter_inline_graph = async (symbol_or_node) => {
    // Handle both string (symbol) and object (node) inputs
    const symbol =
      typeof symbol_or_node === 'string'
        ? symbol_or_node
        : symbol_or_node.symbol;
    const project_name =
      typeof symbol_or_node === 'object' && symbol_or_node.project
        ? symbol_or_node.project
        : state.selected_project.value.name;

    state.loading_inline_call_graph.value = true;
    state.inline_call_graph_error.value = '';
    state.selected_inline_graph_node.value = null;

    try {
      const data = await api.load_call_graph(symbol, project_name, 0);

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

/**
 * Creates reverse call graph handlers (callers only).
 * @param {Object} state - Application state
 * @param {Object} api - API module
 * @param {Object} reverse_graph_renderer - Reverse graph renderer
 * @param {Function} nextTick - Vue nextTick function
 * @returns {Object} Reverse call graph functions
 */
export const create_reverse_graph_handlers = (
  state,
  api,
  reverse_graph_renderer,
  nextTick
) => {
  /**
   * Load reverse call graph for function detail tab.
   */
  const load_reverse_call_graph = async () => {
    if (!state.selected_function.value) return;

    // Always reload with current depth setting
    state.loading_reverse_call_graph.value = true;
    state.reverse_call_graph_error.value = '';
    state.selected_reverse_graph_node.value = null;

    try {
      const data = await api.load_reverse_call_graph(
        state.selected_function.value.symbol,
        state.selected_project.value.name,
        state.reverse_call_graph_depth.value
      );

      if (data.error) {
        state.reverse_call_graph_error.value = data.error;
        return;
      }

      state.reverse_call_graph_data.value = data;
    } catch (error) {
      console.error('Failed to load reverse call graph:', error);
      state.reverse_call_graph_error.value =
        'Failed to load reverse call graph';
    } finally {
      state.loading_reverse_call_graph.value = false;
      await nextTick();
      setTimeout(() => {
        reverse_graph_renderer.render_reverse_call_graph();
      }, 50);
    }
  };

  /**
   * Recenter reverse call graph on a different function.
   * @param {string|Object} symbol_or_node - Function symbol or node object with project info
   */
  const recenter_reverse_graph = async (symbol_or_node) => {
    state.loading_reverse_call_graph.value = true;
    state.reverse_call_graph_error.value = '';
    state.selected_reverse_graph_node.value = null;

    // Handle both string (symbol) and object (node) inputs
    const symbol =
      typeof symbol_or_node === 'string'
        ? symbol_or_node
        : symbol_or_node.symbol;
    const project_name =
      typeof symbol_or_node === 'object' && symbol_or_node.project
        ? symbol_or_node.project
        : state.selected_project.value.name;

    try {
      const data = await api.load_reverse_call_graph(
        symbol,
        project_name,
        state.reverse_call_graph_depth.value
      );

      if (data.error) {
        state.reverse_call_graph_error.value = data.error;
        return;
      }

      state.reverse_call_graph_data.value = data;
    } catch (error) {
      console.error('Failed to recenter reverse call graph:', error);
      state.reverse_call_graph_error.value =
        'Failed to load reverse call graph';
    } finally {
      state.loading_reverse_call_graph.value = false;
      await nextTick();
      setTimeout(() => {
        reverse_graph_renderer.render_reverse_call_graph();
      }, 50);
    }
  };

  /**
   * Set reverse call graph depth and reload.
   * @param {number} new_depth - New depth value
   */
  const set_reverse_call_graph_depth = async (new_depth) => {
    state.reverse_call_graph_depth.value = new_depth;

    if (
      state.active_tab.value === 'reversegraph' &&
      state.selected_function.value
    ) {
      await load_reverse_call_graph();
    }
  };

  /**
   * Toggle fullscreen for reverse call graph.
   */
  const toggle_reverse_graph_fullscreen = () => {
    state.reverse_graph_fullscreen.value =
      !state.reverse_graph_fullscreen.value;
    nextTick(() => {
      if (state.reverse_call_graph_data.value) {
        reverse_graph_renderer.render_reverse_call_graph();
      }
    });
  };

  return {
    load_reverse_call_graph,
    recenter_reverse_graph,
    set_reverse_call_graph_depth,
    toggle_reverse_graph_fullscreen
  };
};

/**
 * Creates heatmap handlers.
 * @param {Object} state - Application state
 * @param {Object} api - API module
 * @param {Object} heatmap_renderer - Heatmap renderer
 * @param {Function} nextTick - Vue nextTick function
 * @returns {Object} Heatmap functions
 */
export const create_heatmap_handlers = (
  state,
  api,
  heatmap_renderer,
  nextTick
) => {
  /**
   * Load heatmap for function detail tab.
   */
  const load_heatmap = async () => {
    if (!state.selected_function.value) return;

    // Always reload with current depth setting
    state.loading_heatmap.value = true;
    state.heatmap_error.value = '';
    state.selected_heatmap_node.value = null;

    try {
      const data = await api.load_heatmap(
        state.selected_function.value.symbol,
        state.selected_project.value.name,
        state.heatmap_depth.value
      );

      if (data.error) {
        state.heatmap_error.value = data.error;
        return;
      }

      state.heatmap_data.value = data;
    } catch (error) {
      console.error('Failed to load heatmap:', error);
      state.heatmap_error.value = 'Failed to load heatmap';
    } finally {
      state.loading_heatmap.value = false;
      await nextTick();
      setTimeout(() => {
        heatmap_renderer.render_heatmap();
      }, 50);
    }
  };

  /**
   * Recenter heatmap on a different function.
   * @param {string|Object} symbol_or_node - Function symbol or node object with project info
   */
  const recenter_heatmap = async (symbol_or_node) => {
    state.loading_heatmap.value = true;
    state.heatmap_error.value = '';
    state.selected_heatmap_node.value = null;

    // Handle both string (symbol) and object (node) inputs
    const symbol =
      typeof symbol_or_node === 'string'
        ? symbol_or_node
        : symbol_or_node.symbol;
    const project_name =
      typeof symbol_or_node === 'object' && symbol_or_node.project
        ? symbol_or_node.project
        : state.selected_project.value.name;

    try {
      const data = await api.load_heatmap(
        symbol,
        project_name,
        state.heatmap_depth.value
      );

      if (data.error) {
        state.heatmap_error.value = data.error;
        return;
      }

      state.heatmap_data.value = data;
    } catch (error) {
      console.error('Failed to recenter heatmap:', error);
      state.heatmap_error.value = 'Failed to load heatmap';
    } finally {
      state.loading_heatmap.value = false;
      await nextTick();
      setTimeout(() => {
        heatmap_renderer.render_heatmap();
      }, 50);
    }
  };

  /**
   * Set heatmap depth and reload.
   * @param {number} new_depth - New depth value
   */
  const set_heatmap_depth = async (new_depth) => {
    state.heatmap_depth.value = new_depth;

    if (state.active_tab.value === 'heatmap' && state.selected_function.value) {
      await load_heatmap();
    }
  };

  /**
   * Set heatmap view type and re-render.
   * @param {string} view_type - 'treemap' or 'matrix'
   */
  const set_heatmap_view_type = (view_type) => {
    state.heatmap_view_type.value = view_type;
    nextTick(() => {
      if (state.heatmap_data.value) {
        heatmap_renderer.render_heatmap();
      }
    });
  };

  /**
   * Toggle fullscreen for heatmap.
   */
  const toggle_heatmap_fullscreen = () => {
    state.heatmap_fullscreen.value = !state.heatmap_fullscreen.value;
    nextTick(() => {
      if (state.heatmap_data.value) {
        heatmap_renderer.render_heatmap();
      }
    });
  };

  return {
    load_heatmap,
    recenter_heatmap,
    set_heatmap_depth,
    set_heatmap_view_type,
    toggle_heatmap_fullscreen
  };
};
