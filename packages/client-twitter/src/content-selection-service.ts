import { IAgentRuntime, ModelClass, generateText, parseJSONObjectFromText, elizaLogger } from "@elizaos/core";

export interface ContentItem {
    title: string;
    summary?: string;
    pubDate?: string;
    authors?: string;
    [key: string]: any;
}

export interface SelectionCriteria {
    contentType: 'news' | 'research';
    character: string;
    priorities: string[];
    priorityOrder?: string;
}

export class ContentSelectionService {
    constructor(private runtime: IAgentRuntime) {}

    async selectMostRelevant<T extends ContentItem>(items: T[], criteria: SelectionCriteria): Promise<T> {
        if (items.length === 0) {
            return this.getEmptyFallback(criteria.contentType) as T;
        }
        
        if (items.length === 1) {
            return items[0];
        }
        
        const itemsText = items.map((item, index) => {
            const summary = item.summary?.substring(0, 150) || "No summary available";
            const dateInfo = item.pubDate ? `\n   Date: ${item.pubDate}` : "";
            const authorInfo = item.authors ? `\n   Authors: ${item.authors}` : "";
            
            return `${index + 1}. ${item.title}\n   Summary: ${summary}...${dateInfo}${authorInfo}`;
        }).join('\n\n');
        
        const selectionPrompt = this.buildSelectionPrompt(criteria, itemsText);
        
        try {
            const response = await generateText({
                runtime: this.runtime,
                context: selectionPrompt,
                modelClass: ModelClass.SMALL,
            });
            
            elizaLogger.debug("LLM selection response:", response);
            
            // Try to parse structured JSON response
            try {
                const jsonResponse = parseJSONObjectFromText(response);
                if (jsonResponse && jsonResponse.selectedItem && typeof jsonResponse.selectedItem === 'number') {
                    const index = jsonResponse.selectedItem - 1;
                    if (index >= 0 && index < items.length) {
                        elizaLogger.debug(`LLM selected item ${jsonResponse.selectedItem}: ${items[index].title}`);
                        elizaLogger.debug(`Selection reasoning: ${jsonResponse.reasoning}`);
                        return items[index];
                    }
                }
            } catch (parseError) {
                elizaLogger.debug("JSON parsing failed, trying text fallback:", parseError);
                
                // Fallback: look for "Article X" or "Item X" patterns
                const match = response.match(/(?:article|item|selected)\s+(\d+)/i);
                if (match) {
                    const index = parseInt(match[1]) - 1;
                    if (index >= 0 && index < items.length) {
                        elizaLogger.debug(`Selected item via text parsing: ${items[index].title}`);
                        return items[index];
                    }
                }
            }
            
            // Final fallback: return most recent item
            elizaLogger.warn("Could not parse LLM selection, returning most recent item");
            return items[0];
            
        } catch (error) {
            elizaLogger.error("Error in LLM selection:", error);
            return items[0]; // Return first item as fallback
        }
    }

    private buildSelectionPrompt(criteria: SelectionCriteria, itemsText: string): string {
        const prioritiesText = criteria.priorities.map(p => `- ${p}`).join('\n');
        const priorityOrder = criteria.priorityOrder || "Most impactful > Most relevant > Most engaging";
        
        return `From these ${criteria.contentType} items, select the ONE most engaging for ${criteria.character}.

Consider:
${prioritiesText}

Priority: ${priorityOrder}

Items:
${itemsText}

Respond with JSON in this exact format:
{
  "selectedItem": 2,
  "reasoning": "Brief explanation of why this item was selected"
}`;
    }

    private getEmptyFallback(contentType: string): ContentItem {
        if (contentType === 'research') {
            return {
                title: "No research papers available",
                summary: "Research feeds temporarily unavailable. Operating on oracle guidance only.",
                pubDate: new Date().toISOString()
            };
        } else {
            return {
                title: "No articles available",
                summary: "Feed parsing failed. Operating on cached data.",
                pubDate: new Date().toISOString()
            };
        }
    }
}