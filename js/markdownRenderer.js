// ================================================================================
// CODE VED - ADVANCED MARKDOWN & MATH RENDERER (markdownRenderer.js)
// Engineered by Divy Patel | Modular Architecture
// 
// This module is the "Visual Engine" of the AI. It handles:
// 1. Markdown parsing (via marked.js)
// 2. Syntax Highlighting (via highlight.js)
// 3. Complex Math Formulas (via MathJax) with pre/post-processing to prevent breaking
// 4. Mermaid Diagrams rendering
// 5. AI "Thinking Process" collapsible UI
// 6. Code block copy buttons
// ================================================================================

(function() {
    'use strict';

    // ----------------------------------------------------------------------------
    // 1. INITIALIZATION & CONFIGURATION
    // ----------------------------------------------------------------------------
    
    // Initialize Mermaid (Diagrams)
    function initMermaid() {
        if (typeof mermaid !== 'undefined') {
            mermaid.initialize({ 
                startOnLoad: false, 
                theme: 'default',
                securityLevel: 'loose',
                fontFamily: 'Inter, sans-serif'
            });
        }
    }

    // Configure Marked.js (Markdown Parser)
    function initMarked() {
        if (typeof marked === 'undefined') return;

        const renderer = new marked.Renderer();

        // Custom Code Block Renderer (Handles Syntax Highlighting & Mermaid)
        renderer.code = function(code, language, isEscaped) {
            // Handle Mermaid Diagrams
            if (language === 'mermaid') {
                return `<pre class="mermaid-diagram"><code class="mermaid">${code}</code></pre>`;
            }

            // Handle Syntax Highlighting
            let highlightedCode = code;
            const langClass = language ? `language-${language}` : '';
            
            if (language && typeof hljs !== 'undefined' && hljs.getLanguage(language)) {
                try {
                    highlightedCode = hljs.highlight(code, { language: language, ignoreIllegals: true }).value;
                } catch (e) {
                    highlightedCode = hljs.highlightAuto(code).value;
                }
            } else if (typeof hljs !== 'undefined') {
                highlightedCode = hljs.highlightAuto(code).value;
            }

            // SVG Icons for Copy Button
            const copyIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
            
            // Return formatted code block with a copy button
            return `<pre class="code-block-wrapper"><button class="code-copy-btn" title="Copy code">${copyIcon}<span>Copy</span></button><code class="hljs ${langClass}">${highlightedCode}</code></pre>`;
        };

        // Apply the custom renderer to marked
        marked.use({ 
            renderer: renderer, 
            gfm: true, 
            breaks: true, 
            pedantic: false,
            mangle: false,
            headerIds: false
        });
    }

    // ----------------------------------------------------------------------------
    // 2. MATHJAX PRE-PROCESSING & POST-PROCESSING (The Secret Sauce)
    // ----------------------------------------------------------------------------
    /* 
     * WHY THIS IS NEEDED: 
     * Markdown parsers (like marked) often break LaTeX math syntax. For example, 
     * underscores (_) in math formulas get converted to italics (<em>), and 
     * asterisks (*) get converted to bold (<strong>). 
     * To prevent this, we temporarily hide math blocks using unique placeholders, 
     * parse the markdown, and then put the math blocks back!
     */

    function preprocessMath(text) {
        const mathBlocks = {};
        let counter = 0;

        function createPlaceholder(match) {
            const id = `@@MATHBLOCK_${counter++}@@`;
            mathBlocks[id] = match;
            return id;
        }

        // 1. Display Math: $$ ... $$
        text = text.replace(/\$\$([\s\S]+?)\$\$/g, createPlaceholder);
        
        // 2. Display Math: \[ ... \]
        text = text.replace(/\\\[([\s\S]+?)\\\]/g, createPlaceholder);
        
        // 3. Inline Math: $ ... $ (Ensuring it doesn't match currency or empty spaces)
        text = text.replace(/(?<!\$)\$(?!\$)((?:[^$\\]|\\.)+?)\$(?!\$)/g, createPlaceholder);
        
        // 4. Inline Math: \( ... \)
        text = text.replace(/\\\(([\s\S]+?)\\\)/g, createPlaceholder);

        return { text, mathBlocks };
    }

    function postprocessMath(html, mathBlocks) {
        // Replace all placeholders back with the original LaTeX strings
        for (const [id, mathStr] of Object.entries(mathBlocks)) {
            html = html.split(id).join(mathStr);
        }
        return html;
    }

    // ----------------------------------------------------------------------------
    // 3. THINKING PROCESS EXTRACTION (AI Reasoning UI)
    // ----------------------------------------------------------------------------
    
    function processThinkingBlocks(text) {
        // Normalize different AI thinking tags (Qwen, etc.)
        let normalizedText = text
            .replace(/<\|channel\|>thought\s*<\|channel\|>/gi, "<think>\n")
            .replace(/<\|channel\|>answer\s*<\|channel\|>/gi, "\n</think>\n")
            .replace(/<\|im_start\|>thought/gi, "<think>\n")
            .replace(/<\|im_end\|>/gi, "\n</think>\n");

        const thinkRegex = /<think>([\s\S]*?)(?:<\/think>|$)/i;
        const thinkMatch = normalizedText.match(thinkRegex);
        
        let thinkHtml = '';
        let mainText = normalizedText;

        if (thinkMatch) {
            const thinkContent = thinkMatch[1].trim();
            // Parse the thinking content as markdown too, for better readability
            const parsedThinkContent = typeof marked !== 'undefined' ? marked.parse(thinkContent) : thinkContent;
            
            thinkHtml = `
            <details class="qwen-think-box" open>
                <summary>
                    <svg class="arrow" style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="9 18 15 12 9 6"></polyline>
                    </svg> 
                    Thinking Process
                </summary>
                <div class="qwen-think-content">${parsedThinkContent}</div>
            </details>`;
            
            // Remove the think block from the main text
            mainText = normalizedText.replace(thinkRegex, '').trim();
        }

        return { thinkHtml, mainText };
    }

    // ----------------------------------------------------------------------------
    // 4. POST-RENDERING TRIGGERS (MathJax & Mermaid)
    // ----------------------------------------------------------------------------

    async function triggerMathJax(container) {
        if (window.MathJax && MathJax.typesetPromise) {
            try {
                // Clear previous math rendering in this container to prevent errors
                MathJax.typesetClear([container]);
                // Render new math
                await MathJax.typesetPromise([container]);
            } catch (err) {
                console.warn('MathJax Rendering Warning:', err);
            }
        }
    }

    async function triggerMermaid(container) {
        if (typeof mermaid === 'undefined') return;
        
        const diagrams = container.querySelectorAll('.mermaid');
        if (diagrams.length === 0) return;

        try {
            // mermaid.run is the modern way to render specific nodes
            await mermaid.run({ nodes: diagrams });
        } catch (err) {
            console.warn('Mermaid Rendering Warning:', err);
            // If mermaid fails, it might leave broken SVGs. We clean them up.
            diagrams.forEach(d => {
                if (!d.querySelector('svg')) {
                    d.innerHTML = `<span style="color:var(--brand-danger);font-size:12px;">⚠️ Invalid Mermaid Syntax</span>`;
                }
            });
        }
    }

    // ----------------------------------------------------------------------------
    // 5. MAIN RENDERING ENGINE (Exposed to script.js)
    // ----------------------------------------------------------------------------

    /**
     * The core function called by script.js to render AI responses.
     * @param {string} fullText - The raw text from the AI.
     * @param {boolean} isProcessing - True if the AI is still streaming.
     * @param {HTMLElement} container - The DOM element to inject the HTML into.
     */
    async function parseAndRender(fullText, isProcessing, container) {
        if (!container) return;

        // Step 1: Extract and format "Thinking" blocks
        const { thinkHtml, mainText } = processThinkingBlocks(fullText);

        let finalHtml = thinkHtml;

        // Step 2: Process the main text
        if (mainText) {
            // 2a. Hide Math formulas so Markdown parser doesn't break them
            const { text: safeText, mathBlocks } = preprocessMath(mainText);
            
            // 2b. Parse Markdown to HTML
            let parsedHtml = '';
            if (typeof marked !== 'undefined') {
                parsedHtml = marked.parse(safeText);
            } else {
                parsedHtml = safeText.replace(/\n/g, '<br>'); // Fallback
            }
            
            // 2c. Put Math formulas back
            parsedHtml = postprocessMath(parsedHtml, mathBlocks);
            
            // 2d. Wrap in a class for MathJax targeting
            finalHtml += `<div class="tex2jax_process">${parsedHtml}</div>`;
        }

        // Step 3: Add blinking cursor if AI is still generating
        if (isProcessing) {
            finalHtml += `<span class="blinking-cursor"></span>`;
        }
        
        // Step 4: Inject into DOM
        container.innerHTML = finalHtml;

        // Step 5: Trigger external renderers (MathJax & Mermaid)
        // We only trigger them fully when processing is done to save performance,
        // but we do a lightweight pass during streaming.
        if (!isProcessing) {
            await triggerMathJax(container);
            await triggerMermaid(container);
        } else {
            // Lightweight MathJax trigger during streaming (optional, prevents lag)
            // triggerMathJax(container); 
        }
    }

    // ----------------------------------------------------------------------------
    // 6. INITIALIZATION & EXPORT
    // ----------------------------------------------------------------------------

    function init() {
        initMermaid();
        initMarked();
        console.log('[MarkdownRenderer] Engine initialized successfully.');
    }

    // Expose the API to the global window object so script.js can use it
    window.MarkdownRenderer = {
        parseAndRender: parseAndRender,
        init: init
    };

    // Auto-initialize when this script loads
    init();

})();
