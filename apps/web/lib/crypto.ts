import "server-only"

// El cifrado vive en @mirai/crypto (F2-B-7) para que lo compartan la web y la API. Mismo formato y mismas funciones.
export { encrypt, decrypt, mask } from "@mirai/crypto"
