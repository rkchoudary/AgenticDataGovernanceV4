// Debug script to test parsing logic
const fs = require('fs');

// Read the parsing utility
const parsingCode = fs.readFileSync('src/utils/chat-parsing.ts', 'utf8');

// Extract just the parseContent function and convert to JS
const parseContentJS = `
function parseContent(content) {
  const parts = []
  let remaining = content

  while (remaining.length > 0) {
    // Check for download links in backticks format: `download_url`
    const backtickDownloadMatch = remaining.match(/`(\\/api\\/download\\/[^`]+)`/)
    if (backtickDownloadMatch && backtickDownloadMatch.index !== undefined) {
      const url = backtickDownloadMatch[1]
      const filename = url.split('/').pop() || 'Download File'
      
      // Split the text before and after the backtick URL
      const beforeUrl = remaining.slice(0, backtickDownloadMatch.index)
      const afterUrl = remaining.slice(backtickDownloadMatch.index + backtickDownloadMatch[0].length)
      
      // Add text before URL if any
      if (beforeUrl) {
        parts.push({ type: 'text', content: beforeUrl })
      }
      
      // Add download link
      parts.push({ 
        type: 'download-link', 
        text: filename, 
        url: url 
      })
      
      // Continue with remaining text
      remaining = afterUrl
      continue
    }

    // Check for download links - enhanced to detect /api/download/ URLs (anywhere in text)
    const downloadLinkMatch = remaining.match(/\\[([^\\]]+)\\]\\((\\/api\\/download\\/[^)]+)\\)/)
    if (downloadLinkMatch && downloadLinkMatch.index !== undefined) {
      const beforeLink = remaining.slice(0, downloadLinkMatch.index)
      const afterLink = remaining.slice(downloadLinkMatch.index + downloadLinkMatch[0].length)
      
      // Add text before link if any
      if (beforeLink) {
        parts.push({ type: 'text', content: beforeLink })
      }
      
      // Add download link
      parts.push({ 
        type: 'download-link', 
        text: downloadLinkMatch[1], 
        url: downloadLinkMatch[2] 
      })
      
      // Continue with remaining text
      remaining = afterLink
      continue
    }

    // Check for bare download URLs in text (enhanced to handle various formats)
    const bareDownloadMatch = remaining.match(/(\\/api\\/download\\/[^\\s\\n,]+)/)
    if (bareDownloadMatch && bareDownloadMatch.index !== undefined) {
      const url = bareDownloadMatch[1]
      const filename = url.split('/').pop() || 'Download File'
      
      // Split the text before and after the URL
      const beforeUrl = remaining.slice(0, bareDownloadMatch.index)
      const afterUrl = remaining.slice(bareDownloadMatch.index + bareDownloadMatch[0].length)
      
      // Add text before URL if any
      if (beforeUrl) {
        parts.push({ type: 'text', content: beforeUrl })
      }
      
      // Add download link
      parts.push({ 
        type: 'download-link', 
        text: filename, 
        url: url 
      })
      
      // Continue with remaining text
      remaining = afterUrl
      continue
    }

    // Regular text
    const nextSpecial = remaining.search(/`|\\[|\\/api\\/download\\//m)
    if (nextSpecial === -1 || nextSpecial === 0) {
      const textEnd = nextSpecial === 0 ? 1 : remaining.length
      parts.push({ type: 'text', content: remaining.slice(0, textEnd) })
      remaining = remaining.slice(textEnd)
    } else {
      parts.push({ type: 'text', content: remaining.slice(0, nextSpecial) })
      remaining = remaining.slice(nextSpecial)
    }
  }

  // Merge consecutive text parts
  const merged = []
  for (const part of parts) {
    const last = merged[merged.length - 1]
    if (part.type === 'text' && last?.type === 'text') {
      last.content += part.content
    } else {
      merged.push(part)
    }
  }

  return merged
}

// Test cases
const testCases = [
  '\`/api/download/FR_2052A_Sample_ABC_Corporation_00000000_000000.json\`',
  '[Download Report](/api/download/test.json)',
  '/api/download/bare-file.csv',
  'Text before \`/api/download/file.json\` text after',
  'http://example.com/api/download/file.json'
];

console.log('Testing parsing logic:');
testCases.forEach((testCase, i) => {
  console.log(\`\\nTest \${i + 1}: \${testCase}\`);
  const parts = parseContent(testCase);
  console.log('Parts:', JSON.stringify(parts, null, 2));
  const downloadLinks = parts.filter(part => part.type === 'download-link');
  console.log('Download links found:', downloadLinks.length);
});
`;

eval(parseContentJS);