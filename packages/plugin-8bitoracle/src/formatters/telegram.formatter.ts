import { ResponseFormatter, DivinationResponse } from "../types/response";
import { MarketData } from "../types/market";
import { HexagramInterpretation } from "../types/hexagram";

export class TelegramFormatter implements ResponseFormatter {
    private readonly MAX_MESSAGE_LENGTH = 4096;

    format(response: DivinationResponse): string {
        const marketSection = this.formatMarketSection(response.marketData);
        const hexagramSection = this.formatHexagramSection(
            response.interpretation,
        );

        return `[SIGNAL INTERCEPT]
${marketSection}

[PATTERN READ]
${hexagramSection}

[RAZOR TRUTH]
${this.formatRazorTruth(response)}

- through mirrored eyes
8bitoracle.ai + irai.co`;
    }

    split(text: string): string[] {
        if (text.length <= this.MAX_MESSAGE_LENGTH) {
            return [text];
        }

        const parts: string[] = [];
        let currentPart = "";

        const lines = text.split("\n");
        for (const line of lines) {
            if (
                currentPart.length + line.length + 1 <=
                this.MAX_MESSAGE_LENGTH
            ) {
                currentPart += (currentPart ? "\n" : "") + line;
            } else {
                if (currentPart) parts.push(currentPart);
                currentPart = line;
            }
        }

        if (currentPart) parts.push(currentPart);
        return parts;
    }

    private formatMarketSection(marketData: MarketData): string {
        const newsHighlights = marketData.news
            .slice(0, 3)
            .map((news) => `• ${news}`)
            .join("\n");

        const sentiment = marketData.sentiment.data.overview;

        return `${newsHighlights}

Market Sentiment: ${sentiment}`;
    }

    private formatHexagramSection(
        interpretation: HexagramInterpretation,
    ): string {
        const { currentHexagram, transformedHexagram, changes } =
            interpretation;

        let text = `${currentHexagram.unicode} ${currentHexagram.name.pinyin} (${currentHexagram.meaning})
${currentHexagram.upperTrigram.description} over ${currentHexagram.lowerTrigram.description}`;

        if (transformedHexagram) {
            text += `\n\nTransforming to:\n${transformedHexagram.unicode} ${transformedHexagram.name.pinyin} (${transformedHexagram.meaning})`;
        }

        if (changes.length > 0) {
            const changeLines = changes
                .filter((change) => change.changed)
                .map((change) => `Line ${change.line}`)
                .join(", ");
            text += `\n\nChanging lines: ${changeLines}`;
        }

        return text;
    }

    private formatRazorTruth(response: DivinationResponse): string {
        const { currentHexagram, transformedHexagram } =
            response.hexagram.interpretation;

        let truth = currentHexagram.judgment || currentHexagram.meaning;

        if (transformedHexagram) {
            truth +=
                "\n\n" +
                (transformedHexagram.judgment || transformedHexagram.meaning);
        }

        if (response.marketData.interpretation) {
            truth += "\n\n" + response.marketData.interpretation;
        }

        return truth;
    }
}
