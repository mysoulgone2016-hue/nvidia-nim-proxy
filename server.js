const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

const NIM_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const NIM_API_KEY = process.env.NIM_API_KEY;
const CUSTOM_AUTH_HEADER = process.env.CUSTOM_AUTH_HEADER || 'x-custom-auth';
const CUSTOM_AUTH_TOKEN = process.env.CUSTOM_AUTH_TOKEN;

// Middleware to verify API key exists
if (!NIM_API_KEY) {
  console.error('ERROR: NIM_API_KEY environment variable is required');
  process.exit(1);
}

// Security middleware - supports both bearer token and custom header
const authenticate = (req, res, next) => {
  if (CUSTOM_AUTH_TOKEN) {
    // Check for Bearer token first (standard)
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      if (token === CUSTOM_AUTH_TOKEN) {
        return next();
      }
    }
    
    // Fallback to custom header
    const customToken = req.headers[CUSTOM_AUTH_HEADER.toLowerCase()];
    if (customToken === CUSTOM_AUTH_TOKEN) {
      return next();
    }
    
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'NVIDIA NIM Proxy' });
});

// Proxy /v1/models
app.get('/v1/models', authenticate, async (req, res) => {
  try {
    const response = await axios.get(`${NIM_BASE_URL}/models`, {
      headers: {
        'Authorization': `Bearer ${NIM_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching models:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data || { message: 'Failed to fetch models' }
    });
  }
});

// Proxy /v1/chat/completions
app.post('/v1/chat/completions', authenticate, async (req, res) => {
  try {
    const response = await axios.post(
      `${NIM_BASE_URL}/chat/completions`,
      req.body,
      {
        headers: {
          'Authorization': `Bearer ${NIM_API_KEY}`,
          'Content-Type': 'application/json'
        },
        responseType: req.body.stream ? 'stream' : 'json'
      }
    );

    // Handle streaming responses
    if (req.body.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      response.data.pipe(res);
    } else {
      res.json(response.data);
    }
  } catch (error) {
    console.error('Error in chat completions:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data || { message: 'Failed to process chat completion' }
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`NVIDIA NIM Proxy running on port ${PORT}`);
  console.log(`Custom auth: ${CUSTOM_AUTH_TOKEN ? 'ENABLED (Bearer token or custom header)' : 'DISABLED'}`);
});
