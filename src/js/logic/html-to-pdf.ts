import { showLoader, hideLoader, showAlert } from '../ui.js';
import { jsPDF } from 'jspdf';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';

let quill: Quill;

function generateTextPDF() {
  const doc = new jsPDF({
    unit: 'mm',
    format: 'a4',
    orientation: 'portrait',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const MARGIN = 15;
  const MAX_LINE_WIDTH = pageWidth - 2 * MARGIN;

  let cursorY = MARGIN;               // current Y position on page
  const LINE_HEIGHT = 7;              // mm – tweak if needed

  const delta = quill.getContents();

  // Helper: add a new page when we run out of space
  const ensureSpace = (needed: number) => {
    if (cursorY + needed > pageHeight - MARGIN) {
      doc.addPage();
      cursorY = MARGIN;
    }
  };

  // Walk every operation
  delta.ops.forEach((op: any) => {
    if (typeof op.insert !== 'string') return;

    const text: string = op.insert;
    const attrs = op.attributes || {};

    // -----------------------------------------------------------------
    // 3.1 Split into *lines* (Quill stores \n as a separate op)
    // -----------------------------------------------------------------
    const lines = text.split('\n');

    lines.forEach((line, lineIdx) => {
      if (lineIdx > 0) {
        cursorY += LINE_HEIGHT;
        ensureSpace(LINE_HEIGHT);
      }

      if (!line) return;   // empty line → just spacing

      // -----------------------------------------------------------------
      // 3.2 Determine style for THIS line
      // -----------------------------------------------------------------
      const isBold = !!attrs.bold;
      const isItalic = !!attrs.italic;
      const isUnderline = !!attrs.underline;

      const fontStyle = isBold && isItalic ? 'bolditalic' :
        isBold ? 'bold' :
          isItalic ? 'italic' :
            'normal';

      // ---- Header size ------------------------------------------------
      let fontSize = 12;
      if (attrs.header === 1) fontSize = 22;
      else if (attrs.header === 2) fontSize = 18;
      else if (attrs.header === 3) fontSize = 15;

      // ---- Text colour ------------------------------------------------
      let textColor = { r: 0, g: 0, b: 0 };
      if (attrs.color && !attrs.color.includes('oklch')) {
        const hex = attrs.color.replace('#', '');
        textColor.r = parseInt(hex.substr(0, 2), 16);
        textColor.g = parseInt(hex.substr(2, 2), 16);
        textColor.b = parseInt(hex.substr(4, 2), 16);
      }

      // ---- List / indent ----------------------------------------------
      let x = MARGIN;
      let listPrefix = '';

      if (attrs.list === 'bullet') {
        listPrefix = '•  ';
        x += 6;
      } else if (attrs.list === 'ordered') {
        // Find the line index inside the list block
        const listLines = quill
          .getLines()
          .filter((l: any) => l.domNode.tagName === 'LI');
        const idx = listLines.findIndex((l: any) => l.domNode === quill.getLine(quill.getLength() - 1)[0].domNode) + 1;
        listPrefix = `${idx}. `;
        x += 10;
      } else if (attrs.indent) {
        x += attrs.indent * 8;   // 8 mm per indent level
      }

      // -----------------------------------------------------------------
      // 3.3 Apply style & draw line
      // -----------------------------------------------------------------
      doc.setFont('helvetica', fontStyle);
      doc.setFontSize(fontSize);
      doc.setTextColor(textColor.r, textColor.g, textColor.b);

      const availableWidth = MAX_LINE_WIDTH - (x - MARGIN);
      const words = doc.splitTextToSize(listPrefix + line, availableWidth);

      // Draw each fragment (jsPDF may split across lines)
      words.forEach((fragment: string, i: number) => {
        if (i > 0) {
          cursorY += LINE_HEIGHT;
          ensureSpace(LINE_HEIGHT);
        }

        // If the fragment is the list prefix only, draw it slightly left
        const drawX = fragment.startsWith(listPrefix) && fragment === listPrefix + line
          ? MARGIN
          : x;

        doc.text(fragment, drawX, cursorY);
      });

      cursorY += LINE_HEIGHT * words.length;
      ensureSpace(LINE_HEIGHT);

      // Reset colour for next line
      doc.setTextColor(0, 0, 0);
    });
  });

  // Save
  doc.save(`htmlToPdf-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export async function htmlToPdf() {
  showLoader('Creating PDF...');
  try {
    generateTextPDF();
  } catch (e) {
    console.error(e);
    showAlert('Error', 'Failed to create PDF from text.');
  } finally {
    hideLoader();
  }
}

function usePrintToPdf() {
  const printWin = window.open('', '_blank');
  if (!printWin) return;

  // Clone the editor content + a clean stylesheet
  const editorClone = quill.root.cloneNode(true) as HTMLElement;
  editorClone.style.cssText = `
    margin:15mm; font-family:Arial,Helvetica,sans-serif;
    line-height:1.5; color:#000;
  `;

  printWin.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Print Document</title>
        <meta charset="utf-8">
        <style>
          body { margin:0; padding:15mm; font-size:12pt; }
          h1 { font-size:22pt; margin:0.5em 0; }
          h2 { font-size:18pt; margin:0.4em 0; }
          h3 { font-size:15pt; margin:0.3em 0; }
          ul, ol { padding-left:20mm; }
          a { color:#0066cc; }
        </style>
      </head>
      <body>
        ${editorClone.outerHTML}
      </body>
    </html>
  `);
  printWin.document.close();
  printWin.focus();
  printWin.print();
}

export function mountHtmlToPdfTool() {
  const container = document.querySelector('#html-to-pdf-container');
  if (!container) return;

  container.innerHTML = `
    <div class="p-6 flex flex-col">
      <div id="toolbar" class="mb-2 flex flex-wrap gap-1">
        <select class="ql-header" title="Heading">
          <option value="1">H1</option>
          <option value="2">H2</option>
          <option value="3">H3</option>
          <option selected></option>
        </select>
        <button class="ql-bold" title="Bold"></button>
        <button class="ql-italic" title="Italic"></button>
        <button class="ql-underline" title="Underline"></button>
        <button class="ql-list" value="ordered" title="Ordered List"></button>
        <button class="ql-list" value="bullet" title="Bullet List"></button>
        <button class="ql-link" title="Link"></button>
        <button class="ql-image" title="Image"></button>
        <button class="ql-clean" title="Clear Format"></button>
      </div>

      <div id="editor" class="bg-white flex-1 border-2 border-gray-300 rounded-lg overflow-hidden min-h-96"></div>
    </div>

    <div class="mt-6 flex gap-3">
      <button id="text-pdf" class="btn-gradient flex-1">Export as Text-PDF</button>
      <button id="print-to-pdf" class="btn-outline flex-1">Browser Print (full HTML)</button>
    </div>
  `;

  quill = new Quill('#editor', {
    theme: 'snow',
    modules: { toolbar: '#toolbar' },
    placeholder: 'Start typing your document…',
  });

  // ---- Button handlers ----
  document.getElementById('text-pdf')?.addEventListener('click', htmlToPdf);
  document.getElementById('print-to-pdf')?.addEventListener('click', usePrintToPdf);
}
