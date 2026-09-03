import {
  type CodecType,
  CreateProofErr,
  GetAliasErr,
  ListRingVrfKeysErr,
  RegisterRingVrfKeyErr,
  RingVrfSignErr,
} from '@novasamatech/host-api';

// Since host-papp 0.8.12 the SSO channel decodes alias/proof wire failures
// directly into host-api's `GetAliasErr` / `CreateProofErr` instances and
// rejects the session `ResultAsync` with them — pass those through. Only
// transport/ack failures still arrive as plain `Error`s → wrap as `Unknown`.
// (`instanceof` against the enum matches any of its variants — `ErrEnum`
// installs `Symbol.hasInstance` on the namespace object.)

export function mapAliasWireError(error: Error): CodecType<typeof GetAliasErr> {
  return error instanceof GetAliasErr ? error : new GetAliasErr.Unknown({ reason: error.message });
}

export function mapProofWireError(error: Error): CodecType<typeof CreateProofErr> {
  return error instanceof CreateProofErr ? error : new CreateProofErr.Unknown({ reason: error.message });
}

// RFC-0024 registry calls. Same contract as the two above — the SSO channel decodes
// wire failures into typed instances, so only transport/ack failures need wrapping.

export function mapRegisterRingVrfKeyWireError(error: Error): CodecType<typeof RegisterRingVrfKeyErr> {
  return error instanceof RegisterRingVrfKeyErr ? error : new RegisterRingVrfKeyErr.Unknown({ reason: error.message });
}

export function mapListRingVrfKeysWireError(error: Error): CodecType<typeof ListRingVrfKeysErr> {
  return error instanceof ListRingVrfKeysErr ? error : new ListRingVrfKeysErr.Unknown({ reason: error.message });
}

export function mapRingVrfSignWireError(error: Error): CodecType<typeof RingVrfSignErr> {
  return error instanceof RingVrfSignErr ? error : new RingVrfSignErr.Unknown({ reason: error.message });
}
