// Simple step by step debug
const testContent = "/api/download/test.json [Download Report](/api/download/test.json) end";

console.log('Testing:', testContent);

// Test each regex individually
console.log('\n1. Backtick regex:');
const backtickRegex = /`(\/api\/download\/[^`]+)`/;
const backtickMatch = testContent.match(backtickRegex);
console.log('Match:', backtickMatch ? backtickMatch[1] : 'No match');

console.log('\n2. Markdown regex:');
const markdownRegex = /\[([^\]]+)\]\((\/api\/download\/[^)]+)\)/;
const markdownMatch = testContent.match(markdownRegex);
console.log('Match:', markdownMatch ? [markdownMatch[1], markdownMatch[2]] : 'No match');

console.log('\n3. Bare URL regex:');
const bareRegex = /(?:^|\s)(\/api\/download\/[^\s\n,]+)/;
const bareMatch = testContent.match(bareRegex);
console.log('Match:', bareMatch ? bareMatch[1] : 'No match');

// The issue is that the bare URL regex matches at position 0
// So it will consume "/api/download/test.json" first
// Then the remaining string is " [Download Report](/api/download/test.json) end"
// The markdown regex should then match the second part

console.log('\n4. After bare URL is consumed:');
const afterBare = testContent.slice(bareMatch.index + bareMatch[0].length);
console.log('Remaining after bare URL:', JSON.stringify(afterBare));

const markdownMatch2 = afterBare.match(markdownRegex);
console.log('Markdown match in remaining:', markdownMatch2 ? [markdownMatch2[1], markdownMatch2[2]] : 'No match');