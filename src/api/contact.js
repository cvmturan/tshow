const express = require('express');
const rateLimit = require('express-rate-limit');
const axios = require('axios');

const router = express.Router();
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'cvmturan@gmail.com';
const ALLOWED_TYPES = new Set(['support', 'feedback', 'copyright', 'security']);

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many messages. Please try again later.' }
});

function cleanLine(value, maxLength) {
  return String(value || '').replace(/[\r\n\t\0-\x1f\x7f]+/g, ' ').trim().slice(0, maxLength);
}

function cleanMessage(value) {
  return String(value || '').replace(/\0/g, '').trim().slice(0, 4000);
}

function validateContactInput(body = {}) {
  const result = {
    type: cleanLine(body.type, 24).toLowerCase(),
    name: cleanLine(body.name, 80),
    email: cleanLine(body.email, 254).toLowerCase(),
    message: cleanMessage(body.message),
    website: cleanLine(body.website, 200),
    consent: body.consent === true
  };

  if (result.website) return { spam: true, value: result };
  if (!ALLOWED_TYPES.has(result.type)) return { error: 'Choose a valid message type.' };
  if (result.name.length < 2) return { error: 'Enter your name.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(result.email)) return { error: 'Enter a valid email address.' };
  if (result.message.length < 10) return { error: 'Enter a message of at least 10 characters.' };
  if (!result.consent) return { error: 'Consent is required before sending a message.' };
  return { value: result };
}

router.post('/', contactLimiter, async (req, res, next) => {
  const validation = validateContactInput(req.body);
  if (validation.spam) return res.status(202).json({ message: 'Your message was received.' });
  if (validation.error) return res.status(400).json({ error: validation.error });

  const { type, name, email, message } = validation.value;
  const endpoint = process.env.CONTACT_FORM_ENDPOINT || `https://formsubmit.co/ajax/${encodeURIComponent(CONTACT_EMAIL)}`;

  try {
    const response = await axios.post(endpoint, {
      name,
      email,
      category: type,
      message,
      _subject: `[TShow ${type}] Message from ${name}`,
      _template: 'table'
    }, {
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      timeout: 10_000,
      maxContentLength: 128 * 1024,
      validateStatus: (status) => status >= 200 && status < 300
    });

    if (response.data?.success === false) {
      return res.status(502).json({ error: 'The contact service could not deliver this message.' });
    }
    return res.status(202).json({ message: 'Your message was sent to TShow support.' });
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') console.error('Contact delivery failed:', error.message);
    return next(Object.assign(new Error('The contact service is temporarily unavailable.'), { status: 502 }));
  }
});

module.exports = router;
module.exports.validateContactInput = validateContactInput;
