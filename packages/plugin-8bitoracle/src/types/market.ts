export interface MarketSentiment {
    data: {
        overview: string;
    };
}

export interface IraiAskRequest {
    question: string;
    citations?: boolean;
    lang?: string;
    features?: {
        news?: boolean;
        trending?: boolean;
        market_sentiment?: boolean;
        coin_sentiment?: boolean;
        price_actions?: boolean;
        technical_analysis?: boolean;
        market_update?: boolean;
        stop_loss_take_profit?: boolean;
        top_movers?: boolean;
        ath_atl?: boolean;
    };
}

export interface IraiCitationData {
    y_axis_label: string;
    time: number[];
    value: number[];
    y_axis_units: string;
    thresholds: Array<{
        label: string;
        value: number;
    }>;
}

export interface IraiCitation {
    name: string;
    description: string;
    data: IraiCitationData;
}

export interface IraiAskResponse {
    user_query: string;
    output: string;
    error: boolean;
    request_id: string;
    citations: IraiCitation[];
}

export interface MarketData {
    news: string[];
    sentiment: MarketSentiment;
    interpretation?: string;
}
