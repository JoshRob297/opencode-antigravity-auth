/**
 * Image Saving Utility
 *
 * Handles saving generated images to disk and returning file paths.
 */
/**
 * Save base64 image data to disk and return the file path.
 *
 * @param base64Data - The base64-encoded image data
 * @param mimeType - The MIME type of the image (e.g., "image/jpeg")
 * @returns The absolute path to the saved image file
 */
export declare function saveImageToDisk(base64Data: string, mimeType: string): string;
/**
 * Process inlineData and return either a file path or base64 data URL.
 * Attempts to save to disk first, falls back to base64 if saving fails.
 *
 * @param inlineData - Object containing mimeType and base64 data
 * @returns Markdown image string with either file path or data URL
 */
export declare function processImageData(inlineData: {
    mimeType?: string;
    data?: string;
}): string | null;
//# sourceMappingURL=image-saver.d.ts.map