/**
 * Rendering module for D3.js graph visualizations.
 * Contains functions for rendering flowcharts, call graphs, and tree views.
 */

import {
  get_depth_color,
  get_depth_fill,
  filter_by_depth,
  calculate_node_depths,
  truncate_string
} from './rendering-utils.js';

// ============================================================================
// Flowchart Layout Helpers
// ============================================================================

/**
 * Compute topological levels for flowchart nodes.
 * @param {Object[]} nodes - Array of nodes
 * @param {Object[]} edges - Array of edges
 * @returns {Map} Map of node ID to level
 */
const compute_flowchart_levels = (nodes, edges) => {
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
        levels.set(neighbor, Math.max(levels.get(neighbor), current_level + 1));
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

  return levels;
};

/**
 * Position flowchart nodes based on levels.
 * @param {Object[]} nodes - Array of nodes
 * @param {Map} levels - Map of node ID to level
 * @param {number} width - Container width
 * @param {Object} config - Layout configuration
 * @returns {Map} Map of node ID to position {x, y}
 */
const position_flowchart_nodes = (nodes, levels, width, config) => {
  const { node_width, node_height, level_gap, node_gap } = config;

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

  return node_positions;
};

/**
 * Draw flowchart edges.
 * @param {Object} link_group - D3 selection for links
 * @param {Object[]} edges - Array of edges
 * @param {Object[]} nodes - Array of nodes
 * @param {Map} node_positions - Map of node positions
 * @param {Object} config - Layout configuration
 */
const draw_flowchart_edges = (
  link_group,
  edges,
  nodes,
  node_positions,
  config
) => {
  const { node_width, node_height } = config;

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
        `M ${from_pos.x + node_width / 2} ${from_pos.y}
         Q ${mid_x} ${from_pos.y}, ${mid_x} ${(from_pos.y + to_pos.y) / 2}
         Q ${mid_x} ${to_pos.y}, ${to_pos.x + node_width / 2} ${to_pos.y}`
      );
    } else {
      const dx = to_pos.x - from_pos.x;
      if (Math.abs(dx) < 10) {
        path.attr('d', `M ${from_pos.x} ${start_y} L ${to_pos.x} ${end_y}`);
      } else {
        const mid_y = (start_y + end_y) / 2;
        path.attr(
          'd',
          `M ${from_pos.x} ${start_y}
           Q ${from_pos.x} ${mid_y}, ${(from_pos.x + to_pos.x) / 2} ${mid_y}
           Q ${to_pos.x} ${mid_y}, ${to_pos.x} ${end_y}`
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
};

/**
 * Draw a flowchart node shape based on type.
 * @param {Object} g - D3 selection for node group
 * @param {Object} node - Node data
 * @param {Object} config - Layout configuration
 */
const draw_flowchart_node_shape = (g, node, config) => {
  const { node_width, node_height } = config;

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
          `0,${-diamond_size} ${diamond_size},0 0,${diamond_size} ${-diamond_size},0`
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
          `${-hw + indent},${-hh} ${hw - indent},${-hh} ${hw},0 ${hw - indent},${hh} ${-hw + indent},${hh} ${-hw},0`
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
};

/**
 * Draw flowchart nodes.
 * @param {Object} node_group - D3 selection for nodes
 * @param {Object[]} nodes - Array of nodes
 * @param {Map} node_positions - Map of node positions
 * @param {Object} config - Layout configuration
 * @param {Function} on_click - Click handler
 */
const draw_flowchart_nodes = (
  node_group,
  nodes,
  node_positions,
  config,
  on_click
) => {
  const { node_height } = config;
  const max_label_length = 18;

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
          on_click(node);
        }
      });

    draw_flowchart_node_shape(g, node, config);

    // Add label
    const label = node.label || node.type;
    const display_label = truncate_string(label, max_label_length);

    g.append('text')
      .attr('class', 'flowchart-label')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('y', 0)
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
};

// ============================================================================
// Force Graph Helpers
// ============================================================================

/**
 * Create force simulation for a graph.
 * @param {Object} d3 - D3 library
 * @param {Object[]} nodes - Array of nodes
 * @param {Object[]} links - Array of links
 * @param {number} width - Container width
 * @param {number} height - Container height
 * @param {Object} config - Simulation configuration
 * @returns {Object} D3 force simulation
 */
const create_force_simulation = (
  d3,
  nodes,
  links,
  width,
  height,
  config = {}
) => {
  const {
    link_distance = 120,
    charge_strength = -400,
    collision_radius = 50
  } = config;

  return d3
    .forceSimulation(nodes)
    .force(
      'link',
      d3
        .forceLink(links)
        .id((d) => d.id)
        .distance(link_distance)
    )
    .force('charge', d3.forceManyBody().strength(charge_strength))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(collision_radius));
};

/**
 * Create drag behavior for graph nodes.
 * @param {Object} d3 - D3 library
 * @param {Object} simulation - D3 force simulation
 * @returns {Object} D3 drag behavior
 */
const create_drag_behavior = (d3, simulation) => {
  return d3
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
    });
};

/**
 * Draw graph links.
 * @param {Object} g - D3 selection for graph group
 * @param {Object[]} links - Array of links
 * @param {string} marker_id - Arrow marker ID
 * @returns {Object} D3 selection of links
 */
const draw_graph_links = (g, links, marker_id) => {
  return g
    .append('g')
    .selectAll('line')
    .data(links)
    .join('line')
    .attr('class', 'graph-link')
    .attr('marker-end', `url(#${marker_id})`);
};

/**
 * Draw graph nodes with circles and labels.
 * @param {Object} g - D3 selection for graph group
 * @param {Object[]} nodes - Array of nodes
 * @param {string|number} root_id - Root node ID
 * @param {Object} drag_behavior - D3 drag behavior
 * @param {Function} on_click - Click handler
 * @param {Object} options - Drawing options
 * @returns {Object} D3 selection of nodes
 */
const draw_graph_nodes = (
  g,
  nodes,
  root_id,
  drag_behavior,
  on_click,
  options = {}
) => {
  const { use_depth_colors = false } = options;

  const node = g
    .append('g')
    .selectAll('g')
    .data(nodes)
    .join('g')
    .attr('class', (d) => `graph-node ${d.id === root_id ? 'root' : ''}`)
    .call(drag_behavior)
    .on('click', on_click);

  node
    .append('circle')
    .attr('r', (d) => (d.id === root_id ? 18 : 14))
    .attr('fill', (d) => {
      if (use_depth_colors) return get_depth_fill(d.depth || 0);
      return d.id === root_id ? '#fce4ec' : '#e3f2fd';
    })
    .attr('stroke', (d) => {
      if (use_depth_colors) return get_depth_color(d.depth || 0);
      return d.id === root_id ? '#e91e63' : '#2196f3';
    })
    .attr('stroke-width', use_depth_colors ? 2 : 1);

  node
    .append('text')
    .attr('dy', 30)
    .attr('text-anchor', 'middle')
    .text((d) => truncate_string(d.symbol, 20));

  // Add tooltips with project and filename info
  node
    .append('title')
    .text((d) => `${d.symbol}\n${d.project || ''}\n${d.filename || ''}`);

  return node;
};

/**
 * Setup tick handler for force simulation.
 * @param {Object} simulation - D3 force simulation
 * @param {Object} link - D3 selection of links
 * @param {Object} node - D3 selection of nodes
 */
const setup_simulation_tick = (simulation, link, node) => {
  simulation.on('tick', () => {
    link
      .attr('x1', (d) => d.source.x)
      .attr('y1', (d) => d.source.y)
      .attr('x2', (d) => d.target.x)
      .attr('y2', (d) => d.target.y);
    node.attr('transform', (d) => `translate(${d.x},${d.y})`);
  });
};

/**
 * Create arrow marker for graph edges.
 * @param {Object} svg - D3 SVG selection
 * @param {string} id - Marker ID
 * @param {string} fill_class - CSS class for fill
 */
const create_arrow_marker = (svg, id, fill_class = 'graph-arrow') => {
  svg
    .append('defs')
    .append('marker')
    .attr('id', id)
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 25)
    .attr('refY', 0)
    .attr('orient', 'auto')
    .attr('markerWidth', 8)
    .attr('markerHeight', 8)
    .attr('markerUnits', 'strokeWidth')
    .append('path')
    .attr('d', 'M 0,-5 L 10,0 L 0,5')
    .attr('fill', '#666');
};

/**
 * Create flowchart arrow marker (with different refX).
 * @param {Object} svg - D3 SVG selection
 */
const create_flowchart_arrow_marker = (svg) => {
  svg
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
};

// ============================================================================
// Flowchart Renderer
// ============================================================================

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

  const config = {
    node_width: 140,
    node_height: 50,
    level_gap: 80,
    node_gap: 30
  };

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
    create_flowchart_arrow_marker(flowchart_svg_element);

    const nodes = state.flowchart_data.value.nodes;
    const edges = state.flowchart_data.value.edges;

    if (!nodes || nodes.length === 0) {
      state.flowchart_error.value = 'No control flow data available';
      return;
    }

    // Compute layout
    const levels = compute_flowchart_levels(nodes, edges);
    const node_positions = position_flowchart_nodes(
      nodes,
      levels,
      width,
      config
    );

    // Draw edges
    const link_group = flowchart_g.append('g').attr('class', 'flowchart-links');
    draw_flowchart_edges(link_group, edges, nodes, node_positions, config);

    // Draw nodes
    const node_group = flowchart_g.append('g').attr('class', 'flowchart-nodes');
    draw_flowchart_nodes(node_group, nodes, node_positions, config, (node) => {
      state.selected_flowchart_node.value = node;
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

  const zoom_in = () => {
    if (flowchart_svg_element && flowchart_zoom) {
      flowchart_svg_element.transition().call(flowchart_zoom.scaleBy, 1.3);
    }
  };

  const zoom_out = () => {
    if (flowchart_svg_element && flowchart_zoom) {
      flowchart_svg_element.transition().call(flowchart_zoom.scaleBy, 0.7);
    }
  };

  const reset_zoom = () => {
    if (flowchart_svg_element && flowchart_zoom) {
      flowchart_svg_element
        .transition()
        .call(flowchart_zoom.transform, d3.zoomIdentity);
    }
  };

  return { render_flowchart, zoom_in, zoom_out, reset_zoom };
};

// ============================================================================
// Call Graph Renderer
// ============================================================================

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
    create_arrow_marker(svg, 'arrowhead');

    // Get full data and filter by depth
    const all_nodes = state.call_graph_data.value.nodes || [];
    const all_edges = state.call_graph_data.value.edges || [];
    const root_id = state.call_graph_data.value.root;
    const max_depth = state.call_graph_depth.value;

    const { nodes, edges } = filter_by_depth(
      all_nodes,
      all_edges,
      root_id,
      max_depth
    );

    if (nodes.length === 0) {
      console.log('No nodes to render');
      return;
    }

    // Calculate depth for each node using BFS from root
    const node_depths = calculate_node_depths(nodes, edges, root_id);

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

    // Create simulation
    simulation = create_force_simulation(d3, nodes, links, width, height);

    // Draw links
    const link = draw_graph_links(g, links, 'arrowhead');

    // Draw nodes with depth-based colors
    const drag_behavior = create_drag_behavior(d3, simulation);
    const node = draw_graph_nodes(
      g,
      nodes,
      root_id,
      drag_behavior,
      (event, d) => {
        event.stopPropagation();
        state.selected_graph_node.value = d;
        g.selectAll('.graph-node').classed('selected', (n) => n.id === d.id);
        link.classed(
          'highlighted',
          (l) => l.source.id === d.id || l.target.id === d.id
        );
      },
      { use_depth_colors: true }
    );

    // Setup tick handler
    setup_simulation_tick(simulation, link, node);

    // Click on background to deselect
    svg.on('click', () => {
      state.selected_graph_node.value = null;
      g.selectAll('.graph-node').classed('selected', false);
      link.classed('highlighted', false);
    });
  };

  const zoom_in = () => svg?.transition().call(zoom.scaleBy, 1.3);
  const zoom_out = () => svg?.transition().call(zoom.scaleBy, 0.7);
  const reset_zoom = () =>
    svg?.transition().call(zoom.transform, d3.zoomIdentity);

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

// ============================================================================
// Inline Graph Renderer
// ============================================================================

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
    create_arrow_marker(inline_graph_svg_element, 'inline-arrowhead');

    // Get full data and filter by depth
    const all_nodes = state.inline_call_graph_data.value.nodes || [];
    const all_edges = state.inline_call_graph_data.value.edges || [];
    const root_id = state.inline_call_graph_data.value.root;
    const max_depth = state.inline_call_graph_depth.value;

    const { nodes, edges } = filter_by_depth(
      all_nodes,
      all_edges,
      root_id,
      max_depth
    );

    // Calculate depth for each node using BFS from root
    const node_depths = calculate_node_depths(nodes, edges, root_id);

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
    inline_simulation = create_force_simulation(
      d3,
      nodes,
      links,
      width,
      height,
      {
        link_distance: 100,
        charge_strength: -300,
        collision_radius: 40
      }
    );

    // Draw links
    const link = draw_graph_links(inline_graph_g, links, 'inline-arrowhead');

    // Draw nodes with depth-based colors
    const drag_behavior = create_drag_behavior(d3, inline_simulation);
    const node = draw_graph_nodes(
      inline_graph_g,
      nodes,
      root_id,
      drag_behavior,
      (event, d) => {
        event.stopPropagation();
        state.selected_inline_graph_node.value = d;
        inline_graph_g
          .selectAll('.graph-node')
          .classed('selected', (n) => n.id === d.id);
        link.classed(
          'highlighted',
          (l) => l.source.id === d.id || l.target.id === d.id
        );
      },
      { use_depth_colors: true }
    );

    // Setup tick handler
    setup_simulation_tick(inline_simulation, link, node);

    // Click on background to deselect
    inline_graph_svg_element.on('click', () => {
      state.selected_inline_graph_node.value = null;
      inline_graph_g.selectAll('.graph-node').classed('selected', false);
      link.classed('highlighted', false);
    });
  };

  const zoom_in = () => {
    if (inline_graph_svg_element && inline_graph_zoom) {
      inline_graph_svg_element
        .transition()
        .call(inline_graph_zoom.scaleBy, 1.3);
    }
  };

  const zoom_out = () => {
    if (inline_graph_svg_element && inline_graph_zoom) {
      inline_graph_svg_element
        .transition()
        .call(inline_graph_zoom.scaleBy, 0.7);
    }
  };

  const reset_zoom = () => {
    if (inline_graph_svg_element && inline_graph_zoom) {
      inline_graph_svg_element
        .transition()
        .call(inline_graph_zoom.transform, d3.zoomIdentity);
    }
  };

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

// ============================================================================
// Reverse Call Graph Renderer (Callers Only)
// ============================================================================

/**
 * Creates a renderer for reverse call graphs (callers only, function detail tab).
 * @param {Object} state - Application state
 * @param {Object} d3 - D3 library
 * @returns {Object} Reverse call graph renderer functions
 */
export const create_reverse_graph_renderer = (state, d3) => {
  let reverse_simulation = null;
  let reverse_graph_svg_element = null;
  let reverse_graph_g = null;
  let reverse_graph_zoom = null;

  /**
   * Render reverse call graph (callers only).
   */
  const render_reverse_call_graph = () => {
    if (
      !state.reverse_call_graph_data.value ||
      !state.reverse_graph_svg.value
    ) {
      return;
    }

    const container = state.reverse_graph_container.value;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    // Stop any running simulation before clearing
    if (reverse_simulation) {
      reverse_simulation.stop();
      reverse_simulation = null;
    }

    // Clear previous graph
    d3.select(state.reverse_graph_svg.value).selectAll('*').remove();

    reverse_graph_svg_element = d3.select(state.reverse_graph_svg.value);

    // Add zoom behavior
    reverse_graph_zoom = d3
      .zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        reverse_graph_g.attr('transform', event.transform);
      });

    reverse_graph_svg_element.call(reverse_graph_zoom);
    reverse_graph_g = reverse_graph_svg_element.append('g');

    // Define arrow marker
    create_arrow_marker(reverse_graph_svg_element, 'reverse-arrow');

    // Get data (already filtered by depth on server)
    const nodes = state.reverse_call_graph_data.value.nodes || [];
    const edges = state.reverse_call_graph_data.value.edges || [];
    const root_id = state.reverse_call_graph_data.value.root;

    // Calculate depth for each node using BFS from root (following reverse edges)
    const node_depths = calculate_caller_depths(nodes, edges, root_id);

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
    reverse_simulation = create_force_simulation(
      d3,
      nodes,
      links,
      width,
      height,
      {
        link_distance: 100,
        charge_strength: -300,
        collision_radius: 40
      }
    );

    // Draw links with unique marker reference
    const link = draw_graph_links(reverse_graph_g, links, 'reverse-arrow');

    // Draw nodes - root is pink, callers are green
    const drag_behavior = create_drag_behavior(d3, reverse_simulation);
    const node = draw_reverse_graph_nodes(
      reverse_graph_g,
      nodes,
      root_id,
      drag_behavior,
      (event, d) => {
        event.stopPropagation();
        state.selected_reverse_graph_node.value = d;
        reverse_graph_g
          .selectAll('.graph-node')
          .classed('selected', (n) => n.id === d.id);
        link.classed(
          'highlighted',
          (l) => l.source.id === d.id || l.target.id === d.id
        );
      }
    );

    // Setup tick handler
    setup_simulation_tick(reverse_simulation, link, node);

    // Click on background to deselect
    reverse_graph_svg_element.on('click', () => {
      state.selected_reverse_graph_node.value = null;
      reverse_graph_g.selectAll('.graph-node').classed('selected', false);
      link.classed('highlighted', false);
    });
  };

  const zoom_in = () => {
    if (reverse_graph_svg_element && reverse_graph_zoom) {
      reverse_graph_svg_element
        .transition()
        .call(reverse_graph_zoom.scaleBy, 1.3);
    }
  };

  const zoom_out = () => {
    if (reverse_graph_svg_element && reverse_graph_zoom) {
      reverse_graph_svg_element
        .transition()
        .call(reverse_graph_zoom.scaleBy, 0.7);
    }
  };

  const reset_zoom = () => {
    if (reverse_graph_svg_element && reverse_graph_zoom) {
      reverse_graph_svg_element
        .transition()
        .call(reverse_graph_zoom.transform, d3.zoomIdentity);
    }
  };

  const stop_simulation = () => {
    if (reverse_simulation) {
      reverse_simulation.stop();
      reverse_simulation = null;
    }
  };

  return {
    render_reverse_call_graph,
    zoom_in,
    zoom_out,
    reset_zoom,
    stop_simulation
  };
};

/**
 * Calculate depth for each node in reverse graph (from root following caller edges).
 * @param {Array} nodes - Graph nodes
 * @param {Array} edges - Graph edges
 * @param {number} root_id - Root node ID
 * @returns {Map} Map of node ID to depth
 */
const calculate_caller_depths = (nodes, edges, root_id) => {
  const depths = new Map();
  depths.set(root_id, 0);

  // BFS from root following edges where target is current node (callers point TO their callees)
  const queue = [root_id];
  while (queue.length > 0) {
    const current = queue.shift();
    const current_depth = depths.get(current);

    // Find edges where this node is the target (callers of this node)
    for (const edge of edges) {
      if (edge.to === current && !depths.has(edge.from)) {
        depths.set(edge.from, current_depth + 1);
        queue.push(edge.from);
      }
    }
  }

  return depths;
};

/**
 * Draw nodes for reverse call graph (simpler coloring - root is pink, callers are green).
 */
const draw_reverse_graph_nodes = (
  g,
  nodes,
  root_id,
  drag_behavior,
  on_click
) => {
  const node = g
    .append('g')
    .selectAll('g')
    .data(nodes)
    .join('g')
    .attr('class', (d) => `graph-node ${d.id === root_id ? 'root' : 'caller'}`)
    .call(drag_behavior)
    .on('click', on_click);

  node
    .append('circle')
    .attr('r', (d) => (d.id === root_id ? 18 : 14))
    .attr('fill', (d) => (d.id === root_id ? '#fce4ec' : '#e8f5e9'))
    .attr('stroke', (d) => (d.id === root_id ? '#e91e63' : '#4caf50'))
    .attr('stroke-width', 2);

  node
    .append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', 30)
    .attr('font-size', '11px')
    .text((d) => truncate_string(d.symbol, 20));

  return node;
};

// ============================================================================
// Tree Renderer
// ============================================================================

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
      .text((d) => truncate_string(d.data.symbol, 25))
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

  return { render_tree };
};

// ============================================================================
// Heatmap Renderer (Treemap Visualization)
// ============================================================================

/**
 * Creates a renderer for entity heatmaps using treemap or matrix visualization.
 * Shows function call frequency with rectangle size and color intensity.
 * @param {Object} state - Application state
 * @param {Object} d3 - D3 library
 * @returns {Object} Heatmap renderer functions
 */
export const create_heatmap_renderer = (state, d3) => {
  let heatmap_svg_element = null;
  let heatmap_g = null;
  let heatmap_zoom = null;

  /**
   * Build hierarchy data for treemap from flat nodes.
   * Groups nodes and assigns values based on heat/connectivity.
   */
  const build_treemap_hierarchy = (nodes, root_id) => {
    // Create hierarchy: root contains all other nodes as children
    const root_node = nodes.find((n) => n.id === root_id);
    const other_nodes = nodes.filter((n) => n.id !== root_id);

    return {
      name: root_node ? root_node.symbol : 'root',
      children: other_nodes.map((n) => ({
        name: n.symbol,
        // Value determines rectangle size - use caller_count + base value
        // More callers = larger rectangle
        value: Math.max(1, (n.caller_count || 0) + 1),
        data: n
      }))
    };
  };

  /**
   * Render treemap heatmap visualization.
   */
  const render_treemap = (nodes, root_id, width, height) => {
    // Build hierarchy for treemap
    const hierarchy_data = build_treemap_hierarchy(nodes, root_id);

    // Create treemap layout
    const treemap = d3.treemap().size([width, height]).padding(2).round(true);

    // Create hierarchy and compute values
    const root = d3
      .hierarchy(hierarchy_data)
      .sum((d) => d.value)
      .sort((a, b) => b.value - a.value);

    // Apply treemap layout
    treemap(root);

    // Draw treemap cells - rectangles and tooltips in cell groups
    const cell = heatmap_g
      .selectAll('g.treemap-cell')
      .data(root.leaves())
      .join('g')
      .attr('transform', (d) => `translate(${d.x0},${d.y0})`)
      .attr('class', 'treemap-cell')
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation();
        state.selected_heatmap_node.value = d.data.data;
        heatmap_g.selectAll('rect').attr('stroke-width', 1);
        d3.select(event.currentTarget).select('rect').attr('stroke-width', 3);
      });

    // Cell rectangles with heat-based coloring
    cell
      .append('rect')
      .attr('width', (d) => Math.max(0, d.x1 - d.x0))
      .attr('height', (d) => Math.max(0, d.y1 - d.y0))
      .attr('fill', (d) => get_heat_fill(d.data.data?.heat || 0))
      .attr('stroke', (d) => get_heat_stroke(d.data.data?.heat || 0))
      .attr('stroke-width', 1);

    // Label overlay group - renders on top of all rectangles
    const label_overlay = heatmap_g.append('g').attr('class', 'label-overlay');

    // Cell name labels - visibility recalculated on zoom
    label_overlay
      .selectAll('text.treemap-name')
      .data(root.leaves())
      .join('text')
      .attr('class', 'heatmap-label heatmap-label-name treemap-name')
      .attr('x', (d) => d.x0 + 4)
      .attr('y', (d) => d.y0 + 14)
      .attr('font-size', '11px')
      .attr('data-base-font-size', 11)
      .attr('fill', '#333')
      .attr('data-cell-width', (d) => d.x1 - d.x0)
      .attr('data-cell-height', (d) => d.y1 - d.y0)
      .attr('data-label-type', 'name')
      .attr('data-name', (d) => d.data.name)
      .style('pointer-events', 'none')
      .text((d) => {
        const cell_width = d.x1 - d.x0;
        const cell_height = d.y1 - d.y0;
        if (cell_width < 40 || cell_height < 20) return '';
        const max_chars = Math.floor(cell_width / 7);
        return truncate_string(d.data.name, max_chars);
      });

    // Caller count labels
    label_overlay
      .selectAll('text.treemap-count')
      .data(root.leaves())
      .join('text')
      .attr('class', 'heatmap-label heatmap-label-count treemap-count')
      .attr('x', (d) => d.x0 + 4)
      .attr('y', (d) => d.y0 + 28)
      .attr('font-size', '10px')
      .attr('data-base-font-size', 10)
      .attr('fill', '#666')
      .attr('data-cell-width', (d) => d.x1 - d.x0)
      .attr('data-cell-height', (d) => d.y1 - d.y0)
      .attr('data-label-type', 'count')
      .attr('data-count', (d) => d.data.data?.caller_count || 0)
      .style('pointer-events', 'none')
      .text((d) => {
        const cell_width = d.x1 - d.x0;
        const cell_height = d.y1 - d.y0;
        if (cell_width < 40 || cell_height < 35) return '';
        const count = d.data.data?.caller_count || 0;
        return `${count} caller${count !== 1 ? 's' : ''}`;
      });
  };

  /**
   * Render matrix/grid heatmap visualization.
   * Shows functions sorted by caller count in a grid layout.
   */
  const render_matrix = (nodes, root_id, width, height) => {
    // Sort all nodes by caller count (descending), then by name for stability
    const sorted_nodes = [...nodes].sort((a, b) => {
      const count_diff = (b.caller_count || 0) - (a.caller_count || 0);
      if (count_diff !== 0) return count_diff;
      // Secondary sort by symbol name for stability
      return (a.symbol || '').localeCompare(b.symbol || '');
    });

    const num_nodes = sorted_nodes.length;
    if (num_nodes === 0) return;

    // Calculate grid dimensions - aim for roughly square aspect ratio
    const aspect = width / height;
    let cols = Math.ceil(Math.sqrt(num_nodes * aspect));
    let rows = Math.ceil(num_nodes / cols);

    // Ensure we have enough cells
    while (cols * rows < num_nodes) {
      cols++;
    }

    // Calculate cell size with padding
    const padding = 4;
    const label_height = 40; // Space for labels at bottom
    const cell_width = (width - padding * (cols + 1)) / cols;
    const cell_height = (height - label_height - padding * (rows + 1)) / rows;
    const cell_size = Math.min(cell_width, cell_height, 80); // Cap max size

    // Recalculate to center the grid
    const actual_width = cols * (cell_size + padding) + padding;
    const actual_height = rows * (cell_size + padding) + padding;
    const offset_x = (width - actual_width) / 2;
    const offset_y = (height - label_height - actual_height) / 2;

    // Precompute cell positions for reuse by both rect and label layers
    const cell_data = sorted_nodes.map((node, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = offset_x + padding + col * (cell_size + padding);
      const y = offset_y + padding + row * (cell_size + padding);
      return { node, x, y };
    });

    // Create cell groups with rectangles and tooltips
    cell_data.forEach(({ node, x, y }) => {
      const cell = heatmap_g
        .append('g')
        .attr('class', 'matrix-cell')
        .attr('transform', `translate(${x},${y})`)
        .style('cursor', 'pointer')
        .on('click', (event) => {
          event.stopPropagation();
          state.selected_heatmap_node.value = node;
          heatmap_g.selectAll('.matrix-cell rect').attr('stroke-width', 1);
          d3.select(event.currentTarget).select('rect').attr('stroke-width', 3);
        });

      // Cell rectangle
      cell
        .append('rect')
        .attr('width', cell_size)
        .attr('height', cell_size)
        .attr('rx', 4)
        .attr('ry', 4)
        .attr('fill', get_heat_fill(node.heat || 0))
        .attr('stroke', get_heat_stroke(node.heat || 0))
        .attr('stroke-width', node.id === root_id ? 2 : 1);

      // Tooltip on hover
      cell
        .append('title')
        .text(
          `${node.symbol}\n${node.project || ''}\n${node.filename || ''}\n${node.caller_count || 0} callers`
        );
    });

    // Label overlay group - renders on top of all rectangles
    const label_overlay = heatmap_g.append('g').attr('class', 'label-overlay');

    // Caller count labels in center of cells
    cell_data.forEach(({ node, x, y }) => {
      const caller_count = node.caller_count || 0;
      label_overlay
        .append('text')
        .attr('class', 'heatmap-label heatmap-label-matrix-count')
        .attr('x', x + cell_size / 2)
        .attr('y', y + cell_size / 2)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', cell_size > 40 ? '14px' : '11px')
        .attr('data-base-font-size', cell_size > 40 ? 14 : 11)
        .attr('font-weight', 'bold')
        .attr('fill', node.heat > 0.5 ? '#fff' : '#333')
        .attr('data-cell-width', cell_size)
        .attr('data-cell-height', cell_size)
        .style('pointer-events', 'none')
        .text(caller_count);

      // Function name below cell
      const max_chars = Math.floor(cell_size / 6);
      label_overlay
        .append('text')
        .attr('class', 'heatmap-label heatmap-label-name')
        .attr('x', x + cell_size / 2)
        .attr('y', y + cell_size + 12)
        .attr('text-anchor', 'middle')
        .attr('font-size', '9px')
        .attr('data-base-font-size', 9)
        .attr('fill', '#666')
        .attr('data-cell-width', cell_size)
        .attr('data-cell-height', cell_size)
        .attr('data-label-type', 'name')
        .attr('data-name', node.symbol)
        .style('pointer-events', 'none')
        .text(cell_size >= 30 ? truncate_string(node.symbol, max_chars) : '')
        .append('title')
        .text(`${node.symbol} (${caller_count} callers)`);
    });

    // Add legend at bottom
    const legend_y = height - label_height + 10;
    const legend_g = label_overlay
      .append('g')
      .attr('transform', `translate(${width / 2 - 100}, ${legend_y})`);

    legend_g
      .append('text')
      .attr('class', 'heatmap-label')
      .attr('x', 0)
      .attr('y', 0)
      .attr('font-size', '10px')
      .attr('data-base-font-size', 10)
      .attr('fill', '#666')
      .text('Sorted by caller count (highest first). Color = heat intensity.');
  };

  /**
   * Build a proper hierarchy from nodes and edges for hierarchical views.
   * Creates a tree structure following the call graph edges.
   */
  const build_hierarchy_from_edges = (nodes, edges, root_id) => {
    const node_map = new Map();
    nodes.forEach((n) => node_map.set(n.id, { ...n, children: [] }));

    // Build adjacency list from edges (from -> to means from calls to)
    const children_map = new Map();
    edges.forEach((e) => {
      if (!children_map.has(e.from)) {
        children_map.set(e.from, []);
      }
      children_map.get(e.from).push(e.to);
    });

    // Recursively build tree starting from root.
    // Each node appears only once - subsequent references are skipped
    // to avoid duplicating heavily-called functions across the tree.
    const visited = new Set();
    const build_tree = (node_id, depth = 0) => {
      if (visited.has(node_id) || depth > 10) {
        // Already shown elsewhere in the tree or depth limit reached - skip
        return null;
      }

      visited.add(node_id);
      const node = node_map.get(node_id);
      if (!node) return null;

      const child_ids = children_map.get(node_id) || [];
      const children = child_ids
        .map((id) => build_tree(id, depth + 1))
        .filter((c) => c !== null);

      return {
        name: node.symbol,
        value: Math.max(1, (node.caller_count || 0) + 1),
        data: node,
        children: children.length > 0 ? children : undefined
      };
    };

    const hierarchy = build_tree(root_id);
    return hierarchy || { name: 'root', value: 1, children: [] };
  };

  /**
   * Render hierarchical treemap visualization.
   * Shows nested rectangles following the actual call hierarchy.
   */
  const render_hierarchical = (nodes, edges, root_id, width, height) => {
    // Build proper hierarchy from edges
    const hierarchy_data = build_hierarchy_from_edges(nodes, edges, root_id);

    // Create treemap layout with nesting
    const treemap = d3
      .treemap()
      .size([width, height])
      .paddingOuter(3)
      .paddingTop(19)
      .paddingInner(2)
      .round(true);

    // Create hierarchy and compute values
    const root = d3
      .hierarchy(hierarchy_data)
      .sum((d) => (d.children ? 0 : d.value))
      .sort((a, b) => b.value - a.value);

    // Apply treemap layout
    treemap(root);

    // Draw cells - including parent containers
    // Rectangles and tooltips go in cell groups; labels go in a separate
    // overlay group so they always render on top of all rectangles.
    const cell = heatmap_g
      .selectAll('g.hier-cell')
      .data(root.descendants())
      .join('g')
      .attr('class', (d) =>
        d.children ? 'hier-cell treemap-parent' : 'hier-cell treemap-leaf'
      )
      .attr('transform', (d) => `translate(${d.x0},${d.y0})`)
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation();
        state.selected_heatmap_node.value = d.data.data;
        heatmap_g.selectAll('rect').attr('stroke-width', 1);
        d3.select(event.currentTarget).select('rect').attr('stroke-width', 3);
      });

    // Cell rectangles
    cell
      .append('rect')
      .attr('width', (d) => Math.max(0, d.x1 - d.x0))
      .attr('height', (d) => Math.max(0, d.y1 - d.y0))
      .attr('fill', (d) => {
        if (d.children) {
          // Parent nodes get a light fill based on depth
          const depth_colors = [
            '#f5f5f5',
            '#eeeeee',
            '#e0e0e0',
            '#bdbdbd',
            '#9e9e9e'
          ];
          return depth_colors[Math.min(d.depth, depth_colors.length - 1)];
        }
        return get_heat_fill(d.data.data?.heat || 0);
      })
      .attr('stroke', (d) => {
        if (d.children) return '#999';
        return get_heat_stroke(d.data.data?.heat || 0);
      })
      .attr('stroke-width', 1);

    // Tooltips on cells
    cell.append('title').text((d) => {
      const count = d.data.data?.caller_count || 0;
      const project = d.data.data?.project || '';
      const filename = d.data.data?.filename || '';
      return `${d.data.name}\n${project}\n${filename}\n${count} callers`;
    });

    // Label overlay group - renders on top of all rectangles
    const label_overlay = heatmap_g.append('g').attr('class', 'label-overlay');

    // Parent labels at top (positioned absolutely using cell coords)
    label_overlay
      .selectAll('text.hier-parent-label')
      .data(root.descendants().filter((d) => d.children))
      .join('text')
      .attr('class', 'heatmap-label heatmap-label-name hier-parent-label')
      .attr('x', (d) => d.x0 + 3)
      .attr('y', (d) => d.y0 + 13)
      .attr('font-size', '11px')
      .attr('data-base-font-size', 11)
      .attr('font-weight', 'bold')
      .attr('fill', '#333')
      .attr('data-cell-width', (d) => d.x1 - d.x0)
      .attr('data-cell-height', (d) => d.y1 - d.y0)
      .attr('data-label-type', 'name')
      .attr('data-name', (d) => d.data.name)
      .style('pointer-events', 'none')
      .text((d) => {
        const cell_width = d.x1 - d.x0;
        if (cell_width < 30) return '';
        const max_chars = Math.floor(cell_width / 7);
        return truncate_string(d.data.name, max_chars);
      });

    // Leaf name labels (positioned absolutely using cell coords)
    label_overlay
      .selectAll('text.hier-leaf-label')
      .data(root.descendants().filter((d) => !d.children))
      .join('text')
      .attr('class', 'heatmap-label heatmap-label-name hier-leaf-label')
      .attr('x', (d) => d.x0 + 4)
      .attr('y', (d) => d.y0 + 14)
      .attr('font-size', '10px')
      .attr('data-base-font-size', 10)
      .attr('fill', '#333')
      .attr('data-cell-width', (d) => d.x1 - d.x0)
      .attr('data-cell-height', (d) => d.y1 - d.y0)
      .attr('data-label-type', 'name')
      .attr('data-name', (d) => d.data.name)
      .style('pointer-events', 'none')
      .text((d) => {
        const cell_width = d.x1 - d.x0;
        const cell_height = d.y1 - d.y0;
        if (cell_width < 35 || cell_height < 18) return '';
        const max_chars = Math.floor(cell_width / 6);
        return truncate_string(d.data.name, max_chars);
      });

    // Caller count for leaves (positioned absolutely using cell coords)
    label_overlay
      .selectAll('text.hier-leaf-count')
      .data(root.descendants().filter((d) => !d.children))
      .join('text')
      .attr('class', 'heatmap-label heatmap-label-count hier-leaf-count')
      .attr('x', (d) => d.x0 + 4)
      .attr('y', (d) => d.y0 + 26)
      .attr('font-size', '9px')
      .attr('data-base-font-size', 9)
      .attr('fill', '#666')
      .attr('data-cell-width', (d) => d.x1 - d.x0)
      .attr('data-cell-height', (d) => d.y1 - d.y0)
      .attr('data-label-type', 'count')
      .attr('data-count', (d) => d.data.data?.caller_count || 0)
      .style('pointer-events', 'none')
      .text((d) => {
        const cell_width = d.x1 - d.x0;
        const cell_height = d.y1 - d.y0;
        if (cell_width < 35 || cell_height < 32) return '';
        const count = d.data.data?.caller_count || 0;
        return `${count}`;
      });
  };

  /**
   * Render sunburst visualization.
   * Shows radial hierarchy with arc segments.
   */
  const render_sunburst = (nodes, edges, root_id, width, height) => {
    // Build proper hierarchy from edges
    const hierarchy_data = build_hierarchy_from_edges(nodes, edges, root_id);

    const radius = Math.min(width, height) / 2 - 10;

    // Create partition layout for sunburst
    const partition = d3.partition().size([2 * Math.PI, radius]);

    // Create hierarchy and compute values
    const root = d3
      .hierarchy(hierarchy_data)
      .sum((d) => (d.children ? 0 : d.value))
      .sort((a, b) => b.value - a.value);

    // Apply partition layout
    partition(root);

    // Create arc generator
    const arc = d3
      .arc()
      .startAngle((d) => d.x0)
      .endAngle((d) => d.x1)
      .padAngle((d) => Math.min((d.x1 - d.x0) / 2, 0.005))
      .padRadius(radius / 2)
      .innerRadius((d) => d.y0)
      .outerRadius((d) => d.y1 - 1);

    // Center the sunburst
    const sunburst_g = heatmap_g
      .append('g')
      .attr('transform', `translate(${width / 2},${height / 2})`);

    // Draw arcs
    sunburst_g
      .selectAll('path')
      .data(root.descendants().filter((d) => d.depth))
      .join('path')
      .attr('d', arc)
      .attr('fill', (d) => get_heat_fill(d.data.data?.heat || 0))
      .attr('stroke', '#fff')
      .attr('stroke-width', 1)
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation();
        state.selected_heatmap_node.value = d.data.data;
        sunburst_g.selectAll('path').attr('stroke-width', 1);
        d3.select(event.currentTarget).attr('stroke-width', 3);
      })
      .append('title')
      .text((d) => {
        const count = d.data.data?.caller_count || 0;
        const project = d.data.data?.project || '';
        const filename = d.data.data?.filename || '';
        return `${d.data.name}\n${project}\n${filename}\n${count} callers`;
      });

    // Add labels for all segments - visibility controlled by zoom
    sunburst_g
      .selectAll('text.sunburst-label')
      .data(root.descendants().filter((d) => d.depth))
      .join('text')
      .attr('class', 'heatmap-label sunburst-label')
      .attr('transform', (d) => {
        const x = ((d.x0 + d.x1) / 2) * (180 / Math.PI);
        const y = (d.y0 + d.y1) / 2;
        return `rotate(${x - 90}) translate(${y},0) rotate(${x < 180 ? 0 : 180})`;
      })
      .attr('dy', '0.35em')
      .attr('text-anchor', 'middle')
      .attr('font-size', '9px')
      .attr('data-base-font-size', 9)
      .attr('fill', (d) => (d.data.data?.heat > 0.5 ? '#fff' : '#333'))
      .attr('data-label-type', 'sunburst')
      .attr('data-name', (d) => d.data.name)
      .attr('data-arc-length', (d) => {
        const r = (d.y0 + d.y1) / 2;
        const angle = d.x1 - d.x0;
        return angle * r;
      })
      .text((d) => {
        const r = (d.y0 + d.y1) / 2;
        const angle = d.x1 - d.x0;
        const arc_length = angle * r;
        if (arc_length <= 20) return '';
        const max_chars = Math.floor(arc_length / 6);
        return truncate_string(d.data.name, Math.max(3, max_chars));
      });

    // Add center label
    sunburst_g
      .append('text')
      .attr('class', 'heatmap-label')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('font-size', '12px')
      .attr('data-base-font-size', 12)
      .attr('font-weight', 'bold')
      .text(truncate_string(hierarchy_data.name, 15));
  };

  /**
   * Update label text and visibility based on current zoom scale.
   * Applies inverse scale to text so font size stays constant,
   * and recalculates which labels should be visible at the current zoom.
   * @param {number} scale - Current zoom scale factor
   */
  const update_labels_for_zoom = (scale) => {
    if (!heatmap_g) return;

    const inverse_scale = 1 / scale;

    // Update all heatmap labels with inverse scale so font size stays constant
    // and recalculate which labels should be visible at the zoomed size
    heatmap_g.selectAll('.heatmap-label').each(function () {
      const el = d3.select(this);
      const label_type = el.attr('data-label-type');
      // Use data-base-font-size to avoid compounding scale errors
      const base_font_size = parseFloat(el.attr('data-base-font-size'));

      if (label_type === 'sunburst') {
        // Sunburst labels: recalculate visibility based on apparent arc length
        const arc_length = parseFloat(el.attr('data-arc-length')) || 0;
        const apparent_length = arc_length * scale;
        const name = el.attr('data-name') || '';
        if (apparent_length <= 20) {
          el.text('');
        } else {
          const max_chars = Math.floor(apparent_length / 6);
          el.text(truncate_string(name, Math.max(3, max_chars)));
        }
        el.attr('font-size', `${base_font_size * inverse_scale}px`);
      } else if (label_type === 'name') {
        // Name labels: recalculate visibility and truncation
        const cell_width = parseFloat(el.attr('data-cell-width')) || 0;
        const cell_height = parseFloat(el.attr('data-cell-height')) || 0;
        const apparent_width = cell_width * scale;
        const apparent_height = cell_height * scale;
        const name = el.attr('data-name') || '';

        if (apparent_width < 40 || apparent_height < 18) {
          el.text('');
        } else {
          const max_chars = Math.floor(apparent_width / 7);
          el.text(truncate_string(name, max_chars));
        }
        el.attr('font-size', `${base_font_size * inverse_scale}px`);
      } else if (label_type === 'count') {
        // Count labels: recalculate visibility
        const cell_width = parseFloat(el.attr('data-cell-width')) || 0;
        const cell_height = parseFloat(el.attr('data-cell-height')) || 0;
        const apparent_width = cell_width * scale;
        const apparent_height = cell_height * scale;
        const count = parseInt(el.attr('data-count'), 10) || 0;

        if (apparent_width < 40 || apparent_height < 32) {
          el.text('');
        } else {
          el.text(`${count} caller${count !== 1 ? 's' : ''}`);
        }
        el.attr('font-size', `${base_font_size * inverse_scale}px`);
      } else {
        // Generic labels (center labels, legend, etc.) - just counter-scale
        el.attr('font-size', `${base_font_size * inverse_scale}px`);
      }
    });
  };

  /**
   * Main render function - dispatches to appropriate visualization.
   */
  const render_heatmap = () => {
    if (!state.heatmap_data.value || !state.heatmap_svg.value) {
      console.log('Missing heatmap data or SVG ref');
      return;
    }

    const container = state.heatmap_container.value;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    // Clear previous content
    d3.select(state.heatmap_svg.value).selectAll('*').remove();

    heatmap_svg_element = d3
      .select(state.heatmap_svg.value)
      .attr('width', width)
      .attr('height', height);

    // Add zoom behavior - update labels on zoom to keep font sizes constant
    // and reveal/hide labels based on apparent cell sizes
    heatmap_zoom = d3
      .zoom()
      .scaleExtent([0.5, 8])
      .on('zoom', (event) => {
        heatmap_g.attr('transform', event.transform);
        update_labels_for_zoom(event.transform.k);
      });

    heatmap_svg_element.call(heatmap_zoom);
    heatmap_g = heatmap_svg_element.append('g');

    // Get data
    const nodes = state.heatmap_data.value.nodes || [];
    const edges = state.heatmap_data.value.edges || [];
    const root_id = state.heatmap_data.value.root;

    if (nodes.length === 0) {
      console.log('No nodes to render in heatmap');
      return;
    }

    // Check view type and render appropriate visualization
    const view_type = state.heatmap_view_type.value;
    if (view_type === 'matrix') {
      render_matrix(nodes, root_id, width, height);
    } else if (view_type === 'hierarchical') {
      render_hierarchical(nodes, edges, root_id, width, height);
    } else if (view_type === 'sunburst') {
      render_sunburst(nodes, edges, root_id, width, height);
    } else {
      // Default to treemap
      render_treemap(nodes, root_id, width, height);
    }

    // Click on background to deselect
    heatmap_svg_element.on('click', () => {
      state.selected_heatmap_node.value = null;
      heatmap_g.selectAll('rect').attr('stroke-width', 1);
    });
  };

  const zoom_in = () => {
    if (heatmap_svg_element && heatmap_zoom) {
      heatmap_svg_element.transition().call(heatmap_zoom.scaleBy, 1.3);
    }
  };

  const zoom_out = () => {
    if (heatmap_svg_element && heatmap_zoom) {
      heatmap_svg_element.transition().call(heatmap_zoom.scaleBy, 0.7);
    }
  };

  const reset_zoom = () => {
    if (heatmap_svg_element && heatmap_zoom) {
      heatmap_svg_element
        .transition()
        .call(heatmap_zoom.transform, d3.zoomIdentity);
    }
  };

  const stop_simulation = () => {
    // No simulation in treemap, but keep interface consistent
  };

  return {
    render_heatmap,
    zoom_in,
    zoom_out,
    reset_zoom,
    stop_simulation
  };
};

/**
 * Get fill color for heat value (0-1).
 * Uses a gradient from blue (cold) to red (hot).
 */
const get_heat_fill = (heat) => {
  // Interpolate from blue to red through the spectrum
  const h = heat;
  if (h < 0.25) return '#e3f2fd'; // light blue
  if (h < 0.5) return '#c8e6c9'; // light green
  if (h < 0.75) return '#fff9c4'; // light yellow
  return '#ffcdd2'; // light red
};

/**
 * Get stroke color for heat value (0-1).
 */
const get_heat_stroke = (heat) => {
  const h = heat;
  if (h < 0.25) return '#1565c0'; // blue
  if (h < 0.5) return '#2e7d32'; // green
  if (h < 0.75) return '#f9a825'; // yellow/orange
  return '#c62828'; // red
};
