const { createApp, ref, onMounted, watch, nextTick } = Vue;

createApp({
  setup() {
    const projects = ref([]);
    const loadingProjects = ref(true);
    const selectedProject = ref(null);
    const projectInfo = ref(null);

    const searchQuery = ref('');
    const searchResults = ref([]);
    const hasSearched = ref(false);

    const selectedFile = ref(null);
    const fileFunctions = ref([]);
    const loadingFileFunctions = ref(false);

    const showingAllFunctions = ref(false);
    const allFunctions = ref([]);
    const loadingAllFunctions = ref(false);

    const selectedFunction = ref(null);
    const activeTab = ref('source');

    const callers = ref([]);
    const callees = ref([]);
    const loadingCallers = ref(false);
    const loadingCallees = ref(false);

    // Call graph state
    const showCallGraph = ref(false);
    const callGraphRoot = ref('');
    const callGraphData = ref(null);
    const loadingCallGraph = ref(false);
    const selectedGraphNode = ref(null);
    const graphContainer = ref(null);
    const graphSvg = ref(null);

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
    const jobQueueStats = ref({ queued: 0, running: 0, completed: 0, failed: 0, total: 0 });
    const jobQueueMinimized = ref(false);
    const showJobsView = ref(false);
    let jobPollInterval = null;

    // Analysis state
    const showAnalysisView = ref(false);
    const analysisData = ref(null);
    const loadingAnalysis = ref(false);
    const analysisTab = ref('overview');
    const analysisDetail = ref(null);
    const loadingAnalysisDetail = ref(false);

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
      if (selectedFile.value) {
        params.set('file', selectedFile.value);
      }
      if (selectedFunction.value) {
        params.set('function', selectedFunction.value.symbol);
        if (selectedFunction.value.filename) {
          params.set('funcFile', selectedFunction.value.filename);
        }
      }
      if (showCallGraph.value && callGraphRoot.value) {
        params.set('callgraph', callGraphRoot.value);
      }
      if (showingAllFunctions.value) {
        params.set('view', 'all-functions');
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
      const fileName = params.get('file');
      const functionName = params.get('function');
      const funcFile = params.get('funcFile');
      const callgraphRoot = params.get('callgraph');
      const view = params.get('view');

      if (projectName) {
        // Wait for projects to load
        while (loadingProjects.value) {
          await new Promise((r) => setTimeout(r, 50));
        }
        const project = projects.value.find(
          (p) => p.name === projectName
        );
        if (project) {
          await selectProject(project, true); // true = skip URL update

          if (callgraphRoot) {
            await openCallGraph(callgraphRoot, true);
          } else if (functionName) {
            // Load function details
            try {
              const response = await fetch(
                `/api/v1/functions/${encodeURIComponent(functionName)}?project=${projectName}`
              );
              const results = await response.json();
              if (results.length > 0) {
                const match = funcFile
                  ? results.find((r) => r.filename === funcFile) ||
                    results[0]
                  : results[0];
                selectedFunction.value = match;
                selectedFile.value = match.filename;
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

      try {
        const response = await fetch(`/api/v1/projects/${project.name}`);
        projectInfo.value = await response.json();
      } catch (error) {
        console.error('Failed to load project info:', error);
      }
      if (!skipUrlUpdate) updateUrl();
    };

    const selectFile = async (filename, skipUrlUpdate = false) => {
      selectedFile.value = filename;
      selectedFunction.value = null;
      showingAllFunctions.value = false;
      showCallGraph.value = false;
      loadingFileFunctions.value = true;

      try {
        const response = await fetch(
          `/api/v1/functions?project=${selectedProject.value.name}&filename=${encodeURIComponent(filename)}`
        );
        fileFunctions.value = await response.json();
      } catch (error) {
        console.error('Failed to load file functions:', error);
        fileFunctions.value = [];
      } finally {
        loadingFileFunctions.value = false;
      }
      if (!skipUrlUpdate) updateUrl();
    };

    const clearFile = () => {
      selectedFile.value = null;
      fileFunctions.value = [];
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
        const response = await fetch(
          `/api/v1/functions/search?name=${encodeURIComponent(searchQuery.value)}${projectParam}&limit=50`
        );
        searchResults.value = await response.json();
      } catch (error) {
        console.error('Failed to search functions:', error);
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
          const response = await fetch(
            `/api/v1/functions/search?name=${encodeURIComponent(searchQuery.value)}${projectParam}&limit=10`
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
      if (!showAutocomplete.value || searchSuggestions.value.length === 0) return;

      autocompleteIndex.value += direction;

      if (autocompleteIndex.value < 0) {
        autocompleteIndex.value = searchSuggestions.value.length - 1;
      } else if (autocompleteIndex.value >= searchSuggestions.value.length) {
        autocompleteIndex.value = 0;
      }
    };

    const selectAutocompleteItem = () => {
      if (autocompleteIndex.value >= 0 && autocompleteIndex.value < searchSuggestions.value.length) {
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
        const matchingProject = projects.value.find(p => p.project_id === fn.project_id);
        if (matchingProject) {
          selectedProject.value = matchingProject;
          try {
            const projResponse = await fetch(`/api/v1/projects/${matchingProject.name}`);
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
      flowchartData.value = null;
      flowchartError.value = '';
      inlineCallGraphData.value = null;
      inlineCallGraphError.value = '';
      selectedInlineGraphNode.value = null;
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
        const response = await fetch(
          `/api/v1/functions/${encodeURIComponent(functionName)}/callgraph?project=${selectedProject.value.name}&depth=3`
        );
        callGraphData.value = await response.json();
      } catch (error) {
        console.error('Failed to load call graph:', error);
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
      selectedGraphNode.value = null;

      const endpoint = viewType === 'callers' ? 'caller-tree' : 'callee-tree';

      try {
        const response = await fetch(
          `/api/v1/functions/${encodeURIComponent(functionName)}/${endpoint}?project=${selectedProject.value.name}&depth=${treeDepth.value}`
        );
        treeData.value = await response.json();
      } catch (error) {
        console.error('Failed to load tree:', error);
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

      nodes.forEach(n => {
        adjList.set(n.id, []);
        inDegree.set(n.id, 0);
      });

      edges.forEach(e => {
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

      nodes.forEach(n => {
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
            levels.set(neighbor, Math.max(levels.get(neighbor), currentLevel + 1));
          }
          inDegree.set(neighbor, inDegree.get(neighbor) - 1);
          if (inDegree.get(neighbor) === 0) {
            queue.push(neighbor);
          }
        }
      }

      // Handle nodes not reached (cycles)
      nodes.forEach(n => {
        if (!levels.has(n.id)) {
          levels.set(n.id, 0);
        }
      });

      // Group nodes by level
      const levelGroups = new Map();
      nodes.forEach(n => {
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
        const totalWidth = levelNodes.length * nodeWidth + (levelNodes.length - 1) * nodeGap;
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

      edges.forEach(edge => {
        const fromPos = nodePositions.get(edge.from);
        const toPos = nodePositions.get(edge.to);

        if (!fromPos || !toPos) return;

        // Calculate path based on relative positions
        const fromNode = nodes.find(n => n.id === edge.from);
        const toNode = nodes.find(n => n.id === edge.to);

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
          path.attr('d', `
            M ${fromPos.x + nodeWidth / 2} ${fromPos.y}
            Q ${midX} ${fromPos.y}, ${midX} ${(fromPos.y + toPos.y) / 2}
            Q ${midX} ${toPos.y}, ${toPos.x + nodeWidth / 2} ${toPos.y}
          `);
        } else {
          // Forward edge - straight or slight curve
          const dx = toPos.x - fromPos.x;
          if (Math.abs(dx) < 10) {
            // Straight vertical line
            path.attr('d', `M ${fromPos.x} ${startY} L ${toPos.x} ${endY}`);
          } else {
            // Curved path
            const midY = (startY + endY) / 2;
            path.attr('d', `
              M ${fromPos.x} ${startY}
              Q ${fromPos.x} ${midY}, ${(fromPos.x + toPos.x) / 2} ${midY}
              Q ${toPos.x} ${midY}, ${toPos.x} ${endY}
            `);
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

      nodes.forEach(node => {
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
              .attr('points', `
                0,${-diamondSize}
                ${diamondSize},0
                0,${diamondSize}
                ${-diamondSize},0
              `)
              .attr('class', 'flowchart-shape-diamond');
            break;

          case 'loop':
            // Hexagon for loops
            const hw = nodeWidth / 2;
            const hh = nodeHeight / 2;
            const indent = 15;
            g.append('polygon')
              .attr('points', `
                ${-hw + indent},${-hh}
                ${hw - indent},${-hh}
                ${hw},0
                ${hw - indent},${hh}
                ${-hw + indent},${hh}
                ${-hw},0
              `)
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
        const displayLabel = label.length > maxLabelLength
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
            width / 2 - bounds.x * scale - bounds.width * scale / 2,
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
        flowchartSvgElement.transition().call(flowchartZoom.transform, d3.zoomIdentity);
      }
    };

    // Load inline call graph for function detail tab
    const loadInlineCallGraph = async () => {
      if (!selectedFunction.value) return;

      // If data already loaded, just re-render the graph
      if (inlineCallGraphData.value) {
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
        const response = await fetch(
          `/api/v1/functions/${encodeURIComponent(selectedFunction.value.symbol)}/callgraph?project=${selectedProject.value.name}&depth=3`
        );

        if (!response.ok) {
          const error = await response.json();
          inlineCallGraphError.value = error.error || 'Failed to load call graph';
          return;
        }

        inlineCallGraphData.value = await response.json();
      } catch (error) {
        console.error('Failed to load inline call graph:', error);
        inlineCallGraphError.value = 'Failed to load call graph';
      } finally {
        loadingInlineCallGraph.value = false;
        await nextTick();
        setTimeout(() => {
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
        const response = await fetch(
          `/api/v1/functions/${encodeURIComponent(symbol)}/callgraph?project=${selectedProject.value.name}&depth=3`
        );

        if (!response.ok) {
          const error = await response.json();
          inlineCallGraphError.value = error.error || 'Failed to load call graph';
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
      if (!inlineCallGraphData.value || !inlineGraphSvg.value) {
        console.log('Missing inline call graph data or SVG ref');
        return;
      }

      const container = inlineGraphContainer.value;
      const width = container.clientWidth || 800;
      const height = container.clientHeight || 600;

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

      const nodes = inlineCallGraphData.value.nodes;
      const edges = inlineCallGraphData.value.edges;
      const rootId = inlineCallGraphData.value.root;

      // Create links
      const links = edges
        .map((e) => ({
          source: nodes.find((n) => n.id === e.from),
          target: nodes.find((n) => n.id === e.to),
          line: e.line
        }))
        .filter((l) => l.source && l.target);

      // Create simulation
      inlineSimulation = d3
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
      const link = inlineGraphG
        .append('g')
        .selectAll('line')
        .data(links)
        .join('line')
        .attr('class', 'graph-link')
        .attr('marker-end', 'url(#inline-arrowhead)');

      // Draw nodes
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
          inlineGraphG.selectAll('.graph-node').classed('selected', (n) => n.id === d.id);

          // Highlight connected links
          link.classed('highlighted', (l) => l.source.id === d.id || l.target.id === d.id);
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
        inlineGraphSvgElement.transition().call(inlineGraphZoom.transform, d3.zoomIdentity);
      }
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

      g = svg.append('g')
        .attr('transform', `translate(${width / 2}, 40)`);

      // Convert tree data to D3 hierarchy
      const childrenKey = graphViewType.value === 'callers' ? 'callers' : 'callees';

      const root = d3.hierarchy(treeData.value, d => d[childrenKey]);

      // Create tree layout - horizontal for better readability
      const treeLayout = d3.tree()
        .nodeSize([60, 180]);

      treeLayout(root);

      // Draw links
      g.selectAll('.tree-link')
        .data(root.links())
        .join('path')
        .attr('class', 'tree-link')
        .attr('d', d3.linkHorizontal()
          .x(d => d.y)
          .y(d => d.x)
        );

      // Draw nodes
      const node = g.selectAll('.tree-node')
        .data(root.descendants())
        .join('g')
        .attr('class', d => {
          let classes = 'tree-node';
          if (d.depth === 0) classes += ' root';
          if (d.data.truncated) classes += ' truncated';
          if (d.data.loop) classes += ' loop';
          if (d.data.notFound) classes += ' not-found';
          return classes;
        })
        .attr('transform', d => `translate(${d.y},${d.x})`)
        .on('click', (event, d) => {
          event.stopPropagation();
          selectedGraphNode.value = d.data;

          // Update selected state
          g.selectAll('.tree-node').classed('selected', n => n === d);
        });

      // Node circles
      node.append('circle')
        .attr('r', d => d.depth === 0 ? 12 : 10)
        .attr('fill', d => {
          if (d.depth === 0) return '#fce4ec';
          if (d.data.loop) return '#fce4ec';
          if (d.data.truncated) return '#fff3e0';
          return '#e8f5e9';
        })
        .attr('stroke', d => {
          if (d.depth === 0) return '#e91e63';
          if (d.data.loop) return '#9c27b0';
          if (d.data.truncated) return '#ff9800';
          return '#4caf50';
        })
        .attr('stroke-width', 2);

      // Node labels
      node.append('text')
        .attr('dy', '0.35em')
        .attr('x', d => d.children ? -15 : 15)
        .attr('text-anchor', d => d.children ? 'end' : 'start')
        .text(d => {
          const symbol = d.data.symbol;
          if (symbol.length > 25) return symbol.substring(0, 22) + '...';
          return symbol;
        })
        .clone(true).lower()
        .attr('stroke', 'white')
        .attr('stroke-width', 3);

      // Add status indicators for special nodes
      node.filter(d => d.data.truncated)
        .append('text')
        .attr('class', 'node-status')
        .attr('dy', '0.35em')
        .attr('x', d => d.children ? 15 : -15)
        .attr('text-anchor', d => d.children ? 'start' : 'end')
        .text('⋯')
        .attr('fill', '#ff9800');

      node.filter(d => d.data.loop)
        .append('text')
        .attr('class', 'node-status')
        .attr('dy', '0.35em')
        .attr('x', d => d.children ? 15 : -15)
        .attr('text-anchor', d => d.children ? 'start' : 'end')
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
          .translate(width / 2 - bounds.x * scale - bounds.width * scale / 2, height / 2 - bounds.y * scale - bounds.height * scale / 2)
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

      const nodes = callGraphData.value.nodes;
      const edges = callGraphData.value.edges;
      const rootId = callGraphData.value.root;

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
        .attr(
          'class',
          (d) => `graph-node ${d.id === rootId ? 'root' : ''}`
        )
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
          g.selectAll('.graph-node').classed(
            'selected',
            (n) => n.id === d.id
          );

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
          d.symbol.length > 20
            ? d.symbol.substring(0, 17) + '...'
            : d.symbol
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
        if (jobQueueStats.value.running === 0 && jobQueueStats.value.queued === 0) {
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
    };

    // Analysis view functions
    const toggleAnalysisView = async () => {
      console.log('toggleAnalysisView called, selectedProject:', selectedProject.value);
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
    };

    const closeAnalysisView = () => {
      showAnalysisView.value = false;
      analysisData.value = null;
      analysisDetail.value = null;
      analysisTab.value = 'overview';
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

    const loadAnalysisDetail = async (type) => {
      if (!selectedProject.value) return;

      loadingAnalysisDetail.value = true;
      analysisDetail.value = null;

      try {
        const response = await fetch(
          `/api/v1/projects/${selectedProject.value.name}/analysis/${type}`
        );
        analysisDetail.value = await response.json();
      } catch (error) {
        console.error(`Failed to load ${type} analysis:`, error);
      } finally {
        loadingAnalysisDetail.value = false;
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

        importSuccess.value =
          result.message || 'Project queued for import!';

        // Start polling for job updates
        await loadJobQueue();
        startJobPolling();

        // Close modal after a short delay
        setTimeout(() => {
          closeImportModal();
        }, 1500);

        // Poll for job completion to refresh projects list
        if (result.job_id) {
          pollJobStatus(
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

        // Start polling for job updates
        await loadJobQueue();
        startJobPolling();

        // Poll for job completion
        pollJobStatus(
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
      await loadProjects();
      await loadJobQueue();
      await parseUrl();

      // Start polling if there are active jobs
      if (jobQueueStats.value.running > 0 || jobQueueStats.value.queued > 0) {
        startJobPolling();
      }
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
      showingAllFunctions,
      allFunctions,
      loadingAllFunctions,
      selectedFunction,
      activeTab,
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
      navigateToFunctionById
    };
  }
}).mount('#app');
