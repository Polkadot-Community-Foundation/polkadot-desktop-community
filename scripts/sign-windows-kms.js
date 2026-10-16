// Windows Authenticode signing through Google Cloud KMS: jsign (storetype GOOGLECLOUD) hashes each
// file, KMS signs the hash with a non-exportable HSM key, and the signature is written back.
// electron-builder calls this for every file it would hand to signtool, including the inner
// executable before NSIS packaging, so signing cannot happen after the build.
//
// Required environment:
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
