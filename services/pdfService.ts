
// This tells TypeScript that these libraries are available globally, loaded from the CDN.
// We access them directly as they are on the window object.

/**
 * Checks if a PDF file is encrypted (password protected).
 */
export const isPdfEncrypted = async (file: File): Promise<boolean> => {
  const { PDFDocument } = (window as any).PDFLib;
  try {
    const arrayBuffer = await file.arrayBuffer();
    // Try to load without password. If it fails with EncryptedPDFError (or similar), it's encrypted.
    // pdf-lib throws an error if the document is encrypted and no password is provided.
    await PDFDocument.load(arrayBuffer, { ignoreEncryption: false });
    return false;
  } catch (error: any) {
    // Basic check for encryption error message from pdf-lib
    if (error.message && (error.message.includes('encrypted') || error.message.includes('password'))) {
      return true;
    }
    // If we can't determine, assume not encrypted or corrupt, let the main process handle it
    return false;
  }
};

/**
 * Renders HTML content to a series of canvas images (pagination) and adds them to the PDF document.
 * Includes improved error handling and visibility fixes for blank page issues.
 * @param htmlContent The HTML string to render.
 * @param pdfDoc The pdf-lib PDFDocument instance to add the page to.
 */
async function embedHtmlAsImage(htmlContent: string, pdfDoc: any): Promise<void> {
  const { rgb } = (window as any).PDFLib;
  const container = document.createElement('div');

  // A4 dimensions in pixels at 96 DPI: 794px width.
  const A4_WIDTH_PX = 794; 
  const A4_HEIGHT_PX = 1123;
  const A4_ASPECT_RATIO = A4_WIDTH_PX / A4_HEIGHT_PX;

  container.style.position = 'absolute';
  container.style.top = '0';
  container.style.left = '0';
  container.style.zIndex = '-1000'; // Behind everything
  container.style.width = `${A4_WIDTH_PX}px`;
  container.style.backgroundColor = '#ffffff'; 
  container.style.padding = '40px'; 
  container.style.boxSizing = 'border-box';
  container.style.direction = 'rtl'; 
  container.style.textAlign = 'right';

  // Add robust styling for the content
  const style = document.createElement('style');
  style.innerHTML = `
    body { font-family: 'Arial', 'Segoe UI', sans-serif; color: #000; -webkit-font-smoothing: antialiased; }
    table { border-collapse: collapse; width: 100%; font-size: 12px; table-layout: auto; margin-bottom: 20px; direction: rtl; }
    th, td { border: 1px solid #000; padding: 6px; text-align: right; vertical-align: top; word-break: break-word; }
    th { background-color: #f0f0f0; font-weight: bold; }
    p { margin: 0 0 1em 0; line-height: 1.5; color: #000; }
    h1, h2, h3, h4, h5, h6 { margin: 1.2em 0 0.8em 0; color: #000; font-weight: bold; page-break-after: avoid; }
    img { max-width: 100%; height: auto; }
    table[border="1"] td { border: 1px solid #999; }
  `;
  container.appendChild(style);
  
  const contentWrapper = document.createElement('div');
  contentWrapper.innerHTML = htmlContent;
  container.appendChild(contentWrapper);

  document.body.appendChild(container);

  // Wait for images to load before rendering
  await new Promise(resolve => setTimeout(resolve, 500));

  try {
    const canvas = await (window as any).html2canvas(container, {
      scale: 2, 
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      width: A4_WIDTH_PX,
      windowWidth: A4_WIDTH_PX,
      height: container.scrollHeight,
      windowHeight: container.scrollHeight,
      onclone: (clonedDoc: any) => {
        const clonedContainer = clonedDoc.querySelector('div');
        if (clonedContainer) {
            clonedContainer.style.visibility = 'visible';
            clonedContainer.style.display = 'block';
        }
      }
    });

    const imgWidth = canvas.width;
    const imgHeight = canvas.height;
    
    // Calculate page height in canvas pixels (based on A4 aspect ratio relative to width)
    const pageCanvasHeight = imgWidth / A4_ASPECT_RATIO;
    
    let currentY = 0;

    // Loop through the long canvas and slice it into pages
    while (currentY < imgHeight) {
      const remainingHeight = imgHeight - currentY;
      const currentSliceHeight = Math.min(pageCanvasHeight, remainingHeight);

      // Create a temporary canvas for this slice
      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = imgWidth;
      sliceCanvas.height = currentSliceHeight;
      const ctx = sliceCanvas.getContext('2d');
      
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
        ctx.drawImage(canvas, 0, currentY, imgWidth, currentSliceHeight, 0, 0, imgWidth, currentSliceHeight);
        
        const sliceDataUrl = sliceCanvas.toDataURL('image/jpeg', 0.85);
        const sliceBytes = await fetch(sliceDataUrl).then(res => res.arrayBuffer());
        const sliceImage = await pdfDoc.embedJpg(sliceBytes);

        // Add PDF page
        const page = pdfDoc.addPage(); 
        const pdfPageSize = page.getSize();
        
        const pdfImgDims = sliceImage.scale(1);
        const scaleFactor = pdfPageSize.width / pdfImgDims.width;
        
        page.drawImage(sliceImage, {
          x: 0,
          y: pdfPageSize.height - (pdfImgDims.height * scaleFactor), 
          width: pdfPageSize.width,
          height: pdfImgDims.height * scaleFactor,
        });
      }
      
      currentY += currentSliceHeight;
    }

  } catch (error) {
    console.error("Error converting HTML to canvas:", error);
    const page = pdfDoc.addPage();
    page.drawText(`Failed to render Office document. Error: ${error}`, {
      x: 50, y: page.getHeight() / 2, size: 12, color: rgb(0.8, 0.2, 0.2),
    });
  } finally {
    document.body.removeChild(container);
  }
}

/**
 * Merges an array of files (images, PDFs, and Office docs) into a single PDF document.
 * @param files An array of File objects to merge.
 * @param onProgress A callback function that receives the name of the file currently being processed.
 * @param passwords An optional object mapping filenames to their passwords.
 * @returns A Promise that resolves with a Uint8Array of the merged PDF.
 */
export const mergeFilesToPdf = async (
    files: File[], 
    onProgress?: (fileName: string) => void,
    passwords: Record<string, string> = {}
): Promise<Uint8Array> => {
  const { PDFDocument, rgb, PageSizes } = (window as any).PDFLib;
  const mergedPdfDoc = await PDFDocument.create();

  for (const file of files) {
    onProgress?.(file.name);
    const fileType = file.type;
    const fileName = file.name.toLowerCase();

    if (fileType.startsWith('image/')) {
      // Force A4 Page for Images (Scanned documents High Accuracy)
      const page = mergedPdfDoc.addPage(PageSizes.A4);
      const { width: pageWidth, height: pageHeight } = page.getSize();
      
      const imageBytes = await file.arrayBuffer();
      let image;
      try {
        if (file.type === 'image/jpeg' || fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) {
          image = await mergedPdfDoc.embedJpg(imageBytes);
        } else if (file.type === 'image/png' || fileName.endsWith('.png')) {
          image = await mergedPdfDoc.embedPng(imageBytes);
        } else {
             page.drawText(`Unsupported image format: ${file.name}`, { x: 50, y: pageHeight / 2, size: 12, color: rgb(0.8, 0.2, 0.2) });
             continue;
        }

        const imageDims = image.scale(1);
        
        // Calculate scaling to fit within A4 margins (e.g., 20px margin)
        const margin = 20;
        const availableWidth = pageWidth - (margin * 2);
        const availableHeight = pageHeight - (margin * 2);

        // Scale to fit, but do not scale up if image is smaller than page (optional, usually for scanned docs we want to fill)
        // For scanned docs, we usually want to fit the page.
        const scale = Math.min(availableWidth / imageDims.width, availableHeight / imageDims.height);
        
        const scaledWidth = imageDims.width * scale;
        const scaledHeight = imageDims.height * scale;

        // Center the image
        const x = (pageWidth - scaledWidth) / 2;
        const y = (pageHeight - scaledHeight) / 2;

        page.drawImage(image, {
            x: x,
            y: y,
            width: scaledWidth,
            height: scaledHeight,
        });
      } catch (e) {
          console.error("Image embedding error", e);
          page.drawText(`Error loading image: ${file.name}`, { x: 50, y: pageHeight / 2, size: 12, color: rgb(0.8, 0.2, 0.2) });
      }

    } else if (fileType === 'application/pdf') {
      try {
        const pdfBytes = await file.arrayBuffer();
        // Load with password if provided
        const password = passwords[file.name] || '';
        const donorPdfDoc = await PDFDocument.load(pdfBytes, { 
            ignoreEncryption: false,
            password: password 
        });
        
        const copiedPageIndices = donorPdfDoc.getPageIndices();
        const copiedPages = await mergedPdfDoc.copyPages(donorPdfDoc, copiedPageIndices);
        copiedPages.forEach((page: any) => mergedPdfDoc.addPage(page));
      } catch (e: any) {
         console.error(`Could not process PDF file: ${file.name}`, e);
         const page = mergedPdfDoc.addPage();
         let errorMessage = `Could not load PDF: ${file.name}`;
         if (e.message && e.message.includes('encrypted')) {
             errorMessage += ' (Password required)';
         }
         page.drawText(errorMessage, { x: 50, y: page.getHeight() / 2, size: 12, color: rgb(0.8, 0.2, 0.2) });
      }
    } else if (
        fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
        fileName.endsWith('.docx')
    ) {
      try {
          const arrayBuffer = await file.arrayBuffer();
          const result = await (window as any).mammoth.convertToHtml({ arrayBuffer });
          if (!result.value) {
               throw new Error("No content extracted from Word file");
          }
          await embedHtmlAsImage(result.value, mergedPdfDoc);
      } catch (e) {
          console.error(`Could not process Word file: ${file.name}`, e);
          const page = mergedPdfDoc.addPage();
          page.drawText(`Could not load Word file: ${file.name}`, { x: 50, y: page.getHeight() / 2, size: 12, color: rgb(0.8, 0.2, 0.2) });
      }
    } else if (
        fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
        fileName.endsWith('.xlsx') ||
        fileName.endsWith('.xls') || 
        fileType === 'application/vnd.ms-excel'
    ) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const data = new Uint8Array(arrayBuffer);
            const workbook = (window as any).XLSX.read(data, { type: 'array' });
            
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            
            const html = (window as any).XLSX.utils.sheet_to_html(worksheet, { id: 'excel-table', editable: false });
            
            const wrappedHtml = `
                <div class="excel-wrapper">
                    <h2 style="text-align:center; margin-bottom: 10px;">${sheetName}</h2>
                    ${html}
                </div>
            `;
            await embedHtmlAsImage(wrappedHtml, mergedPdfDoc);
        } catch (e) {
            console.error(`Could not process Excel file: ${file.name}`, e);
            const page = mergedPdfDoc.addPage();
            page.drawText(`Could not load Excel file: ${file.name}`, { x: 50, y: page.getHeight() / 2, size: 12, color: rgb(0.8, 0.2, 0.2) });
        }
    } else if (fileName.endsWith('.doc')) {
        const page = mergedPdfDoc.addPage();
        page.drawText(`Format .doc (Word 97-2003) is not supported directly in browser.`, { x: 50, y: page.getHeight() / 2 + 20, size: 14, color: rgb(0, 0, 0) });
        page.drawText(`Please save as .docx and try again.`, { x: 50, y: page.getHeight() / 2, size: 12, color: rgb(0.5, 0.5, 0.5) });
    } else {
        const page = mergedPdfDoc.addPage();
        page.drawText(`Unsupported file format: ${file.name}`, { x: 50, y: page.getHeight() / 2, size: 12, color: rgb(0.8, 0.2, 0.2) });
    }
  }

  return await mergedPdfDoc.save();
};
