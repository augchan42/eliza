import type { WeatherResponse } from "./types";
import { elizaLogger } from "@elizaos/core";

const BASE_URL = "https://api.openweathermap.org/data/2.5"; // Changed to 2.5 version

export const createWeatherService = (apiKey: string) => {
    const getWeather = async (
        city: string,
        country?: string,
    ): Promise<WeatherResponse> => {
        elizaLogger.debug("Starting getWeather call with params:", {
            city,
            country,
            hasApiKey: !!apiKey,
        });

        if (!apiKey || !city) {
            elizaLogger.error("Missing required parameters:", {
                hasApiKey: !!apiKey,
                hasCity: !!city,
            });
            throw new Error("Invalid parameters");
        }

        try {
            const location = country ? `${city},${country}` : city;
            elizaLogger.debug(`Constructed location string: ${location}`);

            const url = new URL(`${BASE_URL}/weather`);
            url.searchParams.append("q", location);
            url.searchParams.append("appid", apiKey);
            url.searchParams.append("units", "metric");

            elizaLogger.debug(
                `Making API request to: ${url.toString().replace(apiKey, "REDACTED")}`,
            );

            const response = await fetch(url);

            // Log headers properly using forEach
            const headers: Record<string, string> = {};
            response.headers.forEach((value, key) => {
                headers[key] = value;
            });

            elizaLogger.debug("Received API response:", {
                status: response.status,
                statusText: response.statusText,
                headers,
            });

            if (!response.ok) {
                const errorData = await response.json();
                elizaLogger.error("API error response:", {
                    status: response.status,
                    statusText: response.statusText,
                    errorData,
                });
                throw new Error(errorData?.message || response.statusText);
            }

            const data = await response.json();
            elizaLogger.debug("Successfully parsed weather data", {
                cityName: data?.name,
                hasMainData: !!data?.main,
                hasWeatherData: !!data?.weather,
            });

            return data;
        } catch (error) {
            elizaLogger.error("Weather API Error:", {
                message: error.message,
                stack: error.stack,
                type: error.constructor.name,
            });

            // Check if it's a network error
            if (
                error instanceof TypeError &&
                error.message === "Failed to fetch"
            ) {
                elizaLogger.error(
                    "Network error detected - possible connectivity issue",
                );
                throw new Error("Network connectivity error");
            }

            throw error;
        }
    };

    return { getWeather };
};
