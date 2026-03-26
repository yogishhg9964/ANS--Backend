import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables from .env file during local development
dotenv.config();

const app = express();

// Middleware
// In a stricter production environment, you might restrict CORS to your specific Hostinger domain
// e.g., app.use(cors({ origin: 'https://achanahallinaturestay.com' }));
app.use(cors());
app.use(express.json());

// Subscription route
app.post('/api/subscribe', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  try {
    const BREVO_API_KEY = process.env.BREVO_API_KEY;
    if (!BREVO_API_KEY) {
      console.error('Missing BREVO_API_KEY environment variable.');
      return res.status(500).json({ error: 'Server configuration error.' });
    }

    // Call Brevo API to add the contact
    const response = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'api-key': BREVO_API_KEY,
      },
      body: JSON.stringify({
        email: email,
        updateEnabled: false // Set to true if you want to update existing contacts instead of failing
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      if (data.code === 'duplicate_parameter') {
        return res.status(400).json({ error: 'This email is already subscribed!' });
      }
      if (data.code === 'invalid_parameter') {
        return res.status(400).json({ error: 'Please enter a valid email address.' });
      }
      
      console.error('Brevo API Error:', data);
      throw new Error(data.message || 'Error subscribing to the newsletter.');
    }

    res.status(200).json({ message: 'Successfully subscribed!' });
  } catch (error) {
    console.error('Subscription error caught:', error);
    res.status(500).json({ error: 'Unable to connect to server. Please try again later.' });
  }
});

// Basic health check route for Render
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
