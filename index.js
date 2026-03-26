import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Helper: save email to Supabase
async function saveToSupabase(email) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn('Supabase env vars not set. Skipping Supabase storage.');
    return;
  }
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
    console.error('Supabase save error:', text);
  }
}

// Helper: add contact to Brevo
async function addToBrevo(email) {
  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  if (!BREVO_API_KEY) {
    console.error('Missing BREVO_API_KEY env variable.');
    return { ok: false, code: 'missing_key' };
  }
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
  return { ok: response.ok, code: data.code, data };
}

// Helper: send welcome email via Brevo transactional SMTP
async function sendWelcomeEmail(email) {
  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  const senderEmail = process.env.SENDER_EMAIL || 'no-reply@achanahallinaturestay.com';
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
  if (!response.ok) {
    const text = await response.text();
    console.error('Welcome email send error:', text);
  }
}

// POST /api/subscribe
app.post('/api/subscribe', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  try {
    // 1. Add to Brevo
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
      console.error('Brevo error:', brevo.data);
      return res.status(500).json({ error: 'Failed to subscribe. Please try again.' });
    }

    // 2. Save to Supabase (best-effort)
    await saveToSupabase(email);

    // 3. Send welcome email (best-effort)
    await sendWelcomeEmail(email);

    return res.status(200).json({ message: 'Successfully subscribed!' });
  } catch (error) {
    console.error('Subscribe error:', error);
    return res.status(500).json({ error: 'Unable to connect. Please try again later.' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

