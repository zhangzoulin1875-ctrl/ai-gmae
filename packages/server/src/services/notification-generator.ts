import { prisma } from '../lib/prisma.js';
import { WWI_COUNTRIES } from '@wwi/shared';

const COUNTRY_NAMES: Record<string, string> = Object.fromEntries(
  WWI_COUNTRIES.map((c) => [c.id, c.nameZh])
);

export async function generateNotificationsForTurn(
  gameId: string,
  turn: number,
  battles: any[]
): Promise<void> {
  const players = await prisma.player.findMany({
    where: { gameId, isAI: false },
  });

  if (players.length === 0) return;

  for (const player of players) {
    try {
      const countryId = player.countryId;
      const countryName = COUNTRY_NAMES[countryId] || countryId;

      // 1. Battle Notifications
      const myBattles = battles.filter(
        (b) => b.attackerCountryId === countryId || b.defenderCountryId === countryId
      );

      for (const b of myBattles) {
        const isAttacker = b.attackerCountryId === countryId;
        const won = b.winnerCountryId === countryId;

        let title = won ? '戰報：捷報！' : '戰報：失利';
        if (b.winnerCountryId === 'neutral') title = '戰報：平局';

        const roleText = isAttacker ? '進攻' : '防禦';
        const resultText = won
          ? (b.territoryCaptured ? '成功奪取領土' : '擊退敵軍')
          : '遭受重創';

        const myCasualties = isAttacker ? b.attackerCasualties : b.defenderCasualties;
        const casSummary = myCasualties
          ? `傷亡: 步兵 ${myCasualties.infantry || 0}, 砲兵 ${myCasualties.artillery || 0}, 騎兵 ${myCasualties.cavalry || 0}`
          : '';

        const message = `${countryName}在 ${b.territoryId || '戰場'} 的${roleText}作戰中${resultText}。${casSummary}。${b.narrative || ''}`;

        await prisma.notification.create({
          data: {
            gameId,
            countryId,
            playerId: player.id,
            turn,
            type: 'BATTLE',
            title,
            message,
          },
        });
      }

      // 2. Recruit Orders Notifications
      const recruitOrders = await prisma.order.findMany({
        where: {
          gameId,
          playerId: player.id,
          turn,
          type: 'RECRUIT',
        },
      });

      for (const order of recruitOrders) {
        let details = '';
        if (order.recruitComposition && typeof order.recruitComposition === 'object') {
          const comp = order.recruitComposition as Record<string, number>;
          const unitIds = Object.keys(comp);
          if (unitIds.length > 0) {
            const units = await prisma.customUnit.findMany({
              where: { id: { in: unitIds } },
            });
            const unitMap = new Map(units.map((u) => [u.id, u.nameZh]));
            details = Object.entries(comp)
              .map(([uid, qty]) => `${unitMap.get(uid) || uid} x${qty}`)
              .join(', ');
          }
        } else if (order.infantry) {
          details = `步兵 x${order.infantry}`;
        }

        await prisma.notification.create({
          data: {
            gameId,
            countryId,
            playerId: player.id,
            turn,
            type: 'RECRUIT',
            title: '招募完成',
            message: `本回合新招募部隊已加入軍備庫存：${details || '招募單位'}。`,
          },
        });
      }

      // 3. Policy Submission Notifications
      const policies = await prisma.policySubmission.findMany({
        where: {
          gameId,
          playerId: player.id,
          turn,
        },
      });

      for (const pol of policies) {
        const statusMap: Record<string, string> = {
          APPROVED: '通過',
          PARTIAL: '部分通過',
          REJECTED: '否決',
        };
        const statusText = statusMap[pol.status] || pol.status;

        let fxText = '';
        if (pol.effects && typeof pol.effects === 'object') {
          const fx = pol.effects as any;
          const items: string[] = [];
          if (fx.goldChange) items.push(`黃金 ${fx.goldChange > 0 ? '+' : ''}${fx.goldChange}`);
          if (fx.industryChange) items.push(`工業 ${fx.industryChange > 0 ? '+' : ''}${fx.industryChange}`);
          if (fx.manpowerChange) items.push(`人力 ${fx.manpowerChange > 0 ? '+' : ''}${fx.manpowerChange}`);
          if (fx.moraleChange) items.push(`士氣 ${fx.moraleChange > 0 ? '+' : ''}${fx.moraleChange}`);
          if (fx.stabilityChange) items.push(`穩定度 ${fx.stabilityChange > 0 ? '+' : ''}${fx.stabilityChange}`);
          if (items.length > 0) fxText = ` (影響: ${items.join(', ')})`;
        }

        await prisma.notification.create({
          data: {
            gameId,
            countryId,
            playerId: player.id,
            turn,
            type: 'POLICY',
            title: '政策審核結果',
            message: `政策《${pol.title}》審核結果：${statusText}。${pol.aiVerdict || ''}${fxText}`,
          },
        });
      }
    } catch (err: any) {
      console.error(`[NotificationGenerator] Error generating notifications for player ${player.id}:`, err.message);
    }
  }
}
