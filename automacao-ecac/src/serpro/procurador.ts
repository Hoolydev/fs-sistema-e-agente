import forge from "node-forge";
import { SignedXml } from "xml-crypto";
import type { CertificateMaterial } from "../security/certificate-provider.js";

// Termo de Autorização do Integra Contador (serviço AUTENTICAPROCURADOR): o autor do pedido de dados — aqui a própria
// empresa, com o seu e-CNPJ — autoriza o contratante (FS) a fazer as requisições em seu nome. Texto e estrutura do
// modelo oficial do Serpro; assinatura XML-DSig envelopada, C14N 1.0, RSA-SHA256, digest SHA-256, com o X509 no KeyInfo.
const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const TERMO = "Autorizo a empresa CONTRATANTE, identificada neste termo de autorização como DESTINATÁRIO, a executar as requisições dos serviços web disponibilizados pela API INTEGRA CONTADOR, onde terei o papel de AUTOR PEDIDO DE DADOS no corpo da mensagem enviada na requisição do serviço web. Esse termo de autorização está assinado digitalmente com o certificado digital do PROCURADOR ou OUTORGADO DO CONTRIBUINTE responsável, identificado como AUTOR DO PEDIDO DE DADOS.";
const AVISO = "O acesso a estas informações foi autorizado pelo próprio PROCURADOR ou OUTORGADO DO CONTRIBUINTE, responsável pela informação, via assinatura digital. É dever do destinatário da autorização e consumidor deste acesso observar a adoção de base legal para o tratamento dos dados recebidos conforme artigos 7º ou 11º da LGPD (Lei n.º 13.709, de 14 de agosto de 2018), aos direitos do titular dos dados (art. 9º, 17 e 18, da LGPD) e aos princípios que norteiam todos os tratamentos de dados no Brasil (art. 6º, da LGPD).";
const FINALIDADE = "A finalidade única e exclusiva desse TERMO DE AUTORIZAÇÃO, é garantir que o CONTRATANTE apresente a API INTEGRA CONTADOR esse consentimento do PROCURADOR ou OUTORGADO DO CONTRIBUINTE assinado digitalmente, para que possa realizar as requisições dos serviços web da API INTEGRA CONTADOR em nome do AUTOR PEDIDO DE DADOS (PROCURADOR ou OUTORGADO DO CONTRIBUINTE).";

const attr = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const ymd = (d: Date) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;

export type ClientCertificate = { keyPem: string; certPem: string; cnpj: string | null; name: string; notAfter: Date };
// Chave e certificado do titular a partir do A1 (.pfx), só em memória.
export function readClientCertificate(material: CertificateMaterial): ClientCertificate {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try { p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.createBuffer(material.pfx.toString("binary"))), false, material.passphrase); }
  catch { throw new Error("client_certificate_invalid"); }
  const shrouded = forge.pki.oids.pkcs8ShroudedKeyBag as string, plain = forge.pki.oids.keyBag as string, certBag = forge.pki.oids.certBag as string;
  const bags = (type: string) => (p12.getBags({ bagType: type })[type] ?? []) as forge.pkcs12.Bag[];
  const key = [...bags(shrouded), ...bags(plain)][0]?.key as forge.pki.rsa.PrivateKey | undefined;
  const certs = bags(certBag).map((b: forge.pkcs12.Bag) => b.cert).filter((c): c is forge.pki.Certificate => !!c);
  if (!key || !certs.length) throw new Error("client_certificate_invalid");
  const leaf = certs.find((c: forge.pki.Certificate) => (c.publicKey as forge.pki.rsa.PublicKey).n?.equals(key.n)) ?? certs[0]!;
  const cn = String(leaf.subject.getField("CN")?.value ?? "");
  return { keyPem: forge.pki.privateKeyToPem(key), certPem: forge.pki.certificateToPem(leaf), cnpj: cn.match(/:(\d{14})$/)?.[1] ?? null, name: cn.replace(/:\d{11,14}$/, "") || cn, notAfter: leaf.validity.notAfter };
}

export function buildTermo(input: { contratanteCnpj: string; contratanteNome: string; autorCnpj: string; autorNome: string; assinatura: Date; vigencia: Date }) {
  return `<?xml version="1.0" encoding="UTF-8"?><termoDeAutorizacao><dados><sistema id="API Integra Contador"/><termo texto="${attr(TERMO)}"/><avisoLegal texto="${attr(AVISO)}"/><finalidade texto="${attr(FINALIDADE)}"/><dataAssinatura data="${ymd(input.assinatura)}"/><vigencia data="${ymd(input.vigencia)}"/><destinatario numero="${input.contratanteCnpj}" nome="${attr(input.contratanteNome)}" tipo="PJ" papel="contratante"/><assinadoPor numero="${input.autorCnpj}" nome="${attr(input.autorNome)}" tipo="PJ" papel="autor pedido de dados"/></dados></termoDeAutorizacao>`;
}

export function signTermo(xml: string, certificate: Pick<ClientCertificate, "keyPem" | "certPem">) {
  const signer = new SignedXml({ privateKey: certificate.keyPem, publicCert: certificate.certPem, signatureAlgorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256", canonicalizationAlgorithm: C14N });
  signer.addReference({ xpath: "/*", transforms: ["http://www.w3.org/2000/09/xmldsig#enveloped-signature", C14N], digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256", uri: "", isEmptyUri: true });
  signer.computeSignature(xml, { location: { reference: "/*", action: "append" } });
  return signer.getSignedXml();
}

// Termo assinado pronto para o envio (base64 do XML), com vigência limitada à validade do certificado.
export function signedTermoBase64(material: CertificateMaterial, contratante: { cnpj: string; nome: string }, expectedCnpj: string, now = new Date()) {
  const certificate = readClientCertificate(material);
  if (certificate.cnpj && certificate.cnpj.slice(0, 8) !== expectedCnpj.slice(0, 8)) throw new Error("client_certificate_mismatch");
  if (certificate.notAfter.getTime() <= now.getTime()) throw new Error("client_certificate_expired");
  const year = new Date(now.getTime() + 365 * 86_400_000), vigencia = certificate.notAfter < year ? certificate.notAfter : year;
  const xml = buildTermo({ contratanteCnpj: contratante.cnpj, contratanteNome: contratante.nome, autorCnpj: expectedCnpj, autorNome: certificate.name, assinatura: now, vigencia });
  return Buffer.from(signTermo(xml, certificate), "utf8").toString("base64");
}
