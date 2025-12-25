// Debug mixed format detection issues
import { parseContent, extractDownloadLinks } from './src/utils/chat-parsing.js';

// Test case 1: Same URL in markdown and backtick format
const testCase1 = '[Download Report](/api/download/FR_2052A_Sample_ABC_Corporation_00000000_000000.json) `/api/download/FR_2052A_Sample_ABC_Corporation_00000000_000000.json` end';

console.log('=== Test Case 1: Same URL in markdown and backtick ===');
console.log('Input:', testCase1);
const parts1 = parseContent(testCase1);
console.log('Parsed parts:', JSON.stringify(parts1, null, 2));
const downloadLinks1 = extractDownloadLinks(parts1);
console.log('Download links found:', downloadLinks1.length);
console.log('Download links:', downloadLinks1);

// Test case 2: Three different formats
const testCase2 = '[Download Report](/api/download/FR_2052A_Sample_ABC_Corporation_00000000_000000.json) `/api/download/FR_2052A_Sample_ABC_Corporation_00000000_000000.json` /api/download/FR_2052A_Sample_ABC_Corporation_00000000_000000.json';

console.log('\n=== Test Case 2: Three different formats ===');
console.log('Input:', testCase2);
const parts2 = parseContent(testCase2);
console.log('Parsed parts:', JSON.stringify(parts2, null, 2));
const downloadLinks2 = extractDownloadLinks(parts2);
console.log('Download links found:', downloadLinks2.length);
console.log('Download links:', downloadLinks2);

// Test case 3: URL with protocol (should NOT be detected)
const testCase3 = '[Download](http://example.com/api/download/file.json)';

console.log('\n=== Test Case 3: URL with protocol (should NOT be detected) ===');
console.log('Input:', testCase3);
const parts3 = parseContent(testCase3);
console.log('Parsed parts:', JSON.stringify(parts3, null, 2));
const downloadLinks3 = extractDownloadLinks(parts3);
console.log('Download links found:', downloadLinks3.length);
console.log('Download links:', downloadLinks3);