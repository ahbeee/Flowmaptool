import { describe, expect, it } from 'vitest';
import { basename, bytesToBase64, escapeXml } from '../../src/renderer/src/export-utils';

describe('export utilities', () => {
  it('escapes XML special characters', () => {
    expect(escapeXml(`A&B <tag attr="x">'`)).toBe('A&amp;B &lt;tag attr=&quot;x&quot;&gt;&apos;');
  });

  it('converts bytes to base64 in chunks', () => {
    expect(bytesToBase64(new Uint8Array([72, 101, 108, 108, 111]))).toBe('SGVsbG8=');
  });

  it('extracts file names from Windows and POSIX paths', () => {
    expect(basename('C:\\Users\\me\\file.qflow')).toBe('file.qflow');
    expect(basename('/tmp/file.qflow')).toBe('file.qflow');
    expect(basename('file.qflow')).toBe('file.qflow');
  });
});
