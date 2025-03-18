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

export type Trigram =
    | "kun"
    | "zhen"
    | "kan"
    | "xun"
    | "gen"
    | "li"
    | "dui"
    | "qian";

export interface HexagramName {
    pinyin: string;
    chinese: string;
}

export type HexagramLine = "yin" | "yang";

export interface Hexagram {
    number: number; // 1-64
    lines: HexagramLine[];
    upperTrigram: Trigram;
    lowerTrigram: Trigram;
    changingLines: number[];
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
