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
}

async function testFullPipeline() {
    console.log('Testing full pipeline...');

    try {
        const papers = await testMegaFetch();
        if (papers.length === 0) return;

        const rankedPapers = await testStackRanking(papers);
        if (rankedPapers.length === 0) return;

        // Test selection from ranked pool
        const mockRuntime = {
            cacheManager: {
                get: async (key) => {
                    if (key.includes('rankedPaperPool')) return rankedPapers;
                    if (key.includes('arxivPaperHistory')) return [];
                    if (key.includes('poolMetadata')) return {
                        fetchedAt: Date.now(),
                        totalPapers: papers.length,
                        rankedCount: rankedPapers.length,
                        topScore: rankedPapers[0]?.qualityScore || 0
                    };
                    return null;
                }
            }
        };

        const mockClient = {
            profile: { username: 'test-user' }
        };

        const divination = new TwitterDivinationClient(mockRuntime, mockClient);
        const candidates = await divination.selectFromRankedPool(rankedPapers);

        const pipelineResults = {
            timestamp: new Date().toISOString(),
            totalFetched: papers.length,
            totalRanked: rankedPapers.length,
            candidatesSelected: candidates.length,
            topCandidate: candidates[0] ? {
                arxivId: candidates[0].arxivId,
                title: candidates[0].title,
                qualityScore: candidates[0].qualityScore,
                themes: candidates[0].themes,
                reasoning: candidates[0].reasoning
            } : null,
            allCandidates: candidates.map(c => ({
                arxivId: c.arxivId,
                title: c.title,
                qualityScore: c.qualityScore,
                ranking: c.ranking
            }))
        };

        writeFileSync('test-output-full-pipeline.json', JSON.stringify(pipelineResults, null, 2));
        console.log('✓ Full pipeline test complete. Results saved to test-output-full-pipeline.json');

    } catch (error) {
        console.error('❌ Full pipeline test failed:', error);
    }
}

async function main() {
    const args = process.argv.slice(2);

    if (args.includes('--mega-fetch') || args.length === 0) {
        await testMegaFetch();
    }

    if (args.includes('--ranking') || args.length === 0) {
        // Load papers from previous fetch if available
        let papers = [];
        try {
            const fetchResults = JSON.parse(require('fs').readFileSync('test-output-mega-fetch.json', 'utf8'));
            // For testing, create mock paper objects
            papers = Array.from({length: fetchResults.totalPapers}, (_, i) => ({
                arxivId: `2024.${String(i).padStart(5, '0')}`,
                title: `Test Paper ${i}: Quantum Consciousness Emergence`,
                category: 'cs.AI',
                authors: ['Test Author'],
                abstract: 'This paper explores the emergence of consciousness in quantum systems...',
                publishedDate: new Date().toISOString()
            }));
        } catch (e) {
            console.log('No previous fetch results found. Running mega fetch first...');
            papers = await testMegaFetch();
        }

        await testStackRanking(papers);
    }

    if (args.includes('--full-pipeline')) {
        await testFullPipeline();
    }

    console.log('\n📁 Check the following files for results:');
    console.log('  - test-output-mega-fetch.json');
    console.log('  - test-output-stack-ranking.json');
    console.log('  - test-output-full-pipeline.json');
}

if (require.main === module) {
    main().catch(console.error);
}