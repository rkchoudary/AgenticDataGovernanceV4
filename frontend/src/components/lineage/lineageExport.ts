import { Node, Edge } from '@xyflow/react'
import { toPng, toSvg } from 'html-to-image'
import { format } from 'date-fns'
import type { LineageNodeType } from './LineageNode'

interface NodeData {
  id: string
  label: string
  type: LineageNodeType
}

export type ExportFormat = 'png' | 'svg' | 'mermaid' | 'html'

interface ExportOptions {
  filename?: string
  backgroundColor?: string
  padding?: number
}

/**
 * Export lineage graph as PNG image
 */
export async function exportToPNG(
  element: HTMLElement,
  options: ExportOptions = {}
): Promise<void> {
  const { filename = 'lineage', backgroundColor = '#ffffff', padding = 20 } = options

  try {
    const dataUrl = await toPng(element, {
      backgroundColor,
      style: {
        padding: `${padding}px`,
      },
    })

    downloadFile(dataUrl, `${filename}_${getTimestamp()}.png`)
  } catch (error) {
    console.error('Failed to export PNG:', error)
    throw error
  }
}

/**
 * Export lineage graph as SVG
 */
export async function exportToSVG(
  element: HTMLElement,
  options: ExportOptions = {}
): Promise<void> {
  const { filename = 'lineage', backgroundColor = '#ffffff', padding = 20 } = options

  try {
    const dataUrl = await toSvg(element, {
      backgroundColor,
      style: {
        padding: `${padding}px`,
      },
    })

    downloadFile(dataUrl, `${filename}_${getTimestamp()}.svg`)
  } catch (error) {
    console.error('Failed to export SVG:', error)
    throw error
  }
}

/**
 * Export lineage graph as Mermaid markdown
 */
export function exportToMermaid(
  nodes: Node[],
  edges: Edge[]
): string {
  const lines: string[] = ['```mermaid', 'flowchart LR']

  // Define node styles based on type
  const nodeStyles: Record<LineageNodeType, string> = {
    source_table: 'fill:#dbeafe,stroke:#3b82f6',
    transformation: 'fill:#f3e8ff,stroke:#8b5cf6',
    staging_table: 'fill:#fef3c7,stroke:#f59e0b',
    report_field: 'fill:#dcfce7,stroke:#22c55e',
  }

  // Add subgraphs for each node type
  const nodesByType = new Map<LineageNodeType, Node[]>()
  nodes.forEach((node) => {
    const nodeData = node.data as unknown as NodeData
    const type = nodeData.type
    if (!nodesByType.has(type)) {
      nodesByType.set(type, [])
    }
    nodesByType.get(type)!.push(node)
  })

  // Add nodes with appropriate shapes
  nodes.forEach((node) => {
    const nodeData = node.data as unknown as NodeData
    const label = nodeData.label.replace(/"/g, "'")
    const shape = getNodeShape(nodeData.type)
    lines.push(`    ${node.id}${shape.start}"${label}"${shape.end}`)
  })

  // Add edges
  edges.forEach((edge) => {
    const label = edge.label ? `|${edge.label}|` : ''
    lines.push(`    ${edge.source} -->${label} ${edge.target}`)
  })

  // Add style definitions
  lines.push('')
  Object.entries(nodeStyles).forEach(([type, style]) => {
    const nodesOfType = nodesByType.get(type as LineageNodeType) || []
    if (nodesOfType.length > 0) {
      const nodeIds = nodesOfType.map((n) => n.id).join(',')
      lines.push(`    style ${nodeIds} ${style}`)
    }
  })

  lines.push('```')

  return lines.join('\n')
}

/**
 * Export lineage graph as interactive HTML embed
 */
export function exportToHTML(
  nodes: Node[],
  edges: Edge[],
  options: ExportOptions = {}
): string {
  const { filename = 'lineage' } = options
  const timestamp = format(new Date(), 'MMMM d, yyyy HH:mm')

  const nodesJson = JSON.stringify(
    nodes.map((n) => ({
      id: n.id,
      label: (n.data as unknown as NodeData).label,
      type: (n.data as unknown as NodeData).type,
      position: n.position,
    }))
  )

  const edgesJson = JSON.stringify(
    edges.map((e) => ({
      source: e.source,
      target: e.target,
      label: e.label,
    }))
  )

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Data Lineage - ${filename}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; }
    .header { background: white; border-bottom: 1px solid #e2e8f0; padding: 16px 24px; }
    .header h1 { font-size: 20px; color: #0f172a; }
    .header .timestamp { font-size: 12px; color: #64748b; margin-top: 4px; }
    .container { display: flex; height: calc(100vh - 80px); }
    .graph { flex: 1; position: relative; overflow: hidden; }
    .sidebar { width: 280px; background: white; border-left: 1px solid #e2e8f0; padding: 16px; overflow-y: auto; }
    .legend { margin-bottom: 24px; }
    .legend h3 { font-size: 14px; font-weight: 600; margin-bottom: 12px; }
    .legend-item { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 13px; }
    .legend-icon { width: 24px; height: 24px; border-radius: 4px; display: flex; align-items: center; justify-content: center; }
    .source_table .legend-icon { background: #dbeafe; color: #3b82f6; }
    .transformation .legend-icon { background: #f3e8ff; color: #8b5cf6; }
    .staging_table .legend-icon { background: #fef3c7; color: #f59e0b; }
    .report_field .legend-icon { background: #dcfce7; color: #22c55e; }
    .node { position: absolute; padding: 12px 16px; border-radius: 8px; border: 2px solid; min-width: 140px; cursor: pointer; transition: all 0.2s; }
    .node:hover { transform: scale(1.05); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    .node.source_table { background: #dbeafe; border-color: #3b82f6; }
    .node.transformation { background: #f3e8ff; border-color: #8b5cf6; }
    .node.staging_table { background: #fef3c7; border-color: #f59e0b; }
    .node.report_field { background: #dcfce7; border-color: #22c55e; }
    .node-label { font-weight: 500; font-size: 13px; }
    .node-type { font-size: 11px; color: #64748b; margin-top: 2px; }
    svg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; }
    .edge { stroke: #94a3b8; stroke-width: 2; fill: none; marker-end: url(#arrowhead); }
    .stats { background: #f1f5f9; border-radius: 8px; padding: 12px; }
    .stats h3 { font-size: 14px; font-weight: 600; margin-bottom: 8px; }
    .stat-row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px; }
    .stat-value { font-weight: 600; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Data Lineage Diagram</h1>
    <div class="timestamp">Generated on ${timestamp}</div>
  </div>
  <div class="container">
    <div class="graph" id="graph">
      <svg>
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8" />
          </marker>
        </defs>
      </svg>
    </div>
    <div class="sidebar">
      <div class="legend">
        <h3>Node Types</h3>
        <div class="legend-item source_table">
          <div class="legend-icon">📊</div>
          <span>Source Table</span>
        </div>
        <div class="legend-item transformation">
          <div class="legend-icon">⚙️</div>
          <span>Transformation</span>
        </div>
        <div class="legend-item staging_table">
          <div class="legend-icon">📋</div>
          <span>Staging Table</span>
        </div>
        <div class="legend-item report_field">
          <div class="legend-icon">📄</div>
          <span>Report Field</span>
        </div>
      </div>
      <div class="stats">
        <h3>Statistics</h3>
        <div class="stat-row">
          <span>Total Nodes</span>
          <span class="stat-value" id="node-count">0</span>
        </div>
        <div class="stat-row">
          <span>Total Edges</span>
          <span class="stat-value" id="edge-count">0</span>
        </div>
      </div>
    </div>
  </div>
  <script>
    const nodes = ${nodesJson};
    const edges = ${edgesJson};
    
    document.getElementById('node-count').textContent = nodes.length;
    document.getElementById('edge-count').textContent = edges.length;
    
    const graph = document.getElementById('graph');
    const svg = graph.querySelector('svg');
    
    // Render nodes
    nodes.forEach(node => {
      const el = document.createElement('div');
      el.className = 'node ' + node.type;
      el.style.left = node.position.x + 'px';
      el.style.top = node.position.y + 'px';
      el.innerHTML = '<div class="node-label">' + node.label + '</div><div class="node-type">' + node.type.replace('_', ' ') + '</div>';
      graph.appendChild(el);
    });
    
    // Render edges
    const nodePositions = {};
    nodes.forEach(n => { nodePositions[n.id] = n.position; });
    
    edges.forEach(edge => {
      const source = nodePositions[edge.source];
      const target = nodePositions[edge.target];
      if (source && target) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const sx = source.x + 140;
        const sy = source.y + 25;
        const tx = target.x;
        const ty = target.y + 25;
        const mx = (sx + tx) / 2;
        path.setAttribute('d', 'M' + sx + ',' + sy + ' C' + mx + ',' + sy + ' ' + mx + ',' + ty + ' ' + tx + ',' + ty);
        path.setAttribute('class', 'edge');
        svg.appendChild(path);
      }
    });
  </script>
</body>
</html>`
}

/**
 * Download Mermaid markdown file
 */
export function downloadMermaid(
  nodes: Node[],
  edges: Edge[],
  filename: string = 'lineage'
): void {
  const mermaidContent = exportToMermaid(nodes, edges)
  const blob = new Blob([mermaidContent], { type: 'text/markdown;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  downloadFile(url, `${filename}_${getTimestamp()}.md`)
  URL.revokeObjectURL(url)
}

/**
 * Download HTML embed file
 */
export function downloadHTML(
  nodes: Node[],
  edges: Edge[],
  filename: string = 'lineage'
): void {
  const htmlContent = exportToHTML(nodes, edges, { filename })
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  downloadFile(url, `${filename}_${getTimestamp()}.html`)
  URL.revokeObjectURL(url)
}

// Helper functions
function getNodeShape(type: LineageNodeType): { start: string; end: string } {
  const shapes: Record<LineageNodeType, { start: string; end: string }> = {
    source_table: { start: '[(', end: ')]' },      // Cylinder
    transformation: { start: '{{', end: '}}' },    // Hexagon
    staging_table: { start: '([', end: '])' },     // Stadium
    report_field: { start: '[[', end: ']]' },      // Subroutine
  }
  return shapes[type]
}

function getTimestamp(): string {
  return format(new Date(), 'yyyy-MM-dd_HHmmss')
}

function downloadFile(dataUrl: string, filename: string): void {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
