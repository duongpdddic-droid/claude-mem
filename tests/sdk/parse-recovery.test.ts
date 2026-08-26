import { describe, expect, it } from 'bun:test';

import { classifyResponseDocument } from '../../src/sdk/parser.js';

// Phase-1 recovery classifier: decides how an otherwise-invalid parsed payload
// should be handled (store, retry, or dead-letter). Must never guess — only a
// complete, well-formed, single root document is safe to store.
describe('classifyResponseDocument', () => {
  it('classifies no input as no_xml', () => {
    expect(classifyResponseDocument('')).toBe('no_xml');
    expect(classifyResponseDocument('   \n  ')).toBe('no_xml');
  });

  it('classifies a single observation batch as single', () => {
    const raw = `<observation>
      <type>discovery</type>
      <title>Found a bug</title>
      <narrative>Token refresh skips expired tokens.</narrative>
    </observation>`;
    expect(classifyResponseDocument(raw)).toBe('single');
  });

  it('classifies a homogeneous multi-observation batch as single', () => {
    const raw = `<observation><type>bugfix</type><title>A</title></observation>
<observation><type>bugfix</type><title>B</title></observation>
<observation><type>discovery</type><title>C</title></observation>`;
    expect(classifyResponseDocument(raw)).toBe('single');
  });

  it('classifies a single summary as single', () => {
    const raw = `<summary><request>Do X</request><completed>done</completed></summary>`;
    expect(classifyResponseDocument(raw)).toBe('single');
  });

  it('classifies a summary wrapped in a single fenced block as single', () => {
    const raw = `\`\`\`xml\n<summary><request>Do X</request><completed>done</completed></summary>\n\`\`\``;
    expect(classifyResponseDocument(raw)).toBe('single');
  });

  it('classifies mixed observation + summary roots as multiple_documents', () => {
    const raw = `<observation><type>bugfix</type><title>A</title></observation>
<summary><request>Do X</request></summary>`;
    expect(classifyResponseDocument(raw)).toBe('multiple_documents');
  });

  it('classifies more than one summary as multiple_documents', () => {
    const raw = `<summary><request>A</request></summary>
<summary><request>B</request></summary>`;
    expect(classifyResponseDocument(raw)).toBe('multiple_documents');
  });

  it('classifies an unclosed observation as truncated', () => {
    const raw = `<observation>
      <type>bugfix</type>
      <title>Incomplete batch<observation>`;
    expect(classifyResponseDocument(raw)).toBe('truncated');
  });

  it('classifies pure prose (no root tag) as no_xml', () => {
    expect(classifyResponseDocument('here is some reasoning with no xml')).toBe('no_xml');
  });

  it('is case-insensitive across root tags', () => {
    expect(classifyResponseDocument('<OBSERVATION><type>x</type><title>t</title></OBSERVATION>')).toBe('single');
    expect(classifyResponseDocument('<Summary><request>x</request></summary>')).toBe('single');
    expect(classifyResponseDocument('<OBSERVATION><type>y</type><title>t</title>')).toBe('truncated');
  });
});