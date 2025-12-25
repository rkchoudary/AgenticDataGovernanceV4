// Debug URL parsing issues
import { parseContent, extractDownloadLinks, countDownloadLinks } from './src/utils/chat-parsing.ts';

// Test case 1: Mixed format with bare URL and backtick
const content1 = "/api/download/FR_2052A_Sample_ABC_Corporation_00000000_000000.json `/api/download/FR_2052A_Sample_ABC_Corporation_00000000_000000.json` end";
console.log("Content 1:", content1);
console.log("Parsed parts:", JSON.stringify(parseContent(content1), null, 2));
console.log("Download links:", extractDownloadLinks(parseContent(content1)));
console.log("Count:", countDownloadLinks(content1));
console.log("---");

// Test case 2: Three different formats
const content2 = "[Download Report](/api/download/FR_2052A_Sample_ABC_Corporation_00000000_000000.json) `/api/download/FR_2052A_Sample_ABC_Corporation_00000000_000000.json` /api/download/FR_2052A_Sample_ABC_Corporation_00000000_000000.json";
console.log("Content 2:", content2);
console.log("Parsed parts:", JSON.stringify(parseContent(content2), null, 2));
console.log("Download links:", extractDownloadLinks(parseContent(content2)));
console.log("Count:", countDownloadLinks(content2));
console.log("---");

// Test case 3: HTTP URL (should not be detected)
const content3 = "[Download](http://example.com/api/download/file.json)";
console.log("Content 3:", content3);
console.log("Parsed parts:", JSON.stringify(parseContent(content3), null, 2));
console.log("Download links:", extractDownloadLinks(parseContent(content3)));
console.log("Count:", countDownloadLinks(content3));