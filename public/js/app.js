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
  create_reverse_graph_renderer,
  create_tree_renderer,
  create_heatmap_renderer
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
import { create_data_handlers } from './modules/data-handlers.js';
import {
  create_search_handlers,
  create_global_search_handlers
} from './modules/search-handlers.js';
import {
  create_call_graph_handlers,
  create_flowchart_handlers,
  create_inline_graph_handlers,
  create_reverse_graph_handlers,
  create_heatmap_handlers
} from './modules/graph-handlers.js';
import {
  create_function_handlers,
  create_callers_callees_handlers
} from './modules/function-handlers.js';

const { createApp, ref, computed, onMounted, watch, nextTick } = Vue;

createApp({
  setup() {
    // Create all state refs
    const state = create_state(ref);

    // Create formatters
    const formatters = create_formatters();

    // Create renderers
    const flowchart_renderer = create_flowchart_renderer(state, d3);
    const call_graph_renderer = create_call_graph_renderer(state, d3);
    const inline_graph_renderer = create_inline_graph_renderer(state, d3);
    const reverse_graph_renderer = create_reverse_graph_renderer(state, d3);
    const tree_renderer = create_tree_renderer(state, d3);
    const heatmap_renderer = create_heatmap_renderer(state, d3);

    // Placeholder navigation for circular dependency resolution
    let navigation = null;

    // Create function handlers first (needed by search handlers)
    const function_handlers = create_function_handlers(state, api, {
      update_url: () => navigation?.update_url()
    });

    // Create search handlers
    const search_handlers = create_search_handlers(
      state,
      api,
      function_handlers.select_function
    );

    // Create global search handlers (for header search)
    const global_search_handlers = create_global_search_handlers(
      state,
      api,
      () => navigation?.update_url()
    );

    // Create graph handlers
    const call_graph_handlers = create_call_graph_handlers(
      state,
      api,
      { update_url: () => navigation?.update_url() },
      call_graph_renderer,
      tree_renderer,
      nextTick
    );

    const flowchart_handlers = create_flowchart_handlers(
      state,
      api,
      flowchart_renderer,
      nextTick
    );

    const inline_graph_handlers = create_inline_graph_handlers(
      state,
      api,
      inline_graph_renderer,
      nextTick
    );

    const reverse_graph_handlers = create_reverse_graph_handlers(
      state,
      api,
      reverse_graph_renderer,
      nextTick
    );

    const heatmap_handlers = create_heatmap_handlers(
      state,
      api,
      heatmap_renderer,
      nextTick
    );

    // Create callers/callees handlers
    const callers_callees_handlers = create_callers_callees_handlers(
      state,
      api,
      { update_url: () => navigation?.update_url() },
      inline_graph_handlers,
      flowchart_handlers,
      reverse_graph_handlers,
      heatmap_handlers
    );

    // Create navigation handlers object for navigation module
    const navigation_handlers = {
      select_project: (project, skip) =>
        data_handlers.select_project(project, skip),
      select_file: (file, skip) => data_handlers.select_file(file, skip),
      show_all_functions: (skip) => data_handlers.show_all_functions(skip),
      load_function_by_symbol: (symbol) =>
        api.load_function_details(symbol, state.selected_project.value?.name),
      load_callers: callers_callees_handlers.load_callers,
      load_callees: callers_callees_handlers.load_callees,
      load_inline_call_graph: inline_graph_handlers.load_inline_call_graph,
      load_reverse_call_graph: reverse_graph_handlers.load_reverse_call_graph,
      load_flowchart: flowchart_handlers.load_flowchart,
      load_heatmap: heatmap_handlers.load_heatmap,
      load_references: callers_callees_handlers.load_references,
      open_call_graph: call_graph_handlers.open_call_graph,
      reload_tree_view: call_graph_handlers.reload_tree_view,
      load_analysis_dashboard: () =>
        analysis_handlers.load_analysis_dashboard(),
      load_analysis_detail: (type) =>
        analysis_handlers.load_analysis_detail(type),
      stop_simulation: () => call_graph_renderer.stop_simulation(),
      execute_global_search: () =>
        global_search_handlers.execute_global_search()
    };

    // Now create the actual navigation
    navigation = create_navigation(state, navigation_handlers);

    // Create data handlers with actual navigation
    const data_handlers = create_data_handlers(state, api, navigation);

    // Create directory navigation and computed
    const dir_navigation = create_directory_navigation(
      state,
      navigation.update_url
    );
    const dir_computed = create_directory_computed(state, Vue);

    // Create job and import handlers
    const job_manager = create_job_manager(state, api);
    const import_handlers = create_import_handlers(
      state,
      api,
      job_manager,
      data_handlers.load_projects,
      navigation.update_url
    );

    // Create analysis handlers
    const analysis_handlers = create_analysis_handlers(
      state,
      api,
      navigation.update_url
    );

    // ========================================
    // Syntax highlighting helpers
    // ========================================

    /**
     * Map language names to highlight.js language identifiers.
     * @param {string} language - Source language name
     * @returns {string} Highlight.js language identifier
     */
    const get_highlight_language = (language) => {
      const language_map = {
        javascript: 'javascript',
        typescript: 'typescript',
        python: 'python',
        java: 'java',
        c: 'c',
        cpp: 'cpp',
        'c++': 'cpp',
        csharp: 'csharp',
        'c#': 'csharp',
        go: 'go',
        rust: 'rust',
        ruby: 'ruby',
        php: 'php',
        swift: 'swift',
        zig: 'zig'
      };
      return language_map[language?.toLowerCase()] || 'plaintext';
    };

    /**
     * Computed property for syntax-highlighted source code.
     */
    const highlighted_source = computed(() => {
      const source = state.selected_function.value?.source;
      if (!source) return '';

      const language = state.selected_function.value?.language;
      const hljs_lang = get_highlight_language(language);

      try {
        if (window.hljs && hljs_lang !== 'plaintext') {
          const result = window.hljs.highlight(source, { language: hljs_lang });
          return result.value;
        }
      } catch (e) {
        console.warn('Syntax highlighting failed:', e);
      }

      // Fallback: escape HTML and return plain text
      return source
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    });

    /**
     * Computed property for syntax-highlighted file source code.
     */
    const highlighted_file_source = computed(() => {
      const source = state.file_source.value?.source;
      if (!source) return '';

      // Determine language from filename extension
      const filename = state.selected_file.value || '';
      const ext = filename.split('.').pop()?.toLowerCase() || '';
      const ext_to_lang = {
        js: 'javascript',
        mjs: 'javascript',
        cjs: 'javascript',
        ts: 'typescript',
        tsx: 'typescript',
        jsx: 'javascript',
        py: 'python',
        rb: 'ruby',
        go: 'go',
        rs: 'rust',
        c: 'c',
        h: 'c',
        cpp: 'cpp',
        hpp: 'cpp',
        java: 'java',
        kt: 'kotlin',
        swift: 'swift',
        php: 'php',
        cs: 'csharp',
        sql: 'sql',
        json: 'json',
        yaml: 'yaml',
        yml: 'yaml',
        xml: 'xml',
        html: 'html',
        css: 'css',
        scss: 'scss',
        md: 'markdown',
        sh: 'bash',
        bash: 'bash'
      };
      const hljs_lang = ext_to_lang[ext] || 'plaintext';

      try {
        if (window.hljs && hljs_lang !== 'plaintext') {
          const result = window.hljs.highlight(source, { language: hljs_lang });
          return result.value;
        }
      } catch (e) {
        console.warn('Syntax highlighting failed:', e);
      }

      // Fallback: escape HTML and return plain text
      return source
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    });

    /**
     * Check if a file is a markdown file based on extension.
     */
    const is_markdown_file = (filename) => {
      if (!filename) return false;
      const ext = filename.split('.').pop()?.toLowerCase() || '';
      return ext === 'md' || ext === 'markdown';
    };

    /**
     * Computed property for rendered markdown content.
     */
    const rendered_markdown = computed(() => {
      const source = state.file_source.value?.source;
      const filename = state.selected_file.value;

      if (!source || !is_markdown_file(filename)) return '';

      try {
        if (window.marked) {
          // Configure marked for safe rendering
          window.marked.setOptions({
            gfm: true, // GitHub Flavored Markdown
            breaks: true, // Convert \n to <br>
            headerIds: true,
            mangle: false
          });
          return window.marked.parse(source);
        }
      } catch (e) {
        console.warn('Markdown parsing failed:', e);
      }

      // Fallback: escape HTML and show as plain text
      return source
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
    });

    // ========================================
    // View function details from graph node
    // ========================================

    const view_function_details = async (node) => {
      await call_graph_handlers.view_function_details(node, (selected) => {
        state.selected_function.value = selected;
        state.selected_file.value = selected.filename;
        state.active_tab.value = 'source';
        state.callers.value = [];
        state.callees.value = [];
      });
    };

    // ========================================
    // Navigate to definition wrapper
    // ========================================

    const navigate_to_definition = async (def) => {
      await callers_callees_handlers.navigate_to_definition(
        def,
        data_handlers.select_project,
        function_handlers.select_function
      );
    };

    // ========================================
    // Pagination functions
    // ========================================

    const show_more_files = () => {
      state.file_display_limit.value += state.FILE_DISPLAY_INCREMENT;
    };

    const show_all_files = () => {
      if (state.project_info.value?.files) {
        state.file_display_limit.value = state.project_info.value.files.length;
      }
    };

    const show_more_functions = () => {
      state.function_display_limit.value += state.FUNCTION_DISPLAY_INCREMENT;
    };

    const show_all_functions_items = () => {
      if (state.all_functions.value) {
        state.function_display_limit.value = state.all_functions.value.length;
      }
    };

    const close_read_only_modal = () => {
      state.show_read_only_modal.value = false;
    };

    // ========================================
    // Lifecycle
    // ========================================

    window.addEventListener('popstate', () => {
      navigation.reset_to_home(true);
      navigation.parse_url();
    });

    onMounted(async () => {
      await data_handlers.load_server_status();
      await data_handlers.load_projects();
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
          if (state.call_graph_fullscreen.value) {
            state.call_graph_fullscreen.value = false;
            nextTick(() => {
              if (state.call_graph_data.value) {
                call_graph_renderer.render_graph();
              }
            });
          }
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
      globalStats: state.global_stats,
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
      fileSource: state.file_source,
      loadingFileSource: state.loading_file_source,
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
      // Global search state
      globalSearchQuery: state.global_search_query,
      globalSearchSuggestions: state.global_search_suggestions,
      showGlobalAutocomplete: state.show_global_autocomplete,
      globalAutocompleteIndex: state.global_autocomplete_index,
      showGlobalSearchResults: state.show_global_search_results,
      globalSearchResults: state.global_search_results,
      globalSearchLoading: state.global_search_loading,
      globalSearchHasMore: state.global_search_has_more,
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
      showDeleteModal: state.show_delete_modal,
      deleteProjectName: state.delete_project_name,
      deletingProject: state.deleting_project,
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
      callGraphFullscreen: state.call_graph_fullscreen,
      reverseCallGraphData: state.reverse_call_graph_data,
      loadingReverseCallGraph: state.loading_reverse_call_graph,
      reverseCallGraphError: state.reverse_call_graph_error,
      reverseGraphContainer: state.reverse_graph_container,
      reverseGraphSvg: state.reverse_graph_svg,
      selectedReverseGraphNode: state.selected_reverse_graph_node,
      reverseCallGraphDepth: state.reverse_call_graph_depth,
      reverseGraphFullscreen: state.reverse_graph_fullscreen,
      // Heatmap state
      heatmapData: state.heatmap_data,
      loadingHeatmap: state.loading_heatmap,
      heatmapError: state.heatmap_error,
      heatmapContainer: state.heatmap_container,
      heatmapSvg: state.heatmap_svg,
      selectedHeatmapNode: state.selected_heatmap_node,
      heatmapDepth: state.heatmap_depth,
      heatmapFullscreen: state.heatmap_fullscreen,
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
      highlightedSource: highlighted_source,
      highlightedFileSource: highlighted_file_source,
      renderedMarkdown: rendered_markdown,
      isMarkdownFile: is_markdown_file,

      // Syntax highlighting helpers
      getHighlightLanguage: get_highlight_language,
      getFileLanguage: (filename) => {
        if (!filename) return 'plaintext';
        const ext = filename.split('.').pop()?.toLowerCase() || '';
        const ext_to_lang = {
          js: 'javascript',
          mjs: 'javascript',
          cjs: 'javascript',
          ts: 'typescript',
          tsx: 'typescript',
          jsx: 'javascript',
          py: 'python',
          rb: 'ruby',
          go: 'go',
          rs: 'rust',
          c: 'c',
          h: 'c',
          cpp: 'cpp',
          hpp: 'cpp',
          java: 'java',
          kt: 'kotlin',
          swift: 'swift',
          php: 'php',
          cs: 'csharp',
          sql: 'sql',
          json: 'json',
          yaml: 'yaml',
          yml: 'yaml',
          xml: 'xml',
          html: 'html',
          css: 'css',
          scss: 'scss',
          md: 'markdown',
          sh: 'bash',
          bash: 'bash'
        };
        return ext_to_lang[ext] || 'plaintext';
      },

      // Methods - using camelCase for Vue template compatibility
      selectProject: data_handlers.select_project,
      selectFile: data_handlers.select_file,
      clearFile: data_handlers.clear_file,
      showAllFunctions: data_handlers.show_all_functions,
      clearAllFunctions: data_handlers.clear_all_functions,
      searchFunctions: search_handlers.search_functions,
      selectFunction: function_handlers.select_function,
      clearFunction: function_handlers.clear_function,
      backToFile: function_handlers.back_to_file,
      navigateToFunction: function_handlers.navigate_to_function,
      loadCallers: callers_callees_handlers.load_callers,
      loadCallees: callers_callees_handlers.load_callees,
      loadReferences: callers_callees_handlers.load_references,
      setActiveTab: callers_callees_handlers.set_active_tab,
      navigateToDefinition: navigate_to_definition,
      openCallGraph: call_graph_handlers.open_call_graph,
      loadCallGraphForNode: call_graph_handlers.load_call_graph_for_node,
      closeCallGraph: call_graph_handlers.close_call_graph,
      setCallGraphDepth: call_graph_handlers.set_call_graph_depth,
      switchGraphView: call_graph_handlers.switch_graph_view,
      loadTreeView: call_graph_handlers.load_tree_view,
      reloadTreeView: call_graph_handlers.reload_tree_view,
      recenterTreeOnNode: call_graph_handlers.recenter_tree_on_node,
      loadFlowchart: flowchart_handlers.load_flowchart,
      loadInlineCallGraph: inline_graph_handlers.load_inline_call_graph,
      recenterInlineGraph: inline_graph_handlers.recenter_inline_graph,
      setInlineCallGraphDepth:
        inline_graph_handlers.set_inline_call_graph_depth,
      toggleInlineGraphFullscreen:
        inline_graph_handlers.toggle_inline_graph_fullscreen,
      toggleFlowchartFullscreen: flowchart_handlers.toggle_flowchart_fullscreen,
      toggleCallGraphFullscreen:
        call_graph_handlers.toggle_call_graph_fullscreen,
      loadReverseCallGraph: reverse_graph_handlers.load_reverse_call_graph,
      recenterReverseGraph: reverse_graph_handlers.recenter_reverse_graph,
      setReverseCallGraphDepth:
        reverse_graph_handlers.set_reverse_call_graph_depth,
      toggleReverseGraphFullscreen:
        reverse_graph_handlers.toggle_reverse_graph_fullscreen,
      reverseGraphZoomIn: reverse_graph_renderer.zoom_in,
      reverseGraphZoomOut: reverse_graph_renderer.zoom_out,
      reverseGraphResetZoom: reverse_graph_renderer.reset_zoom,
      // Heatmap handlers
      loadHeatmap: heatmap_handlers.load_heatmap,
      recenterHeatmap: heatmap_handlers.recenter_heatmap,
      setHeatmapDepth: heatmap_handlers.set_heatmap_depth,
      toggleHeatmapFullscreen: heatmap_handlers.toggle_heatmap_fullscreen,
      heatmapZoomIn: heatmap_renderer.zoom_in,
      heatmapZoomOut: heatmap_renderer.zoom_out,
      heatmapResetZoom: heatmap_renderer.reset_zoom,
      viewFunctionDetails: view_function_details,
      onSearchInput: search_handlers.on_search_input,
      navigateAutocomplete: search_handlers.navigate_autocomplete,
      selectAutocompleteItem: search_handlers.select_autocomplete_item,
      selectSuggestion: search_handlers.select_suggestion,
      closeAutocomplete: search_handlers.close_autocomplete,
      onSearchBlur: search_handlers.on_search_blur,
      // Global search handlers
      onGlobalSearchInput: global_search_handlers.on_global_search_input,
      navigateGlobalAutocomplete:
        global_search_handlers.navigate_global_autocomplete,
      selectGlobalAutocompleteItem:
        global_search_handlers.select_global_autocomplete_item,
      executeGlobalSearch: global_search_handlers.execute_global_search,
      loadMoreGlobalResults: global_search_handlers.load_more_global_results,
      selectGlobalSuggestion: (fn) => {
        global_search_handlers.select_global_suggestion(fn);
        function_handlers.select_function(fn);
      },
      closeGlobalAutocomplete: global_search_handlers.close_global_autocomplete,
      onGlobalSearchBlur: global_search_handlers.on_global_search_blur,
      closeGlobalSearchResults:
        global_search_handlers.close_global_search_results,
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

      // Delete project
      showDeleteConfirmation: import_handlers.show_delete_confirmation,
      closeDeleteModal: import_handlers.close_delete_modal,
      confirmDeleteProject: import_handlers.confirm_delete_project,

      // Analysis
      toggleAnalysisView: analysis_handlers.toggle_analysis_view,
      closeAnalysisView: analysis_handlers.close_analysis_view,
      loadAnalysisDashboard: analysis_handlers.load_analysis_dashboard,
      loadAnalysisDetail: analysis_handlers.load_analysis_detail,
      setAnalysisTab: analysis_handlers.set_analysis_tab,
      navigateToFunctionById: analysis_handlers.navigate_to_function_by_id,
      navigateToFile: analysis_handlers.navigate_to_file,

      // Formatters
      formatDate: formatters.format_date,
      formatNumber: formatters.format_number,
      formatDuration: formatters.format_duration,
      formatReferenceType: formatters.format_reference_type,
      formatJobTitle: formatters.format_job_title,
      getDistributionPercent: formatters.get_distribution_percent
    };
  }
}).mount('#app');
