import sqlite3
import json
import os

DB_PATH = r"D:\WorkSpace\CAP2\ReadEase-Backend\.codegraph\codegraph.db"
OUTPUT_PATH = r"D:\WorkSpace\CAP2\codegraph-visualizer.html"

def get_html_template(json_data):
    return f"""<!DOCTYPE html>
<html lang="en" class="h-full">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Codebase Knowledge Graph Visualizer</title>
    <!-- Tailwind CSS CDN -->
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {{
            theme: {{
                extend: {{
                    colors: {{
                        slate: {{
                            850: '#1e293b',
                            950: '#020617',
                        }}
                    }}
                }}
            }}
        }}
    </script>
    <!-- vis-network CDN -->
    <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
    <!-- Custom Scrollbars & overrides -->
    <style>
        ::-webkit-scrollbar {{
            width: 6px;
            height: 6px;
        }}
        ::-webkit-scrollbar-track {{
            background: #0f172a;
        }}
        ::-webkit-scrollbar-thumb {{
            background: #334155;
            border-radius: 3px;
        }}
        ::-webkit-scrollbar-thumb:hover {{
            background: #475569;
        }}
        .custom-shadow {{
            box-shadow: 0 4px 20px 0 rgba(0, 0, 0, 0.5);
        }}
        #network-container {{
            width: 100%;
            height: 100%;
            background-color: #020617;
        }}
        /* Vis-navigation controls custom theme */
        div.vis-network div.vis-navigation div.vis-button {{
            background-color: #1e293b !important;
            border: 1px solid #475569 !important;
            color: #f8fafc !important;
            border-radius: 6px !important;
            box-shadow: 0 2px 4px rgba(0,0,0,0.5) !important;
        }}
        div.vis-network div.vis-navigation div.vis-button:hover {{
            background-color: #334155 !important;
        }}
    </style>
</head>
<body class="h-full bg-slate-950 text-slate-100 flex flex-col font-sans overflow-hidden">

    <!-- Top Navigation Header -->
    <header class="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between z-10 shrink-0">
        <div class="flex items-center gap-3">
            <svg class="w-6 h-6 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 3.055A9.003 9.003 0 1020.945 13H11V3.055z"></path>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"></path>
            </svg>
            <div>
                <h1 class="text-lg font-bold tracking-tight text-white">ReadEase Code Knowledge Graph</h1>
                <p class="text-xs text-slate-400">Database: <code class="bg-slate-850 px-1 py-0.5 rounded text-indigo-300">codegraph.db</code></p>
            </div>
        </div>
        <div class="flex items-center gap-6 text-sm">
            <div class="flex items-center gap-4 bg-slate-950/60 px-4 py-2 border border-slate-800 rounded-lg">
                <div class="flex flex-col text-right">
                    <span class="text-[10px] uppercase text-slate-500 font-semibold">Active View</span>
                    <span id="active-view-stat" class="font-semibold text-indigo-400">Symbol View</span>
                </div>
                <div class="h-6 w-px bg-slate-800"></div>
                <div class="flex flex-col">
                    <span class="text-[10px] uppercase text-slate-500 font-semibold">Nodes</span>
                    <span id="stat-node-count" class="font-bold text-white">0</span>
                </div>
                <div class="h-6 w-px bg-slate-800"></div>
                <div class="flex flex-col">
                    <span class="text-[10px] uppercase text-slate-500 font-semibold">Edges</span>
                    <span id="stat-edge-count" class="font-bold text-white">0</span>
                </div>
            </div>
        </div>
    </header>

    <!-- Main Container -->
    <div class="flex flex-1 overflow-hidden relative">

        <!-- LEFT SIDEBAR: Search, Filters & Controls -->
        <aside class="w-80 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 overflow-y-auto">
            
            <!-- View Toggle -->
            <div class="p-4 border-b border-slate-800">
                <label class="block text-xs uppercase text-slate-400 font-bold mb-2">Visualization Mode</label>
                <div class="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-lg border border-slate-855">
                    <button id="btn-view-file" onclick="setViewMode('file')" class="py-1.5 px-3 rounded-md text-xs font-semibold transition-all text-slate-400 hover:text-white">
                        File-to-File
                    </button>
                    <button id="btn-view-symbol" onclick="setViewMode('symbol')" class="py-1.5 px-3 rounded-md text-xs font-semibold transition-all bg-indigo-650 text-white font-bold bg-indigo-600 shadow">
                        Symbol-to-Symbol
                    </button>
                </div>
            </div>

            <!-- Search Bar -->
            <div class="p-4 border-b border-slate-800 relative">
                <label for="search-input" class="block text-xs uppercase text-slate-400 font-bold mb-2">Search Node</label>
                <div class="relative">
                    <input type="text" id="search-input" oninput="handleSearch(event)" placeholder="Search by name..." autocomplete="off"
                           class="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 pl-3 pr-10 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors">
                    <button id="search-clear-btn" onclick="clearSearch()" class="hidden absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>
                <!-- Autocomplete Dropdown -->
                <div id="search-suggestions" class="hidden absolute left-4 right-4 mt-1 bg-slate-900 border border-slate-800 rounded-lg custom-shadow max-h-60 overflow-y-auto z-20">
                    <!-- Dynamic List -->
                </div>
            </div>

            <!-- Node Type Filters (Symbol View Only) -->
            <div id="filter-node-section" class="p-4 border-b border-slate-800">
                <div class="flex items-center justify-between mb-2">
                    <label class="block text-xs uppercase text-slate-400 font-bold">Filter Node Types</label>
                    <button onclick="toggleAllNodeFilters(true)" class="text-[10px] text-indigo-400 hover:text-indigo-300">Select All</button>
                </div>
                <div class="space-y-2 mt-2">
                    <label class="flex items-center gap-2.5 text-sm cursor-pointer hover:bg-slate-850/30 p-1.5 rounded transition-colors">
                        <input type="checkbox" id="filter-class" checked onchange="handleNodeFilterChange('class', this.checked)" class="rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900">
                        <span class="w-3 h-3 rounded-full bg-emerald-500"></span>
                        <span class="text-slate-300">Classes</span>
                    </label>
                    <label class="flex items-center gap-2.5 text-sm cursor-pointer hover:bg-slate-850/30 p-1.5 rounded transition-colors">
                        <input type="checkbox" id="filter-function" checked onchange="handleNodeFilterChange('function', this.checked)" class="rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900">
                        <span class="w-3 h-3 rounded-full bg-blue-500"></span>
                        <span class="text-slate-300">Functions</span>
                    </label>
                    <label class="flex items-center gap-2.5 text-sm cursor-pointer hover:bg-slate-850/30 p-1.5 rounded transition-colors">
                        <input type="checkbox" id="filter-method" checked onchange="handleNodeFilterChange('method', this.checked)" class="rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900">
                        <span class="w-3 h-3 rounded-full bg-violet-500"></span>
                        <span class="text-slate-300">Methods</span>
                    </label>
                    <label class="flex items-center gap-2.5 text-sm cursor-pointer hover:bg-slate-850/30 p-1.5 rounded transition-colors">
                        <input type="checkbox" id="filter-constant" checked onchange="handleNodeFilterChange('constant', this.checked)" class="rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900">
                        <span class="w-3 h-3 rounded-full bg-amber-500"></span>
                        <span class="text-slate-300">Constants</span>
                    </label>
                    <label class="flex items-center gap-2.5 text-sm cursor-pointer hover:bg-slate-850/30 p-1.5 rounded transition-colors">
                        <input type="checkbox" id="filter-variable" checked onchange="handleNodeFilterChange('variable', this.checked)" class="rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900">
                        <span class="w-3 h-3 rounded-full bg-rose-500"></span>
                        <span class="text-slate-300">Variables</span>
                    </label>
                    <label class="flex items-center gap-2.5 text-sm cursor-pointer hover:bg-slate-850/30 p-1.5 rounded transition-colors">
                        <input type="checkbox" id="filter-import" checked onchange="handleNodeFilterChange('import', this.checked)" class="rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900">
                        <span class="w-3 h-3 rounded-md bg-indigo-550 border border-indigo-400 rotate-45 transform scale-75" style="background-color: #4f46e5;"></span>
                        <span class="text-slate-300">Imports</span>
                    </label>
                </div>
            </div>

            <!-- Edge Type Filters (Symbol View Only) -->
            <div id="filter-edge-section" class="p-4 border-b border-slate-800">
                <div class="flex items-center justify-between mb-2">
                    <label class="block text-xs uppercase text-slate-400 font-bold">Filter Edge Types</label>
                    <button onclick="toggleAllEdgeFilters(true)" class="text-[10px] text-indigo-400 hover:text-indigo-300">Select All</button>
                </div>
                <div class="space-y-2 mt-2">
                    <label class="flex items-center gap-2.5 text-sm cursor-pointer hover:bg-slate-850/30 p-1.5 rounded transition-colors">
                        <input type="checkbox" id="filter-edge-calls" checked onchange="handleEdgeFilterChange('calls', this.checked)" class="rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900">
                        <span class="w-6 h-0.5 bg-blue-500 inline-block"></span>
                        <span class="text-slate-300 text-xs">calls</span>
                    </label>
                    <label class="flex items-center gap-2.5 text-sm cursor-pointer hover:bg-slate-850/30 p-1.5 rounded transition-colors">
                        <input type="checkbox" id="filter-edge-instantiates" checked onchange="handleEdgeFilterChange('instantiates', this.checked)" class="rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900">
                        <span class="w-6 h-0.5 bg-emerald-500 inline-block"></span>
                        <span class="text-slate-300 text-xs">instantiates</span>
                    </label>
                    <label class="flex items-center gap-2.5 text-sm cursor-pointer hover:bg-slate-850/30 p-1.5 rounded transition-colors">
                        <input type="checkbox" id="filter-edge-imports" checked onchange="handleEdgeFilterChange('imports', this.checked)" class="rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900">
                        <span class="w-6 h-0.5 bg-purple-500 inline-block"></span>
                        <span class="text-slate-300 text-xs">imports</span>
                    </label>
                    <label class="flex items-center gap-2.5 text-sm cursor-pointer hover:bg-slate-850/30 p-1.5 rounded transition-colors">
                        <input type="checkbox" id="filter-edge-contains" checked onchange="handleEdgeFilterChange('contains', this.checked)" class="rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900">
                        <span class="w-6 h-0.5 bg-slate-500 border-t border-dashed inline-block" style="border-top: 2px dashed #64748b;"></span>
                        <span class="text-slate-300 text-xs">contains</span>
                    </label>
                </div>
            </div>

            <!-- Physics Tuning -->
            <div class="p-4">
                <label class="block text-xs uppercase text-slate-400 font-bold mb-2">Physics Controls</label>
                <div class="space-y-3 mt-2">
                    <label class="flex items-center gap-2.5 text-sm cursor-pointer">
                        <input type="checkbox" id="physics-enable" checked onchange="handlePhysicsToggle(this.checked)" class="rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900">
                        <span class="text-slate-300 text-xs">Enable Physics Simulation</span>
                    </label>
                    <div class="space-y-1">
                        <label for="physics-solver" class="text-slate-400 text-[10px] uppercase font-semibold">Solver Algorithm</label>
                        <select id="physics-solver" onchange="handleSolverChange(this.value)" class="w-full bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded p-1.5 focus:outline-none focus:border-indigo-500">
                            <option value="barnesHut">Barnes-Hut (Fast, Good for large graphs)</option>
                            <option value="forceAtlas2Based">ForceAtlas2 (Clustered, Clean separation)</option>
                            <option value="repulsion">Repulsion (Uniform distance)</option>
                        </select>
                    </div>
                    <div class="space-y-1">
                        <div class="flex justify-between text-xs">
                            <span class="text-slate-400 text-[10px] uppercase font-semibold">Node Spacing</span>
                            <span id="spacing-val" class="text-indigo-400 font-semibold text-[10px]">200</span>
                        </div>
                        <input type="range" id="physics-spacing" min="50" max="600" value="200" oninput="handlePhysicsSpacing(this.value)" class="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500">
                    </div>
                    <button onclick="triggerRestabilize()" class="w-full bg-slate-800 hover:bg-slate-750 border border-slate-700 py-1.5 rounded-lg text-xs font-semibold hover:text-white transition-colors">
                        Re-stabilize Layout
                    </button>
                </div>
            </div>
        </aside>

        <!-- CENTER: Vis-Network Canvas -->
        <main class="flex-1 h-full relative overflow-hidden bg-slate-950">
            <!-- Canvas Container -->
            <div id="network-container"></div>

            <!-- Floating Overlay Options -->
            <div class="absolute bottom-4 left-4 flex gap-2">
                <button onclick="zoomToFit()" title="Fit Visualizer View" class="p-2.5 bg-slate-900 border border-slate-800 hover:border-slate-600 rounded-lg text-slate-400 hover:text-white transition-all shadow-md">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5"></path></svg>
                </button>
                <div id="physics-spinner" class="flex items-center gap-2 px-3 py-1.5 bg-slate-900/90 border border-slate-800 rounded-lg text-xs text-slate-400 shadow-md">
                    <span class="relative flex h-2 w-2">
                        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                        <span class="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                    </span>
                    <span id="physics-status-text">Simulating...</span>
                </div>
            </div>
        </main>

        <!-- RIGHT SIDEBAR: Details Info Panel -->
        <aside class="w-96 bg-slate-900 border-l border-slate-800 flex flex-col shrink-0 overflow-y-auto" id="details-panel">
            <div class="p-6 flex flex-col items-center justify-center text-center h-full text-slate-500">
                <svg class="w-12 h-12 text-slate-700 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                <h3 class="text-sm font-semibold text-slate-400">No Node or Edge Selected</h3>
                <p class="text-xs mt-1 max-w-xs">Select any item in the knowledge graph canvas to view structural details, signatures, and dependencies.</p>
            </div>
        </aside>

    </div>

    <!-- Embedded Data Payload -->
    <script id="code-graph-data" type="application/json">
{json_data}
    </script>

    <!-- Main JavaScript Logic -->
    <script>
        // Parse the raw JSON payload
        const DATA = JSON.parse(document.getElementById('code-graph-data').textContent);

        // State variables
        let currentView = 'symbol'; // 'file' or 'symbol'
        let network = null;
        
        // Data sets
        let symbolNodesDataSet = null;
        let symbolEdgesDataSet = null;
        let symbolNodesView = null;
        let symbolEdgesView = null;

        let fileNodesDataSet = null;
        let fileEdgesDataSet = null;
        let fileNodesView = null;
        let fileEdgesView = null;

        // Active filters
        const activeNodeFilters = {{
            'class': true,
            'function': true,
            'method': true,
            'constant': true,
            'variable': true,
            'import': true
        }};

        const activeEdgeFilters = {{
            'calls': true,
            'instantiates': true,
            'imports': true,
            'contains': true
        }};

        // Styling definitions
        const KIND_STYLES = {{
            'file': {{ color: {{ background: '#1e293b', border: '#475569', highlight: {{ background: '#334155', border: '#94a3b8' }} }}, shape: 'box', font: {{ color: '#f8fafc', size: 12 }} }},
            'class': {{ color: {{ background: '#064e3b', border: '#059669', highlight: {{ background: '#047857', border: '#34d399' }} }}, shape: 'dot', size: 25 }},
            'function': {{ color: {{ background: '#172554', border: '#2563eb', highlight: {{ background: '#1d4ed8', border: '#60a5fa' }} }}, shape: 'dot', size: 20 }},
            'method': {{ color: {{ background: '#3b0764', border: '#7c3aed', highlight: {{ background: '#6d28d9', border: '#a78bfa' }} }}, shape: 'dot', size: 18 }},
            'constant': {{ color: {{ background: '#78350f', border: '#d97706', highlight: {{ background: '#b45309', border: '#fbbf24' }} }}, shape: 'dot', size: 14 }},
            'variable': {{ color: {{ background: '#4c0519', border: '#e11d48', highlight: {{ background: '#be123c', border: '#fda4af' }} }}, shape: 'dot', size: 12 }},
            'import': {{ color: {{ background: '#1e1b4b', border: '#4f46e5', highlight: {{ background: '#4338ca', border: '#818cf8' }} }}, shape: 'diamond', size: 11 }}
        }};

        const EDGE_STYLES = {{
            'calls': {{ color: '#3b82f6', dashes: false, arrows: 'to' }},
            'instantiates': {{ color: '#10b981', dashes: false, arrows: 'to' }},
            'imports': {{ color: '#8b5cf6', dashes: false, arrows: 'to' }},
            'contains': {{ color: '#64748b', dashes: true, arrows: '' }}
        }};

        // Initialize Datasets
        function initDataSets() {{
            // Process Symbol View Nodes & Edges
            const sNodes = DATA.symbolNodes.map(node => ({{
                ...node,
                label: node.name,
                title: `${{node.kind}}: ${{node.name}}`,
                ...KIND_STYLES[node.kind]
            }}));

            const sEdges = DATA.symbolEdges.map(edge => ({{
                ...edge,
                from: edge.source,
                to: edge.target,
                title: edge.kind,
                ...EDGE_STYLES[edge.kind]
            }}));

            symbolNodesDataSet = new vis.DataSet(sNodes);
            symbolEdgesDataSet = new vis.DataSet(sEdges);

            // Filtered Views
            symbolNodesView = new vis.DataView(symbolNodesDataSet, {{
                filter: function (node) {{
                    return activeNodeFilters[node.kind] !== false;
                }}
            }});

            symbolEdgesView = new vis.DataView(symbolEdgesDataSet, {{
                filter: function (edge) {{
                    if (activeEdgeFilters[edge.kind] === false) return false;
                    return symbolNodesView.get(edge.from) !== null && symbolNodesView.get(edge.to) !== null;
                }}
            }});

            // Process File View Nodes & Edges
            const fNodes = DATA.fileNodes.map(node => ({{
                ...node,
                label: node.name,
                title: `file: ${{node.name}}`,
                ...KIND_STYLES['file']
            }}));

            const fEdges = DATA.fileEdges.map(edge => ({{
                ...edge,
                title: `${{edge.value}} dependencies`,
                color: {{ color: '#6366f1', highlight: '#818cf8', hover: '#818cf8' }},
                arrows: 'to',
                smooth: {{ type: 'continuous' }}
            }}));

            fileNodesDataSet = new vis.DataSet(fNodes);
            fileEdgesDataSet = new vis.DataSet(fEdges);

            fileNodesView = new vis.DataView(fileNodesDataSet, {{
                filter: function (node) {{ return true; }}
            }});

            fileEdgesView = new vis.DataView(fileEdgesDataSet, {{
                filter: function (edge) {{ return true; }}
            }});
        }}

        // Setup Network options
        function getNetworkOptions() {{
            const enablePhysics = document.getElementById('physics-enable').checked;
            const solver = document.getElementById('physics-solver').value;
            const spacing = parseInt(document.getElementById('physics-spacing').value);

            const options = {{
                nodes: {{
                    borderWidth: 2,
                    shadow: {{
                        enabled: true,
                        color: 'rgba(0,0,0,0.5)',
                        size: 3,
                        x: 1,
                        y: 1
                    }},
                    font: {{
                        size: 11,
                        color: '#cbd5e1'
                    }}
                }},
                edges: {{
                    shadow: {{
                        enabled: true,
                        color: 'rgba(0,0,0,0.3)',
                        size: 2,
                        x: 1,
                        y: 1
                    }},
                    hoverWidth: 1.5,
                    selectionWidth: 2
                }},
                interaction: {{
                    hover: true,
                    selectConnectedEdges: false,
                    tooltipDelay: 300,
                    navigationButtons: true
                }},
                physics: {{
                    enabled: enablePhysics,
                    solver: solver,
                    stabilization: {{
                        enabled: true,
                        iterations: 1000,
                        updateInterval: 100
                    }},
                    barnesHut: {{
                        gravitationalConstant: -20000 * (spacing / 200),
                        centralGravity: 0.3,
                        springLength: spacing,
                        springConstant: 0.04,
                        damping: 0.09,
                        avoidOverlap: 1
                    }},
                    forceAtlas2Based: {{
                        gravitationalConstant: -100 * (spacing / 200),
                        centralGravity: 0.01,
                        springLength: spacing,
                        springConstant: 0.08,
                        damping: 0.4,
                        avoidOverlap: 1
                    }},
                    repulsion: {{
                        centralGravity: 0.2,
                        springLength: spacing,
                        springConstant: 0.05,
                        nodeDistance: spacing,
                        damping: 0.09
                    }}
                }}
            }};

            return options;
        }}

        // Draw Network
        function drawNetwork() {{
            if (network !== null) {{
                network.destroy();
                network = null;
            }}

            const container = document.getElementById('network-container');
            let data = null;

            if (currentView === 'symbol') {{
                data = {{
                    nodes: symbolNodesView,
                    edges: symbolEdgesView
                }};
            }} else {{
                data = {{
                    nodes: fileNodesView,
                    edges: fileEdgesView
                }};
            }}

            const options = getNetworkOptions();
            
            // Show status loading
            const spinner = document.getElementById('physics-spinner');
            const statusText = document.getElementById('physics-status-text');
            spinner.classList.remove('hidden');
            statusText.innerText = "Initializing Layout...";

            network = new vis.Network(container, data, options);

            // Register Event Handlers
            network.on("selectNode", function(params) {{
                handleNodeSelection(params.nodes[0]);
            }});

            network.on("deselectNode", function(params) {{
                if (params.edges.length > 0 && network.getSelectedEdges().length > 0) {{
                    handleEdgeSelection(network.getSelectedEdges()[0]);
                }} else {{
                    clearDetailsPanel();
                }}
            }});

            network.on("selectEdge", function(params) {{
                // Only trigger if no node is selected
                if (params.nodes.length === 0) {{
                    handleEdgeSelection(params.edges[0]);
                }}
            }});

            network.on("deselectEdge", function(params) {{
                if (network.getSelectedNodes().length > 0) {{
                    handleNodeSelection(network.getSelectedNodes()[0]);
                }} else {{
                    clearDetailsPanel();
                }}
            }});

            network.on("stabilizationProgress", function(params) {{
                statusText.innerText = `Stabilizing... ${{Math.round((params.iterations / params.total) * 100)}}%`;
            }});

            network.on("stabilizationIterationsDone", function() {{
                statusText.innerText = "Stabilized";
                setTimeout(() => {{
                    if (statusText.innerText === "Stabilized") {{
                        spinner.classList.add('hidden');
                    }}
                }}, 2000);
            }});

            network.on("startStabilizing", function() {{
                spinner.classList.remove('hidden');
                statusText.innerText = "Simulating physics...";
            }});

            network.on("stabilized", function() {{
                statusText.innerText = "Stabilized";
                setTimeout(() => {{
                    if (statusText.innerText === "Stabilized") {{
                        spinner.classList.add('hidden');
                    }}
                }}, 2000);
            }});

            updateStats();
        }}

        // Switch View Mode
        function setViewMode(mode) {{
            if (mode === currentView) return;
            currentView = mode;

            // UI updates
            const btnFile = document.getElementById('btn-view-file');
            const btnSymbol = document.getElementById('btn-view-symbol');
            const statText = document.getElementById('active-view-stat');
            
            const filterNodeSec = document.getElementById('filter-node-section');
            const filterEdgeSec = document.getElementById('filter-edge-section');

            if (currentView === 'file') {{
                btnFile.className = "py-1.5 px-3 rounded-md text-xs font-semibold transition-all bg-indigo-650 text-white font-bold bg-indigo-600 shadow";
                btnSymbol.className = "py-1.5 px-3 rounded-md text-xs font-semibold transition-all text-slate-400 hover:text-white";
                statText.innerText = "File View";
                
                // Hide symbol filters
                filterNodeSec.classList.add('hidden');
                filterEdgeSec.classList.add('hidden');
            }} else {{
                btnSymbol.className = "py-1.5 px-3 rounded-md text-xs font-semibold transition-all bg-indigo-650 text-white font-bold bg-indigo-600 shadow";
                btnFile.className = "py-1.5 px-3 rounded-md text-xs font-semibold transition-all text-slate-400 hover:text-white";
                statText.innerText = "Symbol View";

                // Show symbol filters
                filterNodeSec.classList.remove('hidden');
                filterEdgeSec.classList.remove('hidden');
            }}

            clearSearch();
            clearDetailsPanel();
            drawNetwork();
        }}

        // Dynamic stats update
        function updateStats() {{
            const nodeCount = currentView === 'symbol' ? symbolNodesView.length : fileNodesView.length;
            const edgeCount = currentView === 'symbol' ? symbolEdgesView.length : fileEdgesView.length;
            
            document.getElementById('stat-node-count').innerText = nodeCount;
            document.getElementById('stat-edge-count').innerText = edgeCount;
        }}

        // Handle Filters Changes
        function handleNodeFilterChange(kind, checked) {{
            activeNodeFilters[kind] = checked;
            symbolNodesView.refresh();
            symbolEdgesView.refresh();
            updateStats();
        }}

        function toggleAllNodeFilters(checked) {{
            Object.keys(activeNodeFilters).forEach(kind => {{
                activeNodeFilters[kind] = checked;
                const chk = document.getElementById(`filter-${{kind}}`);
                if (chk) chk.checked = checked;
            }});
            symbolNodesView.refresh();
            symbolEdgesView.refresh();
            updateStats();
        }}

        function handleEdgeFilterChange(kind, checked) {{
            activeEdgeFilters[kind] = checked;
            symbolEdgesView.refresh();
            updateStats();
        }}

        function toggleAllEdgeFilters(checked) {{
            Object.keys(activeEdgeFilters).forEach(kind => {{
                activeEdgeFilters[kind] = checked;
                const chk = document.getElementById(`filter-edge-${{kind}}`);
                if (chk) chk.checked = checked;
            }});
            symbolEdgesView.refresh();
            updateStats();
        }}

        // Physics controls
        function handlePhysicsToggle(checked) {{
            network.setOptions({{ physics: {{ enabled: checked }} }});
        }}

        function handleSolverChange(solver) {{
            network.setOptions(getNetworkOptions());
            triggerRestabilize();
        }}

        function handlePhysicsSpacing(val) {{
            document.getElementById('spacing-val').innerText = val;
            network.setOptions(getNetworkOptions());
        }}

        function triggerRestabilize() {{
            const spinner = document.getElementById('physics-spinner');
            const statusText = document.getElementById('physics-status-text');
            spinner.classList.remove('hidden');
            statusText.innerText = "Simulating physics...";
            network.stabilize();
        }}

        // Zoom to Fit
        function zoomToFit() {{
            if (network) network.fit({{ animation: true }});
        }}

        // Handle search and suggestions
        function handleSearch(e) {{
            const query = e.target.value.trim().toLowerCase();
            const suggestions = document.getElementById('search-suggestions');
            const clearBtn = document.getElementById('search-clear-btn');

            if (!query) {{
                suggestions.classList.add('hidden');
                clearBtn.classList.add('hidden');
                return;
            }}

            clearBtn.classList.remove('hidden');

            const currentNodes = currentView === 'symbol' ? symbolNodesView.get() : fileNodesView.get();
            const matches = currentNodes.filter(n => n.name.toLowerCase().includes(query)).slice(0, 15);

            if (matches.length === 0) {{
                suggestions.innerHTML = '<div class="p-3 text-xs text-slate-500 italic">No nodes match your search.</div>';
            }} else {{
                suggestions.innerHTML = matches.map(node => {{
                    let dotColor = 'bg-slate-400';
                    if (node.kind === 'class') dotColor = 'bg-emerald-500';
                    if (node.kind === 'function') dotColor = 'bg-blue-500';
                    if (node.kind === 'method') dotColor = 'bg-violet-500';
                    if (node.kind === 'constant') dotColor = 'bg-amber-500';
                    if (node.kind === 'variable') dotColor = 'bg-rose-500';
                    if (node.kind === 'file') dotColor = 'bg-slate-500';

                    return `
                        <div onclick="selectAndFocusNode('${{node.id}}')" class="p-2.5 flex items-center gap-2 hover:bg-slate-800 cursor-pointer text-xs transition-colors border-b border-slate-850 last:border-b-0">
                            <span class="w-2 h-2 rounded-full ${{dotColor}} shrink-0"></span>
                            <div class="flex-1 min-w-0">
                                <p class="text-slate-200 font-bold truncate">${{escapeHtml(node.name)}}</p>
                                <p class="text-[10px] text-slate-500 truncate">${{escapeHtml(node.file_path || '')}}</p>
                            </div>
                            <span class="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-850 text-[10px] uppercase font-bold text-slate-400">${{node.kind}}</span>
                        </div>
                    `;
                }}).join('');
            }}

            suggestions.classList.remove('hidden');
        }}

        function clearSearch() {{
            document.getElementById('search-input').value = '';
            document.getElementById('search-suggestions').classList.add('hidden');
            document.getElementById('search-clear-btn').classList.add('hidden');
        }}

        // Focus & select node
        function selectAndFocusNode(nodeId) {{
            if (!network) return;
            
            // Clear autocomplete suggestion popup
            document.getElementById('search-suggestions').classList.add('hidden');
            
            // Focus on node
            network.selectNodes([nodeId]);
            network.focus(nodeId, {{
                scale: 1.1,
                animation: {{
                    duration: 800,
                    easingFunction: "easeInOutQuad"
                }}
            }});
            
            handleNodeSelection(nodeId);
        }}

        // Click handler to drill-down to a symbol from file view
        function drillDownToSymbol(symbolId) {{
            const node = symbolNodesDataSet.get(symbolId);
            if (!node) return;

            setViewMode('symbol');

            // Make sure filter is checked
            const chk = document.getElementById(`filter-${{node.kind}}`);
            if (chk && !chk.checked) {{
                chk.checked = true;
                activeNodeFilters[node.kind] = true;
                symbolNodesView.refresh();
                symbolEdgesView.refresh();
            }}

            setTimeout(() => {{
                selectAndFocusNode(symbolId);
            }}, 150);
        }}

        // Handle detail Panel Rendering
        function clearDetailsPanel() {{
            document.getElementById('details-panel').innerHTML = `
                <div class="p-6 flex flex-col items-center justify-center text-center h-full text-slate-500">
                    <svg class="w-12 h-12 text-slate-700 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    <h3 class="text-sm font-semibold text-slate-400">No Node or Edge Selected</h3>
                    <p class="text-xs mt-1 max-w-xs">Select any item in the knowledge graph canvas to view structural details, signatures, and dependencies.</p>
                </div>
            `;
        }}

        function handleNodeSelection(nodeId) {{
            let node = null;
            let incoming = [];
            let outgoing = [];

            if (currentView === 'symbol') {{
                node = symbolNodesDataSet.get(nodeId);
                if (!node) return;

                // Incoming and outgoing edges matching the active filters
                const edges = symbolEdgesView.get();
                edges.forEach(e => {{
                    if (e.to === nodeId) incoming.push(symbolNodesDataSet.get(e.from));
                    if (e.from === nodeId) outgoing.push(symbolNodesDataSet.get(e.to));
                }});
            }} else {{
                node = fileNodesDataSet.get(nodeId);
                if (!node) return;

                const edges = fileEdgesView.get();
                edges.forEach(e => {{
                    if (e.to === nodeId) incoming.push(fileNodesDataSet.get(e.from));
                    if (e.from === nodeId) outgoing.push(fileNodesDataSet.get(e.to));
                }});
            }}

            renderNodeDetails(node, incoming, outgoing);
        }}

        function renderNodeDetails(node, incoming, outgoing) {{
            const detailsPanel = document.getElementById('details-panel');
            
            // Format incoming and outgoing lists
            const incomingHtml = incoming.length === 0 
                ? '<p class="text-xs text-slate-500 italic">None</p>'
                : incoming.map(n => n ? `
                    <div onclick="selectAndFocusNode('${{n.id}}')" class="flex items-center gap-1.5 p-1.5 rounded hover:bg-slate-800/80 cursor-pointer text-xs text-indigo-400 hover:text-indigo-300 truncate">
                        <span class="w-1.5 h-1.5 rounded-full bg-slate-500 shrink-0"></span>
                        <span class="font-semibold text-slate-300 truncate">${{escapeHtml(n.name)}}</span>
                        <span class="text-[9px] uppercase text-slate-500 px-1 border border-slate-800 rounded font-bold">${{n.kind}}</span>
                    </div>
                ` : '').join('');

            const outgoingHtml = outgoing.length === 0
                ? '<p class="text-xs text-slate-500 italic">None</p>'
                : outgoing.map(n => n ? `
                    <div onclick="selectAndFocusNode('${{n.id}}')" class="flex items-center gap-1.5 p-1.5 rounded hover:bg-slate-800/80 cursor-pointer text-xs text-indigo-400 hover:text-indigo-300 truncate">
                        <span class="w-1.5 h-1.5 rounded-full bg-slate-500 shrink-0"></span>
                        <span class="font-semibold text-slate-300 truncate">${{escapeHtml(n.name)}}</span>
                        <span class="text-[9px] uppercase text-slate-500 px-1 border border-slate-800 rounded font-bold">${{n.kind}}</span>
                    </div>
                ` : '').join('');

            // Kind color styles
            let kindBadgeColor = 'bg-slate-800 text-slate-350 border-slate-700';
            if (node.kind === 'class') kindBadgeColor = 'bg-emerald-950/70 text-emerald-400 border-emerald-800/80';
            if (node.kind === 'function') kindBadgeColor = 'bg-blue-950/70 text-blue-400 border-blue-800/80';
            if (node.kind === 'method') kindBadgeColor = 'bg-violet-950/70 text-violet-400 border-violet-800/80';
            if (node.kind === 'constant') kindBadgeColor = 'bg-amber-950/70 text-amber-400 border-amber-800/80';
            if (node.kind === 'variable') kindBadgeColor = 'bg-rose-950/70 text-rose-400 border-rose-800/80';
            if (node.kind === 'file') kindBadgeColor = 'bg-slate-950/70 text-slate-300 border-slate-800';

            // Additional details specific to symbols
            let extraDetails = '';
            if (node.kind !== 'file') {{
                const attributes = [];
                if (node.is_exported) attributes.push('Exported');
                if (node.is_async) attributes.push('Async');
                if (node.is_static) attributes.push('Static');
                if (node.is_abstract) attributes.push('Abstract');

                const attrHtml = attributes.length === 0 ? '' : `
                    <div class="mt-3 flex flex-wrap gap-1">
                        ${{attributes.map(attr => `<span class="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-850 text-[10px] text-slate-400 font-medium">${{attr}}</span>`).join('')}}
                    </div>
                `;

                const signatureHtml = node.signature ? `
                    <div class="mt-4 border-t border-slate-800 pt-3">
                        <label class="block text-[10px] uppercase text-slate-400 font-bold mb-1">Signature</label>
                        <pre class="bg-slate-950 border border-slate-850 rounded-lg p-2.5 overflow-x-auto text-[11px] text-slate-300 font-mono scrollbar">${{escapeHtml(node.signature)}}</pre>
                    </div>
                ` : '';

                const docstringHtml = node.docstring ? `
                    <div class="mt-4 border-t border-slate-800 pt-3">
                        <label class="block text-[10px] uppercase text-slate-400 font-bold mb-1">Docstring</label>
                        <p class="text-xs text-slate-400 italic bg-slate-950/40 p-2 border border-slate-850 rounded-lg leading-relaxed whitespace-pre-line">${{escapeHtml(node.docstring)}}</p>
                    </div>
                ` : '';

                const loc = (node.start_line !== null && node.start_line !== undefined) ? `L${{node.start_line}}${{node.end_line ? ` - L${{node.end_line}}` : ''}}` : '';

                extraDetails = `
                    <div class="mt-4 space-y-2 border-t border-slate-800 pt-3">
                        <div class="flex items-center justify-between text-xs">
                            <span class="text-slate-500 font-medium">Location:</span>
                            <span class="text-slate-300 font-semibold font-mono">${{loc || 'N/A'}}</span>
                        </div>
                    </div>
                    ${{attrHtml}}
                    ${{signatureHtml}}
                    ${{docstringHtml}}
                `;
            }} else {{
                // File node specific details
                extraDetails = `
                    <div class="mt-4 space-y-2 border-t border-slate-800 pt-3">
                        <div class="flex items-center justify-between text-xs">
                            <span class="text-slate-500 font-medium">Language:</span>
                            <span class="text-indigo-400 uppercase font-bold text-[10px]">${{node.language || 'Unknown'}}</span>
                        </div>
                    </div>
                `;
            }}

            detailsPanel.innerHTML = `
                <div class="p-6 flex flex-col h-full">
                    <!-- Title and Badge -->
                    <div class="flex items-start justify-between gap-2">
                        <div class="min-w-0">
                            <h2 class="text-base font-bold text-white tracking-tight leading-snug break-all">${{node.name}}</h2>
                            <p class="text-xs text-slate-500 font-medium truncate mt-0.5" title="${{node.file_path || ''}}">${{node.file_path || ''}}</p>
                        </div>
                        <span class="px-2 py-0.5 border text-[10px] uppercase font-bold rounded-lg shrink-0 ${{kindBadgeColor}}">${{node.kind}}</span>
                    </div>

                    ${{extraDetails}}

                    <!-- Connection lists (Flex Fill) -->
                    <div class="mt-6 flex-1 flex flex-col min-h-0 border-t border-slate-800 pt-4">
                        <div class="flex-1 flex flex-col min-h-0 mb-4">
                            <label class="block text-[10px] uppercase text-slate-400 font-bold mb-2">Incoming Connections</label>
                            <div class="flex-1 overflow-y-auto space-y-1 pr-1 scrollbar border border-slate-950 rounded-lg p-2 bg-slate-950/30">
                                ${{incomingHtml}}
                            </div>
                        </div>
                        <div class="flex-1 flex flex-col min-h-0">
                            <label class="block text-[10px] uppercase text-slate-400 font-bold mb-2">Outgoing Connections</label>
                            <div class="flex-1 overflow-y-auto space-y-1 pr-1 scrollbar border border-slate-950 rounded-lg p-2 bg-slate-950/30">
                                ${{outgoingHtml}}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }}

        function handleEdgeSelection(edgeId) {{
            let edge = null;
            if (currentView === 'symbol') {{
                edge = symbolEdgesDataSet.get(edgeId);
                if (!edge) return;
                
                const fromNode = symbolNodesDataSet.get(edge.from);
                const toNode = symbolNodesDataSet.get(edge.to);
                renderEdgeDetails(edge, fromNode, toNode);
            }} else {{
                edge = fileEdgesDataSet.get(edgeId);
                if (!edge) return;
                
                const fromNode = fileNodesDataSet.get(edge.from);
                const toNode = fileNodesDataSet.get(edge.to);
                renderFileEdgeDetails(edge, fromNode, toNode);
            }}
        }}

        function renderEdgeDetails(edge, fromNode, toNode) {{
            const detailsPanel = document.getElementById('details-panel');
            const loc = edge.line ? `L${{edge.line}}${{edge.col ? `:${{edge.col}}` : ''}}` : 'N/A';

            detailsPanel.innerHTML = `
                <div class="p-6 flex flex-col h-full">
                    <h2 class="text-sm uppercase tracking-wider font-bold text-slate-400">Dependency Edge Details</h2>
                    
                    <div class="mt-6 space-y-4 border-b border-slate-800 pb-4">
                        <div>
                            <label class="block text-[10px] uppercase text-slate-500 font-bold">Relationship Type</label>
                            <span class="inline-block mt-1 px-2.5 py-0.5 rounded-lg border border-slate-800 bg-slate-950 text-indigo-400 font-bold text-xs uppercase">${{edge.kind}}</span>
                        </div>
                        <div>
                            <label class="block text-[10px] uppercase text-slate-500 font-bold">Callsite Location</label>
                            <span class="block mt-1 text-slate-300 font-mono text-xs">${{loc}}</span>
                        </div>
                    </div>

                    <!-- Flow representation -->
                    <div class="mt-6 space-y-4 flex-1">
                        <div onclick="selectAndFocusNode('${{fromNode.id}}')" class="p-3 bg-slate-950 border border-slate-850 rounded-lg hover:border-slate-700 cursor-pointer transition-all">
                            <label class="block text-[9px] uppercase text-slate-500 font-bold mb-1">Source Node</label>
                            <div class="flex items-center justify-between gap-2">
                                <span class="text-xs font-bold text-slate-200 truncate">${{fromNode.name}}</span>
                                <span class="text-[9px] uppercase font-bold px-1 border border-slate-800 rounded bg-slate-900 text-slate-400 shrink-0">${{fromNode.kind}}</span>
                            </div>
                        </div>

                        <div class="flex justify-center my-2 text-slate-600">
                            <svg class="w-6 h-6 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 13l-7 7-7-7m14-6l-7 7-7-7"></path></svg>
                        </div>

                        <div onclick="selectAndFocusNode('${{toNode.id}}')" class="p-3 bg-slate-950 border border-slate-850 rounded-lg hover:border-slate-700 cursor-pointer transition-all">
                            <label class="block text-[9px] uppercase text-slate-500 font-bold mb-1">Target Node</label>
                            <div class="flex items-center justify-between gap-2">
                                <span class="text-xs font-bold text-slate-200 truncate">${{toNode.name}}</span>
                                <span class="text-[9px] uppercase font-bold px-1 border border-slate-800 rounded bg-slate-900 text-slate-400 shrink-0">${{toNode.kind}}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }}

        function renderFileEdgeDetails(edge, fromNode, toNode) {{
            const detailsPanel = document.getElementById('details-panel');

            // Format details rows
            const rowsHtml = edge.details.map(det => `
                <tr class="hover:bg-slate-850/40 text-[11px] border-b border-slate-800 last:border-b-0 transition-colors">
                    <td class="p-2 truncate max-w-[100px] text-indigo-400 font-semibold cursor-pointer" onclick="drillDownToSymbol('${{det.source}}')" title="${{escapeHtml(det.source_name)}}">${{escapeHtml(det.source_name)}}</td>
                    <td class="p-2 text-slate-500 font-mono text-[9px] text-center">${{det.kind}}</td>
                    <td class="p-2 truncate max-w-[100px] text-indigo-400 font-semibold cursor-pointer" onclick="drillDownToSymbol('${{det.target}}')" title="${{escapeHtml(det.target_name)}}">${{escapeHtml(det.target_name)}}</td>
                    <td class="p-2 text-slate-400 font-mono text-center">${{det.line || 'N/A'}}</td>
                </tr>
            `).join('');

            detailsPanel.innerHTML = `
                <div class="p-6 flex flex-col h-full overflow-hidden">
                    <h2 class="text-sm uppercase tracking-wider font-bold text-slate-400">File Dependency Details</h2>
                    <p class="text-[11px] text-slate-500 mt-1">Aggregated dependency count: <span class="text-indigo-400 font-bold">${{edge.value}}</span></p>

                    <!-- Flow representation -->
                    <div class="mt-4 grid grid-cols-3 items-center gap-1">
                        <div onclick="selectAndFocusNode('${{fromNode.id}}')" class="p-2 bg-slate-950 border border-slate-850 rounded-lg hover:border-slate-700 cursor-pointer transition-all text-center min-w-0">
                            <span class="block text-[8px] uppercase text-slate-500 font-bold truncate">Source</span>
                            <span class="text-[11px] font-bold text-slate-300 truncate block mt-0.5" title="${{fromNode.name}}">${{fromNode.name}}</span>
                        </div>
                        <div class="flex justify-center text-slate-600 flex-col items-center">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                            <span class="text-[9px] text-indigo-500 font-bold mt-0.5">${{edge.value}}x</span>
                        </div>
                        <div onclick="selectAndFocusNode('${{toNode.id}}')" class="p-2 bg-slate-950 border border-slate-850 rounded-lg hover:border-slate-700 cursor-pointer transition-all text-center min-w-0">
                            <span class="block text-[8px] uppercase text-slate-500 font-bold truncate">Target</span>
                            <span class="text-[11px] font-bold text-slate-300 truncate block mt-0.5" title="${{toNode.name}}">${{toNode.name}}</span>
                        </div>
                    </div>

                    <!-- Breakdown Table -->
                    <div class="mt-6 flex-1 flex flex-col min-h-0">
                        <label class="block text-[10px] uppercase text-slate-400 font-bold mb-2">Dependency Breakdown</label>
                        <div class="flex-1 overflow-auto border border-slate-800 bg-slate-950/40 rounded-lg pr-1 scrollbar">
                            <table class="w-full text-left border-collapse">
                                <thead>
                                    <tr class="bg-slate-950 text-slate-500 text-[9px] uppercase font-bold border-b border-slate-800 sticky top-0">
                                        <th class="p-2">Source Sym</th>
                                        <th class="p-2 text-center">Relation</th>
                                        <th class="p-2">Target Sym</th>
                                        <th class="p-2 text-center">Line</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${{rowsHtml}}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
        }}

        // HTML escaping helper
        function escapeHtml(unsafe) {{
            if (!unsafe) return '';
            return unsafe
                 .replace(/&/g, "&amp;")
                 .replace(/</g, "&lt;")
                 .replace(/>/g, "&gt;")
                 .replace(/"/g, "&quot;")
                 .replace(/'/g, "&#039;");
        }}

        // Initialize application on window load
        window.addEventListener('load', () => {{
            initDataSets();
            // Start in Symbol view initially
            drawNetwork();
        }});
    </script>
</body>
</html>
"""

def main():
    if not os.path.exists(DB_PATH):
        print(f"Error: Database not found at {DB_PATH}")
        return

    print("Connecting to database...")
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Load all nodes
    cursor.execute("SELECT id, kind, name, qualified_name, file_path, language, start_line, end_line, docstring, signature, visibility, is_exported, is_async, is_static, is_abstract, decorators FROM nodes")
    nodes = [dict(row) for row in cursor.fetchall()]
    print(f"Loaded {len(nodes)} nodes.")

    # Load all edges
    cursor.execute("SELECT id, source, target, kind, line, col, metadata FROM edges")
    edges = [dict(row) for row in cursor.fetchall()]
    print(f"Loaded {len(edges)} edges.")

    conn.close()

    # Build index of nodes by ID
    nodes_by_id = {node['id']: node for node in nodes}

    # Helper function to get node file path
    def get_node_file_path(node):
        if not node:
            return None
        if node['kind'] == 'file':
            return node['file_path'] or node['id'].replace('file:', '', 1)
        return node['file_path']

    # --- Construct Symbol View data ---
    # Nodes in symbol view are all non-file nodes
    symbol_nodes = [node for node in nodes if node['kind'] != 'file']
    symbol_node_ids = {node['id'] for node in symbol_nodes}
    
    # Edges in symbol view are all edges between symbol nodes
    symbol_edges = []
    for edge in edges:
        if edge['source'] in symbol_node_ids and edge['target'] in symbol_node_ids:
            symbol_edges.append(edge)

    print(f"Symbol View: {len(symbol_nodes)} nodes, {len(symbol_edges)} edges.")

    # --- Construct File View data ---
    file_nodes = [node for node in nodes if node['kind'] == 'file']
    
    # Aggregate dependencies between files
    file_edges_map = {}
    for edge in edges:
        # Ignore contains edges when mapping file dependencies
        if edge['kind'] == 'contains':
            continue
            
        src_node = nodes_by_id.get(edge['source'])
        tgt_node = nodes_by_id.get(edge['target'])
        if not src_node or not tgt_node:
            continue
            
        src_file = get_node_file_path(src_node)
        tgt_file = get_node_file_path(tgt_node)
        
        if src_file and tgt_file and src_file != tgt_file:
            key = (src_file, tgt_file)
            if key not in file_edges_map:
                file_edges_map[key] = {
                    'id': f"file_dep:{src_file}->{tgt_file}",
                    'from': f"file:{src_file}",
                    'to': f"file:{tgt_file}",
                    'value': 0,
                    'details': []
                }
            
            file_edges_map[key]['value'] += 1
            file_edges_map[key]['details'].append({
                'id': edge['id'],
                'source': edge['source'],
                'source_name': src_node['name'],
                'source_kind': src_node['kind'],
                'target': edge['target'],
                'target_name': tgt_node['name'],
                'target_kind': tgt_node['kind'],
                'kind': edge['kind'],
                'line': edge['line'],
                'col': edge['col']
            })
            
    file_edges = list(file_edges_map.values())
    print(f"File View: {len(file_nodes)} nodes, {len(file_edges)} edges.")

    # Prepare JSON data
    data_payload = {
        'symbolNodes': symbol_nodes,
        'symbolEdges': symbol_edges,
        'fileNodes': file_nodes,
        'fileEdges': file_edges
    }

    # Format as JSON string
    json_data = json.dumps(data_payload, indent=2)

    # Load and render template
    html_content = get_html_template(json_data)

    print(f"Writing visualizer HTML to {OUTPUT_PATH}...")
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        f.write(html_content)

    print("Success! Visualization file generated successfully.")

if __name__ == '__main__':
    main()
