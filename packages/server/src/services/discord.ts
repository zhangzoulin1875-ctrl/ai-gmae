export class DiscordService {
  async exchangeCode(code: string, redirectUri: string): Promise<any> {
    const body = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID || '',
      client_secret: process.env.DISCORD_CLIENT_SECRET || '',
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    });

    const res = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Discord token exchange failed: ${err}`);
    }

    return res.json();
  }

  async getUser(accessToken: string): Promise<any> {
    const res = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch Discord user: ${res.status}`);
    }

    return res.json();
  }
}
