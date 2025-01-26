import { composeContext, elizaLogger } from "@elizaos/core";
import { generateMessageResponse } from "@elizaos/core";
import {
    type Action,
    type ActionExample,
    type HandlerCallback,
    type IAgentRuntime,
    type Memory,
    ModelClass,
    type State,
} from "@elizaos/core";
import { validateOpenWeatherConfig } from "../environment";
import { getCurrentWeatherTemplate } from "../templates";
import { getCurrentWeatherExamples } from "../examples";
import { createWeatherService } from "../services";

export const getCurrentWeatherAction: Action = {
    name: "GET_CURRENT_WEATHER",
    similes: [
        "WEATHER",
        "TEMPERATURE",
        "FORECAST",
        "WEATHER_REPORT",
        "WEATHER_UPDATE",
        "CHECK_WEATHER",
        "WEATHER_CHECK",
        "CHECK_TEMPERATURE",
        "WEATHER_OUTSIDE",
    ],
    description: "Get the current weather for a given location",
    validate: async (runtime: IAgentRuntime) => {
        elizaLogger.debug("Validating OpenWeather configuration...");
        try {
            await validateOpenWeatherConfig(runtime);
            elizaLogger.debug(
                "OpenWeather configuration validated successfully",
            );
            return true;
        } catch (error) {
            elizaLogger.error(
                "OpenWeather configuration validation failed:",
                error,
            );
            return false;
        }
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback: HandlerCallback,
    ) => {
        elizaLogger.debug("Entering GET_CURRENT_WEATHER handler");

        // Initialize/update state
        if (!state) {
            elizaLogger.debug("No existing state, composing new state");
            state = (await runtime.composeState(message)) as State;
        }
        elizaLogger.debug("Updating recent message state");
        state = await runtime.updateRecentMessageState(state);

        // state -> context
        elizaLogger.debug("Composing weather context from state");
        const weatherContext = composeContext({
            state,
            template: getCurrentWeatherTemplate,
        });
        elizaLogger.debug("Weather context composed:", weatherContext);

        // context -> content
        elizaLogger.debug("Generating message response from context");
        const content = await generateMessageResponse({
            runtime,
            context: weatherContext,
            modelClass: ModelClass.SMALL,
        });
        elizaLogger.debug("Generated content:", content);

        // parse content
        const hasLocation =
            content?.city && content?.country && !content?.error;

        if (!hasLocation) {
            elizaLogger.warn("No valid location found in content");
            return;
        }

        // Instantiate API service
        elizaLogger.debug("Validating OpenWeather config for API call");
        const config = await validateOpenWeatherConfig(runtime);
        elizaLogger.debug("Creating weather service");
        const weatherService = createWeatherService(
            config.OPEN_WEATHER_API_KEY,
        );

        // Fetch weather & respond
        try {
            elizaLogger.debug(
                `Attempting to fetch weather for ${content.city}, ${content.country}`,
            );
            const weatherData = await weatherService.getWeather(
                String(content?.city || ""),
                content?.country ? String(content?.country) : undefined,
            );
            elizaLogger.success(
                `Successfully fetched weather for ${content.city}, ${content.country}`,
            );
            elizaLogger.debug("Weather data received:", weatherData);

            if (callback) {
                elizaLogger.debug("Executing callback with weather data");
                callback({
                    text: `The current weather in ${content.city}, ${content.country} is ${weatherData.main.temp}°C, feels like ${weatherData.main.feels_like}°C, and is ${weatherData.weather[0].description} with a wind speed of ${weatherData.wind.speed} km/h.`,
                    content: weatherData,
                });

                return true;
            } else {
                elizaLogger.warn("No callback provided");
            }
        } catch (error) {
            elizaLogger.error("Error in GET_CURRENT_WEATHER handler:", error);
            elizaLogger.debug("Error details:", {
                message: error.message,
                stack: error.stack,
            });

            if (callback) {
                elizaLogger.debug("Executing error callback");
                callback({
                    text: `Error fetching weather: ${error.message}`,
                    content: { error: error.message },
                });
            }

            return false;
        }

        elizaLogger.debug("Exiting GET_CURRENT_WEATHER handler");
        return;
    },
    examples: getCurrentWeatherExamples as ActionExample[][],
} as Action;
