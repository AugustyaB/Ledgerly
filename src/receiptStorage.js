const path = require('path');
const fs = require('fs');

class ReceiptStorage {
  constructor(customReceiptsDir) {
    let userDataPath;
    try {
      const { app } = require('electron');
      userDataPath = app && typeof app.getPath === 'function' ? app.getPath('userData') : null;
    } catch {
      userDataPath = null;
    }

    if (customReceiptsDir) {
      this.receiptsDir = customReceiptsDir;
    } else if (userDataPath) {
      this.receiptsDir = path.join(userDataPath, 'receipts');
    } else {
      this.receiptsDir = path.join(__dirname, '../scratch/test_userdata/receipts');
    }

    this.ensureDirectoryExists();
  }

  ensureDirectoryExists() {
    try {
      if (!fs.existsSync(this.receiptsDir)) {
        fs.mkdirSync(this.receiptsDir, { recursive: true });
      }
    } catch (err) {
      console.error('Failed to create receipts directory:', err);
    }
  }

  /**
   * Saves a receipt photo to the local receipts directory on disk.
   * @param {string} sourceFilePath - Absolute path to the source image file.
   * @returns {Object} { success: boolean, filename: string, absolutePath: string }
   */
  saveReceipt(sourceFilePath) {
    try {
      this.ensureDirectoryExists();
      if (!sourceFilePath || !fs.existsSync(sourceFilePath)) {
        return { success: false, error: 'Source receipt file does not exist.' };
      }

      const ext = path.extname(sourceFilePath) || '.jpg';
      const uniqueFilename = `rcpt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
      const destinationPath = path.join(this.receiptsDir, uniqueFilename);

      fs.copyFileSync(sourceFilePath, destinationPath);

      return {
        success: true,
        filename: uniqueFilename,
        absolutePath: destinationPath
      };
    } catch (err) {
      console.error('Failed to save receipt image:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Saves raw image buffer / base64 string directly from clipboard.
   * @param {Buffer|string} bufferOrBase64 - Buffer or Base64 encoded image data.
   * @param {string} extension - Image extension (default: .png).
   * @returns {Object} { success: boolean, filename: string, absolutePath: string }
   */
  saveReceiptBuffer(bufferOrBase64, extension = '.png') {
    try {
      this.ensureDirectoryExists();
      if (!bufferOrBase64) {
        return { success: false, error: 'Empty buffer data provided.' };
      }

      let buffer;
      if (Buffer.isBuffer(bufferOrBase64)) {
        buffer = bufferOrBase64;
      } else if (typeof bufferOrBase64 === 'string') {
        const cleanBase64 = bufferOrBase64.replace(/^data:image\/\w+;base64,/, '');
        buffer = Buffer.from(cleanBase64, 'base64');
      } else {
        return { success: false, error: 'Invalid buffer format.' };
      }

      const uniqueFilename = `rcpt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${extension}`;
      const destinationPath = path.join(this.receiptsDir, uniqueFilename);

      fs.writeFileSync(destinationPath, buffer);

      return {
        success: true,
        filename: uniqueFilename,
        absolutePath: destinationPath
      };
    } catch (err) {
      console.error('Failed to save receipt buffer:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Deletes a receipt image from disk.
   * @param {string} filename - The receipt filename to delete.
   * @returns {Object} { success: boolean }
   */
  deleteReceipt(filename) {
    try {
      if (!filename) return { success: true };
      const targetPath = path.join(this.receiptsDir, path.basename(filename));
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
      }
      return { success: true };
    } catch (err) {
      console.error('Failed to delete receipt image:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Resolves absolute local file path for a receipt image.
   * @param {string} filename - The receipt filename.
   * @returns {string|null} Absolute path or null if missing.
   */
  getReceiptAbsolutePath(filename) {
    if (!filename) return null;
    const targetPath = path.join(this.receiptsDir, path.basename(filename));
    return fs.existsSync(targetPath) ? targetPath : null;
  }
}

module.exports = ReceiptStorage;
