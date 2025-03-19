export interface HexagramRound {
    initialSticks: number;
    bundle1: number;
    bundle2: number;
    removedFromRight: number;
    remainder1: number;
    remainder2: number;
    roundValue: number;
    mappedValue: number;
    finalSticks: number;
}

export interface HexagramLineData {
    rounds: HexagramRound[];
    lineValue: number;
}

export interface TrigramDetails {
    description: string; // Description of the trigram's meaning
    english: string; // English name (e.g., "Heaven", "Earth")
    chinese: string; // Chinese character (e.g., "乾", "坤")
    figure: string; // Unicode symbol (e.g., "☰", "☷")
}

export interface HexagramName {
    pinyin: string; // Pinyin romanization
    chinese: string; // Chinese name
}

export interface HexagramLine {
    number: number;
    text: string; // Line reading (爻辭)
    changed: boolean;
    value: number;
}

export interface DetailedHexagram {
    number: number; // 1-64 hexagram number
    unicode: string; // Unicode representation (e.g., "䷀")
    name: HexagramName;
    topTrigram: string; // Upper trigram name
    bottomTrigram: string; // Lower trigram name
    meaning: string; // English interpretation
    binary: string; // Binary representation
    upperTrigram: TrigramDetails;
    lowerTrigram: TrigramDetails;
    judgment?: string; // Judgment text (判辭)
    image?: string; // Image/Commentary (象辭)
    lines?: HexagramLine[]; // Line readings
    themes?: string[]; // Key themes
}

export interface HexagramInterpretation {
    currentHexagram: DetailedHexagram;
    transformedHexagram?: DetailedHexagram;
    changes: HexagramChange[];
}

export interface HexagramChange {
    line: number;
    changed: boolean;
}

export interface HexagramGenerateResponse {
    fullHexagramData: HexagramLineData[];
    hexagramLineValues: number[];
    interpretation: HexagramInterpretation;
}

// Constants for trigrams
export const TRIGRAMS: Record<string, TrigramDetails> = {
    HEAVEN: {
        description: "The Creative, Strong",
        english: "Heaven",
        chinese: "乾",
        figure: "☰",
    },
    EARTH: {
        description: "The Receptive, Yielding",
        english: "Earth",
        chinese: "坤",
        figure: "☷",
    },
    THUNDER: {
        description: "The Arousing",
        english: "Thunder",
        chinese: "震",
        figure: "☳",
    },
    WATER: {
        description: "The Abysmal",
        english: "Water",
        chinese: "坎",
        figure: "☵",
    },
    MOUNTAIN: {
        description: "Keeping Still",
        english: "Mountain",
        chinese: "艮",
        figure: "☶",
    },
    WIND: {
        description: "The Gentle",
        english: "Wind",
        chinese: "巽",
        figure: "☴",
    },
    FIRE: {
        description: "The Clinging",
        english: "Fire",
        chinese: "離",
        figure: "☲",
    },
    LAKE: {
        description: "The Joyous",
        english: "Lake",
        chinese: "兌",
        figure: "☱",
    },
};
