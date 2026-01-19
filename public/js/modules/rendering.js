/**
 * Rendering module for D3.js graph visualizations.
 * Contains functions for rendering flowcharts, call graphs, and tree views.
 */

/**
 * Creates a renderer for flowcharts.
 * @param {Object} state - Application state
 * @param {Object} d3 - D3 library
 * @returns {Object} Flowchart renderer functions
 */
export const create_flowchart_renderer = (state, d3) => {
  let flowchart_zoom = null;
  let flowchart_g = null;
  let flowchart_svg_element = null;

  /**
   * Render control flow flowchart with proper shapes.
   */
  const render_flowchart = () => {
    if (!state.flowchart_data.value || !state.flowchart_svg.value) {
      console.log('Missing flowchart data or SVG ref');
      return;
    }

    const container = state.flowchart_container.value;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    // Clear previous flowchart
    d3.select(state.flowchart_svg.value).selectAll('*').remove();

    flowchart_svg_element = d3.select(state.flowchart_svg.value);

    // Add zoom behavior
    flowchart_zoom = d3
      .zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        flowchart_g.attr('transform', event.transform);
      });

    flowchart_svg_element.call(flowchart_zoom);

    // Click on background to deselect node
    flowchart_svg_element.on('click', () => {
      state.selected_flowchart_node.value = null;
    });

    flowchart_g = flowchart_svg_element.append('g');

    // Define arrow marker
    flowchart_svg_element
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

    const nodes = state.flowchart_data.value.nodes;
    const edges = state.flowchart_data.value.edges;

    if (!nodes || nodes.length === 0) {
      state.flowchart_error.value = 'No control flow data available';
      return;
    }

    // Layout nodes using dagre-like algorithm (simple vertical layout)
    const node_width = 140;
    const node_height = 50;
    const level_gap = 80;
    const node_gap = 30;

    // Build adjacency list and compute levels
    const adj_list = new Map();
    const in_degree = new Map();

    nodes.forEach((n) => {
      adj_list.set(n.id, []);
      in_degree.set(n.id, 0);
    });

    edges.forEach((e) => {
      if (adj_list.has(e.from)) {
        adj_list.get(e.from).push(e.to);
      }
      if (in_degree.has(e.to)) {
        in_degree.set(e.to, in_degree.get(e.to) + 1);
      }
    });

    // Topological sort to assign levels
    const levels = new Map();
    const queue = [];

    nodes.forEach((n) => {
      if (in_degree.get(n.id) === 0) {
        queue.push(n.id);
        levels.set(n.id, 0);
      }
    });

    while (queue.length > 0) {
      const current = queue.shift();
      const current_level = levels.get(current);

      for (const neighbor of adj_list.get(current) || []) {
        if (!levels.has(neighbor)) {
          levels.set(neighbor, current_level + 1);
        } else {
          levels.set(
            neighbor,
            Math.max(levels.get(neighbor), current_level + 1)
          );
        }
        in_degree.set(neighbor, in_degree.get(neighbor) - 1);
        if (in_degree.get(neighbor) === 0) {
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
    const level_groups = new Map();
    nodes.forEach((n) => {
      const level = levels.get(n.id);
      if (!level_groups.has(level)) {
        level_groups.set(level, []);
      }
      level_groups.get(level).push(n);
    });

    // Position nodes
    const node_positions = new Map();

    level_groups.forEach((level_nodes, level) => {
      const total_width =
        level_nodes.length * node_width + (level_nodes.length - 1) * node_gap;
      const start_x = (width - total_width) / 2;

      level_nodes.forEach((node, i) => {
        node_positions.set(node.id, {
          x: start_x + i * (node_width + node_gap) + node_width / 2,
          y: 60 + level * (node_height + level_gap)
        });
      });
    });

    // Draw edges
    const link_group = flowchart_g.append('g').attr('class', 'flowchart-links');

    edges.forEach((edge) => {
      const from_pos = node_positions.get(edge.from);
      const to_pos = node_positions.get(edge.to);

      if (!from_pos || !to_pos) return;

      const from_node = nodes.find((n) => n.id === edge.from);

      let start_y = from_pos.y + node_height / 2;
      let end_y = to_pos.y - node_height / 2;

      // Adjust for diamond shapes (decision nodes)
      if (from_node && from_node.type === 'decision') {
        start_y = from_pos.y + node_height / 2 + 5;
      }

      // Create path
      const path = link_group
        .append('path')
        .attr('class', 'flowchart-edge')
        .attr('marker-end', 'url(#flowchart-arrow)')
        .attr('fill', 'none')
        .attr('stroke', '#666')
        .attr('stroke-width', 1.5);

      // Different path for back edges (loops)
      if (to_pos.y <= from_pos.y) {
        const mid_x = Math.max(from_pos.x, to_pos.x) + node_width;
        path.attr(
          'd',
          `
          M ${from_pos.x + node_width / 2} ${from_pos.y}
          Q ${mid_x} ${from_pos.y}, ${mid_x} ${(from_pos.y + to_pos.y) / 2}
          Q ${mid_x} ${to_pos.y}, ${to_pos.x + node_width / 2} ${to_pos.y}
        `
        );
      } else {
        const dx = to_pos.x - from_pos.x;
        if (Math.abs(dx) < 10) {
          path.attr('d', `M ${from_pos.x} ${start_y} L ${to_pos.x} ${end_y}`);
        } else {
          const mid_y = (start_y + end_y) / 2;
          path.attr(
            'd',
            `
            M ${from_pos.x} ${start_y}
            Q ${from_pos.x} ${mid_y}, ${(from_pos.x + to_pos.x) / 2} ${mid_y}
            Q ${to_pos.x} ${mid_y}, ${to_pos.x} ${end_y}
          `
          );
        }
      }

      // Add edge label
      if (edge.label) {
        const label_x = (from_pos.x + to_pos.x) / 2;
        const label_y = (from_pos.y + to_pos.y) / 2;

        link_group
          .append('text')
          .attr('class', 'flowchart-edge-label')
          .attr('x', label_x + 10)
          .attr('y', label_y)
          .attr('text-anchor', 'start')
          .attr('fill', '#666')
          .attr('font-size', '11px')
          .text(edge.label);
      }
    });

    // Draw nodes
    const node_group = flowchart_g.append('g').attr('class', 'flowchart-nodes');

    nodes.forEach((node) => {
      const pos = node_positions.get(node.id);
      if (!pos) return;

      const g = node_group
        .append('g')
        .attr('class', `flowchart-node flowchart-node-${node.type}`)
        .attr('transform', `translate(${pos.x}, ${pos.y})`)
        .style('cursor', node.source_snippet ? 'pointer' : 'default')
        .on('click', (event) => {
          event.stopPropagation();
          if (node.source_snippet || node.full_label) {
            state.selected_flowchart_node.value = node;
          }
        });

      // Draw shape based on type
      switch (node.type) {
        case 'start':
        case 'end':
          g.append('rect')
            .attr('x', -node_width / 2)
            .attr('y', -node_height / 2)
            .attr('width', node_width)
            .attr('height', node_height)
            .attr('rx', node_height / 2)
            .attr('ry', node_height / 2)
            .attr('class', 'flowchart-shape-oval');
          break;

        case 'decision':
          const diamond_size = node_height * 0.8;
          g.append('polygon')
            .attr(
              'points',
              `
              0,${-diamond_size}
              ${diamond_size},0
              0,${diamond_size}
              ${-diamond_size},0
            `
            )
            .attr('class', 'flowchart-shape-diamond');
          break;

        case 'loop':
          const hw = node_width / 2;
          const hh = node_height / 2;
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
          g.append('rect')
            .attr('x', -node_width / 2)
            .attr('y', -node_height / 2)
            .attr('width', node_width)
            .attr('height', node_height)
            .attr('rx', 8)
            .attr('ry', 8)
            .attr('class', 'flowchart-shape-return');
          break;

        case 'process':
        default:
          g.append('rect')
            .attr('x', -node_width / 2)
            .attr('y', -node_height / 2)
            .attr('width', node_width)
            .attr('height', node_height)
            .attr('class', 'flowchart-shape-rect');
          break;
      }

      // Add label
      const label = node.label || node.type;
      const max_label_length = 18;
      const display_label =
        label.length > max_label_length
          ? label.substring(0, max_label_length - 2) + '...'
          : label;

      g.append('text')
        .attr('class', 'flowchart-label')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('y', node.type === 'decision' ? 0 : 0)
        .text(display_label)
        .append('title')
        .text(node.full_label || label);

      // Add line number if available
      if (node.line) {
        g.append('text')
          .attr('class', 'flowchart-line-number')
          .attr('text-anchor', 'middle')
          .attr('y', node_height / 2 + 12)
          .attr('font-size', '10px')
          .attr('fill', '#999')
          .text(`Line ${node.line}`);
      }
    });

    // Auto-fit the flowchart to the viewport
    const bounds = flowchart_g.node().getBBox();
    const full_width = bounds.width + 100;
    const full_height = bounds.height + 100;
    const scale = Math.min(width / full_width, height / full_height, 1);

    flowchart_svg_element.call(
      flowchart_zoom.transform,
      d3.zoomIdentity
        .translate(
          width / 2 - bounds.x * scale - (bounds.width * scale) / 2,
          50
        )
        .scale(scale)
    );
  };

  /**
   * Zoom in on the flowchart.
   */
  const zoom_in = () => {
    if (flowchart_svg_element && flowchart_zoom) {
      flowchart_svg_element.transition().call(flowchart_zoom.scaleBy, 1.3);
    }
  };

  /**
   * Zoom out on the flowchart.
   */
  const zoom_out = () => {
    if (flowchart_svg_element && flowchart_zoom) {
      flowchart_svg_element.transition().call(flowchart_zoom.scaleBy, 0.7);
    }
  };

  /**
   * Reset flowchart zoom to default.
   */
  const reset_zoom = () => {
    if (flowchart_svg_element && flowchart_zoom) {
      flowchart_svg_element
        .transition()
        .call(flowchart_zoom.transform, d3.zoomIdentity);
    }
  };

  return {
    render_flowchart,
    zoom_in,
    zoom_out,
    reset_zoom
  };
};

/**
 * Creates a renderer for call graphs.
 * @param {Object} state - Application state
 * @param {Object} d3 - D3 library
 * @returns {Object} Call graph renderer functions
 */
export const create_call_graph_renderer = (state, d3) => {
  let simulation = null;
  let svg = null;
  let g = null;
  let zoom = null;

  // Depth color scale
  const depth_colors = [
    '#e91e63',
    '#2196f3',
    '#4caf50',
    '#ff9800',
    '#9c27b0',
    '#00bcd4',
    '#795548',
    '#607d8b'
  ];

  const depth_fills = [
    '#fce4ec',
    '#e3f2fd',
    '#e8f5e9',
    '#fff3e0',
    '#f3e5f5',
    '#e0f7fa',
    '#efebe9',
    '#eceff1'
  ];

  const get_depth_color = (depth) =>
    depth_colors[Math.min(depth, depth_colors.length - 1)];
  const get_depth_fill = (depth) =>
    depth_fills[Math.min(depth, depth_fills.length - 1)];

  /**
   * Render main call graph.
   */
  const render_graph = () => {
    if (!state.call_graph_data.value || !state.graph_svg.value) {
      console.log('Missing data or SVG ref, aborting render');
      return;
    }

    const container = state.graph_container.value;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    // Stop any running simulation before clearing
    if (simulation) {
      simulation.stop();
      simulation = null;
    }

    // Clear previous graph
    d3.select(state.graph_svg.value).selectAll('*').remove();

    svg = d3.select(state.graph_svg.value);

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

    // Get full data from cache
    const all_nodes = state.call_graph_data.value.nodes || [];
    const all_edges = state.call_graph_data.value.edges || [];
    const root_id = state.call_graph_data.value.root;

    // Filter edges by depth
    const max_depth = state.call_graph_depth.value;

    let filtered_edges;
    if (max_depth === 0) {
      filtered_edges = all_edges;
    } else {
      filtered_edges = all_edges.filter((e) => {
        const callee_ok = e.callee_depth != null && e.callee_depth <= max_depth;
        const caller_ok = e.caller_depth != null && e.caller_depth <= max_depth;
        return callee_ok || caller_ok;
      });
    }

    // Collect node IDs from filtered edges
    const allowed_node_ids = new Set();
    allowed_node_ids.add(root_id);
    filtered_edges.forEach((e) => {
      allowed_node_ids.add(e.from);
      allowed_node_ids.add(e.to);
    });

    // Filter nodes
    const nodes = all_nodes
      .filter((n) => allowed_node_ids.has(n.id))
      .map((n) => ({ ...n }));
    const edges = filtered_edges.filter(
      (e) => allowed_node_ids.has(e.from) && allowed_node_ids.has(e.to)
    );

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
      .attr('class', (d) => `graph-node ${d.id === root_id ? 'root' : ''}`)
      .call(
        d3
          .drag()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      )
      .on('click', (event, d) => {
        event.stopPropagation();
        state.selected_graph_node.value = d;
        g.selectAll('.graph-node').classed('selected', (n) => n.id === d.id);
        link.classed(
          'highlighted',
          (l) => l.source.id === d.id || l.target.id === d.id
        );
      });

    node
      .append('circle')
      .attr('r', (d) => (d.id === root_id ? 18 : 14))
      .attr('fill', (d) => (d.id === root_id ? '#fce4ec' : '#e3f2fd'))
      .attr('stroke', (d) => (d.id === root_id ? '#e91e63' : '#2196f3'));

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

    // Click on background to deselect
    svg.on('click', () => {
      state.selected_graph_node.value = null;
      g.selectAll('.graph-node').classed('selected', false);
      link.classed('highlighted', false);
    });
  };

  /**
   * Zoom in on the call graph.
   */
  const zoom_in = () => svg?.transition().call(zoom.scaleBy, 1.3);

  /**
   * Zoom out on the call graph.
   */
  const zoom_out = () => svg?.transition().call(zoom.scaleBy, 0.7);

  /**
   * Reset call graph zoom to default.
   */
  const reset_zoom = () =>
    svg?.transition().call(zoom.transform, d3.zoomIdentity);

  /**
   * Stop the force simulation.
   */
  const stop_simulation = () => {
    if (simulation) {
      simulation.stop();
      simulation = null;
    }
  };

  return {
    render_graph,
    zoom_in,
    zoom_out,
    reset_zoom,
    stop_simulation,
    get_depth_color,
    get_depth_fill
  };
};

/**
 * Creates a renderer for inline call graphs (function detail tab).
 * @param {Object} state - Application state
 * @param {Object} d3 - D3 library
 * @returns {Object} Inline call graph renderer functions
 */
export const create_inline_graph_renderer = (state, d3) => {
  let inline_simulation = null;
  let inline_graph_svg_element = null;
  let inline_graph_g = null;
  let inline_graph_zoom = null;

  // Depth color scale
  const depth_colors = [
    '#e91e63',
    '#2196f3',
    '#4caf50',
    '#ff9800',
    '#9c27b0',
    '#00bcd4',
    '#795548',
    '#607d8b'
  ];

  const depth_fills = [
    '#fce4ec',
    '#e3f2fd',
    '#e8f5e9',
    '#fff3e0',
    '#f3e5f5',
    '#e0f7fa',
    '#efebe9',
    '#eceff1'
  ];

  const get_depth_color = (depth) =>
    depth_colors[Math.min(depth, depth_colors.length - 1)];
  const get_depth_fill = (depth) =>
    depth_fills[Math.min(depth, depth_fills.length - 1)];

  /**
   * Render inline call graph.
   */
  const render_inline_call_graph = () => {
    if (!state.inline_call_graph_data.value || !state.inline_graph_svg.value) {
      console.log('Missing inline call graph data or SVG ref');
      return;
    }

    const container = state.inline_graph_container.value;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    // Stop any running simulation before clearing
    if (inline_simulation) {
      inline_simulation.stop();
      inline_simulation = null;
    }

    // Clear previous graph
    d3.select(state.inline_graph_svg.value).selectAll('*').remove();

    inline_graph_svg_element = d3.select(state.inline_graph_svg.value);

    // Add zoom behavior
    inline_graph_zoom = d3
      .zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        inline_graph_g.attr('transform', event.transform);
      });

    inline_graph_svg_element.call(inline_graph_zoom);
    inline_graph_g = inline_graph_svg_element.append('g');

    // Define arrow marker
    inline_graph_svg_element
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

    // Get full data from cache
    const all_nodes = state.inline_call_graph_data.value.nodes || [];
    const all_edges = state.inline_call_graph_data.value.edges || [];
    const root_id = state.inline_call_graph_data.value.root;

    // Filter edges by depth
    const max_depth = state.inline_call_graph_depth.value;

    let filtered_edges;
    if (max_depth === 0) {
      filtered_edges = all_edges;
    } else {
      filtered_edges = all_edges.filter((e) => {
        const callee_ok = e.callee_depth != null && e.callee_depth <= max_depth;
        const caller_ok = e.caller_depth != null && e.caller_depth <= max_depth;
        return callee_ok || caller_ok;
      });
    }

    // Collect node IDs from filtered edges
    const allowed_node_ids = new Set();
    allowed_node_ids.add(root_id);
    filtered_edges.forEach((e) => {
      allowed_node_ids.add(e.from);
      allowed_node_ids.add(e.to);
    });

    // Filter nodes
    const nodes = all_nodes
      .filter((n) => allowed_node_ids.has(n.id))
      .map((n) => ({ ...n }));
    const edges = filtered_edges.filter(
      (e) => allowed_node_ids.has(e.from) && allowed_node_ids.has(e.to)
    );

    // Calculate depth for each node using BFS from root
    const node_depths = new Map();
    node_depths.set(root_id, 0);

    // Build adjacency lists for BFS
    const callee_adj = new Map();
    const caller_adj = new Map();
    edges.forEach((e) => {
      if (!callee_adj.has(e.from)) callee_adj.set(e.from, []);
      callee_adj.get(e.from).push(e.to);
      if (!caller_adj.has(e.to)) caller_adj.set(e.to, []);
      caller_adj.get(e.to).push(e.from);
    });

    // BFS for callees (positive depth)
    const callee_queue = [root_id];
    while (callee_queue.length > 0) {
      const current = callee_queue.shift();
      const current_depth = node_depths.get(current);
      const callees = callee_adj.get(current) || [];
      for (const callee of callees) {
        if (!node_depths.has(callee)) {
          node_depths.set(callee, current_depth + 1);
          callee_queue.push(callee);
        }
      }
    }

    // BFS for callers
    const caller_queue = [root_id];
    const caller_visited = new Set([root_id]);
    while (caller_queue.length > 0) {
      const current = caller_queue.shift();
      const current_depth = node_depths.get(current);
      const callers = caller_adj.get(current) || [];
      for (const caller of callers) {
        if (!caller_visited.has(caller)) {
          caller_visited.add(caller);
          if (!node_depths.has(caller)) {
            node_depths.set(caller, current_depth + 1);
          }
          caller_queue.push(caller);
        }
      }
    }

    // Store depth on nodes for color-coding
    nodes.forEach((n) => {
      n.depth = node_depths.get(n.id) || 0;
    });

    // Create links
    const links = edges
      .map((e) => ({
        source: nodes.find((n) => n.id === e.from),
        target: nodes.find((n) => n.id === e.to),
        line: e.line
      }))
      .filter((l) => l.source && l.target);

    // Create force-directed simulation
    inline_simulation = d3
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
    const link = inline_graph_g
      .append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('class', 'graph-link')
      .attr('marker-end', 'url(#inline-arrowhead)');

    // Draw nodes with depth-based colors
    const node = inline_graph_g
      .append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('class', (d) => `graph-node ${d.id === root_id ? 'root' : ''}`)
      .call(
        d3
          .drag()
          .on('start', (event, d) => {
            if (!event.active) inline_simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) inline_simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      )
      .on('click', (event, d) => {
        event.stopPropagation();
        state.selected_inline_graph_node.value = d;
        inline_graph_g
          .selectAll('.graph-node')
          .classed('selected', (n) => n.id === d.id);
        link.classed(
          'highlighted',
          (l) => l.source.id === d.id || l.target.id === d.id
        );
      });

    node
      .append('circle')
      .attr('r', (d) => (d.id === root_id ? 18 : 14))
      .attr('fill', (d) => get_depth_fill(d.depth))
      .attr('stroke', (d) => get_depth_color(d.depth))
      .attr('stroke-width', 2);

    node
      .append('text')
      .attr('dy', 30)
      .attr('text-anchor', 'middle')
      .text((d) =>
        d.symbol.length > 20 ? d.symbol.substring(0, 17) + '...' : d.symbol
      );

    // Update positions on tick
    inline_simulation.on('tick', () => {
      link
        .attr('x1', (d) => d.source.x)
        .attr('y1', (d) => d.source.y)
        .attr('x2', (d) => d.target.x)
        .attr('y2', (d) => d.target.y);
      node.attr('transform', (d) => `translate(${d.x},${d.y})`);
    });

    // Click on background to deselect
    inline_graph_svg_element.on('click', () => {
      state.selected_inline_graph_node.value = null;
      inline_graph_g.selectAll('.graph-node').classed('selected', false);
      link.classed('highlighted', false);
    });
  };

  /**
   * Zoom in on the inline call graph.
   */
  const zoom_in = () => {
    if (inline_graph_svg_element && inline_graph_zoom) {
      inline_graph_svg_element
        .transition()
        .call(inline_graph_zoom.scaleBy, 1.3);
    }
  };

  /**
   * Zoom out on the inline call graph.
   */
  const zoom_out = () => {
    if (inline_graph_svg_element && inline_graph_zoom) {
      inline_graph_svg_element
        .transition()
        .call(inline_graph_zoom.scaleBy, 0.7);
    }
  };

  /**
   * Reset inline call graph zoom to default.
   */
  const reset_zoom = () => {
    if (inline_graph_svg_element && inline_graph_zoom) {
      inline_graph_svg_element
        .transition()
        .call(inline_graph_zoom.transform, d3.zoomIdentity);
    }
  };

  /**
   * Stop the inline graph force simulation.
   */
  const stop_simulation = () => {
    if (inline_simulation) {
      inline_simulation.stop();
      inline_simulation = null;
    }
  };

  return {
    render_inline_call_graph,
    zoom_in,
    zoom_out,
    reset_zoom,
    stop_simulation
  };
};

/**
 * Creates a renderer for tree views (caller/callee trees).
 * @param {Object} state - Application state
 * @param {Object} d3 - D3 library
 * @returns {Object} Tree renderer functions
 */
export const create_tree_renderer = (state, d3) => {
  let svg = null;
  let g = null;
  let zoom = null;

  /**
   * Render tree using D3 tree layout.
   */
  const render_tree = () => {
    if (!state.tree_data.value || !state.graph_svg.value) {
      console.log('Missing tree data or SVG ref');
      return;
    }

    const container = state.graph_container.value;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    // Clear previous graph
    d3.select(state.graph_svg.value).selectAll('*').remove();

    svg = d3.select(state.graph_svg.value);

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
    const children_key =
      state.graph_view_type.value === 'callers' ? 'callers' : 'callees';
    const root = d3.hierarchy(state.tree_data.value, (d) => d[children_key]);

    // Create tree layout - horizontal for better readability
    const tree_layout = d3.tree().nodeSize([60, 180]);
    tree_layout(root);

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
        state.selected_graph_node.value = d.data;
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
      state.selected_graph_node.value = null;
      g.selectAll('.tree-node').classed('selected', false);
    });

    // Auto-fit the tree to the viewport
    const bounds = g.node().getBBox();
    const full_width = bounds.width + 100;
    const full_height = bounds.height + 100;
    const scale = Math.min(width / full_width, height / full_height, 1);

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

  return {
    render_tree
  };
};
