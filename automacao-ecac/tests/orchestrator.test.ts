import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import type { InboundMessage, RpaRequest } from "../src/domain/types.js";
import { createLogger } from "../src/logger.js";
import { InMemoryPendingRequestStore } from "../src/orchestrator/pending-request-store.js";
import { OrchestratorService } from "../src/orchestrator/service.js";
import type { RequestPublisher } from "../src/queue/request-queue.js";
import type { WhatsAppGateway } from "../src/whatsapp/client.js";

class FakePublisher implements RequestPublisher {
  readonly requests: RpaRequest[] = [];

  async publish(message: InboundMessage, parsed: Parameters<RequestPublisher["publish"]>[1]) {
    const request: RpaRequest = {
      requestId: "request-1",
      sourceMessageId: message.messageId,
      requesterPhone: message.from,
      cnpj: parsed.cnpj,
      period: parsed.period,
      documentType: parsed.documentType,
    };
    this.requests.push(request);
    return request;
  }
}

class FakeWhatsApp implements WhatsAppGateway {
  readonly texts: string[] = [];

  async sendText(_to: string, body: string) {
    this.texts.push(body);
    return "message-1";
  }

  async sendDocument() {
    return "document-1";
  }
}

const config = loadConfig({
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  WHATSAPP_VERIFY_TOKEN: "verify-token",
  WHATSAPP_APP_SECRET: "app-secret-value",
  WHATSAPP_DRY_RUN: "true",
  META_GRAPH_API_VERSION: "v25.0",
  AUTHORIZED_PHONE_NUMBERS: "5562999999999",
  DATABASE_URL: "postgres://ecac:ecac@localhost:5432/ecac",
  REDIS_URL: "redis://localhost:6379",
  ECAC_LOGIN_URL: "https://example.gov.br/login",
});

describe("OrchestratorService", () => {
  it("requires confirmation before publishing the RPA job", async () => {
    const publisher = new FakePublisher();
    const whatsapp = new FakeWhatsApp();
    const service = new OrchestratorService(
      config,
      publisher,
      whatsapp,
      new InMemoryPendingRequestStore(),
      createLogger("silent"),
    );

    await service.handle(message("first", "situação fiscal 47.733.961/0001-79 08/2026"));
    expect(publisher.requests).toHaveLength(0);
    expect(whatsapp.texts.at(-1)).toContain("Responda SIM");

    await service.handle(message("confirmation", "SIM"));
    expect(publisher.requests).toHaveLength(1);
    expect(publisher.requests[0]).toMatchObject({
      cnpj: "47733961000179",
      period: "2026-08",
      documentType: "situacao_fiscal",
    });
  });

  it("does not process unauthorized contacts", async () => {
    const publisher = new FakePublisher();
    const whatsapp = new FakeWhatsApp();
    const service = new OrchestratorService(
      config,
      publisher,
      whatsapp,
      new InMemoryPendingRequestStore(),
      createLogger("silent"),
    );
    const inbound = message("unauthorized", "situação fiscal 47.733.961/0001-79 08/2026");
    inbound.from = "5562888888888";
    await service.handle(inbound);
    expect(publisher.requests).toHaveLength(0);
    expect(whatsapp.texts.at(-1)).toContain("não está autorizado");
  });

  it("queues a diagnostic requested in natural language after confirmation", async () => {
    const publisher = new FakePublisher();
    const whatsapp = new FakeWhatsApp();
    const service = new OrchestratorService(
      config,
      publisher,
      whatsapp,
      new InMemoryPendingRequestStore(),
      createLogger("silent"),
    );

    await service.handle(message("analysis", "Faça uma análise da empresa 51.646.813/0001-94"));
    expect(whatsapp.texts.at(-1)).toContain("diagnóstico fiscal federal");
    await service.handle(message("analysis-confirmation", "SIM"));
    expect(publisher.requests.at(-1)).toMatchObject({
      cnpj: "51646813000194",
      documentType: "diagnostico_fiscal",
    });
  });
});

function message(messageId: string, text: string): InboundMessage {
  return {
    messageId,
    from: "5562999999999",
    timestamp: new Date("2026-09-09T12:00:00Z"),
    type: "text",
    text,
  };
}

describe('shared system archive',()=>{
 const document={id:'crm_existing',company:'Cliente XPTO',cnpj:'47733961000179',name:'Parecer.pdf',kind:'parecer',createdAt:'2026-09-15T12:00:00Z',source:'Sistema FS',size:100};
 it('resends the saved opinion by company name without scheduling an analysis',async()=>{
  const publisher=new FakePublisher(), whatsapp=new FakeWhatsApp(); const sent:string[]=[];
  const archive={async search(q:string){expect(q).toBe('XPTO');return [document];},async deliver(d:typeof document){sent.push(d.id);}};
  const service=new OrchestratorService(config,publisher,whatsapp,new InMemoryPendingRequestStore(),createLogger('silent'),archive);
  await service.handle(message('saved','me manda a análise do cliente XPTO'));
  expect(sent).toEqual(['crm_existing']);expect(publisher.requests).toHaveLength(0);
 });
 it('asks for CNPJ when companies match and never picks one arbitrarily',async()=>{
  const publisher=new FakePublisher(), whatsapp=new FakeWhatsApp(); let sent=false;
  const archive={async search(){return [document,{...document,id:'other',cnpj:'51646813000194'}];},async deliver(){sent=true;}};
  await new OrchestratorService(config,publisher,whatsapp,new InMemoryPendingRequestStore(),createLogger('silent'),archive).handle(message('ambiguous','me envia o parecer da empresa XPTO'));
  expect(sent).toBe(false);expect(whatsapp.texts.at(-1)).toContain('Informe o CNPJ');expect(publisher.requests).toHaveLength(0);
 });
 it('missing reports or archive errors do not trigger new fiscal consultations',async()=>{
  for(const fail of [false,true]){const publisher=new FakePublisher(),whatsapp=new FakeWhatsApp();const archive={async search(){if(fail)throw new Error();return [];},async deliver(){throw new Error('unexpected');}};
  await new OrchestratorService(config,publisher,whatsapp,new InMemoryPendingRequestStore(),createLogger('silent'),archive).handle(message('missing','me manda a análise do cliente XPTO'));
  expect(publisher.requests).toHaveLength(0);expect(whatsapp.texts.at(-1)).toMatch(/nova análise/);}
 });
 it('unauthorized numbers never reach the archive',async()=>{
  let searched=false;const archive={async search(){searched=true;return [];},async deliver(){}};
  const inbound=message('unauthorized-file','me manda a análise do cliente XPTO');inbound.from='5562000000000';
  await new OrchestratorService(config,new FakePublisher(),new FakeWhatsApp(),new InMemoryPendingRequestStore(),createLogger('silent'),archive).handle(inbound);expect(searched).toBe(false);
 });
});
