import { formatNumberExact } from '@/lib/formatters';

export type PassMoment = {
  visible: number;
  unscored: number;
  nextCut: number;
};

function phrase(count: number, singular: string, plural: string): string {
  return `${formatNumberExact(count)} ${count === 1 ? singular : plural}`;
}

/** The count for this pass, and a cut only when a negative score creates one. */
export function passStatusLine(moment: PassMoment): string {
  const { visible, unscored, nextCut } = moment;
  if (visible <= 0) {
    return 'No takes in this pass';
  }
  if (unscored === visible && nextCut === 0) {
    return phrase(unscored, 'unscored take', 'unscored takes');
  }
  const parts: string[] = [];
  if (nextCut > 0) {
    parts.push(phrase(nextCut, 'take will be cut', 'takes will be cut'));
  }
  if (unscored > 0) {
    parts.push(phrase(unscored, 'unscored take', 'unscored takes'));
  }
  if (parts.length === 0) {
    return phrase(visible, 'scored take', 'scored takes');
  }
  return parts.join(' · ');
}

/** Shown only while confirming the next pass. */
export function passDecisionCopy(input: {
  pass: number;
  visible: number;
  nextCut: number;
}): string {
  const next = formatNumberExact(input.pass + 1);
  if (input.nextCut <= 0) {
    return `Start Pass ${next}? No takes will be cut.`;
  }
  const stay = Math.max(0, input.visible - input.nextCut);
  const staying = stay === 0 ? 'None will stay' : phrase(stay, 'take will stay', 'takes will stay');
  return `Start Pass ${next}? ${phrase(input.nextCut, 'take will be cut', 'takes will be cut')}. ${staying}.`;
}
