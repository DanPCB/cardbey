/**
 * PDF Generator
 * 
 * Converts HTML to PDF using puppeteer (if available)
 * Falls back to a simple error if puppeteer is not installed
 */

let puppeteer = null;
let browserInstance = null;
let puppeteerLoaded = false;

/**
 * Load puppeteer dynamically (lazy loading)
 */
async function loadPuppeteer() {
  if (puppeteerLoaded) {
    return puppeteer;
  }
  
  try {
    puppeteer = (await import('puppeteer')).default;
    puppeteerLoaded = true;
    return puppeteer;
  } catch (error) {
    console.warn('[PDF Generator] puppeteer not available. PDF export will not work. Install with: npm install puppeteer');
    puppeteerLoaded = true; // Mark as loaded to avoid repeated attempts
    return null;
  }
}

/**
 * Get or create browser instance (singleton)
 */
async function getBrowser() {
  const puppeteerModule = await loadPuppeteer();
  
  if (!puppeteerModule) {
    throw new Error('puppeteer is not installed. Install with: npm install puppeteer');
  }
  
  if (!browserInstance) {
    try {
      browserInstance = await puppeteerModule.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage', // Overcome limited resource problems
          '--disable-gpu', // Disable GPU hardware acceleration
        ],
        timeout: 30000, // 30 second timeout for browser launch
      });
    } catch (launchError) {
      console.error('[PDF Generator] Error launching browser:', launchError);
      throw new Error(`Failed to launch browser: ${launchError.message}`);
    }
  }
  return browserInstance;
}

/**
 * Render HTML to PDF buffer
 * 
 * @param {string} html - HTML content
 * @returns {Promise<Buffer>} PDF buffer
 */
export async function renderHtmlToPdfBuffer(html) {
  const puppeteerModule = await loadPuppeteer();
  
  if (!puppeteerModule) {
    throw new Error('PDF generation requires puppeteer. Install with: npm install puppeteer');
  }
  
  const browser = await getBrowser();
  const page = await browser.newPage();
  
  try {
    await page.setContent(html, {
      waitUntil: 'networkidle0',
      timeout: 30000, // 30 second timeout
    });
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: {
        top: '20mm',
        right: '15mm',
        bottom: '20mm',
        left: '15mm',
      },
      printBackground: true,
      timeout: 30000, // 30 second timeout
    });
    
    // Validate PDF buffer - PDF files start with "%PDF"
    if (!Buffer.isBuffer(pdfBuffer)) {
      throw new Error('PDF generation did not return a Buffer');
    }
    
    if (pdfBuffer.length === 0) {
      throw new Error('PDF generation returned an empty buffer');
    }
    
    // Check PDF magic number (first 4 bytes should be "%PDF")
    const pdfHeader = pdfBuffer.slice(0, 4).toString('ascii');
    if (pdfHeader !== '%PDF') {
      console.error('[PDF Generator] Invalid PDF header:', pdfHeader);
      throw new Error('Generated PDF appears to be corrupted (invalid header)');
    }
    
    return pdfBuffer;
  } catch (error) {
    console.error('[PDF Generator] Error during PDF generation:', error);
    throw error;
  } finally {
    await page.close();
  }
}

/**
 * Close browser instance (call on server shutdown)
 */
export async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

