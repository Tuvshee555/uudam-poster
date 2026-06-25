// Turn an uploaded file (docx / pdf / txt) into plain text for the AI to read.
import mammoth from "mammoth";

export async function fileToText(buffer, filename = "") {
  const name = filename.toLowerCase();
  if (name.endsWith(".docx")) {
    const { value } = await mammoth.extractRawText({ buffer });
    return value;
  }
  if (name.endsWith(".pdf")) {
    // import the inner module to avoid pdf-parse's debug-on-import behavior
    const pdf = (await import("pdf-parse/lib/pdf-parse.js")).default;
    const data = await pdf(buffer);
    return data.text;
  }
  // txt / fallback
  return buffer.toString("utf-8");
}
