// Debug step by step parsing
import { parseContent } from './src/utils/chat-parsing.ts';

// Test the first bare URL case
const content1 = "/api/download/FR_2052A_Sample_ABC_Corporation_00000000_000000.json ";
console.log("Testing bare URL at start:");
console.log("Content:", JSON.stringify(content1));

// Test the regex directly
const bareDownloadMatch = content1.match(/(^|\s)(\/api\/download\/[^\s\n,)]+)(?=\s|$|[,\n)]/);
console.log("Bare download match:", bareDownloadMatch);

// Test the markdown link case
const content2 = "[Download Report](/api/download/FR_2052A_Sample_ABC_Corporation_00000000_000000.json)";
console.log("\nTesting markdown link:");
console.log("Content:", JSON.stringify(content2));

// Test the regex directly
const downloadLinkMatch = content2.match(/\[([^\]]+)\]\((\/api\/download\/[^)]+)\)/);
console.log("Download link match:", downloadLinkMatch);

// Test parsing
console.log("\nParsing results:");
console.log("Content1 parsed:", JSON.stringify(parseContent(content1), null, 2));
console.log("Content2 parsed:", JSON.stringify(parseContent(content2), null, 2));