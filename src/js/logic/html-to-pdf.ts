import { showLoader, hideLoader, showAlert } from '../ui.js';
import { downloadFile, hexToRgb } from '../utils/helpers.js';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';
import html2pdf from 'html2pdf.js';

import {
  PDFDocument as PDFLibDocument,
  rgb,
  StandardFonts,
  PageSizes,
} from 'pdf-lib';

export async function htmlToPdf() {
  showLoader('Creating PDF...');
  try {
/*

    const pdfDoc = await PDFLibDocument.create();
    const pageSize = PageSizes[pageSizeKey];
    const margin = 72; // 1 inch

    let page = pdfDoc.addPage(pageSize);
    let { width, height } = page.getSize();
    const textWidth = width - margin * 2;
    const lineHeight = fontSize * 1.3;
    let y = height - margin;


    const pdfBytes = await pdfDoc.save();
    downloadFile(
      new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' }),
      'text-document.pdf'
    );
*/
  } catch (e) {
    console.error(e);
    showAlert('Error', 'Failed to create PDF from text.');
  } finally {
    hideLoader();
  }
}


export function mountHtmlToPdfTool() {
  console.log('mountHtmlToPdfTool');
  const container = document.querySelector('#html-to-pdf-container');
  if (!container) return;

  container.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-2 h-screen bg-gray-50">
      <!-- Editor -->
      <div class="p-6 flex flex-col">
        <h2 class="text-2xl font-bold mb-4 text-gray-800">Edit</h2>
        <div id="toolbar" class="mb-2">
          <select class="ql-header" title="Heading">
            <option value="1">H1</option><option value="2">H2</option><option selected></option>
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
        <div id="editor" class="bg-white flex-1 border-2 border-gray-300 rounded-lg overflow-hidden"></div>
        <button id="download" class="mt-4 px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-lg hover:shadow-lg transition">
          ↓ Download PDF (A4)
        </button>
      </div>

      <!-- Preview -->
      <div class="p-6 flex flex-col">
        <h2 class="text-2xl font-bold mb-4 text-gray-800">Live Preview</h2>
        <div id="preview" class="bg-white flex-1 border-2 border-gray-300 rounded-lg p-8 overflow-auto prose max-w-none"></div>
      </div>
    </div>
  `;

  const quill = new Quill('#editor', {
    theme: 'snow',
    modules: { toolbar: '#toolbar' },
    placeholder: 'Start typing your document…',
  });

  const preview = container.querySelector('#preview') as HTMLElement;

  // Sync editor → preview
  quill.on('text-change', () => {
    preview.innerHTML = quill.root.innerHTML;
  });
  preview.innerHTML = quill.root.innerHTML; // initial

  // PDF export
  container.querySelector('#download')!.addEventListener('click', () => {
    const clone = preview.cloneNode(true) as HTMLElement;
    clone.style.width = '210mm';
    clone.style.minHeight = '297mm';
    clone.style.padding = '15mm';
    clone.style.boxSizing = 'border-box';
    clone.style.background = 'white';

    html2pdf()
      .set({
        margin: 0,
        filename: `bento-${new Date().toISOString().slice(0, 10)}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(clone)
      .save();
  });
}