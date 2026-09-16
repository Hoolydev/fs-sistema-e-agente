import { describe, expect, it } from "vitest";
import {
  extractInboundMessages,
  extractZApiInboundMessages,
} from "../src/whatsapp/payload.js";

describe("extractInboundMessages", () => {
  it("extracts text messages and ignores status-only changes", () => {
    const messages = extractInboundMessages({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                messages: [
                  {
                    id: "wamid.123",
                    from: "5562999999999",
                    timestamp: "1788900000",
                    type: "text",
                    text: { body: "situação fiscal" },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      messageId: "wamid.123",
      from: "5562999999999",
      type: "text",
      text: "situação fiscal",
    });
  });
});

describe("extractZApiInboundMessages", () => {
  it("extracts a direct incoming text message", () => {
    const messages = extractZApiInboundMessages(
      {
        instanceId: "instance-123",
        messageId: "zapi-message-1",
        phone: "5562999999999",
        fromMe: false,
        momment: 1_788_900_000_000,
        type: "ReceivedCallback",
        isGroup: false,
        text: { message: "analise a empresa 47.733.961/0001-79" },
      },
      "instance-123",
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      messageId: "zapi-message-1",
      from: "5562999999999",
      type: "text",
      text: "analise a empresa 47.733.961/0001-79",
    });
  });

  it("ignores own messages, groups and a different instance", () => {
    const base = {
      instanceId: "instance-123",
      messageId: "zapi-message-1",
      phone: "5562999999999",
      momment: 1_788_900_000_000,
      type: "ReceivedCallback",
      text: { message: "teste" },
    };

    expect(extractZApiInboundMessages({ ...base, fromMe: true }, "instance-123")).toEqual([]);
    expect(extractZApiInboundMessages({ ...base, isGroup: true }, "instance-123")).toEqual([]);
    expect(extractZApiInboundMessages(base, "outra-instancia")).toEqual([]);
  });
});
