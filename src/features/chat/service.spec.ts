import { describe, expect, it } from 'vitest';

import { chatService } from './service';

describe('chatItemDensityForCount', () => {
  it('uses compact layout for the small widget (≤ 2 items)', () => {
    expect(chatService.chatItemDensityForCount(1)).toBe('compact');
    expect(chatService.chatItemDensityForCount(2)).toBe('compact');
  });

  it('uses the rich regular layout for medium and large widgets', () => {
    expect(chatService.chatItemDensityForCount(4)).toBe('regular');
    expect(chatService.chatItemDensityForCount(8)).toBe('regular');
  });
});

describe('formatChatListTime', () => {
  const now = new Date('2024-06-15T12:00:00').getTime();

  it('shows "now" under a minute', () => {
    expect(chatService.formatChatListTime(now - 30_000, now)).toBe('now');
    expect(chatService.formatChatListTime(now, now)).toBe('now');
  });

  it('shows minutes under an hour', () => {
    expect(chatService.formatChatListTime(now - 60_000, now)).toBe('1m');
    expect(chatService.formatChatListTime(now - 59 * 60_000, now)).toBe('59m');
  });

  it('shows hours for earlier today', () => {
    expect(chatService.formatChatListTime(now - 2 * 3_600_000, now)).toBe('2h');
    expect(chatService.formatChatListTime(now - 5 * 3_600_000, now)).toBe('5h');
  });

  it('shows a compact date for yesterday or earlier', () => {
    // 11pm the previous calendar day — only 13h ago but a different day.
    expect(chatService.formatChatListTime(new Date('2024-06-14T23:00:00').getTime(), now)).toBe('Jun 14');
  });

  it('includes the year for a different year', () => {
    expect(chatService.formatChatListTime(new Date('2023-12-31T10:00:00').getTime(), now)).toBe('Dec 31, 2023');
  });
});

describe('formatRequestTime', () => {
  it('formats a timestamp as a 12-hour clock time', () => {
    const ts = new Date('2024-01-01T13:05:00').getTime();
    expect(chatService.formatRequestTime(ts)).toBe('1:05 PM');
  });
});

describe('formatCallDuration', () => {
  it.each([
    [0, '0:00'],
    [9_000, '0:09'],
    [59_000, '0:59'],
    [60_000, '1:00'],
    [125_000, '2:05'],
    [3_600_000, '1:00:00'],
    [3_725_000, '1:02:05'],
  ])('%dms → %s', (ms, expected) => {
    expect(chatService.formatCallDuration(ms)).toBe(expected);
  });
});
