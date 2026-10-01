import type { AppLogger } from "../logger.js";
import type { Platform } from "../system/platform.js";
import type { WhatsAppGateway } from "../whatsapp/client.js";

// Lê a caixa de saída do sistema e entrega cada aviso pelo WhatsApp, confirmando (ou registrando a falha) um a um.
export async function deliverNotifications(platform: Platform, whatsapp: WhatsAppGateway, logger: AppLogger) {
  let pending;
  try { pending = await platform.notifications(); } catch (error) { logger.warn({ err: error }, "notifications unavailable"); return 0; }
  let sent = 0;
  for (const notification of pending) {
    try { await whatsapp.sendText(notification.phone, notification.message); await platform.acknowledge(notification.id, true); sent += 1; }
    catch (error) { const reason = error instanceof Error ? error.message : "erro"; logger.warn({ id: notification.id, reason }, "notification not sent"); await platform.acknowledge(notification.id, false, reason).catch(() => {}); }
  }
  return sent;
}
export function startNotificationPoller(platform: Platform, whatsapp: WhatsAppGateway, logger: AppLogger, intervalMs: number) {
  let running = false;
  const tick = async () => { if (running) return; running = true; try { await deliverNotifications(platform, whatsapp, logger); } finally { running = false; } };
  const timer = setInterval(() => void tick(), intervalMs);
  void tick();
  return () => clearInterval(timer);
}
