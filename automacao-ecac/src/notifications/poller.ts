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
const brasilia = (d: Date) => { const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(d).map(p => [p.type, p.value])); return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) }; };
// O sistema chama trigger() ao criar um aviso (entrega na hora). A leitura periódica é só rede de segurança, em horário
// comercial, e uma vez a partir das 08:00 para o resumo diário: consultar o sistema a cada minuto mantinha o banco
// (Neon) acordado 24 h por dia. Fora disso o banco hiberna.
export function startNotificationPoller(platform: Platform, whatsapp: WhatsAppGateway, logger: AppLogger, safetyMs: number, now = () => new Date()) {
  let running = false, again = false, last = 0, digestDay = "";
  const tick = async () => {
    if (running) { again = true; return; }
    running = true; last = now().getTime();
    const { day, hour } = brasilia(now()); if (hour >= 8) digestDay = day;
    try { await deliverNotifications(platform, whatsapp, logger); }
    finally { running = false; if (again) { again = false; void tick(); } }
  };
  const check = () => {
    const at = now(), { day, hour } = brasilia(at);
    if (hour >= 8 && digestDay !== day) { void tick(); return; }
    if (hour >= 7 && hour < 21 && at.getTime() - last >= safetyMs) void tick();
  };
  const timer = setInterval(check, 60_000);
  void tick();
  return { trigger: () => void tick(), check, stop: () => clearInterval(timer) };
}
