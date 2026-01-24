
const testCases = [
    { text: "I can help with a few things like checking your balance, looking up transactions, or helping with disputes.", shouldMatch: false },
    { text: "I'll check that for you right now.", shouldMatch: true },
    { text: "Let me check the status of your claim.", shouldMatch: true },
    { text: "Checking your account details...", shouldMatch: true },
    { text: "I am verifying your identity.", shouldMatch: true },
    { text: "Just a moment while I access your records.", shouldMatch: true },
    { text: "Bear with me for a second.", shouldMatch: true },
    { text: "I can check your balance if you like.", shouldMatch: false }, // "I can check" is an offer, not commitment? Or is it? usually "I can check" -> wait for user to say "yes". So NO wait.
    { text: "Verifying that information...", shouldMatch: true },
    { text: "I'm checking the database.", shouldMatch: true },
    { text: "You can check your balance in the app.", shouldMatch: false },
    { text: "checking is what I do best", shouldMatch: false }
];

const patterns = [
    /\b(I'll|I will|let me|allow me to|gonna|going to)\s+(check|verify|look up|access|search|pull up|get|find)\b/i,
    /\b(I'm|I am)\s+(checking|verifying|accessing|searching|pulling up|looking up)\b/i,
    /^\s*(Checking|Verifying|Accessing|Searching|Looking up|Pulling up)\b/i,
    /\b(just a moment|bear with me|one moment|hold on)\b/i
];

console.log("Running Regex Tests...");
let failed = false;

testCases.forEach((tc, i) => {
    const matched = patterns.some(p => p.test(tc.text));
    const pass = matched === tc.shouldMatch;
    console.log(`[${pass ? 'PASS' : 'FAIL'}] "${tc.text}" -> Matched: ${matched}, Expected: ${tc.shouldMatch}`);
    if (!pass) failed = true;
});

if (failed) process.exit(1);
console.log("All tests passed!");
