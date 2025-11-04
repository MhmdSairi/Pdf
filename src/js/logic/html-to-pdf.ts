import { showLoader, hideLoader, showAlert } from '../ui.js';
import { downloadFile } from '../utils/helpers.js';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';
import { pdfExporter } from 'quill-to-pdf';

let quill: Quill;

async function generateTextPDF() {
  const delta = quill.getContents();
  try {
    // This is async! Must await
    const pdfBlob: Blob = await pdfExporter.generatePdf(delta);
    downloadFile(
      pdfBlob,
      `document-${new Date().toISOString().slice(0, 10)}.pdf`
    );
  } catch (error) {
    console.error('PDF generation failed:', error);
    showAlert('Error', 'Failed to generate PDF.');
  }
}

export async function htmlToPdf() {
  showLoader('Creating PDF...');
  try {
    await generateTextPDF();
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
