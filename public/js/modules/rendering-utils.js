/**
 * Shared utilities for D3.js graph rendering.
 * Contains common color scales, zoom helpers, and node utilities.
 */

/**
 * Depth-based color scale for graph nodes.
 * Used to color nodes based on their depth from the root.
 */
export const depth_colors = [
  '#e91e63', // depth 0 - pink (root)
  '#2196f3', // depth 1 - blue
  '#4caf50', // depth 2 - green
  '#ff9800', // depth 3 - orange
  '#9c27b0', // depth 4 - purple
  '#00bcd4', // depth 5 - cyan
  '#795548', // depth 6 - brown
  '#607d8b'  // depth 7+ - grey
];

/**
 * Depth-based fill colors for graph nodes.
 * Lighter versions of depth_colors for node fills.
 */
export const depth_fills = [
  '#fce4ec', // depth 0 - light pink
  '#e3f2fd', // depth 1 - light blue
  '#e8f5e9', // depth 2 - light green
  '#fff3e0', // depth 3 - light orange
  '#f3e5f5', // depth 4 - light purple
  '#e0f7fa', // depth 5 - light cyan
  '#efebe9', // depth 6 - light brown
  '#eceff1'  // depth 7+ - light grey
];

/**
 * Get stroke color for a given depth.
 * @param {number} depth - Node depth
 * @returns {string} CSS color value
 */
export const get_depth_color = (depth) =>
  depth_colors[Math.min(depth, depth_colors.length - 1)];

/**
 * Get fill color for a given depth.
 * @param {number} depth - Node depth
 * @returns {string} CSS color value
 */
export const get_depth_fill = (depth) =>
  depth_fills[Math.min(depth, depth_fills.length - 1)];

/**
 * Creates zoom behavior handlers for a D3 SVG.
 * @param {Object} d3 - D3 library
 * @param {Object} svg_element - D3 selection of SVG element
 * @param {Object} g_element - D3 selection of g element to transform
 * @returns {Object} Zoom handlers and behavior
 */
export const create_zoom_behavior = (d3, svg_element, g_element) => {
  const zoom = d3
    .zoom()
    .scaleExtent([0.1, 4])
    .on('zoom', (event) => {
      g_element.attr('transform', event.transform);
    });

  svg_element.call(zoom);

  return {
    zoom,
    zoom_in: () => svg_element?.transition().call(zoom.scaleBy, 1.3),
    zoom_out: () => svg_element?.transition().call(zoom.scaleBy, 0.7),
    reset_zoom: () => svg_element?.transition().call(zoom.transform, d3.zoomIdentity)
  };
};

/**
 * Creates an arrow marker definition for edges.
 * @param {Object} svg_element - D3 selection of SVG element
 * @param {string} id - Marker ID
 * @param {string} fill_class - CSS class for the arrow fill
 * @returns {void}
 */
export const create_arrow_marker = (svg_element, id, fill_class = 'graph-arrow') => {
  svg_element
    .append('defs')
    .append('marker')
    .attr('id', id)
    .attr('viewBox', '-0 -5 10 10')
    .attr('refX', 20)
    .attr('refY', 0)
    .attr('orient', 'auto')
    .attr('markerWidth', 6)
    .attr('markerHeight', 6)
    .append('path')
    .attr('d', 'M 0,-5 L 10,0 L 0,5')
    .attr('class', fill_class);
};

/**
 * Truncate a string with ellipsis if it exceeds max length.
 * @param {string} str - String to truncate
 * @param {number} max_length - Maximum length before truncation
 * @returns {string} Truncated string
 */
export const truncate_string = (str, max_length = 20) => {
  if (!str) return '';
  if (str.length <= max_length) return str;
  return str.substring(0, max_length - 3) + '...';
};

/**
 * Filter nodes and edges by depth from a root node.
 * @param {Object[]} all_nodes - All nodes
 * @param {Object[]} all_edges - All edges
 * @param {string|number} root_id - Root node ID
 * @param {number} max_depth - Maximum depth (0 for unlimited)
 * @returns {Object} Filtered { nodes, edges }
 */
export const filter_by_depth = (all_nodes, all_edges, root_id, max_depth) => {
  if (max_depth === 0) {
    return { nodes: all_nodes, edges: all_edges };
  }

  const filtered_edges = all_edges.filter((e) => {
    const callee_ok = e.callee_depth != null && e.callee_depth <= max_depth;
    const caller_ok = e.caller_depth != null && e.caller_depth <= max_depth;
    return callee_ok || caller_ok;
  });

  const allowed_node_ids = new Set();
  allowed_node_ids.add(root_id);
  filtered_edges.forEach((e) => {
    allowed_node_ids.add(e.from);
    allowed_node_ids.add(e.to);
  });

  const nodes = all_nodes
    .filter((n) => allowed_node_ids.has(n.id))
    .map((n) => ({ ...n }));

  const edges = filtered_edges.filter(
    (e) => allowed_node_ids.has(e.from) && allowed_node_ids.has(e.to)
  );

  return { nodes, edges };
};

/**
 * Calculate node depths using BFS from a root node.
 * @param {Object[]} nodes - Array of nodes
 * @param {Object[]} edges - Array of edges
 * @param {string|number} root_id - Root node ID
 * @returns {Map} Map of node ID to depth
 */
export const calculate_node_depths = (nodes, edges, root_id) => {
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

  return node_depths;
};
