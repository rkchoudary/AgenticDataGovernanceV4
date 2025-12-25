// Debug bare URL regex
const testCases = [
  '/api/download/test.json',
  'http://example.com/api/download/file.json',
  'Check this file: /api/download/report.csv',
  'Visit http://example.com/api/download/data.json for more info'
];

// Current regex
const currentRegex = /(?:^|\s)(\/api\/download\/[^\s\n,]+)/;

console.log('Testing current regex:');
testCases.forEach((test, i) => {
  const match = test.match(currentRegex);
  console.log(`${i + 1}. "${test}"`);
  console.log(`   Match:`, match ? match[1] : 'No match');
  console.log('');
});

// Better regex that only matches at start or after whitespace
const betterRegex = /(?:^|\s)(\/api\/download\/[^\s\n,]+)(?=\s|$)/;

console.log('Testing better regex:');
testCases.forEach((test, i) => {
  const match = test.match(betterRegex);
  console.log(`${i + 1}. "${test}"`);
  console.log(`   Match:`, match ? match[1] : 'No match');
  console.log('');
});