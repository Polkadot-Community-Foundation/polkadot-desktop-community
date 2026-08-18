// The kind union is owned by the SDK — it is the exact parameter type of
// `UserSession.readAllowance`, so a divergence fails to compile here.
export type { AllowanceResourceKind } from '@novasamatech/host-papp';

export type BulletinAuthorization = {
  extent: {
    transactions: number;
    transactionsAllowance: number;
    bytes: bigint;
    bytesAllowance: bigint;
  };
  expiration: number;
};

export type BulletinAuthorizationSnapshot = {
  authorization: Nullable<BulletinAuthorization>;
  currentBlock: number;
};
