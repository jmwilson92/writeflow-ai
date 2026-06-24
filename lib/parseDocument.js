const mammoth = require('mammoth');

const MAX_EXTRACTED_CHARS = parseInt(process.env.MAX_DOCUMENT_CHARS || '15000', 10);

const ALLOWED_TYPES = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc',
  'text/plain': 'txt',
};

async function extractText(buffer, mimetype, filename) {
  const kind = ALLOWED_TYPES[mimetype] || inferKind(filename);
  if (!kind) throw Object.assign(new Error('Unsupported file type. Use PDF, Word, or TXT.'), { status: 400 });

  let text = '';

  if (kind === 'pdf') {
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(buffer);
    text = data.text || '';
  } else if (kind === 'docx' || kind === 'doc') {
    const result = await mammoth.extractRawText({ buffer });
    text = result.value || '';
  } else if (kind === 'txt') {
    text = buffer.toString('utf8');
  }

  text = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

  if (!text) {
    throw Object.assign(new Error('Could not extract text from this file. Try a different format or paste the text manually.'), { status: 422 });
  }

  const truncated = text.length > MAX_EXTRACTED_CHARS;
  if (truncated) text = text.slice(0, MAX_EXTRACTED_CHARS);

  return { text, chars: text.length, truncated, maxChars: MAX_EXTRACTED_CHARS };
}

function inferKind(filename = '') {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  if (ext === 'doc') return 'doc';
  if (ext === 'txt') return 'txt';
  return null;
}

module.exports = { extractText, ALLOWED_TYPES };