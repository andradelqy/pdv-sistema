const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesParaBase64(bytes: Uint8Array) {
  let texto = "";
  for (const byte of bytes) texto += String.fromCharCode(byte);
  return btoa(texto);
}

function base64ParaBytes(value: string) {
  const texto = atob(value);
  return Uint8Array.from(texto, (char) => char.charCodeAt(0));
}

async function chaveAes(secret: string) {
  if (secret.length < 32) {
    throw new Error("WHATSAPP_TOKEN_ENCRYPTION_KEY deve possuir ao menos 32 caracteres.");
  }
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function criptografarToken(token: string, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await chaveAes(secret),
    encoder.encode(token),
  );
  return {
    ciphertext: bytesParaBase64(new Uint8Array(ciphertext)),
    iv: bytesParaBase64(iv),
  };
}

export async function descriptografarToken(ciphertext: string, iv: string, secret: string) {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ParaBytes(iv) },
    await chaveAes(secret),
    base64ParaBytes(ciphertext),
  );
  return decoder.decode(plaintext);
}
