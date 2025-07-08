import React, { useState, useEffect } from 'react';
import { Viewer } from '@react-pdf-viewer/core';
// import { searchPlugin } from '@react-pdf-viewer/search';
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


    // Function to highlight a specific span with character range using existing allTextSpans
    const highlightSpan = (spanIdx, startCharIdx = 0, endCharIdx = null) => {
        console.log("inside highlightSpan");
        
        // Validate span index against existing allTextSpans
        if (spanIdx < 0 || spanIdx >= allTextSpans.length) {
            console.log(`❌ Invalid span index: ${spanIdx}`);
            return;
        }
        
        // Get the target span data from existing allTextSpans
        const targetSpan = allTextSpans[spanIdx];
        console.log(`🔍 Found target span: "${targetSpan.text}" (Page: ${targetSpan.page}, Index: ${targetSpan.index})`);
        
        // Find the corresponding DOM element
        const textLayer = document.querySelector(`[data-testid="core__text-layer-${targetSpan.page - 1}"]`);
        if (!textLayer) {
            console.log(`❌ Text layer for page ${targetSpan.page} not found`);
            return;
        }
        
        const spans = textLayer.querySelectorAll('span');
        console.log(`📄 Found ${spans.length} spans on page ${targetSpan.page}`);
        console.log("spans of textLayer", spans);
        
        // Find the span with matching text content
        let targetDomSpan = null;
        for (let i = 0; i < spans.length; i++) {
            const span = spans[i];
            if (span.textContent === targetSpan.text) {
                targetDomSpan = span;
                console.log(`✅ Found matching DOM span at index ${i} on page ${targetSpan.page}`);
                break;
            }
        }
        
        if (!targetDomSpan) {
            console.log(`❌ DOM span with text "${targetSpan.text}" not found on page ${targetSpan.page}`);
            return;
        }
        
        const spanText = targetDomSpan.textContent;
        
        // If no endCharIdx specified, highlight the entire span
        if (endCharIdx === null) {
            endCharIdx = spanText.length;
        }
        
        // Validate character indices
        if (startCharIdx < 0 || endCharIdx > spanText.length || startCharIdx >= endCharIdx) {
            console.log(`❌ Invalid character indices: ${startCharIdx}-${endCharIdx} for text length ${spanText.length}`);
            return;
        }
        
        // Create a wrapper span to highlight only the specified portion
        const wrapper = document.createElement('span');
        wrapper.style.background = 'yellow';
        wrapper.style.borderRadius = '4px';
        
        const beforeText = spanText.substring(0, startCharIdx);
        const highlightedText = spanText.substring(startCharIdx, endCharIdx);
        const afterText = spanText.substring(endCharIdx);
        
        wrapper.innerHTML = `${beforeText}<span style="background: yellow; border-radius: 4px;">${highlightedText}</span>${afterText}`;
        
        // Replace the original span content
        targetDomSpan.innerHTML = wrapper.innerHTML;
        
        console.log(`✅ Highlighted span ${spanIdx} on page ${targetSpan.page}, characters ${startCharIdx}-${endCharIdx}`);
        console.log(`📝 Text content: "${spanText}"`);
        console.log(`🎯 Highlighted portion: "${highlightedText}"`);
        console.log(`🎨 Applied styles: background=yellow, borderRadius=4px`);
    };

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

            console.log("allSpans after for loop", allSpans);

            // Sort spans by page, then by position (top to bottom, left to right)
            allSpans.sort((a, b) => {
                if (a.page !== b.page) return a.page - b.page;
                if (Math.abs(a.y - b.y) > 5) return b.y - a.y; // Higher Y = lower on page in PDF coordinates
                return a.x - b.x; // Left to right
            });
            
            setAllTextSpans(allSpans);
            console.log(`✅ Extracted and sorted ${allSpans.length} text spans from PDF`);
            console.log("allSpans: ", allSpans);
            
        } catch (error) {
            console.error('❌ Error extracting text spans:', error);
        } finally {
            setIsExtracting(false);
        }
    };


    // Function to clear all existing highlights
    const clearHighlights = () => {
        console.log("inside clearHighlights");
        
        // Find all text layers across all pages
        const textLayers = document.querySelectorAll('[data-testid^="core__text-layer-"]');
        if (textLayers.length === 0) {
            console.log('❌ No text layers found in DOM');
            return;
        }

        let clearedCount = 0;
        
        // Iterate through all pages to clear highlights
        textLayers.forEach((textLayer, pageIdx) => {
            const spans = textLayer.querySelectorAll('span');
            
            spans.forEach((span) => {
                // Remove any existing highlight styles
                span.style.backgroundColor = '';
                span.style.color = '';
                span.style.fontWeight = '';
                span.style.textDecoration = '';
                
                // Remove any highlight-related classes
                span.classList.remove('highlighted', 'pdf-highlight');
                
                clearedCount++;
            });
        });
        
        console.log(`✅ Cleared highlights from ${clearedCount} spans across ${textLayers.length} pages`);
        
        // Clear the state variables
        setExtractedSentenceParts([]);
        setFoundSpans([]);
    };

    // Function to find query across lines with space and hyphen handling
    const findQueryAcrossLinesWithSpaceAndHyphen = (lines, query) => {
        clearHighlights();
        const queryLen = query.length;
        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            // console.log('----------------------------------');
            const line = lines[lineIdx];
            for (let charIdx = 0; charIdx < line.length; charIdx++) {
                let qIdx = 0; // pointer into query
                let lIdx = lineIdx;
                let cIdx = charIdx;
                const matchSpans = [];
                while (qIdx < queryLen && lIdx < lines.length) {
                    const currentLine = lines[lIdx];
                    const startCol = cIdx;
                    while (cIdx < currentLine.length && qIdx < queryLen) {
                        // console.log(currentLine.slice(0, cIdx + 1));
                        if (currentLine[cIdx] === query[qIdx]) {
                            cIdx++;
                            qIdx++;
                        } else if (currentLine[cIdx] === '-') {
                            cIdx++; // skip the hyphen
                        } else {
                            break;
                        }
                    }
                    if (startCol !== cIdx) {
                        matchSpans.push([lIdx, startCol, cIdx]);
                    }
                    if (qIdx === queryLen) {
                        return matchSpans;
                    }
                    const atEndOfLine = cIdx === currentLine.length;
                    // Handle hyphenated line-break
                    if (atEndOfLine && currentLine.endsWith('-') && lIdx + 1 < lines.length) {
                        lIdx += 1;
                        cIdx = 0;
                    }
                    // Handle line-break treated as a space in query
                    else if (atEndOfLine && qIdx < queryLen && query[qIdx] === ' ') {
                        qIdx += 1;
                        lIdx += 1;
                        cIdx = 0;
                    } else {
                        break; // mismatch or unexpected break
                    }
                }
            }
        }
        return []; // no match found
    };

    // NEW: Find consecutive spans using the new algorithm with character-level precision
    const findConsecutiveSpansForSentenceNew = (sentence) => {
        console.log("inside findConsecutiveSpansForSentenceNew");
        if (!sentence.trim() || allTextSpans.length === 0) {
            console.log('⚠️ No sentence provided or no spans available');
            setExtractedSentenceParts([]);
            setFoundSpans([]);
            return;
        }

        // Normalize the sentence (keep original case for better matching)
        const normalizedSentence = sentence.trim();
        console.log("normalizedSentence", normalizedSentence);
        
        // Extract text from spans to use as lines for the new function
        const spanTexts = allTextSpans.map(span => span.text);
        console.log("allTextSpans", allTextSpans);
        console.log("spanTexts", spanTexts);
        
        // Use the new function to find matches
        const matchResults = findQueryAcrossLinesWithSpaceAndHyphen(spanTexts, normalizedSentence);
        
        if (matchResults.length === 0) {
            console.log('❌ NO MATCHES FOUND USING findQueryAcrossLinesWithSpaceAndHyphen');
            setExtractedSentenceParts([]);
            setFoundSpans([]);
            return;
        }
        
        console.log('✅ MATCHES FOUND:', matchResults);
        
        // Extract the matched spans and highlight them
        const matchedSpans = [];
        const sentenceParts = [];
        
        matchResults.forEach(([spanIdx, startIdx, endIdx]) => {
            const span = allTextSpans[spanIdx];
            matchedSpans.push(span);
            
            // Extract the relevant part of the text
            const relevantText = span.text.substring(startIdx, endIdx);
            sentenceParts.push(relevantText);

            console.log("spanIdx:", spanIdx);
            console.log("startIdx:", startIdx);
            console.log("endIdx:", endIdx);
            
            // Highlight the span directly using the existing allTextSpans data
            highlightSpan(spanIdx, startIdx, endIdx);
            console.log(`✅ Highlighted span ${spanIdx} with character range ${startIdx}-${endIdx}`);
            
            console.log(`📄 Page: ${span.page}, Span: ${span.index}, Start: ${startIdx}, End: ${endIdx}, Text: "${relevantText}"`);
        });
        
        // Update state with the extracted sentence parts and found spans
        // setExtractedSentenceParts(sentenceParts);
        setFoundSpans(matchedSpans);
        
        return matchedSpans;
    };

    // Auto-extract spans when component mounts
    useEffect(() => {
        extractAllTextSpans();
    }, []);

    useEffect(() => {
        const timeout = setTimeout(() => {
            // highlightSpan(83, 97, 100); // Span 89 across all pages, characters 0-5
        }, 1000);
        
        return () => clearTimeout(timeout);
    }, [allTextSpans]);

    // Test with example sentences that should exist in the PDF
    // const testSentences = [
    //     "sich um eine akute oder chronische Entzündung des Lungengewebes. Die Krankheit kommt in jeder Altersgruppe vor, besonders häufig",
    //     "Lungenentzündungen (im Fachjargon Pneumonien genannt) sind häufig und können unbehandelt",
    //     // "sehr gefährlich werden. Oft geht eine Grippe oder ein grippeähnlicher Infekt voraus. Eine frühzei",
    //     // "Bei einer bakteriellen Lungenentzündung wird ein Antibiotikum gegeben",
    //     // "Die Prognose einer korrekt und frühzeitig behandelten Lungenentzündung ist exzellent"
    // ];

    // Create search plugin with dynamic keywords
    // const searchPluginInstance = searchPlugin({
    //     keyword: extractedSentenceParts.length > 0 ? extractedSentenceParts : [],
    // });

    // const { ShowSearchPopoverButton } = searchPluginInstance;

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
                        onClick={() => findConsecutiveSpansForSentenceNew(targetSentence)}
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
                            cursor: 'pointer',
                            marginRight: '10px'
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
                        // plugins={[searchPluginInstance]} 
                    />
                </Worker>
            </div>
            
            {/* Instructions */}
            

            {/* Algorithm Explanation */}
            
        </div>
    );
};

export default PDFFile;
