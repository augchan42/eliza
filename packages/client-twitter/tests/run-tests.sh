#!/bin/bash

echo "🚀 Running arXiv Integration Tests"
echo "=================================="

# Make sure we're in the right directory
cd "$(dirname "$0")"

echo "📍 Current directory: $(pwd)"
echo ""

# Test 1: Simple API test
echo "🧪 Test 1: Simple arXiv API & Parsing Test"
echo "-------------------------------------------"
node test-arxiv-simple.js

echo ""
echo "⏳ Waiting 2 seconds between tests..."
sleep 2

# Test 2: Full pipeline test (simplified version)
echo "🧪 Test 2: Full Pipeline Test"
echo "------------------------------"
if command -v node &> /dev/null && [ -f "test-arxiv-ranking-simple.js" ]; then
    echo "Running full pipeline test..."
    node test-arxiv-ranking-simple.js --full-pipeline
else
    echo "⚠️  Skipping full pipeline test (Node.js or test file not available)"
fi

echo ""
echo "📊 Test Results Summary"
echo "======================="

# Check if output files were created
if [ -f "test-output-raw-arxiv.xml" ]; then
    echo "✅ Raw arXiv XML: $(wc -c < test-output-raw-arxiv.xml) bytes"
else
    echo "❌ Raw arXiv XML: Not found"
fi

if [ -f "test-output-parsing.json" ]; then
    papers=$(grep -o '"totalParsed":[0-9]*' test-output-parsing.json | cut -d':' -f2)
    echo "✅ Parsed papers: ${papers:-unknown} papers"
else
    echo "❌ Parsing results: Not found"
fi

if [ -f "test-output-ranking-prompt.json" ]; then
    tokens=$(grep -o '"estimatedTokens":[0-9]*' test-output-ranking-prompt.json | cut -d':' -f2)
    echo "✅ Ranking prompt: ${tokens:-unknown} estimated tokens"
else
    echo "❌ Ranking prompt: Not found"
fi

echo ""
echo "📁 Generated Files:"
echo "==================="
ls -la test-output-* 2>/dev/null || echo "No output files generated"

echo ""
echo "🎯 Next Steps:"
echo "=============="
echo "1. Review the JSON output files"
echo "2. Test the integration in the actual bot"
echo "3. Monitor token usage in production"
echo "4. Fine-tune the ranking criteria if needed"

echo ""
echo "✨ Tests complete!"