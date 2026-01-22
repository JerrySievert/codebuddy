/**
 * API module for making HTTP requests to the backend.
 * Contains all fetch calls for data retrieval and mutations.
 */

/**
 * Load server status (read-only mode check).
 * @returns {Promise<Object>} Server status
 */
export const load_server_status = async () => {
  try {
    const response = await fetch('/api/v1/status');
    return await response.json();
  } catch (error) {
    console.error('Failed to load server status:', error);
    return { read_only: false };
  }
};

/**
 * Load global statistics.
 * @returns {Promise<Object>} Global stats (projects, entities, files, languages)
 */
export const load_global_stats = async () => {
  try {
    const response = await fetch('/api/v1/stats');
    return await response.json();
  } catch (error) {
    console.error('Failed to load global stats:', error);
    return { projects: 0, entities: 0, files: 0, languages: [] };
  }
};

/**
 * Load all projects.
 * @returns {Promise<Array>} List of projects
 */
export const load_projects = async () => {
  try {
    const response = await fetch('/api/v1/projects');
    return await response.json();
  } catch (error) {
    console.error('Failed to load projects:', error);
    return [];
  }
};

/**
 * Load project info by name.
 * @param {string} project_name - Project name
 * @returns {Promise<Object>} Project info
 */
export const load_project_info = async (project_name) => {
  try {
    const response = await fetch(`/api/v1/projects/${project_name}`);
    return await response.json();
  } catch (error) {
    console.error('Failed to load project info:', error);
    return null;
  }
};

/**
 * Load functions for a file.
 * @param {string} project_name - Project name
 * @param {string} filename - File path
 * @returns {Promise<Array>} List of functions
 */
export const load_file_functions = async (project_name, filename) => {
  try {
    const response = await fetch(
      `/api/v1/functions?project=${project_name}&filename=${encodeURIComponent(filename)}`
    );
    return await response.json();
  } catch (error) {
    console.error('Failed to load file functions:', error);
    return [];
  }
};

/**
 * Load file analytics.
 * @param {string} project_name - Project name
 * @param {string} filename - File path
 * @returns {Promise<Object|null>} File analytics
 */
export const load_file_analytics = async (project_name, filename) => {
  try {
    const response = await fetch(
      `/api/v1/files/analytics?project=${project_name}&filename=${encodeURIComponent(filename)}`
    );
    return await response.json();
  } catch (error) {
    console.error('Failed to load file analytics:', error);
    return null;
  }
};

/**
 * Load source code for a file.
 * @param {string} project_name - Project name
 * @param {string} filename - Filename to load
 * @returns {Promise<Object|null>} Source code object or null
 */
export const load_file_source = async (project_name, filename) => {
  try {
    const response = await fetch(
      `/api/v1/sourcecode?project=${project_name}&filename=${encodeURIComponent(filename)}`
    );
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('Failed to load file source:', error);
    return null;
  }
};

/**
 * Load all functions for a project.
 * @param {string} project_name - Project name
 * @returns {Promise<Array>} List of all functions
 */
export const load_all_functions = async (project_name) => {
  try {
    const response = await fetch(`/api/v1/functions?project=${project_name}`);
    return await response.json();
  } catch (error) {
    console.error('Failed to load all functions:', error);
    return [];
  }
};

/**
 * Search entities.
 * @param {string} query - Search query
 * @param {string|null} project_name - Optional project name
 * @param {number} limit - Result limit
 * @param {number} offset - Result offset for pagination
 * @returns {Promise<Array>} Search results
 */
export const search_entities = async (
  query,
  project_name = null,
  limit = 50,
  offset = 0
) => {
  try {
    const project_param = project_name ? `&project=${project_name}` : '';
    const offset_param = offset > 0 ? `&offset=${offset}` : '';
    const response = await fetch(
      `/api/v1/entities/search?name=${encodeURIComponent(query)}${project_param}&limit=${limit}${offset_param}`
    );
    return await response.json();
  } catch (error) {
    console.error('Failed to search entities:', error);
    return [];
  }
};

/**
 * Load function details by symbol.
 * @param {string} symbol - Function symbol
 * @param {string|null} project_name - Optional project name
 * @returns {Promise<Array>} Function results
 */
export const load_function_details = async (symbol, project_name = null) => {
  try {
    const project_param = project_name ? `?project=${project_name}` : '';
    const response = await fetch(
      `/api/v1/functions/${encodeURIComponent(symbol)}${project_param}`
    );
    return await response.json();
  } catch (error) {
    console.error('Failed to load function details:', error);
    return [];
  }
};

/**
 * Load class members.
 * @param {number} function_id - Function ID
 * @returns {Promise<Object>} Members data
 */
export const load_class_members = async (function_id) => {
  try {
    const response = await fetch(`/api/v1/functions/${function_id}/members`);
    return await response.json();
  } catch (error) {
    console.error('Failed to load class members:', error);
    return { members: [] };
  }
};

/**
 * Load function callers.
 * @param {string} symbol - Function symbol
 * @param {string|null} project_name - Optional project name
 * @returns {Promise<Array>} Callers
 */
export const load_callers = async (symbol, project_name = null) => {
  try {
    const project_param = project_name ? `?project=${project_name}` : '';
    const response = await fetch(
      `/api/v1/functions/${encodeURIComponent(symbol)}/callers${project_param}`
    );
    return await response.json();
  } catch (error) {
    console.error('Failed to load callers:', error);
    return [];
  }
};

/**
 * Load function callees.
 * @param {string} symbol - Function symbol
 * @param {string|null} project_name - Optional project name
 * @returns {Promise<Array>} Callees
 */
export const load_callees = async (symbol, project_name = null) => {
  try {
    const project_param = project_name ? `?project=${project_name}` : '';
    const response = await fetch(
      `/api/v1/functions/${encodeURIComponent(symbol)}/callees${project_param}`
    );
    return await response.json();
  } catch (error) {
    console.error('Failed to load callees:', error);
    return [];
  }
};

/**
 * Load entity references.
 * @param {string} symbol - Entity symbol
 * @param {string} project_name - Project name
 * @returns {Promise<Array>} References
 */
export const load_entity_references = async (symbol, project_name) => {
  try {
    const response = await fetch(
      `/api/v1/entities/${encodeURIComponent(symbol)}/references?project=${project_name}`
    );
    return await response.json();
  } catch (error) {
    console.error('Failed to load entity references:', error);
    return [];
  }
};

/**
 * Load entity definitions.
 * @param {string} name - Entity name
 * @returns {Promise<Array>} Definitions
 */
export const load_entity_definitions = async (name) => {
  try {
    const response = await fetch(
      `/api/v1/entities/definitions?name=${encodeURIComponent(name)}`
    );
    return await response.json();
  } catch (error) {
    console.error('Failed to load entity definitions:', error);
    return [];
  }
};

/**
 * Load call graph for a function.
 * @param {string} symbol - Function symbol
 * @param {string} project_name - Project name
 * @param {number} depth - Graph depth (0 = unlimited)
 * @returns {Promise<Object>} Call graph data
 */
export const load_call_graph = async (symbol, project_name, depth = 0) => {
  try {
    const response = await fetch(
      `/api/v1/functions/${encodeURIComponent(symbol)}/callgraph?project=${project_name}&depth=${depth}`
    );
    const data = await response.json();
    if (!response.ok) {
      return {
        error: data.error || 'Failed to load call graph',
        not_found: response.status === 404
      };
    }
    return data;
  } catch (error) {
    console.error('Failed to load call graph:', error);
    return { error: error.message };
  }
};

/**
 * Load reverse call graph for a function (callers only).
 * @param {string} symbol - Function symbol
 * @param {string} project_name - Project name
 * @param {number} depth - Graph depth (0 = unlimited)
 * @returns {Promise<Object>} Reverse call graph data
 */
export const load_reverse_call_graph = async (
  symbol,
  project_name,
  depth = 5
) => {
  try {
    const response = await fetch(
      `/api/v1/functions/${encodeURIComponent(symbol)}/reverse-callgraph?project=${project_name}&depth=${depth}`
    );
    const data = await response.json();
    if (!response.ok) {
      return {
        error: data.error || 'Failed to load reverse call graph',
        not_found: response.status === 404
      };
    }
    return data;
  } catch (error) {
    console.error('Failed to load reverse call graph:', error);
    return { error: error.message };
  }
};

/**
 * Load caller or callee tree.
 * @param {string} symbol - Function symbol
 * @param {string} project_name - Project name
 * @param {string} type - 'callers' or 'callees'
 * @param {number} depth - Tree depth
 * @returns {Promise<Object>} Tree data
 */
export const load_tree = async (symbol, project_name, type, depth) => {
  try {
    const endpoint = type === 'callers' ? 'caller-tree' : 'callee-tree';
    const response = await fetch(
      `/api/v1/functions/${encodeURIComponent(symbol)}/${endpoint}?project=${project_name}&depth=${depth}`
    );
    const data = await response.json();
    if (!response.ok) {
      return {
        error: data.error || 'Failed to load tree',
        not_found: response.status === 404
      };
    }
    return data;
  } catch (error) {
    console.error('Failed to load tree:', error);
    return { error: error.message };
  }
};

/**
 * Load control flow for a function.
 * @param {string} symbol - Function symbol
 * @param {string} project_name - Project name
 * @param {string} filename - File path
 * @returns {Promise<Object>} Control flow data
 */
export const load_control_flow = async (symbol, project_name, filename) => {
  try {
    const response = await fetch(
      `/api/v1/functions/${encodeURIComponent(symbol)}/controlflow?project=${project_name}&filename=${encodeURIComponent(filename)}`
    );
    if (!response.ok) {
      const error = await response.json();
      return { error: error.error || 'Failed to load flowchart' };
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to load control flow:', error);
    return { error: 'Failed to load flowchart' };
  }
};

/**
 * Import a project.
 * @param {string} path - Project path
 * @param {string|null} name - Optional project name
 * @returns {Promise<Object>} Import result
 */
export const import_project = async (path, name = null) => {
  try {
    const response = await fetch('/api/v1/projects/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path,
        name: name || undefined
      })
    });
    const result = await response.json();
    if (!response.ok) {
      return { error: result.error || 'Failed to import project' };
    }
    return result;
  } catch (error) {
    return { error: error.message || 'Failed to import project' };
  }
};

/**
 * Refresh a project.
 * @param {string} project_name - Project name
 * @returns {Promise<Object>} Refresh result
 */
export const refresh_project = async (project_name) => {
  try {
    const response = await fetch(`/api/v1/projects/${project_name}/refresh`, {
      method: 'POST'
    });
    const result = await response.json();
    if (!response.ok) {
      return { error: result.error || 'Failed to refresh project' };
    }
    return result;
  } catch (error) {
    return { error: error.message || 'Failed to refresh project' };
  }
};

/**
 * Delete a project.
 * @param {string} project_name - Project name
 * @returns {Promise<Object>} Delete result
 */
export const delete_project = async (project_name) => {
  try {
    const response = await fetch(`/api/v1/projects/${project_name}`, {
      method: 'DELETE'
    });
    const result = await response.json();
    if (!response.ok) {
      return { error: result.error || 'Failed to delete project' };
    }
    return result;
  } catch (error) {
    return { error: error.message || 'Failed to delete project' };
  }
};

/**
 * Load job queue.
 * @returns {Promise<Array>} Jobs list
 */
export const load_jobs = async () => {
  try {
    const response = await fetch('/api/v1/jobs');
    return await response.json();
  } catch (error) {
    console.error('Failed to load jobs:', error);
    return [];
  }
};

/**
 * Load job queue stats.
 * @returns {Promise<Object>} Stats
 */
export const load_job_stats = async () => {
  try {
    const response = await fetch('/api/v1/jobs/stats');
    return await response.json();
  } catch (error) {
    console.error('Failed to load job stats:', error);
    return { queued: 0, running: 0, completed: 0, failed: 0, total: 0 };
  }
};

/**
 * Load job by ID.
 * @param {string} job_id - Job ID
 * @returns {Promise<Object>} Job data
 */
export const load_job = async (job_id) => {
  try {
    const response = await fetch(`/api/v1/jobs/${job_id}`);
    return await response.json();
  } catch (error) {
    console.error('Failed to load job:', error);
    return null;
  }
};

/**
 * Load analysis dashboard for a project.
 * @param {string} project_name - Project name
 * @returns {Promise<Object|null>} Analysis data
 */
export const load_analysis_dashboard = async (project_name) => {
  try {
    const response = await fetch(`/api/v1/projects/${project_name}/analysis`);
    return await response.json();
  } catch (error) {
    console.error('Failed to load analysis dashboard:', error);
    return null;
  }
};

/**
 * Load analysis detail for a specific type.
 * @param {string} project_name - Project name
 * @param {string} type - Analysis type
 * @returns {Promise<Object|null>} Analysis detail
 */
export const load_analysis_detail = async (project_name, type) => {
  try {
    const response = await fetch(
      `/api/v1/projects/${project_name}/analysis/${type}`
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Failed to load ${type} analysis:`, error);
    return null;
  }
};
