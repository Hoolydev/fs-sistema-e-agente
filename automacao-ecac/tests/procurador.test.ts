import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import forge from "node-forge";
import { describe, expect, it, vi } from "vitest";
import { SignedXml } from "xml-crypto";
import { loadConfig } from "../src/config.js";
import { SerproSitfisClient, type SerproHttpRequest } from "../src/serpro/client.js";
import { buildTermo, readClientCertificate, signedTermoBase64, signTermo } from "../src/serpro/procurador.js";
import { clientToken } from "../src/sistema/sitfis.js";

const taxpayer = "51646813000194", contractor = "47733961000179";
const keys = forge.pki.rsa.generateKeyPair({ bits: 1024, e: 0x10001 });
function pfx(cn: string, days = 300, password = "senha-do-cliente") {
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey; cert.serialNumber = "02";
  cert.validity.notBefore = new Date(Date.now() - 86_400_000); cert.validity.notAfter = new Date(Date.now() + days * 86_400_000);
  cert.setSubject([{ name: "commonName", value: cn }]); cert.setIssuer([{ name: "commonName", value: "AC TESTE" }]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { pfx: Buffer.from(forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, { algorithm: "3des" })).getBytes(), "binary"), passphrase: password };
}

describe("Termo de autorização assinado pela empresa", () => {
  it("monta o termo do Serpro e assina com o e-CNPJ (XML-DSig envelopada, RSA-SHA256, X509 no KeyInfo)", () => {
    const material = pfx("EMPRESA CLIENTE LTDA:51646813000194"), cert = readClientCertificate(material);
    expect(cert.cnpj).toBe(taxpayer); expect(cert.name).toBe("EMPRESA CLIENTE LTDA");
    const xml = buildTermo({ contratanteCnpj: contractor, contratanteNome: "FS SOLUCOES TRIBUTARIAS LTDA", autorCnpj: taxpayer, autorNome: cert.name, assinatura: new Date("2026-10-15T12:00:00Z"), vigencia: new Date("2027-10-15T12:00:00Z") });
    const signed = signTermo(xml, cert);
    expect(signed).toMatch(/<destinatario numero="47733961000179" nome="FS SOLUCOES TRIBUTARIAS LTDA" tipo="PJ" papel="contratante"\/>/);
    expect(signed).toMatch(/<assinadoPor numero="51646813000194" nome="EMPRESA CLIENTE LTDA" tipo="PJ" papel="autor pedido de dados"\/>/);
    expect(signed).toMatch(/<dataAssinatura data="20261015"\/><vigencia data="20271015"\/>/);
    expect(signed).toMatch(/<Signature xmlns="http:\/\/www\.w3\.org\/2000\/09\/xmldsig#">.*<X509Certificate>.*<\/Signature><\/termoDeAutorizacao>$/s);
    expect(signed).toContain('Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"');
    const verifier = new SignedXml({ publicCert: cert.certPem });
    verifier.loadSignature(signed.match(/<Signature[\s\S]*<\/Signature>/)![0]);
    expect(verifier.checkSignature(signed)).toBe(true);
    expect(verifier.checkSignature(signed.replace("EMPRESA CLIENTE LTDA\" tipo", "OUTRA EMPRESA\" tipo"))).toBe(false);
  });

  it("recusa certificado de outra empresa, vencido ou com senha errada", () => {
    expect(() => signedTermoBase64(pfx("OUTRA EMPRESA:11222333000181"), { cnpj: contractor, nome: "FS" }, taxpayer)).toThrow("client_certificate_mismatch");
    expect(() => signedTermoBase64(pfx("EMPRESA:51646813000194", -1), { cnpj: contractor, nome: "FS" }, taxpayer)).toThrow("client_certificate_expired");
    expect(() => readClientCertificate({ ...pfx("EMPRESA:51646813000194"), passphrase: "errada" })).toThrow("client_certificate_invalid");
    const termo = Buffer.from(signedTermoBase64(pfx("EMPRESA:51646813000194", 30), { cnpj: contractor, nome: "FS" }, taxpayer), "base64").toString();
    const vigencia = termo.match(/<vigencia data="(\d{8})"/)![1]!, limite = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10).replace(/-/g, "");
    expect(vigencia <= limite).toBe(true);
  });
});

async function client(responses: { status: number; body: unknown }[]) {
  const directory = await mkdtemp(join(tmpdir(), "procurador-"));
  await writeFile(join(directory, "key"), "k"); await writeFile(join(directory, "secret"), "s");
  const config = loadConfig({ DATABASE_URL: "postgres://localhost/ecac", REDIS_URL: "redis://localhost:6379", ECAC_LOGIN_URL: "https://cav.receita.fazenda.gov.br", SERPRO_ENABLED: "true", SERPRO_CONTRACTOR_CNPJ: contractor, SERPRO_AUTHOR_CNPJ: contractor, SERPRO_CONSUMER_KEY_FILE: join(directory, "key"), SERPRO_CONSUMER_SECRET_FILE: join(directory, "secret") });
  const requests: SerproHttpRequest[] = [];
  const transport = vi.fn(async (r: SerproHttpRequest) => {
    requests.push(r);
    if (r.url.endsWith("/authenticate")) return { status: 200, body: { access_token: "a", jwt_token: "j", expires_in: 3600 } };
    const next = responses.shift(); if (!next) throw new Error("extra"); return next as { status: number; body: Record<string, unknown> };
  });
  return { requests, client: new SerproSitfisClient(config, { getForCnpj: async () => ({ pfx: Buffer.from([1]), passphrase: "fs" }) }, transport, async () => {}, () => 0) };
}
const ok = (dados: unknown) => ({ status: 200, body: { status: 200, contribuinte: { numero: taxpayer, tipo: 2 }, dados: JSON.stringify(dados) } });

describe("Integra Contador com a empresa como autora do pedido", () => {
  it("envia o termo ao AUTENTICAPROCURADOR e consulta a situação fiscal com o token, sem procuração à FS", async () => {
    const pdf = Buffer.from("%PDF-1.7\nteste\n%%EOF");
    const s = await client([ok({ autenticar_procurador_token: "tok-cliente", data_hora_expiracao: "2026-10-15T18:00:00Z" }), ok({ protocoloRelatorio: "p", tempoEspera: 1000 }), ok({ pdf: pdf.toString("base64") })]);
    const auth = await s.client.authorizeClient(taxpayer, "VEVSTU8=");
    expect(auth).toEqual({ token: "tok-cliente", expiresAt: Date.parse("2026-10-15T18:00:00Z") });
    const sent = JSON.parse(s.requests[1]!.body);
    expect(sent.pedidoDados).toMatchObject({ idSistema: "AUTENTICAPROCURADOR", idServico: "ENVIOXMLASSINADO81", versaoSistema: "1.0" });
    expect(JSON.parse(sent.pedidoDados.dados)).toEqual({ xml: "VEVSTU8=" });
    expect(sent.autorPedidoDados.numero).toBe(taxpayer); expect(sent.contratante.numero).toBe(contractor);
    expect(await s.client.obtainSituationPdf(taxpayer, { cnpj: taxpayer, token: "tok-cliente" })).toEqual(pdf);
    for (const r of s.requests.slice(2)) {
      expect(r.headers.autenticar_procurador_token).toBe("tok-cliente");
      expect(JSON.parse(r.body).autorPedidoDados.numero).toBe(taxpayer);
    }
  });
  it("304 do Serpro indica token já emitido; recusa vira código próprio", async () => {
    const cached = await client([{ status: 304, body: {} }]);
    expect(await cached.client.authorizeClient(taxpayer, "eA==")).toBe("cached");
    const denied = await client([{ status: 403, body: {} }]);
    await expect(denied.client.authorizeClient(taxpayer, "eA==")).rejects.toMatchObject({ code: "client_authorization_denied" });
  });
  it("token guardado evita reenviar o termo; o certificado sai da memória depois do uso", async () => {
    const saved = new Map<string, string>();
    const store = { get: async (c: string) => saved.get(c) ?? null, set: async (c: string, t: string) => { saved.set(c, t); } };
    const material = { pfx: Buffer.from([9, 9, 9]), passphrase: "x" };
    const deps = { store, certificate: vi.fn(async () => material), sign: vi.fn(() => "termo"), authorize: vi.fn(async () => ({ token: "t1", expiresAt: Date.now() + 3_600_000 })) };
    expect(await clientToken(taxpayer, deps)).toBe("t1");
    expect(material.pfx.every(b => b === 0)).toBe(true);
    expect(await clientToken(taxpayer, deps)).toBe("t1");
    expect(deps.certificate).toHaveBeenCalledTimes(1);
    await expect(clientToken("11222333000181", { ...deps, authorize: vi.fn(async () => "cached" as const) })).rejects.toThrow("client_token_unavailable");
  });
});
