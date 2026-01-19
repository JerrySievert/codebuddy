/**
 * Search handlers module.
 * Contains functions for searching and autocomplete functionality.
 */

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
