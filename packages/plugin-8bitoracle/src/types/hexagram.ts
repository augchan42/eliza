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

export interface Trigram {
    description: string;
    english: string;
    chinese: string;
    figure: string;
}

export interface HexagramName {
    pinyin: string;
    chinese: string;
}

export interface HexagramLine {
    number: number;
    text: string;
    changed: boolean;
    value: number;
}

export interface Hexagram {
    number: number;
    unicode: string;
    name: HexagramName;
    topTrigram: string;
    bottomTrigram: string;
    meaning: string;
    binary: string;
    upperTrigram: Trigram;
    lowerTrigram: Trigram;
    judgment?: string;
    image?: string;
    lines?: HexagramLine[];
}

export interface HexagramChange {
    line: number;
    changed: boolean;
}

export interface HexagramInterpretation {
    currentHexagram: Hexagram;
    transformedHexagram?: Hexagram;
    changes: HexagramChange[];
}

export interface HexagramGenerateResponse {
    fullHexagramData: HexagramLineData[];
    hexagramLineValues: number[];
    interpretation: HexagramInterpretation;
}
