const crypto = require('crypto');

const signingKey = Buffer.from(
  process.env.MEDIA_URL_SIGNING_SECRET || crypto.randomBytes(32).toString('hex')
);

function signatureFor(...parts) {
  return crypto.createHmac('sha256', signingKey)
    .update(parts.map((part) => String(part || '')).join('\n'))
    .digest('base64url');
}

function verify(signature, ...parts) {
  if (typeof signature !== 'string' || signature.length > 100) return false;
  const expected = Buffer.from(signatureFor(...parts));
  const actual = Buffer.from(signature);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

module.exports = { signatureFor, verify };
