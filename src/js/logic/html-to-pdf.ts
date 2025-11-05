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

async function loadImageAsBase64(src: string): Promise<{ data: string; width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = function() {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }

        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const dataURL = canvas.toDataURL('image/jpeg', 0.8);
        resolve({
          data: dataURL,
          width: img.width,
          height: img.height
        });
      } catch (error) {
        console.warn('Error converting image to base64:', error);
        resolve(null);
      }
    };

    img.onerror = function() {
      console.warn('Error loading image:', src);
      resolve(null);
    };

    img.src = src;
  });
}



async function renderFormattedText(
  pdf: any,
  formattedSegments: any[],
  fullText: string,
  startX: number,
  startY: number,
  maxWidth: number,
  alignment: string,
  blockType: string,
  margin: number,
  pageWidth: number,
  lineHeight: number = 7
) {
  if (formattedSegments.length === 0) return;

  // For simplicity, if we have multiple segments with different formatting,
  // render them sequentially rather than trying to mix them on the same line
  let currentX = startX;
  let currentY = startY;

  for (const segment of formattedSegments) {
    // Set font properties
    pdf.setFont(segment.fontFamily, segment.fontStyle);
    pdf.setFontSize(segment.fontSize);
    pdf.setTextColor(segment.textColor.r, segment.textColor.g, segment.textColor.b);

    // Handle background color
    if (segment.backgroundColor) {
      const textWidth = pdf.getTextWidth(segment.text);
      const textHeight = segment.fontSize * 0.352778; // Convert points to mm

      // Draw background rectangle
      pdf.setFillColor(segment.backgroundColor.r, segment.backgroundColor.g, segment.backgroundColor.b);
      pdf.rect(currentX, currentY - textHeight, textWidth, textHeight * 1.2, 'F');
    }

    // Render the text
    const textLines = pdf.splitTextToSize(segment.text, maxWidth);

    for (let i = 0; i < textLines.length; i++) {
      const line = textLines[i];
      const lineWidth = pdf.getTextWidth(line);

      // Handle alignment for each line
      let renderX = currentX;
      if (alignment === 'center') {
        renderX = pageWidth / 2 - lineWidth / 2;
      } else if (alignment === 'right') {
        renderX = pageWidth - margin - lineWidth;
      }

      // Render text
      pdf.text(line, renderX, currentY);

      // Add underline if needed
      if (segment.underline) {
        const underlineY = currentY + 1;
        pdf.setDrawColor(segment.textColor.r, segment.textColor.g, segment.textColor.b);
        pdf.setLineWidth(0.2);
        pdf.line(renderX, underlineY, renderX + lineWidth, underlineY);
      }

      // Add strikethrough if needed
      if (segment.strike) {
        const strikeY = currentY - (segment.fontSize * 0.1); // Half the font size in mm
        pdf.setDrawColor(segment.textColor.r, segment.textColor.g, segment.textColor.b);
        pdf.setLineWidth(0.3); // Make line thicker for better visibility
        pdf.line(renderX, strikeY, renderX + lineWidth, strikeY);
      }

      if (i < textLines.length - 1) {
        currentY += lineHeight;
      }
    }

    // Move X position for next segment (if on same line)
    if (textLines.length === 1) {
      currentX += pdf.getTextWidth(segment.text);
    } else {
      // Multiple lines, reset X and adjust Y
      currentX = startX;
      currentY += lineHeight;
    }
  }
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

    // Track list numbers
    let currentListNumber = 1;
    let lastListType = null;

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

          // Process text segments with formatting
          let lineText = '';
          let currentX = startX;

          // Store formatted text segments for proper rendering
          const formattedSegments: any[] = [];

          for (const segment of block.segments) {
            const attrs = segment.attributes || {};

            if (segment.type === 'image') {
              // Handle images - try to load and embed, fallback to placeholder
              try {
                // Store image info for processing after text
                if (!block.images) block.images = [];
                block.images.push({
                  src: segment.src,
                  position: lineText.length
                });
              } catch (error) {
                lineText += '[IMAGE: Error loading]';
              }
              continue;
            } else if (segment.type === 'link') {
              // Handle links
              lineText += `[LINK: ${segment.url}]`;
              continue;
            }

            // Handle regular text segments with proper formatting
            const segmentText = segment.text || '';
            if (!segmentText) continue;

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

            // Determine font family
            let fontFamily = 'helvetica';
            if (block.type === 'code') {
              fontFamily = 'courier';
            } else if (attrs.font === 'serif') {
              fontFamily = 'times';
            } else if (attrs.font === 'monospace') {
              fontFamily = 'courier';
            }

            // Parse colors
            let textColor = { r: 0, g: 0, b: 0 }; // Default black
            if (attrs.color) {
              try {
                const color = attrs.color.startsWith('#') ? attrs.color : '#000000';
                textColor = {
                  r: parseInt(color.slice(1, 3), 16),
                  g: parseInt(color.slice(3, 5), 16),
                  b: parseInt(color.slice(5, 7), 16)
                };
              } catch (e) {
                textColor = { r: 0, g: 0, b: 0 };
              }
            }

            // Handle link formatting (override color with blue)
            if (attrs.link) {
              textColor = { r: 0, g: 102, b: 204 }; // Blue color for links

              // Store link info for later processing
              if (!block.links) block.links = [];
              block.links.push({
                text: segmentText,
                url: attrs.link,
                startIndex: lineText.length,
                length: segmentText.length
              });
            }

            // Parse background color
            let backgroundColor = null;
            if (attrs.background) {
              try {
                const bgColor = attrs.background.startsWith('#') ? attrs.background : null;
                if (bgColor && bgColor !== '#000000') { // Don't render black backgrounds
                  backgroundColor = {
                    r: parseInt(bgColor.slice(1, 3), 16),
                    g: parseInt(bgColor.slice(3, 5), 16),
                    b: parseInt(bgColor.slice(5, 7), 16)
                  };
                }
              } catch (e) {
                backgroundColor = null;
              }
            }

            // Store formatted segment for rendering
            formattedSegments.push({
              text: segmentText,
              fontFamily,
              fontStyle,
              fontSize: segmentSize,
              textColor,
              backgroundColor,
              underline: attrs.underline || false,
              strike: attrs.strike || attrs.strikethrough || false,
              startIndex: lineText.length,
              endIndex: lineText.length + segmentText.length
            });

            lineText += segmentText;
          }

          // Now render the text with proper formatting
          if (formattedSegments.length > 0) {

            // Render formatted text segments
            await renderFormattedText(pdf, formattedSegments, lineText, currentX, currentY, maxWidth, alignment, block.type, margin, pageWidth);
          }

          // Handle different block types with visual indicators
          if (block.type === 'blockquote') {
            // Add blockquote styling - left border and background
            startX = margin + 10;
            const quoteWidth = maxWidth - 20;
            const textLines = pdf.splitTextToSize(lineText, quoteWidth);
            const blockHeight = textLines.length * lineHeight + 8;

            // Draw background rectangle
            pdf.setFillColor(249, 249, 249); // Light gray background
            pdf.rect(margin + 5, currentY - 4, quoteWidth + 10, blockHeight, 'F');

            // Draw left border
            pdf.setDrawColor(221, 221, 221); // Gray border
            pdf.setLineWidth(2);
            pdf.line(margin + 5, currentY - 4, margin + 5, currentY - 4 + blockHeight);

            // Render formatted text
            await renderFormattedText(pdf, formattedSegments, lineText, startX, currentY, quoteWidth, 'left', block.type, margin, pageWidth, lineHeight);
            currentY += textLines.length * lineHeight + paragraphSpacing + 4;

          } else if (block.type === 'code') {
            // Add code block styling - border and background
            startX = margin + 5;
            const codeWidth = maxWidth - 10;
            const textLines = pdf.splitTextToSize(lineText, codeWidth);
            const blockHeight = textLines.length * lineHeight + 8;

            // Draw background rectangle
            pdf.setFillColor(245, 245, 245); // Light gray background
            pdf.rect(margin, currentY - 4, codeWidth + 10, blockHeight, 'F');

            // Draw border
            pdf.setDrawColor(221, 221, 221); // Gray border
            pdf.setLineWidth(0.5);
            pdf.rect(margin, currentY - 4, codeWidth + 10, blockHeight, 'S');

            // Render formatted text
            await renderFormattedText(pdf, formattedSegments, lineText, startX, currentY, codeWidth, 'left', block.type, margin, pageWidth, lineHeight);
            currentY += textLines.length * lineHeight + paragraphSpacing + 4;

          } else {
            // Regular paragraph
            // Handle text alignment
            if (alignment === 'center') {
              currentX = pageWidth / 2;
            } else if (alignment === 'right') {
              currentX = pageWidth - margin;
            }

            // Render formatted text segments
            await renderFormattedText(pdf, formattedSegments, lineText, currentX, currentY, maxWidth, alignment, block.type, margin, pageWidth, lineHeight);

            // Process inline images if any
            if (block.images && block.images.length > 0) {
              for (const image of block.images) {
                try {
                  const imageData = await loadImageAsBase64(image.src);
                  if (imageData) {
                    // Add image after the text
                    currentY += 5; // Small spacing

                    const maxInlineImageWidth = maxWidth / 2; // Smaller for inline images
                    const maxInlineImageHeight = 50;

                    let imgWidth = imageData.width * 0.264583;
                    let imgHeight = imageData.height * 0.264583;

                    if (imgWidth > maxInlineImageWidth) {
                      const ratio = maxInlineImageWidth / imgWidth;
                      imgWidth = maxInlineImageWidth;
                      imgHeight *= ratio;
                    }

                    if (imgHeight > maxInlineImageHeight) {
                      const ratio = maxInlineImageHeight / imgHeight;
                      imgHeight = maxInlineImageHeight;
                      imgWidth *= ratio;
                    }

                    if (currentY + imgHeight > pageHeight - margin) {
                      pdf.addPage();
                      currentY = margin;
                    }

                    pdf.addImage(imageData.data, 'JPEG', margin, currentY, imgWidth, imgHeight);
                    currentY += imgHeight + 5;
                  }
                } catch (error) {
                  console.warn('Error processing inline image:', error);
                }
              }
            }

            // Calculate text height for currentY adjustment
            const textLines = pdf.splitTextToSize(lineText, maxWidth);
            currentY += textLines.length * lineHeight + paragraphSpacing;
          }
          break;

        case 'list':
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(12);
          pdf.setTextColor(0, 0, 0);

          // Reset list counter if list type changed
          if (lastListType !== block.type + (block.ordered ? 'ordered' : 'unordered')) {
            currentListNumber = 1;
            lastListType = block.type + (block.ordered ? 'ordered' : 'unordered');
          }

          const listText = block.segments.map((seg: any) => seg.text || (seg.type === 'image' ? '[IMAGE]' : seg.type === 'link' ? `[${seg.url}]` : '')).join('');
          let bullet;
          if (block.ordered) {
            bullet = `${currentListNumber}. `;
            currentListNumber++;
          } else {
            bullet = '• ';
          }

          const listLines = pdf.splitTextToSize(bullet + listText, maxWidth - 15);
          pdf.text(listLines, margin + 10, currentY);
          currentY += listLines.length * lineHeight + 3;
          break;

        case 'image':
          // Handle standalone images
          try {
            const imageSegment = block.segments.find((seg: any) => seg.type === 'image');
            if (imageSegment && imageSegment.src) {
              // Try to load and embed the actual image
              const imageData = await loadImageAsBase64(imageSegment.src);

              if (imageData) {
                // Calculate image dimensions to fit within page margins
                const maxImageWidth = maxWidth;
                const maxImageHeight = 100; // Max height in mm

                let imgWidth = imageData.width * 0.264583; // Convert pixels to mm (96 DPI)
                let imgHeight = imageData.height * 0.264583;

                // Scale down if too large
                if (imgWidth > maxImageWidth) {
                  const ratio = maxImageWidth / imgWidth;
                  imgWidth = maxImageWidth;
                  imgHeight *= ratio;
                }

                if (imgHeight > maxImageHeight) {
                  const ratio = maxImageHeight / imgHeight;
                  imgHeight = maxImageHeight;
                  imgWidth *= ratio;
                }

                // Check if image fits on current page
                if (currentY + imgHeight > pageHeight - margin) {
                  pdf.addPage();
                  currentY = margin;
                }

                // Add the image to PDF
                pdf.addImage(imageData.data, 'JPEG', margin, currentY, imgWidth, imgHeight);
                currentY += imgHeight + paragraphSpacing;
              } else {
                // Fallback to placeholder text
                pdf.setFont('helvetica', 'italic');
                pdf.setFontSize(10);
                pdf.setTextColor(128, 128, 128);
                pdf.text('[Image: Unable to load - ' + imageSegment.src + ']', margin, currentY);
                currentY += lineHeight + paragraphSpacing;
              }
            }
          } catch (error) {
            console.warn('Error handling image in PDF:', error);
            // Fallback to placeholder text
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(10);
            pdf.setTextColor(128, 128, 128);
            pdf.text('[Image: Error loading]', margin, currentY);
            currentY += lineHeight + paragraphSpacing;
          }
          break;

      default:
        // Reset list counter for non-list items
        if (block.type !== 'list') {
          currentListNumber = 1;
          lastListType = null;
        }
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
    } else if (typeof op.insert === 'object') {
      // Handle embeds like images, links, etc.
      const insertObj = op.insert;
      const attrs = op.attributes || {};

      if (insertObj.image) {
        // Handle image
        currentLine.segments.push({
          type: 'image',
          src: insertObj.image,
          attributes: attrs
        });
      } else if (insertObj.link) {
        // Handle link (though links are usually attributes, not inserts)
        currentLine.segments.push({
          type: 'link',
          url: insertObj.link,
          attributes: attrs
        });
      } else {
        // Handle other embeds as text placeholder
        currentLine.segments.push({
          text: '[Embed]',
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
    <div class="p-6 flex flex-col h-full">
      <div id="editor" class="bg-white border-2 border-gray-300 rounded-lg overflow-hidden" style="height: 500px; max-height: 60vh; display: flex; flex-direction: column;"></div>
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
    const editorContainer = document.querySelector('#editor');
    const toolbar = document.querySelector('.ql-toolbar');
    const container = document.querySelector('.ql-container');
    const editor = document.querySelector('.ql-editor');

    // Make the parent editor container establish a new stacking context
    if (editorContainer) {
      (editorContainer as HTMLElement).style.cssText = `
        height: 500px !important;
        max-height: 60vh !important;
        display: flex !important;
        flex-direction: column !important;
        overflow: hidden !important;
        border: 2px solid #d1d5db !important;
        border-radius: 8px !important;
        background: white !important;
        position: relative !important;
      `;
    }

    if (toolbar) {
      (toolbar as HTMLElement).style.cssText = `
        background: #fafafa !important;
        border: none !important;
        border-bottom: 1px solid #ccc !important;
        border-radius: 8px 8px 0 0 !important;
        padding: 8px !important;
        position: sticky !important;
        top: 0 !important;
        z-index: 100 !important;
        flex-shrink: 0 !important;
        order: 1 !important;
      `;
    }

    if (container) {
      (container as HTMLElement).style.cssText = `
        background: white !important;
        border: none !important;
        border-radius: 0 0 8px 8px !important;
        flex: 1 !important;
        display: flex !important;
        flex-direction: column !important;
        overflow: hidden !important;
        order: 2 !important;
      `;
    }

    if (editor) {
      (editor as HTMLElement).style.cssText = `
        background: white !important;
        color: #333 !important;
        flex: 1 !important;
        overflow-y: auto !important;
        padding: 12px 15px !important;
        border: none !important;
        outline: none !important;
      `;
    }

    // Fix Quill tooltips and overlays positioning
    const style = document.createElement('style');
    style.textContent = `
      .ql-tooltip {
        position: fixed !important;
        z-index: 2000 !important;
        background: white !important;
        border: 1px solid #ccc !important;
        border-radius: 4px !important;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2) !important;
        max-width: 320px !important;
        padding: 8px !important;
        left: 50% !important;
        top: 50% !important;
        transform: translate(-50%, -50%) !important;
      }
      
      .ql-tooltip.ql-editing {
        left: 50% !important;
        top: 50% !important;
        transform: translate(-50%, -50%) !important;
      }
      
      .ql-tooltip input[type=text] {
        width: 220px !important;
        padding: 8px 10px !important;
        border: 1px solid #ddd !important;
        border-radius: 4px !important;
        font-size: 14px !important;
        margin-bottom: 8px !important;
      }
      
      .ql-tooltip .ql-action,
      .ql-tooltip .ql-remove {
        margin: 0 2px !important;
        padding: 6px 12px !important;
        border: none !important;
        border-radius: 4px !important;
        cursor: pointer !important;
        font-size: 12px !important;
        text-decoration: none !important;
      }
      
      .ql-tooltip .ql-action {
        background: #007bff !important;
        color: white !important;
      }
      
      .ql-tooltip .ql-action:hover {
        background: #0056b3 !important;
      }
      
      .ql-tooltip .ql-remove {
        background: #6c757d !important;
        color: white !important;
      }
      
      .ql-tooltip .ql-remove:hover {
        background: #545b62 !important;
      }
      
      /* Ensure tooltips are always visible and don't get cut off by overflow */
      #editor {
        overflow: visible !important;
      }
      
      .ql-container {
        overflow: visible !important;
      }
      
      .ql-editor {
        overflow-y: auto !important;
        overflow-x: visible !important;
      }
      
      /* Fix for link preview */
      .ql-tooltip[data-mode="link"]::before {
        content: "Visit URL:" !important;
        font-size: 12px !important;
        color: #666 !important;
        margin-bottom: 4px !important;
        display: block !important;
      }
    `;
    document.head.appendChild(style);
  }, 100);

  // ---- Button handlers ----
  document.getElementById('text-pdf')?.addEventListener('click', htmlToPdf);
  document.getElementById('advanced-pdf')?.addEventListener('click', generateAdvancedPdf);
  document.getElementById('print-to-pdf')?.addEventListener('click', usePrintToPdf);
}
