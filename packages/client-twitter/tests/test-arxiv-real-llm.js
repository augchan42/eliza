#!/usr/bin/env node

/**
 * Real end-to-end test with actual arXiv data and LLM ranking calls
 * Uses OpenRouter API with qwen/qwen3-next-80b-a3b-instruct
 */

import { writeFileSync } from 'fs';
import { config } from 'dotenv';

// Load environment variables
config({ path: '../../../.env' });

class RealArxivTest {
    constructor() {
        this.apiKey = process.env.OPENROUTER_API_KEY;
        if (!this.apiKey) {
            throw new Error('OPENROUTER_API_KEY not found in environment');
        }
        console.log('🔑 OpenRouter API key loaded');
    }

    async fetchRealArxivPapers(category = 'cs.AI', maxResults = 20) {
        console.log(`🔬 Fetching ${maxResults} real papers from arXiv ${category}...`);
        
        const url = `http://export.arxiv.org/api/query?search_query=cat:${category}&sortBy=submittedDate&sortOrder=descending&max_results=${maxResults}`;
        
        try {
            const response = await fetch(url);
            const xmlText = await response.text();
            
            console.log(`📊 Received ${xmlText.length} characters from arXiv`);
            
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
                        category: category
                    });
                }
                
                if (papers.length >= maxResults) break;
            }
            
            console.log(`✅ Parsed ${papers.length} real papers from arXiv`);
            return papers;
            
        } catch (error) {
            console.error('❌ arXiv fetch failed:', error);
            return [];
        }
    }

    async callOpenRouterLLM(prompt) {
        console.log(`🤖 Calling OpenRouter LLM (${prompt.length} chars)...`);
        
        try {
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'X-Title': 'ArXiv Paper Ranking Test'
                },
                body: JSON.stringify({
                    model: 'qwen/qwen3-next-80b-a3b-instruct',
                    messages: [
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    temperature: 0.7,
                    max_tokens: 4000
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`OpenRouter API error: ${response.status} ${response.statusText} - ${errorText}`);
            }

            const data = await response.json();
            const content = data.choices[0]?.message?.content;
            
            if (!content) {
                throw new Error('No content in LLM response');
            }

            console.log(`✅ LLM response received (${content.length} chars)`);
            return content;
            
        } catch (error) {
            console.error('❌ OpenRouter LLM call failed:', error);
            throw error;
        }
    }

    async rankPapersWithRealLLM(papers) {
        console.log(`🎯 Ranking ${papers.length} papers with real LLM...`);
        
        if (papers.length === 0) {
            console.log('⚠️ No papers to rank');
            return [];
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

Return JSON with rankings for papers scoring >= 5.0:
{
  "rankings": [
    {"index": 0, "score": 9.5, "themes": ["emergence", "consciousness"], "reasoning": "why this reveals patterns"},
    {"index": 2, "score": 8.7, "themes": ["quantum", "observer"], "reasoning": "mystical interpretation potential"}
  ]
}

Include ALL papers that score 5.0 or higher. Order by score descending.`;

        let llmResponse;
        try {
            llmResponse = await this.callOpenRouterLLM(prompt);
            
            // Always save raw response for debugging
            writeFileSync('test-output-raw-llm-response.txt', llmResponse);
            console.log('💾 Raw LLM response saved to: test-output-raw-llm-response.txt');
            
            // Try to parse as JSON directly (response appears to be pure JSON)
            let rankingData;
            try {
                rankingData = JSON.parse(llmResponse);
            } catch (parseError) {
                // Fallback: extract JSON from response  
                const jsonMatch = llmResponse.match(/\\{[\\s\\S]*\\}/);
                if (!jsonMatch) {
                    throw new Error('No JSON found in LLM response');
                }
                rankingData = JSON.parse(jsonMatch[0]);
            }
            
            if (!rankingData.rankings || !Array.isArray(rankingData.rankings)) {
                throw new Error('Invalid ranking data structure');
            }

            // Map rankings back to papers with full data
            const rankedPapers = rankingData.rankings.map((r, i) => {
                if (r.index < 0 || r.index >= papers.length) {
                    console.warn(`Invalid paper index: ${r.index}`);
                    return null;
                }
                
                return {
                    ...papers[r.index],
                    qualityScore: r.score,
                    ranking: i + 1,
                    themes: r.themes || [],
                    reasoning: r.reasoning || ''
                };
            }).filter(p => p !== null);

            console.log(`✅ LLM ranked ${rankedPapers.length} papers (${rankingData.rankings.length} total rankings)`);
            return rankedPapers;
            
        } catch (error) {
            console.error('❌ Paper ranking failed:', error);
            console.log('Raw LLM response:', llmResponse?.substring(0, 500) + '...');
            return [];
        }
    }

    async runFullTest() {
        console.log('🚀 Starting real end-to-end arXiv + LLM test...\\n');
        
        try {
            // Step 1: Fetch real papers
            console.log('=== Step 1: Fetch Real Papers ===');
            const papers = await this.fetchRealArxivPapers('cs.AI', 20);
            
            if (papers.length === 0) {
                console.error('❌ No papers fetched, cannot continue');
                return;
            }

            // Step 2: Rank with real LLM
            console.log('\\n=== Step 2: Rank with Real LLM ===');
            const rankedPapers = await this.rankPapersWithRealLLM(papers);

            // Step 3: Generate results
            console.log('\\n=== Step 3: Generate Results ===');
            const results = {
                timestamp: new Date().toISOString(),
                testType: 'real-end-to-end',
                model: 'qwen/qwen3-next-80b-a3b-instruct',
                totalPapersFetched: papers.length,
                totalPapersRanked: rankedPapers.length,
                topRankedPapers: rankedPapers.slice(0, 10).map(p => ({
                    arxivId: p.arxivId,
                    title: p.title,
                    qualityScore: p.qualityScore,
                    ranking: p.ranking,
                    themes: p.themes,
                    reasoning: p.reasoning,
                    link: p.link,
                    authors: p.authors,
                    publishedDate: p.publishedDate
                })),
                scoreDistribution: {
                    excellent: rankedPapers.filter(p => p.qualityScore >= 9).length,
                    good: rankedPapers.filter(p => p.qualityScore >= 7 && p.qualityScore < 9).length,
                    acceptable: rankedPapers.filter(p => p.qualityScore >= 5 && p.qualityScore < 7).length
                },
                averageScore: rankedPapers.length > 0 
                    ? rankedPapers.reduce((sum, p) => sum + p.qualityScore, 0) / rankedPapers.length 
                    : 0,
                allFetchedPapers: papers.map(p => ({
                    arxivId: p.arxivId,
                    title: p.title,
                    authors: p.authors,
                    publishedDate: p.publishedDate,
                    abstractLength: p.abstract.length
                })),
                // Store complete ranking details with reasoning
                completeRankings: rankedPapers.map(p => ({
                    arxivId: p.arxivId,
                    title: p.title,
                    qualityScore: p.qualityScore,
                    ranking: p.ranking,
                    themes: p.themes,
                    reasoning: p.reasoning,
                    abstract: p.abstract.substring(0, 500) + '...'
                }))
            };

            // Save results
            writeFileSync('test-output-real-llm-end-to-end.json', JSON.stringify(results, null, 2));
            
            console.log('\\n🎉 End-to-End Test Complete!');
            console.log('==============================');
            console.log(`📊 Fetched: ${papers.length} real arXiv papers`);
            console.log(`🎯 Ranked: ${rankedPapers.length} papers by LLM`);
            console.log(`⭐ Top score: ${rankedPapers[0]?.qualityScore || 'N/A'}`);
            console.log(`📈 Average score: ${results.averageScore.toFixed(2)}`);
            console.log('💾 Results saved to: test-output-real-llm-end-to-end.json');
            
            if (rankedPapers.length > 0) {
                console.log('\\n🏆 Top Paper:');
                const top = rankedPapers[0];
                console.log(`   Title: ${top.title}`);
                console.log(`   Score: ${top.qualityScore}/10`);
                console.log(`   Themes: ${top.themes.join(', ')}`);
                console.log(`   Link: ${top.link}`);
                console.log(`   Reasoning: ${top.reasoning}`);
            }
            
        } catch (error) {
            console.error('❌ Test failed:', error);
        }
    }
}

async function main() {
    try {
        const tester = new RealArxivTest();
        await tester.runFullTest();
    } catch (error) {
        console.error('❌ Failed to initialize test:', error);
        console.log('💡 Make sure OPENROUTER_API_KEY is set in .env file');
    }
}

if (import.meta.url === new URL(process.argv[1], 'file://').href) {
    main().catch(console.error);
}