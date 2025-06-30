import React, { useState, useEffect } from 'react';
import { Viewer } from '@react-pdf-viewer/core';
import { searchPlugin } from '@react-pdf-viewer/search';
import { Worker } from '@react-pdf-viewer/core';
import * as pdfjs from 'pdfjs-dist';

import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/search/lib/styles/index.css';

import samplePDF from '../static/053-007l_S1_Nackenschmerz_2017-01-abgelaufen.pdf';

const PDFFile = () => {
    const [allTextSpans, setAllTextSpans] = useState([]);
    const [isExtracting, setIsExtracting] = useState(false);
    const [targetSentence, setTargetSentence] = useState('');
    const [extractedSentenceParts, setExtractedSentenceParts] = useState([]);
    const [foundSpans, setFoundSpans] = useState([]);

    // Configure PDF.js worker
    useEffect(() => {
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
    }, []);

    // Extract all text spans directly from PDF
    const extractAllTextSpans = async () => {
        setIsExtracting(true);
        console.log('🔄 Starting text span extraction from PDF...');
        
        try {
            const loadingTask = pdfjs.getDocument(samplePDF);
            const pdf = await loadingTask.promise;
            
            const allSpans = [];
            
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                console.log(`📄 Extracting page ${pageNum}...`);
                const page = await pdf.getPage(pageNum);
                const textContent = await page.getTextContent();
                
                textContent.items.forEach((item, index) => {
                    if (item.str && item.str.trim().length > 0) {
                        allSpans.push({
                            page: pageNum,
                            index: index,
                            text: item.str,
                            x: item.transform[4],
                            y: item.transform[5],
                            width: item.width,
                            height: item.height,
                            fontSize: item.height,
                            fontName: item.fontName || 'unknown'
                        });
                    }
                });
            }
            
            // Sort spans by page, then by position (top to bottom, left to right)
            allSpans.sort((a, b) => {
                if (a.page !== b.page) return a.page - b.page;
                if (Math.abs(a.y - b.y) > 5) return b.y - a.y; // Higher Y = lower on page in PDF coordinates
                return a.x - b.x; // Left to right
            });
            
            setAllTextSpans(allSpans);
            console.log(`✅ Extracted and sorted ${allSpans.length} text spans from PDF`);
            
        } catch (error) {
            console.error('❌ Error extracting text spans:', error);
        } finally {
            setIsExtracting(false);
        }
    };

    // Helper function to normalize text for better matching (handles hyphenated words split across lines)
    const normalizeTextForMatching = (text) => {
        // console.log('🔄 Normalizing text:', text);
        // Remove hyphenation artifacts where words are split across lines
        let normalized = text
            // Remove hyphens at the end of words followed by space and lowercase letter
            .replace(/([a-zA-Z0-9äöüÄÖÜß])\s*-\s*([a-zA-Z0-9äöüÄÖÜß])/g, '$1$2')
            // Normalize multiple spaces to single space
            .replace(/\s+/g, ' ')
            .trim();
        // console.log('✅ Normalized text:', normalized);
        return normalized;
    };

    // Helper function to extract only the sentence parts from spans
    const extractSentencePartsFromSpans = (spans, targetSentence) => {
        console.log("inside extractSentencePartsFromSpans");

        console.log("spans: ", spans);
        console.log("targetSentence: ", targetSentence);
        if (!spans || spans.length === 0) return [];
        
        // Concatenate all span texts to recreate the full text
        let fullText = '';
        const spanPositions = []; // Track where each span starts and ends in the full text
        
        spans.forEach((span, index) => {
            const startPos = fullText.length;
            if (fullText.length > 0) {
                
                // Add space if needed between spans
                const needsSpace = !fullText.endsWith(' ') && !span.text.startsWith(' ');
                if (needsSpace) {
                    fullText += ' ';
                }
            }
            const textStartPos = fullText.length;
            fullText += span.text;
            const endPos = fullText.length;
            
            spanPositions.push({
                spanIndex: index,
                textStartPos: textStartPos,
                textEndPos: endPos,
                originalText: span.text
            });
        });

        
        console.log("spanPositions: ", spanPositions);
        console.log("fullText: ", fullText);
        // Clean up texts for comparison using the new normalization
        const cleanFullText = normalizeTextForMatching(fullText);
        console.log("cleanFullText: ", cleanFullText);
        const cleanTargetSentence = normalizeTextForMatching(targetSentence);
        console.log("cleanTargetSentence: ", cleanTargetSentence);
        
        // Find where the target sentence appears in the full text
        const sentenceStartIndex = cleanFullText.indexOf(cleanTargetSentence);
        if (sentenceStartIndex === -1) {
            console.log('⚠️ Target sentence not found in concatenated spans');
            console.log(`   Full text (normalized): "${cleanFullText}"`);
            console.log(`   Target (normalized): "${cleanTargetSentence}"`);
            return spans.map(span => span.text); // Return original texts as fallback
        }

        const hyphenCounter = (fullText.slice(sentenceStartIndex, sentenceStartIndex + cleanTargetSentence.length).match(/-/g) || []).length;
        console.log("hyphenCounter: ", hyphenCounter);
        
        const sentenceEndIndex = sentenceStartIndex + cleanTargetSentence.length + hyphenCounter*2;
        
        // Extract only the parts of each span that contribute to the target sentence
        const sentencePartTexts = [];
        
        spanPositions.forEach(spanPos => {
            const spanStart = spanPos.textStartPos;
            const spanEnd = spanPos.textEndPos;
            
            // Check if this span overlaps with the target sentence
            if (spanEnd > sentenceStartIndex && spanStart < sentenceEndIndex) {
                // Calculate the intersection
                const intersectionStart = Math.max(spanStart, sentenceStartIndex);
                const intersectionEnd = Math.min(spanEnd, sentenceEndIndex);
                
                // Extract the relevant part from the original span text
                const relativeStart = intersectionStart - spanStart;
                const relativeEnd = intersectionEnd - spanStart;
                
                const relevantPart = spanPos.originalText.substring(relativeStart, relativeEnd);
                sentencePartTexts.push(relevantPart);
            }
        });
        
        return sentencePartTexts;
    };

    // Find ONLY the consecutive spans that form the provided sentence
    const findConsecutiveSpansForSentence = (sentence) => {
        console.log("inside findConsecutiveSpansForSentence");
        if (!sentence.trim() || allTextSpans.length === 0) {
            console.log('⚠️ No sentence provided or no spans available');
            setExtractedSentenceParts([]);
            setFoundSpans([]);
            return;
        }

        // console.log('\n🎯 FINDING CONSECUTIVE SPANS FOR SENTENCE:');
        // console.log(`Target sentence: "${sentence}"`);
        // console.log('═'.repeat(80));

        // Normalize the sentence (keep original case for better matching)
        const normalizedSentence = sentence.trim();
        console.log("normalizedSentence", normalizedSentence);
        
        // Try to find the sentence in concatenated spans
        const consecutiveSpanGroups = [];
        
        
        // Check every possible starting position in the spans array
        for (let startIndex = 0; startIndex < allTextSpans.length; startIndex++) {
            console.log("inside for loop");
            const spanGroup = [];
            let concatenatedText = '';
            let currentIndex = startIndex;
            
            // Keep adding consecutive spans until we either:
            // 1. Find the complete sentence
            // 2. Go beyond what could contain the sentence
            // 3. Reach the end of spans
            while (currentIndex < allTextSpans.length) {
                const currentSpan = allTextSpans[currentIndex];
                spanGroup.push(currentSpan);
                
                // Add span text with appropriate spacing
                if (concatenatedText.length > 0) {
                    // Add space if the previous span doesn't end with space and current doesn't start with space
                    // TODO: handle hyphens

                    const hasHyphen = concatenatedText.endsWith('-');
                    if (hasHyphen) {
                        concatenatedText = concatenatedText.slice(0, -1) + currentSpan.text;
                    } else {
                        const needsSpace = !concatenatedText.endsWith(' ') && !currentSpan.text.startsWith(' ');
                        concatenatedText += (needsSpace ? ' ' : '') + currentSpan.text;
                    }
                    
                } else {
                    concatenatedText = currentSpan.text;
                }
                
                // Clean up the concatenated text for comparison using normalization that handles hyphens
                const cleanConcatenated = normalizeTextForMatching(concatenatedText);
                console.log("cleanConcatenated: #", cleanConcatenated, "#");
                // console.log('🔄 Clean concatenated text:', cleanConcatenated);
                const cleanTarget = normalizeTextForMatching(normalizedSentence);
                console.log('🔄 Clean target text: #', cleanTarget, "#");
                // Check if we found the exact sentence
                if (cleanConcatenated === cleanTarget) {
                    console.log(`✅ EXACT MATCH FOUND! Starting at span index ${startIndex}`);
                    consecutiveSpanGroups.push({
                        spans: [...spanGroup],
                        matchType: 'EXACT',
                        concatenatedText: cleanConcatenated,
                        startIndex: startIndex,
                        endIndex: currentIndex
                    });
                    break;
                }
                
                // Check if the sentence is contained within the concatenated text
                // But only if it's not just extra text at the beginning
                if (cleanConcatenated.includes(cleanTarget)) {
                    console.log("inside if");

                    // Check if the target sentence starts at the beginning of concatenated text
                    // or if there's only minimal extra text at the start
                    const targetIndex = cleanConcatenated.indexOf(cleanTarget);
                    console.log("targetIndex: ", targetIndex);
                    const extraTextBefore = cleanConcatenated.substring(0, targetIndex).trim();
                    
                    // Only accept if there's no extra text before, or very minimal extra text
                    //if (targetIndex === 0 || extraTextBefore.length <= 20) {
                        console.log(`✅ SENTENCE CONTAINED! Starting at span index ${startIndex} (extra text: "${extraTextBefore}")`);
                        consecutiveSpanGroups.push({
                            spans: [...spanGroup],
                            matchType: targetIndex === 0 ? 'CONTAINED_CLEAN' : 'CONTAINED_WITH_PREFIX',
                            concatenatedText: cleanConcatenated,
                            startIndex: startIndex,
                            endIndex: currentIndex,
                            extraTextLength: extraTextBefore.length
                        });
                    //}
                    break;
                }
                
                // Check if target sentence starts with our concatenated text (partial match - keep going)
                if (cleanTarget.startsWith(cleanConcatenated)) {
                    // Keep going, we might find the complete sentence
                    currentIndex++;
                    continue;
                }
                
                // If concatenated text is already longer than target and no match, stop
                // 20 is an arbitrary number that seem to work for now
                if (cleanConcatenated.length > cleanTarget.length * 20) {
                    console.log(" --------------- break because of length ---------------");
                    break;
                }
                
                currentIndex++;
                
                // Safety limit to prevent infinite loops
                if (spanGroup.length > 20) {
                    break;
                }
            }
        }

        // Filter to get the best matches with improved prioritization
        const bestMatches = consecutiveSpanGroups
            .sort((a, b) => {
                // 1. Prefer EXACT matches over everything else
                if (a.matchType === 'EXACT' && b.matchType !== 'EXACT') return -1;
                if (b.matchType === 'EXACT' && a.matchType !== 'EXACT') return 1;
                
                // 2. Among non-exact matches, prefer CONTAINED_CLEAN over CONTAINED_WITH_PREFIX
                if (a.matchType === 'CONTAINED_CLEAN' && b.matchType === 'CONTAINED_WITH_PREFIX') return -1;
                if (b.matchType === 'CONTAINED_CLEAN' && a.matchType === 'CONTAINED_WITH_PREFIX') return 1;
                
                // 3. If both have prefixes, prefer the one with less extra text
                if (a.extraTextLength !== undefined && b.extraTextLength !== undefined) {
                    if (a.extraTextLength !== b.extraTextLength) return a.extraTextLength - b.extraTextLength;
                }
                
                // 4. Finally, prefer shorter span groups
                return a.spans.length - b.spans.length;
            })
            .slice(0, 1); // Take only the BEST match to avoid duplicates

        // Log results
        if (bestMatches.length === 0) {
            console.log('❌ NO CONSECUTIVE SPANS FOUND FOR THIS SENTENCE');
            console.log('💡 Try a shorter phrase or check if the sentence exists in the PDF');
            setExtractedSentenceParts([]);
            setFoundSpans([]);
            return [];
        }

        console.log(`\n📊 FOUND ${bestMatches.length} CONSECUTIVE SPAN GROUP(S):`);
        console.log('═'.repeat(80));

        bestMatches.forEach((match, groupIndex) => {
            console.log(`\n🎯 GROUP ${groupIndex + 1} (${match.matchType} MATCH):`);
            console.log(`   Spans: ${match.startIndex} to ${match.endIndex} (${match.spans.length} spans)`);
            console.log(`   Reconstructed: "${match.concatenatedText}"`);
            console.log(`   Original:      "${normalizedSentence}"`);
            
            console.log(`\n   📋 INDIVIDUAL SPANS IN THIS GROUP:`);
            match.spans.forEach((span, spanIndex) => {
                console.log(`   ${spanIndex + 1}. [Page ${span.page}, Index ${span.index}] "${span.text}"`);
                console.log(`      Position: (${Math.round(span.x)}, ${Math.round(span.y)}) | Font: ${span.fontName} ${Math.round(span.fontSize)}px`);
            });
        });

        // Return the spans from the best match
        const bestMatch = bestMatches[0];
        console.log(`\n📤 RETURNING ${bestMatch.spans.length} CONSECUTIVE SPANS FOR PROGRAMMATIC USE:`);
        console.log('These spans together form your sentence:');
        bestMatch.spans.forEach((span, index) => {
            console.log(`${index + 1}. "${span.text}"`);
        });
        
         // Create array of span texts that contain only the sentence parts
         const sentencePartTexts = extractSentencePartsFromSpans(bestMatch.spans, normalizedSentence);
         console.log(`\n🎯 EXTRACTED SENTENCE PART TEXTS (only relevant portions):`);
         sentencePartTexts.forEach((text, index) => {
             console.log(`${index + 1}. "${text}"`);
         });

         // Update state with the extracted sentence parts and found spans
         setExtractedSentenceParts(sentencePartTexts);
         setFoundSpans(bestMatch.spans);

        return bestMatch.spans;
    };

    // Auto-extract spans when component mounts
    useEffect(() => {
        extractAllTextSpans();
    }, []);

    // Test with example sentences that should exist in the PDF
    const testSentences = [
        "sich um eine akute oder chronische Entzündung des Lungengewebes. Die Krankheit kommt in jeder Altersgruppe vor, besonders häufig",
        "Lungenentzündungen (im Fachjargon Pneumonien genannt) sind häufig und können unbehandelt",
        // "sehr gefährlich werden. Oft geht eine Grippe oder ein grippeähnlicher Infekt voraus. Eine frühzei",
        // "Bei einer bakteriellen Lungenentzündung wird ein Antibiotikum gegeben",
        // "Die Prognose einer korrekt und frühzeitig behandelten Lungenentzündung ist exzellent"
    ];

    // Create search plugin with dynamic keywords
    const searchPluginInstance = searchPlugin({
        keyword: extractedSentenceParts.length > 0 ? extractedSentenceParts : [],
    });

    const { ShowSearchPopoverButton } = searchPluginInstance;

    return (
        <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
            <h2 style={{ marginBottom: '20px', color: '#333' }}>
                PDF Consecutive Text Span Finder
            </h2>

            {/* Control Panel */}
            <div style={{
                marginBottom: '20px',
                padding: '20px',
                backgroundColor: '#f8f9fa',
                borderRadius: '8px',
                border: '2px solid #dee2e6'
            }}>
                <h4 style={{ margin: '0 0 15px 0', color: '#495057' }}>
                    🔍 Find Consecutive Spans for Sentence:
                </h4>

                {/* Sentence Input */}
                <div style={{ marginBottom: '15px' }}>
                    <textarea
                        value={targetSentence}
                        onChange={(e) => setTargetSentence(e.target.value)}
                        placeholder="Enter a sentence to find the consecutive spans that form it..."
                        rows={3}
                        style={{
                            width: '100%',
                            padding: '12px',
                            fontSize: '14px',
                            border: '2px solid #dee2e6',
                            borderRadius: '6px',
                            marginBottom: '10px',
                            fontFamily: 'Arial, sans-serif',
                            resize: 'vertical'
                        }}
                    />
                    <button
                        onClick={() => findConsecutiveSpansForSentence(targetSentence)}
                        disabled={!targetSentence.trim() || allTextSpans.length === 0}
                        style={{
                            padding: '12px 20px',
                            backgroundColor: '#007bff',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            marginRight: '10px'
                        }}
                    >
                        🔍 Find Consecutive Spans
                    </button>
                    <button
                        onClick={extractAllTextSpans}
                        disabled={isExtracting}
                        style={{
                            padding: '12px 20px',
                            backgroundColor: '#28a745',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            fontWeight: 'bold',
                            cursor: 'pointer'
                        }}
                    >
                        {isExtracting ? '⏳ Extracting...' : '🔄 Re-extract Spans'}
                    </button>
                </div>

                {/* Display Found Sentence Parts */}
                {extractedSentenceParts.length > 0 && (
                    <div style={{
                        marginBottom: '15px',
                        padding: '15px',
                        backgroundColor: '#e7f5e7',
                        borderRadius: '6px',
                        border: '2px solid #28a745'
                    }}>
                        <h5 style={{ margin: '0 0 10px 0', color: '#155724' }}>
                            ✅ Found Sentence Parts (Highlighted in PDF):
                        </h5>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {extractedSentenceParts.map((part, index) => (
                                <span
                                    key={index}
                                    style={{
                                        padding: '6px 12px',
                                        backgroundColor: '#fff3cd',
                                        border: '1px solid #ffc107',
                                        borderRadius: '4px',
                                        fontSize: '13px',
                                        fontWeight: 'bold',
                                        color: '#856404'
                                    }}
                                >
                                    {index + 1}. "{part}"
                                </span>
                            ))}
                        </div>
                        <div style={{ 
                            marginTop: '10px', 
                            fontSize: '12px', 
                            color: '#155724',
                            fontStyle: 'italic'
                        }}>
                            💡 These parts are automatically highlighted in the PDF viewer below. 
                            Found {foundSpans.length} consecutive span(s) across {Math.max(...foundSpans.map(s => s.page))} page(s).
                        </div>
                    </div>
                )}

                {/* Test Buttons */}
                <div style={{ marginBottom: '15px' }}>
                    {/* <h5 style={{ margin: '0 0 10px 0', color: '#495057' }}>
                        🧪 Test with Known Sentences:
                    </h5> */}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {testSentences.map((sentence, index) => (
                            <button
                                key={index}
                                onClick={() => {
                                    setTargetSentence(sentence);
                                    findConsecutiveSpansForSentence(sentence);
                                }}
                                style={{
                                    padding: '8px 12px',
                                    backgroundColor: '#6f42c1',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    cursor: 'pointer',
                                    maxWidth: '200px',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                }}
                                title={sentence}
                            >
                                Test {index + 1}: {sentence.substring(0, 20)}...
                            </button>
                        ))}
                    </div>
                </div>

                {/* Status */}
                <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{
                        padding: '8px 12px',
                        backgroundColor: allTextSpans.length > 0 ? '#28a745' : '#dc3545',
                        borderRadius: '4px',
                        color: 'white',
                        fontSize: '12px',
                        fontWeight: 'bold'
                    }}>
                        📊 {allTextSpans.length} spans extracted & sorted
                    </div>

                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '8px 12px',
                        backgroundColor: '#007bff',
                        borderRadius: '4px',
                        color: 'white'
                    }}>
                        <ShowSearchPopoverButton />
                        <span style={{ fontWeight: 'bold', fontSize: '12px' }}>
                            Manual Search
                        </span>
                    </div>

                    {extractedSentenceParts.length > 0 && (
                        <div style={{
                            padding: '8px 12px',
                            backgroundColor: '#ffc107',
                            borderRadius: '4px',
                            color: '#856404',
                            fontSize: '12px',
                            fontWeight: 'bold'
                        }}>
                            🎯 {extractedSentenceParts.length} parts highlighted
                        </div>
                    )}
                </div>
            </div>
            
            {/* PDF Viewer Container */}
            <div
                className="rpv-core__viewer"
                style={{
                    border: '2px solid rgba(0, 0, 0, 0.3)',
                    borderRadius: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    height: '75vh',
                    boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
                }}
            >
                <Worker workerUrl="/pdf.worker.min.js">
                    <Viewer 
                        key={extractedSentenceParts.join('-')} // Force re-render when sentence parts change
                        fileUrl={samplePDF} 
                        plugins={[searchPluginInstance]} 
                    />
                </Worker>
            </div>
            
            {/* Instructions */}
            

            {/* Algorithm Explanation */}
            
        </div>
    );
};

export default PDFFile;
