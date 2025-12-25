// Simple debug script to test backtick regex
const testContent = '`/api/download/FR_2052A_Sample_ABC_Corporation_00000000_000000.json`';

console.log('Testing content:', testContent);

// Test the backtick regex
const backtickRegex = /`(\/api\/download\/[^`]+)`/;
const match = testContent.match(backtickRegex);

console.log('Regex match:', match);

if (match) {
  console.log('URL found:', match[1]);
  console.log('Filename:', match[1].split('/').pop());
} else {
  console.log('No match found');
}

// Test if the issue is with the regex itself
const simpleTest = '`/api/download/test.json`';
const simpleMatch = simpleTest.match(backtickRegex);
console.log('Simple test match:', simpleMatch);

// Test the original MessageBubble regex
const originalRegex = /`(\/api\/download\/[^`]+)`/;
const originalMatch = testContent.match(originalRegex);
console.log('Original regex match:', originalMatch);