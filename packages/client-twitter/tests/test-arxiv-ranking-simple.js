#!/usr/bin/env node

/**
 * Simple test script for arXiv paper ranking system
 * Outputs results to JSON files for easy inspection
 */

import { writeFileSync } from 'fs';
import fs from 'fs';

async function testMegaFetch() {
    console.log('Testing mega fetch of arXiv papers...');
    
    try {
        // Mock a successful fetch
        const mockPapers = Array.from({length: 50}, (_, i) => ({
            arxivId: `2025.${String(i).padStart(5, '0')}`,
            title: `Test Paper ${i}: Advanced AI Research`,
            category: 'cs.AI',
            authors: ['Test Author'],
            abstract: `This paper explores advanced concepts in artificial intelligence research, focusing on novel approaches to machine learning and neural networks. Paper ${i} demonstrates significant improvements in model performance.`,
            publishedDate: new Date().toISOString(),
            link: `https://arxiv.org/abs/2025.${String(i).padStart(5, '0')}`
        }));
        
        const results = {
            timestamp: new Date().toISOString(),
            totalPapers: mockPapers.length,
            categories: {
                'cs.AI': mockPapers.length
            },
            samplePapers: mockPapers.slice(0, 10).map(p => ({
                arxivId: p.arxivId,
                title: p.title,
                category: p.category,
                authors: p.authors,
                publishedDate: p.publishedDate,
                abstractLength: p.abstract?.length || 0
            }))
        };
        
        writeFileSync('test-output-mega-fetch.json', JSON.stringify(results, null, 2));
        console.log(`✓ Mocked fetch of ${mockPapers.length} papers. Results saved to test-output-mega-fetch.json`);
        
        return mockPapers;
        
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
    
    try {
        // Mock ranking results
        const rankedPapers = papers.map((paper, i) => ({
            ...paper,
            qualityScore: Math.random() * 5 + 5, // Random score 5-10
            ranking: i + 1,
            themes: ['consciousness', 'emergence', 'quantum'].slice(0, Math.floor(Math.random() * 3) + 1),
            reasoning: `Paper ${i} demonstrates interesting patterns relevant to divination`
        })).sort((a, b) => b.qualityScore - a.qualityScore);
        
        const results = {
            timestamp: new Date().toISOString(),
            inputPapers: papers.length,
            rankedPapers: rankedPapers.length,
            topScores: rankedPapers.slice(0, 20).map(p => ({
                arxivId: p.arxivId,
                title: p.title,
                qualityScore: p.qualityScore,
                ranking: p.ranking,
                themes: p.themes,
                reasoning: p.reasoning
            })),
            scoreDistribution: {
                excellent: rankedPapers.filter(p => p.qualityScore >= 9).length,
                good: rankedPapers.filter(p => p.qualityScore >= 7 && p.qualityScore < 9).length,
                acceptable: rankedPapers.filter(p => p.qualityScore >= 5 && p.qualityScore < 7).length,
                poor: rankedPapers.filter(p => p.qualityScore < 5).length
            },
            avgScore: rankedPapers.reduce((sum, p) => sum + p.qualityScore, 0) / rankedPapers.length
        };
        
        writeFileSync('test-output-stack-ranking.json', JSON.stringify(results, null, 2));
        console.log(`✓ Ranked ${rankedPapers.length} papers. Results saved to test-output-stack-ranking.json`);
        
        return rankedPapers;
        
    } catch (error) {
        console.error('❌ Stack ranking test failed:', error);
        return [];
    }
}

async function testFullPipeline() {
    console.log('Testing full pipeline...');
    
    try {
        const papers = await testMegaFetch();
        if (papers.length === 0) return;
        
        const rankedPapers = await testStackRanking(papers);
        if (rankedPapers.length === 0) return;
        
        // Mock selection results
        const candidates = rankedPapers.slice(0, 5);
        
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
        console.log(`✓ Full pipeline test complete. Results saved to test-output-full-pipeline.json`);
        
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
            const fetchResults = JSON.parse(fs.readFileSync('test-output-mega-fetch.json', 'utf8'));
            // For testing, create mock paper objects
            papers = Array.from({length: fetchResults.totalPapers}, (_, i) => ({
                arxivId: `2025.${String(i).padStart(5, '0')}`,
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

if (import.meta.url === new URL(process.argv[1], 'file://').href) {
    main().catch(console.error);
}