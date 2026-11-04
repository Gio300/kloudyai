# `.kbot` signed bot file — verify spec (`format: kloudy.bot/1`)

A `.kbot` file is one JSON object:

```json
{"format":"kloudy.bot/1","issued":"<ISO-8601>","manifest":{...},"sha256":"<hex>",
 "signature":{"alg":"Ed25519","pub":"<base64 SPKI DER>","sig":"<base64>"}}
```

## Canonical JSON
`canon(v)`: arrays → `[` + elements joined by `,` + `]`; objects → `{` + keys sorted by
UTF-16 code unit order (JavaScript `Object.keys(o).sort()`), each `JSON.stringify(key) + ':' + canon(value)`, joined by `,` + `}`;
everything else → `JSON.stringify(v)`. No whitespace. UTF-8 bytes of that string are what is hashed/signed.

## Verify (all steps must pass, else reject — do not install)
1. `format === "kloudy.bot/1"` and `signature.alg === "Ed25519"`.
2. `sha256 === hex(SHA-256(canon(manifest)))`.
3. `body` = the object with the `signature` key removed (`format, issued, manifest, sha256`).
4. `Ed25519.verify(pub = SPKI-DER(base64 signature.pub), message = canon(body), sig = base64 signature.sig)`.
5. Trust: `signature.pub` must be a Kloudy-published signing key (pin it); a valid signature by an unknown key is "unverified", not trusted.
6. Then check `manifest.id` exists in `GET /api/deployable-bots/<id>` and its status is not `reported-broken` (warn if it is).

Reference (Node ≥ 20):

```js
import crypto from 'node:crypto';
const canon=o=>Array.isArray(o)?'['+o.map(canon).join(',')+']':o&&typeof o==='object'?'{'+Object.keys(o).sort().map(k=>JSON.stringify(k)+':'+canon(o[k])).join(',')+'}':JSON.stringify(o);
export function verifyKbot(f){const {signature,...body}=f;if(body.format!=='kloudy.bot/1'||signature?.alg!=='Ed25519')return false;
  const pub=crypto.createPublicKey({key:Buffer.from(signature.pub,'base64'),format:'der',type:'spki'});
  return crypto.createHash('sha256').update(canon(body.manifest)).digest('hex')===body.sha256&&crypto.verify(null,Buffer.from(canon(body)),pub,Buffer.from(signature.sig,'base64'));}
```
A one-byte edit anywhere in `manifest`, `issued` or `sha256` must make verification fail.
Transport: email attachment `application/vnd.kloudy.bot+json`, `kloudy://bot#<base64url>`, or share-by-id (receiver fetches by id and re-verifies).
