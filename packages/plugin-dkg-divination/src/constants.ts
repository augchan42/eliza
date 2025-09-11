// TODO: add isConnectedTo field or similar which you will use to connect w other KAs
export const dkgMemoryTemplate = {
    "@context": [
        "https://schema.org",
        {
            hexagram: "https://app.8bitoracle.ai/schema/hexagram#",
            divination: "https://app.8bitoracle.ai/schema/divination#",
        },
    ],
    "@type": ["CreativeWork", "divination:Reading"],
    "@id": "urn:hexagram:{number}",
    name: "{title}",
    dateCreated: "{timestamp}",
    author: {
        "@type": "Person",
        "@id": "{userId}",
        identifier: "{userIdentifier}",
    },
    "hexagram:data": {
        "@type": "hexagram:Hexagram",
        "hexagram:number": "{hexagramNumber}",
        "hexagram:binary": "{binary}",
        "hexagram:unicode": "{unicode}",
        "hexagram:name": {
            chinese: "{chineseName}",
            pinyin: "{pinyinName}",
        },
        "hexagram:trigrams": {
            upper: {
                english: "{upperEnglish}",
                chinese: "{upperChinese}",
                description: "{upperDescription}",
                figure: "{upperFigure}",
            },
            lower: {
                english: "{lowerEnglish}",
                chinese: "{lowerChinese}",
                description: "{lowerDescription}",
                figure: "{lowerFigure}",
            },
        },
        "hexagram:lines": "{lines}",
        "hexagram:computation": {
            rounds: "{rounds}",
            lineValues: "{lineValues}",
        },
    },
    "divination:context": {
        marketSentiment: "{marketSentiment}",
        newsEvents: "{newsEvents}",
        interpretation: "{interpretation}",
    },
};

export const combinedSparqlExample = `
SELECT DISTINCT ?headline ?articleBody
    WHERE {
      ?s a <http://schema.org/SocialMediaPosting> .
      ?s <http://schema.org/headline> ?headline .
      ?s <http://schema.org/articleBody> ?articleBody .

      OPTIONAL {
        ?s <http://schema.org/keywords> ?keyword .
        ?keyword <http://schema.org/name> ?keywordName .
      }

      OPTIONAL {
        ?s <http://schema.org/about> ?about .
        ?about <http://schema.org/name> ?aboutName .
      }

      FILTER(
        CONTAINS(LCASE(?headline), "example_keyword") ||
        (BOUND(?keywordName) && CONTAINS(LCASE(?keywordName), "example_keyword")) ||
        (BOUND(?aboutName) && CONTAINS(LCASE(?aboutName), "example_keyword"))
      )
    }
    LIMIT 10`;

export const sparqlExamples = [
    `
    SELECT DISTINCT ?headline ?articleBody
    WHERE {
      ?s a <http://schema.org/SocialMediaPosting> .
      ?s <http://schema.org/headline> ?headline .
      ?s <http://schema.org/articleBody> ?articleBody .

      OPTIONAL {
        ?s <http://schema.org/keywords> ?keyword .
        ?keyword <http://schema.org/name> ?keywordName .
      }

      OPTIONAL {
        ?s <http://schema.org/about> ?about .
        ?about <http://schema.org/name> ?aboutName .
      }

      FILTER(
        CONTAINS(LCASE(?headline), "example_keyword") ||
        (BOUND(?keywordName) && CONTAINS(LCASE(?keywordName), "example_keyword")) ||
        (BOUND(?aboutName) && CONTAINS(LCASE(?aboutName), "example_keyword"))
      )
    }
    LIMIT 10
    `,
    `
    SELECT DISTINCT ?headline ?articleBody
    WHERE {
      ?s a <http://schema.org/SocialMediaPosting> .
      ?s <http://schema.org/headline> ?headline .
      ?s <http://schema.org/articleBody> ?articleBody .
      FILTER(
        CONTAINS(LCASE(?headline), "example_headline_word1") ||
        CONTAINS(LCASE(?headline), "example_headline_word2")
      )
    }
    `,
    `
    SELECT DISTINCT ?headline ?articleBody ?keywordName
    WHERE {
      ?s a <http://schema.org/SocialMediaPosting> .
      ?s <http://schema.org/headline> ?headline .
      ?s <http://schema.org/articleBody> ?articleBody .
      ?s <http://schema.org/keywords> ?keyword .
      ?keyword <http://schema.org/name> ?keywordName .
      FILTER(
        CONTAINS(LCASE(?keywordName), "example_keyword1") ||
        CONTAINS(LCASE(?keywordName), "example_keyword2")
      )
    }
    `,
    `
    SELECT DISTINCT ?headline ?articleBody ?aboutName
    WHERE {
      ?s a <http://schema.org/SocialMediaPosting> .
      ?s <http://schema.org/headline> ?headline .
      ?s <http://schema.org/articleBody> ?articleBody .
      ?s <http://schema.org/about> ?about .
      ?about <http://schema.org/name> ?aboutName .
      FILTER(
        CONTAINS(LCASE(?aboutName), "example_about1") ||
        CONTAINS(LCASE(?aboutName), "example_about2")
      )
    }
    `,
];

export const generalSparqlQuery = `
    SELECT DISTINCT ?headline ?articleBody
    WHERE {
      ?s a <http://schema.org/SocialMediaPosting> .
      ?s <http://schema.org/headline> ?headline .
      ?s <http://schema.org/articleBody> ?articleBody .
    }
    LIMIT 10
  `;

export const DKG_EXPLORER_LINKS = {
    testnet: "https://dkg-testnet.origintrail.io/explore?ual=",
    mainnet: "https://dkg.origintrail.io/explore?ual=",
};

export function isSentimentAnalysisQueryPrompt(query: string) {
    return `Given the following query, determine if it is related to sentiment analysis of a stock, cryptocurrency, token, or financial asset.
    A query is considered relevant if it involves analyzing emotions, trends, market mood, social media sentiment, news sentiment, or investor confidence regarding a financial asset.

    Example 1 (Yes):
    Query: "What is the current sentiment on Bitcoin based on recent news and social media?"
    Response: "Yes"

    Example 2 (No):
    Query: "What is the market cap of Ethereum?"
    Response: "No"

    Example 3 (Yes):
    Query: "What do you think about $TSLA recently?"
    Response: "Yes"

    Example 4 (No):
    Query: "What's the best way to bake a chocolate cake?"
    Response: "No"

    Input:
    Provided query: ${query}

    Task:
    Return 'Yes' if the provided query is about sentiment analysis in finance, otherwise return 'No'. Make sure to reply only with 'Yes' or 'No', do not give any other comments or remarks.`;
}

function getStartTime48HoursAgo() {
    const now = new Date();
    const past48Hours = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    return past48Hours.toISOString();
}

export function getSentimentAnalysisQuery(topic: string) {
    return `PREFIX schema: <http://schema.org/>

    SELECT ?observation ?score ?impressions ?tweetText
    WHERE {
      BIND('${topic}' AS ?topic)

      ?dataset a schema:Dataset ;
                  schema:about ?topic ;
                  schema:observation ?observation .
      ?observation a schema:Observation ;
                     schema:observationDate ?observationDate ;
                     schema:value ?score ;
                     schema:impressions ?impressions ;
      FILTER (?observationDate >= "${getStartTime48HoursAgo()}")
    }`;
}

export function getRelatedDatasetsQuery(topic: string) {
    return `
    PREFIX schema: <http://schema.org/>

  SELECT ?dataset ?ual ?dateCreated
    WHERE {

      ?dataset a schema:Dataset .
      GRAPH ?ual {
            ?dataset schema:about '${topic}' .
            ?dataset schema:dateCreated ?dateCreated
      }
    }`;
}

export function extractSentimentAnalysisTopic(post: string) {
    return `You are an AI assistant that extracts the main financial topic from a given social media post. Your task is to identify and return only a **stock ticker (cashtag, e.g., $AAPL, $BTC), a hashtag (e.g., #Ethereum, #SP500), a financial asset name (e.g., Bitcoin, Nvidia, Tesla), or an index (e.g., S&P 500, Nasdaq 100)** mentioned in the post.

### **Instructions:**
1. **Extract only one relevant financial entity** (cashtag, hashtag, company name, cryptocurrency, stock, or index).
2. **Do not include** general words, opinions, news sources, or irrelevant content.
3. **Do not modify the extracted entity**. Preserve its exact format as in the post (e.g., "$TSLA", "#Bitcoin", "Ethereum").

### **Example Inputs & Outputs:**

**Input:**
"The market is crazy today! $BTC is pumping, what's your opinion on the sentiment?"
**Output:**
"$BTC"

**Input:**
"Ethereum is gaining momentum, what do you think about it?"
**Output:**
"Ethereum"

**Input:**
"Is Nvidia ($NVDA) still a good buy after the earnings call?"
**Output:**
"$NVDA"

**Input:**
"Tech stocks are looking strong this quarter!"
**Output:**
"None"

**Input:**
"Is Tesla the most shorted stock right now?."
**Output:**
"Tesla"

** Actual input: ${post} **

Return the main financial topic which is to be extracted. Make sure to return only the financial topic and no other comments or remarks.
`;
}
