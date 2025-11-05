import { showLoader, hideLoader, showAlert } from '../ui.js';
import { downloadFile } from '../utils/helpers.js';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';
import { pdfExporter } from 'quill-to-pdf';

let quill: Quill;

async function generateTextPDF() {
  try {
    // Use quill-to-pdf for text-based PDF generation
    const delta = quill.getContents();
    const pdfBlob: Blob = await pdfExporter.generatePdf(delta);

    downloadFile(
      pdfBlob,
      `document-${new Date().toISOString().slice(0, 10)}.pdf`
    );

  } catch (error) {
    console.error('Text PDF generation failed:', error);
    showAlert('Error', 'Failed to generate text-based PDF. Try the Browser Print or Image PDF options.');
  }
}

function extractAndProcessHtmlContent(): string {
  // Get the raw HTML from Quill editor
  let htmlContent = quill.root.innerHTML;

  // Process inline styles to ensure they work in PDF
  htmlContent = htmlContent.replace(/style="([^"]*)"/g, (match, styles) => {
    // Convert inline styles to more PDF-friendly format
    let processedStyles = styles
      // Convert RGB colors to hex
      .replace(/color:\s*rgb\(([^)]+)\)/g, (colorMatch: string, rgb: string) => {
        const [r, g, b] = rgb.split(',').map((n: string) => parseInt(n.trim()));
        const hex = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
        return `color: ${hex}`;
      })
      .replace(/background-color:\s*rgb\(([^)]+)\)/g, (bgMatch: string, rgb: string) => {
        const [r, g, b] = rgb.split(',').map((n: string) => parseInt(n.trim()));
        const hex = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
        return `background-color: ${hex}`;
      })
      // Ensure font-size values are in points for better PDF rendering
      .replace(/font-size:\s*(\d+(?:\.\d+)?)em/g, (fsMatch: string, em: string) => {
        const pts = Math.round(parseFloat(em) * 12); // Convert em to approximate points
        return `font-size: ${pts}pt`;
      })
      // Clean up any redundant spaces
      .replace(/\s+/g, ' ')
      .trim();

    return `style="${processedStyles}"`;
  });

  // Convert any remaining class-based formatting to inline styles for better PDF compatibility
  htmlContent = htmlContent
    // Handle Quill's text alignment classes
    .replace(/<p([^>]*)\sclass="([^"]*ql-align-center[^"]*)"([^>]*)>/g, '<p$1 style="text-align: center;"$3>')
    .replace(/<p([^>]*)\sclass="([^"]*ql-align-right[^"]*)"([^>]*)>/g, '<p$1 style="text-align: right;"$3>')
    .replace(/<p([^>]*)\sclass="([^"]*ql-align-justify[^"]*)"([^>]*)>/g, '<p$1 style="text-align: justify;"$3>');

  return htmlContent;
}

async function generatePdfFromHtml(htmlContent: string) {
  // Create a temporary container for rendering
  const tempContainer = document.createElement('div');
  tempContainer.style.cssText = `
    position: absolute;
    top: -9999px;
    left: -9999px;
    width: 210mm;
    padding: 20mm;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif;
    font-size: 12pt;
    line-height: 1.6;
    color: #333;
    background: white;
  `;

  // Apply styles to the content
  tempContainer.innerHTML = `
    <style>
      /* Headers */
      h1 { font-size: 24pt; font-weight: bold; margin: 16pt 0 12pt 0; line-height: 1.3; }
      h2 { font-size: 20pt; font-weight: bold; margin: 14pt 0 10pt 0; line-height: 1.3; }
      h3 { font-size: 18pt; font-weight: bold; margin: 12pt 0 8pt 0; line-height: 1.3; }
      h4 { font-size: 16pt; font-weight: bold; margin: 10pt 0 6pt 0; line-height: 1.3; }
      h5 { font-size: 14pt; font-weight: bold; margin: 8pt 0 6pt 0; line-height: 1.3; }
      h6 { font-size: 13pt; font-weight: bold; margin: 8pt 0 6pt 0; line-height: 1.3; }
      
      /* Text formatting */
      .ql-size-small, span[style*="font-size: 0.75em"] { font-size: 10pt !important; }
      .ql-size-large, span[style*="font-size: 1.5em"] { font-size: 18pt !important; }
      .ql-size-huge, span[style*="font-size: 2.5em"] { font-size: 32pt !important; }
      
      strong, b { font-weight: bold !important; }
      em, i { font-style: italic !important; }
      u { text-decoration: underline !important; }
      s { text-decoration: line-through !important; }
      
      /* Text alignment */
      .ql-align-center { text-align: center; }
      .ql-align-right { text-align: right; }
      .ql-align-justify { text-align: justify; }
      
      /* Lists */
      ul, ol { margin: 8pt 0; padding-left: 20pt; }
      li { margin: 4pt 0; }
      
      /* Blockquotes */
      blockquote {
        margin: 12pt 20pt;
        padding: 8pt 16pt;
        border-left: 4pt solid #ddd;
        background: #f9f9f9;
        font-style: italic;
      }
      
      /* Code blocks */
      pre, .ql-code-block {
        background: #f5f5f5;
        border: 1pt solid #ddd;
        border-radius: 4pt;
        padding: 12pt;
        font-family: 'Courier New', Courier, monospace;
        font-size: 10pt;
        margin: 8pt 0;
      }
      
      p { margin: 6pt 0; }
    </style>
    <div class="content">${htmlContent}</div>
  `;

  document.body.appendChild(tempContainer);

  try {
    // Import jsPDF dynamically
    const { jsPDF } = await import('jspdf');
    const html2canvas = (await import('html2canvas')).default;

    // Create PDF
    const pdf = new jsPDF('p', 'mm', 'a4');
    const contentElement = tempContainer.querySelector('.content') as HTMLElement;

    if (contentElement) {
      // Generate canvas from HTML
      const canvas = await html2canvas(contentElement, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        width: contentElement.scrollWidth,
        height: contentElement.scrollHeight
      });

      const imgData = canvas.toDataURL('image/png');
      const imgWidth = 170; // A4 width minus margins
      const pageHeight = 257; // A4 height minus margins
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;

      let position = 20; // Top margin

      // Add first page
      pdf.addImage(imgData, 'PNG', 20, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      // Add additional pages if needed
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight + 20;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 20, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
    }

    // Download the PDF
    const pdfBlob = pdf.output('blob');
    downloadFile(pdfBlob, `document-${new Date().toISOString().slice(0, 10)}.pdf`);

  } finally {
    // Clean up
    document.body.removeChild(tempContainer);
  }
}

function usePrintToPdf() {
  const printWin = window.open('', '_blank');
  if (!printWin) {
    showAlert('Error', 'Could not open print window. Please check your popup blocker.');
    return;
  }

  // Get the processed HTML content
  const processedHtml = extractAndProcessHtmlContent();

  printWin.document.write(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <title>Document</title>
        <meta charset="utf-8">
        <style>
          @page {
            margin: 20mm;
            size: A4;
          }
          
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif;
            font-size: 12pt;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 0;
            background: white;
          }
          
          /* Headers */
          h1 { font-size: 24pt; font-weight: bold; margin: 16pt 0 12pt 0; line-height: 1.3; }
          h2 { font-size: 20pt; font-weight: bold; margin: 14pt 0 10pt 0; line-height: 1.3; }
          h3 { font-size: 18pt; font-weight: bold; margin: 12pt 0 8pt 0; line-height: 1.3; }
          h4 { font-size: 16pt; font-weight: bold; margin: 10pt 0 6pt 0; line-height: 1.3; }
          h5 { font-size: 14pt; font-weight: bold; margin: 8pt 0 6pt 0; line-height: 1.3; }
          h6 { font-size: 13pt; font-weight: bold; margin: 8pt 0 6pt 0; line-height: 1.3; }
          
          /* Text formatting */
          strong, b { font-weight: bold !important; }
          em, i { font-style: italic !important; }
          u { text-decoration: underline !important; }
          s { text-decoration: line-through !important; }
          
          /* Font sizes */
          .ql-size-small { font-size: 10pt !important; }
          .ql-size-large { font-size: 18pt !important; }
          .ql-size-huge { font-size: 32pt !important; }
          
          /* Text alignment */
          .ql-align-center { text-align: center; }
          .ql-align-right { text-align: right; }
          .ql-align-justify { text-align: justify; }
          
          /* Lists */
          ul, ol { margin: 8pt 0; padding-left: 20pt; }
          li { margin: 4pt 0; }
          
          /* Blockquotes */
          blockquote {
            margin: 12pt 20pt;
            padding: 8pt 16pt;
            border-left: 4pt solid #ddd;
            background: #f9f9f9;
            font-style: italic;
          }
          
          /* Code blocks */
          pre, .ql-code-block {
            background: #f5f5f5;
            border: 1pt solid #ddd;
            border-radius: 4pt;
            padding: 12pt;
            font-family: 'Courier New', Courier, monospace;
            font-size: 10pt;
            margin: 8pt 0;
          }
          
          /* Indentation */
          .ql-indent-1 { padding-left: 20pt; }
          .ql-indent-2 { padding-left: 40pt; }
          .ql-indent-3 { padding-left: 60pt; }
          .ql-indent-4 { padding-left: 80pt; }
          .ql-indent-5 { padding-left: 100pt; }
          .ql-indent-6 { padding-left: 120pt; }
          .ql-indent-7 { padding-left: 140pt; }
          .ql-indent-8 { padding-left: 160pt; }
          
          /* Links */
          a { color: #0066cc; text-decoration: underline; }
          
          /* Images */
          img { max-width: 100%; height: auto; margin: 8pt 0; }
          
          /* Paragraphs */
          p { margin: 6pt 0; }
          
          /* Superscript and subscript */
          sup { vertical-align: super; font-size: 0.75em; }
          sub { vertical-align: sub; font-size: 0.75em; }
          
          /* Print-specific styles */
          @media print {
            body { -webkit-print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        ${processedHtml}
      </body>
    </html>
  `);

  printWin.document.close();
  printWin.focus();
  printWin.print();
}

async function generateImagePdf() {
  showLoader('Generating Image PDF...');
  try {
    const processedHtml = extractAndProcessHtmlContent();
    await generatePdfFromHtml(processedHtml);
  } catch (error) {
    console.error('Image PDF generation failed:', error);
    showAlert('Error', 'Failed to generate image-based PDF.');
  } finally {
    hideLoader();
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



export function mountHtmlToPdfTool() {
  const container = document.querySelector('#html-to-pdf-container');
  if (!container) return;

  container.innerHTML = `
    <div class="p-6 flex flex-col">
      <div id="editor" class="bg-white flex-1 border-2 border-gray-300 rounded-lg overflow-hidden min-h-96"></div>
    </div>

    <div class="mt-6 space-y-3">
      <div class="space-y-2">
        <button id="text-pdf" class="btn-gradient w-full">Export as Text PDF</button>
        <p class="text-sm text-gray-600 ml-2">• Fast export • Basic formatting • Selectable text • Small file size</p>
      </div>
      
      <div class="space-y-2">
        <button id="print-to-pdf" class="btn-outline w-full">Browser Print to PDF</button>
        <p class="text-sm text-gray-600 ml-2">• Complete formatting • Selectable text • Uses browser's PDF engine</p>
      </div>
      
      <div class="space-y-2">
        <button id="image-pdf" class="btn-secondary w-full">Export as Image PDF</button>
        <p class="text-sm text-gray-600 ml-2">• Exact visual copy • Large file size • Text not selectable</p>
      </div>
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
  document.getElementById('image-pdf')?.addEventListener('click', generateImagePdf);
}
