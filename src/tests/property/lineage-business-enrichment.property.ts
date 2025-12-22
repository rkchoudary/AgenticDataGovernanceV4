/**
 * **Feature: agentic-data-governance, Property 16: Lineage Business Enrichment**
 * 
 * For any lineage node that has a matching entry in the business glossary 
 * (by name or configured mapping), the node's businessTerm field must be 
 * populated with the glossary term.
 */

import { describe, it } from 'vitest';
import fc from 'fast-check';
import { 
  lineageGraphGenerator, 
  businessGlossaryGenerator 
} from '../generators/index.js';
import { LineageMappingAgent } from '../../agents/lineage-mapping-agent.js';
import { LineageGraph, BusinessGlossary } from '../../types/index.js';

const propertyConfig = {
  numRuns: 100,
  verbose: true
};

describe('Property 16: Lineage Business Enrichment', () => {
  it('should populate businessTerm for nodes with matching glossary entries', async () => {
    await fc.assert(
      fc.asyncProperty(
        lineageGraphGenerator(),
        businessGlossaryGenerator(),
        async (graph: LineageGraph, glossary: BusinessGlossary) => {
          const agent = new LineageMappingAgent();
          
          // Create a copy of the graph to avoid mutation issues
          const graphCopy = JSON.parse(JSON.stringify(graph));
          
          // Ensure at least one node has a matching term in the glossary
          if (graphCopy.nodes.length > 0 && glossary.terms.length > 0) {
            // Make the first node match the first glossary term
            graphCopy.nodes[0].name = glossary.terms[0].term;
          }
          
          const enrichedLineage = await agent.linkToBusinessConcepts(graphCopy, glossary);
          
          // Check that nodes with matching glossary terms have businessTerm populated
          for (const node of enrichedLineage.graph.nodes) {
            const matchingTerm = findMatchingTerm(node.name, glossary);
            
            if (matchingTerm) {
              // If there's a matching term, businessTerm should be populated
              if (!node.businessTerm) {
                console.log(`Node ${node.name} should have businessTerm but doesn't`);
                return false;
              }
              
              // The businessTerm should match the glossary term
              if (node.businessTerm !== matchingTerm.term) {
                console.log(`Node ${node.name} businessTerm mismatch: expected ${matchingTerm.term}, got ${node.businessTerm}`);
                return false;
              }
            }
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });
  
  it('should not populate businessTerm for nodes without matching glossary entries', async () => {
    await fc.assert(
      fc.asyncProperty(
        lineageGraphGenerator(),
        businessGlossaryGenerator(),
        async (graph: LineageGraph, glossary: BusinessGlossary) => {
          const agent = new LineageMappingAgent();
          
          // Create a copy and ensure no nodes match glossary terms
          const graphCopy = JSON.parse(JSON.stringify(graph));
          
          // Make sure node names don't match any glossary terms
          graphCopy.nodes.forEach((node: any, index: number) => {
            node.name = `unique_node_name_${index}_${Math.random().toString(36).substr(2, 9)}`;
          });
          
          const enrichedLineage = await agent.linkToBusinessConcepts(graphCopy, glossary);
          
          // Check that nodes without matching terms don't have businessTerm populated by enrichment
          for (const node of enrichedLineage.graph.nodes) {
            const matchingTerm = findMatchingTerm(node.name, glossary);
            
            if (!matchingTerm) {
              // If there's no matching term and businessTerm was added by enrichment, that's wrong
              // (Note: businessTerm might have been there originally, so we only check if it matches a glossary term)
              if (node.businessTerm && glossary.terms.some(term => term.term === node.businessTerm)) {
                console.log(`Node ${node.name} should not have businessTerm from glossary but has ${node.businessTerm}`);
                return false;
              }
            }
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });
  
  it('should correctly count enriched terms', async () => {
    await fc.assert(
      fc.asyncProperty(
        lineageGraphGenerator(),
        businessGlossaryGenerator(),
        async (graph: LineageGraph, glossary: BusinessGlossary) => {
          const agent = new LineageMappingAgent();
          
          const graphCopy = JSON.parse(JSON.stringify(graph));
          const enrichedLineage = await agent.linkToBusinessConcepts(graphCopy, glossary);
          
          // Count actual matches
          const actualMatches = enrichedLineage.graph.nodes.filter(node => {
            const matchingTerm = findMatchingTerm(node.name, glossary);
            return matchingTerm && node.businessTerm === matchingTerm.term;
          }).length;
          
          // The reported count should match the actual count
          return enrichedLineage.glossaryTermsLinked === actualMatches;
        }
      ),
      propertyConfig
    );
  });
});

/**
 * Helper function to find matching glossary term for a node name
 */
function findMatchingTerm(nodeName: string, glossary: BusinessGlossary) {
  return glossary.terms.find(term => 
    term.term.toLowerCase() === nodeName.toLowerCase() ||
    term.synonyms.some(synonym => synonym.toLowerCase() === nodeName.toLowerCase()) ||
    calculateSemanticSimilarity(nodeName, term.term) > 0.8
  );
}

/**
 * Helper function to calculate semantic similarity
 */
function calculateSemanticSimilarity(name1: string, name2: string): number {
  const words1 = name1.toLowerCase().split(/[\s_-]+/);
  const words2 = name2.toLowerCase().split(/[\s_-]+/);
  
  const commonWords = words1.filter(word => words2.includes(word));
  const totalWords = new Set([...words1, ...words2]).size;
  
  return totalWords > 0 ? commonWords.length / totalWords : 0;
}