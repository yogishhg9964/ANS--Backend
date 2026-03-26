import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Startup log - confirm env vars are loaded
console.log('[STARTUP] Server starting...');
console.log('[STARTUP] BREVO_API_KEY set:', !!process.env.BREVO_API_KEY);
console.log('[STARTUP] SUPABASE_URL set:', !!process.env.SUPABASE_URL);
console.log('[STARTUP] SUPABASE_ANON_KEY set:', !!process.env.SUPABASE_ANON_KEY);
console.log('[STARTUP] SENDER_EMAIL:', process.env.SENDER_EMAIL || '(not set, using default)');

// Helper: save email to Supabase
async function saveToSupabase(email) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn('[SUPABASE] Env vars not set. Skipping.');
    return;
  }
  console.log('[SUPABASE] Saving email:', email);
  const response = await fetch(`${SUPABASE_URL}/rest/v1/subscribers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ email }),
  });
  if (!response.ok) {
    const text = await response.text();
    console.error('[SUPABASE] Save error:', text);
  } else {
    console.log('[SUPABASE] Email saved successfully.');
  }
}

// Helper: add contact to Brevo contacts list
async function addToBrevo(email) {
  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  if (!BREVO_API_KEY) {
    console.error('[BREVO] Missing BREVO_API_KEY.');
    return { ok: false, code: 'missing_key' };
  }
  console.log('[BREVO] Adding contact:', email);
  const response = await fetch('https://api.brevo.com/v3/contacts', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'api-key': BREVO_API_KEY,
    },
    body: JSON.stringify({ email, updateEnabled: false }),
  });
  const data = await response.json();
  console.log('[BREVO] Add contact response:', response.status, JSON.stringify(data));
  return { ok: response.ok, code: data.code, data };
}

// Helper: send welcome email via Brevo transactional SMTP
async function sendWelcomeEmail(email) {
  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  const senderEmail = process.env.SENDER_EMAIL || 'no-reply@achanahallinaturestay.com';
  console.log('[EMAIL] Sending welcome email to:', email, '| from:', senderEmail);
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'api-key': BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { name: 'Achanahalli Nature Stay', email: senderEmail },
      to: [{ email }],
      subject: 'Welcome to Achanahalli Nature Stay! 🌿',
      htmlContent: `
        <div style="font-family:Georgia,serif;max-width:600px;margin:auto;background:#1a2e1e;color:#f1f5f3;padding:40px;border-radius:8px;">
          <h1 style="color:#c9a84c;font-size:28px;margin-bottom:8px;">Welcome to Achanahalli Nature Stay 🌿</h1>
          <p style="color:#a0b5a4;margin-bottom:24px;">Thank you for subscribing! We are delighted to have you in our nature family.</p>
          <p style="line-height:1.8;">You will now be the first to know about:</p>
          <ul style="color:#a0b5a4;line-height:2;">
            <li>Seasonal offers &amp; exclusive discounts</li>
            <li>New experiences &amp; activities</li>
            <li>Stories from the hills of Sakleshpur</li>
          </ul>
          <div style="margin-top:32px;padding-top:24px;border-top:1px solid #2d4a32;">
            <p style="color:#c9a84c;font-size:14px;">📍 Achanahalli, Sakleshpur, Karnataka</p>
            <p style="color:#a0b5a4;font-size:12px;">© ${new Date().getFullYear()} Achanahalli Nature Stay. All rights reserved.</p>
          </div>
        </div>
      `,
    }),
  });
  const responseText = await response.text();
  console.log('[EMAIL] Send response status:', response.status);
  console.log('[EMAIL] Send response body:', responseText);
  if (!response.ok) {
    console.error('[EMAIL] Failed to send welcome email. See body above.');
  } else {
    console.log('[EMAIL] Welcome email sent successfully!');
  }
}

// POST /api/subscribe
app.post('/api/subscribe', async (req, res) => {
  const { email } = req.body;
  console.log('[SUBSCRIBE] Request received for:', email);

  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  try {
    // 1. Add to Brevo contacts
    const brevo = await addToBrevo(email);
    if (!brevo.ok) {
      if (brevo.code === 'duplicate_parameter') {
        return res.status(400).json({ error: 'This email is already subscribed!' });
      }
      if (brevo.code === 'invalid_parameter') {
        return res.status(400).json({ error: 'Please enter a valid email address.' });
      }
      if (brevo.code === 'missing_key') {
        return res.status(500).json({ error: 'Server configuration error. Please contact admin.' });
      }
      return res.status(500).json({ error: 'Failed to subscribe. Please try again.' });
    }

    // 2. Save to Supabase (best-effort)
    await saveToSupabase(email);

    // 3. Send welcome email (best-effort)
    await sendWelcomeEmail(email);

    console.log('[SUBSCRIBE] All steps done for:', email);
    return res.status(200).json({ message: 'Successfully subscribed!' });
  } catch (error) {
    console.error('[SUBSCRIBE] Unexpected error:', error);
    return res.status(500).json({ error: 'Unable to connect. Please try again later.' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  console.log('[HEALTH] Health check ping');
  res.status(200).json({ status: 'ok' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`[STARTUP] Server running on port ${PORT}`);
});
