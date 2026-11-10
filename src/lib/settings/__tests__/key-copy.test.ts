import { describe, expect, it } from 'vitest';

import { keyPageCopy } from '@/lib/settings/key-copy';

describe('album key page copy', () => {
  it('explains a vote link when listener voting is off and points to Listen', () => {
    const copy = keyPageCopy({
      next: '/vote/prawnhub',
      visibility: 'public',
      listenerVoting: false,
    });
    const text = copy.paragraphs.join(' ');
    expect(text).toContain('You opened a voting link');
    expect(text).toContain('Listener voting is off');
    expect(text).toContain('Listen');
    expect(copy.voteHref).toBeNull();
    expect(copy.listenHref).toBe('/listen');
  });

  it('sends a public listener to Vote without the owner key', () => {
    const copy = keyPageCopy({ next: '/vote', visibility: 'public', listenerVoting: true });
    expect(copy.voteHref).toBe('/vote');
    expect(copy.listenHref).toBe('/listen');
    expect(copy.paragraphs.join(' ')).toContain('without this key');
  });

  it('points a private listener at the invitation, not the owner key', () => {
    const copy = keyPageCopy({ next: '/vote', visibility: 'private', listenerVoting: true });
    const text = copy.paragraphs.join(' ');
    expect(text).toContain('invitation');
    expect(text).toContain('after #');
    expect(copy.voteHref).toBe('/vote');
  });

  it('does not treat a direct visit as a vote link', () => {
    const copy = keyPageCopy({ next: '', visibility: 'public', listenerVoting: false });
    expect(copy.paragraphs.join(' ')).not.toContain('You opened a voting link');
  });
});
