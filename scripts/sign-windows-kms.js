// Windows Authenticode signing through Google Cloud KMS.
//
// The private key is generated inside Cloud HSM and can never be exported, so signing is a remote
// API call rather than a local key file: jsign (storetype GOOGLECLOUD) hashes the file here, asks
// KMS to sign the hash, and writes the Authenticode signature back into the binary. The certificate
// chain is public and comes from a file; the only credential is a short-lived access token.
//
// electron-builder calls this for every file it would have handed to signtool — the application
// executable before NSIS packaging, then the installer and uninstaller — which is why signing
// cannot happen after the build: the inner executable would stay unsigned.
//
// Required environment (set by .github/workflows/build-production.yml):
//   WINDOWS_CODESIGN_KEYSTORE   key ring resource path, e.g. projects/p/locations/l/keyRings/r
//   WINDOWS_CODESIGN_ALIAS      key and version, e.g. desktop-windows-codesign/cryptoKeyVersions/1
//   WINDOWS_CODESIGN_CERT_FILE  certificate chain (PEM or PKCS#7), leaf first
//   WINDOWS_CODESIGN_TOKEN      OAuth access token for the signing service account
//   JSIGN_JAR                   path to the jsign jar
//   WINDOWS_CODESIGN_TSA        optional RFC3161 timestamping authority
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const DEFAULT_TSA = 'http://timestamp.digicert.com';

const required = name => {
  const value = (process.env[name] ?? '').trim();

  if (!value) {
    throw new Error(`Windows code signing: ${name} is not set`);
  }

  return value;
};

export default async function signWindowsWithCloudKms({ path, name, site, hash }) {
  // The config asks for sha256 only. Anything else means the config and this hook disagree, and a
  // silent sha1 signature is worse than a failed build: Windows rejects sha1 code signatures.
  if (hash && hash !== 'sha256') {
    throw new Error(`Windows code signing: unexpected digest "${hash}"; the HSM key signs SHA-256 only`);
  }

  const jar = required('JSIGN_JAR');
  const certFile = required('WINDOWS_CODESIGN_CERT_FILE');

  for (const file of [jar, certFile]) {
    if (!existsSync(file)) {
      throw new Error(`Windows code signing: ${file} does not exist`);
    }
  }

  // The token is passed by reference, so it never appears in a process listing or a crash dump.
  required('WINDOWS_CODESIGN_TOKEN');

  const args = [
    '-jar',
    jar,
    '--storetype',
    'GOOGLECLOUD',
    '--keystore',
    required('WINDOWS_CODESIGN_KEYSTORE'),
    '--storepass',
    'env:WINDOWS_CODESIGN_TOKEN',
    '--alias',
    required('WINDOWS_CODESIGN_ALIAS'),
    '--certfile',
    certFile,
    '--alg',
    'SHA-256',
    // Without a timestamp every signature expires with the certificate, and an installer downloaded
    // after that date stops verifying.
    '--tsaurl',
    (process.env.WINDOWS_CODESIGN_TSA ?? '').trim() || DEFAULT_TSA,
    '--tsmode',
    'RFC3161',
    '--tsretries',
    '3',
    '--replace',
  ];

  if (name) {
    args.push('--name', name);
  }

  if (site) {
    args.push('--url', site);
  }

  args.push(path);

  execFileSync('java', args, { stdio: 'inherit' });
}
