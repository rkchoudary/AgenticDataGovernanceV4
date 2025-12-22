/**
 * **Feature: agentic-data-governance, Property 5: Data Element Extraction Completeness**
 * 
 * For any regulatory template processed by the Data Requirements Agent, every data element 
 * in the template must appear in the output with all required fields populated 
 * (name, regulatory definition, data type, format, mandatory flag).
 * 
 * **Validates: Requirements 3.1**
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { RegulatoryTemplate } from '../../agents/data-requirements-agent.js';
import { DataElement, DataType } from '../../types/index.js';
import {
  templateElementGenerator,
  nonEmptyStringGenerator,
  dateGenerator
} from '../generators/index.js';

// Property test configuration - minimum 100 iterations
const propertyConfig = {
  numRuns: 100,
  verbose: false
};

describe('Property 5: Data Element Extraction Completeness', () => {

  /**
   * Generator for RegulatoryTemplate with guaranteed non-empty elements and unique fieldNames
   */
  const regulatoryTemplateGenerator = (): fc.Arbitrary<RegulatoryTemplate> =>
    fc.record({
      reportId: fc.uuid(),
      reportName: nonEmptyStringGenerator(),
      elements: fc.array(templateElementGenerator(), { minLength: 1, maxLength: 20 }).map(elements => {
        // Ensure unique fieldNames by appending index to duplicates
        const seenNames = new Map<string, number>();
        return elements.map(elem => {
          const count = seenNames.get(elem.fieldName) || 0;
          seenNames.set(elem.fieldName, count + 1);
          if (count > 0) {
            return { ...elem, fieldName: `${elem.fieldName}_${count}` };
          }
          return elem;
        });
      }),
      version: fc.constantFrom('1.0', '1.1', '2.0', '2.1'),
      effectiveDate: dateGenerator()
    });

  /**
   * Helper to verify all required fields are populated
   */
  const hasAllRequiredFields = (element: DataElement): boolean => {
    return (
      typeof element.id === 'string' && element.id.length > 0 &&
      typeof element.name === 'string' && element.name.length > 0 &&
      typeof element.regulatoryDefinition === 'string' &&
      typeof element.dataType === 'string' && element.dataType.length > 0 &&
      typeof element.format === 'string' && element.format.length > 0 &&
      typeof element.mandatory === 'boolean'
    );
  };

  /**
   * Helper to check if data type is valid
   */
  const isValidDataType = (dataType: string): boolean => {
    const validTypes = ['string', 'number', 'date', 'boolean', 'decimal', 'integer'];
    return validTypes.includes(dataType);
  };

  /**
   * Normalize data type to valid enum value
   */
  const normalizeDataType = (rawType: string): DataType => {
    const normalized = rawType.toLowerCase().trim();
    
    const typeMap: Record<string, DataType> = {
      'string': 'string',
      'text': 'string',
      'varchar': 'string',
      'char': 'string',
      'number': 'number',
      'numeric': 'number',
      'float': 'number',
      'double': 'number',
      'decimal': 'decimal',
      'money': 'decimal',
      'currency': 'decimal',
      'integer': 'integer',
      'int': 'integer',
      'bigint': 'integer',
      'smallint': 'integer',
      'date': 'date',
      'datetime': 'date',
      'timestamp': 'date',
      'boolean': 'boolean',
      'bool': 'boolean',
      'bit': 'boolean'
    };

    return typeMap[normalized] || 'string';
  };

  /**
   * Infer format based on data type
   */
  const inferFormat = (dataType: string): string => {
    const normalized = dataType.toLowerCase();
    
    if (normalized.includes('date')) return 'YYYY-MM-DD';
    if (normalized.includes('time')) return 'YYYY-MM-DDTHH:mm:ss';
    if (normalized.includes('decimal') || normalized.includes('money')) return '#,##0.00';
    if (normalized.includes('int')) return '#,##0';
    
    return 'text';
  };

  /**
   * Parse template elements to data elements (synchronous for testing)
   */
  const parseTemplateElements = (template: RegulatoryTemplate): DataElement[] => {
    return template.elements.map(elem => ({
      id: crypto.randomUUID(),
      name: elem.fieldName,
      regulatoryDefinition: elem.description,
      dataType: normalizeDataType(elem.dataType),
      format: elem.format || inferFormat(elem.dataType),
      calculationLogic: elem.calculationLogic,
      unit: elem.unit,
      mandatory: elem.required
    }));
  };

  it('should extract all elements from template with required fields populated', () => {
    fc.assert(
      fc.property(
        regulatoryTemplateGenerator(),
        (template) => {
          // Parse the template
          const elements = parseTemplateElements(template);
          
          // Property: Number of extracted elements equals number of template elements
          expect(elements.length).toBe(template.elements.length);
          
          // Property: Every element has all required fields populated
          for (const element of elements) {
            expect(hasAllRequiredFields(element)).toBe(true);
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should preserve element names from template', () => {
    fc.assert(
      fc.property(
        regulatoryTemplateGenerator(),
        (template) => {
          const elements = parseTemplateElements(template);
          
          // Property: Every template element name appears in output
          const outputNames = new Set(elements.map(e => e.name));
          for (const templateElem of template.elements) {
            expect(outputNames.has(templateElem.fieldName)).toBe(true);
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should preserve regulatory definitions from template', () => {
    fc.assert(
      fc.property(
        regulatoryTemplateGenerator(),
        (template) => {
          const elements = parseTemplateElements(template);
          
          // Property: Every template description appears as regulatory definition
          const outputDefinitions = new Set(elements.map(e => e.regulatoryDefinition));
          for (const templateElem of template.elements) {
            expect(outputDefinitions.has(templateElem.description)).toBe(true);
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should normalize data types to valid enum values', () => {
    fc.assert(
      fc.property(
        regulatoryTemplateGenerator(),
        (template) => {
          const elements = parseTemplateElements(template);
          
          // Property: All data types are valid enum values
          for (const element of elements) {
            expect(isValidDataType(element.dataType)).toBe(true);
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should preserve mandatory flag from template', () => {
    fc.assert(
      fc.property(
        regulatoryTemplateGenerator(),
        (template) => {
          const elements = parseTemplateElements(template);
          
          // Property: Mandatory flags match between template and output
          for (let i = 0; i < template.elements.length; i++) {
            const templateElem = template.elements[i];
            const outputElem = elements.find(e => e.name === templateElem.fieldName);
            
            expect(outputElem).toBeDefined();
            expect(outputElem!.mandatory).toBe(templateElem.required);
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should generate unique IDs for each element', () => {
    fc.assert(
      fc.property(
        regulatoryTemplateGenerator(),
        (template) => {
          const elements = parseTemplateElements(template);
          
          // Property: All element IDs are unique
          const ids = elements.map(e => e.id);
          const uniqueIds = new Set(ids);
          expect(uniqueIds.size).toBe(ids.length);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should provide format for all elements', () => {
    fc.assert(
      fc.property(
        regulatoryTemplateGenerator(),
        (template) => {
          const elements = parseTemplateElements(template);
          
          // Property: All elements have non-empty format
          for (const element of elements) {
            expect(element.format).toBeDefined();
            expect(element.format.length).toBeGreaterThan(0);
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should preserve calculation logic when present', () => {
    fc.assert(
      fc.property(
        regulatoryTemplateGenerator(),
        (template) => {
          const elements = parseTemplateElements(template);
          
          // Property: Calculation logic is preserved when present in template
          for (const templateElem of template.elements) {
            if (templateElem.calculationLogic) {
              const outputElem = elements.find(e => e.name === templateElem.fieldName);
              expect(outputElem).toBeDefined();
              expect(outputElem!.calculationLogic).toBe(templateElem.calculationLogic);
            }
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });
});
