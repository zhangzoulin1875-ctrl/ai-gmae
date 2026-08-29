import { Router } from 'express';
import jwt from 'jsonwebtoken';
import type { AIConfig, AIProvider } from '@wwi/shared';
import { AIEngine } from '../services/ai-engine.js';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'wwi-game-secret-change-in-production';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

// In-memory config (will be backed by DB later)
let currentAIConfig: AIConfig | null = null;

// Admin login
router.post('/login', (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'Password required' });
  }

  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token });
});

// Auth middleware
const adminAuth = (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token required' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (decoded.role !== 'admin') return res.status(403).json({ error: 'Not admin' });
    req.admin = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Get admin config
router.get('/config', adminAuth, async (_req, res) => {
  try {
    res.json({
      aiConfig: currentAIConfig || getDefaultConfig(),
      turnIntervalHours: 2,
      quietHoursStartUTC8: 0,
      quietHoursEndUTC8: 8,
      maxPlayersPerGame: -1, // -1 = unlimited
      maintenanceMode: false,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update AI config
router.put('/ai-config', adminAuth, async (req, res) => {
  try {
    const config: AIConfig = req.body;
    if (!config.fallbackChain || !config.fallbackChain.providers) {
      return res.status(400).json({ error: 'Invalid config format' });
    }

    // Save API keys to environment variables for the AI engine
    for (const provider of config.fallbackChain.providers) {
      if (provider.type === 'openai' && provider.apiKey) {
        process.env.OPENAI_API_KEY = provider.apiKey;
        if (provider.endpoint) process.env.OPENAI_BASE_URL = provider.endpoint;
      }
      if (provider.type === 'custom' && provider.apiKey) {
        // Store in env with provider id as suffix
        process.env[`AI_KEY_${provider.id}`] = provider.apiKey;
        if (provider.endpoint) process.env[`AI_URL_${provider.id}`] = provider.endpoint;
      }
    }

    currentAIConfig = config;
    res.json({ success: true, config });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Test AI provider connection
router.post('/test-provider', adminAuth, async (req, res) => {
  try {
    const { provider } = req.body as { provider: AIProvider };
    if (!provider) return res.status(400).json({ error: 'Provider required' });

    const engine = new AIEngine({
      providers: [provider],
      enableDeterministicFallback: false,
      maxTotalTimeoutMs: 30000,
    });

    const testResult = await engine.testConnection(provider);
    res.json(testResult);
  } catch (error: any) {
    res.json({ success: false, error: error.message });
  }
});

// Get all games (admin)
router.get('/games', adminAuth, async (_req, res) => {
  // Will return games from DB
  res.json({ games: [], message: 'Game management will be available after DB setup' });
});

// Assign AI to empty country
router.post('/games/:gameId/assign-ai', adminAuth, async (req, res) => {
  const { gameId } = req.params;
  const { countryId, personality } = req.body;
  // Will be implemented with DB
  res.json({ success: true, message: `AI assigned to ${countryId} in game ${gameId}` });
});

// Remove AI from country
router.post('/games/:gameId/remove-ai', adminAuth, async (req, res) => {
  const { gameId } = req.params;
  const { countryId } = req.body;
  res.json({ success: true, message: `AI removed from ${countryId} in game ${gameId}` });
});

// Force resolve turn
router.post('/games/:gameId/force-turn', adminAuth, async (req, res) => {
  const { gameId } = req.params;
  res.json({ success: true, message: `Turn force-resolved for game ${gameId}` });
});

function getDefaultConfig(): AIConfig {
  return {
    activeProviderId: '',
    fallbackChain: {
      providers: [
        {
          id: 'default-openai',
          name: 'OpenAI Compatible',
          type: 'openai',
          apiKey: process.env.OPENAI_API_KEY || '',
          endpoint: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
          model: 'gpt-4o',
          priority: 1,
          isEnabled: true,
          timeoutMs: 30000,
          maxRetries: 2,
        },
        {
          id: 'default-google',
          name: 'Google AI',
          type: 'custom',
          apiKey: process.env.GOOGLE_AI_API_KEY || '',
          endpoint: 'https://generativelanguage.googleapis.com/v1beta',
          model: 'gemini-1.5-pro',
          priority: 2,
          isEnabled: true,
          timeoutMs: 30000,
          maxRetries: 2,
        },
      ],
      enableDeterministicFallback: true,
      maxTotalTimeoutMs: 120000,
    },
    temperature: 0.7,
    updatedAt: new Date().toISOString(),
  };
}

export default router;
