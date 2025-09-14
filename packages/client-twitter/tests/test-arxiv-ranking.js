#!/usr/bin/env node

/**
 * Test script for arXiv paper ranking system
 * Outputs results to JSON files for easy inspection
 */

import { writeFileSync } from 'fs';
import fs from 'fs';

async function testMegaFetch() {
    console.log('Testing mega fetch of arXiv papers...');
    
    // Mock runtime and client
    const mockRuntime = {
        agentId: 'test-agent',
        cacheManager: {
            get: async (key) => null,
            set: async (key, value) => console.log(`Cache set: ${key}`)
        }
    };
    
    const mockClient = {
        profile: { username: 'test-user' }
    };
    
    const divination = new TwitterDivinationClient(mockRuntime, mockClient);
    
    try {
        const papers = await divination.fetchMegaArxivPool();
        
        const results = {
            timestamp: new Date().toISOString(),
            totalPapers: papers.length,
            categories: {},
            samplePapers: papers.slice(0, 10).map(p => ({
                arxivId: p.arxivId,
                title: p.title,
                category: p.category,
                authors: p.authors,
                publishedDate: p.publishedDate,
                abstractLength: p.abstract?.length || 0
            }))
        };
        
        // Count papers by category
        papers.forEach(p => {
            results.categories[p.category] = (results.categories[p.category] || 0) + 1;
        });
        
        // Write results to JSON
        writeFileSync('test-output-mega-fetch.json', JSON.stringify(results, null, 2));
        console.log(`✓ Fetched ${papers.length} papers. Results saved to test-output-mega-fetch.json`);
        
        return papers;
        
    } catch (error) {
        console.error('❌ Mega fetch test failed:', error);
        return [];
    }
}

async function testStackRanking(papers) {
    console.log('Testing stack ranking system...');
    
    if (!papers || papers.length === 0) {
        console.log('⚠️  No papers to rank. Run mega fetch first.');
        return [];
    }
    
    // Mock LLM response for testing
    const mockGenerateText = async ({ context }) => {
        // Return mock ranking data
        const mockRankings = papers.slice(0, Math.min(100, papers.length)).map((p, i) => ({
            index: i,
            score: Math.random() * 5 + 5, // Random score 5-10
            themes: ['consciousness', 'emergence', 'quantum'].slice(0, Math.floor(Math.random() * 3) + 1),
            reasoning: `Paper ${i} has interesting mystical potential`
        })).sort((a, b) => b.score - a.score);
        
        return JSON.stringify({ rankings: mockRankings });
    };
    
    // Replace generateText temporarily
    const originalGenerateText = global.generateText;
    global.generateText = mockGenerateText;
    
    try {
        const mockRuntime = {
            agentId: 'test-agent',
            cacheManager: {
                get: async (key) => null,
                set: async (key, value) => {
                    console.log(`Cache set: ${key} (${JSON.stringify(value).length} bytes)`);  
                    return true;
                }
            }
        };
        
        const mockClient = {
            profile: { username: 'test-user' }
        };
        
        const results = {
            timestamp: new Date().toISOString(),
            inputPapers: papers.length,
            rankedPapers: 50, // Mock value
            topScores: [],
            scoreDistribution: {
                excellent: 5,
                good: 15,
                acceptable: 20,
                poor: 10
            },
            avgScore: 6.5
        };
        
        writeFileSync('test-output-stack-ranking.json', JSON.stringify(results, null, 2));
        console.log(`✓ Mocked ranking of ${papers.length} papers. Results saved to test-output-stack-ranking.json`);
        
        return papers.slice(0, 50); // Return mock ranked papers
        
    } catch (error) {
        console.error('❌ Stack ranking test failed:', error);
        return [];
    } finally {
        global.generateText = originalGenerateText;
    }
}\n\nasync function testFullPipeline() {\n    console.log('Testing full pipeline...');\n    \n    try {\n        const papers = await testMegaFetch();\n        if (papers.length === 0) return;\n        \n        const rankedPapers = await testStackRanking(papers);\n        if (rankedPapers.length === 0) return;\n        \n        // Test selection from ranked pool\n        const mockRuntime = {\n            cacheManager: {\n                get: async (key) => {\n                    if (key.includes('rankedPaperPool')) return rankedPapers;\n                    if (key.includes('arxivPaperHistory')) return [];\n                    if (key.includes('poolMetadata')) return {\n                        fetchedAt: Date.now(),\n                        totalPapers: papers.length,\n                        rankedCount: rankedPapers.length,\n                        topScore: rankedPapers[0]?.qualityScore || 0\n                    };\n                    return null;\n                }\n            }\n        };\n        \n        const mockClient = {\n            profile: { username: 'test-user' }\n        };\n        \n        const divination = new TwitterDivinationClient(mockRuntime, mockClient);\n        const candidates = await divination.selectFromRankedPool(rankedPapers);\n        \n        const pipelineResults = {\n            timestamp: new Date().toISOString(),\n            totalFetched: papers.length,\n            totalRanked: rankedPapers.length,\n            candidatesSelected: candidates.length,\n            topCandidate: candidates[0] ? {\n                arxivId: candidates[0].arxivId,\n                title: candidates[0].title,\n                qualityScore: candidates[0].qualityScore,\n                themes: candidates[0].themes,\n                reasoning: candidates[0].reasoning\n            } : null,\n            allCandidates: candidates.map(c => ({\n                arxivId: c.arxivId,\n                title: c.title,\n                qualityScore: c.qualityScore,\n                ranking: c.ranking\n            }))\n        };\n        \n        writeFileSync('test-output-full-pipeline.json', JSON.stringify(pipelineResults, null, 2));\n        console.log(`✓ Full pipeline test complete. Results saved to test-output-full-pipeline.json`);\n        \n    } catch (error) {\n        console.error('❌ Full pipeline test failed:', error);\n    }\n}\n\nasync function main() {\n    const args = process.argv.slice(2);\n    \n    if (args.includes('--mega-fetch') || args.length === 0) {\n        await testMegaFetch();\n    }\n    \n    if (args.includes('--ranking') || args.length === 0) {\n        // Load papers from previous fetch if available\n        let papers = [];\n        try {\n            const fetchResults = JSON.parse(require('fs').readFileSync('test-output-mega-fetch.json', 'utf8'));\n            // For testing, create mock paper objects\n            papers = Array.from({length: fetchResults.totalPapers}, (_, i) => ({\n                arxivId: `2024.${String(i).padStart(5, '0')}`,\n                title: `Test Paper ${i}: Quantum Consciousness Emergence`,\n                category: 'cs.AI',\n                authors: ['Test Author'],\n                abstract: 'This paper explores the emergence of consciousness in quantum systems...',\n                publishedDate: new Date().toISOString()\n            }));\n        } catch (e) {\n            console.log('No previous fetch results found. Running mega fetch first...');\n            papers = await testMegaFetch();\n        }\n        \n        await testStackRanking(papers);\n    }\n    \n    if (args.includes('--full-pipeline')) {\n        await testFullPipeline();\n    }\n    \n    console.log('\\n📁 Check the following files for results:');\n    console.log('  - test-output-mega-fetch.json');\n    console.log('  - test-output-stack-ranking.json');\n    console.log('  - test-output-full-pipeline.json');\n}\n\nif (require.main === module) {\n    main().catch(console.error);\n}