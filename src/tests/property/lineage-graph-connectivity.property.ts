/**
 * **Feature: agentic-data-governance, Property 15: Lineage Graph Connectivity**
 * 
 * For any CDE with documented lineage, there must exist a connected path 
 * in the lineage graph from at least one source node to the CDE's report field node.
 */

import { describe, it } from 'vitest';
import fc from 'fast-check';
import { lineageGraphWithCDEsGenerator } from '../generators/index.js';
import { LineageGraph, LineageNodeType } from '../../types/index.js';

const propertyConfig = {
  numRuns: 100,
  verbose: true
};

describe('Property 15: Lineage Graph Connectivity', () => {
  it('should have connected path from source to CDE for all lineage graphs with CDEs', () => {
    fc.assert(
      fc.property(
        lineageGraphWithCDEsGenerator(),
        (graph: LineageGraph) => {
          // Find all CDE nodes (report fields that are CDEs)
          const cdeNodes = graph.nodes.filter(node => 
            node.type === 'report_field' && 
            (node.name.includes('CDE_') || node.technicalDetails.isCDE === 'true')
          );
          
          // If no CDEs, property is vacuously true
          if (cdeNodes.length === 0) {
            return true;
          }
          
          // For each CDE, verify there's a path from at least one source node
          return cdeNodes.every(cdeNode => {
            const sourceNodes = graph.nodes.filter(node => node.type === 'source_table');
            
            // Check if there's a path from any source to this CDE
            return sourceNodes.some(sourceNode => 
              hasConnectedPath(graph, sourceNode.id, cdeNode.id)
            );
          });
        }
      ),
      propertyConfig
    );
  });
  
  it('should have at least one source node for any graph with CDEs', () => {
    fc.assert(
      fc.property(
        lineageGraphWithCDEsGenerator(),
        (graph: LineageGraph) => {
          const cdeNodes = graph.nodes.filter(node => 
            node.type === 'report_field' && 
            (node.name.includes('CDE_') || node.technicalDetails.isCDE === 'true')
          );
          
          // If there are CDEs, there must be at least one source node
          if (cdeNodes.length > 0) {
            const sourceNodes = graph.nodes.filter(node => node.type === 'source_table');
            return sourceNodes.length > 0;
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });
});

/**
 * Check if there's a connected path between two nodes in the lineage graph
 */
function hasConnectedPath(graph: LineageGraph, sourceId: string, targetId: string): boolean {
  if (sourceId === targetId) {
    return true;
  }
  
  const visited = new Set<string>();
  const queue = [sourceId];
  
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    
    if (visited.has(currentId)) {
      continue;
    }
    
    visited.add(currentId);
    
    if (currentId === targetId) {
      return true;
    }
    
    // Find all nodes connected from current node
    const outgoingEdges = graph.edges.filter(edge => edge.sourceNodeId === currentId);
    for (const edge of outgoingEdges) {
      if (!visited.has(edge.targetNodeId)) {
        queue.push(edge.targetNodeId);
      }
    }
  }
  
  return false;
}