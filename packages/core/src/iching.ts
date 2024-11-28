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

    const formattedData = {
        trigrams: character.systemKnowledge.iChing.trigrams?.map((trigram) => ({
            symbol: trigram.trigramFigure,
            name: trigram.name,
            key: trigram.key,
            quality: trigram.quality,
            traits: trigram.traits,
            personages: trigram.personages,
            animal: trigram.totemicAnimal,
            immortal: trigram.immortal,
            nature: trigram.imageInNature,
        })),
        hexagrams: character.systemKnowledge.iChing.hexagrams.map(
            (hexagram) => ({
                number: hexagram.number,
                symbol: hexagram.unicode,
                name: {
                    chinese: hexagram.name.chinese,
                    pinyin: hexagram.name.pinyin,
                },
                trigrams: {
                    top: hexagram.trigrams.top,
                    bottom: hexagram.trigrams.bottom,
                },
                meaning: hexagram.meaning,
            })
        ),
    };

    return addHeader(
        "# I Ching Knowledge",
        JSON.stringify(formattedData, null, 2)
    );
}
