# public/js/modules/ - Frontend JavaScript Modules

This directory contains the modular frontend JavaScript code for the Codebuddy web UI.

## Overview

The frontend is built with Vue.js 3 (Composition API) and uses ES modules for code organization. The modules are imported directly by the browser (no build step required).

## Modules

| Module | Description |
|--------|-------------|
| `state.js` | Reactive state management (all Vue refs) |
| `api.js` | HTTP API client functions |
| `rendering.js` | D3.js graph and flowchart rendering |
| `navigation.js` | URL routing and navigation helpers |
| `jobs.js` | Job queue and WebSocket management |
| `analysis.js` | Analysis dashboard handlers |

## Module Details

### state.js

Creates all reactive state used by the application:

```javascript
import { create_state } from './modules/state.js';

const state = create_state(ref);
// state.projects, state.selected_project, state.call_graph_data, etc.
```

Key state groups:
- **Projects**: `projects`, `selected_project`, `project_info`
- **Navigation**: `selected_file`, `selected_function`, `active_tab`
- **Call Graph**: `call_graph_data`, `call_graph_depth`, `graph_view_type`
- **Flowchart**: `flowchart_data`, `flowchart_container`
- **Analysis**: `analysis_data`, `analysis_tab`, `analysis_detail`
- **Jobs**: `jobs`, `job_queue_stats`

### api.js

HTTP client functions for all API endpoints:

```javascript
import * as api from './modules/api.js';

const projects = await api.load_projects();
const graph = await api.load_call_graph(symbol, project_name, depth);
const analysis = await api.load_analysis_dashboard(project_name);
```

### rendering.js

D3.js renderers for visualizations:

```javascript
import { 
  create_call_graph_renderer,
  create_flowchart_renderer,
  create_inline_graph_renderer,
  create_tree_renderer
} from './modules/rendering.js';

const call_graph_renderer = create_call_graph_renderer(state, d3);
call_graph_renderer.render_graph();
call_graph_renderer.zoom_in();
```

Features:
- Force-directed call graphs
- Hierarchical tree layouts
- Flowchart/control flow diagrams
- Depth-based color coding
- Zoom and pan controls

### navigation.js

URL routing and navigation:

```javascript
import { create_navigation, create_directory_navigation } from './modules/navigation.js';

const navigation = create_navigation(state, handlers);
navigation.update_url();  // Push state to URL
await navigation.parse_url();  // Restore state from URL
```

URL state includes:
- Selected project
- Selected file/function
- Active tab
- Call graph root and depth
- Analysis view state

### jobs.js

Background job management:

```javascript
import { create_job_manager, create_import_handlers } from './modules/jobs.js';

const job_manager = create_job_manager(state, api);
await job_manager.init_web_socket();
job_manager.subscribe_to_job(job_id);
```

Features:
- WebSocket real-time updates
- Fallback polling when WebSocket unavailable
- Job queue statistics

### analysis.js

Analysis dashboard handlers:

```javascript
import { create_analysis_handlers, create_formatters } from './modules/analysis.js';

const analysis_handlers = create_analysis_handlers(state, api, update_url);
await analysis_handlers.load_analysis_dashboard();
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                       app.js                            │
│              (Vue.js setup & orchestration)             │
└─────────────────────────────────────────────────────────┘
         │           │           │           │
    ┌────┴────┐ ┌────┴────┐ ┌────┴────┐ ┌────┴────┐
    │ state   │ │  api    │ │rendering│ │navigation│
    │         │ │         │ │         │ │         │
    └─────────┘ └─────────┘ └─────────┘ └─────────┘
                     │           │
                ┌────┴────┐ ┌────┴────┐
                │  jobs   │ │analysis │
                └─────────┘ └─────────┘
```

## Naming Conventions

- All functions use `snake_case` (project convention)
- Vue template bindings use `camelCase` (Vue convention)
- The main `app.js` maps snake_case to camelCase for Vue compatibility

## Browser Requirements

- ES Modules support (all modern browsers)
- D3.js v7 (loaded from CDN)
- Vue.js 3 (loaded from CDN)
