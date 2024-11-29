// Trigram number mappings based on Plum Blossom Numerology
export const trigramNumbers = {
  qian: 1, // Heaven
  dui: 2, // Lake
  li: 3, // Fire
  zhen: 4, // Thunder
  xun: 5, // Wind
  kan: 6, // Water
  gen: 7, // Mountain
  kun: 8 // Earth
};

// The trigrams are typically arranged in a circular sequence known as the
// "King Wen sequence" or the "Later Heaven Sequence."
// This arrangement is attributed to King Wen, one of the legendary founders
// of the Zhou dynasty in ancient China.
export const trigrams = {
  Heaven: "111", // ☰ Heaven qian
  Earth: "000", // ☷ Earth kun
  Water: "010", // ☵ Water kan
  Fire: "101", // ☲ Fire li
  Mountain: "001", // ☶ Mountain gen
  Wind: "011", // ☴ Wind xun
  Lake: "110", // ☱ Lake dui
  Thunder: "100", // ☳ Thunder zhen
};

export const trigramChineseMapping = {
  Heaven: "乾",
  Earth: "坤",
  Water: "坎",
  Fire: "離",
  Mountain: "艮",
  Wind: "巽",
  Lake: "兌",
  Thunder: "震",
};

export const trigramFigures = {
  Heaven: "☰",
  Lake: "☱",
  Fire: "☲",
  Thunder: "☳",
  Wind: "☴",
  Water: "☵",
  Mountain: "☶",
  Earth: "☷",
};

interface TrigramDescriptions {
  [key: string]: string;
  Heaven: string;
  Earth: string;
  Water: string;
  Fire: string;
  Mountain: string;
  Wind: string;
  Lake: string;
  Thunder: string;
}

export const trigramDescriptions: TrigramDescriptions = {
  Heaven: "The Creative",
  Earth: "The Receptive",
  Water: "The Deep",
  Fire: "The Clinging",
  Mountain: "Keeping Still",
  Wind: "The Gentle",
  Lake: "The Joyous",
  Thunder: "The Arousing",
};

export const hexagramData = [
  {
    number: 1,
    unicode: "䷀", // Hexagram Unicode
    name: {
      pinyin: "Qian",
      chinese: "乾",
    },
    topTrigram: "Heaven", bottomTrigram: "Heaven", meaning: "The Creative"
  },
  {
    number: 2,
    unicode: "䷁",
    name: {
      pinyin: "Kun",
      chinese: "坤",
    }, topTrigram: "Earth", bottomTrigram: "Earth", meaning: "The Receptive"
  },
  {
    number: 3,
    unicode: "䷂",
    name: {
      pinyin: "Zhun",
      chinese: "屯",
    }, topTrigram: "Water", bottomTrigram: "Thunder", meaning: "Difficulty at the Beginning"
  },
  {
    number: 4,
    unicode: "䷃",
    name: {
      pinyin: "Meng",
      chinese: "蒙",
    },
    topTrigram: "Mountain", bottomTrigram: "Water", meaning: "Youthful Folly"
  },
  {
    number: 5,
    unicode: "䷄",
    name: {
      pinyin: "Xu",
      chinese: "需",
    }, topTrigram: "Water", bottomTrigram: "Heaven", meaning: "Waiting"
  },
  {
    number: 6,
    unicode: "䷅",
    name: {
      pinyin: "Song",
      chinese: "訟",
    },
    topTrigram: "Heaven", bottomTrigram: "Water", meaning: "Conflict"
  },
  {
    number: 7,
    unicode: "䷆",
    name: {
      pinyin: "Shi",
      chinese: "師",
    }, topTrigram: "Earth", bottomTrigram: "Water", meaning: "The Army"
  },
  {
    number: 8,
    unicode: "䷇",
    name: {
      pinyin: "Bi",
      chinese: "比",
    },
    topTrigram: "Water", bottomTrigram: "Earth", meaning: "Holding Together"
  },
  {
    number: 9,
    unicode: "䷈",
    name: {
      pinyin: "Xiao Chu",
      chinese: "小畜",
    },
    topTrigram: "Wind", bottomTrigram: "Heaven", meaning: "Small Accumulating"
  },
  {
    number: 10,
    unicode: "䷉",
    name: {
      pinyin: "Lu",
      chinese: "履",
    },
    topTrigram: "Heaven", bottomTrigram: "Lake", meaning: "Treading"
  },
  {
    number: 11,
    unicode: "䷊",
    name: {
      pinyin: "Tai",
      chinese: "泰",
    },
    topTrigram: "Earth", bottomTrigram: "Heaven", meaning: "Peace"
  },
  {
    number: 12,
    unicode: "䷋",
    name: {
      pinyin: "Pi",
      chinese: "否",
    },
    topTrigram: "Heaven", bottomTrigram: "Earth", meaning: "Standstill"
  },
  {
    number: 13,
    unicode: "䷌",
    name: {
      pinyin: "Tong Ren",
      chinese: "同人",
    },
    topTrigram: "Fire", bottomTrigram: "Heaven", meaning: "Fellowship with Men"
  },
  {
    number: 14,
    unicode: "䷍",
    name: {
      pinyin: "Da You",
      chinese: "大有",
    },
    topTrigram: "Heaven", bottomTrigram: "Fire", meaning: "Possession in Great Measure"
  },
  {
    number: 15,
    unicode: "䷎",
    name: {
      pinyin: "Qian",
      chinese: "謙",
    },
    topTrigram: "Earth", bottomTrigram: "Mountain", meaning: "Modesty"
  },
  {
    number: 16,
    unicode: "䷏",
    name: {
      pinyin: "Yu",
      chinese: "豫",
    },
    topTrigram: "Thunder", bottomTrigram: "Earth", meaning: "Enthusiasm"
  },
  {
    number: 17,
    unicode: "䷐",
    name: {
      pinyin: "Sui",
      chinese: "隨",
    },
    topTrigram: "Lake", bottomTrigram: "Thunder", meaning: "Following"
  },
  {
    number: 18,
    unicode: "䷑",
    name: {
      pinyin: "Gu",
      chinese: "蠱",
    },
    topTrigram: "Mountain", bottomTrigram: "Wind", meaning: "Work on What Has Been Spoiled"
  },
  {
    number: 19,
    unicode: "䷒",
    name: {
      pinyin: "Lin",
      chinese: "臨",
    },
    topTrigram: "Earth", bottomTrigram: "Lake", meaning: "Approach"
  },
  {
    number: 20,
    unicode: "䷓",
    name: {
      pinyin: "Guan",
      chinese: "觀",
    },
    topTrigram: "Wind", bottomTrigram: "Earth", meaning: "Contemplation"
  },
  {
    number: 21,
    unicode: "䷔",
    name: {
      pinyin: "Shi He",
      chinese: "噬嗑",
    },
    topTrigram: "Fire", bottomTrigram: "Thunder", meaning: "Biting Through"
  },
  {
    number: 22,
    unicode: "䷕",
    name: {
      pinyin: "Bi",
      chinese: "賁",
    },
    topTrigram: "Mountain", bottomTrigram: "Fire", meaning: "Grace"
  },
  {
    number: 23,
    unicode: "䷖",
    name: {
      pinyin: "Bo",
      chinese: "剝",
    },
    topTrigram: "Mountain", bottomTrigram: "Earth", meaning: "Splitting Apart"
  },
  {
    number: 24,
    unicode: "䷗",
    name: {
      pinyin: "Fu",
      chinese: "復",
    },
    topTrigram: "Earth", bottomTrigram: "Thunder", meaning: "Return"
  },
  {
    number: 25,
    unicode: "䷘",
    name: {
      pinyin: "Wu Wang",
      chinese: "無妄",
    },
    topTrigram: "Heaven", bottomTrigram: "Thunder", meaning: "Innocence"
  },
  {
    number: 26,
    unicode: "䷙",
    name: {
      pinyin: "Da Chu",
      chinese: "大畜",
    },
    topTrigram: "Mountain", bottomTrigram: "Heaven", meaning: "The Taming Power of the Great"
  },
  {
    number: 27,
    unicode: "䷚",
    name: {
      pinyin: "Yi",
      chinese: "頤",
    },
    topTrigram: "Mountain", bottomTrigram: "Thunder", meaning: "Nourishment"
  },
  {
    number: 28,
    unicode: "䷛",
    name: {
      pinyin: "Da Guo",
      chinese: "大過",
    },
    topTrigram: "Lake", bottomTrigram: "Wind", meaning: "Preponderance of the Great"
  },
  {
    number: 29,
    unicode: "䷜",
    name: {
      pinyin: "Kan",
      chinese: "坎",
    },
    topTrigram: "Water", bottomTrigram: "Water", meaning: "The Deep"
  },
  {
    number: 30,
    unicode: "䷝",
    name: {
      pinyin: "Li",
      chinese: "離",
    },
    topTrigram: "Fire", bottomTrigram: "Fire", meaning: "The Clinging"
  },
  {
    number: 31,
    unicode: "䷞",
    name: {
      pinyin: "Xian",
      chinese: "咸",
    },
    topTrigram: "Lake", bottomTrigram: "Mountain", meaning: "Influence"
  },
  {
    number: 32,
    unicode: "䷟",
    name: {
      pinyin: "Heng",
      chinese: "恆",
    },
    topTrigram: "Thunder", bottomTrigram: "Wind", meaning: "Duration"
  },
  {
    number: 33,
    unicode: "䷠",
    name: {
      pinyin: "Dun",
      chinese: "遯",
    },
    topTrigram: "Heaven", bottomTrigram: "Mountain", meaning: "Retreat"
  },
  {
    number: 34,
    unicode: "䷡",
    name: {
      pinyin: "Da Zhuang",
      chinese: "大壯",
    },
    topTrigram: "Thunder", bottomTrigram: "Heaven", meaning: "The Power of the Great"
  },
  {
    number: 35,
    unicode: "䷢",
    name: {
      pinyin: "Jin",
      chinese: "晉",
    },
    topTrigram: "Fire", bottomTrigram: "Earth", meaning: "Progress"
  },
  {
    number: 36,
    unicode: "䷣",
    name: {
      pinyin: "Ming Yi",
      chinese: "明夷",
    },
    topTrigram: "Earth", bottomTrigram: "Fire", meaning: "Darkening of the Light"
  },
  {
    number: 37,
    unicode: "䷤",
    name: {
      pinyin: "Jia Ren",
      chinese: "家人",
    },
    topTrigram: "Wind", bottomTrigram: "Fire", meaning: "The Family"
  },
  {
    number: 38,
    unicode: "䷥",
    name: {
      pinyin: "Kui",
      chinese: "睽",
    },
    topTrigram: "Fire", bottomTrigram: "Lake", meaning: "Opposition"
  },
  {
    number: 39,
    unicode: "䷦",
    name: {
      pinyin: "Jian",
      chinese: "蹇",
    },
    topTrigram: "Water", bottomTrigram: "Mountain", meaning: "Obstruction"
  },
  {
    number: 40,
    unicode: "䷧",
    name: {
      pinyin: "Xie",
      chinese: "解",
    },
    topTrigram: "Thunder", bottomTrigram: "Water", meaning: "Deliverance"
  },
  {
    number: 41,
    unicode: "䷨",
    name: {
      pinyin: "Sun",
      chinese: "損",
    },
    topTrigram: "Mountain", bottomTrigram: "Lake", meaning: "Decrease"
  },
  {
    number: 42,
    unicode: "䷩",
    name: {
      pinyin: "Yi",
      chinese: "益",
    },
    topTrigram: "Wind", bottomTrigram: "Thunder", meaning: "Increase"
  },
  {
    number: 43,
    unicode: "䷪",
    name: {
      pinyin: "Guai",
      chinese: "夬",
    },
    topTrigram: "Lake", bottomTrigram: "Heaven", meaning: "Breakthrough"
  },
  {
    number: 44,
    unicode: "䷫",
    name: {
      pinyin: "Gou",
      chinese: "姤",
    },
    topTrigram: "Heaven", bottomTrigram: "Wind", meaning: "Coming to Meet"
  },
  {
    number: 45,
    unicode: "䷬",
    name: {
      pinyin: "Cui",
      chinese: "萃",
    },
    topTrigram: "Lake", bottomTrigram: "Earth", meaning: "Gathering Together"
  },
  {
    number: 46,
    unicode: "䷭",
    name: {
      pinyin: "Sheng",
      chinese: "升",
    },
    topTrigram: "Earth", bottomTrigram: "Wind", meaning: "Pushing Upward"
  },
  {
    number: 47,
    unicode: "䷮",
    name: {
      pinyin: "Kun",
      chinese: "困",
    },
    topTrigram: "Lake", bottomTrigram: "Water", meaning: "Oppression"
  },
  {
    number: 48,
    unicode: "䷯",
    name: {
      pinyin: "Jing",
      chinese: "井",
    },
    topTrigram: "Water", bottomTrigram: "Wind", meaning: "The Well"
  },
  {
    number: 49,
    unicode: "䷰",
    name: {
      pinyin: "Ge",
      chinese: "革",
    },
    topTrigram: "Lake", bottomTrigram: "Fire", meaning: "Revolution"
  },
  {
    number: 50,
    unicode: "䷱",
    name: {
      pinyin: "Ding",
      chinese: "鼎",
    },
    topTrigram: "Fire", bottomTrigram: "Wind", meaning: "The Cauldron"
  },
  {
    number: 51,
    unicode: "䷲",
    name: {
      pinyin: "Zhen",
      chinese: "震",
    },
    topTrigram: "Thunder", bottomTrigram: "Thunder", meaning: "The Arousing"
  },
  {
    number: 52,
    unicode: "䷳",
    name: {
      pinyin: "Gen",
      chinese: "艮",
    },
    topTrigram: "Mountain", bottomTrigram: "Mountain", meaning: "Keeping Still"
  },
  {
    number: 53,
    unicode: "䷴",
    name: {
      pinyin: "Jian",
      chinese: "漸",
    },
    topTrigram: "Wind", bottomTrigram: "Mountain", meaning: "Development"
  },
  {
    number: 54,
    unicode: "䷵",
    name: {
      pinyin: "Gui Mei",
      chinese: "歸妹",
    },
    topTrigram: "Thunder", bottomTrigram: "Lake", meaning: "The Marrying Maiden"
  },
  {
    number: 55,
    unicode: "䷶",
    name: {
      pinyin: "Feng",
      chinese: "豐",
    },
    topTrigram: "Thunder", bottomTrigram: "Fire", meaning: "Abundance"
  },
  {
    number: 56,
    unicode: "䷷",
    name: {
      pinyin: "Lu",
      chinese: "旅",
    },
    topTrigram: "Fire", bottomTrigram: "Mountain", meaning: "The Wanderer"
  },
  {
    number: 57,
    unicode: "䷸",
    name: {
      pinyin: "Xun",
      chinese: "巽",
    },
    topTrigram: "Wind", bottomTrigram: "Wind", meaning: "The Gentle"
  },
  {
    number: 58,
    unicode: "䷹",
    name: {
      pinyin: "Dui",
      chinese: "兌",
    },
    topTrigram: "Lake", bottomTrigram: "Lake", meaning: "The Joyous"
  },
  {
    number: 59,
    unicode: "䷺",
    name: {
      pinyin: "Huan",
      chinese: "渙",
    },
    topTrigram: "Wind", bottomTrigram: "Water", meaning: "Dispersion"
  },
  {
    number: 60,
    unicode: "䷻",
    name: {
      pinyin: "Jie",
      chinese: "節",
    },
    topTrigram: "Water", bottomTrigram: "Lake", meaning: "Limitation"
  },
  {
    number: 61,
    unicode: "䷼",
    name: {
      pinyin: "Zhong Fu",
      chinese: "中孚",
    },
    topTrigram: "Wind", bottomTrigram: "Lake", meaning: "Inner Truth"
  },
  {
    number: 62,
    unicode: "䷽",
    name: {
      pinyin: "Xiao Guo",
      chinese: "小過",
    },
    topTrigram: "Thunder", bottomTrigram: "Mountain", meaning: "Preponderance of the Small"
  },
  {
    number: 63,
    unicode: "䷾",
    name: {
      pinyin: "Ji Ji ",
      chinese: "既濟",
    },
    topTrigram: "Water", bottomTrigram: "Fire", meaning: "After Completion"
  },
  {
    number: 64,
    unicode: "䷿",
    name: {
      pinyin: "Wei Ji",
      chinese: "未濟",
    },
    topTrigram: "Fire", bottomTrigram: "Water", meaning: "Before Completion"
  },
];

// Not Used Below

// yin = broken, yang = solid line
// The Fuxi sequence, also known as the "Early Heaven Sequence"
// or the "Primal Arrangement,"
export const trigrams_named = {
  qian: {
    lines: ["yang", "yang", "yang"],
    element: "Heaven",
  },
  kun: {
    lines: ["yin", "yin", "yin"],
    element: "Earth",
  },
  zhen: {
    lines: ["yang", "yang", "yin"],
    element: "Thunder",
  },
  kan: {
    lines: ["yin", "yang", "yin"],
    element: "Water",
  },
  gen: {
    lines: ["yang", "yin", "yin"],
    element: "Mountain",
  },
  xun: {
    lines: ["yin", "yin", "yang"],
    element: "Wind",
  },
  li: {
    lines: ["yang", "yin", "yang"],
    element: "Fire",
  },
  dui: {
    lines: ["yin", "yang", "yang"],
    element: "Lake",
  },
};

// from https://www.jamesdekorne.com/GBCh/GBCh.htm
export const hexagramMapping = {
  1: "111111", // ䷀ (Qian) The Dynamic
  2: "000000", // ䷁ (Kun) The Magnetic
  3: "100010", // ䷂ (Zhun) Difficulty
  4: "010001", // ䷃ (Meng) Inexperience
  5: "111010", // ䷄ (Xu) Waiting
  6: "010111", // ䷅ (Song) Stress
  7: "010000", // ䷆ (Shi) Discipline
  8: "000010", // ䷇ (Bi) Holding Together
  9: "111011", // ䷈ (Xiao Chu) Passive Restraint
  10: "110111", // ䷉ (Lu) Cautious Advance
  11: "111000", // ䷊ (Tai) Harmony
  12: "000111", // ䷋ (Pi) Divorcement
  13: "101111", // ䷌ (Tong Ren) Union of Forces
  14: "111101", // ䷍ (Da You) Wealth
  15: "001000", // ䷎ (Qian) Temperance
  16: "000100", // ䷏ (Yu) Enthusiasm/Self-Deception/Repose
  17: "100110", // ䷐ (Sui)  Following
  18: "011001", // ䷑ (Gu) Repair
  19: "110000", // ䷒ (Lin) Approach
  20: "000011", // ䷓ (Guan) Contemplation
  21: "100101", // ䷔ (Shi He) Discernment
  22: "101001", // ䷕ (Bi) Persona
  23: "000001", // ䷖ (Bo) Disintegration
  24: "100000", // ䷗ (Fu) Return
  25: "100111", // ䷘ (Wu Wang) Innocence
  26: "111001", // ䷙ (Da Chu) Controlled Power
  27: "100001", // ䷚ (Yi) Nourishment
  28: "011110", // ䷛ (Da Guo) Critical Mass
  29: "010010", // ䷜ (Kan) Danger
  30: "101101", // ䷝ (Li) Clarity
  31: "001110", // ䷞ (Xian) Initiative (Influence)
  32: "011100", // ䷟ (Heng) Consistency
  33: "001111", // ䷠ (Dun) Retreat
  34: "111100", // ䷡ (Da Zhuang) Great Power
  35: "000101", // ䷢ (Jin) Advance of Consciousness
  36: "101000", // ䷣ (Ming Yi) Clouded Perception
  37: "101011", // ䷤ (Jia Ren) The Family
  38: "110101", // ䷥ (Kui) Mutual Alienation
  39: "001010", // ䷦ (Jian) Impasse
  40: "010100", // ䷧ (Xie) Liberation
  41: "110001", // ䷨ (Sun) Compensating Sacrifice
  42: "100011", // ䷩ (Yi) Increase
  43: "111110", // ䷪ (Guai) Resoluteness
  44: "011111", // ䷫ (Gou) Temptation
  45: "000110", // ䷬ (Cui) Gathering Together (Contraction)
  46: "011000", // ䷭ (Sheng) Pushing Upward
  47: "010110", // ䷮ (Kun) Oppression
  48: "011010", // ䷯ (Jing) The Well
  49: "101110", // ䷰ (Ge) Metamorphosis
  50: "011101", // ䷱ (Ding) The Sacrificial Vessel
  51: "100100", // ䷲ (Zhen) Shock/Thunder
  52: "001001", // ䷳ (Gen) Keeping Still
  53: "001011", // ䷴ (Jian) Gradual Progress-
  54: "110100", // ䷵ (Gui Mei) Propriety/Making-Do
  55: "101100", // ䷶ (Feng) Abundance (Expansion of Awareness)
  56: "001101", // ䷷ (Lu) Transition
  57: "011011", // ䷸ (Xun) Penetration
  58: "110110", // ䷹ (Dui) Joy (Self-indulgence)
  59: "010011", // ䷺ (Huan) Expansion (Dispersion)
  60: "110010", // ䷻ (Jie) Restrictive Regulations
  61: "110011", // ䷼ (Zhong Fu) Inner Truth
  62: "001100", // ䷽ (Xiao Guo) Small Powers
  63: "101010", // ䷾ (Ji Ji) Completion
  64: "010101", // ䷿ (Wei Ji) Unfinished Business
};

export const trigrams_reference = {
  Heaven: {
    binary: "111",
    unicode: "☰",
    pinyin: "qián",
    chinese: "乾",
    nature: "Heaven",
    direction: "South",
    qualities: ["creative", "strong", "dynamic"],
    element: "Metal",
    familyMember: "Father",
    symbol: {
      top: "yang",
      middle: "yang",
      bottom: "yang"
    }
  },
  Earth: {
    binary: "000",
    unicode: "☷",
    pinyin: "kūn",
    chinese: "坤",
    nature: "Earth",
    direction: "North",
    qualities: ["receptive", "yielding", "nurturing"],
    element: "Earth",
    familyMember: "Mother",
    symbol: {
      top: "yin",
      middle: "yin",
      bottom: "yin"
    }
  },
  Fire: {
    binary: "101",
    unicode: "☲",
    pinyin: "lí",
    chinese: "離",
    nature: "Fire",
    direction: "East",
    qualities: ["illuminating", "dependent", "radiant"],
    element: "Fire",
    familyMember: "Second Daughter",
    symbol: {
      top: "yang",
      middle: "yin",
      bottom: "yang"
    }
  },
  Water: {
    binary: "010",
    unicode: "☵",
    pinyin: "kǎn",
    chinese: "坎",
    nature: "Water",
    direction: "West",
    qualities: ["dangerous", "flowing", "fluid"],
    element: "Water",
    familyMember: "Second Son",
    symbol: {
      top: "yin",
      middle: "yang",
      bottom: "yin"
    }
  },
  Mountain: {
    binary: "001",
    unicode: "☶",
    pinyin: "gèn",
    chinese: "艮",
    nature: "Mountain",
    direction: "Northeast",
    qualities: ["still", "stopping", "resting"],
    element: "Earth",
    familyMember: "Youngest Son",
    symbol: {
      top: "yang",
      middle: "yin",
      bottom: "yin"
    }
  },
  Wind: {
    binary: "011",
    unicode: "☴",
    pinyin: "xùn",
    chinese: "巽",
    nature: "Wind",
    direction: "Southeast",
    qualities: ["gentle", "penetrating", "persistent"],
    element: "Wood",
    familyMember: "Eldest Daughter",
    symbol: {
      top: "yang",
      middle: "yang",
      bottom: "yin"
    }
  },
  Lake: {
    binary: "110",
    unicode: "☱",
    pinyin: "duì",
    chinese: "兌",
    nature: "Lake",
    direction: "Southwest",
    qualities: ["joyful", "reflective", "collecting"],
    element: "Metal",
    familyMember: "Youngest Daughter",
    symbol: {
      top: "yin",
      middle: "yang",
      bottom: "yang"
    }
  },
  Thunder: {
    binary: "100",
    unicode: "☳",
    pinyin: "zhèn",
    chinese: "震",
    nature: "Thunder",
    direction: "Northwest",
    qualities: ["arousing", "movement", "shocking"],
    element: "Wood",
    familyMember: "Eldest Son",
    symbol: {
      top: "yin",
      middle: "yin",
      bottom: "yang"
    }
  }
};
