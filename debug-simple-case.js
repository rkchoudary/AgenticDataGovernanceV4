// Simple test of the failing case
const testContent = "/api/download/FR_2052A_Sample_ABC_Corporation_00000000_000000.json [Download Report](/api/download/FR_2052A_Sample_ABC_Corporation_00000000_000000.json) end";

console.log('Testing:', testContent);

// Test bare URL regex
const bareRegex = /(?:^|\s)(\/api\/download\/[^\s\n,]+)/;
const bareMatch = testContent.match(bareRegex);
console.log('Bare URL match:', bareMatch);

// Test markdown regex
const markdownRegex = /\[([^\]]+)\]\((\/api\/download\/[^)]+)\)/;
const markdownMatch = testContent.match(markdownRegex);
console.log('Markdown match:', markdownMatch);

// The issue is that both regexes match the same URL!
// The bare URL regex matches at the beginning: "/api/download/..."
// The markdown regex matches later: "[Download Report](/api/download/...)"

// But they're the same URL, so we should only count it once
const bareUrl = bareMatch ? bareMatch[1] : null;
const markdownUrl = markdownMatch ? markdownMatch[2] : null;

console.log('Bare URL:', bareUrl);
console.log('Markdown URL:', markdownUrl);
console.log('Same URL?', bareUrl === markdownUrl);