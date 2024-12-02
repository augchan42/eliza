import fs from "fs";
import path from "path";

// Initialize directories
const tweetsDir = path.join(process.cwd(), 'data', 'tweets');
if (!fs.existsSync(tweetsDir)) {
    fs.mkdirSync(tweetsDir, { recursive: true });
}

async function processTwitterData() {
    try {
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

    } catch (error) {
        console.error("An error occurred:", error);
        process.exit(1);
    }
}

// Run the script
processTwitterData().catch(console.error);