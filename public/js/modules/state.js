/**
 * State management module for the application.
 * Contains all reactive state declarations using Vue's ref().
 */

/**
 * Creates all application state refs.
 * @param {Function} ref - Vue ref function
 * @returns {Object} All state refs
 */
export const create_state = (ref) => {
  // Project state
  const projects = ref([]);
  const loading_projects = ref(true);
  const selected_project = ref(null);
  const project_info = ref(null);
  const loading_project_info = ref(false);

  // Search state
  const search_query = ref('');
  const search_results = ref([]);
  const has_searched = ref(false);

  // File state
  const selected_file = ref(null);
  const file_functions = ref([]);
  const loading_file_functions = ref(false);
  const file_analytics = ref(null);
  const loading_file_analytics = ref(false);

  // All functions view state
  const showing_all_functions = ref(false);
  const all_functions = ref([]);
  const loading_all_functions = ref(false);

  // Function detail state
  const selected_function = ref(null);
  const active_tab = ref('source');
  const class_members = ref([]);
  const loading_class_members = ref(false);

  // Callers/callees state
  const callers = ref([]);
  const callees = ref([]);
  const loading_callers = ref(false);
  const loading_callees = ref(false);

  // Entity references state (for struct/class)
  const entity_references = ref([]);
  const reference_definitions = ref([]);
  const loading_references = ref(false);

  // Call graph state
  const show_call_graph = ref(false);
  const call_graph_root = ref('');
  const call_graph_data = ref(null);
  const loading_call_graph = ref(false);
  const selected_graph_node = ref(null);
  const graph_container = ref(null);
  const graph_svg = ref(null);
  const call_graph_depth = ref(5);

  // Flowchart/tree view state
  const graph_view_type = ref('callgraph');
  const tree_data = ref(null);
  const tree_depth = ref(2);

  // Control flow flowchart state
  const flowchart_data = ref(null);
  const loading_flowchart = ref(false);
  const flowchart_error = ref('');
  const flowchart_container = ref(null);
  const flowchart_svg = ref(null);
  const selected_flowchart_node = ref(null);

  // Inline call graph state (for function detail tab)
  const inline_call_graph_data = ref(null);
  const loading_inline_call_graph = ref(false);
  const inline_call_graph_error = ref('');
  const inline_graph_container = ref(null);
  const inline_graph_svg = ref(null);
  const selected_inline_graph_node = ref(null);
  const inline_call_graph_depth = ref(5);
  const inline_graph_fullscreen = ref(false);
  const flowchart_fullscreen = ref(false);

  // Autocomplete search state
  const search_suggestions = ref([]);
  const show_autocomplete = ref(false);
  const autocomplete_index = ref(-1);

  // Import/Refresh state
  const show_import_modal = ref(false);
  const import_path = ref('');
  const import_name = ref('');
  const importing = ref(false);
  const import_error = ref('');
  const import_success = ref('');
  const refreshing_project = ref(null);

  // Job queue state
  const jobs = ref([]);
  const job_queue_stats = ref({
    queued: 0,
    running: 0,
    completed: 0,
    failed: 0,
    total: 0
  });
  const job_queue_minimized = ref(false);
  const show_jobs_view = ref(false);
  const ws_connected = ref(false);

  // File list display state (for large projects)
  const file_display_limit = ref(100);
  const FILE_DISPLAY_INCREMENT = 100;

  // Directory navigation state
  const current_directory = ref('');

  // Function list display state (for all entities view)
  const function_display_limit = ref(100);
  const FUNCTION_DISPLAY_INCREMENT = 100;

  // Analysis state
  const show_analysis_view = ref(false);
  const analysis_data = ref(null);
  const loading_analysis = ref(false);
  const analysis_tab = ref('overview');
  const analysis_detail = ref(null);
  const loading_analysis_detail = ref(false);

  // Server status state
  const server_read_only = ref(false);
  const show_read_only_modal = ref(false);

  return {
    // Project state
    projects,
    loading_projects,
    selected_project,
    project_info,
    loading_project_info,

    // Search state
    search_query,
    search_results,
    has_searched,

    // File state
    selected_file,
    file_functions,
    loading_file_functions,
    file_analytics,
    loading_file_analytics,

    // All functions view state
    showing_all_functions,
    all_functions,
    loading_all_functions,

    // Function detail state
    selected_function,
    active_tab,
    class_members,
    loading_class_members,

    // Callers/callees state
    callers,
    callees,
    loading_callers,
    loading_callees,

    // Entity references state
    entity_references,
    reference_definitions,
    loading_references,

    // Call graph state
    show_call_graph,
    call_graph_root,
    call_graph_data,
    loading_call_graph,
    selected_graph_node,
    graph_container,
    graph_svg,
    call_graph_depth,

    // Flowchart/tree view state
    graph_view_type,
    tree_data,
    tree_depth,

    // Control flow flowchart state
    flowchart_data,
    loading_flowchart,
    flowchart_error,
    flowchart_container,
    flowchart_svg,
    selected_flowchart_node,

    // Inline call graph state
    inline_call_graph_data,
    loading_inline_call_graph,
    inline_call_graph_error,
    inline_graph_container,
    inline_graph_svg,
    selected_inline_graph_node,
    inline_call_graph_depth,
    inline_graph_fullscreen,
    flowchart_fullscreen,

    // Autocomplete search state
    search_suggestions,
    show_autocomplete,
    autocomplete_index,

    // Import/Refresh state
    show_import_modal,
    import_path,
    import_name,
    importing,
    import_error,
    import_success,
    refreshing_project,

    // Job queue state
    jobs,
    job_queue_stats,
    job_queue_minimized,
    show_jobs_view,
    ws_connected,

    // File list display state
    file_display_limit,
    FILE_DISPLAY_INCREMENT,

    // Directory navigation state
    current_directory,

    // Function list display state
    function_display_limit,
    FUNCTION_DISPLAY_INCREMENT,

    // Analysis state
    show_analysis_view,
    analysis_data,
    loading_analysis,
    analysis_tab,
    analysis_detail,
    loading_analysis_detail,

    // Server status state
    server_read_only,
    show_read_only_modal
  };
};
