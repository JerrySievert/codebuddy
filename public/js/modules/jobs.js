/**
 * Jobs module for managing job queue and WebSocket connections.
 * Contains functions for job polling, WebSocket subscriptions, and job status tracking.
 */

/**
 * Creates job queue manager.
 * @param {Object} state - Application state
 * @param {Object} api - API module
 * @returns {Object} Job queue functions
 */
export const create_job_manager = (state, api) => {
  let job_poll_interval = null;
  let nes_client = null;
  const ws_reconnect_delay = 2000;
  const job_subscriptions = new Map();

  /**
   * Load job queue data.
   */
  const load_job_queue = async () => {
    try {
      const [jobs_data, stats_data] = await Promise.all([
        api.load_jobs(),
        api.load_job_stats()
      ]);
      state.jobs.value = jobs_data;
      state.job_queue_stats.value = stats_data;
    } catch (error) {
      console.error('Failed to load job queue:', error);
    }
  };

  /**
   * Start polling for job updates.
   */
  const start_job_polling = () => {
    if (job_poll_interval) return;
    job_poll_interval = setInterval(async () => {
      await load_job_queue();
      // Stop polling if no active jobs
      if (
        state.job_queue_stats.value.running === 0 &&
        state.job_queue_stats.value.queued === 0
      ) {
        stop_job_polling();
      }
    }, 1000);
  };

  /**
   * Stop polling for job updates.
   */
  const stop_job_polling = () => {
    if (job_poll_interval) {
      clearInterval(job_poll_interval);
      job_poll_interval = null;
    }
  };

  /**
   * Initialize WebSocket connection for real-time job updates.
   */
  const init_web_socket = async () => {
    if (nes_client) return;

    try {
      // Check if nes is available (loaded from CDN)
      if (typeof nes === 'undefined') {
        console.warn('[WS] nes library not available, using polling fallback');
        return;
      }

      nes_client = new nes.Client(`ws://${window.location.host}`);

      nes_client.onDisconnect = (will_reconnect, log) => {
        console.log('[WS] Disconnected, willReconnect:', will_reconnect);
        state.ws_connected.value = false;
        // Fall back to polling if we have active subscriptions
        if (job_subscriptions.size > 0) {
          start_job_polling();
        }
      };

      nes_client.onConnect = () => {
        console.log('[WS] Connected');
        state.ws_connected.value = true;
        // Stop polling since we have WebSocket now
        stop_job_polling();
      };

      await nes_client.connect({ reconnect: true, delay: ws_reconnect_delay });

      // Subscribe to queue stats for real-time updates
      await nes_client.subscribe('/jobs/stats', (update) => {
        state.job_queue_stats.value = update;
      });

      console.log('[WS] WebSocket initialized and subscribed to stats');
    } catch (error) {
      console.warn('[WS] WebSocket connection failed, using polling fallback:', error.message);
      nes_client = null;
      state.ws_connected.value = false;
    }
  };

  /**
   * Handle job update from WebSocket.
   * @param {Object} job - Job data
   */
  const handle_job_update = (job) => {
    // Update jobs list
    const index = state.jobs.value.findIndex((j) => j.id === job.id);
    if (index >= 0) {
      state.jobs.value[index] = job;
    } else {
      state.jobs.value.unshift(job);
    }

    // Check for completion callbacks
    const callbacks = job_subscriptions.get(job.id);
    if (callbacks) {
      if (job.status === 'completed') {
        callbacks.on_complete(job);
        unsubscribe_from_job(job.id);
      } else if (job.status === 'failed') {
        callbacks.on_error(job.error || 'Job failed');
        unsubscribe_from_job(job.id);
      }
    }
  };

  /**
   * Subscribe to a specific job's updates via WebSocket.
   * @param {string} job_id - Job ID
   * @param {Function} on_complete - Completion callback
   * @param {Function} on_error - Error callback
   * @returns {Promise<boolean>} True if WebSocket subscription succeeded
   */
  const subscribe_to_job = async (job_id, on_complete, on_error) => {
    // Store callbacks for this job
    job_subscriptions.set(job_id, { on_complete, on_error });

    // If WebSocket is connected, subscribe
    if (nes_client && state.ws_connected.value) {
      try {
        await nes_client.subscribe(`/jobs/${job_id}`, (job) => {
          handle_job_update(job);
        });
        console.log(`[WS] Subscribed to job ${job_id}`);
        return true;
      } catch (error) {
        console.warn(`[WS] Failed to subscribe to job ${job_id}:`, error.message);
      }
    }

    // Fall back to polling
    console.log(`[WS] Using polling fallback for job ${job_id}`);
    poll_job_status(job_id, on_complete, on_error);
    return false;
  };

  /**
   * Unsubscribe from a job's updates.
   * @param {string} job_id - Job ID
   */
  const unsubscribe_from_job = async (job_id) => {
    job_subscriptions.delete(job_id);

    if (nes_client && state.ws_connected.value) {
      try {
        await nes_client.unsubscribe(`/jobs/${job_id}`);
        console.log(`[WS] Unsubscribed from job ${job_id}`);
      } catch (error) {
        // Ignore unsubscribe errors
      }
    }
  };

  /**
   * Poll for job completion status.
   * @param {string} job_id - Job ID
   * @param {Function} on_complete - Completion callback
   * @param {Function} on_error - Error callback
   */
  const poll_job_status = async (job_id, on_complete, on_error) => {
    const poll = async () => {
      try {
        const job = await api.load_job(job_id);

        if (job.status === 'completed') {
          on_complete(job);
        } else if (job.status === 'failed') {
          on_error(job.error || 'Job failed');
        } else {
          // Still running, poll again in 500ms
          setTimeout(poll, 500);
        }
      } catch (error) {
        on_error(error.message);
      }
    };
    poll();
  };

  return {
    load_job_queue,
    start_job_polling,
    stop_job_polling,
    init_web_socket,
    subscribe_to_job,
    unsubscribe_from_job,
    poll_job_status
  };
};

/**
 * Creates import/refresh handlers.
 * @param {Object} state - Application state
 * @param {Object} api - API module
 * @param {Object} job_manager - Job manager
 * @param {Function} load_projects - Projects loader
 * @param {Function} update_url - URL updater
 * @returns {Object} Import/refresh functions
 */
export const create_import_handlers = (state, api, job_manager, load_projects, update_url) => {
  /**
   * Close import modal.
   */
  const close_import_modal = () => {
    state.show_import_modal.value = false;
    state.import_path.value = '';
    state.import_name.value = '';
    state.import_error.value = '';
    state.import_success.value = '';
  };

  /**
   * Import a project.
   */
  const import_project = async () => {
    // Check for read-only mode before attempting import
    if (state.server_read_only.value) {
      state.show_read_only_modal.value = true;
      return;
    }

    if (!state.import_path.value) return;

    state.importing.value = true;
    state.import_error.value = '';
    state.import_success.value = '';

    try {
      const result = await api.import_project(
        state.import_path.value,
        state.import_name.value || null
      );

      if (result.error) {
        state.import_error.value = result.error;
        return;
      }

      state.import_success.value = result.message || 'Project queued for import!';

      // Start polling for job updates
      await job_manager.load_job_queue();
      job_manager.start_job_polling();

      // Close modal after a short delay
      setTimeout(() => {
        close_import_modal();
      }, 1500);

      // Subscribe to job updates
      if (result.job_id) {
        job_manager.subscribe_to_job(
          result.job_id,
          async () => {
            await load_projects();
            await job_manager.load_job_queue();
          },
          async () => {
            await job_manager.load_job_queue();
          }
        );
      }
    } catch (error) {
      state.import_error.value = error.message || 'Failed to import project';
    } finally {
      state.importing.value = false;
    }
  };

  /**
   * Refresh a project.
   * @param {string} project_name - Project name
   * @param {Function} reload_project_info - Function to reload project info
   */
  const refresh_project = async (project_name, reload_project_info) => {
    // Check for read-only mode before attempting refresh
    if (state.server_read_only.value) {
      state.show_read_only_modal.value = true;
      return;
    }

    state.refreshing_project.value = project_name;

    try {
      const result = await api.refresh_project(project_name);

      if (result.error) {
        alert(result.error);
        state.refreshing_project.value = null;
        return;
      }

      // Load job queue
      await job_manager.load_job_queue();

      // Subscribe to job updates
      job_manager.subscribe_to_job(
        result.job_id,
        async () => {
          // Job completed successfully
          state.refreshing_project.value = null;

          // Refresh projects list and job queue
          await load_projects();
          await job_manager.load_job_queue();

          // If this project is selected, reload its info
          if (state.selected_project.value?.name === project_name) {
            await reload_project_info(project_name);
          }
        },
        async (error) => {
          // Job failed
          state.refreshing_project.value = null;
          await job_manager.load_job_queue();
          alert(error || 'Failed to refresh project');
        }
      );
    } catch (error) {
      alert(error.message || 'Failed to refresh project');
      state.refreshing_project.value = null;
    }
  };

  /**
   * Toggle jobs view.
   */
  const toggle_jobs_view = async () => {
    state.show_jobs_view.value = !state.show_jobs_view.value;
    if (state.show_jobs_view.value) {
      // Clear other views when showing jobs
      state.selected_project.value = null;
      state.selected_file.value = null;
      state.selected_function.value = null;
      state.show_call_graph.value = false;
      state.showing_all_functions.value = false;
      state.show_analysis_view.value = false;
      // Refresh job data
      await job_manager.load_job_queue();
      job_manager.start_job_polling();
    }
    update_url();
  };

  return {
    close_import_modal,
    import_project,
    refresh_project,
    toggle_jobs_view
  };
};
