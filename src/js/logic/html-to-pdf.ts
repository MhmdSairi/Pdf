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

async function generateAdvancedTextPdf() {
  try {
    const { jsPDF } = await import('jspdf');

    // Create PDF with proper text rendering
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 20;
    const maxWidth = pageWidth - (margin * 2);

    let currentY = margin;
    const lineHeight = 7;
    const paragraphSpacing = 4;

    // Get Quill delta and convert to structured content
    const delta = quill.getContents();
    const content = parseQuillDelta(delta);

    // Process each content block
    for (const block of content) {
      // Check if we need a new page
      if (currentY > pageHeight - margin - 20) {
        pdf.addPage();
        currentY = margin;
      }

      let startX = margin;
      let alignment = block.attributes?.align || 'left';

      switch (block.type) {
        case 'header':
          const headerSizes = { 1: 20, 2: 18, 3: 16, 4: 14, 5: 12, 6: 11 };
          const fontSize = headerSizes[block.level as keyof typeof headerSizes] || 12;
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(fontSize);
          currentY += lineHeight;

          const headerText = block.segments.map((seg: any) => seg.text).join('');
          pdf.text(headerText, startX, currentY);
          currentY += lineHeight + paragraphSpacing;
          break;

        case 'paragraph':
        case 'blockquote':
        case 'code':
          currentY += 2; // Small top spacing

          // Handle different block types
          if (block.type === 'blockquote') {
            startX = margin + 10;
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(11);
          } else if (block.type === 'code') {
            startX = margin + 5;
            pdf.setFont('courier', 'normal');
            pdf.setFontSize(10);
          } else {
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(12);
          }

          // Process text segments with formatting
          let lineText = '';
          let currentX = startX;

          for (const segment of block.segments) {
            const attrs = segment.attributes || {};

            // Set font style based on attributes
            let fontStyle = 'normal';
            if (attrs.bold && attrs.italic) fontStyle = 'bolditalic';
            else if (attrs.bold) fontStyle = 'bold';
            else if (attrs.italic) fontStyle = 'italic';

            // Set font size based on attributes
            let segmentSize = block.type === 'code' ? 10 :
                            block.type === 'blockquote' ? 11 : 12;
            if (attrs.size === 'small') segmentSize = Math.max(8, segmentSize - 2);
            else if (attrs.size === 'large') segmentSize = segmentSize + 4;
            else if (attrs.size === 'huge') segmentSize = segmentSize + 8;

            pdf.setFont('helvetica', fontStyle);
            pdf.setFontSize(segmentSize);

            // Set text color if specified
            if (attrs.color) {
              try {
                const color = attrs.color.startsWith('#') ? attrs.color : '#000000';
                const r = parseInt(color.slice(1, 3), 16);
                const g = parseInt(color.slice(3, 5), 16);
                const b = parseInt(color.slice(5, 7), 16);
                pdf.setTextColor(r, g, b);
              } catch (e) {
                pdf.setTextColor(0, 0, 0); // Default to black
              }
            } else {
              pdf.setTextColor(0, 0, 0);
            }

            lineText += segment.text;
          }

          // Handle text alignment
          if (alignment === 'center') {
            currentX = pageWidth / 2;
          } else if (alignment === 'right') {
            currentX = pageWidth - margin;
          }

          // Split text into lines and render
          const textLines = pdf.splitTextToSize(lineText, maxWidth - (startX - margin));
          const alignOption = alignment === 'center' ? 'center' :
                             alignment === 'right' ? 'right' : 'left';

          pdf.text(textLines, currentX, currentY, { align: alignOption });
          currentY += textLines.length * lineHeight + paragraphSpacing;
          break;

        case 'list':
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(12);
          pdf.setTextColor(0, 0, 0);

          const listText = block.segments.map((seg: any) => seg.text).join('');
          const bullet = block.ordered ? '1. ' : '• ';
          const listLines = pdf.splitTextToSize(bullet + listText, maxWidth - 10);
          pdf.text(listLines, margin + 5, currentY);
          currentY += listLines.length * lineHeight + 2;
          break;
      }
    }

    // Download the PDF
    const pdfBlob = pdf.output('blob');
    downloadFile(pdfBlob, `document-${new Date().toISOString().slice(0, 10)}.pdf`);

  } catch (error) {
    console.error('Advanced text PDF generation failed:', error);
    throw error;
  }
}

function parseQuillDelta(delta: any): any[] {
  const content: any[] = [];

  if (!delta.ops) return content;

  let currentLine: any = { type: 'paragraph', segments: [], attributes: {} };

  for (const op of delta.ops) {
    if (typeof op.insert === 'string') {
      const text = op.insert;
      const attrs = op.attributes || {};

      // Handle line breaks
      if (text.includes('\n')) {
        const parts = text.split('\n');

        // Add the first part to current line
        if (parts[0]) {
          currentLine.segments.push({
            text: parts[0],
            attributes: attrs
          });
        }

        // Process complete lines
        for (let i = 0; i < parts.length - 1; i++) {
          if (currentLine.segments.length > 0) {
            // Determine line type based on attributes
            if (attrs.header) {
              currentLine.type = 'header';
              currentLine.level = attrs.header;
            } else if (attrs.blockquote) {
              currentLine.type = 'blockquote';
            } else if (attrs['code-block']) {
              currentLine.type = 'code';
            } else if (attrs.list) {
              currentLine.type = 'list';
              currentLine.ordered = attrs.list === 'ordered';
            }

            currentLine.attributes = attrs;
            content.push(currentLine);
          }

          // Start new line
          currentLine = { type: 'paragraph', segments: [], attributes: {} };

          // Add remaining parts
          if (i < parts.length - 2 && parts[i + 1]) {
            currentLine.segments.push({
              text: parts[i + 1],
              attributes: attrs
            });
          }
        }

        // Handle last part
        const lastPart = parts[parts.length - 1];
        if (lastPart) {
          currentLine.segments.push({
            text: lastPart,
            attributes: attrs
          });
        }
      } else {
        // Add text to current line
        currentLine.segments.push({
          text: text,
          attributes: attrs
        });
      }
    }
  }

  // Add final line if it has content
  if (currentLine.segments.length > 0) {
    content.push(currentLine);
  }

  return content;
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

async function generateAdvancedPdf() {
  showLoader('Generating Advanced Text PDF...');
  try {
    await generateAdvancedTextPdf();
  } catch (error) {
    console.error('Advanced text PDF generation failed:', error);
    showAlert('Error', 'Failed to generate advanced text PDF.');
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
        <button id="text-pdf" class="btn-gradient w-full">Basic Text PDF (quill-to-pdf)</button>
        <p class="text-sm text-gray-600 ml-2">• Fastest • Limited formatting • Selectable text • Smallest file size</p>
      </div>
      
      <div class="space-y-2">
        <button id="advanced-pdf" class="btn-gradient w-full">Advanced Text PDF (Recommended)</button>
        <p class="text-sm text-gray-600 ml-2">• Good formatting • Selectable text • Small file size • Proper structure</p>
      </div>
      
      <div class="space-y-2">
        <button id="print-to-pdf" class="btn-outline w-full">Browser Print to PDF</button>
        <p class="text-sm text-gray-600 ml-2">• Best formatting • Selectable text • Uses browser engine • Requires user interaction</p>
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
  document.getElementById('advanced-pdf')?.addEventListener('click', generateAdvancedPdf);
  document.getElementById('print-to-pdf')?.addEventListener('click', usePrintToPdf);
}
