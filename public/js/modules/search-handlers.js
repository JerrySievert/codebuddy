/**
 * Search handlers module.
 * Contains functions for searching and autocomplete functionality.
 */

/**
 * Creates global search handlers for the header search.
 * @param {Object} state - Application state
 * @param {Object} api - API module
 * @param {Function} update_url - Function to update URL
 * @returns {Object} Global search functions
 */
export const create_global_search_handlers = (state, api, update_url) => {
  // Debounce timer for global search
  let global_search_debounce_timer = null;

  /**
   * Handle global search input for autocomplete.
   */
  const on_global_search_input = () => {
    if (global_search_debounce_timer) {
      clearTimeout(global_search_debounce_timer);
    }

    if (
      !state.global_search_query.value ||
      state.global_search_query.value.length < 2
    ) {
      state.global_search_suggestions.value = [];
      state.show_global_autocomplete.value = false;
      return;
    }

    global_search_debounce_timer = setTimeout(async () => {
      try {
        // Search across ALL projects (no project filter)
        state.global_search_suggestions.value = await api.search_entities(
          state.global_search_query.value,
          null,
          10
        );
        state.show_global_autocomplete.value =
          state.global_search_suggestions.value.length > 0;
        state.global_autocomplete_index.value = -1;
      } catch (error) {
        console.error('Failed to fetch global suggestions:', error);
        state.global_search_suggestions.value = [];
        state.show_global_autocomplete.value = false;
      }
    }, 200);
  };

  /**
   * Navigate global autocomplete selection.
   * @param {number} direction - Direction (1 or -1)
   */
  const navigate_global_autocomplete = (direction) => {
    if (
      !state.show_global_autocomplete.value ||
      state.global_search_suggestions.value.length === 0
    )
      return;

    state.global_autocomplete_index.value += direction;

    // Allow index up to suggestions.length (the "see all results" item)
    const max_index = state.global_search_suggestions.value.length;
    if (state.global_autocomplete_index.value < 0) {
      state.global_autocomplete_index.value = max_index;
    } else if (state.global_autocomplete_index.value > max_index) {
      state.global_autocomplete_index.value = 0;
    }
  };

  /**
   * Select global autocomplete item on enter, or execute full search.
   */
  const select_global_autocomplete_item = () => {
    // Cancel any pending debounce timer to prevent it from
    // reopening autocomplete after we execute the search
    if (global_search_debounce_timer) {
      clearTimeout(global_search_debounce_timer);
      global_search_debounce_timer = null;
    }

    // Check if user has highlighted a specific suggestion
    const has_selection =
      state.global_autocomplete_index.value >= 0 &&
      state.global_autocomplete_index.value <
        state.global_search_suggestions.value.length;

    if (has_selection) {
      // User selected a specific suggestion - navigate to it
      const fn =
        state.global_search_suggestions.value[
          state.global_autocomplete_index.value
        ];
      select_global_suggestion(fn);
      return fn;
    } else {
      // User pressed enter without selecting a specific item
      // Close autocomplete and show full search results page
      state.show_global_autocomplete.value = false;
      state.global_search_suggestions.value = [];
      state.global_autocomplete_index.value = -1;
      execute_global_search();
    }
  };

  /**
   * Execute global search and show results page.
   */
  const execute_global_search = async () => {
    if (!state.global_search_query.value) return;

    state.show_global_autocomplete.value = false;
    state.global_search_suggestions.value = [];
    state.global_autocomplete_index.value = -1;
    state.global_search_loading.value = true;
    state.global_search_page.value = 1;

    // Clear other views and show search results
    state.show_global_search_results.value = true;
    state.selected_project.value = null;
    state.selected_file.value = null;
    state.selected_function.value = null;
    state.show_call_graph.value = false;
    state.showing_all_functions.value = false;
    state.show_jobs_view.value = false;
    state.show_analysis_view.value = false;

    try {
      const results = await api.search_entities(
        state.global_search_query.value,
        null,
        state.GLOBAL_SEARCH_PAGE_SIZE + 1 // Fetch one extra to check if there are more
      );
      state.global_search_has_more.value =
        results.length > state.GLOBAL_SEARCH_PAGE_SIZE;
      state.global_search_results.value = results.slice(
        0,
        state.GLOBAL_SEARCH_PAGE_SIZE
      );
    } catch (error) {
      console.error('Failed to execute global search:', error);
      state.global_search_results.value = [];
      state.global_search_has_more.value = false;
    } finally {
      state.global_search_loading.value = false;
    }

    update_url();
  };

  /**
   * Load more global search results.
   */
  const load_more_global_results = async () => {
    if (
      state.global_search_loading.value ||
      !state.global_search_has_more.value
    )
      return;

    state.global_search_loading.value = true;
    state.global_search_page.value += 1;

    try {
      const offset =
        state.global_search_page.value * state.GLOBAL_SEARCH_PAGE_SIZE;
      const results = await api.search_entities(
        state.global_search_query.value,
        null,
        state.GLOBAL_SEARCH_PAGE_SIZE + 1,
        offset
      );
      state.global_search_has_more.value =
        results.length > state.GLOBAL_SEARCH_PAGE_SIZE;
      state.global_search_results.value = [
        ...state.global_search_results.value,
        ...results.slice(0, state.GLOBAL_SEARCH_PAGE_SIZE)
      ];
    } catch (error) {
      console.error('Failed to load more global results:', error);
    } finally {
      state.global_search_loading.value = false;
    }
  };

  /**
   * Select a suggestion from global autocomplete and navigate to it.
   * @param {Object} fn - Function/entity to navigate to
   */
  const select_global_suggestion = (fn) => {
    state.show_global_autocomplete.value = false;
    state.global_search_suggestions.value = [];
    state.global_autocomplete_index.value = -1;
    // Don't clear the search query so user can see what they searched for

    // Navigate to the function/entity
    // This will be handled by the caller
    return fn;
  };

  /**
   * Close global autocomplete dropdown.
   */
  const close_global_autocomplete = () => {
    state.show_global_autocomplete.value = false;
    state.global_autocomplete_index.value = -1;
  };

  /**
   * Handle global search blur event.
   */
  const on_global_search_blur = () => {
    setTimeout(() => {
      state.show_global_autocomplete.value = false;
    }, 200);
  };

  /**
   * Close global search results view.
   */
  const close_global_search_results = () => {
    state.show_global_search_results.value = false;
    state.global_search_results.value = [];
    state.global_search_query.value = '';
    update_url();
  };

  return {
    on_global_search_input,
    navigate_global_autocomplete,
    select_global_autocomplete_item,
    execute_global_search,
    load_more_global_results,
    select_global_suggestion,
    close_global_autocomplete,
    on_global_search_blur,
    close_global_search_results
  };
};

/**
 * Creates search handlers.
 * @param {Object} state - Application state
 * @param {Object} api - API module
 * @param {Function} select_function - Function to select a function
 * @returns {Object} Search functions
 */
export const create_search_handlers = (state, api, select_function) => {
  // Debounce timer for search
  let search_debounce_timer = null;

  /**
   * Search for functions/entities.
   */
  const search_functions = async () => {
    if (!state.search_query.value) return;

    state.has_searched.value = true;
    state.show_autocomplete.value = false;

    try {
      state.search_results.value = await api.search_entities(
        state.search_query.value,
        state.selected_project.value?.name,
        50
      );
    } catch (error) {
      console.error('Failed to search entities:', error);
      state.search_results.value = [];
    }
  };

  /**
   * Handle search input for autocomplete.
   */
  const on_search_input = () => {
    if (search_debounce_timer) {
      clearTimeout(search_debounce_timer);
    }

    if (!state.search_query.value || state.search_query.value.length < 2) {
      state.search_suggestions.value = [];
      state.show_autocomplete.value = false;
      return;
    }

    search_debounce_timer = setTimeout(async () => {
      try {
        state.search_suggestions.value = await api.search_entities(
          state.search_query.value,
          state.selected_project.value?.name,
          10
        );
        state.show_autocomplete.value =
          state.search_suggestions.value.length > 0;
        state.autocomplete_index.value = -1;
      } catch (error) {
        console.error('Failed to fetch suggestions:', error);
        state.search_suggestions.value = [];
        state.show_autocomplete.value = false;
      }
    }, 200);
  };

  /**
   * Navigate autocomplete selection.
   * @param {number} direction - Direction (1 or -1)
   */
  const navigate_autocomplete = (direction) => {
    if (
      !state.show_autocomplete.value ||
      state.search_suggestions.value.length === 0
    )
      return;

    state.autocomplete_index.value += direction;

    if (state.autocomplete_index.value < 0) {
      state.autocomplete_index.value =
        state.search_suggestions.value.length - 1;
    } else if (
      state.autocomplete_index.value >= state.search_suggestions.value.length
    ) {
      state.autocomplete_index.value = 0;
    }
  };

  /**
   * Select autocomplete item on enter.
   */
  const select_autocomplete_item = () => {
    if (
      state.autocomplete_index.value >= 0 &&
      state.autocomplete_index.value < state.search_suggestions.value.length
    ) {
      select_suggestion(
        state.search_suggestions.value[state.autocomplete_index.value]
      );
    } else {
      search_functions();
    }
  };

  /**
   * Select a suggestion from autocomplete.
   * @param {Object} fn - Function/entity to select
   */
  const select_suggestion = (fn) => {
    state.show_autocomplete.value = false;
    state.search_suggestions.value = [];
    state.autocomplete_index.value = -1;
    select_function(fn);
  };

  /**
   * Close autocomplete dropdown.
   */
  const close_autocomplete = () => {
    state.show_autocomplete.value = false;
    state.autocomplete_index.value = -1;
  };

  /**
   * Handle search blur event.
   */
  const on_search_blur = () => {
    setTimeout(() => {
      state.show_autocomplete.value = false;
    }, 200);
  };

  return {
    search_functions,
    on_search_input,
    navigate_autocomplete,
    select_autocomplete_item,
    select_suggestion,
    close_autocomplete,
    on_search_blur
  };
};
