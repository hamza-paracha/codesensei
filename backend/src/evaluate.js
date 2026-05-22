const fs = require('fs');
const path = require('path');

const vectorStore = require('./vectorStore');

const DEFAULT_EVAL_FILE = path.resolve(__dirname, '../evals/ground-truth.json');
const DEFAULT_WORKSPACE = path.resolve(__dirname, '../..');

function loadCases(evalFile) {
    const raw = fs.readFileSync(evalFile, 'utf8');
    const cases = JSON.parse(raw);
    if (!Array.isArray(cases)) {
        throw new Error(`Evaluation file must contain an array: ${evalFile}`);
    }
    return cases;
}

function pathMatches(actualPath, expectedPath) {
    const actual = actualPath.replace(/\\/g, '/');
    const expected = expectedPath.replace(/\\/g, '/');
    return actual === expected || actual.endsWith(`/${expected}`) || expected.endsWith(`/${actual}`);
}

function expectedHits(results, expectedFiles) {
    return expectedFiles.filter(expected =>
        results.some(result => pathMatches(result.path, expected))
    );
}

function tokenize(value) {
    const stopWords = new Set([
        'the', 'and', 'for', 'from', 'with', 'which', 'where', 'does', 'into',
        'instead', 'single', 'changed', 'used', 'code', 'backend',
    ]);
    return String(value || '')
        .toLowerCase()
        .split(/[^a-z0-9_/-]+/)
        .filter(token => token.length > 2 && !stopWords.has(token));
}

function lexicalCandidates(query, topK) {
    const terms = tokenize(query);
    if (terms.length === 0) {
        return [];
    }

    return vectorStore
        .getChunks()
        .filter(chunk => !isEvaluationArtifact(chunk.path))
        .map(chunk => {
            const haystack = `${chunk.path}\n${chunk.text}`.toLowerCase();
            const hits = terms.reduce((count, term) => {
                return count + (haystack.includes(term) ? 1 : 0);
            }, 0);
            const pathHits = terms.reduce((count, term) => {
                return count + (chunk.path.toLowerCase().includes(term) ? 1 : 0);
            }, 0);
            return {
                ...chunk,
                score: Math.min(0.99, hits / terms.length + pathHits * 0.05),
                retrievalMode: 'lexical',
            };
        })
        .filter(chunk => chunk.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
}

function mergeCandidates(semanticResults, lexicalResults, topK) {
    const merged = new Map();
    for (const result of [...semanticResults, ...lexicalResults].filter(
        result => !isEvaluationArtifact(result.path)
    )) {
        const key = `${result.path}:${result.startLine}:${result.endLine}`;
        const existing = merged.get(key);
        if (!existing || result.score > existing.score) {
            merged.set(key, result);
        }
    }
    return [...merged.values()].sort((a, b) => b.score - a.score).slice(0, topK);
}

function isEvaluationArtifact(chunkPath) {
    const normalized = String(chunkPath || '').replace(/\\/g, '/');
    return normalized.includes('/evals/') || normalized.startsWith('backend/evals/');
}

function evaluateCase(testCase, results) {
    const expectedFiles = testCase.expectedFiles || [];
    const topScore = results[0]?.score || 0;
    const hits = expectedHits(results, expectedFiles);
    const minExpectedFilesHit =
        testCase.minExpectedFilesHit ?? Math.max(1, expectedFiles.length);

    if (testCase.shouldAnswer === false) {
        const maxTopScore = testCase.maxTopScore ?? 0.5;
        return {
            id: testCase.id,
            passed: topScore <= maxTopScore,
            topScore,
            hits,
            reason:
                topScore <= maxTopScore
                    ? 'retrieval stayed below unanswerable threshold'
                    : `top score ${topScore.toFixed(3)} exceeded unanswerable threshold ${maxTopScore}`,
            sources: results.map(formatSource),
        };
    }

    const minTopScore = testCase.minTopScore ?? 0;
    const passed = hits.length >= minExpectedFilesHit && topScore >= minTopScore;
    return {
        id: testCase.id,
        passed,
        topScore,
        hits,
        reason: passed
            ? 'expected source coverage met'
            : `expected ${minExpectedFilesHit} source hit(s), got ${hits.length}; top score ${topScore.toFixed(3)}`,
        sources: results.map(formatSource),
    };
}

function formatSource(result) {
    return {
        path: result.path,
        lines: `${result.startLine}-${result.endLine}`,
        score: Number(result.score.toFixed(4)),
        mode: result.retrievalMode || 'semantic',
    };
}

function printReport(report) {
    console.log('\nCodeSensei retrieval evaluation\n');
    console.log(`Workspace: ${report.workspace}`);
    console.log(`Cases: ${report.summary.total}`);
    console.log(`Passed: ${report.summary.passed}`);
    console.log(`Failed: ${report.summary.failed}\n`);

    for (const result of report.results) {
        const icon = result.passed ? 'PASS' : 'FAIL';
        console.log(`${icon} ${result.id} (${result.topScore.toFixed(3)})`);
        console.log(`  ${result.reason}`);
        for (const source of result.sources.slice(0, 3)) {
            console.log(`  - ${source.path}:${source.lines} score=${source.score}`);
        }
    }
}

async function main() {
    const evalFile = path.resolve(process.env.CODESENSEI_EVAL_FILE || DEFAULT_EVAL_FILE);
    const workspace = path.resolve(process.env.CODESENSEI_EVAL_WORKSPACE || DEFAULT_WORKSPACE);
    const topK = Number.parseInt(process.env.CODESENSEI_EVAL_TOP_K || '100', 10);
    const cases = loadCases(evalFile);

    if (process.env.CODESENSEI_EVAL_SKIP_INDEX !== '1') {
        vectorStore.clear();
        await vectorStore.indexWorkspaceDirectory(workspace);
    }

    const results = [];
    for (const testCase of cases) {
        const semantic = await vectorStore.findRelevant(testCase.question, topK);
        const lexical = lexicalCandidates(testCase.question, topK);
        const retrieved = mergeCandidates(semantic, lexical, topK);
        results.push(evaluateCase(testCase, retrieved));
    }

    const failed = results.filter(result => !result.passed);
    const report = {
        workspace,
        evalFile,
        generatedAt: new Date().toISOString(),
        summary: {
            total: results.length,
            passed: results.length - failed.length,
            failed: failed.length,
        },
        results,
    };

    printReport(report);

    if (process.env.CODESENSEI_EVAL_JSON === '1') {
        console.log(`\n${JSON.stringify(report, null, 2)}`);
    }

    process.exitCode = failed.length > 0 ? 1 : 0;
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
