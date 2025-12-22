/**
 * Test generators for Data Requirements Agent property tests
 */

import fc from 'fast-check';
import {
  DataElement,
  DataMapping,
  DataGap,
  RequirementsDocument,
  DataCatalog,
  DataSystem,
  DataTable,
  DataField,
  DataType,
  DataGapReason,
  ArtifactStatus
} from '../../types/index.js';
import { 
  RegulatoryTemplate, 
  TemplateElement 
} from '../../agents/data-requirements-agent.js';
import { nonEmptyStringGenerator, dateGenerator } from './common.generator.js';

/**
 * Generator for DataType enum values
 */
export const dataTypeGenerator = (): fc.Arbitrary<DataType> =>
  fc.constantFrom('string', 'number', 'date', 'boolean', 'decimal', 'integer');

/**
 * Generator for DataGapReason enum values
 */
export const dataGapReasonGenerator = (): fc.Arbitrary<DataGapReason> =>
  fc.constantFrom('no_source', 'partial_source', 'calculation_needed');

/**
 * Generator for TemplateElement (raw template data)
 */
export const templateElementGenerator = (): fc.Arbitrary<TemplateElement> =>
  fc.record({
    fieldId: fc.uuid(),
    fieldName: nonEmptyStringGenerator(),
    description: fc.string({ minLength: 10, maxLength: 200 }),
    dataType: fc.constantFrom('string', 'number', 'date', 'boolean', 'decimal', 'integer', 'varchar', 'int', 'datetime'),
    format: fc.option(nonEmptyStringGenerator()),
    calculationLogic: fc.option(fc.string({ minLength: 5, maxLength: 100 })),
    unit: fc.option(fc.constantFrom('USD', 'CAD', 'EUR', '%', 'bps', 'days')),
    required: fc.boolean()
  });

/**
 * Generator for RegulatoryTemplate
 */
export const regulatoryTemplateGenerator = (): fc.Arbitrary<RegulatoryTemplate> =>
  fc.record({
    reportId: fc.uuid(),
    reportName: nonEmptyStringGenerator(),
    elements: fc.array(templateElementGenerator(), { minLength: 1, maxLength: 20 }),
    version: fc.constantFrom('1.0', '1.1', '2.0', '2.1'),
    effectiveDate: dateGenerator()
  });

/**
 * Generator for DataElement
 */
export const dataElementGenerator = (): fc.Arbitrary<DataElement> =>
  fc.record({
    id: fc.uuid(),
    name: nonEmptyStringGenerator(),
    regulatoryDefinition: fc.string({ minLength: 10, maxLength: 200 }),
    dataType: dataTypeGenerator(),
    format: nonEmptyStringGenerator(),
    calculationLogic: fc.option(fc.string({ minLength: 5, maxLength: 100 })),
    unit: fc.option(fc.constantFrom('USD', 'CAD', 'EUR', '%', 'bps', 'days')),
    mandatory: fc.boolean()
  });

/**
 * Generator for DataField (catalog field)
 */
export const dataFieldGenerator = (): fc.Arbitrary<DataField> =>
  fc.record({
    id: fc.uuid(),
    name: nonEmptyStringGenerator(),
    dataType: dataTypeGenerator(),
    description: fc.option(fc.string({ minLength: 10, maxLength: 100 })),
    businessTerm: fc.option(nonEmptyStringGenerator())
  });

/**
 * Generator for DataTable
 */
export const dataTableGenerator = (): fc.Arbitrary<DataTable> =>
  fc.record({
    id: fc.uuid(),
    name: nonEmptyStringGenerator(),
    fields: fc.array(dataFieldGenerator(), { minLength: 1, maxLength: 10 })
  });

/**
 * Generator for DataSystem
 */
export const dataSystemGenerator = (): fc.Arbitrary<DataSystem> =>
  fc.record({
    id: fc.uuid(),
    name: nonEmptyStringGenerator(),
    tables: fc.array(dataTableGenerator(), { minLength: 1, maxLength: 5 })
  });

/**
 * Generator for DataCatalog
 */
export const dataCatalogGenerator = (): fc.Arbitrary<DataCatalog> =>
  fc.record({
    id: fc.uuid(),
    systems: fc.array(dataSystemGenerator(), { minLength: 1, maxLength: 3 }),
    lastUpdated: dateGenerator()
  });

/**
 * Generator for DataMapping
 */
export const dataMappingGenerator = (): fc.Arbitrary<DataMapping> =>
  fc.record({
    elementId: fc.uuid(),
    sourceSystem: nonEmptyStringGenerator(),
    sourceTable: nonEmptyStringGenerator(),
    sourceField: nonEmptyStringGenerator(),
    transformationLogic: fc.option(fc.string({ minLength: 5, maxLength: 50 })),
    confidence: fc.float({ min: 0, max: 1, noNaN: true }),
    validatedBy: fc.option(nonEmptyStringGenerator())
  });

/**
 * Generator for DataGap
 */
export const dataGapGenerator = (): fc.Arbitrary<DataGap> =>
  fc.record({
    elementId: fc.uuid(),
    elementName: nonEmptyStringGenerator(),
    reason: dataGapReasonGenerator(),
    suggestedResolution: fc.option(fc.string({ minLength: 10, maxLength: 100 }))
  });

/**
 * Generator for RequirementsDocument
 */
export const requirementsDocumentGenerator = (): fc.Arbitrary<RequirementsDocument> =>
  fc.record({
    id: fc.uuid(),
    reportId: fc.uuid(),
    elements: fc.array(dataElementGenerator(), { minLength: 0, maxLength: 10 }),
    mappings: fc.array(dataMappingGenerator(), { minLength: 0, maxLength: 10 }),
    gaps: fc.array(dataGapGenerator(), { minLength: 0, maxLength: 5 }),
    version: fc.integer({ min: 1, max: 100 }),
    status: fc.constantFrom('draft', 'pending_review', 'approved', 'rejected') as fc.Arbitrary<ArtifactStatus>,
    createdAt: dateGenerator(),
    updatedAt: dateGenerator(),
    validatedBy: fc.option(nonEmptyStringGenerator()),
    validatedAt: fc.option(dateGenerator())
  });

/**
 * Generator for a DataCatalog that contains fields matching given elements
 * This creates a catalog where some fields have names similar to the elements
 */
export const matchingCatalogGenerator = (elements: DataElement[]): fc.Arbitrary<DataCatalog> => {
  // Create fields that match some of the elements
  const matchingFields: DataField[] = elements.slice(0, Math.ceil(elements.length / 2)).map(elem => ({
    id: fc.sample(fc.uuid(), 1)[0],
    name: elem.name, // Exact name match
    dataType: elem.dataType,
    description: elem.regulatoryDefinition,
    businessTerm: elem.name
  }));

  return fc.record({
    id: fc.uuid(),
    systems: fc.constant([{
      id: fc.sample(fc.uuid(), 1)[0],
      name: 'MatchingSystem',
      tables: [{
        id: fc.sample(fc.uuid(), 1)[0],
        name: 'MatchingTable',
        fields: matchingFields.length > 0 ? matchingFields : [{
          id: fc.sample(fc.uuid(), 1)[0],
          name: 'DefaultField',
          dataType: 'string' as DataType,
          description: 'Default field'
        }]
      }]
    }]),
    lastUpdated: dateGenerator()
  });
};
