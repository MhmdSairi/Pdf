import { showLoader, hideLoader, showAlert } from '../ui.js';
import { downloadFile } from '../utils/helpers.js';
import { state } from '../state.js';

export function doImageConvertAndFlatten(pdfDoc) {
}

export async function flattenAsImage() {
  if (!state.pdfDoc) {
    showAlert('Error', 'PDF not loaded.');
    return;
  }
  showLoader('Flattening/Converting PDF...');
  try {
    doImageConvertAndFlatten(state.pdfDoc);

    const flattenedBytes = await state.pdfDoc.save();
    downloadFile(
      new Blob([flattenedBytes], { type: 'application/pdf' }),
      'flattened-as-image.pdf'
    );
  } catch (e) {
    console.error(e);
    showAlert('Error', 'Could not flatten the PDF as Image.');
  } finally {
    hideLoader();
  }
}
