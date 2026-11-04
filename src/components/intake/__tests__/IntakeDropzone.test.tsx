import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const uploadMock = vi.fn();

vi.mock('@vercel/blob/client', () => ({
  upload: (...args: unknown[]) => uploadMock(...args),
}));

import { IntakeDropzone } from '../IntakeDropzone';

function mp3(name: string): File {
  return new File(['ID3'], name, { type: 'audio/mpeg' });
}

describe('IntakeDropzone', () => {
  beforeEach(() => {
    uploadMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uploads canonical takes to takes/ and lists bad names with the reason', async () => {
    uploadMock.mockResolvedValue({ pathname: 'takes/v1-01-track-one-p1-takea.mp3' });
    const user = userEvent.setup();
    render(<IntakeDropzone />);

    await user.upload(screen.getByLabelText('Pick takes to upload'), [
      mp3('v1-01-track-one-p1-takea.mp3'),
      mp3('Track One.mp3'),
    ]);

    expect(await screen.findByText('Uploaded')).toBeInTheDocument();
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(uploadMock).toHaveBeenCalledWith(
      'takes/v1-01-track-one-p1-takea.mp3',
      expect.any(File),
      expect.objectContaining({ access: 'public', handleUploadUrl: '/api/owner/upload' })
    );
    expect(screen.getByText('Bad name')).toBeInTheDocument();
    expect(screen.getByText('must be all lowercase')).toBeInTheDocument();
  });

  it('refuses a second file with the same set, track and letter in one drop', async () => {
    uploadMock.mockResolvedValue({});
    const user = userEvent.setup();
    render(<IntakeDropzone />);

    await user.upload(screen.getByLabelText('Pick takes to upload'), [
      mp3('v1-01-track-one-p1-takea.mp3'),
      mp3('v1-01-track-one-p2-takea.mp3'),
    ]);

    expect(
      await screen.findByText('uses the same set, track and letter as v1-01-track-one-p1-takea.mp3')
    ).toBeInTheDocument();
    expect(uploadMock).toHaveBeenCalledTimes(1);
  });

  it("shows the upload route's reason when the Blob client hides it", async () => {
    uploadMock.mockRejectedValue(new Error('Failed to  retrieve the client token'));
    const reason =
      'Take A of track 01 in set v1 already exists as v1-01-track-one-p1-takea.mp3. Letters are never reused, so give this file the next free letter.';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: reason }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<IntakeDropzone />);

    await user.upload(screen.getByLabelText('Pick takes to upload'), [
      mp3('v1-01-track-one-p2-takea.mp3'),
    ]);

    expect(await screen.findByText(reason)).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/owner/upload',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
