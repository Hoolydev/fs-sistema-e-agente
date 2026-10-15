import forge from "node-forge";
import { createHash } from "node:crypto";

// Leitura do certificado A1 (.pfx/.p12) para conferir senha, titular, CNPJ e validade antes de guardar.
export type CertificateInfo = { holder: string; cnpj: string | null; issuer: string; notBefore: string; notAfter: string; fingerprint: string };
const ICP_CNPJ_OID = "2.16.76.1.3.3";
export function readPfx(pfx: Buffer, passphrase: string): CertificateInfo {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try { p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.createBuffer(pfx.toString("binary"))), false, passphrase); }
  catch { throw new Error("BAD_PASSWORD"); }
  const keys = [...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []), ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? [])];
  const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? []).map(b => b.cert).filter((c): c is forge.pki.Certificate => !!c);
  if (!keys.length || !keys[0]!.key) throw new Error("NO_KEY");
  if (!certs.length) throw new Error("NO_CERTIFICATE");
  // Certificado do titular: o que corresponde à chave privada (os demais são da cadeia ICP-Brasil).
  const key = keys[0]!.key as forge.pki.rsa.PrivateKey;
  const leaf = certs.find(c => { const pub = c.publicKey as forge.pki.rsa.PublicKey; return !!pub.n && !!key.n && pub.n.equals(key.n); }) ?? certs.find(c => !c.getExtension("basicConstraints") || !(c.getExtension("basicConstraints") as { cA?: boolean }).cA) ?? certs[0]!;
  const cn = String(leaf.subject.getField("CN")?.value ?? "");
  let cnpj = cn.match(/:(\d{14})$/)?.[1] ?? null;
  if (!cnpj) {
    // ICP-Brasil: CNPJ no nome alternativo (otherName 2.16.76.1.3.3).
    const san = leaf.getExtension("subjectAltName") as { value?: string } | undefined, raw = san?.value ?? "";
    const oid = forge.asn1.oidToDer(ICP_CNPJ_OID).getBytes(), at = raw.indexOf(oid);
    cnpj = at >= 0 ? raw.slice(at, at + 64).match(/\d{14}/)?.[0] ?? null : null;
  }
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(leaf)).getBytes();
  return {
    holder: cn.replace(/:\d{11,14}$/, "") || cn, cnpj,
    issuer: String(leaf.issuer.getField("CN")?.value ?? ""),
    notBefore: leaf.validity.notBefore.toISOString(), notAfter: leaf.validity.notAfter.toISOString(),
    fingerprint: createHash("sha256").update(Buffer.from(der, "binary")).digest("hex"),
  };
}
