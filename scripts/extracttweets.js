import { Scraper } from "agent-twitter-client";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

// Initialize directories
const tweetsDir = path.join(process.cwd(), 'data', 'tweets');
if (!fs.existsSync(tweetsDir)) {
    fs.mkdirSync(tweetsDir, { recursive: true });
}

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

async function processTwitterData() {
    try {
        const scraper = await initTwitterScraper();
        
        if (!(await scraper.isLoggedIn())) {
            console.error('Failed to authenticate with Twitter');
            process.exit(1);
        }

        // Get the most recent tweets file
        const files = fs.readdirSync(tweetsDir)
            .filter(f => f.endsWith('.json') && !f.endsWith('-export.json'))
            .sort((a, b) => {
                return fs.statSync(path.join(tweetsDir, b)).mtime.getTime() - 
                       fs.statSync(path.join(tweetsDir, a)).mtime.getTime();
            });

        if (files.length === 0) {
            console.error('No tweet files found in data/tweets directory');
            process.exit(1);
        }

        const inputFile = files[0];
        const outputFile = inputFile.replace('.json', '-export.json');

        console.log(`Processing ${inputFile} -> ${outputFile}`);

        // Read and process the tweets
        const exportedData = JSON.parse(
            fs.readFileSync(path.join(tweetsDir, inputFile), "utf-8")
        );

        // Extract tweet texts
        const tweetTexts = exportedData
            .map((tweet) => {
                if (tweet.isRetweet && tweet.retweetedStatus) {
                    return tweet.retweetedStatus.text;
                } else {
                    return tweet.text;
                }
            })
            .filter(Boolean);

        // Write processed tweets
        fs.writeFileSync(
            path.join(tweetsDir, outputFile), 
            JSON.stringify(tweetTexts, null, 2)
        );

        console.log(`Extracted ${tweetTexts.length} tweets and saved to ${outputFile}`);

        // Cleanup
        await scraper.logout();
        console.log("Logged out successfully!");

    } catch (error) {
        console.error("An error occurred:", error);
        if (error.response) {
            console.error("Response data:", error.response.data);
            console.error("Response status:", error.response.status);
        }
        process.exit(1);
    }
}

// Run the script
processTwitterData().catch(console.error);