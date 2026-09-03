import {
  type AnswerQueryRequest,
  type CandidateNode,
  type InputResponse,
  type RenderCandidateRequest,
} from '@/domains/input-routing';

/**
 * DEMO ONLY — delete this file and the two injections in `feature.tsx`, and
 * nothing else changes.
 *
 * No product worker answers a query yet: RFC-0027's `input_request` is not on
 * the wire, so the shipped gateway declines everything. This stands in for one
 * product so the candidate list can be shown, and it is deliberately the only
 * thing in the app that fabricates an answer.
 *
 * It returns one of every `InputCandidateContent` variant, because the point is
 * to exercise the rendering rather than to be plausible. The media is real and
 * goes through the real `<img>` path; it is inline rather than remote for the
 * reason `swatch` gives below.
 */
const DEMO_PRODUCT_ID = 'browse.dot';

/**
 * A real image, inline.
 *
 * The renderer's CSP is `img-src 'self' data: blob: https://raw.githubusercontent.com`,
 * so an arbitrary product URL — which is what a real candidate carries — is
 * blocked before it is ever requested. That policy is doing exactly what
 * RFC-0027 § Security asks for, so the demo works within it rather than around
 * it: a `data:` URI is a real image through the real `<img>` path, with nothing
 * leaving the machine.
 */
function swatch(from: string, to: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="160" height="160" fill="url(#g)"/></svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function demoAnswer({ productId, query }: AnswerQueryRequest): InputResponse | null {
  if (productId !== DEMO_PRODUCT_ID) return null;
  if (query.type !== 'text') return null;

  const text = query.text.trim();
  if (text.length === 0) return null;

  return {
    type: 'candidates',
    candidates: [
      // Results, not an offer to go and find them. A candidate row IS the answer
      // — a product that answers "search for this" has spent the user's row on a
      // button that does what pressing Enter already did.
      { type: 'text', text: `Simple text response for query: ${text}` },
      {
        type: 'richText',
        text: `rich text response for query: ${text}`,
        media: [
          { url: swatch('#e6007a', '#7916f3'), alt: 'Preview image' },
          { url: swatch('#00b2ff', '#00d2a0'), alt: 'Second preview' },
          { url: swatch('#f7a21b', '#e6007a'), alt: 'Third preview' },
        ],
      },
      {
        type: 'file',
        file: { fileName: `${text.slice(0, 24)}.pdf`, mimeType: 'application/pdf', sizeBytes: 248_000, url: '' },
      },
      {
        type: 'custom',
        candidateId: `${DEMO_PRODUCT_ID}-demo-0`,
        contentType: 'browse/result-card',
        payload: new TextEncoder().encode(text),
      },
    ],
  };
}

type TextValue = Extract<CandidateNode, { tag: 'Text' }>['value'];
type Modifiers = TextValue['modifiers'];
type ButtonProps = Extract<CandidateNode, { tag: 'Button' }>['value']['props'];

const textNode = (
  value: string,
  style: TextValue['props']['style'],
  color: TextValue['props']['color'],
  modifiers: Modifiers = [],
): CandidateNode => ({
  tag: 'Text',
  value: { modifiers, props: { style, color }, children: [{ tag: 'String', value }] },
});

const buttonNode = (text: string, variant: ButtonProps['variant'], clickAction: string): CandidateNode => ({
  tag: 'Button',
  value: {
    modifiers: [{ tag: 'margin', value: [0, 8, 0, 0] }],
    props: { text, variant, clickAction, enabled: true, loading: false },
    children: [],
  },
});

const spacerNode: CandidateNode = { tag: 'Spacer', value: { modifiers: [], props: undefined, children: [] } };

const rowNode = (children: CandidateNode[], modifiers: Modifiers = [], spaceBetween = false): CandidateNode => ({
  tag: 'Row',
  value: {
    modifiers: [{ tag: 'fillWidth', value: true }, ...modifiers],
    props: { horizontalArrangement: spaceBetween ? 'spaceBetween' : 'start', verticalAlignment: 'center' },
    children,
  },
});

/**
 * The product side of a custom candidate: given the bytes it authored, hand back
 * the tree to draw.
 *
 * This is the half a real worker owns, which is why the payload is read here and
 * nowhere else — the host carries those bytes without looking at them, then asks
 * whoever wrote them what they should look like.
 */
export function demoRenderCandidate({ productId, payload }: RenderCandidateRequest): CandidateNode | null {
  if (productId !== DEMO_PRODUCT_ID) return null;

  const query = new TextDecoder().decode(payload);

  return {
    tag: 'Column',
    value: {
      modifiers: [
        { tag: 'fillWidth', value: true },
        { tag: 'padding', value: [14, 16, undefined, undefined] },
        { tag: 'background', value: { color: 'bg.surface.main', shape: { tag: 'Rounded', value: 20 } } },
        { tag: 'border', value: { width: 1, color: 'fg.tertiary', shape: { tag: 'Rounded', value: 20 } } },
      ],
      props: { horizontalAlignment: 'start', verticalArrangement: undefined },
      children: [
        rowNode(
          [
            textNode(query, 'title.medium.regular', 'fg.primary'),
            spacerNode,
            textNode('LIVE', 'body.small.regular', 'fg.success', [
              { tag: 'padding', value: [3, 10, undefined, undefined] },
              { tag: 'background', value: { color: 'bg.surface.nested', shape: { tag: 'Circle', value: undefined } } },
            ]),
          ],
          [],
          true,
        ),
        textNode('Drawn by the product, not the host', 'body.medium.regular', 'fg.secondary', [
          { tag: 'padding', value: [2, 0, 10, 0] },
        ]),
        rowNode(
          [
            textNode('1,284 results', 'body.small.regular', 'fg.secondary', [{ tag: 'margin', value: [0, 14, 0, 0] }]),
            textNode('12 collections', 'body.small.regular', 'fg.secondary', [{ tag: 'margin', value: [0, 14, 0, 0] }]),
            textNode('updated 2m ago', 'body.small.regular', 'fg.tertiary'),
          ],
          [
            { tag: 'padding', value: [8, 12, undefined, undefined] },
            { tag: 'background', value: { color: 'bg.surface.nested', shape: { tag: 'Rounded', value: 12 } } },
          ],
        ),
        rowNode(
          [
            buttonNode('Open', 'primary', 'open'),
            buttonNode('Preview', 'secondary', 'preview'),
            spacerNode,
            buttonNode('Dismiss', 'text', 'dismiss'),
          ],
          [{ tag: 'padding', value: [12, 0, 0, 0] }],
        ),
      ],
    },
  };
}
