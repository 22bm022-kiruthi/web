const Busboy = require('busboy');
const { Readable } = require('stream');
const Papa = require('papaparse');

exports.handler = async function(event, context) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const contentType = (event.headers['content-type'] || event.headers['Content-Type'] || '').toString();
  if (!contentType || !contentType.startsWith('multipart/form-data')) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Expected multipart/form-data' }) };
  }

  try {
    const bb = new Busboy({ headers: { 'content-type': contentType } });
    let fileBuffer = null;
    let filename = '';

    await new Promise((resolve, reject) => {
      bb.on('file', (fieldname, file, info) => {
        filename = info.filename || '';
        const chunks = [];
        file.on('data', (d) => chunks.push(d));
        file.on('end', () => {
          fileBuffer = Buffer.concat(chunks);
        });
      });
      bb.on('field', (name, val) => {
        // ignore other fields for now
      });
      bb.on('finish', resolve);
      bb.on('error', reject);

      const stream = new Readable();
      stream.push(event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body);
      stream.push(null);
      stream.pipe(bb);
    });

    if (!fileBuffer) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No file uploaded' }) };
    }

    const text = fileBuffer.toString('utf8');
    // Parse CSV (header auto)
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
    const rows = parsed && parsed.data ? parsed.data : [];

    const fileId = `netlify-${Date.now()}`;
    const response = { message: 'File uploaded and parsed', fileId, parsedData: rows };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(response)
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Upload failed', detail: err && err.message ? err.message : String(err) })
    };
  }
};
