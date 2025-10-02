(function() {
    'use strict';

    function domToMarkdown(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            // Collapse whitespace sequences into a single space.
            return node.textContent.replace(/\s+/g, ' ');
        }

        if (node.nodeType !== Node.ELEMENT_NODE) {
            return '';
        }

        if (node.hasAttribute('tabindex') && node.innerText.length < 20) {
            return '';
        }

        let markdownText = processChildren(node);

        switch (node.nodeName) {
            case 'H1': return '# ' + markdownText.trim() + '\n\n';
            case 'H2': return '## ' + markdownText.trim() + '\n\n';
            case 'H3': return '### ' + markdownText.trim() + '\n\n';
            case 'H4': return '#### ' + markdownText.trim() + '\n\n';
            case 'H5': return '### ' + markdownText.trim() + '\n\n'; // Convert H5 to H3
            case 'H6': return '###### ' + markdownText.trim() + '\n\n';
            case 'P': return markdownText.trim() + '\n\n';
            case 'UL': return markdownText + '\n';
            case 'OL':
                const items = markdownText.trim().split('\n');
                return items.map((item, index) => `${index + 1}. ${item.substring(2)}`).join('\n') + '\n\n';
            case 'LI': return `* ${markdownText.trim()}\n`;
            case 'BLOCKQUOTE': return '> ' + markdownText.trim().replace(/\n/g, '\n> ') + '\n\n';
            case 'PRE': return '```\n' + node.textContent.trim() + '\n```\n\n';
            case 'CODE': return node.closest('pre') ? node.textContent : '`' + node.textContent + '`';
            case 'SPAN':
                if (node.classList.contains('katex') || node.classList.contains('math-inline')) {
                    const annotation = node.querySelector('annotation');
                    if (annotation && annotation.textContent.trim()) {
                        return `$${annotation.textContent.trim()}$`;
                    }
                }
                return markdownText;
            case 'A': return `[${markdownText}](${node.href})`;
            case 'IMG': return `![${node.alt || ''}](${node.src})`;
            case 'BR': return '  \n';
            case 'HR': return '---\n\n';
            default: return markdownText;
        }
    }

    function processChildren(parentNode) {
        let childMarkdown = '';
        const children = parentNode.childNodes;

        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            childMarkdown += domToMarkdown(child);

            // THE FIX: Reverted to the safer logic.
            // Only add a newline if a math span is followed by ANOTHER math span.
            if (parentNode.nodeName === 'P' && child.nodeType === Node.ELEMENT_NODE && (child.classList.contains('katex') || child.classList.contains('math-inline'))) {
                let nextSibling = null;
                for (let j = i + 1; j < children.length; j++) {
                    if (children[j].nodeType === Node.TEXT_NODE && children[j].textContent.trim() === '') {
                        continue;
                    }
                    nextSibling = children[j];
                    break;
                }
                
                if (nextSibling && nextSibling.nodeType === Node.ELEMENT_NODE && (nextSibling.classList.contains('katex') || nextSibling.classList.contains('math-inline'))) {
                    childMarkdown += '\n';
                }
            }
        }
        return childMarkdown;
    }

    async function convertSelectionToMarkdown() {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
            alert('Converter Error: Please select some text first!');
            return;
        }

        const range = selection.getRangeAt(0);
        const fragment = range.cloneContents();
        let markdown = processChildren(fragment);

        // A series of final cleanup steps for perfectly polished markdown.
        markdown = markdown.replace(/^\s+/gm, ''); // Trim leading whitespace from all lines.
        
        // A targeted replacement to separate the final constraints line.
        markdown = markdown.replace(/\$ \(/g, '$\n('); 
        
        markdown = markdown.replace(/\n{3,}/g, '\n\n').trim(); // Collapse excess blank lines.

        try {
            await navigator.clipboard.writeText(markdown);
            alert('Selection copied as polished Markdown!');
        } catch (err) {
            console.error('Failed to copy text: ', err);
            alert('Could not copy to clipboard. See browser console for details.');
        }
    }

    document.addEventListener('keydown', (event) => {
        // Press the shortcut key Ctrl + Alt + C to copy the selected portion 
	if (event.ctrlKey && event.altKey && event.key === 'c') {
            event.preventDefault();
            convertSelectionToMarkdown();
        }
    });

})();
