
// This tells TypeScript that these libraries are available globally, loaded from the CDN.
// We access them directly as they are on the window object.

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
  // We use a slightly smaller width for the container content to ensure margin.
  const A4_WIDTH_PX = 794; 
  const A4_HEIGHT_PX = 1123;
  const A4_ASPECT_RATIO = A4_WIDTH_PX / A4_HEIGHT_PX;

  // IMPORTANT: Append to body to ensure rendering engine can see it (fixes blank canvas issue)
  // But keep it hidden from user view using z-index and absolute positioning behind everything
  container.style.position = 'absolute';
  container.style.top = '0';
  container.style.left = '0';
  container.style.zIndex = '-1000'; // Behind everything
  container.style.width = `${A4_WIDTH_PX}px`;
  container.style.backgroundColor = '#ffffff'; // Force white background
  container.style.padding = '40px'; // Margin like a real document
  container.style.boxSizing = 'border-box';
  container.style.direction = 'rtl'; // Right-to-Left for Arabic support
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
    /* Fix for Excel sheet grids */
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
    // Render the entire content to a single high-res canvas first
    // scale: 2 ensures high quality (Retina-like) for the PDF
    const canvas = await (window as any).html2canvas(container, {
      scale: 2, 
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff', // Ensure no transparency
      width: A4_WIDTH_PX,
      windowWidth: A4_WIDTH_PX,
      height: container.scrollHeight,
      windowHeight: container.scrollHeight,
      onclone: (clonedDoc: any) => {
        // Fix for some visibility issues in cloned document
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
    // A4 width/height = 1/1.414.
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
        // Draw the specific slice from the source canvas
        // sourceX, sourceY, sourceWidth, sourceHeight, destX, destY, destWidth, destHeight
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
        ctx.drawImage(canvas, 0, currentY, imgWidth, currentSliceHeight, 0, 0, imgWidth, currentSliceHeight);
        
        // Convert slice to JPG
        const sliceDataUrl = sliceCanvas.toDataURL('image/jpeg', 0.85);
        const sliceBytes = await fetch(sliceDataUrl).then(res => res.arrayBuffer());
        const sliceImage = await pdfDoc.embedJpg(sliceBytes);

        // Add PDF page
        const page = pdfDoc.addPage(); // Default is usually A4-ish, but let's be explicit if needed or rely on auto
        const pdfPageSize = page.getSize();
        
        // Scale image to fit the PDF page
        // We want the width to fit perfectly with some margin if possible, but our canvas is already A4 ratio width-wise.
        const pdfImgDims = sliceImage.scale(1);
        
        // Fit width
        const scaleFactor = pdfPageSize.width / pdfImgDims.width;
        
        page.drawImage(sliceImage, {
          x: 0,
          y: pdfPageSize.height - (pdfImgDims.height * scaleFactor), // Draw from top-left (PDF coords are bottom-left)
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
 * @param files An array of File objects to merge, in the desired order.
 * @param onProgress A callback function that receives the name of the file currently being processed.
 * @returns A Promise that resolves with a Uint8Array of the merged PDF.
 */
export const mergeFilesToPdf = async (files: File[], onProgress?: (fileName: string) => void): Promise<Uint8Array> => {
  const { PDFDocument, rgb } = (window as any).PDFLib;
  const mergedPdfDoc = await PDFDocument.create();

  for (const file of files) {
    onProgress?.(file.name);
    const fileType = file.type;
    const fileName = file.name.toLowerCase();

    if (fileType.startsWith('image/')) {
      const page = mergedPdfDoc.addPage();
      const imageBytes = await file.arrayBuffer();
      let image;
      try {
        if (file.type === 'image/jpeg' || fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) {
          image = await mergedPdfDoc.embedJpg(imageBytes);
        } else if (file.type === 'image/png' || fileName.endsWith('.png')) {
          image = await mergedPdfDoc.embedPng(imageBytes);
        } else {
            // Try to fallback to PNG embedding for other image types if browser supports it, or skip
            // Note: pdf-lib mainly supports JPG and PNG.
             page.drawText(`Unsupported image format: ${file.name}`, { x: 50, y: page.getHeight() / 2, size: 12, color: rgb(0.8, 0.2, 0.2) });
             continue;
        }

        const pageDimensions = page.getSize();
        const imageDimensions = image.scale(1);
        const scale = Math.min(pageDimensions.width / imageDimensions.width, pageDimensions.height / imageDimensions.height);
        page.drawImage(image, {
            x: (pageDimensions.width - imageDimensions.width * scale) / 2,
            y: (pageDimensions.height - imageDimensions.height * scale) / 2,
            width: imageDimensions.width * scale,
            height: imageDimensions.height * scale,
        });
      } catch (e) {
          console.error("Image embedding error", e);
          page.drawText(`Error loading image: ${file.name}`, { x: 50, y: page.getHeight() / 2, size: 12, color: rgb(0.8, 0.2, 0.2) });
      }

    } else if (fileType === 'application/pdf') {
      try {
        const pdfBytes = await file.arrayBuffer();
        const donorPdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
        const copiedPageIndices = donorPdfDoc.getPageIndices();
        const copiedPages = await mergedPdfDoc.copyPages(donorPdfDoc, copiedPageIndices);
        copiedPages.forEach((page: any) => mergedPdfDoc.addPage(page));
      } catch (e) {
         console.error(`Could not process PDF file: ${file.name}`, e);
         const page = mergedPdfDoc.addPage();
         page.drawText(`Could not load PDF: ${file.name}`, { x: 50, y: page.getHeight() / 2, size: 12, color: rgb(0.8, 0.2, 0.2) });
      }
    } else if (
        fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
        fileName.endsWith('.docx')
    ) {
      try {
          const arrayBuffer = await file.arrayBuffer();
          // Convert docx to HTML using Mammoth
          const result = await (window as any).mammoth.convertToHtml({ arrayBuffer });
          if (!result.value) {
               throw new Error("No content extracted from Word file");
          }
          await embedHtmlAsImage(result.value, mergedPdfDoc);
      } catch (e) {
          console.error(`Could not process Word file: ${file.name}`, e);
          const page = mergedPdfDoc.addPage();
          page.drawText(`Could not load Word file: ${file.name}. Ensure it is a valid .docx`, { x: 50, y: page.getHeight() / 2, size: 12, color: rgb(0.8, 0.2, 0.2) });
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
            
            // Loop through all sheets or just the first one? Let's do first valid sheet.
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            
            // Generate HTML with embedded styles for better look
            const html = (window as any).XLSX.utils.sheet_to_html(worksheet, { id: 'excel-table', editable: false });
            
            // Enhance the Excel HTML with a wrapper for consistent styling
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
        // Fallback for .doc files (Binary Word)
        // Since we don't have a backend, we can't reliably convert .doc.
        // We will try a warning page.
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
