import { showLoader, hideLoader, showAlert } from '../ui.js';
import Quill from 'quill';
import { jsPDF } from 'jspdf';
import 'quill/dist/quill.snow.css';

import {
  PDFDocument as PDFLibDocument,
  rgb,
  StandardFonts,
  PageSizes,
} from 'pdf-lib';

let quill: Quill;

function generateTextPDF() {
  const doc = new jsPDF({
    unit: 'mm',
    format: 'a4',
    orientation: 'portrait',
  });

  // Page dimensions
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const maxWidth = pageWidth - 2 * margin;

  let y = margin; // Current Y position
  const lineHeight = 7; // Approx in mm

  // Extract Delta (rich text structure)
  const delta = quill.getContents();

  // Process each operation
  delta.ops.forEach((op: any) => {
    if (typeof op.insert === 'string') {
      const text = op.insert;
      const attributes = op.attributes || {};

      // Split by line
      const lines = text.split('\n');
      lines.forEach((line, i) => {
        if (i > 0) {
          y += lineHeight;
          if (y > pageHeight - margin) {
            doc.addPage();
            y = margin;
          }
        }

        if (!line) return;

        // Apply styles
        doc.setFont('helvetica',
          attributes.bold && attributes.italic ? 'bolditalic' :
            attributes.bold ? 'bold' :
              attributes.italic ? 'italic' :
                'normal'
        );

        // Font size
        let fontSize = 12;
        if (attributes.header === 1) fontSize = 18;
        else if (attributes.header === 2) fontSize = 16;
        else if (attributes.header === 3) fontSize = 14;
        doc.setFontSize(fontSize);

        // Color (avoid oklch!)
        if (attributes.color && !attributes.color.includes('oklch')) {
          const hex = attributes.color;
          doc.setTextColor(hex);
        } else {
          doc.setTextColor(0, 0, 0); // black
        }

        // Indentation for lists
        let x = margin;
        if (attributes.list === 'bullet') {
          doc.setFontSize(12);
          doc.text('• ', x, y);
          x += 5;
        } else if (attributes.list === 'ordered') {
          const index = quill.getLines().indexOf(quill.getLine(quill.getLength() - 1)[0]) + 1;
          doc.text(`${index}. `, x, y);
          x += 8;
        } else if (attributes.indent) {
          x += attributes.indent * 10;
        }

        // Draw text
        doc.setFontSize(fontSize);
        const splitText = doc.splitTextToSize(line, maxWidth - (x - margin));
        doc.text(splitText, x, y);

        y += lineHeight * splitText.length;

        // Reset color
        doc.setTextColor(0, 0, 0);
      });
    }
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

  const printWindow = window.open('', '_blank');
  printWindow?.document.write(`
    <html>
      <head><title>Print</title></head>
      <body style="margin:15mm; font-family:Arial;">
        ${quill.root.innerHTML}
      </body>
    </html>
  `);
  printWindow?.document.close();
  printWindow?.print();
}

export function mountHtmlToPdfTool() {
  const container = document.querySelector('#html-to-pdf-container');
  if (!container) return;

  container.innerHTML = `
    <div class="">
      <!-- Editor -->
      <div class="p-6 flex flex-col">
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
     </div>
  </div>
  <div>
    <button id="print-to-pdf" class="btn-gradient w-full mt-6">Use Browser print function</button>
  </div> 
  `;

  quill = new Quill('#editor', {
    theme: 'snow',
    modules: { toolbar: '#toolbar' },
    placeholder: 'Start typing your document…',
  });

  document.querySelector('#print-to-pdf')?.addEventListener('click', () => {
    usePrintToPdf();
  });
}
