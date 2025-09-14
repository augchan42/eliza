#!/usr/bin/env node

/**
 * Simple test script for arXiv functions
 * Run with: node test-arxiv-simple.js
 */

import fs from 'fs';
import { writeFileSync } from 'fs';

// Mock the TwitterDivinationClient for testing
class MockTwitterDivinationClient {
    constructor() {
        this.runtime = {
            agentId: 'test-agent',
            cacheManager: {
                get: async (key) => {
                    console.log(`📥 Cache GET: ${key}`);
                    return null; // Always return null to simulate empty cache
                },
                set: async (key, value) => {
                    console.log(`💾 Cache SET: ${key} (${JSON.stringify(value).length} bytes)`);
                    return true;
                }
            }
        };
        
        this.client = {
            profile: { username: 'test-user' }
        };
    }

    // Test the arXiv API call directly
    async testArxivAPI() {
        console.log('🔬 Testing arXiv API call...');
        
        const query = 'cat:cs.AI';
        const maxResults = 10;
        const url = `http://export.arxiv.org/api/query?search_query=${encodeURIComponent(query)}&sortBy=submittedDate&sortOrder=descending&max_results=${maxResults}`;
        
        try {
            const response = await fetch(url);
            const xmlText = await response.text();
            
            console.log(`✅ API Response: ${xmlText.length} characters`);
            console.log(`🔗 URL: ${url}`);
            
            // Parse some basic info
            const entryCount = (xmlText.match(/<entry>/g) || []).length;
            console.log(`📊 Found ${entryCount} entries`);
            
            // Save raw XML for inspection
            writeFileSync('test-output-raw-arxiv.xml', xmlText);
            console.log('💾 Raw XML saved to test-output-raw-arxiv.xml');
            
            return { success: true, entryCount, responseLength: xmlText.length };
            
        } catch (error) {
            console.error('❌ API test failed:', error);
            return { success: false, error: error.message };
        }
    }

    // Test parsing a small batch
    async testParsing() {
        console.log('🔧 Testing XML parsing...');
        
        let xmlText;
        try {
            xmlText = fs.readFileSync('test-output-raw-arxiv.xml', 'utf8');
        } catch (e) {
            console.log('⚠️  No XML file found. Running API test first...');
            const apiResult = await this.testArxivAPI();
            if (!apiResult.success) return { success: false };
            xmlText = fs.readFileSync('test-output-raw-arxiv.xml', 'utf8');
        }
        
        const papers = [];
        const entryRegex = /<entry>(.*?)<\/entry>/gs;
        const titleRegex = /<title>(.*?)<\/title>/s;
        const summaryRegex = /<summary>(.*?)<\/summary>/s;
        const idRegex = /<id>(.*?)<\/id>/s;
        const publishedRegex = /<published>(.*?)<\/published>/s;
        const authorRegex = /<author>\\s*<name>(.*?)<\/name>/gs;
        
        let match;
        while ((match = entryRegex.exec(xmlText)) !== null) {
            const entryXml = match[1];
            
            const titleMatch = titleRegex.exec(entryXml);
            const summaryMatch = summaryRegex.exec(entryXml);
            const idMatch = idRegex.exec(entryXml);
            const publishedMatch = publishedRegex.exec(entryXml);
            
            if (titleMatch && summaryMatch && idMatch) {
                const authors = [];
                let authorMatch;
                const authorRegexForEntry = /<author>\\s*<name>(.*?)<\/name>/gs;
                while ((authorMatch = authorRegexForEntry.exec(entryXml)) !== null) {
                    authors.push(authorMatch[1].trim());
                }
                
                const abstract = summaryMatch[1]
                    .replace(/<[^>]*>/g, '')
                    .replace(/\\s+/g, ' ')
                    .trim();
                
                const arxivId = idMatch[1].split('/').pop();
                
                papers.push({
                    arxivId: arxivId,
                    title: titleMatch[1].trim(),
                    abstract: abstract,
                    link: `https://arxiv.org/abs/${arxivId}`,
                    publishedDate: publishedMatch ? publishedMatch[1].trim() : new Date().toISOString(),
                    authors: authors.slice(0, 3).join(', ') + (authors.length > 3 ? ' et al.' : ''),
                    category: 'cs.AI'
                });
            }
        }
        
        const results = {
            timestamp: new Date().toISOString(),
            totalParsed: papers.length,
            samplePapers: papers.map(p => ({
                arxivId: p.arxivId,
                title: p.title,
                authors: p.authors,
                abstractLength: p.abstract.length,
                publishedDate: p.publishedDate
            }))
        };
        
        writeFileSync('test-output-parsing.json', JSON.stringify(results, null, 2));
        console.log(`✅ Parsed ${papers.length} papers. Results saved to test-output-parsing.json`);
        
        return { success: true, papers };
    }

    // Test the ranking prompt (mock)
    async testRankingPrompt() {
        console.log('🎯 Testing ranking prompt generation...');
        
        const { papers } = await this.testParsing();
        if (!papers || papers.length === 0) {
            console.log('⚠️  No papers to rank.');
            return { success: false };
        }
        
        const prompt = `You are evaluating research papers for mystical/philosophical divination potential.
Score each paper 0-10 based on these criteria:

1. Universal patterns that mirror ancient wisdom (25%)
2. Emergence, self-organization, complexity themes (20%)
3. Consciousness, observer, information theory (20%)
4. Collective behavior, network effects (15%)
5. Paradoxes, limits, incompleteness (10%)
6. Accessibility for poetic interpretation (10%)

Papers to evaluate:
${papers.map((p, i) => `[${i}] ${p.title}`).join('\\n')}

Return JSON with top papers scoring >= 5.0:
{
  "rankings": [
    {"index": 0, "score": 9.5, "themes": ["emergence", "consciousness"], "reasoning": "why this reveals patterns"},
    {"index": 2, "score": 9.2, "themes": ["quantum", "observer"], "reasoning": "mystical interpretation"},
  ]
}`;

        const promptData = {
            timestamp: new Date().toISOString(),
            paperCount: papers.length,
            promptLength: prompt.length,
            estimatedTokens: Math.round(prompt.length / 4), // Rough estimate
            prompt: prompt,
            papers: papers.map(p => ({
                title: p.title,
                abstractSnippet: p.abstract.substring(0, 100) + '...'
            }))
        };
        
        writeFileSync('test-output-ranking-prompt.json', JSON.stringify(promptData, null, 2));
        console.log(`✅ Generated ranking prompt. Results saved to test-output-ranking-prompt.json`);
        console.log(`📊 Prompt: ${prompt.length} chars, ~${promptData.estimatedTokens} tokens`);
        
        return { success: true, promptData };
    }
}

async function main() {
    console.log('🚀 Starting arXiv integration tests...\\n');
    
    const client = new MockTwitterDivinationClient();
    
    // Test 1: API connectivity
    console.log('=== Test 1: API Connectivity ===');
    const apiResult = await client.testArxivAPI();
    console.log('');
    
    // Test 2: XML parsing
    console.log('=== Test 2: XML Parsing ===');
    const parseResult = await client.testParsing();
    console.log('');
    
    // Test 3: Ranking prompt
    console.log('=== Test 3: Ranking Prompt Generation ===');
    const rankResult = await client.testRankingPrompt();
    console.log('');
    
    // Summary
    console.log('=== Test Summary ===');
    console.log(`API Test: ${apiResult.success ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Parse Test: ${parseResult.success ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Ranking Test: ${rankResult.success ? '✅ PASS' : '❌ FAIL'}`);
    
    console.log('\\n📁 Generated Files:');
    console.log('  - test-output-raw-arxiv.xml (raw API response)');
    console.log('  - test-output-parsing.json (parsed paper data)');
    console.log('  - test-output-ranking-prompt.json (LLM prompt)');
}

if (import.meta.url === new URL(process.argv[1], 'file://').href) {
    main().catch(console.error);
}

export { MockTwitterDivinationClient };