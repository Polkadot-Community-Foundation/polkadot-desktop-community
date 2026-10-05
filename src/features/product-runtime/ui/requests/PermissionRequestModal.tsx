import { type ReactNode } from 'react';

import { ProductRequestDialog } from '../ProductRequestDialog';
import { RequestFooter, RequestProductHeader, RequestWarningBanner } from '../productRequestParts';

type Props = {
  identifier: Nullable<string>;
  title: string;
  subtitle: string;
  /** A line between the subtitle and the warning — who owns a key, what context is bound. */
  note?: ReactNode;
  /** What the user gives away by allowing. Omitted for requests that grant nothing lasting. */
  warning?: string;
  denyLabel: string;
  allowLabel: string;
  dialogTestId?: string;
  allowTestId?: string;
  onAllow: VoidFunction;
  onDeny: VoidFunction;
};

/**
 * The shape every "may this product do X" request shares: the product asking, a
 * question, a sentence of what it enables, the consequence, and two answers.
 *
 * Each request kind supplies its own copy and test ids rather than restating this
 * markup, so the five permission surfaces stay identical to each other by construction
 * and a change to the shape lands once.
 */
export const PermissionRequestModal = ({
  identifier,
  title,
  subtitle,
  note,
  warning,
  denyLabel,
  allowLabel,
  dialogTestId,
  allowTestId,
  onAllow,
  onDeny,
}: Props) => (
  <ProductRequestDialog.Root variant="default" onDismiss={onDeny}>
    <div className="contents" data-testid={dialogTestId} />
    {/* TODO(truapi): render the header unconditionally when UserConfirmation carries a ProductContext —
        a preimage-submit review still reaches the host naming no product. */}
    {identifier ? <RequestProductHeader identifier={identifier} /> : null}

    <div className="flex flex-col gap-2 py-3">
      <ProductRequestDialog.Title>{title}</ProductRequestDialog.Title>
      <ProductRequestDialog.Subtitle>{subtitle}</ProductRequestDialog.Subtitle>
      {note}
    </div>

    {warning ? <RequestWarningBanner>{warning}</RequestWarningBanner> : null}

    <RequestFooter
      cancelLabel={denyLabel}
      primaryLabel={allowLabel}
      primaryTestId={allowTestId}
      onCancel={onDeny}
      onPrimary={onAllow}
    />
  </ProductRequestDialog.Root>
);
