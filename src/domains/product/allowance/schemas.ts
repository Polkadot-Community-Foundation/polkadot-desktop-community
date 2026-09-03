import * as v from 'valibot';

// TransactionStorage.Authorizations value as decoded by the papi unsafe api
// (field names per the bulletin descriptor common-type I3krkfpbuclmak).
export const bulletinAuthorizationValueSchema = v.object({
  extent: v.object({
    transactions: v.number(),
    transactions_allowance: v.number(),
    bytes: v.bigint(),
    bytes_allowance: v.bigint(),
  }),
  expiration: v.number(),
});

// Resources.StatementStoreAllowances value (People chain). Only account_id matters;
// extra fields (seq, since, …) are ignored and never break parsing.
export const statementStoreSlotValueSchema = v.object({
  account_id: v.string(),
});
