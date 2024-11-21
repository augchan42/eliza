import { Scraper } from "agent-twitter-client";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

// Create necessary directories
const DATA_DIR = path.join(process.cwd(), 'data', 'tweets');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const TARGET_USERNAME = "michaelmjfm";  // Change this to the user you want to scrape

// Create timestamp for filename
const timestamp = new Date().toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, -1);

const TWEETS_FILE = path.join(DATA_DIR, `${TARGET_USERNAME}_${timestamp}.json`);

async function initTwitterScraper() {
    const scraper = new Scraper();
    let isAuthenticated = false;

    // Check for existing cookies
    if (fs.existsSync('./cookies.json')) {
        try {
            const cookiesText = fs.readFileSync('./cookies.json', 'utf8');
            const cookiesArray = JSON.parse(cookiesText);

            // Format cookies for setting
            const cookieStrings = cookiesArray.map(cookie => 
                `${cookie.key}=${cookie.value}; Domain=${cookie.domain}; Path=${cookie.path}; ` +
                `${cookie.secure ? 'Secure' : ''}; ${cookie.httpOnly ? 'HttpOnly' : ''}; ` +
                `SameSite=${cookie.sameSite || 'Lax'}`
            );

            await scraper.setCookies(cookieStrings);
            isAuthenticated = await scraper.isLoggedIn();
            console.log('Loaded existing cookies:', isAuthenticated ? 'success' : 'failed');
        } catch (e) {
            console.error('Error loading cookies:', e);
        }
    }

    // If no valid cookies, login with credentials
    if (!isAuthenticated) {
        if (!process.env.TWITTER_USERNAME || !process.env.TWITTER_PASSWORD) {
            throw new Error('Twitter credentials are required');
        }

        try {
            await scraper.login(
                process.env.TWITTER_USERNAME,
                process.env.TWITTER_PASSWORD,
                process.env.TWITTER_EMAIL
            );

            // Save cookies for future use
            const cookies = await scraper.getCookies();
            fs.writeFileSync('./cookies.json', JSON.stringify(cookies, null, 2));
            console.log('Logged in and saved new cookies');
        } catch (e) {
            console.error('Login failed:', e);
            throw e;
        }
    }

    return scraper;
}

// Main execution
(async () => {
    try {
        const scraper = await initTwitterScraper();

        if (await scraper.isLoggedIn()) {
            console.log("Successfully authenticated!");
            console.log('Tweets will be saved to:', TWEETS_FILE);

            const tweets = scraper.getTweets(TARGET_USERNAME, 2000);
            let fetchedTweets = [];

            // Load existing tweets if file exists
            if (fs.existsSync(TWEETS_FILE)) {
                const fileContent = fs.readFileSync(TWEETS_FILE, "utf-8");
                fetchedTweets = JSON.parse(fileContent);
            }

            for await (const tweet of tweets) {
                console.log("--------------------");
                console.log("Tweet ID:", tweet.id);
                console.log("Text:", tweet.text);
                console.log("Created At:", tweet.createdAt);
                console.log("Retweets:", tweet.retweetCount);
                console.log("Likes:", tweet.likeCount);
                console.log("--------------------");

                fetchedTweets.push(tweet);

                // Save after each tweet to prevent data loss
                fs.writeFileSync(
                    TWEETS_FILE,
                    JSON.stringify(fetchedTweets, null, 2)
                );
            }

            console.log(`All tweets fetched and saved to ${TWEETS_FILE}`);

            await scraper.logout();
            console.log("Logged out successfully!");
        } else {
            console.log("Authentication failed. Please check your credentials or cookies.");
        }
    } catch (error) {
        console.error("An error occurred:", error);
        if (error.response) {
            console.error("Response data:", error.response.data);
            console.error("Response status:", error.response.status);
        }
    }
})();