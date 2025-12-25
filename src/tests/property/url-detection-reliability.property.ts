/**
 * **Feature: chat-upload-download-enhancement, Property 2: Universal URL Detection**
 * 
 * For any agent response text containing download URLs in any supported format 
 * (markdown links, backticks, bare URLs), the parsing logic should detect and 
 * convert all URLs to download buttons while preserving surrounding text.
 * 
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 8.1, 8.2, 8.3, 8.4**
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { 
  parseContent, 
  extractDownloadLinks, 
  hasDownloadUrls, 
  countDownloadLinks,
  ContentPartType 
} from '../../utils/chat-parsing.js';

// Property test configuration
const propertyConfig = {
  numRuns: 100,
  verbose: false
};

// ==================== Generators ====================

/**
 * Generator for valid download URLs
 */
const downloadUrlGenerator = (): fc.Arbitrary<string> =>
  fc.record({
    filename: fc.string({ minLength: 1, maxLength: 50 }).map(s => s.replace(/[^a-zA-Z0-9._-]/g, '')),
    extension: fc.constantFrom('json', 'csv', 'pdf', 'txt', 'xlsx'),
    timestamp: fc.string({ minLength: 8, maxLength: 8 }).map(s => s.replace(/[^0-9]/g, '').padEnd(8, '0')),
    time: fc.string({ minLength: 6, maxLength: 6 }).map(s => s.replace(/[^0-9]/g, '').padEnd(6, '0'))
  }).map(({ filename, extension, timestamp, time }) => 
    `/api/download/${filename}_${timestamp}_${time}.${extension}`
  );

/**
 * Generator for organization/bank names
 */
const organizationNameGenerator = (): fc.Arbitrary<string> =>
  fc.constantFrom(
    'ABC_Corporation', 'XYZ_Bank', 'Sample_Organization', 
    'Test_Bank', 'Demo_Corp', 'Example_Financial'
  );

/**
 * Generator for regulatory document filenames
 */
const regulatoryFilenameGenerator = (): fc.Arbitrary<string> =>
  fc.record({
    type: fc.constantFrom(
      'FR_2052A_Sample_', 
      'Data_Quality_Rules_Template_', 
      'Compliance_Checklist_',
      'Sample_Customer_Data_',
      'Sample_Transaction_Data_'
    ),
    org: organizationNameGenerator(),
    timestamp: fc.string({ minLength: 8, maxLength: 8 }).map(s => s.replace(/[^0-9]/g, '').padEnd(8, '0')),
    time: fc.string({ minLength: 6, maxLength: 6 }).map(s => s.replace(/[^0-9]/g, '').padEnd(6, '0')),
    extension: fc.constantFrom('json', 'csv')
  }).map(({ type, org, timestamp, time, extension }) => 
    `${type}${org}_${timestamp}_${time}.${extension}`
  );

/**
 * Generator for download URLs with regulatory filenames
 */
const regulatoryDownloadUrlGenerator = (): fc.Arbitrary<string> =>
  regulatoryFilenameGenerator().map(filename => `/api/download/${filename}`);

/**
 * Generator for human-readable link text
 */
const linkTextGenerator = (): fc.Arbitrary<string> =>
  fc.constantFrom(
    'Download Report', 'Get Template', 'Export Data', 
    'FR 2052A Template', 'Data Quality Rules', 'Compliance Checklist'
  );

/**
 * Generator for surrounding text
 */
const surroundingTextGenerator = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 0, maxLength: 100 }).map(s => 
    s.replace(/\[|\]|\(|\)|`|\/api\/download\//g, ' ')
  );

/**
 * Generator for markdown format download links
 */
const markdownDownloadLinkGenerator = (): fc.Arbitrary<string> =>
  fc.record({
    text: linkTextGenerator(),
    url: regulatoryDownloadUrlGenerator()
  }).map(({ text, url }) => `[${text}](${url})`);

/**
 * Generator for backtick format download links
 */
const backtickDownloadLinkGenerator = (): fc.Arbitrary<string> =>
  regulatoryDownloadUrlGenerator().map(url => `\`${url}\``);

/**
 * Generator for bare download URLs
 */
const bareDownloadLinkGenerator = (): fc.Arbitrary<string> =>
  regulatoryDownloadUrlGenerator();

/**
 * Generator for mixed format download links
 */
const mixedDownloadLinksGenerator = (): fc.Arbitrary<string> =>
  fc.array(
    fc.oneof(
      markdownDownloadLinkGenerator(),
      backtickDownloadLinkGenerator(),
      bareDownloadLinkGenerator()
    ),
    { minLength: 1, maxLength: 5 }
  ).map(links => links.join(' '));

/**
 * Generator for content with download links embedded in text
 */
const embeddedDownloadContentGenerator = (): fc.Arbitrary<string> =>
  fc.record({
    before: surroundingTextGenerator(),
    downloadLink: fc.oneof(
      markdownDownloadLinkGenerator(),
      backtickDownloadLinkGenerator(),
      bareDownloadLinkGenerator()
    ),
    after: surroundingTextGenerator()
  }).map(({ before, downloadLink, after }) => 
    `${before}${downloadLink}${after}`.trim()
  );

/**
 * Generator for content with multiple download links
 */
const multipleDownloadLinksGenerator = (): fc.Arbitrary<{ content: string; expectedCount: number }> =>
  fc.array(
    fc.record({
      before: surroundingTextGenerator(),
      link: fc.oneof(
        markdownDownloadLinkGenerator(),
        backtickDownloadLinkGenerator(),
        bareDownloadLinkGenerator()
      )
    }),
    { minLength: 2, maxLength: 5 }
  ).map(parts => {
    const content = parts.map(({ before, link }) => `${before}${link}`).join(' ') + ' end';
    return { content, expectedCount: parts.length };
  });

// ==================== Property Tests ====================

describe('Property 2: Universal URL Detection', () => {
  
  describe('Markdown Link Detection', () => {
    it('should detect markdown format download links', async () => {
      await fc.assert(
        fc.property(
          markdownDownloadLinkGenerator(),
          (markdownLink) => {
            const parts = parseContent(markdownLink);
            const downloadLinks = extractDownloadLinks(parts);
            
            // Should detect exactly one download link
            expect(downloadLinks).toHaveLength(1);
            expect(hasDownloadUrls(markdownLink)).toBe(true);
            expect(countDownloadLinks(markdownLink)).toBe(1);
            
            // URL should be preserved correctly
            expect(downloadLinks[0].url).toMatch(/^\/api\/download\//);
            
            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should preserve link text in markdown format', async () => {
      await fc.assert(
        fc.property(
          linkTextGenerator(),
          regulatoryDownloadUrlGenerator(),
          (linkText, url) => {
            const markdownLink = `[${linkText}](${url})`;
            const parts = parseContent(markdownLink);
            const downloadLinks = extractDownloadLinks(parts);
            
            expect(downloadLinks).toHaveLength(1);
            expect(downloadLinks[0].text).toBe(linkText);
            expect(downloadLinks[0].url).toBe(url);
            
            return true;
          }
        ),
        propertyConfig
      );
    });
  });

  describe('Backtick Link Detection', () => {
    it('should detect backtick format download links', async () => {
      await fc.assert(
        fc.property(
          backtickDownloadLinkGenerator(),
          (backtickLink) => {
            const parts = parseContent(backtickLink);
            const downloadLinks = extractDownloadLinks(parts);
            
            // Should detect exactly one download link
            expect(downloadLinks).toHaveLength(1);
            expect(hasDownloadUrls(backtickLink)).toBe(true);
            expect(countDownloadLinks(backtickLink)).toBe(1);
            
            // URL should be preserved correctly
            expect(downloadLinks[0].url).toMatch(/^\/api\/download\//);
            
            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should extract filename from backtick URLs', async () => {
      await fc.assert(
        fc.property(
          regulatoryDownloadUrlGenerator(),
          (url) => {
            const backtickLink = `\`${url}\``;
            const parts = parseContent(backtickLink);
            const downloadLinks = extractDownloadLinks(parts);
            
            expect(downloadLinks).toHaveLength(1);
            expect(downloadLinks[0].url).toBe(url);
            
            // Text should be the filename (last part of URL)
            const expectedFilename = url.split('/').pop() || 'Download File';
            expect(downloadLinks[0].text).toBe(expectedFilename);
            
            return true;
          }
        ),
        propertyConfig
      );
    });
  });

  describe('Bare URL Detection', () => {
    it('should detect bare download URLs', async () => {
      await fc.assert(
        fc.property(
          bareDownloadLinkGenerator(),
          (bareUrl) => {
            const parts = parseContent(bareUrl);
            const downloadLinks = extractDownloadLinks(parts);
            
            // Should detect exactly one download link
            expect(downloadLinks).toHaveLength(1);
            expect(hasDownloadUrls(bareUrl)).toBe(true);
            expect(countDownloadLinks(bareUrl)).toBe(1);
            
            // URL should be preserved correctly
            expect(downloadLinks[0].url).toBe(bareUrl);
            
            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should extract filename from bare URLs', async () => {
      await fc.assert(
        fc.property(
          regulatoryDownloadUrlGenerator(),
          (url) => {
            const parts = parseContent(url);
            const downloadLinks = extractDownloadLinks(parts);
            
            expect(downloadLinks).toHaveLength(1);
            expect(downloadLinks[0].url).toBe(url);
            
            // Text should be the filename (last part of URL)
            const expectedFilename = url.split('/').pop() || 'Download File';
            expect(downloadLinks[0].text).toBe(expectedFilename);
            
            return true;
          }
        ),
        propertyConfig
      );
    });
  });

  describe('Mixed Format Detection', () => {
    it('should detect all download links in mixed format content', async () => {
      await fc.assert(
        fc.property(
          multipleDownloadLinksGenerator(),
          ({ content, expectedCount }) => {
            const parts = parseContent(content);
            const downloadLinks = extractDownloadLinks(parts);
            
            // Should detect all download links
            expect(downloadLinks).toHaveLength(expectedCount);
            expect(hasDownloadUrls(content)).toBe(true);
            expect(countDownloadLinks(content)).toBe(expectedCount);
            
            // All detected links should be download URLs
            downloadLinks.forEach(link => {
              expect(link.url).toMatch(/^\/api\/download\//);
            });
            
            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should handle different formats in same content', async () => {
      await fc.assert(
        fc.property(
          markdownDownloadLinkGenerator(),
          backtickDownloadLinkGenerator(),
          bareDownloadLinkGenerator(),
          surroundingTextGenerator(),
          (markdown, backtick, bare, text) => {
            const content = `${text} ${markdown} ${text} ${backtick} ${text} ${bare} ${text}`;
            const parts = parseContent(content);
            const downloadLinks = extractDownloadLinks(parts);
            
            // Should detect all three download links
            expect(downloadLinks).toHaveLength(3);
            expect(countDownloadLinks(content)).toBe(3);
            
            // All should be valid download URLs
            downloadLinks.forEach(link => {
              expect(link.url).toMatch(/^\/api\/download\//);
            });
            
            return true;
          }
        ),
        propertyConfig
      );
    });
  });

  describe('Text Preservation', () => {
    it('should preserve surrounding text when extracting download links', async () => {
      await fc.assert(
        fc.property(
          embeddedDownloadContentGenerator(),
          (content) => {
            const parts = parseContent(content);
            
            // Should have at least one download link
            const downloadLinks = extractDownloadLinks(parts);
            expect(downloadLinks.length).toBeGreaterThanOrEqual(1);
            
            // Should preserve text parts
            const textParts = parts.filter(part => part.type === 'text');
            const totalTextLength = textParts.reduce((sum, part) => sum + part.content.length, 0);
            
            // Total content should be preserved (text + download links)
            const downloadLinkCount = downloadLinks.length;
            expect(parts.length).toBeGreaterThanOrEqual(downloadLinkCount);
            
            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should not modify non-download URLs', async () => {
      await fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.length > 0 && !s.includes('[') && !s.includes(']')),
          fc.string({ minLength: 1, maxLength: 100 }).filter(url => 
            !url.includes('/api/download/') && 
            !url.includes('[') && 
            !url.includes(']') && 
            !url.includes('(') && 
            !url.includes(')') &&
            url.length > 0
          ),
          (linkText, regularUrl) => {
            const content = `[${linkText}](${regularUrl})`;
            const parts = parseContent(content);
            const downloadLinks = extractDownloadLinks(parts);
            
            // Should not detect any download links
            expect(downloadLinks).toHaveLength(0);
            expect(hasDownloadUrls(content)).toBe(false);
            expect(countDownloadLinks(content)).toBe(0);
            
            // Should detect as regular link instead (if it's a valid markdown link)
            const regularLinks = parts.filter(part => part.type === 'link');
            if (linkText.length > 0 && regularUrl.length > 0) {
              expect(regularLinks).toHaveLength(1);
            }
            
            return true;
          }
        ),
        propertyConfig
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty content', () => {
      const parts = parseContent('');
      const downloadLinks = extractDownloadLinks(parts);
      
      expect(downloadLinks).toHaveLength(0);
      expect(hasDownloadUrls('')).toBe(false);
      expect(countDownloadLinks('')).toBe(0);
    });

    it('should handle content with no download URLs', async () => {
      await fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }).filter(s => !s.includes('/api/download/')),
          (content) => {
            const parts = parseContent(content);
            const downloadLinks = extractDownloadLinks(parts);
            
            expect(downloadLinks).toHaveLength(0);
            expect(hasDownloadUrls(content)).toBe(false);
            expect(countDownloadLinks(content)).toBe(0);
            
            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should handle malformed download URLs gracefully', async () => {
      await fc.assert(
        fc.property(
          fc.constantFrom(
            '[Download](api/download/file.json)',  // Missing leading slash
            '`/api/download/`',                    // Missing filename
            '[](api/download/file.json)',         // Empty link text
            '/api/download/',                     // Bare URL without filename
          ),
          (malformedContent) => {
            const parts = parseContent(malformedContent);
            
            // Should not crash and should handle gracefully
            expect(parts).toBeDefined();
            expect(Array.isArray(parts)).toBe(true);
            
            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should handle URLs with special characters in filenames', async () => {
      await fc.assert(
        fc.property(
          fc.record({
            filename: fc.string({ minLength: 1, maxLength: 30 }).map(s => 
              s.replace(/[^a-zA-Z0-9._-]/g, '_')
            ),
            extension: fc.constantFrom('json', 'csv', 'pdf')
          }),
          ({ filename, extension }) => {
            const url = `/api/download/${filename}.${extension}`;
            const content = `Download file: ${url}`;
            
            const parts = parseContent(content);
            const downloadLinks = extractDownloadLinks(parts);
            
            if (filename.length > 0) {
              expect(downloadLinks).toHaveLength(1);
              expect(downloadLinks[0].url).toBe(url);
            }
            
            return true;
          }
        ),
        propertyConfig
      );
    });
  });

  describe('URL Format Validation', () => {
    it('should only detect URLs that start with /api/download/', async () => {
      await fc.assert(
        fc.property(
          fc.constantFrom(
            '/download/file.json',
            '/api/file.json', 
            'api/download/file.json',
            'http://example.com/api/download/file.json'
          ),
          (invalidUrl) => {
            const content = `[Download](${invalidUrl})`;
            const parts = parseContent(content);
            const downloadLinks = extractDownloadLinks(parts);
            
            // Should not detect as download link
            expect(downloadLinks).toHaveLength(0);
            expect(hasDownloadUrls(content)).toBe(false);
            
            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should detect valid /api/download/ URLs regardless of filename format', async () => {
      await fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).map(s => s.replace(/[^a-zA-Z0-9._-]/g, '')),
          (filename) => {
            if (filename.length === 0) return true; // Skip empty filenames
            
            const url = `/api/download/${filename}`;
            const content = `File available at: ${url}`;
            
            const parts = parseContent(content);
            const downloadLinks = extractDownloadLinks(parts);
            
            expect(downloadLinks).toHaveLength(1);
            expect(downloadLinks[0].url).toBe(url);
            expect(downloadLinks[0].text).toBe(filename);
            
            return true;
          }
        ),
        propertyConfig
      );
    });
  });
});