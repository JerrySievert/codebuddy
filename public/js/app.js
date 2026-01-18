const { createApp, ref, onMounted, watch, nextTick } = Vue;

createApp({
  setup() {
    const projects = ref([]);
    const loadingProjects = ref(true);
    const selectedProject = ref(null);
    const projectInfo = ref(null);
    const loadingProjectInfo = ref(false);

    const searchQuery = ref('');
    const searchResults = ref([]);
    const hasSearched = ref(false);

    const selectedFile = ref(null);
    const fileFunctions = ref([]);
    const loadingFileFunctions = ref(false);
    const fileAnalytics = ref(null);
    const loadingFileAnalytics = ref(false);

    const showingAllFunctions = ref(false);
    const allFunctions = ref([]);
    const loadingAllFunctions = ref(false);

    const selectedFunction = ref(null);
    const activeTab = ref('source');
    const classMembers = ref([]);
    const loadingClassMembers = ref(false);

    const callers = ref([]);
    const callees = ref([]);
    const loadingCallers = ref(false);
    const loadingCallees = ref(false);

    // Entity references state (for struct/class)
    const entityReferences = ref([]);
    const referenceDefinitions = ref([]);
    const loadingReferences = ref(false);

    // Call graph state
    const showCallGraph = ref(false);
    const callGraphRoot = ref('');
    const callGraphData = ref(null); // Full data from server (fetched unlimited)
    const loadingCallGraph = ref(false);
    const selectedGraphNode = ref(null);
    const graphContainer = ref(null);
    const graphSvg = ref(null);
    const callGraphDepth = ref(5); // Display depth: 5, min: 2, 0 = unlimited

    // Flowchart/tree view state
    const graphViewType = ref('callgraph'); // 'callgraph', 'callers', 'callees'
    const treeData = ref(null);
    const treeDepth = ref(2);

    // Control flow flowchart state
    const flowchartData = ref(null);
    const loadingFlowchart = ref(false);
    const flowchartError = ref('');
    const flowchartContainer = ref(null);
    const flowchartSvg = ref(null);
    const selectedFlowchartNode = ref(null);
    let flowchartZoom = null;
    let flowchartG = null;
    let flowchartSvgElement = null;

    // Inline call graph state (for function detail tab)
    const inlineCallGraphData = ref(null);
    const loadingInlineCallGraph = ref(false);
    const inlineCallGraphError = ref('');
    const inlineGraphContainer = ref(null);
    const inlineGraphSvg = ref(null);
    const selectedInlineGraphNode = ref(null);
    const inlineCallGraphDepth = ref(5); // Default depth: 5, min: 2, 0 = unlimited
    const inlineGraphFullscreen = ref(false);
    const flowchartFullscreen = ref(false);
    let inlineGraphZoom = null;
    let inlineGraphG = null;
    let inlineGraphSvgElement = null;
    let inlineSimulation = null;

    // Autocomplete search state
    const searchSuggestions = ref([]);
    const showAutocomplete = ref(false);
    const autocompleteIndex = ref(-1);
    let searchDebounceTimer = null;

    // Import/Refresh state
    const showImportModal = ref(false);
    const importPath = ref('');
    const importName = ref('');
    const importing = ref(false);
    const importError = ref('');
    const importSuccess = ref('');
    const refreshingProject = ref(null);

    // Job queue state
    const jobs = ref([]);
    const jobQueueStats = ref({
      queued: 0,
      running: 0,
      completed: 0,
      failed: 0,
      total: 0
    });
    const jobQueueMinimized = ref(false);
    const showJobsView = ref(false);
    let jobPollInterval = null;

    // WebSocket state for real-time job updates
    let nesClient = null;
    let wsConnected = ref(false);
    const jobSubscriptions = new Map(); // Map of jobId -> { onComplete, onError }
    const wsReconnectDelay = 2000;

    // File list display state (for large projects)
    const fileDisplayLimit = ref(100);
    const FILE_DISPLAY_INCREMENT = 100;

    // Directory navigation state
    const currentDirectory = ref(''); // Empty string = root

    // Function list display state (for all entities view)
    const functionDisplayLimit = ref(100);
    const FUNCTION_DISPLAY_INCREMENT = 100;

    // Analysis state
    const showAnalysisView = ref(false);
    const analysisData = ref(null);
    const loadingAnalysis = ref(false);
    const analysisTab = ref('overview');
    const analysisDetail = ref(null);
    const loadingAnalysisDetail = ref(false);

    // Server status state
    const serverReadOnly = ref(false);
    const showReadOnlyModal = ref(false);

    let simulation = null;
    let svg = null;
    let g = null;
    let zoom = null;

    // URL routing helpers
    const updateUrl = () => {
      const params = new URLSearchParams();
      if (selectedProject.value) {
        params.set('project', selectedProject.value.name);
      }
      if (currentDirectory.value) {
        params.set('dir', currentDirectory.value);
      }
      if (selectedFile.value) {
        params.set('file', selectedFile.value);
      }
      if (selectedFunction.value) {
        params.set('function', selectedFunction.value.symbol);
        if (selectedFunction.value.filename) {
          params.set('funcFile', selectedFunction.value.filename);
        }
        if (activeTab.value && activeTab.value !== 'source') {
          params.set('tab', activeTab.value);
        }
      }
      if (showCallGraph.value && callGraphRoot.value) {
        params.set('callgraph', callGraphRoot.value);
        if (graphViewType.value && graphViewType.value !== 'callgraph') {
          params.set('graphType', graphViewType.value);
        }
        // Include depth if it's not the default (5)
        if (callGraphDepth.value !== 5) {
          params.set('depth', callGraphDepth.value);
        }
      }
      if (showingAllFunctions.value) {
        params.set('view', 'all-functions');
      }
      if (showAnalysisView.value) {
        params.set('view', 'analysis');
        if (analysisTab.value && analysisTab.value !== 'overview') {
          params.set('analysisTab', analysisTab.value);
        }
      }
      if (showJobsView.value) {
        params.set('view', 'jobs');
      }
      const hash = params.toString();
      const newUrl = hash ? `#${hash}` : window.location.pathname;
      window.history.pushState({}, '', newUrl);
    };

    const parseUrl = async () => {
      const hash = window.location.hash.slice(1);
      if (!hash) return;

      const params = new URLSearchParams(hash);
      const projectName = params.get('project');
      const dirPath = params.get('dir');
      const fileName = params.get('file');
      const functionName = params.get('function');
      const funcFile = params.get('funcFile');
      const tab = params.get('tab');
      const callgraphRoot = params.get('callgraph');
      const graphType = params.get('graphType');
      const depthParam = params.get('depth');
      const view = params.get('view');
      const analysisTabParam = params.get('analysisTab');

      // Handle jobs view (doesn't require project)
      if (view === 'jobs') {
        showJobsView.value = true;
        showAnalysisView.value = false;
        return;
      }

      if (projectName) {
        // Wait for projects to load
        while (loadingProjects.value) {
          await new Promise((r) => setTimeout(r, 50));
        }
        const project = projects.value.find((p) => p.name === projectName);
        if (project) {
          await selectProject(project, true); // true = skip URL update

          // Restore directory path if specified
          if (dirPath) {
            currentDirectory.value = dirPath;
          }

          // Handle analysis view
          if (view === 'analysis') {
            showAnalysisView.value = true;
            showJobsView.value = false;
            await loadAnalysisDashboard();
            if (analysisTabParam) {
              analysisTab.value = analysisTabParam;
              // Load detail for non-overview tabs
              if (analysisTabParam !== 'overview') {
                await loadAnalysisDetail(analysisTabParam);
              }
            }
          } else if (callgraphRoot) {
            // Restore depth before opening call graph
            if (depthParam) {
              const depth = parseInt(depthParam, 10);
              if (!isNaN(depth) && depth >= 0) {
                callGraphDepth.value = depth;
              }
            }
            await openCallGraph(callgraphRoot, true);
            if (graphType) {
              graphViewType.value = graphType;
              await reloadTreeView();
            }
          } else if (functionName) {
            // Load function details
            try {
              const response = await fetch(
                `/api/v1/functions/${encodeURIComponent(functionName)}?project=${projectName}`
              );
              const results = await response.json();
              if (results.length > 0) {
                const match = funcFile
                  ? results.find((r) => r.filename === funcFile) || results[0]
                  : results[0];
                selectedFunction.value = match;
                selectedFile.value = match.filename;
                // Restore active tab if specified
                if (tab) {
                  activeTab.value = tab;
                  // Trigger loading for tabs that need it
                  if (tab === 'callers') await loadCallers();
                  else if (tab === 'callees') await loadCallees();
                  else if (tab === 'callgraph') await loadInlineCallGraph();
                  else if (tab === 'flowchart') await loadFlowchart();
                  else if (tab === 'references') await loadReferences();
                }
              }
            } catch (e) {
              console.error('Failed to load function from URL:', e);
            }
          } else if (view === 'all-functions') {
            await showAllFunctions(true);
          } else if (fileName) {
            await selectFile(fileName, true);
          }
        }
      }
    };

    // Listen for browser back/forward
    window.addEventListener('popstate', () => {
      resetToHome(true);
      parseUrl();
    });

    const loadServerStatus = async () => {
      try {
        const response = await fetch('/api/v1/status');
        const status = await response.json();
        serverReadOnly.value = status.read_only || false;
      } catch (error) {
        console.error('Failed to load server status:', error);
      }
    };

    const closeReadOnlyModal = () => {
      showReadOnlyModal.value = false;
    };

    const loadProjects = async () => {
      try {
        const response = await fetch('/api/v1/projects');
        projects.value = await response.json();
      } catch (error) {
        console.error('Failed to load projects:', error);
      } finally {
        loadingProjects.value = false;
      }
    };

    const selectProject = async (project, skipUrlUpdate = false) => {
      selectedProject.value = project;
      selectedFunction.value = null;
      selectedFile.value = null;
      showingAllFunctions.value = false;
      showCallGraph.value = false;
      searchResults.value = [];
      hasSearched.value = false;

      // Reset analysis data when switching projects
      analysisData.value = null;
      analysisDetail.value = null;
      analysisTab.value = 'overview';

      // Close analysis and jobs views when selecting a project
      showAnalysisView.value = false;
      showJobsView.value = false;

      // Reset file display limit and directory for new project
      fileDisplayLimit.value = 100;
      currentDirectory.value = '';

      // Show loading spinner while fetching project info
      loadingProjectInfo.value = true;
      projectInfo.value = null;

      try {
        const response = await fetch(`/api/v1/projects/${project.name}`);
        projectInfo.value = await response.json();
      } catch (error) {
        console.error('Failed to load project info:', error);
      } finally {
        loadingProjectInfo.value = false;
      }

      if (!skipUrlUpdate) updateUrl();
    };

    const selectFile = async (filename, skipUrlUpdate = false) => {
      selectedFile.value = filename;
      selectedFunction.value = null;
      showingAllFunctions.value = false;
      showCallGraph.value = false;
      loadingFileFunctions.value = true;
      loadingFileAnalytics.value = true;
      fileAnalytics.value = null;

      try {
        // Fetch entities and analytics in parallel
        const [functionsResponse, analyticsResponse] = await Promise.all([
          fetch(
            `/api/v1/functions?project=${selectedProject.value.name}&filename=${encodeURIComponent(filename)}`
          ),
          fetch(
            `/api/v1/files/analytics?project=${selectedProject.value.name}&filename=${encodeURIComponent(filename)}`
          )
        ]);
        fileFunctions.value = await functionsResponse.json();
        fileAnalytics.value = await analyticsResponse.json();
      } catch (error) {
        console.error('Failed to load file data:', error);
        fileFunctions.value = [];
        fileAnalytics.value = null;
      } finally {
        loadingFileFunctions.value = false;
        loadingFileAnalytics.value = false;
      }
      if (!skipUrlUpdate) updateUrl();
    };

    const clearFile = () => {
      selectedFile.value = null;
      fileFunctions.value = [];
      fileAnalytics.value = null;
      selectedFunction.value = null;
      showingAllFunctions.value = false;
      updateUrl();
    };

    const showAllFunctions = async (skipUrlUpdate = false) => {
      showingAllFunctions.value = true;
      selectedFile.value = null;
      selectedFunction.value = null;
      showCallGraph.value = false;
      loadingAllFunctions.value = true;

      // Reset function display limit for new load
      functionDisplayLimit.value = 100;

      try {
        const response = await fetch(
          `/api/v1/functions?project=${selectedProject.value.name}`
        );
        allFunctions.value = await response.json();
      } catch (error) {
        console.error('Failed to load all functions:', error);
        allFunctions.value = [];
      } finally {
        loadingAllFunctions.value = false;
      }
      if (!skipUrlUpdate) updateUrl();
    };

    const clearAllFunctions = () => {
      showingAllFunctions.value = false;
      allFunctions.value = [];
      selectedFunction.value = null;
      updateUrl();
    };

    const searchFunctions = async () => {
      if (!searchQuery.value) return;

      hasSearched.value = true;
      showAutocomplete.value = false;
      const projectParam = selectedProject.value
        ? `&project=${selectedProject.value.name}`
        : '';

      try {
        // Use entity search to include functions, classes, and structs
        const response = await fetch(
          `/api/v1/entities/search?name=${encodeURIComponent(searchQuery.value)}${projectParam}&limit=50`
        );
        searchResults.value = await response.json();
      } catch (error) {
        console.error('Failed to search entities:', error);
        searchResults.value = [];
      }
    };

    // Autocomplete search functions
    const onSearchInput = () => {
      // Debounce the search
      if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer);
      }

      if (!searchQuery.value || searchQuery.value.length < 2) {
        searchSuggestions.value = [];
        showAutocomplete.value = false;
        return;
      }

      searchDebounceTimer = setTimeout(async () => {
        const projectParam = selectedProject.value
          ? `&project=${selectedProject.value.name}`
          : '';

        try {
          // Use entity search to include functions, classes, and structs
          const response = await fetch(
            `/api/v1/entities/search?name=${encodeURIComponent(searchQuery.value)}${projectParam}&limit=10`
          );
          searchSuggestions.value = await response.json();
          showAutocomplete.value = searchSuggestions.value.length > 0;
          autocompleteIndex.value = -1;
        } catch (error) {
          console.error('Failed to fetch suggestions:', error);
          searchSuggestions.value = [];
          showAutocomplete.value = false;
        }
      }, 200);
    };

    const navigateAutocomplete = (direction) => {
      if (!showAutocomplete.value || searchSuggestions.value.length === 0)
        return;

      autocompleteIndex.value += direction;

      if (autocompleteIndex.value < 0) {
        autocompleteIndex.value = searchSuggestions.value.length - 1;
      } else if (autocompleteIndex.value >= searchSuggestions.value.length) {
        autocompleteIndex.value = 0;
      }
    };

    const selectAutocompleteItem = () => {
      if (
        autocompleteIndex.value >= 0 &&
        autocompleteIndex.value < searchSuggestions.value.length
      ) {
        selectSuggestion(searchSuggestions.value[autocompleteIndex.value]);
      } else {
        searchFunctions();
      }
    };

    const selectSuggestion = (fn) => {
      showAutocomplete.value = false;
      searchSuggestions.value = [];
      autocompleteIndex.value = -1;
      selectFunction(fn);
    };

    const closeAutocomplete = () => {
      showAutocomplete.value = false;
      autocompleteIndex.value = -1;
    };

    const onSearchBlur = () => {
      // Delay closing to allow click on dropdown items
      setTimeout(() => {
        showAutocomplete.value = false;
      }, 200);
    };

    const selectFunction = async (fn, skipUrlUpdate = false) => {
      showCallGraph.value = false;

      // If no project selected and function has project info, select the project first
      if (!selectedProject.value && fn.project_id) {
        const matchingProject = projects.value.find(
          (p) => p.project_id === fn.project_id
        );
        if (matchingProject) {
          selectedProject.value = matchingProject;
          try {
            const projResponse = await fetch(
              `/api/v1/projects/${matchingProject.name}`
            );
            projectInfo.value = await projResponse.json();
          } catch (error) {
            console.error('Failed to load project info:', error);
          }
        }
      }

      const projectParam = selectedProject.value
        ? `?project=${selectedProject.value.name}`
        : '';

      try {
        const response = await fetch(
          `/api/v1/functions/${encodeURIComponent(fn.symbol)}${projectParam}`
        );
        const results = await response.json();
        if (results.length > 0) {
          selectedFunction.value =
            results.find((r) => r.id === fn.id) || results[0];
        } else {
          selectedFunction.value = fn;
        }
      } catch (error) {
        console.error('Failed to load function details:', error);
        selectedFunction.value = fn;
      }

      activeTab.value = 'source';
      callers.value = [];
      callees.value = [];
      classMembers.value = [];
      entityReferences.value = [];
      referenceDefinitions.value = [];
      flowchartData.value = null;
      flowchartError.value = '';
      inlineCallGraphData.value = null;
      inlineCallGraphError.value = '';
      selectedInlineGraphNode.value = null;

      // If this is a class or struct, fetch its members
      if (
        selectedFunction.value &&
        (selectedFunction.value.type === 'class' ||
          selectedFunction.value.type === 'struct')
      ) {
        loadingClassMembers.value = true;
        try {
          const membersResponse = await fetch(
            `/api/v1/functions/${selectedFunction.value.id}/members`
          );
          const membersData = await membersResponse.json();
          classMembers.value = membersData.members || [];
        } catch (error) {
          console.error('Failed to load class members:', error);
          classMembers.value = [];
        } finally {
          loadingClassMembers.value = false;
        }
      }

      if (!skipUrlUpdate) updateUrl();
    };

    const clearFunction = () => {
      selectedFunction.value = null;
      selectedFile.value = null;
      showingAllFunctions.value = false;
      updateUrl();
    };

    const backToFile = () => {
      selectedFunction.value = null;
      updateUrl();
    };

    const navigateToFunction = async (symbol, filename) => {
      const projectParam = selectedProject.value
        ? `?project=${selectedProject.value.name}`
        : '';

      try {
        const response = await fetch(
          `/api/v1/functions/${encodeURIComponent(symbol)}${projectParam}`
        );
        const results = await response.json();
        if (results.length > 0) {
          const match =
            results.find((r) => r.filename === filename) || results[0];
          selectedFunction.value = match;
          selectedFile.value = match.filename;
        }
      } catch (error) {
        console.error('Failed to navigate to function:', error);
      }

      activeTab.value = 'source';
      callers.value = [];
      callees.value = [];
      updateUrl();
    };

    const loadCallers = async () => {
      if (!selectedFunction.value || callers.value.length > 0) return;

      loadingCallers.value = true;
      const projectParam = selectedProject.value
        ? `?project=${selectedProject.value.name}`
        : '';

      try {
        const response = await fetch(
          `/api/v1/functions/${encodeURIComponent(selectedFunction.value.symbol)}/callers${projectParam}`
        );
        callers.value = await response.json();
      } catch (error) {
        console.error('Failed to load callers:', error);
      } finally {
        loadingCallers.value = false;
      }
    };

    const loadCallees = async () => {
      if (!selectedFunction.value || callees.value.length > 0) return;

      loadingCallees.value = true;
      const projectParam = selectedProject.value
        ? `?project=${selectedProject.value.name}`
        : '';

      try {
        const response = await fetch(
          `/api/v1/functions/${encodeURIComponent(selectedFunction.value.symbol)}/callees${projectParam}`
        );
        callees.value = await response.json();
      } catch (error) {
        console.error('Failed to load callees:', error);
      } finally {
        loadingCallees.value = false;
      }
    };

    // Load references for struct/class entities
    const loadReferences = async () => {
      if (!selectedFunction.value) return;
      if (entityReferences.value.length > 0) return; // Already loaded

      loadingReferences.value = true;

      try {
        // Load references to this entity
        const projectName = selectedProject.value?.name;
        if (!projectName) return;

        const response = await fetch(
          `/api/v1/entities/${encodeURIComponent(selectedFunction.value.symbol)}/references?project=${projectName}`
        );
        entityReferences.value = await response.json();

        // Load all definitions of this struct/class across all projects
        const defsResponse = await fetch(
          `/api/v1/entities/definitions?name=${encodeURIComponent(selectedFunction.value.symbol)}`
        );
        referenceDefinitions.value = await defsResponse.json();
      } catch (error) {
        console.error('Failed to load references:', error);
      } finally {
        loadingReferences.value = false;
      }
    };

    // Set active tab for function detail view and update URL
    const setActiveTab = async (tab) => {
      activeTab.value = tab;
      // Trigger loading for tabs that need it
      if (tab === 'callers') await loadCallers();
      else if (tab === 'callees') await loadCallees();
      else if (tab === 'callgraph') await loadInlineCallGraph();
      else if (tab === 'flowchart') await loadFlowchart();
      else if (tab === 'references') await loadReferences();
      updateUrl();
    };

    // Group references by type for display
    const groupedReferences = Vue.computed(() => {
      if (!entityReferences.value || entityReferences.value.length === 0) {
        return {};
      }
      const groups = {};
      for (const ref of entityReferences.value) {
        const type = ref.reference_type || 'unknown';
        if (!groups[type]) {
          groups[type] = [];
        }
        groups[type].push(ref);
      }
      return groups;
    });

    // Computed property for displayed files (paginated for large projects)
    const displayedFiles = Vue.computed(() => {
      if (!projectInfo.value?.files) return [];
      return projectInfo.value.files.slice(0, fileDisplayLimit.value);
    });

    const hasMoreFiles = Vue.computed(() => {
      if (!projectInfo.value?.files) return false;
      return projectInfo.value.files.length > fileDisplayLimit.value;
    });

    const remainingFilesCount = Vue.computed(() => {
      if (!projectInfo.value?.files) return 0;
      return projectInfo.value.files.length - fileDisplayLimit.value;
    });

    const showMoreFiles = () => {
      fileDisplayLimit.value += FILE_DISPLAY_INCREMENT;
    };

    const showAllFiles = () => {
      if (projectInfo.value?.files) {
        fileDisplayLimit.value = projectInfo.value.files.length;
      }
    };

    // Computed property for directory contents at current path
    const directoryContents = Vue.computed(() => {
      if (!projectInfo.value?.files) return { directories: [], files: [] };

      const currentPath = currentDirectory.value;
      const prefix = currentPath ? currentPath + '/' : '';
      const prefixLen = prefix.length;

      const directories = new Map(); // dirname -> { name, fileCount, entityCount }
      const files = [];

      for (const file of projectInfo.value.files) {
        // Skip files not in current directory
        if (currentPath && !file.filename.startsWith(prefix)) continue;
        if (!currentPath && file.filename.startsWith('/')) continue;

        // Get the relative path from current directory
        const relativePath = currentPath
          ? file.filename.slice(prefixLen)
          : file.filename;

        // Check if this file is in a subdirectory
        const slashIndex = relativePath.indexOf('/');

        if (slashIndex !== -1) {
          // It's in a subdirectory - extract the directory name
          const dirName = relativePath.slice(0, slashIndex);
          if (!directories.has(dirName)) {
            directories.set(dirName, {
              name: dirName,
              fileCount: 0,
              entityCount: 0
            });
          }
          const dir = directories.get(dirName);
          dir.fileCount++;
          dir.entityCount += parseInt(file.function_count, 10) || 0;
        } else {
          // It's a file in the current directory
          files.push(file);
        }
      }

      // Sort directories and files alphabetically
      const sortedDirs = Array.from(directories.values()).sort((a, b) =>
        a.name.localeCompare(b.name)
      );
      const sortedFiles = files.sort((a, b) => {
        const nameA = currentPath ? a.filename.slice(prefixLen) : a.filename;
        const nameB = currentPath ? b.filename.slice(prefixLen) : b.filename;
        return nameA.localeCompare(nameB);
      });

      return { directories: sortedDirs, files: sortedFiles };
    });

    // Navigate into a directory
    const navigateToDirectory = (dirName) => {
      if (currentDirectory.value) {
        currentDirectory.value = currentDirectory.value + '/' + dirName;
      } else {
        currentDirectory.value = dirName;
      }
      // Reset file display limit when navigating
      fileDisplayLimit.value = 100;
      updateUrl();
    };

    // Navigate up one directory level
    const navigateUp = () => {
      const current = currentDirectory.value;
      const lastSlash = current.lastIndexOf('/');
      if (lastSlash === -1) {
        currentDirectory.value = '';
      } else {
        currentDirectory.value = current.slice(0, lastSlash);
      }
      fileDisplayLimit.value = 100;
      updateUrl();
    };

    // Navigate to root
    const navigateToRoot = () => {
      currentDirectory.value = '';
      fileDisplayLimit.value = 100;
      updateUrl();
    };

    // Navigate to a specific directory path from a full file path
    const navigateToFileDirectory = (filepath, directoryIndex) => {
      // Clear current views and go back to project view with directory
      showingAllFunctions.value = false;
      selectedFile.value = null;
      selectedFunction.value = null;
      fileFunctions.value = [];
      fileAnalytics.value = null;

      const parts = filepath.split('/');
      // directoryIndex is 0-based index into path parts (not including filename)
      // -1 means navigate to root
      if (directoryIndex < 0) {
        currentDirectory.value = '';
      } else {
        currentDirectory.value = parts.slice(0, directoryIndex + 1).join('/');
      }
      fileDisplayLimit.value = 100;
      updateUrl();
    };

    // Get path parts for a filename (for clickable path segments)
    const getFilePathParts = (filename) => {
      if (!filename) return [];
      const parts = filename.split('/');
      // Return all parts except the last one (the filename itself)
      return parts.slice(0, -1);
    };

    // Get just the filename from a path
    const getFileName = (filename) => {
      if (!filename) return '';
      const parts = filename.split('/');
      return parts[parts.length - 1];
    };

    // Get breadcrumb parts for current directory
    const directoryBreadcrumbs = Vue.computed(() => {
      if (!currentDirectory.value) return [];
      return currentDirectory.value.split('/');
    });

    // Navigate to a specific breadcrumb index
    const navigateToBreadcrumb = (index) => {
      const parts = currentDirectory.value.split('/');
      currentDirectory.value = parts.slice(0, index + 1).join('/');
      fileDisplayLimit.value = 100;
      updateUrl();
    };

    // Computed property for displayed functions (paginated for large lists)
    const displayedFunctions = Vue.computed(() => {
      if (!allFunctions.value) return [];
      return allFunctions.value.slice(0, functionDisplayLimit.value);
    });

    const hasMoreFunctions = Vue.computed(() => {
      if (!allFunctions.value) return false;
      return allFunctions.value.length > functionDisplayLimit.value;
    });

    const remainingFunctionsCount = Vue.computed(() => {
      if (!allFunctions.value) return 0;
      return allFunctions.value.length - functionDisplayLimit.value;
    });

    const showMoreFunctions = () => {
      functionDisplayLimit.value += FUNCTION_DISPLAY_INCREMENT;
    };

    const showAllFunctionsItems = () => {
      if (allFunctions.value) {
        functionDisplayLimit.value = allFunctions.value.length;
      }
    };

    // Format reference type for display
    const formatReferenceType = (type) => {
      const typeLabels = {
        variable: 'Variable Declarations',
        parameter: 'Function Parameters',
        return_type: 'Return Types',
        field: 'Field Declarations',
        typedef: 'Type Definitions',
        macro: 'Macro Definitions',
        unknown: 'Other References'
      };
      return typeLabels[type] || type;
    };

    // Navigate to a definition (possibly in another project)
    const navigateToDefinition = async (def) => {
      // If definition is in a different project, switch to that project first
      if (
        def.project_name &&
        (!selectedProject.value ||
          selectedProject.value.name !== def.project_name)
      ) {
        const project = projects.value.find((p) => p.name === def.project_name);
        if (project) {
          await selectProject(project, true);
        }
      }

      // Navigate to the entity
      try {
        const response = await fetch(
          `/api/v1/functions/${encodeURIComponent(def.symbol)}?project=${def.project_name}`
        );
        const results = await response.json();
        if (results.length > 0) {
          const match =
            results.find((r) => r.id === def.id) ||
            results.find(
              (r) =>
                r.filename === def.filename && r.start_line === def.start_line
            ) ||
            results[0];
          await selectFunction(match, true);
        }
      } catch (error) {
        console.error('Failed to navigate to definition:', error);
      }

      updateUrl();
    };

    // Call Graph Functions
    const openCallGraph = async (functionName, skipUrlUpdate = false) => {
      callGraphRoot.value = functionName;
      showCallGraph.value = true;
      selectedFunction.value = null;
      selectedFile.value = null;
      showingAllFunctions.value = false;
      selectedGraphNode.value = null;

      await loadCallGraphForNode(functionName);
      if (!skipUrlUpdate) updateUrl();
    };

    const loadCallGraphForNode = async (functionName) => {
      loadingCallGraph.value = true;
      callGraphRoot.value = functionName;
      selectedGraphNode.value = null;

      try {
        // Always fetch unlimited depth - we filter client-side for instant depth changes
        const response = await fetch(
          `/api/v1/functions/${encodeURIComponent(functionName)}/callgraph?project=${selectedProject.value.name}&depth=0`
        );
        const data = await response.json();
        if (!response.ok) {
          // API returned an error - store it so we can show an appropriate message
          callGraphData.value = {
            error: data.error || 'Failed to load call graph',
            notFound: response.status === 404
          };
        } else {
          callGraphData.value = data;
        }
      } catch (error) {
        console.error('Failed to load call graph:', error);
        callGraphData.value = { error: error.message };
      } finally {
        loadingCallGraph.value = false;
        // Wait for Vue to render the DOM, then render the graph
        await nextTick();
        // Use setTimeout to ensure the browser has painted
        setTimeout(() => {
          renderGraph();
        }, 50);
      }
    };

    const closeCallGraph = () => {
      showCallGraph.value = false;
      callGraphData.value = null;
      treeData.value = null;
      selectedGraphNode.value = null;
      graphViewType.value = 'callgraph';
      if (simulation) {
        simulation.stop();
      }
      updateUrl();
    };

    // Change call graph depth and re-render (no reload needed - we have full data)
    const setCallGraphDepth = async (newDepth) => {
      callGraphDepth.value = newDepth;
      // Just re-render with new depth filter - data is already loaded
      if (
        callGraphData.value &&
        showCallGraph.value &&
        graphViewType.value === 'callgraph'
      ) {
        await nextTick();
        renderGraph();
      }
      // Update URL to reflect new depth
      updateUrl();
    };

    // Change inline call graph depth and re-render
    const setInlineCallGraphDepth = async (newDepth) => {
      inlineCallGraphDepth.value = newDepth;

      // If we have data and are on callgraph tab, re-render with new depth
      if (inlineCallGraphData.value && activeTab.value === 'callgraph') {
        await nextTick();
        renderInlineCallGraph();
      }
    };

    // Switch between graph view types
    const switchGraphView = async (viewType) => {
      if (graphViewType.value === viewType) return;
      graphViewType.value = viewType;
      selectedGraphNode.value = null;

      if (viewType === 'callgraph') {
        await loadCallGraphForNode(callGraphRoot.value);
      } else {
        await loadTreeView(callGraphRoot.value, viewType);
      }
    };

    // Load caller or callee tree
    const loadTreeView = async (functionName, viewType) => {
      loadingCallGraph.value = true;
      treeData.value = null;
      callGraphData.value = null;
      selectedGraphNode.value = null;

      const endpoint = viewType === 'callers' ? 'caller-tree' : 'callee-tree';

      try {
        const response = await fetch(
          `/api/v1/functions/${encodeURIComponent(functionName)}/${endpoint}?project=${selectedProject.value.name}&depth=${treeDepth.value}`
        );
        const data = await response.json();
        if (!response.ok) {
          callGraphData.value = {
            error: data.error || 'Failed to load tree',
            notFound: response.status === 404
          };
        } else {
          treeData.value = data;
        }
      } catch (error) {
        console.error('Failed to load tree:', error);
        callGraphData.value = { error: error.message };
      } finally {
        loadingCallGraph.value = false;
        await nextTick();
        setTimeout(() => {
          renderTree();
        }, 50);
      }
    };

    // Reload tree view when depth changes
    const reloadTreeView = async () => {
      if (graphViewType.value !== 'callgraph') {
        await loadTreeView(callGraphRoot.value, graphViewType.value);
      }
    };

    // Recenter tree on a different node
    const recenterTreeOnNode = async (symbol) => {
      callGraphRoot.value = symbol;
      await loadTreeView(symbol, graphViewType.value);
    };

    // Load control flow flowchart
    const loadFlowchart = async () => {
      if (!selectedFunction.value) return;

      // If data already loaded, just re-render the flowchart
      if (flowchartData.value) {
        await nextTick();
        setTimeout(() => {
          renderFlowchart();
        }, 50);
        return;
      }

      loadingFlowchart.value = true;
      flowchartError.value = '';
      selectedFlowchartNode.value = null;

      try {
        const response = await fetch(
          `/api/v1/functions/${encodeURIComponent(selectedFunction.value.symbol)}/controlflow?project=${selectedProject.value.name}&filename=${encodeURIComponent(selectedFunction.value.filename)}`
        );

        if (!response.ok) {
          const error = await response.json();
          flowchartError.value = error.error || 'Failed to load flowchart';
          return;
        }

        flowchartData.value = await response.json();
      } catch (error) {
        console.error('Failed to load flowchart:', error);
        flowchartError.value = 'Failed to load flowchart';
      } finally {
        loadingFlowchart.value = false;
        await nextTick();
        setTimeout(() => {
          renderFlowchart();
        }, 50);
      }
    };

    // Render control flow flowchart with proper shapes
    const renderFlowchart = () => {
      if (!flowchartData.value || !flowchartSvg.value) {
        console.log('Missing flowchart data or SVG ref');
        return;
      }

      const container = flowchartContainer.value;
      const width = container.clientWidth || 800;
      const height = container.clientHeight || 600;

      // Clear previous flowchart
      d3.select(flowchartSvg.value).selectAll('*').remove();

      flowchartSvgElement = d3.select(flowchartSvg.value);

      // Add zoom behavior
      flowchartZoom = d3
        .zoom()
        .scaleExtent([0.1, 4])
        .on('zoom', (event) => {
          flowchartG.attr('transform', event.transform);
        });

      flowchartSvgElement.call(flowchartZoom);

      // Click on background to deselect node
      flowchartSvgElement.on('click', () => {
        selectedFlowchartNode.value = null;
      });

      flowchartG = flowchartSvgElement.append('g');

      // Define arrow marker
      flowchartSvgElement
        .append('defs')
        .append('marker')
        .attr('id', 'flowchart-arrow')
        .attr('viewBox', '-0 -5 10 10')
        .attr('refX', 8)
        .attr('refY', 0)
        .attr('orient', 'auto')
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .append('path')
        .attr('d', 'M 0,-5 L 10,0 L 0,5')
        .attr('fill', '#666');

      const nodes = flowchartData.value.nodes;
      const edges = flowchartData.value.edges;

      if (!nodes || nodes.length === 0) {
        flowchartError.value = 'No control flow data available';
        return;
      }

      // Layout nodes using dagre-like algorithm (simple vertical layout)
      const nodeWidth = 140;
      const nodeHeight = 50;
      const levelGap = 80;
      const nodeGap = 30;

      // Build adjacency list and compute levels
      const adjList = new Map();
      const inDegree = new Map();

      nodes.forEach((n) => {
        adjList.set(n.id, []);
        inDegree.set(n.id, 0);
      });

      edges.forEach((e) => {
        if (adjList.has(e.from)) {
          adjList.get(e.from).push(e.to);
        }
        if (inDegree.has(e.to)) {
          inDegree.set(e.to, inDegree.get(e.to) + 1);
        }
      });

      // Topological sort to assign levels
      const levels = new Map();
      const queue = [];

      nodes.forEach((n) => {
        if (inDegree.get(n.id) === 0) {
          queue.push(n.id);
          levels.set(n.id, 0);
        }
      });

      while (queue.length > 0) {
        const current = queue.shift();
        const currentLevel = levels.get(current);

        for (const neighbor of adjList.get(current) || []) {
          if (!levels.has(neighbor)) {
            levels.set(neighbor, currentLevel + 1);
          } else {
            levels.set(
              neighbor,
              Math.max(levels.get(neighbor), currentLevel + 1)
            );
          }
          inDegree.set(neighbor, inDegree.get(neighbor) - 1);
          if (inDegree.get(neighbor) === 0) {
            queue.push(neighbor);
          }
        }
      }

      // Handle nodes not reached (cycles)
      nodes.forEach((n) => {
        if (!levels.has(n.id)) {
          levels.set(n.id, 0);
        }
      });

      // Group nodes by level
      const levelGroups = new Map();
      nodes.forEach((n) => {
        const level = levels.get(n.id);
        if (!levelGroups.has(level)) {
          levelGroups.set(level, []);
        }
        levelGroups.get(level).push(n);
      });

      // Position nodes
      const nodePositions = new Map();
      const maxLevel = Math.max(...levels.values());

      levelGroups.forEach((levelNodes, level) => {
        const totalWidth =
          levelNodes.length * nodeWidth + (levelNodes.length - 1) * nodeGap;
        const startX = (width - totalWidth) / 2;

        levelNodes.forEach((node, i) => {
          nodePositions.set(node.id, {
            x: startX + i * (nodeWidth + nodeGap) + nodeWidth / 2,
            y: 60 + level * (nodeHeight + levelGap)
          });
        });
      });

      // Draw edges
      const linkGroup = flowchartG.append('g').attr('class', 'flowchart-links');

      edges.forEach((edge) => {
        const fromPos = nodePositions.get(edge.from);
        const toPos = nodePositions.get(edge.to);

        if (!fromPos || !toPos) return;

        // Calculate path based on relative positions
        const fromNode = nodes.find((n) => n.id === edge.from);
        const toNode = nodes.find((n) => n.id === edge.to);

        let startY = fromPos.y + nodeHeight / 2;
        let endY = toPos.y - nodeHeight / 2;

        // Adjust for diamond shapes (decision nodes)
        if (fromNode && fromNode.type === 'decision') {
          startY = fromPos.y + nodeHeight / 2 + 5;
        }

        // Create path
        const path = linkGroup
          .append('path')
          .attr('class', 'flowchart-edge')
          .attr('marker-end', 'url(#flowchart-arrow)')
          .attr('fill', 'none')
          .attr('stroke', '#666')
          .attr('stroke-width', 1.5);

        // Different path for back edges (loops)
        if (toPos.y <= fromPos.y) {
          // Back edge - curve around
          const midX = Math.max(fromPos.x, toPos.x) + nodeWidth;
          path.attr(
            'd',
            `
            M ${fromPos.x + nodeWidth / 2} ${fromPos.y}
            Q ${midX} ${fromPos.y}, ${midX} ${(fromPos.y + toPos.y) / 2}
            Q ${midX} ${toPos.y}, ${toPos.x + nodeWidth / 2} ${toPos.y}
          `
          );
        } else {
          // Forward edge - straight or slight curve
          const dx = toPos.x - fromPos.x;
          if (Math.abs(dx) < 10) {
            // Straight vertical line
            path.attr('d', `M ${fromPos.x} ${startY} L ${toPos.x} ${endY}`);
          } else {
            // Curved path
            const midY = (startY + endY) / 2;
            path.attr(
              'd',
              `
              M ${fromPos.x} ${startY}
              Q ${fromPos.x} ${midY}, ${(fromPos.x + toPos.x) / 2} ${midY}
              Q ${toPos.x} ${midY}, ${toPos.x} ${endY}
            `
            );
          }
        }

        // Add edge label
        if (edge.label) {
          const labelX = (fromPos.x + toPos.x) / 2;
          const labelY = (fromPos.y + toPos.y) / 2;

          linkGroup
            .append('text')
            .attr('class', 'flowchart-edge-label')
            .attr('x', labelX + 10)
            .attr('y', labelY)
            .attr('text-anchor', 'start')
            .attr('fill', '#666')
            .attr('font-size', '11px')
            .text(edge.label);
        }
      });

      // Draw nodes
      const nodeGroup = flowchartG.append('g').attr('class', 'flowchart-nodes');

      nodes.forEach((node) => {
        const pos = nodePositions.get(node.id);
        if (!pos) return;

        const g = nodeGroup
          .append('g')
          .attr('class', `flowchart-node flowchart-node-${node.type}`)
          .attr('transform', `translate(${pos.x}, ${pos.y})`)
          .style('cursor', node.source_snippet ? 'pointer' : 'default')
          .on('click', (event) => {
            event.stopPropagation();
            if (node.source_snippet || node.full_label) {
              selectedFlowchartNode.value = node;
            }
          });

        // Draw shape based on type
        switch (node.type) {
          case 'start':
          case 'end':
            // Oval/rounded rectangle for start/end
            g.append('rect')
              .attr('x', -nodeWidth / 2)
              .attr('y', -nodeHeight / 2)
              .attr('width', nodeWidth)
              .attr('height', nodeHeight)
              .attr('rx', nodeHeight / 2)
              .attr('ry', nodeHeight / 2)
              .attr('class', 'flowchart-shape-oval');
            break;

          case 'decision':
            // Diamond for decisions
            const diamondSize = nodeHeight * 0.8;
            g.append('polygon')
              .attr(
                'points',
                `
                0,${-diamondSize}
                ${diamondSize},0
                0,${diamondSize}
                ${-diamondSize},0
              `
              )
              .attr('class', 'flowchart-shape-diamond');
            break;

          case 'loop':
            // Hexagon for loops
            const hw = nodeWidth / 2;
            const hh = nodeHeight / 2;
            const indent = 15;
            g.append('polygon')
              .attr(
                'points',
                `
                ${-hw + indent},${-hh}
                ${hw - indent},${-hh}
                ${hw},0
                ${hw - indent},${hh}
                ${-hw + indent},${hh}
                ${-hw},0
              `
              )
              .attr('class', 'flowchart-shape-hexagon');
            break;

          case 'return':
            // Rounded rectangle with different color for return
            g.append('rect')
              .attr('x', -nodeWidth / 2)
              .attr('y', -nodeHeight / 2)
              .attr('width', nodeWidth)
              .attr('height', nodeHeight)
              .attr('rx', 8)
              .attr('ry', 8)
              .attr('class', 'flowchart-shape-return');
            break;

          case 'process':
          default:
            // Rectangle for process
            g.append('rect')
              .attr('x', -nodeWidth / 2)
              .attr('y', -nodeHeight / 2)
              .attr('width', nodeWidth)
              .attr('height', nodeHeight)
              .attr('class', 'flowchart-shape-rect');
            break;
        }

        // Add label
        const label = node.label || node.type;
        const maxLabelLength = 18;
        const displayLabel =
          label.length > maxLabelLength
            ? label.substring(0, maxLabelLength - 2) + '...'
            : label;

        g.append('text')
          .attr('class', 'flowchart-label')
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .attr('y', node.type === 'decision' ? 0 : 0)
          .text(displayLabel)
          .append('title')
          .text(node.full_label || label);

        // Add line number if available
        if (node.line) {
          g.append('text')
            .attr('class', 'flowchart-line-number')
            .attr('text-anchor', 'middle')
            .attr('y', nodeHeight / 2 + 12)
            .attr('font-size', '10px')
            .attr('fill', '#999')
            .text(`Line ${node.line}`);
        }
      });

      // Auto-fit the flowchart to the viewport
      const bounds = flowchartG.node().getBBox();
      const fullWidth = bounds.width + 100;
      const fullHeight = bounds.height + 100;
      const scale = Math.min(width / fullWidth, height / fullHeight, 1);

      flowchartSvgElement.call(
        flowchartZoom.transform,
        d3.zoomIdentity
          .translate(
            width / 2 - bounds.x * scale - (bounds.width * scale) / 2,
            50
          )
          .scale(scale)
      );
    };

    // Flowchart zoom controls
    const flowchartZoomIn = () => {
      if (flowchartSvgElement && flowchartZoom) {
        flowchartSvgElement.transition().call(flowchartZoom.scaleBy, 1.3);
      }
    };

    const flowchartZoomOut = () => {
      if (flowchartSvgElement && flowchartZoom) {
        flowchartSvgElement.transition().call(flowchartZoom.scaleBy, 0.7);
      }
    };

    const flowchartResetZoom = () => {
      if (flowchartSvgElement && flowchartZoom) {
        flowchartSvgElement
          .transition()
          .call(flowchartZoom.transform, d3.zoomIdentity);
      }
    };

    // Load inline call graph for function detail tab
    const loadInlineCallGraph = async () => {
      console.log('loadInlineCallGraph called', {
        hasSelectedFunction: !!selectedFunction.value,
        symbol: selectedFunction.value?.symbol,
        hasExistingData: !!inlineCallGraphData.value
      });

      if (!selectedFunction.value) {
        console.log('No selected function, returning');
        return;
      }

      // If data already loaded, just re-render the graph
      if (inlineCallGraphData.value) {
        console.log('Data already loaded, re-rendering');
        await nextTick();
        setTimeout(() => {
          renderInlineCallGraph();
        }, 50);
        return;
      }

      loadingInlineCallGraph.value = true;
      inlineCallGraphError.value = '';
      selectedInlineGraphNode.value = null;

      try {
        // Fetch with unlimited depth (0) - client-side filtering handles display depth
        const url = `/api/v1/functions/${encodeURIComponent(selectedFunction.value.symbol)}/callgraph?project=${selectedProject.value.name}&depth=0`;
        console.log('Fetching call graph from:', url);

        const response = await fetch(url);
        console.log('Response status:', response.status, response.ok);

        if (!response.ok) {
          const error = await response.json();
          console.log('Error response:', error);
          inlineCallGraphError.value =
            error.error || 'Failed to load call graph';
          return;
        }

        const data = await response.json();
        console.log('Call graph data received:', {
          root: data.root,
          nodeCount: data.nodes?.length,
          edgeCount: data.edges?.length
        });
        inlineCallGraphData.value = data;
      } catch (error) {
        console.error('Failed to load inline call graph:', error);
        inlineCallGraphError.value = 'Failed to load call graph';
      } finally {
        console.log('Finally block, setting loadingInlineCallGraph to false');
        loadingInlineCallGraph.value = false;
        await nextTick();
        setTimeout(() => {
          console.log('setTimeout callback for renderInlineCallGraph');
          renderInlineCallGraph();
        }, 50);
      }
    };

    // Recenter inline call graph on a different function
    const recenterInlineGraph = async (symbol) => {
      loadingInlineCallGraph.value = true;
      inlineCallGraphError.value = '';
      selectedInlineGraphNode.value = null;

      try {
        // Fetch with unlimited depth (0) - client-side filtering handles display depth
        const response = await fetch(
          `/api/v1/functions/${encodeURIComponent(symbol)}/callgraph?project=${selectedProject.value.name}&depth=0`
        );

        if (!response.ok) {
          const error = await response.json();
          inlineCallGraphError.value =
            error.error || 'Failed to load call graph';
          return;
        }

        inlineCallGraphData.value = await response.json();
      } catch (error) {
        console.error('Failed to recenter inline call graph:', error);
        inlineCallGraphError.value = 'Failed to load call graph';
      } finally {
        loadingInlineCallGraph.value = false;
        await nextTick();
        setTimeout(() => {
          renderInlineCallGraph();
        }, 50);
      }
    };

    // Render inline call graph using D3
    const renderInlineCallGraph = () => {
      console.log('renderInlineCallGraph called', {
        hasData: !!inlineCallGraphData.value,
        hasSvgRef: !!inlineGraphSvg.value,
        svgElement: inlineGraphSvg.value,
        nodeCount: inlineCallGraphData.value?.nodes?.length,
        edgeCount: inlineCallGraphData.value?.edges?.length,
        currentDepth: inlineCallGraphDepth.value
      });
      if (!inlineCallGraphData.value || !inlineGraphSvg.value) {
        console.log('Missing inline call graph data or SVG ref');
        return;
      }

      // Log the current state of the SVG before clearing
      const currentSvgChildren = inlineGraphSvg.value?.childNodes?.length || 0;
      console.log('[InlineCallGraph] SVG state before clear:', {
        childCount: currentSvgChildren,
        hasRunningSimulation: !!inlineSimulation
      });

      const container = inlineGraphContainer.value;
      const width = container.clientWidth || 800;
      const height = container.clientHeight || 600;

      // Stop any running simulation before clearing
      if (inlineSimulation) {
        inlineSimulation.stop();
        inlineSimulation = null;
      }

      // Clear previous graph
      d3.select(inlineGraphSvg.value).selectAll('*').remove();

      inlineGraphSvgElement = d3.select(inlineGraphSvg.value);

      // Add zoom behavior
      inlineGraphZoom = d3
        .zoom()
        .scaleExtent([0.1, 4])
        .on('zoom', (event) => {
          inlineGraphG.attr('transform', event.transform);
        });

      inlineGraphSvgElement.call(inlineGraphZoom);

      inlineGraphG = inlineGraphSvgElement.append('g');

      // Define arrow marker
      inlineGraphSvgElement
        .append('defs')
        .append('marker')
        .attr('id', 'inline-arrowhead')
        .attr('viewBox', '-0 -5 10 10')
        .attr('refX', 20)
        .attr('refY', 0)
        .attr('orient', 'auto')
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .append('path')
        .attr('d', 'M 0,-5 L 10,0 L 0,5')
        .attr('class', 'graph-arrow');

      // Get full data from cache (fetched with unlimited depth)
      const allNodes = inlineCallGraphData.value.nodes || [];
      const allEdges = inlineCallGraphData.value.edges || [];
      const rootId = inlineCallGraphData.value.root;

      // Filter edges by depth using the depth info returned by server
      // Each edge has callee_depth (downstream from root) and/or caller_depth (upstream from root)
      const maxDepth = inlineCallGraphDepth.value; // 0 means unlimited

      console.log('[InlineCallGraph] Filtering edges:', {
        totalEdges: allEdges.length,
        maxDepth,
        sampleEdge: allEdges[0],
        hasDepthInfo:
          allEdges.length > 0 &&
          (allEdges[0].callee_depth !== undefined ||
            allEdges[0].caller_depth !== undefined)
      });

      let filteredEdges;
      if (maxDepth === 0) {
        // Unlimited - include all edges
        filteredEdges = allEdges;
      } else {
        // Filter edges where at least one depth is within maxDepth
        // callee_depth: edge is reachable going downstream from root
        // caller_depth: edge is reachable going upstream from root
        filteredEdges = allEdges.filter((e) => {
          const calleeOk = e.callee_depth != null && e.callee_depth <= maxDepth;
          const callerOk = e.caller_depth != null && e.caller_depth <= maxDepth;
          return calleeOk || callerOk;
        });
      }

      console.log('[InlineCallGraph] After filtering:', {
        filteredEdges: filteredEdges.length,
        filteredNodes: null, // will be set below
        maxDepth
      });

      // Collect node IDs from filtered edges
      const allowedNodeIds = new Set();
      allowedNodeIds.add(rootId); // Always include root
      filteredEdges.forEach((e) => {
        allowedNodeIds.add(e.from);
        allowedNodeIds.add(e.to);
      });

      // Filter nodes based on allowed node IDs
      const nodes = allNodes
        .filter((n) => allowedNodeIds.has(n.id))
        .map((n) => ({ ...n })); // Deep copy for D3
      const edges = filteredEdges.filter(
        (e) => allowedNodeIds.has(e.from) && allowedNodeIds.has(e.to)
      );

      console.log('[InlineCallGraph] Final result:', {
        nodes: nodes.length,
        edges: edges.length,
        nodeSymbols: nodes.slice(0, 5).map((n) => n.symbol)
      });

      // Calculate depth for each node using BFS from root
      // Callers are at negative depths (upstream), callees at positive depths (downstream)
      const nodeDepths = new Map();
      nodeDepths.set(rootId, 0);

      // Build adjacency lists for BFS
      const calleeAdj = new Map(); // caller -> [callees]
      const callerAdj = new Map(); // callee -> [callers]
      edges.forEach((e) => {
        if (!calleeAdj.has(e.from)) calleeAdj.set(e.from, []);
        calleeAdj.get(e.from).push(e.to);
        if (!callerAdj.has(e.to)) callerAdj.set(e.to, []);
        callerAdj.get(e.to).push(e.from);
      });

      // BFS for callees (positive depth)
      const calleeQueue = [rootId];
      while (calleeQueue.length > 0) {
        const current = calleeQueue.shift();
        const currentDepth = nodeDepths.get(current);
        const callees = calleeAdj.get(current) || [];
        for (const callee of callees) {
          if (!nodeDepths.has(callee)) {
            nodeDepths.set(callee, currentDepth + 1);
            calleeQueue.push(callee);
          }
        }
      }

      // BFS for callers (also positive depth - distance from root)
      const callerQueue = [rootId];
      const callerVisited = new Set([rootId]);
      while (callerQueue.length > 0) {
        const current = callerQueue.shift();
        const currentDepth = nodeDepths.get(current);
        const callers = callerAdj.get(current) || [];
        for (const caller of callers) {
          if (!callerVisited.has(caller)) {
            callerVisited.add(caller);
            // Only set depth if not already set (prefer callee depth)
            if (!nodeDepths.has(caller)) {
              // Callers are also at positive depth (distance from root)
              nodeDepths.set(caller, currentDepth + 1);
            }
            callerQueue.push(caller);
          }
        }
      }

      // Store depth on nodes for color-coding
      const maxDepthVal = Math.max(...Array.from(nodeDepths.values()));
      nodes.forEach((n) => {
        n.depth = nodeDepths.get(n.id) || 0;
      });

      // Create links
      const links = edges
        .map((e) => ({
          source: nodes.find((n) => n.id === e.from),
          target: nodes.find((n) => n.id === e.to),
          line: e.line
        }))
        .filter((l) => l.source && l.target);

      // Color scale for depth visualization
      const depthColors = [
        '#e91e63', // depth 0 (root) - pink
        '#2196f3', // depth 1 - blue
        '#4caf50', // depth 2 - green
        '#ff9800', // depth 3 - orange
        '#9c27b0', // depth 4 - purple
        '#00bcd4', // depth 5 - cyan
        '#795548', // depth 6 - brown
        '#607d8b' // depth 7+ - blue-grey
      ];

      const depthFills = [
        '#fce4ec', // depth 0 (root) - light pink
        '#e3f2fd', // depth 1 - light blue
        '#e8f5e9', // depth 2 - light green
        '#fff3e0', // depth 3 - light orange
        '#f3e5f5', // depth 4 - light purple
        '#e0f7fa', // depth 5 - light cyan
        '#efebe9', // depth 6 - light brown
        '#eceff1' // depth 7+ - light blue-grey
      ];

      const getDepthColor = (depth) => {
        return depthColors[Math.min(depth, depthColors.length - 1)];
      };

      const getDepthFill = (depth) => {
        return depthFills[Math.min(depth, depthFills.length - 1)];
      };

      // Create force-directed simulation
      inlineSimulation = d3
        .forceSimulation(nodes)
        .force(
          'link',
          d3
            .forceLink(links)
            .id((d) => d.id)
            .distance(100)
        )
        .force('charge', d3.forceManyBody().strength(-300))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide().radius(40));

      // Draw links
      console.log('[InlineCallGraph] D3 rendering with:', {
        linksCount: links.length,
        nodesCount: nodes.length,
        maxDepth: maxDepthVal,
        rootSymbol: nodes.find((n) => n.id === rootId)?.symbol
      });

      const link = inlineGraphG
        .append('g')
        .selectAll('line')
        .data(links)
        .join('line')
        .attr('class', 'graph-link')
        .attr('marker-end', 'url(#inline-arrowhead)');

      // Draw nodes with depth-based colors
      const node = inlineGraphG
        .append('g')
        .selectAll('g')
        .data(nodes)
        .join('g')
        .attr('class', (d) => `graph-node ${d.id === rootId ? 'root' : ''}`)
        .call(
          d3
            .drag()
            .on('start', dragstarted)
            .on('drag', dragged)
            .on('end', dragended)
        )
        .on('click', (event, d) => {
          event.stopPropagation();
          selectedInlineGraphNode.value = d;

          // Update selected state
          inlineGraphG
            .selectAll('.graph-node')
            .classed('selected', (n) => n.id === d.id);

          // Highlight connected links
          link.classed(
            'highlighted',
            (l) => l.source.id === d.id || l.target.id === d.id
          );
        });

      node
        .append('circle')
        .attr('r', (d) => (d.id === rootId ? 18 : 14))
        .attr('fill', (d) => getDepthFill(d.depth))
        .attr('stroke', (d) => getDepthColor(d.depth))
        .attr('stroke-width', 2);

      node
        .append('text')
        .attr('dy', 30)
        .attr('text-anchor', 'middle')
        .text((d) =>
          d.symbol.length > 20 ? d.symbol.substring(0, 17) + '...' : d.symbol
        );

      // Update positions on tick
      inlineSimulation.on('tick', () => {
        link
          .attr('x1', (d) => d.source.x)
          .attr('y1', (d) => d.source.y)
          .attr('x2', (d) => d.target.x)
          .attr('y2', (d) => d.target.y);

        node.attr('transform', (d) => `translate(${d.x},${d.y})`);
      });

      function dragstarted(event, d) {
        if (!event.active) inlineSimulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      }

      function dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
      }

      function dragended(event, d) {
        if (!event.active) inlineSimulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      }

      // Click on background to deselect
      inlineGraphSvgElement.on('click', () => {
        selectedInlineGraphNode.value = null;
        inlineGraphG.selectAll('.graph-node').classed('selected', false);
        link.classed('highlighted', false);
      });

      // Verify final DOM state
      const finalNodeCount = inlineGraphG.selectAll('.graph-node').size();
      const finalLinkCount = inlineGraphG.selectAll('line').size();
      console.log('[InlineCallGraph] Final DOM state:', {
        nodesInDOM: finalNodeCount,
        linksInDOM: finalLinkCount,
        expectedNodes: nodes.length,
        expectedLinks: links.length
      });
    };

    // Helper function to compute allowed nodes at a given depth
    // Uses server-provided depth information on edges
    const computeAllowedNodes = (depth) => {
      if (!inlineCallGraphData.value) return new Set();

      const allEdges = inlineCallGraphData.value.edges || [];
      const rootId = inlineCallGraphData.value.root;
      const allowedNodeIds = new Set();
      allowedNodeIds.add(rootId); // Always include root

      if (depth === 0) {
        // Unlimited - include all nodes from all edges
        allEdges.forEach((e) => {
          allowedNodeIds.add(e.from);
          allowedNodeIds.add(e.to);
        });
      } else {
        // Filter edges by depth using server-provided depth info
        allEdges.forEach((e) => {
          const calleeOk = e.callee_depth != null && e.callee_depth <= depth;
          const callerOk = e.caller_depth != null && e.caller_depth <= depth;
          if (calleeOk || callerOk) {
            allowedNodeIds.add(e.from);
            allowedNodeIds.add(e.to);
          }
        });
      }
      return allowedNodeIds;
    };

    // Update call graph when depth changes (incremental add/remove)
    const updateInlineCallGraphDepth = (oldDepth, newDepth) => {
      if (!inlineCallGraphData.value || !inlineGraphG || !inlineSimulation) {
        // No graph rendered yet, do full render
        renderInlineCallGraph();
        return;
      }

      const allNodes = inlineCallGraphData.value.nodes || [];
      const allEdges = inlineCallGraphData.value.edges || [];
      const rootId = inlineCallGraphData.value.root;

      // Compute which nodes should be visible at the new depth
      const allowedNodeIds = computeAllowedNodes(newDepth);

      // Filter to get new nodes and edges
      const nodes = allNodes
        .filter((n) => allowedNodeIds.has(n.id))
        .map((n) => {
          // Preserve position if node already exists in simulation
          const existing = inlineSimulation
            .nodes()
            .find((sn) => sn.id === n.id);
          if (existing) {
            return {
              ...n,
              x: existing.x,
              y: existing.y,
              vx: existing.vx,
              vy: existing.vy
            };
          }
          return { ...n };
        });

      const edges = allEdges.filter(
        (e) => allowedNodeIds.has(e.from) && allowedNodeIds.has(e.to)
      );

      const links = edges
        .map((e) => ({
          source: nodes.find((n) => n.id === e.from),
          target: nodes.find((n) => n.id === e.to),
          line: e.line
        }))
        .filter((l) => l.source && l.target);

      // Update simulation with new nodes
      inlineSimulation.nodes(nodes);
      inlineSimulation.force('link').links(links);

      // Update links with D3 data join
      const link = inlineGraphG
        .select('g:first-child')
        .selectAll('line')
        .data(links, (d) => `${d.source.id}-${d.target.id}`);

      link.exit().transition().duration(300).style('opacity', 0).remove();

      const linkEnter = link
        .enter()
        .append('line')
        .attr('class', 'graph-link')
        .attr('marker-end', 'url(#inline-arrowhead)')
        .style('opacity', 0);

      linkEnter.transition().duration(300).style('opacity', 1);

      const allLinks = linkEnter.merge(link);

      // Update nodes with D3 data join
      const node = inlineGraphG
        .select('g:nth-child(2)')
        .selectAll('g.graph-node')
        .data(nodes, (d) => d.id);

      node.exit().transition().duration(300).style('opacity', 0).remove();

      const nodeEnter = node
        .enter()
        .append('g')
        .attr('class', (d) => `graph-node ${d.id === rootId ? 'root' : ''}`)
        .style('opacity', 0)
        .call(
          d3
            .drag()
            .on('start', (event, d) => {
              if (!event.active) inlineSimulation.alphaTarget(0.3).restart();
              d.fx = d.x;
              d.fy = d.y;
            })
            .on('drag', (event, d) => {
              d.fx = event.x;
              d.fy = event.y;
            })
            .on('end', (event, d) => {
              if (!event.active) inlineSimulation.alphaTarget(0);
              d.fx = null;
              d.fy = null;
            })
        )
        .on('click', (event, d) => {
          event.stopPropagation();
          selectedInlineGraphNode.value = d;
          inlineGraphG
            .selectAll('.graph-node')
            .classed('selected', (n) => n.id === d.id);
          allLinks.classed(
            'highlighted',
            (l) => l.source.id === d.id || l.target.id === d.id
          );
        });

      nodeEnter
        .append('circle')
        .attr('r', (d) => (d.id === rootId ? 18 : 14))
        .attr('fill', (d) => (d.id === rootId ? '#fce4ec' : '#e3f2fd'))
        .attr('stroke', (d) => (d.id === rootId ? '#e91e63' : '#2196f3'));

      nodeEnter
        .append('text')
        .attr('dy', 30)
        .attr('text-anchor', 'middle')
        .text((d) =>
          d.symbol.length > 20 ? d.symbol.substring(0, 17) + '...' : d.symbol
        );

      nodeEnter.transition().duration(300).style('opacity', 1);

      const allNodes2 = nodeEnter.merge(node);

      // Update tick handler
      inlineSimulation.on('tick', () => {
        allLinks
          .attr('x1', (d) => d.source.x)
          .attr('y1', (d) => d.source.y)
          .attr('x2', (d) => d.target.x)
          .attr('y2', (d) => d.target.y);

        allNodes2.attr('transform', (d) => `translate(${d.x},${d.y})`);
      });

      // Restart simulation with low alpha to smoothly settle
      inlineSimulation.alpha(0.3).restart();
    };

    // Inline graph zoom controls
    const inlineGraphZoomIn = () => {
      if (inlineGraphSvgElement && inlineGraphZoom) {
        inlineGraphSvgElement.transition().call(inlineGraphZoom.scaleBy, 1.3);
      }
    };

    const inlineGraphZoomOut = () => {
      if (inlineGraphSvgElement && inlineGraphZoom) {
        inlineGraphSvgElement.transition().call(inlineGraphZoom.scaleBy, 0.7);
      }
    };

    const inlineGraphResetZoom = () => {
      if (inlineGraphSvgElement && inlineGraphZoom) {
        inlineGraphSvgElement
          .transition()
          .call(inlineGraphZoom.transform, d3.zoomIdentity);
      }
    };

    // Toggle fullscreen for inline call graph
    const toggleInlineGraphFullscreen = () => {
      inlineGraphFullscreen.value = !inlineGraphFullscreen.value;
      // Re-render after fullscreen change to adjust dimensions
      nextTick(() => {
        if (inlineCallGraphData.value) {
          renderInlineCallGraph();
        }
      });
    };

    // Toggle fullscreen for flowchart
    const toggleFlowchartFullscreen = () => {
      flowchartFullscreen.value = !flowchartFullscreen.value;
      // Re-render after fullscreen change to adjust dimensions
      nextTick(() => {
        if (flowchartData.value) {
          renderFlowchart();
        }
      });
    };

    // Render tree using D3 tree layout
    const renderTree = () => {
      if (!treeData.value || !graphSvg.value) {
        console.log('Missing tree data or SVG ref');
        return;
      }

      const container = graphContainer.value;
      const width = container.clientWidth || 800;
      const height = container.clientHeight || 600;

      // Clear previous graph
      d3.select(graphSvg.value).selectAll('*').remove();

      svg = d3.select(graphSvg.value);

      // Add zoom behavior
      zoom = d3
        .zoom()
        .scaleExtent([0.1, 4])
        .on('zoom', (event) => {
          g.attr('transform', event.transform);
        });

      svg.call(zoom);

      g = svg.append('g').attr('transform', `translate(${width / 2}, 40)`);

      // Convert tree data to D3 hierarchy
      const childrenKey =
        graphViewType.value === 'callers' ? 'callers' : 'callees';

      const root = d3.hierarchy(treeData.value, (d) => d[childrenKey]);

      // Create tree layout - horizontal for better readability
      const treeLayout = d3.tree().nodeSize([60, 180]);

      treeLayout(root);

      // Draw links
      g.selectAll('.tree-link')
        .data(root.links())
        .join('path')
        .attr('class', 'tree-link')
        .attr(
          'd',
          d3
            .linkHorizontal()
            .x((d) => d.y)
            .y((d) => d.x)
        );

      // Draw nodes
      const node = g
        .selectAll('.tree-node')
        .data(root.descendants())
        .join('g')
        .attr('class', (d) => {
          let classes = 'tree-node';
          if (d.depth === 0) classes += ' root';
          if (d.data.truncated) classes += ' truncated';
          if (d.data.loop) classes += ' loop';
          if (d.data.notFound) classes += ' not-found';
          return classes;
        })
        .attr('transform', (d) => `translate(${d.y},${d.x})`)
        .on('click', (event, d) => {
          event.stopPropagation();
          selectedGraphNode.value = d.data;

          // Update selected state
          g.selectAll('.tree-node').classed('selected', (n) => n === d);
        });

      // Node circles
      node
        .append('circle')
        .attr('r', (d) => (d.depth === 0 ? 12 : 10))
        .attr('fill', (d) => {
          if (d.depth === 0) return '#fce4ec';
          if (d.data.loop) return '#fce4ec';
          if (d.data.truncated) return '#fff3e0';
          return '#e8f5e9';
        })
        .attr('stroke', (d) => {
          if (d.depth === 0) return '#e91e63';
          if (d.data.loop) return '#9c27b0';
          if (d.data.truncated) return '#ff9800';
          return '#4caf50';
        })
        .attr('stroke-width', 2);

      // Node labels
      node
        .append('text')
        .attr('dy', '0.35em')
        .attr('x', (d) => (d.children ? -15 : 15))
        .attr('text-anchor', (d) => (d.children ? 'end' : 'start'))
        .text((d) => {
          const symbol = d.data.symbol;
          if (symbol.length > 25) return symbol.substring(0, 22) + '...';
          return symbol;
        })
        .clone(true)
        .lower()
        .attr('stroke', 'white')
        .attr('stroke-width', 3);

      // Add status indicators for special nodes
      node
        .filter((d) => d.data.truncated)
        .append('text')
        .attr('class', 'node-status')
        .attr('dy', '0.35em')
        .attr('x', (d) => (d.children ? 15 : -15))
        .attr('text-anchor', (d) => (d.children ? 'start' : 'end'))
        .text('⋯')
        .attr('fill', '#ff9800');

      node
        .filter((d) => d.data.loop)
        .append('text')
        .attr('class', 'node-status')
        .attr('dy', '0.35em')
        .attr('x', (d) => (d.children ? 15 : -15))
        .attr('text-anchor', (d) => (d.children ? 'start' : 'end'))
        .text('↻')
        .attr('fill', '#9c27b0');

      // Click on background to deselect
      svg.on('click', () => {
        selectedGraphNode.value = null;
        g.selectAll('.tree-node').classed('selected', false);
      });

      // Auto-fit the tree to the viewport
      const bounds = g.node().getBBox();
      const fullWidth = bounds.width + 100;
      const fullHeight = bounds.height + 100;
      const scale = Math.min(width / fullWidth, height / fullHeight, 1);

      svg.call(
        zoom.transform,
        d3.zoomIdentity
          .translate(
            width / 2 - bounds.x * scale - (bounds.width * scale) / 2,
            height / 2 - bounds.y * scale - (bounds.height * scale) / 2
          )
          .scale(scale)
      );
    };

    const renderGraph = () => {
      console.log('renderGraph called', {
        hasData: !!callGraphData.value,
        hasSvg: !!graphSvg.value,
        hasContainer: !!graphContainer.value
      });

      if (!callGraphData.value || !graphSvg.value) {
        console.log('Missing data or SVG ref, aborting render');
        return;
      }

      const container = graphContainer.value;
      const width = container.clientWidth || 800;
      const height = container.clientHeight || 600;

      console.log('Graph dimensions:', { width, height });
      console.log(
        'Nodes:',
        callGraphData.value.nodes?.length,
        'Edges:',
        callGraphData.value.edges?.length
      );

      // Stop any running simulation before clearing
      if (simulation) {
        simulation.stop();
        simulation = null;
      }

      // Clear previous graph
      d3.select(graphSvg.value).selectAll('*').remove();

      svg = d3.select(graphSvg.value);

      // Add zoom behavior
      zoom = d3
        .zoom()
        .scaleExtent([0.1, 4])
        .on('zoom', (event) => {
          g.attr('transform', event.transform);
        });

      svg.call(zoom);

      g = svg.append('g');

      // Define arrow marker
      svg
        .append('defs')
        .append('marker')
        .attr('id', 'arrowhead')
        .attr('viewBox', '-0 -5 10 10')
        .attr('refX', 20)
        .attr('refY', 0)
        .attr('orient', 'auto')
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .append('path')
        .attr('d', 'M 0,-5 L 10,0 L 0,5')
        .attr('class', 'graph-arrow');

      // Get full data from cache (fetched with unlimited depth)
      const allNodes = callGraphData.value.nodes || [];
      const allEdges = callGraphData.value.edges || [];
      const rootId = callGraphData.value.root;

      // Filter edges by depth using the depth info returned by server
      // Each edge has callee_depth (downstream from root) and/or caller_depth (upstream from root)
      const maxDepth = callGraphDepth.value; // 0 means unlimited

      console.log('[CallGraph] Filtering edges:', {
        totalEdges: allEdges.length,
        maxDepth,
        sampleEdge: allEdges[0],
        hasDepthInfo:
          allEdges.length > 0 &&
          (allEdges[0].callee_depth !== undefined ||
            allEdges[0].caller_depth !== undefined)
      });

      let filteredEdges;
      if (maxDepth === 0) {
        // Unlimited - include all edges
        filteredEdges = allEdges;
      } else {
        // Filter edges where at least one depth is within maxDepth
        // callee_depth: edge is reachable going downstream from root
        // caller_depth: edge is reachable going upstream from root
        filteredEdges = allEdges.filter((e) => {
          const calleeOk = e.callee_depth != null && e.callee_depth <= maxDepth;
          const callerOk = e.caller_depth != null && e.caller_depth <= maxDepth;
          return calleeOk || callerOk;
        });
      }

      console.log('[CallGraph] After filtering:', {
        filteredEdges: filteredEdges.length,
        maxDepth
      });

      // Collect node IDs from filtered edges
      const allowedNodeIds = new Set();
      allowedNodeIds.add(rootId); // Always include root
      filteredEdges.forEach((e) => {
        allowedNodeIds.add(e.from);
        allowedNodeIds.add(e.to);
      });

      // Filter nodes based on allowed node IDs
      const nodes = allNodes
        .filter((n) => allowedNodeIds.has(n.id))
        .map((n) => ({ ...n })); // Deep copy for D3
      const edges = filteredEdges.filter(
        (e) => allowedNodeIds.has(e.from) && allowedNodeIds.has(e.to)
      );

      // Abort if no data to render
      if (nodes.length === 0) {
        console.log('No nodes to render');
        return;
      }

      // Create links
      const links = edges
        .map((e) => ({
          source: nodes.find((n) => n.id === e.from),
          target: nodes.find((n) => n.id === e.to),
          line: e.line
        }))
        .filter((l) => l.source && l.target);

      // Create simulation
      simulation = d3
        .forceSimulation(nodes)
        .force(
          'link',
          d3
            .forceLink(links)
            .id((d) => d.id)
            .distance(120)
        )
        .force('charge', d3.forceManyBody().strength(-400))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide().radius(50));

      // Draw links
      const link = g
        .append('g')
        .selectAll('line')
        .data(links)
        .join('line')
        .attr('class', 'graph-link')
        .attr('marker-end', 'url(#arrowhead)');

      // Draw nodes
      const node = g
        .append('g')
        .selectAll('g')
        .data(nodes)
        .join('g')
        .attr('class', (d) => `graph-node ${d.id === rootId ? 'root' : ''}`)
        .call(
          d3
            .drag()
            .on('start', dragstarted)
            .on('drag', dragged)
            .on('end', dragended)
        )
        .on('click', (event, d) => {
          event.stopPropagation();
          selectedGraphNode.value = d;

          // Update selected state
          g.selectAll('.graph-node').classed('selected', (n) => n.id === d.id);

          // Highlight connected links
          link.classed(
            'highlighted',
            (l) => l.source.id === d.id || l.target.id === d.id
          );
        });

      node
        .append('circle')
        .attr('r', (d) => (d.id === rootId ? 18 : 14))
        .attr('fill', (d) => (d.id === rootId ? '#fce4ec' : '#e3f2fd'))
        .attr('stroke', (d) => (d.id === rootId ? '#e91e63' : '#2196f3'));

      node
        .append('text')
        .attr('dy', 30)
        .attr('text-anchor', 'middle')
        .text((d) =>
          d.symbol.length > 20 ? d.symbol.substring(0, 17) + '...' : d.symbol
        );

      // Update positions on tick
      simulation.on('tick', () => {
        link
          .attr('x1', (d) => d.source.x)
          .attr('y1', (d) => d.source.y)
          .attr('x2', (d) => d.target.x)
          .attr('y2', (d) => d.target.y);

        node.attr('transform', (d) => `translate(${d.x},${d.y})`);
      });

      function dragstarted(event, d) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      }

      function dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
      }

      function dragended(event, d) {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      }

      // Click on background to deselect
      svg.on('click', () => {
        selectedGraphNode.value = null;
        g.selectAll('.graph-node').classed('selected', false);
        link.classed('highlighted', false);
      });
    };

    const zoomIn = () => {
      svg.transition().call(zoom.scaleBy, 1.3);
    };

    const zoomOut = () => {
      svg.transition().call(zoom.scaleBy, 0.7);
    };

    const resetZoom = () => {
      svg.transition().call(zoom.transform, d3.zoomIdentity);
    };

    const viewFunctionDetails = async (node) => {
      showCallGraph.value = false;

      const projectParam = selectedProject.value
        ? `?project=${selectedProject.value.name}`
        : '';
      try {
        const response = await fetch(
          `/api/v1/functions/${encodeURIComponent(node.symbol)}${projectParam}`
        );
        const results = await response.json();
        if (results.length > 0) {
          selectedFunction.value =
            results.find((r) => r.id === node.id) || results[0];
          selectedFile.value = selectedFunction.value.filename;
        }
      } catch (error) {
        console.error('Failed to load function details:', error);
      }

      activeTab.value = 'source';
      callers.value = [];
      callees.value = [];
    };

    // Calculate percentage for complexity distribution bar
    const getDistributionPercent = (complexity, level) => {
      if (
        !complexity ||
        !complexity.complexity_distribution ||
        complexity.total_functions === 0
      ) {
        return 0;
      }
      return (
        (complexity.complexity_distribution[level] /
          complexity.total_functions) *
        100
      );
    };

    // Reset to home/default state
    const resetToHome = (skipUrlUpdate = false) => {
      selectedProject.value = null;
      projectInfo.value = null;
      selectedFile.value = null;
      fileFunctions.value = [];
      selectedFunction.value = null;
      showingAllFunctions.value = false;
      allFunctions.value = [];
      showCallGraph.value = false;
      callGraphData.value = null;
      selectedGraphNode.value = null;
      searchQuery.value = '';
      searchResults.value = [];
      hasSearched.value = false;
      callers.value = [];
      callees.value = [];
      showJobsView.value = false;
      showAnalysisView.value = false;
      analysisData.value = null;
      analysisDetail.value = null;
      analysisTab.value = 'overview';
      if (simulation) {
        simulation.stop();
      }
      if (!skipUrlUpdate) {
        window.history.pushState({}, '', window.location.pathname);
      }
    };

    // Import project modal functions
    const closeImportModal = () => {
      showImportModal.value = false;
      importPath.value = '';
      importName.value = '';
      importError.value = '';
      importSuccess.value = '';
    };

    // Job queue functions
    const loadJobQueue = async () => {
      try {
        const [jobsResponse, statsResponse] = await Promise.all([
          fetch('/api/v1/jobs'),
          fetch('/api/v1/jobs/stats')
        ]);
        jobs.value = await jobsResponse.json();
        jobQueueStats.value = await statsResponse.json();
      } catch (error) {
        console.error('Failed to load job queue:', error);
      }
    };

    const startJobPolling = () => {
      // Poll every 1 second when there are active jobs
      if (jobPollInterval) return;
      jobPollInterval = setInterval(async () => {
        await loadJobQueue();
        // Stop polling if no active jobs
        if (
          jobQueueStats.value.running === 0 &&
          jobQueueStats.value.queued === 0
        ) {
          stopJobPolling();
        }
      }, 1000);
    };

    const stopJobPolling = () => {
      if (jobPollInterval) {
        clearInterval(jobPollInterval);
        jobPollInterval = null;
      }
    };

    // WebSocket connection for real-time job updates
    const initWebSocket = async () => {
      if (nesClient) return; // Already initialized

      try {
        nesClient = new nes.Client(`ws://${window.location.host}`);

        nesClient.onDisconnect = (willReconnect, log) => {
          console.log('[WS] Disconnected, willReconnect:', willReconnect);
          wsConnected.value = false;
          // Fall back to polling if we have active subscriptions
          if (jobSubscriptions.size > 0) {
            startJobPolling();
          }
        };

        nesClient.onConnect = () => {
          console.log('[WS] Connected');
          wsConnected.value = true;
          // Stop polling since we have WebSocket now
          stopJobPolling();
        };

        await nesClient.connect({ reconnect: true, delay: wsReconnectDelay });

        // Subscribe to queue stats for real-time updates
        await nesClient.subscribe('/jobs/stats', (update) => {
          jobQueueStats.value = update;
        });

        console.log('[WS] WebSocket initialized and subscribed to stats');
      } catch (error) {
        console.warn(
          '[WS] WebSocket connection failed, using polling fallback:',
          error.message
        );
        nesClient = null;
        wsConnected.value = false;
      }
    };

    // Subscribe to a specific job's updates via WebSocket
    const subscribeToJob = async (jobId, onComplete, onError) => {
      // Store callbacks for this job
      jobSubscriptions.set(jobId, { onComplete, onError });

      // If WebSocket is connected, subscribe
      if (nesClient && wsConnected.value) {
        try {
          await nesClient.subscribe(`/jobs/${jobId}`, (job) => {
            handleJobUpdate(job);
          });
          console.log(`[WS] Subscribed to job ${jobId}`);
          return true;
        } catch (error) {
          console.warn(
            `[WS] Failed to subscribe to job ${jobId}:`,
            error.message
          );
        }
      }

      // Fall back to polling
      console.log(`[WS] Using polling fallback for job ${jobId}`);
      pollJobStatus(jobId, onComplete, onError);
      return false;
    };

    // Handle job update from WebSocket
    const handleJobUpdate = (job) => {
      // Update jobs list
      const index = jobs.value.findIndex((j) => j.id === job.id);
      if (index >= 0) {
        jobs.value[index] = job;
      } else {
        jobs.value.unshift(job);
      }

      // Check for completion callbacks
      const callbacks = jobSubscriptions.get(job.id);
      if (callbacks) {
        if (job.status === 'completed') {
          callbacks.onComplete(job);
          unsubscribeFromJob(job.id);
        } else if (job.status === 'failed') {
          callbacks.onError(job.error || 'Job failed');
          unsubscribeFromJob(job.id);
        }
      }
    };

    // Unsubscribe from a job's updates
    const unsubscribeFromJob = async (jobId) => {
      jobSubscriptions.delete(jobId);

      if (nesClient && wsConnected.value) {
        try {
          await nesClient.unsubscribe(`/jobs/${jobId}`);
          console.log(`[WS] Unsubscribed from job ${jobId}`);
        } catch (error) {
          // Ignore unsubscribe errors
        }
      }
    };

    const toggleJobsView = async () => {
      showJobsView.value = !showJobsView.value;
      if (showJobsView.value) {
        // Clear other views when showing jobs
        selectedProject.value = null;
        selectedFile.value = null;
        selectedFunction.value = null;
        showCallGraph.value = false;
        showingAllFunctions.value = false;
        showAnalysisView.value = false;
        // Refresh job data
        await loadJobQueue();
        startJobPolling();
      }
      updateUrl();
    };

    // Analysis view functions
    const toggleAnalysisView = async () => {
      console.log(
        'toggleAnalysisView called, selectedProject:',
        selectedProject.value
      );
      if (!selectedProject.value) return;

      showAnalysisView.value = !showAnalysisView.value;
      console.log('showAnalysisView is now:', showAnalysisView.value);
      if (showAnalysisView.value) {
        // Clear other views
        selectedFile.value = null;
        selectedFunction.value = null;
        showCallGraph.value = false;
        showingAllFunctions.value = false;
        showJobsView.value = false;
        // Load analysis data
        await loadAnalysisDashboard();
      }
      updateUrl();
    };

    const closeAnalysisView = () => {
      showAnalysisView.value = false;
      analysisData.value = null;
      analysisDetail.value = null;
      analysisTab.value = 'overview';
      updateUrl();
    };

    const loadAnalysisDashboard = async () => {
      if (!selectedProject.value) return;

      loadingAnalysis.value = true;
      analysisData.value = null;
      analysisDetail.value = null;
      analysisTab.value = 'overview';

      try {
        const response = await fetch(
          `/api/v1/projects/${selectedProject.value.name}/analysis`
        );
        analysisData.value = await response.json();
      } catch (error) {
        console.error('Failed to load analysis dashboard:', error);
      } finally {
        loadingAnalysis.value = false;
      }
    };

    // Sync summary counts with actual detail data to fix mismatches
    const sync_analysis_counts = (type, detail) => {
      if (!analysisData.value?.summaries) return;

      const summaries = analysisData.value.summaries;

      switch (type) {
        case 'security':
          if (detail.summary) {
            summaries.security.total_vulnerabilities =
              detail.summary.total_vulnerabilities || 0;
            summaries.security.high_severity =
              detail.summary.high_severity || 0;
            summaries.security.medium_severity =
              detail.summary.medium_severity || 0;
            summaries.security.low_severity = detail.summary.low_severity || 0;
          }
          break;
        case 'code-smells':
          if (detail.summary) {
            summaries.code_smells.total_smells =
              detail.summary.total_smells || 0;
            summaries.code_smells.smell_density =
              detail.summary.smell_density || 0;
            summaries.code_smells.god_functions =
              detail.summary.god_functions || 0;
          }
          break;
        case 'dead-code':
          if (detail.summary) {
            summaries.dead_code.dead_function_count =
              detail.summary.dead_function_count || 0;
            summaries.dead_code.dead_code_percentage =
              detail.summary.dead_code_percentage || 0;
            summaries.dead_code.dead_lines_of_code =
              detail.summary.dead_lines_of_code || 0;
          }
          break;
        case 'types':
          if (detail.summary) {
            summaries.types.type_coverage_percentage =
              detail.summary.type_coverage_percentage || 0;
            summaries.types.total_dynamic_functions =
              detail.summary.total_functions || 0;
            summaries.types.with_type_hints =
              detail.summary.with_type_hints || 0;
          }
          break;
        case 'documentation':
          if (detail.summary) {
            summaries.documentation.coverage_percentage =
              detail.summary.coverage_percentage || 0;
            summaries.documentation.fully_documented =
              detail.summary.fully_documented || 0;
            summaries.documentation.undocumented =
              detail.summary.undocumented || 0;
          }
          break;
        case 'scope':
          if (detail.summary) {
            summaries.scope.total_issues = detail.summary.total_issues || 0;
            summaries.scope.global_variable_issues =
              detail.summary.global_variable_issues || 0;
            summaries.scope.shadowing_issues =
              detail.summary.shadowing_issues || 0;
          }
          break;
        case 'duplication':
          if (detail.summary) {
            summaries.duplication.duplicate_group_count =
              detail.summary.duplicate_group_count || 0;
            summaries.duplication.duplication_percentage =
              detail.summary.duplication_percentage || 0;
          }
          break;
        case 'dependencies':
          if (detail.summary) {
            summaries.dependencies.circular_dependency_count =
              detail.summary.circular_dependency_count || 0;
            summaries.dependencies.total_dependencies =
              detail.summary.total_dependencies || 0;
          }
          break;
      }
    };

    // Track the current analysis request to handle race conditions
    let currentAnalysisRequestId = 0;

    const loadAnalysisDetail = async (type, skipUrlUpdate = false) => {
      if (!selectedProject.value) return;

      // Increment request ID to track this specific request
      const requestId = ++currentAnalysisRequestId;

      loadingAnalysisDetail.value = true;
      analysisDetail.value = null;

      try {
        const response = await fetch(
          `/api/v1/projects/${selectedProject.value.name}/analysis/${type}`
        );

        // Check if this request is still the current one (user might have clicked another tab)
        if (requestId !== currentAnalysisRequestId) {
          return; // Stale request, ignore the response
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        analysisDetail.value = await response.json();

        // Sync summary counts with actual detail data to fix mismatches
        if (analysisData.value && analysisDetail.value) {
          sync_analysis_counts(type, analysisDetail.value);
        }
      } catch (error) {
        console.error(`Failed to load ${type} analysis:`, error);
        // Only update state if this is still the current request
        if (requestId === currentAnalysisRequestId) {
          analysisDetail.value = null;
        }
      } finally {
        // Only update loading state if this is still the current request
        if (requestId === currentAnalysisRequestId) {
          loadingAnalysisDetail.value = false;
        }
      }

      if (!skipUrlUpdate && requestId === currentAnalysisRequestId) {
        updateUrl();
      }
    };

    const setAnalysisTab = async (tab) => {
      analysisTab.value = tab;
      if (tab !== 'overview') {
        await loadAnalysisDetail(tab);
      } else {
        analysisDetail.value = null;
        updateUrl();
      }
    };

    const navigateToFunctionById = async (fn) => {
      if (!fn || !fn.symbol) return;

      showAnalysisView.value = false;
      analysisData.value = null;

      const projectParam = selectedProject.value
        ? `?project=${selectedProject.value.name}`
        : '';

      try {
        const response = await fetch(
          `/api/v1/functions/${encodeURIComponent(fn.symbol)}${projectParam}`
        );
        const results = await response.json();
        if (results.length > 0) {
          const match = fn.filename
            ? results.find((r) => r.filename === fn.filename) || results[0]
            : results[0];
          selectedFunction.value = match;
          selectedFile.value = match.filename;
        }
      } catch (error) {
        console.error('Failed to navigate to function:', error);
      }

      activeTab.value = 'source';
      callers.value = [];
      callees.value = [];
      updateUrl();
    };

    const formatDate = (dateStr) => {
      if (!dateStr) return '-';
      const date = new Date(dateStr);
      return date.toLocaleString();
    };

    const formatNumber = (num) => {
      if (num === null || num === undefined) return '-';
      return Number(num).toLocaleString();
    };

    const formatDuration = (startStr, endStr) => {
      if (!startStr || !endStr) return '-';
      const start = new Date(startStr);
      const end = new Date(endStr);
      const ms = end - start;
      if (ms < 1000) return `${ms}ms`;
      if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
      const mins = Math.floor(ms / 60000);
      const secs = ((ms % 60000) / 1000).toFixed(0);
      return `${mins}m ${secs}s`;
    };

    const importProject = async () => {
      // Check for read-only mode before attempting import
      if (serverReadOnly.value) {
        showReadOnlyModal.value = true;
        return;
      }

      if (!importPath.value) return;

      importing.value = true;
      importError.value = '';
      importSuccess.value = '';

      try {
        const response = await fetch('/api/v1/projects/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: importPath.value,
            name: importName.value || undefined
          })
        });

        const result = await response.json();

        if (!response.ok) {
          importError.value = result.error || 'Failed to import project';
          return;
        }

        importSuccess.value = result.message || 'Project queued for import!';

        // Start polling for job updates
        await loadJobQueue();
        startJobPolling();

        // Close modal after a short delay
        setTimeout(() => {
          closeImportModal();
        }, 1500);

        // Subscribe to job updates (WebSocket with polling fallback)
        if (result.job_id) {
          subscribeToJob(
            result.job_id,
            async () => {
              await loadProjects();
              await loadJobQueue();
            },
            async () => {
              await loadJobQueue();
            }
          );
        }
      } catch (error) {
        importError.value = error.message || 'Failed to import project';
      } finally {
        importing.value = false;
      }
    };

    // Poll for job completion
    const pollJobStatus = async (jobId, onComplete, onError) => {
      const poll = async () => {
        try {
          const response = await fetch(`/api/v1/jobs/${jobId}`);
          const job = await response.json();

          if (job.status === 'completed') {
            onComplete(job);
          } else if (job.status === 'failed') {
            onError(job.error || 'Job failed');
          } else {
            // Still running, poll again in 500ms
            setTimeout(poll, 500);
          }
        } catch (error) {
          onError(error.message);
        }
      };
      poll();
    };

    const refreshProject = async (projectName) => {
      // Check for read-only mode before attempting refresh
      if (serverReadOnly.value) {
        showReadOnlyModal.value = true;
        return;
      }

      refreshingProject.value = projectName;

      try {
        const response = await fetch(
          `/api/v1/projects/${projectName}/refresh`,
          {
            method: 'POST'
          }
        );

        const result = await response.json();

        if (!response.ok) {
          alert(result.error || 'Failed to refresh project');
          refreshingProject.value = null;
          return;
        }

        // Load job queue
        await loadJobQueue();

        // Subscribe to job updates (WebSocket with polling fallback)
        subscribeToJob(
          result.job_id,
          async () => {
            // Job completed successfully
            refreshingProject.value = null;

            // Refresh projects list and job queue
            await loadProjects();
            await loadJobQueue();

            // If this project is selected, reload its info
            if (selectedProject.value?.name === projectName) {
              const response = await fetch(`/api/v1/projects/${projectName}`);
              projectInfo.value = await response.json();
            }
          },
          async (error) => {
            // Job failed
            refreshingProject.value = null;
            await loadJobQueue();
            alert(error || 'Failed to refresh project');
          }
        );
      } catch (error) {
        alert(error.message || 'Failed to refresh project');
        refreshingProject.value = null;
      }
    };

    onMounted(async () => {
      await loadServerStatus();
      await loadProjects();
      await loadJobQueue();
      await parseUrl();

      // Initialize WebSocket for real-time job updates
      await initWebSocket();

      // Fall back to polling if WebSocket not connected and there are active jobs
      if (
        !wsConnected.value &&
        (jobQueueStats.value.running > 0 || jobQueueStats.value.queued > 0)
      ) {
        startJobPolling();
      }

      // Escape key to close fullscreen
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          if (inlineGraphFullscreen.value) {
            inlineGraphFullscreen.value = false;
            nextTick(() => {
              if (inlineCallGraphData.value) renderInlineCallGraph();
            });
          }
          if (flowchartFullscreen.value) {
            flowchartFullscreen.value = false;
            nextTick(() => {
              if (flowchartData.value) renderFlowchart();
            });
          }
        }
      });
    });

    return {
      projects,
      loadingProjects,
      selectedProject,
      projectInfo,
      searchQuery,
      searchResults,
      hasSearched,
      selectedFile,
      fileFunctions,
      loadingFileFunctions,
      fileAnalytics,
      loadingFileAnalytics,
      showingAllFunctions,
      allFunctions,
      loadingAllFunctions,
      selectedFunction,
      activeTab,
      setActiveTab,
      classMembers,
      loadingClassMembers,
      callers,
      callees,
      loadingCallers,
      loadingCallees,
      showCallGraph,
      callGraphRoot,
      callGraphData,
      loadingCallGraph,
      selectedGraphNode,
      graphContainer,
      graphSvg,
      callGraphDepth,
      setCallGraphDepth,
      graphViewType,
      treeData,
      treeDepth,
      flowchartData,
      loadingFlowchart,
      flowchartError,
      flowchartContainer,
      flowchartSvg,
      selectedFlowchartNode,
      inlineCallGraphData,
      loadingInlineCallGraph,
      inlineCallGraphError,
      inlineGraphContainer,
      inlineGraphSvg,
      selectedInlineGraphNode,
      inlineCallGraphDepth,
      setInlineCallGraphDepth,
      searchSuggestions,
      showAutocomplete,
      autocompleteIndex,
      selectProject,
      selectFile,
      clearFile,
      showAllFunctions,
      clearAllFunctions,
      searchFunctions,
      selectFunction,
      clearFunction,
      backToFile,
      navigateToFunction,
      loadCallers,
      loadCallees,
      entityReferences,
      referenceDefinitions,
      loadingReferences,
      loadReferences,
      groupedReferences,
      formatReferenceType,
      navigateToDefinition,
      openCallGraph,
      loadCallGraphForNode,
      closeCallGraph,
      switchGraphView,
      loadTreeView,
      reloadTreeView,
      recenterTreeOnNode,
      loadFlowchart,
      flowchartZoomIn,
      flowchartZoomOut,
      flowchartResetZoom,
      loadInlineCallGraph,
      recenterInlineGraph,
      inlineGraphZoomIn,
      inlineGraphZoomOut,
      inlineGraphResetZoom,
      inlineGraphFullscreen,
      toggleInlineGraphFullscreen,
      flowchartFullscreen,
      toggleFlowchartFullscreen,
      onSearchInput,
      navigateAutocomplete,
      selectAutocompleteItem,
      selectSuggestion,
      closeAutocomplete,
      onSearchBlur,
      zoomIn,
      zoomOut,
      resetZoom,
      viewFunctionDetails,
      getDistributionPercent,
      resetToHome,
      showImportModal,
      importPath,
      importName,
      importing,
      importError,
      importSuccess,
      refreshingProject,
      closeImportModal,
      importProject,
      refreshProject,
      jobs,
      jobQueueStats,
      jobQueueMinimized,
      showJobsView,
      toggleJobsView,
      formatDate,
      formatDuration,
      formatNumber,
      loadingProjectInfo,
      showAnalysisView,
      analysisData,
      loadingAnalysis,
      analysisTab,
      analysisDetail,
      loadingAnalysisDetail,
      toggleAnalysisView,
      closeAnalysisView,
      loadAnalysisDashboard,
      loadAnalysisDetail,
      setAnalysisTab,
      navigateToFunctionById,
      // File list pagination
      displayedFiles,
      hasMoreFiles,
      remainingFilesCount,
      showMoreFiles,
      showAllFiles,
      // Function list pagination
      displayedFunctions,
      hasMoreFunctions,
      remainingFunctionsCount,
      showMoreFunctions,
      showAllFunctionsItems,
      // Directory navigation
      currentDirectory,
      directoryContents,
      directoryBreadcrumbs,
      navigateToDirectory,
      navigateUp,
      navigateToRoot,
      navigateToBreadcrumb,
      navigateToFileDirectory,
      getFilePathParts,
      getFileName,
      // Read-only mode
      serverReadOnly,
      showReadOnlyModal,
      closeReadOnlyModal
    };
  }
}).mount('#app');
