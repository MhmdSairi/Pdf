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
      <div id="editor" class="bg-white flex-1 border-2 border-gray-300 rounded-lg overflow-hidden min-h-96"></div>
    </div>

    <div class="mt-6 flex gap-3">
      <button id="text-pdf" class="btn-gradient flex-1">Export as Text-PDF</button>
      <button id="print-to-pdf" class="btn-outline flex-1">Browser Print (full HTML)</button>
    </div>
  `;

  quill = new Quill('#editor', {
    theme: 'snow',
    modules: {
      toolbar: [
        [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ 'color': [] }, { 'background': [] }],
        [{ 'script': 'sub'}, { 'script': 'super' }],
        [{ 'list': 'ordered'}, { 'list': 'bullet' }, { 'list': 'check' }],
        [{ 'indent': '-1'}, { 'indent': '+1' }],
        [{ 'direction': 'rtl' }],
        [{ 'align': [] }],
        ['blockquote', 'code-block'],
        ['link', 'image'],
        ['clean']
      ]
    },
    placeholder: 'Start typing your document…',
  });

  // Fix Quill toolbar styling issues - use timeout to ensure DOM is ready
  setTimeout(() => {
    const toolbar = document.querySelector('.ql-toolbar');
    const container = document.querySelector('.ql-container');

    if (toolbar) {
      (toolbar as HTMLElement).style.cssText = `
        background: #fafafa !important;
        border: 1px solid #ccc !important;
        border-bottom: 1px solid #ccc !important;
        border-radius: 8px 8px 0 0 !important;
        padding: 8px !important;
      `;
    }

    if (container) {
      (container as HTMLElement).style.cssText = `
        background: white !important;
        border: 1px solid #ccc !important;
        border-top: none !important;
        border-radius: 0 0 8px 8px !important;
      `;
    }
  }, 100);

  // ---- Button handlers ----
  document.getElementById('text-pdf')?.addEventListener('click', htmlToPdf);
  document.getElementById('print-to-pdf')?.addEventListener('click', usePrintToPdf);
}
