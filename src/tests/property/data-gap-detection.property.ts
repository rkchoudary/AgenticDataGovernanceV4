/**
 * **Feature: agentic-data-governance, Property 6: Data Gap Detection Accuracy**
 * 
 * For any data element that has no matching entry in the data catalog 
 * (by name or semantic similarity above threshold), the element must be 
 * flagged as a data gap in the mapping output.
 * 
 * **Validates: Requirements 3.3**
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { InMemoryGovernanceRepository } from '../../repository/governance-repository.js';
import { DataRequirementsAgent } from '../../agents/data-requirements-agent.js';
import { 
  DataElement, 
  DataCatalog, 
  DataType 
} from '../../types/index.js';
import {
  dataElementGenerator,
  dataCatalogGenerator,
  nonEmptyStringGenerator
} from '../generators/index.js';

// Property test configuration - minimum 100 iterations
const propertyConfig = {
  numRuns: 100,
  verbose: false
};

describe('Property 6: Data Gap Detection Accuracy', () => {
  let repository: InMemoryGovernanceRepository;
  let agent: DataRequirementsAgent;

  beforeEach(() => {
    repository = new InMemoryGovernanceRepository();
    agent = new DataRequirementsAgent(repository, {
      minMappingConfidence: 0.7,
      semanticSimilarityThreshold: 0.6
    });
  });

  /**
   * Generator for elements that definitely won't match any catalog entry
   * Uses unique random strings that won't appear in any catalog
   */
  const unmatchableElementGenerator = (): fc.Arbitrary<DataElement> =>
    fc.record({
      id: fc.uuid(),
      name: fc.string({ minLength: 20, maxLength: 30 }).map(s => `UNMATCHABLE_${s}_XYZ123`),
      regulatoryDefinition: fc.string({ minLength: 20, maxLength: 50 }).map(s => `Unique definition ${s}`),
      dataType: fc.constantFrom('string', 'number', 'date', 'boolean', 'decimal', 'integer') as fc.Arbitrary<DataType>,
      format: nonEmptyStringGenerator(),
      calculationLogic: fc.option(fc.string({ minLength: 5, maxLength: 50 })),
      unit: fc.option(fc.constantFrom('USD', 'CAD', 'EUR', '%')),
      mandatory: fc.boolean()
    });

  /**
   * Generator for a catalog with specific field names
   */
  const catalogWithSpecificFieldsGenerator = (fieldNames: string[]): fc.Arbitrary<DataCatalog> =>
    fc.record({
      id: fc.uuid(),
      systems: fc.constant([{
        id: crypto.randomUUID(),
        name: 'TestSystem',
        tables: [{
          id: crypto.randomUUID(),
          name: 'TestTable',
          fields: fieldNames.map(name => ({
            id: crypto.randomUUID(),
            name,
            dataType: 'string' as DataType,
            description: `Field ${name}`
          }))
        }]
      }]),
      lastUpdated: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
    });

  it('should flag elements with no catalog match as data gaps', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(unmatchableElementGenerator(), { minLength: 1, maxLength: 5 }),
        dataCatalogGenerator(),
        async (elements, catalog) => {
          // Map elements to catalog
          const mappings = await agent.mapToInternalSources(elements, catalog);
          
          // Identify gaps using the enhanced method
          const gaps = await agent.identifyDataGapsForElements(elements, mappings);
          
          // Property: Elements with no high-confidence mapping should be flagged as gaps
          const highConfidenceMappedIds = new Set(
            mappings.filter(m => m.confidence >= 0.7).map(m => m.elementId)
          );
          
          for (const element of elements) {
            if (!highConfidenceMappedIds.has(element.id)) {
              // This element should be in gaps
              const gap = gaps.find(g => g.elementId === element.id);
              expect(gap).toBeDefined();
            }
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should include element name in gap record', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(unmatchableElementGenerator(), { minLength: 1, maxLength: 5 }),
        dataCatalogGenerator(),
        async (elements, catalog) => {
          const mappings = await agent.mapToInternalSources(elements, catalog);
          const gaps = await agent.identifyDataGapsForElements(elements, mappings);
          
          // Property: Every gap should have a non-empty element name
          for (const gap of gaps) {
            expect(gap.elementName).toBeDefined();
            expect(gap.elementName.length).toBeGreaterThan(0);
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should provide appropriate gap reason', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(unmatchableElementGenerator(), { minLength: 1, maxLength: 5 }),
        dataCatalogGenerator(),
        async (elements, catalog) => {
          const mappings = await agent.mapToInternalSources(elements, catalog);
          const gaps = await agent.identifyDataGapsForElements(elements, mappings);
          
          // Property: Every gap should have a valid reason
          const validReasons = ['no_source', 'partial_source', 'calculation_needed'];
          for (const gap of gaps) {
            expect(validReasons).toContain(gap.reason);
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should flag low confidence mappings as partial_source gaps', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(dataElementGenerator(), { minLength: 1, maxLength: 5 }),
        dataCatalogGenerator(),
        async (elements, catalog) => {
          const mappings = await agent.mapToInternalSources(elements, catalog);
          const gaps = await agent.identifyDataGapsForElements(elements, mappings);
          
          // Property: Low confidence mappings should be flagged as partial_source
          const lowConfidenceMappings = mappings.filter(m => m.confidence < 0.7);
          
          for (const mapping of lowConfidenceMappings) {
            const gap = gaps.find(g => g.elementId === mapping.elementId);
            expect(gap).toBeDefined();
            expect(gap!.reason).toBe('partial_source');
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should flag elements with calculation logic but no source as calculation_needed', async () => {
    // Generator for elements with calculation logic
    const elementWithCalculationGenerator = (): fc.Arbitrary<DataElement> =>
      fc.record({
        id: fc.uuid(),
        name: fc.string({ minLength: 20, maxLength: 30 }).map(s => `CALC_${s}_XYZ`),
        regulatoryDefinition: nonEmptyStringGenerator(),
        dataType: fc.constantFrom('number', 'decimal', 'integer') as fc.Arbitrary<DataType>,
        format: fc.constant('#,##0.00'),
        calculationLogic: fc.string({ minLength: 10, maxLength: 50 }).map(s => `SUM(${s})`),
        unit: fc.option(fc.constantFrom('USD', 'CAD', '%')),
        mandatory: fc.boolean()
      });

    await fc.assert(
      fc.asyncProperty(
        fc.array(elementWithCalculationGenerator(), { minLength: 1, maxLength: 3 }),
        dataCatalogGenerator(),
        async (elements, catalog) => {
          const mappings = await agent.mapToInternalSources(elements, catalog);
          const gaps = await agent.identifyDataGapsForElements(elements, mappings);
          
          // Property: Elements with calculation logic and no mapping should be calculation_needed
          const mappedIds = new Set(mappings.map(m => m.elementId));
          
          for (const element of elements) {
            if (!mappedIds.has(element.id) && element.calculationLogic) {
              const gap = gaps.find(g => g.elementId === element.id);
              expect(gap).toBeDefined();
              expect(gap!.reason).toBe('calculation_needed');
            }
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should not flag elements with high confidence mappings as gaps', async () => {
    // Create elements that will definitely match catalog entries
    const matchingElementGenerator = (fieldName: string): fc.Arbitrary<DataElement> =>
      fc.record({
        id: fc.uuid(),
        name: fc.constant(fieldName),
        regulatoryDefinition: nonEmptyStringGenerator(),
        dataType: fc.constant('string' as DataType),
        format: fc.constant('text'),
        calculationLogic: fc.constant(undefined),
        unit: fc.constant(undefined),
        mandatory: fc.boolean()
      });

    await fc.assert(
      fc.asyncProperty(
        fc.array(nonEmptyStringGenerator(), { minLength: 1, maxLength: 3 }),
        async (fieldNames) => {
          // Create elements with exact field names
          const elements = await Promise.all(
            fieldNames.map(name => fc.sample(matchingElementGenerator(name), 1)[0])
          );
          
          // Create catalog with matching fields
          const catalog = fc.sample(catalogWithSpecificFieldsGenerator(fieldNames), 1)[0];
          
          const mappings = await agent.mapToInternalSources(elements, catalog);
          const gaps = await agent.identifyDataGapsForElements(elements, mappings);
          
          // Property: Elements with exact name matches should have high confidence
          // and should NOT appear as no_source gaps
          const noSourceGaps = gaps.filter(g => g.reason === 'no_source');
          
          for (const element of elements) {
            const hasExactMatch = catalog.systems.some(sys =>
              sys.tables.some(tbl =>
                tbl.fields.some(f => f.name === element.name)
              )
            );
            
            if (hasExactMatch) {
              const noSourceGap = noSourceGaps.find(g => g.elementId === element.id);
              expect(noSourceGap).toBeUndefined();
            }
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should provide suggested resolution for all gaps', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(unmatchableElementGenerator(), { minLength: 1, maxLength: 5 }),
        dataCatalogGenerator(),
        async (elements, catalog) => {
          const mappings = await agent.mapToInternalSources(elements, catalog);
          const gaps = await agent.identifyDataGapsForElements(elements, mappings);
          
          // Property: Every gap should have a suggested resolution
          for (const gap of gaps) {
            expect(gap.suggestedResolution).toBeDefined();
            expect(gap.suggestedResolution!.length).toBeGreaterThan(0);
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });
});
