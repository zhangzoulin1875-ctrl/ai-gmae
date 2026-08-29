import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { DiscordService } from '../services/discord.js';

const router = Router();
const discordService = new DiscordService();

const JWT_SECRET = process.env.JWT_SECRET || 'wwi-game-secret-change-in-production';
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || '';
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || '';
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || 'http://localhost:3001/api/auth/discord/callback';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Redirect to Discord OAuth2
router.get('/discord', (_req, res) => {
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify guilds',
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params.toString()}`);
});

// Discord OAuth2 callback
router.get('/discord/callback', async (req, res) => {
  const { code } = req.query;
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Missing authorization code' });
  }

  try {
    // Exchange code for token
    const tokenResponse = await discordService.exchangeCode(code, DISCORD_REDIRECT_URI);
    // Get user info
    const userInfo = await discordService.getUser(tokenResponse.access_token);

    // Create JWT
    const token = jwt.sign(
      {
        id: userInfo.id,
        username: userInfo.username,
        avatar: userInfo.avatar
          ? `https://cdn.discordapp.com/avatars/${userInfo.id}/${userInfo.avatar}.png`
          : null,
        provider: 'discord',
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Set cookie (cross-domain: static client + separate API server) and redirect to lobby
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('token', token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.redirect(`${FRONTEND_URL}/lobby`);
  } catch (error: any) {
    console.error('[Auth] Discord callback error:', error.message);
    res.redirect(`${FRONTEND_URL}/?error=auth_failed`);
  }
});

// Get current user
router.get('/me', (req, res) => {
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    res.json({
      id: decoded.id,
      username: decoded.username,
      avatar: decoded.avatar,
      provider: decoded.provider,
    });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Logout
router.post('/logout', (_req, res) => {
  const isProd = process.env.NODE_ENV === 'production';
  res.clearCookie('token', { sameSite: isProd ? 'none' : 'lax', secure: isProd });
  res.json({ success: true });
});

export default router;
