// ==UserScript==
// @name         Universal LaTeX Copier
// @namespace    http://tampermonkey.net/
// @version      7.0
// @description  A highly resilient script for copying web content with math to Markdown.
// @author       Rajeev Verma
// @match        *://*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // --- Part 1: KaTeX Hooking Mechanism (with Dual Storage) ---
    const allKatex = {};
    let originalKatex = window.katex;

    function hookKatexRender(katexObj) {
        if (!katexObj || typeof katexObj.render !== 'function') return;
        const originalRender = katexObj.render;
        katexObj.render = function(latexStr, element, options) {
            originalRender.apply(this, arguments);
            if (element instanceof Element) {
                // Method 1: Attach data attribute
                element.setAttribute('data-latex-source', latexStr);
                // Method 2: Store in global object as a fallback
                const katexHtml = element.querySelector('.katex-html');
                if (katexHtml) {
                    allKatex[katexHtml.outerHTML] = latexStr;
                }
            }
        };
        console.log('Universal Copier: KaTeX hooked successfully.');
    }

    if (originalKatex) {
        hookKatexRender(originalKatex);
    } else {
        Object.defineProperty(window, 'katex', {
            set: function(newKatex) { originalKatex = newKatex; hookKatexRender(originalKatex); },
            get: function() { return originalKatex; },
            configurable: true
        });
    }

    // --- Part 2: The Unified DOM-to-Markdown Converter ---

    function domToMarkdown(node) {
        if (node.nodeType === Node.TEXT_NODE) { return node.textContent.replace(/\s+/g, ' '); }
        if (node.nodeType !== Node.ELEMENT_NODE) { return ''; }

        // --- RESILIENT UNIFIED MATH HANDLING BLOCK ---
        if (node.classList.contains('katex')) {
            let latex = null;

            // Priority 1: Annotation tag (for ChatGPT, Codeforces, etc.)
            const annotation = node.querySelector('.katex-mathml annotation');
            if (annotation && annotation.textContent.trim()) {
                latex = annotation.textContent.trim();
            }
            // Priority 2: Hooked data attribute (cleanest hook method for Gemini)
            else if (node.hasAttribute('data-latex-source')) {
                latex = node.getAttribute('data-latex-source');
            }
            // Priority 3: Hooked global object (robust fallback for Gemini)
            else {
                const katexHtml = node.querySelector('.katex-html');
                if (katexHtml && allKatex[katexHtml.outerHTML]) {
                    latex = allKatex[katexHtml.outerHTML];
                }
            }

            if (latex) {
                const isDisplay = node.parentElement && node.parentElement.classList.contains('katex-display');
                if (isDisplay) {
                    return `\n$$${latex}$$\n\n`;
                } else {
                    return `$${latex}$`;
                }
            }
        }
        
        // --- General Heuristics & Standard HTML ---
        if (node.nodeName === 'DIV' && /code|sample|input/i.test(node.className)) {
            return '```\n' + node.textContent.trim() + '\n```\n\n';
        }
        if (node.nodeName === 'DIV' && /meta|info|details|extra/i.test(node.className)) {
            return '> ' + node.innerText.replace(/\s+/g, ' ').trim() + '\n\n';
        }
        if (node.hasAttribute('tabindex') && node.innerText.length < 20) { return ''; }

        switch (node.nodeName) {
            case 'BUTTON': return ''; 
            case 'H1': return '# ' + processChildren(node).trim() + '\n\n';
            case 'H2': return '## ' + processChildren(node).trim() + '\n\n';
            case 'H3': return '### ' + processChildren(node).trim() + '\n\n';
            case 'H4': return '#### ' + processChildren(node).trim() + '\n\n';
            case 'H5': return '### ' + processChildren(node).trim() + '\n\n';
            case 'H6': return '###### ' + processChildren(node).trim() + '\n\n';
            case 'P': return processChildren(node).trim() + '\n\n';
            case 'UL': return processChildren(node) + '\n';
            case 'OL':
                const items = processChildren(node).trim().split('\n');
                return items.map((item, index) => `${index + 1}. ${item.substring(2)}`).join('\n') + '\n\n';
            case 'LI': return `* ${processChildren(node).trim()}\n`;
            case 'BLOCKQUOTE': return '> ' + processChildren(node).trim().replace(/\n/g, '\n> ') + '\n\n';
            case 'PRE': return '```\n' + node.textContent.trim() + '\n```\n\n';
            case 'CODE': return node.closest('pre') ? node.textContent : '`' + node.textContent + '`';
            case 'SPAN': return processChildren(node);
            case 'A': return `[${processChildren(node)}](${node.href})`;
            case 'IMG': return `![${processChildren(node)}](${node.alt || ''})`;
            case 'BR': return '  \n';
            case 'HR': return '---\n\n';
            default: return processChildren(node);
        }
    }

    function processChildren(parentNode) {
        let childMarkdown = '';
        const children = parentNode.childNodes;
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            childMarkdown += domToMarkdown(child);
            if (parentNode.nodeName === 'P' && child.nodeType === Node.ELEMENT_NODE && child.classList.contains('katex')) {
                let nextSibling = null;
                for (let j = i + 1; j < children.length; j++) {
                    if (children[j].nodeType === Node.TEXT_NODE && children[j].textContent.trim() === '') continue;
                    nextSibling = children[j];
                    break;
                }
                if (nextSibling) {
                    if (nextSibling.nodeType === Node.ELEMENT_NODE && nextSibling.classList.contains('katex')) {
                        childMarkdown += '\n';
                    } else if (nextSibling.nodeType === Node.TEXT_NODE) {
                        const nextText = nextSibling.textContent.trim();
                        if (nextText && (nextText.startsWith('(') || /^[A-Z]/.test(nextText))) {
                            childMarkdown += '\n';
                        }
                    }
                }
            }
        }
        return childMarkdown;
    }

    // --- Part 3: Main Function and Event Listeners ---
    async function convertSelectionToMarkdown() {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
            alert('Converter Error: Please select some text first!'); return;
        }
        const range = selection.getRangeAt(0);
        const fragment = range.cloneContents();
        let markdown = processChildren(fragment);
        markdown = markdown.replace(/^\s+/gm, '');
        markdown = markdown.replace(/\$\s+\(/g, '$\n(');
        markdown = markdown.replace(/\s+\n/g, '\n');
        markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();
        try {
            await navigator.clipboard.writeText(markdown);
            alert('Selection copied as polished Markdown!');
        } catch (err) {
            console.error('Failed to copy text: ', err);
            alert('Could not copy to clipboard. See browser console for details.');
        }
    }

    document.addEventListener('keydown', (event) => {
        if (event.ctrlKey && event.altKey && event.key === 'c') {
            event.preventDefault();
            convertSelectionToMarkdown();
        }
    });
})();
