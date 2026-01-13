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

    const selectFunction = async (fn, skipUrlUpdate = false) => {
      showCallGraph.value = false;
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
      selectedGraphNode.value = null;
      if (simulation) {
        simulation.stop();
      }
      updateUrl();
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
        // Refresh job data
        await loadJobQueue();
        startJobPolling();
      }
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
      formatDuration
    };
  }
}).mount('#app');
