import { Character } from "./types.ts";
import { addHeader } from "./context.ts";

/**
 * Formats the I-Ching knowledge from a character's system knowledge into a readable string.
 * @param character - The character object containing I-Ching system knowledge.
 * @returns A formatted string of I-Ching knowledge, or an empty string if no I-Ching data exists.
 */
export function formatIChingKnowledge(character: Character): string {
    if (!character.systemKnowledge?.iChing?.hexagrams) {
        return "";
    }

    const trigramsSection = character.systemKnowledge.iChing.trigrams?.map(trigram => `
        ${trigram.trigramFigure} ${trigram.name} (${trigram.key})
        Quality: ${trigram.quality}
        Traits: ${trigram.traits}
        Personages: ${trigram.personages}
        Animal: ${trigram.totemicAnimal}
        Immortal: ${trigram.immortal}
        Nature: ${trigram.imageInNature}
    `.trim()).join('\n\n');

    const hexagramsSection = character.systemKnowledge.iChing.hexagrams.map(hexagram => `
        Hexagram ${hexagram.number} ${hexagram.unicode} - ${hexagram.name.chinese} (${hexagram.name.pinyin})
        Trigrams: ${hexagram.trigrams.top} over ${hexagram.trigrams.bottom}
        Meaning: ${hexagram.meaning}
    `.trim()).join('\n\n');

    return addHeader(
        "# I Ching Knowledge",
        `
        # Trigrams
        ${trigramsSection}

        # Hexagrams
        ${hexagramsSection}
        `.trim()
    );
}