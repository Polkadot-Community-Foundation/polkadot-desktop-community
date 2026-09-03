import { type CodecType, SignVrfErr } from '@novasamatech/host-api';

// host-papp declares its own `SignVrfErr` enum rather than reusing host-api's the way its
// alias/proof sibling does, so `instanceof` cannot narrow what the session rejects with (see
// `ringVrfError.ts` for the shape this collapses to once the SDK unifies them). Recover the
// RFC-0023 `Rejected → Rejected` mapping from the variant's message instead.
const REJECTED_MESSAGE = 'Rejected';

export function mapSignVrfWireError(error: Error): CodecType<typeof SignVrfErr> {
  if (error.message === REJECTED_MESSAGE) {
    return new SignVrfErr.Rejected();
  }

  return new SignVrfErr.Unknown({ reason: error.message });
}
